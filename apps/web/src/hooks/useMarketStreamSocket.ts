'use client';

import { useEffect, useRef } from 'react';
import { useMarketStore, type QuoteData } from './useMarketStore';

/**
 * V390: useMarketStreamSocket — UNIFIED real-time price stream via Socket.IO.
 *
 * This is the SINGLE source of truth for ALL price updates:
 *   - Crypto (BTC/USDT, ETH/USDT, ...) ← BinanceStreamingService (NestJS)
 *   - Forex/Metals/Indices (EUR/USD, XAU/USD, ...) ← OandaStreamingService (NestJS)
 *   - Stocks (AAPL, TSLA, ...) ← polling cycle (NestJS, 5s)
 *
 * Architecture:
 *   Data sources → NestJS ExchangeGateway → Socket.IO /exchange namespace
 *     → THIS HOOK receives 'ticker' events
 *     → useMarketStore.setQuote()
 *     → TickerBar / Watchlist / chart label re-render SUB-SECOND
 *
 * This REPLACES:
 *   - useOandaStreamSocket (V387) — was OANDA-only
 *   - BinanceWSManager (in useMarketStore.ts) — was frontend-direct-to-Binance
 *
 * The previous split architecture had 3 separate price paths:
 *   1. BinanceWSManager (frontend → Binance WS direct) for crypto
 *   2. useOandaStreamSocket (frontend → NestJS Socket.IO) for forex
 *   3. MarketProvider polling (frontend → NestJS REST) for stocks
 *
 * Now there's ONE path:
 *   frontend → NestJS Socket.IO → (Binance WS | OANDA Stream | REST polling)
 *
 * Benefits:
 *   - Single connection (vs 2+ before)
 *   - Auth on all market data (Binance WS was unauthenticated before)
 *   - Can swap providers without touching frontend
 *   - If Binance blocks Railway IP, only NestJS needs to handle it
 *   - Stocks now get sub-5s updates (was 60s polling before)
 */

// All symbols this hook subscribes to — matches MarketProvider's GLOBAL_SYMBOLS.
// Kept in sync manually to avoid circular import.
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
let _reconnectTimer: any = null;
let _tickerCount = 0; // V407: Count received ticker events for diagnostics
let _lastTickerLog = 0;

function _getOrCreateSocket(onTick: (symbol: string, data: any) => void): any {
  if (_socket) return _socket;

  const { io } = require('socket.io-client');

  // Use same-origin — Next.js proxies /api/* to NestJS (port 3001)
  const url = typeof window !== 'undefined' ? window.location.origin : '';

  const socket = io(`${url}/exchange`, {
    path: '/socket', // V399: Custom path (no dots)
    // V403: Polling only — WebSocket upgrade fails through Next.js rewrite proxy.
    transports: ['polling'],
    autoConnect: true,
    reconnection: true,
    // V408: Limit reconnection attempts to prevent 'Session ID unknown' 400 spam.
    // When the connection drops, Socket.IO tries to resume the old session (sid).
    // If the server has forgotten the sid (common with polling), it returns 400.
    // With Infinity attempts, this creates endless 400 errors in console.
    // 5 attempts is enough — if it fails, REST polling fallback takes over.
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    // V408: forceNew ensures clean session on each reconnect attempt
    // (prevents sending old sid that causes 'Session ID unknown' 400)
    forceNew: true,
  });

  socket.on('connect', () => {
    console.log('[useMarketStreamSocket] ✅ Connected to /exchange namespace');
    // Re-subscribe to all symbols after reconnect (server may have lost state)
    for (const sym of _subscribedSymbols) {
      socket.emit('subscribe', { symbol: sym });
    }
    console.log(`[useMarketStreamSocket] Subscribed to ${_subscribedSymbols.size} symbols`);
  });

  socket.on('ticker', (payload: { symbol: string; data: any }) => {
    if (!payload || !payload.symbol) return;
    _tickerCount++;
    // V407: Log first ticker and then every 100th (to avoid console spam)
    const now = Date.now();
    if (_tickerCount === 1) {
      console.log(`[useMarketStreamSocket] 📊 First ticker received: ${payload.symbol} = ${payload.data?.price}`);
    } else if (_tickerCount % 100 === 0 && now - _lastTickerLog > 10000) {
      console.log(`[useMarketStreamSocket] 📊 Received ${_tickerCount} tickers total. Latest: ${payload.symbol} = ${payload.data?.price}`);
      _lastTickerLog = now;
    }
    onTick(payload.symbol, payload.data);
  });

  socket.on('connect_error', (err: any) => {
    console.warn('[useMarketStreamSocket] ❌ Connect error:', err?.message || err);
  });

  socket.on('disconnect', (reason: string) => {
    console.warn('[useMarketStreamSocket] ⚠️ Disconnected:', reason);
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
      if (!mountedRef.current) return;
      if (!data) return;

      const price = typeof data.price === 'number'
        ? data.price
        : typeof data.close === 'number'
          ? data.close
          : null;

      if (price === null || price <= 0) return;

      const store = useMarketStore.getState();
      const existing = store.quotes[symbol];

      // Build a complete QuoteData. If we have an existing quote, merge to
      // preserve fields the stream doesn't send (name, exchange for OANDA).
      // The Binance stream sends: price, open, high, low, close, volume, change,
      // changePercent, timestamp, source, exchange.
      // The OANDA stream sends: price, bid, ask, timestamp, source, exchange.
      const quoteData: QuoteData = existing
        ? {
            ...existing,
            price,
            close: price,
            // For Binance stream, use the stream's high/low/open (more accurate).
            // For OANDA stream (which only sends price), accumulate locally.
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
