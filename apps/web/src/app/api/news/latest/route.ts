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
    const lang = searchParams.get('lang') || 'ar'; // 'ar' = Arabic pipeline (default), 'en' = English pipeline, 'fr' = French pipeline, 'tr' = Turkish pipeline (uses English content)

    // ── Priority 1: Roua News Site (AI-analyzed Arabic financial news) ──
    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    if (integrationKey) {
      try {
        // Fetch more articles when filtering by language (English/French articles are a subset)
        const fetchLimit = (lang === 'en' || lang === 'fr' || lang === 'tr') ? String(Math.min(parseInt(limit) * 3, 100)) : limit;
        const newsRes = await fetch(`${newsSiteUrl}/api/integration/news?limit=${fetchLimit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Integration-Key': integrationKey,
          },
          signal: AbortSignal.timeout(8000),
        });

        if (newsRes.ok) {
          const newsData = await newsRes.json();
          if (newsData.articles && Array.isArray(newsData.articles) && newsData.articles.length > 0) {
            // Filter and transform articles based on language pipeline
            let filteredArticles = newsData.articles;

            if (lang === 'en' || lang === 'fr' || lang === 'tr') {
              // English/French/Turkish pipeline: articles where titleAr is empty (produced by English pipeline)
              filteredArticles = filteredArticles.filter((article: any) => !article.titleAr);
            } else {
              // Arabic pipeline (default): articles where titleAr exists (produced by Arabic pipeline)
              filteredArticles = filteredArticles.filter((article: any) => article.titleAr);
            }

            const articles = filteredArticles.map((article: any) => {
              // Parse affectedAssets from string if needed
              let affectedAssets: any[] = [];
              if (typeof article.affectedAssets === 'string') {
                try { affectedAssets = JSON.parse(article.affectedAssets); } catch { affectedAssets = []; }
              } else if (Array.isArray(article.affectedAssets)) {
                affectedAssets = article.affectedAssets;
              }

              // Convert sentimentScore from 0-100 scale to -1..1 scale
              let sentimentNormalized = 0;
              if (typeof article.sentimentScore === 'number') {
                // API returns 0-100 where 50=neutral, >50=positive, <50=negative
                sentimentNormalized = (article.sentimentScore - 50) / 50;
              }

              // Resolve image URL: prioritize generated article images from R2 storage
              // The /api/article-image/{id} endpoint returns AI-generated images specific to each article,
              // while article.imageUrl often contains generic source logos (e.g. Seeking Alpha).
              // Always prefer the generated image endpoint.
              let resolvedImageUrl: string | null = null;
              if (article.id) {
                // Primary: use the generated article image endpoint (redirects to R2 storage)
                resolvedImageUrl = `${newsSiteUrl}/api/article-image/${article.id}`;
              } else if (article.imageUrl) {
                // Fallback: only use imageUrl if no article ID available
                if (article.imageUrl.startsWith('/')) {
                  resolvedImageUrl = `${newsSiteUrl}${article.imageUrl}`;
                } else {
                  resolvedImageUrl = article.imageUrl;
                }
              }

              // Build article object with language-appropriate field mapping
              const isNonArabic = lang === 'en' || lang === 'fr' || lang === 'tr';
              const isFr = lang === 'fr';
              const isTr = lang === 'tr';
              const defaultCategory = isNonArabic ? 'Markets' : 'أسواق';
              const defaultSource = isNonArabic ? "Ru'aa News" : 'رؤى للأخبار';

              return {
                id: article.id,
                source: article.source || defaultSource,
                // English original title
                title: article.title || '',
                // Display title: Arabic pipeline → Arabic, English/French pipeline → English
                translatedTitle: isNonArabic
                  ? (article.title || '')
                  : (article.titleAr || article.title || ''),
                // English original content/summary
                content: article.content || article.summary || '',
                // Display content: Arabic pipeline → Arabic, English/French pipeline → English
                translatedContent: isNonArabic
                  ? (article.content || article.summary || '')
                  : (article.contentAr || article.summaryAr || ''),
                // Summary: Arabic pipeline → Arabic, English/French pipeline → English
                summary: isNonArabic
                  ? (article.summary || article.content || '')
                  : (article.summaryAr || article.summary || ''),
                // French text: reuse English content (no French content source)
                textFr: article.title || '',
                // Turkish text: reuse English content (no Turkish content source)
                textTr: article.title || '',
                // Full analysis content
                fullContent: article.fullContent || '',
                // Key takeaways array
                keyTakeaways: Array.isArray(article.keyTakeaways) ? article.keyTakeaways : [],
                // Image URL (resolved to full URL)
                imageUrl: resolvedImageUrl,
                // URL to original article (English/French pipeline → /en/news, Arabic → /news)
                url: article.url || (article.slug ? `${newsSiteUrl}${isNonArabic ? '/en' : ''}/news/${article.slug}` : null),
                // Sentiment normalized to -1..1
                sentiment: sentimentNormalized,
                sentimentLabel: article.sentiment || 'neutral',
                impactLevel: article.impactLevel || 'medium',
                affectedAssets,
                category: article.category || defaultCategory,
                categoryAr: article.category || defaultCategory,
                categoryFr: mapCategoryToFrench(article.category || defaultCategory),
                categoryTr: mapCategoryToTurkish(article.category || defaultCategory),
                publishedAt: article.publishedAt || new Date().toISOString(),
                newsType: article.newsType || 'live',
                slug: article.slug || '',
                // Language indicator for frontend
                lang: isTr ? 'tr' : isFr ? 'fr' : (isNonArabic ? 'en' : 'ar'),
              };
            });

            return NextResponse.json({
              success: true,
              data: articles.slice(0, parseInt(limit)),
              count: articles.length,
              source: 'roua-news',
              lang,
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
            textFr: title || '',
            textTr: title || '',
            url: link || null,
            sentiment: sentimentScore,
            sentimentLabel,
            impactLevel,
            affectedAssets,
            category,
            categoryAr: mapCategoryToArabic(category),
            categoryFr: mapCategoryToFrench(category),
            categoryTr: mapCategoryToTurkish(category),
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
  if (lower.includes('market') || lower.includes('stock')) return 'أسهم';
  if (lower.includes('regulation') || lower.includes('policy')) return 'تنظيم';
  if (lower.includes('economy') || lower.includes('macro')) return 'اقتصاد';
  if (lower.includes('etf')) return 'صناديق';
  return 'أسواق';
}

function mapCategoryToFrench(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('economy') || lower.includes('macro')) return 'Économie';
  if (lower.includes('technology') || lower.includes('tech')) return 'Technologie';
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('ethereum')) return 'Crypto';
  if (lower.includes('forex') || lower.includes('currency')) return 'Forex';
  if (lower.includes('commodit')) return 'Matières premières';
  if (lower.includes('metal') || lower.includes('gold')) return 'Métaux';
  if (lower.includes('energy') || lower.includes('oil')) return 'Énergie';
  if (lower.includes('stock') || lower.includes('market')) return 'Actions';
  if (lower.includes('politic')) return 'Politique';
  if (lower.includes('sport')) return 'Sport';
  if (lower.includes('general')) return 'Général';
  if (lower.includes('defi')) return 'DeFi';
  if (lower.includes('regulation') || lower.includes('policy')) return 'Réglementation';
  if (lower.includes('bond')) return 'Obligations';
  if (lower.includes('etf') || lower.includes('fund')) return 'ETF';
  if (lower.includes('fed')) return 'Fed';
  return 'Général';
}

function mapCategoryToTurkish(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('forex') || lower.includes('currency')) return 'Döviz';
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('ethereum')) return 'Kripto';
  if (lower.includes('stock')) return 'Hisse Senetleri';
  if (lower.includes('commodit') || lower.includes('metal') || lower.includes('gold') || lower.includes('oil')) return 'Emtialar';
  if (lower.includes('indices') || lower.includes('index')) return 'Endeksler';
  if (lower.includes('economy') || lower.includes('macro')) return 'Ekonomi';
  if (lower.includes('analysis')) return 'Analiz';
  if (lower.includes('education') || lower.includes('learn')) return 'Eğitim';
  if (lower.includes('opinion') || lower.includes('editorial')) return 'Görüş';
  if (lower.includes('breaking')) return 'Son Dakika';
  if (lower.includes('market')) return 'Piyasa';
  if (lower.includes('technology') || lower.includes('tech')) return 'Teknoloji';
  if (lower.includes('regulation') || lower.includes('policy')) return 'Düzenleme';
  if (lower.includes('etf') || lower.includes('fund')) return 'ETF';
  if (lower.includes('fed')) return 'Fed';
  if (lower.includes('defi')) return 'DeFi';
  if (lower.includes('energy')) return 'Enerji';
  if (lower.includes('general')) return 'Genel';
  return category;
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
