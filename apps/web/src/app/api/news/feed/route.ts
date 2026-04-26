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
            categoryAr: article.categoryAr || mapCategoryToArabic(article.category || 'Crypto'),
            color: mapCategoryColor(article.category || 'Crypto'),
            bgColor: `${mapCategoryColor(article.category || 'Crypto')}12`,
            text: article.title || '',
            textAr: article.translatedTitle || article.title || '',
            link: article.url || null,
            publishedAt: article.publishedAt || null,
            impact: article.impactLevel || 'medium',
            source: article.source || 'NestJS',
          }));
          return NextResponse.json(items);
        }
      }
    } catch {
      // NestJS unavailable, fall through to RSS
    }

    // Fallback: Fetch CoinTelegraph RSS feed + translate locally
    const res = await fetch('https://cointelegraph.com/rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      next: { revalidate: 300 }
    })

    if (!res.ok) throw new Error('Failed to fetch RSS')

    const xml = await res.text()

    const items: Array<{
      category: string
      categoryAr: string
      color: string
      bgColor: string
      text: string
      textAr: string
      link: string | null
      publishedAt: string | null
      impact: 'high' | 'medium'
      source: string
    }> = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const itemContent = match[1]
      const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(itemContent) || /<title>(.*?)<\/title>/.exec(itemContent)
      const categoryMatch = /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(itemContent) || /<category>(.*?)<\/category>/.exec(itemContent)
      const linkMatch = /<link>(.*?)<\/link>/.exec(itemContent)
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(itemContent)

      if (titleMatch) {
        const category = categoryMatch ? categoryMatch[1].trim() : 'Crypto'
        const title = titleMatch[1].trim()
        const categoryAr = mapCategoryToArabic(category)
        const translatedTitle = translateToArabic(title, category)

        items.push({
          category,
          categoryAr,
          color: mapCategoryColor(category),
          bgColor: `${mapCategoryColor(category)}12`,
          text: title,
          textAr: translatedTitle,
          link: linkMatch ? linkMatch[1].trim() : null,
          publishedAt: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : null,
          impact: isHighImpact(category, title) ? 'high' : 'medium',
          source: 'CoinTelegraph',
        })
      }
    }

    if (items.length > 0) {
      return NextResponse.json(items)
    }

    return NextResponse.json(getFallbackNews())
  } catch (error) {
    return NextResponse.json(getFallbackNews())
  }
}

/**
 * Translate English news title to Arabic using full-sentence pattern matching first,
 * then falling back to keyword replacement.
 * Note: When NestJS is available, AI models handle translation instead.
 */
function translateToArabic(title: string, category: string): string {
  // ── Step 1: Try full-sentence pattern matching for common headline structures ──
  const sentencePatterns: [RegExp, string][] = [
    // "[Asset] surges/rises/climbs past $X" → "[الأصل] يرتفع فوق $X"
    [/\b(Bitcoin|BTC)\b.*?\b(surges?|rises?|climbs?|soars?|jumps?)\b.*?\bpast?\s*\$?([\d,.]+)/gi, 'بيتكوين يرتفع فوق $$$3'],
    [/\b(Ethereum|ETH)\b.*?\b(surges?|rises?|climbs?|soars?|jumps?)\b.*?\bpast?\s*\$?([\d,.]+)/gi, 'إيثيريوم يرتفع فوق $$$3'],
    [/\b(Solana|SOL)\b.*?\b(surges?|rises?|climbs?|soars?|jumps?)\b.*?\bpast?\s*\$?([\d,.]+)/gi, 'سولانا يرتفع فوق $$$3'],
    // "[Asset] drops/falls/plummets below $X"
    [/\b(Bitcoin|BTC)\b.*?\b(drops?|falls?|plummets?|tumbles?|slides?)\b.*?\bbelow\s*\$?([\d,.]+)/gi, 'بيتكوين ينخفض تحت $$$3'],
    [/\b(Ethereum|ETH)\b.*?\b(drops?|falls?|plummets?|tumbles?|slides?)\b.*?\bbelow\s*\$?([\d,.]+)/gi, 'إيثيريوم ينخفض تحت $$$3'],
    // "[Asset] surges/rises amid X"
    [/\b(Bitcoin|BTC)\b.*?\b(surges?|rises?|rallies?)\b.*?\bamid\b/gi, 'بيتكوين يرتفع وسط'],
    [/\b(Ethereum|ETH)\b.*?\b(surges?|rises?|rallies?)\b.*?\bamid\b/gi, 'إيثيريوم يرتفع وسط'],
    // "[Asset] drops/falls amid X"
    [/\b(Bitcoin|BTC)\b.*?\b(drops?|falls?|declines?)\b.*?\bamid\b/gi, 'بيتكوين ينخفض وسط'],
    [/\b(Ethereum|ETH)\b.*?\b(drops?|falls?|declines?)\b.*?\bamid\b/gi, 'إيثيريوم ينخفض وسط'],
    // "Fed signals/hints X"
    [/\bFed\b.*?\b(signals?|hints?|indicates?)\b/gi, 'الاحتياطي الفيدرالي يشير إلى'],
    // "SEC approves/rejects X"
    [/\bSEC\b.*?\b(approves?|rejects?)\b/gi, 'لجنة الأوراق المالية توافق/ترفض'],
    // "Gold consolidates above $X"
    [/\bGold\b.*?\bconsolidates?\b.*?\babove\s*\$?([\d,.]+)/gi, 'الذهب يستقر فوق $$$1'],
    // "S&P 500 reaches new high"
    [/\bS&P\s*500\b.*?\b(reaches?|hits?|sets?)\b.*?\b(high|record|all-time)/gi, 'إس آند بي 500 يصل إلى مستوى قياسي جديد'],
    // "Crude oil drops/falls amid X"
    [/\bCrude oil\b.*?\b(drops?|falls?|declines?)\b.*?\bamid\b/gi, 'النفط الخام ينخفض وسط'],
    // "X breaks (key) resistance at Y"
    [/\bbreaks?\s+(?:key\s+)?resistance\s+(?:at\s+)?/gi, 'يكسر مقاومة عند'],
    // "X breaks (key) support at Y"
    [/\bbreaks?\s+(?:key\s+)?support\s+(?:at\s+)?/gi, 'يكسر دعم عند'],
    // "ETF inflows/outflows"
    [/\bETF\s*inflows?\b/gi, 'تدفقات صناديق ETF'],
    [/\bETF\s*outflows?\b/gi, 'تدفقات خارجة من صناديق ETF'],
  ]

  for (const [pattern, arabic] of sentencePatterns) {
    if (pattern.test(title)) {
      // Reset lastIndex after test
      pattern.lastIndex = 0
      let result = title.replace(pattern, arabic)
      // Clean up any remaining English filler words
      result = result
        .replace(/\bamid\b/gi, 'وسط')
        .replace(/\bas\b/gi, '')
        .replace(/\bthe\b/gi, '')
        .replace(/\bin\b/gi, 'في')
        .replace(/\bon\b/gi, 'على')
        .replace(/\bof\b/gi, '')
        .replace(/\bto\b/gi, 'إلى')
        .replace(/\bfor\b/gi, '')
        .replace(/\bwith\b/gi, 'مع')
        .replace(/\bfrom\b/gi, 'من')
        .replace(/\bby\b/gi, 'بـ')
        .replace(/\bat\b/gi, 'عند')
        .replace(/\bnew\b/gi, 'جديد')
        .replace(/\bhigh\b/gi, 'مرتفع')
        .replace(/\blow\b/gi, 'منخفض')
        .replace(/\s{2,}/g, ' ')
        .trim()
      return result
    }
    pattern.lastIndex = 0
  }

  // ── Step 2: Keyword-by-keyword replacement (fallback) ──
  const translations: [RegExp, string][] = [
    // Crypto terms
    [/\bBitcoin\b/gi, 'بيتكوين'],
    [/\bBTC\b/g, 'BTC'],
    [/\bEthereum\b/gi, 'إيثيريوم'],
    [/\bETH\b/g, 'ETH'],
    [/\bSolana\b/gi, 'سولانا'],
    [/\bSOL\b/g, 'SOL'],
    [/\bXRP\b/g, 'XRP'],
    [/\bBNB\b/g, 'BNB'],
    [/\bCardano\b/gi, 'كاردانو'],
    [/\bADA\b/g, 'ADA'],
    [/\bcryptocurrenc(?:y|ies)\b/gi, 'العملات المشفرة'],
    [/\bcrypto\b/gi, 'كريبتو'],
    [/\bblockchain\b/gi, 'البلوكتشين'],
    [/\bDeFi\b/gi, 'DeFi'],
    [/\bNFTs?\b/gi, 'NFT'],
    [/\bstablecoin\b/gi, 'عملة مستقرة'],
    [/\baltcoin\b/gi, 'عملة بديلة'],
    [/\btoken\b/gi, 'توكن'],
    [/\bmining\b/gi, 'التعدين'],
    [/\bwallet\b/gi, 'محفظة'],
    [/\bstaking\b/gi, 'التحصين'],
    [/\bairdrop\b/gi, 'إيردروب'],

    // Market actions
    [/\bsurges?\b/gi, 'يرتفع بقوة'],
    [/\brall(?:y|ies|ied)\b/gi, 'صعود'],
    [/\bcrash(?:es|ed)?\b/gi, 'انهيار'],
    [/\bdrops?\b/gi, 'ينخفض'],
    [/\bfalls?\b/gi, 'يهبط'],
    [/\bdeclines?\b/gi, 'يتراجع'],
    [/\brises?\b/gi, 'يرتفع'],
    [/\bsoars?\b/gi, 'يقفز'],
    [/\bjumps?\b/gi, 'يقفز'],
    [/\bgains?\b/gi, 'يكسب'],
    [/\bloses?\b/gi, 'يخسر'],
    [/\brecovers?\b/gi, 'يتعافى'],
    [/\bbounces?\b/gi, 'يرتد'],
    [/\bcorrections?\b/gi, 'تصحيح'],
    [/\bconsolidates?\b/gi, 'يستقر'],
    [/\bfluctuates?\b/gi, 'يتذبذب'],
    [/\bbreaks?\s+(?:out|above|below|through)\b/gi, 'يكسر'],
    [/\bhits?\b/gi, 'يصل إلى'],
    [/\breaches?\b/gi, 'يصل إلى'],
    [/\bcross(?:es|ed)?\b/gi, 'يتجاوز'],
    [/\btumbles?\b/gi, 'يتهاوى'],
    [/\bslides?\b/gi, 'ينزلق'],
    [/\bplummets?\b/gi, 'يهوي'],
    [/\bclimbs?\b/gi, 'يتسلق'],
    [/\bbullish\b/gi, 'صعودي'],
    [/\bbearish\b/gi, 'هبوطي'],
    [/\bbreakout\b/gi, 'اختراق'],
    [/\bresistance\b/gi, 'مقاومة'],
    [/\bsupport\b/gi, 'دعم'],

    // Financial terms
    [/\bETFs?\b/g, 'صندوق ETF'],
    [/\bFed\b/g, 'الاحتياطي الفيدرالي'],
    [/\bFederal Reserve\b/gi, 'الاحتياطي الفيدرالي'],
    [/\binterest rate\b/gi, 'سعر الفائدة'],
    [/\brate cut\b/gi, 'خفض الفائدة'],
    [/\binflation\b/gi, 'التضخم'],
    [/\bGDP\b/g, 'الناتج المحلي'],
    [/\brecession\b/gi, 'ركود'],
    [/\bmarket\b/gi, 'السوق'],
    [/\bmarkets\b/gi, 'الأسواق'],
    [/\bstock\b/gi, 'الأسهم'],
    [/\bstocks\b/gi, 'الأسهم'],
    [/\bvolatility\b/gi, 'تقلب'],
    [/\bliquidity\b/gi, 'سيولة'],
    [/\binvestment\b/gi, 'استثمار'],
    [/\binvestor\b/gi, 'مستثمر'],
    [/\bprofit\b/gi, 'ربح'],
    [/\bloss\b/gi, 'خسارة'],
    [/\bGold\b/gi, 'الذهب'],
    [/\bCrude oil\b/gi, 'النفط الخام'],
    [/\boil\b/gi, 'النفط'],

    // Regulation terms
    [/\bregulation\b/gi, 'تنظيم'],
    [/\bSEC\b/g, 'لجنة الأوراق المالية'],
    [/\bban\b/gi, 'حظر'],
    [/\bapprove(?:d|s)?\b/gi, 'يوافق'],
    [/\bapproval\b/gi, 'موافقة'],
    [/\breject(?:s|ed)?\b/gi, 'يرفض'],
    [/\bcompliance\b/gi, 'امتثال'],

    // Tech & trading terms
    [/\bupgrade\b/gi, 'ترقية'],
    [/\bpartnership\b/gi, 'شراكة'],
    [/\blaunch\b/gi, 'إطلاق'],
    [/\badoption\b/gi, 'تبني'],
    [/\bnetwork\b/gi, 'شبكة'],
    [/\bplatform\b/gi, 'منصة'],
    [/\bexchange\b/gi, 'منصة تداول'],
    [/\btrading\b/gi, 'تداول'],
    [/\btrader\b/gi, 'متداول'],

    // Common connector words
    [/\bcould\b/gi, 'قد'],
    [/\bmay\b/gi, 'قد'],
    [/\bwill\b/gi, 'سوف'],
    [/\bmajor\b/gi, 'كبير'],
    [/\bkey\b/gi, 'مهم'],
    [/\bsignificant\b/gi, 'كبير'],
    [/\bmassive\b/gi, 'ضخم'],
    [/\brecord\b/gi, 'قياسي'],
    [/\bhistoric\b/gi, 'تاريخي'],
    [/\bpotential\b/gi, 'محتمل'],
    [/\bexpected\b/gi, 'متوقع'],
    [/\bannounces?\b/gi, 'يعلن'],
    [/\bsignals?\b/gi, 'يشير'],
    [/\bhints?\b/gi, 'يلمح'],
    [/\bwarns?\b/gi, 'يحذر'],
    [/\bamid\b/gi, 'وسط'],
    [/\babove\b/gi, 'فوق'],
    [/\bbelow\b/gi, 'أدنى'],
    [/\bprice\b/gi, 'سعر'],
    [/\bprices\b/gi, 'أسعار'],
    [/\blevel\b/gi, 'مستوى'],
    [/\bbillion\b/gi, 'مليار'],
    [/\bmillion\b/gi, 'مليون'],
    [/\bUS\b/g, 'أمريكي'],
  ]

  let translated = title
  for (const [regex, arabic] of translations) {
    translated = translated.replace(regex, arabic)
  }

  // If nothing was translated, prepend Arabic category
  if (translated === title) {
    const categoryAr = mapCategoryToArabic(category)
    translated = `[${categoryAr}] ${title}`
  }

  translated = translated.replace(/\s{2,}/g, ' ').trim()
  return translated
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

function isHighImpact(category: string, title: string) {
  const normalized = category.toLowerCase()
  const lowerTitle = title.toLowerCase()
  return (
    normalized.includes('bitcoin') ||
    normalized.includes('policy') ||
    normalized.includes('regulation') ||
    normalized.includes('etf') ||
    normalized.includes('macro') ||
    lowerTitle.includes('fed') ||
    lowerTitle.includes('sec') ||
    lowerTitle.includes('ban') ||
    lowerTitle.includes('approval') ||
    lowerTitle.includes('crash') ||
    lowerTitle.includes('surge') ||
    lowerTitle.includes('record') ||
    lowerTitle.includes('all-time')
  )
}
