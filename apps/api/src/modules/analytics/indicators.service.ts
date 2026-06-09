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
// V178 FIX #20: Import canonical indicator algorithms — single source of truth.
// Previously, this service had FULL DUPLICATE implementations of SMA, EMA, RSI, MACD,
// Bollinger, and ATR that were identical to indicator-algorithms.util.ts.
// Now delegates to canonical util for calculations and adds only the interpretation/
// summary enrichment layer on top.
import {
  calcSma,
  calcEma,
  calcRsi,
  calcMacd,
  calcBollingerBands,
  calcAtr,
} from '../../common/utils/indicator-algorithms.util';

/**
 * Technical Indicator Service — Delegates to Canonical Indicator Algorithms
 *
 * V178 FIX #20: This service now delegates ALL indicator calculations to the
 * canonical `indicator-algorithms.util.ts` instead of reimplementing them.
 * This service adds the interpretation/summary enrichment layer:
 *   - Technical score calculation (-100 to +100)
 *   - Human-readable summary generation
 *   - RSI interpretation (OVERBOUGHT/OVERSOLD/NEUTRAL)
 *   - ATR volatility level (LOW/NORMAL/HIGH)
 *
 * DO NOT add raw indicator calculations here — use indicator-algorithms.util.ts instead.
 */
@Injectable()
export class TechnicalIndicatorService {
  private readonly logger = new Logger(TechnicalIndicatorService.name);

  constructor() {
    this.logger.log('📈 Technical Indicator Service initialized — delegating to canonical indicator-algorithms.util.ts (V178)');
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

    // Compute all indicators — V178: Delegated to canonical indicator-algorithms.util.ts
    const sma20 = calcSma(closes, 20);
    const sma50 = calcSma(closes, 50);
    const sma200 = calcSma(closes, 200);

    const ema12 = calcEma(closes, 12);
    const ema26 = calcEma(closes, 26);
    const ema50 = calcEma(closes, 50);

    const rsiValues = calcRsi(closes, 14);
    const macdResult = calcMacd(closes, 12, 26, 9);
    const bbResult = calcBollingerBands(closes, 20, 2);
    const atrValues = calcAtr(highs, lows, closes, 14);

    // V178: Build enriched result objects with interpretation (layer on top of canonical util)
    const rsiResult = rsiValues.length > 0 ? this._enrichRsi(rsiValues) : null;
    const atrResult = atrValues.length > 0 ? this._enrichAtr(atrValues) : null;
    // Map canonical MacdCalcResult to MacdResult expected by analytics types
    const macdMapped: MacdResult | null = macdResult ? {
      macd: macdResult.macdLine,
      signal: macdResult.signalLine,
      histogram: macdResult.histogram,
      crossover: macdResult.crossover,
    } : null;

    // Calculate aggregate technical score (-100 to +100)
    const technicalScore = this._calculateTechnicalScore(
      closes,
      sma20,
      sma50,
      ema12,
      ema26,
      rsiResult,
      macdMapped,
      bbResult,
    );

    // Generate summary
    const summary = this._generateSummary(symbol, closes, rsiResult, macdMapped, bbResult, technicalScore);

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
      macd: macdMapped,
      bollingerBands: bbResult,
      atr: atrResult,
      technicalScore,
      summary,
    };
  }

  // ── V178: Public methods now delegate to canonical util ──
  // These methods exist for backward compatibility with consumers that call
  // TechnicalIndicatorService.sma() etc. They simply delegate to the canonical util.

  sma(data: number[], period: number): number[] {
    return calcSma(data, period);
  }

  ema(data: number[], period: number): number[] {
    return calcEma(data, period);
  }

  rsi(data: number[], period: number = 14): RsiResult | null {
    const values = calcRsi(data, period);
    if (values.length === 0) return null;
    return this._enrichRsi(values);
  }

  macd(
    data: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
  ): MacdResult | null {
    const result = calcMacd(data, fastPeriod, slowPeriod, signalPeriod);
    if (!result) return null;
    // Map canonical result to the MacdResult type expected by consumers
    return {
      macd: result.macdLine,
      signal: result.signalLine,
      histogram: result.histogram,
      crossover: result.crossover,
    };
  }

  bollingerBands(
    data: number[],
    period: number = 20,
    multiplier: number = 2,
  ): BollingerBandsResult | null {
    return calcBollingerBands(data, period, multiplier);
  }

  atr(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14,
  ): AtrResult | null {
    const values = calcAtr(highs, lows, closes, period);
    if (values.length === 0) return null;
    return this._enrichAtr(values);
  }

  // ── V178: Enrichment methods (interpretation layer on top of canonical util) ──

  private _enrichRsi(values: number[]): RsiResult {
    const latestRsi = values[values.length - 1];
    let interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    if (latestRsi >= 70) {
      interpretation = 'OVERBOUGHT';
    } else if (latestRsi <= 30) {
      interpretation = 'OVERSOLD';
    } else {
      interpretation = 'NEUTRAL';
    }
    return { period: 14, values, interpretation };
  }

  private _enrichAtr(values: number[]): AtrResult {
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
    return { period: 14, values, volatilityLevel };
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
