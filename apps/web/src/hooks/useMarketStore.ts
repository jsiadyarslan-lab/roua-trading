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

  private normalizeSymbol(symbol: string) {
    let s = symbol.replace('/', '')
    if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT')) {
      s = s.replace('USD', 'USDT')
    }
    return s.toLowerCase()
  }

  subscribe(symbol: string) {
    this.subscribers.add(symbol)
    this.reconnect()
  }

  unsubscribe(symbol: string) {
    this.subscribers.delete(symbol)
    if (this.subscribers.size === 0) {
      this.close()
    } else {
      this.reconnect()
    }
  }

  private close() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    clearTimeout(this.reconnectTimer)
  }

  private reconnect() {
    this.close()
    if (this.subscribers.size === 0) return

    const streams = Array.from(this.subscribers).map(s => `${this.normalizeSymbol(s)}@ticker`).join('/')
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.data && msg.data.c) {
          const d = msg.data
          const rawSymbol = d.s // e.g. BTCUSDT
          
          // Find original symbol
          const originalSymbol = Array.from(this.subscribers).find(s => this.normalizeSymbol(s).toUpperCase() === rawSymbol)
          
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
        console.error('WS Parse Error', e)
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.reconnect(), 3000)
    }
  }
}

export const binanceWS = new BinanceWSManager()
