// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Multi-Timeframe Analysis Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V-PHASE3: التحليل متعدد الأطر الزمنية
//
// كل استراتيجية تعمل على إطار زمني رئيسي (Primary TF) وتستخدم
// أطر زمنية أعلى للتأكيد. هذا يمنع الدخول ضد الاتجاه العام.
//
// الخريطة:
// ┌──────────────────────┬──────────────┬────────────────────────────┐
// │ الاستراتيجية         │ الإطار الرئيسي│ أطر التأكيد               │
// ├──────────────────────┼──────────────┼────────────────────────────┤
// │ SCALPING             │ M5 (5min)    │ M15 (15min), H1 (1h)      │
// │ SWING                │ H4 (4h)      │ D1 (1day) — تأكيد يومي    │
// │ MOMENTUM_BREAKOUT    │ M15          │ H1, H4                     │
// │ MEAN_REVERSION       │ M15          │ H1                         │
// │ GRID                 │ H1           │ H4                         │
// │ DCA                  │ H4           │ D1                         │
// │ VWAP_RSI             │ M15          │ H1                         │
// └──────────────────────┴──────────────┴────────────────────────────┘
//
// كيف يعمل:
// 1. يجلب بيانات الشموع (klines) لكل إطار زمني بالتوازي
// 2. يحسب المؤشرات الفنية (RSI, MACD, EMA) لكل إطار
// 3. يحسب التوافق بين الأطر (alignment)
// 4. يرجع HigherTimeframeContext للاستراتيجيات

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  StrategyType,
  HigherTimeframeContext,
  HigherTimeframeData,
  MACDResult,
  EMAResult,
} from '../types/agent.types';
import { calcRsiLatest, calcMacdScalar, calcEmaLatest } from '../../../common/utils/indicator-algorithms.util';

// ── Timeframe Configuration ──

/** Maps our internal timeframe labels to ExchangeService interval strings */
const TF_INTERVAL_MAP: Record<string, string> = {
  M1: '1min',
  M5: '5min',
  M15: '15min',
  M30: '30min',
  H1: '1h',
  H4: '4h',
  D1: '1day',
  W1: '1week',
};

/** How many days of history to fetch per timeframe (enough for MACD/EMA200) */
const TF_HISTORY_DAYS: Record<string, number> = {
  M1: 3,    // 3 days of 1-min candles = ~4320 candles (enough for indicators)
  M5: 10,   // 10 days of 5-min = ~2880 candles
  M15: 20,  // 20 days of 15-min = ~1920 candles
  M30: 30,  // 30 days of 30-min = ~1440 candles
  H1: 60,   // 60 days of 1h = ~1440 candles
  H4: 120,  // 120 days of 4h = ~720 candles
  D1: 365,  // 365 days of daily = ~365 candles
  W1: 730,  // 2 years of weekly = ~104 candles
};

/** Minimum candles needed to compute reliable indicators */
const MIN_CANDLES = 50;

/** Strategy → Primary TF + Confirmation TFs */
const STRATEGY_TF_CONFIG: Record<string, { primary: string; confirmation: string[] }> = {
  [StrategyType.SCALPING]:           { primary: 'M5',  confirmation: ['M15', 'H1'] },
  [StrategyType.SWING]:              { primary: 'H4',  confirmation: ['D1'] },
  [StrategyType.MOMENTUM_BREAKOUT]:  { primary: 'M15', confirmation: ['H1', 'H4'] },
  [StrategyType.MEAN_REVERSION]:     { primary: 'M15', confirmation: ['H1'] },
  [StrategyType.GRID]:               { primary: 'H1',  confirmation: ['H4'] },
  [StrategyType.DCA]:                { primary: 'H4',  confirmation: ['D1'] },
  [StrategyType.VWAP_RSI]:           { primary: 'M15', confirmation: ['H1'] },
  [StrategyType.AUTO]:               { primary: 'H1',  confirmation: ['H4', 'D1'] },
};

/** Weights for alignment scoring — higher TFs have more weight */
const TF_WEIGHTS: Record<string, number> = {
  M1: 0.5,
  M5: 1.0,
  M15: 1.5,
  M30: 1.5,
  H1: 2.0,
  H4: 2.5,
  D1: 3.0,
  W1: 3.5,
};

@Injectable()
export class MultiTimeframeAnalysisService {
  private readonly logger = new Logger(MultiTimeframeAnalysisService.name);
  private readonly CACHE_TTL = 60_000; // 1 minute — longer than market-analyzer (30s) because higher TFs change slower

  constructor(
    private readonly exchangeService: ExchangeService,
    @Optional() private readonly redis: RedisService,
  ) {
    this.logger.log('📊 Multi-Timeframe Analysis Service initialized');
  }

  // ── Public API ──

  /**
   * Get the primary and confirmation timeframes for a strategy
   */
  getStrategyTimeframes(strategyType: StrategyType | string): { primary: string; confirmation: string[] } {
    return STRATEGY_TF_CONFIG[strategyType] || STRATEGY_TF_CONFIG[StrategyType.AUTO]!;
  }

  /**
   * Analyze all timeframes for a symbol + strategy combination
   * Returns the HigherTimeframeContext to be attached to MarketAnalysis
   */
  async analyze(symbol: string, strategyType: StrategyType | string): Promise<HigherTimeframeContext | null> {
    try {
      // Check cache first
      const cacheKey = `mtf:${symbol}:${strategyType}`;
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        } catch { /* cache miss — proceed */ }
      }

      const config = this.getStrategyTimeframes(strategyType);
      const allTimeframes = [config.primary, ...config.confirmation];

      // Fetch kline data for ALL timeframes in parallel
      const tfResults = await Promise.allSettled(
        allTimeframes.map(tf => this._analyzeTimeframe(symbol, tf))
      );

      const higherTimeframes: HigherTimeframeData[] = [];

      for (let i = 0; i < allTimeframes.length; i++) {
        const result = tfResults[i];
        const tf = allTimeframes[i];

        if (result.status === 'fulfilled' && result.value) {
          higherTimeframes.push(result.value);
        } else {
          this.logger.warn(
            `📊 MTF: Could not analyze ${tf} for ${symbol}: ` +
            (result.status === 'rejected' ? result.reason?.message || 'unknown' : 'insufficient data')
          );
        }
      }

      // If we couldn't get ANY higher timeframe data, return null
      if (higherTimeframes.length === 0) {
        this.logger.warn(`📊 MTF: No timeframe data available for ${symbol} — skipping MTF analysis`);
        return null;
      }

      // Compute alignment
      const { mtfAlignment, mtfAlignmentScore } = this._computeAlignment(higherTimeframes);

      const context: HigherTimeframeContext = {
        primaryTimeframe: config.primary,
        higherTimeframes,
        mtfAlignment,
        mtfAlignmentScore,
      };

      // Cache the result
      if (this.redis) {
        try {
          await this.redis.set(cacheKey, JSON.stringify(context), this.CACHE_TTL);
        } catch { /* non-critical */ }
      }

      return context;
    } catch (error: any) {
      this.logger.error(`📊 MTF analysis failed for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Convenience: analyze a single timeframe and return raw indicator data
   * Used by MarketAnalyzerService.analyzeForTimeframe()
   */
  async analyzeSingleTimeframe(
    symbol: string,
    timeframe: string,
  ): Promise<{
    rsi: number;
    macd: MACDResult;
    ema: EMAResult;
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    trendStrength: number;
    price: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    candles: number;
  } | null> {
    const interval = TF_INTERVAL_MAP[timeframe];
    if (!interval) {
      this.logger.warn(`📊 Unknown timeframe: ${timeframe}`);
      return null;
    }

    const days = TF_HISTORY_DAYS[timeframe] || 60;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const candles = await this.exchangeService.getHistoricalData(symbol, interval, startDate, endDate);
    if (!candles || candles.length < MIN_CANDLES) {
      return null;
    }

    const closes = candles.map((c: any) => c.close || 0);
    const highs = candles.map((c: any) => c.high || 0);
    const lows = candles.map((c: any) => c.low || 0);
    const volumes = candles.map((c: any) => c.volume || 0);

    const rsi = calcRsiLatest(closes, 14);
    const macd = calcMacdScalar(closes);
    const ema: EMAResult = {
      ema9: calcEmaLatest(closes, 9),
      ema21: calcEmaLatest(closes, 21),
      ema50: calcEmaLatest(closes, 50),
      ema200: closes.length >= 200 ? calcEmaLatest(closes, 200) : undefined,
    };

    const trend = this._detectTrend(ema, closes);
    const trendStrength = this._calculateTrendStrength(ema, closes);

    return {
      rsi,
      macd,
      ema,
      trend,
      trendStrength,
      price: closes[closes.length - 1] || 0,
      high24h: highs[highs.length - 1] || 0,
      low24h: lows[lows.length - 1] || 0,
      volume24h: volumes[volumes.length - 1] || 0,
      candles: candles.length,
    };
  }

  // ── Private Methods ──

  /**
   * Analyze a single timeframe and return HigherTimeframeData
   */
  private async _analyzeTimeframe(symbol: string, timeframe: string): Promise<HigherTimeframeData | null> {
    const interval = TF_INTERVAL_MAP[timeframe];
    if (!interval) return null;

    const days = TF_HISTORY_DAYS[timeframe] || 60;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const candles = await this.exchangeService.getHistoricalData(symbol, interval, startDate, endDate);
    if (!candles || candles.length < MIN_CANDLES) {
      this.logger.debug(`📊 MTF: ${timeframe} for ${symbol} — only ${candles?.length ?? 0} candles (need ${MIN_CANDLES})`);
      return null;
    }

    const closes = candles.map((c: any) => c.close || 0);
    const rsi = calcRsiLatest(closes, 14);
    const macd = calcMacdScalar(closes);
    const ema: EMAResult = {
      ema9: calcEmaLatest(closes, 9),
      ema21: calcEmaLatest(closes, 21),
      ema50: calcEmaLatest(closes, 50),
      ema200: closes.length >= 200 ? calcEmaLatest(closes, 200) : undefined,
    };

    const trend = this._detectTrend(ema, closes);
    const trendStrength = this._calculateTrendStrength(ema, closes);

    let macdSignal: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
    if (macd.crossover === 'BULLISH' || macd.histogram > 0) macdSignal = 'BULLISH';
    else if (macd.crossover === 'BEARISH' || macd.histogram < 0) macdSignal = 'BEARISH';

    let emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' = 'MIXED';
    if (ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50) emaAlignment = 'BULLISH';
    else if (ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50) emaAlignment = 'BEARISH';

    return {
      timeframe,
      trend,
      rsi,
      macdSignal,
      emaAlignment,
      trendStrength,
    };
  }

  /**
   * Compute multi-timeframe alignment
   *
   * Logic:
   * - Score each TF as bullish (+1) or bearish (-1) based on trend + MACD + EMA alignment
   * - Weight by TF importance (higher TF = more weight)
   * - Determine overall alignment from weighted score
   */
  private _computeAlignment(
    timeframes: HigherTimeframeData[],
  ): { mtfAlignment: HigherTimeframeContext['mtfAlignment']; mtfAlignmentScore: number } {
    let weightedBullishScore = 0;
    let totalWeight = 0;

    for (const tf of timeframes) {
      const weight = TF_WEIGHTS[tf.timeframe] || 1.0;
      totalWeight += weight;

      // Directional score: each indicator contributes
      let directionScore = 0;

      // Trend (40% weight within each TF)
      if (tf.trend === 'BULLISH') directionScore += 0.4;
      else if (tf.trend === 'BEARISH') directionScore -= 0.4;

      // EMA alignment (30% weight)
      if (tf.emaAlignment === 'BULLISH') directionScore += 0.3;
      else if (tf.emaAlignment === 'BEARISH') directionScore -= 0.3;

      // MACD (30% weight)
      if (tf.macdSignal === 'BULLISH') directionScore += 0.3;
      else if (tf.macdSignal === 'BEARISH') directionScore -= 0.3;

      weightedBullishScore += directionScore * weight;
    }

    // Normalize to -1..+1 range
    const normalizedScore = totalWeight > 0 ? weightedBullishScore / totalWeight : 0;

    // Convert to 0-100 scale (50 = neutral)
    const mtfAlignmentScore = Math.round((normalizedScore + 1) * 50);

    // Determine alignment label
    let mtfAlignment: HigherTimeframeContext['mtfAlignment'];

    if (normalizedScore > 0.4) {
      mtfAlignment = 'ALIGNED_BULLISH';
    } else if (normalizedScore < -0.4) {
      mtfAlignment = 'ALIGNED_BEARISH';
    } else if (Math.abs(normalizedScore) <= 0.15) {
      mtfAlignment = 'NEUTRAL';
    } else {
      mtfAlignment = 'MIXED';
    }

    return { mtfAlignment, mtfAlignmentScore };
  }

  // ── Indicator Helpers (same logic as MarketAnalyzerService) ──

  private _detectTrend(ema: EMAResult, closes: number[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    const { ema9, ema21, ema50 } = ema;
    const currentPrice = closes[closes.length - 1] || 0;

    if (ema9 > ema21 && ema21 > ema50 && currentPrice > ema9) return 'BULLISH';
    if (ema9 < ema21 && ema21 < ema50 && currentPrice < ema9) return 'BEARISH';
    if (ema9 > ema21 && currentPrice > ema21) return 'BULLISH';
    if (ema9 < ema21 && currentPrice < ema21) return 'BEARISH';
    return 'SIDEWAYS';
  }

  private _calculateTrendStrength(ema: EMAResult, closes: number[]): number {
    const { ema9, ema21, ema50 } = ema;
    let strength = 0;

    if (ema9 > ema21 && ema21 > ema50) strength += 40;
    else if (ema9 < ema21 && ema21 < ema50) strength += 40;
    else if (ema9 > ema21) strength += 20;
    else if (ema9 < ema21) strength += 20;

    const price = closes[closes.length - 1] || 0;
    if (price > ema9 && price > ema21) strength += 20;
    else if (price < ema9 && price < ema21) strength += 20;

    if (closes.length >= 10) {
      const recentChange = (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100;
      strength += Math.min(40, Math.abs(recentChange) * 8);
    }

    return Math.min(100, Math.round(strength));
  }
}
