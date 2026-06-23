'use client';

import { useEffect, useRef } from 'react';
import { useMarketStore, type QuoteData } from './useMarketStore';

/**
 * useMarketStreamSocket — Unified real-time price stream via Socket.IO.
 *
 * ARCHITECTURE:
 *   Binance WS → BinanceStreamingService ─┐
 *   OANDA Stream → OandaStreamingService ──┤→ ExchangeGateway → Socket.IO → THIS HOOK
 *   REST polling → ExchangeService ────────┘     (/exchange)         ↓
 *                                                           useMarketStore.setQuote()
 *                                                                   ↓
 *                                                           MobileTickerStrip / Watchlist / Chart
 *
 * CRITICAL DESIGN DECISIONS (do NOT change without understanding why):
 *
 * 1. transports: ['polling'] ONLY
 *    WebSocket upgrade fails through Next.js rewrite proxy on Railway.
 *    Polling works reliably (~200ms latency, acceptable for trading).
 *    DO NOT add 'websocket' to transports — it will break all prices.
 *
 * 2. Singleton socket (_getOrCreateSocket)
 *    One Socket.IO connection for the entire app (MarketProvider mounts once).
 *    The socket persists across React re-renders. onTick closure from first
 *    mount is reused — this is intentional (useMarketStore.getState() always
 *    returns the latest store).
 *
 * 3. No mountedRef check in onTick
 *    useMarketStore is a global Zustand store. Writing to it when the
 *    component is unmounted is harmless (no React rendering happens until
 *    a mounted component reads it). The mountedRef check was removed because
 *    the singleton retains old closures where mountedRef.current = false.
 *
 * 4. reconnectionAttempts: 5
 *    After 5 failed reconnection attempts, Socket.IO stops and REST polling
 *    fallback (MarketProvider, every 15s) takes over. Page refresh resets.
 */

// All symbols this hook subscribes to.
const ALL_SYMBOLS = [
  // Crypto (Binance stream)
  'BTC/USDT', 'ETH/USDT', 'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD',
  'XRP/USD', 'ADA/USD', 'DOGE/USD',
  // Forex (OANDA stream)
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
  // Metals (OANDA)
  'XAU/USD', 'XAG/USD',
  // Indices (OANDA)
  'US30/USD', 'NAS100/USD', 'SPX500/USD',
  // Stocks (polling — slower, but still goes through Socket.IO)
  // Uncomment if you want stocks in the ticker:
  // 'AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META',
];

// Singleton socket — shared across all hook instances.
// MarketProvider mounts once, but defensive singleton prevents duplicate connections.
let _socket: any = null;
let _refCount = 0;
let _subscribedSymbols = new Set<string>();

function _getOrCreateSocket(onTick: (symbol: string, data: any) => void): any {
  if (_socket) return _socket;

  const { io } = require('socket.io-client');

  // Use same-origin — Next.js proxies /api/* to NestJS (port 3001)
  const url = typeof window !== 'undefined' ? window.location.origin : '';

  const socket = io(`${url}/exchange`, {
    path: '/socket', // V399: Custom path (no dots)
    transports: ['polling'], // V435: Polling only — WebSocket fails through Next.js proxy
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    // V435: Removed forceNew — it was creating new sockets on every reconnection
    // attempt, each trying WebSocket upgrade. This caused 'WebSocket is closed
    // before the connection is established' errors and broke all price updates.
  });

  socket.on('connect', () => {
    // Re-subscribe to all symbols after reconnect
    for (const sym of _subscribedSymbols) {
      socket.emit('subscribe', { symbol: sym });
    }
  });

  socket.on('ticker', (payload: { symbol: string; data: any }) => {
    if (!payload || !payload.symbol) return;
    onTick(payload.symbol, payload.data);
  });

  socket.on('connect_error', () => {
    // Silent — REST polling fallback is active
  });

  socket.on('disconnect', () => {
    // Silent — Socket.IO will auto-reconnect
  });

  _socket = socket;
  return socket;
}

function _destroySocket() {
  if (!_socket) return;
  try {
    _socket.removeAllListeners();
    _socket.disconnect();
  } catch {}
  _socket = null;
  _subscribedSymbols.clear();
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

export function useMarketStreamSocket() {
  const mountedRef = useRef(false);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    mountedRef.current = true;
    _refCount++;

    const onTick = (symbol: string, data: any) => {
      try {
        if (!data) return;

        const price = typeof data.price === 'number'
          ? data.price
          : typeof data.close === 'number'
            ? data.close
            : null;

        if (price === null || price <= 0) return;

        const store = useMarketStore.getState();
        const existing = store.quotes[symbol];

        const quoteData: QuoteData = existing
          ? {
              ...existing,
              price,
              close: price,
              open: typeof data.open === 'number' && data.open > 0 ? data.open : (existing.open || price),
              high: typeof data.high === 'number' && data.high > 0
                ? Math.max(data.high, existing.high || price)
                : Math.max(existing.high || price, price),
              low: typeof data.low === 'number' && data.low > 0
                ? (existing.low > 0 ? Math.min(data.low, existing.low) : data.low)
                : (existing.low > 0 ? Math.min(existing.low, price) : price),
              volume: typeof data.volume === 'number' ? data.volume : (existing.volume || 0),
              change: typeof data.change === 'number' ? data.change : (existing.change || 0),
              changePercent: typeof data.changePercent === 'number' ? data.changePercent : (existing.changePercent || 0),
              timestamp: data.timestamp || new Date().toISOString(),
              source: data.source || existing.source || 'stream',
            }
          : {
              symbol,
              name: data.name || symbol.replace('/', ' / '),
              exchange: data.exchange || (symbol.includes('/') ? 'STREAM' : 'Unknown'),
              currency: symbol.split('/')[1] || 'USD',
              price,
              change: typeof data.change === 'number' ? data.change : 0,
              changePercent: typeof data.changePercent === 'number' ? data.changePercent : 0,
              open: typeof data.open === 'number' && data.open > 0 ? data.open : price,
              high: typeof data.high === 'number' && data.high > 0 ? data.high : price,
              low: typeof data.low === 'number' && data.low > 0 ? data.low : price,
              close: price,
              volume: typeof data.volume === 'number' ? data.volume : 0,
              marketCap: null,
              fiftyTwoWeekHigh: null,
              fiftyTwoWeekLow: null,
              timestamp: data.timestamp || new Date().toISOString(),
              source: data.source || 'stream',
            };

        store.setQuote(symbol, quoteData);
      } catch (e: any) {
        // Silent — don't let errors crash the stream
      }
    };

    const socket = _getOrCreateSocket(onTick);
    socketRef.current = socket;

    // Subscribe to all symbols
    for (const sym of ALL_SYMBOLS) {
      _subscribedSymbols.add(sym);
      if (socket.connected) {
        socket.emit('subscribe', { symbol: sym });
      }
    }

    return () => {
      mountedRef.current = false;
      _refCount--;

      if (_refCount <= 0) {
        for (const sym of _subscribedSymbols) {
          try {
            socket.emit('unsubscribe', { symbol: sym });
          } catch {}
        }
        _destroySocket();
      }

      socketRef.current = null;
    };
  }, []);

  return {
    connected: !!socketRef.current?.connected,
  };
}
