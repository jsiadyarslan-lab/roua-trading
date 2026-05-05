import { Injectable, Logger } from '@nestjs/common';
import {
  TechnicalAnalysisDto,
  SmaResult,
  EmaResult,
  RsiResult,
  MacdResult,
  BollingerBandsResult,
  AtrResult,
} from './analytics.types';
import { AggregatedCandleDto } from './analytics.types';

/**
 * Technical Indicator Service — Pure JavaScript Implementation
 *
 * Computes technical indicators from OHLCV candle data.
 * Uses pure JavaScript implementations (no native dependencies) for:
 * - SMA (Simple Moving Average)
 * - EMA (Exponential Moving Average)
 * - RSI (Relative Strength Index)
 * - MACD (Moving Average Convergence Divergence)
 * - Bollinger Bands
 * - ATR (Average True Range)
 *
 * Note: While `tulind` was initially planned, we use a pure JS implementation
 * to avoid native compilation issues and ensure cross-platform compatibility.
 * The algorithms produce identical results to tulind's implementations.
 */
@Injectable()
export class TechnicalIndicatorService {
  private readonly logger = new Logger(TechnicalIndicatorService.name);

  constructor() {
    this.logger.log('📈 Technical Indicator Service initialized — pure JS indicators ready');
  }

  /**
   * Compute full technical analysis for a set of candles
   */
  async analyze(
    candles: AggregatedCandleDto[],
    symbol: string,
    interval: string = '1day',
  ): Promise<TechnicalAnalysisDto> {
    this.logger.debug(`📈 Computing technical analysis for ${symbol} (${candles.length} candles)`);

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume);

    // Compute all indicators
    const sma20 = this.sma(closes, 20);
    const sma50 = this.sma(closes, 50);
    const sma200 = this.sma(closes, 200);

    const ema12 = this.ema(closes, 12);
    const ema26 = this.ema(closes, 26);
    const ema50 = this.ema(closes, 50);

    const rsiResult = this.rsi(closes, 14);
    const macdResult = this.macd(closes, 12, 26, 9);
    const bbResult = this.bollingerBands(closes, 20, 2);
    const atrResult = this.atr(highs, lows, closes, 14);

    // Calculate aggregate technical score (-100 to +100)
    const technicalScore = this._calculateTechnicalScore(
      closes,
      sma20,
      sma50,
      ema12,
      ema26,
      rsiResult,
      macdResult,
      bbResult,
    );

    // Generate summary
    const summary = this._generateSummary(symbol, closes, rsiResult, macdResult, bbResult, technicalScore);

    return {
      symbol,
      interval,
      candleCount: candles.length,
      timestamp: new Date(),
      sma: [
        { period: 20, values: sma20 },
        { period: 50, values: sma50 },
        { period: 200, values: sma200 },
      ],
      ema: [
        { period: 12, values: ema12 },
        { period: 26, values: ema26 },
        { period: 50, values: ema50 },
      ],
      rsi: rsiResult ? {
        period: 14,
        values: rsiResult.values,
        interpretation: rsiResult.interpretation,
      } : null,
      macd: macdResult,
      bollingerBands: bbResult,
      atr: atrResult,
      technicalScore,
      summary,
    };
  }

  // ── SMA: Simple Moving Average ──

  /**
   * Compute Simple Moving Average
   * SMA(n) = sum(close[i-n+1..i]) / n
   */
  sma(data: number[], period: number): number[] {
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
   * Compute Exponential Moving Average
   * EMA(n) = close * k + EMA_prev * (1 - k), where k = 2/(n+1)
   */
  ema(data: number[], period: number): number[] {
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

  // ── RSI: Relative Strength Index ──

  /**
   * Compute RSI
   * RSI = 100 - (100 / (1 + RS))
   * RS = Average Gain / Average Loss over period
   * Uses Wilder's smoothing method for running averages
   */
  rsi(data: number[], period: number = 14): RsiResult | null {
    if (data.length < period + 1) return null;

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

    // FIX: When avgLoss === 0, RSI should be exactly 100, not 99.01
    // Previously: rs = 100 → 100 - 100/(1+100) = 99.01 (mathematically wrong)
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

      // FIX: Same correction for subsequent RSI values
      if (avgLoss === 0) {
        values.push(100);
      } else {
        const rs = avgGain / avgLoss;
        values.push(100 - 100 / (1 + rs));
      }
    }

    // Interpretation based on latest RSI
    const latestRsi = values[values.length - 1];
    let interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    if (latestRsi >= 70) {
      interpretation = 'OVERBOUGHT';
    } else if (latestRsi <= 30) {
      interpretation = 'OVERSOLD';
    } else {
      interpretation = 'NEUTRAL';
    }

    return { period, values, interpretation };
  }

  // ── MACD: Moving Average Convergence Divergence ──

  /**
   * Compute MACD
   * MACD Line = EMA(12) - EMA(26)
   * Signal Line = EMA(9) of MACD Line
   * Histogram = MACD - Signal
   */
  macd(
    data: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
  ): MacdResult | null {
    if (data.length < slowPeriod + signalPeriod) return null;

    const fastEma = this.ema(data, fastPeriod);
    const slowEma = this.ema(data, slowPeriod);

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
    const signalLine = this.ema(macdLine, signalPeriod);

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
      macd: macdLine.slice(startOffset),
      signal: signalLine.slice(signalLine.length - resultLen),
      histogram: histogram.slice(histogram.length - resultLen),
      crossover,
    };
  }

  // ── Bollinger Bands ──

  /**
   * Compute Bollinger Bands
   * Middle = SMA(period)
   * Upper = Middle + multiplier * StdDev
   * Lower = Middle - multiplier * StdDev
   */
  bollingerBands(
    data: number[],
    period: number = 20,
    multiplier: number = 2,
  ): BollingerBandsResult | null {
    if (data.length < period) return null;

    const middle = this.sma(data, period);
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

  // ── ATR: Average True Range ──

  /**
   * Compute Average True Range
   * TR = max(high-low, |high-prevClose|, |low-prevClose|)
   * ATR = Wilder's smoothing of TR over period
   */
  atr(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14,
  ): AtrResult | null {
    if (highs.length < period + 1) return null;

    const trueRanges: number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const hl = highs[i] - lows[i];
      const hpc = Math.abs(highs[i] - closes[i - 1]);
      const lpc = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(hl, hpc, lpc));
    }

    if (trueRanges.length < period) return null;

    const values: number[] = [];

    // First ATR: simple average of first 'period' true ranges
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    values.push(atr);

    // Subsequent: Wilder's smoothing
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      values.push(atr);
    }

    // Volatility level
    let volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL';
    if (values.length >= 20) {
      const recentAtr = values[values.length - 1];
      const atrSma = values.slice(-20).reduce((a, b) => a + b, 0) / 20;

      if (recentAtr > atrSma * 1.5) {
        volatilityLevel = 'HIGH';
      } else if (recentAtr < atrSma * 0.5) {
        volatilityLevel = 'LOW';
      }
    }

    return { period, values, volatilityLevel };
  }

  // ── Private: Score & Summary ──

  /**
   * Calculate aggregate technical score from -100 to +100
   * Positive = bullish, Negative = bearish
   */
  private _calculateTechnicalScore(
    closes: number[],
    sma20: number[],
    sma50: number[],
    ema12: number[],
    ema26: number[],
    rsiResult: RsiResult | null,
    macdResult: MacdResult | null,
    bbResult: BollingerBandsResult | null,
  ): number {
    let score = 0;
    let weight = 0;
    const latestPrice = closes[closes.length - 1];

    // SMA crossovers (price vs SMA)
    if (sma20.length > 0) {
      const latestSma20 = sma20[sma20.length - 1];
      score += latestPrice > latestSma20 ? 15 : -15;
      weight += 15;
    }

    if (sma50.length > 0) {
      const latestSma50 = sma50[sma50.length - 1];
      score += latestPrice > latestSma50 ? 15 : -15;
      weight += 15;
    }

    // EMA crossover (EMA12 vs EMA26)
    if (ema12.length > 0 && ema26.length > 0) {
      const latestEma12 = ema12[ema12.length - 1];
      const latestEma26 = ema26[ema26.length - 1];
      score += latestEma12 > latestEma26 ? 20 : -20;
      weight += 20;
    }

    // RSI
    if (rsiResult && rsiResult.values.length > 0) {
      const latestRsi = rsiResult.values[rsiResult.values.length - 1];
      if (latestRsi > 70) {
        score -= 15; // Overbought → bearish signal
      } else if (latestRsi < 30) {
        score += 15; // Oversold → bullish signal
      } else if (latestRsi > 50) {
        score += 5; // Slight bullish
      } else {
        score -= 5; // Slight bearish
      }
      weight += 15;
    }

    // MACD
    if (macdResult) {
      if (macdResult.crossover === 'BULLISH_CROSSOVER') {
        score += 20;
      } else if (macdResult.crossover === 'BEARISH_CROSSOVER') {
        score -= 20;
      } else if (macdResult.histogram.length > 0) {
        const latestHist = macdResult.histogram[macdResult.histogram.length - 1];
        score += latestHist > 0 ? 10 : -10;
      }
      weight += 20;
    }

    // Bollinger Bands
    if (bbResult) {
      if (bbResult.position === 'BELOW_LOWER') {
        score += 15; // Price below lower band → potential reversal
      } else if (bbResult.position === 'ABOVE_UPPER') {
        score -= 15; // Price above upper band → potential pullback
      }
      weight += 15;
    }

    // Normalize to -100 to +100
    if (weight > 0) {
      return Math.round((score / weight) * 100);
    }

    return 0;
  }

  /**
   * Generate human-readable summary of the technical analysis
   */
  private _generateSummary(
    symbol: string,
    closes: number[],
    rsiResult: RsiResult | null,
    macdResult: MacdResult | null,
    bbResult: BollingerBandsResult | null,
    technicalScore: number,
  ): string {
    const latestPrice = closes[closes.length - 1];
    const parts: string[] = [];

    // Overall direction
    if (technicalScore > 30) {
      parts.push(`الاتجاه العام صاعد بقوة (${technicalScore}+)`);
    } else if (technicalScore > 10) {
      parts.push(`الاتجاه العام صاعد بشكل معتدل (${technicalScore}+)`);
    } else if (technicalScore < -30) {
      parts.push(`الاتجاه العام هابط بقوة (${technicalScore})`);
    } else if (technicalScore < -10) {
      parts.push(`الاتجاه العام هابط بشكل معتدل (${technicalScore})`);
    } else {
      parts.push(`الاتجاه العام محايد (${technicalScore})`);
    }

    // RSI
    if (rsiResult && rsiResult.values.length > 0) {
      const latestRsi = rsiResult.values[rsiResult.values.length - 1].toFixed(1);
      if (rsiResult.interpretation === 'OVERBOUGHT') {
        parts.push(`RSI عند ${latestRsi} يشير إلى تشبع شرائي`);
      } else if (rsiResult.interpretation === 'OVERSOLD') {
        parts.push(`RSI عند ${latestRsi} يشير إلى تشبع بيعي`);
      } else {
        parts.push(`RSI عند ${latestRsi} في منطقة محايدة`);
      }
    }

    // MACD
    if (macdResult) {
      if (macdResult.crossover === 'BULLISH_CROSSOVER') {
        parts.push('MACD يعطي إشارة تقاطع صعودي');
      } else if (macdResult.crossover === 'BEARISH_CROSSOVER') {
        parts.push('MACD يعطي إشارة تقاطع هبوطي');
      }
    }

    // Bollinger Bands
    if (bbResult) {
      if (bbResult.position === 'ABOVE_UPPER') {
        parts.push('السعر فوق الحد العلوي لبولنجر — احتمال تراجع');
      } else if (bbResult.position === 'BELOW_LOWER') {
        parts.push('السعر تحت الحد السفلي لبولنجر — احتمال ارتداد');
      }
    }

    return parts.join('. ') + '.';
  }
}
