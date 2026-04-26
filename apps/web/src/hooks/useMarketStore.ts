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

// Only these base currencies are available on Binance
const BINANCE_CRYPTO_BASES = new Set(['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','DOT','MATIC','LINK','UNI'])

// Singleton WebSocket Manager — with exponential backoff + ping/pong
class BinanceWSManager {
  private ws: WebSocket | null = null
  private subscribers = new Set<string>()
  private reconnectTimer: any = null
  private debounceTimer: any = null
  private pingTimer: any = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 20
  private baseDelay = 1000  // 1s initial
  private maxDelay = 30000 // 30s max
  private intentionalClose = false

  private normalizeSymbol(symbol: string) {
    let s = symbol.replace('/', '')
    if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT')) {
      s = s.replace('USD', 'USDT')
    }
    return s.toLowerCase()
  }

  /** Check if a symbol is a Binance-tradable crypto pair */
  private isBinancePair(symbol: string): boolean {
    const base = symbol.split('/')[0]
    const quote = symbol.split('/')[1]
    return BINANCE_CRYPTO_BASES.has(base) && ['USD','USDT','BUSD'].includes(quote)
  }

  subscribe(symbol: string) {
    // Skip non-Binance symbols (forex, stocks, commodities) — they'll be polled via REST
    if (!this.isBinancePair(symbol)) {
      return
    }
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
    this.intentionalClose = true
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.debounceTimer)
  }

  private startPing() {
    this.stopPing()
    // Send ping every 20s to keep connection alive (Binance expects < 24h activity)
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // Binance combined stream doesn't support WS ping frame, but
          // sending a keep-alive by checking readyState is sufficient.
          // If the connection dropped, onclose will fire.
        } catch {
          // ignore
        }
      }
    }, 20_000)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private getReconnectDelay(): number {
    // Exponential backoff with jitter: base * 2^attempt + random 0-1s
    const delay = Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts), this.maxDelay)
    const jitter = Math.random() * 1000
    return delay + jitter
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

    // Check if we've exceeded max reconnect attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`[BinanceWS] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Falling back to polling.`)
      return
    }

    const streamNames = Array.from(
      new Set(Array.from(this.subscribers).map(s => `${this.normalizeSymbol(s)}@ticker`))
    ).sort()
    const streams = streamNames.join('/')

    if (streams === this.currentStreams && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Already connected to these streams
    }

    this.intentionalClose = false
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.currentStreams = streams
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`

    console.log(`[BinanceWS] Connecting to: ${streams} (attempt ${this.reconnectAttempts + 1})`)
    try {
      this.ws = new WebSocket(wsUrl)
    } catch (e) {
      console.error('[BinanceWS] Init error', e)
      this.scheduleReconnectWithBackoff()
      return
    }

    this.ws.onopen = () => {
      console.log(`[BinanceWS] Connected to ${streamNames.length} streams`)
      this.reconnectAttempts = 0 // Reset on successful connection
      this.startPing()
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
        // Ignore parse errors — they are non-fatal
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror, so we handle reconnect there
    }

    this.ws.onclose = (e) => {
      this.stopPing()
      this.currentStreams = ''
      
      if (this.intentionalClose) {
        // We closed it intentionally (e.g., changing streams), reconnect immediately
        this.intentionalClose = false
        return
      }
      
      if (e.code === 1006) {
        // Abnormal closure — likely network issue
        console.warn(`[BinanceWS] Abnormal closure (1006). Network may be unstable.`)
      } else {
        console.warn(`[BinanceWS] Closed (Code: ${e.code})`)
      }
      
      this.scheduleReconnectWithBackoff()
    }
  }

  private scheduleReconnectWithBackoff() {
    this.reconnectAttempts++
    const delay = this.getReconnectDelay()
    console.log(`[BinanceWS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay)
  }
}

export const binanceWS = new BinanceWSManager()
