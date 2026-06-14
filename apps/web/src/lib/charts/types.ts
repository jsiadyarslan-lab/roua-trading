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
  // ── Lines ──
  | 'trendline'         // خط اتجاه
  | 'ray'               // شعاع
  | 'info-line'         // خط معلوماتي
  | 'extended-line'     // خط ممتد
  | 'trend-angle'       // خط اتجاه بزاوية
  | 'horizontal'        // خط أفقي
  | 'horizontal-ray'    // شعاع أفقي
  | 'vertical'          // خط رأسي
  | 'cross-line'        // خط متقاطع
  // ── Channels ──
  | 'channel'           // قناة متوازية
  | 'regression-trend'  // اتجاه انحدار
  | 'flat-top-bottom'   // قمة/قاع مسطحة
  | 'disjoint-channel'  // قناة منفصلة
  // ── Forks ──
  | 'andrews-pitchfork' // شوكة أندروز
  | 'schiff-pitchfork'  // شوكة شيف
  | 'modified-schiff'   // شوكة شيف معدلة
  // ── Fibonacci ──
  | 'fibonacci'         // فيبوناتشي ارتداد
  | 'fib-extension'     // فيبوناتشي امتداد
  | 'fib-fan'           // مروحة فيبوناتشي
  | 'fib-spiral'        // حلزون فيبوناتشي
  | 'fib-wedge'         // إسفين فيبوناتشي
  | 'fib-time-zone'     // مناطق زمنية فيبوناتشي
  // ── Gann ──
  | 'gann-box'          // صندوق جان
  | 'gann-square'       // مربع جان
  | 'gann-fan'          // مروحة جان
  // ── Shapes ──
  | 'rectangle'         // مستطيل
  | 'triangle'          // مثلث
  | 'circle'            // دائرة
  | 'ellipse'           // قطع ناقص
  // ── Annotations ──
  | 'text-annotation'   // تعليق نصي
  | 'price-label'       // تسمية سعرية
  | 'note'              // ملاحظة
  // ── Markers ──
  | 'x-marker'          // علامة X
  | 'arrow'             // سهم
  | 'price-range';      // نطاق سعري

// ── Drawing Tool Categories ──
export interface DrawingToolCategory {
  key: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  tools: DrawingTool[];
}

export const DRAWING_CATEGORIES: DrawingToolCategory[] = [
  {
    key: 'lines',
    labelAr: 'الخطوط',
    labelEn: 'Lines',
    icon: '📐',
    tools: ['trendline', 'ray', 'info-line', 'extended-line', 'trend-angle', 'horizontal', 'horizontal-ray', 'vertical', 'cross-line'],
  },
  {
    key: 'channels',
    labelAr: 'القنوات',
    labelEn: 'Channels',
    icon: '📊',
    tools: ['channel', 'regression-trend', 'flat-top-bottom', 'disjoint-channel'],
  },
  {
    key: 'forks',
    labelAr: 'الشوك',
    labelEn: 'Forks',
    icon: '🔱',
    tools: ['andrews-pitchfork', 'schiff-pitchfork', 'modified-schiff'],
  },
  {
    key: 'fibonacci',
    labelAr: 'فيبوناتشي',
    labelEn: 'Fibonacci',
    icon: '📏',
    tools: ['fibonacci', 'fib-extension', 'fib-fan', 'fib-spiral', 'fib-wedge', 'fib-time-zone'],
  },
  {
    key: 'gann',
    labelAr: 'جان',
    labelEn: 'Gann',
    icon: '📐',
    tools: ['gann-box', 'gann-square', 'gann-fan'],
  },
  {
    key: 'shapes',
    labelAr: 'الأشكال',
    labelEn: 'Shapes',
    icon: '⬜',
    tools: ['rectangle', 'triangle', 'circle', 'ellipse'],
  },
  {
    key: 'annotations',
    labelAr: 'التعليقات',
    labelEn: 'Annotations',
    icon: '📝',
    tools: ['text-annotation', 'price-label', 'note'],
  },
];

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
  lineStyle: 'solid' | 'dashed' | 'dotted' | 'dashdot';
  symbol: string;     // Associated symbol
  createdAt: number;
  /** Whether this drawing is visible on all timeframes or only the one it was created on */
  scope: 'single-tf' | 'all-tf';
  /** The timeframe this drawing was created on (only relevant when scope='single-tf') */
  timeframe?: string;
}

// ── Indicator Types ─────────────────────────────────────
export type OverlayIndicatorKey =
  | 'sma' | 'ema' | 'bb' | 'vwap' | 'psar' | 'ichimoku' | 'supertrend' | 'pivot' | 'donchian';

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
  /** Per-parameter validation bounds */
  paramConstraints?: Record<string, { min: number; max: number; step?: number }>;
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
  { key: 'sma',       label: 'المتوسط المتحرك البسيط', labelEn: 'SMA',     category: 'overlay',   defaultParams: { period: 20 },           defaultColor: '#fbbf24', defaultOpacity: 0.8, paramConstraints: { period: { min: 2, max: 500 } } },
  { key: 'ema',       label: 'المتوسط الأسي',           labelEn: 'EMA',     category: 'overlay',   defaultParams: { period: 12 },           defaultColor: '#22d3ee', defaultOpacity: 0.7, paramConstraints: { period: { min: 2, max: 500 } } },
  { key: 'bb',        label: 'بولينجر',                  labelEn: 'BB',      category: 'overlay',   defaultParams: { period: 20, stdDev: 2 },defaultColor: '#58a6ff', defaultOpacity: 0.4, paramConstraints: { period: { min: 2, max: 500 }, stdDev: { min: 0.1, max: 5, step: 0.1 } } },
  { key: 'vwap',      label: 'VWAP',                    labelEn: 'VWAP',    category: 'overlay',   defaultParams: {},                       defaultColor: '#ffd700', defaultOpacity: 0.6 },
  { key: 'psar',      label: 'SAR المكافئ',             labelEn: 'PSAR',    category: 'overlay',   defaultParams: { step: 0.02, max: 0.2 }, defaultColor: '#ffffff', defaultOpacity: 0.8, paramConstraints: { step: { min: 0.001, max: 0.5, step: 0.001 }, max: { min: 0.01, max: 1, step: 0.01 } } },
  { key: 'ichimoku',  label: 'إيشيموكو',                labelEn: 'Ichimoku',category: 'overlay',   defaultParams: { conversion: 9, base: 26, spanB: 52 }, defaultColor: '#58a6ff', defaultOpacity: 0.5, paramConstraints: { conversion: { min: 2, max: 200 }, base: { min: 2, max: 400 }, spanB: { min: 2, max: 600 } } },
  { key: 'supertrend',label: 'سوبر ترند',               labelEn: 'SuperTrend', category: 'overlay',defaultParams: { period: 10, multiplier: 3 }, defaultColor: '#22d3ee', defaultOpacity: 0.7, paramConstraints: { period: { min: 2, max: 200 }, multiplier: { min: 0.5, max: 20, step: 0.1 } } },
  { key: 'pivot',     label: 'نقاط البايفوت',            labelEn: 'Pivot',   category: 'overlay',   defaultParams: {},                       defaultColor: '#a78bfa', defaultOpacity: 0.6 },
  { key: 'donchian',  label: 'قناة دونشيان',             labelEn: 'Donchian', category: 'overlay',   defaultParams: { period: 20 },           defaultColor: '#f97316', defaultOpacity: 0.5, paramConstraints: { period: { min: 2, max: 500 } } },

  // ── Oscillator Indicators ──
  { key: 'rsi',       label: 'RSI',                     labelEn: 'RSI',     category: 'oscillator', defaultParams: { period: 14 },           defaultColor: '#58a6ff', defaultOpacity: 0.8, paramConstraints: { period: { min: 2, max: 500 } } },
  { key: 'macd',      label: 'MACD',                    labelEn: 'MACD',    category: 'oscillator', defaultParams: { fast: 12, slow: 26, signal: 9 }, defaultColor: '#58a6ff', defaultOpacity: 0.8, paramConstraints: { fast: { min: 2, max: 200 }, slow: { min: 2, max: 400 }, signal: { min: 2, max: 200 } } },
  { key: 'stochastic',label: 'الاستوكاستك',              labelEn: 'Stoch',   category: 'oscillator', defaultParams: { kPeriod: 14, dPeriod: 3 }, defaultColor: '#a855f7', defaultOpacity: 0.8, paramConstraints: { kPeriod: { min: 2, max: 200 }, dPeriod: { min: 1, max: 100 } } },
  { key: 'atr',       label: 'ATR',                     labelEn: 'ATR',     category: 'oscillator', defaultParams: { period: 14 },           defaultColor: '#f97316', defaultOpacity: 0.8, paramConstraints: { period: { min: 2, max: 500 } } },
  { key: 'adx',       label: 'ADX',                     labelEn: 'ADX',     category: 'oscillator', defaultParams: { period: 14 },           defaultColor: '#fbbf24', defaultOpacity: 0.8, paramConstraints: { period: { min: 2, max: 500 } } },
  { key: 'cci',       label: 'CCI',                     labelEn: 'CCI',     category: 'oscillator', defaultParams: { period: 20 },           defaultColor: '#34d399', defaultOpacity: 0.8, paramConstraints: { period: { min: 2, max: 500 } } },
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
  // ── Pattern shape data for visual drawing on chart ──
  shapePoints?: { time: number; price: number }[];  // Polygon vertices to draw
  shapeType?: 'polygon' | 'line' | 'zone' | 'harmonic' | 'classic';         // How to render the shape
  shapeColor?: string;                               // Fill/border color
}

// ── AI Entry/Exit Analysis ──────────────────────────────
export interface AIEntryExit {
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;   // 0-1
  reasonAr: string;     // Arabic explanation
  keyLevels: { price: number; label: string }[];
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
// FIX: Re-export CHART_COLORS from chart-utils.ts (single source of truth).
// Previously this file had its own CHART_COLORS with UI-specific colors (bg, card, etc.)
// that duplicated grid/crosshair values from chart-utils. Now we keep UI colors
// in a separate constant and re-export chart colors.
import { CHART_COLORS } from './chart-utils';
export { CHART_COLORS };

export const UI_PALETTE = {
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

// ═══════════════════════════════════════════════════════════
// REVOLUTIONARY FEATURE TYPES — v2.0
// ═══════════════════════════════════════════════════════════

// ── ATR Adaptive TP/SL ──────────────────────────────────
export interface AdaptiveTPSLResult {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  slPercent: number;
  tpPercent: number;
  atrUsed: number;
  regime: 'low' | 'normal' | 'high' | 'extreme';
}

// ── Pattern State Machine ───────────────────────────────
export type PatternLifecycleState =
  | 'inactive' | 'forming' | 'near-completion'
  | 'completed' | 'breakout' | 'failed';

export interface PatternStateInfo {
  id: string;
  type: string;
  state: PatternLifecycleState;
  completionPct: number;
  confidence: number;
  keyLevel: number;
  alert?: string;
  alertAr?: string;
}

// ── Bayesian Consensus ──────────────────────────────────
export interface BayesianConsensusResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reinforcingSignals: Array<{
    sources: string[];
    direction: 'bullish' | 'bearish';
    descriptionAr: string;
    strength: number;
  }>;
  conflictingSignals: Array<{
    sources: string[];
    descriptionAr: string;
  }>;
  keyLevels: Array<{
    price: number;
    type: string;
    source: string;
    strength: number;
    label: string;
  }>;
}

// ── Elliott + SMC Fusion ────────────────────────────────
export interface ElliottSMCFusionResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  confluenceScore: number;
  waveLabelAr: string;
  smcConfirmation: {
    orderBlockConfirms: boolean;
    bosConfirms: boolean;
    fvgConfirms: boolean;
  };
  ewoSignal: 'bullish' | 'bearish' | 'neutral';
  wyckoffAligns: boolean;
  interpretationAr: string;
}

// ── Signal Confidence Heatmap ───────────────────────────
export interface HeatmapOverlay {
  points: Array<{
    time: number;
    netDirection: 'bullish' | 'bearish' | 'neutral' | 'conflicted';
    intensity: number;
    signalCount: number;
  }>;
  dominantDirection: 'bullish' | 'bearish' | 'neutral';
}

// ── Pattern Performance ─────────────────────────────────
export interface PatternPerformanceInfo {
  patternType: string;
  winRate: number;
  totalTrades: number;
  adjustedConfidence: number;
}

// ── Enhanced AIAnalysisResult (extends existing) ─────────
export interface EnhancedAIResult {
  // Original fields
  patterns: AIPattern[];
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  trendLines: TrendLine[];
  entryExit?: AIEntryExit | null;
  smcData?: any;
  geoPatterns?: any;
  elliottPattern?: any;
  wyckoff?: any;
  volumeProfile?: any;
  overlays?: any;

  // Revolutionary additions
  adaptiveTPSL?: AdaptiveTPSLResult;
  patternStates?: PatternStateInfo[];
  bayesianConsensus?: BayesianConsensusResult;
  elliottSMCFusion?: ElliottSMCFusionResult;
  heatmap?: HeatmapOverlay;
  patternPerformance?: PatternPerformanceInfo[];
}

// ── Support/Resistance (re-export for convenience) ──────
export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: 'weak' | 'medium' | 'strong';
  touches: number;
}

export interface TrendLine {
  type: 'ascending' | 'descending';
  startPoint: { time: number; price: number };
  endPoint: { time: number; price: number };
  strength: 'weak' | 'medium' | 'strong';
}
