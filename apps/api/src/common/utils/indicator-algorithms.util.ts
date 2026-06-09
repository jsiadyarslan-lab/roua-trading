// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Canonical Indicator Algorithms
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Pure functions for indicator calculations — canonical implementations.
// Used by TechnicalIndicatorService, MarketAnalyzerService, and AIOrchestratorService.
//
// IMPORTANT: All algorithms use the mathematically correct methods:
//   - RSI: Wilder's smoothing (avgGain/avgLoss smoothed over entire dataset)
//   - ATR: Wilder's smoothing (NOT simple average)
//   - MACD: Proper EMA alignment with offset calculation
//   - Bollinger: Standard deviation from SMA
//   - EMA: Standard exponential moving average with SMA seed
//
// Do NOT introduce "simplified" versions here — this is the single source of truth.

// ── SMA: Simple Moving Average ──

/**
 * Compute Simple Moving Average
 * SMA(n) = sum(data[i-n+1..i]) / n
 * Returns array of length (data.length - period + 1)
 */
export function calcSma(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const result: number[] = [];
  let sum = 0;

  // Initial window
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result.push(sum / period);

  // Sliding window
  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result.push(sum / period);
  }

  return result;
}

// ── EMA: Exponential Moving Average ──

/**
 * Compute Exponential Moving Average (returns full array)
 * EMA(n) = close * k + EMA_prev * (1 - k), where k = 2/(n+1)
 * Seeded with SMA for the first value.
 * Returns array of length (data.length - period + 1)
 */
export function calcEma(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const k = 2 / (period + 1);
  const result: number[] = [];

  // Start with SMA for the first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result.push(sum / period);

  // Calculate EMA for the rest
  for (let i = period; i < data.length; i++) {
    const emaValue = data[i] * k + result[result.length - 1] * (1 - k);
    result.push(emaValue);
  }

  return result;
}

/**
 * EMA — Latest scalar value only (for quick lookups)
 * Returns the last EMA value, or 0 if insufficient data.
 */
export function calcEmaLatest(data: number[], period: number): number {
  const emaArr = calcEma(data, period);
  return emaArr.length > 0 ? emaArr[emaArr.length - 1] : 0;
}

// ── RSI: Relative Strength Index ──

/**
 * Compute RSI using Wilder's smoothing (full array)
 * RSI = 100 - (100 / (1 + RS))
 * RS = Average Gain / Average Loss over period
 * Uses Wilder's smoothing method for running averages:
 *   avgGain = (prevAvgGain * (period - 1) + currentGain) / period
 *   avgLoss = (prevAvgLoss * (period - 1) + currentLoss) / period
 *
 * Returns array of length (data.length - period)
 */
export function calcRsi(data: number[], period: number = 14): number[] {
  if (data.length < period + 1) return [];

  const values: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  if (avgLoss === 0) {
    values.push(100);
  } else {
    const rs = avgGain / avgLoss;
    values.push(100 - 100 / (1 + rs));
  }

  // Subsequent values using Wilder's smoothing
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      values.push(100);
    } else {
      const rs = avgGain / avgLoss;
      values.push(100 - 100 / (1 + rs));
    }
  }

  return values;
}

/**
 * RSI — Latest scalar value only
 * Returns 50 (neutral) if insufficient data.
 */
export function calcRsiLatest(data: number[], period: number = 14): number {
  const rsiArr = calcRsi(data, period);
  if (rsiArr.length === 0) return 50;
  return parseFloat(rsiArr[rsiArr.length - 1].toFixed(2));
}

// ── MACD: Moving Average Convergence Divergence ──

/**
 * MACD — Full result with arrays
 * MACD Line = EMA(fast) - EMA(slow)   (properly aligned)
 * Signal Line = EMA(signalPeriod) of MACD Line
 * Histogram = MACD - Signal (aligned)
 */
export interface MacdCalcResult {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
  crossover: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE';
}

/**
 * Compute MACD with full array output.
 * Returns null if insufficient data.
 */
export function calcMacd(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): MacdCalcResult | null {
  if (data.length < slowPeriod + signalPeriod) return null;

  const fastEma = calcEma(data, fastPeriod);
  const slowEma = calcEma(data, slowPeriod);

  if (fastEma.length === 0 || slowEma.length === 0) return null;

  // MACD line: fast EMA - slow EMA
  // Align: fastEma starts at index fastPeriod-1, slowEma at slowPeriod-1
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];

  for (let i = 0; i < slowEma.length; i++) {
    const fastIdx = i + offset;
    if (fastIdx < fastEma.length) {
      macdLine.push(fastEma[fastIdx] - slowEma[i]);
    }
  }

  if (macdLine.length < signalPeriod) return null;

  // Signal line: EMA of MACD line
  const signalLine = calcEma(macdLine, signalPeriod);

  // Histogram: MACD - Signal (aligned)
  const histogram: number[] = [];
  const histOffset = macdLine.length - signalLine.length;
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + histOffset] - signalLine[i]);
  }

  // Detect crossover
  let crossover: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE' = 'NONE';
  if (histogram.length >= 2) {
    const prev = histogram[histogram.length - 2];
    const curr = histogram[histogram.length - 1];
    if (prev < 0 && curr >= 0) {
      crossover = 'BULLISH_CROSSOVER';
    } else if (prev >= 0 && curr < 0) {
      crossover = 'BEARISH_CROSSOVER';
    }
  }

  // Align all arrays to the same length
  const resultLen = Math.min(macdLine.length, signalLine.length, histogram.length);
  const startOffset = macdLine.length - resultLen;

  return {
    macdLine: macdLine.slice(startOffset),
    signalLine: signalLine.slice(signalLine.length - resultLen),
    histogram: histogram.slice(histogram.length - resultLen),
    crossover,
  };
}

/**
 * MACD — Simplified result for agent/orchestrator (latest values only)
 * Returns default zeroed result if insufficient data.
 */
export interface MacdScalarResult {
  macd: number;
  signal: number;
  histogram: number;
  crossover: 'BULLISH' | 'BEARISH' | 'NONE';
}

export function calcMacdScalar(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): MacdScalarResult {
  const result = calcMacd(data, fastPeriod, slowPeriod, signalPeriod);
  if (!result) {
    return { macd: 0, signal: 0, histogram: 0, crossover: 'NONE' };
  }

  const macdValue = result.macdLine[result.macdLine.length - 1] ?? 0;
  const signalValue = result.signalLine[result.signalLine.length - 1] ?? 0;
  const histValue = result.histogram[result.histogram.length - 1] ?? 0;

  // Map crossover: BULLISH_CROSSOVER → BULLISH, BEARISH_CROSSOVER → BEARISH
  const crossover: 'BULLISH' | 'BEARISH' | 'NONE' =
    result.crossover === 'BULLISH_CROSSOVER' ? 'BULLISH'
    : result.crossover === 'BEARISH_CROSSOVER' ? 'BEARISH'
    : 'NONE';

  return {
    macd: parseFloat(macdValue.toFixed(6)),
    signal: parseFloat(signalValue.toFixed(6)),
    histogram: parseFloat(histValue.toFixed(6)),
    crossover,
  };
}

// ── Bollinger Bands ──

/**
 * Bollinger Bands — Full arrays
 * Middle = SMA(period)
 * Upper = Middle + multiplier * StdDev
 * Lower = Middle - multiplier * StdDev
 */
export interface BollingerCalcResult {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number[];
  position: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN';
}

/**
 * Compute Bollinger Bands with full array output.
 * Returns null if insufficient data.
 */
export function calcBollingerBands(
  data: number[],
  period: number = 20,
  multiplier: number = 2,
): BollingerCalcResult | null {
  if (data.length < period) return null;

  const middle = calcSma(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < middle.length; i++) {
    const dataIdx = i + period - 1;
    // Calculate standard deviation for the window
    const window = data.slice(dataIdx - period + 1, dataIdx + 1);
    const mean = middle[i];
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upperBand = mean + multiplier * stdDev;
    const lowerBand = mean - multiplier * stdDev;

    upper.push(upperBand);
    lower.push(lowerBand);
    bandwidth.push(mean !== 0 ? (upperBand - lowerBand) / mean : 0);
  }

  // Determine position of latest price relative to bands
  let position: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN' = 'WITHIN';
  if (data.length > 0 && upper.length > 0 && lower.length > 0) {
    const latestPrice = data[data.length - 1];
    const latestUpper = upper[upper.length - 1];
    const latestLower = lower[lower.length - 1];

    if (latestPrice > latestUpper) {
      position = 'ABOVE_UPPER';
    } else if (latestPrice < latestLower) {
      position = 'BELOW_LOWER';
    }
  }

  return { upper, middle, lower, bandwidth, position };
}

/**
 * Bollinger Bands — Scalar result for agent
 * Returns reasonable defaults if insufficient data.
 */
export interface BollingerScalarResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
}

export function calcBollingerBandsScalar(
  data: number[],
  period: number = 20,
  multiplier: number = 2,
): BollingerScalarResult {
  const result = calcBollingerBands(data, period, multiplier);
  if (!result) {
    // Not enough data — return percentage-based estimate
    const price = data.length > 0 ? data[data.length - 1] : 0;
    return {
      upper: price * 1.02,
      middle: price,
      lower: price * 0.98,
      bandwidth: 0.04,
      percentB: 0.5,
    };
  }

  const latestUpper = result.upper[result.upper.length - 1];
  const latestMiddle = result.middle[result.middle.length - 1];
  const latestLower = result.lower[result.lower.length - 1];
  const latestBandwidth = result.bandwidth[result.bandwidth.length - 1];
  const currentPrice = data[data.length - 1];

  // %B: Where is current price relative to bands?
  const percentB = (latestUpper - latestLower) > 0
    ? (currentPrice - latestLower) / (latestUpper - latestLower)
    : 0.5;

  return {
    upper: parseFloat(latestUpper.toFixed(8)),
    middle: parseFloat(latestMiddle.toFixed(8)),
    lower: parseFloat(latestLower.toFixed(8)),
    bandwidth: parseFloat(latestBandwidth.toFixed(6)),
    percentB: parseFloat(Math.max(0, Math.min(1, percentB)).toFixed(4)),
  };
}

// ── ATR: Average True Range ──

/**
 * Compute Average True Range using Wilder's smoothing (full array)
 * TR = max(high-low, |high-prevClose|, |low-prevClose|)
 * First ATR = simple average of first 'period' true ranges
 * Subsequent ATR = (prevATR * (period - 1) + currentTR) / period  (Wilder's smoothing)
 *
 * Returns array of length (trueRanges.length - period + 1)
 */
export function calcAtr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number[] {
  if (highs.length < period + 1) return [];

  const trueRanges: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hpc, lpc));
  }

  if (trueRanges.length < period) return [];

  const values: number[] = [];

  // First ATR: simple average of first 'period' true ranges
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  values.push(atr);

  // Subsequent: Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    values.push(atr);
  }

  return values;
}

/**
 * ATR — Latest scalar value only
 * Returns 0 if insufficient data.
 */
export function calcAtrLatest(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number {
  const atrArr = calcAtr(highs, lows, closes, period);
  if (atrArr.length === 0) return 0;
  return parseFloat(atrArr[atrArr.length - 1].toFixed(8));
}
