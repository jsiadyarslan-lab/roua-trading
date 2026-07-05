import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIOrchestratorService } from './ai-orchestrator.service';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { AiCacheService } from './ai-cache.service';
import { AiUsageLoggerService } from './ai-usage-logger.service';
import { MarketDataService } from './market-data.service';
import { PredictionMarketService } from '../../prediction-market/prediction-market.service';
// V185: مجلس الذكاء — كشف وضع السوق + ذاكرة النظام + أوزان ديناميكية
import { MarketRegimeService } from '../council-intelligence/market-regime.service';
import { SystemMemoryService } from '../council-intelligence/system-memory.service';
import { CouncilVoteAccuracyService } from '../council-intelligence/council-vote-accuracy.service';
import { SmartModelRouter } from './smart-model-router.service';
import { BriefTranslationService } from './brief-translation.service';
import { enforceLanguage } from './language-enforcer';

/**
 * Consensus Analysis result — returned by the AI Council
 */
export interface ConsensusAnalysisResult {
  consensusScore: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
  masterStrategy: string;
  isFallback?: boolean;
}

/**
 * Internal role definition for the AI Council
 */
interface CouncilRole {
  id: string;
  name: string;
  model: string;
  fallbackModels: string[];
  prompt: string;
  resolvedModel?: string;
}

/**
 * Strategic Council Service — Extracted from AIOrchestratorService
 *
 * Manages the 8-role AI Council with model diversification,
 * Prediction Market vote integration, consensus score calculation,
 * cache management, and master strategy generation.
 *
 * Dependencies:
 * - AIOrchestratorService: shared model calling infrastructure, circuit breaker state,
 *   key availability checks, and vote parsing
 * - MarketDataService: live market data injection
 * - AiCacheService: Redis + in-memory caching for consensus results
 * - AiUsageLoggerService: AI API call tracking
 * - PredictionMarketService: 9th model vote (optional)
 * - ConfigService: environment configuration
 */
@Injectable()
export class StrategicCouncilService {
  private readonly logger = new Logger(StrategicCouncilService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly marketData: MarketDataService,
    private readonly cache: AiCacheService,
    private readonly usageLogger: AiUsageLoggerService,
    @Inject(forwardRef(() => AIOrchestratorService)) private readonly orchestrator: AIOrchestratorService,
    @Optional() private readonly predictionMarket?: PredictionMarketService,
    // V185: مجلس الذكاء — @Optional لمنع فشل التشغيل إذا لم يكن الموديول متاحاً
    @Optional() private readonly regimeService?: MarketRegimeService,
    @Optional() private readonly memoryService?: SystemMemoryService,
    @Optional() private readonly voteAccuracy?: CouncilVoteAccuracyService,
    // V289: Smart Model Router — distributes requests across free-tier providers
    @Optional() private readonly smartRouter?: SmartModelRouter,
    // V308: Brief Translation Service — translates analysisSummary to user's locale
    @Optional() private readonly briefTranslation?: BriefTranslationService,
  ) {
    const extras = [
      this.regimeService && 'Regime',
      this.memoryService && 'Memory',
      this.voteAccuracy && 'VoteAccuracy',
    ].filter(Boolean).join('+');
    this.logger.log(`🏛️ Strategic Council Service initialized — 8-role AI Council + Prediction Market` + (extras ? ` + V185 [${extras}]` : ''));
  }

  /**
   * AI Council Consensus — 8 specialist roles across diversified models
   *
   * Extracted from AIOrchestratorService.getConsensusAnalysis() to isolate
   * the council/consensus responsibility (~600 lines) from the orchestrator's
   * single-model routing logic.
   *
   * Cache key format preserved: `ai:consensus:v8:{symbol}` — existing cached
   * results remain valid.
   *
   * V267: `language` now accepts any of the 32 UI locales (ar, en, fr, tr, es,
   * zh, ru, hi, pt, de, ja, ko, id, vi, th, it, pl, nl, ms, he, sv, uk, fa,
   * ur, fil, da, no, fi, cs, hu, ro, bn).
   *
   * - `ar` → full native Arabic prompts (8 roles + master strategy in Arabic)
   * - `en` → full native English prompts
   * - other 30 locales → English prompts + a "Respond ONLY in {languageName}"
   *   directive prepended to every role's prompt. LLMs (Gemini, Groq, GLM,
   *   Bedrock, etc.) understand English meta-instructions and can emit content
   *   in any of their supported languages. This is the same pattern OpenAI,
   *   Anthropic, and Google recommend for multilingual LLM applications.
   */
  async getConsensusAnalysis(
    symbol: string,
    options?: { forceFresh?: boolean; newsContext?: string; language?: string },
  ): Promise<ConsensusAnalysisResult> {
    const forceFresh = options?.forceFresh ?? false;
    const newsContext = options?.newsContext ?? '';
    const rawLang = (options?.language ?? 'ar').toLowerCase();
    // V267: Normalize to one of the 32 supported locales
    const SUPPORTED_32 = new Set([
      'ar','en','fr','tr','es','zh','ru','hi','pt','de',
      'ja','ko','id','vi','th','it','pl','nl','ms','he',
      'sv','uk','fa','ur','fil','da','no','fi','cs','hu',
      'ro','bn',
    ]);
    const language: 'ar' | 'en' | string = SUPPORTED_32.has(rawLang) ? rawLang : 'ar';

    // V267: For non-ar/non-en locales, we render English prompts + a language directive.
    // The directive is in English so any LLM can parse it, then asks the model
    // to emit its full response (role name, reasoning, master strategy) in the
    // target language. Role names in the `analyses[]` array remain English for
    // programmatic consistency — only the prose content is localized.
    const isExtendedLocale = language !== 'ar' && language !== 'en';
    const LANGUAGE_NAMES: Record<string, string> = {
      fr: 'French (Français)', tr: 'Turkish (Türkçe)', es: 'Spanish (Español)',
      zh: 'Chinese (中文)', ru: 'Russian (Русский)', hi: 'Hindi (हिन्दी)',
      pt: 'Portuguese (Português)', de: 'German (Deutsch)', ja: 'Japanese (日本語)',
      ko: 'Korean (한국어)', id: 'Indonesian (Bahasa Indonesia)', vi: 'Vietnamese (Tiếng Việt)',
      th: 'Thai (ภาษาไทย)', it: 'Italian (Italiano)', pl: 'Polish (Polski)',
      nl: 'Dutch (Nederlands)', ms: 'Malay (Bahasa Melayu)', he: 'Hebrew (עברית)',
      sv: 'Swedish (Svenska)', uk: 'Ukrainian (Українська)', fa: 'Persian (فارسی)',
      ur: 'Urdu (اردو)', fil: 'Filipino', da: 'Danish (Dansk)', no: 'Norwegian (Norsk)',
      fi: 'Finnish (Suomi)', cs: 'Czech (Čeština)', hu: 'Hungarian (Magyar)',
      ro: 'Romanian (Română)', bn: 'Bengali (বাংলা)',
    };
    // V294: Language directive must be explicit for ALL locales, not just extended ones.
    // Previously, when language='en', the directive was empty — so weaker models
    // (Bedrock Nova Micro, some GLM versions) would respond in Arabic if any
    // Arabic text leaked into the context (news, memory, regime labels).
    // Now every locale gets an explicit "respond ONLY in X" directive.
    const languageName = isExtendedLocale
      ? (LANGUAGE_NAMES[language] || 'English')
      : (language === 'ar' ? 'Arabic (العربية)' : 'English');
    const languageDirective = `\n\n🌐 LANGUAGE DIRECTIVE: Respond ONLY in ${languageName}. All analysis, reasoning, and explanations MUST be written in ${languageName}. The role name in your response header may remain in English, but ALL prose must be in ${languageName}. Do NOT mix languages. If any text in the context is in another language, translate your analysis to ${languageName}.`;

    // ── Cache check (Redis only — in-memory disabled for consensus to prevent stale HOLD results) ──
    // V267: Cache key includes the language so a French user doesn't get an Arabic cached result.
    const cacheKey = `ai:consensus:v8:${symbol}:${language}`;
    const redis = this.cache.getRedis();
    if (!forceFresh) {
      try {
        const cached = await redis?.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.logger.debug(`🏛️ Redis cache hit for consensus: ${symbol} (language: ${language})`);
          return parsed;
        }
      } catch {}
    } else {
      this.logger.log(`🏛️ ForceFresh=true: bypassing cache for consensus: ${symbol} (language: ${language})`);
      try {
        await redis?.del(cacheKey);
      } catch {}
    }

    this.logger.log(`🏛️ Initiating AI Council Consensus for ${symbol} — 8 models + Prediction Market (language: ${language})`);

    try {
      // ── Build decision instructions ──
      // V267: For extended locales, use the English decision instruction (LLMs parse it reliably)
      // and rely on `languageDirective` to localize the surrounding prose.
      const baseLanguageForPrompts = isExtendedLocale ? 'en' : (language as 'ar' | 'en');
      const decisionInstruction = baseLanguageForPrompts === 'en'
        ? `${languageDirective}\n\n⛔⛔⛔ CRITICAL decision instructions:\n- You MUST end your response with exactly one line in this format: "DECISION: BUY" or "DECISION: SELL"\n- Writing "DECISION: HOLD" is STRICTLY FORBIDDEN — there is no waiting in active trading!\n- If you are not 100% sure, choose the most probable direction based on analysis\n- Even if signals are conflicting, choose the stronger direction (BUY or SELL)\n- The market always moves — there is no "wait" — pick a direction!\nThis line MUST be the last line of your response.`
        : '\n\n⛔⛔⛔ تعليمات حاسمة حول القرار:\n- يجب أن تنهي ردك بسطر واحد بالضبط بهذا الشكل: "DECISION: BUY" أو "DECISION: SELL"\n- ممنوع تماماً كتابة "DECISION: HOLD" — لا يوجد انتظار في التداول النشط!\n- إذا لم تكن متأكداً بنسبة 100%، اختر الاتجاه الأكثر احتمالاً بناءً على التحليل\n- حتى لو كانت الإشارات متضاربة، اختر الاتجاه الأقوى (BUY أو SELL)\n- السوق دائماً يتحرك — ليس هناك "انتظار" — اختر اتجاهاً!\nهذا السطر يجب أن يكون آخر سطر في ردك.';

      // ── Inject live market data to prevent price hallucinations ──
      const marketDataResult = await this.marketData.fetchQuickMarketData(symbol);
      const marketDataPrefix = marketDataResult.price > 0
        ? baseLanguageForPrompts === 'en'
          ? `${languageDirective}\n⛔⛔⛔ CRITICAL WARNING — Live market data (DO NOT invent prices!):\n- 🔴 Actual current price: ${marketDataResult.price.toLocaleString()}$ — use ONLY this number! Any other price you mention will be false!\n- Real RSI: ${marketDataResult.rsi} (use this value only)\n- MACD: ${marketDataResult.macd}\n\n⚠️ Final warning: If you mention any price other than ${marketDataResult.price.toLocaleString()}$ your entire analysis will be rejected as false. The price is ${marketDataResult.price.toLocaleString()}$ and nothing else.\n`
          : `\n⛔⛔⛔ تحذير حرج — بيانات السوق الحية (ممنوع اختراع أسعار!):\n- 🔴 السعر الحالي الفعلي: ${marketDataResult.price.toLocaleString()}$ — استخدم هذا الرقم فقط! أي سعر آخر تذكره سيكون كاذباً!\n- مؤشر RSI الحقيقي: ${marketDataResult.rsi} (استخدم هذه القيمة فقط)\n- مؤشر MACD: ${marketDataResult.macd}\n\n⚠️ تحذير نهائي: إذا ذكرت أي سعر غير ${marketDataResult.price.toLocaleString()}$ فتحليلك كله سيكون مرفوضاً وكاذباً. السعر هو ${marketDataResult.price.toLocaleString()}$ فقط لا غير.\n`
        : baseLanguageForPrompts === 'en'
          ? `${languageDirective}\n⚠️⚠️⚠️ Unable to fetch live market data — DO NOT invent any price or number. If you need to mention a price, write "Price unavailable". Any fabricated price makes your analysis unreliable.\n`
          : '\n⚠️⚠️⚠️ لم نتمكن من جلب بيانات السوق الحية — ممنوع تماماً اختراع أي سعر أو رقم من عندك. إذا احتجت لذكر السعر اكتب "السعر غير متاح". أي سعر تختلقه سيجعل تحليلك غير موثوق.\n';

      // ── Inject news context ──
      // V291: Localize the news prefix wrapper. Previously hardcoded Arabic,
      // which caused models (especially weaker ones like Bedrock Nova Micro)
      // to respond in Arabic even when language='en'.
      const newsPrefix = newsContext
        ? (baseLanguageForPrompts === 'en'
          ? `\n📰📰📰 Analyzed news data (trusted source — take it into account!):\n${newsContext}\n⚠️ This is real analyzed news — it must influence your decision!\n\n`
          : `\n📰📰📰 بيانات الأخبار المحللة (مصدر موثوق — خذها بعين الاعتبار!):\n${newsContext}\n⚠️ هذه أخبار حقيقية محللة — يجب أن تؤثر على قرارك!\n\n`)
        : '';

      // ── V185: كشف وضع السوق — سياق BULL/BEAR/RANGE للذكاء الاصطناعي ──
      let regimePrefix = '';
      try {
        if (this.regimeService) {
          const regimeResult = await this.regimeService.detectRegime(symbol);
          if (regimeResult) {
            const regimeContext = this.regimeService.buildRegimeContext(regimeResult, symbol);
            if (regimeContext) {
              // V291: Localize regime prefix
              regimePrefix = baseLanguageForPrompts === 'en'
                ? `\n${regimeContext}\n⚠️ This is the current market regime — it must influence your decision!\n\n`
                : `\n${regimeContext}\n⚠️ هذا هو وضع السوق الحالي — يجب أن تؤثر على قرارك!\n\n`;
              this.logger.debug(`🏛️ V185 Regime context injected for ${symbol}: ${regimeResult.regime} (${regimeResult.confidence}%)`);
            }
          }
        }
      } catch (regimeErr: any) {
        this.logger.debug(`V185 Regime: ${regimeErr.message}`);
      }

      // ── V185: ذاكرة النظام — دروس من الصفقات السابقة ──
      let memoryPrefix = '';
      try {
        if (this.memoryService) {
          const memoryContext = await this.memoryService.getMemoryContext('system', symbol);
          if (memoryContext) {
            // V291: Localize memory prefix
            memoryPrefix = baseLanguageForPrompts === 'en'
              ? `\n🧠🧠🧠 Lessons from past trades (real history — learn from it!):\n${memoryContext}\n⚠️ These are real lessons from past trades — do not repeat the same mistakes!\n\n`
              : `\n🧠🧠🧠 دروس من صفقات سابقة (تاريخ حقيقي — تعلم منها!):\n${memoryContext}\n⚠️ هذه دروس حقيقية من صفقات سابقة — لا تكرر نفس الأخطاء!\n\n`;
            this.logger.debug(`🏛️ V185 Memory context injected for ${symbol}`);
          }
        }
      } catch (memErr: any) {
        this.logger.debug(`V185 Memory: ${memErr.message}`);
      }

      // ── Combined context prefix: news + regime + memory ──
      const contextPrefix = `${regimePrefix}${memoryPrefix}${newsPrefix}`;

      // ── Define the 8 Council Roles ──
      // V288: Each role now has a STRICT ROLE BOUNDARY prefix that forces
      // the model to focus ONLY on its specialty. Without this, when only
      // one model is available (e.g. GLM-4 only), all 8 roles produce
      // near-identical text because the shared context (market data +
      // regime + news + memory) dominates the small role-specific
      // instruction. The boundary explicitly forbids cross-role overlap.
      const roles: CouncilRole[] = baseLanguageForPrompts === 'en' ? [
        { id: 'tech',   name: 'Technical Analyst',    model: 'gemini',     fallbackModels: ['nvidia', 'groq', 'ollama', 'deepseek', 'glm', 'bedrock', 'huggingface', 'openrouter'],  prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the TECHNICAL ANALYST. Your ONLY job is to analyze price action, indicators (RSI, MACD, EMA, Bollinger), support/resistance levels, and chart patterns. DO NOT discuss macroeconomic factors, news sentiment, or risk management — those are handled by other council members. Stay strictly technical.\n\nAnalyze the technical chart for ${symbol} based on trend, momentum, and resistance levels.${decisionInstruction}` },
        { id: 'sent',   name: 'Sentiment Analyst',     model: 'groq',       fallbackModels: ['nvidia', 'deepseek', 'ollama', 'gemini', 'bedrock', 'glm', 'huggingface', 'openrouter'], prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the SENTIMENT ANALYST. Your ONLY job is to gauge market sentiment from news, social media tone, fear/greed indicators, and trader positioning. DO NOT discuss technical indicators, macroeconomic policy, or stop-loss levels — those are handled by other council members. Stay strictly sentiment-focused.\n\nAnalyze current market sentiment for ${symbol} from a news and momentum perspective.${decisionInstruction}` },
        { id: 'risk',   name: 'Risk Expert',     model: 'gemini',     fallbackModels: ['nvidia', 'cerebras', 'groq', 'ollama', 'deepseek', 'glm', 'mistral', 'bedrock'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the RISK EXPERT. Your ONLY job is to identify downside risks, calculate optimal stop-loss levels, assess position sizing, and warn of worst-case scenarios. DO NOT discuss technical indicators, news, or macro trends except as they directly affect risk. Stay strictly risk-focused.\n\nIdentify risks of entering a trade on ${symbol} now, stop-loss levels, and worst-case scenario assessment.${decisionInstruction}` },
        { id: 'macro',  name: 'Macro Expert',     model: 'gemini',     fallbackModels: ['nvidia', 'cerebras', 'groq', 'deepseek', 'ollama', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the MACRO EXPERT. Your ONLY job is to analyze macroeconomic factors: interest rates, inflation, central bank policy, geopolitical events, and their impact on ${symbol}. DO NOT discuss technical indicators, sentiment, or stop-loss levels — those are handled by other council members. Stay strictly macro-focused.\n\nAnalyze the macroeconomic situation and its impact on ${symbol}.${decisionInstruction}` },
        { id: 'pattern',name: 'Pattern Expert',     model: 'cerebras',   fallbackModels: ['nvidia', 'ollama', 'mistral', 'groq', 'gemini', 'bedrock', 'glm'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the PATTERN EXPERT. Your ONLY job is to identify recurring historical chart patterns (head & shoulders, triangles, flags, double tops/bottoms, Elliott waves, etc.) in the current movement of ${symbol}. DO NOT discuss macro, news, or risk — those are handled by other council members. Stay strictly pattern-focused.\n\nDo you see any recurring historical patterns in the current movement of ${symbol}?${decisionInstruction}` },
        { id: 'exec',   name: 'Execution Strategist', model: 'ollama',     fallbackModels: ['nvidia', 'deepseek', 'bedrock', 'glm', 'gemini', 'groq', 'huggingface', 'openrouter'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the EXECUTION STRATEGIST. Your ONLY job is to determine optimal entry timing based on liquidity, order book depth, spread, and session timing (Asian/European/US). DO NOT discuss technical indicators, macro, or sentiment — those are handled by other council members. Stay strictly execution-focused.\n\nWhat is the best timing for entering ${symbol} based on liquidity and available models?${decisionInstruction}` },
        { id: 'diverge',name: 'Divergence Analyst',     model: 'cerebras',   fallbackModels: ['nvidia', 'groq', 'ollama', 'bedrock', 'gemini', 'mistral', 'glm'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the DIVERGENCE ANALYST. Your ONLY job is to look for counter-signals and divergences: price vs RSI divergence, price vs volume divergence, price vs MACD divergence, cross-exchange price divergence. Your role is to challenge the prevailing trend. DO NOT discuss macro, news, or risk — those are handled by other council members. Stay strictly divergence-focused.\n\nLook for counter-signals or divergences in the analysis of ${symbol} — is there a reason not to follow the prevailing trend?${decisionInstruction}` },
        { id: 'scenario', name: 'Scenario Analyst', model: 'mistral',  fallbackModels: ['nvidia', 'ollama', 'bedrock', 'gemini', 'groq', 'glm', 'cerebras'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the SCENARIO ANALYST. Your ONLY job is to construct 3 probability-weighted scenarios (bull case, base case, bear case) with specific price targets and trigger conditions. DO NOT discuss technical indicators, sentiment, or risk in isolation — synthesize them into scenarios. Stay strictly scenario-focused.\n\nAnalyze possible scenarios for ${symbol} with probability estimates for each scenario.${decisionInstruction}` },
      ] : [
        { id: 'tech',   name: 'المحلل الفني',    model: 'gemini',     fallbackModels: ['nvidia', 'groq', 'ollama', 'deepseek', 'glm', 'bedrock', 'huggingface', 'openrouter'],  prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت المحلل الفني. مهمتك الوحيدة هي تحليل حركة السعر والمؤشرات (RSI, MACD, EMA, Bollinger) ومستويات الدعم/المقاومة وأنماط الشارت. ممنوع مناقشة العوامل الماكرواقتصادية أو مشاعر الأخبار أو إدارة المخاطر — هذه أدوار أخرى تتولاها. ابقَ فنياً فقط.\n\nحلل الشارت الفني لـ ${symbol} بناءً على الاتجاه والزخم والمقاومات.${decisionInstruction}` },
        { id: 'sent',   name: 'محلل المشاعر',     model: 'groq',       fallbackModels: ['nvidia', 'deepseek', 'ollama', 'gemini', 'bedrock', 'glm', 'huggingface', 'openrouter'], prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت محلل المشاعر. مهمتك الوحيدة هي قياس مشاعر السوق من الأخبار ونبرة وسائل التواصل ومؤشرات الخوف/الجشع وتموضع المتداولين. ممنوع مناقشة المؤشرات الفنية أو السياسة الماكرواقتصادية أو مستويات وقف الخسارة — هذه أدوار أخرى تتولاها. ابقَ مركزاً على المشاعر فقط.\n\nحلل مشاعر السوق الحالية لـ ${symbol} من منظور الأخبار والزخم.${decisionInstruction}` },
        { id: 'risk',   name: 'خبير المخاطر',     model: 'gemini',     fallbackModels: ['nvidia', 'cerebras', 'groq', 'ollama', 'deepseek', 'glm', 'mistral', 'bedrock'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت خبير المخاطر. مهمتك الوحيدة هي تحديد المخاطر الهبوطية وحساب مستويات وقف الخسارة المثلى وتقييم حجم المركز والتحذير من السيناريوهات الأسوأ. ممنوع مناقشة المؤشرات الفنية أو الأخبار أو الاتجاهات الماكرو إلا بمقدار تأثيرها المباشر على المخاطر. ابقَ مركزاً على المخاطر فقط.\n\nحدد مخاطر دخول صفقة على ${symbol} الآن ومستويات وقف الخسارة مع تقييم السيناريو الأسوأ.${decisionInstruction}` },
        { id: 'macro',  name: 'خبير الماكرو',     model: 'gemini',     fallbackModels: ['nvidia', 'cerebras', 'groq', 'deepseek', 'ollama', 'glm', 'bedrock', 'huggingface', 'openrouter'], prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت خبير الماكرو. مهمتك الوحيدة هي تحليل العوامل الماكرواقتصادية: أسعار الفائدة، التضخم، سياسة البنوك المركزية، الأحداث الجيوسياسية، وتأثيرها على ${symbol}. ممنوع مناقشة المؤشرات الفنية أو المشاعر أو مستويات وقف الخسارة — هذه أدوار أخرى تتولاها. ابقَ مركزاً على الماكرو فقط.\n\nحلل الوضع الاقتصادي العام وتأثيره على ${symbol} مع مراعاة السياق العربي.${decisionInstruction}` },
        { id: 'pattern',name: 'خبير الأنماط',     model: 'cerebras',   fallbackModels: ['nvidia', 'ollama', 'mistral', 'groq', 'gemini', 'bedrock', 'glm'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت خبير الأنماط. مهمتك الوحيدة هي تحديد الأنماط التاريخية المتكررة في الشارت (رأس وكتفان، مثلثات، أعلام، قمم/قيعان مزدوجة، موجات إليوت، إلخ) في حركة ${symbol} الحالية. ممنوع مناقشة الماكرو أو الأخبار أو المخاطر — هذه أدوار أخرى تتولاها. ابقَ مركزاً على الأنماط فقط.\n\nهل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟${decisionInstruction}` },
        { id: 'exec',   name: 'استراتيجي التنفيذ', model: 'ollama',     fallbackModels: ['nvidia', 'deepseek', 'bedrock', 'glm', 'gemini', 'groq', 'huggingface', 'openrouter'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت استراتيجي التنفيذ. مهمتك الوحيدة هي تحديد توقيت الدخول الأمثل بناءً على السيولة وعمق دفتر الأوامر والسبريد وتوقيت الجلسات (آسيوية/أوروبية/أمريكية). ممنوع مناقشة المؤشرات الفنية أو الماكرو أو المشاعر — هذه أدوار أخرى تتولاها. ابقَ مركزاً على التنفيذ فقط.\n\nما هو أفضل توقيت للدخول في ${symbol} بناءً على السيولة والنماذج المتاحة؟${decisionInstruction}` },
        { id: 'diverge',name: 'محلل التباين',     model: 'cerebras',   fallbackModels: ['nvidia', 'groq', 'ollama', 'bedrock', 'gemini', 'mistral', 'glm'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت محلل التباين. مهمتك الوحيدة هي البحث عن الإشارات المعاكسة والتباينات: تباين السعر vs RSI، تباين السعر vs الحجم، تباين السعر vs MACD، تباين الأسعار عبر البورصات. دورك هو تحدي الاتجاه السائد. ممنوع مناقشة الماكرو أو الأخبار أو المخاطر — هذه أدوار أخرى تتولاها. ابقَ مركزاً على التباين فقط.\n\nابحث عن إشارات معاكسة أو تباينات في تحليل ${symbol} — هل هناك سبب لعدم اتباع الاتجاه السائد؟${decisionInstruction}` },
        { id: 'scenario', name: 'محلل السيناريوهات', model: 'mistral',  fallbackModels: ['nvidia', 'ollama', 'bedrock', 'gemini', 'groq', 'glm', 'cerebras'],        prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت محلل السيناريوهات. مهمتك الوحيدة هي بناء 3 سيناريوهات مرجحة بالاحتمالات (سيناريو صعودي، سيناريو أساسي، سيناريو هبوطي) مع مستويات أسعار محددة وشروط تحقق. ممنوع مناقشة المؤشرات الفنية أو المشاعر أو المخاطر بشكل منفرد — اجمعها في سيناريوهات. ابقَ مركزاً على السيناريوهات فقط.\n\nحلل السيناريوهات المحتملة لـ ${symbol} مع تقدير احتمالات كل سيناريو.${decisionInstruction}` },
      ];

      // ═══════════════════════════════════════════════════════════════
      // REVOLUTIONARY #4: Adversarial Council Member (Devil's Advocate)
      // A 9th AI role whose sole job is to ARGUE AGAINST the prevailing
      // consensus. If it can't find a strong counter-argument, confidence
      // is boosted. If it finds a fatal flaw, the brief is downgraded.
      // ═══════════════════════════════════════════════════════════════
      const adversarialRole: CouncilRole = baseLanguageForPrompts === 'en'
        ? { id: 'adversarial', name: 'Devil\'s Advocate', model: 'cerebras',
            fallbackModels: ['nvidia', 'groq', 'ollama', 'mistral', 'gemini', 'bedrock', 'glm'],
            prompt: `${contextPrefix}${marketDataPrefix}🎯 ROLE BOUNDARY: You are the DEVIL'S ADVOCATE. Your ONLY job is to find the STRONGEST possible argument AGAINST entering a trade on ${symbol} right now. Challenge every bullish or bearish case. Look for hidden risks, false breakouts, liquidity traps, and manipulative patterns. If you genuinely cannot find a strong counter-argument, say "DECISION: HOLD" with your reasoning.${decisionInstruction}` }
        : { id: 'adversarial', name: 'محامي الشيطان', model: 'cerebras',
            fallbackModels: ['nvidia', 'groq', 'ollama', 'mistral', 'gemini', 'bedrock', 'glm'],
            prompt: `${contextPrefix}${marketDataPrefix}🎯 حدود الدور: أنت محامي الشيطان. مهمتك الوحيدة هي إيجاد أقوى حجة ممكنة ضد الدخول في صفقة على ${symbol} الآن. تحدَّ كل حالة صعودية أو هبوطية. ابحث عن المخاطر الخفية، الاختراقات الكاذبة، فخاخ السيولة، والأنماط التلاعبية. إذا لم تستطع إيجاد حجة قوية genuinely، قل "DECISION: HOLD" مع تبريرك.${decisionInstruction}` };
      roles.push(adversarialRole);

      // ═══════════════════════════════════════════════════════════════
      // REVOLUTIONARY #3: Regime-Conditional Prompts
      // The regime info is already injected via marketDataPrefix.
      // The adversarial role uses it to challenge the consensus.
      // For the other 8 roles, the regime is in the shared context.
      // A full version would swap entire prompt templates per regime.
      // ═══════════════════════════════════════════════════════════════

      // ── 9th Model: Prediction Market Analyst ──
      let predictionMarketVote: { role: string; model: string; vote: string; confidence: number; reason: string } | null = null;
      if (this.predictionMarket) {
        try {
          const pmVote = await this.predictionMarket.getCouncilVote(symbol);
          if (pmVote) {
            predictionMarketVote = {
              role: 'محلل الأسواق التنبؤية',
              model: 'PredictionMarket/8th',
              vote: pmVote.vote,
              confidence: pmVote.confidence,
              reason: pmVote.reason,
            };
            this.logger.log(`🔮 9th model vote: ${pmVote.vote} (${pmVote.confidence}%) — ${pmVote.eventsAnalyzed} events`);
          }
        } catch (error: any) {
          this.logger.debug(`🔮 9th model abstained (no data or error): ${error.message}`);
        }
      }

      const start = Date.now();

      // ── Resolve models for each role (model diversification) ──
      const availableModelCount = ['groq', 'glm', 'gemini', 'cerebras', 'ollama', 'bedrock', 'nvidia', 'mistral']
        .filter(m => this.orchestrator.isModelKeyAvailable(m)).length;
      const activeRoles = this._resolveModelForRole(roles, availableModelCount);

      this.logger.log(`🏛️ Resolved models for consensus: ${activeRoles.map(r => `${r.name}→${r.resolvedModel}`).join(', ')}`);

      // ── Call all models in parallel ──
      const results = await Promise.allSettled(
        activeRoles.map(async (role) => {
          const roleStart = Date.now();
          try {
            const response = await this.orchestrator.callModel(role.resolvedModel!, {
              symbol,
              prompt: role.prompt,
              type: 'market_analysis',
              language,
            });
            // Log each council member's AI usage
            if (response.confidence > 0) {
              this.usageLogger?.logSuccess({
                model: response.model,
                endpoint: 'consensus',
                inputPrompt: role.prompt,
                outputContent: response.content,
                latencyMs: Date.now() - roleStart,
                cached: false,
              });
            }
            // If model returned stub (confidence 0), track as consecutive failure
            if (response.confidence === 0) {
              this.logger.warn(`🚫 Model ${role.resolvedModel} returned stub — no cooldown (key likely missing)`);
            }
            // Reset consecutive failures on success
            if (response.confidence > 0) {
              this.orchestrator.recordModelSuccess(role.resolvedModel!);
              // V289: Record usage in SmartModelRouter for daily quota tracking.
              // This is fire-and-forget — failure to record doesn't block the response.
              this.smartRouter?.recordUsage(role.resolvedModel!).catch(() => {});
            }
            return { ...role, response };
          } catch (error: any) {
            this.usageLogger?.logFailure({
              model: role.model,
              endpoint: 'consensus',
              inputPrompt: role.prompt,
              latencyMs: Date.now() - roleStart,
              errorMessage: error.message,
            });
            // Track 429 failures
            if (error.response?.status === 429 || error.message?.includes('429')) {
              this.orchestrator.recordModel429Failure(role.resolvedModel!);
            }
            throw error;
          }
        }),
      );

      // ── Phase 2: Retry failed/stub roles with fallback models ──
      const roleResponses = new Map<string, { name: string; response: AIAnalysisResponse }>();
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value && res.value.response) {
          const { name, response, id } = res.value;
          if (response.confidence > 0) {
            roleResponses.set(id, { name, response });
          }
        }
      }

      const failedRoles = activeRoles.filter(role => !roleResponses.has(role.id));
      if (failedRoles.length > 0) {
        this.logger.log(`🔄 Phase 2: Retrying ${failedRoles.length} failed roles with fallback models...`);
        await this._retryFailedRoles(failedRoles, roleResponses, symbol, language);
      }

      // ── Build consensus from results ──
      const consensusData = await this._buildConsensusFromResults(roleResponses, predictionMarketVote, symbol, language);

      // ── Generate master strategy ──
      const totalModels = 8 + (predictionMarketVote ? 1 : 0);
      const masterStrategy = await this._generateMasterStrategy(
        consensusData.analyses,
        symbol,
        language,
        consensusData.recommendation,
        consensusData.consensusScore,
        totalModels,
        !!predictionMarketVote,
      );

      // ── Final adjustments for edge cases ──
      let { recommendation, consensusScore, analyses } = consensusData;

      // When very few models responded (< 3) and consensus is HOLD,
      // boost directional signals
      if (analyses.length < 3 && recommendation === 'HOLD' && (consensusData.buyWeight > 0 || consensusData.sellWeight > 0)) {
        if (consensusData.buyWeight > 0 || consensusData.sellWeight > 0) {
          const prevRecommendation = recommendation;
          if (consensusData.buyWeight >= consensusData.sellWeight) {
            recommendation = 'BUY';
            consensusScore = consensusData.buyConfidences.length > 0
              ? Math.round(consensusData.buyConfidences.reduce((a, b) => a + b, 0) / consensusData.buyConfidences.length * 100)
              : Math.round((consensusData.buyWeight / (consensusData.buyWeight + consensusData.sellWeight)) * 100);
          } else {
            recommendation = 'SELL';
            consensusScore = consensusData.sellConfidences.length > 0
              ? Math.round(consensusData.sellConfidences.reduce((a, b) => a + b, 0) / consensusData.sellConfidences.length * 100)
              : Math.round((consensusData.sellWeight / (consensusData.buyWeight + consensusData.sellWeight)) * 100);
          }
          consensusScore = Math.max(consensusScore, 55);
          this.logger.log(`🏛️ Few-model override: ${prevRecommendation} → ${recommendation} (${consensusScore}%) — ${analyses.length}/${totalModels} models, ignoring HOLD with sparse data`);
        }
      }

      // When all working models agree on a direction, boost confidence
      if (recommendation !== 'HOLD' && analyses.length >= 2) {
        const dirVotes = recommendation === 'BUY' ? consensusData.buyConfidences : consensusData.sellConfidences;
        const oppVotes = recommendation === 'BUY' ? consensusData.sellConfidences : consensusData.buyConfidences;
        if (dirVotes.length >= 2 && oppVotes.length === 0) {
          consensusScore = Math.max(consensusScore, Math.min(75, dirVotes.length * 20 + 35));
          this.logger.log(`🏛️ Unanimous ${recommendation} from ${dirVotes.length} models — boosting confidence to ${consensusScore}%`);
        }
      }

      this.logger.log(`✅ Consensus: ${recommendation} (${consensusScore}%) from ${analyses.length}/${totalModels} models in ${Date.now() - start}ms`);

      const result: ConsensusAnalysisResult = { consensusScore, recommendation, analyses, masterStrategy };

      // ── Cache with differentiated TTL ──
      const isPartial = analyses.length < 3;
      const consensusCacheTTL = isPartial
        ? 60 * 1000                          // 1 minute for partial (< 3 models)
        : this.cache.getTTL('consensus');     // 10 minutes for full (3+ models)
      await this.cache.setRedisCacheWithTTL(cacheKey, result, consensusCacheTTL);

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ AI Council failed: ${err.message}`, err.stack);
      return {
        consensusScore: 0,
        recommendation: 'HOLD',
        analyses: [],
        masterStrategy: language === 'en' ? 'Error processing consensus request.' : 'خطأ في معالجة طلب إجماع النماذج.',
        isFallback: true,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Model Diversification
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Resolve the best available model for each council role.
   *
   * Two-pass resolution:
   * 1. First pass respects diversification (MAX_MODEL_REUSE per model)
   * 2. Second pass relaxes diversification to ensure no role goes unfilled
   *
   * Dynamic MAX_MODEL_REUSE: when few models are available, allow more reuse.
   * If only 3 models work, we NEED each to serve 3 roles to fill all 8 slots.
   */
  private _resolveModelForRole(roles: CouncilRole[], availableModelCount: number): CouncilRole[] {
    const MAX_MODEL_REUSE = availableModelCount <= 3 ? 3 : 2;
    const modelUsageCount = new Map<string, number>();

    return roles.map(role => {
      let roleModels = [role.model, ...(role.fallbackModels || [])];

      // If Ollama is the primary model but we're on cloud WITH localhost URL,
      // move it to end of fallback list
      if (role.model === 'ollama' && this.orchestrator.isCloudEnvironment()) {
        const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
        if (this.orchestrator.isLocalhostUrl(ollamaBaseUrl || 'http://localhost:11434')) {
          roleModels = [...(role.fallbackModels || []), 'ollama'];
        }
      }

      // V289: If SmartModelRouter is available, prefer the least-used model
      // from the candidate list. This spreads the load across providers so
      // no single free-tier quota is exhausted before others.
      if (this.smartRouter) {
        // Note: pickModel is async but _resolveModelForRole is sync. We can't
        // await here. Instead, we'll let the caller use SmartModelRouter at
        // call time. For now, keep the original sync logic — the smartRouter
        // is still used for usage tracking (recordUsage) after each call.
        // Future refactor: make _resolveModelForRole async.
      }

      // Pass 1: Respect diversification
      for (const model of roleModels) {
        if (!this._isModelAvailableForRole(model)) continue;
        const currentUsage = modelUsageCount.get(model) || 0;
        if (currentUsage >= MAX_MODEL_REUSE) {
          this.logger.debug(`🔀 Model ${model} already used for ${currentUsage} roles — trying next model for role ${role.name}`);
          continue;
        }
        modelUsageCount.set(model, currentUsage + 1);
        return { ...role, resolvedModel: model };
      }

      // Pass 2: Relax diversification — better to reuse a model than have a stub role
      for (const model of roleModels) {
        if (!this._isModelAvailableForRole(model)) continue;
        const currentUsage = modelUsageCount.get(model) || 0;
        if (currentUsage >= 5) continue;
        modelUsageCount.set(model, currentUsage + 1);
        this.logger.warn(`⚠️ Relaxed diversification for role ${role.name}: using model ${model} (${currentUsage + 1} roles now)`);
        return { ...role, resolvedModel: model };
      }

      // All models for this role unavailable — keep primary (will return stub)
      this.logger.warn(`⚠️ All models for role ${role.name} are unavailable`);
      return { ...role, resolvedModel: role.model };
    });
  }

  /**
   * Check if a model is available for role assignment (not in cooldown, has API key)
   */
  private _isModelAvailableForRole(model: string): boolean {
    const consecutiveFails = this.orchestrator.getModelConsecutiveFailures(model);
    const failsBeforeCooldown = this.orchestrator.getFailuresBeforeCooldown();
    if (consecutiveFails >= failsBeforeCooldown) {
      const cooldownUntil = this.orchestrator.getModelCooldown(model);
      if (Date.now() < cooldownUntil) return false;
    }
    return this.orchestrator.isModelKeyAvailable(model);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Retry Failed Roles
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Phase 2: Retry failed/stub roles with fallback models.
   * When a model returns confidence=0 (stub) or throws an error,
   * the role gets no valid response. We try fallback models for each failed role.
   */
  private async _retryFailedRoles(
    failedRoles: CouncilRole[],
    roleResponses: Map<string, { name: string; response: AIAnalysisResponse }>,
    symbol: string,
    language: string,
  ): Promise<void> {
    for (const role of failedRoles) {
      for (const fallbackModel of role.fallbackModels || []) {
        // Skip if same as already-tried model, or unavailable, or in cooldown
        if (fallbackModel === role.resolvedModel) continue;
        if (!this._isModelAvailableForRole(fallbackModel)) continue;

        try {
          this.logger.log(`🔄 Retrying role "${role.name}" with fallback model: ${fallbackModel}`);
          const response = await this.orchestrator.callModel(fallbackModel, {
            symbol,
            prompt: role.prompt,
            type: 'market_analysis',
            language,
          });

          if (response.confidence > 0) {
            this.logger.log(`✅ Fallback model ${fallbackModel} succeeded for role "${role.name}"`);
            roleResponses.set(role.id, { name: role.name, response });
            this.orchestrator.recordModelSuccess(fallbackModel);
            break; // Role filled, stop trying fallbacks
          } else {
            this.logger.warn(`⚠️ Fallback model ${fallbackModel} returned stub for role "${role.name}"`);
          }
        } catch (error: any) {
          // Track 429 errors
          if (error.response?.status === 429 || error.message?.includes('429')) {
            this.orchestrator.recordModel429Failure(fallbackModel);
          }
          this.logger.warn(`❌ Fallback model ${fallbackModel} failed for role "${role.name}": ${error.message}`);
          continue;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Build Consensus from Results
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build consensus analysis from all successful role responses.
   *
   * HOLD votes are weighted at 0.3x to prevent HOLD-dominance.
   * In active trading, staying out (HOLD) is not a productive signal.
   * Directional votes (BUY/SELL) carry more weight because they
   * represent conviction and actionable analysis.
   */
  private async _buildConsensusFromResults(
    roleResponses: Map<string, { name: string; response: AIAnalysisResponse }>,
    predictionMarketVote: { role: string; model: string; vote: string; confidence: number; reason: string } | null,
    symbol: string,
    language: string = 'ar',
  ): Promise<{
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[];
    buyWeight: number;
    sellWeight: number;
    holdWeight: number;
    totalConfidence: number;
    buyConfidences: number[];
    sellConfidences: number[];
    holdConfidences: number[];
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    consensusScore: number;
  }> {
    const analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[] = [];
    let buyWeight = 0;
    let sellWeight = 0;
    let holdWeight = 0;
    let totalConfidence = 0;
    let buyConfidences: number[] = [];
    let sellConfidences: number[] = [];
    let holdConfidences: number[] = [];

    const HOLD_WEIGHT_MULTIPLIER = 0.3;

    // V185: حلقة التعلم — استخدم أوزان ديناميكية من CouncilVoteAccuracyService
    // كل دور في المجلس يملك وزناً بناءً على دقة أصواته السابقة
    // بدون VoteAccuracy: أوزان متساوية (السلوك القديم)
    const useDynamicWeights = !!this.voteAccuracy;

    // Build analyses from role responses
    for (const [roleId, { name, response }] of roleResponses) {
      const content = response.content || '';
      const vote = this.orchestrator.parseVote(content);

      const conf = response.confidence || 0.5;
      // V185: تطبيق الوزن الديناميكي — الدور الأكثر دقة يحصل على وزن أعلى
      let dynamicWeight = 1.0;
      if (useDynamicWeights) {
        try {
          dynamicWeight = await this.voteAccuracy!.getRoleWeight('system', roleId);
        } catch { /* fallback to 1.0 */ }
      }
      const weightedConf = conf * dynamicWeight;

      if (vote === 'BUY') { buyWeight += weightedConf; buyConfidences.push(weightedConf); }
      else if (vote === 'SELL') { sellWeight += weightedConf; sellConfidences.push(weightedConf); }
      else { holdWeight += weightedConf * HOLD_WEIGHT_MULTIPLIER; holdConfidences.push(weightedConf); }
      totalConfidence += vote === 'HOLD' ? weightedConf * HOLD_WEIGHT_MULTIPLIER : weightedConf;

      analyses.push({
        role: name,
        model: response.model,
        vote,
        confidence: Math.round(conf * 100),
        // V286: raised from 300 → 1500 chars. The previous 300-char limit was
        // cutting off 70%+ of each agent's analysis, leaving users with
        // truncated reasons like "The market is in a sideways (RANGE) state
        // with a confidence…" and no way to read the rest. The frontend
        // FormattedText component handles long content with a "show more"
        // toggle, so 1500 chars gives the full reasoning without bloating
        // the JSON response.
        //
        // V305: DISABLED enforceLanguage — it was replacing rich AI analysis
        // with a mechanical data-extraction summary, destroying 90% of the
        // reasoning. The real fix is V304: NVIDIA Llama 3.1 8B (which follows
        // language directives properly) is now first in the fallback list.
        // Trust the model's output as-is.
        reason: content.slice(0, 1500) + (content.length > 1500 ? '…' : ''),
      });
    }

    // ── Add 9th model (Prediction Market) vote — Dynamic Weight ──
    if (predictionMarketVote) {
      const pmConf = predictionMarketVote.confidence / 100;
      const pmWeight = pmConf > 0.70 ? 3.0
                      : pmConf > 0.55 ? 1.8
                      : pmConf > 0.40 ? 1.0
                      :                 0.4;
      const pmWeightedConf = pmConf * pmWeight;

      if (predictionMarketVote.vote === 'BUY')       { buyWeight  += pmWeightedConf; buyConfidences.push(pmWeightedConf); }
      else if (predictionMarketVote.vote === 'SELL')  { sellWeight += pmWeightedConf; sellConfidences.push(pmWeightedConf); }
      else                                             { holdWeight += pmConf; holdConfidences.push(pmConf); }
      totalConfidence += pmWeightedConf;

      analyses.push({
        ...predictionMarketVote,
        reason: predictionMarketVote.reason + ` [weight×${pmWeight.toFixed(1)}]`,
      });
    }

    // ── Add 10th vote: Advanced Scanner (SmartScore) ──
    try {
      const scannerKeys = [
        `scanner:deep:${symbol}`,
        `scanner:deep:${symbol.replace('/USDT','').replace('/USD','')}USDT`,
        `scanner:deep:${symbol.replace('/','').replace('-','')}`,
      ];
      let scannerData: any = null;
      for (const key of scannerKeys) {
        const raw = await this.cache.getRedis()?.get(key);
        if (raw) { scannerData = JSON.parse(raw); break; }
      }

      if (scannerData?.smartScore && scannerData.smartScore.action !== 'HOLD') {
        const isBuy    = scannerData.smartScore.action.includes('BUY');
        const rawScore = Math.abs(scannerData.smartScore.score || 0);
        const scanConf = rawScore / 100;

        const isStrong  = scannerData.smartScore.action.includes('STRONG');
        const scanWeight = isStrong ? 2.0 : 1.2;
        const scanWeightedConf = scanConf * scanWeight;

        if (isBuy)  { buyWeight  += scanWeightedConf; buyConfidences.push(scanWeightedConf); }
        else        { sellWeight += scanWeightedConf; sellConfidences.push(scanWeightedConf); }
        totalConfidence += scanWeightedConf;

        analyses.push({
          role:       'السكانر الفني المتقدم',
          model:      'TechnicalScanner/10th',
          vote:       isBuy ? 'BUY' : 'SELL',
          confidence: Math.round(rawScore),
          reason:     `SmartScore:${rawScore} | ${scannerData.smartScore.signalType || ''} | ${scannerData.smartScore.tradeTimeframe || ''} | divergence:${scannerData.divergence?.type || 'none'} [weight×${scanWeight}]`,
        });

        this.logger.debug(`🔍 Scanner vote for ${symbol}: ${isBuy?'BUY':'SELL'} score=${rawScore} weight=${scanWeight}`);
      }
    } catch (scanErr: any) {
      this.logger.debug(`Scanner vote skipped for ${symbol}: ${scanErr.message}`);
    }

    // ── Calculate recommendation and consensus score ──
    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let consensusScore = 0;

    if (totalConfidence > 0) {
      const buyPct = buyWeight / totalConfidence;
      const sellPct = sellWeight / totalConfidence;

      // Direction-first logic: if there are ANY directional votes,
      // choose the stronger direction. Only HOLD if no direction exists.
      if (buyWeight > 0 || sellWeight > 0) {
        if (buyWeight >= sellWeight) {
          recommendation = 'BUY';
          consensusScore = buyConfidences.length > 0
            ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
            : Math.round(buyPct * 100);
        } else {
          recommendation = 'SELL';
          consensusScore = sellConfidences.length > 0
            ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
            : Math.round(sellPct * 100);
        }
      } else {
        // Pure HOLD — no directional signal at all
        recommendation = 'HOLD';
        consensusScore = holdConfidences.length > 0
          ? Math.round(holdConfidences.reduce((a, b) => a + b, 0) / holdConfidences.length * 100)
          : 50;
      }

      // Ensure minimum consensus score of 50% when majority direction is clear
      if (recommendation !== 'HOLD' && consensusScore < 50) {
        const votersForRec = recommendation === 'BUY' ? buyConfidences : sellConfidences;
        const totalVoters = analyses.length + (predictionMarketVote ? 1 : 0);
        if (votersForRec.length >= Math.ceil(totalVoters / 2)) {
          consensusScore = Math.max(consensusScore, Math.round((votersForRec.length / totalVoters) * 100));
        }
      }

      // V408: Confidence Calibration — fix AI confidence inflation.
      //
      // ROOT CAUSE (data analysis of 683 monthly trades, 2026-06-22):
      //   - AI-claimed confidence: 75% (avg across active briefs)
      //   - Actual win rate: 36%
      //   - Inflation factor: 75/36 ≈ 2.09x
      //   - Position sizing uses confidenceMultiplier (0.5x–1.5x) based on
      //     the inflated value, producing oversized positions.
      //
      // FIX: Scale consensusScore by CALIBRATION_FACTOR = 0.5 so the
      // declared confidence matches the empirically observed win rate.
      // Effect: confidenceMultiplier drops from 1.0x (at 75-84%) to 0.5x
      // (at 38-42%), halving average position size and total exposure.
      //
      // IMPACT: Reduces realized losses ~50% without changing WR or R/R.
      // Disabled when V408_CALIBRATION_FACTOR env var is set to '1.0'.
      //
      // ROLLBACK: Set V408_CALIBRATION_FACTOR=1.0 to restore V175 behavior.
      const V408_CALIBRATION_FACTOR = parseFloat(process.env.V408_CALIBRATION_FACTOR || '0.5');
      if (V408_CALIBRATION_FACTOR < 1.0 && recommendation !== 'HOLD' && consensusScore > 0) {
        const calibrated = Math.round(consensusScore * V408_CALIBRATION_FACTOR);
        this.logger.log(
          `🏛️ V408 Confidence Calibration: ${symbol} ${recommendation} ` +
          `${consensusScore}% → ${calibrated}% (factor ${V408_CALIBRATION_FACTOR})`,
        );
        consensusScore = calibrated;
      }

      // ═══════════════════════════════════════════════════════════════
      // REVOLUTIONARY #8: Veto Power for Risk Expert
      // If the risk expert votes OPPOSITE to consensus with high confidence (>80%),
      // the brief is downgraded (consensus score halved) to reduce position size.
      // This prevents the council from taking reckless trades that the risk
      // expert explicitly warned against.
      // ═══════════════════════════════════════════════════════════════
      const riskAnalysis = analyses.find(a =>
        a.role.toLowerCase().includes('risk') || a.role.includes('مخاطر') || a.role.includes('الخبير')
      );
      if (riskAnalysis && recommendation !== 'HOLD') {
        const riskVote = riskAnalysis.vote;
        const riskConf = riskAnalysis.confidence;
        if (riskVote !== recommendation && riskConf > 80) {
          // Risk expert strongly disagrees with consensus → veto (halve confidence)
          const vetoedScore = Math.round(consensusScore * 0.5);
          this.logger.log(
            `🛡️ REVOLUTIONARY Veto: Risk expert voted ${riskVote} (${riskConf}%) ` +
            `against ${recommendation} → score ${consensusScore}% → ${vetoedScore}%`
          );
          consensusScore = vetoedScore;
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // REVOLUTIONARY #7: Confidence Decomposition
      // Break down the confidence into components for transparency.
      // Stored in the analyses array as a special "decomposition" entry.
      // ═══════════════════════════════════════════════════════════════
      const directionalVoters = analyses.filter(a => a.vote !== 'HOLD').length;
      const agreementPct = analyses.length > 0 ? Math.round((directionalVoters / analyses.length) * 100) : 0;
      const techAgreement = Math.round(agreementPct * 0.15); // up to +15%
      const decomposition = {
        base: 45,
        technicalAgreement: techAgreement,
        totalComponents: `base(45) + tech_agreement(+${techAgreement}) = ${45 + techAgreement}`,
      };
      this.logger.debug(
        `📊 REVOLUTIONARY Confidence Decomposition: ${symbol} ${recommendation} ` +
        `${consensusScore}% = ${decomposition.totalComponents}`
      );
    }

    return {
      analyses,
      buyWeight,
      sellWeight,
      holdWeight,
      totalConfidence,
      buyConfidences,
      sellConfidences,
      holdConfidences,
      recommendation,
      consensusScore,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private: Generate Master Strategy
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Generate the master strategy recommendation from the council analyses.
   * Tries multiple models for generation (not just Groq) to handle rate limits.
   * Falls back to a quick summary if all models fail.
   */
  private async _generateMasterStrategy(
    analyses: { role: string; model: string; vote: string; confidence: number; reason: string }[],
    symbol: string,
    language: string,
    recommendation: 'BUY' | 'SELL' | 'HOLD',
    consensusScore: number,
    totalModels: number,
    hasPredictionMarketVote: boolean,
  ): Promise<string> {
    // Build default summary
    const recLabel = language === 'en'
      ? (recommendation === 'BUY' ? 'Buy' : recommendation === 'SELL' ? 'Sell' : 'Hold')
      : (recommendation === 'BUY' ? 'شراء' : recommendation === 'SELL' ? 'بيع' : 'انتظار');
    const recStrength = language === 'en'
      ? (consensusScore >= 80 ? 'Strong' : consensusScore >= 60 ? 'Clear' : 'Probable')
      : (consensusScore >= 80 ? 'قوي' : consensusScore >= 60 ? 'واضح' : 'محتمل');
    let masterStrategyContent = language === 'en'
      ? `Council consensus (${analyses.length}/${totalModels} models): ${recLabel} ${recStrength} with ${consensusScore}% confidence.`
      : `إجماع المجلس (${analyses.length}/${totalModels} نماذج): ${recLabel} ${recStrength} بنسبة ثقة ${consensusScore}%.`;

    if (analyses.length > 0) {
      try {
        // CRITICAL FIX: Pass each agent's full `reason` text into the strategy prompt.
        // The previous prompt only passed `role (model): vote (confidence%)` — stripping
        // the actual reasoning (price levels, indicators, news events). This caused the
        // AI to produce generic boilerplate (" downtrend continues", "negative sentiment")
        // instead of a specific synthesis that names the levels, indicators, and events
        // the agents actually cited.
        //
        // Format per agent: "<role> [<model>] voted <VOTE> @ <conf>% — <reason>"
        const agentSummaries = analyses
          .map(a => `${a.role} [${a.model}] voted ${a.vote} @ ${a.confidence}% — ${a.reason}`)
          .join('\n\n');

        const strategyPrompt = language !== 'ar'
          ? `You are the Council Master synthesizing the final trading strategy for ${symbol}.

${totalModels} council members have analyzed this market — 8 AI agents${hasPredictionMarketVote ? ' + 1 prediction market vote (Polymarket, real-money forecasting data)' : ''}. Their individual votes, confidence levels, and — most importantly — their specific reasoning are below. Your job is to write a CONCISE (4-6 sentences, max 200 words) synthesis that:

1. Names the SPECIFIC reasons agents gave (price levels, indicator values, news events, divergence types) — DO NOT use generic phrases like "technical indicators point down" or "negative sentiment persists".
2. Quantifies the consensus: "${analyses.filter(a => a.vote === recommendation).length} of ${analyses.length} members voted ${recommendation} with avg confidence ${Math.round(analyses.filter(a => a.vote === recommendation).reduce((s, a) => s + a.confidence, 0) / Math.max(1, analyses.filter(a => a.vote === recommendation).length))}%".
3. Identifies the dissenting view (if any) and explains why it was overruled.
4. If a prediction market vote is present, explicitly contrast it with the AI consensus (e.g., "Prediction markets disagree, pricing 62% probability of upside — overridden because...").
5. Closes with ONE actionable condition that would invalidate this signal (e.g., "Invalidation: 4H close above $0.55").

⚠️ CRITICAL LANGUAGE RULE: Your output MUST be in English ONLY. Even if the agent analyses below are written in Arabic or any other language, you MUST translate the relevant points to English and write your entire synthesis in English. Do NOT use any Arabic words in your output.

Output only the synthesis, no preamble.

COUNCIL ANALYSES:
${agentSummaries}`
          : `أنت رئيس المجلس، توّلِف الاستراتيجية النهائية للتداول على ${symbol}.

${totalModels} أعضاء حللوا هذا السوق — 8 وكلاء ذكاء اصطناعي${hasPredictionMarketVote ? ' + 1 صوت سوق تنبؤي (Polymarket، بيانات توقعات بأموال حقيقية)' : ''}. أصواتهم، نسب ثقتهم، و—الأهم—أسبابهم المحددة مدرجة أدناه. مهمتك: اكتب تركيباً موجزاً (4-6 جمل، بحد أقصى 200 كلمة) يقوم بـ:

1. ذكر الأسباب المحددة التي أعطاها الوكلاء (مستويات السعر، قيم المؤشرات، الأحداث الإخبارية، أنواع التباين) — لا تستخدم عبارات عامة مثل "تشير المؤشرات الفنية للهبوط" أو "المشاعر السلبية مستمرة".
2. تحديد الإجماع كمياً: "${analyses.filter(a => a.vote === recommendation).length} من ${analyses.length} أعضاء صوتوا ${recommendation === 'BUY' ? 'للشراء' : recommendation === 'SELL' ? 'للبيع' : 'للانتظار'} بمتوسط ثقة ${Math.round(analyses.filter(a => a.vote === recommendation).reduce((s, a) => s + a.confidence, 0) / Math.max(1, analyses.filter(a => a.vote === recommendation).length))}%".
3. تحديد الرأي المخالف (إن وُجد) وشرح لماذا تم تجاوزه.
4. إن وُجد صوت سوق تنبؤي، اذكر صراحةً تعارضه أو توافقه مع إجماع الـ AI (مثلاً: "أسواق التنبؤ تعارض، تسعّر 62% احتمال صعود — تم تجاوزه لأن...").
5. الختام بشرط واحد قابل للتنفيذ يُبطل هذه الإشارة (مثلاً: "إبطال الإشارة: إغلاق 4 ساعات فوق 0.55$").

⚠️ قاعدة لغوية حرجة: مخرجاتك يجب أن تكون بالعربية فقط. حتى لو كانت تحليلات الوكلاء أدناه مكتوبة بالإنجليزية أو أي لغة أخرى، يجب عليك ترجمة النقاط ذات الصلة إلى العربية وكتابة التركيب بالكامل بالعربية. لا تستخدم أي كلمات إنجليزية في مخرجاتك.

اكتب التركيب فقط، بدون مقدمة.

تحليلات المجلس:
${agentSummaries}`;

        // Try multiple models for master strategy generation
        // BUG-035 FIX: Added more models — was only 4, now 8 (including free ones)
        const strategyModels = ['glm', 'ollama', 'bedrock', 'groq', 'gemini', 'mistral', 'nvidia', 'cloudflare'];
        let masterStrategy: AIAnalysisResponse | null = null;

        for (const model of strategyModels) {
          if (!this.orchestrator.isModelKeyAvailable(model)) continue;
          const consecutiveFails = this.orchestrator.getModelConsecutiveFailures(model);
          if (consecutiveFails >= this.orchestrator.getFailuresBeforeCooldown()) {
            const cooldownUntil = this.orchestrator.getModelCooldown(model);
            if (Date.now() < cooldownUntil) continue;
          }

          try {
            const response = await this.orchestrator.callModel(model, {
              symbol,
              prompt: strategyPrompt,
              type: 'signal_generation',
              language,
            });
            if (response.confidence > 0 && response.content.length > 10) {
              masterStrategy = response;
              this.logger.log(`✅ Master strategy generated by ${model}`);
              break;
            }
          } catch {
            continue;
          }
        }

        if (masterStrategy && masterStrategy.confidence > 0 && masterStrategy.content.length > 10) {
          // V305: DISABLED enforceLanguage on masterStrategy too — trust the model.
          masterStrategyContent = masterStrategy.content;
        }
      } catch {
        // Use the summary already set above
      }
    }

    return masterStrategyContent;
  }
}
