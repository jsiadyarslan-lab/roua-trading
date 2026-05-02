import { Injectable, Logger } from '@nestjs/common';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { RagService } from '../ai/services/rag.service';
import { MarketDataAggregatorService } from './aggregator.service';
import { TechnicalIndicatorService } from './indicators.service';
import { AnalysisCardDto, AggregatedQuoteDto } from './analytics.types';
import { TechnicalAnalysisDto } from './analytics.types';

/**
 * Analytical AI Service — AI-Powered Market Analysis
 *
 * Combines multi-source market data aggregation, technical indicators,
 * and AI models (via AIOrchestratorService + RagService) to produce
 * comprehensive analysis cards for any given asset.
 *
 * Analysis Pipeline:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 1. Aggregated Market Data (MarketDataAggregatorService)       │
 * │    ↓                                                          │
 * │ 2. Technical Indicators (TechnicalIndicatorService)           │
 * │    ↓                                                          │
 * │ 3. RAG Context Retrieval (RagService)                        │
 * │    ↓                                                          │
 * │ 4. AI Analysis (AIOrchestratorService)                       │
 * │    ↓                                                          │
 * │ 5. AnalysisCard — combined output                            │
 * └────────────────────────────────────────────────────────────────┘
 *
 * The AnalysisCard contains:
 * - Current quote from aggregated sources
 * - Technical analysis (SMA, EMA, RSI, MACD, BB, ATR)
 * - AI-generated analysis text in Arabic
 * - Sentiment assessment
 * - Risk level evaluation
 * - Key factors identified
 */
@Injectable()
export class AnalyticalAIService {
  private readonly logger = new Logger(AnalyticalAIService.name);

  constructor(
    private readonly aggregator: MarketDataAggregatorService,
    private readonly indicators: TechnicalIndicatorService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly ragService: RagService,
  ) {
    this.logger.log('🧠 Analytical AI Service initialized — analysis pipeline ready');
  }

  /**
   * Analyze an asset — Full Analysis Pipeline
   *
   * Returns a comprehensive AnalysisCard with market data,
   * technical analysis, AI insights, and risk assessment.
   *
   * @param symbol Asset symbol (e.g., BTC/USDT, AAPL, EUR/USD)
   */
  async analyzeAsset(symbol: string): Promise<AnalysisCardDto> {
    this.logger.log(`🧠 Starting full analysis for ${symbol}`);
    const startTime = Date.now();

    // Step 1: Fetch aggregated market data
    let quote: AggregatedQuoteDto | null = null;
    try {
      quote = await this.aggregator.getAggregatedQuote(symbol);
      this.logger.debug(`📊 Quote fetched for ${symbol}: price=${quote.price}, sources=${quote.sources.join(',')}`);
    } catch (error: any) {
      this.logger.warn(`Failed to fetch quote for ${symbol}: ${error.message}`);
    }

    // Step 2: Fetch historical candles and compute technical indicators
    let technical: TechnicalAnalysisDto | null = null;
    try {
      const candles = await this.aggregator.getAggregatedCandles(symbol);
      if (candles.length >= 30) {
        technical = await this.indicators.analyze(candles, symbol);
        this.logger.debug(`📈 Technical analysis complete for ${symbol}: score=${technical.technicalScore}`);
      } else {
        this.logger.warn(`Not enough candles for ${symbol} (${candles.length} < 30)`);
      }
    } catch (error: any) {
      this.logger.warn(`Technical analysis failed for ${symbol}: ${error.message}`);
    }

    // Step 3: Retrieve RAG context
    let ragContext = '';
    try {
      ragContext = await this.ragService.retrieveRelevantContext(
        `${symbol} تحليل سوق تداول`,
        5,
      );
    } catch (error: any) {
      this.logger.warn(`RAG retrieval failed for ${symbol}: ${error.message}`);
    }

    // Step 4: Generate AI analysis
    const aiResult = await this._generateAiAnalysis(symbol, quote, technical, ragContext);

    // Step 5: Determine sentiment
    const sentiment = this._determineSentiment(quote, technical, aiResult.content);

    // Step 6: Calculate confidence
    const confidence = this._calculateConfidence(quote, technical, aiResult);

    // Step 7: Assess risk level
    const riskLevel = this._assessRiskLevel(quote, technical, aiResult.content);

    // Step 8: Extract key factors from AI analysis
    const keyFactors = this._extractKeyFactors(aiResult.content);

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `🧠 Analysis complete for ${symbol}: sentiment=${sentiment}, confidence=${confidence}, risk=${riskLevel} (${elapsed}ms)`,
    );

    return {
      symbol,
      timestamp: new Date(),
      quote,
      technical,
      aiAnalysis: aiResult.content,
      aiModel: aiResult.model,
      sentiment,
      confidence,
      keyFactors,
      riskLevel,
    };
  }

  // ── Private: AI Analysis Generation ──

  /**
   * Generate AI analysis using the orchestrator with enriched context
   */
  private async _generateAiAnalysis(
    symbol: string,
    quote: AggregatedQuoteDto | null,
    technical: TechnicalAnalysisDto | null,
    ragContext: string,
  ): Promise<{ content: string; model: string; confidence: number }> {
    // Build the analysis prompt
    const prompt = this._buildAnalysisPrompt(symbol, quote, technical, ragContext);

    try {
      const result = await this.orchestrator.analyze({
        prompt,
        type: 'market_analysis',
        symbol,
        language: 'ar',
      });

      return {
        content: result.content,
        model: result.model,
        confidence: result.confidence,
      };
    } catch (error: any) {
      this.logger.error(`AI analysis failed for ${symbol}: ${error.message}`);
      return {
        content: 'غير قادر على إنشاء تحليل في الوقت الحالي. يرجى المحاولة لاحقاً.',
        model: 'fallback',
        confidence: 0,
      };
    }
  }

  /**
   * Build the comprehensive analysis prompt for the AI model
   */
  private _buildAnalysisPrompt(
    symbol: string,
    quote: AggregatedQuoteDto | null,
    technical: TechnicalAnalysisDto | null,
    ragContext: string,
  ): string {
    const sections: string[] = [];

    sections.push(`أنت محلل مالي خبير في منصة "رؤى لربط الحسابات". قم بتحليل الأصل ${symbol} بشكل شامل ومفصل.`);

    // Market data section
    if (quote && quote.price > 0) {
      sections.push(`
📊 البيانات السوقية الحالية:
- السعر: ${quote.price} ${quote.currency}
- التغير: ${quote.changePercent}%
- أعلى سعر: ${quote.high}
- أدنى سعر: ${quote.low}
- الحجم: ${quote.volume}
- مصادر البيانات: ${quote.sources.join(', ')}
${quote.fiftyTwoWeekHigh ? `- أعلى سعر في 52 أسبوع: ${quote.fiftyTwoWeekHigh}` : ''}
${quote.fiftyTwoWeekLow ? `- أدنى سعر في 52 أسبوع: ${quote.fiftyTwoWeekLow}` : ''}`);
    }

    // Technical analysis section
    if (technical) {
      const rsiLatest = technical.rsi?.values?.slice(-1)[0]?.toFixed(1) || 'غير متاح';
      const macdSignal = technical.macd?.crossover || 'لا يوجد';
      const bbPosition = technical.bollingerBands?.position || 'ضمن النطاق';
      const atrLevel = technical.atr?.volatilityLevel || 'عادي';

      sections.push(`
📈 التحليل الفني:
- النتيجة الفنية: ${technical.technicalScore > 0 ? '+' : ''}${technical.technicalScore}
- عدد الشموع: ${technical.candleCount}
- RSI (14): ${rsiLatest} — ${technical.rsi?.interpretation || 'محايد'}
- MACD: ${macdSignal}
- بولنجر: ${bbPosition}
- ATR مستوى التقلب: ${atrLevel}
- ملخص: ${technical.summary}`);
    }

    // RAG context section
    if (ragContext) {
      sections.push(`
📰 سياق الأخبار والمستندات:
${ragContext}`);
    }

    // Instructions
    sections.push(`
أجب بالصيغة التالية:
1. نظرة عامة على ${symbol} والوضع الحالي
2. التحليل الفني — ماذا تقول المؤشرات
3. تحليل المشاعر والأخبار
4. مستوى المخاطرة
5. العوامل الرئيسية المؤثرة (اذكر 3-5 عوامل)
6. التوصية النهائية`);

    return sections.join('\n\n');
  }

  // ── Private: Sentiment Analysis ──

  /**
   * Determine overall sentiment from multiple signals
   */
  private _determineSentiment(
    quote: AggregatedQuoteDto | null,
    technical: TechnicalAnalysisDto | null,
    aiContent: string,
  ): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED' {
    const signals: number[] = [];

    // Price change signal
    if (quote && quote.changePercent !== 0) {
      if (quote.changePercent > 1) signals.push(1);
      else if (quote.changePercent > 0) signals.push(0.5);
      else if (quote.changePercent < -1) signals.push(-1);
      else if (quote.changePercent < 0) signals.push(-0.5);
    }

    // Technical score signal
    if (technical) {
      const normalizedScore = technical.technicalScore / 100;
      signals.push(normalizedScore);
    }

    // AI content sentiment (keyword-based)
    const positiveWords = ['صعود', 'ارتفاع', 'إيجابي', 'شراء', 'فرصة', 'نمو', 'اختراق'];
    const negativeWords = ['هبوط', 'انخفاض', 'سلبي', 'بيع', 'مخاطرة', 'تراجع', 'خسارة'];

    let aiScore = 0;
    for (const word of positiveWords) {
      if (aiContent.includes(word)) aiScore += 0.2;
    }
    for (const word of negativeWords) {
      if (aiContent.includes(word)) aiScore -= 0.2;
    }
    signals.push(Math.max(-1, Math.min(1, aiScore)));

    if (signals.length === 0) return 'NEUTRAL';

    const avg = signals.reduce((a, b) => a + b, 0) / signals.length;

    // Check for mixed signals
    const hasPositive = signals.some((s) => s > 0.3);
    const hasNegative = signals.some((s) => s < -0.3);
    if (hasPositive && hasNegative) return 'MIXED';

    if (avg > 0.3) return 'POSITIVE';
    if (avg < -0.3) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  // ── Private: Confidence Calculation ──

  /**
   * Calculate overall confidence (0-100) based on data availability and consistency
   */
  private _calculateConfidence(
    quote: AggregatedQuoteDto | null,
    technical: TechnicalAnalysisDto | null,
    aiResult: { content: string; model: string; confidence: number },
  ): number {
    let confidence = 0;
    let maxConfidence = 0;

    // Market data contribution (max 30)
    maxConfidence += 30;
    if (quote && quote.price > 0) {
      confidence += 15;
      if (quote.sources.length > 1) confidence += 10; // Cross-validated
      if (quote.volume > 0) confidence += 5;
    }

    // Technical analysis contribution (max 30)
    maxConfidence += 30;
    if (technical) {
      confidence += 10;
      if (technical.candleCount >= 50) confidence += 10;
      if (technical.rsi) confidence += 5;
      if (technical.macd) confidence += 5;
    }

    // AI analysis contribution (max 40)
    maxConfidence += 40;
    if (aiResult.confidence > 0) {
      confidence += Math.min(30, aiResult.confidence * 0.3);
      if (aiResult.model !== 'fallback') confidence += 10;
    }

    // Normalize to 0-100
    return Math.round(Math.min(100, (confidence / maxConfidence) * 100));
  }

  // ── Private: Risk Assessment ──

  /**
   * Assess risk level based on volatility, ATR, and technical signals
   */
  private _assessRiskLevel(
    quote: AggregatedQuoteDto | null,
    technical: TechnicalAnalysisDto | null,
    aiContent: string,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    let riskScore = 0;

    // Volatility from price change
    if (quote) {
      const absChange = Math.abs(quote.changePercent);
      if (absChange > 5) riskScore += 3;
      else if (absChange > 3) riskScore += 2;
      else if (absChange > 1) riskScore += 1;
    }

    // ATR-based volatility
    if (technical?.atr) {
      if (technical.atr.volatilityLevel === 'HIGH') riskScore += 3;
      else if (technical.atr.volatilityLevel === 'LOW') riskScore -= 1;
    }

    // Bollinger Bands position
    if (technical?.bollingerBands) {
      if (technical.bollingerBands.position === 'ABOVE_UPPER') riskScore += 2;
      if (technical.bollingerBands.position === 'BELOW_LOWER') riskScore += 2;
    }

    // RSI extreme
    if (technical?.rsi) {
      const latestRsi = technical.rsi.values.slice(-1)[0];
      if (latestRsi > 80 || latestRsi < 20) riskScore += 2;
    }

    // Content-based risk signals
    const riskKeywords = ['مخاطرة عالية', 'متقلب جداً', 'حذر', 'غير مستقر'];
    for (const kw of riskKeywords) {
      if (aiContent.includes(kw)) riskScore += 1;
    }

    // Map score to risk level
    if (riskScore >= 7) return 'EXTREME';
    if (riskScore >= 5) return 'HIGH';
    if (riskScore >= 2) return 'MEDIUM';
    return 'LOW';
  }

  // ── Private: Key Factors Extraction ──

  /**
   * Extract key factors from AI analysis text
   * Looks for numbered lists and bullet points
   */
  private _extractKeyFactors(aiContent: string): string[] {
    const factors: string[] = [];

    // Try to match numbered items like "1. ..." or "- ..."
    const patterns = [
      /(?:^|\n)\s*\d+[\.\)]\s*(.+)/g,
      /(?:^|\n)\s*[-•]\s*(.+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(aiContent)) !== null) {
        const factor = match[1].trim();
        if (factor.length > 10 && factor.length < 200) {
          factors.push(factor);
        }
      }
    }

    // If no structured list found, extract sentences with key terms
    if (factors.length === 0) {
      const keyTerms = ['مؤشر', 'سعر', 'حجم', 'اتجاه', 'مخاطرة', 'فرصة', 'دعم', 'مقاومة', 'تشبع', 'تقلب'];
      const sentences = aiContent.split(/[.。！!؟?]/).filter((s) => s.trim().length > 15);

      for (const term of keyTerms) {
        const matching = sentences.find(
          (s) => s.includes(term) && !factors.includes(s.trim()),
        );
        if (matching && factors.length < 5) {
          factors.push(matching.trim());
        }
      }
    }

    return factors.slice(0, 5);
  }
}
