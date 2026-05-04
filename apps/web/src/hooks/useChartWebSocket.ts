// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — WebSocket + REST Polling Fallback
// Provides reliable real-time data with automatic failover
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
  '1day': '1d', '3day': '3d', '1week': '1w', '1month': '1M',
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

export function useChartWebSocket(options: UseChartWebSocketOptions): UseChartWebSocketReturn {
  const { symbol, timeframe, onCandleUpdate, onPriceUpdate, enabled = true } = options;

  const wsRef = useRef<WebSocket | null>(null);
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

    // Clear ping interval first to prevent "Ping received after close"
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

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
  // FIX: Must be defined BEFORE startPolling which uses it.
  // Previously, startPolling was defined first and referenced fetchLatestCandle
  // causing "Cannot access 'fetchLatestCandle' before initialization" TDZ error.
  const fetchLatestCandle = useCallback(async () => {
    if (!symbol) return;

    try {
      // For crypto pairs: use Binance API directly
      if (isCryptoPair(symbol)) {
        const binanceSymbol = normalizeBinanceSymbol(symbol);
        const interval = BINANCE_INTERVALS[timeframe] || '1m';
        const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol.toUpperCase()}&interval=${interval}&limit=2`;

        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();
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
      } else {
        // FIX: For non-crypto assets (stocks, forex, commodities),
        // use the backend API proxy which routes to TwelveData or FreeFallback.
        // Previously, non-crypto symbols got NO updates at all — the user
        // saw a completely static chart for stocks like AAPL or forex like EUR/USD.
        const apiBase = window.location.origin;
        const res = await fetch(`${apiBase}/api/analytics/analyze/${encodeURIComponent(symbol)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) return;

        const result = await res.json();
        const quote = result?.data?.quote;
        if (quote && quote.price > 0) {
          onPriceUpdate(quote.price);
          // Create a synthetic candle from the quote data
          const now = Math.floor(Date.now() / 1000);
          const candle: CandleData = {
            time: now - (now % 60), // Round to current minute
            open: quote.open || quote.price,
            high: quote.high || quote.price,
            low: quote.low || quote.price,
            close: quote.price,
            volume: quote.volume || 0,
          };
          onCandleUpdate(candle);
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

    // FIX: Also poll for non-crypto symbols (previously skipped entirely)
    // Use a longer interval for non-crypto (30s) since they're less volatile
    const interval = isCryptoPair(symbol) ? POLLING_INTERVAL : 30000;

    // Initial fetch
    fetchLatestCandle();

    pollingRef.current = setInterval(fetchLatestCandle, interval);
  }, [symbol, fetchLatestCandle]);

  // ── Connect WebSocket ──────────────────────────────────
  const connect = useCallback(() => {
    cleanup();
    isClosingRef.current = false;  // Reset closing flag for new connection
    if (!enabled) return;

    if (!isCryptoPair(symbol)) {
      // Non-crypto: use REST polling
      startPolling();
      return;
    }

    setConnectionState('connecting');

    const binanceSymbol = normalizeBinanceSymbol(symbol);
    const interval = BINANCE_INTERVALS[timeframe] || '1m';

    // Combined stream: kline + ticker
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

          // Handle kline data
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

          // Handle ticker data
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

        // Clear ping interval to prevent "Ping received after close"
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Don't reconnect if we're intentionally closing (cleanup)
        if (isClosingRef.current) return;

        // Fallback to REST polling after max reconnect attempts
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          startPolling();
          return;
        }

        // Exponential backoff reconnect
        const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current), MAX_DELAY);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay + Math.random() * 1000);
      };

      // Keepalive ping — stored in ref for cleanup
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ method: 'ping' })); } catch { /* ignore */ }
        } else {
          // WS not open — clear ping
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
        }
      }, 20000);

    } catch {
      // WebSocket creation failed — fall back to polling
      startPolling();
    }
  }, [symbol, timeframe, enabled, cleanup, startPolling, onCandleUpdate, onPriceUpdate]);

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
