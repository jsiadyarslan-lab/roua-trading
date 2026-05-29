import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/news
 * Lightweight news endpoint used by mobile news page.
 * Proxies to /api/news/latest with sensible defaults.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'ar';
    const limit = searchParams.get('limit') || '15';

    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    // ── French pipeline: use dedicated /api/fr/news endpoint ──
    if (lang === 'fr') {
      try {
        const frRes = await fetch(`${newsSiteUrl}/api/fr/news?limit=${limit}`, {
          headers: {},
          signal: AbortSignal.timeout(15000),
        });

        if (frRes.ok) {
          const frData = await frRes.json();
          const frArticles = frData.news || frData.articles || [];

          if (frArticles.length > 0) {
            const news = frArticles.map((article: any) => ({
              id: article.id,
              title: article.title || '',
              summary: article.summary || '',
              url: article.url || (article.slug ? `${newsSiteUrl}/fr/news/${article.slug}` : null),
              source: article.source || "Ru'aa News FR",
              publishedAt: article.publishedAt || null,
              sentiment: article.sentiment || 'neutral',
              category: article.category || 'Général',
              imageUrl: article.imageUrl || null,
            }));

            return NextResponse.json({ news, count: news.length, source: 'roua-news-fr', lang: 'fr' });
          }
        }
      } catch (frErr: any) {
        console.error('[news] French pipeline error:', frErr?.message || frErr);
      }
    }

    // ── Standard pipeline (Arabic/English) ──
    if (integrationKey) {
      try {
        const fetchLimit = (lang === 'en' || lang === 'tr' || lang === 'es') ? String(Math.min(parseInt(limit) * 3, 50)) : limit;
        const newsRes = await fetch(`${newsSiteUrl}/api/integration/news?limit=${fetchLimit}`, {
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

            if (lang === 'en' || lang === 'tr' || lang === 'es') {
              filteredArticles = filteredArticles.filter((article: any) => !article.titleAr);
            } else {
              filteredArticles = filteredArticles.filter((article: any) => article.titleAr);
            }

            const news = filteredArticles.slice(0, parseInt(limit)).map((article: any) => ({
              id: article.id,
              title: article.titleAr || article.title || '',
              summary: article.summaryAr || article.summary || '',
              url: article.url || (article.slug ? `${newsSiteUrl}/news/${article.slug}` : null),
              source: article.source || 'رؤى للأخبار',
              publishedAt: article.publishedAt || null,
              sentiment: article.sentiment || 'neutral',
              category: article.category || 'أسواق',
              imageUrl: article.id ? `${newsSiteUrl}/api/article-image/${article.id}` : null,
            }));

            return NextResponse.json({ news, count: news.length, source: 'roua-news', lang });
          }
        }
      } catch (error: any) {
        console.warn('[news] Roua News site unavailable:', error?.message || error);
      }
    }

    // ── NestJS fallback ──
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    try {
      const res = await fetch(`${apiTarget}/api/news/latest?limit=${limit}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const news = data.data.map((article: any) => ({
            id: article.id,
            title: article.translatedTitle || article.title || '',
            summary: article.summary || '',
            url: article.url || null,
            source: article.source || 'NestJS',
            publishedAt: article.publishedAt || null,
            sentiment: article.sentimentLabel || 'neutral',
            category: article.category || 'Markets',
          }));
          return NextResponse.json({ news, count: news.length, source: 'nestjs' });
        }
      }
    } catch {
      // NestJS unavailable
    }

    return NextResponse.json({ news: [], count: 0, source: 'none' });
  } catch (error: any) {
    return NextResponse.json(
      { news: [], count: 0, error: error.message },
      { status: 502 },
    );
  }
}
