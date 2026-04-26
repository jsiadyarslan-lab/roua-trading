import { NextResponse } from 'next/server'

export const revalidate = 300 // Cache for 5 minutes

export async function GET() {
  try {
    // Try NestJS first for AI-translated news
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
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
          // Transform NestJS data to feed format
          const items = nestData.data.map((article: any) => ({
            category: article.category || 'Crypto',
            categoryAr: mapCategoryToArabic(article.category || 'Crypto'),
            color: mapCategoryColor(article.category || 'Crypto'),
            bgColor: `${mapCategoryColor(article.category || 'Crypto')}12`,
            text: article.title || '',
            textAr: article.translatedTitle || article.title || '',
            link: article.url || null,
            publishedAt: article.publishedAt || null,
            impact: article.impactLevel || 'medium',
            source: article.source || 'NestJS',
          }));
          // Only return if we have real Arabic translations
          const hasArabic = items.some((item: any) => /[\u0600-\u06FF]/.test(item.textAr))
          if (hasArabic) {
            return NextResponse.json(items);
          }
        }
      }
    } catch {
      // NestJS unavailable, fall through
    }

    // Fallback: Return fully Arabic news items
    // We no longer attempt word-by-word translation from RSS because it produces
    // garbled Arabic-English mixtures. Instead, we use curated Arabic headlines.
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
