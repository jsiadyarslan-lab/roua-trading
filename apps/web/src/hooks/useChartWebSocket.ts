// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Multi-Source Real-Time Data
// Priority: Socket.IO Gateway → Binance WS → REST Polling
// ═══════════════════════════════════════════════════════════
//
// FIX: Added Socket.IO Gateway as primary data source.
// Previously, the chart connected directly to Binance WebSocket,
// bypassing the backend ExchangeGateway entirely. This meant:
// - No authentication for market data connections
// - Crypto-only data (no stocks/forex via WS)
// - No rate limiting or data consistency with backend
//
// New connection priority:
// 1. Socket.IO → /exchange namespace (authenticated, all asset types)
// 2. Binance WebSocket (crypto-only fallback, no auth)
// 3. REST Polling (last resort)
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { CandleData } from '../lib/charts/types';
import { WS_CONFIG, BINANCE_URLS, BINANCE_INTERVALS, CRYPTO_BASES } from '../lib/charts/config';
import { useMarketStore } from './useMarketStore';
import { sanitizeOhlc } from '../lib/charts/chart-utils';

// PERF: rAF batch buffer for WebSocket messages.
// Instead of calling onCandleUpdate/onPriceUpdate on every WS message,
// we buffer them and flush once per animation frame. This prevents
// multiple React state updates per paint cycle.
interface WSBuffer {
  candle: CandleData | null;
  price: number | null;
  isKlineClosed: boolean;
}

interface UseChartWebSocketOptions {
  symbol: string;
  timeframe: string;
  onCandleUpdate: (candle: CandleData) => void;
  onPriceUpdate: (price: number) => void;
  enabled?: boolean;
}

interface UseChartWebSocketReturn {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'fallback';
  reconnect: () => void;
}

// BINANCE_INTERVALS, CRYPTO_BASES imported from config.ts

function isCryptoPair(symbol: string): boolean {
  const base = symbol.split('/')[0];
  return CRYPTO_BASES.has(base);
}

function normalizeBinanceSymbol(symbol: string): string {
  let s = symbol.replace('/', '');
  if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT')) {
    s = s.replace('USD', 'USDT');
  }
  return s.toLowerCase();
}

// FIX: Get session token for Socket.IO authentication.
// Note: The roua_session cookie is httpOnly (set by auth controller), so
// document.cookie CANNOT read it. However, browsers automatically send
// httpOnly cookies in the WebSocket handshake headers (Cookie header),
// and the server-side _extractSessionFromCookie() parses it from there.
// We still try to read it here as a bonus for non-httpOnly scenarios,
// but the primary authentication path is via the Cookie header.
function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/roua_session=([^;]+)/);
  return match ? match[1] : null;
}

export function useChartWebSocket(options: UseChartWebSocketOptions): UseChartWebSocketReturn {
  const { symbol, timeframe, onCandleUpdate, onPriceUpdate, enabled = true } = options;

  const wsRef = useRef<WebSocket | null>(null);
  // V449: Removed socketIoRef — was declared but never assigned. Socket.IO
  // is handled by useMarketStreamSocket (price updates), not this hook.
  // This hook handles candle data via Binance WS (crypto) or REST polling (OANDA).
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isClosingRef = useRef(false);
  const isConnectingRef = useRef(false); // V-WS-LOOP-FIX: prevent rapid re-connect loops
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'fallback'>('disconnected');
  // PERF: rAF batching buffer for WebSocket messages
  const rafBufferRef = useRef<WSBuffer>({ candle: null, price: null, isKlineClosed: false });
  const rafIdRef = useRef<number>(0);
  // V-CRYPTO-SPEED-2: Track last @aggTrade mid-price to skip duplicate updates.
  // @aggTrade fires ~67 Hz but only ~1.4 Hz have actual mid-price changes.
  // Skipping duplicates reduces rAF buffer pressure and CPU usage.
  // FIX: 24-hour connection rotation — Binance disconnects after 24h.
  // We proactively reconnect 10 minutes before the 24h mark.
  const connectionStartTimeRef = useRef<number>(0);
  const rotationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const CONNECTION_ROTATION_MS = 23 * 60 * 60 * 1000; // 23 hours (10min before 24h cutoff)

  // WS/Reconnection config from config.ts
  const { reconnectMaxAttempts: MAX_RECONNECT_ATTEMPTS, reconnectBaseDelay: BASE_DELAY, reconnectMaxDelay: MAX_DELAY, pollingInterval: POLLING_INTERVAL, pingInterval: PING_INTERVAL } = WS_CONFIG;

  // M7 FIX: Use refs for onCandleUpdate/onPriceUpdate in flushBuffer.
  // Previously, flushBuffer captured these callbacks in its closure, meaning
  // if the callbacks changed between when an update was buffered and when it
  // was flushed (~16ms), stale callbacks could be called. Using refs ensures
  // the latest callbacks are always invoked.
  const onCandleUpdateRef = useRef(onCandleUpdate);
  onCandleUpdateRef.current = onCandleUpdate;
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  // ── rAF Flush: Apply buffered WS updates once per frame ──
  const flushBuffer = useCallback(() => {
    const buf = rafBufferRef.current;
    rafBufferRef.current = { candle: null, price: null, isKlineClosed: false };
    rafIdRef.current = 0;

    if (buf.candle) {
      // Attach isKlineClosed metadata to the candle so RouaChart can
      // distinguish between forming and closed candles.
      // We store it as a non-enumerable property to avoid serialization issues.
      (buf.candle as any)._isClosed = buf.isKlineClosed;
      // M7: Use ref instead of closure — always calls latest callback
      onCandleUpdateRef.current(buf.candle);
    }
    if (buf.price !== null) {
      // M7: Use ref instead of closure — always calls latest callback
      onPriceUpdateRef.current(buf.price);
    }
  }, []); // M7: No dependencies — refs are always current

  // Buffer a WS update — coalesces multiple updates per frame
  const bufferUpdate = useCallback((candle: CandleData | null, price: number | null, isKlineClosed: boolean = false) => {
    if (isClosingRef.current) return;
    const buf = rafBufferRef.current;
    if (candle) {
      buf.candle = candle; // Latest candle wins (coalesce)
      buf.isKlineClosed = isKlineClosed;
    }
    if (price !== null) {
      buf.price = price;
    }
    if (rafIdRef.current === 0) {
      rafIdRef.current = requestAnimationFrame(flushBuffer);
    }
  }, [flushBuffer]);

  // ── Cleanup ────────────────────────────────────────────
  const cleanup = useCallback(() => {
    isClosingRef.current = true;

    // Cancel rAF buffer
    if (rafIdRef.current !== 0) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    rafBufferRef.current = { candle: null, price: null, isKlineClosed: false };

    // Clear rotation timer
    if (rotationTimerRef.current) {
      clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }

    // Clear ping interval first
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // V449: Removed socketIoRef cleanup — was no-op (never assigned)

    // Disconnect Binance WS
    // V436: Stop ping interval BEFORE closing — prevents 'Ping received after close'
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try { wsRef.current.close(1000, 'cleanup'); } catch {}
      wsRef.current = null;
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // BUG-050: Abort any in-flight polling fetch so the new symbol's
    // history fetch doesn't compete for browser connection slots.
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }, []);

  // FIX: Connection generation counter — prevents race conditions when
  // symbol/timeframe changes during reconnection. Old onclose handlers
  // check their generation and skip reconnect if stale.
  const connectionGenRef = useRef(0);

  // BUG-050 FIX: AbortController for in-flight fetchLatestCandle requests.
  // When the symbol changes, we abort all pending polling fetches to free up
  // browser connection slots for the new symbol's history fetch.
  // Declared BEFORE cleanup() so the cleanup function can access it via closure.
  const pollAbortRef = useRef<AbortController | null>(null);

  // FIX: Timeframe seconds for correct candle time snapping in polling fallback.
  // Without this, polling always snaps to 1-minute boundaries even on 1H/1D charts.
  const tfSecondsRef = useRef(60);

  // V451: Removed oandaCandleRef — backend /candle handles all timeframes now

  // V384: Fetch latest candle from backend candle builder (not from quote price).
  // The backend OandaStreamingService builds OHLC candles from the live stream.
  // This is the SAME architecture as Binance kline — server builds candles,
  // frontend just fetches them.
  const fetchLatestCandle = useCallback(async () => {
    if (!symbol) return;
    const pollGen = connectionGenRef.current;

    // BUG-050: Abort any previous in-flight poll request before starting a new one.
    // This prevents fetch pile-up on rapid symbol switches.
    pollAbortRef.current?.abort();
    const ac = new AbortController();
    pollAbortRef.current = ac;

    // V384: For OANDA pairs, fetch pre-built OHLC candle from backend
    if (!isCryptoPair(symbol)) {
      try {
        const tfMap: Record<string, string> = {
          '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30',
          '1min': 'M1', '5min': 'M5', '15min': 'M15', '30min': 'M30',
          '1h': 'H1',
          '4h': 'H4',       // V450
          '1day': 'D1',     // V450
          '1week': 'W1',    // V450
        };
        const tfName = tfMap[timeframe] || 'M1';
        const apiBase = window.location.origin;
        const res = await fetch(`${apiBase}/api/exchange/candle/${encodeURIComponent(symbol)}?timeframe=${tfName}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
        });

        if (pollGen !== connectionGenRef.current) return; // Stale — symbol changed
        if (res.ok) {
          const result = await res.json();
          if (result?.success && result?.data) {
            const candle: CandleData = {
              time: result.data.time,
              open: result.data.open,
              high: result.data.high,
              low: result.data.low,
              close: result.data.close,
              volume: result.data.volume || 0,
            };
            onCandleUpdateRef.current(candle);
            onPriceUpdateRef.current(candle.close);
            return;
          }
        }
      } catch (err: any) {
        // BUG-050: Don't treat AbortError as a real error — it's intentional
        if (err?.name === 'AbortError') return;
        // Fall through to REST quote fallback
      }

      // Fallback: fetch price from /api/exchange/quote and build candle locally
      try {
        const apiBase = window.location.origin;
        const res = await fetch(`${apiBase}/api/exchange/quote/${encodeURIComponent(symbol)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
        });

        if (pollGen !== connectionGenRef.current) return; // Stale — symbol changed
        if (res.ok) {
          const result = await res.json();
          const data = result?.data;
          if (data && (data.price || data.close) > 0) {
            const price = data.price || data.close;

            // V451: Removed oandaCandleRef client-side builder.
            // Backend /candle endpoint now handles all timeframes (V450).
            // This fallback just sends price — RouaChart's onPriceUpdate
            // will update the last candle's close. If no candle exists yet,
            // the historical fetch will fill it.
            onPriceUpdateRef.current(price);
            return;
          }
        }
      } catch (err: any) {
        // BUG-050: Don't treat AbortError as a real error
        if (err?.name === 'AbortError') return;
        // Silent fail — will retry
      }
      return;
    }

    // V-CRYPTO-SPEED-3: Crypto pairs fallback — use backend /api/exchange/quote
    // instead of direct Binance REST API. This avoids geo-blocking issues
    // (api.binance.com is blocked in some regions) and routes through NestJS
    // which reads from Redis cache populated by BinanceStreamingService (@aggTrade).
    try {
      if (isCryptoPair(symbol)) {
        const apiBase = window.location.origin;
        const res = await fetch(`${apiBase}/api/exchange/quote/${encodeURIComponent(symbol)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
        });

        if (pollGen !== connectionGenRef.current) return; // Stale — symbol changed
        if (res.ok) {
          const result = await res.json();
          const data = result?.data;
          if (data && (data.price || data.close) > 0) {
            const price = data.price || data.close;
            // Send price update — RouaChart's onPriceUpdate will update the last
            // candle's close. The historical fetch fills the OHLC candle data.
            onPriceUpdateRef.current(price);
            return;
          }
        }
      }
    } catch (err: any) {
      // BUG-050: Don't treat AbortError as a real error
      if (err?.name === 'AbortError') return;
      // Silent fail — will retry
    }
  }, [symbol, timeframe]);

  // ── Start REST Polling Fallback ────────────────────────
  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setConnectionState('fallback');

    // V-CRYPTO-SPEED-3: Unified polling interval for ALL pairs (crypto + OANDA).
    // Previously: crypto used POLLING_INTERVAL (5000ms = 5s), OANDA used 500ms.
    // This 10x difference caused crypto charts to appear frozen when WS failed.
    // Now: both use 500ms — backend /api/exchange/quote reads from Redis cache
    // populated by BinanceStreamingService (@aggTrade ~1.4 Hz) or
    // OandaStreamingService (live stream). No DB load, no geo-block issues.
    const interval = 500;
    fetchLatestCandle();
    pollingRef.current = setInterval(fetchLatestCandle, interval);
    // V452: Visibility handling is now global (in useEffect below)
  }, [symbol, timeframe, fetchLatestCandle]);

  // ── Connect via Binance WebSocket (crypto fallback) ────
  const connectBinanceFallback = useCallback(() => {
    if (!isCryptoPair(symbol)) {
      // Non-crypto: go straight to polling
      startPolling();
      return;
    }

    const binanceSymbol = normalizeBinanceSymbol(symbol);
    const interval = BINANCE_INTERVALS[timeframe] || '1m';
    // V-CRYPTO-SPEED-2: Use @aggTrade instead of @aggTrade for live price updates.
    // Direct measurements showed @aggTrade only fires when a trade executes (~0.8 Hz
    // unique price changes), while @aggTrade fires on every bid/ask update (~67 Hz
    // raw messages, ~1.4 Hz unique mid-price changes).
    // This brings crypto chart updates closer to OANDA tick rate (~4 Hz).
    // Field change: @aggTrade used d.p (trade price), @aggTrade uses d.b (bid) +
    // d.a (ask) → mid = (bid + ask) / 2.
    // @kline_${interval} is kept for OHLC candle data (Binance server-side aggregation).
    const wsUrl = `${BINANCE_URLS.ws}/stream?streams=${binanceSymbol}@kline_${interval}/${binanceSymbol}@aggTrade`;

    // FIX: Capture current generation for stale connection detection.
    // If symbol/timeframe changes while this connection is active, the
    // generation counter will increment, and this connection's onclose
    // handler will see wsGen !== connectionGenRef.current and skip reconnect.
    const wsGen = connectionGenRef.current;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false; // V-WS-LOOP-FIX: connection established
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!msg.data) return;

          if (msg.stream?.includes('@kline_')) {
            const k = msg.data.k;
            if (k) {
              const candle: CandleData = {
                time: Math.floor(k.t / 1000),
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v),
              };
              // FIX: Use Binance k.x (isKlineClosed) field.
              // k.x = false → candle is still forming (update existing)
              // k.x = true → candle is closed (commit and prepare for new candle)
              const isKlineClosed = k.x === true;
              bufferUpdate(candle, null, isKlineClosed);
            }
          }

          if (msg.stream?.includes('@aggTrade')) {
            const d = msg.data;
            // V-CRYPTO-SPEED-FINAL: @aggTrade fires on every executed trade.
            // Field: d.p = trade price (exact executed price).
            // Frequency: ~2-5 Hz (professional grade, same as Binance/TradingView).
            if (d?.p) {
              const price = parseFloat(d.p);
              // BUG-C04 FIX: Validate price before propagating
              if (isFinite(price) && price > 0) {
                // NO duplicate filter — every trade is a real market event.
                // rAF batching already coalesces multiple updates per frame.
                bufferUpdate(null, price, false);
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        // onclose will handle reconnect
      };

      ws.onclose = () => {
        isConnectingRef.current = false; // V-WS-LOOP-FIX: connection closed
        setConnectionState('disconnected');
        wsRef.current = null;

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (isClosingRef.current) return;

        // FIX: Check generation counter — if a new connection was already
        // started (symbol/timeframe changed), don't reconnect the old one.
        if (wsGen !== connectionGenRef.current) return;

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          startPolling();
          return;
        }

        const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current) + 1000, MAX_DELAY); // +1s minimum
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connectBinanceFallback, delay + Math.random() * 1000);
      };

      // Keepalive ping
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ method: 'ping' })); } catch {}
        } else {
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
        }
      }, PING_INTERVAL);

      // FIX: 24-hour connection rotation — Binance disconnects after 24h.
      // Proactively reconnect 10 minutes before the cutoff to avoid
      // data gaps during active trading sessions.
      // FIX: Close old WebSocket BEFORE creating new one to prevent
      // duplicate connections sending data simultaneously.
      connectionStartTimeRef.current = Date.now();
      if (rotationTimerRef.current) clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = setTimeout(() => {
        if (!isClosingRef.current && wsRef.current) {
          // V436: Stop ping before closing — prevents 'Ping received after close'
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          try { wsRef.current?.close(1000, 'rotation'); } catch {}
          wsRef.current = null;
          connectionGenRef.current++;
          connectBinanceFallback();
        }
      }, CONNECTION_ROTATION_MS);

    } catch {
      startPolling();
    }
  }, [symbol, timeframe, startPolling]); // BUG #6 FIX: Removed onCandleUpdate/onPriceUpdate deps — already using refs

  // FIX: Update tfSecondsRef when timeframe changes
  const tfSecondsMap: Record<string, number> = {
    '1s': 1, '5s': 5, '15s': 15, '30s': 30,
    '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
    '1h': 3600, '2h': 7200, '4h': 14400,
    '1day': 86400, '1week': 604800, '1month': 2592000, '3month': 7776000,
  };
  tfSecondsRef.current = tfSecondsMap[timeframe] || 60;

  // V378: Connection Strategy — Single Source of Truth per symbol.
  // OANDA pairs: REST polling (2s) + candle builder. NO SSE, NO EventSource.
  // Crypto pairs: Binance WS (unchanged, already works).
  //
  // The REST API reads from Redis cache which is fed by OANDA Streaming Service.
  // So we get near-real-time stream prices via simple REST polling.
  // The candle builder converts individual prices into proper OHLC candles.
  const connect = useCallback(() => {
    // V-WS-LOOP-FIX: prevent rapid re-connect loops
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    cleanup();
    isClosingRef.current = false;
    connectionGenRef.current++;
    // V451: oandaCandleRef removed — no reset needed
    if (!enabled) return;

    // V378: OANDA pairs → REST polling + candle builder (no SSE)
    if (!isCryptoPair(symbol)) {
      setConnectionState('connecting');
      startPolling();
      return;
    }

    // Crypto pairs → Binance WS
    setConnectionState('connecting');
    connectBinanceFallback();
  }, [symbol, enabled, cleanup, connectBinanceFallback, startPolling]);

  // ── Reconnect ──────────────────────────────────────────
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // ── Lifecycle ──────────────────────────────────────────
  useEffect(() => {
    connect();
    return cleanup;
  }, [symbol, timeframe, enabled]); // Reconnect on symbol/timeframe change

  // V452: Global visibility handler — when tab becomes visible, reconnect
  // to fill any candle gaps from when tab was hidden. This is SEPARATE from
  // the polling-specific handler in startPolling() — this one covers both
  // crypto (Binance WS may have died) and OANDA (polling was throttled).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isClosingRef.current) {
        reconnect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [reconnect]);

  return {
    connectionState,
    reconnect,
  };
}
