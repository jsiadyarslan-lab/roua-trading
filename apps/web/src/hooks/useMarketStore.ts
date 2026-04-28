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
  private isClosing = false  // منع إرسال ping أثناء إغلاق الاتصال
  private connectionGeneration = 0  // لتتبع جيل الاتصال وتجاهل أحداث الإغلاق القديمة

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
    this.isClosing = true
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isClosing = false
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.debounceTimer)
  }

  private startPing() {
    this.stopPing()
    // Send actual ping data every 20s to keep connection alive
    // Binance combined streams don't support WS ping frames, but
    // sending a JSON ping frame keeps the connection active and
    // prevents proxy/firewall idle timeouts (Code 1006 disconnections)
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isClosing) {
        try {
          this.ws.send(JSON.stringify({ method: 'ping' }))
        } catch {
          // ignore send errors on closing sockets
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
      // Max reconnect attempts reached — falling back to polling
      return
    }

    const streamNames = Array.from(
      new Set(Array.from(this.subscribers).map(s => `${this.normalizeSymbol(s)}@ticker`))
    ).sort()
    const streams = streamNames.join('/')

    if (streams === this.currentStreams && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Already connected to these streams
    }

    // زيادة جيل الاتصال لتجاهل أحداث الإغلاق من الاتصالات القديمة
    this.connectionGeneration++
    const currentGeneration = this.connectionGeneration

    // تعليم الإغلاق كمتعمد لتجنب trigger إعادة اتصال من onclose
    this.intentionalClose = true
    this.isClosing = true
    this.stopPing()
    if (this.ws) {
      // إزالة معالجات الأحداث قبل الإغلاق لتجنب تشغيلها
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.isClosing = false
    this.intentionalClose = false
    this.currentStreams = streams
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`

    // Connecting to streams
    try {
      this.ws = new WebSocket(wsUrl)
    } catch (e) {
      // WebSocket init error — will retry
      this.scheduleReconnectWithBackoff()
      return
    }

    this.ws.onopen = () => {
      // تحقق أن هذا لا يزال الاتصال الحالي
      if (this.connectionGeneration !== currentGeneration) return
      // Connected successfully
      this.reconnectAttempts = 0 // Reset on successful connection
      this.isClosing = false
      this.startPing()
    }

    this.ws.onmessage = (event) => {
      // تحقق أن هذا لا يزال الاتصال الحالي
      if (this.connectionGeneration !== currentGeneration) return
      // تجاهل الرسائل أثناء إغلاق الاتصال
      if (this.isClosing || (this.ws && this.ws.readyState !== WebSocket.OPEN)) {
        return
      }
      try {
        const msg = JSON.parse(event.data)
        // تجاهل رسائل pong من Binance
        if (!msg.data) return
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
      // تحقق أن هذا لا يزال الاتصال الحالي
      if (this.connectionGeneration !== currentGeneration) return
      // onclose will fire after onerror, so we handle reconnect there
    }

    this.ws.onclose = (e) => {
      // تحقق أن هذا لا يزال الاتصال الحالي — تجاهل أحداث الإغلاق القديمة
      if (this.connectionGeneration !== currentGeneration) return
      this.stopPing()
      this.currentStreams = ''
      
      if (this.intentionalClose) {
        // We closed it intentionally (e.g., changing streams)
        this.intentionalClose = false
        return
      }
      
      this.scheduleReconnectWithBackoff()
    }
  }

  private scheduleReconnectWithBackoff() {
    this.reconnectAttempts++
    const delay = this.getReconnectDelay()
    // Reconnecting with backoff
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay)
  }
}

export const binanceWS = new BinanceWSManager()
