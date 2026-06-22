// ═══════════════════════════════════════════════════════════
// V360: OANDA Streaming WebSocket Manager — Direct browser connection
// ═══════════════════════════════════════════════════════════
//
// This is the EXACT same architecture as BinanceWSManager for crypto:
//   Binance:  Browser → wss://stream.binance.com → useMarketStore
//   OANDA:    Browser → https://stream-fxpractice.oanda.com → useMarketStore
//
// OANDA v20 Streaming API uses Server-Sent Events (SSE) over HTTPS,
// not WebSocket. We use fetch() with a streaming reader to parse
// newline-delimited JSON in real-time.
//
// This bypasses ALL backend infrastructure (NestJS, Socket.IO, Redis, proxy)
// and gives the same <1s latency as Binance WS for crypto.
// ═══════════════════════════════════════════════════════════

import { useMarketStore } from './useMarketStore';

// Lazy import to avoid circular dependency (same pattern as BinanceWSManager)
let _updatePositionPrice: ((symbol: string, price: number) => void) | null = null;
function getUpdatePositionPrice() {
  if (!_updatePositionPrice) {
    try {
      const mod = require('./usePositionsStore');
      _updatePositionPrice = mod.usePositionsStore?.getState?.()?.updatePositionPrice ?? null;
    } catch { /* store not ready yet */ }
  }
  return _updatePositionPrice;
}

// OANDA pairs that this manager handles
// V377: Removed WTI/USD and BRENT/USD — OANDA Practice rejects them (HTTP 400)
// which kills the ENTIRE stream for ALL pairs.
const OANDA_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
  'XAU/USD', 'XAG/USD',
  'US30/USD', 'NAS100/USD', 'SPX500/USD',
];

function isOandaPair(symbol: string): boolean {
  return OANDA_PAIRS.includes(symbol);
}

function toOandaSymbol(symbol: string): string {
  return symbol.replace('/', '_').toUpperCase();
}

function fromOandaSymbol(oandaSymbol: string): string {
  // Only replace first underscore (US30_USD → US30/USD, not EUR_USD → EUR/USD)
  const idx = oandaSymbol.indexOf('_');
  if (idx === -1) return oandaSymbol;
  return oandaSymbol.substring(0, idx) + '/' + oandaSymbol.substring(idx + 1);
}

class OandaWSManager {
  private eventSource: EventSource | null = null;
  private subscribers = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 2000;
  private maxDelay = 60000;
  private isDestroyed = false;

  // These are fetched from the backend (same env vars)
  private apiToken: string = '';
  private accountId: string = '';
  private streamHost: string = 'stream-fxpractice.oanda.com';

  /**
   * Initialize with OANDA credentials fetched from backend.
   * We can't read env vars from the browser, so we fetch them
   * from a public endpoint.
   */
  async init(): Promise<void> {
    if (this.apiToken && this.accountId) return; // Already initialized

    try {
      const res = await fetch('/api/exchange/streaming-status');
      if (res.ok) {
        const data = await res.json();
        // The streaming-status endpoint doesn't expose the token directly (security).
        // Instead, we use a backend proxy endpoint that streams OANDA data.
        // Actually, for direct browser connection, we need the token.
        // Since we can't expose the token, we'll use a different approach:
        // a backend SSE proxy endpoint that forwards OANDA stream to the browser.
        //
        // REVISED: We'll connect to a NestJS SSE endpoint that proxies OANDA stream.
        // This is still direct streaming (not polling), just proxied through NestJS
        // for security (token stays on backend).
        if (data?.oanda?.tokenConfigured && data?.oanda?.accountIdConfigured) {
          // OANDA is configured — we can use the SSE proxy
          return;
        }
      }
    } catch {
      // Non-critical — will retry on next subscribe
    }
  }

  subscribe(symbol: string) {
    if (!isOandaPair(symbol)) return;
    this.isDestroyed = false;
    this.subscribers.add(symbol);
    this.scheduleReconnect();
  }

  unsubscribe(symbol: string) {
    this.subscribers.delete(symbol);
    if (this.subscribers.size === 0) {
      this.destroy();
    } else {
      this.scheduleReconnect();
    }
  }

  private destroy() {
    this.isDestroyed = true;
    this.cleanup();
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      try { this.eventSource.close(); } catch {}
      this.eventSource = null;
    }
  }

  private getReconnectDelay(): number {
    const delay = Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts), this.maxDelay);
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 500);
  }

  /**
   * V374: Connect using EventSource API — browser native SSE.
   * Same as the chart hook, but for the ticker/watchlist (useMarketStore).
   */
  private connect() {
    if (this.isDestroyed || this.subscribers.size === 0) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.cleanup();

    const symbols = Array.from(this.subscribers);
    const symbolsParam = encodeURIComponent(symbols.join(','));
    const sseUrl = `/api/exchange/oanda-stream?symbols=${symbolsParam}`;

    console.log(`🌊 [OandaWS] Connecting via EventSource for ${symbols.length} pairs: ${symbols.join(', ')}`);
    console.log(`🌊 [OandaWS] SSE URL: ${sseUrl.substring(0, 120)}...`);

    this.eventSource = new EventSource(sseUrl);

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      console.log(`🌊 [OandaWS] ✅ EventSource OPEN — connected to OANDA stream`);
    };

    this.eventSource.onmessage = (event) => {
      if (this.isDestroyed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat' || data.type === 'connected') {
          console.log(`🌊 [OandaWS] ${data.type} event received`);
          return;
        }
        if (data.price && data.price > 0) {
          // Log first 3 prices to confirm data flow
          if (this.priceLogCount < 3) {
            console.log(`🌊 [OandaWS] Price #${this.priceLogCount + 1}: ${data.symbol} = ${data.price}`);
            this.priceLogCount++;
          }
          this.handlePriceUpdate(data);
        }
      } catch {
        // Non-critical
      }
    };

    this.eventSource.onerror = () => {
      if (this.isDestroyed) return;
      console.warn(`🌊 [OandaWS] ❌ EventSource error — readyState=${this.eventSource?.readyState}`);
      this.reconnectAttempts++;
      this.scheduleReconnectWithBackoff();
    };
  }

  private priceLogCount = 0;

  private handlePriceUpdate(data: any) {
    if (!data || !data.symbol || !data.price) return;

    const symbol = data.symbol;
    const price = data.price;

    // Update market store (same as BinanceWSManager does for crypto)
    useMarketStore.getState().setQuote(symbol, {
      symbol,
      name: symbol,
      exchange: 'OANDA',
      currency: symbol.split('/')[1] || 'USD',
      price,
      change: data.change || 0,
      changePercent: data.changePercent || 0,
      open: data.open || price,
      high: data.high || price,
      low: data.low || price,
      close: price,
      volume: data.volume || 0,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      timestamp: data.timestamp || new Date().toISOString(),
      source: 'OANDA Stream',
    });

    // Update position P&L (same as BinanceWSManager)
    try {
      const fn = getUpdatePositionPrice();
      if (fn) fn(symbol, price);
    } catch {}
  }

  private scheduleReconnectWithBackoff() {
    if (this.isDestroyed) return;
    const delay = this.getReconnectDelay();
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export const oandaWS = new OandaWSManager();
