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

// Binance stream interval mapping
const BINANCE_INTERVALS: Record<string, string> = {
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
  '1day': '1d', '3day': '3d', '1week': '1w', '1month': '1M', '3month': '3M',
};

// Known crypto pairs
const CRYPTO_BASES = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI']);

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

  const MAX_RECONNECT_ATTEMPTS = 15;
  const BASE_DELAY = 1000;
  const MAX_DELAY = 30000;
  const POLLING_INTERVAL = 5000; // 5s REST fallback

  // ── Cleanup ────────────────────────────────────────────
  const cleanup = useCallback(() => {
    isClosingRef.current = true;

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
          const candle: CandleData = {
            time: now - (now % 60),
            open: data.open || price,
            high: data.high || price,
            low: data.low || price,
            close: price,
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
        const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol.toUpperCase()}&interval=${interval}&limit=2`;

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
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${binanceSymbol}@kline_${interval}/${binanceSymbol}@ticker`;

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
              onCandleUpdate(candle);
            }
          }

          if (msg.stream?.includes('@ticker')) {
            const d = msg.data;
            if (d?.c) {
              onPriceUpdate(parseFloat(d.c));
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
        reconnectTimerRef.current = setTimeout(connect, delay + Math.random() * 1000);
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
      }, 20000);

    } catch {
      startPolling();
    }
  }, [symbol, timeframe, startPolling, onCandleUpdate, onPriceUpdate]);

  // ── Primary: Connect via Socket.IO Gateway ─────────────
  // FIX: Socket.IO connects to the backend /exchange namespace,
  // which provides authenticated, multi-asset market data via
  // ExchangeService. This is the preferred path because:
  // - Authenticated (session token validation)
  // - Works for ALL asset types (crypto + stocks + forex)
  // - Rate-limited and consistent with backend data
  // - Redis Pub/Sub for cross-instance distribution
  const connect = useCallback(() => {
    cleanup();
    isClosingRef.current = false;
    if (!enabled) return;

    setConnectionState('connecting');

    // Get session token for authentication
    // FIX: Only include token if it's actually available.
    // When roua_session is httpOnly, document.cookie can't read it,
    // so getSessionToken() returns null. Passing token=null in the
    // query string creates "?token=null" which is misleading and may
    // cause server-side auth failures. The browser automatically sends
    // httpOnly cookies in the WebSocket handshake Cookie header, so
    // the server can still authenticate via _extractSessionFromCookie().
    const token = getSessionToken();
    const wsUrl = window.location.origin;

    // Dynamically import socket.io-client to avoid SSR issues
    import('socket.io-client').then(({ io }) => {
      if (isClosingRef.current) return;

      try {
        const socketOptions: any = {
          transports: ['websocket', 'polling'],
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        };
        // Only include token in auth/query if it's actually available
        if (token) {
          socketOptions.auth = { token };
          socketOptions.query = { token };
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
              const now = Math.floor(Date.now() / 1000);
              const candle: CandleData = {
                time: now - (now % 60),
                open: quote.open || price,
                high: quote.high || price,
                low: quote.low || price,
                close: price,
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
