// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Type Definitions
// ═══════════════════════════════════════════════════════════

import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';

// ── Chart Types ──────────────────────────────────────────
export type ChartType = 'candle' | 'hollow' | 'bar' | 'line' | 'area' | 'heikin-ashi';

// ── Timeframes ──────────────────────────────────────────
export interface TimeframeOption {
  label: string;      // Display label (e.g. '1m', '5m', '1H')
  value: string;      // API interval value (e.g. '1min', '5min')
  minutes: number;    // Minutes for countdown timer
  category: 'seconds' | 'intraday' | 'daily' | 'weekly' | 'monthly';
}

export const TIMEFRAMES: TimeframeOption[] = [
  { label: '1s',  value: '1s',    minutes: 1/60,     category: 'seconds' },
  { label: '5s',  value: '5s',    minutes: 5/60,     category: 'seconds' },
  { label: '15s', value: '15s',   minutes: 15/60,    category: 'seconds' },
  { label: '30s', value: '30s',   minutes: 30/60,    category: 'seconds' },
  { label: '1m',  value: '1min',  minutes: 1,        category: 'intraday' },
  { label: '5m',  value: '5min',  minutes: 5,        category: 'intraday' },
  { label: '15m', value: '15min', minutes: 15,       category: 'intraday' },
  { label: '30m', value: '30min', minutes: 30,       category: 'intraday' },
  { label: '1H',  value: '1h',    minutes: 60,       category: 'intraday' },
  { label: '2H',  value: '2h',    minutes: 120,      category: 'intraday' },
  { label: '4H',  value: '4h',    minutes: 240,      category: 'intraday' },
  { label: '1D',  value: '1day',  minutes: 1440,     category: 'daily' },
  { label: '1W',  value: '1week', minutes: 10080,    category: 'weekly' },
  { label: '1M',  value: '1month',minutes: 43200,    category: 'monthly' },
  { label: '3M',  value: '3month',minutes: 129600,   category: 'monthly' },
];

// ── Candle Data ─────────────────────────────────────────
export interface CandleData {
  time: number;       // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Drawing Types ───────────────────────────────────────
export type DrawingTool =
  | 'cursor'
  | 'trendline'      // خط اتجاه
  | 'horizontal'     // خط أفقي
  | 'vertical'       // خط رأسي
  | 'fibonacci'      // فيبوناتشي
  | 'rectangle'      // مستطيل
  | 'channel'        // قناة متوازية
  | 'triangle'       // مثلث
  | 'circle'         // دائرة
  | 'arc'            // قوس
  | 'x-marker'       // علامة X
  | 'arrow'          // سهم
  | 'extended-line'  // خط ممتد
  | 'ray'            // شعاع
  | 'price-range';   // نطاق سعري

export interface DrawingPoint {
  time: number;       // Unix seconds
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingTool;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  opacity: number;
  symbol: string;     // Associated symbol
  createdAt: number;
}

// ── Indicator Types ─────────────────────────────────────
export type OverlayIndicatorKey =
  | 'sma' | 'ema' | 'bb' | 'vwap' | 'psar' | 'ichimoku' | 'supertrend' | 'pivot';

export type OscillatorIndicatorKey =
  | 'rsi' | 'macd' | 'stochastic' | 'atr' | 'adx' | 'cci';

export type IndicatorKey = OverlayIndicatorKey | OscillatorIndicatorKey;

export interface IndicatorConfig {
  key: IndicatorKey;
  label: string;          // Arabic label
  labelEn: string;        // English label
  category: 'overlay' | 'oscillator';
  defaultParams: Record<string, number>;
  defaultColor: string;
  defaultOpacity: number;
}

export interface ActiveIndicator {
  key: IndicatorKey;
  params: Record<string, number>;
  color: string;
  opacity: number;
  visible: boolean;
}

export const INDICATOR_CONFIGS: IndicatorConfig[] = [
  // ── Overlay Indicators ──
  { key: 'sma',       label: 'المتوسط المتحرك البسيط', labelEn: 'SMA',     category: 'overlay',   defaultParams: { period: 20 },           defaultColor: '#fbbf24', defaultOpacity: 0.8 },
  { key: 'ema',       label: 'المتوسط الأسي',           labelEn: 'EMA',     category: 'overlay',   defaultParams: { period: 12 },           defaultColor: '#22d3ee', defaultOpacity: 0.7 },
  { key: 'bb',        label: 'بولينجر',                  labelEn: 'BB',      category: 'overlay',   defaultParams: { period: 20, stdDev: 2 },defaultColor: '#58a6ff', defaultOpacity: 0.4 },
  { key: 'vwap',      label: 'VWAP',                    labelEn: 'VWAP',    category: 'overlay',   defaultParams: {},                       defaultColor: '#ffd700', defaultOpacity: 0.6 },
  { key: 'psar',      label: 'SAR المكافئ',             labelEn: 'PSAR',    category: 'overlay',   defaultParams: { step: 0.02, max: 0.2 }, defaultColor: '#ffffff', defaultOpacity: 0.8 },
  { key: 'ichimoku',  label: 'إيشيموكو',                labelEn: 'Ichimoku',category: 'overlay',   defaultParams: { conversion: 9, base: 26, spanB: 52 }, defaultColor: '#58a6ff', defaultOpacity: 0.5 },
  { key: 'supertrend',label: 'سوبر ترند',               labelEn: 'SuperTrend', category: 'overlay',defaultParams: { period: 10, multiplier: 3 }, defaultColor: '#22d3ee', defaultOpacity: 0.7 },
  { key: 'pivot',     label: 'نقاط البايفوت',            labelEn: 'Pivot',   category: 'overlay',   defaultParams: {},                       defaultColor: '#a78bfa', defaultOpacity: 0.6 },

  // ── Oscillator Indicators ──
  { key: 'rsi',       label: 'RSI',                     labelEn: 'RSI',     category: 'oscillator', defaultParams: { period: 14 },           defaultColor: '#58a6ff', defaultOpacity: 0.8 },
  { key: 'macd',      label: 'MACD',                    labelEn: 'MACD',    category: 'oscillator', defaultParams: { fast: 12, slow: 26, signal: 9 }, defaultColor: '#58a6ff', defaultOpacity: 0.8 },
  { key: 'stochastic',label: 'الاستوكاستك',              labelEn: 'Stoch',   category: 'oscillator', defaultParams: { kPeriod: 14, dPeriod: 3 }, defaultColor: '#a855f7', defaultOpacity: 0.8 },
  { key: 'atr',       label: 'ATR',                     labelEn: 'ATR',     category: 'oscillator', defaultParams: { period: 14 },           defaultColor: '#f97316', defaultOpacity: 0.8 },
  { key: 'adx',       label: 'ADX',                     labelEn: 'ADX',     category: 'oscillator', defaultParams: { period: 14 },           defaultColor: '#fbbf24', defaultOpacity: 0.8 },
  { key: 'cci',       label: 'CCI',                     labelEn: 'CCI',     category: 'oscillator', defaultParams: { period: 20 },           defaultColor: '#34d399', defaultOpacity: 0.8 },
];

// ── Chart Settings ──────────────────────────────────────
export interface ChartSettings {
  type: ChartType;
  showGrid: boolean;
  showPriceLine: boolean;
  showVolume: boolean;
  showSessions: boolean;
  showCandleTimer: boolean;
  crosshairType: 'cross' | 'dot' | 'none';
  upColor: string;
  downColor: string;
  bgColor: string;
  gridColor: string;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  type: 'candle',
  showGrid: true,
  showPriceLine: true,
  showVolume: true,
  showSessions: true,
  showCandleTimer: true,
  crosshairType: 'cross',
  upColor: '#3fb950',
  downColor: '#f85149',
  bgColor: '#0B0E14',
  gridColor: 'rgba(42,49,60,0.5)',
};

// ── Chart Template ──────────────────────────────────────
export interface ChartTemplate {
  id: string;
  name: string;
  settings: ChartSettings;
  indicators: ActiveIndicator[];
  drawings: Drawing[];
  timeframe: string;
  chartType: ChartType;
  createdAt: number;
  updatedAt: number;
}

// ── News Marker ─────────────────────────────────────────
export interface NewsMarker {
  time: number;       // Unix seconds
  title: string;
  summary: string;
  source: string;
  url?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// ── AI Pattern ──────────────────────────────────────────
export interface AIPattern {
  type: string;       // e.g. 'Doji', 'Hammer', 'Engulfing'
  labelAr: string;    // Arabic label
  time: number;       // Unix seconds
  price: number;
  confidence: number; // 0-1
  direction: 'bullish' | 'bearish' | 'neutral';
}

// ── Chart Trading ───────────────────────────────────────
export interface ChartOrder {
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
}

// ── Crosshair Data ──────────────────────────────────────
export interface CrosshairData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  dateStr: string;
}

// ── Color Palette ───────────────────────────────────────
export const CHART_COLORS = {
  bg: '#0B0E14',
  card: '#151A22',
  border: '#2A313C',
  borderLight: 'rgba(42,49,60,0.5)',
  text: '#F0F2F5',
  textSecondary: '#8B92A8',
  textMuted: '#64748b',
  cyan: '#00D4FF',
  success: '#3fb950',
  danger: '#f85149',
  warning: '#fbbf24',
  info: '#58a6ff',
  purple: '#a855f7',
  grid: 'rgba(42,49,60,0.5)',
  crosshair: 'rgba(160,200,220,0.3)',
  sessionTokyo: 'rgba(255,255,255,0.025)',
  sessionLondon: 'rgba(88,166,255,0.03)',
  sessionNY: 'rgba(63,185,80,0.03)',
} as const;

// ── Series Handle Type ──────────────────────────────────
export interface SeriesHandle {
  key: string;
  series: ISeriesApi<SeriesType>;
  type: 'main' | 'overlay' | 'oscillator' | 'volume';
}
