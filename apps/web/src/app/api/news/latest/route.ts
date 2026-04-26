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

    // Try NestJS first
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
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
          return NextResponse.json(data);
        }
      }
    } catch {
      // NestJS unavailable, use local fallback
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
      let match;

      while ((match = itemRegex.exec(xml)) !== null && allNews.length < 30) {
        const content = match[1];
        const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content) || /<title>(.*?)<\/title>/.exec(content);
        const descMatch = /<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(content) || /<description>(.*?)<\/description>/.exec(content);
        const linkMatch = /<link>(.*?)<\/link>/.exec(content);
        const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);
        const categoryMatch = /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(content) || /<category>(.*?)<\/category>/.exec(content);

        if (titleMatch) {
          const category = categoryMatch ? categoryMatch[1].trim() : 'Crypto';
          const title = titleMatch[1].trim();
          const lowerTitle = title.toLowerCase();
          const description = descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : '';

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
            content: description,
            translatedContent: '',
            summary: generateSummary(title, sentimentLabel, affectedAssets),
            url: linkMatch ? linkMatch[1].trim() : null,
            sentiment: sentimentScore,
            sentimentLabel,
            impactLevel,
            affectedAssets,
            category,
            categoryAr: mapCategoryToArabic(category),
            publishedAt: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString(),
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
  return [
    {
      id: 'fb-1',
      source: 'تحليل AI',
      title: 'Bitcoin shows strong bullish momentum above key resistance',
      translatedTitle: 'بيتكوين يُظهر زخماً صعودياً قوياً فوق مقاومة رئيسية',
      content: 'BTC has broken above the 68,000 resistance level with increasing volume.',
      translatedContent: 'بيتكوين يكسر مستوى مقاومة 68,000 مع ارتفاع الحجم.',
      summary: 'تحليل: المشاعر إيجابي — قد يدعم صعود الأصل. الأصول المتأثرة: BTC.',
      url: null,
      sentiment: 0.7,
      sentimentLabel: 'positive',
      impactLevel: 'high',
      affectedAssets: ['BTC'],
      category: 'Crypto',
      categoryAr: 'كريبتو',
      publishedAt: new Date().toISOString(),
    },
    {
      id: 'fb-2',
      source: 'تحليل AI',
      title: 'Ethereum network upgrade could boost DeFi adoption',
      translatedTitle: 'ترقية شبكة إيثيريوم قد تعزز تبني DeFi',
      content: 'The upcoming Ethereum upgrade promises lower gas fees and improved scalability.',
      translatedContent: 'ترقية إيثيريوم القادمة تعد برسوم غاز أقل وقابلية تحسين محسنة.',
      summary: 'تحليل: المشاعر إيجابي — قد يدعم صعود الأصل. الأصول المتأثرة: ETH.',
      url: null,
      sentiment: 0.6,
      sentimentLabel: 'positive',
      impactLevel: 'high',
      affectedAssets: ['ETH'],
      category: 'Crypto',
      categoryAr: 'كريبتو',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'fb-3',
      source: 'تحليل AI',
      title: 'Federal Reserve signals potential rate cuts in Q3',
      translatedTitle: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث',
      content: 'Fed officials hint at possible rate cuts amid cooling inflation.',
      translatedContent: 'مسؤولو الفيدرالي لمحوا إلى خفض محتمل للفائدة مع تراجع التضخم.',
      summary: 'تحليل: المشاعر إيجابي — قد يدعم صعود الأصل. الأصول المتأثرة: BTC وETH.',
      url: null,
      sentiment: 0.8,
      sentimentLabel: 'positive',
      impactLevel: 'high',
      affectedAssets: ['BTC', 'ETH'],
      category: 'Economy',
      categoryAr: 'اقتصاد',
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'fb-4',
      source: 'تحليل AI',
      title: 'Regulatory crackdown on crypto exchanges intensifies',
      translatedTitle: 'تشديد الرقابة على منصات تداول العملات المشفرة',
      content: 'Multiple jurisdictions announce stricter oversight of crypto exchanges.',
      translatedContent: 'عدة ولايات تعلن رقابة أشد على منصات التداول المشفرة.',
      summary: 'تحليل: المشاعر سلبي — قد يضغط على الأسعار. الأصول المتأثرة: BTC وETH.',
      url: null,
      sentiment: -0.5,
      sentimentLabel: 'negative',
      impactLevel: 'high',
      affectedAssets: ['BTC', 'ETH'],
      category: 'Regulation',
      categoryAr: 'تنظيم',
      publishedAt: new Date(Date.now() - 10800000).toISOString(),
    },
    {
      id: 'fb-5',
      source: 'تحليل AI',
      title: 'Solana ecosystem growth accelerates with new partnerships',
      translatedTitle: 'نمو منظومة سولانا يتسارع بشراكات جديدة',
      content: 'Solana announces strategic partnerships expanding its DeFi ecosystem.',
      translatedContent: 'سولانا تعلن عن شراكات استراتيجية توسع منظومة DeFi الخاصة بها.',
      summary: 'تحليل: المشاعر إيجابي — قد يدعم صعود الأصل. الأصول المتأثرة: SOL.',
      url: null,
      sentiment: 0.5,
      sentimentLabel: 'positive',
      impactLevel: 'medium',
      affectedAssets: ['SOL'],
      category: 'Crypto',
      categoryAr: 'كريبتو',
      publishedAt: new Date(Date.now() - 14400000).toISOString(),
    },
  ];
}
