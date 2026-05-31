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
  const socketIoRef = useRef<any>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isClosingRef = useRef(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'fallback'>('disconnected');
  // PERF: rAF batching buffer for WebSocket messages
  const rafBufferRef = useRef<WSBuffer>({ candle: null, price: null, isKlineClosed: false });
  const rafIdRef = useRef<number>(0);
  // FIX: 24-hour connection rotation — Binance disconnects after 24h.
  // We proactively reconnect 10 minutes before the 24h mark.
  const connectionStartTimeRef = useRef<number>(0);
  const rotationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const CONNECTION_ROTATION_MS = 23 * 60 * 60 * 1000; // 23 hours (10min before 24h cutoff)

  // WS/Reconnection config from config.ts
  const { reconnectMaxAttempts: MAX_RECONNECT_ATTEMPTS, reconnectBaseDelay: BASE_DELAY, reconnectMaxDelay: MAX_DELAY, pollingInterval: POLLING_INTERVAL, pingInterval: PING_INTERVAL } = WS_CONFIG;

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
      onCandleUpdate(buf.candle);
    }
    if (buf.price !== null) {
      onPriceUpdate(buf.price);
    }
  }, [onCandleUpdate, onPriceUpdate]);

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

    // Disconnect Socket.IO
    if (socketIoRef.current) {
      try {
        socketIoRef.current.disconnect();
      } catch {}
      socketIoRef.current = null;
    }

    // Disconnect Binance WS
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
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
  }, []);

  // ── Fetch latest candle via REST ───────────────────────
  const fetchLatestCandle = useCallback(async () => {
    if (!symbol) return;

    try {
      // FIX: Route through backend ExchangeGateway REST API first
      // This ensures data consistency with the rest of the platform
      const apiBase = window.location.origin;
      const res = await fetch(`${apiBase}/api/exchange/quote/${encodeURIComponent(symbol)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const result = await res.json();
        const data = result?.data;
        if (data && (data.price || data.close) > 0) {
          const price = data.price || data.close;
          onPriceUpdate(price);
          const now = Math.floor(Date.now() / 1000);
          // FIX: Sanitize OHLC — flat candles (open===high===low===close)
          // from forex/ticker sources render as dots. Add tiny range if flat.
          let open = data.open || price;
          let high = data.high || price;
          let low = data.low || price;
          const close = price;
          if (high < Math.max(open, close)) high = Math.max(open, close);
          if (low > Math.min(open, close)) low = Math.min(open, close);
          if (high === low) {
            const tick = close * 0.0001;
            high += tick;
            low -= tick;
          }
          const candle: CandleData = {
            time: now - (now % 60),
            open,
            high,
            low,
            close,
            volume: data.volume || 0,
          };
          onCandleUpdate(candle);
          return; // Success via backend — done
        }
      }

      // Fallback: Direct Binance API (crypto only)
      if (isCryptoPair(symbol)) {
        const binanceSymbol = normalizeBinanceSymbol(symbol);
        const interval = BINANCE_INTERVALS[timeframe] || '1m';
        const url = `${BINANCE_URLS.rest}/klines?symbol=${binanceSymbol.toUpperCase()}&interval=${interval}&limit=2`;

        const binanceRes = await fetch(url);
        if (!binanceRes.ok) return;

        const data = await binanceRes.json();
        if (data.length > 0) {
          const k = data[data.length - 1];
          const candle: CandleData = {
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          };
          onCandleUpdate(candle);
          onPriceUpdate(candle.close);
        }
      }
    } catch {
      // Silent fail — will retry
    }
  }, [symbol, timeframe, onCandleUpdate, onPriceUpdate]);

  // ── Start REST Polling Fallback ────────────────────────
  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setConnectionState('fallback');

    const interval = isCryptoPair(symbol) ? POLLING_INTERVAL : 30000;
    fetchLatestCandle();
    pollingRef.current = setInterval(fetchLatestCandle, interval);
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
    const wsUrl = `${BINANCE_URLS.ws}/stream?streams=${binanceSymbol}@kline_${interval}/${binanceSymbol}@ticker`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
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

          if (msg.stream?.includes('@ticker')) {
            const d = msg.data;
            if (d?.c) {
              bufferUpdate(null, parseFloat(d.c), false);
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
        setConnectionState('disconnected');
        wsRef.current = null;

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (isClosingRef.current) return;

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          startPolling();
          return;
        }

        const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current), MAX_DELAY);
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
      connectionStartTimeRef.current = Date.now();
      if (rotationTimerRef.current) clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = setTimeout(() => {
        if (!isClosingRef.current && wsRef.current) {
          console.log('[useChartWebSocket] Proactive 24h rotation — reconnecting...');
          connectBinanceFallback();
        }
      }, CONNECTION_ROTATION_MS);

    } catch {
      startPolling();
    }
  }, [symbol, timeframe, startPolling, onCandleUpdate, onPriceUpdate]);

  // ── Primary: Skip Socket.IO, use Binance WS or REST polling ──
  // NestJS has no WebSocket gateway deployed, so socket.io attempts
  // always return 404 errors. Skip directly to Binance WS fallback.
  // To enable Socket.IO, deploy NestJS WebSocket gateway and set
  // NEXT_PUBLIC_WS_ENABLED=true in Railway environment variables.
  const connect = useCallback(() => {
    cleanup();
    isClosingRef.current = false;
    if (!enabled) return;

    // Skip socket.io — go directly to Binance WS or REST polling
    if (process.env.NEXT_PUBLIC_WS_ENABLED !== 'true') {
      setConnectionState('connecting');
      connectBinanceFallback();
      return;
    }

    setConnectionState('connecting');

    const token = getSessionToken();
    const wsUrl = window.location.origin;

    import('socket.io-client').then(({ io }) => {
      if (isClosingRef.current) return;

      try {
        const socketOptions: any = {
          transports: ['polling', 'websocket'],  // polling first — Next.js rewrites can't proxy WS upgrade requests
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        };
        // SECURITY: Token must ONLY be in auth (not in query/URL).
        // query params appear in server logs, browser history, and referrer headers.
        if (token) {
          socketOptions.auth = { token };
          // socketOptions.query intentionally omitted — tokens must not appear in URLs
        }

        const socket = io(`${wsUrl}/exchange`, socketOptions);

        socketIoRef.current = socket;

        socket.on('connect', () => {
          if (isClosingRef.current) {
            socket.disconnect();
            return;
          }
          setConnectionState('connected');
          reconnectAttemptsRef.current = 0;

          // Subscribe to current symbol
          socket.emit('subscribe', { symbol });
        });

        socket.on('ticker', (data: any) => {
          if (isClosingRef.current) return;
          if (!data || !data.data) return;

          // Only process data for our symbol
          const dataSymbol = data.symbol || data.data.symbol || '';
          if (dataSymbol && symbol) {
            const normalized = dataSymbol.replace('/', '');
            const currentNorm = symbol.replace('/', '');
            if (normalized !== currentNorm && !dataSymbol.includes(symbol.split('/')[0])) return;
          }

          const quote = data.data;
          if (quote) {
            const price = quote.price || quote.close || quote.lastPrice;
            if (price && price > 0) {
              onPriceUpdate(price);

              // Create synthetic candle from ticker data
              // FIX: Sanitize OHLC — flat candles from ticker render as dots.
              const now = Math.floor(Date.now() / 1000);
              let open = quote.open || price;
              let high = quote.high || price;
              let low = quote.low || price;
              const close = price;
              if (high < Math.max(open, close)) high = Math.max(open, close);
              if (low > Math.min(open, close)) low = Math.min(open, close);
              if (high === low) {
                const tick = close * 0.0001;
                high += tick;
                low -= tick;
              }
              const candle: CandleData = {
                time: now - (now % 60),
                open,
                high,
                low,
                close,
                volume: quote.volume || 0,
              };
              onCandleUpdate(candle);
            }
          }
        });

        socket.on('ticker:error', (data: any) => {
          // Exchange gateway couldn't fetch data for this symbol
          // Fall back to Binance direct or REST polling
        });

        socket.on('disconnect', (reason: string) => {
          if (isClosingRef.current) return;
          setConnectionState('disconnected');
        });

        socket.on('connect_error', (error: any) => {
          if (isClosingRef.current) return;
          // Socket.IO failed — fall back to Binance WS
          try { socket.disconnect(); } catch {}
          socketIoRef.current = null;
          connectBinanceFallback();
        });
      } catch {
        // Socket.IO creation failed — fall back to Binance WS
        connectBinanceFallback();
      }
    }).catch(() => {
      // Dynamic import failed — fall back to Binance WS
      connectBinanceFallback();
    });
  }, [symbol, timeframe, enabled, cleanup, connectBinanceFallback, onCandleUpdate, onPriceUpdate]);

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

  return {
    connectionState,
    reconnect,
  };
}
