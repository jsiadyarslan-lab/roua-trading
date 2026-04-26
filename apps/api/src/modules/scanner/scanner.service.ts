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
} from './scanner.types';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly aggregator: MarketDataAggregatorService,
    private readonly indicators: TechnicalIndicatorService,
    private readonly aiOrchestrator: AIOrchestratorService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🔍 Advanced Scanner Service initialized');
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
    const BATCH_SIZE = 5;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(s => this._scanSymbol(s.symbol, s.name, s.category, timeframe)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          items.push(result.value);
        }
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
        nextScanInSeconds: 60,
      },
    };

    // Cache for 60 seconds
    await this.redis.set(cacheKey, JSON.stringify(response), 60_000).catch(() => {});

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

    await this.redis.set(cacheKey, JSON.stringify(items), 60_000).catch(() => {});

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
      } catch (e) {
        this.logger.warn(`Failed to analyze ${symbol} on ${tf}: ${e.message}`);
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

        // Cache AI result for 5 minutes
        await this.redis.set(aiCacheKey, JSON.stringify({
          aiAnalysis, aiModel, aiSentiment, riskLevel,
        }), 300_000).catch(() => {});
      }
    } catch (e) {
      this.logger.warn(`AI analysis failed for ${symbol}: ${e.message}`);
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
        summary: technical?.summary ?? 'لا تتوفر بيانات كافية للتحليل',
      },
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

    const scanResult = await this.fullScan('1h');
    const items = scanResult.items;

    const bullishCount = items.filter(i =>
      i.direction === SignalDirection.BUY || i.direction === SignalDirection.STRONG_BUY
    ).length;
    const bearishCount = items.filter(i =>
      i.direction === SignalDirection.SELL || i.direction === SignalDirection.STRONG_SELL
    ).length;
    const neutralCount = items.filter(i => i.direction === SignalDirection.NEUTRAL).length;

    // Top gainers/losers from heatmap
    const heatmap = await this.heatmapData();
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
    const earlyTrend = (closes[closes.length - 15] - closes[closes.length - 20]) / closes[closes.length - 20];
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
    const bbRange = range / currentPrice;
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
        return {
          symbol,
          name,
          category,
          price: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          high: 0,
          low: 0,
          rsi: null,
          macdSignal: null,
          macdHistogram: null,
          bollingerPosition: null,
          stochK: null,
          stochD: null,
          adx: null,
          atr: null,
          atrVolatility: null,
          direction: SignalDirection.NEUTRAL,
          signalClass: SignalClass.WATCH,
          technicalScore: 0,
          confidence: 0,
          sparkline: [],
          reasons: ['السوق مغلق'],
          reasonsAr: ['السوق مغلق'],
          marketOpen: false,
          source: 'N/A',
          timestamp: new Date(),
        };
      }

      const [quote, candles] = await Promise.all([
        this.aggregator.getAggregatedQuote(symbol).catch(() => null),
        this.aggregator.getAggregatedCandles(symbol, timeframe).catch(() => []),
      ]);

      if (!quote) return null;

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

      if (candles.length >= 30) {
        const analysis = await this.indicators.analyze(candles, symbol, timeframe);
        const stochResult = this._stochastic(
          candles.map(c => c.high),
          candles.map(c => c.low),
          candles.map(c => c.close),
        );
        const adxResult = this._adx(
          candles.map(c => c.high),
          candles.map(c => c.low),
          candles.map(c => c.close),
        );

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
        rsi,
        macdSignal,
        macdHistogram,
        bollingerPosition,
        stochK,
        stochD,
        adx,
        atr,
        atrVolatility,
        direction,
        signalClass,
        technicalScore,
        confidence,
        sparkline,
        reasons,
        reasonsAr,
        marketOpen: marketInfo.open,
        source: quote.primarySource || 'Aggregated',
        timestamp: new Date(),
      };
    } catch (e) {
      this.logger.warn(`Failed to scan ${symbol}: ${e.message}`);
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
}
