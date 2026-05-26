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

// ── Binance Interval Mapping ──
export const BINANCE_INTERVALS: Record<string, string> = {
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
  '1day': '1d', '3day': '3d', '1week': '1w', '1month': '1M', '3month': '3M',
} as const;

// ── Known Crypto Bases ──
export const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI',
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
