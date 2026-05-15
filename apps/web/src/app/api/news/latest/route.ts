import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/news/latest
 * Get latest news with filtering
 * Proxies to NestJS, falls back to local RSS feed + analysis
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || '';
    const sentiment = searchParams.get('sentiment') || '';
    const category = searchParams.get('category') || '';
    const limit = searchParams.get('limit') || '20';

    // ── Priority 1: Roua News Site (AI-analyzed Arabic financial news) ──
    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    if (integrationKey) {
      try {
        const newsRes = await fetch(`${newsSiteUrl}/api/integration/news?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Integration-Key': integrationKey,
          },
          signal: AbortSignal.timeout(8000),
        });

        if (newsRes.ok) {
          const newsData = await newsRes.json();
          if (newsData.articles && Array.isArray(newsData.articles) && newsData.articles.length > 0) {
            // Transform news site data to the format expected by the trading platform
            const articles = newsData.articles.map((article: any) => ({
              id: article.id,
              source: article.source || 'رؤى للأخبار',
              title: article.title || '',
              translatedTitle: /[\u0600-\u06FF]/.test(article.title) ? article.title : '',
              content: article.summary || '',
              translatedContent: '',
              summary: article.summary || '',
              url: article.url || (article.slug ? `${newsSiteUrl}/news/${article.slug}` : null),
              sentiment: typeof article.sentimentScore === 'number' ? article.sentimentScore : 0,
              sentimentLabel: article.sentiment || 'neutral',
              impactLevel: article.impactLevel || 'medium',
              affectedAssets: typeof article.affectedAssets === 'string'
                ? (() => { try { return JSON.parse(article.affectedAssets); } catch { return []; } })()
                : Array.isArray(article.affectedAssets) ? article.affectedAssets : [],
              category: article.category || 'markets',
              categoryAr: mapRouaNewsCategoryToArabic(article.category),
              publishedAt: article.publishedAt || new Date().toISOString(),
            }));

            return NextResponse.json({
              success: true,
              data: articles,
              count: articles.length,
              source: 'roua-news',
            });
          }
        }
      } catch (error: any) {
        console.warn('[news/latest] Roua News site unavailable:', error?.message || error);
      }
    }

    // ── Priority 2: NestJS internal news ──
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    try {
      const params = new URLSearchParams();
      if (symbol) params.set('symbol', symbol);
      if (sentiment) params.set('sentiment', sentiment);
      if (category) params.set('category', category);
      params.set('limit', limit);

      const res = await fetch(`${apiTarget}/api/news/latest?${params.toString()}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          // Normalize affectedAssets: Prisma stores as JSON string, frontend expects array
          const normalizedData = data.data.map((item: any) => ({
            ...item,
            affectedAssets: typeof item.affectedAssets === 'string'
              ? (() => { try { return JSON.parse(item.affectedAssets); } catch { return []; } })()
              : Array.isArray(item.affectedAssets)
                ? item.affectedAssets
                : [],
          }));
          return NextResponse.json({ ...data, data: normalizedData });
        }
      }
    } catch (error: any) {
      // NestJS unavailable, use local fallback
      console.warn('[news/latest] NestJS news endpoint unavailable, using local RSS fallback:', error?.message || error)
    }

    // Local fallback: Fetch RSS + simulate analysis
    const newsItems = await fetchLocalNews(symbol, sentiment, category, parseInt(limit));

    return NextResponse.json({
      success: true,
      data: newsItems,
      count: newsItems.length,
      source: 'local',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ في جلب الأخبار: ${error.message}`, data: [], count: 0 },
      { status: 502 },
    );
  }
}

/**
 * Extract text content from an XML element, handling CDATA sections.
 * e.g. <title><![CDATA[Hello & World]]></title>  →  "Hello & World"
 *      <title>Hello &amp; World</title>           →  "Hello & World"
 */
function extractXmlElement(parent: string, tagName: string): string | null {
  // Try CDATA version first: <tag><![CDATA[...]]></tag>
  const cdataRegex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'i')
  const cdataMatch = cdataRegex.exec(parent)
  if (cdataMatch) return cdataMatch[1].trim()

  // Try normal version: <tag>...</tag>
  // Use a non-greedy match that doesn't cross into sibling elements
  const normalRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i')
  const normalMatch = normalRegex.exec(parent)
  if (normalMatch) {
    // Decode common XML entities
    return normalMatch[1].trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  }

  return null
}

/**
 * Extract all text content for a repeating XML element, handling CDATA sections.
 * e.g. multiple <category> elements
 */
function extractXmlElements(parent: string, tagName: string): string[] {
  const results: string[] = []

  // CDATA version
  const cdataRegex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'gi')
  let match
  while ((match = cdataRegex.exec(parent)) !== null) {
    results.push(match[1].trim())
  }

  // If no CDATA matches, try normal version
  if (results.length === 0) {
    const normalRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'gi')
    while ((match = normalRegex.exec(parent)) !== null) {
      results.push(match[1].trim()
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"))
    }
  }

  return results
}

/**
 * Local news fetching fallback
 * Combines RSS feeds with simulated AI analysis
 */
async function fetchLocalNews(
  symbolFilter: string,
  sentimentFilter: string,
  categoryFilter: string,
  limit: number,
): Promise<any[]> {
  const allNews: any[] = [];

  // Fetch CoinTelegraph RSS
  try {
    const res = await fetch('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)' },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const xml = await res.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(xml)) !== null && allNews.length < 30) {
        const content = itemMatch[1];

        // Use robust XML element extraction that handles CDATA properly
        const title = extractXmlElement(content, 'title')
        const description = extractXmlElement(content, 'description')
        const link = extractXmlElement(content, 'link')
        const pubDate = extractXmlElement(content, 'pubDate')
        const categories = extractXmlElements(content, 'category')

        if (title) {
          const category = categories.length > 0 ? categories[0] : 'Crypto'
          const lowerTitle = title.toLowerCase()
          const cleanDesc = description ? description.replace(/<[^>]*>/g, '') : ''

          // Simulate sentiment analysis
          let sentimentScore = 0;
          let affectedAssets: string[] = [];
          const positiveWords = ['surge', 'rally', 'bull', 'gain', 'rise', 'soar', 'jump', 'upgrade', 'adopt', 'approval', 'breakthrough'];
          const negativeWords = ['crash', 'dump', 'bear', 'fall', 'drop', 'decline', 'hack', 'ban', 'regulate', 'risk', 'loss'];

          for (const w of positiveWords) if (lowerTitle.includes(w)) sentimentScore += 0.15;
          for (const w of negativeWords) if (lowerTitle.includes(w)) sentimentScore -= 0.15;

          if (/btc|bitcoin/i.test(lowerTitle)) affectedAssets.push('BTC');
          if (/eth|ethereum/i.test(lowerTitle)) affectedAssets.push('ETH');
          if (/sol|solana/i.test(lowerTitle)) affectedAssets.push('SOL');
          if (/xrp/i.test(lowerTitle)) affectedAssets.push('XRP');
          if (/bnb/i.test(lowerTitle)) affectedAssets.push('BNB');
          if (/ada/i.test(lowerTitle)) affectedAssets.push('ADA');

          sentimentScore = Math.max(-1, Math.min(1, sentimentScore));
          const sentimentLabel = sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral';
          const impactLevel = Math.abs(sentimentScore) > 0.4 ? 'high' : 'medium';

          // Simulate Arabic translation
          const translatedTitle = simulateArabicTranslation(title, category);

          allNews.push({
            id: `ct-${allNews.length}`,
            source: 'CoinTelegraph',
            title,
            translatedTitle,
            content: cleanDesc,
            translatedContent: '',
            summary: generateSummary(title, sentimentLabel, affectedAssets),
            url: link || null,
            sentiment: sentimentScore,
            sentimentLabel,
            impactLevel,
            affectedAssets,
            category,
            categoryAr: mapCategoryToArabic(category),
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          });
        }
      }
    }
  } catch (error: any) {
    console.warn('CoinTelegraph RSS failed:', error.message);
  }

  // Add CryptoPanic-style news (hardcoded enrichments)
  if (allNews.length < 10) {
    allNews.push(...getEnrichedFallbackNews());
  }

  // Apply filters
  let filtered = allNews;
  if (symbolFilter) {
    filtered = filtered.filter(
      (n) => n.affectedAssets.includes(symbolFilter.toUpperCase()) || n.title.toLowerCase().includes(symbolFilter.toLowerCase()),
    );
  }
  if (sentimentFilter) {
    filtered = filtered.filter((n) => n.sentimentLabel === sentimentFilter);
  }
  if (categoryFilter) {
    filtered = filtered.filter(
      (n) => n.category?.toLowerCase().includes(categoryFilter.toLowerCase()) || n.categoryAr?.includes(categoryFilter),
    );
  }

  return filtered.slice(0, limit);
}

function mapCategoryToArabic(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('bitcoin') || lower.includes('crypto')) return 'كريبتو';
  if (lower.includes('forex') || lower.includes('currency') || lower.includes('fx')) return 'فوركس';
  if (lower.includes('market') || lower.includes('stock')) return 'أسهم';
  if (lower.includes('commodit') || lower.includes('gold') || lower.includes('oil') || lower.includes('silver')) return 'سلع';
  if (lower.includes('regulation') || lower.includes('policy')) return 'تنظيم';
  if (lower.includes('economy') || lower.includes('macro')) return 'اقتصاد';
  if (lower.includes('etf')) return 'صناديق';
  return 'أسواق';
}

/**
 * Map Roua News Site category values to Arabic category names
 * that match the News Room category tabs (كريبتو, فوركس, اقتصاد, سلع)
 */
function mapRouaNewsCategoryToArabic(category: string | undefined | null): string {
  if (!category) return 'أسواق'
  const cat = category.toLowerCase().trim()

  // Direct Arabic category match (already in Arabic)
  if (cat === 'كريبتو' || cat === 'فوركس' || cat === 'اقتصاد' || cat === 'سلع' || cat === 'أسواق' || cat === 'أسهم') return category

  // English category mapping
  if (cat.includes('crypto') || cat.includes('bitcoin') || cat.includes('btc') || cat.includes('altcoin') || cat.includes('defi') || cat.includes('nft')) return 'كريبتو'
  if (cat.includes('forex') || cat.includes('currency') || cat.includes('fx') || cat.includes('pair')) return 'فوركس'
  if (cat.includes('econom') || cat.includes('macro') || cat.includes('fed') || cat.includes('central bank') || cat.includes('inflation') || cat.includes('interest rate') || cat.includes('gdp')) return 'اقتصاد'
  if (cat.includes('commodit') || cat.includes('gold') || cat.includes('oil') || cat.includes('silver') || cat.includes('natural gas') || cat.includes('copper') || cat.includes('wheat')) return 'سلع'
  if (cat.includes('stock') || cat.includes('equity') || cat.includes('share') || cat.includes('index') || cat.includes('s&p') || cat.includes('nasdaq') || cat.includes('dow')) return 'أسهم'
  if (cat.includes('regulat') || cat.includes('policy') || cat.includes('sec') || cat.includes('law')) return 'تنظيم'

  return 'أسواق'
}

function simulateArabicTranslation(title: string, category: string): string {
  // Basic keyword-based translation for common terms
  const translations: Record<string, string> = {
    'bitcoin': 'بيتكوين',
    'ethereum': 'إيثيريوم',
    'crypto': 'عملات مشفرة',
    'surge': 'يرتفع',
    'rally': 'صعود',
    'crash': 'انهيار',
    'drop': 'ينخفض',
    'rise': 'يرتفع',
    'fall': 'يهبط',
    'regulation': 'تنظيم',
    'ban': 'حظر',
    'ETF': 'صندوق ETF',
    'Fed': 'الاحتياطي الفيدرالي',
    'interest rate': 'سعر الفائدة',
    'market': 'السوق',
    'bullish': 'صعودي',
    'bearish': 'هبوطي',
  };

  let translated = title;
  for (const [en, ar] of Object.entries(translations)) {
    translated = translated.replace(new RegExp(en, 'gi'), ar);
  }

  // If no translations applied, add Arabic prefix
  if (translated === title) {
    const categoryAr = mapCategoryToArabic(category);
    translated = `[${categoryAr}] ${title}`;
  }

  return translated;
}

function generateSummary(title: string, sentiment: string, assets: string[]): string {
  const sentimentMap: Record<string, string> = {
    positive: 'إيجابي — قد يدعم صعود الأصل',
    negative: 'سلبي — قد يضغط على الأسعار',
    neutral: 'محايد — تأثير محدود على السوق',
  };
  const assetStr = assets.length > 0 ? assets.join(' و') : 'السوق';
  return `تحليل: المشاعر ${sentimentMap[sentiment] || 'محايد'}. الأصول المتأثرة: ${assetStr}.`;
}

function getEnrichedFallbackNews() {
  // NOTE: Fallback news articles removed to avoid misleading users with fabricated data.
  // When real news APIs are unavailable, the endpoint will return an empty array.
  return [];
}
