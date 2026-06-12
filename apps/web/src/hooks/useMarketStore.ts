import { create } from 'zustand'
import { BINANCE_URLS, CRYPTO_BASES } from '../lib/charts/config'

// V225: Lazy import to avoid circular dependency.
// usePositionsStore imports useMarketStore (via binanceWS), so importing
// usePositionsStore at module level would create a circular reference.
// Lazy import inside the callback breaks the cycle.
let _updatePositionPrice: ((symbol: string, price: number) => void) | null = null
function getUpdatePositionPrice() {
  if (!_updatePositionPrice) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./usePositionsStore')
      _updatePositionPrice = mod.usePositionsStore?.getState?.()?.updatePositionPrice ?? null
    } catch { /* store not ready yet */ }
  }
  return _updatePositionPrice
}

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

// ── Batched quote updates: coalesce multiple setQuote calls within a single
// animation frame into one store update, drastically reducing re-renders.
let pendingQuotes: Record<string, QuoteData> = {}
let flushTimer: ReturnType<typeof requestAnimationFrame> | null = null

function flushPendingQuotes() {
  if (Object.keys(pendingQuotes).length === 0) return
  const batch = pendingQuotes
  pendingQuotes = {}
  flushTimer = null
  useMarketStore.setState((state) => ({
    quotes: { ...state.quotes, ...batch }
  }))
}

export const useMarketStore = create<MarketStore>((set) => ({
  quotes: {},
  setQuote: (symbol, data) => {
    // Batch: accumulate updates and flush once per animation frame
    pendingQuotes[symbol] = data
    if (!flushTimer) {
      flushTimer = requestAnimationFrame(flushPendingQuotes)
    }
  },
  setQuotes: (data) => set((state) => ({
    quotes: { ...state.quotes, ...data }
  }))
}))

// Only these base currencies are available on Binance
// CRYPTO_BASES imported from config.ts (was BINANCE_CRYPTO_BASES)

/**
 * Singleton WebSocket Manager for Binance combined stream.
 *
 * Key design decisions to prevent "Ping received after close" errors:
 * 1. Uses closePromise — waits for old WS to fully close before opening a new one
 * 2. Removes all event handlers before closing old WS
 * 3. Uses connectionGeneration to ignore stale events
 * 4. Debounces rapid subscribe/unsubscribe calls
 * 5. Adds isReconnecting guard to prevent concurrent reconnect attempts
 */
class BinanceWSManager {
  private ws: WebSocket | null = null
  private subscribers = new Set<string>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10  // Reduced from 15 to give up sooner
  private baseDelay = 2000  // 2s initial (increased from 1s)
  private maxDelay = 60000 // 60s max (increased from 30s)
  private lastConnectTime = 0  // Track when we last connected successfully
  private connectionGeneration = 0
  private isReconnecting = false  // Guard against concurrent reconnects
  private closePromise: Promise<void> | null = null  // Track pending close
  private destroyed = false  // Permanent shutdown flag
  private isClosing = false  // Guard: don't send ping while closing

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
    return CRYPTO_BASES.has(base) && ['USD','USDT','BUSD'].includes(quote)
  }

  subscribe(symbol: string) {
    // Skip non-Binance symbols (forex, stocks, commodities) — they'll be polled via REST
    if (!this.isBinancePair(symbol)) {
      return
    }
    this.destroyed = false
    this.subscribers.add(symbol)
    this.scheduleReconnect()
  }

  unsubscribe(symbol: string) {
    this.subscribers.delete(symbol)
    if (this.subscribers.size === 0) {
      this.destroy()
    } else {
      this.scheduleReconnect()
    }
  }

  /** Permanent shutdown — no more reconnects */
  private destroy() {
    this.destroyed = true
    this.cleanupTimers()
    this.stopPing()
    this.closeAndWait()
  }

  private cleanupTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  /**
   * Gracefully close the current WebSocket, returning a Promise that resolves
   * when the connection is fully closed. This prevents "Ping received after close"
   * errors by ensuring the old connection is dead before opening a new one.
   */
  private closeAndWait(): Promise<void> {
    const oldWs = this.ws
    this.ws = null
    this.isClosing = true  // FIX: Set flag BEFORE stopping ping to prevent new pings
    this.stopPing()

    if (!oldWs || oldWs.readyState === WebSocket.CLOSED) {
      this.isClosing = false
      return Promise.resolve()
    }

    // If already closing, wait for the existing close promise
    if (this.closePromise) {
      return this.closePromise
    }

    // Remove all event handlers to prevent any callbacks from firing
    oldWs.onopen = null
    oldWs.onmessage = null
    oldWs.onerror = null
    oldWs.onclose = null

    if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
      this.closePromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force close after 2s if the close handshake takes too long
          try { oldWs.close(1000, 'timeout') } catch { /* ignore */ }
          this.isClosing = false
          resolve()
        }, 2000)

        try {
          oldWs.onclose = () => {
            clearTimeout(timeout)
            this.isClosing = false
            resolve()
          }
          oldWs.close(1000, 'reconnect')
        } catch {
          clearTimeout(timeout)
          this.isClosing = false
          resolve()
        }
      }).finally(() => {
        this.closePromise = null
      })

      return this.closePromise
    }

    this.isClosing = false
    return Promise.resolve()
  }

  private startPing() {
    this.stopPing()
    // Send JSON ping every 20s to keep connection alive
    // Binance combined streams don't support WS ping frames, but
    // sending a JSON ping frame keeps the connection active and
    // prevents proxy/firewall idle timeouts
    // FIX: Check isClosing flag to prevent sending ping during close handshake
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
    if (this.destroyed) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.reconnect()
    }, 500) // 500ms debounce to batch multiple subscriptions
  }

  private async reconnect() {
    if (this.destroyed) return
    if (this.subscribers.size === 0) return
    if (this.isReconnecting) return  // Prevent concurrent reconnects

    // Check if we've exceeded max reconnect attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    const streamNames = Array.from(
      new Set(Array.from(this.subscribers).map(s => `${this.normalizeSymbol(s)}@ticker`))
    ).sort()
    const streams = streamNames.join('/')

    // Already connected to the same streams — nothing to do
    if (streams === this.currentStreams && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    this.isReconnecting = true
    this.connectionGeneration++
    const currentGeneration = this.connectionGeneration

    // Step 1: Wait for any previous WebSocket to fully close
    // This is THE KEY FIX — prevents "Ping received after close" errors
    await this.closeAndWait()

    // Step 2: Check if we're still the active generation (another reconnect may have started)
    if (this.connectionGeneration !== currentGeneration) {
      this.isReconnecting = false
      return
    }

    // Step 3: Check if destroyed while waiting
    if (this.destroyed) {
      this.isReconnecting = false
      return
    }

    this.currentStreams = streams
    const wsUrl = `${BINANCE_URLS.ws}/stream?streams=${streams}`

    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.isReconnecting = false
      this.scheduleReconnectWithBackoff()
      return
    }

    this.ws.onopen = () => {
      if (this.connectionGeneration !== currentGeneration) return
      this.reconnectAttempts = 0
      this.isReconnecting = false
      this.isClosing = false  // FIX: Reset closing flag on new connection
      this.lastConnectTime = Date.now()
      this.startPing()
    }

    this.ws.onmessage = (event) => {
      if (this.connectionGeneration !== currentGeneration) return
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      try {
        const msg = JSON.parse(event.data)
        // Ignore pong responses and other non-data messages
        if (!msg.data) return
        if (msg.data && msg.data.c) {
          const d = msg.data
          const rawSymbol = d.s.toUpperCase()
          
          // FIX V139: Find ALL original symbols (e.g. BTC/USD AND BTC/USDT) from subscribers
          // that normalize to the same Binance stream. Previously, find() returned only ONE
          // subscriber, leaving the other with stale prices. This was the root cause of
          // "frozen" P&L — positions with BTC/USDT symbol never got live price updates
          // when BTC/USD won the find() race.
          const matchingSymbols = Array.from(this.subscribers).filter(s => 
            this.normalizeSymbol(s).toUpperCase() === rawSymbol
          )
          
          const price = parseFloat(d.c)
          for (const originalSymbol of matchingSymbols) {
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

            // ═══════════════════════════════════════════════════════════════
            // V225 FIX: DIRECT P&L UPDATE FROM BINANCE WS
            // Previously, Binance WS prices went to useMarketStore, then
            // GlobalLogicEngine polled them every 1s with 500ms per-symbol
            // throttle before calling updatePositionPrice(). This added
            // 1-1.5s latency to crypto P&L updates.
            //
            // MT5 already bypasses this loop — useMT5Streaming calls
            // updatePositionPrice() directly from Socket.IO events.
            // Now Binance WS does the same: ~100ms P&L updates for crypto.
            //
            // GlobalLogicEngine still runs as backup for non-WS price sources.
            // ═══════════════════════════════════════════════════════════════
            try {
              const fn = getUpdatePositionPrice()
              if (fn) fn(originalSymbol, price)
            } catch { /* non-fatal — GlobalLogicEngine will pick it up */ }
          }
        }
      } catch {
        // Ignore parse errors — they are non-fatal
      }
    }

    this.ws.onerror = () => {
      if (this.connectionGeneration !== currentGeneration) return
      // onclose will fire after onerror, so we handle reconnect there
    }

    this.ws.onclose = (e) => {
      if (this.connectionGeneration !== currentGeneration) return
      this.stopPing()
      this.currentStreams = ''
      this.isReconnecting = false

      // Don't reconnect if we're shutting down or if code 1000 (normal close)
      if (this.destroyed || e.code === 1000) return

      // If the connection was open for less than 10 seconds before closing,
      // it's likely a connection issue — count it as a reconnect attempt.
      // If it was stable for a while, reset the attempt counter.
      const connectionDuration = Date.now() - this.lastConnectTime
      if (this.lastConnectTime > 0 && connectionDuration > 30_000) {
        // Connection was stable for >30s — this is a new disconnect, not a reconnect loop
        this.reconnectAttempts = 0
      }
      
      // If max reconnect attempts reached, fall back to polling silently
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.warn(`[BinanceWS] Max reconnect attempts (${this.maxReconnectAttempts}) reached. ` +
          `Falling back to REST API polling for crypto data.`)
        // Schedule a full reset after 5 minutes to try WS again
        setTimeout(() => {
          this.reconnectAttempts = 0
          this.destroyed = false
          if (this.subscribers.size > 0) {
            this.scheduleReconnect()
          }
        }, 300_000) // 5 minutes
        return
      }
      
      this.scheduleReconnectWithBackoff()
    }
  }

  private scheduleReconnectWithBackoff() {
    if (this.destroyed) return
    this.reconnectAttempts++
    const delay = this.getReconnectDelay()
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay)
  }
}

export const binanceWS = new BinanceWSManager()
