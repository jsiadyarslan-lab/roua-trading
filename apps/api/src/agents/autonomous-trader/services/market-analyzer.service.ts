// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Market Analyzer Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketAnalysis, MACDResult, BollingerBandsResult, EMAResult, StrategySignal } from '../types/agent.types';
import { calcRsiLatest, calcMacdScalar, calcBollingerBandsScalar, calcEmaLatest, calcAtrLatest } from '../../../common/utils/indicator-algorithms.util';

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
 * All results are cached in Redis for 30 seconds to avoid
 * redundant API calls during the agent's evaluation cycle.
 */
@Injectable()
export class MarketAnalyzerService {
  private readonly logger = new Logger(MarketAnalyzerService.name);
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(
    private readonly exchangeService: ExchangeService,
    @Optional() private readonly redis: RedisService,
  ) {
    this.logger.log(`🔍 Market Analyzer initialized (redis=${!!this.redis})`);
  }

  /**
   * Perform full market analysis for a symbol
   */
  async analyze(symbol: string): Promise<MarketAnalysis | null> {
    try {
      // Check cache first (skip if Redis is unavailable)
      const cacheKey = `agent:market:${symbol}`;
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        } catch (redisErr: any) {
          this.logger.warn(`Redis cache read failed for ${symbol}: ${redisErr.message} — proceeding without cache`);
        }
      }

      // Fetch current quote
      const quote = await this.exchangeService.getQuote(symbol);
      if (!quote || !quote.price) {
        this.logger.warn(`No quote data for ${symbol}`);
        return null;
      }

      // Fetch historical data for indicators (60+ days for MACD/EMA200)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days
      const candles = await this.exchangeService.getHistoricalData(symbol, '1h', startDate, endDate);
      if (!candles || candles.length < 50) {
        this.logger.warn(`Insufficient historical data for ${symbol} (${candles?.length ?? 0} candles) — V-PHASE1: refusing to trade on fabricated data`);
        // V-PHASE1: Return null instead of fabricating indicators from minimal data.
        // Previously _buildMinimalAnalysis() estimated RSI from 24h change, fabricated
        // MACD values, and created synthetic Bollinger Bands. Strategies would then
        // generate REAL trades based on this MADE-UP data. This is extremely dangerous.
        // Now: if we don't have enough real data, we simply don't trade this symbol.
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
      };

      // Cache the result (best-effort — don't fail if Redis is unavailable)
      if (this.redis) {
        try {
          await this.redis.set(cacheKey, JSON.stringify(analysis), this.CACHE_TTL);
        } catch (redisErr: any) {
          this.logger.warn(`Redis cache write failed for ${symbol}: ${redisErr.message} — analysis will not be cached`);
        }
      }

      return analysis;
    } catch (error: any) {
      this.logger.error(`Market analysis failed for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze multiple symbols in parallel
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

  private _buildMinimalAnalysis(symbol: string, quote: any): MarketAnalysis {
    // CRITICAL FIX: Produce usable ATR and indicator values even with limited data.
    // Without a valid ATR, the strategy cannot calculate SL/TP levels,
    // and the risk calculator will reject all trades (riskRewardRatio = 0).
    // Use a percentage-based ATR estimate: ~2% for crypto, ~1% for stocks/forex.
    const isCrypto = symbol.includes('USDT') || symbol.includes('BTC') || symbol.includes('ETH');
    const estimatedAtr = isCrypto
      ? quote.price * 0.02   // 2% ATR for crypto (typical daily move)
      : quote.price * 0.01;  // 1% ATR for stocks/forex

    // Generate more actionable indicator values from quote data
    // CRITICAL: Must produce RSI < 40 or > 60 and BB percentB < 0.3 or > 0.7
    // so the scalping strategy can actually generate signals with limited data.
    const changePercent = Math.abs(quote.changePercent || 0);
    const changeDir = (quote.changePercent || 0) > 0 ? 1 : (quote.changePercent || 0) < 0 ? -1 : 0;

    // Amplified RSI: push values toward extremes based on price movement
    // This ensures the scalping strategy can trigger on meaningful moves
    let estimatedRsi = 50;
    if (changeDir > 0) {
      estimatedRsi = Math.min(70, 50 + Math.abs(quote.changePercent || 0) * 5);
    } else if (changeDir < 0) {
      estimatedRsi = Math.max(30, 50 - Math.abs(quote.changePercent || 0) * 5);
    }

    // Amplified Bollinger percentB: push toward extremes for signal generation
    let estimatedPercentB = 0.5;
    if (changeDir > 0) {
      estimatedPercentB = Math.min(0.85, 0.5 + Math.abs(quote.changePercent || 0) * 0.08);
    } else if (changeDir < 0) {
      estimatedPercentB = Math.max(0.15, 0.5 - Math.abs(quote.changePercent || 0) * 0.08);
    }

    const histogramDirection = changeDir;

    return {
      symbol,
      timestamp: new Date(),
      price: quote.price,
      change24h: quote.change || 0,
      changePercent24h: quote.changePercent || 0,
      volume24h: quote.volume || 0,
      high24h: quote.high || quote.price * 1.01,
      low24h: quote.low || quote.price * 0.99,
      rsi: estimatedRsi,
      macd: {
        macd: histogramDirection * quote.price * 0.001,
        signal: 0,
        histogram: histogramDirection * quote.price * 0.0005,
        crossover: histogramDirection > 0 ? 'BULLISH' : histogramDirection < 0 ? 'BEARISH' : 'NONE',
      },
      bollingerBands: {
        upper: quote.price * 1.02,
        middle: quote.price,
        lower: quote.price * 0.98,
        bandwidth: 0.04,
        percentB: estimatedPercentB,
      },
      ema: {
        ema9: quote.price * (1 + (quote.changePercent || 0) * 0.002),
        ema21: quote.price,
        ema50: quote.price,
      },
      atr: estimatedAtr,
      volatility: changePercent > 3 ? 'HIGH' : changePercent > 1 ? 'MEDIUM' : 'LOW',
      trend: (quote.changePercent || 0) > 1 ? 'BULLISH' : (quote.changePercent || 0) < -1 ? 'BEARISH' : 'SIDEWAYS',
      trendStrength: Math.min(60, Math.abs(quote.changePercent || 0) * 15),
      aiConfidence: 50,
      aiSignal: (quote.changePercent || 0) > 1.5 ? StrategySignal.BUY
        : (quote.changePercent || 0) < -1.5 ? StrategySignal.SELL
        : StrategySignal.NEUTRAL,
      aiReasoning: 'تحليل مبسط — بيانات غير كافية للتحليل الكامل',
    };
  }
}
