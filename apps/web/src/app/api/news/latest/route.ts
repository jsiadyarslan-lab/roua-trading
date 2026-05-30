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
    const lang = searchParams.get('lang') || 'ar';

    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    // ── French pipeline: process FIRST and independently ──
    // The Roua News site has a separate French pipeline at /api/fr/news
    // that produces French-language articles from BFM TV, Google News FR, etc.
    if (lang === 'fr') {
      try {
        const frUrl = `${newsSiteUrl}/api/fr/news?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`;
        console.log('[news/latest] Fetching French pipeline:', frUrl);

        const frRes = await fetch(frUrl, {
          headers: {},
          signal: AbortSignal.timeout(15000),
        });

        console.log('[news/latest] French pipeline response status:', frRes.status);

        if (frRes.ok) {
          const frData = await frRes.json();
          const frArticles = frData.news || frData.articles || [];
          console.log('[news/latest] French pipeline articles count:', frArticles.length);

          if (frArticles.length > 0) {
            const articles = frArticles.map((article: any) => {
              let affectedAssets: any[] = [];
              if (typeof article.affectedAssets === 'string') {
                try { affectedAssets = JSON.parse(article.affectedAssets); } catch { affectedAssets = []; }
              } else if (Array.isArray(article.affectedAssets)) {
                affectedAssets = article.affectedAssets;
              }

              let sentimentNormalized = 0;
              if (typeof article.sentimentScore === 'number') {
                sentimentNormalized = (article.sentimentScore - 50) / 50;
              }

              let resolvedImageUrl: string | null = null;
              if (article.imageUrl && !article.imageUrl.startsWith('/')) {
                resolvedImageUrl = article.imageUrl;
              } else if (article.id) {
                resolvedImageUrl = `${newsSiteUrl}/api/article-image/${article.id}`;
              } else if (article.imageUrl) {
                resolvedImageUrl = `${newsSiteUrl}${article.imageUrl}`;
              }

              const frCategory = article.category || article.categoryId || 'Général';

              return {
                id: article.id,
                source: article.source || "Ru'aa News FR",
                title: article.title || '',
                translatedTitle: article.title || '',
                content: article.content || article.summary || '',
                translatedContent: article.content || article.summary || '',
                summary: article.summary || article.content || '',
                textFr: article.title || '',
                textTr: article.title || '',
                textEs: article.title || '',
                fullContent: article.fullContent || article.content || '',
                keyTakeaways: Array.isArray(article.keyTakeaways) ? article.keyTakeaways : [],
                imageUrl: resolvedImageUrl,
                url: article.url || (article.slug ? `${newsSiteUrl}/fr/news/${article.slug}` : null),
                sentiment: sentimentNormalized,
                sentimentLabel: article.sentiment || 'neutral',
                impactLevel: article.impactLevel || 'medium',
                affectedAssets,
                category: frCategory,
                categoryAr: mapCategoryToArabic(frCategory),
                categoryFr: mapCategoryToFrench(frCategory),
                categoryTr: mapCategoryToTurkish(frCategory),
                categoryEs: mapCategoryToSpanish(frCategory),
                publishedAt: article.publishedAt || new Date().toISOString(),
                newsType: article.newsType || 'live',
                slug: article.slug || '',
                lang: 'fr',
              };
            });

            console.log('[news/latest] Returning', articles.length, 'French articles');
            return NextResponse.json({
              success: true,
              data: articles,
              count: articles.length,
              source: 'roua-news-fr',
              lang: 'fr',
            });
          }
        }
        console.warn('[news/latest] French pipeline returned no data, trying fallback');
      } catch (frErr: any) {
        console.error('[news/latest] French pipeline error:', frErr?.message || frErr);
      }
      // French pipeline failed — fall back to standard pipeline
    }

    // ── Standard pipeline (Arabic/English/Turkish/Spanish) ──
    if (integrationKey) {
      try {
        const fetchLimit = (lang === 'en' || lang === 'tr' || lang === 'es') ? String(Math.min(parseInt(limit) * 3, 100)) : limit;
        const newsRes = await fetch(`${newsSiteUrl}/api/integration/news?limit=${fetchLimit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Integration-Key': integrationKey,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (newsRes.ok) {
          const newsData = await newsRes.json();
          if (newsData.articles && Array.isArray(newsData.articles) && newsData.articles.length > 0) {
            let filteredArticles = newsData.articles;

            if (lang === 'ar') {
              // Arabic users: prefer articles with Arabic content
              filteredArticles = filteredArticles.filter((article: any) => article.titleAr);
            } else {
              // English/French/Turkish/Spanish/other: prefer English-pipeline articles
              filteredArticles = filteredArticles.filter((article: any) => !article.titleAr);
            }

            const articles = filteredArticles.map((article: any) => {
              let affectedAssets: any[] = [];
              if (typeof article.affectedAssets === 'string') {
                try { affectedAssets = JSON.parse(article.affectedAssets); } catch { affectedAssets = []; }
              } else if (Array.isArray(article.affectedAssets)) {
                affectedAssets = article.affectedAssets;
              }

              let sentimentNormalized = 0;
              if (typeof article.sentimentScore === 'number') {
                sentimentNormalized = (article.sentimentScore - 50) / 50;
              }

              let resolvedImageUrl: string | null = null;
              if (article.id) {
                resolvedImageUrl = `${newsSiteUrl}/api/article-image/${article.id}`;
              } else if (article.imageUrl) {
                resolvedImageUrl = article.imageUrl.startsWith('/') ? `${newsSiteUrl}${article.imageUrl}` : article.imageUrl;
              }

              const isNonArabic = lang === 'en' || lang === 'tr' || lang === 'es';
              const isTr = lang === 'tr';
              const isEs = lang === 'es';
              const defaultCategory = isNonArabic ? 'Markets' : 'أسواق';
              const defaultSource = isNonArabic ? "Ru'aa News" : 'رؤى للأخبار';

              return {
                id: article.id,
                source: article.source || defaultSource,
                title: article.title || '',
                translatedTitle: isNonArabic ? (article.title || '') : (article.titleAr || article.title || ''),
                content: article.content || article.summary || '',
                translatedContent: isNonArabic ? (article.content || article.summary || '') : (article.contentAr || article.summaryAr || ''),
                summary: isNonArabic ? (article.summary || article.content || '') : (article.summaryAr || article.summary || ''),
                textFr: article.title || '',
                textTr: article.title || '',
                textEs: article.title || '',
                fullContent: article.fullContent || '',
                keyTakeaways: Array.isArray(article.keyTakeaways) ? article.keyTakeaways : [],
                imageUrl: resolvedImageUrl,
                url: article.url || (article.slug ? `${newsSiteUrl}${isNonArabic ? '/en' : ''}/news/${article.slug}` : null),
                sentiment: sentimentNormalized,
                sentimentLabel: article.sentiment || 'neutral',
                impactLevel: article.impactLevel || 'medium',
                affectedAssets,
                category: article.category || defaultCategory,
                categoryAr: article.category || defaultCategory,
                categoryFr: mapCategoryToFrench(article.category || defaultCategory),
                categoryTr: mapCategoryToTurkish(article.category || defaultCategory),
                categoryEs: mapCategoryToSpanish(article.category || defaultCategory),
                publishedAt: article.publishedAt || new Date().toISOString(),
                newsType: article.newsType || 'live',
                slug: article.slug || '',
                lang: isEs ? 'es' : isTr ? 'tr' : (isNonArabic ? 'en' : 'ar'),
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

function extractXmlElement(parent: string, tagName: string): string | null {
  const cdataRegex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'i')
  const cdataMatch = cdataRegex.exec(parent)
  if (cdataMatch) return cdataMatch[1].trim()

  const normalRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i')
  const normalMatch = normalRegex.exec(parent)
  if (normalMatch) {
    return normalMatch[1].trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  }

  return null
}

function extractXmlElements(parent: string, tagName: string): string[] {
  const results: string[] = []
  const cdataRegex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'gi')
  let match
  while ((match = cdataRegex.exec(parent)) !== null) {
    results.push(match[1].trim())
  }
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

async function fetchLocalNews(
  symbolFilter: string,
  sentimentFilter: string,
  categoryFilter: string,
  limit: number,
): Promise<any[]> {
  const allNews: any[] = [];

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
        const title = extractXmlElement(content, 'title')
        const description = extractXmlElement(content, 'description')
        const link = extractXmlElement(content, 'link')
        const pubDate = extractXmlElement(content, 'pubDate')
        const categories = extractXmlElements(content, 'category')

        if (title) {
          const category = categories.length > 0 ? categories[0] : 'Crypto'
          const lowerTitle = title.toLowerCase()
          const cleanDesc = description ? description.replace(/<[^>]*>/g, '') : ''

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
            textEs: title || '',
            url: link || null,
            sentiment: sentimentScore,
            sentimentLabel,
            impactLevel,
            affectedAssets,
            category,
            categoryAr: mapCategoryToArabic(category),
            categoryFr: mapCategoryToFrench(category),
            categoryTr: mapCategoryToTurkish(category),
            categoryEs: mapCategoryToSpanish(category),
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          });
        }
      }
    }
  } catch (error: any) {
    console.warn('CoinTelegraph RSS failed:', error.message);
  }

  if (allNews.length < 10) {
    allNews.push(...getEnrichedFallbackNews());
  }

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
  if (lower.includes('economy') || lower.includes('macro') || lower.includes('économ')) return 'اقتصاد';
  if (lower.includes('etf')) return 'صناديق';
  if (lower.includes('forex') || lower.includes('currency') || lower.includes('devise')) return 'فوركس';
  if (lower.includes('commodit') || lower.includes('matièr') || lower.includes('métaux')) return 'سلع';
  if (lower.includes('technolog') || lower.includes('tech')) return 'تقنية';
  if (lower.includes('action') || lower.includes('action')) return 'أسهم';
  return 'أسواق';
}

function mapCategoryToFrench(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('economy') || lower.includes('macro') || lower.includes('économ')) return 'Économie';
  if (lower.includes('technology') || lower.includes('tech') || lower.includes('technolog')) return 'Technologie';
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('ethereum')) return 'Crypto';
  if (lower.includes('forex') || lower.includes('currency') || lower.includes('devise')) return 'Forex';
  if (lower.includes('commodit') || lower.includes('matièr')) return 'Matières premières';
  if (lower.includes('metal') || lower.includes('gold') || lower.includes('métaux')) return 'Métaux';
  if (lower.includes('energy') || lower.includes('oil') || lower.includes('énergi')) return 'Énergie';
  if (lower.includes('stock') || lower.includes('market') || lower.includes('action')) return 'Actions';
  if (lower.includes('politic') || lower.includes('politiqu')) return 'Politique';
  if (lower.includes('sport')) return 'Sport';
  if (lower.includes('general') || lower.includes('général')) return 'Général';
  if (lower.includes('defi')) return 'DeFi';
  if (lower.includes('regulation') || lower.includes('policy') || lower.includes('réglement')) return 'Réglementation';
  if (lower.includes('bond') || lower.includes('obligation')) return 'Obligations';
  if (lower.includes('etf') || lower.includes('fund') || lower.includes('fonds')) return 'ETF';
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

function mapCategoryToSpanish(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('monetary policy')) return 'Política Monetaria';
  if (lower.includes('interest rate')) return 'Tasa de Interés';
  if (lower.includes('fed')) return 'Reserva Federal';
  if (lower.includes('ecb')) return 'BCE';
  if (lower.includes('bank of japan') || lower.includes('boj')) return 'Banco de Japón';
  if (lower.includes('inflation') || lower.includes('cpi')) return 'Inflación';
  if (lower.includes('employment') || lower.includes('jobs') || lower.includes('labor')) return 'Empleo';
  if (lower.includes('gdp')) return 'PIB';
  if (lower.includes('geopolit')) return 'Geopolítica';
  if (lower.includes('politic')) return 'Política';
  if (lower.includes('trade')) return 'Comercio';
  if (lower.includes('housing') || lower.includes('real estate')) return 'Vivienda';
  if (lower.includes('manufactur')) return 'Manufactura';
  if (lower.includes('retail')) return 'Minorista';
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('ethereum')) return 'Criptomonedas';
  if (lower.includes('forex') || lower.includes('currency')) return 'Forex';
  if (lower.includes('commodit')) return 'Materias Primas';
  if (lower.includes('metal') || lower.includes('gold')) return 'Materias Primas';
  if (lower.includes('energy') || lower.includes('oil')) return 'Energía';
  if (lower.includes('stock')) return 'Acciones';
  if (lower.includes('market')) return 'Acciones';
  if (lower.includes('technology') || lower.includes('tech')) return 'Tecnología';
  if (lower.includes('economy') || lower.includes('macro')) return 'Economía';
  if (lower.includes('regulation') || lower.includes('policy')) return 'Regulación';
  if (lower.includes('etf') || lower.includes('fund')) return 'ETF';
  if (lower.includes('defi')) return 'DeFi';
  if (lower.includes('bond')) return 'Bonos';
  if (lower.includes('general')) return 'General';
  return 'General';
}

function simulateArabicTranslation(title: string, category: string): string {
  const translations: Record<string, string> = {
    'bitcoin': 'بيتكوين', 'ethereum': 'إيثيريوم', 'crypto': 'عملات مشفرة',
    'surge': 'يرتفع', 'rally': 'صعود', 'crash': 'انهيار', 'drop': 'ينخفض',
    'rise': 'يرتفع', 'fall': 'يهبط', 'regulation': 'تنظيم', 'ban': 'حظر',
    'ETF': 'صندوق ETF', 'Fed': 'الاحتياطي الفيدرالي', 'interest rate': 'سعر الفائدة',
    'market': 'السوق', 'bullish': 'صعودي', 'bearish': 'هبوطي',
  };

  let translated = title;
  for (const [en, ar] of Object.entries(translations)) {
    translated = translated.replace(new RegExp(en, 'gi'), ar);
  }

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
  return [];
}
