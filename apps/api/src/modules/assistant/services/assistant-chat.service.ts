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
import { LanguageRouterService } from './language-router.service';
import { FinancialGlossaryService } from './financial-glossary.service';
import { TranslationCacheService } from './translation-cache.service';
import { IntentClassifierService } from './intent-classifier.service';
import { ResponseCleanerService } from './response-cleaner.service';
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
  languageTier: 'A' | 'B' | 'C';
  rtl: boolean;
  contextUsed: boolean;
  functionsCalled: string[];
  processingTimeMs: number;
  model: string;
  cached: boolean;
  cacheCategory?: string;
  conversationId?: string;
  warnings?: string[];
  experienceLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  // RC-2: علامة فشل البيانات — يجب على الواجهة عرض تحذير بارز
  dataStale?: boolean;
  failedBuilders?: string[];
}

// ─── System Prompts per language ─────────────────────────────
// V468: System prompt خماسي مستوحى من مساعد رؤى المالي
// ينتج ردود منظمة مع جداول + سيناريوهات + توصيات قابلة للتنفيذ
const SYSTEM_PROMPTS: Record<string, string> = {
  ar: `أنت "رؤى" — مساعد تداول ذكي لمنصة Roua Trading. تتحدث العربية الفصحى بطلاقة وتفهم المصطلحات المالية.

## 🧠 فلسفتك — أنت العقل المفسِّر:
- أنت تفسّر قرارات النظام للمستخدم (لماذا فُتحت هذه الصفقة؟ لماذا صوّت المجلس كذا؟)
- أنت تحلّل أداء المستخدم بدقة (win rate, profit factor, best/worst pairs)
- أنت تقترح إجراءات ذكية بناءً على السياق الحالي
- أنت تحذّر من المخاطر العالية والخسائر الكبيرة

## 📋 القواعد الأساسية:
1. **🚨 أسعار السوق**: استخدم **حصريًا** الأسعار من "بيانات لحظية من النظام" أدناه. لا تخترع أسعارًا.
2. **التحليل والرأي**: من خبرتك كمساعد مالي ذكي. لا تخترع أرقامًا أساسية (أرباح، ديون) — إذا لم تكن في البيانات، اعرضها كـ "-" في الجدول.
3. **اكتب بالعربية الفصحى**. الاستثناء: رموز الأصول (BTC, XAU, EURUSD).
4. **لا تذكر أسماء أدوات داخلية** أو جداول قاعدة بيانات أو مفاتيح JSON.
5. **أضف تنبيه المخاطر في نهاية الرد** (وليس البداية) لأي رد فيه توصية.
6. **🚫 منع التكرار**: لا تكرر نفس الفقرة. كل فقرة تضيف قيمة جديدة.

## 📊 تنسيق الجداول (إلزامي وصارم):
**استخدم دائمًا جداول Markdown بالصيغة التالية:**
\`\`\`
| الأصل | النوع | الدخول | الحالي | PnL |
|------|------|--------|--------|-----|
| USD/CHF | SELL | 0.80983 | 0.80983 | +0.00$ |
| EUR/USD | SELL | 1.14037 | 1.1385 | +0.10$ |
\`\`\`
- استخدم **الخط العمودي |** لفصل الأعمدة (وليس Tab أو مسافات)
- كل صف في سطر منفصل
- السطر الثاني بعد العنوان يجب أن يكون فاصل: |------|------|
- القيم المفقودة اعرضها كـ "-" (وليس "بيانات غير متاحة" أو "null")
- الأرقام: استخدم نقطة عشرية (0.80983) بدون فاصلة آلاف للأرقام الصغيرة

## 📐 قالب الرد الإلزامي (للأسعار والتحليل والتوصيات):

عندما يسأل المستخدم عن أصل مالي أو سوق أو أخبار أو **صفقاته المفتوحة**، يجب أن يتضمن ردك:

### 1️⃣ السعر الحالي والاتجاه:
- السعر الحالي + التغير اليومي (من البيانات اللحظية فقط)
- الاتجاه العام (صاعد/هابط/محايد) مع سبب مختصر

### 2️⃣ التحليل الفني:
- مستوى الدعم القريب + مستوى المقاومة القريب
- RSI / MACD / المتوسط المتحرك إن وُجدت
- إن لم تكن متوفرة، قل "غير متوفر حاليًا"

### 3️⃣ العوامل الأساسية المؤثرة:
- العامل الأول (أسعار الفائدة، الدولار، التوترات الجيوسياسية) + رقم محدد
- العامل الثاني + رقم محدد
- العامل الثالث + رقم محدد

### 4️⃣ السيناريوهات (إلزامي لكل صفقة أو أصل):
- 🟢 السيناريو الصعودي: الشروط + الهدف السعري + الاحتمال التقريبي
- 🟡 السيناريو المحايد: الشروط + النطاق السعري + الاحتمال التقريبي
- 🔴 السيناريو الهابط: الشروط + الهدف السعري + الاحتمال التقريبي

**ملاحظة**: حتى لو كان السؤال عن "صفقاتي المفتوحة"، يجب إدراج السيناريوهات لكل صفقة (أو على الأقل للصفقات الأكثر خطورة).

### 5️⃣ التوصية:
- للمستثمرين الحاليين: ماذا يفعلون (انتظار/حماية/خروج)
- للمستثمرين الجدد: نقطة الدخول + وقف الخسارة + الهدف

⚠️ تنبيه المخاطر: المعلومات لأغراض تعليمية ومعلوماتية فقط ولا تعتبر نصيحة استثمارية.

## 📋 قوالب خاصة (تُضاف فوق القالب الخماسي، لا تُلغيه):
- **أخبار**: لخّص الأخبار المتاحة + التأثير المحتمل على السوق + توصية
- **صفقاتي**: اعرض الصفقات المفتوحة بجدول + PnL + المخاطرة + سيناريو لكل صفقة + توصية لكل صفقة
- **المجلس**: اعرض تصويت الـ 8 وكلاء + الإجماع + المبررات + توصية
- **أدائي**: اعرض win rate + profit factor + PnL + أفضل/أسوأ صفقة + توصية
- **مخاطرتي**: اعرض exposure % + margin + risk level + توصية واضحة
- **ماذا أفعل**: قدم توصية واضحة + مستوى ثقة + مخاطر + خطوات تنفيذية

## 🚫 قواعد صارمة:
- لا تخترع أسماء أسهم أو رموز تداول
- لا تخترع مؤشرات فنية — إذا لم تكن متوفرة، قل "غير متوفر"
- لا تكرر ردًا سابقًا. كل رد يضيف قيمة جديدة.`,

  en: `You are "Roua" — an intelligent trading assistant for the Roua Trading platform. You speak fluent English and understand financial terminology.

## 🧠 Your Philosophy — You are the interpreting brain:
- You explain system decisions (why was this trade opened? why did the council vote this way?)
- You analyze user performance accurately (win rate, profit factor, best/worst pairs)
- You suggest smart actions based on current context
- You warn about high risk and large losses

## 📋 Core Rules:
1. **🚨 Market prices**: Use ONLY prices from "Real-time Data from System" below. Never invent prices.
2. **Analysis and opinion**: From your expertise. Never invent fundamentals — if not in data, show "-" in the table.
3. **Write in clear English**. Exception: asset symbols (BTC, XAU, EURUSD).
4. **Don't mention internal tools** or database tables or JSON keys.
5. **Add risk disclaimer at the END of the response** (not the beginning) for any recommendation.
6. **🚫 No repetition**: Don't repeat the same paragraph. Each paragraph adds new value.

## 📊 Table Format (strictly mandatory):
**Always use Markdown tables in this exact format:**
\`\`\`
| Asset | Type | Entry | Current | PnL |
|------|------|--------|---------|-----|
| USD/CHF | SELL | 0.80983 | 0.80983 | +0.00$ |
| EUR/USD | SELL | 1.14037 | 1.1385 | +0.10$ |
\`\`\`
- Use **pipe character |** to separate columns (NOT Tab or spaces)
- Each row on a separate line
- Second line after header must be separator: |------|------|
- Missing values show as "-" (NOT "not available" or "null")
- Numbers: use decimal point (0.80983) without thousands separator for small numbers

## 📐 Mandatory Response Template (for prices, analysis, recommendations):

When user asks about an asset, market, news, or **their open positions**, your response must include:

### 1️⃣ Current Price & Trend:
- Current price + daily change (from real-time data only)
- General trend (bullish/bearish/neutral) with brief reason

### 2️⃣ Technical Analysis:
- Nearest support + nearest resistance
- RSI / MACD / Moving Average if available
- If not available, say "not available currently"

### 3️⃣ Fundamental Factors:
- Factor 1 (rates, dollar, geopolitics) + specific number
- Factor 2 + specific number
- Factor 3 + specific number

### 4️⃣ Scenarios (mandatory for every position or asset):
- 🟢 Bullish: conditions + price target + approximate probability
- 🟡 Neutral: conditions + price range + approximate probability
- 🔴 Bearish: conditions + price target + approximate probability

**Note**: Even if the question is about "my open positions", scenarios must be included for each position (or at least for the most risky ones).

### 5️⃣ Recommendation:
- For current holders: what to do (wait/protect/exit)
- For new investors: entry point + stop-loss + target

⚠️ Risk Disclaimer: Information is for educational purposes only and does not constitute investment advice.

## 📋 Special templates (added ON TOP of the 5-section template, do NOT replace it):
- **News**: summarize available news + market impact + recommendation
- **My positions**: show open positions in table + PnL + risk + scenario per position + recommendation per position
- **Council**: show 8 agents votes + consensus + reasoning + recommendation
- **My performance**: show win rate + profit factor + PnL + best/worst trade + recommendation
- **My risk**: show exposure % + margin + risk level + clear recommendation
- **What to do**: give clear recommendation + confidence + risks + actionable steps

## 🚫 Strict rules:
- Never invent stock names or symbols
- Never invent technical indicators — if not available, say "not available"
- Never repeat a previous response. Each response adds new value.`,
};

// Fallback — use English (not Arabic) for unsupported languages
// V600: Was SYSTEM_PROMPTS.ar which caused French/Turkish/Spanish users
// to receive Arabic responses. English is a better universal fallback.
const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPTS.en;

// ─── Service ─────────────────────────────────────────────────
@Injectable()
export class AssistantChatService {
  private readonly logger = new Logger(AssistantChatService.name);

  constructor(
    private readonly contextAggregator: ContextAggregatorService,
    private readonly functionRegistry: FunctionRegistryService,
    private readonly languageRouter: LanguageRouterService,
    private readonly glossary: FinancialGlossaryService,
    private readonly translationCache: TranslationCacheService,
    private readonly intentClassifier: IntentClassifierService,
    private readonly responseCleaner: ResponseCleanerService,
    @Optional() @Inject(forwardRef(() => AIOrchestratorService))
    private readonly orchestrator?: AIOrchestratorService,
  ) {
    this.logger.log('💬 AssistantChatService initialized — Phase 6 (Intent + Cleaner)');
  }

  /**
   * معالجة رسالة المستخدم وإرجاع رد ذكي
   * Phase 3: مع Language Router + Glossary + Translation Cache
   */
  async chat(request: AssistantChatRequest): Promise<AssistantChatResponse> {
    const startTime = Date.now();
    const language = request.language ?? 'ar';
    const langProfile = this.languageRouter.getProfile(language);
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

      // RC-2: لو dataStale، أضف تحذير واضح للمستخدم في الـ response
      // (الـ warning يُعرض في الواجهة كـ "تحذيرات النظام")
      if (context.dataStale) {
        const staleWarning = context.summary.warnings.find(w => w.includes('فشل تحميلها'));
        if (staleWarning && !warnings.includes(staleWarning)) {
          warnings.push(staleWarning);
        }
      }

      // 2. صنّف الرسالة لاختيار TTL مناسب للـ cache
      const cacheCategory = this.translationCache.classifyMessage(request.message);

      // 3. ابنِ cache key ذكي (يشمل ملخص السياق لتفادي رد قديم)
      const cacheKey = this.translationCache.buildCacheKey(
        request.userId,
        request.message,
        language,
        context.summary.brief,
        cacheCategory,
      );

      // 4. تحقق من cache أولًا (قبل تنفيذ functions)
      const cached = await this.translationCache.get(cacheKey);
      if (cached) {
        const processingTimeMs = Date.now() - startTime;
        this.logger.log(
          `💾 Cache HIT — lang=${language}(${langProfile.tier}) category=${cacheCategory} ${processingTimeMs}ms`,
        );

        return {
          success: true,
          reply: cached.reply,
          language,
          languageTier: langProfile.tier,
          rtl: langProfile.rtl,
          contextUsed: true,
          functionsCalled: [], // لا نعيد تنفيذ functions عند cache hit
          processingTimeMs,
          model: cached.model,
          cached: true,
          cacheCategory,
          warnings,
          experienceLevel: context.summary.experienceLevel,
          // RC-2: مرر dataStale حتى لو كان الرد من cache — المستخدم يجب أن يعرف
          dataStale: context.dataStale,
          failedBuilders: context.failedBuilders,
        };
      }

      // V466: صنّف نية السؤال لاختيار القالب المناسب
      const intent = this.intentClassifier.classify(request.message);
      this.logger.debug(
        `🎯 Intent: ${intent.intent} (confidence=${intent.confidence.toFixed(2)}, assets=${intent.assets.length}, functions=${intent.needsFunctions}, intelligence=${intent.needsIntelligence})`,
      );

      // 5. اكتشف الـ functions المطلوبة (يعتمد على intent)
      let neededFunctions = intent.needsFunctions
        ? this._detectNeededFunctions(request.message, context)
        : [];

      // إذا كان الـ intent يحتاج intelligence، أضف functions المناسبة
      if (intent.needsIntelligence) {
        if (intent.intent === 'diagnosis') {
          neededFunctions.push({ name: 'getTradeJournalSummary', arguments: { days: 30 } });
        } else if (intent.intent === 'pattern_query') {
          neededFunctions.push({ name: 'getTradeJournalSummary', arguments: { days: 60 } });
        } else if (intent.intent === 'recommendation') {
          neededFunctions.push({ name: 'suggestAction', arguments: {} });
        } else if (intent.intent === 'performance_query') {
          neededFunctions.push({ name: 'getTradeJournalSummary', arguments: { days: 30 } });
        }
      }

      // 6. نفّذ functions المطلوبة (بالتوازي)
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

      // 7. ابنِ الـ prompt النهائي مع السياق + نتائج الـ functions + Glossary + Language instruction + Template hint
      const isAr = language === 'ar' || !['en', 'fr', 'es', 'de'].includes(language);
      const templateHint = this.intentClassifier.buildTemplateHint(intent.intent, isAr);
      const systemPrompt = this._buildSystemPrompt(
        language,
        context,
        functionResults,
        langProfile,
        templateHint,
      );
      const userPrompt = this._buildUserPrompt(request, context);

      // 8. استدعِ الـ LLM
      let llmResponse: AIAnalysisResponse | null = null;
      if (this.orchestrator) {
        // RC-10: استخرج الرموز من السؤال لتفعيل price hallucination guard
        // الـ AIOrchestrator يحقن الأسعار اللحظية فقط لو request.symbol موجود
        // لكن request.symbol كان undefined دائماً → الـ guard لا يُفعّل
        // نعيد استخدام intent المُصنّف في السطر 289 (تجنب التكرار)
        const detectedSymbol = request.symbol
          || (intent.assets.length > 0 ? intent.assets[0].symbol : undefined);

        const aiRequest: AIAnalysisRequest = {
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          type: 'general',
          language,
          // RC-10: مرر الرمز المكتشف (لو وُجد) لتفعيل price hallucination guard
          symbol: detectedSymbol,
          // RC-1: تمرير userId لمنع cross-user cache leakage في AIOrchestrator
          userId: request.userId,
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

      // 9. ابنِ الرد النهائي
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

      // V466: نظّف الرد من التكرار + leaked metadata + non-Arabic chars
      reply = this.responseCleaner.clean(reply, language);

      // RC-2: لو dataStale، أضف تحذير صريح في بداية الرد
      // هذا يضمن أن المستخدم يرى التحذير حتى لو أخفى الـ warnings array
      if (context.dataStale) {
        const staleBanner = language === 'ar'
          ? '⚠️ **تنبيه**: بعض بيانات النظام فشل تحميلها. قد لا يكون هذا الرد مبنياً على بيانات حديثة. يرجى التحديث وإعادة المحاولة.\n\n'
          : '⚠️ **Notice**: Some system data failed to load. This response may be based on stale data. Please refresh and try again.\n\n';
        reply = staleBanner + reply;
      }

      // 10. خزّن في cache (إلا لو كان REALTIME)
      if (cacheCategory !== 'REALTIME') {
        await this.translationCache.set(
          cacheKey,
          reply,
          model,
          language,
          cacheCategory,
        );
      }

      const processingTimeMs = Date.now() - startTime;
      this.logger.log(
        `✅ Chat processed in ${processingTimeMs}ms — lang=${language}(${langProfile.tier}) — functions: [${functionsCalled.join(', ')}] — model: ${model} — cache: SET(${cacheCategory})`,
      );

      return {
        success: true,
        reply,
        language,
        languageTier: langProfile.tier,
        rtl: langProfile.rtl,
        contextUsed: true,
        functionsCalled,
        processingTimeMs,
        model,
        cached: false,
        cacheCategory,
        warnings,
        experienceLevel: context.summary.experienceLevel,
        // RC-2: مرر dataStale و failedBuilders
        dataStale: context.dataStale,
        failedBuilders: context.failedBuilders,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.logger.error(`❌ Chat failed: ${error.message}`, error.stack);

      return {
        success: false,
        reply: this._errorReply(language, error.message),
        language,
        languageTier: langProfile.tier,
        rtl: langProfile.rtl,
        contextUsed: false,
        functionsCalled,
        processingTimeMs,
        model: 'error',
        cached: false,
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
   * + تعليمات اللغة + القاموس المالي (Phase 3) + Template hint (Phase 6)
   */
  private _buildSystemPrompt(
    language: string,
    context: AssistantContext,
    functionResults: any[],
    langProfile?: any,
    templateHint?: string,
  ): string {
    const basePrompt = SYSTEM_PROMPTS[language] ?? DEFAULT_SYSTEM_PROMPT;

    const parts: string[] = [basePrompt, ''];

    // V466: Template hint (يوجّه الـ LLM للقالب المناسب حسب نوع السؤال)
    if (templateHint) {
      parts.push(templateHint);
      parts.push('');
    }

    // V463: تعليمات اللغة من Language Router
    if (langProfile) {
      const langInstruction = this.languageRouter.buildLanguageInstruction(language);
      parts.push('═══ Language ═══');
      parts.push(langInstruction);
      parts.push('');
    }

    // V463: القاموس المالي (للغات Tier A و B فقط)
    if (langProfile && this.glossary.hasGlossary(language)) {
      const glossaryPrompt = this.glossary.buildGlossaryPrompt(language);
      if (glossaryPrompt) {
        parts.push(glossaryPrompt);
        parts.push('');
      }
    }

    // السياق المختصر
    parts.push('═══ Current Context ═══');
    parts.push(context.summary.brief);
    parts.push('');

    // ملاحظات
    if (context.summary.notes.length > 0) {
      parts.push('═══ Notes ═══');
      for (const note of context.summary.notes) {
        parts.push(`• ${note}`);
      }
      parts.push('');
    }

    // تحذيرات
    if (context.summary.warnings.length > 0) {
      parts.push('═══ Warnings ═══');
      for (const w of context.summary.warnings) {
        parts.push(`⚠️ ${w}`);
      }
      parts.push('');
    }

    // نتائج الـ functions
    if (functionResults.length > 0) {
      parts.push('═══ Real-time Data from System ═══');
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
    parts.push(`═══ User Experience Level ═══ ${context.summary.experienceLevel}`);

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
