// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Market Regime Detection Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "كشف وضع السوق" — هل السوق صاعد؟ هابط؟ عرضي؟
// إشارة RSI=70 في سوق صاعد ≠ RSI=70 في سوق هابط
//
// V185: قبل أن يتكلم أي عضو — يجب أن يعرف وضع السوق
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataService } from '../services/market-data.service';

export type RegimeType = 'BULL' | 'BEAR' | 'RANGE' | 'VOLATILE';

export interface RegimeResult {
  regime: RegimeType;
  confidence: number;       // 0-100
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
  trendStrength: number;    // 0-100
  volatilityIndex: number;  // 0-100
  sma50: number;
  sma200: number;
  adx: number;
  atr: number;
  rsi: number;
  recommendedAction: string;
  rrAdjustment: number;     // R:R multiplier
  regimeStartedAt?: Date;
  previousRegime?: string;
}

@Injectable()
export class MarketRegimeService {
  private readonly logger = new Logger(MarketRegimeService.name);
  private readonly REDIS_REGIME_PREFIX = 'market-regime:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly marketData: MarketDataService,
  ) {
    this.logger.log('📊 Market Regime Detection initialized — ما وضع السوق؟');
  }

  /**
   * Detect the current market regime for a symbol
   * Uses SMA50/200 crossover + ADX + ATR + RSI
   */
  async detectRegime(symbol: string): Promise<RegimeResult> {
    // Check cache first (5 min TTL)
    const cacheKey = `${this.REDIS_REGIME_PREFIX}${symbol}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* continue */ }

    // Fetch market data
    const quickData = await this.marketData.fetchQuickMarketData(symbol);
    const price = quickData.price;
    const rsi = quickData.rsi || 50;

    // V-PHASE2 FIX: Calculate indicators from REAL klines only.
    // If no real klines available, return a safe default regime instead of
    // fabricating SMA/ADX/ATR from synthetic data.
    let sma50 = price; // defaults
    let sma200 = price;
    let adx = 25;
    let atr = price * 0.02; // 2% default ATR
    let hasRealData = false;

    try {
      const klines = await this._fetchKlines(symbol);
      if (klines.length >= 200) {
        const closes = klines.map(k => k.close);
        sma50 = this._calcSMA(closes, 50);
        sma200 = this._calcSMA(closes, 200);
        adx = this._calcADX(klines);
        atr = this._calcATR(klines);
        hasRealData = true;
      } else if (klines.length >= 50) {
        const closes = klines.map(k => k.close);
        sma50 = this._calcSMA(closes, 50);
        sma200 = sma50; // Not enough data, assume equal
        adx = this._estimateADX(klines);
        atr = this._calcATR(klines);
        hasRealData = true;
      } else if (klines.length > 0) {
        // Some data but not enough for reliable indicators
        const closes = klines.map(k => k.close);
        if (closes.length >= 14) {
          atr = this._calcATR(klines);
          adx = this._estimateADX(klines);
        }
        hasRealData = false;
      }
    } catch (error) {
      this.logger.warn(`Failed to calculate indicators for ${symbol}: ${error.message}`);
    }

    // V-PHASE2: If no real klines available, return safe default regime
    // instead of computing regime on fabricated indicator values
    if (!hasRealData) {
      const safeResult: RegimeResult = {
        regime: 'RANGE',
        confidence: 0,
        trendDirection: 'SIDEWAYS',
        trendStrength: 0,
        volatilityIndex: 50,
        sma50: price,
        sma200: price,
        adx: 0,
        atr: price * 0.02,
        rsi,
        recommendedAction: 'NEUTRAL',
        rrAdjustment: 0.7,
        regimeStartedAt: new Date(),
      };

      // Cache the safe result
      try {
        await this.redis.set(cacheKey, JSON.stringify(safeResult), 300 * 1000);
      } catch { /* non-critical */ }

      return safeResult;
    }

    // ── Regime Detection Logic ──

    const smaRelation = sma50 > sma200 ? 'ABOVE' : sma50 < sma200 ? 'BELOW' : 'EQUAL';
    const adxStrong = adx > 25;
    const priceVsSMA50 = price > sma50 ? 'ABOVE' : price < sma50 ? 'BELOW' : 'EQUAL';
    const priceVsSMA200 = price > sma200 ? 'ABOVE' : price < sma200 ? 'BELOW' : 'EQUAL';

    // Volatility index (normalized ATR as % of price, scaled 0-100)
    const volatilityIndex = Math.min(100, Math.max(0,
      (atr / price) * 100 * 50, // Scale: 2% ATR → 100, 1% → 50, etc.
    ));

    let regime: RegimeType;
    let trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
    let trendStrength: number;
    let confidence: number;
    let recommendedAction: string;
    let rrAdjustment: number;

    // ── Classification ──

    if (volatilityIndex > 70) {
      // High volatility = VOLATILE regime regardless of trend
      regime = 'VOLATILE';
      trendDirection = 'SIDEWAYS';
      trendStrength = 0;
      confidence = Math.min(90, 50 + volatilityIndex * 0.4);
      recommendedAction = 'NO_TRADE';
      rrAdjustment = 0.8; // Reduce R:R in volatile markets
    } else if (smaRelation === 'ABOVE' && adxStrong && priceVsSMA50 === 'ABOVE') {
      // Strong uptrend: SMA50 > SMA200, ADX > 25, price above SMA50
      regime = 'BULL';
      trendDirection = 'UP';
      trendStrength = Math.min(100, adx * 2);
      confidence = Math.min(95, 60 + adx);
      recommendedAction = rsi < 30 ? 'AGGRESSIVE_BUY' : rsi < 50 ? 'BUY' : rsi < 70 ? 'CAUTIOUS_BUY' : 'NO_TRADE';
      rrAdjustment = rsi < 50 ? 1.3 : 1.0; // Better R:R when entering early in bull trend
    } else if (smaRelation === 'BELOW' && adxStrong && priceVsSMA50 === 'BELOW') {
      // Strong downtrend: SMA50 < SMA200, ADX > 25, price below SMA50
      regime = 'BEAR';
      trendDirection = 'DOWN';
      trendStrength = Math.min(100, adx * 2);
      confidence = Math.min(95, 60 + adx);
      recommendedAction = rsi > 70 ? 'AGGRESSIVE_SELL' : rsi > 50 ? 'SELL' : rsi > 30 ? 'CAUTIOUS_SELL' : 'NO_TRADE';
      rrAdjustment = rsi > 50 ? 1.3 : 1.0;
    } else if (smaRelation === 'ABOVE' && !adxStrong) {
      // Weak uptrend: SMA crossover bullish but ADX weak
      regime = 'RANGE';
      trendDirection = 'UP';
      trendStrength = Math.min(40, adx * 1.5);
      confidence = 40 + Math.min(30, (50 - adx));
      recommendedAction = rsi < 40 ? 'CAUTIOUS_BUY' : 'NEUTRAL';
      rrAdjustment = 0.8; // Tighter targets in range
    } else if (smaRelation === 'BELOW' && !adxStrong) {
      // Weak downtrend
      regime = 'RANGE';
      trendDirection = 'DOWN';
      trendStrength = Math.min(40, adx * 1.5);
      confidence = 40 + Math.min(30, (50 - adx));
      recommendedAction = rsi > 60 ? 'CAUTIOUS_SELL' : 'NEUTRAL';
      rrAdjustment = 0.8;
    } else {
      // No clear trend
      regime = 'RANGE';
      trendDirection = 'SIDEWAYS';
      trendStrength = Math.min(30, adx);
      confidence = 30 + Math.min(20, 50 - adx);
      recommendedAction = 'NEUTRAL';
      rrAdjustment = 0.7; // Tightest targets in pure range
    }

    // ── Check regime change ──
    let regimeStartedAt: Date | undefined;
    let previousRegime: string | undefined;

    try {
      const lastSnapshot = await this.prisma.marketRegimeSnapshot.findFirst({
        where: { symbol },
        orderBy: { createdAt: 'desc' },
      });

      if (lastSnapshot) {
        previousRegime = lastSnapshot.regime;
        if (lastSnapshot.regime !== regime) {
          regimeStartedAt = new Date(); // New regime starts now
          this.logger.log(`📊 Regime CHANGE for ${symbol}: ${lastSnapshot.regime} → ${regime}`);
        } else {
          regimeStartedAt = lastSnapshot.regimeStartedAt || undefined;
        }
      } else {
        regimeStartedAt = new Date();
      }
    } catch { /* non-critical */ }

    const result: RegimeResult = {
      regime,
      confidence: Math.round(confidence),
      trendDirection,
      trendStrength: Math.round(trendStrength),
      volatilityIndex: Math.round(volatilityIndex),
      sma50,
      sma200,
      adx,
      atr,
      rsi,
      recommendedAction,
      rrAdjustment,
      regimeStartedAt,
      previousRegime,
    };

    // Cache result
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 300 * 1000); // 5 min cache
    } catch { /* non-critical */ }

    // Save to database
    try {
      await this.prisma.marketRegimeSnapshot.create({
        data: {
          symbol,
          regime,
          confidence: result.confidence,
          sma50,
          sma200,
          adx,
          atr,
          rsi,
          trendDirection,
          trendStrength: result.trendStrength,
          volatilityIndex: result.volatilityIndex,
          regimeStartedAt,
          previousRegime,
          recommendedAction,
          rrAdjustment,
        },
      });
    } catch { /* non-critical */ }

    return result;
  }

  /**
   * Get the current regime for a symbol (from cache or fresh detection)
   */
  async getCurrentRegime(symbol: string): Promise<RegimeResult> {
    return this.detectRegime(symbol);
  }

  /**
   * Get regime summary for all council pairs
   */
  async getAllRegimes(symbols: string[]): Promise<Record<string, RegimeResult>> {
    const results: Record<string, RegimeResult> = {};
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          results[symbol] = await this.detectRegime(symbol);
        } catch {
          results[symbol] = this._getDefaultRegime(symbol);
        }
      }),
    );
    return results;
  }

  /**
   * Build regime context string for AI prompts
   * This is injected into council member prompts
   */
  buildRegimeContext(regime: RegimeResult, symbol: string): string {
    const regimeArabic: Record<string, string> = {
      BULL: 'صاعد (BULL)',
      BEAR: 'هابط (BEAR)',
      RANGE: 'عرضي/جانبي (RANGE)',
      VOLATILE: 'متقلب جداً (VOLATILE)',
    };

    const actionArabic: Record<string, string> = {
      AGGRESSIVE_BUY: 'شراء قوي',
      BUY: 'شراء',
      CAUTIOUS_BUY: 'شراء حذر',
      NEUTRAL: 'محايد',
      CAUTIOUS_SELL: 'بيع حذر',
      SELL: 'بيع',
      AGGRESSIVE_SELL: 'بيع قوي',
      NO_TRADE: 'لا تتداول',
    };

    return (
      `📊📊📊 تحليل وضع السوق لـ ${symbol}:\n` +
      `- الوضع: ${regimeArabic[regime.regime] || regime.regime} (ثقة ${regime.confidence}%)\n` +
      `- الاتجاه: ${regime.trendDirection === 'UP' ? 'صاعد' : regime.trendDirection === 'DOWN' ? 'هابط' : 'جانبي'} (قوة ${regime.trendStrength}%)\n` +
      `- التقلب: ${regime.volatilityIndex}%${regime.volatilityIndex > 60 ? ' ⚠️ تقلب عالي!' : ''}\n` +
      `- التوصية: ${actionArabic[regime.recommendedAction] || regime.recommendedAction}\n` +
      `- تعديل المكافأة:المخاطر: ${regime.rrAdjustment}×\n` +
      `⚠️ اعتبر وضع السوق عند تحليلك — لا تتداول ضد الاتجاه بدون سبب قوي!`
    );
  }

  // ── Private Methods ──

  private _getDefaultRegime(symbol: string): RegimeResult {
    // V-PHASE-FIX: Unified default values with the inline safe result in detectRegime()
    // Previously: adx=20, rrAdjustment=1.0 here vs adx=0, rrAdjustment=0.7 in detectRegime()
    // Inconsistent defaults could cause different behavior depending on which code path is hit.
    return {
      regime: 'RANGE',
      confidence: 0,
      trendDirection: 'SIDEWAYS',
      trendStrength: 0,
      volatilityIndex: 50,
      sma50: 0,
      sma200: 0,
      adx: 0,            // Was 20 — unified to 0 (no data = zero ADX)
      atr: 0,
      rsi: 50,
      recommendedAction: 'NEUTRAL',
      rrAdjustment: 0.7, // Was 1.0 — unified to 0.7 (conservative when no data)
    };
  }

  // V-PHASE2 FIX: Removed _generateSyntheticKlines() entirely.
  // Previously, when real klines were unavailable, this method generated 200 random-walk
  // candles from the current price. ALL regime calculations on this synthetic data were
  // essentially random — SMA50/200, ADX, ATR were all fabricated. This caused the system
  // to detect fake BULL/BEAR regimes and trade on random noise.
  // Now: if we can't get real klines, we return EMPTY array and the calling code
  // will fall back to _getDefaultRegime() which returns a safe NEUTRAL/RANGE regime
  // with zero confidence, preventing any trading on unknown market conditions.
  private async _fetchKlines(symbol: string): Promise<{ close: number; high: number; low: number }[]> {
    try {
      const data = await this.marketData.fetchQuickMarketData(symbol);
      // If MarketDataService provides klines directly, use them
      if (data && (data as any).klines && Array.isArray((data as any).klines)) {
        return (data as any).klines;
      }
      // No real klines available — return empty array (NOT synthetic data)
      this.logger.warn(`⚠️ No real klines available for ${symbol} — regime detection will use safe defaults`);
      return [];
    } catch (error) {
      this.logger.warn(`Failed to fetch klines for ${symbol}: ${error.message} — regime detection will use safe defaults`);
      return [];
    }
  }

  private _calcSMA(closes: number[], period: number): number {
    if (closes.length < period) return closes[closes.length - 1] || 0;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  private _calcATR(klines: { high: number; low: number; close: number }[], period = 14): number {
    if (klines.length < 2) return 0;
    const trueRanges: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const tr = Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - klines[i - 1].close),
        Math.abs(klines[i].low - klines[i - 1].close),
      );
      trueRanges.push(tr);
    }
    const recent = trueRanges.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  private _calcADX(klines: { high: number; low: number; close: number }[], period = 14): number {
    // Simplified ADX calculation
    if (klines.length < period * 2) return 20; // Default

    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const tr: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const upMove = klines[i].high - klines[i - 1].high;
      const downMove = klines[i - 1].low - klines[i].low;

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      tr.push(Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - klines[i - 1].close),
        Math.abs(klines[i].low - klines[i - 1].close),
      ));
    }

    // Simple moving average of DM and TR
    const smoothTR = this._sma(tr.slice(-period * 2), period);
    const smoothPlusDM = this._sma(plusDM.slice(-period * 2), period);
    const smoothMinusDM = this._sma(minusDM.slice(-period * 2), period);

    if (smoothTR === 0) return 20;

    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;

    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    return isNaN(dx) ? 20 : Math.min(100, dx);
  }

  private _estimateADX(klines: { high: number; low: number; close: number }[]): number {
    // Rough estimate when not enough data for full ADX
    if (klines.length < 10) return 20;
    const recent = klines.slice(-10);
    const avgRange = recent.reduce((sum, k) => sum + (k.high - k.low), 0) / 10;
    const avgClose = recent.reduce((sum, k) => sum + k.close, 0) / 10;
    const normalizedRange = (avgRange / avgClose) * 100;
    // Map: 0.5% range → ADX ~15, 2% → ADX ~30, 5% → ADX ~50
    return Math.min(100, Math.max(10, normalizedRange * 15));
  }

  private _sma(arr: number[], period: number): number {
    if (arr.length < period) return arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
}
