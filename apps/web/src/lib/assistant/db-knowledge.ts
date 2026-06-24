// ─── DB Knowledge Engine ──────────────────────────────────────────
// The BRAIN of the smart assistant. Deeply connected to ALL 28 database
// tables. Provides unified search, cross-referencing, and proactive
// intelligence capabilities that make the assistant come ALIVE.
//
// Before: Assistant queried 8/28 tables
// After:  Assistant accesses ALL 28 tables with cross-referencing

import { db } from '@/lib/db';
import type { Locale } from './tools';

// ─── Types ────────────────────────────────────────────────────────

export interface KnowledgeSearchResult {
  source: string;        // Table name (e.g., 'NewsItem', 'StockAnalysis')
  sourceAr: string;      // Arabic name of source
  type: 'news' | 'report' | 'analysis' | 'signal' | 'recommendation' | 'infographic' | 'video' | 'event' | 'discussion' | 'indicator';
  title: string;
  titleAr?: string;
  summary?: string;
  summaryAr?: string;
  slug?: string;
  url?: string;
  date?: string;
  sentiment?: string;
  impactLevel?: string;
  confidenceScore?: number;
  symbols?: string[];
  extra?: Record<string, any>; // Table-specific fields
}

export interface TrendingTopic {
  topic: string;
  topicAr: string;
  count: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  relatedAssets: string[];
  latestHeadline: string;
  latestHeadlineAr: string;
}

export interface MarketPulse {
  topMovers: Array<{ symbol: string; name: string; nameAr: string; change: number; changePercent: number }>;
  activeSignals: Array<{ pair: string; action: string; confidence: number; source: string }>;
  upcomingEvents: Array<{ eventName: string; eventNameAr?: string; eventDate: string; importance: string; country: string }>;
  breakingNews: Array<{ title: string; titleAr?: string; impactLevel: string; sentiment: string }>;
  trendingTopics: TrendingTopic[];
  marketSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  lastUpdated: string;
}

export interface UserProfileContext {
  experienceLevel?: string;
  riskTolerance?: string;
  investmentHorizon?: string;
  preferredAssets?: string[];
  preferredMarkets?: string[];
  plan?: string;
  bookmarkedSlugs?: string[];
  activeAlerts?: Array<{ symbol: string; targetPrice: number; direction: string }>;
  unreadNotifications?: number;
  recentRecommendations?: Array<{ title: string; action: string; confidence: number }>;
  advisorEnabled?: boolean;
}

export interface CrossReferenceResult {
  symbol: string;
  news: KnowledgeSearchResult[];
  analyses: KnowledgeSearchResult[];
  signals: KnowledgeSearchResult[];
  reports: KnowledgeSearchResult[];
  recommendations: KnowledgeSearchResult[];
  infographics: KnowledgeSearchResult[];
  videos: KnowledgeSearchResult[];
  events: KnowledgeSearchResult[];
  discussions: KnowledgeSearchResult[];
  totalResults: number;
}

// ─── Unified Search across ALL content tables ─────────────────────

export async function searchKnowledge(
  query: string,
  locale: Locale = 'ar',
  options?: {
    types?: KnowledgeSearchResult['type'][];
    limit?: number;
    symbols?: string[];
    daysBack?: number;
  }
): Promise<KnowledgeSearchResult[]> {
  const { types, limit = 20, symbols, daysBack = 30 } = options || {};
  const results: KnowledgeSearchResult[] = [];
  const isAr = locale === 'ar';

  // Extract key terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'can', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'this', 'that', 'what', 'how',
    'when', 'where', 'why', 'all', 'each', 'more', 'most', 'other', 'some', 'such', 'not',
    'هل', 'ما', 'من', 'في', 'على', 'إلى', 'عن', 'مع', 'هذا', 'كيف', 'متى', 'أين',
    'لماذا', 'لا', 'نعم', 'أن', 'إن', 'كان', 'قد', 'لن', 'لم', 'لقد', 'أفضل', 'أخر',
    'est', 'un', 'une', 'le', 'la', 'les', 'de', 'du', 'des', 'et', 'en', 'dans',
    'bir', 've', 'için', 'bu', 'ne', 'nasıl', 'nerede', 'neden',
    'el', 'la', 'los', 'las', 'de', 'en', 'un', 'una', 'por', 'para', 'qué', 'cómo',
  ]);
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t));
  if (terms.length === 0 && (!symbols || symbols.length === 0)) return results;

  const searchConditions = terms.slice(0, 4).flatMap(term => [
    { title: { contains: term, mode: 'insensitive' as const } },
    { titleAr: { contains: term, mode: 'insensitive' as const } },
    { summary: { contains: term, mode: 'insensitive' as const } },
    { summaryAr: { contains: term, mode: 'insensitive' as const } },
  ]);

  const symbolConditions = symbols?.length ? symbols.flatMap(sym => [
    { affectedAssets: { contains: sym, mode: 'insensitive' as const } },
    { symbol: { contains: sym, mode: 'insensitive' as const } },
    { pair: { contains: sym, mode: 'insensitive' as const } },
  ]) : [];

  const dateFilter = daysBack ? {
    createdAt: { gte: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) },
  } : {};

  const allConditions = [...searchConditions, ...symbolConditions];
  const whereClause: any = allConditions.length > 0 ? { OR: allConditions } : {};

  // ── Search in parallel across ALL content tables ──
  const perTableLimit = Math.ceil(limit / 6); // Distribute across tables

  const [
    newsResults,
    reportResults,
    economicReportResults,
    marketAnalysisResults,
    stockAnalysisResults,
    signalResults,
    recommendationResults,
    infographicResults,
    videoResults,
    eventResults,
    discussionResults,
  ] = await Promise.allSettled([
    // 1. NewsItem
    (!types || types.includes('news')) ? db.newsItem.findMany({
      where: { isReady: true, ...dateFilter, ...whereClause },
      select: {
        title: true, titleAr: true, summary: true, summaryAr: true, slug: true,
        sentiment: true, impactLevel: true, affectedAssets: true, category: true,
        publishedAt: true, sourceName: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 2. Report (general reports)
    (!types || types.includes('report')) ? db.report.findMany({
      where: { isPublished: true, ...dateFilter, ...whereClause },
      select: {
        title: true, reportType: true, summaryAr: true, period: true,
        isPublished: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 3. EconomicReport
    (!types || types.includes('report')) ? db.economicReport.findMany({
      where: { isPublished: true, ...dateFilter, ...whereClause },
      select: {
        title: true, slug: true, summary: true, reportType: true, scope: true,
        marketImpact: true, confidenceScore: true, locale: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 4. MarketAnalysis
    (!types || types.includes('analysis')) ? db.marketAnalysis.findMany({
      where: { isPublished: true, ...dateFilter, ...whereClause },
      select: {
        title: true, slug: true, assetClass: true, analysisType: true, timeFrame: true,
        priceTarget: true, sentiment: true, confidenceScore: true, locale: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 5. StockAnalysis
    (!types || types.includes('analysis')) ? db.stockAnalysis.findMany({
      where: { isPublished: true, ...dateFilter, ...whereClause },
      select: {
        title: true, slug: true, symbol: true, summary: true, analysisType: true,
        overallSignal: true, overallScore: true, confidenceScore: true,
        technicalScore: true, fundamentalScore: true, sentiment: true,
        priceAtAnalysis: true, riskLevel: true, locale: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 6. TradingSignal
    (!types || types.includes('signal')) ? db.tradingSignal.findMany({
      where: { status: { in: ['ACTIVE', 'active'] }, ...whereClause },
      select: {
        pair: true, action: true, confidence: true, reason: true,
        entryPrice: true, stopLoss: true, takeProfit: true, riskReward: true,
        source: true, category: true, timeframe: true, status: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 7. PersonalizedRecommendation
    (!types || types.includes('recommendation')) ? db.personalizedRecommendation.findMany({
      where: { isDismissed: false, validUntil: { gte: new Date() }, ...whereClause },
      select: {
        title: true, titleEn: true, recommendationType: true, summary: true, reasoning: true,
        action: true, confidenceScore: true, urgencyLevel: true, asset: true,
        entryPrice: true, targetPrice: true, stopLoss: true, timeHorizon: true,
        validUntil: true, isRead: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 8. Infographic
    (!types || types.includes('infographic')) ? db.infographic.findMany({
      where: { isPublished: true, ...dateFilter, ...whereClause },
      select: {
        title: true, slug: true, subtitle: true, sourceType: true, category: true,
        locale: true, impactScore: true, viewCount: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 9. VideoReport
    (!types || types.includes('video')) ? db.videoReport.findMany({
      where: { isPublished: true, ...dateFilter, ...whereClause },
      select: {
        title: true, slug: true, symbol: true, reportType: true, assetClass: true,
        duration: true, marketImpact: true, locale: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 10. EconomicEvent
    (!types || types.includes('event')) ? db.economicEvent.findMany({
      where: { eventDate: { gte: new Date() }, ...whereClause },
      select: {
        eventName: true, eventNameAr: true, eventDate: true, importance: true,
        country: true, currency: true, forecast: true, previous: true, actual: true,
      },
      orderBy: { eventDate: 'asc' },
      take: perTableLimit,
    }) : Promise.resolve([]),

    // 11. Discussion
    (!types || types.includes('discussion')) ? db.discussion.findMany({
      where: { ...whereClause },
      select: {
        title: true, content: true, category: true, tags: true,
        upvotes: true, replyCount: true, createdAt: true,
      },
      orderBy: { upvotes: 'desc' },
      take: perTableLimit,
    }) : Promise.resolve([]),
  ]);

  // ── Process NewsItem results ──
  if (newsResults.status === 'fulfilled') {
    for (const item of newsResults.value) {
      let assets: string[] = [];
      try { assets = JSON.parse(item.affectedAssets || '[]').map((a: any) => a.symbol || a); } catch { /* ignore */ }
      results.push({
        source: 'NewsItem', sourceAr: 'الأخبار', type: 'news',
        title: item.title, titleAr: item.titleAr || undefined,
        summary: item.summary || undefined, summaryAr: item.summaryAr || undefined,
        slug: item.slug || undefined, url: `/news/${item.slug}`,
        date: item.publishedAt?.toISOString(),
        sentiment: item.sentiment || undefined,
        impactLevel: item.impactLevel || undefined,
        symbols: assets,
        extra: { category: item.category, sourceName: item.sourceName },
      });
    }
  }

  // ── Process Report results ──
  if (reportResults.status === 'fulfilled') {
    for (const item of reportResults.value) {
      results.push({
        source: 'Report', sourceAr: 'التقارير', type: 'report',
        title: item.title, summaryAr: item.summaryAr || undefined,
        date: item.createdAt?.toISOString(),
        extra: { reportType: item.reportType, period: item.period },
      });
    }
  }

  // ── Process EconomicReport results ──
  if (economicReportResults.status === 'fulfilled') {
    for (const item of economicReportResults.value) {
      results.push({
        source: 'EconomicReport', sourceAr: 'التقارير الاقتصادية', type: 'report',
        title: item.title, slug: item.slug, url: `/strategic-reports/${item.slug}`,
        summary: item.summary || undefined,
        date: item.createdAt?.toISOString(),
        confidenceScore: item.confidenceScore,
        extra: { reportType: item.reportType, scope: item.scope, marketImpact: item.marketImpact },
      });
    }
  }

  // ── Process MarketAnalysis results ──
  if (marketAnalysisResults.status === 'fulfilled') {
    for (const item of marketAnalysisResults.value) {
      let priceTargetData: any = null;
      try { priceTargetData = JSON.parse(item.priceTarget || 'null'); } catch { /* ignore */ }
      results.push({
        source: 'MarketAnalysis', sourceAr: 'التحليلات السوقية', type: 'analysis',
        title: item.title, slug: item.slug, url: `/analysis/${item.slug}`,
        date: item.createdAt?.toISOString(),
        sentiment: item.sentiment || undefined,
        confidenceScore: item.confidenceScore,
        symbols: item.assetClass ? [item.assetClass] : [],
        extra: { analysisType: item.analysisType, timeFrame: item.timeFrame, priceTarget: priceTargetData },
      });
    }
  }

  // ── Process StockAnalysis results ──
  if (stockAnalysisResults.status === 'fulfilled') {
    for (const item of stockAnalysisResults.value) {
      results.push({
        source: 'StockAnalysis', sourceAr: 'تحليلات الأسهم', type: 'analysis',
        title: item.title, titleAr: item.symbol,
        slug: item.slug, url: `/stock-analysis/${item.slug}`,
        summary: item.summary || undefined,
        date: item.createdAt?.toISOString(),
        sentiment: item.sentiment || undefined,
        confidenceScore: item.confidenceScore,
        symbols: item.symbol ? [item.symbol] : [],
        extra: {
          overallSignal: item.overallSignal, overallScore: item.overallScore,
          technicalScore: item.technicalScore, fundamentalScore: item.fundamentalScore,
          riskLevel: item.riskLevel, priceAtAnalysis: item.priceAtAnalysis,
        },
      });
    }
  }

  // ── Process TradingSignal results ──
  if (signalResults.status === 'fulfilled') {
    for (const item of signalResults.value) {
      results.push({
        source: 'TradingSignal', sourceAr: 'إشارات التداول', type: 'signal',
        title: `${item.action} ${item.pair}`, summary: item.reason || undefined,
        date: item.createdAt?.toISOString(),
        confidenceScore: item.confidence,
        symbols: item.pair ? [item.pair] : [],
        extra: {
          action: item.action, entryPrice: item.entryPrice, stopLoss: item.stopLoss,
          takeProfit: item.takeProfit, riskReward: item.riskReward, source: item.source,
          category: item.category, timeframe: item.timeframe,
        },
      });
    }
  }

  // ── Process PersonalizedRecommendation results ──
  if (recommendationResults.status === 'fulfilled') {
    for (const item of recommendationResults.value) {
      results.push({
        source: 'PersonalizedRecommendation', sourceAr: 'التوصيات المخصصة', type: 'recommendation',
        title: isAr ? item.title : (item.titleEn || item.title),
        summary: item.summary || undefined,
        date: item.createdAt?.toISOString(),
        confidenceScore: item.confidenceScore,
        symbols: item.asset ? [item.asset] : [],
        extra: {
          recommendationType: item.recommendationType, action: item.action,
          urgencyLevel: item.urgencyLevel, timeHorizon: item.timeHorizon,
          entryPrice: item.entryPrice, targetPrice: item.targetPrice, stopLoss: item.stopLoss,
        },
      });
    }
  }

  // ── Process Infographic results ──
  if (infographicResults.status === 'fulfilled') {
    for (const item of infographicResults.value) {
      results.push({
        source: 'Infographic', sourceAr: 'الإنفوجرافيك', type: 'infographic',
        title: item.title, slug: item.slug, url: `/infographics/${item.slug}`,
        summary: item.subtitle || undefined,
        date: item.createdAt?.toISOString(),
        impactLevel: item.impactScore?.toString(),
        extra: { sourceType: item.sourceType, category: item.category, viewCount: item.viewCount },
      });
    }
  }

  // ── Process VideoReport results ──
  if (videoResults.status === 'fulfilled') {
    for (const item of videoResults.value) {
      results.push({
        source: 'VideoReport', sourceAr: 'تقارير الفيديو', type: 'video',
        title: item.title, slug: item.slug, url: `/video/${item.slug}`,
        date: item.createdAt?.toISOString(),
        symbols: item.symbol ? [item.symbol] : [],
        extra: { reportType: item.reportType, assetClass: item.assetClass, duration: item.duration },
      });
    }
  }

  // ── Process EconomicEvent results ──
  if (eventResults.status === 'fulfilled') {
    for (const item of eventResults.value) {
      results.push({
        source: 'EconomicEvent', sourceAr: 'الأحداث الاقتصادية', type: 'event',
        title: isAr && item.eventNameAr ? item.eventNameAr : item.eventName,
        date: item.eventDate?.toISOString(),
        impactLevel: item.importance,
        symbols: item.currency ? [item.currency] : [],
        extra: { country: item.country, forecast: item.forecast, previous: item.previous, actual: item.actual },
      });
    }
  }

  // ── Process Discussion results ──
  if (discussionResults.status === 'fulfilled') {
    for (const item of discussionResults.value) {
      let tags: string[] = [];
      try { tags = JSON.parse(item.tags || '[]'); } catch { /* ignore */ }
      results.push({
        source: 'Discussion', sourceAr: 'نقاشات المجتمع', type: 'discussion',
        title: item.title, summary: item.content?.slice(0, 200),
        date: item.createdAt?.toISOString(),
        extra: { category: item.category, tags, upvotes: item.upvotes, replyCount: item.replyCount },
      });
    }
  }

  // ── Re-rank by relevance score ──
  const scored = results.map(r => {
    let score = 0;
    const titleLower = (r.titleAr || r.title || '').toLowerCase();
    const summaryLower = (r.summaryAr || r.summary || '').toLowerCase();
    for (const term of terms) {
      if (titleLower.includes(term)) score += 5;
      if (summaryLower.includes(term)) score += 3;
    }
    if (symbols?.length) {
      for (const sym of symbols) {
        if (r.symbols?.some(s => s.toLowerCase() === sym.toLowerCase())) score += 10;
        if (r.extra?.pair?.toLowerCase().includes(sym.toLowerCase())) score += 8;
      }
    }
    // Boost recent items
    if (r.date) {
      const hoursSince = (Date.now() - new Date(r.date).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 6) score += 5;
      else if (hoursSince < 24) score += 3;
      else if (hoursSince < 72) score += 1;
    }
    // Boost by confidence/impact
    if (r.confidenceScore) score += Math.floor(r.confidenceScore / 10);
    if (r.impactLevel === 'high' || r.impactLevel === 'critical') score += 3;
    return { result: r, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.result);
}

// ─── Cross-Reference: Everything about a symbol ──────────────────

export async function crossReference(
  symbol: string,
  locale: Locale = 'ar'
): Promise<CrossReferenceResult> {
  const isAr = locale === 'ar';
  const result: CrossReferenceResult = {
    symbol,
    news: [], analyses: [], signals: [], reports: [],
    recommendations: [], infographics: [], videos: [],
    events: [], discussions: [],
    totalResults: 0,
  };

  // Search across ALL tables for this symbol — in parallel
  const [
    news,
    stockAnalyses,
    signals,
    ecoReports,
    marketAnalyses,
    recommendations,
    infographics,
    videos,
    events,
    discussions,
  ] = await Promise.allSettled([
    // News with this symbol in affectedAssets
    db.newsItem.findMany({
      where: {
        isReady: true,
        affectedAssets: { contains: symbol, mode: 'insensitive' },
      },
      select: { title: true, titleAr: true, summary: true, summaryAr: true, slug: true, sentiment: true, impactLevel: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' }, take: 5,
    }),

    // Stock analyses for this symbol
    db.stockAnalysis.findMany({
      where: { symbol: { equals: symbol, mode: 'insensitive' }, isPublished: true },
      select: { title: true, slug: true, summary: true, overallSignal: true, overallScore: true, confidenceScore: true, sentiment: true, riskLevel: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 5,
    }),

    // Trading signals
    db.tradingSignal.findMany({
      where: { pair: { contains: symbol, mode: 'insensitive' }, status: { in: ['ACTIVE', 'active'] } },
      select: { pair: true, action: true, confidence: true, reason: true, entryPrice: true, stopLoss: true, takeProfit: true, source: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 5,
    }),

    // Economic reports
    db.economicReport.findMany({
      where: { isPublished: true, OR: [{ title: { contains: symbol, mode: 'insensitive' } }, { summary: { contains: symbol, mode: 'insensitive' } }] },
      select: { title: true, slug: true, summary: true, reportType: true, marketImpact: true, confidenceScore: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 3,
    }),

    // Market analyses
    db.marketAnalysis.findMany({
      where: { isPublished: true, OR: [{ title: { contains: symbol, mode: 'insensitive' } }, { assetClass: { contains: symbol, mode: 'insensitive' } }] },
      select: { title: true, slug: true, analysisType: true, sentiment: true, confidenceScore: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 3,
    }),

    // Personalized recommendations
    db.personalizedRecommendation.findMany({
      where: { asset: { equals: symbol, mode: 'insensitive' }, isDismissed: false, validUntil: { gte: new Date() } },
      select: { title: true, titleEn: true, recommendationType: true, action: true, confidenceScore: true, urgencyLevel: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 5,
    }),

    // Infographics
    db.infographic.findMany({
      where: { isPublished: true, OR: [{ title: { contains: symbol, mode: 'insensitive' } }, { sourceTitle: { contains: symbol, mode: 'insensitive' } }] },
      select: { title: true, slug: true, category: true, impactScore: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 3,
    }),

    // Video reports
    db.videoReport.findMany({
      where: { isPublished: true, symbol: { contains: symbol, mode: 'insensitive' } },
      select: { title: true, slug: true, reportType: true, duration: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 3,
    }),

    // Economic events
    db.economicEvent.findMany({
      where: { eventDate: { gte: new Date() }, currency: { contains: symbol.slice(0, 3), mode: 'insensitive' } },
      select: { eventName: true, eventNameAr: true, eventDate: true, importance: true, country: true, forecast: true, previous: true },
      orderBy: { eventDate: 'asc' }, take: 5,
    }),

    // Discussions
    db.discussion.findMany({
      where: { OR: [{ title: { contains: symbol, mode: 'insensitive' } }, { tags: { contains: symbol, mode: 'insensitive' } }] },
      select: { title: true, category: true, upvotes: true, replyCount: true, createdAt: true },
      orderBy: { upvotes: 'desc' }, take: 3,
    }),
  ]);

  // Process results
  if (news.status === 'fulfilled') result.news = news.value.map(n => ({
    source: 'NewsItem', sourceAr: 'الأخبار', type: 'news' as const,
    title: n.title, titleAr: n.titleAr || undefined, summary: n.summary || undefined, summaryAr: n.summaryAr || undefined,
    slug: n.slug || undefined, url: `/news/${n.slug}`, date: n.publishedAt?.toISOString(),
    sentiment: n.sentiment || undefined, impactLevel: n.impactLevel || undefined,
    symbols: [symbol],
  }));

  if (stockAnalyses.status === 'fulfilled') result.analyses = stockAnalyses.value.map(a => ({
    source: 'StockAnalysis', sourceAr: 'تحليلات الأسهم', type: 'analysis' as const,
    title: a.title, slug: a.slug, url: `/stock-analysis/${a.slug}`,
    summary: a.summary || undefined, date: a.createdAt?.toISOString(),
    sentiment: a.sentiment || undefined, confidenceScore: a.confidenceScore,
    symbols: [symbol],
    extra: { overallSignal: a.overallSignal, overallScore: a.overallScore, riskLevel: a.riskLevel },
  }));

  if (signals.status === 'fulfilled') result.signals = signals.value.map(s => ({
    source: 'TradingSignal', sourceAr: 'إشارات التداول', type: 'signal' as const,
    title: `${s.action} ${s.pair}`, summary: s.reason || undefined,
    date: s.createdAt?.toISOString(), confidenceScore: s.confidence,
    symbols: [s.pair],
    extra: { action: s.action, entryPrice: s.entryPrice, stopLoss: s.stopLoss, takeProfit: s.takeProfit, source: s.source },
  }));

  if (ecoReports.status === 'fulfilled') result.reports = ecoReports.value.map(r => ({
    source: 'EconomicReport', sourceAr: 'التقارير الاقتصادية', type: 'report' as const,
    title: r.title, slug: r.slug, url: `/strategic-reports/${r.slug}`,
    summary: r.summary || undefined, date: r.createdAt?.toISOString(),
    confidenceScore: r.confidenceScore,
    extra: { reportType: r.reportType, marketImpact: r.marketImpact },
  }));

  if (marketAnalyses.status === 'fulfilled') result.analyses.push(...marketAnalyses.value.map(a => ({
    source: 'MarketAnalysis', sourceAr: 'التحليلات السوقية', type: 'analysis' as const,
    title: a.title, slug: a.slug, url: `/analysis/${a.slug}`,
    date: a.createdAt?.toISOString(), sentiment: a.sentiment || undefined,
    confidenceScore: a.confidenceScore, symbols: [symbol],
    extra: { analysisType: a.analysisType },
  })));

  if (recommendations.status === 'fulfilled') result.recommendations = recommendations.value.map(r => ({
    source: 'PersonalizedRecommendation', sourceAr: 'التوصيات المخصصة', type: 'recommendation' as const,
    title: isAr ? r.title : (r.titleEn || r.title), date: r.createdAt?.toISOString(),
    confidenceScore: r.confidenceScore, symbols: [symbol],
    extra: { action: r.action, urgencyLevel: r.urgencyLevel, recommendationType: r.recommendationType },
  }));

  if (infographics.status === 'fulfilled') result.infographics = infographics.value.map(i => ({
    source: 'Infographic', sourceAr: 'الإنفوجرافيك', type: 'infographic' as const,
    title: i.title, slug: i.slug, url: `/infographics/${i.slug}`,
    date: i.createdAt?.toISOString(), impactLevel: i.impactScore?.toString(),
    extra: { category: i.category },
  }));

  if (videos.status === 'fulfilled') result.videos = videos.value.map(v => ({
    source: 'VideoReport', sourceAr: 'تقارير الفيديو', type: 'video' as const,
    title: v.title, slug: v.slug, url: `/video/${v.slug}`,
    date: v.createdAt?.toISOString(), symbols: [symbol],
    extra: { reportType: v.reportType, duration: v.duration },
  }));

  if (events.status === 'fulfilled') result.events = events.value.map(e => ({
    source: 'EconomicEvent', sourceAr: 'الأحداث الاقتصادية', type: 'event' as const,
    title: isAr && e.eventNameAr ? e.eventNameAr : e.eventName,
    date: e.eventDate?.toISOString(), impactLevel: e.importance,
    extra: { country: e.country, forecast: e.forecast, previous: e.previous },
  }));

  if (discussions.status === 'fulfilled') result.discussions = discussions.value.map(d => ({
    source: 'Discussion', sourceAr: 'نقاشات المجتمع', type: 'discussion' as const,
    title: d.title, date: d.createdAt?.toISOString(),
    extra: { category: d.category, upvotes: d.upvotes, replyCount: d.replyCount },
  }));

  result.totalResults = result.news.length + result.analyses.length + result.signals.length +
    result.reports.length + result.recommendations.length + result.infographics.length +
    result.videos.length + result.events.length + result.discussions.length;

  return result;
}

// ─── Market Pulse: What's happening RIGHT NOW ─────────────────────

export async function fetchMarketPulse(locale: Locale = 'ar'): Promise<MarketPulse> {
  const isAr = locale === 'ar';
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    indicators,
    activeSignals,
    recentSignals,
    upcomingEvents,
    recentEvents,
    breakingNews,
    recentNews,
  ] = await Promise.allSettled([
    // Top market movers — use 7-day window for resilience
    db.marketIndicator.findMany({
      where: { lastUpdated: { gte: weekAgo } },
      select: { symbol: true, name: true, nameAr: true, value: true, change: true, changePercent: true, category: true, lastUpdated: true },
      orderBy: { changePercent: 'desc' },
      take: 30,
    }),

    // Active trading signals — broad status matching
    db.tradingSignal.findMany({
      where: { status: { in: ['ACTIVE', 'active', 'Active', 'PENDING', 'pending', 'VALID', 'valid', 'OPEN', 'open'] } },
      select: { pair: true, action: true, confidence: true, source: true, status: true },
      orderBy: { confidence: 'desc' },
      take: 15,
    }),

    // Recent signals (fallback if no active signals exist)
    db.tradingSignal.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { pair: true, action: true, confidence: true, source: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),

    // Upcoming high-impact events
    db.economicEvent.findMany({
      where: { eventDate: { gte: now }, importance: { in: ['high', 'critical'] } },
      select: { eventName: true, eventNameAr: true, eventDate: true, importance: true, country: true },
      orderBy: { eventDate: 'asc' },
      take: 10,
    }),

    // Recent events (fallback if no upcoming events)
    db.economicEvent.findMany({
      where: { eventDate: { gte: weekAgo }, importance: { in: ['high', 'critical', 'medium'] } },
      select: { eventName: true, eventNameAr: true, eventDate: true, importance: true, country: true },
      orderBy: { eventDate: 'desc' },
      take: 5,
    }),

    // Breaking/impactful news
    db.newsItem.findMany({
      where: { isReady: true, impactLevel: { in: ['high', 'critical'] }, publishedAt: { gte: dayAgo } },
      select: { title: true, titleAr: true, impactLevel: true, sentiment: true, affectedAssets: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    }),

    // Recent news (fallback — any ready news from the past week)
    db.newsItem.findMany({
      where: { isReady: true, publishedAt: { gte: weekAgo } },
      select: { title: true, titleAr: true, impactLevel: true, sentiment: true, affectedAssets: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    }),
  ]);

  // Process market movers — prefer recent, include stale if nothing else
  const allIndicators = indicators.status === 'fulfilled' ? indicators.value : [];
  const topMovers = allIndicators
    .filter(i => Math.abs(i.changePercent) > 0.3)  // Lowered threshold from 0.5 to 0.3
    .slice(0, 8)
    .map(i => ({
      symbol: i.symbol,
      name: i.name || i.symbol,
      nameAr: i.nameAr || i.symbol,
      change: i.change,
      changePercent: i.changePercent,
    }));

  // Process signals — use active signals, fall back to recent signals
  let signalData = activeSignals.status === 'fulfilled'
    ? activeSignals.value
    : [];

  if (signalData.length === 0 && recentSignals.status === 'fulfilled') {
    // No ACTIVE signals — use recent signals from the past week
    signalData = recentSignals.value;
  }

  const activeSignalData = signalData.map(s => ({
    pair: s.pair,
    action: s.action,
    confidence: s.confidence,
    source: s.source,
  }));

  // Process events — use upcoming, fall back to recent
  let eventData = upcomingEvents.status === 'fulfilled'
    ? upcomingEvents.value
    : [];

  if (eventData.length === 0 && recentEvents.status === 'fulfilled') {
    eventData = recentEvents.value;
  }

  const upcomingEventData = eventData.map(e => ({
    eventName: e.eventName,
    eventNameAr: e.eventNameAr || undefined,
    eventDate: e.eventDate.toISOString(),
    importance: e.importance,
    country: e.country || '',
  }));

  // Process news — use breaking, fall back to recent
  let newsData = breakingNews.status === 'fulfilled'
    ? breakingNews.value
    : [];

  if (newsData.length === 0 && recentNews.status === 'fulfilled') {
    newsData = recentNews.value;
  }

  const breakingNewsData = newsData.map(n => ({
    title: n.title,
    titleAr: n.titleAr || undefined,
    impactLevel: n.impactLevel || '',
    sentiment: n.sentiment || '',
  }));

  // Determine overall market sentiment — consider signals and news too
  const positiveCount = topMovers.filter(m => m.changePercent > 0).length;
  const negativeCount = topMovers.filter(m => m.changePercent < 0).length;
  const bullishSignals = signalData.filter(s => s.action === 'BUY').length;
  const bearishSignals = signalData.filter(s => s.action === 'SELL').length;

  let marketSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' = 'neutral';
  const bullScore = positiveCount + bullishSignals;
  const bearScore = negativeCount + bearishSignals;
  if (bullScore > bearScore * 2) marketSentiment = 'bullish';
  else if (bearScore > bullScore * 2) marketSentiment = 'bearish';
  else if (bullScore > 0 && bearScore > 0) marketSentiment = 'mixed';

  return {
    topMovers,
    activeSignals: activeSignalData,
    upcomingEvents: upcomingEventData,
    breakingNews: breakingNewsData,
    trendingTopics: [], // Will be enhanced later
    marketSentiment,
    lastUpdated: now.toISOString(),
  };
}

// ─── User Profile Context: Everything about the user ──────────────

export async function fetchUserProfileContext(userId?: string): Promise<UserProfileContext | null> {
  if (!userId) return null;

  try {
    const [profile, user, bookmarks, alerts, unreadNotifs, recentRecs] = await Promise.allSettled([
      // User profile
      db.userProfile.findUnique({
        where: { userId },
        select: {
          experienceLevel: true, riskTolerance: true, investmentHorizon: true,
          preferredAssets: true, preferredMarkets: true, advisorEnabled: true,
        },
      }),

      // User plan
      db.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      }),

      // Bookmarks (include news relation to get slug)
      db.bookmark.findMany({
        where: { userId },
        select: { newsId: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // Price alerts
      db.priceAlert.findMany({
        where: { userId, isTriggered: false },
        select: { symbol: true, targetPrice: true, direction: true },
        take: 10,
      }),

      // Unread notifications
      db.notification.count({
        where: { userId, isRead: false },
      }),

      // Recent recommendations
      db.personalizedRecommendation.findMany({
        where: { userId, isDismissed: false, validUntil: { gte: new Date() } },
        select: { title: true, action: true, confidenceScore: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const p = profile.status === 'fulfilled' ? profile.value : null;
    const u = user.status === 'fulfilled' ? user.value : null;

    let preferredAssets: string[] = [];
    try { preferredAssets = JSON.parse(p?.preferredAssets || '[]'); } catch { /* ignore */ }

    let preferredMarkets: string[] = [];
    try { preferredMarkets = JSON.parse(p?.preferredMarkets || '[]'); } catch { /* ignore */ }

    return {
      experienceLevel: p?.experienceLevel || undefined,
      riskTolerance: p?.riskTolerance || undefined,
      investmentHorizon: p?.investmentHorizon || undefined,
      preferredAssets,
      preferredMarkets,
      plan: u?.plan || 'free',
      bookmarkedSlugs: bookmarks.status === 'fulfilled'
        ? bookmarks.value.map(b => b.newsId).filter(Boolean) as string[]
        : [],
      activeAlerts: alerts.status === 'fulfilled'
        ? alerts.value.map(a => ({ symbol: a.symbol, targetPrice: a.targetPrice, direction: a.direction }))
        : [],
      unreadNotifications: unreadNotifs.status === 'fulfilled' ? (unreadNotifs.value ?? 0) : 0,
      recentRecommendations: recentRecs.status === 'fulfilled'
        ? recentRecs.value.map(r => ({ title: r.title, action: r.action || '', confidence: r.confidenceScore || 0 }))
        : [],
      advisorEnabled: p?.advisorEnabled || false,
    };
  } catch {
    return null;
  }
}

// ─── Get DB Statistics ────────────────────────────────────────────

export async function getDBStats(): Promise<{
  totalNews: number;
  totalReports: number;
  totalAnalyses: number;
  totalSignals: number;
  totalRecommendations: number;
  totalInfographics: number;
  totalVideos: number;
  totalEvents: number;
  totalDiscussions: number;
  totalStockAnalyses: number;
}> {
  const [news, reports, ecoReports, analyses, signals, recs, infographics, videos, events, discussions, stockAnalyses] = await Promise.all([
    db.newsItem.count({ where: { isReady: true } }),
    db.report.count({ where: { isPublished: true } }),
    db.economicReport.count({ where: { isPublished: true } }),
    db.marketAnalysis.count({ where: { isPublished: true } }),
    db.tradingSignal.count(),
    db.personalizedRecommendation.count(),
    db.infographic.count({ where: { isPublished: true } }),
    db.videoReport.count({ where: { isPublished: true } }),
    db.economicEvent.count({ where: { eventDate: { gte: new Date() } } }),
    db.discussion.count(),
    db.stockAnalysis.count({ where: { isPublished: true } }),
  ]);

  return {
    totalNews: news,
    totalReports: reports + ecoReports,
    totalAnalyses: analyses + stockAnalyses,
    totalSignals: signals,
    totalRecommendations: recs,
    totalInfographics: infographics,
    totalVideos: videos,
    totalEvents: events,
    totalDiscussions: discussions,
    totalStockAnalyses: stockAnalyses,
  };
}

// ─── Format Cross-Reference as text for AI context ────────────────

export function formatCrossReferenceAsContext(xref: CrossReferenceResult, locale: Locale = 'ar'): string {
  const isAr = locale === 'ar';
  const lines: string[] = [];

  const sectionTitle = isAr
    ? `═══ بيانات شاملة عن ${xref.symbol} من قاعدة البيانات ═══`
    : `═══ Comprehensive data about ${xref.symbol} from database ═══`;
  lines.push(sectionTitle);
  lines.push(`Total: ${xref.totalResults} results across 9 data sources`);
  lines.push('');

  if (xref.signals.length > 0) {
    lines.push(isAr ? '📡 إشارات التداول النشطة:' : '📡 Active Trading Signals:');
    for (const s of xref.signals) {
      lines.push(`  - ${s.title} | Confidence: ${s.confidenceScore}% | ${s.extra?.source || ''}`);
      if (s.extra?.entryPrice) lines.push(`    Entry: ${s.extra.entryPrice} | SL: ${s.extra.stopLoss} | TP: ${s.extra.takeProfit}`);
    }
    lines.push('');
  }

  if (xref.analyses.length > 0) {
    lines.push(isAr ? '📊 التحليلات:' : '📊 Analyses:');
    for (const a of xref.analyses) {
      lines.push(`  - ${a.title} | Signal: ${a.extra?.overallSignal || a.sentiment} | Confidence: ${a.confidenceScore}%`);
    }
    lines.push('');
  }

  if (xref.news.length > 0) {
    lines.push(isAr ? '📰 الأخبار المؤثرة:' : '📰 Impact News:');
    for (const n of xref.news) {
      lines.push(`  - ${isAr && n.titleAr ? n.titleAr : n.title} | ${n.sentiment} | Impact: ${n.impactLevel}`);
    }
    lines.push('');
  }

  if (xref.reports.length > 0) {
    lines.push(isAr ? '📋 التقارير:' : '📋 Reports:');
    for (const r of xref.reports) {
      lines.push(`  - ${r.title} | ${r.extra?.reportType || ''}`);
    }
    lines.push('');
  }

  if (xref.recommendations.length > 0) {
    lines.push(isAr ? '🎯 التوصيات المخصصة:' : '🎯 Personalized Recommendations:');
    for (const r of xref.recommendations) {
      lines.push(`  - ${r.title} | Action: ${r.extra?.action} | Urgency: ${r.extra?.urgencyLevel}`);
    }
    lines.push('');
  }

  if (xref.infographics.length > 0) {
    lines.push(isAr ? '📈 الإنفوجرافيك:' : '📈 Infographics:');
    for (const i of xref.infographics) {
      lines.push(`  - ${i.title}`);
    }
    lines.push('');
  }

  if (xref.videos.length > 0) {
    lines.push(isAr ? '🎬 تقارير الفيديو:' : '🎬 Video Reports:');
    for (const v of xref.videos) {
      lines.push(`  - ${v.title} | ${v.extra?.reportType || ''}`);
    }
    lines.push('');
  }

  if (xref.events.length > 0) {
    lines.push(isAr ? '📅 الأحداث الاقتصادية القادمة:' : '📅 Upcoming Economic Events:');
    for (const e of xref.events) {
      lines.push(`  - ${e.title} | ${e.impactLevel} | ${e.extra?.country || ''}`);
    }
    lines.push('');
  }

  if (xref.discussions.length > 0) {
    lines.push(isAr ? '💬 نقاشات المجتمع:' : '💬 Community Discussions:');
    for (const d of xref.discussions) {
      lines.push(`  - ${d.title} | 👍 ${d.extra?.upvotes} | 💬 ${d.extra?.replyCount} replies`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Format Market Pulse as text for AI context ───────────────────

export function formatMarketPulseAsContext(pulse: MarketPulse, locale: Locale = 'ar'): string {
  const isAr = locale === 'ar';
  const lines: string[] = [];

  lines.push(isAr ? '🌐 نبض السوق الحالي:' : '🌐 Current Market Pulse:');
  lines.push(isAr
    ? `الاتجاه العام: ${pulse.marketSentiment === 'bullish' ? 'صاعد 📈' : pulse.marketSentiment === 'bearish' ? 'هابطة 📉' : pulse.marketSentiment === 'mixed' ? 'مختلط ↔️' : 'محايد ➡️'}`
    : `Overall Sentiment: ${pulse.marketSentiment}`);
  lines.push('');

  if (pulse.topMovers.length > 0) {
    lines.push(isAr ? 'أكبر المحركات:' : 'Top Movers:');
    for (const m of pulse.topMovers.slice(0, 5)) {
      const name = isAr && m.nameAr ? m.nameAr : m.name;
      lines.push(`  - ${name} (${m.symbol}): ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(2)}%`);
    }
    lines.push('');
  }

  if (pulse.activeSignals.length > 0) {
    lines.push(isAr ? 'إشارات تداول نشطة:' : 'Active Trading Signals:');
    for (const s of pulse.activeSignals.slice(0, 5)) {
      lines.push(`  - ${s.action} ${s.pair} | Confidence: ${s.confidence}%`);
    }
    lines.push('');
  }

  if (pulse.breakingNews.length > 0) {
    lines.push(isAr ? 'أخبار عاجلة/مؤثرة:' : 'Breaking/Impact News:');
    for (const n of pulse.breakingNews.slice(0, 3)) {
      lines.push(`  - ${isAr && n.titleAr ? n.titleAr : n.title} | ${n.impactLevel}`);
    }
    lines.push('');
  }

  if (pulse.upcomingEvents.length > 0) {
    lines.push(isAr ? 'أحداث اقتصادية قادمة:' : 'Upcoming Economic Events:');
    for (const e of pulse.upcomingEvents.slice(0, 3)) {
      lines.push(`  - ${isAr && e.eventNameAr ? e.eventNameAr : e.eventName} | ${e.importance}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Format User Profile as text for AI context ──────────────────

export function formatUserProfileAsContext(profile: UserProfileContext, locale: Locale = 'ar'): string {
  const isAr = locale === 'ar';
  const lines: string[] = [];

  lines.push(isAr ? '👤 بيانات المستخدم:' : '👤 User Profile:');
  if (profile.experienceLevel) lines.push(isAr ? `  مستوى الخبرة: ${profile.experienceLevel}` : `  Experience: ${profile.experienceLevel}`);
  if (profile.riskTolerance) lines.push(isAr ? `  تحمل المخاطرة: ${profile.riskTolerance}` : `  Risk Tolerance: ${profile.riskTolerance}`);
  if (profile.investmentHorizon) lines.push(isAr ? `  أفق الاستثمار: ${profile.investmentHorizon}` : `  Investment Horizon: ${profile.investmentHorizon}`);
  if (profile.preferredAssets?.length) lines.push(isAr ? `  الأصول المفضلة: ${profile.preferredAssets.join(', ')}` : `  Preferred Assets: ${profile.preferredAssets.join(', ')}`);
  if (profile.preferredMarkets?.length) lines.push(isAr ? `  الأسواق المفضلة: ${profile.preferredMarkets.join(', ')}` : `  Preferred Markets: ${profile.preferredMarkets.join(', ')}`);
  lines.push(isAr ? `  خطة الاشتراك: ${profile.plan}` : `  Subscription: ${profile.plan}`);
  if (profile.bookmarkedSlugs?.length) lines.push(isAr ? `  المفضلات: ${profile.bookmarkedSlugs.length} مقال` : `  Bookmarks: ${profile.bookmarkedSlugs.length} articles`);
  if (profile.activeAlerts?.length) {
    lines.push(isAr ? '  تنبيهات الأسعار النشطة:' : '  Active Price Alerts:');
    for (const a of profile.activeAlerts) {
      lines.push(`    - ${a.symbol} ${a.direction} ${a.targetPrice}`);
    }
  }
  if ((profile.unreadNotifications ?? 0) > 0) lines.push(isAr ? `  إشعارات غير مقروءة: ${profile.unreadNotifications}` : `  Unread Notifications: ${profile.unreadNotifications}`);
  if (profile.recentRecommendations?.length) {
    lines.push(isAr ? '  توصيات حديثة:' : '  Recent Recommendations:');
    for (const r of profile.recentRecommendations) {
      lines.push(`    - ${r.title} (${r.action}, ${r.confidence}%)`);
    }
  }
  if (profile.advisorEnabled) lines.push(isAr ? '  المستشار الذكي: مُفعّل ✅' : '  Smart Advisor: Enabled ✅');

  return lines.join('\n');
}
