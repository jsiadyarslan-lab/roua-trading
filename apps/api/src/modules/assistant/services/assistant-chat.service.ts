// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Chat Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "العقل المُحاور" — يحوّل سؤال المستخدم إلى رد ذكي
//
// التدفّق:
//   1. استقبل سؤال المستخدم + اللغة + (optional) symbol
//   2. اجمع السياق الكامل من ContextAggregator
//   3. ابنِ system prompt ذكي يحوي السياق المختصر
//   4. مرّر السؤال للـ LLM مع الـ function schemas
//   5. لو الـ LLM طلب functions، نفّذها وأعد الحقن
//   6. استقبل الرد النهائي وأعده للمستخدم
//   7. سجّل المحادثة (optional)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AIAnalysisRequest, AIAnalysisResponse } from '../../ai/services/groq.service';
import { ContextAggregatorService } from './context-aggregator.service';
import { FunctionRegistryService, AssistantFunctionCall } from './function-registry.service';
import { AssistantContext } from '../types/context.types';

// ─── Chat Types ──────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  functionCalls?: Array<{
    name: string;
    arguments: Record<string, any>;
    result?: any;
  }>;
}

export interface AssistantChatRequest {
  userId: string;
  message: string;
  language?: string;
  symbol?: string;
  conversationHistory?: ChatMessage[];
  skipContextCache?: boolean;
}

export interface AssistantChatResponse {
  success: boolean;
  reply: string;
  language: string;
  contextUsed: boolean;
  functionsCalled: string[];
  processingTimeMs: number;
  model: string;
  conversationId?: string;
  warnings?: string[];
  experienceLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

// ─── System Prompts per language ─────────────────────────────
const SYSTEM_PROMPTS: Record<string, string> = {
  ar: `أنت "رؤى" — مساعد تداول ذكي لمنصة Roua Trading. تتحدث العربية بطلاقة وتفهم المصطلحات المالية.

مهمتك:
1. تفسير قرارات النظام للمستخدم (لماذا فُتحت هذه الصفقة؟ لماذا صوّت المجلس كذا؟)
2. تحليل أداء المستخدم بدقة (win rate, profit factor, best/worst pairs)
3. اقتراح إجراءات ذكية بناءً على السياق الحالي
4. تحذير المستخدم من المخاطر العالية أو الخسائر الكبيرة
5. شرح مفاهيم التداول بوضوح للمبتدئين

مبادئك:
- لا تخترع أسعارًا أو أرقامًا — استخدم فقط البيانات المُحقنة في السياق
- إذا لم تعرف، قل "لا أعرف" بدلًا من الهلوسة
- اعتمد على الـ functions للحصول على بيانات لحظية
- اجعل ردك منظّمًا (عناوين فرعية + نقاط + جداول إن لزم)
- ركّز على القابلية للتنفيذ، لا التحليل النظري
- احترم مستوى خبرة المستخدم (BEGINNER/INTERMEDIATE/ADVANCED)`,

  en: `You are "Roua" — an intelligent trading assistant for the Roua Trading platform. You speak fluent English and understand financial terminology.

Your role:
1. Explain system decisions to the user (why was this trade opened? why did the council vote this way?)
2. Analyze user performance accurately (win rate, profit factor, best/worst pairs)
3. Suggest smart actions based on current context
4. Warn the user about high risk or large losses
5. Explain trading concepts clearly to beginners

Principles:
- Never invent prices or numbers — use only the data injected in the context
- If you don't know, say "I don't know" instead of hallucinating
- Use the functions to get real-time data
- Make your response organized (subheadings + bullets + tables if needed)
- Focus on actionability, not theoretical analysis
- Respect the user's experience level (BEGINNER/INTERMEDIATE/ADVANCED)`,
};

// Fallback لجميع اللغات الأخرى (نستخدم العربية كأساس)
const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPTS.ar;

// ─── Service ─────────────────────────────────────────────────
@Injectable()
export class AssistantChatService {
  private readonly logger = new Logger(AssistantChatService.name);

  constructor(
    private readonly contextAggregator: ContextAggregatorService,
    private readonly functionRegistry: FunctionRegistryService,
    @Optional() @Inject(forwardRef(() => AIOrchestratorService))
    private readonly orchestrator?: AIOrchestratorService,
  ) {
    this.logger.log('💬 AssistantChatService initialized');
  }

  /**
   * معالجة رسالة المستخدم وإرجاع رد ذكي
   */
  async chat(request: AssistantChatRequest): Promise<AssistantChatResponse> {
    const startTime = Date.now();
    const language = request.language ?? 'ar';
    const functionsCalled: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. اجمع السياق الكامل
      const context = await this.contextAggregator.getContext({
        userId: request.userId,
        symbol: request.symbol,
        language,
        skipCache: request.skipContextCache ?? false,
      });

      // أضف تحذيرات السياق
      if (context.summary.warnings.length > 0) {
        warnings.push(...context.summary.warnings);
      }

      // 2. اكتشف إن كان المستخدم يحتاج functions
      const neededFunctions = this._detectNeededFunctions(request.message, context);

      // 3. نفّذ functions المطلوبة (بالتوازي)
      let functionResults: any[] = [];
      if (neededFunctions.length > 0) {
        this.logger.debug(
          `🔧 Calling ${neededFunctions.length} functions: ${neededFunctions.map((f) => f.name).join(', ')}`,
        );
        const results = await this.functionRegistry.executeFunctions(
          neededFunctions,
          request.userId,
        );
        functionResults = results.map((r) => {
          functionsCalled.push(r.name);
          return {
            name: r.name,
            success: r.success,
            data: r.data,
            error: r.error,
          };
        });
      }

      // 4. ابنِ الـ prompt النهائي مع السياق + نتائج الـ functions
      const systemPrompt = this._buildSystemPrompt(language, context, functionResults);
      const userPrompt = this._buildUserPrompt(request, context);

      // 5. استدعِ الـ LLM
      let llmResponse: AIAnalysisResponse | null = null;
      if (this.orchestrator) {
        const aiRequest: AIAnalysisRequest = {
          prompt: userPrompt,
          type: 'general',
          language,
          symbol: request.symbol,
        };

        try {
          // استخدم analyze (مع caching + fallback عبر النماذج)
          llmResponse = await this.orchestrator.analyze(aiRequest);
        } catch (e) {
          this.logger.warn(`LLM analyze failed: ${e.message}`);
          // fallback لرد مبني على السياق فقط
          llmResponse = null;
        }
      }

      // 6. ابنِ الرد النهائي
      let reply: string;
      let model = 'unknown';

      if (llmResponse && llmResponse.content) {
        reply = llmResponse.content;
        model = llmResponse.model;
      } else {
        // fallback: رد منظم من السياق مباشرة (بدون LLM)
        reply = this._buildFallbackReply(request, context, functionResults, language);
        model = 'fallback-context-only';
      }

      const processingTimeMs = Date.now() - startTime;
      this.logger.log(
        `✅ Chat processed in ${processingTimeMs}ms — functions: [${functionsCalled.join(', ')}] — model: ${model}`,
      );

      return {
        success: true,
        reply,
        language,
        contextUsed: true,
        functionsCalled,
        processingTimeMs,
        model,
        warnings,
        experienceLevel: context.summary.experienceLevel,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.logger.error(`❌ Chat failed: ${error.message}`, error.stack);

      return {
        success: false,
        reply: this._errorReply(language, error.message),
        language,
        contextUsed: false,
        functionsCalled,
        processingTimeMs,
        model: 'error',
        warnings,
      };
    }
  }

  /**
   * يكتشف الـ functions المطلوبة بناءً على كلمات السؤال + السياق
   */
  private _detectNeededFunctions(
    message: string,
    context: AssistantContext,
  ): AssistantFunctionCall[] {
    const calls: AssistantFunctionCall[] = [];
    const lower = message.toLowerCase();
    const hasAr = /[\u0600-\u06FF]/.test(message);

    // helper للتحقق من وجود أي من الكلمات
    const hasAny = (words: string[]): boolean =>
      words.some((w) => lower.includes(w.toLowerCase()));

    // ── الصفقات المفتوحة ──
    if (
      hasAny([
        'open position', 'positions', 'trades open',
        'صفقات مفتوحة', 'صفقاتي', 'مراكزي', 'ما الذي افتحه',
      ])
    ) {
      calls.push({ name: 'getOpenPositions', arguments: {} });
    }

    // ── الصفقات المغلقة / السجل ──
    if (
      hasAny([
        'closed trades', 'history', 'past trades', 'last trades',
        'صفقات مغلقة', 'سجل', 'آخر صفقات', 'تاريخ',
      ])
    ) {
      calls.push({ name: 'getClosedTrades', arguments: { limit: 10 } });
    }

    // ── تصويت المجلس لرمز محدد ──
    if (
      hasAny([
        'council vote', 'why buy', 'why sell', 'why this direction',
        'تصويت', 'لماذا بيع', 'لماذا شراء', 'لماذا القرار',
      ]) &&
      request_symbol(context) // ← رمز محدد في السياق
    ) {
      calls.push({
        name: 'getCouncilVote',
        arguments: { symbol: context.userTrading.openPositions[0]?.symbol || context.council.activeBriefs[0]?.symbol },
      });
    }

    // ── إجماع المجلس ──
    if (
      hasAny([
        'council consensus', 'market overview', 'what does the council say',
        'إجماع', 'رأي المجلس', 'ماذا يقول المجلس',
      ])
    ) {
      calls.push({ name: 'getCouncilConsensus', arguments: {} });
    }

    // ── حلقة التعلم / الأداء ──
    if (
      hasAny([
        'performance', 'win rate', 'stats', 'how am i doing',
        'أداء', 'نسبة الفوز', 'إحصائيات', 'كيف أدائي',
      ])
    ) {
      calls.push({ name: 'getTradeJournalSummary', arguments: { days: 30 } });
    }

    // ── الذاكرة ──
    if (
      hasAny([
        'learned', 'lessons', 'memory', 'patterns learned',
        'تعلم', 'دروس', 'ذاكرة', 'أنماط',
      ])
    ) {
      calls.push({ name: 'getSystemMemory', arguments: {} });
    }

    // ── المخاطر ──
    if (
      hasAny([
        'risk', 'exposure', 'margin', 'how much at risk',
        'مخاطر', 'تعرض', 'هامش', 'كم المخاطرة',
      ])
    ) {
      calls.push({ name: 'getRiskMetrics', arguments: {} });
    }

    // ── الأخبار ──
    if (
      hasAny([
        'news', 'market news', 'headlines',
        'أخبار', 'العناوين', 'ماذا في الأخبار',
      ])
    ) {
      calls.push({ name: 'getNewsSentiment', arguments: { limit: 10 } });
    }

    // ── تفسير قرار صفقة محددة ──
    if (
      hasAny([
        'why this trade', 'explain trade', 'why opened',
        'لماذا هذه الصفقة', 'فسر الصفقة', 'لماذا فتحت',
      ]) &&
      context.userTrading.openPositions.length > 0
    ) {
      calls.push({
        name: 'explainDecision',
        arguments: { tradeId: context.userTrading.openPositions[0].id },
      });
    }

    // ── ماذا أفعل ──
    if (
      hasAny([
        'what should i do', 'recommendation', 'suggest', 'advice',
        'ماذا أفعل', 'توصية', 'اقترح', 'نصيحة',
      ])
    ) {
      calls.push({ name: 'suggestAction', arguments: {} });
    }

    // ── سياق السوق ──
    if (
      hasAny([
        'market', 'price', 'how is the market',
        'سوق', 'سعر', 'كيف السوق', 'حالة السوق',
      ])
    ) {
      calls.push({ name: 'getMarketContext', arguments: {} });
    }

    // حد أقصى 4 functions لكل رد (لتجنب التحميل الزائد)
    return calls.slice(0, 4);
  }

  /**
   * يبني الـ system prompt مع السياق المختصر + نتائج الـ functions
   */
  private _buildSystemPrompt(
    language: string,
    context: AssistantContext,
    functionResults: any[],
  ): string {
    const basePrompt = SYSTEM_PROMPTS[language] ?? DEFAULT_SYSTEM_PROMPT;

    const parts: string[] = [basePrompt, ''];

    // السياق المختصر
    parts.push('═══ السياق الحالي ═══');
    parts.push(context.summary.brief);
    parts.push('');

    // ملاحظات
    if (context.summary.notes.length > 0) {
      parts.push('═══ ملاحظات ═══');
      for (const note of context.summary.notes) {
        parts.push(`• ${note}`);
      }
      parts.push('');
    }

    // تحذيرات
    if (context.summary.warnings.length > 0) {
      parts.push('═══ تحذيرات ═══');
      for (const w of context.summary.warnings) {
        parts.push(`⚠️ ${w}`);
      }
      parts.push('');
    }

    // نتائج الـ functions
    if (functionResults.length > 0) {
      parts.push('═══ بيانات لحظية من النظام ═══');
      for (const fr of functionResults) {
        if (fr.success) {
          parts.push(`── ${fr.name} ──`);
          parts.push(JSON.stringify(fr.data, null, 2).slice(0, 3000)); // حد أقصى 3000 حرف
        } else {
          parts.push(`── ${fr.name} (FAILED) ──`);
          parts.push(`Error: ${fr.error}`);
        }
        parts.push('');
      }
    }

    // مستوى الخبرة
    parts.push(`═══ مستوى المستخدم ═══ ${context.summary.experienceLevel}`);

    return parts.join('\n');
  }

  /**
   * يبني الـ user prompt النهائي
   */
  private _buildUserPrompt(
    request: AssistantChatRequest,
    context: AssistantContext,
  ): string {
    const parts: string[] = [];

    // الرسالة الحالية
    parts.push(`سؤال المستخدم: ${request.message}`);
    parts.push('');

    // تاريخ المحادثة (آخر 5 رسائل)
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      parts.push('═══ سياق المحادثة (آخر 5 رسائل) ═══');
      const recent = request.conversationHistory.slice(-5);
      for (const msg of recent) {
        const role = msg.role === 'user' ? 'مستخدم' : 'مساعد';
        parts.push(`${role}: ${msg.content.slice(0, 500)}`);
      }
      parts.push('');
    }

    parts.push('رجاءً قدّم ردًّا مفيدًا، دقيقًا، وقابلًا للتنفيذ.');

    return parts.join('\n');
  }

  /**
   * يبني ردًّا منظمًا من السياق فقط (fallback عند فشل LLM)
   */
  private _buildFallbackReply(
    request: AssistantChatRequest,
    context: AssistantContext,
    functionResults: any[],
    language: string,
  ): string {
    const isAr = language === 'ar' || !SYSTEM_PROMPTS[language];
    const parts: string[] = [];

    if (isAr) {
      parts.push(`**حالة حسابك الحالية:**`);
      parts.push('');
      parts.push(`📊 **ملخص سريع:**`);
      parts.push(`• صفقات مفتوحة: ${context.userTrading.positionSummary.count}`);
      parts.push(`• رصيد معروض: $${context.userTrading.positionSummary.displayedBalance.toFixed(2)}`);
      parts.push(
        `• PnL غير محقق: $${context.userTrading.positionSummary.totalUnrealizedPnl.toFixed(2)}`,
      );
      parts.push(
        `• مخاطرة: ${context.userTrading.positionSummary.riskExposurePercent.toFixed(1)}% (${context.systemHealth.riskLevel})`,
      );
      parts.push('');

      if (context.userTrading.openPositions.length > 0) {
        parts.push(`📈 **صفقاتك المفتوحة:**`);
        for (const p of context.userTrading.openPositions.slice(0, 5)) {
          parts.push(
            `• ${p.symbol} ${p.side} — دخول: ${p.entryPrice} | حالي: ${p.currentPrice} | PnL: ${p.unrealizedPnl.toFixed(2)}$ (${p.unrealizedPnlPercent.toFixed(2)}%)`,
          );
        }
        parts.push('');
      }

      if (context.council.activeBriefs.length > 0) {
        parts.push(
          `🏛️ **المجلس:** ${context.council.consensusStats.bullishCount} BUY / ${context.council.consensusStats.bearishCount} SELL / ${context.council.consensusStats.neutralCount} NEUTRAL (ثقة متوسطة: ${context.council.consensusStats.avgConfidence}%)`,
        );
        parts.push('');
      }

      if (context.summary.warnings.length > 0) {
        parts.push(`⚠️ **تحذيرات:**`);
        for (const w of context.summary.warnings) {
          parts.push(`• ${w}`);
        }
        parts.push('');
      }

      parts.push(`📅 **إحصائيات اليوم:**`);
      parts.push(
        `• صفقات: ${context.userTrading.todayStats.tradesClosed} مغلقة (${context.userTrading.todayStats.winRate}% فوز)`,
      );
      parts.push(`• صافي PnL: $${context.userTrading.todayStats.netPnl.toFixed(2)}`);
      parts.push('');
      parts.push(
        `**ملاحظة:** المساعد يعمل في وضع محدود (بدون LLM). هذه بياناتك الحية من النظام.`,
      );
    } else {
      parts.push(`**Your current account status:**`);
      parts.push('');
      parts.push(`📊 **Quick summary:**`);
      parts.push(`• Open positions: ${context.userTrading.positionSummary.count}`);
      parts.push(`• Displayed balance: $${context.userTrading.positionSummary.displayedBalance.toFixed(2)}`);
      parts.push(`• Unrealized PnL: $${context.userTrading.positionSummary.totalUnrealizedPnl.toFixed(2)}`);
      parts.push(`• Risk: ${context.userTrading.positionSummary.riskExposurePercent.toFixed(1)}% (${context.systemHealth.riskLevel})`);
      parts.push('');
      parts.push(`**Note:** Assistant is in fallback mode (no LLM). This is your live data from the system.`);
    }

    return parts.join('\n');
  }

  /**
   * رد خطأ منظم
   */
  private _errorReply(language: string, errorMessage: string): string {
    if (language === 'ar') {
      return `عذرًا، حدث خطأ أثناء معالجة سؤالك: ${errorMessage}

هذا خطأ مؤقت — حاول مرة أخرى. إذا تكرر، تحقق من حالة النظام.`;
    }
    return `Sorry, an error occurred while processing your question: ${errorMessage}

This is a temporary error — please try again. If it persists, check the system status.`;
  }
}

// helper function (مستخرجة لتفادي تكرار الكود)
function request_symbol(context: AssistantContext): string | null {
  return (
    context.userTrading.openPositions[0]?.symbol ||
    context.council.activeBriefs[0]?.symbol ||
    null
  );
}
