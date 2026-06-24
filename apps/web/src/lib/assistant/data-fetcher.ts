// ─── Data Fetcher ────────────────────────────────────────────────
// RAG-Omega Architecture: Pre-emptively fetches ALL relevant data
// from the database BASED ON the classified intent.
// This runs BEFORE any AI call, in parallel, typically < 1 second.
// Like how a human researcher gathers all materials before writing.

import { db } from '@/lib/db';
import type { Locale } from './tools';
import type { IntentClassification, DetectedAsset, DataNeeds } from './intent-classifier';
import {
  searchKnowledge,
  crossReference,
  fetchMarketPulse,
  fetchUserProfileContext,
  formatCrossReferenceAsContext,
  formatMarketPulseAsContext,
  formatUserProfileAsContext,
  type MarketPulse,
  type UserProfileContext,
} from './db-knowledge';

// ─── Fetched Data Bundle ─────────────────────────────────────────

export interface FetchedData {
  // Raw data
  prices: PriceData[];
  signals: SignalData[];
  analyses: AnalysisData[];
  news: NewsData[];
  reports: ReportData[];
  marketPulse: MarketPulse | null;
  crossReference: string | null;      // formatted text
  knowledgeResults: string | null;     // formatted text
  userProfile: UserProfileContext | null;
  
  // Metadata
  fetchTimeMs: number;
  dataPoints: number;                  // total data points fetched
  sources: string[];                   // data source names
  
  // Formatted context for AI (pre-built to avoid redundant work)
  contextForAI: string;               // all data formatted as context text
  
  // Raw data for response filter (numbers we can verify)
  knownNumbers: Set<string>;          // all numbers from DB data
}

export interface PriceData {
  symbol: string;
  name: string;
  nameAr: string;
  value: number;
  changePercent: number;
  category: string;
  lastUpdated: Date | null;
  isStale: boolean;
}

export interface SignalData {
  pair: string;
  action: string;
  confidence: number;
  reason: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  source: string | null;
  category: string | null;
  timeframe: string | null;
  status: string;
  createdAt: Date | null;
  type: 'signal' | 'recommendation' | 'council';
}

export interface AnalysisData {
  title: string;
  slug: string;
  symbol: string | null;
  analysisType: string | null;
  overallSignal: string | null;
  overallScore: number | null;
  confidenceScore: number | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  sentiment: string | null;
  priceAtAnalysis: number | null;
  riskLevel: string | null;
  summary: string | null;
  createdAt: Date | null;
  source: 'stock' | 'market';
}

export interface NewsData {
  title: string;
  titleAr: string | null;
  summary: string | null;
  summaryAr: string | null;
  slug: string | null;
  sentiment: string | null;
  impactLevel: string | null;
  affectedAssets: string | null;
  category: string | null;
  publishedAt: Date | null;
  sourceName: string | null;
  locale?: string | null;           // V700: original language of the news item
  needsTranslation?: boolean;       // V700: true if title/summary not in user's language
}

export interface ReportData {
  title: string;
  slug: string;
  summary: string | null;
  reportType: string | null;
  scope: string | null;
  marketImpact: string | null;
  confidenceScore: number | null;
  publishedAt: Date | null;
  source: 'economic' | 'market';
}

// ─── Symbol to DB symbol mapping ─────────────────────────────────

const SYMBOL_TO_DB: Record<string, string[]> = {
  'BTCUSD': ['BTC', 'BTCUSD'],
  'ETHUSD': ['ETH', 'ETHUSD'],
  'SOLUSD': ['SOL', 'SOLUSD'],
  'XAUUSD': ['XAU', 'XAUUSD'],
  'XAGUSD': ['XAG', 'XAGUSD'],
  'CL': ['WTI', 'CL', 'BRENT'],
  'BZ': ['BRENT', 'BZ'],
  'EURUSD': ['EURUSD', 'EUR'],
  'GBPUSD': ['GBPUSD', 'GBP'],
  'USDJPY': ['USDJPY', 'JPY'],
  'USDCHF': ['USDCHF', 'CHF'],
  'AUDUSD': ['AUDUSD', 'AUD'],
  'FOREX_MOVERS': ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD'],
  'SPX': ['SPX'],
  'NDX': ['NDX', 'QQQ'],          // V1015: NDX + QQQ ETF fallback
  'DJI': ['DJI', 'DIA'],          // V1015: DJI + DIA ETF fallback
  'DXY': ['DXY'],
  'FTSE': ['FTSE', '^FTSE'],      // V1015: FTSE 100 London
  'NKY': ['NKY', '^N225'],        // V1015: Nikkei 225 Japan
  'DAX': ['DAX', '^GDAXI'],       // V1015: DAX Germany
  'CAC': ['CAC', '^FCHI'],        // V1015: CAC 40 France
  'HSI': ['HSI', '^HSI'],         // V1015: Hang Seng HK
};

// ─── Staleness threshold ─────────────────────────────────────────
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Main Fetch Function ─────────────────────────────────────────

export async function fetchRelevantData(
  classification: IntentClassification,
  locale: Locale,
  userId?: string,
): Promise<FetchedData> {
  const startTime = Date.now();
  const { dataNeeds, assets } = classification;
  const isAr = locale === 'ar';
  const sources: string[] = [];
  const knownNumbers = new Set<string>();
  
  // Build list of DB symbols to search for prices
  const dbSymbols = new Set<string>();
  for (const asset of assets) {
    const syms = SYMBOL_TO_DB[asset.symbol];
    if (syms) syms.forEach(s => dbSymbols.add(s));
    else dbSymbols.add(asset.symbol);
  }
  // Always add major symbols for market context
  if (dataNeeds.prices && dbSymbols.size === 0) {
    ['BTC', 'XAU', 'ETH', 'WTI', 'EURUSD'].forEach(s => dbSymbols.add(s));
  }

  // V1015: Always include major US indices (SPX, NDX, DJI) when prices are needed.
  // Previously, when the user asked about "stocks" or "recommendations" generally,
  // the assistant fetched individual stock signals but NOT the market indices —
  // so the response's market-overview table showed "—" for Nasdaq and Dow Jones.
  // Now we always add SPX/NDX/DJI so the AI has full market context to report.
  if (dataNeeds.prices) {
    ['SPX', 'NDX', 'DJI', 'DXY'].forEach(s => dbSymbols.add(s));
  }
  
  // ── Launch ALL fetches in parallel ──
  const [
    priceResult,
    signalResult,
    analysisResult,
    newsResult,
    reportResult,
    pulseResult,
    xrefResult,
    knowledgeResult,
    userProfileResult,
  ] = await Promise.allSettled([
    // 1. Prices
    dataNeeds.prices ? fetchPrices([...dbSymbols]) : Promise.resolve([]),
    // 2. Signals
    dataNeeds.signals ? fetchSignals(assets) : Promise.resolve([]),
    // 3. Analyses
    dataNeeds.analysis ? fetchAnalyses(assets) : Promise.resolve([]),
    // 4. News
    dataNeeds.news ? fetchNews(classification.originalQuery, assets, locale) : Promise.resolve([]),
    // 5. Reports
    dataNeeds.reports ? fetchReports(locale) : Promise.resolve([]),
    // 6. Market Pulse
    dataNeeds.marketPulse ? fetchMarketPulse(locale).catch(() => null) : Promise.resolve(null),
    // 7. Cross-reference
    dataNeeds.crossReference && assets.length > 0
      ? fetchCrossRef(assets, locale)
      : Promise.resolve(null),
    // 8. Knowledge search
    dataNeeds.knowledgeSearch
      ? fetchKnowledge(classification.originalQuery, locale)
      : Promise.resolve(null),
    // 9. User profile
    dataNeeds.userProfile && userId
      ? fetchUserProfileContext(userId).catch(() => null)
      : Promise.resolve(null),
  ]);
  
  // ── Extract results (settled = never throws) ──
  const prices = settledValue(priceResult, []);
  const signals = settledValue(signalResult, []);
  const analyses = settledValue(analysisResult, []);
  const news = settledValue(newsResult, []);
  const reports = settledValue(reportResult, []);
  const pulse = settledValue(pulseResult, null);
  const xref = settledValue(xrefResult, null);
  const knowledge = settledValue(knowledgeResult, null);
  const userProfile = settledValue(userProfileResult, null);
  
  // ── Collect sources ──
  if (prices.length > 0) sources.push(isAr ? 'أسعار السوق' : 'Market Prices');
  if (signals.length > 0) sources.push(isAr ? 'إشارات التداول' : 'Trading Signals');
  if (analyses.length > 0) sources.push(isAr ? 'التحليلات' : 'Analyses');
  if (news.length > 0) sources.push(isAr ? 'الأخبار' : 'News');
  if (reports.length > 0) sources.push(isAr ? 'التقارير' : 'Reports');
  if (pulse) sources.push(isAr ? 'نبض السوق' : 'Market Pulse');
  if (xref) sources.push(isAr ? 'إحالة متقاطعة' : 'Cross-reference');
  if (knowledge) sources.push(isAr ? 'قاعدة المعرفة' : 'Knowledge Base');
  if (userProfile) sources.push(isAr ? 'بيانات المستخدم' : 'User Profile');
  
  // ── Collect all known numbers for hallucination filter ──
  for (const p of prices) {
    knownNumbers.add(p.value.toString());
    knownNumbers.add(p.changePercent.toFixed(2));
  }
  for (const s of signals) {
    if (s.entryPrice) knownNumbers.add(s.entryPrice.toString());
    if (s.stopLoss) knownNumbers.add(s.stopLoss.toString());
    if (s.takeProfit) knownNumbers.add(s.takeProfit.toString());
    if (s.confidence) knownNumbers.add(s.confidence.toString());
  }
  for (const a of analyses) {
    if (a.overallScore) knownNumbers.add(a.overallScore.toString());
    if (a.confidenceScore) knownNumbers.add(a.confidenceScore.toString());
    if (a.priceAtAnalysis) knownNumbers.add(a.priceAtAnalysis.toString());
  }
  
  // ── Build formatted context for AI ──
  const contextForAI = buildContextForAI(
    { prices, signals, analyses, news, reports, pulse, xref, knowledge, userProfile },
    classification,
    locale,
  );
  
  const fetchTimeMs = Date.now() - startTime;
  const dataPoints = prices.length + signals.length + analyses.length + news.length + reports.length;
  
  return {
    prices,
    signals,
    analyses,
    news,
    reports,
    marketPulse: pulse,
    crossReference: xref,
    knowledgeResults: knowledge,
    userProfile,
    fetchTimeMs,
    dataPoints,
    sources,
    contextForAI,
    knownNumbers,
  };
}

// ─── Individual Fetch Functions ───────────────────────────────────

async function fetchPrices(symbols: string[]): Promise<PriceData[]> {
  if (symbols.length === 0) return [];
  try {
    const now = Date.now();
    const indicators = await db.marketIndicator.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true, name: true, nameAr: true, value: true,
        changePercent: true, category: true, lastUpdated: true,
      },
      take: 20,
    });
    return indicators.map(i => ({
      symbol: i.symbol,
      name: i.name,
      nameAr: i.nameAr || i.name,
      value: i.value,
      changePercent: i.changePercent,
      category: i.category,
      lastUpdated: i.lastUpdated,
      isStale: !i.lastUpdated || (now - i.lastUpdated.getTime()) > STALE_THRESHOLD_MS,
    }));
  } catch {
    return [];
  }
}

async function fetchSignals(assets: DetectedAsset[]): Promise<SignalData[]> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Fetch trading signals
    const [tradingSignals, recommendations, councilBriefs] = await Promise.allSettled([
      db.tradingSignal.findMany({
        where: {
          OR: [
            { status: { in: ['ACTIVE', 'active', 'Active', 'PENDING', 'pending', 'VALID', 'valid', 'OPEN', 'open'] } },
            { createdAt: { gte: weekAgo } },
          ],
        },
        select: {
          pair: true, action: true, confidence: true, reason: true,
          entryPrice: true, stopLoss: true, takeProfit: true, riskReward: true,
          source: true, category: true, timeframe: true, status: true,
          createdAt: true,
        },
        orderBy: { confidence: 'desc' },
        take: 20,
      }),
      db.personalizedRecommendation.findMany({
        where: {
          isDismissed: false,
          OR: [
            { validUntil: { gte: new Date() } },
            { createdAt: { gte: weekAgo } },
          ],
        },
        select: {
          title: true, titleEn: true, recommendationType: true, summary: true,
          action: true, confidenceScore: true, urgencyLevel: true, asset: true,
          entryPrice: true, targetPrice: true, stopLoss: true, timeHorizon: true,
          validUntil: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      db.councilBrief.findMany({
        where: {
          reviewStatus: 'approved',
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
        select: {
          pair: true, direction: true, entryPrice: true, stopLoss: true,
          takeProfit: true, confidence: true, timeframe: true, consensusJson: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    
    const results: SignalData[] = [];
    
    // Map trading signals
    for (const s of settledValue(tradingSignals, [])) {
      results.push({
        pair: s.pair, action: s.action, confidence: s.confidence,
        reason: s.reason, entryPrice: s.entryPrice, stopLoss: s.stopLoss,
        takeProfit: s.takeProfit, riskReward: s.riskReward, source: s.source,
        category: s.category, timeframe: s.timeframe, status: s.status,
        createdAt: s.createdAt, type: 'signal',
      });
    }
    
    // Map recommendations
    for (const r of settledValue(recommendations, [])) {
      results.push({
        pair: r.asset || r.title, action: r.action || 'HOLD',
        confidence: r.confidenceScore || 50, reason: r.summary,
        entryPrice: typeof r.entryPrice === 'number' ? r.entryPrice : (r.entryPrice ? parseFloat(String(r.entryPrice)) : null),
        stopLoss: typeof r.stopLoss === 'number' ? r.stopLoss : (r.stopLoss ? parseFloat(String(r.stopLoss)) : null),
        takeProfit: typeof r.targetPrice === 'number' ? r.targetPrice : (r.targetPrice ? parseFloat(String(r.targetPrice)) : null),
        riskReward: null, source: 'AI Recommendation',
        category: r.recommendationType, timeframe: r.timeHorizon,
        status: 'RECOMMENDATION', createdAt: r.createdAt, type: 'recommendation',
      });
    }
    
    // Map council briefs
    for (const b of settledValue(councilBriefs, [])) {
      results.push({
        pair: b.pair, action: b.direction || 'NEUTRAL',
        confidence: b.confidence, reason: null,
        entryPrice: b.entryPrice, stopLoss: b.stopLoss,
        takeProfit: b.takeProfit, riskReward: null, source: 'AI Council',
        category: 'council', timeframe: b.timeframe,
        status: 'COUNCIL', createdAt: b.createdAt, type: 'council',
      });
    }
    
    return results;
  } catch {
    return [];
  }
}

async function fetchAnalyses(assets: DetectedAsset[]): Promise<AnalysisData[]> {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    
    // If specific assets mentioned, filter by their symbols
    const assetSymbols = assets.map(a => a.shortSymbol).filter(Boolean);
    const stockWhere = assetSymbols.length > 0
      ? { isPublished: true, createdAt: { gte: twoWeeksAgo }, symbol: { in: assetSymbols } }
      : { isPublished: true, createdAt: { gte: twoWeeksAgo } };
    
    const [stockAnalyses, marketAnalyses] = await Promise.allSettled([
      db.stockAnalysis.findMany({
        where: stockWhere,
        select: {
          title: true, slug: true, symbol: true, summary: true, analysisType: true,
          overallSignal: true, overallScore: true, confidenceScore: true,
          technicalScore: true, fundamentalScore: true, sentiment: true,
          priceAtAnalysis: true, riskLevel: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.marketAnalysis.findMany({
        where: { isPublished: true, createdAt: { gte: twoWeeksAgo } },
        select: {
          title: true, slug: true, assetClass: true, analysisType: true, sentiment: true,
          confidenceScore: true, riskLevel: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    
    const results: AnalysisData[] = [];
    
    for (const a of settledValue(stockAnalyses, [])) {
      results.push({
        title: a.title, slug: a.slug, symbol: a.symbol,
        analysisType: a.analysisType, overallSignal: a.overallSignal,
        overallScore: a.overallScore, confidenceScore: a.confidenceScore,
        technicalScore: a.technicalScore, fundamentalScore: a.fundamentalScore,
        sentiment: a.sentiment, priceAtAnalysis: a.priceAtAnalysis,
        riskLevel: a.riskLevel, summary: a.summary,
        createdAt: a.createdAt, source: 'stock',
      });
    }
    
    for (const a of settledValue(marketAnalyses, [])) {
      results.push({
        title: a.title, slug: a.slug, symbol: a.assetClass,
        analysisType: a.analysisType, overallSignal: a.sentiment,
        overallScore: a.confidenceScore, confidenceScore: a.confidenceScore,
        technicalScore: null, fundamentalScore: null,
        sentiment: a.sentiment, priceAtAnalysis: null,
        riskLevel: a.riskLevel, summary: null,
        createdAt: a.createdAt, source: 'market',
      });
    }
    
    return results;
  } catch {
    return [];
  }
}

async function fetchNews(query: string, assets: DetectedAsset[], locale: Locale): Promise<NewsData[]> {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    // Build asset tag filter
    const assetTags: string[] = [];
    for (const asset of assets) {
      assetTags.push(asset.shortSymbol);
      assetTags.push(asset.nameEn);
      assetTags.push(asset.nameAr);
    }
    
    // V700: Fetch TWO batches — one matching user's locale, one general
    // This ensures we always prioritize news the user can actually read
    
    const assetFilter = assetTags.length > 0
      ? assetTags.map(tag => ({ affectedAssets: { contains: tag } }))
      : [];
    
    // Batch 1: News in user's locale (PRIORITY)
    const localeWhere: any = {
      isReady: true,
      createdAt: { gte: threeDaysAgo },
      locale: { in: [locale, 'ar'] },  // Prioritize user's locale + Arabic
    };
    if (assetFilter.length > 0) localeWhere.OR = assetFilter;
    
    // Batch 2: All news matching assets (FALLBACK, limited)
    const generalWhere: any = {
      isReady: true,
      createdAt: { gte: threeDaysAgo },
    };
    if (assetFilter.length > 0) generalWhere.OR = assetFilter;
    
    const [localeNews, generalNews] = await Promise.allSettled([
      db.newsItem.findMany({
        where: localeWhere,
        select: {
          title: true, titleAr: true, summary: true, summaryAr: true, slug: true,
          sentiment: true, impactLevel: true, affectedAssets: true, category: true,
          publishedAt: true, sourceName: true, locale: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 15,
      }),
      db.newsItem.findMany({
        where: generalWhere,
        select: {
          title: true, titleAr: true, summary: true, summaryAr: true, slug: true,
          sentiment: true, impactLevel: true, affectedAssets: true, category: true,
          publishedAt: true, sourceName: true, locale: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 15,
      }),
    ]);
    
    // V700: Merge results — locale-matched first, then fill with general
    // Deduplicate by slug
    const seenSlugs = new Set<string>();
    const merged: NewsData[] = [];
    
    // Add locale-priority news first
    for (const n of settledValue(localeNews, [])) {
      if (n.slug && seenSlugs.has(n.slug)) continue;
      if (n.slug) seenSlugs.add(n.slug);
      merged.push(mapNewsItem(n));
    }
    
    // V700: Keep ALL news — flag non-Arabic items for AI translation
    const isAr = locale === 'ar';
    for (const n of settledValue(generalNews, [])) {
      if (merged.length >= 20) break;
      if (n.slug && seenSlugs.has(n.slug)) continue;
      if (n.slug) seenSlugs.add(n.slug);
      const item = mapNewsItem(n);
      // Flag items that aren't in the user's language and lack translation
      if (isAr && !n.titleAr && !n.summaryAr && n.locale !== 'ar') {
        item.needsTranslation = true;
      }
      merged.push(item);
    }
    
    return merged;
  } catch {
    return [];
  }
}

function mapNewsItem(n: any): NewsData {
  return {
    title: n.title,
    titleAr: n.titleAr,
    summary: n.summary,
    summaryAr: n.summaryAr,
    slug: n.slug,
    sentiment: n.sentiment,
    impactLevel: n.impactLevel,
    affectedAssets: n.affectedAssets,
    category: n.category,
    publishedAt: n.publishedAt,
    sourceName: n.sourceName,
    locale: n.locale,
    needsTranslation: false,  // caller will set this if needed
  };
}

async function fetchReports(locale: Locale): Promise<ReportData[]> {
  try {
    const [economicReports, marketAnalyses] = await Promise.allSettled([
      db.economicReport.findMany({
        where: { isPublished: true, locale: { in: [locale, 'ar'] } },
        select: {
          title: true, slug: true, summary: true, reportType: true, scope: true,
          marketImpact: true, confidenceScore: true, publishedAt: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      }),
      db.marketAnalysis.findMany({
        where: { isPublished: true, locale: { in: [locale, 'ar'] } },
        select: {
          title: true, slug: true, assetClass: true, analysisType: true,
          sentiment: true, confidenceScore: true, riskLevel: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    
    const results: ReportData[] = [];
    
    for (const r of settledValue(economicReports, [])) {
      results.push({
        title: r.title, slug: r.slug, summary: r.summary,
        reportType: r.reportType, scope: r.scope,
        marketImpact: r.marketImpact, confidenceScore: r.confidenceScore,
        publishedAt: r.publishedAt, source: 'economic',
      });
    }
    
    for (const a of settledValue(marketAnalyses, [])) {
      results.push({
        title: a.title, slug: a.slug, summary: null,
        reportType: a.analysisType, scope: a.assetClass,
        marketImpact: a.sentiment, confidenceScore: a.confidenceScore,
        publishedAt: a.createdAt, source: 'market',
      });
    }
    
    return results;
  } catch {
    return [];
  }
}

async function fetchCrossRef(assets: DetectedAsset[], locale: Locale): Promise<string | null> {
  try {
    // Cross-reference for the primary asset
    const primaryAsset = assets[0];
    if (!primaryAsset) return null;
    
    const xref = await crossReference(primaryAsset.symbol, locale);
    if (xref.totalResults === 0) return null;
    
    return formatCrossReferenceAsContext(xref, locale);
  } catch {
    return null;
  }
}

async function fetchKnowledge(query: string, locale: Locale): Promise<string | null> {
  try {
    const results = await searchKnowledge(query, locale, { limit: 10 });
    if (results.length === 0) return null;
    
    const isAr = locale === 'ar';
    let text = '';
    for (const r of results.slice(0, 8)) {
      const title = isAr && r.titleAr ? r.titleAr : r.title;
      const summary = isAr && r.summaryAr ? r.summaryAr : r.summary;
      text += `\n### ${r.type.toUpperCase()}: ${title}\n`;
      if (summary) text += `> ${summary.slice(0, 300)}\n`;
      if (r.url) text += `Link: ${r.url}\n`;
      if (r.date) text += `Date: ${r.date}\n`;
      if (r.sentiment) text += `Sentiment: ${r.sentiment}\n`;
    }
    return text;
  } catch {
    return null;
  }
}

// ─── Build AI Context ────────────────────────────────────────────

function buildContextForAI(
  data: {
    prices: PriceData[];
    signals: SignalData[];
    analyses: AnalysisData[];
    news: NewsData[];
    reports: ReportData[];
    pulse: MarketPulse | null;
    xref: string | null;
    knowledge: string | null;
    userProfile: UserProfileContext | null;
  },
  classification: IntentClassification,
  locale: Locale,
): string {
  const isAr = locale === 'ar';
  const sections: string[] = [];
  
  // Header
  sections.push(isAr
    ? `═══ بيانات حقيقية من قاعدة بيانات رؤى ═══`
    : `═══ Real Data from Rouaa Database ═══`);
  sections.push(isAr
    ? `intent: ${classification.intent} | assets: ${classification.assets.map(a => a.symbol).join(', ') || 'none'}`
    : `intent: ${classification.intent} | assets: ${classification.assets.map(a => a.symbol).join(', ') || 'none'}`);
  
  // Prices
  if (data.prices.length > 0) {
    sections.push(isAr ? '\n📊 أسعار السوق:' : '\n📊 Market Prices:');
    for (const p of data.prices) {
      const name = isAr && p.nameAr ? p.nameAr : p.name;
      const change = p.changePercent >= 0 ? `+${p.changePercent.toFixed(2)}%` : `${p.changePercent.toFixed(2)}%`;
      const stale = p.isStale ? ' ⚠️ قد لا يكون محدثاً' : '';
      sections.push(`- ${name} (${p.symbol}): ${p.value.toLocaleString()} ${change}${stale}`);
    }
  }
  
  // Signals
  if (data.signals.length > 0) {
    sections.push(isAr ? '\n🎯 إشارات وتوصيات:' : '\n🎯 Signals & Recommendations:');
    for (const s of data.signals) {
      const parts = [`${s.pair}: ${s.action}`];
      if (s.confidence) parts.push(`ثقة: ${s.confidence}%`);
      if (s.entryPrice) parts.push(`دخول: ${s.entryPrice}`);
      if (s.stopLoss) parts.push(`وقف: ${s.stopLoss}`);
      if (s.takeProfit) parts.push(`هدف: ${s.takeProfit}`);
      if (s.status) parts.push(`[${s.status}]`);
      if (s.reason) parts.push(`— ${s.reason.slice(0, 100)}`);
      sections.push(`- ${parts.join(' | ')}`);
    }
  }
  
  // Analyses
  if (data.analyses.length > 0) {
    sections.push(isAr ? '\n📈 التحليلات:' : '\n📈 Analyses:');
    for (const a of data.analyses) {
      const parts = [a.title];
      if (a.sentiment) parts.push(`مشاعر: ${a.sentiment}`);
      if (a.confidenceScore) parts.push(`ثقة: ${a.confidenceScore}%`);
      if (a.riskLevel) parts.push(`مخاطر: ${a.riskLevel}`);
      if (a.overallSignal) parts.push(`إشارة: ${a.overallSignal}`);
      sections.push(`- ${parts.join(' | ')}`);
    }
  }
  
  // News — include ALL languages; AI will translate non-Arabic items
  if (data.news.length > 0) {
    const translateCount = data.news.filter(n => n.needsTranslation).length;
    const arabicCount = data.news.filter(n => !n.needsTranslation).length;
    
    if (translateCount > 0 && isAr) {
      sections.push(`\n📰 الأخبار (بالعربية: ${arabicCount}، تحتاج ترجمة: ${translateCount}):`);
      sections.push(`⚠️ تعليمات الترجمة: الأخبار المعلمة بـ [غير عربي] ليست بالعربية — ترجمها واختمها بالعربية عند كتابة الرد.`);
    } else {
      sections.push(isAr ? '\n📰 الأخبار:' : '\n📰 News:');
    }
    
    for (const n of data.news.slice(0, 15)) {
      // V1005: Convert internal tags to natural language — no bracketed metadata that weak models echo verbatim
      const title = isAr && n.titleAr ? n.titleAr : n.title;
      const summary = isAr && n.summaryAr ? n.summaryAr : n.summary;
      // Natural language suffix instead of bracketed tags
      const sentimentAr: Record<string, string> = { positive: 'إيجابي', negative: 'سلبي', neutral: 'محايد', bullish: 'صعودي', bearish: 'هبوطي' };
      const sentimentEn: Record<string, string> = { positive: 'positive', negative: 'negative', neutral: 'neutral', bullish: 'bullish', bearish: 'bearish' };
      const impactAr: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالي' };
      const impactEn: Record<string, string> = { low: 'low', medium: 'medium', high: 'high' };
      const parts: string[] = [];
      if (n.needsTranslation && isAr) parts.push('بحاجة لترجمة');
      else if (n.locale && n.locale !== 'ar' && !isAr) parts.push(`language: ${n.locale}`);
      if (n.sentiment) parts.push(isAr ? `المشاعر: ${sentimentAr[n.sentiment] || n.sentiment}` : `sentiment: ${sentimentEn[n.sentiment] || n.sentiment}`);
      if (n.impactLevel) parts.push(isAr ? `التأثير: ${impactAr[n.impactLevel] || n.impactLevel}` : `impact: ${impactEn[n.impactLevel] || n.impactLevel}`);
      const metaSuffix = parts.length > 0 ? ` — ${parts.join('، ')}` : '';
      sections.push(`- ${title}${metaSuffix}${summary ? `: ${summary.slice(0, 150)}` : ''}`);
    }
  }
  
  // Reports
  if (data.reports.length > 0) {
    sections.push(isAr ? '\n📋 التقارير:' : '\n📋 Reports:');
    for (const r of data.reports) {
      // V1005: Natural language for report metadata
      const impactAr: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالي' };
      const impactEn: Record<string, string> = { low: 'low', medium: 'medium', high: 'high' };
      const typeAr: Record<string, string> = { Strategic: 'استراتيجي', Technical: 'فني', Economy: 'اقتصادي', Earnings: 'أرباح' };
      const reportParts: string[] = [];
      if (r.reportType) reportParts.push(isAr ? `النوع: ${typeAr[r.reportType] || r.reportType}` : `type: ${r.reportType}`);
      if (r.marketImpact) reportParts.push(isAr ? `التأثير: ${impactAr[r.marketImpact] || r.marketImpact}` : `impact: ${impactEn[r.marketImpact] || r.marketImpact}`);
      const reportMeta = reportParts.length > 0 ? ` — ${reportParts.join('، ')}` : '';
      sections.push(`- ${r.title}${reportMeta}`);
    }
  }
  
  // Market Pulse
  if (data.pulse) {
    const pulseText = formatMarketPulseAsContext(data.pulse, locale);
    if (pulseText) sections.push(`\n${pulseText}`);
  }
  
  // Cross-reference
  if (data.xref) {
    sections.push(`\n${data.xref}`);
  }
  
  // Knowledge search results
  if (data.knowledge) {
    sections.push(data.knowledge);
  }
  
  // User profile
  if (data.userProfile) {
    const profileText = formatUserProfileAsContext(data.userProfile, locale);
    if (profileText) sections.push(`\n${profileText}`);
  }
  
  // V900: Smart data usage guidelines — NOT a wall that makes AI say "no data"
  // The AI is the BRAIN — it should use data smartly, not be paralyzed by fear
  sections.push(isAr
    ? `\n📌 إرشادات استخدام البيانات:
- الأسعار والأرقام المحددة: استخدمها فقط مما سبق — لا تخترع أرقاماً
- التحليل والتفسير والربط: هذا دورك كعقل مالي — حلل واشرح واربط
- إذا لم تجد بيانات عن سهم محدد: اعرض المؤشرات المتاحة (مثل TASI أو النفط) + تحليل اقتصادي + اقترح أسهماً محددة
- IMPORTANT: لا تقل فقط "لا أملك بيانات" — دائماً قدّم ما لديك + تحليلك + اقتراحات`
    : `\n📌 Data Usage Guidelines:
- Specific prices & numbers: Use only from above — don't fabricate numbers
- Analysis, interpretation, connections: This is YOUR role as a financial brain — analyze, explain, connect
- If no data on a specific stock: Show available indicators (like TASI or oil) + economic analysis + suggest specific stocks
- IMPORTANT: Don't just say "I don't have data" — ALWAYS show what you have + your analysis + suggestions`);

  return sections.join('\n');
}

// ─── Compatibility Types for stream/route.ts & response-builder.ts ──
// These types are used by the streaming assistant route and response builder.
// They map to the new FetchedData structure but maintain the old interface.

export interface TechnicalData {
  symbol: string;
  trend: string | null;
  direction: string | null;
  strength: number | null;
  indicators: Record<string, number | string | null>;
  support: number | null;
  resistance: number | null;
  tradeSetup: {
    direction: string;
    entry: number | null;
    stopLoss: number | null;
    target: number | null;
    riskReward: string | null;
    confidence: number | null;
  } | null;
  // V1035: Extended properties used by response-builder.ts
  rsi?: number | null;
  macd?: { value: number | null; signal: number | null; histogram: number | null } | null;
  sma20?: number | null;
  sma50?: number | null;
  bollingerBands?: { upper: number | null; middle: number | null; lower: number | null } | null;
  stochastic?: { k: number | null; d: number | null } | null;
  ichimoku?: { conversion: number | null; base: number | null; spanA: number | null; spanB: number | null } | null;
  atr?: number | null;
  overallSignal?: string | null;
}

export interface DataBundle {
  prices: PriceData[];
  technical: TechnicalData | null;
  signals: SignalData[];
  analyses: AnalysisData[];
  news: NewsData[];
  reports: ReportData[];
  marketPulse: any | null;
  crossReference: string | null;
  knowledge: string | null;
  userProfile: any | null;
  fetchTimeMs: number;
  dataPoints: number;
  sources: string[];
  contextForAI: string;
  knownNumbers: Set<string>;
  // V1035: Extended properties used by response-builder.ts
  assetName?: string;
  symbol?: string;
  price?: any;
  signal?: any;
  newsSentiment?: any;
  marketAnalysis?: any;
  events?: any[];
  fundamentals?: any;
  source?: string;
}

// ─── Compatibility Exports for stream/route.ts ────────────────────
// The streaming assistant route was built against an older version
// of data-fetcher that exported these functions. We provide
// compatibility shims here so the stream route doesn't break.
// V800+AI: These now use the simplified detectMentionedAssets
// instead of the old keyword-based intent-classifier.

export function detectAsset(message: string, locale: Locale): DetectedAsset | null {
  const assets = detectMentionedAssets(message);
  return assets.length > 0 ? assets[0] : null;
}

export async function fetchAssetData(
  message: string,
  locale: Locale,
  userId?: string,
): Promise<FetchedData> {
  // V800+AI: Always use broad fetch — AI decides what's relevant
  return fetchBroadData(message, locale, userId);
}

export async function fetchMultipleAssetData(
  message: string,
  locale: Locale,
  userId?: string,
): Promise<FetchedData> {
  // V800+AI: Always use broad fetch — AI decides what's relevant
  return fetchBroadData(message, locale, userId);
}

// ─── Helper ──────────────────────────────────────────────────────

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

// ═══════════════════════════════════════════════════════════════════
// V800: AI-First Broad Data Fetch
// ═══════════════════════════════════════════════════════════════════
// Instead of trying to guess what data the user needs based on keywords,
// we fetch BROAD data across ALL categories. The AI then decides
// what's relevant and builds the response.
//
// This eliminates the #1 failure mode: wrong intent → wrong data → wrong answer.
// The AI is smart enough to ignore irrelevant data. But it CAN'T use
// data we never fetched.

export async function fetchBroadData(
  userMessage: string,
  locale: Locale,
  userId?: string,
): Promise<FetchedData> {
  const startTime = Date.now();
  const isAr = locale === 'ar';
  const sources: string[] = [];
  const knownNumbers = new Set<string>();

  // V800: Detect if user mentions specific assets (for cross-reference only)
  // This is NOT for deciding what data to fetch — we fetch everything.
  // It's just for enriching cross-reference data for mentioned assets.
  const mentionedAssets = detectMentionedAssets(userMessage);

  // V802+: Detect which regional market the user is asking about
  const isSaudiQuery = /سعودي|تداول|tadawul|tasi|أرامكو|aramco|الراجحي|سابك|سهم سعودي|أسهم سعودية|السعودية/i.test(userMessage);
  const isQatarQuery = /قطري|قطر|دوحة|doha|qatar|qse|البحرية| industries qatar|مسندم/i.test(userMessage);
  const isUAEQuery = /إماراتي|الإمارات|امارات|uae|dubai|دبي|أبوظبي|abu dhabi|adfsm|dfm/i.test(userMessage);
  const isGCCQuery = isSaudiQuery || isQatarQuery || isUAEQuery || /خليجي|الخليج|gcc|gulf/i.test(userMessage);
  const regionalMarket = isSaudiQuery ? 'saudi' : isQatarQuery ? 'qatar' : isUAEQuery ? 'uae' : null;
  
  // V800: Fetch EVERYTHING in parallel — let AI decide what's relevant
  // This is the core of AI-first: we don't try to be smart about data selection.
  // We fetch broad data and give it all to the AI.
  const [
    priceResult,
    signalResult,
    analysisResult,
    newsResult,
    reportResult,
    pulseResult,
    xrefResult,
    knowledgeResult,
    userProfileResult,
  ] = await Promise.allSettled([
    // 1. ALL major market prices (broad, not filtered)
    fetchBroadPrices(),
    // 2. ALL active signals + recommendations (broad)
    fetchBroadSignals(),
    // 3. ALL recent analyses — with REGIONAL PRIORITY for GCC queries (V802)
    fetchBroadAnalyses(regionalMarket),
    // 4. ALL recent news (locale-prioritized, but broad)
    fetchBroadNews(locale),
    // 5. ALL recent reports (broad)
    fetchReports(locale),
    // 6. Market pulse overview
    fetchMarketPulse(locale).catch(() => null),
    // 7. Cross-reference for mentioned assets (if any)
    mentionedAssets.length > 0
      ? fetchCrossRef(mentionedAssets, locale)
      : Promise.resolve(null),
    // 8. Knowledge search (broad, based on user message)
    fetchKnowledge(userMessage, locale),
    // 9. User profile (if available)
    userId
      ? fetchUserProfileContext(userId).catch(() => null)
      : Promise.resolve(null),
  ]);

  // ── Extract results ──
  const prices = settledValue(priceResult, []);
  const signals = settledValue(signalResult, []);
  const analyses = settledValue(analysisResult, []);
  const news = settledValue(newsResult, []);
  const reports = settledValue(reportResult, []);
  const pulse = settledValue(pulseResult, null);
  const xref = settledValue(xrefResult, null);
  const knowledge = settledValue(knowledgeResult, null);
  const userProfile = settledValue(userProfileResult, null);

  // ── Collect sources ──
  if (prices.length > 0) sources.push(isAr ? 'أسعار السوق' : 'Market Prices');
  if (signals.length > 0) sources.push(isAr ? 'إشارات التداول' : 'Trading Signals');
  if (analyses.length > 0) sources.push(isAr ? 'التحليلات' : 'Analyses');
  if (news.length > 0) sources.push(isAr ? 'الأخبار' : 'News');
  if (reports.length > 0) sources.push(isAr ? 'التقارير' : 'Reports');
  if (pulse) sources.push(isAr ? 'نبض السوق' : 'Market Pulse');
  if (xref) sources.push(isAr ? 'إحالة متقاطعة' : 'Cross-reference');
  if (knowledge) sources.push(isAr ? 'قاعدة المعرفة' : 'Knowledge Base');
  if (userProfile) sources.push(isAr ? 'بيانات المستخدم' : 'User Profile');

  // ── Collect known numbers for hallucination filter ──
  for (const p of prices) {
    knownNumbers.add(p.value.toString());
    knownNumbers.add(p.changePercent.toFixed(2));
  }
  for (const s of signals) {
    if (s.entryPrice) knownNumbers.add(s.entryPrice.toString());
    if (s.stopLoss) knownNumbers.add(s.stopLoss.toString());
    if (s.takeProfit) knownNumbers.add(s.takeProfit.toString());
    if (s.confidence) knownNumbers.add(s.confidence.toString());
  }
  for (const a of analyses) {
    if (a.overallScore) knownNumbers.add(a.overallScore.toString());
    if (a.confidenceScore) knownNumbers.add(a.confidenceScore.toString());
    if (a.priceAtAnalysis) knownNumbers.add(a.priceAtAnalysis.toString());
  }

  // ── Build formatted context for AI ──
  const contextForAI = buildBroadContextForAI(
    { prices, signals, analyses, news, reports, pulse, xref, knowledge, userProfile },
    locale,
    isGCCQuery,
    regionalMarket,
  );

  const fetchTimeMs = Date.now() - startTime;
  const dataPoints = prices.length + signals.length + analyses.length + news.length + reports.length;

  return {
    prices,
    signals,
    analyses,
    news,
    reports,
    marketPulse: pulse,
    crossReference: xref,
    knowledgeResults: knowledge,
    userProfile,
    fetchTimeMs,
    dataPoints,
    sources,
    contextForAI,
    knownNumbers,
  };
}

// ─── V800: Simple Asset Detection (for cross-reference only) ──────
// We don't use this for data selection — just for enriching cross-reference.
// V800+AI: Minimal detection — just find symbols we can cross-reference.
// No rigid keyword matching. AI is the brain.

function detectMentionedAssets(message: string): DetectedAsset[] {
  const assets: DetectedAsset[] = [];
  const lower = message.toLowerCase();

  // Simple symbol detection — just for DB cross-reference, not for intent
  const symbolPatterns: Array<{ pattern: RegExp; symbol: string; shortSymbol: string; nameAr: string; nameEn: string; category: DetectedAsset['category'] }> = [
    // Crypto
    { pattern: /\b(btc|bitcoin|بيتكوين)\b/i, symbol: 'BTCUSD', shortSymbol: 'BTC', nameAr: 'البتكوين', nameEn: 'Bitcoin', category: 'crypto' },
    { pattern: /\b(eth|ethereum|إيثريوم)\b/i, symbol: 'ETHUSD', shortSymbol: 'ETH', nameAr: 'الإيثريوم', nameEn: 'Ethereum', category: 'crypto' },
    { pattern: /\b(sol|solana)\b/i, symbol: 'SOLUSD', shortSymbol: 'SOL', nameAr: 'سولانا', nameEn: 'Solana', category: 'crypto' },
    // Commodities
    { pattern: /\b(gold|xau|ذهب)\b/i, symbol: 'XAUUSD', shortSymbol: 'XAU', nameAr: 'الذهب', nameEn: 'Gold', category: 'commodity' },
    { pattern: /\b(silver|xag|فضة)\b/i, symbol: 'XAGUSD', shortSymbol: 'XAG', nameAr: 'الفضة', nameEn: 'Silver', category: 'commodity' },
    { pattern: /\b(oil|wti|brent|نفط|برنت)\b/i, symbol: 'WTIUSD', shortSymbol: 'WTI', nameAr: 'النفط', nameEn: 'Crude Oil', category: 'commodity' },
    // Forex
    { pattern: /\b(eurusd|يورو دولار)\b/i, symbol: 'EURUSD', shortSymbol: 'EUR', nameAr: 'يورو/دولار', nameEn: 'EUR/USD', category: 'forex' },
    { pattern: /\b(gbpusd|جنيه دولار)\b/i, symbol: 'GBPUSD', shortSymbol: 'GBP', nameAr: 'جنيه/دولار', nameEn: 'GBP/USD', category: 'forex' },
    { pattern: /\b(usdjpy|دولار ين)\b/i, symbol: 'USDJPY', shortSymbol: 'JPY', nameAr: 'دولار/ين', nameEn: 'USD/JPY', category: 'forex' },
    // Indices
    { pattern: /\b(spx|s&p|ستاندرد)\b/i, symbol: 'SPX', shortSymbol: 'SPX', nameAr: 'إس آند بي 500', nameEn: 'S&P 500', category: 'index' },
    { pattern: /\b(ndx|nasdaq|ناسداك)\b/i, symbol: 'NDX', shortSymbol: 'NDX', nameAr: 'ناسداك 100', nameEn: 'Nasdaq 100', category: 'index' },
    // Saudi / Tadawul — V800: detect ANY mention of Saudi market
    { pattern: /\b(tadawul|تداول|سعودي|السعودية|tasi|سهم سعودي|أسهم سعودية)\b/i, symbol: 'TASI', shortSymbol: 'TASI', nameAr: 'مؤشر تداول', nameEn: 'Tadawul All Share', category: 'stock' },
    // Specific Saudi stocks — common tickers
    { pattern: /\b(2222\.sr|أرامكو|aramco)\b/i, symbol: '2222.SR', shortSymbol: '2222', nameAr: 'أرامكو', nameEn: 'Saudi Aramco', category: 'stock' },
    { pattern: /\b(1120\.sr|الراجحي|alrajhi)\b/i, symbol: '1120.SR', shortSymbol: '1120', nameAr: 'الراجحي', nameEn: 'Al Rajhi Bank', category: 'stock' },
    { pattern: /\b(2330\.sr|سابك|sabic)\b/i, symbol: '2330.SR', shortSymbol: '2330', nameAr: 'سابك', nameEn: 'SABIC', category: 'stock' },
    { pattern: /\b(1180\.sr|الإنماء|alinma)\b/i, symbol: '1180.SR', shortSymbol: '1180', nameAr: 'بنك الإنماء', nameEn: 'Alinma Bank', category: 'stock' },
    { pattern: /\b(1210\.sr|الأهلي|alahli)\b/i, symbol: '1210.SR', shortSymbol: '1210', nameAr: 'البنك الأهلي', nameEn: 'NCB', category: 'stock' },
    // V802: Qatar stocks — detect Qatar/QSE mentions
    { pattern: /\b(qse|بورصة قطر|قطري|قطر|doha|دوحة)\b/i, symbol: 'QSE', shortSymbol: 'QSE', nameAr: 'مؤشر بورصة قطر', nameEn: 'Qatar Stock Exchange', category: 'stock' },
    { pattern: /\b(qnb|بنك قطر الوطني)\b/i, symbol: 'QNB.QA', shortSymbol: 'QNB', nameAr: 'بنك قطر الوطني', nameEn: 'Qatar National Bank', category: 'stock' },
    { pattern: /\b(ooredoo|أوريدو)\b/i, symbol: 'ORDS.QA', shortSymbol: 'ORDS', nameAr: 'أوريدو', nameEn: 'Ooredoo', category: 'stock' },
    // V802: UAE stocks — detect UAE/DFM mentions
    { pattern: /\b(dfm|أبوظبي|دبي|الإمارات|إماراتي|uae)\b/i, symbol: 'DFM', shortSymbol: 'DFM', nameAr: 'مؤشر سوق دبي المالي', nameEn: 'Dubai Financial Market', category: 'stock' },
    { pattern: /\b(etisalat|اتصالات|e&)\b/i, symbol: 'ETISALAT.AD', shortSymbol: 'ETISALAT', nameAr: 'اتصالات', nameEn: 'Etisalat', category: 'stock' },
    { pattern: /\b(emirates nbd|مصرف الإمارات)\b/i, symbol: 'EMIRATESNBD.UH', shortSymbol: 'ENBD', nameAr: 'مصرف الإمارات', nameEn: 'Emirates NBD', category: 'stock' },
  ];

  for (const { pattern, symbol, shortSymbol, nameAr, nameEn, category } of symbolPatterns) {
    if (pattern.test(lower)) {
      assets.push({ symbol, shortSymbol, nameAr, nameEn, category });
    }
  }

  return assets;
}

// ─── V800: Broad Price Fetch ───────────────────────────────────
// Fetch ALL major market prices — not just the ones we think the user wants.
// AI will pick what's relevant.

async function fetchBroadPrices(): Promise<PriceData[]> {
  try {
    const now = Date.now();
    // Fetch all market indicators — prices, indices, crypto, commodities, forex
    // V800+: Include ALL categories and regions (global + arabic/tadawul)
    const indicators = await db.marketIndicator.findMany({
      select: {
        symbol: true, name: true, nameAr: true, value: true,
        changePercent: true, category: true, region: true, lastUpdated: true,
      },
      orderBy: { category: 'asc' },
      take: 60, // V800+: Increased to 60 — include Tadawul/Saudi indicators
    });
    return indicators.map(i => ({
      symbol: i.symbol,
      name: i.name,
      nameAr: i.nameAr || i.name,
      value: i.value,
      changePercent: i.changePercent,
      category: i.category,
      lastUpdated: i.lastUpdated,
      isStale: !i.lastUpdated || (now - i.lastUpdated.getTime()) > STALE_THRESHOLD_MS,
    }));
  } catch {
    return [];
  }
}

// ─── V800: Broad Signal Fetch ──────────────────────────────────
// Fetch ALL active signals, recommendations, and council briefs — broad.

async function fetchBroadSignals(): Promise<SignalData[]> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [tradingSignals, recommendations, councilBriefs] = await Promise.allSettled([
      db.tradingSignal.findMany({
        where: {
          OR: [
            { status: { in: ['ACTIVE', 'active', 'Active', 'PENDING', 'pending', 'VALID', 'valid', 'OPEN', 'open'] } },
            { createdAt: { gte: weekAgo } },
          ],
        },
        select: {
          pair: true, action: true, confidence: true, reason: true,
          entryPrice: true, stopLoss: true, takeProfit: true, riskReward: true,
          source: true, category: true, timeframe: true, status: true,
          createdAt: true,
        },
        orderBy: { confidence: 'desc' },
        take: 25,
      }),
      db.personalizedRecommendation.findMany({
        where: {
          isDismissed: false,
          OR: [
            { validUntil: { gte: new Date() } },
            { createdAt: { gte: weekAgo } },
          ],
        },
        select: {
          title: true, titleEn: true, recommendationType: true, summary: true,
          action: true, confidenceScore: true, urgencyLevel: true, asset: true,
          entryPrice: true, targetPrice: true, stopLoss: true, timeHorizon: true,
          validUntil: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      db.councilBrief.findMany({
        where: {
          reviewStatus: 'approved',
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
        select: {
          pair: true, direction: true, entryPrice: true, stopLoss: true,
          takeProfit: true, confidence: true, timeframe: true, consensusJson: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const results: SignalData[] = [];

    for (const s of settledValue(tradingSignals, [])) {
      results.push({
        pair: s.pair, action: s.action, confidence: s.confidence,
        reason: s.reason, entryPrice: s.entryPrice, stopLoss: s.stopLoss,
        takeProfit: s.takeProfit, riskReward: s.riskReward, source: s.source,
        category: s.category, timeframe: s.timeframe, status: s.status,
        createdAt: s.createdAt, type: 'signal',
      });
    }

    for (const r of settledValue(recommendations, [])) {
      results.push({
        pair: r.asset || r.title, action: r.action || 'HOLD',
        confidence: r.confidenceScore || 50, reason: r.summary,
        entryPrice: typeof r.entryPrice === 'number' ? r.entryPrice : (r.entryPrice ? parseFloat(String(r.entryPrice)) : null),
        stopLoss: typeof r.stopLoss === 'number' ? r.stopLoss : (r.stopLoss ? parseFloat(String(r.stopLoss)) : null),
        takeProfit: typeof r.targetPrice === 'number' ? r.targetPrice : (r.targetPrice ? parseFloat(String(r.targetPrice)) : null),
        riskReward: null, source: 'AI Recommendation',
        category: r.recommendationType, timeframe: r.timeHorizon,
        status: 'RECOMMENDATION', createdAt: r.createdAt, type: 'recommendation',
      });
    }

    for (const b of settledValue(councilBriefs, [])) {
      results.push({
        pair: b.pair, action: b.direction || 'NEUTRAL',
        confidence: b.confidence, reason: null,
        entryPrice: b.entryPrice, stopLoss: b.stopLoss,
        takeProfit: b.takeProfit, riskReward: null, source: 'AI Council',
        category: 'council', timeframe: b.timeframe,
        status: 'COUNCIL', createdAt: b.createdAt, type: 'council',
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── V800: Broad Analysis Fetch ────────────────────────────────
// Fetch ALL recent analyses INCLUDING Tadawul/Saudi stocks.
// This is the key difference — we include marketType='tadawul' analyses.

async function fetchBroadAnalyses(regionalMarket: string | null = null): Promise<AnalysisData[]> {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // V802: When user asks about a regional market (Saudi/Qatar/UAE),
    // fetch regional analyses FIRST, then fill with global analyses.
    // This ensures the AI sees Tadawul/QSE/DFM data prominently.
    let regionalStockAnalyses: any[] = [];

    if (regionalMarket) {
      // V900: Broader regional filter — search by symbol, marketType, AND title content
      // Don't limit to exact symbol patterns — also search titles for Arabic names
      const regionalFilters: Record<string, any[]> = {
        saudi: [
          { marketType: { contains: 'tadawul', mode: 'insensitive' } },
          { marketType: { contains: 'saudi', mode: 'insensitive' } },
          { symbol: { endsWith: '.SR' } },
          { symbol: { equals: 'TASI' } },
          { title: { contains: 'سعودي', mode: 'insensitive' } },
          { title: { contains: 'تداول', mode: 'insensitive' } },
          { title: { contains: 'أرامكو', mode: 'insensitive' } },
          { title: { contains: 'الراجحي', mode: 'insensitive' } },
          { title: { contains: 'سابك', mode: 'insensitive' } },
          { title: { contains: 'Tadawul', mode: 'insensitive' } },
          { title: { contains: 'Aramco', mode: 'insensitive' } },
        ],
        qatar: [
          { marketType: { contains: 'qatar', mode: 'insensitive' } },
          { marketType: { contains: 'qse', mode: 'insensitive' } },
          { symbol: { endsWith: '.QA' } },
          { symbol: { endsWith: '.QR' } },
          { title: { contains: 'قطري', mode: 'insensitive' } },
          { title: { contains: 'قطر', mode: 'insensitive' } },
          { title: { contains: 'Qatar', mode: 'insensitive' } },
          { title: { contains: 'دوحة', mode: 'insensitive' } },
        ],
        uae: [
          { marketType: { contains: 'uae', mode: 'insensitive' } },
          { marketType: { contains: 'dfm', mode: 'insensitive' } },
          { marketType: { contains: 'adsm', mode: 'insensitive' } },
          { symbol: { endsWith: '.UH' } },
          { symbol: { endsWith: '.AD' } },
          { title: { contains: 'إماراتي', mode: 'insensitive' } },
          { title: { contains: 'الإمارات', mode: 'insensitive' } },
          { title: { contains: 'دبي', mode: 'insensitive' } },
          { title: { contains: 'أبوظبي', mode: 'insensitive' } },
          { title: { contains: 'Dubai', mode: 'insensitive' } },
        ],
      };

      const filters = regionalFilters[regionalMarket] || [];
      if (filters.length > 0) {
        try {
          regionalStockAnalyses = await db.stockAnalysis.findMany({
            where: {
              isPublished: true,
              createdAt: { gte: twoWeeksAgo },
              OR: filters,
            },
            select: {
              title: true, slug: true, symbol: true, summary: true, analysisType: true,
              overallSignal: true, overallScore: true, confidenceScore: true,
              technicalScore: true, fundamentalScore: true, sentiment: true,
              priceAtAnalysis: true, riskLevel: true, createdAt: true,
              marketType: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 15, // Up to 15 regional analyses
          });
        } catch (regionalErr: any) {
          console.warn(`[V802] Regional analysis fetch failed for ${regionalMarket}: ${regionalErr.message?.slice(0, 80)}`);
        }
      }
    }

    const regionalSymbolSet = new Set(regionalStockAnalyses.map((a: any) => a.symbol));
    const regionalSlugSet = new Set(regionalStockAnalyses.map((a: any) => a.slug));

    const [stockAnalyses, marketAnalyses] = await Promise.allSettled([
      db.stockAnalysis.findMany({
        where: { isPublished: true, createdAt: { gte: twoWeeksAgo } },
        select: {
          title: true, slug: true, symbol: true, summary: true, analysisType: true,
          overallSignal: true, overallScore: true, confidenceScore: true,
          technicalScore: true, fundamentalScore: true, sentiment: true,
          priceAtAnalysis: true, riskLevel: true, createdAt: true,
          marketType: true,  // V800: Include marketType to identify Tadawul stocks
        },
        orderBy: { createdAt: 'desc' },
        take: 20, // Broad: up to 20 analyses
      }),
      db.marketAnalysis.findMany({
        where: { isPublished: true, createdAt: { gte: twoWeeksAgo } },
        select: {
          title: true, slug: true, assetClass: true, analysisType: true, sentiment: true,
          confidenceScore: true, riskLevel: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const results: AnalysisData[] = [];

    // V802: Put REGIONAL analyses FIRST so AI sees them prominently
    for (const a of regionalStockAnalyses) {
      results.push({
        title: a.title, slug: a.slug, symbol: a.symbol,
        analysisType: a.analysisType, overallSignal: a.overallSignal,
        overallScore: a.overallScore, confidenceScore: a.confidenceScore,
        technicalScore: a.technicalScore, fundamentalScore: a.fundamentalScore,
        sentiment: a.sentiment, priceAtAnalysis: a.priceAtAnalysis,
        riskLevel: a.riskLevel, summary: a.summary,
        createdAt: a.createdAt, source: 'stock',
      });
    }

    for (const a of settledValue(stockAnalyses, [])) {
      // V802: Skip if already included from regional query (dedup by slug)
      if (regionalSlugSet.has(a.slug)) continue;
      results.push({
        title: a.title, slug: a.slug, symbol: a.symbol,
        analysisType: a.analysisType, overallSignal: a.overallSignal,
        overallScore: a.overallScore, confidenceScore: a.confidenceScore,
        technicalScore: a.technicalScore, fundamentalScore: a.fundamentalScore,
        sentiment: a.sentiment, priceAtAnalysis: a.priceAtAnalysis,
        riskLevel: a.riskLevel, summary: a.summary,
        createdAt: a.createdAt, source: 'stock',
      });
    }

    for (const a of settledValue(marketAnalyses, [])) {
      results.push({
        title: a.title, slug: a.slug, symbol: a.assetClass,
        analysisType: a.analysisType, overallSignal: a.sentiment,
        overallScore: a.confidenceScore, confidenceScore: a.confidenceScore,
        technicalScore: null, fundamentalScore: null,
        sentiment: a.sentiment, priceAtAnalysis: null,
        riskLevel: a.riskLevel, summary: null,
        createdAt: a.createdAt, source: 'market',
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── V800: Broad News Fetch ────────────────────────────────────
// Fetch ALL recent news, locale-prioritized but broad.

async function fetchBroadNews(locale: Locale): Promise<NewsData[]> {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const isAr = locale === 'ar';

    // Batch 1: News in user's locale (PRIORITY)
    const localeWhere: any = {
      isReady: true,
      createdAt: { gte: threeDaysAgo },
      locale: { in: [locale, 'ar'] },
    };

    // Batch 2: All news (FALLBACK, limited)
    const generalWhere: any = {
      isReady: true,
      createdAt: { gte: threeDaysAgo },
    };

    const [localeNews, generalNews] = await Promise.allSettled([
      db.newsItem.findMany({
        where: localeWhere,
        select: {
          title: true, titleAr: true, summary: true, summaryAr: true, slug: true,
          sentiment: true, impactLevel: true, affectedAssets: true, category: true,
          publishedAt: true, sourceName: true, locale: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 20,
      }),
      db.newsItem.findMany({
        where: generalWhere,
        select: {
          title: true, titleAr: true, summary: true, summaryAr: true, slug: true,
          sentiment: true, impactLevel: true, affectedAssets: true, category: true,
          publishedAt: true, sourceName: true, locale: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 15,
      }),
    ]);

    // Merge: locale-priority first, deduplicate by slug
    const seenSlugs = new Set<string>();
    const merged: NewsData[] = [];

    for (const n of settledValue(localeNews, [])) {
      if (n.slug && seenSlugs.has(n.slug)) continue;
      if (n.slug) seenSlugs.add(n.slug);
      merged.push(mapNewsItem(n));
    }

    for (const n of settledValue(generalNews, [])) {
      if (merged.length >= 25) break;
      if (n.slug && seenSlugs.has(n.slug)) continue;
      if (n.slug) seenSlugs.add(n.slug);
      const item = mapNewsItem(n);
      if (isAr && !n.titleAr && !n.summaryAr && n.locale !== 'ar') {
        item.needsTranslation = true;
      }
      merged.push(item);
    }

    return merged;
  } catch {
    return [];
  }
}

// ─── V800: Build Broad Context for AI ──────────────────────────
// Same as buildContextForAI but without intent/asset restrictions.
// We give the AI everything and let it decide.

function buildBroadContextForAI(
  data: {
    prices: PriceData[];
    signals: SignalData[];
    analyses: AnalysisData[];
    news: NewsData[];
    reports: ReportData[];
    pulse: MarketPulse | null;
    xref: string | null;
    knowledge: string | null;
    userProfile: UserProfileContext | null;
  },
  locale: Locale,
  isGCCQuery: boolean = false,
  regionalMarket: string | null = null,
): string {
  const isAr = locale === 'ar';
  const sections: string[] = [];

  // Header
  sections.push(isAr
    ? `═══ بيانات حقيقية من قاعدة بيانات رؤى (جميع البيانات المتاحة) ═══`
    : `═══ Real Data from Rouaa Database (all available data) ═══`);

  // V900: Regional market data — PUT FIRST so AI sees it prominently
  // When user asks about Saudi/Qatar/UAE, show regional data at the TOP
  if (isGCCQuery && regionalMarket) {
    const marketNames: Record<string, { ar: string; en: string; symbols: string[]; exchanges: string[]; drivers: { ar: string; en: string } }> = {
      saudi: {
        ar: 'السوق السعودي (تداول)',
        en: 'Saudi Market (Tadawul)',
        symbols: ['2222.SR', '1120.SR', '2330.SR', '1180.SR', '1210.SR', '7010.SR', '2282.SR', '5110.SR', '4005.SR', '1300.SR', 'TASI'],
        exchanges: ['تداول', 'Tadawul'],
        drivers: { ar: 'النفط محرك رئيسي | الريال مربوط بالدولار | رؤية 2030 | الإصلاحات الاقتصادية', en: 'Oil is key driver | SAR pegged to USD | Vision 2030 | Economic reforms' },
      },
      qatar: {
        ar: 'السوق القطري (بورصة قطر)',
        en: 'Qatar Market (QSE)',
        symbols: ['QNB.QA', 'Industries Qatar.QA', 'Ooredoo.QA', 'QSE', 'QEWS.QA'],
        exchanges: ['بورصة قطر', 'QSE'],
        drivers: { ar: 'الغاز الطبيعي محرك رئيسي | الريال القطري مربوط بالدولار | استضافة فعاليات كبرى', en: 'Natural gas is key driver | QAR pegged to USD | Major events hosting' },
      },
      uae: {
        ar: 'السوق الإماراتي (دبي/أبوظبي)',
        en: 'UAE Market (DFM/ADSM)',
        symbols: ['EMIRATESNBD.UH', 'DIB.UH', 'ETISALAT.AD', 'DFM', 'EMAAR.UH', 'FAB.UH'],
        exchanges: ['سوق دبي المالي', 'DFM', 'أبوظبي للأوراق المالية', 'ADSM'],
        drivers: { ar: 'التنويع الاقتصادي | دبي مركز مالي عالمي | الدرهم مربوط بالدولار | النفط في أبوظبي', en: 'Economic diversification | Dubai global financial hub | AED pegged to USD | Oil in Abu Dhabi' },
      },
    };
    const market = marketNames[regionalMarket];
    if (market) {
      // V900: Put regional-specific data FIRST — prices for this market
      const regionalPrices = data.prices.filter(p => {
        const symbolMatch = market.symbols.some(s => p.symbol.toUpperCase().includes(s.toUpperCase().split('.')[0]));
        const regionMatch = p.symbol === 'TASI' || p.symbol.endsWith('.SR') || p.symbol.endsWith('.QA') || p.symbol.endsWith('.UH') || p.symbol.endsWith('.AD');
        const driverMatch = regionalMarket === 'saudi' && /wti|oil|نفط|brent/i.test(p.symbol + p.name);
        return symbolMatch || regionMatch || driverMatch;
      });
      const regionalAnalyses = data.analyses.filter(a => {
        const symbolMatch = market.symbols.some(s => (a.symbol || '').toUpperCase().includes(s.toUpperCase().split('.')[0]));
        const titleMatch = /سعودي|تداول|tadawul|قطري|قطر|إماراتي|الإمارات/i.test(a.title);
        return symbolMatch || titleMatch;
      });
      const regionalSignals = data.signals.filter(s => {
        return market.symbols.some(sym => s.pair.toUpperCase().includes(sym.toUpperCase().split('.')[0]));
      });

      sections.push(isAr
        ? `\n🇸🇦🇶🇦🇦🇪 ═══ بيانات ${market.ar} — اعرضها أولاً في ردك ═══`
        : `\n🇸🇦🇶🇦🇦🇪 ═══ ${market.en} Data — Show this FIRST in your response ═══`);

      sections.push(isAr
        ? `المستخدم يسأل عن ${market.ar}.\nرموز البحث: ${market.symbols.join(', ')}\nمحركات السوق: ${market.drivers.ar}\n\n⚠️ ابحث عن هذه الرموز في البيانات أدناه. اعرض ما تجده أولاً. ثم أضف تحليلاً اقتصادياً ذكياً. لا تقل فقط "لا أملك بيانات".`
        : `User is asking about ${market.en}.\nSearch symbols: ${market.symbols.join(', ')}\nMarket drivers: ${market.drivers.en}\n\n⚠️ Search for these symbols in the data below. Show what you find FIRST. Then add smart economic analysis. Don't just say "no data".`);

      if (regionalPrices.length > 0) {
        sections.push(isAr ? '\n📊 أسعار ذات صلة بالسوق:' : '\n📊 Market-relevant prices:');
        for (const p of regionalPrices) {
          const name = isAr && p.nameAr ? p.nameAr : p.name;
          const change = p.changePercent >= 0 ? `+${p.changePercent.toFixed(2)}%` : `${p.changePercent.toFixed(2)}%`;
          sections.push(`- ${name} (${p.symbol}): ${p.value.toLocaleString()} ${change}`);
        }
      }

      if (regionalAnalyses.length > 0) {
        sections.push(isAr ? '\n📈 تحليلات ذات صلة:' : '\n📈 Relevant analyses:');
        for (const a of regionalAnalyses) {
          const parts = [a.title];
          if (a.symbol) parts.push(`(${a.symbol})`);
          if (a.overallSignal) parts.push(`إشارة: ${a.overallSignal}`);
          if (a.overallScore) parts.push(`تقييم: ${a.overallScore}/100`);
          if (a.slug) parts.push(`/stock-analysis/${a.slug}`);
          sections.push(`- ${parts.join(' | ')}`);
        }
      }

      if (regionalSignals.length > 0) {
        sections.push(isAr ? '\n🎯 إشارات ذات صلة:' : '\n🎯 Relevant signals:');
        for (const s of regionalSignals) {
          const parts = [`${s.pair}: ${s.action}`];
          if (s.confidence) parts.push(`ثقة: ${s.confidence}%`);
          if (s.entryPrice) parts.push(`دخول: ${s.entryPrice}`);
          if (s.stopLoss) parts.push(`وقف: ${s.stopLoss}`);
          if (s.takeProfit) parts.push(`هدف: ${s.takeProfit}`);
          sections.push(`- ${parts.join(' | ')}`);
        }
      }

      sections.push(isAr
        ? `\n═══ نهاية بيانات ${market.ar} — الآن بيانات الأسواق الأخرى ═══`
        : `\n═══ End of ${market.en} data — Now other markets data ═══`);
    }
  }

  // Prices — ALL of them
  if (data.prices.length > 0) {
    // V900: Count stale prices for prominent warning
    const staleCount = data.prices.filter(p => p.isStale).length;
    const freshCount = data.prices.length - staleCount;
    
    if (staleCount > 0 && isAr) {
      sections.push(`\n📊 أسعار السوق (⚠️ ${staleCount} من ${data.prices.length} سعر قديم — أخبر المستخدم أن هذه البيانات قد لا تكون محدثة):`);
    } else if (staleCount > 0) {
      sections.push(`\n📊 Market Prices (⚠️ ${staleCount} of ${data.prices.length} prices are stale — tell the user this data may not be current):`);
    } else {
      sections.push(isAr ? '\n📊 أسعار السوق:' : '\n📊 Market Prices:');
    }
    
    for (const p of data.prices) {
      const name = isAr && p.nameAr ? p.nameAr : p.name;
      const change = p.changePercent >= 0 ? `+${p.changePercent.toFixed(2)}%` : `${p.changePercent.toFixed(2)}%`;
      // V900: Enhanced staleness warning with actual time since update
      let stale = '';
      if (p.isStale && p.lastUpdated) {
        const hoursAgo = Math.round((Date.now() - p.lastUpdated.getTime()) / (1000 * 60 * 60));
        stale = isAr ? ` ⚠️قديم(${hoursAgo}س)` : ` ⚠️stale(${hoursAgo}h)`;
      } else if (p.isStale) {
        stale = ' ⚠️';
      }
      sections.push(`- ${name} (${p.symbol}): ${p.value.toLocaleString()} ${change}${stale}`);
    }
  }

  // Signals — ALL of them
  if (data.signals.length > 0) {
    sections.push(isAr ? '\n🎯 إشارات وتوصيات التداول:' : '\n🎯 Trading Signals & Recommendations:');
    for (const s of data.signals) {
      const parts = [`${s.pair}: ${s.action}`];
      if (s.confidence) parts.push(`ثقة: ${s.confidence}%`);
      if (s.entryPrice) parts.push(`دخول: ${s.entryPrice}`);
      if (s.stopLoss) parts.push(`وقف: ${s.stopLoss}`);
      if (s.takeProfit) parts.push(`هدف: ${s.takeProfit}`);
      if (s.category) parts.push(`[${s.category}]`);
      if (s.status) parts.push(`[${s.status}]`);
      if (s.reason) parts.push(`— ${s.reason.slice(0, 100)}`);
      sections.push(`- ${parts.join(' | ')}`);
    }
  }

  // Analyses — ALL including Tadawul
  if (data.analyses.length > 0) {
    sections.push(isAr ? '\n📈 التحليلات (بما في ذلك أسهم تداول):' : '\n📈 Analyses (including Tadawul stocks):');
    for (const a of data.analyses) {
      const parts = [a.title];
      if (a.symbol) parts.push(`(${a.symbol})`);
      if (a.overallSignal) parts.push(`إشارة: ${a.overallSignal}`);
      if (a.overallScore) parts.push(`تقييم: ${a.overallScore}/100`);
      if (a.confidenceScore) parts.push(`ثقة: ${a.confidenceScore}%`);
      if (a.riskLevel) parts.push(`مخاطر: ${a.riskLevel}`);
      if (a.sentiment) parts.push(`مشاعر: ${a.sentiment}`);
      if (a.summary) parts.push(`— ${a.summary.slice(0, 100)}`);
      if (a.slug) parts.push(`/stock-analysis/${a.slug}`);
      sections.push(`- ${parts.join(' | ')}`);
    }
  }

  // News — ALL, with translation flags
  if (data.news.length > 0) {
    const translateCount = data.news.filter(n => n.needsTranslation).length;
    const arabicCount = data.news.filter(n => !n.needsTranslation).length;

    if (translateCount > 0 && isAr) {
      sections.push(`\n📰 الأخبار (بالعربية: ${arabicCount}، تحتاج ترجمة: ${translateCount}):`);
      sections.push(`⚠️ تعليمات: الأخبار المعلمة بـ [غير عربي] ليست بالعربية — ترجمها واختمها بالعربية.`);
    } else {
      sections.push(isAr ? '\n📰 الأخبار:' : '\n📰 News:');
    }

    for (const n of data.news.slice(0, 20)) {
      // V1005: Convert internal tags to natural language — no bracketed metadata that weak models echo verbatim
      const title = isAr && n.titleAr ? n.titleAr : n.title;
      const summary = isAr && n.summaryAr ? n.summaryAr : n.summary;
      // Natural language suffix instead of bracketed tags
      const sentimentAr: Record<string, string> = { positive: 'إيجابي', negative: 'سلبي', neutral: 'محايد', bullish: 'صعودي', bearish: 'هبوطي' };
      const sentimentEn: Record<string, string> = { positive: 'positive', negative: 'negative', neutral: 'neutral', bullish: 'bullish', bearish: 'bearish' };
      const impactAr: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالي' };
      const impactEn: Record<string, string> = { low: 'low', medium: 'medium', high: 'high' };
      const parts: string[] = [];
      if (n.needsTranslation && isAr) parts.push('بحاجة لترجمة');
      else if (n.locale && n.locale !== 'ar' && !isAr) parts.push(`language: ${n.locale}`);
      if (n.sentiment) parts.push(isAr ? `المشاعر: ${sentimentAr[n.sentiment] || n.sentiment}` : `sentiment: ${sentimentEn[n.sentiment] || n.sentiment}`);
      if (n.impactLevel) parts.push(isAr ? `التأثير: ${impactAr[n.impactLevel] || n.impactLevel}` : `impact: ${impactEn[n.impactLevel] || n.impactLevel}`);
      const metaSuffix = parts.length > 0 ? ` — ${parts.join('، ')}` : '';
      sections.push(`- ${title}${metaSuffix}${summary ? `: ${summary.slice(0, 150)}` : ''}`);
    }
  }

  // Reports
  if (data.reports.length > 0) {
    sections.push(isAr ? '\n📋 التقارير:' : '\n📋 Reports:');
    for (const r of data.reports) {
      // V1005: Natural language for report metadata
      const impactAr: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالي' };
      const impactEn: Record<string, string> = { low: 'low', medium: 'medium', high: 'high' };
      const typeAr: Record<string, string> = { Strategic: 'استراتيجي', Technical: 'فني', Economy: 'اقتصادي', Earnings: 'أرباح' };
      const reportParts: string[] = [];
      if (r.reportType) reportParts.push(isAr ? `النوع: ${typeAr[r.reportType] || r.reportType}` : `type: ${r.reportType}`);
      if (r.marketImpact) reportParts.push(isAr ? `التأثير: ${impactAr[r.marketImpact] || r.marketImpact}` : `impact: ${impactEn[r.marketImpact] || r.marketImpact}`);
      const reportMeta = reportParts.length > 0 ? ` — ${reportParts.join('، ')}` : '';
      sections.push(`- ${r.title}${reportMeta}`);
    }
  }

  // Market Pulse
  if (data.pulse) {
    const pulseText = formatMarketPulseAsContext(data.pulse, locale);
    if (pulseText) sections.push(`\n${pulseText}`);
  }

  // Cross-reference
  if (data.xref) {
    sections.push(`\n${data.xref}`);
  }

  // Knowledge search results
  if (data.knowledge) {
    sections.push(data.knowledge);
  }

  // User profile
  if (data.userProfile) {
    const profileText = formatUserProfileAsContext(data.userProfile, locale);
    if (profileText) sections.push(`\n${profileText}`);
  }

  // V900: Smart data usage guidelines — NOT a wall that makes AI say "no data"
  sections.push(isAr
    ? `\n📌 إرشادات استخدام البيانات:
- الأسعار والأرقام المحددة: استخدمها فقط مما سبق — لا تخترع أرقاماً
- التحليل والتفسير والربط: هذا دورك كعقل مالي — حلل واشرح واربط
- إذا لم تجد بيانات عن سهم محدد: اعرض المؤشرات المتاحة (مثل TASI أو النفط) + تحليل اقتصادي + اقترح أسهماً محددة
- IMPORTANT: لا تقل فقط "لا أملك بيانات" — دائماً قدّم ما لديك + تحليلك + اقتراحات`
    : `\n📌 Data Usage Guidelines:
- Specific prices & numbers: Use only from above — don't fabricate numbers
- Analysis, interpretation, connections: This is YOUR role as a financial brain — analyze, explain, connect
- If no data on a specific stock: Show available indicators (like TASI or oil) + economic analysis + suggest specific stocks
- IMPORTANT: Don't just say "I don't have data" — ALWAYS show what you have + your analysis + suggestions`);

  return sections.join('\n');
}
