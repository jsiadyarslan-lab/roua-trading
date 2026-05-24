// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Advanced Scanner Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { MarketDataAggregatorService } from '../analytics/aggregator.service';
import { TechnicalIndicatorService } from '../analytics/indicators.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { RedisService } from '../../common/redis/redis.service';
import { isMarketOpen } from '../../common/utils/market-hours.util';
import { TechnicalAnalysisDto } from '../analytics/analytics.types';

import {
  SCANNER_SYMBOLS,
  MarketCategory,
  SignalDirection,
  SignalClass,
  TimeFrame,
  ScannerItemDto,
  HeatmapItemDto,
  MultiTfResultDto,
  TimeframeAnalysisDto,
  DeepAnalysisDto,
  ScannerScanResponseDto,
  MarketOverviewDto,
  StochResult,
  AdxResult,
  VwapResult,
  SupportResistanceLevel,
  PatternDetection,
  // New types
  SmartScore,
  IchimokuResult,
  ObvResult,
  CciResult,
  ParabolicSarResult,
  FibonacciLevel,
  DivergenceResult,
  VolumeProfileLevel,
  VolumeProfileResult,
  CandlePattern,
} from './scanner.types';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  /** FIX #5: Daily AI cost cap for scanner deep analysis — prevents runaway AI spending.
   *  deepAnalysis() is called from the frontend when a user clicks on a symbol.
   *  Without a cap, a single user making 200 requests could burn through AI credits.
   *  The $3/day cap is shared with MarketScannerService and CouncilSchedulerService.
   */
  private readonly SCANNER_AI_DAILY_COST_CAP_USD = 3.00; // $3/day max for scanner AI calls
  private readonly REDIS_SCANNER_AI_COST_KEY = 'scanner:ai:daily_cost';
  private readonly REDIS_SCANNER_AI_COST_DATE_KEY = 'scanner:ai:daily_cost_date';

  constructor(
    private readonly aggregator: MarketDataAggregatorService,
    private readonly indicators: TechnicalIndicatorService,
    private readonly aiOrchestrator: AIOrchestratorService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🔍 Advanced Scanner Service initialized (with $3/day AI cost cap)');
  }

  /**
   * Invalidate scanner cache keys — used by forceScan to ensure fresh data
   */
  async invalidateCache(timeframe: string = '1h', category?: MarketCategory): Promise<void> {
    const keys = [
      `scanner:scan:${timeframe}:${category || 'ALL'}`,
      'scanner:overview',
      `scanner:heatmap:${category || 'ALL'}`,
    ];
    await Promise.allSettled(keys.map(key => this.redis.del(key)));
    this.logger.log(`🔄 Invalidated scanner cache: ${keys.join(', ')}`);
  }

  // ── Full Market Scan ──

  async fullScan(
    timeframe: string = '1h',
    category?: MarketCategory,
  ): Promise<ScannerScanResponseDto> {
    const cacheKey = `scanner:scan:${timeframe}:${category || 'ALL'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    const symbols = SCANNER_SYMBOLS.filter(
      s => !category || category === MarketCategory.ALL || s.category === category,
    );

    const items: ScannerItemDto[] = [];

    // Run ALL symbol scans concurrently for maximum throughput
    // With only 13 symbols, batching is unnecessary — Promise.allSettled handles errors gracefully
    const results = await Promise.allSettled(
      symbols.map(s => this._scanSymbol(s.symbol, s.name, s.category, timeframe)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        items.push(result.value);
      }
    }

    // Sort by absolute technical score descending (strongest signals first)
    items.sort((a, b) => Math.abs(b.technicalScore) - Math.abs(a.technicalScore));

    const response: ScannerScanResponseDto = {
      items,
      meta: {
        timeframe,
        category: category || 'ALL',
        symbolsScanned: symbols.length,
        source: 'Aggregated',
        timestamp: new Date(),
        nextScanInSeconds: 120,
      },
    };

    // Cache for 120 seconds (increased from 60s to reduce API fan-out)
    await this.redis.set(cacheKey, JSON.stringify(response), 120_000).catch(() => {});

    return response;
  }

  // ── Heatmap Data ──

  async heatmapData(category?: MarketCategory): Promise<HeatmapItemDto[]> {
    const cacheKey = `scanner:heatmap:${category || 'ALL'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    const symbols = SCANNER_SYMBOLS.filter(
      s => !category || category === MarketCategory.ALL || s.category === category,
    );

    const items: HeatmapItemDto[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (s) => {
          try {
            const quote = await this.aggregator.getAggregatedQuote(s.symbol);
            const marketInfo = isMarketOpen(s.symbol);
            return {
              symbol: s.symbol,
              name: s.name,
              category: s.category,
              price: quote.price,
              changePercent: quote.changePercent,
              volume: quote.volume,
              direction: this._classifyDirection(quote.changePercent),
              technicalScore: this._quickScore(quote),
              marketCap: quote.marketCap,
            } as HeatmapItemDto;
          } catch {
            return null;
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          items.push(result.value);
        }
      }
    }

    // Sort by changePercent for heatmap visualization
    items.sort((a, b) => b.changePercent - a.changePercent);

    await this.redis.set(cacheKey, JSON.stringify(items), 120_000).catch(() => {});

    return items;
  }

  // ── Multi-Timeframe Analysis ──

  async multiTimeframeAnalysis(symbol: string): Promise<MultiTfResultDto> {
    const cacheKey = `scanner:multitf:${symbol}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    const timeframes: string[] = [TimeFrame.M15, TimeFrame.H1, TimeFrame.H4, TimeFrame.D1];
    const weights: Record<string, number> = {
      [TimeFrame.D1]: 2.0,
      [TimeFrame.H4]: 1.5,
      [TimeFrame.H1]: 1.0,
      [TimeFrame.M15]: 0.5,
    };

    const tfAnalyses: TimeframeAnalysisDto[] = [];

    for (const tf of timeframes) {
      try {
        const candles = await this.aggregator.getAggregatedCandles(symbol, tf);
        if (candles.length < 30) continue;

        const analysis = await this.indicators.analyze(candles, symbol, tf);
        const stoch = this._stochastic(
          candles.map(c => c.high),
          candles.map(c => c.low),
          candles.map(c => c.close),
        );

        tfAnalyses.push({
          timeframe: tf,
          direction: this._scoreToDirection(analysis.technicalScore),
          technicalScore: analysis.technicalScore,
          rsi: analysis.rsi?.values?.[analysis.rsi.values.length - 1] ?? null,
          macdSignal: analysis.macd?.crossover ?? null,
          adx: null, // Will add if we compute it
          bollingerPosition: analysis.bollingerBands?.position ?? null,
          confidence: this._calculateConfidence(analysis),
          summary: analysis.summary,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Failed to analyze ${symbol} on ${tf}: ${msg}`);
      }
    }

    // Calculate weighted alignment
    let weightedScore = 0;
    let totalWeight = 0;
    for (const tf of tfAnalyses) {
      const w = weights[tf.timeframe] || 1;
      weightedScore += tf.technicalScore * w;
      totalWeight += w;
    }

    const alignmentScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    const alignment = this._scoreToAlignment(alignmentScore);

    // Generate execution hint in Arabic
    const executionHintAr = this._generateExecutionHintAr(alignment, alignmentScore, tfAnalyses);

    const result: MultiTfResultDto = {
      symbol,
      timeframes: tfAnalyses,
      alignment,
      alignmentScore,
      executionHint: this._translateAlignment(alignment),
      executionHintAr,
      confidence: tfAnalyses.length > 0
        ? Math.round(tfAnalyses.reduce((sum, t) => sum + t.confidence, 0) / tfAnalyses.length)
        : 0,
      timestamp: new Date(),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 120_000).catch(() => {});

    return result;
  }

  // ── Deep Analysis (Single Symbol) ──

  async deepAnalysis(symbol: string): Promise<DeepAnalysisDto> {
    const cacheKey = `scanner:deep:${symbol}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    const symbolInfo = SCANNER_SYMBOLS.find(s => s.symbol === symbol);
    const category = symbolInfo?.category ?? MarketCategory.ALL;
    const name = symbolInfo?.name ?? symbol;
    const marketInfo = isMarketOpen(symbol);

    // Fetch data
    const [quote, candles] = await Promise.all([
      this.aggregator.getAggregatedQuote(symbol).catch(() => null),
      this.aggregator.getAggregatedCandles(symbol, '1day').catch(() => []),
    ]);

    if (!quote) {
      throw new Error(`Unable to fetch data for ${symbol}`);
    }

    // Technical analysis
    let technical: TechnicalAnalysisDto | null = null;
    let stochResult: StochResult | null = null;
    let adxResult: AdxResult | null = null;
    let vwapResult: VwapResult | null = null;
    let supportResistance: SupportResistanceLevel[] = [];
    let patterns: PatternDetection[] = [];

    // New advanced indicators
    let ichimokuResult: IchimokuResult | null = null;
    let obvResult: ObvResult | null = null;
    let cciResult: CciResult | null = null;
    let sarResult: ParabolicSarResult | null = null;
    let fibonacciResult: FibonacciLevel[] | null = null;
    let divergenceResult: DivergenceResult | null = null;
    let volumeProfileResult: VolumeProfileResult | null = null;
    let candlePatterns: CandlePattern[] = [];
    let smartScore: SmartScore | null = null;

    if (candles.length >= 30) {
      technical = await this.indicators.analyze(candles, symbol, '1day');

      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const closes = candles.map(c => c.close);
      const volumes = candles.map(c => c.volume);

      stochResult = this._stochastic(highs, lows, closes);
      adxResult = this._adx(highs, lows, closes);
      vwapResult = this._vwap(highs, lows, closes, volumes);
      supportResistance = this._supportResistance(closes);
      patterns = this._detectPatterns(candles);

      // New advanced indicators
      ichimokuResult = this._ichimoku(highs, lows, closes);
      obvResult = this._obv(closes, volumes);
      cciResult = this._cci(highs, lows, closes);
      sarResult = this._parabolicSar(highs, lows);
      fibonacciResult = this._fibonacci(
        Math.max(...highs.slice(-52)),
        Math.min(...lows.slice(-52)),
      );

      // Divergence detection (use RSI values if available)
      const rsiValues = technical.rsi?.values ?? closes;
      divergenceResult = this._detectDivergence(closes, rsiValues, 'rsi');

      // Volume Profile
      volumeProfileResult = this._volumeProfile(highs, lows, closes, volumes);

      // Candlestick patterns
      candlePatterns = this._detectCandlePatterns(candles);

      // Smart Score
      smartScore = this._calculateSmartScore(
        technical, stochResult, adxResult,
        ichimokuResult, obvResult, cciResult, sarResult,
        quote, volumeProfileResult, divergenceResult,
      );
    }

    // Signal classification
    const technicalScore = technical?.technicalScore ?? this._quickScore(quote);
    const direction = this._scoreToDirection(technicalScore);
    const signalClass = this._classifySignalClass(technical, stochResult, adxResult);
    const confidence = technical ? this._calculateConfidence(technical) : 30;

    // Calculate TP/SL
    const atrValue = technical?.atr?.values?.[technical.atr.values.length - 1] ?? quote.price * 0.02;
    const entryPrice = quote.price;
    let takeProfit: number | null = null;
    let stopLoss: number | null = null;
    let riskRewardRatio: number | null = null;

    if (direction === SignalDirection.BUY || direction === SignalDirection.STRONG_BUY) {
      takeProfit = entryPrice + atrValue * 2;
      stopLoss = entryPrice - atrValue * 1;
      riskRewardRatio = 2;
    } else if (direction === SignalDirection.SELL || direction === SignalDirection.STRONG_SELL) {
      takeProfit = entryPrice - atrValue * 2;
      stopLoss = entryPrice + atrValue * 1;
      riskRewardRatio = 2;
    }

    // Build reasons
    const reasons: string[] = [];
    const reasonsAr: string[] = [];
    if (technical?.rsi) {
      const rsiVal = technical.rsi.values[technical.rsi.values.length - 1];
      if (rsiVal < 30) { reasons.push('RSI Oversold'); reasonsAr.push('RSI تشبع بيعي'); }
      else if (rsiVal > 70) { reasons.push('RSI Overbought'); reasonsAr.push('RSI تشبع شرائي'); }
    }
    if (technical?.macd?.crossover === 'BULLISH_CROSSOVER') {
      reasons.push('MACD Bullish Crossover'); reasonsAr.push('تقاطع صعودي MACD');
    } else if (technical?.macd?.crossover === 'BEARISH_CROSSOVER') {
      reasons.push('MACD Bearish Crossover'); reasonsAr.push('تقاطع هبوطي MACD');
    }
    if (technical?.bollingerBands?.position === 'BELOW_LOWER') {
      reasons.push('Price below lower BB'); reasonsAr.push('السعر أسفل بولنجر السفلي');
    } else if (technical?.bollingerBands?.position === 'ABOVE_UPPER') {
      reasons.push('Price above upper BB'); reasonsAr.push('السعر فوق بولنجر العلوي');
    }
    if (stochResult?.interpretation === 'OVERSOLD') {
      reasons.push('Stochastic Oversold'); reasonsAr.push('ستوكاستيك تشبع بيعي');
    } else if (stochResult?.interpretation === 'OVERBOUGHT') {
      reasons.push('Stochastic Overbought'); reasonsAr.push('ستوكاستيك تشبع شرائي');
    }
    if (adxResult?.trendStrength === 'STRONG' || adxResult?.trendStrength === 'VERY_STRONG') {
      reasons.push(`Strong ${adxResult.trendDirection} trend`);
      reasonsAr.push(`اتجاه ${adxResult.trendDirection === 'BULLISH' ? 'صاعد' : 'هابط'} قوي`);
    }
    // New indicator reasons
    if (ichimokuResult?.cloudColor === 'BULLISH' && ichimokuResult.priceVsCloud === 'ABOVE') {
      reasons.push('Above bullish cloud'); reasonsAr.push('فوق سحابة إتشيموكو صاعدة');
    } else if (ichimokuResult?.cloudColor === 'BEARISH' && ichimokuResult.priceVsCloud === 'BELOW') {
      reasons.push('Below bearish cloud'); reasonsAr.push('تحت سحابة إتشيموكو هابطة');
    }
    if (obvResult?.divergence === 'BULLISH_DIVERGENCE') {
      reasons.push('OBV Bullish Divergence'); reasonsAr.push('تباعد صعودي OBV');
    } else if (obvResult?.divergence === 'BEARISH_DIVERGENCE') {
      reasons.push('OBV Bearish Divergence'); reasonsAr.push('تباعد هبوطي OBV');
    }
    if (divergenceResult?.type === 'BULLISH') {
      reasons.push('Bullish RSI Divergence'); reasonsAr.push('تباعد صعودي RSI');
    } else if (divergenceResult?.type === 'BEARISH') {
      reasons.push('Bearish RSI Divergence'); reasonsAr.push('تباعد هبوطي RSI');
    }

    // AI Analysis (on demand, with caching)
    let aiAnalysis: string | null = null;
    let aiModel: string | null = null;
    let aiSentiment: string | null = null;
    let riskLevel: string | null = null;

    try {
      const aiCacheKey = `scanner:ai:${symbol}`;
      const aiCached = await this.redis.get(aiCacheKey);
      if (aiCached) {
        const parsed = JSON.parse(aiCached);
        aiAnalysis = parsed.aiAnalysis;
        aiModel = parsed.aiModel;
        aiSentiment = parsed.aiSentiment;
        riskLevel = parsed.riskLevel;
      } else {
        // FIX #5: Check daily cost cap before making AI call
        const todayCost = await this._getScannerAIDailyCost();
        if (todayCost >= this.SCANNER_AI_DAILY_COST_CAP_USD) {
          this.logger.warn(`💰 Scanner AI daily cost cap reached ($${todayCost.toFixed(2)}/$${this.SCANNER_AI_DAILY_COST_CAP_USD}) — skipping AI analysis for ${symbol}`);
          // Use technical-only analysis instead
          aiSentiment = technicalScore > 20 ? 'POSITIVE' : technicalScore < -20 ? 'NEGATIVE' : 'NEUTRAL';
          riskLevel = Math.abs(quote.changePercent) > 3 ? 'HIGH' : Math.abs(quote.changePercent) > 1.5 ? 'MEDIUM' : 'LOW';
        } else {
          const aiResult = await this.aiOrchestrator.analyze({
            symbol,
            prompt: `حلل الأصل المالي ${symbol} باللغة العربية. الحالة الحالية: السعر ${quote.price}, التغير ${quote.changePercent}%, مؤشر القوة النسبية ${technical?.rsi?.values?.slice(-1)[0]?.toFixed(1) ?? 'N/A'}, الدرجة الفنية ${technicalScore}. قدم تحليلاً موجزاً مع توصية واضحة ومستوى المخاطرة.`,
            type: 'market_analysis',
            language: 'ar',
          });

          aiAnalysis = aiResult.content;
          aiModel = aiResult.model;
          aiSentiment = technicalScore > 20 ? 'POSITIVE' : technicalScore < -20 ? 'NEGATIVE' : 'NEUTRAL';
          riskLevel = Math.abs(quote.changePercent) > 3 ? 'HIGH' : Math.abs(quote.changePercent) > 1.5 ? 'MEDIUM' : 'LOW';

          // FIX #5: Track estimated cost after AI call
          await this._addScannerAICost(0.02); // ~$0.02 per deep analysis call

          // Cache AI result for 5 minutes
          await this.redis.set(aiCacheKey, JSON.stringify({
            aiAnalysis, aiModel, aiSentiment, riskLevel,
          }), 300_000).catch(() => {});
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`AI analysis failed for ${symbol}: ${msg}`);
    }

    const result: DeepAnalysisDto = {
      symbol,
      name,
      category,
      quote: {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        marketCap: quote.marketCap,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      },
      technical: {
        rsi: technical?.rsi?.values?.slice(-1)[0] ?? null,
        rsiInterpretation: technical?.rsi?.interpretation ?? null,
        macdSignal: technical?.macd?.crossover ?? null,
        macdHistogram: technical?.macd?.histogram?.slice(-1)[0] ?? null,
        bollingerPosition: technical?.bollingerBands?.position ?? null,
        bollingerBandwidth: technical?.bollingerBands?.bandwidth?.slice(-1)[0] ?? null,
        stochK: stochResult?.k ?? null,
        stochD: stochResult?.d ?? null,
        adx: adxResult?.adx ?? null,
        adxTrend: adxResult?.trendDirection ?? null,
        atr: technical?.atr?.values?.slice(-1)[0] ?? null,
        atrVolatility: technical?.atr?.volatilityLevel ?? null,
        vwapPosition: vwapResult?.position ?? null,
        technicalScore,
        summary: technical?.summary ?? 'Insufficient data for analysis',
      },
      // New advanced indicator fields
      smartScore,
      ichimoku: ichimokuResult,
      obv: obvResult,
      cci: cciResult,
      sar: sarResult,
      fibonacci: fibonacciResult,
      divergence: divergenceResult,
      volumeProfile: volumeProfileResult,
      candlePatterns,
      supportResistance,
      patterns,
      signal: {
        direction,
        signalClass,
        confidence,
        entryPrice,
        takeProfit,
        stopLoss,
        riskRewardRatio,
        reasons,
        reasonsAr,
      },
      aiAnalysis,
      aiModel,
      aiSentiment,
      riskLevel,
      marketOpen: marketInfo.open,
      source: quote.primarySource || 'Aggregated',
      timestamp: new Date(),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 120_000).catch(() => {});

    return result;
  }

  // ── Market Overview ──

  async marketOverview(): Promise<MarketOverviewDto> {
    const cacheKey = 'scanner:overview';
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    // Run fullScan and heatmapData concurrently for better performance
    const [scanResult, heatmap] = await Promise.all([
      this.fullScan('1h'),
      this.heatmapData(),
    ]);
    const items = scanResult.items;

    const bullishCount = items.filter(i =>
      i.direction === SignalDirection.BUY || i.direction === SignalDirection.STRONG_BUY
    ).length;
    const bearishCount = items.filter(i =>
      i.direction === SignalDirection.SELL || i.direction === SignalDirection.STRONG_SELL
    ).length;
    const neutralCount = items.filter(i => i.direction === SignalDirection.NEUTRAL).length;

    // Top gainers/losers from heatmap
    const topGainers = heatmap.slice(0, 5);
    const topLosers = heatmap.slice(-5).reverse();

    // Strongest signals
    const strongestSignals = items
      .filter(i => i.direction !== SignalDirection.NEUTRAL && i.confidence >= 60)
      .slice(0, 5);

    // Market sentiment
    const sentimentScore = items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + i.technicalScore, 0) / items.length)
      : 0;
    const marketSentiment = sentimentScore > 15 ? 'BULLISH' : sentimentScore < -15 ? 'BEARISH' : 'NEUTRAL';

    const result: MarketOverviewDto = {
      totalScanned: items.length,
      bullishCount,
      bearishCount,
      neutralCount,
      topGainers,
      topLosers,
      strongestSignals,
      marketSentiment,
      sentimentScore,
      timestamp: new Date(),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 60_000).catch(() => {});

    return result;
  }

  // ══════════════════════════════════════════
  //  PRIVATE METHODS — Technical Indicators
  // ══════════════════════════════════════════

  /**
   * Stochastic Oscillator (%K, %D)
   * Measures the position of the close relative to the high-low range
   */
  private _stochastic(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = 14,
    dPeriod: number = 3,
  ): StochResult | null {
    if (closes.length < kPeriod) return null;

    const kValues: number[] = [];

    for (let i = kPeriod - 1; i < closes.length; i++) {
      const highSlice = highs.slice(i - kPeriod + 1, i + 1);
      const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...highSlice);
      const lowestLow = Math.min(...lowSlice);
      const range = highestHigh - lowestLow;

      if (range === 0) {
        kValues.push(50);
      } else {
        kValues.push(((closes[i] - lowestLow) / range) * 100);
      }
    }

    if (kValues.length < dPeriod) return null;

    // %D = SMA of %K
    const dValues: number[] = [];
    for (let i = dPeriod - 1; i < kValues.length; i++) {
      const sum = kValues.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
      dValues.push(sum / dPeriod);
    }

    const k = kValues[kValues.length - 1];
    const d = dValues[dValues.length - 1];

    let interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    if (k > 80) interpretation = 'OVERBOUGHT';
    else if (k < 20) interpretation = 'OVERSOLD';
    else interpretation = 'NEUTRAL';

    return { k: Math.round(k * 100) / 100, d: Math.round(d * 100) / 100, interpretation };
  }

  /**
   * ADX — Average Directional Index
   * Measures trend strength regardless of direction
   */
  private _adx(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14,
  ): AdxResult | null {
    if (highs.length < period * 2) return null;

    // Calculate True Range and Directional Movement
    const trList: number[] = [];
    const plusDmList: number[] = [];
    const minusDmList: number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const hDiff = highs[i] - highs[i - 1];
      const lDiff = lows[i - 1] - lows[i];

      trList.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ));

      plusDmList.push(hDiff > lDiff && hDiff > 0 ? hDiff : 0);
      minusDmList.push(lDiff > hDiff && lDiff > 0 ? lDiff : 0);
    }

    if (trList.length < period) return null;

    // Wilder's smoothing
    const smooth = (data: number[], p: number): number[] => {
      const result: number[] = [];
      let sum = data.slice(0, p).reduce((a, b) => a + b, 0);
      result.push(sum);
      for (let i = p; i < data.length; i++) {
        sum = sum - sum / p + data[i];
        result.push(sum);
      }
      return result;
    };

    const smoothTr = smooth(trList, period);
    const smoothPlusDm = smooth(plusDmList, period);
    const smoothMinusDm = smooth(minusDmList, period);

    // DI calculations
    const plusDi: number[] = [];
    const minusDi: number[] = [];
    const dxList: number[] = [];

    for (let i = 0; i < smoothTr.length; i++) {
      const pdi = smoothTr[i] !== 0 ? (smoothPlusDm[i] / smoothTr[i]) * 100 : 0;
      const mdi = smoothTr[i] !== 0 ? (smoothMinusDm[i] / smoothTr[i]) * 100 : 0;
      plusDi.push(pdi);
      minusDi.push(mdi);

      const diSum = pdi + mdi;
      const diDiff = Math.abs(pdi - mdi);
      dxList.push(diSum !== 0 ? (diDiff / diSum) * 100 : 0);
    }

    // ADX = Wilder's smoothing of DX
    if (dxList.length < period) return null;

    let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
      adx = (adx * (period - 1) + dxList[i]) / period;
    }

    const latestPlusDi = plusDi[plusDi.length - 1];
    const latestMinusDi = minusDi[minusDi.length - 1];

    // Trend strength classification
    let trendStrength: 'NO_TREND' | 'WEAK' | 'STRONG' | 'VERY_STRONG';
    if (adx < 20) trendStrength = 'NO_TREND';
    else if (adx < 25) trendStrength = 'WEAK';
    else if (adx < 50) trendStrength = 'STRONG';
    else trendStrength = 'VERY_STRONG';

    // Trend direction from DI
    let trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    if (latestPlusDi > latestMinusDi + 5) trendDirection = 'BULLISH';
    else if (latestMinusDi > latestPlusDi + 5) trendDirection = 'BEARISH';
    else trendDirection = 'NEUTRAL';

    return {
      adx: Math.round(adx * 100) / 100,
      plusDi: Math.round(latestPlusDi * 100) / 100,
      minusDi: Math.round(latestMinusDi * 100) / 100,
      trendStrength,
      trendDirection,
    };
  }

  /**
   * VWAP — Volume Weighted Average Price
   * Typical intraday benchmark; we compute for the available data window
   */
  private _vwap(
    highs: number[],
    lows: number[],
    closes: number[],
    volumes: number[],
  ): VwapResult | null {
    if (closes.length < 2 || volumes.length < 2) return null;

    let cumVolume = 0;
    let cumTpVol = 0;

    for (let i = 0; i < closes.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      cumTpVol += tp * volumes[i];
      cumVolume += volumes[i];
    }

    if (cumVolume === 0) return null;

    const vwapValue = cumTpVol / cumVolume;
    const lastPrice = closes[closes.length - 1];
    const deviation = cumVolume > 0
      ? Math.sqrt(
          closes.reduce((sum, c, i) => {
            const tp = (highs[i] + lows[i] + c) / 3;
            return sum + volumes[i] * Math.pow(tp - vwapValue, 2);
          }, 0) / cumVolume,
        )
      : 0;

    let position: 'ABOVE' | 'BELOW' | 'AT';
    if (lastPrice > vwapValue * 1.001) position = 'ABOVE';
    else if (lastPrice < vwapValue * 0.999) position = 'BELOW';
    else position = 'AT';

    return {
      value: Math.round(vwapValue * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      position,
    };
  }

  /**
   * Support & Resistance Detection
   * Uses local minima/maxima with confirmation counts
   */
  private _supportResistance(
    closes: number[],
    windowSize: number = 5,
  ): SupportResistanceLevel[] {
    if (closes.length < windowSize * 2 + 1) return [];

    const levels: Map<number, { price: number; type: 'SUPPORT' | 'RESISTANCE'; touches: number }> = new Map();

    for (let i = windowSize; i < closes.length - windowSize; i++) {
      const window = closes.slice(i - windowSize, i + windowSize + 1);
      const current = closes[i];
      const isMax = window.every(v => current >= v);
      const isMin = window.every(v => current <= v);

      if (isMax || isMin) {
        // Round to near price level (0.1% clusters)
        const key = Math.round(current * 1000) / 1000;
        const existing = levels.get(key);
        if (existing) {
          existing.touches++;
        } else {
          levels.set(key, {
            price: current,
            type: isMax ? 'RESISTANCE' : 'SUPPORT',
            touches: 1,
          });
        }
      }
    }

    return Array.from(levels.values())
      .sort((a, b) => b.touches - a.touches)
      .slice(0, 8)
      .map(l => ({
        price: Math.round(l.price * 100) / 100,
        type: l.type,
        strength: l.touches >= 3 ? 'STRONG' : l.touches >= 2 ? 'MODERATE' : 'WEAK',
        touches: l.touches,
      }));
  }

  /**
   * Pattern Detection
   * Detects common chart patterns from OHLCV data
   */
  private _detectPatterns(candles: any[]): PatternDetection[] {
    if (candles.length < 20) return [];

    const patterns: PatternDetection[] = [];
    const closes = candles.map(c => c.close);
    const last20 = closes.slice(-20);
    const last10 = closes.slice(-10);
    const last5 = closes.slice(-5);

    // Calculate basic metrics
    const sma20 = last20.reduce((a, b) => a + b, 0) / last20.length;
    const sma10 = last10.reduce((a, b) => a + b, 0) / last10.length;
    const sma5 = last5.reduce((a, b) => a + b, 0) / last5.length;
    const recentHigh = Math.max(...last10);
    const recentLow = Math.min(...last10);
    const range = recentHigh - recentLow;
    const currentPrice = closes[closes.length - 1];

    // Bull Flag: Strong uptrend followed by consolidation
    const earlyTrendDenom = closes[closes.length - 20] || 1;
    const earlyTrend = (closes[closes.length - 15] - closes[closes.length - 20]) / earlyTrendDenom;
    const recentConsolidation = range / sma20;
    if (earlyTrend > 0.03 && recentConsolidation < 0.02 && currentPrice > sma10) {
      patterns.push({
        name: 'Bull Flag',
        nameAr: 'علم صعودي',
        type: 'BULLISH',
        confidence: Math.min(85, Math.round(50 + earlyTrend * 500)),
        description: 'Strong uptrend followed by consolidation, potential continuation',
        descriptionAr: 'اتجاه صاعد قوي يليه تماسك، احتمال استمرار الصعود',
      });
    }

    // Bear Flag: Strong downtrend followed by consolidation
    if (earlyTrend < -0.03 && recentConsolidation < 0.02 && currentPrice < sma10) {
      patterns.push({
        name: 'Bear Flag',
        nameAr: 'علم هبوطي',
        type: 'BEARISH',
        confidence: Math.min(85, Math.round(50 + Math.abs(earlyTrend) * 500)),
        description: 'Strong downtrend followed by consolidation, potential continuation',
        descriptionAr: 'اتجاه هابط قوي يليه تماسك، احتمال استمرار الهبوط',
      });
    }

    // Double Bottom (W pattern)
    const min1Idx = last10.indexOf(recentLow);
    const afterMin1 = last10.slice(min1Idx + 2);
    if (afterMin1.length > 2) {
      const min2 = Math.min(...afterMin1);
      const min2Idx = min1Idx + 2 + afterMin1.indexOf(min2);
      const priceDiff = Math.abs(recentLow - min2) / recentLow;
      const midPeak = Math.max(...last10.slice(min1Idx, min2Idx + 1));
      if (priceDiff < 0.02 && midPeak > recentLow * 1.02) {
        patterns.push({
          name: 'Double Bottom',
          nameAr: 'قاع مزدوج',
          type: 'BULLISH',
          confidence: Math.round(60 + (1 - priceDiff * 50) * 25),
          description: 'Two similar lows suggesting strong support and potential reversal',
          descriptionAr: 'قاعان متشابهان يشيران إلى دعم قوي واحتمال انعكاس صعودي',
        });
      }
    }

    // Double Top (M pattern)
    const maxRecent = Math.max(...last10);
    const max1Idx = last10.indexOf(maxRecent);
    const afterMax1 = last10.slice(max1Idx + 2);
    if (afterMax1.length > 2) {
      const max2 = Math.max(...afterMax1);
      const max2Idx = max1Idx + 2 + afterMax1.indexOf(max2);
      const priceDiff = Math.abs(maxRecent - max2) / maxRecent;
      const midDip = Math.min(...last10.slice(max1Idx, max2Idx + 1));
      if (priceDiff < 0.02 && midDip < maxRecent * 0.98) {
        patterns.push({
          name: 'Double Top',
          nameAr: 'قمة مزدوجة',
          type: 'BEARISH',
          confidence: Math.round(60 + (1 - priceDiff * 50) * 25),
          description: 'Two similar highs suggesting strong resistance and potential reversal',
          descriptionAr: 'قمتان متشابهتان تشيران إلى مقاومة قوية واحتمال انعكاس هبوطي',
        });
      }
    }

    // Breakout: Price crossing above/below consolidation range
    const bbRange = range / (currentPrice || 1);
    if (bbRange < 0.03) {
      // Tight consolidation
      if (currentPrice > recentHigh * 0.998 && sma5 > sma10) {
        patterns.push({
          name: 'Breakout Bullish',
          nameAr: 'اختراق صعودي',
          type: 'BULLISH',
          confidence: 65,
          description: 'Price breaking above consolidation range with momentum',
          descriptionAr: 'السعر يخترق نطاق التماسك مع زخم صعودي',
        });
      } else if (currentPrice < recentLow * 1.002 && sma5 < sma10) {
        patterns.push({
          name: 'Breakout Bearish',
          nameAr: 'اختراق هبوطي',
          type: 'BEARISH',
          confidence: 65,
          description: 'Price breaking below consolidation range with selling pressure',
          descriptionAr: 'السعر يخترق نطاق التماسك مع ضغط بيعي',
        });
      }
    }

    // Ranging / Consolidation
    if (bbRange < 0.02 && patterns.length === 0) {
      patterns.push({
        name: 'Consolidation',
        nameAr: 'تماسك',
        type: 'NEUTRAL',
        confidence: 50,
        description: 'Price trading in a tight range, waiting for direction',
        descriptionAr: 'السعر يتداول في نطاق ضيق، بانتظار تحديد الاتجاه',
      });
    }

    return patterns;
  }

  // ══════════════════════════════════════════════════
  //  NEW — Advanced Technical Indicators
  // ═════════════════════════════════════════━━═══════

  /**
   * Ichimoku Cloud (一行)
   * Multi-component indicator showing support/resistance, trend, and momentum
   */
  private _ichimoku(
    highs: number[],
    lows: number[],
    closes: number[],
    tenkanPeriod: number = 9,
    kijunPeriod: number = 26,
    senkouBPeriod: number = 52,
  ): IchimokuResult | null {
    if (closes.length < senkouBPeriod) return null;

    // Helper: period midpoint (highest high + lowest low) / 2
    const midPoint = (data: number[], period: number, endIdx: number): number => {
      const slice = data.slice(Math.max(0, endIdx - period + 1), endIdx + 1);
      return (Math.max(...slice) + Math.min(...slice)) / 2;
    };

    const lastIdx = closes.length - 1;

    // Tenkan-sen (Conversion Line) — 9-period
    const tenkanSen = midPoint(highs, tenkanPeriod, lastIdx)
      + midPoint(lows, tenkanPeriod, lastIdx);
    const tenkanSenValue = (Math.max(...highs.slice(lastIdx - tenkanPeriod + 1, lastIdx + 1))
      + Math.min(...lows.slice(lastIdx - tenkanPeriod + 1, lastIdx + 1))) / 2;

    // Kijun-sen (Base Line) — 26-period
    const kijunSenValue = (Math.max(...highs.slice(lastIdx - kijunPeriod + 1, lastIdx + 1))
      + Math.min(...lows.slice(lastIdx - kijunPeriod + 1, lastIdx + 1))) / 2;

    // Senkou Span A (Leading Span A) — (Tenkan + Kijun) / 2, shifted 26 ahead
    const senkouSpanA = (tenkanSenValue + kijunSenValue) / 2;

    // Senkou Span B (Leading Span B) — 52-period midpoint, shifted 26 ahead
    const senkouSpanB = (Math.max(...highs.slice(lastIdx - senkouBPeriod + 1, lastIdx + 1))
      + Math.min(...lows.slice(lastIdx - senkouBPeriod + 1, lastIdx + 1))) / 2;

    // Chikou Span (Lagging Span) — close shifted 26 back
    const chikouSpan = lastIdx >= kijunPeriod ? closes[lastIdx - kijunPeriod] : closes[0];

    // Cloud color
    let cloudColor: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    if (senkouSpanA > senkouSpanB * 1.001) cloudColor = 'BULLISH';
    else if (senkouSpanB > senkouSpanA * 1.001) cloudColor = 'BEARISH';
    else cloudColor = 'NEUTRAL';

    // Price vs Cloud position
    const currentPrice = closes[lastIdx];
    const cloudTop = Math.max(senkouSpanA, senkouSpanB);
    const cloudBottom = Math.min(senkouSpanA, senkouSpanB);
    let priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE';
    if (currentPrice > cloudTop) priceVsCloud = 'ABOVE';
    else if (currentPrice < cloudBottom) priceVsCloud = 'BELOW';
    else priceVsCloud = 'INSIDE';

    // TK Cross signal
    let tkCross: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    if (tenkanSenValue > kijunSenValue * 1.001) tkCross = 'BULLISH';
    else if (kijunSenValue > tenkanSenValue * 1.001) tkCross = 'BEARISH';
    else tkCross = 'NEUTRAL';

    return {
      tenkanSen: Math.round(tenkanSenValue * 100) / 100,
      kijunSen: Math.round(kijunSenValue * 100) / 100,
      senkouSpanA: Math.round(senkouSpanA * 100) / 100,
      senkouSpanB: Math.round(senkouSpanB * 100) / 100,
      chikouSpan: Math.round(chikouSpan * 100) / 100,
      cloudColor,
      priceVsCloud,
      tkCross,
    };
  }

  /**
   * On-Balance Volume (OBV)
   * Measures buying/selling pressure as cumulative volume
   */
  private _obv(
    closes: number[],
    volumes: number[],
  ): ObvResult | null {
    if (closes.length < 3 || volumes.length < 3) return null;

    const obvValues: number[] = [0];

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obvValues.push(obvValues[i - 1] + volumes[i]);
      } else if (closes[i] < closes[i - 1]) {
        obvValues.push(obvValues[i - 1] - volumes[i]);
      } else {
        obvValues.push(obvValues[i - 1]);
      }
    }

    // Determine OBV trend using last 20% of values
    const trendLookback = Math.max(5, Math.floor(obvValues.length * 0.2));
    const recentObv = obvValues.slice(-trendLookback);
    const obvSlope = (recentObv[recentObv.length - 1] - recentObv[0]) / trendLookback;

    let trend: 'RISING' | 'FALLING' | 'FLAT';
    if (obvSlope > 0) trend = 'RISING';
    else if (obvSlope < 0) trend = 'FALLING';
    else trend = 'FLAT';

    // Divergence detection — price making new highs/lows without OBV confirmation
    let divergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE' = 'NONE';

    const lookback = Math.min(20, closes.length - 1);
    const recentCloses = closes.slice(-lookback);
    const recentObvFinal = obvValues.slice(-lookback);

    // Check for bearish divergence: price higher high, OBV lower high
    const priceHighIdx = recentCloses.indexOf(Math.max(...recentCloses));
    const obvHighIdx = recentObvFinal.indexOf(Math.max(...recentObvFinal));

    if (priceHighIdx > lookback / 2 && obvHighIdx < lookback / 2) {
      divergence = 'BEARISH_DIVERGENCE';
    }

    // Check for bullish divergence: price lower low, OBV higher low
    const priceLowIdx = recentCloses.indexOf(Math.min(...recentCloses));
    const obvLowIdx = recentObvFinal.indexOf(Math.min(...recentObvFinal));

    if (priceLowIdx > lookback / 2 && obvLowIdx < lookback / 2) {
      divergence = 'BULLISH_DIVERGENCE';
    }

    return {
      values: obvValues.slice(-20).map(v => Math.round(v * 100) / 100),
      trend,
      divergence,
    };
  }

  /**
   * Commodity Channel Index (CCI)
   * Measures deviation from statistical average price
   */
  private _cci(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 20,
  ): CciResult | null {
    if (closes.length < period) return null;

    const typicalPrices: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
    }

    // SMA of typical price
    const smaTp: number[] = [];
    for (let i = period - 1; i < typicalPrices.length; i++) {
      const sum = typicalPrices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      smaTp.push(sum / period);
    }

    // Mean Deviation
    const meanDev: number[] = [];
    for (let i = 0; i < smaTp.length; i++) {
      const startIdx = i;
      let devSum = 0;
      for (let j = startIdx; j < startIdx + period; j++) {
        devSum += Math.abs(typicalPrices[j] - smaTp[i]);
      }
      meanDev.push(devSum / period);
    }

    // CCI calculation
    const cciValues: number[] = [];
    for (let i = 0; i < smaTp.length; i++) {
      const tpIdx = i + period - 1;
      if (meanDev[i] === 0) {
        cciValues.push(0);
      } else {
        cciValues.push((typicalPrices[tpIdx] - smaTp[i]) / (0.015 * meanDev[i]));
      }
    }

    const latestCci = cciValues[cciValues.length - 1];

    let interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    if (latestCci > 100) interpretation = 'OVERBOUGHT';
    else if (latestCci < -100) interpretation = 'OVERSOLD';
    else interpretation = 'NEUTRAL';

    return {
      value: Math.round(latestCci * 100) / 100,
      interpretation,
    };
  }

  /**
   * Parabolic SAR (Stop and Reverse)
   * Trailing stop and reverse system for trend following
   */
  private _parabolicSar(
    highs: number[],
    lows: number[],
    af: number = 0.02,
    maxAf: number = 0.2,
  ): ParabolicSarResult | null {
    if (highs.length < 5) return null;

    let isRising = highs[1] > highs[0]; // Initial trend guess
    let sar = isRising ? lows[0] : highs[0];
    let ep = isRising ? highs[0] : lows[0];
    let currentAf = af;

    for (let i = 1; i < highs.length; i++) {
      // Calculate next SAR
      let prevSar = sar;
      sar = prevSar + currentAf * (ep - prevSar);

      if (isRising) {
        // Uptrend: SAR should not exceed previous two lows
        if (i >= 2) {
          sar = Math.min(sar, lows[i - 1], lows[i - 2]);
        } else {
          sar = Math.min(sar, lows[i - 1]);
        }

        if (lows[i] < sar) {
          // Reversal to downtrend
          isRising = false;
          sar = ep;
          ep = lows[i];
          currentAf = af;
        } else {
          // Continue uptrend
          if (highs[i] > ep) {
            ep = highs[i];
            currentAf = Math.min(currentAf + af, maxAf);
          }
        }
      } else {
        // Downtrend: SAR should not fall below previous two highs
        if (i >= 2) {
          sar = Math.max(sar, highs[i - 1], highs[i - 2]);
        } else {
          sar = Math.max(sar, highs[i - 1]);
        }

        if (highs[i] > sar) {
          // Reversal to uptrend
          isRising = true;
          sar = ep;
          ep = highs[i];
          currentAf = af;
        } else {
          // Continue downtrend
          if (lows[i] < ep) {
            ep = lows[i];
            currentAf = Math.min(currentAf + af, maxAf);
          }
        }
      }
    }

    return {
      value: Math.round(sar * 100) / 100,
      trend: isRising ? 'RISING' : 'FALLING',
      accelerationFactor: Math.round(currentAf * 1000) / 1000,
    };
  }

  /**
   * Fibonacci Retracement Levels
   * Key retracement levels based on recent price swing
   */
  private _fibonacci(high: number, low: number): FibonacciLevel[] {
    const diff = high - low;
    const levels = [
      { level: 0,     label: '0%',     labelAr: '0٪' },
      { level: 0.236, label: '23.6%',  labelAr: '23.6٪' },
      { level: 0.382, label: '38.2%',  labelAr: '38.2٪' },
      { level: 0.5,   label: '50%',    labelAr: '50٪' },
      { level: 0.618, label: '61.8%',  labelAr: '61.8٪' },
      { level: 0.786, label: '78.6%',  labelAr: '78.6٪' },
      { level: 1,     label: '100%',   labelAr: '100٪' },
    ];

    return levels.map(l => ({
      level: l.level,
      price: Math.round((high - diff * l.level) * 100) / 100,
      label: l.label,
      labelAr: l.labelAr,
    }));
  }

  /**
   * Divergence Detection
   * Detects regular and hidden divergences between price and an indicator
   */
  private _detectDivergence(
    closes: number[],
    indicatorValues: number[],
    type: string = 'rsi',
  ): DivergenceResult | null {
    if (closes.length < 10 || indicatorValues.length < 10) return null;

    // Use last 20 bars for divergence detection
    const lookback = Math.min(20, closes.length, indicatorValues.length);
    const recentCloses = closes.slice(-lookback);
    const recentIndicator = indicatorValues.slice(-lookback);

    // Find local extrema
    const findPeaks = (data: number[], minDistance: number = 3): number[] => {
      const peaks: number[] = [];
      for (let i = minDistance; i < data.length - minDistance; i++) {
        let isPeak = true;
        for (let j = 1; j <= minDistance; j++) {
          if (data[i] < data[i - j] || data[i] < data[i + j]) {
            isPeak = false;
            break;
          }
        }
        if (isPeak) peaks.push(i);
      }
      return peaks;
    };

    const findTroughs = (data: number[], minDistance: number = 3): number[] => {
      const troughs: number[] = [];
      for (let i = minDistance; i < data.length - minDistance; i++) {
        let isTrough = true;
        for (let j = 1; j <= minDistance; j++) {
          if (data[i] > data[i - j] || data[i] > data[i + j]) {
            isTrough = false;
            break;
          }
        }
        if (isTrough) troughs.push(i);
      }
      return troughs;
    };

    const pricePeaks = findPeaks(recentCloses);
    const priceTroughs = findTroughs(recentCloses);
    const indPeaks = findPeaks(recentIndicator);
    const indTroughs = findTroughs(recentIndicator);

    // Bearish Divergence: price higher high, indicator lower high
    if (pricePeaks.length >= 2 && indPeaks.length >= 2) {
      const lastPricePeak = pricePeaks[pricePeaks.length - 1];
      const prevPricePeak = pricePeaks[pricePeaks.length - 2];
      const lastIndPeak = indPeaks[indPeaks.length - 1];
      const prevIndPeak = indPeaks[indPeaks.length - 2];

      if (recentCloses[lastPricePeak] > recentCloses[prevPricePeak]
        && recentIndicator[lastIndPeak] < recentIndicator[prevIndPeak]) {
        return {
          type: 'BEARISH',
          indicator: type,
          description: `Bearish divergence: price making higher highs while ${type.toUpperCase()} makes lower highs`,
          descriptionAr: `تباعد هبوطي: السعر يسجل قمم أعلى بينما ${type.toUpperCase()} يسجل قمم أدنى`,
          strength: 'MODERATE',
        };
      }
    }

    // Bullish Divergence: price lower low, indicator higher low
    if (priceTroughs.length >= 2 && indTroughs.length >= 2) {
      const lastPriceTrough = priceTroughs[priceTroughs.length - 1];
      const prevPriceTrough = priceTroughs[priceTroughs.length - 2];
      const lastIndTrough = indTroughs[indTroughs.length - 1];
      const prevIndTrough = indTroughs[indTroughs.length - 2];

      if (recentCloses[lastPriceTrough] < recentCloses[prevPriceTrough]
        && recentIndicator[lastIndTrough] > recentIndicator[prevIndTrough]) {
        return {
          type: 'BULLISH',
          indicator: type,
          description: `Bullish divergence: price making lower lows while ${type.toUpperCase()} makes higher lows`,
          descriptionAr: `تباعد صعودي: السعر يسجل قيعان أدنى بينما ${type.toUpperCase()} يسجل قيعان أعلى`,
          strength: 'MODERATE',
        };
      }
    }

    // Hidden Bearish Divergence: price lower high, indicator higher high
    if (pricePeaks.length >= 2 && indPeaks.length >= 2) {
      const lastPricePeak = pricePeaks[pricePeaks.length - 1];
      const prevPricePeak = pricePeaks[pricePeaks.length - 2];
      const lastIndPeak = indPeaks[indPeaks.length - 1];
      const prevIndPeak = indPeaks[indPeaks.length - 2];

      if (recentCloses[lastPricePeak] < recentCloses[prevPricePeak]
        && recentIndicator[lastIndPeak] > recentIndicator[prevIndPeak]) {
        return {
          type: 'HIDDEN_BEARISH',
          indicator: type,
          description: `Hidden bearish divergence: trend continuation signal`,
          descriptionAr: `تباعد هبوطي مخفي: إشارة استمرار الاتجاه`,
          strength: 'WEAK',
        };
      }
    }

    // Hidden Bullish Divergence: price higher low, indicator lower low
    if (priceTroughs.length >= 2 && indTroughs.length >= 2) {
      const lastPriceTrough = priceTroughs[priceTroughs.length - 1];
      const prevPriceTrough = priceTroughs[priceTroughs.length - 2];
      const lastIndTrough = indTroughs[indTroughs.length - 1];
      const prevIndTrough = indTroughs[indTroughs.length - 2];

      if (recentCloses[lastPriceTrough] > recentCloses[prevPriceTrough]
        && recentIndicator[lastIndTrough] < recentIndicator[prevIndTrough]) {
        return {
          type: 'HIDDEN_BULLISH',
          indicator: type,
          description: `Hidden bullish divergence: trend continuation signal`,
          descriptionAr: `تباعد صعودي مخفي: إشارة استمرار الاتجاه`,
          strength: 'WEAK',
        };
      }
    }

    return {
      type: 'NONE',
      indicator: type,
      description: 'No divergence detected',
      descriptionAr: 'لم يتم كشف تباعد',
      strength: 'WEAK',
    };
  }

  /**
   * Volume Profile
   * Distributes volume across price levels to find support/resistance zones
   */
  private _volumeProfile(
    highs: number[],
    lows: number[],
    closes: number[],
    volumes: number[],
    bins: number = 10,
  ): VolumeProfileResult | null {
    if (closes.length < 10 || volumes.length < 10) return null;

    const priceMin = Math.min(...lows.slice(-60));
    const priceMax = Math.max(...highs.slice(-60));
    const priceRange = priceMax - priceMin;

    if (priceRange === 0) return null;

    const binSize = priceRange / bins;
    const levels: VolumeProfileLevel[] = [];

    // Initialize bins
    for (let i = 0; i < bins; i++) {
      levels.push({
        priceStart: priceMin + i * binSize,
        priceEnd: priceMin + (i + 1) * binSize,
        volume: 0,
        percentage: 0,
      });
    }

    // Distribute volume across bins
    const lookback = Math.min(60, closes.length);
    let totalVolume = 0;

    for (let i = closes.length - lookback; i < closes.length; i++) {
      const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
      const binIdx = Math.min(bins - 1, Math.floor((typicalPrice - priceMin) / binSize));
      if (binIdx >= 0 && binIdx < bins) {
        levels[binIdx].volume += volumes[i];
        totalVolume += volumes[i];
      }
    }

    // Calculate percentages
    if (totalVolume > 0) {
      for (const level of levels) {
        level.percentage = Math.round((level.volume / totalVolume) * 10000) / 100;
      }
    }

    // Find POC (Point of Control) — bin with highest volume
    let pocIdx = 0;
    let maxVolume = 0;
    for (let i = 0; i < levels.length; i++) {
      if (levels[i].volume > maxVolume) {
        maxVolume = levels[i].volume;
        pocIdx = i;
      }
    }
    const poc = (levels[pocIdx].priceStart + levels[pocIdx].priceEnd) / 2;

    // Calculate Value Area (70% of total volume)
    const valueAreaTarget = totalVolume * 0.7;
    let valueAreaVolume = levels[pocIdx].volume;
    let vaHighIdx = pocIdx;
    let vaLowIdx = pocIdx;

    while (valueAreaVolume < valueAreaTarget) {
      const aboveVol = vaHighIdx < bins - 1 ? levels[vaHighIdx + 1].volume : 0;
      const belowVol = vaLowIdx > 0 ? levels[vaLowIdx - 1].volume : 0;

      if (aboveVol >= belowVol && vaHighIdx < bins - 1) {
        vaHighIdx++;
        valueAreaVolume += levels[vaHighIdx].volume;
      } else if (vaLowIdx > 0) {
        vaLowIdx--;
        valueAreaVolume += levels[vaLowIdx].volume;
      } else {
        break;
      }
    }

    return {
      levels: levels.map(l => ({
        priceStart: Math.round(l.priceStart * 100) / 100,
        priceEnd: Math.round(l.priceEnd * 100) / 100,
        volume: Math.round(l.volume * 100) / 100,
        percentage: l.percentage,
      })),
      poc: Math.round(poc * 100) / 100,
      valueAreaHigh: Math.round(levels[vaHighIdx].priceEnd * 100) / 100,
      valueAreaLow: Math.round(levels[vaLowIdx].priceStart * 100) / 100,
    };
  }

  /**
   * Candlestick Pattern Detection
   * Detects individual candlestick patterns with Arabic names and descriptions
   */
  private _detectCandlePatterns(candles: any[]): CandlePattern[] {
    if (candles.length < 5) return [];

    const patterns: CandlePattern[] = [];
    const last = candles.length - 1;
    const c = candles[last];
    const prev = candles[last - 1];
    const prev2 = candles[last - 2];

    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.close, c.open);
    const lowerWick = Math.min(c.close, c.open) - c.low;
    const totalRange = c.high - c.low;
    const isBullish = c.close > c.open;
    const isBearish = c.close < c.open;

    // Avoid division by zero
    if (totalRange === 0) return patterns;

    // ── Doji (دوجي) ──
    // Standard Doji: very small body relative to range
    if (body / totalRange < 0.05 && totalRange > 0) {
      // Dragonfly Doji: long lower wick, no upper wick
      if (lowerWick / totalRange > 0.6 && upperWick / totalRange < 0.1) {
        patterns.push({
          name: 'Dragonfly Doji',
          nameAr: 'دوجي يعسوب',
          type: 'BULLISH',
          confidence: 65,
          description: 'Dragonfly doji indicating potential reversal with buying pressure',
          descriptionAr: 'دوجي يعسوب يشير إلى احتمال انعكاس مع ضغط شرائي',
        });
      }
      // Gravestone Doji: long upper wick, no lower wick
      else if (upperWick / totalRange > 0.6 && lowerWick / totalRange < 0.1) {
        patterns.push({
          name: 'Gravestone Doji',
          nameAr: 'دوجي شاهد القبر',
          type: 'BEARISH',
          confidence: 65,
          description: 'Gravestone doji indicating potential reversal with selling pressure',
          descriptionAr: 'دوجي شاهد القبر يشير إلى احتمال انعكاس مع ضغط بيعي',
        });
      }
      // Standard Doji
      else {
        patterns.push({
          name: 'Doji',
          nameAr: 'دوجي',
          type: 'NEUTRAL',
          confidence: 50,
          description: 'Doji indicating indecision in the market',
          descriptionAr: 'دوجي يشير إلى تردد في السوق',
        });
      }
    }

    // ── Hammer (مطرقة) ──
    // Bullish hammer at bottom: small body at top, long lower wick
    if (lowerWick / totalRange > 0.6 && body / totalRange < 0.25 && upperWick / totalRange < 0.1) {
      // Confirm in downtrend
      const recentTrend = prev.close < prev2.close;
      if (recentTrend) {
        patterns.push({
          name: 'Hammer',
          nameAr: 'مطرقة',
          type: 'BULLISH',
          confidence: 70,
          description: 'Hammer pattern after downtrend, potential bullish reversal',
          descriptionAr: 'نمط المطرقة بعد هبوط، احتمال انعكاس صعودي',
        });
      } else {
        patterns.push({
          name: 'Hammer',
          nameAr: 'مطرقة',
          type: 'BULLISH',
          confidence: 55,
          description: 'Hammer pattern indicating buying pressure',
          descriptionAr: 'نمط المطرقة يشير إلى ضغط شرائي',
        });
      }
    }

    // ── Inverted Hammer (مطرقة مقلوبة) ──
    // Bullish: small body at bottom, long upper wick
    if (upperWick / totalRange > 0.6 && body / totalRange < 0.25 && lowerWick / totalRange < 0.1) {
      patterns.push({
        name: 'Inverted Hammer',
        nameAr: 'مطرقة مقلوبة',
        type: 'BULLISH',
        confidence: 60,
        description: 'Inverted hammer indicating potential bullish reversal',
        descriptionAr: 'مطرقة مقلوبة تشير إلى احتمال انعكاس صعودي',
      });
    }

    // ── Bullish Engulfing (ابتلاع صعودي) ──
    if (prev.close < prev.open && isBullish
      && c.open < prev.close && c.close > prev.open) {
      patterns.push({
        name: 'Bullish Engulfing',
        nameAr: 'ابتلاع صعودي',
        type: 'BULLISH',
        confidence: 75,
        description: 'Bullish engulfing pattern — strong reversal signal',
        descriptionAr: 'نمط الابتلاع الصعودي — إشارة انعكاس قوية',
      });
    }

    // ── Bearish Engulfing (ابتلاع هبوطي) ──
    if (prev.close > prev.open && isBearish
      && c.open > prev.close && c.close < prev.open) {
      patterns.push({
        name: 'Bearish Engulfing',
        nameAr: 'ابتلاع هبوطي',
        type: 'BEARISH',
        confidence: 75,
        description: 'Bearish engulfing pattern — strong reversal signal',
        descriptionAr: 'نمط الابتلاع الهبوطي — إشارة انعكاس قوية',
      });
    }

    // ── Morning Star (نجمة الصباح) ──
    if (candles.length >= 3) {
      const c2 = candles[last - 2];
      const c1 = candles[last - 1];
      const c0 = candles[last];
      const c2Body = Math.abs(c2.close - c2.open);
      const c1Body = Math.abs(c1.close - c1.open);
      const c0Body = Math.abs(c0.close - c0.open);

      if (c2.close < c2.open // First candle bearish
        && c1Body < c2Body * 0.3 // Second candle small body (star)
        && c0.close > c0.open // Third candle bullish
        && c0Body > c1Body * 2) { // Third candle large body
        patterns.push({
          name: 'Morning Star',
          nameAr: 'نجمة الصباح',
          type: 'BULLISH',
          confidence: 80,
          description: 'Morning star pattern — strong bullish reversal signal',
          descriptionAr: 'نمط نجمة الصباح — إشارة انعكاس صعودي قوية',
        });
      }
    }

    // ── Evening Star (نجمة المساء) ──
    if (candles.length >= 3) {
      const c2 = candles[last - 2];
      const c1 = candles[last - 1];
      const c0 = candles[last];
      const c2Body = Math.abs(c2.close - c2.open);
      const c1Body = Math.abs(c1.close - c1.open);
      const c0Body = Math.abs(c0.close - c0.open);

      if (c2.close > c2.open // First candle bullish
        && c1Body < c2Body * 0.3 // Second candle small body (star)
        && c0.close < c0.open // Third candle bearish
        && c0Body > c1Body * 2) { // Third candle large body
        patterns.push({
          name: 'Evening Star',
          nameAr: 'نجمة المساء',
          type: 'BEARISH',
          confidence: 80,
          description: 'Evening star pattern — strong bearish reversal signal',
          descriptionAr: 'نمط نجمة المساء — إشارة انعكاس هبوطي قوية',
        });
      }
    }

    // ── Three White Soldiers (ثلاثة جنود بيض) ──
    if (candles.length >= 3) {
      const c2 = candles[last - 2];
      const c1 = candles[last - 1];
      const c0 = candles[last];

      if (c2.close > c2.open && c1.close > c1.open && c0.close > c0.open
        && c1.close > c2.close && c0.close > c1.close
        && c1.open > c2.open && c0.open > c1.open) {
        patterns.push({
          name: 'Three White Soldiers',
          nameAr: 'ثلاثة جنود بيض',
          type: 'BULLISH',
          confidence: 85,
          description: 'Three white soldiers — strong bullish continuation pattern',
          descriptionAr: 'ثلاثة جنود بيض — نمط استمرار صعودي قوي',
        });
      }
    }

    // ── Three Black Crows (ثلاثة غربان سود) ──
    if (candles.length >= 3) {
      const c2 = candles[last - 2];
      const c1 = candles[last - 1];
      const c0 = candles[last];

      if (c2.close < c2.open && c1.close < c1.open && c0.close < c0.open
        && c1.close < c2.close && c0.close < c1.close
        && c1.open < c2.open && c0.open < c1.open) {
        patterns.push({
          name: 'Three Black Crows',
          nameAr: 'ثلاثة غربان سود',
          type: 'BEARISH',
          confidence: 85,
          description: 'Three black crows — strong bearish continuation pattern',
          descriptionAr: 'ثلاثة غربان سود — نمط استمرار هبوطي قوي',
        });
      }
    }

    // ── Spinning Top (قمة دوارة) ──
    if (body / totalRange < 0.15 && upperWick / totalRange > 0.25 && lowerWick / totalRange > 0.25) {
      patterns.push({
        name: 'Spinning Top',
        nameAr: 'قمة دوارة',
        type: 'NEUTRAL',
        confidence: 45,
        description: 'Spinning top indicating market indecision',
        descriptionAr: 'قمة دوارة تشير إلى تردد في السوق',
      });
    }

    // ── Shooting Star (نجمة ساقطة) ──
    // Bearish: small body at bottom, long upper wick after uptrend
    if (upperWick / totalRange > 0.6 && body / totalRange < 0.25 && lowerWick / totalRange < 0.1
      && prev.close > prev2.close) {
      patterns.push({
        name: 'Shooting Star',
        nameAr: 'نجمة ساقطة',
        type: 'BEARISH',
        confidence: 70,
        description: 'Shooting star after uptrend, potential bearish reversal',
        descriptionAr: 'نجمة ساقطة بعد صعود، احتمال انعكاس هبوطي',
      });
    }

    // ── Hanging Man (رجل معلق) ──
    // Bearish: same shape as hammer but after uptrend
    if (lowerWick / totalRange > 0.6 && body / totalRange < 0.25 && upperWick / totalRange < 0.1
      && prev.close > prev2.close) {
      patterns.push({
        name: 'Hanging Man',
        nameAr: 'رجل معلق',
        type: 'BEARISH',
        confidence: 65,
        description: 'Hanging man after uptrend, potential bearish reversal',
        descriptionAr: 'رجل معلق بعد صعود، احتمال انعكاس هبوطي',
      });
    }

    // ── Bullish Harami (هارامي صعودي) ──
    if (prev.close < prev.open && isBullish
      && c.open > prev.close && c.close < prev.open
      && body < Math.abs(prev.close - prev.open) * 0.6) {
      patterns.push({
        name: 'Bullish Harami',
        nameAr: 'هارامي صعودي',
        type: 'BULLISH',
        confidence: 60,
        description: 'Bullish harami — potential reversal after downtrend',
        descriptionAr: 'هارامي صعودي — احتمال انعكاس بعد هبوط',
      });
    }

    // ── Bearish Harami (هارامي هبوطي) ──
    if (prev.close > prev.open && isBearish
      && c.open < prev.close && c.close > prev.open
      && body < Math.abs(prev.close - prev.open) * 0.6) {
      patterns.push({
        name: 'Bearish Harami',
        nameAr: 'هارامي هبوطي',
        type: 'BEARISH',
        confidence: 60,
        description: 'Bearish harami — potential reversal after uptrend',
        descriptionAr: 'هارامي هبوطي — احتمال انعكاس بعد صعود',
      });
    }

    // ── Piercing Line (خط اختراق) ──
    if (prev.close < prev.open && isBullish
      && c.open < prev.close && c.close > (prev.open + prev.close) / 2
      && c.close < prev.open) {
      patterns.push({
        name: 'Piercing Line',
        nameAr: 'خط اختراق',
        type: 'BULLISH',
        confidence: 70,
        description: 'Piercing line — bullish reversal pattern',
        descriptionAr: 'خط اختراق — نمط انعكاس صعودي',
      });
    }

    // ── Dark Cloud Cover (سحابة مظلمة) ──
    if (prev.close > prev.open && isBearish
      && c.open > prev.close && c.close < (prev.open + prev.close) / 2
      && c.close > prev.open) {
      patterns.push({
        name: 'Dark Cloud Cover',
        nameAr: 'سحابة مظلمة',
        type: 'BEARISH',
        confidence: 70,
        description: 'Dark cloud cover — bearish reversal pattern',
        descriptionAr: 'سحابة مظلمة — نمط انعكاس هبوطي',
      });
    }

    // ── Tweezer Top (قمة ملقاط) ──
    if (candles.length >= 2) {
      const prevHigh = Math.max(prev.open, prev.close);
      const currHigh = Math.max(c.open, c.close);
      if (Math.abs(prevHigh - currHigh) / prevHigh < 0.001
        && prev.close > prev.open && isBearish) {
        patterns.push({
          name: 'Tweezer Top',
          nameAr: 'قمة ملقاط',
          type: 'BEARISH',
          confidence: 60,
          description: 'Tweezer top — bearish reversal signal',
          descriptionAr: 'قمة ملقاط — إشارة انعكاس هبوطي',
        });
      }
    }

    // ── Tweezer Bottom (قاع ملقاط) ──
    if (candles.length >= 2) {
      const prevLow = Math.min(prev.open, prev.close);
      const currLow = Math.min(c.open, c.close);
      if (Math.abs(prevLow - currLow) / prevLow < 0.001
        && prev.close < prev.open && isBullish) {
        patterns.push({
          name: 'Tweezer Bottom',
          nameAr: 'قاع ملقاط',
          type: 'BULLISH',
          confidence: 60,
          description: 'Tweezer bottom — bullish reversal signal',
          descriptionAr: 'قاع ملقاط — إشارة انعكاس صعودي',
        });
      }
    }

    // ── Rising Three Methods (ثلاث صاعد) ──
    if (candles.length >= 5) {
      const c4 = candles[last - 4];
      const c3 = candles[last - 3];
      const c2 = candles[last - 2];
      const c1 = candles[last - 1];
      const c0 = candles[last];
      const bigBull = c4.close > c4.open && (c4.close - c4.open) / c4.open > 0.01;
      const smallBodies = c3.close < c3.open && c2.close < c2.open && c1.close < c1.open;
      const insideRange = Math.max(c3.open, c3.close, c2.open, c2.close, c1.open, c1.close) < c4.close
        && Math.min(c3.open, c3.close, c2.open, c2.close, c1.open, c1.close) > c4.open;
      const finalBull = c0.close > c0.open && c0.close > c4.close;
      if (bigBull && smallBodies && insideRange && finalBull) {
        patterns.push({
          name: 'Rising Three Methods',
          nameAr: 'ثلاث صاعد',
          type: 'BULLISH',
          confidence: 75,
          description: 'Rising three methods — bullish continuation pattern',
          descriptionAr: 'ثلاث صاعد — نمط استمرار صعودي',
        });
      }
    }

    // ── Falling Three Methods (ثلاث هابط) ──
    if (candles.length >= 5) {
      const c4 = candles[last - 4];
      const c3 = candles[last - 3];
      const c2 = candles[last - 2];
      const c1 = candles[last - 1];
      const c0 = candles[last];
      const bigBear = c4.close < c4.open && (c4.open - c4.close) / c4.open > 0.01;
      const smallBodies = c3.close > c3.open && c2.close > c2.open && c1.close > c1.open;
      const insideRange = Math.max(c3.open, c3.close, c2.open, c2.close, c1.open, c1.close) < c4.open
        && Math.min(c3.open, c3.close, c2.open, c2.close, c1.open, c1.close) > c4.close;
      const finalBear = c0.close < c0.open && c0.close < c4.close;
      if (bigBear && smallBodies && insideRange && finalBear) {
        patterns.push({
          name: 'Falling Three Methods',
          nameAr: 'ثلاث هابط',
          type: 'BEARISH',
          confidence: 75,
          description: 'Falling three methods — bearish continuation pattern',
          descriptionAr: 'ثلاث هابط — نمط استمرار هبوطي',
        });
      }
    }

    // ── Marubozu (ماروبوزو) ──
    if (body / totalRange > 0.9 && totalRange > 0) {
      if (isBullish) {
        patterns.push({
          name: 'Bullish Marubozu',
          nameAr: 'ماروبوزو صعودي',
          type: 'BULLISH',
          confidence: 80,
          description: 'Bullish marubozu — strong buying pressure with no wicks',
          descriptionAr: 'ماروبوزو صعودي — ضغط شرائي قوي بلا ظلال',
        });
      } else {
        patterns.push({
          name: 'Bearish Marubozu',
          nameAr: 'ماروبوزو هبوطي',
          type: 'BEARISH',
          confidence: 80,
          description: 'Bearish marubozu — strong selling pressure with no wicks',
          descriptionAr: 'ماروبوزو هبوطي — ضغط بيعي قوي بلا ظلال',
        });
      }
    }

    return patterns;
  }

  // ═════════════════════════════════════════━━━━═════
  //  NEW — Smart Scoring Engine
  // ═════════════════════════════════════════━━═══════

  /**
   * Smart Scoring Engine
   * Multi-dimensional scoring combining trend, momentum, volatility, and volume
   */
  private _calculateSmartScore(
    technical: TechnicalAnalysisDto,
    stoch: StochResult | null,
    adx: AdxResult | null,
    ichimoku: IchimokuResult | null,
    obv: ObvResult | null,
    cci: CciResult | null,
    sar: ParabolicSarResult | null,
    quote: any,
    volumeProfile: VolumeProfileResult | null,
    divergence: DivergenceResult | null,
  ): SmartScore {
    const rsiValue = technical.rsi?.values?.[technical.rsi.values.length - 1] ?? null;

    // ── 1. Trend Dimension (strength 0-100, direction -1/+1) ──
    let trendStrength = 0;
    let trendDir = 0;

    if (adx) {
      if (adx.trendStrength === 'VERY_STRONG') trendStrength += 30;
      else if (adx.trendStrength === 'STRONG') trendStrength += 22;
      else if (adx.trendStrength === 'WEAK') trendStrength += 10;
      if (adx.trendDirection === 'BULLISH') trendDir += 1;
      else if (adx.trendDirection === 'BEARISH') trendDir -= 1;
    } else {
      trendStrength += 10;
    }

    if (ichimoku) {
      let ichimokuStrength = 0;
      if (ichimoku.priceVsCloud === 'ABOVE' || ichimoku.priceVsCloud === 'BELOW') ichimokuStrength = 30;
      else if (ichimoku.priceVsCloud === 'INSIDE') ichimokuStrength = 18;

      if (ichimoku.cloudColor === 'BULLISH' && ichimoku.priceVsCloud === 'ABOVE') trendDir += 1;
      else if (ichimoku.cloudColor === 'BEARISH' && ichimoku.priceVsCloud === 'BELOW') trendDir -= 1;
      else if (ichimoku.cloudColor === 'BULLISH' && ichimoku.priceVsCloud === 'INSIDE') trendDir += 0.5;
      else if (ichimoku.cloudColor === 'BEARISH' && ichimoku.priceVsCloud === 'INSIDE') trendDir -= 0.5;

      if (ichimoku.tkCross === 'BULLISH') { trendDir += 0.5; ichimokuStrength = Math.min(30, ichimokuStrength + 3); }
      else if (ichimoku.tkCross === 'BEARISH') { trendDir -= 0.5; ichimokuStrength = Math.min(30, ichimokuStrength + 3); }

      trendStrength += ichimokuStrength;
    } else {
      trendStrength += 15;
    }

    if (technical.ema && technical.ema.length >= 2) {
      const shortEma = technical.ema.find(e => e.period <= 12);
      const longEma = technical.ema.find(e => e.period >= 26);
      if (shortEma && longEma) {
        const shortLast = shortEma.values[shortEma.values.length - 1];
        const longLast = longEma.values[longEma.values.length - 1];
        const diff = (shortLast - longLast) / longLast;
        if (Math.abs(diff) > 0.005) {
          trendStrength += 20;
          trendDir += diff > 0 ? 1 : -1;
        } else {
          trendStrength += 10;
        }
      } else {
        trendStrength += 10;
      }
    } else {
      trendStrength += 10;
    }

    if (sar) {
      trendStrength += 20;
      trendDir += sar.trend === 'RISING' ? 0.5 : -0.5;
    } else {
      trendStrength += 10;
    }

    trendStrength = Math.min(100, Math.max(0, trendStrength));
    const trendDirection = trendDir > 0.5 ? 1 : trendDir < -0.5 ? -1 : 0;
    const trendScore = trendStrength;

    // ── 2. Momentum Dimension (strength 0-100, direction -1/+1) ──
    let momentumStrength = 0;
    let momentumDir = 0;

    if (rsiValue !== null) {
      if (rsiValue < 20) { momentumStrength += 25; momentumDir += 1; }
      else if (rsiValue < 30) { momentumStrength += 22; momentumDir += 0.8; }
      else if (rsiValue < 45) { momentumStrength += 18; momentumDir += 0.3; }
      else if (rsiValue < 55) { momentumStrength += 10; }
      else if (rsiValue < 70) { momentumStrength += 18; momentumDir -= 0.3; }
      else if (rsiValue < 80) { momentumStrength += 22; momentumDir -= 0.8; }
      else { momentumStrength += 25; momentumDir -= 1; }
    } else {
      momentumStrength += 12;
    }

    if (technical.macd) {
      const histogram = technical.macd.histogram?.slice(-1)[0] ?? 0;
      const crossover = technical.macd.crossover;
      if (crossover === 'BULLISH_CROSSOVER') { momentumStrength += 25; momentumDir += 1; }
      else if (crossover === 'BEARISH_CROSSOVER') { momentumStrength += 25; momentumDir -= 1; }
      else if (Math.abs(histogram) > 0) {
        momentumStrength += 15;
        momentumDir += histogram > 0 ? 0.3 : -0.3;
      } else {
        momentumStrength += 5;
      }
    } else {
      momentumStrength += 10;
    }

    if (stoch) {
      if (stoch.k < 20) { momentumStrength += 25; momentumDir += 0.8; }
      else if (stoch.k < 30) { momentumStrength += 20; momentumDir += 0.5; }
      else if (stoch.k > 80) { momentumStrength += 25; momentumDir -= 0.8; }
      else if (stoch.k > 70) { momentumStrength += 20; momentumDir -= 0.5; }
      else { momentumStrength += 15; }
    } else {
      momentumStrength += 12;
    }

    if (cci) {
      if (cci.value < -200) { momentumStrength += 25; momentumDir += 0.8; }
      else if (cci.interpretation === 'OVERSOLD') { momentumStrength += 22; momentumDir += 0.5; }
      else if (cci.value > 200) { momentumStrength += 25; momentumDir -= 0.8; }
      else if (cci.interpretation === 'OVERBOUGHT') { momentumStrength += 22; momentumDir -= 0.5; }
      else { momentumStrength += 15; }
    } else {
      momentumStrength += 12;
    }

    momentumStrength = Math.min(100, Math.max(0, momentumStrength));
    const momentumDirection = momentumDir > 0.5 ? 1 : momentumDir < -0.5 ? -1 : 0;
    const momentumScore = momentumStrength;

    // ── 3. Volatility Dimension (strength 0-100, no direction) ──
    let volatilityScore = 0;

    if (technical.atr) {
      if (technical.atr.volatilityLevel === 'HIGH') volatilityScore += 35;
      else if (technical.atr.volatilityLevel === 'NORMAL') volatilityScore += 20;
      else volatilityScore += 10;
    } else {
      volatilityScore += 15;
    }

    if (technical.bollingerBands) {
      const bandwidth = technical.bollingerBands.bandwidth?.slice(-1)[0] ?? 0;
      if (bandwidth > 0.04) volatilityScore += 35;
      else if (bandwidth > 0.02) volatilityScore += 25;
      else if (bandwidth > 0.01) volatilityScore += 15;
      else volatilityScore += 5;
    } else {
      volatilityScore += 15;
    }

    if (technical.bollingerBands) {
      if (technical.bollingerBands.position === 'ABOVE_UPPER'
        || technical.bollingerBands.position === 'BELOW_LOWER') {
        volatilityScore += 30;
      } else {
        volatilityScore += 15;
      }
    } else {
      volatilityScore += 10;
    }

    volatilityScore = Math.min(100, Math.max(0, volatilityScore));

    // ── 4. Volume Dimension (strength 0-100, direction) ──
    let volumeStrength = 0;
    let volumeDir = 0;

    if (obv) {
      if (obv.trend === 'RISING') { volumeStrength += 35; volumeDir += 1; }
      else if (obv.trend === 'FALLING') { volumeStrength += 35; volumeDir -= 1; }
      else { volumeStrength += 15; }
      if (obv.divergence === 'BULLISH_DIVERGENCE') { volumeStrength = Math.min(40, volumeStrength + 5); volumeDir += 0.5; }
      else if (obv.divergence === 'BEARISH_DIVERGENCE') { volumeStrength = Math.min(40, volumeStrength + 5); volumeDir -= 0.5; }
    } else {
      volumeStrength += 15;
    }

    const quoteVolume = quote.volume ?? 0;
    if (quoteVolume > 0) {
      const changePct = Math.abs(quote.changePercent ?? 0);
      if (changePct > 3) { volumeStrength += 30; volumeDir += (quote.changePercent ?? 0) > 0 ? 0.5 : -0.5; }
      else if (changePct > 1.5) { volumeStrength += 22; volumeDir += (quote.changePercent ?? 0) > 0 ? 0.3 : -0.3; }
      else if (changePct > 0.5) { volumeStrength += 15; }
      else { volumeStrength += 8; }
    } else {
      volumeStrength += 10;
    }

    if (volumeProfile) {
      const currentPrice = quote.price ?? 0;
      if (currentPrice >= volumeProfile.valueAreaLow && currentPrice <= volumeProfile.valueAreaHigh) {
        volumeStrength += 35;
      } else if (currentPrice > volumeProfile.valueAreaHigh) {
        volumeStrength += 22;
        volumeDir += 0.3;
      } else {
        volumeStrength += 18;
        volumeDir -= 0.3;
      }
    } else {
      volumeStrength += 15;
    }

    volumeStrength = Math.min(100, Math.max(0, volumeStrength));
    const volumeDirection = volumeDir > 0.5 ? 1 : volumeDir < -0.5 ? -1 : 0;
    const volumeScore = volumeStrength;

    // ── 5. Composite Score (-100 to +100) ──
    const weightedStrength = (trendStrength * 0.40 + momentumStrength * 0.30 + volumeStrength * 0.20 + volatilityScore * 0.10);
    const directionConsensus = (trendDirection * 0.40 + momentumDirection * 0.30 + volumeDirection * 0.20);
    const finalDirection = directionConsensus > 0.15 ? 1 : directionConsensus < -0.15 ? -1 : 0;
    const compositeScore = Math.round(Math.min(100, Math.max(-100, weightedStrength * finalDirection)));

    // ── 6. Signal Type Classification ──
    let signalType: SmartScore['signalType'];
    const hasDivergence = divergence && divergence.type !== 'NONE';
    const hasExtremeRsi = rsiValue !== null && (rsiValue < 30 || rsiValue > 70);
    const hasExtremeStoch = stoch !== null && (stoch.k < 20 || stoch.k > 80);

    if (trendStrength > 70 && momentumStrength > 50 && finalDirection !== 0) {
      signalType = 'STRONG_TREND';
    } else if (hasDivergence && (hasExtremeRsi || hasExtremeStoch)) {
      signalType = 'REVERSAL';
    } else if (volatilityScore > 70 && Math.abs(compositeScore) > 30 && volumeStrength > 60) {
      signalType = 'BREAKOUT';
    } else if (hasDivergence && !hasExtremeRsi && !hasExtremeStoch) {
      signalType = 'DIVERGENCE';
    } else if (volatilityScore < 30) {
      signalType = 'CONSOLIDATION';
    } else {
      signalType = 'CONSOLIDATION';
    }

    // ── 7. Confidence ──
    const indicatorCount = [rsiValue !== null, technical.macd !== null, technical.bollingerBands !== null,
      technical.atr !== null, stoch !== null, adx !== null, ichimoku !== null, obv !== null,
      cci !== null, sar !== null].filter(Boolean).length;
    const maxIndicators = 10;
    const dataQuality = Math.round((indicatorCount / maxIndicators) * 40);
    const dirVotes = [trendDirection, momentumDirection, volumeDirection].filter(d => d !== 0);
    const allAgree = dirVotes.length >= 2 && (dirVotes.every(d => d > 0) || dirVotes.every(d => d < 0));
    const agreementScore = allAgree ? 30 : Math.abs(compositeScore) > 60 ? 20 : Math.abs(compositeScore) > 30 ? 15 : 10;
    const divergenceBonus = hasDivergence ? 10 : 0;
    const confidence = Math.min(98, dataQuality + agreementScore + divergenceBonus + 20);

    // ── 8. Action Recommendation ──
    let action: SmartScore['action'];
    if (compositeScore >= 50 && confidence >= 70) action = 'STRONG_BUY';
    else if (compositeScore >= 20) action = 'BUY';
    else if (compositeScore <= -50 && confidence >= 70) action = 'STRONG_SELL';
    else if (compositeScore <= -20) action = 'SELL';
    else action = 'HOLD';

    // ── 9. Trade Timeframe ──
    let tradeTimeframe: SmartScore['tradeTimeframe'];
    if (volatilityScore > 70 && Math.abs(compositeScore) >= 40 && trendStrength > 60) {
      tradeTimeframe = 'SCALP';
    } else if (Math.abs(compositeScore) >= 60 && confidence >= 70) {
      tradeTimeframe = 'SWING';
    } else if (Math.abs(compositeScore) >= 40 && confidence >= 50) {
      tradeTimeframe = 'DAY';
    } else {
      tradeTimeframe = 'POSITION';
    }

    return {
      trendScore: Math.round(trendScore),
      momentumScore: Math.round(momentumScore),
      volatilityScore: Math.round(volatilityScore),
      volumeScore: Math.round(volumeScore),
      compositeScore,
      signalType,
      confidence: Math.round(confidence),
      action,
      tradeTimeframe,
    };
  }

  // ══════════════════════════════════════════
  //  PRIVATE HELPERS
  // ══════════════════════════════════════════

  private async _scanSymbol(
    symbol: string,
    name: string,
    category: MarketCategory,
    timeframe: string,
  ): Promise<ScannerItemDto | null> {
    try {
      const marketInfo = isMarketOpen(symbol);

      // Skip non-crypto symbols when market is closed
      if (!marketInfo.open && category !== MarketCategory.CRYPTO) {
        return null; // Don't show closed-market assets with $0 price
      }

      // Always fetch '1day' candles for sufficient historical data for MACD and other indicators
      // MACD needs minimum 35 bars (26 slow EMA + 9 signal), but we fetch more for accuracy
      const [quote, candles] = await Promise.all([
        this.aggregator.getAggregatedQuote(symbol).catch(() => null),
        this.aggregator.getAggregatedCandles(symbol, '1day').catch(() => []),
      ]);

      if (!quote || quote.price === 0) return null;

      let rsi: number | null = null;
      let macdSignal: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE' | null = null;
      let macdHistogram: number | null = null;
      let bollingerPosition: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN' | null = null;
      let stochK: number | null = null;
      let stochD: number | null = null;
      let adx: number | null = null;
      let atr: number | null = null;
      let atrVolatility: 'LOW' | 'NORMAL' | 'HIGH' | null = null;
      let technicalScore = this._quickScore(quote);
      let confidence = 25;
      let direction = this._classifyDirection(quote.changePercent);
      let signalClass = SignalClass.WATCH;
      let sparkline: number[] = [];
      let reasons: string[] = [];
      let reasonsAr: string[] = [];
      let smartScore: SmartScore | null = null;

      if (candles.length >= 35) {
        const analysis = await this.indicators.analyze(candles, symbol, timeframe);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const closes = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume);

        const stochResult = this._stochastic(highs, lows, closes);
        const adxResult = this._adx(highs, lows, closes);

        // New indicators for smart scoring
        const ichimokuResult = this._ichimoku(highs, lows, closes);
        const obvResult = this._obv(closes, volumes);
        const cciResult = this._cci(highs, lows, closes);
        const sarResult = this._parabolicSar(highs, lows);

        technicalScore = analysis.technicalScore;
        direction = this._scoreToDirection(technicalScore);
        confidence = this._calculateConfidence(analysis);

        rsi = analysis.rsi?.values?.[analysis.rsi.values.length - 1] ?? null;
        macdSignal = analysis.macd?.crossover ?? null;
        macdHistogram = analysis.macd?.histogram?.slice(-1)[0] ?? null;
        bollingerPosition = analysis.bollingerBands?.position ?? null;
        stochK = stochResult?.k ?? null;
        stochD = stochResult?.d ?? null;
        adx = adxResult?.adx ?? null;
        atr = analysis.atr?.values?.slice(-1)[0] ?? null;
        atrVolatility = analysis.atr?.volatilityLevel ?? null;
        signalClass = this._classifySignalClass(analysis, stochResult, adxResult);

        // Smart Score calculation
        const rsiValues = analysis.rsi?.values ?? closes;
        const divergenceResult = this._detectDivergence(closes, rsiValues, 'rsi');
        const volumeProfileResult = this._volumeProfile(highs, lows, closes, volumes);

        smartScore = this._calculateSmartScore(
          analysis, stochResult, adxResult,
          ichimokuResult, obvResult, cciResult, sarResult,
          quote, volumeProfileResult, divergenceResult,
        );

        // Sparkline from last 20 closes
        sparkline = candles.slice(-20).map(c => c.close);

        // Build reasons
        if (rsi !== null) {
          if (rsi < 30) { reasons.push('RSI Oversold'); reasonsAr.push('RSI تشبع بيعي'); }
          else if (rsi > 70) { reasons.push('RSI Overbought'); reasonsAr.push('RSI تشبع شرائي'); }
        }
        if (macdSignal === 'BULLISH_CROSSOVER') { reasons.push('MACD Bullish'); reasonsAr.push('MACD صعودي'); }
        else if (macdSignal === 'BEARISH_CROSSOVER') { reasons.push('MACD Bearish'); reasonsAr.push('MACD هبوطي'); }
        if (bollingerPosition === 'BELOW_LOWER') { reasons.push('BB Lower'); reasonsAr.push('بولنجر سفلي'); }
        else if (bollingerPosition === 'ABOVE_UPPER') { reasons.push('BB Upper'); reasonsAr.push('بولنجر علوي'); }
        if (stochResult?.interpretation === 'OVERSOLD') { reasons.push('Stoch Oversold'); reasonsAr.push('ستوكاستيك بيعي'); }
        else if (stochResult?.interpretation === 'OVERBOUGHT') { reasons.push('Stoch Overbought'); reasonsAr.push('ستوكاستيك شرائي'); }
        if (adxResult?.trendStrength === 'STRONG' || adxResult?.trendStrength === 'VERY_STRONG') {
          reasons.push(`Strong Trend (${adxResult.trendDirection})`);
          reasonsAr.push(`اتجاه قوي (${adxResult.trendDirection === 'BULLISH' ? 'صاعد' : 'هابط'})`);
        }
        // New indicator reasons
        if (ichimokuResult?.cloudColor === 'BULLISH' && ichimokuResult.priceVsCloud === 'ABOVE') {
          reasons.push('Above bullish cloud'); reasonsAr.push('فوق سحابة إتشيموكو صاعدة');
        } else if (ichimokuResult?.cloudColor === 'BEARISH' && ichimokuResult.priceVsCloud === 'BELOW') {
          reasons.push('Below bearish cloud'); reasonsAr.push('تحت سحابة إتشيموكو هابطة');
        }
        if (obvResult?.divergence === 'BULLISH_DIVERGENCE') {
          reasons.push('OBV Bullish Divergence'); reasonsAr.push('تباعد صعودي OBV');
        } else if (obvResult?.divergence === 'BEARISH_DIVERGENCE') {
          reasons.push('OBV Bearish Divergence'); reasonsAr.push('تباعد هبوطي OBV');
        }
        if (cciResult?.interpretation === 'OVERSOLD') {
          reasons.push('CCI Oversold'); reasonsAr.push('CCI تشبع بيعي');
        } else if (cciResult?.interpretation === 'OVERBOUGHT') {
          reasons.push('CCI Overbought'); reasonsAr.push('CCI تشبع شرائي');
        }
        if (divergenceResult?.type === 'BULLISH') {
          reasons.push('Bullish RSI Divergence'); reasonsAr.push('تباعد صعودي RSI');
        } else if (divergenceResult?.type === 'BEARISH') {
          reasons.push('Bearish RSI Divergence'); reasonsAr.push('تباعد هبوطي RSI');
        }
      }

      // Derive lightweight AI opinion from smartScore (no extra API call)
      let aiOpinion: string | null = null;
      if (smartScore) {
        const actionMap: Record<string, string> = {
          'STRONG_BUY': 'إجماع الذكاء الاصطناعي: شراء قوي',
          'BUY': 'إجماع الذكاء الاصطناعي: شراء',
          'HOLD': 'إجماع الذكاء الاصطناعي: انتظار',
          'SELL': 'إجماع الذكاء الاصطناعي: بيع',
          'STRONG_SELL': 'إجماع الذكاء الاصطناعي: بيع قوي',
        };
        aiOpinion = actionMap[smartScore.action] ?? null;
      }

      return {
        symbol,
        name,
        category,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        high: quote.high,
        low: quote.low,
        rsi: rsi !== null ? Math.round(rsi * 100) / 100 : null,
        macdSignal,
        macdHistogram: macdHistogram !== null ? Math.round(macdHistogram * 100) / 100 : null,
        bollingerPosition,
        stochK: stochK !== null ? Math.round(stochK * 100) / 100 : null,
        stochD: stochD !== null ? Math.round(stochD * 100) / 100 : null,
        adx,
        atr: atr !== null ? Math.round(atr * 100) / 100 : null,
        atrVolatility,
        direction,
        signalClass,
        technicalScore,
        confidence,
        smartScore,
        aiOpinion,
        sparkline,
        reasons,
        reasonsAr,
        marketOpen: marketInfo.open,
        source: quote.primarySource || 'Aggregated',
        timestamp: new Date(),
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Failed to scan ${symbol}: ${msg}`);
      return null;
    }
  }

  private _quickScore(quote: any): number {
    const change = quote.changePercent || 0;
    if (change > 3) return 60;
    if (change > 1.5) return 35;
    if (change > 0.5) return 15;
    if (change > -0.5) return 0;
    if (change > -1.5) return -15;
    if (change > -3) return -35;
    return -60;
  }

  private _classifyDirection(changePercent: number): SignalDirection;
  private _classifyDirection(score: number, isTechnicalScore?: boolean): SignalDirection;
  private _classifyDirection(scoreOrChange: number, isTechnicalScore = false): SignalDirection {
    const s = isTechnicalScore ? scoreOrChange : this._quickScore({ changePercent: scoreOrChange });
    if (s >= 50) return SignalDirection.STRONG_BUY;
    if (s >= 15) return SignalDirection.BUY;
    if (s <= -50) return SignalDirection.STRONG_SELL;
    if (s <= -15) return SignalDirection.SELL;
    return SignalDirection.NEUTRAL;
  }

  private _scoreToDirection(score: number): SignalDirection {
    if (score >= 50) return SignalDirection.STRONG_BUY;
    if (score >= 15) return SignalDirection.BUY;
    if (score <= -50) return SignalDirection.STRONG_SELL;
    if (score <= -15) return SignalDirection.SELL;
    return SignalDirection.NEUTRAL;
  }

  private _classifySignalClass(
    technical: any,
    stoch: StochResult | null,
    adx: AdxResult | null,
  ): SignalClass {
    if (!technical) return SignalClass.WATCH;

    const score = Math.abs(technical.technicalScore);
    const isStrongTrend = adx && (adx.trendStrength === 'STRONG' || adx.trendStrength === 'VERY_STRONG');

    // Breakout: high ATR volatility + strong directional move
    if (technical.atr?.volatilityLevel === 'HIGH' && score > 40) {
      return SignalClass.BREAKOUT;
    }

    // Reversion: RSI extremes or Stochastic extremes
    if (technical.rsi?.interpretation === 'OVERBOUGHT' || technical.rsi?.interpretation === 'OVERSOLD' ||
        stoch?.interpretation === 'OVERBOUGHT' || stoch?.interpretation === 'OVERSOLD') {
      return SignalClass.REVERSION;
    }

    // Trend: strong ADX + consistent EMA alignment
    if (isStrongTrend && score > 25) {
      return SignalClass.TREND;
    }

    // Consolidation: low volatility + neutral score
    if (technical.atr?.volatilityLevel === 'LOW' && score < 20) {
      return SignalClass.CONSOLIDATION;
    }

    // Default: trend if directional, watch otherwise
    return score > 15 ? SignalClass.TREND : SignalClass.WATCH;
  }

  private _calculateConfidence(analysis: any): number {
    let confidence = 30;

    // More indicators = higher confidence
    if (analysis.rsi) confidence += 10;
    if (analysis.macd) confidence += 10;
    if (analysis.bollingerBands) confidence += 10;
    if (analysis.atr) confidence += 5;

    // Agreement between indicators increases confidence
    const score = Math.abs(analysis.technicalScore);
    if (score > 50) confidence += 15;
    else if (score > 30) confidence += 10;
    else if (score > 15) confidence += 5;

    // Strong crossover signals increase confidence
    if (analysis.macd?.crossover !== 'NONE') confidence += 10;

    return Math.min(98, confidence);
  }

  private _scoreToAlignment(score: number): 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' {
    if (score >= 40) return 'STRONG_BULLISH';
    if (score >= 15) return 'BULLISH';
    if (score <= -40) return 'STRONG_BEARISH';
    if (score <= -15) return 'BEARISH';
    return 'NEUTRAL';
  }

  private _translateAlignment(alignment: string): string {
    const map: Record<string, string> = {
      'STRONG_BULLISH': 'Strong Bullish Alignment',
      'BULLISH': 'Bullish Alignment',
      'NEUTRAL': 'Mixed Signals',
      'BEARISH': 'Bearish Alignment',
      'STRONG_BEARISH': 'Strong Bearish Alignment',
    };
    return map[alignment] || 'Unknown';
  }

  private _generateExecutionHintAr(
    alignment: string,
    score: number,
    timeframes: TimeframeAnalysisDto[],
  ): string {
    const alignedCount = timeframes.filter(t =>
      (score > 0 && t.technicalScore > 0) || (score < 0 && t.technicalScore < 0)
    ).length;
    const total = timeframes.length;

    switch (alignment) {
      case 'STRONG_BULLISH':
        return `توافق صعودي قوي (${alignedCount}/${total} أطر زمنية) — فرصة شراء مفضلة مع وقف خسارة محكم`;
      case 'BULLISH':
        return `توافق صعودي (${alignedCount}/${total} أطر زمنية) — يمكن البحث عن فرصة شراء مع تأكيد إضافي`;
      case 'BEARISH':
        return `توافق هبوطي (${alignedCount}/${total} أطر زمنية) — يمكن البحث عن فرصة بيع مع تأكيد إضافي`;
      case 'STRONG_BEARISH':
        return `توافق هبوطي قوي (${alignedCount}/${total} أطر زمنية) — فرصة بيع مفضلة مع وقف خسارة محكم`;
      default:
        return `إشارات مختلطة (${alignedCount}/${total} متوافقة) — يُنصح بالانتظار حتى يتضح الاتجاه`;
    }
  }

  // ── Private: Daily AI Cost Tracking (Fix #5) ──

  /**
   * FIX #5: Get today's total AI cost from Redis accumulator.
   * Uses the same pattern as MarketScannerService for consistency.
   */
  private async _getScannerAIDailyCost(): Promise<number> {
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // Check if we need to reset the daily counter (new day)
      const storedDate = await this.redis.get(this.REDIS_SCANNER_AI_COST_DATE_KEY);
      if (storedDate !== today) {
        // New day — reset the accumulator
        await this.redis.set(this.REDIS_SCANNER_AI_COST_KEY, '0', 86400000); // 24h TTL
        await this.redis.set(this.REDIS_SCANNER_AI_COST_DATE_KEY, today, 86400000);
        return 0;
      }

      // Get accumulated cost from Redis
      const redisCost = await this.redis.get(this.REDIS_SCANNER_AI_COST_KEY);
      if (redisCost) {
        const cost = parseFloat(redisCost);
        if (!isNaN(cost) && cost > 0) return cost;
      }

      return 0;
    } catch {
      return 0; // If we can't check cost, allow the analysis
    }
  }

  /**
   * FIX #5: Add cost to the daily Redis accumulator after an AI analysis is performed.
   * Estimated cost: $0.02 per deepAnalysis() AI call (rough average across AI models).
   */
  private async _addScannerAICost(estimatedCostUsd: number): Promise<void> {
    try {
      const currentCost = await this._getScannerAIDailyCost();
      const newCost = currentCost + estimatedCostUsd;
      await this.redis.set(this.REDIS_SCANNER_AI_COST_KEY, newCost.toString(), 86400000);
      this.logger.debug(`💰 Scanner AI cost: +$${estimatedCostUsd.toFixed(4)} (total today: $${newCost.toFixed(2)})`);
    } catch {
      // Non-critical — don't block on cost tracking errors
    }
  }
}
