// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Intent Classifier Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "المُصنِّف" — يحلّل سؤال المستخدم ويحدّد نوعه
// لاختيار القالب المناسب للرد (chat/education/comparison/analysis)
//
// مستوحى من مساعد رؤى المالي (rouatradingnews) لكن مبسّط
// ومتكيف مع سياق منصة التداول (صفقات + مجلس + تعلم)
//
// المبدأ: لكل نوع سؤال قالب رد مختلف
//   - chat: رد قصير حواري (لا تحليل)
//   - education: شرح مفهوم
//   - comparison: جدول مقارنة
//   - analysis: قالب خماسي (السعر+الفني+الأساسي+السيناريوهات+التوصية)
//   - diagnosis: تشخيص أداء
//   - risk: تنبيهات مخاطر
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';

export type IntentType =
  | 'chat'              // محادثة عامة (تحية، شكر)
  | 'education'         // شرح مفهوم
  | 'comparison'        // مقارنة
  | 'opinion'           // رأي
  | 'follow_up'         // سؤال متابعة
  | 'price_query'       // استعلام عن سعر
  | 'position_query'    // استعلام عن صفقاتي
  | 'council_query'     // استعلام عن المجلس
  | 'performance_query' // استعلام عن الأداء
  | 'risk_query'        // استعلام عن المخاطر
  | 'news_query'        // استعلام عن الأخبار
  | 'recommendation'    // طلب توصية
  | 'diagnosis'         // طلب تشخيص
  | 'pattern_query'     // طلب كشف أنماط
  | 'daily_brief'       // طلب موجز يومي
  | 'market_overview'   // ملخص السوق
  | 'general';

export interface DetectedAsset {
  symbol: string;
  shortSymbol: string;
  nameAr: string;
  nameEn: string;
  category: 'crypto' | 'forex' | 'commodity' | 'stock' | 'index';
}

export interface IntentClassification {
  intent: IntentType;
  confidence: number; // 0-1
  assets: DetectedAsset[];
  isFollowUp: boolean;
  needsFunctions: boolean;
  needsIntelligence: boolean;
  originalQuery: string;
}

// ─── Asset Detection (مبسّط) ─────────────────────────────────
const ASSET_REGISTRY: Array<{
  keywords: string[];
  symbol: string;
  shortSymbol: string;
  nameAr: string;
  nameEn: string;
  category: DetectedAsset['category'];
}> = [
  // Crypto
  { keywords: ['بتكوين', 'البتكوين', 'بيتكوين', 'bitcoin', 'btc'], symbol: 'BTCUSDT', shortSymbol: 'BTC', nameAr: 'البتكوين', nameEn: 'Bitcoin', category: 'crypto' },
  { keywords: ['إيثريوم', 'الإيثريوم', 'ايثريوم', 'ethereum', 'eth'], symbol: 'ETHUSDT', shortSymbol: 'ETH', nameAr: 'الإيثريوم', nameEn: 'Ethereum', category: 'crypto' },
  { keywords: ['سولانا', 'solana', 'sol'], symbol: 'SOLUSDT', shortSymbol: 'SOL', nameAr: 'سولانا', nameEn: 'Solana', category: 'crypto' },
  { keywords: ['دوج', 'دوجكوين', 'dogecoin', 'doge'], symbol: 'DOGEUSDT', shortSymbol: 'DOGE', nameAr: 'دوجكوين', nameEn: 'Dogecoin', category: 'crypto' },
  { keywords: ['ريبيل', 'xrp', 'ripple'], symbol: 'XRPUSDT', shortSymbol: 'XRP', nameAr: 'ريبيل', nameEn: 'Ripple', category: 'crypto' },
  // Commodities
  { keywords: ['ذهب', 'الذهب', 'gold', 'xau'], symbol: 'XAUUSD', shortSymbol: 'XAU', nameAr: 'الذهب', nameEn: 'Gold', category: 'commodity' },
  { keywords: ['فضة', 'الفضة', 'silver', 'xag'], symbol: 'XAGUSD', shortSymbol: 'XAG', nameAr: 'الفضة', nameEn: 'Silver', category: 'commodity' },
  { keywords: ['نفط', 'النفط', 'خام', 'oil', 'wti'], symbol: 'WTI', shortSymbol: 'WTI', nameAr: 'النفط', nameEn: 'Crude Oil', category: 'commodity' },
  // Forex
  { keywords: ['يورو', 'eur'], symbol: 'EURUSD', shortSymbol: 'EUR', nameAr: 'اليورو', nameEn: 'Euro', category: 'forex' },
  { keywords: ['جنيه', 'gbp', 'استرليني'], symbol: 'GBPUSD', shortSymbol: 'GBP', nameAr: 'الجنيه الإسترليني', nameEn: 'British Pound', category: 'forex' },
  { keywords: ['ين', 'jpy', 'الين'], symbol: 'USDJPY', shortSymbol: 'JPY', nameAr: 'الين الياباني', nameEn: 'Japanese Yen', category: 'forex' },
  { keywords: ['فرنك', 'chf'], symbol: 'USDCHF', shortSymbol: 'CHF', nameAr: 'الفرنك السويسري', nameEn: 'Swiss Franc', category: 'forex' },
  // Indices
  { keywords: ['spx', 's&p', 'اسب 500', 's&p 500'], symbol: 'SPX', shortSymbol: 'SPX', nameAr: 'مؤشر S&P 500', nameEn: 'S&P 500', category: 'index' },
  { keywords: ['nasdaq', 'ndx', 'ناسداك'], symbol: 'NDX', shortSymbol: 'NDX', nameAr: 'ناسداك', nameEn: 'Nasdaq 100', category: 'index' },
];

// ─── Intent Rules ────────────────────────────────────────────
interface IntentRule {
  intent: IntentType;
  keywords: string[];
  regexes?: RegExp[];
  needsFunctions?: boolean;
  needsIntelligence?: boolean;
}

const INTENT_RULES: IntentRule[] = [
  // ── Chat (محادثة عامة) ──
  {
    intent: 'chat',
    keywords: [
      'مرحبا', 'السلام', 'أهلا', 'هلا', 'صباح', 'مساء',
      'hello', 'hi', 'hey', 'good morning', 'good evening',
      'شكرا', 'thank', 'thanks', 'ممتاز', 'جيد',
      'كيف حالك', 'how are you', 'من أنت', 'who are you',
    ],
    regexes: [/^(مرحبا|hi|hello|hey|شكرا)\b/i],
  },

  // ── Education (شرح مفهوم) ──
  {
    intent: 'education',
    keywords: [
      'ما هو', 'ما هي', 'شرح', 'كيف يعمل', 'تعريف', 'مفهوم',
      'what is', 'how does', 'explain', 'definition', 'concept',
      'difference between', 'الفرق بين',
    ],
    regexes: [/^(ما هو|ما هي|what is|how does|explain)\b/i],
  },

  // ── Comparison (مقارنة) ──
  {
    intent: 'comparison',
    keywords: [
      'قارن', 'مقارنة', 'الفرق بين', 'أفضل', 'vs', 'versus',
      'compare', 'comparison', 'difference between',
    ],
  },

  // ── Opinion (رأي) ──
  {
    intent: 'opinion',
    keywords: [
      'رأيك', 'ما رأيك', 'هل تعتقد', 'what do you think',
      'do you think', 'your opinion', 'هل أشتري', 'هل أبيع',
    ],
  },

  // ── Price Query ──
  {
    intent: 'price_query',
    keywords: [
      'سعر', 'كم سعر', 'السعر الحالي', 'الآن', 'السعر الآن',
      'price', 'how much', 'current price', 'live price',
    ],
    regexes: [/سعر.*?(?:ذهب|نفط|btc|eth|يورو|دولار|bitcoin)/i],
    needsFunctions: true,
  },

  // ── Position Query (صفقاتي) ──
  {
    intent: 'position_query',
    keywords: [
      'صفقات', 'صفقاتي', 'مراكزي', 'مفتوحة', 'صفقات مفتوحة',
      'مركزي', 'ماذا أملك', 'محفظتي',
      'my positions', 'my trades', 'open positions', 'portfolio',
    ],
    needsFunctions: true,
  },

  // ── Council Query (المجلس) ──
  {
    intent: 'council_query',
    keywords: [
      'المجلس', 'الوكلاء', 'التصويت', 'الإجماع', 'ماذا يقول المجلس',
      'council', 'agents', 'vote', 'consensus', 'what does council say',
    ],
    needsFunctions: true,
  },

  // ── Performance Query (الأداء) ──
  {
    intent: 'performance_query',
    keywords: [
      'أداء', 'أدائي', 'كيف أدائي', 'نسبة الفوز', 'win rate',
      'performance', 'stats', 'statistics', 'how am i doing',
      'إحصائيات', 'ربح', 'خسارة', 'أرباحي', 'خسائري',
    ],
    needsFunctions: true,
    needsIntelligence: true,
  },

  // ── Risk Query (المخاطر) ──
  {
    intent: 'risk_query',
    keywords: [
      'مخاطر', 'مخاطرة', 'تعرض', 'هامش', 'كم المخاطرة',
      'risk', 'exposure', 'margin', 'how much at risk', 'safe',
    ],
    needsFunctions: true,
  },

  // ── News Query (الأخبار) ──
  {
    intent: 'news_query',
    keywords: [
      'أخبار', 'خبر', 'العناوين', 'آخر الأخبار', 'ماذا في الأخبار',
      'news', 'headlines', 'breaking', 'latest news',
    ],
    needsFunctions: true,
  },

  // ── Recommendation (توصية) ──
  {
    intent: 'recommendation',
    keywords: [
      'توصية', 'ماذا أفعل', 'نصيحة', 'اقترح', 'ماذا تنصح',
      'recommend', 'recommendation', 'suggest', 'advice', 'what should i do',
    ],
    needsFunctions: true,
    needsIntelligence: true,
  },

  // ── Diagnosis (تشخيص) ──
  {
    intent: 'diagnosis',
    keywords: [
      'تشخيص', 'حلّل أدائي', 'ما الخطأ', 'لماذا أخسر', 'في مشكلة',
      'diagnose', 'diagnosis', 'why losing', 'what wrong', 'analyze my performance',
    ],
    needsIntelligence: true,
  },

  // ── Pattern Query (أنماط) ──
  {
    intent: 'pattern_query',
    keywords: [
      'نمط', 'أنماط', 'أفضل يوم', 'أسوأ يوم', 'أفضل رمز',
      'pattern', 'patterns', 'best day', 'worst day', 'best symbol',
      'متى أتاجر', 'when to trade',
    ],
    needsIntelligence: true,
  },

  // ── Daily Brief (موجز يومي) ──
  {
    intent: 'daily_brief',
    keywords: [
      'موجز', 'ملخص اليوم', 'صباح', 'كيف اليوم', 'يومي',
      'daily', 'brief', 'today summary', 'morning brief', 'how is today',
    ],
    needsIntelligence: true,
  },

  // ── Market Overview (ملخص السوق) ──
  {
    intent: 'market_overview',
    keywords: [
      'السوق', 'كيف السوق', 'حالة السوق', 'وضع السوق',
      'market', 'how is the market', 'market overview', 'market status',
    ],
    needsFunctions: true,
  },

  // ── Follow-up (سؤال متابعة قصير) ──
  {
    intent: 'follow_up',
    keywords: [
      'وماذا بعد', 'لماذا', 'كيف', 'مثلا', 'أيضا',
      'explain more', 'why', 'how', 'example', 'also',
    ],
    regexes: [/^(وماذا بعد|لماذا|كيف|why|how)\b/i],
  },
];

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor() {
    this.logger.log('🎯 IntentClassifierService initialized');
  }

  /**
   * يصنّف سؤال المستخدم ويحدّد نوعه
   */
  classify(message: string): IntentClassification {
    const msgLower = message.toLowerCase().trim();

    // 1. كشف الأصول المالية المذكورة
    const assets = this._detectAssets(message, msgLower);

    // 2. مطابقة القواعد
    let bestMatch: { intent: IntentType; score: number; needsFunctions: boolean; needsIntelligence: boolean } | null = null;

    for (const rule of INTENT_RULES) {
      let score = 0;

      for (const keyword of rule.keywords) {
        if (msgLower.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }

      if (rule.regexes) {
        for (const regex of rule.regexes) {
          if (regex.test(msgLower)) {
            score += 3;
          }
        }
      }

      // تعزيز إذا تم كشف أصول
      if (
        assets.length > 0 &&
        ['price_query', 'position_query', 'council_query', 'recommendation'].includes(rule.intent)
      ) {
        score += 1;
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          intent: rule.intent,
          score,
          needsFunctions: rule.needsFunctions ?? false,
          needsIntelligence: rule.needsIntelligence ?? false,
        };
      }
    }

    // 3. fallback: إذا تم كشف أصول لكن لم يطابق أي قاعدة → price_query
    if (!bestMatch) {
      if (assets.length > 0) {
        bestMatch = {
          intent: 'price_query',
          score: 1,
          needsFunctions: true,
          needsIntelligence: false,
        };
      } else {
        bestMatch = {
          intent: 'general',
          score: 0,
          needsFunctions: false,
          needsIntelligence: false,
        };
      }
    }

    // 4. كشف متابعة (سؤال قصير جدًا)
    const isFollowUp = message.split(/\s+/).length <= 3 && !['chat', 'education'].includes(bestMatch.intent);

    return {
      intent: bestMatch.intent,
      confidence: Math.min(bestMatch.score / 5, 1),
      assets,
      isFollowUp,
      needsFunctions: bestMatch.needsFunctions,
      needsIntelligence: bestMatch.needsIntelligence,
      originalQuery: message,
    };
  }

  /**
   * يبني تلميح القالب للـ LLM حسب نوع السؤال
   * (يُحقن في system prompt ليوجّه الـ LLM للقالب المناسب)
   */
  buildTemplateHint(intent: IntentType, isAr: boolean): string {
    const hints: Record<IntentType, { ar: string; en: string }> = {
      chat: {
        ar: '💡 تعليمات هذا الرد: محادثة عامة. أجب بحرارة وبشكل حواري قصير. لا تستخدم قالب التحليل. لا تذكر أسعارًا. اقترح مواضيع.',
        en: '💡 Hint: General conversation. Reply warmly and conversationally, keep it short. Do NOT use analysis template. Do NOT mention prices.',
      },
      education: {
        ar: '💡 تعليمات هذا الرد: سؤال تعليمي. استخدم قالب: تعريف مختصر → كيف يعمل → مثال → التطبيق → سؤال ختامي. لا تخترع أرقام أسعار.',
        en: '💡 Hint: Educational question. Use template: brief definition → how it works → example → application → closing question.',
      },
      comparison: {
        ar: '💡 تعليمات هذا الرد: سؤال مقارنة. استخدم: جدول مقارنة → تحليل الفروقات → خلاصة → تنبيه مخاطر.',
        en: '💡 Hint: Comparison question. Use: comparison table → differences analysis → conclusion → risk disclaimer.',
      },
      opinion: {
        ar: '💡 تعليمات هذا الرد: سؤال رأي. قدم رأيك الصريح + التبرير + العوامل المخالفة + سؤال للمستخدم + تنبيه مخاطر.',
        en: '💡 Hint: Opinion question. Give frank opinion + reasoning + counter-factors + question for user + risk disclaimer.',
      },
      follow_up: {
        ar: '💡 تعليمات هذا الرد: سؤال متابعة. اربط ردك بالرد السابق مباشرة. اشرح أكثر أو أعطِ أمثلة. لا تكرر القالب الكامل.',
        en: '💡 Hint: Follow-up question. Connect to previous reply. Explain more or give examples. Do NOT repeat full template.',
      },
      price_query: {
        ar: '💡 تعليمات هذا الرد: استعلام عن سعر. استخدم القالب الخماسي: السعر الحالي + الاتجاه + العوامل + السيناريوهات + التوصية.',
        en: '💡 Hint: Price query. Use 5-section template: Current Price + Trend + Factors + Scenarios + Recommendation.',
      },
      position_query: {
        ar: '💡 تعليمات هذا الرد: استعلام عن صفقات. اعرض صفقات المستخدم المفتوحة بوضوح + PnL + المخاطرة + توصية.',
        en: '💡 Hint: Position query. Show user open positions clearly + PnL + risk + recommendation.',
      },
      council_query: {
        ar: '💡 تعليمات هذا الرد: استعلام عن المجلس. اعرض تصويت الـ 8 وكلاء + الإجماع + المبررات + توصية.',
        en: '💡 Hint: Council query. Show 8 agents votes + consensus + reasoning + recommendation.',
      },
      performance_query: {
        ar: '💡 تعليمات هذا الرد: استعلام عن الأداء. اعرض win rate + profit factor + PnL + أفضل/أسوأ صفقة + توصية.',
        en: '💡 Hint: Performance query. Show win rate + profit factor + PnL + best/worst trade + recommendation.',
      },
      risk_query: {
        ar: '💡 تعليمات هذا الرد: استعلام عن المخاطر. اعرض exposure % + margin + risk level + توصية واضحة.',
        en: '💡 Hint: Risk query. Show exposure % + margin + risk level + clear recommendation.',
      },
      news_query: {
        ar: '💡 تعليمات هذا الرد: استعلام عن الأخبار. لخّص آخر الأخبار + التأثير على السوق + توصية.',
        en: '💡 Hint: News query. Summarize latest news + market impact + recommendation.',
      },
      recommendation: {
        ar: '💡 تعليمات هذا الرد: طلب توصية. قدم توصية واضحة + مستوى ثقة + مخاطر + خطوات تنفيذية.',
        en: '💡 Hint: Recommendation request. Give clear recommendation + confidence level + risks + actionable steps.',
      },
      diagnosis: {
        ar: '💡 تعليمات هذا الرد: طلب تشخيص. اعرض Health Score + أهم المشاكل + الأسباب الجذرية + خطوات علاج.',
        en: '💡 Hint: Diagnosis request. Show Health Score + top issues + root causes + remediation steps.',
      },
      pattern_query: {
        ar: '💡 تعليمات هذا الرد: طلب كشف أنماط. اعرض أفضل/أسوأ يوم + أفضل/أسوأ رمز + أنماط الاتجاه + توصية.',
        en: '💡 Hint: Pattern query. Show best/worst day + best/worst symbol + direction patterns + recommendation.',
      },
      daily_brief: {
        ar: '💡 تعليمات هذا الرد: طلب موجز يومي. اعرض ملخص الأمس + حالة اليوم + المخاطر + توصيات اليوم.',
        en: '💡 Hint: Daily brief request. Show yesterday summary + today status + risks + today recommendations.',
      },
      market_overview: {
        ar: '💡 تعليمات هذا الرد: ملخص السوق. اعرض مؤشرات رئيسية + حركة + اتجاه + عوامل مؤثرة.',
        en: '💡 Hint: Market overview. Show key indices + movement + direction + driving factors.',
      },
      general: {
        ar: '💡 تعليمات هذا الرد: سؤال عام. اختر القالب الأنسب حسب نوع السؤال. كن حيًا ومرنًا.',
        en: '💡 Hint: General question. Pick the most appropriate template. Be alive and flexible.',
      },
    };

    const hint = hints[intent] ?? hints.general;
    return isAr ? hint.ar : hint.en;
  }

  // ─── Asset Detection ────────────────────────────────────────

  private _detectAssets(message: string, msgLower: string): DetectedAsset[] {
    const assets: DetectedAsset[] = [];
    const seen = new Set<string>();

    // 1. كشف أنماط أزواج الفوركس (EUR/USD, GBPUSD, etc.)
    const forexMatch = message.match(/\b(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD|EURGBP|EURJPY|GBPJPY)\b/i);
    if (forexMatch) {
      const pair = forexMatch[1].toUpperCase();
      if (!seen.has(pair)) {
        seen.add(pair);
        assets.push({
          symbol: pair,
          shortSymbol: pair.slice(0, 3),
          nameAr: pair,
          nameEn: pair,
          category: 'forex',
        });
      }
    }

    // 2. كشف بالكلمات المفتاحية
    for (const assetDef of ASSET_REGISTRY) {
      for (const keyword of assetDef.keywords) {
        if (msgLower.includes(keyword.toLowerCase()) && !seen.has(assetDef.symbol)) {
          seen.add(assetDef.symbol);
          assets.push({
            symbol: assetDef.symbol,
            shortSymbol: assetDef.shortSymbol,
            nameAr: assetDef.nameAr,
            nameEn: assetDef.nameEn,
            category: assetDef.category,
          });
          break;
        }
      }
    }

    return assets;
  }
}
