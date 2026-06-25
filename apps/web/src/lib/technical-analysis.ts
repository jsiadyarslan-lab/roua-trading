// ─── V474: Technical Analysis — حساب فعلي من candles ─────────
// يحسب RSI, MACD, EMA, SMA, Support, Resistance من بيانات Yahoo Finance

export interface TechnicalAnalysisResult {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number; trend: 'bullish' | 'bearish' | 'neutral' } | null;
  ema20: number | null;
  ema50: number | null;
  sma20: number | null;
  sma50: number | null;
  support: number | null;
  resistance: number | null;
  trend: 'bullish' | 'bearish' | 'neutral';
  priceVsMA50: 'above' | 'below' | 'unknown';
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * يحسب RSI (Relative Strength Index)
 * RSI = 100 - (100 / (1 + RS))
 * RS = Average Gain / Average Loss
 */
function calculateRSI(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // أول period
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // باقي البيانات (Wilder's smoothing)
  for (let i = period; i < changes.length; i++) {
    if (changes[i] > 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

/**
 * يحسب EMA (Exponential Moving Average)
 */
function calculateEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return Math.round(ema * 100) / 100;
}

/**
 * يحسب SMA (Simple Moving Average)
 */
function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return Math.round((slice.reduce((a, b) => a + b, 0) / period) * 100) / 100;
}

/**
 * يحسب MACD
 * MACD = EMA(12) - EMA(26)
 * Signal = EMA(MACD, 9)
 */
function calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number; trend: 'bullish' | 'bearish' | 'neutral' } | null {
  const closes = candles.map(c => c.close);
  if (closes.length < 35) return null;

  // احسب EMA12 و EMA26 لكل نقطة
  const ema12Values: number[] = [];
  const ema26Values: number[] = [];
  const macdValues: number[] = [];

  const k12 = 2 / 13;
  const k26 = 2 / 27;

  let ema12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let ema26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

  for (let i = 12; i < closes.length; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
    if (i >= 25) {
      ema26 = closes[i] * k26 + ema26 * (1 - k26);
      macdValues.push(ema12 - ema26);
    }
  }

  if (macdValues.length < 9) return null;

  // Signal = EMA(macd, 9)
  const k9 = 2 / 10;
  let signal = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdValues.length; i++) {
    signal = macdValues[i] * k9 + signal * (1 - k9);
  }

  const macd = macdValues[macdValues.length - 1];
  const histogram = macd - signal;

  const trend: 'bullish' | 'bearish' | 'neutral' =
    histogram > 0.01 ? 'bullish' : histogram < -0.01 ? 'bearish' : 'neutral';

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    trend,
  };
}

/**
 * يحسب مستويات الدعم والمقاومة
 * Support = أقل سعر في آخر N شمعة
 * Resistance = أعلى سعر في آخر N شمعة
 */
function calculateSupportResistance(candles: Candle[], lookback: number = 20): { support: number | null; resistance: number | null } {
  if (candles.length < 5) return { support: null, resistance: null };
  const recent = candles.slice(-lookback);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  return {
    support: Math.round(Math.min(...lows) * 100) / 100,
    resistance: Math.round(Math.max(...highs) * 100) / 100,
  };
}

/**
 * يحسب التحليل الفني الكامل من candles
 */
export async function performTechnicalAnalysis(
  symbol: string,
  candles?: Candle[],
): Promise<TechnicalAnalysisResult> {
  // إذا لم تُمرر candles، اجلبها من Yahoo Finance
  if (!candles || candles.length === 0) {
    const { getHistoricalData } = await import('./financial-apis');
    candles = await getHistoricalData(symbol, '1d', '3mo');
  }

  if (!candles || candles.length < 20) {
    return {
      rsi: null,
      macd: null,
      ema20: null,
      ema50: null,
      sma20: null,
      sma50: null,
      support: null,
      resistance: null,
      trend: 'unknown' as any,
      priceVsMA50: 'unknown',
    };
  }

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  const rsi = calculateRSI(candles, 14);
  const macd = calculateMACD(candles);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const { support, resistance } = calculateSupportResistance(candles, 20);

  // Trend: price vs EMA50
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let priceVsMA50: 'above' | 'below' | 'unknown' = 'unknown';
  if (ema50) {
    if (currentPrice > ema50 * 1.01) {
      trend = 'bullish';
      priceVsMA50 = 'above';
    } else if (currentPrice < ema50 * 0.99) {
      trend = 'bearish';
      priceVsMA50 = 'below';
    } else {
      priceVsMA50 = currentPrice > ema50 ? 'above' : 'below';
    }
  }

  // إذا RSI > 70 → bullish قد يكون تشبع شرائي
  if (rsi && rsi > 70) trend = 'bearish'; // overbought → likely reversal
  if (rsi && rsi < 30) trend = 'bullish'; // oversold → likely bounce

  return {
    rsi,
    macd,
    ema20,
    ema50,
    sma20,
    sma50,
    support,
    resistance,
    trend,
    priceVsMA50,
  };
}
