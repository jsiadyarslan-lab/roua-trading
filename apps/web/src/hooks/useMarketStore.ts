import { create } from 'zustand'

export interface QuoteData {
  symbol: string
  name: string
  exchange: string
  currency: string
  price: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  marketCap: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  timestamp: string
  source: string
}

interface MarketStore {
  quotes: Record<string, QuoteData>
  setQuote: (symbol: string, data: QuoteData) => void
  setQuotes: (data: Record<string, QuoteData>) => void
}

export const useMarketStore = create<MarketStore>((set) => ({
  quotes: {},
  setQuote: (symbol, data) => set((state) => ({ 
    quotes: { ...state.quotes, [symbol]: data } 
  })),
  setQuotes: (data) => set((state) => ({
    quotes: { ...state.quotes, ...data }
  }))
}))

// Singleton WebSocket Manager
class BinanceWSManager {
  private ws: WebSocket | null = null
  private subscribers = new Set<string>()
  private reconnectTimer: any = null
  private debounceTimer: any = null

  private normalizeSymbol(symbol: string) {
    let s = symbol.replace('/', '')
    if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT')) {
      s = s.replace('USD', 'USDT')
    }
    return s.toLowerCase()
  }

  subscribe(symbol: string) {
    this.subscribers.add(symbol)
    this.scheduleReconnect()
  }

  unsubscribe(symbol: string) {
    this.subscribers.delete(symbol)
    if (this.subscribers.size === 0) {
      this.close()
    } else {
      this.scheduleReconnect()
    }
  }

  private close() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.debounceTimer)
  }

  private currentStreams: string = ''

  private scheduleReconnect() {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.reconnect()
    }, 500) // 500ms debounce to batch multiple subscriptions
  }

  private reconnect() {
    if (this.subscribers.size === 0) {
      this.close()
      return
    }

    const streamNames = Array.from(
      new Set(Array.from(this.subscribers).map(s => `${this.normalizeSymbol(s)}@ticker`))
    ).sort()
    const streams = streamNames.join('/')

    if (streams === this.currentStreams && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Already connected to these streams
    }

    this.close()
    this.currentStreams = streams
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`

    console.log(`[BinanceWS] Connecting to: ${streams}`)
    try {
      this.ws = new WebSocket(wsUrl)
    } catch (e) {
      console.error('[BinanceWS] Init error', e)
      return
    }

    this.ws.onopen = () => {
      console.log(`[BinanceWS] Connected to ${streamNames.length} streams`)
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.data && msg.data.c) {
          const d = msg.data
          const rawSymbol = d.s.toUpperCase()
          
          // Find original symbol (e.g. BTC/USD) from subscribers
          const originalSymbol = Array.from(this.subscribers).find(s => 
            this.normalizeSymbol(s).toUpperCase() === rawSymbol
          )
          
          if (originalSymbol) {
            const price = parseFloat(d.c)
            useMarketStore.getState().setQuote(originalSymbol, {
              symbol: originalSymbol,
              name: originalSymbol,
              exchange: 'Binance WS',
              currency: 'USD',
              marketCap: null,
              fiftyTwoWeekHigh: null,
              fiftyTwoWeekLow: null,
              price,
              change: parseFloat(d.p),
              changePercent: parseFloat(d.P),
              open: parseFloat(d.o),
              high: parseFloat(d.h),
              low: parseFloat(d.l),
              close: price,
              volume: parseFloat(d.v),
              timestamp: new Date().toISOString(),
              source: 'Binance WS'
            })
          }
        }
      } catch (e) {
        console.error('[BinanceWS] Parse Error', e)
      }
    }

    this.ws.onerror = (e) => {
      console.error('[BinanceWS] Error:', e)
    }

    this.ws.onclose = (e) => {
      console.warn(`[BinanceWS] Closed (Code: ${e.code}). Reconnecting in 3s...`)
      this.currentStreams = ''
      this.reconnectTimer = setTimeout(() => this.reconnect(), 3000)
    }
  }
}

export const binanceWS = new BinanceWSManager()
