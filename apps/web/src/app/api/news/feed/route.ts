import { NextResponse } from 'next/server'

export const revalidate = 300 // Cache for 5 minutes

// Arabic translation dictionary for common financial terms
const AR_TRANSLATIONS: Record<string, string> = {
  // Categories
  'Crypto': 'كريبتو', 'Bitcoin': 'بيتكوين', 'Ethereum': 'إيثيريوم',
  'Forex': 'فوركس', 'Stocks': 'أسهم', 'Metals': 'معادن', 'Oil': 'نفط',
  'Economy': 'اقتصاد', 'Regulation': 'تنظيم', 'Fed': 'الاحتياطي الفيدرالي',
  'ETF': 'صناديق', 'Technology': 'تقنية', 'Market': 'أسواق',

  // Common words
  'surges': 'يرتفع بقوة', 'drops': 'ينخفض', 'rallies': 'يتعافى',
  'breaks': 'يكسر', 'reaches': 'يصل إلى', 'hits': 'يصل لـ',
  'above': 'فوق', 'below': 'تحت', 'amid': 'بفعل', 'as': 'مع',
  'signals': 'يشير إلى', 'hints': 'يلوح بـ', 'could': 'قد',
  'boost': 'يعزز', 'intensifies': 'يتشدد', 'exceeds': 'يتجاوز',
  'accelerates': 'تتسارع', 'consolidates': 'يستقر', 'sees': 'يشهد',
  'potential': 'محتمل', 'new': 'جديد', 'key': 'مهم', 'record': 'قياسي',
  'all-time high': 'أعلى مستوى تاريخي', 'inflows': 'تدفقات',
  'outflows': 'تدفقات خارجة', 'demand': 'طلب', 'concerns': 'مخاوف',
  'growth': 'نمو', 'upgrade': 'ترقية', 'partnerships': 'شراكات',
  'exchange': 'منصة', 'tokens': 'توكنز', 'withdraw': 'سحب',
  'resilience': 'صمود', 'tensions': 'توترات',
}

function tryTranslateToArabic(text: string): string {
  if (!text) return ''
  // If already Arabic, return as-is
  if (/[\u0600-\u06FF]/.test(text)) return text

  // Try sentence-level pattern matching for common financial headline structures
  let translated = text

  // Pattern: "[Symbol] [action] [preposition] [number/level]"
  // e.g., "Bitcoin surges past $67K amid ETF inflows"
  // → "بيتكوين يرتفع بقوة فوق 67 ألف دولار بفعل تدفقات صناديق ETF"

  // Replace known terms (longer phrases first)
  const sortedKeys = Object.keys(AR_TRANSLATIONS).sort((a, b) => b.length - a.length)
  for (const eng of sortedKeys) {
    const ar = AR_TRANSLATIONS[eng]
    const regex = new RegExp(`\\b${eng}\\b`, 'gi')
    translated = translated.replace(regex, ar)
  }

  // If we replaced at least some words and result has Arabic, return it
  if (/[\u0600-\u06FF]/.test(translated) && translated !== text) {
    return translated
  }

  // If no meaningful translation happened, return empty to trigger fallback
  return ''
}

export async function GET() {
  try {
    // ── Priority 1: Roua News Site (AI-analyzed Arabic financial news) ──
    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    if (integrationKey) {
      try {
        const newsRes = await fetch(`${newsSiteUrl}/api/integration/news?limit=15`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Integration-Key': integrationKey,
          },
          signal: AbortSignal.timeout(8000),
        });

        if (newsRes.ok) {
          const newsData = await newsRes.json();
          if (newsData.articles && Array.isArray(newsData.articles) && newsData.articles.length > 0) {
            const items = newsData.articles.map((article: any) => {
              const cat = article.category || 'أسواق';
              const title = article.title || '';
              const summary = article.summary || '';

              // News site already has Arabic content
              const textAr = /[\u0600-\u06FF]/.test(title) ? title : tryTranslateToArabic(title) || title;

              return {
                category: cat,
                categoryAr: /[\u0600-\u06FF]/.test(cat) ? cat : mapCategoryToArabic(cat),
                color: mapCategoryColor(cat),
                bgColor: `${mapCategoryColor(cat)}12`,
                text: title,
                textAr,
                summary: summary || '',
                link: article.url || (article.slug ? `${newsSiteUrl}/news/${article.slug}` : null),
                publishedAt: article.publishedAt || null,
                impact: article.impactLevel || article.sentimentScore > 0.3 ? 'high' : 'medium',
                source: article.source || 'رؤى للأخبار',
              };
            });

            const hasArabic = items.some((item: any) => /[\u0600-\u06FF]/.test(item.textAr));
            if (hasArabic) {
              return NextResponse.json(items);
            }
          }
        }
      } catch {
        // News site unavailable, fall through
      }
    }

    // ── Priority 2: NestJS internal news ──
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    try {
      const nestRes = await fetch(`${apiTarget}/api/news/latest?limit=15`, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (nestRes.ok) {
        const nestData = await nestRes.json();
        if (nestData.success && Array.isArray(nestData.data) && nestData.data.length > 0) {
          const items = nestData.data.map((article: any) => {
            const cat = article.category || 'Crypto'
            const title = article.title || ''
            const translatedTitle = article.translatedTitle || ''

            let textAr = ''
            if (translatedTitle && /[\u0600-\u06FF]/.test(translatedTitle) && translatedTitle !== title) {
              textAr = translatedTitle
            } else {
              textAr = tryTranslateToArabic(title)
            }

            return {
              category: cat,
              categoryAr: mapCategoryToArabic(cat),
              color: mapCategoryColor(cat),
              bgColor: `${mapCategoryColor(cat)}12`,
              text: title,
              textAr: textAr,
              link: article.url || null,
              publishedAt: article.publishedAt || null,
              impact: article.impactLevel || 'medium',
              source: article.source || 'NestJS',
            }
          })

          const hasArabic = items.some((item: any) => /[\u0600-\u06FF]/.test(item.textAr))
          if (hasArabic) {
            const fallbackItems = getFallbackNews()
            const finalItems = items.map((item: any, idx: number) => {
              if (!/[\u0600-\u06FF]/.test(item.textAr) && fallbackItems[idx]) {
                return { ...item, textAr: fallbackItems[idx].textAr, categoryAr: fallbackItems[idx].categoryAr }
              }
              return item
            })
            return NextResponse.json(finalItems)
          }
        }
      }
    } catch {
      // NestJS unavailable, fall through
    }

    // ── Priority 3: Fallback static news ──
    return NextResponse.json(getFallbackNews())
  } catch (error) {
    return NextResponse.json(getFallbackNews())
  }
}

function getFallbackNews() {
  return [
    { category: 'Fed', categoryAr: 'الاحتياطي', color: '#d4af37', bgColor: '#d4af3712', text: 'Federal Reserve signals potential rate cuts in Q3', textAr: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Forex', categoryAr: 'فوركس', color: '#0d9488', bgColor: '#0d948812', text: 'EUR/USD breaks key resistance at 1.0850', textAr: 'اليورو/دولار يكسر مقاومة مهمة عند 1.0850', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'Bitcoin surges past $67K amid ETF inflows', textAr: 'بيتكوين يرتفع بقوة فوق 67 ألف دولار بفعل تدفقات صناديق ETF', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Metals', categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12', text: 'Gold consolidates above $2,340', textAr: 'الذهب يستقر فوق 2,340 دولار', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Stocks', categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612', text: 'S&P 500 reaches new all-time high', textAr: 'إس آند بي 500 يصل إلى أعلى مستوى تاريخي جديد', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Oil', categoryAr: 'نفط', color: '#6b7280', bgColor: '#6b728012', text: 'Crude oil drops amid demand concerns', textAr: 'النفط الخام ينخفض بفعل مخاوف الطلب', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Economy', categoryAr: 'اقتصاد', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'US GDP growth exceeds expectations', textAr: 'نمو الناتج المحلي الأمريكي يفوق التوقعات', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'Ethereum network upgrade could boost DeFi adoption', textAr: 'ترقية شبكة إيثيريوم قد تعزز تبني DeFi', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Regulation', categoryAr: 'تنظيم', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'Regulatory crackdown on crypto exchanges intensifies', textAr: 'تشديد الرقابة على منصات تداول العملات المشفرة', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'Solana ecosystem growth accelerates with new partnerships', textAr: 'نمو منظومة سولانا يتسارع بشراكات جديدة', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'XRP sees 30% surge as traders withdraw 35M tokens from exchanges', textAr: 'XRP يرتفع 30% مع سحب المتداولين 35 مليون توكن من المنصات', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Fed', categoryAr: 'الاحتياطي', color: '#d4af37', bgColor: '#d4af3712', text: 'Fed holds rates steady, hints at future cuts', textAr: 'الاحتياطي الفيدرالي يثبت الفائدة ويلوح بخفض مستقبلي', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'Bitcoin spot ETFs see 9-day inflow streak as investors show resilience', textAr: 'صناديق بيتكوين تسجل تدفقات لـ 9 أيام متتالية مع صمود المستثمرين', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Metals', categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12', text: 'Gold hits new record above $2,400 on geopolitical tensions', textAr: 'الذهب يصل لقياسي جديد فوق 2,400 دولار بفعل التوترات الجيوسياسية', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Stocks', categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612', text: 'NVIDIA surpasses $2T market cap on AI chip demand', textAr: 'NVIDIA تتجاوز 2 تريليون دولار بفعل الطلب على رقائق AI', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
  ]
}

function mapCategoryToArabic(category: string) {
  const normalized = category.toLowerCase()
  if (normalized.includes('bitcoin') || normalized.includes('crypto')) return 'كريبتو'
  if (normalized.includes('market') || normalized.includes('stock')) return 'أسهم'
  if (normalized.includes('regulation') || normalized.includes('policy')) return 'تنظيم'
  if (normalized.includes('economy') || normalized.includes('macro')) return 'اقتصاد'
  if (normalized.includes('etf') || normalized.includes('fund')) return 'صناديق'
  if (normalized.includes('forex') || normalized.includes('currency')) return 'فوركس'
  if (normalized.includes('oil') || normalized.includes('energy')) return 'طاقة'
  if (normalized.includes('gold') || normalized.includes('metal')) return 'معادن'
  if (normalized.includes('tech') || normalized.includes('ai')) return 'تقنية'
  return 'أسواق'
}

function mapCategoryColor(category: string) {
  const normalized = category.toLowerCase()
  if (normalized.includes('bitcoin') || normalized.includes('crypto')) return '#f97316'
  if (normalized.includes('stock') || normalized.includes('market')) return '#3b82f6'
  if (normalized.includes('regulation') || normalized.includes('policy')) return '#8b5cf6'
  if (normalized.includes('economy') || normalized.includes('macro')) return '#14b8a6'
  if (normalized.includes('etf')) return '#eab308'
  return '#0ea5e9'
}
