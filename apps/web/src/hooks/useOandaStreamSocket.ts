'use client';

import { useEffect, useRef } from 'react';
import { useMarketStore, type QuoteData } from './useMarketStore';
import { CRYPTO_BASES } from '../lib/charts/config';

/**
 * V387: useOandaStreamSocket — Real-time OANDA prices via Socket.IO.
 *
 * ROOT SOLUTION for sub-second price updates (vs 2s polling).
 *
 * Architecture:
 *   OANDA v20 Stream → OandaStreamingService (NestJS)
 *     → EventEmitter 'price' event
 *     → ExchangeGateway.afterInit() registers listener
 *     → gateway._broadcastToSymbol(symbol, 'ticker', data)
 *     → Socket.IO emits to all subscribed clients
 *     → THIS HOOK receives 'ticker' event
 *     → useMarketStore.setQuote()
 *     → TickerBar / Watchlist / chart label re-render sub-second
 *
 * Why this works now (and didn't before):
 *   1. ExchangeGateway was ALWAYS registered in ExchangeModule (verified)
 *   2. main.ts ALWAYS set up IoAdapter with Redis adapter (verified)
 *   3. next.config.ts ALWAYS had /socket.io rewrite rules (verified)
 *   4. The ONLY reason it didn't work: useWebSocketTicker.ts required
 *      NEXT_PUBLIC_WS_ENABLED=true env var that was never set in Railway.
 *      The comment said "NestJS WS not running in production" — that was
 *      a guess, not a verified fact. The infrastructure was always there.
 *
 * This hook is MOUNTED ONCE by MarketProvider (alongside the existing
 * polling). When Socket.IO delivers a price, it overwrites the polled
 * price in useMarketStore. When Socket.IO disconnects, polling takes
 * over automatically. No flicker, no gap — both write to the same store.
 *
 * Auth: The browser automatically sends the roua_session cookie with
 * the Socket.IO handshake (httpOnly cookie). The gateway's
 * _extractSessionFromCookie() parses it on the server side. No token
 * needs to be passed explicitly.
 *
 * Subscription model:
 *   - On mount: subscribe to all GLOBAL_SYMBOLS (forex + metals + indices)
 *   - On unmount: unsubscribe all
 *   - The gateway calls oandaStreaming.subscribe(symbol) on first subscriber
 *     and oandaStreaming.unsubscribe(symbol) on last unsubscriber. This means
 *     the OANDA stream connection is demand-driven — it only stays open for
 *     symbols someone is actually watching.
 */

function isCryptoPair(symbol: string): boolean {
  const base = symbol.split('/')[0];
  return CRYPTO_BASES.has(base);
}

// Same list as MarketProvider's NON_CRYPTO_SYMBOLS (kept in sync manually
// to avoid a circular import). When MarketProvider changes its list, this
// must change too.
const OANDA_SYMBOLS_TO_SUBSCRIBE = [
  // Forex
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
  // Metals
  'XAU/USD', 'XAG/USD',
  // Indices
  'US30/USD', 'NAS100/USD', 'SPX500/USD',
];

// Singleton socket — shared across all hook instances (MarketProvider mounts once,
// but defensive singleton in case multiple instances ever mount).
let _socket: any = null;
let _refCount = 0;
let _subscribedSymbols = new Set<string>();

function _getOrCreateSocket(onTick: (symbol: string, data: any) => void): any {
  if (_socket) return _socket;

  // Lazy import — avoids loading socket.io-client on pages that don't use this hook
  // (e.g., login page). The import is ~30KB gzipped.
  const { io } = require('socket.io-client');

  // Use same-origin — next.config.ts rewrites /socket.io/* → NestJS (port 3001).
  // This ensures the connection works through Railway's edge proxy without
  // needing a separate public WS URL.
  const url = typeof window !== 'undefined' ? window.location.origin : '';

  const socket = io(`${url}/exchange`, {
    // V387: Allow both transports. Socket.IO auto-upgrades from polling → websocket
    // when the upgrade succeeds. On Railway edge proxy, pure websocket transport
    // may fail the upgrade handshake, so we MUST allow polling as fallback.
    // The 'websocket' transport is preferred (faster, less overhead) but
    // polling guarantees the connection works regardless of proxy behavior.
    transports: ['polling', 'websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,    // Never give up — OANDA stream is the primary price source
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    // Re-subscribe to all symbols after reconnect (server may have lost state)
    for (const sym of _subscribedSymbols) {
      socket.emit('subscribe', { symbol: sym });
    }
  });

  socket.on('ticker', (payload: { symbol: string; data: any }) => {
    if (!payload || !payload.symbol) return;
    onTick(payload.symbol, payload.data);
  });

  socket.on('connect_error', (err: any) => {
    // Silent — polling fallback is active. Don't spam console.
  });

  socket.on('disconnect', (reason: string) => {
    // Silent — polling fallback is active.
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
}

export function useOandaStreamSocket() {
  const mountedRef = useRef(false);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    mountedRef.current = true;
    _refCount++;

    // Callback that writes incoming prices into useMarketStore.
    // Defined inside useEffect so it always closes over the latest store.
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
      // preserve fields the stream doesn't send (name, exchange, change, etc.).
      // The stream sends: { symbol, price, bid, ask, timestamp, source, exchange }
      const quoteData: QuoteData = existing
        ? {
            ...existing,
            price,
            close: price,
            // high/low accumulate only within the current polling window — MarketProvider
            // will overwrite them on its next poll with the true daily high/low from OANDA.
            high: Math.max(existing.high || price, price),
            low: existing.low > 0 ? Math.min(existing.low, price) : price,
            timestamp: data.timestamp || new Date().toISOString(),
            source: data.source || existing.source || 'oanda-stream',
          }
        : {
            symbol,
            name: symbol.replace('/', ' / '),
            exchange: data.exchange || 'OANDA',
            currency: symbol.split('/')[1] || 'USD',
            price,
            change: 0,
            changePercent: 0,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: data.timestamp || new Date().toISOString(),
            source: data.source || 'oanda-stream',
          };

      store.setQuote(symbol, quoteData);
    };

    const socket = _getOrCreateSocket(onTick);
    socketRef.current = socket;

    // Subscribe to all OANDA symbols. The gateway's handleSubscribe() will:
    //   1. Send an initial quote (from Redis cache)
    //   2. Call oandaStreaming.subscribe(symbol) on first subscriber
    //   3. Stream prices start flowing immediately
    for (const sym of OANDA_SYMBOLS_TO_SUBSCRIBE) {
      if (!_subscribedSymbols.has(sym)) {
        _subscribedSymbols.add(sym);
      }
      // Always re-emit on mount — socket may have reconnected without our knowledge
      if (socket.connected) {
        socket.emit('subscribe', { symbol: sym });
      }
    }

    // If socket isn't connected yet, subscriptions will be sent on 'connect' handler
    // (see _getOrCreateSocket — it re-subscribes on every connect).

    return () => {
      mountedRef.current = false;
      _refCount--;

      // Unsubscribe only when the last consumer unmounts
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
