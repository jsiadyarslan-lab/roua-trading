import { Injectable, Logger, Optional } from '@nestjs/common';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';
import { DeepSeekService } from './deepseek.service';
import { OpenAIService } from './openai.service';
import { ClaudeService } from './claude.service';
import { RagService } from './rag.service';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * 6 AI Models Available:
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Model            │ Specialty                                    │
 * ├──────────────────┼──────────────────────────────────────────────────┤
 * │ Groq/Llama 3.3   │ ⚡ Ultra-fast — sentiment, real-time          │
 * │ Gemini 2.0 Flash │ 💎 Creative — strategy, structured output     │
 * │ GLM-4 (Zhipu AI) │ 🧠 Arabic-optimized — long context 200k      │
 * │ DeepSeek-V3      │ 🔬 Deep reasoning — quantitative, math        │
 * │ GPT-4o (OpenAI)  │ 🤖 Versatile — multi-asset, macro synthesis   │
 * │ Claude 3.5       │ 🛡️ Safety-focused — risk, compliance          │
 * └──────────────────┴──────────────────────────────────────────────────┘
 *
 * Task → Model Routing Logic:
 * ┌──────────────────────┬──────────────────────────────────────────────┐
 * │ Task Type            │ Best Model + Fallback Chain                  │
 * ├──────────────────────┼──────────────────────────────────────────────┤
 * │ sentiment            │ Groq → GLM → DeepSeek                       │
 * │ market_analysis      │ Gemini → GPT-4o → DeepSeek → GLM            │
 * │ prediction           │ GLM-4 → DeepSeek → Gemini → GPT-4o          │
 * │ signal_generation    │ Gemini → GPT-4o → Groq → DeepSeek           │
 * │ risk_analysis        │ Claude → GLM-4 → DeepSeek → GPT-4o          │
 * │ general              │ Gemini → GPT-4o → Groq → GLM → DeepSeek     │
 * │ translation          │ Groq → GLM → DeepSeek → Gemini              │
 * └──────────────────────┴──────────────────────────────────────────────┘
 *
 * RAG Integration:
 * - Before sending to model, retrieves relevant context from news archive
 * - Context is prepended to the prompt for enriched responses
 *
 * Fallback chain: Primary → Secondary → Tertiary → etc.
 */
@Injectable()
export class AIOrchestratorService {
  private readonly logger = new Logger(AIOrchestratorService.name);

  /** Model routing configuration — 6 models */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment:       { primary: 'groq',     fallback: ['glm', 'deepseek', 'gemini', 'openai', 'claude'] },
    market_analysis: { primary: 'gemini',   fallback: ['openai', 'deepseek', 'glm', 'groq', 'claude'] },
    prediction:      { primary: 'glm',      fallback: ['deepseek', 'gemini', 'openai', 'groq', 'claude'] },
    signal_generation:{ primary: 'gemini',  fallback: ['openai', 'groq', 'deepseek', 'glm', 'claude'] },
    risk_analysis:   { primary: 'claude',   fallback: ['glm', 'deepseek', 'openai', 'gemini', 'groq'] },
    general:         { primary: 'gemini',   fallback: ['openai', 'groq', 'glm', 'deepseek', 'claude'] },
    translation:     { primary: 'groq',     fallback: ['glm', 'deepseek', 'gemini', 'openai', 'claude'] },
  };

  constructor(
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
    private readonly deepseekService: DeepSeekService,
    private readonly openaiService: OpenAIService,
    private readonly claudeService: ClaudeService,
    @Optional() private readonly ragService?: RagService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — 6 models available (Gemini, Groq, GLM-4, DeepSeek, GPT-4o, Claude)');
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
   * Perform a comprehensive consensus analysis using all 6 AI models as specialists
   * Returns a master analysis with individual votes and a consensus score
   */
  async getConsensusAnalysis(symbol: string): Promise<{
    consensusScore: number;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    masterStrategy: string;
  }> {
    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 6 models`);

    try {
      // 6 specialist roles distributed across 6 AI models
      const roles = [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',   prompt: `حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',     prompt: `حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'claude',   prompt: `حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة المثالية مع تقييم السيناريو الأسوأ.` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'openai',   prompt: `حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة العلاقات بين الأصول.` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'deepseek', prompt: `هل ترى أي أنماط تاريخية متكررة (Fractals) في حركة ${symbol} الحالية؟ حلل رياضياً.` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'glm',      prompt: `ما هو أفضل توقيت (Entry Timing) للدخول في ${symbol} بناءً على السيولة والسياق العربي؟` },
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

      // Master Strategy — try Gemini first, then OpenAI
      let masterStrategyContent = 'لم يتم التوصل لاستراتيجية موحدة حالياً.';
      
      if (analyses.length > 0) {
        try {
          const masterStrategy = await this.geminiService.analyze({
            symbol,
            prompt: `بناءً على تحليلات المجلس التالية من 6 نماذج AI، لخص الاستراتيجية النهائية للتداول على ${symbol} بالعربية بشكل احترافي ومختصر:\n${analyses.map(a => `${a.role} (${a.model}): ${a.vote} (${a.confidence}%)`).join('\n')}`,
            type: 'signal_generation',
            language: 'ar',
          });
          masterStrategyContent = masterStrategy.content;
        } catch {
          try {
            const masterStrategy = await this.openaiService.analyze({
              symbol,
              prompt: `بناءً على تحليلات المجلس التالية من 6 نماذج AI، لخص الاستراتيجية النهائية للتداول على ${symbol} بالعربية:\n${analyses.map(a => `${a.role} (${a.model}): ${a.vote} (${a.confidence}%)`).join('\n')}`,
              type: 'signal_generation',
              language: 'ar',
            });
            masterStrategyContent = masterStrategy.content;
          } catch {
            masterStrategyContent = `إجماع المجلس (6 نماذج): ${recommendation === 'BUY' ? 'شراء قوي' : recommendation === 'SELL' ? 'بيع قوي' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`;
          }
        }
      }

      this.logger.log(`✅ Consensus achieved: ${recommendation} (${consensusScore}%) from ${analyses.length}/6 models in ${Date.now() - start}ms`);

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
   * Analyze with ALL 6 models and combine results
   * Returns a comprehensive multi-model analysis
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    // Enrich with RAG context
    const enrichedRequest = await this._enrichWithContext(request);

    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type} — 6 models`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
      this.deepseekService.analyze(enrichedRequest),
      this.openaiService.analyze(enrichedRequest),
      this.claudeService.analyze(enrichedRequest),
    ]);

    const analyses: AIAnalysisResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.confidence > 0) {
        analyses.push(result.value);
      }
    }

    const consensus =
      analyses.length > 0
        ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length}/6 نماذج ذكاء اصطناعي`
        : 'لا توجد نماذج متاحة حالياً';

    return { analyses, consensus };
  }

  /**
   * Get available models and their status — 6 models
   */
  getModelsStatus(): { model: string; available: boolean; specialty: string }[] {
    return [
      { model: 'Groq/Llama 3.3 70B',   available: true, specialty: '⚡ سرعة فائقة — تحليل المشاعر والترجمة الفورية' },
      { model: 'GLM-4 (Zhipu AI)',      available: true, specialty: '🧠 تحليل عربي — سياق طويل 200k' },
      { model: 'Gemini 2.0 Flash',      available: true, specialty: '💎 تحليل إبداعي — استراتيجية ومنطق مهيكل' },
      { model: 'DeepSeek-V3',           available: true, specialty: '🔬 استدلال عميق — تحليل كمّي ورياضي' },
      { model: 'GPT-4o (OpenAI)',        available: true, specialty: '🤖 متعدد المهارات — ماكرو وتحليل الأصول المتقاطعة' },
      { model: 'Claude 3.5 Sonnet',      available: true, specialty: '🛡️ تركيز على السلامة — مخاطر وامتثال' },
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
      case 'deepseek':
        return this.deepseekService.analyze(request);
      case 'openai':
        return this.openaiService.analyze(request);
      case 'claude':
        return this.claudeService.analyze(request);
      default:
        return this.geminiService.analyze(request);
    }
  }
}
