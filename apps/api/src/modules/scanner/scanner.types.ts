// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Advanced Scanner Types & DTOs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Enums ──

export enum MarketCategory {
  ALL = 'ALL',
  CRYPTO = 'CRYPTO',
  FOREX = 'FOREX',
  STOCK = 'STOCK',
  COMMODITY = 'COMMODITY',
}

export enum SignalDirection {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY',
  NEUTRAL = 'NEUTRAL',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
}

export enum SignalClass {
  TREND = 'TREND',
  REVERSION = 'REVERSION',
  BREAKOUT = 'BREAKOUT',
  CONSOLIDATION = 'CONSOLIDATION',
  WATCH = 'WATCH',
}

export enum TimeFrame {
  M15 = '15min',
  H1 = '1h',
  H4 = '4h',
  D1 = '1day',
}

// ── Core Scanner DTOs ──

export class StochResult {
  k: number;
  d: number;
  interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}

export class AdxResult {
  adx: number;
  plusDi: number;
  minusDi: number;
  trendStrength: 'NO_TREND' | 'WEAK' | 'STRONG' | 'VERY_STRONG';
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export class VwapResult {
  value: number;
  deviation: number;
  position: 'ABOVE' | 'BELOW' | 'AT';
}

export class SupportResistanceLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  touches: number;
}

export class PatternDetection {
  name: string;
  nameAr: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0-100
  description: string;
  descriptionAr: string;
}

// ════════════════════════════════════════════════
//  NEW — Smart Scoring Engine Types
// ════════════════════════════════════════════════

export interface SmartScore {
  trendScore: number;       // 0-100: Trend strength (EMA + Ichimoku + ADX)
  momentumScore: number;   // 0-100: Momentum (RSI + MACD + Stoch + CCI)
  volatilityScore: number; // 0-100: Volatility level (ATR + BB + Volatility)
  volumeScore: number;     // 0-100: Volume confirmation (OBV + Volume Profile)
  compositeScore: number;  // -100 to +100
  signalType: 'STRONG_TREND' | 'REVERSAL' | 'BREAKOUT' | 'CONSOLIDATION' | 'DIVERGENCE';
  confidence: number;      // 0-100
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  tradeTimeframe: 'SCALP' | 'DAY' | 'SWING' | 'POSITION';
}

export class IchimokuResult {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  chikouSpan: number;
  cloudColor: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE';
  tkCross: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export class ObvResult {
  values: number[];
  trend: 'RISING' | 'FALLING' | 'FLAT';
  divergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE';
}

export class CciResult {
  value: number;
  interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}

export class ParabolicSarResult {
  value: number;
  trend: 'RISING' | 'FALLING';
  accelerationFactor: number;
}

export class FibonacciLevel {
  level: number;    // 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1
  price: number;
  label: string;    // e.g. "23.6%", "38.2%"
  labelAr: string;  // e.g. "23.6٪"
}

export class DivergenceResult {
  type: 'BULLISH' | 'BEARISH' | 'HIDDEN_BULLISH' | 'HIDDEN_BEARISH' | 'NONE';
  indicator: string; // 'rsi', 'macd', 'stoch', etc.
  description: string;
  descriptionAr: string;
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
}

export class VolumeProfileLevel {
  priceStart: number;
  priceEnd: number;
  volume: number;
  percentage: number; // % of total volume
}

export class VolumeProfileResult {
  levels: VolumeProfileLevel[];
  poc: number;           // Point of Control — price with highest volume
  valueAreaHigh: number; // 70% of volume — high boundary
  valueAreaLow: number;  // 70% of volume — low boundary
}

export class CandlePattern {
  name: string;
  nameAr: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0-100
  description: string;
  descriptionAr: string;
}

// ── Scanner Item (Table Row) ──

export class ScannerItemDto {
  symbol: string;
  name: string;
  category: MarketCategory;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;

  // Technical Indicators
  rsi: number | null;
  macdSignal: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE' | null;
  macdHistogram: number | null;
  bollingerPosition: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN' | null;
  stochK: number | null;
  stochD: number | null;
  adx: number | null;
  atr: number | null;
  atrVolatility: 'LOW' | 'NORMAL' | 'HIGH' | null;

  // Signal Classification
  direction: SignalDirection;
  signalClass: SignalClass;
  technicalScore: number; // -100 to +100
  confidence: number; // 0-100

  // Smart Score (NEW)
  smartScore: SmartScore | null;

  // Visual
  sparkline: number[];
  reasons: string[];
  reasonsAr: string[];

  // Metadata
  marketOpen: boolean;
  source: string;
  timestamp: Date;
}

// ── Heatmap Item ──

export class HeatmapItemDto {
  symbol: string;
  name: string;
  category: MarketCategory;
  price: number;
  changePercent: number;
  volume: number;
  direction: SignalDirection;
  technicalScore: number;
  marketCap: number | null;
}

// ── Multi-Timeframe Analysis ──

export class TimeframeAnalysisDto {
  timeframe: string;
  direction: SignalDirection;
  technicalScore: number;
  rsi: number | null;
  macdSignal: string | null;
  adx: number | null;
  bollingerPosition: string | null;
  confidence: number;
  summary: string;
}

export class MultiTfResultDto {
  symbol: string;
  timeframes: TimeframeAnalysisDto[];
  alignment: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  alignmentScore: number; // -100 to +100
  executionHint: string;
  executionHintAr: string;
  confidence: number;
  timestamp: Date;
}

// ── Deep Analysis (Single Symbol) ──

export class DeepAnalysisDto {
  symbol: string;
  name: string;
  category: MarketCategory;

  quote: {
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    marketCap: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
  };

  technical: {
    rsi: number | null;
    rsiInterpretation: string | null;
    macdSignal: string | null;
    macdHistogram: number | null;
    bollingerPosition: string | null;
    bollingerBandwidth: number | null;
    stochK: number | null;
    stochD: number | null;
    adx: number | null;
    adxTrend: string | null;
    atr: number | null;
    atrVolatility: string | null;
    vwapPosition: string | null;
    technicalScore: number;
    summary: string;
  };

  // NEW — Advanced Indicators
  smartScore: SmartScore | null;
  ichimoku: IchimokuResult | null;
  obv: ObvResult | null;
  cci: CciResult | null;
  sar: ParabolicSarResult | null;
  fibonacci: FibonacciLevel[] | null;
  divergence: DivergenceResult | null;
  volumeProfile: VolumeProfileResult | null;
  candlePatterns: CandlePattern[];

  supportResistance: SupportResistanceLevel[];
  patterns: PatternDetection[];

  signal: {
    direction: SignalDirection;
    signalClass: SignalClass;
    confidence: number;
    entryPrice: number | null;
    takeProfit: number | null;
    stopLoss: number | null;
    riskRewardRatio: number | null;
    reasons: string[];
    reasonsAr: string[];
  };

  aiAnalysis: string | null;
  aiModel: string | null;
  aiSentiment: string | null;
  riskLevel: string | null;

  marketOpen: boolean;
  source: string;
  timestamp: Date;
}

// ── Scanner Scan Response ──

export class ScannerScanResponseDto {
  items: ScannerItemDto[];
  meta: {
    timeframe: string;
    category: string;
    symbolsScanned: number;
    source: string;
    timestamp: Date;
    nextScanInSeconds: number;
  };
}

// ── Market Overview ──

export class MarketOverviewDto {
  totalScanned: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  topGainers: HeatmapItemDto[];
  topLosers: HeatmapItemDto[];
  strongestSignals: ScannerItemDto[];
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number;
  timestamp: Date;
}

// ── Constants ──

export const SCANNER_SYMBOLS = [
  { symbol: 'BTC/USD', name: 'بيتكوين', category: MarketCategory.CRYPTO },
  { symbol: 'ETH/USD', name: 'إيثريوم', category: MarketCategory.CRYPTO },
  { symbol: 'SOL/USD', name: 'سولانا', category: MarketCategory.CRYPTO },
  { symbol: 'BNB/USD', name: 'بينانس كوين', category: MarketCategory.CRYPTO },
  { symbol: 'XRP/USD', name: 'ريبيل', category: MarketCategory.CRYPTO },
  { symbol: 'ADA/USD', name: 'كاردانو', category: MarketCategory.CRYPTO },
  { symbol: 'EUR/USD', name: 'يورو/دولار', category: MarketCategory.FOREX },
  { symbol: 'GBP/USD', name: 'جنيه/دولار', category: MarketCategory.FOREX },
  { symbol: 'USD/JPY', name: 'دولار/ين', category: MarketCategory.FOREX },
  { symbol: 'XAU/USD', name: 'الذهب', category: MarketCategory.COMMODITY },
  { symbol: 'AAPL', name: 'أبل', category: MarketCategory.STOCK },
  { symbol: 'TSLA', name: 'تسلا', category: MarketCategory.STOCK },
  { symbol: 'NVDA', name: 'إنفيديا', category: MarketCategory.STOCK },
];
