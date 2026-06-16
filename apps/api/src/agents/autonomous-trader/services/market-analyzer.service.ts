// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Market Analyzer Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketAnalysis, MACDResult, BollingerBandsResult, EMAResult, StrategySignal, StrategyType } from '../types/agent.types';
import { calcRsiLatest, calcMacdScalar, calcBollingerBandsScalar, calcEmaLatest, calcAtrLatest } from '../../../common/utils/indicator-algorithms.util';
import { MultiTimeframeAnalysisService } from './multi-timeframe-analysis.service';

/**
 * MarketAnalyzerService — Real-time market analysis engine
 *
 * Fetches live market data and computes technical indicators:
 * - RSI (Relative Strength Index)
 * - MACD (Moving Average Convergence Divergence)
 * - Bollinger Bands
 * - EMA (Exponential Moving Averages)
 * - ATR (Average True Range)
 * - Volatility assessment
 * - Trend detection
 * - AI-enhanced signal generation
 *
 * V-PHASE3: Now supports strategy-specific timeframes:
 * - analyze(symbol) — backward-compatible, uses 1h (default)
 * - analyzeForStrategy(symbol, strategyType) — uses the strategy's primary TF + MTF context
 * - analyzeForTimeframe(symbol, timeframe) — uses a specific TF
 *
 * All results are cached in Redis for 30 seconds to avoid
 * redundant API calls during the agent's evaluation cycle.
 */
@Injectable()
export class MarketAnalyzerService {
  private readonly logger = new Logger(MarketAnalyzerService.name);
  private readonly CACHE_TTL = 30000; // 30 seconds

  /** Maps our timeframe labels to ExchangeService interval strings */
  private static readonly TF_INTERVAL_MAP: Record<string, string> = {
    M1: '1min', M5: '5min', M15: '15min', M30: '30min',
    H1: '1h', H4: '4h', D1: '1day', W1: '1week',
  };

  /** How many days of history to fetch per timeframe */
  private static readonly TF_HISTORY_DAYS: Record<string, number> = {
    M1: 3, M5: 10, M15: 20, M30: 30, H1: 60, H4: 120, D1: 365, W1: 730,
  };

  constructor(
    private readonly exchangeService: ExchangeService,
    @Optional() private readonly redis: RedisService,
    @Optional() private readonly mtfService: MultiTimeframeAnalysisService,
  ) {
    this.logger.log(`🔍 Market Analyzer initialized (redis=${!!this.redis}, mtf=${!!this.mtfService})`);
  }

  /**
   * Perform full market analysis for a symbol (backward-compatible, 1h default)
   */
  async analyze(symbol: string): Promise<MarketAnalysis | null> {
    return this.analyzeForTimeframe(symbol, 'H1');
  }

  /**
   * V-PHASE3: Analyze market data using a strategy's primary timeframe + MTF context
   *
   * This is the PREFERRED method for strategy-based analysis:
   * - SCALPING → M5 candles + M15/H1 confirmation
   * - SWING → H4 candles + D1 confirmation
   * - etc.
   */
  async analyzeForStrategy(symbol: string, strategyType: StrategyType | string): Promise<MarketAnalysis | null> {
    const config = this.mtfService?.getStrategyTimeframes(strategyType);
    const primaryTf = config?.primary || 'H1';

    // Fetch primary timeframe analysis
    const analysis = await this.analyzeForTimeframe(symbol, primaryTf);
    if (!analysis) return null;

    // Attach MTF context (fetched in parallel with primary analysis if service available)
    if (this.mtfService) {
      try {
        const mtfContext = await this.mtfService.analyze(symbol, strategyType);
        analysis.mtfContext = mtfContext;

        if (mtfContext) {
          this.logger.debug(
            `🔍 MTF for ${symbol} (${strategyType}): ` +
            `primary=${mtfContext.primaryTimeframe}, ` +
            `alignment=${mtfContext.mtfAlignment}, ` +
            `score=${mtfContext.mtfAlignmentScore}, ` +
            `higherTFs=[${mtfContext.higherTimeframes.map(h => h.timeframe + ':' + h.trend).join(', ')}]`
          );
        }
      } catch (mtfErr: any) {
        this.logger.warn(`🔍 MTF analysis failed for ${symbol}: ${mtfErr.message} — proceeding without MTF context`);
        analysis.mtfContext = null;
      }
    }

    return analysis;
  }

  /**
   * V-PHASE3: Analyze market data for a specific timeframe
   *
   * This replaces the hardcoded '1h' interval in the original analyze() method.
   * Now strategies can get indicators computed on their native timeframe:
   * - Scalping: M5 (5-minute candles)
   * - Swing: H4 (4-hour candles)
   */
  async analyzeForTimeframe(symbol: string, timeframe: string): Promise<MarketAnalysis | null> {
    try {
      // Check cache first (keyed by timeframe now)
      const cacheKey = `agent:market:${symbol}:${timeframe}`;
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        } catch (redisErr: any) {
          this.logger.warn(`Redis cache read failed for ${symbol}:${timeframe}: ${redisErr.message} — proceeding without cache`);
        }
      }

      // Fetch current quote
      const quote = await this.exchangeService.getQuote(symbol);
      if (!quote || !quote.price) {
        this.logger.warn(`No quote data for ${symbol}`);
        return null;
      }

      // V-PHASE3: Fetch historical data for the SPECIFIED timeframe (was hardcoded to '1h')
      const interval = MarketAnalyzerService.TF_INTERVAL_MAP[timeframe] || '1h';
      const historyDays = MarketAnalyzerService.TF_HISTORY_DAYS[timeframe] || 60;

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - historyDays * 24 * 60 * 60 * 1000);
      const candles = await this.exchangeService.getHistoricalData(symbol, interval, startDate, endDate);
      if (!candles || candles.length < 50) {
        this.logger.warn(`Insufficient historical data for ${symbol}:${timeframe} (${candles?.length ?? 0} candles) — refusing to trade on fabricated data`);
        return null;
      }

      // Parse candle data (UnifiedCandle format)
      const closes = candles.map((c: any) => c.close || 0);
      const highs = candles.map((c: any) => c.high || 0);
      const lows = candles.map((c: any) => c.low || 0);
      const volumes = candles.map((c: any) => c.volume || 0);

      const rsi = this._calculateRSI(closes);
      const macd = this._calculateMACD(closes);
      const bollingerBands = this._calculateBollingerBands(closes);
      const ema = this._calculateEMA(closes);
      const atr = this._calculateATR(highs, lows, closes);

      // Determine volatility
      const volatility = this._assessVolatility(atr, quote.price, bollingerBands);

      // Determine trend
      const trend = this._detectTrend(ema, closes);

      // Trend strength
      const trendStrength = this._calculateTrendStrength(ema, closes);

      // AI signal placeholder (will be enhanced by signal evaluator)
      const aiConfidence = this._estimateAIConfidence(rsi, macd, trend, volatility);
      const aiSignal = this._estimateAISignal(rsi, macd, trend);
      const aiReasoning = this._generateAIReasoning(rsi, macd, trend, volatility);

      const analysis: MarketAnalysis = {
        symbol,
        timestamp: new Date(),
        price: quote.price,
        change24h: quote.change || 0,
        changePercent24h: quote.changePercent || 0,
        volume24h: quote.volume || volumes[volumes.length - 1] || 0,
        high24h: highs[highs.length - 1] || quote.price,
        low24h: lows[lows.length - 1] || quote.price,
        rsi,
        macd,
        bollingerBands,
        ema,
        atr,
        volatility,
        trend,
        trendStrength,
        aiConfidence,
        aiSignal,
        aiReasoning,
        mtfContext: null, // Will be populated by analyzeForStrategy() if MTF service is available
      };

      // Cache the result (best-effort — don't fail if Redis is unavailable)
      if (this.redis) {
        try {
          await this.redis.set(cacheKey, JSON.stringify(analysis), this.CACHE_TTL);
        } catch (redisErr: any) {
          this.logger.warn(`Redis cache write failed for ${symbol}:${timeframe}: ${redisErr.message} — analysis will not be cached`);
        }
      }

      return analysis;
    } catch (error: any) {
      this.logger.error(`Market analysis failed for ${symbol}:${timeframe}: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze multiple symbols in parallel (backward-compatible, 1h default)
   */
  async analyzeMultiple(symbols: string[]): Promise<Map<string, MarketAnalysis>> {
    const results = new Map<string, MarketAnalysis>();

    const promises = symbols.map(async (symbol) => {
      const analysis = await this.analyze(symbol);
      if (analysis) {
        results.set(symbol, analysis);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * V-PHASE3: Analyze multiple symbols for a specific strategy (with MTF context)
   */
  async analyzeMultipleForStrategy(symbols: string[], strategyType: StrategyType | string): Promise<Map<string, MarketAnalysis>> {
    const results = new Map<string, MarketAnalysis>();

    const promises = symbols.map(async (symbol) => {
      const analysis = await this.analyzeForStrategy(symbol, strategyType);
      if (analysis) {
        results.set(symbol, analysis);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  // ── Technical Indicators ──

  /**
   * RSI (Relative Strength Index) — 14-period using canonical Wilder's smoothing
   * Values > 70: Overbought, < 30: Oversold
   * Delegates to shared indicator utility for consistent results across all services.
   */
  private _calculateRSI(closes: number[], period: number = 14): number {
    return calcRsiLatest(closes, period);
  }

  /**
   * MACD (12, 26, 9) using canonical algorithms with proper EMA alignment
   * Delegates to shared indicator utility for consistent results across all services.
   */
  private _calculateMACD(closes: number[]): MACDResult {
    return calcMacdScalar(closes);
  }

  /**
   * Bollinger Bands (20, 2) using canonical algorithms with standard deviation from SMA
   * Delegates to shared indicator utility for consistent results across all services.
   */
  private _calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): BollingerBandsResult {
    return calcBollingerBandsScalar(closes, period, stdDev);
  }

  /**
   * EMA (9, 21, 50, 200) using canonical EMA algorithm with SMA seed
   * Delegates to shared indicator utility for consistent results across all services.
   */
  private _calculateEMA(closes: number[]): EMAResult {
    return {
      ema9: calcEmaLatest(closes, 9),
      ema21: calcEmaLatest(closes, 21),
      ema50: calcEmaLatest(closes, 50),
      ema200: closes.length >= 200 ? calcEmaLatest(closes, 200) : undefined,
    };
  }

  /**
   * ATR (Average True Range) — 14-period using canonical Wilder's smoothing
   * FIX: Previously used simple average — now uses Wilder's smoothing for correctness.
   * Delegates to shared indicator utility for consistent results across all services.
   */
  private _calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    return calcAtrLatest(highs, lows, closes, period);
  }

  // ── Helper Functions ──

  private _assessVolatility(
    atr: number,
    price: number,
    bb: BollingerBandsResult,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    if (atr <= 0 || price <= 0) return 'MEDIUM';

    const atrPercent = (atr / price) * 100;

    if (atrPercent > 5 || bb.bandwidth > 0.08) return 'EXTREME';
    if (atrPercent > 3 || bb.bandwidth > 0.06) return 'HIGH';
    if (atrPercent > 1.5 || bb.bandwidth > 0.03) return 'MEDIUM';
    return 'LOW';
  }

  private _detectTrend(ema: EMAResult, closes: number[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    const { ema9, ema21, ema50 } = ema;
    const currentPrice = closes[closes.length - 1] || 0;

    // Strong bullish: EMA9 > EMA21 > EMA50 and price above all
    if (ema9 > ema21 && ema21 > ema50 && currentPrice > ema9) {
      return 'BULLISH';
    }

    // Strong bearish: EMA9 < EMA21 < EMA50 and price below all
    if (ema9 < ema21 && ema21 < ema50 && currentPrice < ema9) {
      return 'BEARISH';
    }

    // Mild bullish/bearish
    if (ema9 > ema21 && currentPrice > ema21) return 'BULLISH';
    if (ema9 < ema21 && currentPrice < ema21) return 'BEARISH';

    return 'SIDEWAYS';
  }

  private _calculateTrendStrength(ema: EMAResult, closes: number[]): number {
    const { ema9, ema21, ema50 } = ema;
    let strength = 0;

    // EMA alignment
    if (ema9 > ema21 && ema21 > ema50) strength += 40;
    else if (ema9 < ema21 && ema21 < ema50) strength += 40;
    else if (ema9 > ema21) strength += 20;
    else if (ema9 < ema21) strength += 20;

    // Price vs EMAs
    const price = closes[closes.length - 1] || 0;
    if (price > ema9 && price > ema21) strength += 20;
    else if (price < ema9 && price < ema21) strength += 20;

    // Recent price momentum
    if (closes.length >= 10) {
      const recentChange = (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100;
      strength += Math.min(40, Math.abs(recentChange) * 8);
    }

    return Math.min(100, Math.round(strength));
  }

  private _estimateAIConfidence(rsi: number, macd: MACDResult, trend: string, volatility: string): number {
    let confidence = 40; // Base

    // RSI in healthy range
    if (rsi > 30 && rsi < 70) confidence += 15;
    else if (rsi > 20 && rsi < 80) confidence += 5;
    else confidence -= 10;

    // MACD confirmation
    if (macd.crossover !== 'NONE') confidence += 15;
    if (Math.abs(macd.histogram) > 0) confidence += 5;

    // Trend clarity
    if (trend !== 'SIDEWAYS') confidence += 10;

    // Volatility penalty
    if (volatility === 'EXTREME') confidence -= 20;
    if (volatility === 'HIGH') confidence -= 10;

    return Math.max(0, Math.min(100, confidence));
  }

  private _estimateAISignal(rsi: number, macd: MACDResult, trend: string): StrategySignal {
    let score = 0;

    if (rsi < 30) score += 2;
    else if (rsi < 40) score += 1;
    else if (rsi > 70) score -= 2;
    else if (rsi > 60) score -= 1;

    if (macd.crossover === 'BULLISH') score += 2;
    if (macd.crossover === 'BEARISH') score -= 2;
    if (macd.histogram > 0) score += 1;
    if (macd.histogram < 0) score -= 1;

    if (trend === 'BULLISH') score += 1;
    if (trend === 'BEARISH') score -= 1;

    if (score >= 3) return StrategySignal.STRONG_BUY;
    if (score >= 1) return StrategySignal.BUY;
    if (score <= -3) return StrategySignal.STRONG_SELL;
    if (score <= -1) return StrategySignal.SELL;
    return StrategySignal.NEUTRAL;
  }

  private _generateAIReasoning(rsi: number, macd: MACDResult, trend: string, volatility: string): string {
    const parts: string[] = [];

    if (trend === 'BULLISH') parts.push('اتجاه صعودي');
    else if (trend === 'BEARISH') parts.push('اتجاه هبوطي');
    else parts.push('سوق جانبي');

    if (rsi < 30) parts.push('تشبع بيعي');
    else if (rsi > 70) parts.push('تشبع شرائي');

    if (macd.crossover === 'BULLISH') parts.push('إشارة MACD صعودية');
    else if (macd.crossover === 'BEARISH') parts.push('إشارة MACD هبوطية');

    if (volatility === 'EXTREME') parts.push('تحذير: تقلب شديد');
    else if (volatility === 'HIGH') parts.push('تقلب مرتفع');

    return parts.join(' — ');
  }

  // V-PHASE2: _buildMinimalAnalysis() REMOVED — it was dead code that fabricated
  // indicators from minimal data (estimating RSI from 24h change, fabricating MACD
  // values, creating synthetic Bollinger Bands). Strategies would then generate
  // REAL trades based on this MADE-UP data. This was extremely dangerous.
  // If insufficient real data is available, analyze() now returns null (set in Phase 1).
}
