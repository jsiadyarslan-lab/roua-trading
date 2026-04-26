import { Injectable, Logger, Optional } from '@nestjs/common';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';
import { HuggingFaceService } from './huggingface.service';
import { OllamaService } from './ollama.service';
import { BedrockService } from './bedrock.service';
import { RagService } from './rag.service';

/**
 * AI Orchestrator — Routes tasks to the optimal AI model
 *
 * 6 AI Models Available (using existing API keys):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Model                 │ Key                │ Specialty              │
 * ├───────────────────────┼────────────────────┼────────────────────────┤
 * │ Groq/Llama 3.3 70B   │ GROQ_API_KEY       │ ⚡ سرعة — مشاعر/ترجمة │
 * │ Gemini 2.0 Flash     │ GOOGLE_AI_STUDIO   │ 💎 إبداعي — استراتيجية│
 * │ GLM-4 (Zhipu AI)     │ GLM_API_KEY        │ 🧠 عربي — سياق طويل   │
 * │ HuggingFace/Mistral  │ HUGGINGFACE_API_KEY│ 🤗 مجاني — متنوع      │
 * │ Ollama/Qwen2.5       │ OLLAMA_API_KEY     │ 🏠 محلي — بدون تكلفة  │
 * │ Bedrock/Claude 3.5   │ AWS_ACCESS_KEY_ID  │ ☁️ مؤسسي — مخاطر/أمان │
 * └───────────────────────┴────────────────────┴────────────────────────┘
 *
 * Task → Model Routing:
 * ┌──────────────────────┬──────────────────────────────────────────────┐
 * │ Task Type            │ Best Model + Fallback Chain                  │
 * ├──────────────────────┼──────────────────────────────────────────────┤
 * │ sentiment            │ Groq → GLM → HuggingFace → Ollama           │
 * │ market_analysis      │ Gemini → Bedrock → GLM → HuggingFace        │
 * │ prediction           │ GLM → Ollama → Gemini → Bedrock             │
 * │ signal_generation    │ Gemini → Bedrock → Groq → GLM               │
 * │ risk_analysis        │ Bedrock → GLM → Ollama → Gemini             │
 * │ translation          │ Groq → GLM → Ollama → HuggingFace           │
 * │ general              │ Gemini → Groq → GLM → HuggingFace → Ollama  │
 * └──────────────────────┴──────────────────────────────────────────────┘
 */
@Injectable()
export class AIOrchestratorService {
  private readonly logger = new Logger(AIOrchestratorService.name);

  /** Circuit breaker: track 429 failures per model to avoid spamming */
  private readonly modelCooldowns = new Map<string, number>();
  private readonly COOLDOWN_MS = 60_000; // Skip model for 60s after 429

  /** Model routing — 6 models with smart fallbacks */
  private readonly ROUTING: Record<string, { primary: string; fallback: string[] }> = {
    sentiment:        { primary: 'groq',       fallback: ['glm', 'huggingface', 'ollama', 'gemini', 'bedrock'] },
    market_analysis:  { primary: 'gemini',     fallback: ['bedrock', 'glm', 'huggingface', 'ollama', 'groq'] },
    prediction:       { primary: 'glm',        fallback: ['ollama', 'gemini', 'bedrock', 'huggingface', 'groq'] },
    signal_generation:{ primary: 'gemini',     fallback: ['bedrock', 'groq', 'glm', 'huggingface', 'ollama'] },
    risk_analysis:    { primary: 'bedrock',    fallback: ['glm', 'ollama', 'gemini', 'huggingface', 'groq'] },
    translation:      { primary: 'groq',       fallback: ['glm', 'ollama', 'huggingface', 'gemini', 'bedrock'] },
    general:          { primary: 'gemini',     fallback: ['groq', 'glm', 'huggingface', 'ollama', 'bedrock'] },
  };

  constructor(
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
    private readonly huggingfaceService: HuggingFaceService,
    private readonly ollamaService: OllamaService,
    private readonly bedrockService: BedrockService,
    @Optional() private readonly ragService?: RagService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — 6 models (Groq, Gemini, GLM-4, HuggingFace, Ollama, Bedrock)');
    if (this.ragService) {
      this.logger.log('📚 RAG integration enabled — context retrieval active');
    }
  }

  /**
   * Analyze using the optimal AI model based on task type
   * Falls back through the model chain if primary fails
   */
  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const enrichedRequest = await this._enrichWithContext(request);
    const routing = this.ROUTING[enrichedRequest.type] || this.ROUTING.general;
    const models = [routing.primary, ...routing.fallback];

    this.logger.debug(`🎼 Orchestrating ${enrichedRequest.type} → models: ${models.join(' → ')}`);

    for (const model of models) {
      // Circuit breaker: skip models that recently returned 429
      const cooldownUntil = this.modelCooldowns.get(model) || 0;
      if (Date.now() < cooldownUntil) {
        continue; // Skip this model — still in cooldown
      }

      try {
        const response = await this._callModel(model, enrichedRequest);
        if (response.confidence === 0) {
          this.logger.debug(`⚠️ Model ${model} returned stub — trying next`);
          continue;
        }
        return response;
      } catch (error: any) {
        // If 429 (rate limited), put model in cooldown to prevent spam
        if (error.response?.status === 429 || error.message?.includes('429')) {
          this.modelCooldowns.set(model, Date.now() + this.COOLDOWN_MS);
          this.logger.warn(`🚫 Model ${model} rate-limited (429) — cooling down for ${this.COOLDOWN_MS / 1000}s`);
        } else {
          this.logger.warn(`❌ Model ${model} failed: ${error.message} — trying next`);
        }
        continue;
      }
    }

    return {
      model: 'Orchestrator/Fallback',
      content: '⚠️ جميع نماذج الذكاء الاصطناعي غير متاحة حالياً. يرجى التحقق من مفاتيح API في ملف .env',
      confidence: 0,
      processingTimeMs: 0,
      language: enrichedRequest.language || 'ar',
    };
  }

  /**
   * AI Council Consensus — 6 specialist roles across 6 models
   */
  async getConsensusAnalysis(symbol: string): Promise<{
    consensusScore: number;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    masterStrategy: string;
  }> {
    this.logger.log(`🎼 Initiating AI Council Consensus for ${symbol} — 6 models`);

    try {
      const roles = [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',     prompt: `حلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',       prompt: `حلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'bedrock',    prompt: `حدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'glm',        prompt: `حلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'huggingface',prompt: `هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'ollama',     prompt: `ما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المحلية؟` },
      ];

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

      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let consensusScore = 0;

      if (totalConfidence > 0) {
        const buyPct = buyWeight / totalConfidence;
        const sellPct = sellWeight / totalConfidence;
        if (buyPct > 0.6) { recommendation = 'BUY'; consensusScore = Math.round(buyPct * 100); }
        else if (sellPct > 0.6) { recommendation = 'SELL'; consensusScore = Math.round(sellPct * 100); }
        else { recommendation = 'HOLD'; consensusScore = Math.round((1 - Math.abs(buyPct - sellPct)) * 50); }
      }

      let masterStrategyContent = 'لم يتم التوصل لاستراتيجية موحدة حالياً.';
      if (analyses.length > 0) {
        try {
          const masterStrategy = await this.geminiService.analyze({
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

      this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/6 models in ${Date.now() - start}ms`);

      return { consensusScore, recommendation, analyses, masterStrategy: masterStrategyContent };
    } catch (error) {
      this.logger.error(`❌ AI Council failed: ${error.message}`, error.stack);
      return { consensusScore: 0, recommendation: 'HOLD', analyses: [], masterStrategy: 'خطأ في معالجة طلب إجماع النماذج.' };
    }
  }

  /**
   * Analyze with ALL 6 models
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    const enrichedRequest = await this._enrichWithContext(request);
    this.logger.debug(`🎼 Multi-model analysis for ${enrichedRequest.type} — 6 models`);

    const results = await Promise.allSettled([
      this.groqService.analyze(enrichedRequest),
      this.glmService.analyze(enrichedRequest),
      this.geminiService.analyze(enrichedRequest),
      this.huggingfaceService.analyze(enrichedRequest),
      this.ollamaService.analyze(enrichedRequest),
      this.bedrockService.analyze(enrichedRequest),
    ]);

    const analyses: AIAnalysisResponse[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.confidence > 0) {
        analyses.push(result.value);
      }
    }

    const consensus = analyses.length > 0
      ? `تم الحصول على ${analyses.length} تحليل من ${analyses.length}/6 نماذج ذكاء اصطناعي`
      : 'لا توجد نماذج متاحة حالياً';

    return { analyses, consensus };
  }

  /**
   * Get available models status — 6 models
   */
  getModelsStatus(): { model: string; available: boolean; specialty: string }[] {
    return [
      { model: 'Groq/Llama 3.3 70B',        available: true, specialty: '⚡ سرعة فائقة — تحليل المشاعر والترجمة الفورية' },
      { model: 'GLM-4 (Zhipu AI)',           available: true, specialty: '🧠 تحليل عربي — سياق طويل 200k' },
      { model: 'Gemini 2.0 Flash',           available: true, specialty: '💎 تحليل إبداعي — استراتيجية ومنطق مهيكل' },
      { model: 'HuggingFace/Mistral-7B',     available: true, specialty: '🤗 مجاني مفتوح المصدر — تحليل متنوع' },
      { model: 'Ollama/Qwen2.5',             available: true, specialty: '🏠 محلي بدون تكلفة — دعم عربي ممتاز' },
      { model: 'Bedrock/Claude 3.5 Sonnet',  available: true, specialty: '☁️ مؤسسي AWS — مخاطر وامتثال' },
    ];
  }

  // ── Private: RAG Context ──
  private async _enrichWithContext(request: AIAnalysisRequest): Promise<AIAnalysisRequest> {
    if (!this.ragService) return request;
    try {
      const searchQuery = request.symbol ? `${request.symbol} ${request.prompt}` : request.prompt;
      const context = await this.ragService.retrieveRelevantContext(searchQuery, 5);
      if (!context || context.trim().length === 0) return request;
      return { ...request, prompt: `📚 سياق من أرشيف الأخبار:\n${context}\n\n---\n\n${request.prompt}` };
    } catch (error: any) {
      this.logger.warn(`RAG enrichment failed: ${error.message}`);
      return request;
    }
  }

  // ── Private: Model Routing ──
  private async _callModel(model: string, request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    switch (model) {
      case 'groq':        return this.groqService.analyze(request);
      case 'glm':         return this.glmService.analyze(request);
      case 'gemini':      return this.geminiService.analyze(request);
      case 'huggingface': return this.huggingfaceService.analyze(request);
      case 'ollama':      return this.ollamaService.analyze(request);
      case 'bedrock':     return this.bedrockService.analyze(request);
      default:            return this.geminiService.analyze(request);
    }
  }
}
