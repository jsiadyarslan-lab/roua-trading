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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lang = searchParams.get('lang') || 'en'

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
            const items = newsData.articles
              .map((article: any) => {
              const rawCat = article.category || 'Markets';
              const title = article.title || '';
              const summary = article.summary || '';

              // Ensure English, Arabic, and French categories
              const category = /[\u0600-\u06FF]/.test(rawCat) ? mapCategoryToEnglish(rawCat) : rawCat;
              const categoryAr = /[\u0600-\u06FF]/.test(rawCat) ? rawCat : mapCategoryToArabic(rawCat);
              const categoryFr = mapCategoryToFrench(category);
              const categoryTr = mapCategoryToTurkish(category);
              const categoryEs = mapCategoryToSpanish(category);

              // Determine English and Arabic text
              const isArabicTitle = /[\u0600-\u06FF]/.test(title);
              let text = title;
              let textAr = '';

              if (isArabicTitle) {
                // Title is Arabic — use summary as English text if available and not Arabic
                const summaryIsEnglish = summary && !/[\u0600-\u06FF]/.test(summary.substring(0, 50));
                text = summaryIsEnglish ? summary : title;
                textAr = title;
              } else {
                // Title is English — translate to Arabic for textAr
                textAr = tryTranslateToArabic(title) || title;
              }

              // French text: use English content since there is no French content source
              const textFr = text;
              // Turkish text: use English content since there is no Turkish content source
              const textTr = text;
              // Spanish text: use English content since there is no Spanish content source
              const textEs = text;

              return {
                category,
                categoryAr,
                categoryFr,
                categoryTr,
                categoryEs,
                color: mapCategoryColor(category),
                bgColor: `${mapCategoryColor(category)}12`,
                text,
                textAr,
                textFr,
                textTr,
                textEs,
                summary: summary || '',
                link: article.url || (article.slug ? `${newsSiteUrl}/news/${article.slug}` : null),
                publishedAt: article.publishedAt || null,
                impact: article.impactLevel || (article.sentimentScore > 0.3 ? 'high' : 'medium'),
                source: article.source || 'Rouaa News',
                isArabicOnly: isArabicTitle,
              };
            })
            // Filter out Arabic-only articles (no English content available)
            .filter((item: any) => !item.isArabicOnly);

            if (items.length > 0) {
              if (lang === 'fr' || lang === 'tr' || lang === 'es') {
                // For French/Turkish/Spanish, strip the internal isArabicOnly flag from response
                return NextResponse.json(items.map(({ isArabicOnly, ...rest }: any) => rest))
              }
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

            // French: category mapped, text reuses English content
            const categoryFr = mapCategoryToFrench(cat)
            const categoryTr = mapCategoryToTurkish(cat)
            const categoryEs = mapCategoryToSpanish(cat)
            const textFr = title
            const textTr = title
            const textEs = title

            return {
              category: cat,
              categoryAr: mapCategoryToArabic(cat),
              categoryFr,
              categoryTr,
              categoryEs,
              color: mapCategoryColor(cat),
              bgColor: `${mapCategoryColor(cat)}12`,
              text: title,
              textAr: textAr,
              textFr,
              textTr,
              textEs,
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
                return {
                  ...item,
                  textAr: fallbackItems[idx].textAr,
                  categoryAr: fallbackItems[idx].categoryAr,
                  textFr: fallbackItems[idx].textFr,
                  categoryFr: fallbackItems[idx].categoryFr,
                  textTr: fallbackItems[idx].textTr,
                  categoryTr: fallbackItems[idx].categoryTr,
                  textEs: fallbackItems[idx].textEs,
                  categoryEs: fallbackItems[idx].categoryEs,
                }
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
    { category: 'Fed', categoryAr: 'الاحتياطي', categoryFr: 'Fed', categoryTr: 'Fed', categoryEs: 'Reserva Federal', color: '#d4af37', bgColor: '#d4af3712', text: 'Federal Reserve signals potential rate cuts in Q3', textAr: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث', textFr: 'Federal Reserve signals potential rate cuts in Q3', textTr: 'Federal Reserve signals potential rate cuts in Q3', textEs: 'La Reserva Federal señala posibles recortes de tasas en el Q3', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Forex', categoryAr: 'فوركس', categoryFr: 'Forex', categoryTr: 'Döviz', categoryEs: 'Forex', color: '#0d9488', bgColor: '#0d948812', text: 'EUR/USD breaks key resistance at 1.0850', textAr: 'اليورو/دولار يكسر مقاومة مهمة عند 1.0850', textFr: 'EUR/USD breaks key resistance at 1.0850', textTr: 'EUR/USD breaks key resistance at 1.0850', textEs: 'EUR/USD rompe resistencia clave en 1.0850', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', categoryFr: 'Crypto', categoryTr: 'Kripto', categoryEs: 'Criptomonedas', color: '#f97316', bgColor: '#f9731612', text: 'Bitcoin surges past $67K amid ETF inflows', textAr: 'بيتكوين يرتفع بقوة فوق 67 ألف دولار بفعل تدفقات صناديق ETF', textFr: 'Bitcoin surges past $67K amid ETF inflows', textTr: 'Bitcoin surges past $67K amid ETF inflows', textEs: 'Bitcoin supera los $67K entre flujos de ETF', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Metals', categoryAr: 'معادن', categoryFr: 'Matières premières', categoryTr: 'Emtialar', categoryEs: 'Materias Primas', color: '#f59e0b', bgColor: '#f59e0b12', text: 'Gold consolidates above $2,340', textAr: 'الذهب يستقر فوق 2,340 دولار', textFr: 'Gold consolidates above $2,340', textTr: 'Gold consolidates above $2,340', textEs: 'El oro se consolida por encima de $2,340', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Stocks', categoryAr: 'أسهم', categoryFr: 'Actions', categoryTr: 'Hisse Senetleri', categoryEs: 'Acciones', color: '#3b82f6', bgColor: '#3b82f612', text: 'S&P 500 reaches new all-time high', textAr: 'إس آند بي 500 يصل إلى أعلى مستوى تاريخي جديد', textFr: 'S&P 500 reaches new all-time high', textTr: 'S&P 500 reaches new all-time high', textEs: 'El S&P 500 alcanza un nuevo máximo histórico', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Oil', categoryAr: 'نفط', categoryFr: 'Matières premières', categoryTr: 'Emtialar', categoryEs: 'Energía', color: '#6b7280', bgColor: '#6b728012', text: 'Crude oil drops amid demand concerns', textAr: 'النفط الخام ينخفض بفعل مخاوف الطلب', textFr: 'Crude oil drops amid demand concerns', textTr: 'Crude oil drops amid demand concerns', textEs: 'El petróleo crudo cae entre preocupaciones de demanda', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Economy', categoryAr: 'اقتصاد', categoryFr: 'Économie', categoryTr: 'Ekonomi', categoryEs: 'Economía', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'US GDP growth exceeds expectations', textAr: 'نمو الناتج المحلي الأمريكي يفوق التوقعات', textFr: 'US GDP growth exceeds expectations', textTr: 'US GDP growth exceeds expectations', textEs: 'El crecimiento del PIB de EE.UU. supera las expectativas', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', categoryFr: 'Crypto', categoryTr: 'Kripto', categoryEs: 'Criptomonedas', color: '#f97316', bgColor: '#f9731612', text: 'Ethereum network upgrade could boost DeFi adoption', textAr: 'ترقية شبكة إيثيريوم قد تعزز تبني DeFi', textFr: 'Ethereum network upgrade could boost DeFi adoption', textTr: 'Ethereum network upgrade could boost DeFi adoption', textEs: 'La actualización de la red Ethereum podría impulsar la adopción de DeFi', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Regulation', categoryAr: 'تنظيم', categoryFr: 'Réglementation', categoryTr: 'Düzenleme', categoryEs: 'Regulación', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'Regulatory crackdown on crypto exchanges intensifies', textAr: 'تشديد الرقابة على منصات تداول العملات المشفرة', textFr: 'Regulatory crackdown on crypto exchanges intensifies', textTr: 'Regulatory crackdown on crypto exchanges intensifies', textEs: 'Intensifican la represión regulatoria contra exchanges de criptomonedas', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', categoryFr: 'Crypto', categoryTr: 'Kripto', categoryEs: 'Criptomonedas', color: '#f97316', bgColor: '#f9731612', text: 'Solana ecosystem growth accelerates with new partnerships', textAr: 'نمو منظومة سولانا يتسارع بشراكات جديدة', textFr: 'Solana ecosystem growth accelerates with new partnerships', textTr: 'Solana ecosystem growth accelerates with new partnerships', textEs: 'El crecimiento del ecosistema Solana se acelera con nuevas asociaciones', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', categoryFr: 'Crypto', categoryTr: 'Kripto', categoryEs: 'Criptomonedas', color: '#f97316', bgColor: '#f9731612', text: 'XRP sees 30% surge as traders withdraw 35M tokens from exchanges', textAr: 'XRP يرتفع 30% مع سحب المتداولين 35 مليون توكن من المنصات', textFr: 'XRP sees 30% surge as traders withdraw 35M tokens from exchanges', textTr: 'XRP sees 30% surge as traders withdraw 35M tokens from exchanges', textEs: 'XRP registra un alza del 30% mientras los traders retiran 35M de tokens de exchanges', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Fed', categoryAr: 'الاحتياطي', categoryFr: 'Fed', categoryTr: 'Fed', categoryEs: 'Reserva Federal', color: '#d4af37', bgColor: '#d4af3712', text: 'Fed holds rates steady, hints at future cuts', textAr: 'الاحتياطي الفيدرالي يثبت الفائدة ويلوح بخفض مستقبلي', textFr: 'Fed holds rates steady, hints at future cuts', textTr: 'Fed holds rates steady, hints at future cuts', textEs: 'La Fed mantiene las tasas estables, sugiere futuros recortes', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', categoryFr: 'Crypto', categoryTr: 'Kripto', categoryEs: 'Criptomonedas', color: '#f97316', bgColor: '#f9731612', text: 'Bitcoin spot ETFs see 9-day inflow streak as investors show resilience', textAr: 'صناديق بيتكوين تسجل تدفقات لـ 9 أيام متتالية مع صمود المستثمرين', textFr: 'Bitcoin spot ETFs see 9-day inflow streak as investors show resilience', textTr: 'Bitcoin spot ETFs see 9-day inflow streak as investors show resilience', textEs: 'Los ETF spot de Bitcoin registran 9 días de flujos mientras los inversores muestran resistencia', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Metals', categoryAr: 'معادن', categoryFr: 'Matières premières', categoryTr: 'Emtialar', categoryEs: 'Materias Primas', color: '#f59e0b', bgColor: '#f59e0b12', text: 'Gold hits new record above $2,400 on geopolitical tensions', textAr: 'الذهب يصل لقياسي جديد فوق 2,400 دولار بفعل التوترات الجيوسياسية', textFr: 'Gold hits new record above $2,400 on geopolitical tensions', textTr: 'Gold hits new record above $2,400 on geopolitical tensions', textEs: 'El oro alcanza un nuevo récord por encima de $2,400 por tensiones geopolíticas', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Stocks', categoryAr: 'أسهم', categoryFr: 'Actions', categoryTr: 'Hisse Senetleri', categoryEs: 'Acciones', color: '#3b82f6', bgColor: '#3b82f612', text: 'NVIDIA surpasses $2T market cap on AI chip demand', textAr: 'NVIDIA تتجاوز 2 تريليون دولار بفعل الطلب على رقائق AI', textFr: 'NVIDIA surpasses $2T market cap on AI chip demand', textTr: 'NVIDIA surpasses $2T market cap on AI chip demand', textEs: 'NVIDIA supera los $2T de capitalización de mercado por demanda de chips de IA', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
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

function mapCategoryToEnglish(category: string) {
  // If already English, return as-is
  if (!/[\u0600-\u06FF]/.test(category)) return category
  // Map Arabic category back to English
  const arToEn: Record<string, string> = {
    'كريبتو': 'Crypto', 'بيتكوين': 'Bitcoin', 'إيثيريوم': 'Ethereum',
    'فوركس': 'Forex', 'أسهم': 'Stocks', 'معادن': 'Metals', 'نفط': 'Oil',
    'اقتصاد': 'Economy', 'تنظيم': 'Regulation', 'الاحتياطي الفيدرالي': 'Fed',
    'صناديق': 'ETF', 'تقنية': 'Technology', 'أسواق': 'Markets', 'طاقة': 'Energy',
    'تشفير': 'Crypto', 'سلع': 'Commodities', 'سياسة': 'Politics',
    'رياضة': 'Sports', 'عام': 'General',
  }
  return arToEn[category] || 'Markets'
}

function mapCategoryToFrench(category: string) {
  // Map English or Arabic category to French
  // First normalize: if Arabic, convert to English first
  let normalizedCat = category
  if (/[\u0600-\u06FF]/.test(category)) {
    normalizedCat = mapCategoryToEnglish(category)
  }

  const normalized = normalizedCat.toLowerCase()

  if (normalized.includes('economy') || normalized.includes('macro')) return 'Économie'
  if (normalized.includes('technology') || normalized.includes('tech')) return 'Technologie'
  if (normalized.includes('crypto') || normalized.includes('bitcoin') || normalized.includes('ethereum')) return 'Crypto'
  if (normalized.includes('forex') || normalized.includes('currency')) return 'Forex'
  if (normalized.includes('commodit') || normalized.includes('metal') || normalized.includes('gold') || normalized.includes('oil')) return 'Matières premières'
  if (normalized.includes('stock') || normalized.includes('market')) return 'Actions'
  if (normalized.includes('politic')) return 'Politique'
  if (normalized.includes('sport')) return 'Sport'
  if (normalized.includes('general')) return 'Général'
  if (normalized.includes('defi')) return 'DeFi'
  if (normalized.includes('regulation') || normalized.includes('policy')) return 'Réglementation'
  if (normalized.includes('etf') || normalized.includes('fund')) return 'ETF'
  if (normalized.includes('fed')) return 'Fed'
  if (normalized.includes('energy')) return 'Énergie'
  return 'Général'
}

function mapCategoryToTurkish(category: string) {
  // Map English or Arabic category to Turkish
  // First normalize: if Arabic, convert to English first
  let normalizedCat = category
  if (/[؀-ۿ]/.test(category)) {
    normalizedCat = mapCategoryToEnglish(category)
  }

  const normalized = normalizedCat.toLowerCase()

  if (normalized.includes('forex') || normalized.includes('currency')) return 'Döviz'
  if (normalized.includes('crypto') || normalized.includes('bitcoin') || normalized.includes('ethereum')) return 'Kripto'
  if (normalized.includes('stock')) return 'Hisse Senetleri'
  if (normalized.includes('commodit') || normalized.includes('metal') || normalized.includes('gold') || normalized.includes('oil')) return 'Emtialar'
  if (normalized.includes('indices') || normalized.includes('index')) return 'Endeksler'
  if (normalized.includes('economy') || normalized.includes('macro')) return 'Ekonomi'
  if (normalized.includes('analysis')) return 'Analiz'
  if (normalized.includes('education') || normalized.includes('learn')) return 'Eğitim'
  if (normalized.includes('opinion') || normalized.includes('editorial')) return 'Görüş'
  if (normalized.includes('breaking')) return 'Son Dakika'
  if (normalized.includes('market')) return 'Piyasa'
  if (normalized.includes('technology') || normalized.includes('tech')) return 'Teknoloji'
  if (normalized.includes('regulation') || normalized.includes('policy')) return 'Düzenleme'
  if (normalized.includes('etf') || normalized.includes('fund')) return 'ETF'
  if (normalized.includes('fed')) return 'Fed'
  if (normalized.includes('defi')) return 'DeFi'
  if (normalized.includes('energy')) return 'Enerji'
  if (normalized.includes('general')) return 'Genel'
  return category
}

function mapCategoryToSpanish(category: string) {
  // Map English or Arabic category to Spanish
  // First normalize: if Arabic, convert to English first
  let normalizedCat = category
  if (/[\u0600-\u06FF]/.test(category)) {
    normalizedCat = mapCategoryToEnglish(category)
  }

  const normalized = normalizedCat.toLowerCase()

  if (normalized.includes('monetary policy')) return 'Política Monetaria'
  if (normalized.includes('interest rate')) return 'Tasa de Interés'
  if (normalized.includes('fed')) return 'Reserva Federal'
  if (normalized.includes('ecb')) return 'BCE'
  if (normalized.includes('bank of japan') || normalized.includes('boj')) return 'Banco de Japón'
  if (normalized.includes('inflation') || normalized.includes('cpi')) return 'Inflación'
  if (normalized.includes('employment') || normalized.includes('jobs') || normalized.includes('labor')) return 'Empleo'
  if (normalized.includes('gdp')) return 'PIB'
  if (normalized.includes('geopolit')) return 'Geopolítica'
  if (normalized.includes('politic')) return 'Política'
  if (normalized.includes('trade')) return 'Comercio'
  if (normalized.includes('housing') || normalized.includes('real estate')) return 'Vivienda'
  if (normalized.includes('manufactur')) return 'Manufactura'
  if (normalized.includes('retail')) return 'Minorista'
  if (normalized.includes('crypto') || normalized.includes('bitcoin') || normalized.includes('ethereum')) return 'Criptomonedas'
  if (normalized.includes('forex') || normalized.includes('currency')) return 'Forex'
  if (normalized.includes('commodit') || normalized.includes('metal') || normalized.includes('gold')) return 'Materias Primas'
  if (normalized.includes('stock') || normalized.includes('market')) return 'Acciones'
  if (normalized.includes('technology') || normalized.includes('tech')) return 'Tecnología'
  if (normalized.includes('energy') || normalized.includes('oil')) return 'Energía'
  if (normalized.includes('economy') || normalized.includes('macro')) return 'Economía'
  if (normalized.includes('regulation') || normalized.includes('policy')) return 'Regulación'
  if (normalized.includes('etf') || normalized.includes('fund')) return 'ETF'
  if (normalized.includes('defi')) return 'DeFi'
  if (normalized.includes('general')) return 'General'
  return 'General'
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
