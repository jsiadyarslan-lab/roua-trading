/**
 * Seed script: Generate test ContentArticle reports directly in the database using Prisma.
 *
 * Run:  npx ts-node -P apps/api/tsconfig.json scripts/seed-reports.ts
 *
 * Generates ~20 test reports covering all contentType variants:
 *   HOURLY_UPDATE (5), NEWS_DIGEST (4), WEEKLY_REVIEW (3),
 *   PAIR_ANALYSIS (4), MARKET_REPORT (2), ANALYSIS (2)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 4): number {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

// ── Report Definitions ───────────────────────────────────────────────────────

interface ReportDef {
  contentType: string;
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
  summaryAr: string;
  summaryEn: string;
  category: string;
  categoryAr: string;
  tags: string[];
  relatedSymbols: string[];
  impactLevel: string;
  confidence: number;
  qualityScore: number;
  sentimentScore: number;
  riskWarnings: string[];
  readingTimeMinutes: number;
  wordCountAr: number;
  wordCountEn: number;
  publishedAt: Date;
}

const reports: ReportDef[] = [
  // ── HOURLY_UPDATE (5) ────────────────────────────────────────────────────

  {
    contentType: 'HOURLY_UPDATE',
    titleAr: 'تحديث ساعي — صعود البيتكوين فوق 68 ألف دولار',
    titleEn: 'Hourly Update — Bitcoin Surges Past $68K',
    contentAr: `شهد سوق العملات الرقمية اليوم حركة صعودية قوية حيث اخترق سعر البيتكوين حاجز 68,000 دولار لأول مرة منذ أسابيع. جاء هذا الارتفاع مدعوماً بزيادة ملحوظة في حجم التداول على البورصات المركزية، حيث تجاوز حجم التداول الفعلي 38 مليار دولار خلال الـ24 ساعة الماضية. وتشير مؤشرات الزخم إلى استمرار الاتجاه الصعودي مع دخول أموال جديدة إلى السوق.

من الناحية الفنية، نجح البيتكوين في اختراق مستوى مقاومة مهم عند 67,500 دولار والاستقرار فوقه، مما يفتح الطريق نحو هدف آخر عند 70,000 دولار. مؤشر القوة النسبية (RSI) على الإطار الزمني اليومي يسجل 62، مما يشير إلى وجود مساحة إضافية للصعود قبل الوصول إلى منطقة التشبع الشرائي. كما أن المتوسط المتحرك الأسي 50 يومًا يتقاطع صعوداً فوق المتوسط 200 يومًا مشكلاً نموذج التقاطع الذهبي.

تجدر الإشارة إلى أن ارتفاع البيتكوين ترافق مع تدفقات إيجابية على صناديق البيتكوين المتداولة في البورصة (ETFs)، حيث سجلت صافي تدفقات دخول بقيمة 420 مليون دولار أمس. ويبقى المستوى الرئيسي للدعم عند 65,000 دولار في حال حدوث تصحيح قصير الأجل.`,
    contentEn: `The cryptocurrency market witnessed a strong bullish move today as Bitcoin price broke through the $68,000 barrier for the first time in weeks. This surge was supported by a notable increase in trading volume on centralized exchanges, with spot trading volume exceeding $38 billion over the past 24 hours. Momentum indicators suggest the uptrend will continue as fresh capital flows into the market.

From a technical perspective, Bitcoin successfully broke and held above the key resistance level at $67,500, opening the door toward the next target at $70,000. The daily RSI registers at 62, indicating there is still room for upside before reaching overbought territory. Additionally, the 50-day EMA is crossing above the 200-day EMA, forming a golden cross pattern that historically signals further gains.

It is worth noting that Bitcoin's rally coincided with positive inflows into Bitcoin ETFs, with net inflows of $420 million recorded yesterday. The key support level remains at $65,000 in case of a short-term pullback, while the psychological resistance at $70,000 represents the next major hurdle for bulls to overcome.`,
    summaryAr: 'ارتفع البيتكوين فوق 68 ألف دولار بدعم من زيادة حجم التداول وتدفقات إيجابية على صناديق ETF، مع إشارات فنية إيجابية تستمر في دعم الاتجاه الصعودي.',
    summaryEn: 'Bitcoin surged past $68K supported by increased trading volume and positive ETF inflows, with bullish technical signals continuing to support the uptrend.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['bitcoin', 'crypto', 'btc', 'technical-analysis', 'etf'],
    relatedSymbols: ['BTC/USDT'],
    impactLevel: 'HIGH',
    confidence: 88,
    qualityScore: 90,
    sentimentScore: 0.72,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'الأسعار قد تتقلب بشكل كبير في فترات قصيرة'],
    readingTimeMinutes: 4,
    wordCountAr: 280,
    wordCountEn: 260,
    publishedAt: hoursAgo(2),
  },

  {
    contentType: 'HOURLY_UPDATE',
    titleAr: 'تحديث ساعي — اليورو يتراجع مقابل الدولار',
    titleEn: 'Hourly Update — Euro Declines Against Dollar',
    contentAr: `تراجع اليورو مقابل الدولار الأمريكي خلال جلسة التداول اليومية ليصل إلى مستوى 1.0820، مسجلاً أدنى مستوى له منذ أسبوعين. جاء هذا التراجع بعد بيانات اقتصادية أمريكية أقوى من المتوقع أظهرت استمرار صلابة سوق العمل الأمريكي، مما قلل من توقعات خفض الفائدة من الاحتياطي الفيدرالي في الاجتماع القادم.

أظهرت بيانات المطالبات الجديدة للإعانة البطالة انخفاضاً إلى 210 آلاف طلب، وهو أقل من التوقعات البالغة 218 ألفاً، مما يشير إلى استمرار قوة سوق العمل. في المقابل، أظهرت مؤشرات قطاع الخدمات الأوروبي تراجعاً طفيفاً، مما زاد من الضغوط على اليورو. وتشير تقديرات الأسواق الآن إلى احتمال 65% لخفض الفائدة في يونيو مقارنة مع 78% الأسبوع الماضي.

من الناحية الفنية، يقع الزوج تحت ضغط بيعي مع اختراق مستوى دعم عند 1.0850. المستوى التالي لدعم يقع عند 1.0780، بينما يشكل 1.0900 مقاومة فورية. مؤشر القوة النسبية على الإطار اليومي يدنو من منطقة التشبع البيعي عند 35.`,
    contentEn: `The Euro declined against the US Dollar during the daily trading session, reaching 1.0820, its lowest level in two weeks. This decline came after stronger-than-expected US economic data showed continued resilience in the American labor market, reducing expectations of a Federal Reserve rate cut at the next meeting.

Initial jobless claims fell to 210K, below the expected 218K, indicating that the labor market remains robust. Meanwhile, Eurozone services sector indicators showed a slight decline, adding pressure on the Euro. Market estimates now indicate a 65% probability of a rate cut in June, compared to 78% last week.

From a technical standpoint, the pair is under selling pressure after breaking below the support level at 1.0850. The next support level sits at 1.0780, while 1.0900 forms immediate resistance. The daily RSI is approaching oversold territory at 35, which could trigger a short-term bounce if buyers step in at current levels.`,
    summaryAr: 'تراجع اليورو مقابل الدولار إلى 1.0820 بسبب بيانات أمريكية قوية قللت من توقعات خفض الفائدة، مع ضغوط فنية بيعية مستمرة.',
    summaryEn: 'The Euro fell against the Dollar to 1.0820 as strong US data reduced rate cut expectations, with continued bearish technical pressure.',
    category: 'FOREX',
    categoryAr: 'فوركس',
    tags: ['eurusd', 'forex', 'dollar', 'euro', 'fed'],
    relatedSymbols: ['EUR/USD'],
    impactLevel: 'MEDIUM',
    confidence: 82,
    qualityScore: 85,
    sentimentScore: -0.35,
    riskWarnings: ['تداول الفوركس ينطوي على مخاطر عالية', 'الرافعة المالية قد تضخم الخسائر'],
    readingTimeMinutes: 4,
    wordCountAr: 260,
    wordCountEn: 240,
    publishedAt: hoursAgo(4),
  },

  {
    contentType: 'HOURLY_UPDATE',
    titleAr: 'تحديث ساعي — مؤشر ناسداك يرتفع 1.2%',
    titleEn: 'Hourly Update — Nasdaq Rises 1.2%',
    contentAr: `صعد مؤشر ناسداك المركب بنسبة 1.2% خلال جلسة التداول ليغلق عند 18,250 نقطة، مدعوماً بأداء قوي لأسهم التكنولوجيا الكبرى. قادت أسهم شركة إنفيديا ونصف مايكرو الارتفاع مع استمرار تفاؤل المستثمرين حول قطاع الذكاء الاصطناعي. كما ساهم أداء إيجابي لشركة أبل بعد الإعلان عن شراكة جديدة في مجال الذكاء الاصطناعي في دعم المؤشر.

أظهرت بيانات الأسواق أن قطاع التكنولوجيا استحوذ على أكثر من 60% من مكاسب المؤشر، مع تدفقات شرائية قوية على صناديق الاستثمار المتداولة التقنية. حجم التداول الإجمالي تجاوز متوسطه اليومي بنسبة 15%، مما يعكس اهتماماً متزايداً من المستثمرين. مؤشر VIX للقلق هبط إلى 14.5 وهو أدنى مستوى منذ ثلاثة أشهر.

من الناحية الفنية، نجح المؤشر في اختراق مستوى مقاومة عند 18,000 والاستقرار فوقه، مع إشارات إيجابية من مؤشر MACD على الإطار اليومي. يستهدف المستوى التالي 18,500 نقطة كهدف صعودي قريب.`,
    contentEn: `The Nasdaq Composite rose 1.2% during the trading session to close at 18,250 points, supported by strong performance from major technology stocks. Nvidia and AMD shares led the gains as investor optimism around the AI sector continued. Apple also contributed positively after announcing a new AI partnership, further supporting the index.

Market data showed the technology sector accounted for over 60% of the index's gains, with strong buying flows into tech ETFs. Total trading volume exceeded its daily average by 15%, reflecting increased investor interest. The VIX fear index dropped to 14.5, its lowest level in three months.

From a technical standpoint, the index successfully broke and held above the resistance level at 18,000, with positive signals from the daily MACD indicator. The next target sits at 18,500 points as the near-term bullish objective, while support is established at the 17,800 level.`,
    summaryAr: 'ارتفع ناسداك 1.2% مدعوماً بأسهم التكنولوجيا والذكاء الاصطناعي، مع اختراق فني لمستوى 18,000 نقطة.',
    summaryEn: 'Nasdaq rose 1.2% driven by tech and AI stocks, with a technical breakout above the 18,000 level.',
    category: 'STOCKS',
    categoryAr: 'أسهم',
    tags: ['nasdaq', 'stocks', 'tech', 'ai', 'nvidia'],
    relatedSymbols: ['NASDAQ'],
    impactLevel: 'MEDIUM',
    confidence: 80,
    qualityScore: 83,
    sentimentScore: 0.55,
    riskWarnings: ['الأسهم قد تتأثر بتقلبات السوق', 'الأداء السابق لا يضمن النتائج المستقبلية'],
    readingTimeMinutes: 4,
    wordCountAr: 270,
    wordCountEn: 250,
    publishedAt: hoursAgo(6),
  },

  {
    contentType: 'HOURLY_UPDATE',
    titleAr: 'تحديث ساعي — الإيثيريوم يختبر مقاومة 3800',
    titleEn: 'Hourly Update — Ethereum Tests $3800 Resistance',
    contentAr: `يختبر الإيثيريوم مستوى مقاومة مهم عند 3,800 دولار وسط زيادة ملحوظة في نشاط الشبكة وحجم المعاملات. ارتفع سعر ETH بنسبة 3.5% خلال الـ24 ساعة الماضية ليتداول حول 3,780 دولاراً، مع تصاعد في حجم التداول على منصات اللامركزية. تشير البيانات على السلسلة إلى ارتفاع عدد العناوين النشطة بنسبة 12% مقارنة بالأسبوع الماضي.

ساهمت التوقعات الإيجابية حول ترقية الشبكة القادمة وتحديثات طبقة التوسع L2 في دعم المشاعر الصعودية. كما أن حرق الرسوم المستمر أدى إلى انخفاض المعروض المتداول، مما يضيف ضغطاً شرائياً إضافياً. أظهرت بيانات المشتقات ارتفاعاً في المراكز المفتوحة بنسبة 8% مما يشير إلى دخول رأس مال جديد.

من الناحية الفنية، يشكل المستوى عند 3,800 مقاومة رئيسية يتطلب اختراقها حجم تداول مرتفع. في حال النجاح، يستهدف 4,000 كهدف صعودي تالي. مؤشر RSI عند 58 على الإطار اليومي مع مؤشرات زخم إيجابية.`,
    contentEn: `Ethereum is testing a key resistance level at $3,800 amid a notable increase in network activity and transaction volume. ETH price rose 3.5% over the past 24 hours to trade around $3,780, with rising trading volume on decentralized platforms. On-chain data indicates a 12% increase in active addresses compared to last week.

Positive expectations around the upcoming network upgrade and L2 scaling updates have supported bullish sentiment. The ongoing fee burn has also reduced the circulating supply, adding additional buying pressure. Derivatives data showed an 8% increase in open interest, indicating new capital entering the market.

Technically, the $3,800 level forms key resistance that requires high trading volume for a breakout. If successful, $4,000 is targeted as the next bullish objective. The daily RSI sits at 58 with positive momentum indicators, suggesting room for further upside before reaching overbought conditions.`,
    summaryAr: 'يختبر الإيثيريوم مقاومة 3,800 دولار بدعم من زيادة نشاط الشبكة وتوقعات إيجابية حول الترقيات القادمة.',
    summaryEn: 'Ethereum tests $3,800 resistance supported by increased network activity and positive expectations around upcoming upgrades.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['ethereum', 'crypto', 'eth', 'defi', 'layer2'],
    relatedSymbols: ['ETH/USDT'],
    impactLevel: 'MEDIUM',
    confidence: 77,
    qualityScore: 82,
    sentimentScore: 0.48,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'قد تحدث تقلبات حادة'],
    readingTimeMinutes: 3,
    wordCountAr: 250,
    wordCountEn: 240,
    publishedAt: hoursAgo(8),
  },

  {
    contentType: 'HOURLY_UPDATE',
    titleAr: 'تحديث ساعي — الذهب يستقر فوق 2350',
    titleEn: 'Hourly Update — Gold Holds Above $2350',
    contentAr: `استقر سعر الذهب فوق مستوى 2,350 دولار للأونصة خلال تداولات اليوم، مدعوماً بالقلق الجيوسياسي وتوقعات خفض الفائدة من الفيدرالي. ارتفع المعدن النفيس بنسبة 0.8% ليبلغ 2,365 دولاراً، مع تحسن في الطلب من المستثمرين كملاذ آمن. أظهرت بيانات البنوك المركزية استمرار مشتريات الذهب للشهر الثامن عشر على التوالي.

ساهمت التوترات في الشرق الأوسط ومخاوف من تصعيد الصراعات الإقليمية في تعزيز جاذبية الذهب كأصل ملاذ. كما أن بيانات التضخم الأمريكية الأحدث من المتوقع عززت توقعات أن يبدأ الفيدرالي دورة خفض الفائدة في الأشهر القادمة، مما يقلل من تكلفة الاحتفاظ بالذهب غير العائد. مؤشر الدولار هبط 0.3% مما أضاف دعماً إضافياً.

فنياً، يستقر الذهب فوق دعم 2,340 دولار ويستهدف 2,400 كهدف صعودي تالي. مؤشرات الزخم إيجابية مع RSI عند 62 على الإطار الأسبوعي، مما يشير إلى استمرار الاتجاه الصعودي مع وجود مساحة إضافية قبل منطقة التشبع.`,
    contentEn: `Gold price stabilized above the $2,350 per ounce level during today's trading, supported by geopolitical concerns and Federal Reserve rate cut expectations. The precious metal rose 0.8% to reach $2,365, with improved demand from investors as a safe haven. Central bank data showed continued gold purchases for the 18th consecutive month.

Tensions in the Middle East and fears of regional conflict escalation have bolstered gold's appeal as a haven asset. Moreover, softer-than-expected US inflation data reinforced expectations that the Fed will begin a rate-cutting cycle in the coming months, reducing the opportunity cost of holding non-yielding gold. The dollar index fell 0.3%, providing additional support.

Technically, gold is holding above $2,340 support and targets $2,400 as the next bullish objective. Momentum indicators are positive with the weekly RSI at 62, indicating the uptrend remains intact with additional room before reaching overbought territory.`,
    summaryAr: 'استقر الذهب فوق 2350 دولار بدعم من التوترات الجيوسياسية وتوقعات خفض الفائدة، مع استهداف 2400 دولار.',
    summaryEn: 'Gold held above $2,350 supported by geopolitical tensions and rate cut expectations, targeting $2,400 next.',
    category: 'COMMODITIES',
    categoryAr: 'سلع',
    tags: ['gold', 'commodities', 'xauusd', 'safe-haven', 'inflation'],
    relatedSymbols: ['XAU/USD'],
    impactLevel: 'MEDIUM',
    confidence: 84,
    qualityScore: 86,
    sentimentScore: 0.42,
    riskWarnings: ['أسعار السلع قد تتأثر بالأحداث الجيوسياسية', 'تقلبات الأسعار ممكنة'],
    readingTimeMinutes: 4,
    wordCountAr: 270,
    wordCountEn: 250,
    publishedAt: hoursAgo(3),
  },

  // ── NEWS_DIGEST (4) ──────────────────────────────────────────────────────

  {
    contentType: 'NEWS_DIGEST',
    titleAr: 'ملخص يومي — سوق العملات الرقمية',
    titleEn: 'Daily Digest — Crypto Market',
    contentAr: `شهد سوق العملات الرقمية اليوم حركة نشطة ملحوظة مع ارتفاع القيمة السوقية الإجمالية بنسبة 2.3% لتصل إلى 2.65 تريليون دولار. تصدر البيتكوين الارتفاعات بعد اختراقه حاجز 68 ألف دولار، يليه الإيثيريوم الذي اقترب من مستوى 3,800 دولار. كما شهدت العملات البديلة أداءً متبايناً مع ارتفاع ملحوظ في عملات قطاع الذكاء الاصطناعي.

أبرز أحداث اليوم تضمنت إعلان منظمين آسيويين عن إطار تنظيمي جديد للعملات الرقمية يهدف لحماية المستثمرين مع تشجيع الابتكار. كما كشفت بيانات على السلسلة عن تحويلات كبيرة من البورصات إلى المحافظ الباردة، مما يشير إلى نية الاحتفاظ لدى المستثمرين الكبار. حجم التداول الإجمالي ارتفع 18% مقارنة باليوم السابق.

على صعيد المشتقات، ارتفعت المراكز المفتوطة بنسبة 5% مع تحسن معنويات السوق. معدل التمويل على العقود الدائمة تحول إلى إيجابي على معظم البورصات الرئيسية، مما يعكس توجه السوق نحو الصعود. توقعات المحللين تشير إلى إمكانية استمرار الاتجاه الإيجابي مع مراقبة مستويات المقاومة الرئيسية.`,
    contentEn: `The cryptocurrency market saw notable active trading today, with the total market capitalization rising 2.3% to reach $2.65 trillion. Bitcoin led the gains after breaking the $68K barrier, followed by Ethereum which approached $3,800. Altcoins showed mixed performance with notable gains in AI-sector tokens.

Key events of the day included Asian regulators announcing a new regulatory framework for cryptocurrencies aimed at protecting investors while encouraging innovation. On-chain data also revealed large transfers from exchanges to cold wallets, indicating holding intent among large investors. Total trading volume increased 18% compared to the previous day.

On the derivatives front, open interest rose 5% with improving market sentiment. The funding rate on perpetual contracts turned positive on most major exchanges, reflecting the market's bullish tilt. Analyst expectations suggest the positive trend may continue, with key resistance levels being closely monitored for potential breakout confirmation.`,
    summaryAr: 'ارتفعت القيمة السوقية للعملات الرقمية 2.3% مع تصدر البيتكوين المكاسب وإعلانات تنظيمية آسيوية جديدة تدعم السوق.',
    summaryEn: 'Crypto market cap rose 2.3% with Bitcoin leading gains and new Asian regulatory announcements supporting the market.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['crypto', 'bitcoin', 'ethereum', 'market-digest', 'regulation'],
    relatedSymbols: ['BTC/USDT', 'ETH/USDT'],
    impactLevel: 'HIGH',
    confidence: 85,
    qualityScore: 88,
    sentimentScore: 0.58,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'السوق عرضة لتقلبات مفاجئة'],
    readingTimeMinutes: 5,
    wordCountAr: 300,
    wordCountEn: 280,
    publishedAt: daysAgo(0),
  },

  {
    contentType: 'NEWS_DIGEST',
    titleAr: 'ملخص يومي — سوق الفوركس',
    titleEn: 'Daily Digest — Forex Market',
    contentAr: `شهد سوق الفوركس اليوم حركات متباينة بين الأزواج الرئيسية، حيث تراجع اليورو مقابل الدولار الأمريكي متأثراً ببيانات اقتصادية أمريكية أقوى من المتوقع. في المقابل، ارتفع الجنيه الإسترليني مدعوماً ببيانات التضخم البريطانية التي جاءت أعلى من التوقعات، مما قلل من احتمالات خفض الفائدة من بنك إنجلترا.

الين الياباني واصل ضعفه مقابل الدولار مع استمرار بنك اليابان في سياسته النقدية المتساهلة، حيث تجاوز الزوج مستوى 155 ين لكل دولار. أشار مسؤولون يابانيون إلى أنهم يراقبون تحركات السوق عن كثب مع إمكانية التدخل في حال حركات مفاجئة. الدولار الأسترالي ارتفع بدعم من بيانات التوظيف القوية.

من حيث المؤشرات الفنية، يظهر مؤشر القوة النسبية للدولار إشارات تشبع شرائي على عدة أزواج، مما قد يشير إلى تصحيح قريب. تشير أنماط الشموع على الإطار اليومي لإمكانية تشكل نموذج انعكاسي على زوج الدولار/الين عند المستويات الحالية.`,
    contentEn: `The Forex market saw divergent movements among major pairs today, with the Euro declining against the US Dollar influenced by stronger-than-expected US economic data. Conversely, the British Pound rose supported by UK inflation data that came in above expectations, reducing the likelihood of a Bank of England rate cut.

The Japanese Yen continued its weakness against the Dollar as the Bank of Japan maintained its accommodative monetary policy, with the pair exceeding the 155 yen per dollar level. Japanese officials indicated they are closely monitoring market movements with the possibility of intervention in case of sudden moves. The Australian Dollar rose supported by strong employment data.

In terms of technical indicators, the Dollar's RSI shows overbought signals on several pairs, which could indicate a near-term correction. Candlestick patterns on the daily frame suggest the potential formation of a reversal pattern on the USD/JPY pair at current levels.`,
    summaryAr: 'تراجع اليورو مقابل الدولار ببيانات أمريكية قوية، بينما ارتفع الجنيه بتضخم بريطاني مرتفع والين يواصل ضعفه.',
    summaryEn: 'Euro fell against Dollar on strong US data, while Pound rose on high UK inflation and Yen continued to weaken.',
    category: 'FOREX',
    categoryAr: 'فوركس',
    tags: ['forex', 'eurusd', 'gbpusd', 'usdjpy', 'central-banks'],
    relatedSymbols: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    impactLevel: 'MEDIUM',
    confidence: 80,
    qualityScore: 84,
    sentimentScore: 0.15,
    riskWarnings: ['تداول الفوركس ينطوي على مخاطر عالية', 'استخدام الرافعة المالية قد يضخم الخسائر'],
    readingTimeMinutes: 5,
    wordCountAr: 280,
    wordCountEn: 260,
    publishedAt: daysAgo(0),
  },

  {
    contentType: 'NEWS_DIGEST',
    titleAr: 'ملخص يومي — سوق الأسهم الأمريكية',
    titleEn: 'Daily Digest — US Stock Market',
    contentAr: `أغلقت الأسواق الأمريكية على ارتفاع اليوم مع صعود مؤشر ستاندرد آند بورز 500 بنسبة 0.7% ليصل إلى 5,250 نقطة، مدعوماً بأداء قوي لقطاع التكنولوجيا. ارتفع مؤشر داو جونز بنسبة 0.4% بينما صعد ناسداك 1.2% مسجلاً أداءً مميزاً بفضل مكاسب أسهم الذكاء الاصطناعي. استمرت أسهم إنفيديا ومايكروسوفت في تحقيق مكاسب جديدة.

على صعيد الأرباح، أعلنت شركة أمازون عن نتائج ربع سنوية تفوق التوقعات مع نمو قوي في خدمات الحوسبة السحابية. كما سجلت شركة ميتا بلاتفورمز إيرادات أعلى من المتوقع مدعومة بنمو الإعلانات. في المقابل، تراجعت أسهم شركة تسلا بعد تقارير عن تأخير في إطلاق موديل جديد.

أظهرت بيانات الاقتصاد الكلي استمرار النمو مع انخفاض طفيف في طلبات الإعانة، مما عزز التوقعات بتحقيق هبوط ناعم للاقتصاد الأمريكي. تشير توقعات المحللين إلى استمرار الأداء الإيجابي مع تركيز على بيانات التضخم القادمة.`,
    contentEn: `US markets closed higher today with the S&P 500 rising 0.7% to reach 5,250 points, supported by strong performance in the technology sector. The Dow Jones gained 0.4% while the Nasdaq climbed 1.2%, delivering standout performance thanks to AI stock gains. Nvidia and Microsoft shares continued to hit new highs.

On the earnings front, Amazon announced quarterly results that exceeded expectations with strong growth in cloud computing services. Meta Platforms also recorded higher-than-expected revenue driven by advertising growth. Conversely, Tesla shares declined after reports of delays in launching a new model.

Macroeconomic data showed continued growth with a slight decline in jobless claims, reinforcing expectations of a soft landing for the US economy. Analyst forecasts suggest continued positive performance with focus on upcoming inflation data that could influence Fed policy decisions.`,
    summaryAr: 'ارتفعت الأسهم الأمريكية بقيادة قطاع التكنولوجيا، مع نتائج أرباح قوية لأمازون وميتا وتوقعات بتحقيق هبوط ناعم.',
    summaryEn: 'US stocks rose led by tech sector, with strong earnings from Amazon and Meta and soft landing expectations.',
    category: 'STOCKS',
    categoryAr: 'أسهم',
    tags: ['stocks', 'sp500', 'nasdaq', 'earnings', 'tech'],
    relatedSymbols: ['SPX', 'NDX', 'AAPL', 'NVDA'],
    impactLevel: 'HIGH',
    confidence: 87,
    qualityScore: 89,
    sentimentScore: 0.62,
    riskWarnings: ['الأسهم عرضة لتقلبات السوق', 'الأداء السابق لا يضمن النتائج المستقبلية'],
    readingTimeMinutes: 5,
    wordCountAr: 300,
    wordCountEn: 280,
    publishedAt: daysAgo(0),
  },

  {
    contentType: 'NEWS_DIGEST',
    titleAr: 'ملخص يومي — المشهد الاقتصادي العالمي',
    titleEn: 'Daily Digest — Global Economy',
    contentAr: `يشهد المشهد الاقتصادي العالمي تطورات متعددة حيث أظهرت البيانات الصينية نمواً أقوى من المتوقع في الناتج المحلي الإجمالي بنسبة 5.3% على أساس سنوي في الربع الأول، مما عزز التفاؤل بشأن ثاني أكبر اقتصاد في العالم. جاء هذا الأداء مدعوماً بزيادة الإنفاق الحكومي وتحسن قطاع التصنيع.

في أوروبا، حافظ البنك المركزي الأوروبي على أسعار الفائدة دون تغيير مع إشارات إلى احتمال بدء خفض الفائدة في الاجتماع القادم. أظهرت بيانات التضخم في منطقة اليورو تراجعاً تدريجياً نحو هدف 2%، مما يمنح صانعي السياسة مرونة أكبر. في المقابل، لا يزال التضخم في المملكة المتحدة مرتفعاً عند 3.2%.

على صعيد التجارة العالمية، أشارت بيانات شحن البضائع إلى تعافي تدريجي في التجارة الدولية مع تحسن مؤشرات النقل البحري. كما شهدت أسعار الطاقة استقراراً نسبياً مع تراجع طفيف في أسعار النفط الخام وسط توازن بين العرض والطلب. توقعات صندوق النقد الدولي تشير لنمو عالمي بنسبة 3.2% هذا العام.`,
    contentEn: `The global economic landscape is witnessing multiple developments as Chinese data showed stronger-than-expected GDP growth of 5.3% year-on-year in the first quarter, boosting optimism about the world's second-largest economy. This performance was supported by increased government spending and improvement in the manufacturing sector.

In Europe, the European Central Bank maintained interest rates unchanged with signals of a possible rate cut at the next meeting. Eurozone inflation data showed a gradual decline toward the 2% target, giving policymakers more flexibility. Meanwhile, UK inflation remains elevated at 3.2%.

On the global trade front, freight shipping data indicated a gradual recovery in international commerce with improving maritime transport indicators. Energy prices also saw relative stability with a slight decline in crude oil prices amid a balance between supply and demand. IMF forecasts indicate global growth of 3.2% this year, with emerging markets leading the expansion.`,
    summaryAr: 'نمو صيني أقوى من المتوقع وثبات أوروبي مع إشارات لخفض الفائدة، وتعافي تدريجي في التجارة العالمية.',
    summaryEn: 'Stronger Chinese growth, steady Europe with rate cut signals, and gradual global trade recovery.',
    category: 'ECONOMY',
    categoryAr: 'اقتصاد',
    tags: ['economy', 'gdp', 'china', 'ecb', 'global-trade'],
    relatedSymbols: ['EUR/USD', 'USD/CNH', 'SPX'],
    impactLevel: 'HIGH',
    confidence: 83,
    qualityScore: 87,
    sentimentScore: 0.35,
    riskWarnings: ['الأوضاع الاقتصادية قد تتغير بسرعة', 'المخاطر الجيوسياسية تؤثر على الأسواق'],
    readingTimeMinutes: 6,
    wordCountAr: 310,
    wordCountEn: 290,
    publishedAt: daysAgo(0),
  },

  // ── WEEKLY_REVIEW (3) ────────────────────────────────────────────────────

  {
    contentType: 'WEEKLY_REVIEW',
    titleAr: 'مراجعة أسبوعية — أداء العملات الرقمية',
    titleEn: 'Weekly Review — Crypto Performance',
    contentAr: `اختتمت العملات الرقمية أسبوعاً إيجابياً مع ارتفاع القيمة السوقية الإجمالية بنسبة 4.8% لتصل إلى 2.7 تريليون دولار. تصدر البيتكوين الأداء الأسبوعي بارتفاع 5.2% مسجلاً أعلى مستوى عند 69,200 دولار، بينما ارتفع الإيثيريوم 6.1% ليقترب من حاجز 3,900 دولار. شهدت عملات القطاعات المتخصصة أداءً متبايناً مع تفوق قطاع الذكاء الاصطناعي وDeFi.

أبرز أحداث الأسبوع تضمنت موافقة لجنة الأوراق المالية والبورصات الأمريكية على إطار تنظيمي جديد لصناديق العملات الرقمية المتداولة، مما فتح الباب لمزيد من المنتجات الاستثمارية المؤسسية. كما شهدنا تحديثاً مهماً لشبكة الإيثيريوم ساهم في تحسين كفاءة الطبقة الثانية. أعلنت عدة بنوك كبرى عن خطط لدمج خدمات العملات الرقمية.

من الناحية الفنية، يظهر البيتكوين نموذجاً صعودياً على الإطار الأسبوعي مع تأكيد التقاطع الذهبي بين المتوسطات المتحركة 50 و200 أسبوع. مستويات الدعم الرئيسية تقع عند 64,000 و60,000 دولار، بينما تقع المقاومة عند 70,000 و73,000 دولار. مؤشرات الزخم تدعم استمرار الاتجاه الصعودي مع RSI أسبوعي عند 65.`,
    contentEn: `Cryptocurrencies closed a positive week with the total market capitalization rising 4.8% to reach $2.7 trillion. Bitcoin led the weekly performance with a 5.2% gain, recording a high of $69,200, while Ethereum rose 6.1% approaching the $3,900 barrier. Specialized sector tokens showed mixed performance with the AI and DeFi sectors outperforming.

Key events of the week included the SEC's approval of a new regulatory framework for crypto ETFs, opening the door for more institutional investment products. We also saw an important Ethereum network update that improved Layer 2 efficiency. Several major banks announced plans to integrate cryptocurrency services into their offerings.

Technically, Bitcoin shows a bullish pattern on the weekly frame with confirmation of the golden cross between the 50 and 200-week moving averages. Key support levels sit at $64,000 and $60,000, while resistance is at $70,000 and $73,000. Momentum indicators support the continuation of the uptrend with a weekly RSI at 65, suggesting room for further gains before overbought conditions are reached.`,
    summaryAr: 'أسبوع إيجابي للعملات الرقمية بارتفاع 4.8% في القيمة السوقية وموافقات تنظيمية جديدة وإشارات فنية صعودية.',
    summaryEn: 'Positive week for crypto with 4.8% market cap increase, new regulatory approvals, and bullish technical signals.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['crypto', 'weekly-review', 'bitcoin', 'ethereum', 'regulation'],
    relatedSymbols: ['BTC/USDT', 'ETH/USDT'],
    impactLevel: 'HIGH',
    confidence: 82,
    qualityScore: 91,
    sentimentScore: 0.65,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'السوق عرضة لتقلبات حادة'],
    readingTimeMinutes: 6,
    wordCountAr: 340,
    wordCountEn: 320,
    publishedAt: daysAgo(1),
  },

  {
    contentType: 'WEEKLY_REVIEW',
    titleAr: 'مراجعة أسبوعية — أزواج العملات الرئيسية',
    titleEn: 'Weekly Review — Major Forex Pairs',
    contentAr: `شهد سوق الفوركس أسبوعاً من التداولات المتقلبة حيث تأثرت الأزواج الرئيسية ببيانات اقتصادية متضاربة ومواقف متباينة للبنوك المركزية. تراجع زوج اليورو/دولار بنسبة 0.8% هذا الأسبوع متأثراً بالفارق بين سياسة الفيدرالي والبنك المركزي الأوروبي. في المقابل، ارتفع الجنيه الإسترليني مقابل معظم العملات الرئيسية بدعم من بيانات التضخم العالية.

زوج الدولار/ين واصل صعوده ليسجل مستويات فوق 156 ين للدولار، مما أثار مخاوف من تدخل بنك اليابان. صرح وزير المالية الياباني بأن السلطات تراقب تحركات السوق بقلق بالغ. أما الدولار الأسترالي والنيوزيلندي فقد ارتفعا مدعومين ببيانات صينية إيجابية وارتفاع أسعار السلع.

من الناحية الفنية، يظهر مؤشر القوة النسبية للدولار الأمريكي إشارات تشبع شرائي على عدة أزواج، مما قد يبشر بتصحيح قريب. المتوسطات المتحركة على الإطار الأسبوعي تشير إلى استمرار الاتجاه الصعودي للدولار مقابل الين، بينما تظهر إشارات انعكاسية محتملة على اليورو/دولار. مستويات فيبوناتشي الرئيسية توفر مناطق دعم ومقاومة مهمة.`,
    contentEn: `The Forex market experienced a week of volatile trading as major pairs were influenced by mixed economic data and divergent central bank stances. The EUR/USD pair declined 0.8% this week, affected by the policy divergence between the Fed and the ECB. Conversely, the British Pound rose against most major currencies supported by high inflation data.

The USD/JPY pair continued its ascent to record levels above 156 yen per dollar, raising concerns about Bank of Japan intervention. Japan's Finance Minister stated that authorities are watching market movements with deep concern. The Australian and New Zealand Dollars rose supported by positive Chinese data and rising commodity prices.

Technically, the Dollar's RSI shows overbought signals on several pairs, potentially signaling a near-term correction. Weekly moving averages indicate the continuation of the Dollar's uptrend against the Yen, while showing potential reversal signals on EUR/USD. Key Fibonacci levels provide important support and resistance zones for the coming week.`,
    summaryAr: 'أسبوع متقلب في الفوركس مع تراجع اليورو وصعود الين لأدنى مستويات وارتفاع الجنيه الإسترليني.',
    summaryEn: 'Volatile Forex week with Euro decline, Yen weakness to record lows, and Pound strength on inflation data.',
    category: 'FOREX',
    categoryAr: 'فوركس',
    tags: ['forex', 'weekly-review', 'eurusd', 'gbpusd', 'usdjpy'],
    relatedSymbols: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'],
    impactLevel: 'HIGH',
    confidence: 79,
    qualityScore: 85,
    sentimentScore: 0.10,
    riskWarnings: ['تداول الفوركس ينطوي على مخاطر عالية', 'استخدم أوامر إيقاف الخسارة'],
    readingTimeMinutes: 6,
    wordCountAr: 340,
    wordCountEn: 310,
    publishedAt: daysAgo(1),
  },

  {
    contentType: 'WEEKLY_REVIEW',
    titleAr: 'مراجعة أسبوعية — مؤشرات الأسهم الأمريكية',
    titleEn: 'Weekly Review — US Stock Indices',
    contentAr: `سجلت مؤشرات الأسهم الأمريكية أداءً أسبوعياً إيجابياً مع صعود مؤشر ستاندرد آند بورز 500 بنسبة 1.8% ليغلق عند 5,280 نقطة. ارتفع مؤشر ناسداك المركب بنسبة 2.5% مدفوعاً بمكاتب قطاع التكنولوجيا والذكاء الاصطناعي، بينما ارتفع مؤشر داو جونز بنسبة 0.9% مع أداء مختلط لأسهم القيمة. تصدرت أسهم أشباه الموصلات والتكنولوجيا المكاسب.

أبرز أحداث الأسبوع تضمنت نتائج أرباح قوية من كبرى شركات التكنولوجيا التي تجاوزت التوقعات. أعلنت مايكروسوفت وألفابت عن نمو ملحوظ في إيرادات الخدمات السحابية، مما عزز الثقة في استمرار الإنفاق المؤسسي على الذكاء الاصطناعي. كما شهدنا بيانات اقتصادية إيجابية شملت تراجع المطالبات الأسبوعية وانتعاش مؤشر ثقة المستهلكين.

من الناحية الفنية، يتداول مؤشر S&P 500 في قناة صعودية واضحة على الإطار الأسبوعي، مع دعم من المتوسط المتحرك 50 أسبوع. مؤشر MACD يظهر إشارات إيجابية مع احتمال تكوين تقاطع صعودي. مستويات الدعم تقع عند 5,150 و5,000 نقطة، بينما تقع المقاومة عند 5,400 نقطة. حجم التداول يدعم الاتجاه الصعودي.`,
    contentEn: `US stock indices posted a positive weekly performance with the S&P 500 rising 1.8% to close at 5,280 points. The Nasdaq Composite gained 2.5% driven by technology and AI sector gains, while the Dow Jones rose 0.9% with mixed performance from value stocks. Semiconductor and technology shares led the gains.

Key events of the week included strong earnings results from major tech companies that exceeded expectations. Microsoft and Alphabet announced notable growth in cloud services revenue, boosting confidence in continued enterprise AI spending. We also saw positive economic data including a decline in weekly claims and a rebound in consumer confidence.

Technically, the S&P 500 is trading in a clear ascending channel on the weekly frame, supported by the 50-week moving average. The MACD indicator shows positive signals with the potential formation of a bullish crossover. Support levels sit at 5,150 and 5,000 points, while resistance is at 5,400 points. Trading volume supports the uptrend continuation.`,
    summaryAr: 'أسبوع إيجابي للأسهم الأمريكية بارتفاع S&P 500 بنسبة 1.8% وأرباح قوية لشركات التكنولوجيا وإشارات فنية صعودية.',
    summaryEn: 'Positive week for US stocks with S&P 500 up 1.8%, strong tech earnings, and bullish technical signals.',
    category: 'STOCKS',
    categoryAr: 'أسهم',
    tags: ['stocks', 'weekly-review', 'sp500', 'nasdaq', 'earnings'],
    relatedSymbols: ['SPX', 'NDX', 'DJI'],
    impactLevel: 'HIGH',
    confidence: 86,
    qualityScore: 90,
    sentimentScore: 0.60,
    riskWarnings: ['الأسهم عرضة لتقلبات السوق', 'الأداء السابق لا يضمن النتائج المستقبلية'],
    readingTimeMinutes: 6,
    wordCountAr: 330,
    wordCountEn: 300,
    publishedAt: daysAgo(1),
  },

  // ── PAIR_ANALYSIS (4) ────────────────────────────────────────────────────

  {
    contentType: 'PAIR_ANALYSIS',
    titleAr: 'تحليل BTC/USDT — المستويات والتوقعات',
    titleEn: 'BTC/USDT Analysis — Levels & Outlook',
    contentAr: `يتداول زوج BTC/USDT حالياً عند مستوى 68,400 دولار بعد اختراق ناجح لمقاومة 67,500 دولار. يظهر الزوج نموذجاً فنياً صعودياً واضحاً على الإطار الزمني اليومي مع تشكل قمم أعلى وقيعان أعلى. المتوسط المتحرك الأسي 21 يومًا يتجه صعوداً ويوفر دعماً ديناميكياً عند 66,200 دولار، بينما يتقاطع المتوسط 50 فوق المتوسط 200 في إشارة ذهبية.

مستويات المقاومة الرئيسية تقع عند 70,000 (نفسية)، 72,500 (قمة سابقة)، و75,000 (هدف فيبوناتشي 1.618). من ناحية الدعم، المستويات المهمة تقع عند 67,500 (مقاومة سابقة تحولت لدعم)، 65,000 (متوسط 100 يوم)، و62,000 (قاع هيكلي). مؤشر القوة النسبية عند 63 يشير إلى زخم إيجابي مع مساحة للصعود.

التوقعات تشير إلى استمرار الاتجاه الصعودي في المدى المتوسط مع احتمال اختبار مستوى 70,000 دولار قريباً. سيناريو التصحيح يتضمن تراجعاً نحو 65,000 قبل استئناف الصعود. يوصى بمراقبة حجم التداول عند المقاومات كونه سيحدد قوة الاختراق.`,
    contentEn: `The BTC/USDT pair is currently trading at $68,400 after a successful breakout above the $67,500 resistance. The pair shows a clear bullish technical pattern on the daily timeframe with the formation of higher highs and higher lows. The 21-day EMA is trending upward and providing dynamic support at $66,200, while the 50-day crosses above the 200-day in a golden cross signal.

Key resistance levels are at $70,000 (psychological), $72,500 (previous high), and $75,000 (Fibonacci 1.618 target). On the support side, important levels sit at $67,500 (former resistance turned support), $65,000 (100-day MA), and $62,000 (structural low). The RSI at 63 indicates positive momentum with room for further upside.

The outlook suggests the continuation of the medium-term uptrend with a likely test of the $70,000 level soon. The correction scenario involves a pullback toward $65,000 before resuming the ascent. It is recommended to monitor trading volume at resistance levels as it will determine the strength of any breakout.`,
    summaryAr: 'تحليل فني صعودي لزوج BTC/USDT عند 68,400$ مع استهداف 70,000$ ودعم رئيسي عند 65,000$.',
    summaryEn: 'Bullish technical analysis for BTC/USDT at $68,400 targeting $70,000 with key support at $65,000.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['bitcoin', 'btcusdt', 'technical-analysis', 'crypto', 'levels'],
    relatedSymbols: ['BTC/USDT'],
    impactLevel: 'HIGH',
    confidence: 90,
    qualityScore: 92,
    sentimentScore: 0.68,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'استخدم إدارة مخاطر صارمة'],
    readingTimeMinutes: 5,
    wordCountAr: 310,
    wordCountEn: 300,
    publishedAt: daysAgo(2),
  },

  {
    contentType: 'PAIR_ANALYSIS',
    titleAr: 'تحليل ETH/USDT — الاتجاه والمستويات',
    titleEn: 'ETH/USDT Analysis — Trend & Levels',
    contentAr: `يتداول زوج ETH/USDT بالقرب من مستوى 3,780 دولار في مسار صعودي واضح على الإطار اليومي. يظهر الزوج نمط قناة صعودية مع ارتفاع تدريجي مدعوم بزيادة مستمرة في حجم التداول. المتوسط المتحرك الأسي 20 يوفر دعماً ديناميكياً عند 3,680 دولار، مع تقاطع إيجابي بين المتوسطات المتحركة 50 و100.

مستويات فيبوناتشي لارتداد آخر موجة صعودية توضع كالتالي: 23.6% عند 3,650، 38.2% عند 3,520، و61.8% عند 3,340 دولار. المقاومة الفورية تقع عند 3,800 دولار تليها 4,000 دولار كهدف نفسي ومستوى فني مهم. مؤشر MACD يتحرك في المنطقة الإيجابية مع زيادة في الفجوة بين خطي المؤشر.

الزخم على المؤشرات الفرعية إيجابي بشكل عام مع RSI عند 60 ومؤشر القوة النسبية Stochastic يتجه صعوداً. التوقعات تشير إلى احتمال اختبار 4,000 دولار في الأسبوعين القادمين شريطة الحفاظ على مستوى دعم 3,650. سيناريو الهبوط يتضمن اختبار 3,400 في حال كسر الدعم الرئيسي.`,
    contentEn: `The ETH/USDT pair is trading near $3,780 in a clear uptrend on the daily timeframe. The pair shows an ascending channel pattern with gradual gains supported by steadily increasing trading volume. The 20 EMA provides dynamic support at $3,680, with a positive crossover between the 50 and 100-day moving averages.

Fibonacci retracement levels for the last bullish wave are placed as follows: 23.6% at $3,650, 38.2% at $3,520, and 61.8% at $3,340. Immediate resistance sits at $3,800 followed by $4,000 as a psychological and important technical target. The MACD is moving in positive territory with an increasing gap between the indicator lines.

Momentum on sub-indicators is generally positive with the RSI at 60 and the Stochastic RSI trending upward. The outlook suggests a likely test of $4,000 in the next two weeks provided the $3,650 support holds. The downside scenario includes a test of $3,400 if key support is broken.`,
    summaryAr: 'تحليل صعودي لـ ETH/USDT عند 3,780$ ضمن قناة صعودية مع استهداف 4,000$ ودعم عند 3,650$.',
    summaryEn: 'Bullish analysis for ETH/USDT at $3,780 in an ascending channel targeting $4,000 with support at $3,650.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['ethereum', 'ethusdt', 'technical-analysis', 'defi', 'trend'],
    relatedSymbols: ['ETH/USDT'],
    impactLevel: 'MEDIUM',
    confidence: 85,
    qualityScore: 88,
    sentimentScore: 0.52,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'قد تحدث تقلبات مفاجئة'],
    readingTimeMinutes: 5,
    wordCountAr: 300,
    wordCountEn: 280,
    publishedAt: daysAgo(3),
  },

  {
    contentType: 'PAIR_ANALYSIS',
    titleAr: 'تحليل EUR/USD — الآفاق الأسبوعية',
    titleEn: 'EUR/USD Analysis — Weekly Outlook',
    contentAr: `يتداول زوج اليورو/دولار حالياً عند مستوى 1.0820 بعد تراجع من قمة 1.0950 المسجلة الأسبوع الماضي. يظهر الزوج نمطاً انعكاسياً مع تشكل قمة أعلى مرفوعة بقمة أدنى على الإطار اليومي، مما يشير إلى ضعف الزخم الصعودي. اختراق مستوى دعم 1.0850 يزيد من احتمالات استمرار الهبوط.

المستويات الفنية الرئيسية تشمل دعماً عند 1.0780 (متوسط 200 يوم)، 1.0720 (قاع مزدوج سابق)، و1.0680 (فيبوناتشي 61.8%). من ناحية المقاومة، تقع مستويات عند 1.0900 (متوسط 50 يوم) و1.0950 (قمة سابقة). مؤشر RSI اليومي عند 35 يقترب من منطقة التشبع البيعي مما قد يؤدي لارتداد فني.

العوامل الأساسية المؤثرة تشمل تباين سياسات البنوك المركزية بين الفيدرالي والبنك المركزي الأوروبي، وبيانات التضخم في منطقة اليورو المتوقعة هذا الأسبوع. أي قراءة أعلى من المتوقع قد تدعم اليورو. التوقعات تميل نحو تداول جانبي إلى هابط مع نطاق متوقع بين 1.0780 و1.0900.`,
    contentEn: `The EUR/USD pair is currently trading at 1.0820 after declining from the 1.0950 peak recorded last week. The pair shows a reversal pattern with the formation of a lower high on the daily timeframe, indicating weakening bullish momentum. The break below the 1.0850 support level increases the probability of continued decline.

Key technical levels include support at 1.0780 (200-day MA), 1.0720 (previous double bottom), and 1.0680 (61.8% Fibonacci). On the resistance side, levels sit at 1.0900 (50-day MA) and 1.0950 (previous high). The daily RSI at 35 is approaching oversold territory which could lead to a technical bounce.

Fundamental factors influencing the pair include the policy divergence between the Fed and the ECB, and upcoming Eurozone inflation data this week. Any reading above expectations could support the Euro. The outlook leans toward sideways to bearish trading with an expected range between 1.0780 and 1.0900 in the near term.`,
    summaryAr: 'تحليل هابط لليورو/دولار عند 1.0820 بعد اختراق دعم 1.0850، مع نطاق تداول متوقع 1.0780-1.0900.',
    summaryEn: 'Bearish analysis for EUR/USD at 1.0820 after breaking 1.0850 support, with expected range 1.0780-1.0900.',
    category: 'FOREX',
    categoryAr: 'فوركس',
    tags: ['eurusd', 'forex', 'technical-analysis', 'central-banks', 'inflation'],
    relatedSymbols: ['EUR/USD'],
    impactLevel: 'MEDIUM',
    confidence: 83,
    qualityScore: 86,
    sentimentScore: -0.25,
    riskWarnings: ['تداول الفوركس ينطوي على مخاطر عالية', 'استخدم أوامر إيقاف الخسارة'],
    readingTimeMinutes: 5,
    wordCountAr: 290,
    wordCountEn: 270,
    publishedAt: daysAgo(2),
  },

  {
    contentType: 'PAIR_ANALYSIS',
    titleAr: 'تحليل SOL/USDT — الزخم والدعم',
    titleEn: 'SOL/USDT Analysis — Momentum & Support',
    contentAr: `يتداول زوج SOL/USDT عند مستوى 178 دولار في مسار صعودي متسارع على الإطار اليومي. أظهرت العملة أداءً متميزاً خلال الأسابيع الأخيرة مع ارتفاع يتجاوز 25% مدعوماً بنشاط متزايد في منظومة سولانا وارتفاع حجم التداول على منصات اللامركزية. يشكل المستوى النفسي 180 مقاومة فورية.

المستويات الفنية توضح أن الدعم الرئيسي يقع عند 165 دولار (متوسط 21 EMA)، يليه 152 دولار (فيبوناتشي 38.2%) و140 دولار (قاع هيكلي). المقاومة التالية بعد 180 تقع عند 195 ثم 210 دولار كأهداف صعودية. مؤشر MACD يظهر زخماً صعودياً قوياً مع تباعد إيجابي بين خطي المؤشر.

مؤشر القوة النسبية عند 68 يقترب من منطقة التشبع الشرائي، مما يشير إلى إمكانية حدوث تصحيح قصير الأجل قبل استئناف الصعود. حجم التداول المرتفع يؤكد قوة الاتجاه الحالي. التوقعات تشير إلى احتمال اختبار 200 دولار في المدى المتوسط شريطة الحفاظ على دعم 165 دولار.`,
    contentEn: `The SOL/USDT pair is trading at $178 in an accelerating uptrend on the daily timeframe. The token has shown outstanding performance in recent weeks with gains exceeding 25% supported by increasing activity in the Solana ecosystem and rising trading volume on decentralized platforms. The psychological level of $180 forms immediate resistance.

Technical levels show that major support sits at $165 (21 EMA), followed by $152 (38.2% Fibonacci) and $140 (structural low). The next resistance after $180 is at $195 then $210 as bullish targets. The MACD shows strong bullish momentum with positive divergence between the indicator lines.

The RSI at 68 is approaching overbought territory, indicating the possibility of a short-term correction before resuming the uptrend. The elevated trading volume confirms the strength of the current trend. The outlook suggests a potential test of $200 in the medium term provided the $165 support holds, with the Solana ecosystem expansion serving as a fundamental catalyst.`,
    summaryAr: 'تحليل صعودي لـ SOL/USDT عند 178$ مع زخم قوي واستهداف 200$ ودعم رئيسي عند 165$.',
    summaryEn: 'Bullish analysis for SOL/USDT at $178 with strong momentum targeting $200 and key support at $165.',
    category: 'CRYPTO',
    categoryAr: 'كريبتو',
    tags: ['solana', 'solusdt', 'technical-analysis', 'defi', 'momentum'],
    relatedSymbols: ['SOL/USDT'],
    impactLevel: 'MEDIUM',
    confidence: 78,
    qualityScore: 83,
    sentimentScore: 0.55,
    riskWarnings: ['تداول العملات الرقمية محفوف بالمخاطر', 'الزخم القوي قد يتبعه تصحيح حاد'],
    readingTimeMinutes: 5,
    wordCountAr: 300,
    wordCountEn: 280,
    publishedAt: daysAgo(4),
  },

  // ── MARKET_REPORT (2) ────────────────────────────────────────────────────

  {
    contentType: 'MARKET_REPORT',
    titleAr: 'تقرير سوق شامل — جلسة آسيا',
    titleEn: 'Comprehensive Market Report — Asia Session',
    contentAr: `افتتحت جلسة التداول الآسيوية على تباين في الأداء بين الأسواق الرئيسية، حيث ارتفع مؤشر نيكي الياباني بنسبة 0.6% مسجلاً مستوى قياسياً جديداً مدعوماً بضعف الين وسياسة البنك المركزي المتساهلة. في المقابل، تراجع مؤشر شنغهاي المركب بنسبة 0.3% وسط مخاوف من تباطؤ النمو في قطاع العقارات الصيني. مؤشر هانغ سنغ في هونغ كونغ ارتفع 0.4%.

على صعيد العملات، واصل الين الياباني تراجعه مقابل الدولار الأمريكي متجاوزاً مستوى 156 ين، مما أثار تصريحات متكررة من مسؤولين يابانيين حول احتمال التدخل. الدولار الأسترالي ارتفع مدعوماً ببيانات التوظيف القوية وأسعار السلع المرتفعة. اليوان الصيني استقر بعد تدخلات البنك المركزي لضمان الاستقرار.

في سوق السلع، ارتفعت أسعار النفط الخام بنسبة 0.8% مدعومة بتوقعات زيادة الطلب الآسيوي مع بداية موسم السفر. الذهب تراجع طفيفاً بعد تحقيق مكاسب في الجلسة السابقة. العملات الرقمية أظهرت استقراراً نسبياً خلال جلسة آسيا مع تداول البيتكوين فوق 68 ألف دولار.`,
    contentEn: `The Asian trading session opened with mixed performance across major markets, with Japan's Nikkei index rising 0.6% to a new record high supported by Yen weakness and the central bank's accommodative policy. Conversely, the Shanghai Composite declined 0.3% amid concerns about slowing growth in China's property sector. Hong Kong's Hang Seng index gained 0.4%.

On the currency front, the Japanese Yen continued its decline against the US Dollar exceeding the 156 level, triggering repeated statements from Japanese officials about potential intervention. The Australian Dollar rose supported by strong employment data and elevated commodity prices. The Chinese Yuan stabilized after central bank interventions to ensure stability.

In the commodities market, crude oil prices rose 0.8% supported by expectations of increased Asian demand with the start of the travel season. Gold saw a slight decline after posting gains in the previous session. Cryptocurrencies showed relative stability during the Asia session with Bitcoin trading above $68,000.`,
    summaryAr: 'جلسة آسيوية متباينة مع ارتفاع نيكي القياسي وضعف الين، وتراجع شنغهاي وارتفاع أسعار النفط.',
    summaryEn: 'Mixed Asian session with record Nikkei highs and Yen weakness, Shanghai decline, and rising oil prices.',
    category: 'STOCKS',
    categoryAr: 'أسهم',
    tags: ['asia-session', 'market-report', 'nikkei', 'usdjpy', 'oil'],
    relatedSymbols: ['USD/JPY', 'AUD/USD', 'XAU/USD', 'BTC/USDT'],
    impactLevel: 'HIGH',
    confidence: 81,
    qualityScore: 87,
    sentimentScore: 0.30,
    riskWarnings: ['الأسواق الآسيوية عرضة لمخاطر جيوسياسية', 'تدخل البنوك المركزية قد يغير الاتجاهات فجأة'],
    readingTimeMinutes: 5,
    wordCountAr: 330,
    wordCountEn: 300,
    publishedAt: hoursAgo(10),
  },

  {
    contentType: 'MARKET_REPORT',
    titleAr: 'تقرير سوق شامل — جلسة أوروبا',
    titleEn: 'Comprehensive Market Report — Europe Session',
    contentAr: `شهدت جلسة التداول الأوروبية حركة نشطة مع تركيز المستثمرين على بيانات التضخم في منطقة اليورو واجتماع البنك المركزي الأوروبي. ارتفع مؤشر STOXX 50 الأوروبي بنسبة 0.5% مع أداء إيجابي لقطاع الطاقة والبنوك. مؤشر DAX الألماني سجل مكاسب طفيفة بينما تراجع CAC الفرنسي متأثراً ببيانات صناعية ضعيفة.

أظهرت بيانات التضخم الأساسي في منطقة اليورو تراجعاً إلى 2.7% على أساس سنوي، وهو أقل من المتوقعات، مما عزز توقعات خفض الفائدة في يونيو. صرح رئيس البنك المركزي الأوروبي أن السياسة النقدية ستصبح أقل تقييداً تدريجياً. تراجع اليورو مقابل الدولار بعد البيانات مع تباين في الأداء مقابل الجنيه الإسترليني.

في سوق السندات، انخفضت عوائد السندات الألمانية لأجل 10 سنوات إلى 2.35% مع تعديل التوقعات لخفض الفائدة. أسعار النفط أظهرت استقراراً في التداولات الأوروبية بينما ارتفعت أسعار الغاز الطبيعي. العملات الرقمية حافظت على مكاسبها الصباحية مع استقرار البيتكوين فوق 68 ألف دولار.`,
    contentEn: `The European trading session saw active movement as investors focused on Eurozone inflation data and the ECB meeting. The European STOXX 50 index rose 0.5% with positive performance from the energy and banking sectors. The German DAX recorded slight gains while the French CAC declined affected by weak industrial data.

Core inflation data in the Eurozone showed a decline to 2.7% year-on-year, below expectations, reinforcing rate cut expectations for June. The ECB President stated that monetary policy will gradually become less restrictive. The Euro declined against the Dollar following the data with mixed performance against the British Pound.

In the bond market, German 10-year bond yields fell to 2.35% as rate cut expectations were adjusted. Oil prices showed stability in European trading while natural gas prices rose. Cryptocurrencies maintained their morning gains with Bitcoin stable above $68,000.`,
    summaryAr: 'جلسة أوروبية نشطة مع تراجع تضخم اليورو وتعزيز توقعات خفض الفائدة، وأداء مختلط للمؤشرات.',
    summaryEn: 'Active European session with declining Eurozone inflation boosting rate cut expectations and mixed index performance.',
    category: 'ECONOMY',
    categoryAr: 'اقتصاد',
    tags: ['europe-session', 'market-report', 'ecb', 'inflation', 'stoxx'],
    relatedSymbols: ['EUR/USD', 'GBP/EUR', 'DAX', 'BTC/USDT'],
    impactLevel: 'HIGH',
    confidence: 84,
    qualityScore: 88,
    sentimentScore: 0.25,
    riskWarnings: ['قرارات البنوك المركزية قد تؤثر فجأة على الأسواق', 'تداول بيانات التضخم ينطوي على مخاطر'],
    readingTimeMinutes: 6,
    wordCountAr: 340,
    wordCountEn: 310,
    publishedAt: hoursAgo(5),
  },

  // ── ANALYSIS (2) ─────────────────────────────────────────────────────────

  {
    contentType: 'ANALYSIS',
    titleAr: 'تحليل فني — مؤشر القوة النسبية يشير لتشبع بيعي',
    titleEn: 'Technical Analysis — RSI Signals Oversold',
    contentAr: `يشير مؤشر القوة النسبية (RSI) على عدة أزواج عملات رئيسية إلى دخول منطقة التشبع البيعي، مما قد يبشر بفرص ارتداد فني قريبة. على زوج اليورو/دولار، سجل المؤشر مستوى 32 على الإطار اليومي وهو أدنى قراءة منذ ثلاثة أشهر. هذا المستوى تاريخياً سبق ارتدادات ملحوظة كما حدث في نوفمبر الماضي ومارس السابق.

على زوج الجنيه/ين، يظهر RSI إشارات تشبع بيعي متطرفة عند 28 على الإطار الأسبوعي، وهي منطقة نادراً ما يصل إليها المؤشر. التحليل المقارن مع مرات سابقة وصل فيها المؤشر لهذا المستوى يظهر أن الزوج سجل متوسط ارتداد بنسبة 3.5% خلال الأسابيع الأربعة التالية. كما يظهر مؤشر Stochastic إشارات تقاطع صعودي مؤكدة احتمال الارتداد.

تجدر الإشارة إلى أن إشارات التشبع البيعي لا تعني بالضرورة انعكاساً فورياً للاتجاه، فقد يبقى المؤشر في هذه المنطقة لفترة أطول من المتوقع في الأسواق المتجهة بقوة. يوصى بالجمع بين إشارات RSI ومؤشرات أخرى مثل حجم التداول وأنماط الشموع اليابانية لتأكيد نقاط الدخول المحتملة.`,
    contentEn: `The Relative Strength Index (RSI) on several major currency pairs is signaling entry into oversold territory, potentially heralding near-term technical bounce opportunities. On the EUR/USD pair, the indicator registered a level of 32 on the daily timeframe, the lowest reading in three months. This level historically preceded notable rebounds as seen last November and the previous March.

On the GBP/JPY pair, the RSI shows extreme oversold signals at 28 on the weekly timeframe, a zone the indicator rarely reaches. Comparative analysis with previous instances when the indicator reached this level shows the pair recorded an average rebound of 3.5% over the following four weeks. The Stochastic indicator also shows bullish crossover signals confirming the bounce probability.

It is worth noting that oversold signals do not necessarily mean an immediate trend reversal, as the indicator can remain in this zone longer than expected in strongly trending markets. It is recommended to combine RSI signals with other indicators such as trading volume and Japanese candlestick patterns to confirm potential entry points.`,
    summaryAr: 'إشارات تشبع بيعي على RSI لعدة أزواج رئيسية تشير لفرص ارتداد فني محتملة مع ضرورة تأكيد بمؤشرات إضافية.',
    summaryEn: 'Oversold RSI signals on major pairs indicate potential technical bounce opportunities, requiring additional indicator confirmation.',
    category: 'FOREX',
    categoryAr: 'فوركس',
    tags: ['technical-analysis', 'rsi', 'oversold', 'forex', 'reversal'],
    relatedSymbols: ['EUR/USD', 'GBP/JPY', 'USD/CHF'],
    impactLevel: 'MEDIUM',
    confidence: 75,
    qualityScore: 82,
    sentimentScore: -0.40,
    riskWarnings: ['إشارات التشبع البيعي لا تعكس بالضرورة انعكاساً فورياً', 'استخدم إدارة مخاطر صارمة'],
    readingTimeMinutes: 6,
    wordCountAr: 330,
    wordCountEn: 310,
    publishedAt: daysAgo(5),
  },

  {
    contentType: 'ANALYSIS',
    titleAr: 'تحليل أساسي — تأثير قرارات الفيدرالي على الأسواق',
    titleEn: 'Fundamental Analysis — Fed Decisions Impact',
    contentAr: `تستمر قرارات الاحتياطي الفيدرالي الأمريكي في تشكيل اتجاهات الأسواق المالية العالمية بشكل عميق. مع استمرار الفيدرالي في الحفاظ على أسعار الفائدة عند مستوى 5.25-5.50%، تتأثر جميع فئات الأصول من العملات إلى الأسهم والسلع والعملات الرقمية. البيانات الأخيرة تشير إلى احتمال 60% لخفض الفائدة في اجتماع سبتمبر، مما يخلق بيئة تداول متذبذبة.

تاريخياً، شهدت الأسواق نمطاً متكرراً بعد دورات رفع الفائدة: فترة من التكيف تليها انتعاش تدريجي مع بدء خفض الفائدة. أسهم التكنولوجيا والنمو تستفيد عادةً من خفض الفائدة بسبب انخفاض معدل الخصم على التدفقات النقدية المستقبلية. العملات الرقمية أيضاً تشهد ارتفاعات مع زيادة السيولة. في المقابل، قد يتراجع الدولار مع تضييق فارق العائد.

التأثير على الأسواق الناشئة يكون أكثر حدة حيث تتحرك رؤوس الأموال الساخنة بحثاً عن العوائد الأعلى. نرى بالفعل عودة تدريجية للاستثمارات الأجنبية في أسواق آسيا وأمريكا اللاتينية مع توقعات خفض الفائدة. ينصح المستثمرون بمراقبة تصريحات أعضاء الفيدرالي وبيانات التضخم عن كثب لاتخاذ قرارات مستنيرة.`,
    contentEn: `Federal Reserve decisions continue to profoundly shape global financial market trends. With the Fed maintaining interest rates at 5.25-5.50%, all asset classes from currencies to stocks, commodities, and cryptocurrencies are affected. Recent data indicates a 60% probability of a rate cut at the September meeting, creating a volatile trading environment.

Historically, markets have seen a recurring pattern after rate-hike cycles: an adjustment period followed by a gradual recovery as rate cuts begin. Growth and technology stocks typically benefit from rate cuts due to the lower discount rate on future cash flows. Cryptocurrencies also experience gains with increased liquidity. Conversely, the Dollar may weaken as yield differentials narrow.

The impact on emerging markets is more severe as hot capital moves in search of higher returns. We are already seeing a gradual return of foreign investment in Asian and Latin American markets alongside rate cut expectations. Investors are advised to closely monitor Fed member statements and inflation data to make informed decisions, as the timing and magnitude of rate cuts will significantly influence portfolio allocation strategies.`,
    summaryAr: 'قرارات الفيدرالي تشكل اتجاهات الأسواق العالمية مع توقعات خفض الفائدة تؤثر على جميع فئات الأصول.',
    summaryEn: 'Fed decisions shape global market trends with rate cut expectations affecting all asset classes.',
    category: 'ECONOMY',
    categoryAr: 'اقتصاد',
    tags: ['fundamental-analysis', 'fed', 'interest-rates', 'economy', 'monetary-policy'],
    relatedSymbols: ['EUR/USD', 'SPX', 'XAU/USD', 'BTC/USDT'],
    impactLevel: 'HIGH',
    confidence: 88,
    qualityScore: 90,
    sentimentScore: 0.20,
    riskWarnings: ['قرارات البنوك المركزية قد تسبب تقلبات مفاجئة', 'التوقعات قد لا تتحقق'],
    readingTimeMinutes: 7,
    wordCountAr: 340,
    wordCountEn: 320,
    publishedAt: daysAgo(6),
  },
];

// ── Main seed function ────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding ContentArticle reports...\n');

  // Ensure the system user exists
  const systemUser = await prisma.user.upsert({
    where: { id: 'system' },
    update: {},
    create: {
      id: 'system',
      email: 'system@roua.trading',
      displayName: 'Roua System',
      tier: 'FREE',
    },
  });
  console.log(`System user ensured: ${systemUser.id}\n`);

  let created = 0;

  for (const report of reports) {
    const views = randInt(50, 500);
    const shares = randInt(5, 50);
    const likes = randInt(10, 100);

    const article = await prisma.contentArticle.create({
      data: {
        userId: 'system',
        type: 'AI_GENERATED',
        contentType: report.contentType,
        titleAr: report.titleAr,
        titleEn: report.titleEn,
        contentAr: report.contentAr,
        contentEn: report.contentEn,
        summaryAr: report.summaryAr,
        summaryEn: report.summaryEn,
        category: report.category,
        categoryAr: report.categoryAr,
        tags: JSON.stringify(report.tags),
        relatedSymbols: JSON.stringify(report.relatedSymbols),
        seo: '{}',
        aiModel: 'roua-agent-v1',
        generationSource: 'AI_GENERATED',
        confidence: report.confidence,
        qualityScore: report.qualityScore,
        sentimentScore: report.sentimentScore,
        impactLevel: report.impactLevel,
        riskWarnings: JSON.stringify(report.riskWarnings),
        sources: '[]',
        readingTimeMinutes: report.readingTimeMinutes,
        wordCountAr: report.wordCountAr,
        wordCountEn: report.wordCountEn,
        views,
        shares,
        likes,
        status: 'PUBLISHED',
        publishedAt: report.publishedAt,
      },
    });

    created++;
    console.log(`  [${created}/${reports.length}] ${report.contentType}: ${report.titleEn}`);
  }

  console.log(`\nDone! Created ${created} ContentArticle records.`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
