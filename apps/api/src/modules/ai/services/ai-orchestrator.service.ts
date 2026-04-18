import { Injectable, Logger } from '@nestjs/common';
import { GroqService, AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { GlmService } from './glm.service';
import { GeminiService } from './gemini.service';

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
 * │ general              │ Gemini (most capable)               │
 * └──────────────────────┴─────────────────────────────────────┘
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
    general: { primary: 'gemini', fallback: ['groq', 'glm'] },
  };

  constructor(
    private readonly groqService: GroqService,
    private readonly glmService: GlmService,
    private readonly geminiService: GeminiService,
  ) {
    this.logger.log('🎼 AI Orchestrator initialized — routing tasks to optimal models');
  }

  /**
   * Analyze using the optimal AI model based on task type
   * Falls back to secondary models if the primary fails
   */
  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const routing = this.ROUTING[request.type] || this.ROUTING.general;
    const models = [routing.primary, ...routing.fallback];

    this.logger.debug(`🎼 Orchestrating ${request.type} → models: ${models.join(' → ')}`);

    // Try primary model, then fallbacks
    for (const model of models) {
      try {
        const response = await this._callModel(model, request);

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
      language: request.language || 'ar',
    };
  }

  /**
   * Analyze with ALL models and combine results
   * Returns a comprehensive multi-model analysis
   */
  async analyzeWithAllModels(request: AIAnalysisRequest): Promise<{
    analyses: AIAnalysisResponse[];
    consensus: string;
  }> {
    this.logger.debug(`🎼 Multi-model analysis for ${request.type}`);

    const results = await Promise.allSettled([
      this.groqService.analyze(request),
      this.glmService.analyze(request),
      this.geminiService.analyze(request),
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

  // ── Private ──

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
