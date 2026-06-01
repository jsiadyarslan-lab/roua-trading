/**
 * Centralized configuration for the Roua Trading Platform.
 * Single source of truth — all magic numbers and hardcoded values live here.
 */

// ── Chart Visual Config ──
export const CHART_COLORS = {
  background: '#0b0e14',
  grid: 'rgba(55,65,81,0.3)',
  gridText: '#64748b',
  candleUp: '#22c55e',
  candleDown: '#ef4444',
  borderColor: '#64748b',
} as const;

// ── ATR Config ──
export const ATR_CONFIG = {
  period: 14,
} as const;

// ── WebSocket Reconnection Config ──
export const WS_CONFIG = {
  reconnectBaseDelay: 1000,     // 1 second
  reconnectMaxDelay: 30000,    // 30 seconds
  reconnectMaxAttempts: 15,
  pollingInterval: 5000,       // 5 seconds REST fallback
  pingInterval: 20000,         // 20 seconds keepalive
} as const;

// ── Binance API URLs ──
export const BINANCE_URLS = {
  rest: 'https://api.binance.com/api/v3',
  ws: 'wss://stream.binance.com:9443',
  tickerRest: 'https://api.binance.com/api/v3/ticker/24hr',
} as const;

// ── Binance REST API Endpoints (ordered by reliability for cloud servers) ──
// FIX: Reordered to put data-api.binance.vision FIRST — it's the most reliable
// endpoint from cloud servers (not geo-blocked like api.binance.com).
// api.binance.com is geo-blocked on Railway/cloud. Binance.us has very low
// liquidity (65%+ flat 1m candles). These alternatives provide proper OHLC
// data with high liquidity from any geography.
export const BINANCE_REST_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3',
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
  'https://api2.binance.com/api/v3',
  'https://api3.binance.com/api/v3',
  'https://api4.binance.com/api/v3',
] as const;

// ── Binance Interval Mapping ──
export const BINANCE_INTERVALS: Record<string, string> = {
  '1s': '1m', '5s': '1m', '15s': '1m', '30s': '1m', // seconds → 1m (Binance min)
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', // short aliases
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
  '1day': '1d', '3day': '3d', '1week': '1w', '1month': '1M', '3month': '3M',
  '1d': '1d', '1w': '1w', '1M': '1M', '3M': '3M', // daily+ shorthand aliases
} as const;

// ── Known Crypto Bases ──
export const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI',
  'ATOM', 'LTC', 'SHIB', 'APE', 'ARB', 'OP', 'FIL', 'NEAR', 'FTM', 'ALGO', 'VET', 'SAND',
  'MANA', 'AXS', 'CRV', 'SUI', 'APT', 'SEI', 'TIA', 'JUP',
]);

// ── FVG Config ──
export const FVG_CONFIG = {
  maxZones: 3,
  lookbackCandles: 30,
} as const;

// ── S/R Config ──
export const SR_CONFIG = {
  maxLevels: 4,
  maxSwingLabels: 5,
} as const;

// ── Backtest Defaults ──
export const BACKTEST_DEFAULTS = {
  lookback: 40,
  step: 5,
  minConfidence: 0.55,
  maxHoldingBars: 25,
  initialEquity: 100000,
  riskPerTrade: 0.02,
} as const;

// ── Notification Config ──
export const NOTIFICATION_CONFIG = {
  maxStored: 50,
  maxVisible: 5,
  defaultDurations: {
    info: 4000,
    success: 3000,
    warning: 6000,
    error: 0,
    pattern: 5000,
    trade: 7000,
  },
} as const;

// ── Price Fetch Config ──
export const PRICE_FETCH_CONFIG = {
  intervalMs: 10000,
} as const;

// ── Pattern State Machine Config ──
export const PATTERN_STATE_CONFIG = {
  maxAge: 300000, // 5 minutes
} as const;

// ── Audio Alert Config ──
export const AUDIO_ALERT_CONFIG = {
  breakout: { frequency: 880, duration: 150, repeats: 3 },
  pattern_complete: { frequency: 660, duration: 200, repeats: 2 },
  warning: { frequency: 440, duration: 300, repeats: 1 },
  critical: { frequency: 1000, duration: 100, repeats: 5 },
} as const;

// ── Audio Tones (for trade alerts and price alerts) ──
export const AUDIO_TONES = {
  buy: { freq1: 523.25, freq2: 659.25 },
  sell: { freq1: 392, freq2: 329.63 },
  default: { frequency: 440 },
  whale: { frequency: 220 },
  above: { freq1: 880, freq2: 1100 },
  below: { freq1: 440, freq2: 330 },
} as const;

// ── Binance US Fallback URL ──
// WARNING: Binance.us has extremely low liquidity — 65%+ of 1m candles are flat
// (open===high===low===close, volume=0). Only use as LAST resort after all
// other Binance endpoints fail. Flat candles render as dots on the chart.
export const BINANCE_US_REST = 'https://api.binance.us/api/v3';

// ── Margin Warning Thresholds ──
export const MARGIN_THRESHOLDS = {
  danger: 30,
  warning: 50,
} as const;

// ── R/R Warning Thresholds ──
export const RR_THRESHOLDS = {
  danger: 1.2,
  warning: 1.5,
} as const;
