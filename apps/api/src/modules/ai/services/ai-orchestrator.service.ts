import { Injectable, Logger, Optional } from '@nestjs/common';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';
import { RagService } from './rag.service';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * Task → Model Routing Logic:
 * ┌──────────────────────┬─────────────────────────────────────┐
 * │ Task Type            │ Best Model                          │
 * ├──────────────────────┼─────────────────────────────────────┤
 * │ sentiment            │ Groq (fastest, real-time)           │
 * │ market_analysis      │ Gemini (creative, deep reasoning)   │
 * │ prediction           │ GLM-4 (Arabic-optimized, long ctx)  │
 * │ signal_generation    │ Gemini (structured output)          │
 * │ risk_analysis        │ GLM-4 (quantitative, Arabic)        │
 * │ general              │ Gemini (most capable)               │
 * └──────────────────────┴─────────────────────────────────────┘
 *
 * RAG Integration:
 * - Before sending to model, retrieves relevant context from news archive
 * - Context is prepended to the prompt for enriched responses
 *
 * Fallback chain: Primary → Secondary → Tertiary
 */
@Injectable()
export class AIOrchestratorService {
  private readonly logger = new Logger(AIOrchestratorService.name);

  /** Model routing configuration */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment: { primary: 'groq', fallback: ['glm', 'gemini'] },
    market_analysis: { primary: 'gemini', fallback: ['glm', 'groq'] },
    prediction: { primary: 'glm', fallback: ['gemini', 'groq'] },
    signal_generation: { primary: 'gemini', fallback: ['glm', 'groq'] },
    risk_analysis: { primary: 'glm', fallback: ['gemini', 'groq'] },
    general: { primary: 'gemini', fallback: ['groq', 'glm'] },
  };

  constructor(
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
    @Optional() private readonly ragService?: RagService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — routing tasks to optimal models');
    if (this.ragService) {
      this.logger.log('📚 RAG integration enabled — context retrieval active');
    }
  }

  /**
   * Analyze using the optimal AI model based on task type
   * Falls back to secondary models if the primary fails
   *
   * If RAG is available, retrieves relevant context before analysis
   */
  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Step 1: Retrieve RAG context if available
    const enrichedRequest = await this._enrichWithContext(request);

    // Step 2: Route to optimal model
    const routing = this.ROUTING[enrichedRequest.type] || this.ROUTING.general;
    const models = [routing.primary, ...routing.fallback];

    this.logger.debug(`🎼 Orchestrating ${enrichedRequest.type} → models: ${models.join(' → ')}`);

    // Try primary model, then fallbacks
    for (const model of models) {
      try {
        const response = await this._callModel(model, enrichedRequest);

        // If the model returned a stub (no API key), try the next one
        if (response.confidence === 0) {
          this.logger.debug(`⚠️ Model ${model} returned stub — trying next`);
          continue;
        }

        return response;
      } catch (error: any) {
        this.logger.warn(`❌ Model ${model} failed: ${error.message} — trying next`);
        continue;
      }
    }

    // All models failed or returned stubs
    return {
      model: 'Orchestrator/Fallback',
      content: '⚠️ جميع نماذج الذكاء الاصطناعي غير متاحة حالياً. يرجى التحقق من مفاتيح API في ملف .env',
      confidence: 0,
      processingTimeMs: 0,
      language: enrichedRequest.language || 'ar',
    };
  }

  /**
   * Perform a comprehensive consensus analysis using all available models as specialists
   * Returns a master analysis with individual votes and a consensus score
   */
  async getConsensusAnalysis(symbol: string): Promise<{
    consensusScore: number;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    masterStrategy: string;
  }> {
    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol}`);

    try {
      // Roles and their assigned models/prompts
      const roles = [
        { id: 'tech', name: 'المحلل الفني', model: 'gemini', prompt: `حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.` },
        { id: 'sent', name: 'محلل المشاعر', model: 'groq', prompt: `حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.` },
        { id: 'risk', name: 'خبير المخاطر', model: 'glm', prompt: `حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة المثالية.` },
        { id: 'macro', name: 'خبير الماكرو', model: 'gemini', prompt: `حلل الوضع الاقتصادي العام وتأثيره على ${symbol}.` },
        { id: 'pattern', name: 'خبير الأنماط', model: 'glm', prompt: `هل ترى أي أنماط تاريخية متكررة (Fractals) في حركة ${symbol} الحالية؟` },
        { id: 'exec', name: 'استراتيجي التنفيذ', model: 'groq', prompt: `ما هو أفضل توقيت (Entry Timing) للدخول في ${symbol} بناءً على السيولة؟` },
      ];

      // Call all roles in parallel
      const start = Date.now();
      const results = await Promise.allSettled(
        roles.map(async (role) => {
          const response = await this._callModel(role.model, {
            symbol,
            prompt: role.prompt,
            type: 'market_analysis',
            language: 'ar',
          });
          return { ...role, response };
        }),
      );

      const analyses: any[] = [];
      let buyWeight = 0;
      let sellWeight = 0;
      let totalConfidence = 0;

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value && res.value.response) {
          const { name, response } = res.value;
          
          if (response.confidence <= 0) continue;

          const content = response.content || '';
          
          // Simple heuristic to detect vote from content
          let vote: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
          const upperContent = content.toUpperCase();
          if (content.includes('شراء') || content.includes('صعود') || upperContent.includes('BUY') || upperContent.includes('BULLISH')) vote = 'BUY';
          else if (content.includes('بيع') || content.includes('هبوط') || upperContent.includes('SELL') || upperContent.includes('BEARISH')) vote = 'SELL';

          const conf = response.confidence || 0.5;
          if (vote === 'BUY') buyWeight += conf;
          else if (vote === 'SELL') sellWeight += conf;
          totalConfidence += conf;

          analyses.push({
            role: name,
            model: response.model,
            vote,
            confidence: Math.round(conf * 100),
            reason: content.slice(0, 300) + '...',
          });
        }
      }

      // Calculate consensus
      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let consensusScore = 0;

      if (totalConfidence > 0) {
        const buyPct = buyWeight / totalConfidence;
        const sellPct = sellWeight / totalConfidence;

        if (buyPct > 0.6) {
          recommendation = 'BUY';
          consensusScore = Math.round(buyPct * 100);
        } else if (sellPct > 0.6) {
          recommendation = 'SELL';
          consensusScore = Math.round(sellPct * 100);
        } else {
          recommendation = 'HOLD';
          consensusScore = Math.round((1 - Math.abs(buyPct - sellPct)) * 50);
        }
      }

      // Fallback for Master Strategy if Gemini fails or analyses is empty
      let masterStrategyContent = 'لم يتم التوصل لاستراتيجية موحدة حالياً.';
      
      if (analyses.length > 0) {
        try {
          const masterStrategy = await this.geminiService.analyze({
            symbol,
            prompt: `بناءً على تحليلات المجلس التالية، لخص الاستراتيجية النهائية للتداول على ${symbol} بالعربية بشكل احترافي ومختصر:\n${analyses.map(a => `${a.role}: ${a.vote} (${a.confidence}%)`).join('\n')}`,
            type: 'signal_generation',
            language: 'ar',
          });
          masterStrategyContent = masterStrategy.content;
        } catch (e) {
          this.logger.warn(`Failed to generate master strategy: ${e.message}`);
          masterStrategyContent = `إجماع المجلس: ${recommendation === 'BUY' ? 'شراء قوي' : recommendation === 'SELL' ? 'بيع قوي' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`;
        }
      }

      this.logger.log(`✅ Consensus achieved: ${recommendation} (${consensusScore}%) in ${Date.now() - start}ms`);

      return {
        consensusScore,
        recommendation,
        analyses,
        masterStrategy: masterStrategyContent,
      };

    } catch (error) {
      this.logger.error(`❌ AI Council failed: ${error.message}`, error.stack);
      return {
        consensusScore: 0,
        recommendation: 'HOLD',
        analyses: [],
        masterStrategy: 'خطأ في معالجة طلب إجماع النماذج.',
      };
    }
  }

  /**
   * Analyze with ALL models and combine results
   * Returns a comprehensive multi-model analysis
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    // Enrich with RAG context
    const enrichedRequest = await this._enrichWithContext(request);

    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type}`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
    ]);

    const analyses: AIAnalysisResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.confidence > 0) {
        analyses.push(result.value);
      }
    }

    const consensus =
      analyses.length > 0
        ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length} نماذج ذكاء اصطناعي`
        : 'لا توجد نماذج متاحة حالياً';

    return { analyses, consensus };
  }

  /**
   * Get available models and their status
   */
  getModelsStatus(): { model: string; available: boolean; specialty: string }[] {
    return [
      { model: 'Groq/Llama 3.3 70B', available: true, specialty: 'سرعة فائقة — تحليل المشاعر' },
      { model: 'GLM-4 (Zhipu AI)', available: true, specialty: 'تحليل عربي — سياق طويل 200k' },
      { model: 'Gemini 2.0 Flash', available: true, specialty: 'تحليل إبداعي — استراتيجية' },
    ];
  }

  // ── Private: RAG Context ──

  /**
   * Enrich the analysis request with relevant context from the news archive
   */
  private async _enrichWithContext(request: AIAnalysisRequest): Promise<AIAnalysisRequest> {
    if (!this.ragService) {
      return request;
    }

    try {
      // Build a search query from the request
      const searchQuery = request.symbol
        ? `${request.symbol} ${request.prompt}`
        : request.prompt;

      const context = await this.ragService.retrieveRelevantContext(searchQuery, 5);

      if (!context || context.trim().length === 0) {
        return request;
      }

      // Prepend context to the prompt
      const enrichedPrompt = `📚 سياق من أرشيف الأخبار:\n${context}\n\n---\n\n${request.prompt}`;

      this.logger.debug(`📚 RAG context injected (${context.length} chars)`);

      return {
        ...request,
        prompt: enrichedPrompt,
      };
    } catch (error: any) {
      this.logger.warn(`RAG enrichment failed: ${error.message} — proceeding without context`);
      return request;
    }
  }

  // ── Private: Model Routing ──

  private async _callModel(
    model: string,
    request: AIAnalysisRequest,
  ): Promise<AIAnalysisResponse> {
    switch (model) {
      case 'groq':
        return this.groqService.analyze(request);
      case 'glm':
        return this.glmService.analyze(request);
      case 'gemini':
        return this.geminiService.analyze(request);
      default:
        return this.geminiService.analyze(request);
    }
  }
}
