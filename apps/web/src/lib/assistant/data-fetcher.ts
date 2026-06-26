// ─── Data Fetcher ────────────────────────────────────────────────
// RAG-Omega Architecture: Pre-emptively fetches ALL relevant data
// from the database BASED ON the classified intent.
// This runs BEFORE any AI call, in parallel, typically < 1 second.
// Like how a human researcher gathers all materials before writing.

import { db, ensureDbReady } from '@/lib/db';
import type { Locale } from './tools';
import type { IntentClassification, DetectedAsset, DataNeeds } from './intent-classifier';
import { performTechnicalAnalysis, type TechnicalAnalysisResult } from '@/lib/technical-analysis';
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

  // V469: roua-trading user data (from NestJS backend)
  userPositions: UserPositionData[];   // صفقات المستخدم المفتوحة
  userClosedTrades: UserClosedTradeData[];  // صفقات مغلقة
  councilBriefs: CouncilBriefData[];   // briefs المجلس النشطة
  userStats: UserStatsData | null;     // إحصائيات المستخدم

  // V475: Technical indicators (RSI, MACD, EMA) لكل أصل مكتشف
  technicalIndicators: Record<string, TechnicalAnalysisResult | null>;

  // Metadata
  fetchTimeMs: number;
  dataPoints: number;                  // total data points fetched
  sources: string[];                   // data source names

  // Formatted context for AI (pre-built to avoid redundant work)
  contextForAI: string;               // all data formatted as context text

  // Raw data for response filter (numbers we can verify)
  knownNumbers: Set<string>;          // all numbers from DB data
}

// V469: roua-trading user position data
export interface UserPositionData {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string;
  durationMinutes: number;
  source: string | null;
}

// V469: roua-trading closed trade data
export interface UserClosedTradeData {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  closeReason: string | null;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
}

// V469: roua-trading council brief data
export interface CouncilBriefData {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  analysisSummary: string | null;
  isActive: boolean;
  createdAt: string;
}

// V469: roua-trading user stats
export interface UserStatsData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  displayedBalance: number;
  usedMargin: number;
  riskExposurePercent: number;
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

    // V517: النموذج الصحيح هو db.signal (له pair/action/confidence/reason/...)
    // و db.tradingBrief للموجزات (له pair/direction/entryPrice/stopLoss/takeProfit/confidence)
    const [tradingSignals, councilBriefs] = await Promise.allSettled([
      db.signal.findMany({
        where: {
          OR: [
            { status: 'ACTIVE' },
            { createdAt: { gte: weekAgo } },
          ],
        },
        select: {
          pair: true, action: true, confidence: true, reason: true,
          entryPrice: true, stopLoss: true, takeProfit: true,
          status: true, createdAt: true,
        },
        orderBy: { confidence: 'desc' },
        take: 20,
      }),
      db.tradingBrief.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
        select: {
          pair: true, direction: true, entryPrice: true, stopLoss: true,
          takeProfit: true, confidence: true, timeframe: true,
          analysisSummary: true, strictRules: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).catch(() => []),
    ]);

    const results: SignalData[] = [];

    // Map trading signals (V517: حقول صحيحة)
    for (const s of settledValue(tradingSignals, [])) {
      results.push({
        pair: s.pair, action: s.action, confidence: s.confidence,
        reason: s.reason, entryPrice: s.entryPrice, stopLoss: s.stopLoss,
        takeProfit: s.takeProfit, riskReward: null, source: 'signal',
        category: 'trading', timeframe: 'short',
        status: s.status, createdAt: s.createdAt, type: 'signal',
      } as any);
    }

    // Map council briefs (V517: analysisSummary بدل consensusJson)
    for (const b of settledValue(councilBriefs, [])) {
      results.push({
        pair: b.pair, action: b.direction || 'NEUTRAL',
        confidence: b.confidence, reason: (b as any).analysisSummary ?? null,
        entryPrice: b.entryPrice, stopLoss: b.stopLoss,
        takeProfit: b.takeProfit, riskReward: null, source: 'AI Council',
        category: 'council', timeframe: b.timeframe,
        status: 'COUNCIL', createdAt: b.createdAt, type: 'council',
      } as any);
    }

    return results;
  } catch {
    return [];
  }
}

async function fetchAnalyses(assets: DetectedAsset[]): Promise<AnalysisData[]> {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // V517: roua-trading لا يملك stockAnalysis/marketAnalysis — نستخدم ContentArticle + StrategyReport
    const assetSymbols = assets.map(a => a.shortSymbol).filter(Boolean);

    const [contentArticles, strategyReports] = await Promise.allSettled([
      db.contentArticle.findMany({
        where: {
          contentType: { in: ['ANALYSIS', 'MARKET_REPORT'] },
          createdAt: { gte: twoWeeksAgo },
          ...(assetSymbols.length > 0 ? { symbol: { in: assetSymbols } } : {}),
        },
        select: {
          titleAr: true, titleEn: true, summaryAr: true, summaryEn: true,
          symbol: true, contentType: true, sentiment: true,
          confidenceScore: true, riskLevel: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).catch(() => []),
      db.strategyReport.findMany({
        where: { createdAt: { gte: twoWeeksAgo } },
        select: {
          title: true, symbol: true, assetName: true, type: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).catch(() => []),
    ]);

    const results: AnalysisData[] = [];

    // Map content articles
    for (const a of settledValue(contentArticles, [])) {
      results.push({
        title: a.titleAr ?? a.titleEn ?? '',
        slug: '',
        symbol: a.symbol ?? 'MARKET',
        analysisType: a.contentType ?? 'ANALYSIS',
        overallSignal: a.sentiment ?? 'NEUTRAL',
        overallScore: a.confidenceScore ?? 0,
        confidenceScore: a.confidenceScore ?? 0,
        technicalScore: null, fundamentalScore: null,
        sentiment: a.sentiment ?? 'NEUTRAL',
        priceAtAnalysis: null,
        riskLevel: (a as any).riskLevel ?? 'medium',
        summary: a.summaryAr ?? a.summaryEn ?? '',
        createdAt: a.createdAt, source: 'content',
      } as any);
    }

    // Map strategy reports
    for (const r of settledValue(strategyReports, [])) {
      results.push({
        title: r.title ?? '',
        slug: '',
        symbol: r.symbol ?? 'MARKET',
        analysisType: r.type ?? 'STRATEGY',
        overallSignal: 'NEUTRAL',
        overallScore: 0,
        confidenceScore: 0,
        technicalScore: null, fundamentalScore: null,
        sentiment: 'NEUTRAL',
        priceAtAnalysis: null,
        riskLevel: 'medium',
        summary: r.title ?? '',
        createdAt: r.createdAt, source: 'strategy',
      } as any);
    }

    return results;
  } catch {
    return [];
  }
}

async function fetchNews(query: string, assets: DetectedAsset[], locale: Locale): Promise<NewsData[]> {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // V517: النموذج الصحيح هو NewsArticle (له title, translatedTitle, content, translatedContent,
    // summary, sentiment, sentimentLabel, impactLevel, affectedAssets (JSON string), category)
    const assetSymbols = assets.map(a => a.shortSymbol).filter(Boolean);

    // Build OR filter for affectedAssets (JSON string contains)
    const assetFilter = assetSymbols.length > 0
      ? assetSymbols.map(sym => ({ affectedAssets: { contains: `"${sym}"` } }))
      : [];

    const where: any = {
      publishedAt: { gte: threeDaysAgo },
    };
    if (assetFilter.length > 0) where.OR = assetFilter;

    const news = await db.newsArticle.findMany({
      where,
      select: {
        title: true, translatedTitle: true, content: true, translatedContent: true,
        summary: true, url: true, source: true, sentiment: true, sentimentLabel: true,
        impactLevel: true, affectedAssets: true, category: true, publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });

    return news.map((n: any) => {
      let assetsList: string[] = [];
      try { if (n.affectedAssets) assetsList = JSON.parse(n.affectedAssets); } catch {}
      return {
        title: n.translatedTitle ?? n.title ?? '',
        titleAr: n.translatedTitle,
        summary: n.summary ?? n.translatedContent ?? '',
        summaryAr: n.summary,
        slug: '',
        sentiment: n.sentimentLabel ?? 'NEUTRAL',
        impactLevel: n.impactLevel ?? 'medium',
        affectedAssets: assetsList.join(', '),
        category: n.category ?? 'General',
        publishedAt: n.publishedAt,
        sourceName: n.source,
        locale: 'ar',
        needsTranslation: false,
      } as NewsData;
    });
  } catch {
    return [];
  }
}

function mapNewsItem(n: any): NewsData {
  // V517: Kept for backward compatibility but unused now
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
    needsTranslation: false,
  };
}

async function fetchReports(locale: Locale): Promise<ReportData[]> {
  try {
    // V517: roua-trading لا يملك economicReport/marketAnalysis — نستخدم StrategyReport
    const reports = await db.strategyReport.findMany({
      select: {
        title: true, symbol: true, assetName: true, type: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }).catch(() => []);

    const results: ReportData[] = [];
    for (const r of settledValue(Promise.resolve(reports) as any, [])) {
      results.push({
        title: r.title ?? '',
        slug: '',
        summary: r.title ?? '',
        reportType: r.type ?? 'STRATEGY',
        scope: r.assetName ?? r.symbol ?? '',
        marketImpact: 'NEUTRAL',
        confidenceScore: 0,
        publishedAt: r.createdAt,
        source: 'strategy',
      } as any);
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

// V495: stubs للدوال المفقودة من rouatradingnews — ترجع [] بدلاً من الخطأ

// V495: buildBroadContextForAI — تبني السياق للـ AI من كل البيانات
function buildBroadContextForAI(
  data: {
    prices: any[]; signals: any[]; analyses: any[]; news: any[]; reports: any[];
    pulse: any; xref: any; knowledge: any; userProfile: any;
    userPositions?: any[]; userClosedTrades?: any[]; councilBriefs?: any[]; userStats?: any;
    technicalIndicators?: Record<string, any>;
  },
  locale: any,
  isGCCQuery?: boolean,
  regionalMarket?: string | null,
): string {
  const isAr = locale === 'ar';
  const sections: string[] = [];

  // المؤشرات الفنية
  if (data.technicalIndicators && Object.keys(data.technicalIndicators).length > 0) {
    sections.push(isAr ? `\n═══ 📈 المؤشرات الفنية (محسوبة من Yahoo Finance) ═══` : `\n═══ 📈 Technical Indicators ═══`);
    for (const [symbol, ind] of Object.entries(data.technicalIndicators)) {
      if (!ind) continue;
      sections.push(`── ${symbol} ──`);
      if (ind.rsi !== null) sections.push(`• RSI (14): ${ind.rsi}`);
      if (ind.macd) sections.push(`• MACD: ${ind.macd.macd} | Signal: ${ind.macd.signal} — ${ind.macd.trend}`);
      if (ind.ema50 !== null) sections.push(`• EMA (50): ${ind.ema50}`);
      if (ind.support !== null) sections.push(`• Support: ${ind.support} | Resistance: ${ind.resistance}`);
      if (ind.priceVsMA50 && ind.priceVsMA50 !== 'unknown') sections.push(`• Price vs MA50: ${ind.priceVsMA50}`);
      if (ind.trend && ind.trend !== 'unknown') sections.push(`• Trend: ${ind.trend}`);
    }
    sections.push('');
  }

  // صفقات المستخدم المفتوحة
  if (data.userPositions && data.userPositions.length > 0) {
    sections.push(isAr ? `\n═══ 📊 صفقاتك المفتوحة (بيانات حقيقية) ═══` : `\n═══ 📊 Your Open Positions ═══`);
    for (const p of data.userPositions) {
      const pnlStr = p.unrealizedPnl >= 0 ? `+${p.unrealizedPnl.toFixed(2)}$` : `${p.unrealizedPnl.toFixed(2)}$`;
      const sl = p.stopLoss ? `SL: ${p.stopLoss}` : 'SL: غير محدد';
      const tp = p.takeProfit ? `TP: ${p.takeProfit}` : 'TP: غير محدد';
      sections.push(`• ${p.symbol} ${p.side} | دخول: ${p.entryPrice} | حالي: ${p.currentPrice} | PnL: ${pnlStr} | ${sl} | ${tp} | المصدر: ${p.source ?? 'يدوي'}`);
    }
    sections.push('');
  }

  // الصفقات المغلقة
  if (data.userClosedTrades && data.userClosedTrades.length > 0) {
    sections.push(isAr ? `\n═══ 📋 آخر صفقاتك المغلقة ═══` : `\n═══ 📋 Recent Closed Trades ═══`);
    for (const t of data.userClosedTrades) {
      const icon = t.result === 'WIN' ? '🟢' : t.result === 'LOSS' ? '🔴' : '🟡';
      sections.push(`${icon} ${t.symbol} ${t.side} | PnL: ${t.realizedPnl.toFixed(2)}$ | ${t.result}`);
    }
    sections.push('');
  }

  // تصويتات المجلس
  if (data.councilBriefs && data.councilBriefs.length > 0) {
    sections.push(isAr ? `\n═══ 🏛️ تصويتات المجلس ═══` : `\n═══ 🏛️ Council Briefs ═══`);
    for (const b of data.councilBriefs) {
      const icon = b.direction === 'BUY' ? '🟢' : '🔴';
      sections.push(`${icon} ${b.symbol} ${b.direction} | ثقة: ${b.confidence}%`);
    }
    sections.push('');
  }

  // الإحصائيات
  if (data.userStats) {
    const s = data.userStats;
    sections.push(isAr ? `\n═══ 📈 إحصائياتك (آخر 30 يوم) ═══` : `\n═══ 📈 Your Stats ═══`);
    sections.push(`• صفقات: ${s.totalTrades} | فوز: ${s.wins} | خسارة: ${s.losses} | Win Rate: ${s.winRate}%`);
    sections.push(`• صافي PnL: ${s.totalPnl}$ | Profit Factor: ${s.profitFactor}`);
    sections.push(`• رصيد: ${s.displayedBalance}$ | مخاطرة: ${s.riskExposurePercent}%`);
    sections.push('');
  }

  return sections.join('\n');
}
// V516 Fix 1: استبدال stub functions بدوال حقيقية تجلب بيانات من DB
// V517: تكييف للاستعلام عن النماذج الفعلية في schema roua-trading
//   NewsArticle (بدل news/newsItem)
//   Signal (بالحقول الصحيحة pair/action/confidence/reason/...)
//   ContentArticle (بدل marketAnalysis/stockAnalysis)
//   StrategyReport (بدل economicReport)
async function fetchBroadPrices(): Promise<PriceData[]> {
  // V517: roua-trading لا يملك model MarketIndicator — نُرجع []
  // الأسعار تأتي من realtime-search.ts (Yahoo Finance via NestJS)
  return [];
}

async function fetchBroadSignals(): Promise<SignalData[]> {
  try {
    // V517: النموذج الصحيح هو Signal بحقول: pair/action/confidence/reason/entryPrice/stopLoss/takeProfit
    const signals = await db.signal.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return signals.map((s: any) => ({
      symbol: s.pair ?? 'UNKNOWN',
      type: s.action ?? 'NEUTRAL',
      direction: s.action ?? 'NEUTRAL',
      strength: s.confidence ?? 0,
      price: s.entryPrice ? Number(s.entryPrice) : 0,
      stopLoss: s.stopLoss ? Number(s.stopLoss) : undefined,
      takeProfit: s.takeProfit ? Number(s.takeProfit) : undefined,
      reason: s.reason ?? '',
      timestamp: s.createdAt?.toISOString() ?? new Date().toISOString(),
      source: 'db',
    } as SignalData));
  } catch (e) {
    console.warn('[V517] fetchBroadSignals error:', e);
    return [];
  }
}

async function fetchBroadAnalyses(_regional?: string): Promise<AnalysisData[]> {
  try {
    // V517: نستخدم ContentArticle (التحليلات المُولّدة) + StrategyReport
    const [articles, reports] = await Promise.all([
      db.contentArticle.findMany({
        where: { contentType: { in: ['ANALYSIS', 'MARKET_REPORT', 'NEWS_DIGEST'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }).catch(() => []),
      db.strategyReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }).catch(() => []),
    ]);
    const fromArticles = (articles as any[]).map((a: any) => ({
      symbol: a.symbol ?? 'MARKET',
      summary: a.summaryAr ?? a.summaryEn ?? a.titleAr ?? '',
      recommendation: a.contentType ?? 'NEUTRAL',
      confidence: 0,
      timestamp: a.createdAt?.toISOString() ?? new Date().toISOString(),
      source: 'content',
    } as AnalysisData));
    const fromReports = (reports as any[]).map((r: any) => ({
      symbol: r.symbol ?? 'MARKET',
      summary: r.title ?? '',
      recommendation: r.type ?? 'NEUTRAL',
      confidence: 0,
      timestamp: r.createdAt?.toISOString() ?? new Date().toISOString(),
      source: 'strategy',
    } as AnalysisData));
    return [...fromArticles, ...fromReports];
  } catch (e) {
    console.warn('[V517] fetchBroadAnalyses error:', e);
    return [];
  }
}

async function fetchBroadNews(_locale?: any): Promise<NewsData[]> {
  try {
    // V517: النموذج الصحيح هو NewsArticle
    const news = await db.newsArticle.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 15,
    });
    return news.map((n: any) => {
      // Parse affectedAssets (JSON string) safely
      let assets: string[] = [];
      try {
        if (n.affectedAssets) assets = JSON.parse(n.affectedAssets);
      } catch {}
      return {
        title: n.translatedTitle ?? n.title ?? '',
        summary: n.summary ?? n.translatedContent ?? '',
        url: n.url ?? '',
        source: n.source ?? '',
        publishedAt: n.publishedAt?.toISOString() ?? new Date().toISOString(),
        sentiment: n.sentimentLabel ?? 'NEUTRAL',
        impactLevel: n.impactLevel ?? 'medium',
        category: n.category ?? 'General',
        assets,
      } as any;
    });
  } catch (e) {
    console.warn('[V517] fetchBroadNews error:', e);
    return [];
  }
}
function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

// V492: تعريف detectMentionedAssets — كانت مفقودة
// V516 Fix 4: إضافة XRP/ADA/SOL/DOGE/BNB (الأصول الفعلية للمستخدمين)
function detectMentionedAssets(message: string): string[] {
  const assets: string[] = [];
  const lower = message.toLowerCase();
  const patterns: Array<{ pattern: RegExp; symbol: string }> = [
    { pattern: /\b(btc|bitcoin|بيتكوين)\b/i, symbol: 'BTC' },
    { pattern: /\b(eth|ethereum|إيثريوم|ايثريوم)\b/i, symbol: 'ETH' },
    // V516: عملات رقمية يملكها المستخدمون فعلاً
    { pattern: /\b(xrp|ripple|ريبل)\b/i, symbol: 'XRP' },
    { pattern: /\b(ada|cardano|كاردانو)\b/i, symbol: 'ADA' },
    { pattern: /\b(sol|solana|سولانا)\b/i, symbol: 'SOL' },
    { pattern: /\b(doge|dogecoin|دوج)\b/i, symbol: 'DOGE' },
    { pattern: /\b(bnb|binance\s*coin|بينانس)\b/i, symbol: 'BNB' },
    { pattern: /\b(matic|polygon|بوليجون)\b/i, symbol: 'MATIC' },
    { pattern: /\b(link|chainlink|تشين\s*لينك)\b/i, symbol: 'LINK' },
    { pattern: /\b(avax|avalanche|أفالانش)\b/i, symbol: 'AVAX' },
    // المعادن والسلع
    { pattern: /\b(xau|gold|ذهب)\b/i, symbol: 'XAU' },
    { pattern: /\b(xag|silver|فضة)\b/i, symbol: 'XAG' },
    { pattern: /\b(oil|wti|crude|نفط)\b/i, symbol: 'WTI' },
    // الفوركس
    { pattern: /\b(eurusd|eur\/usd|يورو)\b/i, symbol: 'EURUSD' },
    { pattern: /\b(gbpusd|gbp\/usd|جنيه)\b/i, symbol: 'GBPUSD' },
    { pattern: /\b(usdjpy|usd\/jpy|ين)\b/i, symbol: 'USDJPY' },
    // المؤشرات
    { pattern: /\b(spx|s&p|sp500|s&p\s*500)\b/i, symbol: 'SPX' },
    { pattern: /\b(ndx|nasdaq|ناسداك)\b/i, symbol: 'NDX' },
    { pattern: /\b(dji|dow\s*jones|داو)\b/i, symbol: 'DJI' },
    { pattern: /\b(dxy|dollar\s*index|دولار)\b/i, symbol: 'DXY' },
    // أسهم فردية
    { pattern: /\b(nvda|nvidia|إنفيديا)\b/i, symbol: 'NVDA' },
    { pattern: /\b(aapl|apple|أبل)\b/i, symbol: 'AAPL' },
    { pattern: /\b(tsla|tesla|تسلا)\b/i, symbol: 'TSLA' },
    { pattern: /\b(msft|microsoft|مايكروسوفت)\b/i, symbol: 'MSFT' },
    { pattern: /\b(amzn|amazon|أمازون)\b/i, symbol: 'AMZN' },
    { pattern: /\b(googl|google|جوجل)\b/i, symbol: 'GOOGL' },
    { pattern: /\b(meta|facebook|فيسبوك)\b/i, symbol: 'META' },
  ];
  for (const { pattern, symbol } of patterns) {
    if (pattern.test(lower) && !assets.includes(symbol)) {
      assets.push(symbol);
    }
  }
  return assets;
}

export function detectAsset(message: string, locale: Locale): DetectedAsset | null {
  const assets = detectMentionedAssets(message);
  return assets.length > 0 ? assets[0] : null;
}

export async function fetchAssetData(
  message: string,
  locale: Locale,
  userId?: string,
  sessionCookie?: string,
): Promise<FetchedData> {
  // V800+AI: Always use broad fetch — AI decides what's relevant
  return fetchBroadData(message, locale, userId, sessionCookie);
}

export async function fetchMultipleAssetData(
  message: string,
  locale: Locale,
  userId?: string,
  sessionCookie?: string,
): Promise<FetchedData> {
  // V800+AI: Always use broad fetch — AI decides what's relevant
  return fetchBroadData(message, locale, userId, sessionCookie);
}

// ─── Helper ──────────────────────────────────────────────────────
// V494: settledValue معرفة بالفعل في الأعلى — لا تكرر

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
  sessionCookie?: string,
): Promise<FetchedData> {
  const startTime = Date.now();
  const isAr = locale === 'ar';
  const sources: string[] = [];
  const knownNumbers = new Set<string>();

  // V485: اجلب بيانات المستخدم أولاً (قبل أي DB query قد تفشل)
  // المشكلة: fetchBroadPrices/Signals/Analyses/News تستدعي جداول غير موجودة
  // في roua-trading → الخطأ يُرمى → .catch() يرجع emptyFetchedData → الصفقات تُفقد
  // الحل: اجلب الصفقات أولاً، ثم حاول الباقي في try-catch منفصل
  const userData = await fetchRouaTradingUserData(userMessage, locale, userId, sessionCookie).catch((err) => {
    console.warn('[V485] fetchRouaTradingUserData failed:', err?.message?.slice(0, 80));
    return null;
  });
  const userPositions = userData?.positions ?? [];
  const userClosedTrades = userData?.closedTrades ?? [];
  const councilBriefs = userData?.councilBriefs ?? [];
  const userStats = userData?.stats ?? null;

  console.warn(`[V485] User data: ${userPositions.length} positions, ${councilBriefs.length} briefs, stats=${userStats ? 'yes' : 'no'}`);

  // V486: wrap كل شيء آخر في try-catch — حتى لو فشل، نرجع ببيانات المستخدم
  let prices: any[] = [];
  let signals: any[] = [];
  let analyses: any[] = [];
  let news: any[] = [];
  let reports: any[] = [];
  let pulse: any = null;
  let xref: any = null;
  let knowledge: any = null;
  let userProfile: any = null;
  let technicalIndicators: Record<string, TechnicalAnalysisResult | null> = {};
  let contextForAI = '';

  try {
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

  // V485: userData تم جلبه في بداية الدالة (قبل الـ DB queries التي قد تفشل)

  // V498: حساب المؤشرات الفنية (RSI, MACD, EMA, Support, Resistance) لكل أصل
  // يحول رموز الصفقات (BTC/USDT, EUR/USD) إلى رموز Yahoo (BTC, EURUSD)
  const technicalIndicators: Record<string, TechnicalAnalysisResult | null> = {};
  const symbolsForAnalysis = new Set<string>();

  // تحويل رموز الصفقات إلى رموز Yahoo Finance
  function normalizeSymbolForAnalysis(rawSymbol: string): string {
    // إزالة /USDT, /USD, USDT, USD
    let s = rawSymbol.toUpperCase().replace('/', '');
    // تحويل خاص
    const specialMap: Record<string, string> = {
      'BTCUSDT': 'BTC', 'ETHUSDT': 'ETH', 'SOLUSDT': 'SOL',
      'DOGEUSDT': 'DOGE', 'XRPUSDT': 'XRP', 'ADAUSDT': 'ADA',
      'BNBUSDT': 'BNB', 'XAUUSD': 'XAU', 'XAGUSD': 'XAG',
      'WTIUSD': 'WTI', 'BRENTUSD': 'BRENT',
      'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY',
      'USDCHF': 'USDCHF', 'AUDUSD': 'AUDUSD', 'USDCAD': 'USDCAD',
      'NZDUSD': 'NZDUSD',
      'SPX500USD': 'SPX', 'SPX500': 'SPX',
    };
    return specialMap[s] || s;
  }

  // أضف الأصول من صفقات المستخدم (لتحليل صفقاتي) — محولة
  for (const pos of userPositions) {
    const normalized = normalizeSymbolForAnalysis(pos.symbol);
    symbolsForAnalysis.add(normalized);
    console.warn(`[V498] Position symbol ${pos.symbol} → ${normalized}`);
  }

  // أضف الأصول المكتشفة من الأسعار
  for (const p of prices) {
    symbolsForAnalysis.add(p.symbol);
  }

  // اجلب المؤشرات الفنية لكل أصل (بالتوازي، حد أقصى 10)
  const symbolsList = [...symbolsForAnalysis].slice(0, 10);
  console.warn(`[V498] Computing technical indicators for: ${symbolsList.join(', ')}`);

  const indicatorPromises = symbolsList.map(async (symbol) => {
    try {
      const result = await performTechnicalAnalysis(symbol);
      console.warn(`[V498] ${symbol}: RSI=${result?.rsi ?? 'null'}, MACD=${result?.macd?.trend ?? 'null'}, support=${result?.support ?? 'null'}`);
      return { symbol, result };
    } catch (err: any) {
      console.warn(`[V498] Technical analysis failed for ${symbol}: ${err?.message?.slice(0, 60)}`);
      return { symbol, result: null };
    }
  });

  const indicatorResults = await Promise.all(indicatorPromises);
  for (const { symbol, result } of indicatorResults) {
    technicalIndicators[symbol] = result;
  }

  // ── Build formatted context for AI ──
  contextForAI = buildBroadContextForAI(
    { prices, signals, analyses, news, reports, pulse, xref, knowledge, userProfile, userPositions, userClosedTrades, councilBriefs, userStats, technicalIndicators },
    locale,
    isGCCQuery,
    regionalMarket,
  );

  } catch (err: any) {
    // V486: إذا فشل أي شيء، نستمر ببيانات المستخدم التي جلبناها في البداية
    console.warn('[V486] fetchBroadData partial failure (user data preserved):', err?.message?.slice(0, 100));

    // ابنِ contextForAI مبسط يحتوي فقط بيانات المستخدم
    const isAr = locale === 'ar';
    const parts: string[] = [];
    if (userPositions.length > 0) {
      parts.push(isAr ? `\n═══ 📊 صفقاتك المفتوحة (بيانات حقيقية) ═══` : `\n═══ 📊 Your Open Positions (real data) ═══`);
      for (const p of userPositions) {
        const pnlStr = p.unrealizedPnl >= 0 ? `+${p.unrealizedPnl.toFixed(2)}$` : `${p.unrealizedPnl.toFixed(2)}$`;
        parts.push(`• ${p.symbol} ${p.side} | دخول: ${p.entryPrice} | حالي: ${p.currentPrice} | PnL: ${pnlStr} | SL: ${p.stopLoss ?? 'غير محدد'} | TP: ${p.takeProfit ?? 'غير محدد'}`);
      }
    }
    if (userStats) {
      parts.push(isAr ? `\n═══ 📈 إحصائياتك ═══` : `\n═══ 📈 Your Stats ═══`);
      parts.push(`• صفقات: ${userStats.totalTrades} | فوز: ${userStats.wins} | خسارة: ${userStats.losses} | Win Rate: ${userStats.winRate}%`);
      parts.push(`• رصيد: ${userStats.displayedBalance}$ | مخاطرة: ${userStats.riskExposurePercent}%`);
    }
    contextForAI = parts.join('\n');
  }

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
    userPositions,
    userClosedTrades,
    councilBriefs,
    userStats,
    technicalIndicators,
    fetchTimeMs,
    dataPoints,
    sources,
    contextForAI,
    knownNumbers,
  };
}

// ─── V469: roua-trading User Data Fetcher ──────────────────────
// يجلب صفقات المستخدم + briefs المجلس + إحصائيات من NestJS backend

const NESTJS_API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

interface RouaTradingUserData {
  positions: UserPositionData[];
  closedTrades: UserClosedTradeData[];
  councilBriefs: CouncilBriefData[];
  stats: UserStatsData | null;
}

async function fetchRouaTradingUserData(
  message: string,
  locale: any,
  userId?: string,
  sessionCookie?: string,
): Promise<RouaTradingUserData | null> {
  // V490: logging في أول سطر — قبل أي شيء قد يفشل
  console.warn('[V490] fetchRouaTradingUserData START: userId=', userId || 'MISSING', 'cookie=', sessionCookie ? 'present' : 'MISSING', 'msg=', message.slice(0, 40));

  try {
    // V516 Fix 2: إزالة keyword gate — نجلب صفقات المستخدم دائماً
    // السبب: المساعد كان لا يحلل صفقات المستخدم إلا إذا قال "حلل صفقاتي"
    // هذا جعل الـ AI يحلل S&P 500 و Gold بدلاً من XRP/ADA/SOL التي يملكها المستخدم
    // الآن نجلب الصفقات دائماً، ونبقي gate فقط لـ councilBriefs (أثقل)
    const msgLower = message.toLowerCase();
    const needsCouncil = /مجلس|وكلاء|تصويت|إجماع|council|agents|vote|consensus/.test(msgLower);
    const needsStats = /أداء|أدائي|إحصائي|فوز|ربح|خسارة|performance|stats|win rate/.test(msgLower);

    console.warn('[V516] fetching user positions (always), council:', needsCouncil, 'stats:', needsStats);

    let effectiveUserId = userId;

    // V491: ALWAYS استخرج userId من session cookie (server-side truth)
    // widget userId من localStorage قد يكون قديم أو لمستخدم ضيف سابق
    // cookie session هو المصدر الحقيقي
    if (sessionCookie) {
      console.warn('[V491] Extracting userId from session cookie (server-side truth)...');
      const rawToken = sessionCookie.startsWith('roua_session=')
        ? sessionCookie.substring('roua_session='.length)
        : sessionCookie;
      const dbReady = await ensureDbReady();
      if (dbReady) {
        const session = await (db as any).session.findUnique({
          where: { token: rawToken },
          select: { userId: true, isActive: true, expiresAt: true },
        });
        if (session?.isActive && session?.expiresAt > new Date()) {
          // V491: OVERRIDE widget userId مع server-side userId
          if (effectiveUserId && effectiveUserId !== session.userId) {
            console.warn(`[V491] MISMATCH! widget userId=${effectiveUserId} but cookie userId=${session.userId} — using cookie (server-side truth)`);
          }
          effectiveUserId = session.userId;
          console.warn('[V491] Session lookup OK: userId=', effectiveUserId);
        } else {
          console.warn('[V491] Session invalid or expired');
        }
      }
    }

    console.warn('[V490] effectiveUserId=', effectiveUserId || 'STILL MISSING');

    if (!effectiveUserId) {
      console.warn('[V490] No userId — returning empty');
      return { positions: [], closedTrades: [], councilBriefs: [], stats: null };
    }

    // V516 Fix 2: دائماً نجلب الصفقات (إزالة needsPositions gate)
    let positions: UserPositionData[] = [];
    console.warn('[V516] Calling fetchRouaPositions (always)...');
    try {
      positions = await fetchRouaPositions(effectiveUserId);
      console.warn(`[V516] fetchRouaPositions returned ${positions.length} positions`);
    } catch (err: any) {
      console.warn('[V516] fetchRouaPositions ERROR:', err?.message?.slice(0, 100));
    }

    let councilBriefs: CouncilBriefData[] = [];
    if (needsCouncil) {
      try {
        councilBriefs = await fetchRouaCouncilBriefs(effectiveUserId);
      } catch (err: any) {
        console.warn('[V490] fetchRouaCouncilBriefs ERROR:', err?.message?.slice(0, 80));
      }
    }

    let stats: UserStatsData | null = null;
    if (needsStats) {
      try {
        stats = await fetchRouaUserStats(effectiveUserId);
      } catch (err: any) {
        console.warn('[V490] fetchRouaUserStats ERROR:', err?.message?.slice(0, 80));
      }
    }

    let closedTrades: UserClosedTradeData[] = [];
    if (needsStats) {
      try {
        closedTrades = await fetchRouaClosedTrades(effectiveUserId);
      } catch (err: any) {
        console.warn('[V490] fetchRouaClosedTrades ERROR:', err?.message?.slice(0, 80));
      }
    }

    console.warn(`[V490] DONE: ${positions.length} positions, ${councilBriefs.length} briefs, stats=${stats ? 'yes' : 'no'}`);
    return { positions, closedTrades, councilBriefs, stats };

  } catch (err: any) {
    console.error('[V490] fetchRouaTradingUserData CRASHED:', err?.message?.slice(0, 150));
    return { positions: [], closedTrades: [], councilBriefs: [], stats: null };
  }
}

/**
 * يبني headers مع session cookie
 */
function buildAuthHeaders(sessionCookie?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (sessionCookie) {
    // V481: استخراج token الخام
    const rawToken = sessionCookie.startsWith('roua_session=')
      ? sessionCookie.substring('roua_session='.length)
      : sessionCookie;

    // أرسل بكل الطرق الممكنة — NestJS AuthGuard يقبل إحداها
    headers['Cookie'] = `roua_session=${rawToken}`;
    headers['Authorization'] = `Bearer ${rawToken}`;
    headers['x-roua-session'] = rawToken;
  }
  return headers;
}

async function fetchRouaPositions(userId?: string): Promise<UserPositionData[]> {
  // V483: استخدم userId مباشرة — لا حاجة لـ session extraction
  try {
    if (!userId) {
      console.warn('[V483] fetchRouaPositions: no userId');
      return [];
    }

    const dbReady = await ensureDbReady();
    if (!dbReady) {
      console.warn('[V483] fetchRouaPositions: DB not ready');
      return [];
    }

    console.warn('[V483] fetchRouaPositions: querying for user', userId);

    const positions = await (db as any).position.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: {
        id: true, symbol: true, side: true,
        entryPrice: true, currentPrice: true, quantity: true,
        unrealizedPnl: true, stopLoss: true, takeProfit: true,
        openedAt: true, source: true,
      },
    });

    console.warn(`[V483] fetchRouaPositions: found ${positions.length} positions for user ${userId}`);

    return positions.map((p: any) => {
      const entry = Number(p.entryPrice) || 0;
      const current = p.currentPrice ? Number(p.currentPrice) : entry;
      const qty = Number(p.quantity) || 0;
      const pnl = Number(p.unrealizedPnl) || 0;
      const pnlPercent = entry > 0 && qty > 0
        ? (pnl / (entry * Math.abs(qty))) * 100 : 0;
      return {
        id: p.id, symbol: p.symbol, side: p.side,
        entryPrice: entry, currentPrice: current, quantity: qty,
        unrealizedPnl: pnl, unrealizedPnlPercent: pnlPercent,
        stopLoss: p.stopLoss ? Number(p.stopLoss) : null,
        takeProfit: p.takeProfit ? Number(p.takeProfit) : null,
        openedAt: p.openedAt,
        durationMinutes: p.openedAt
          ? Math.round((Date.now() - new Date(p.openedAt).getTime()) / 60000) : 0,
        source: p.source ?? null,
      };
    });
  } catch (err: any) {
    console.error('[V483] fetchRouaPositions error:', err?.message?.slice(0, 100));
    return [];
  }
}

async function fetchRouaClosedTrades(userId?: string): Promise<UserClosedTradeData[]> {
  // V482: Prisma direct query بدلًا من NestJS fetch
  try {
    if (!userId) return [];


    const positions = await (db as any).position.findMany({
      where: { userId: userId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      take: 10,
      select: {
        id: true, symbol: true, side: true,
        entryPrice: true, exitPrice: true, realizedPnl: true,
        closeReason: true, openedAt: true, closedAt: true,
      },
    });

    return positions.map((p: any) => {
      const entry = Number(p.entryPrice) || 0;
      const exit = p.exitPrice ? Number(p.exitPrice) : entry;
      const pnl = Number(p.realizedPnl) || 0;
      const result: 'WIN' | 'LOSS' | 'BREAKEVEN' =
        pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN';
      return {
        id: p.id, symbol: p.symbol, side: p.side,
        entryPrice: entry, exitPrice: exit, realizedPnl: pnl,
        result, closeReason: p.closeReason ?? null,
        openedAt: p.openedAt, closedAt: p.closedAt,
        durationMinutes: p.closedAt && p.openedAt
          ? Math.round((new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()) / 60000)
          : 0,
      };
    });
  } catch (err: any) {
    console.error('[V482] fetchRouaClosedTrades error:', err?.message?.slice(0, 80));
    return [];
  }
}

async function fetchRouaCouncilBriefs(userId?: string): Promise<CouncilBriefData[]> {
  // V482: Prisma direct query
  try {
    if (!userId) return [];


    // استعلم briefs النشطة للمستخدم + النظام
    const briefs = await (db as any).tradingBrief.findMany({
      where: {
        OR: [{ userId: userId }, { userId: null }],
        isActive: true,
        reviewStatus: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, pair: true, direction: true, confidence: true,
        timeframe: true, entryPrice: true, stopLoss: true, takeProfit: true,
        analysisSummary: true, isActive: true, createdAt: true, issuedAt: true,
      },
    });

    return briefs.map((b: any) => ({
      id: b.id,
      symbol: b.pair ?? b.symbol,
      direction: b.direction,
      confidence: Number(b.confidence) || 0,
      timeframe: b.timeframe ?? 'unknown',
      entryPrice: Number(b.entryPrice) || 0,
      stopLoss: Number(b.stopLoss) || 0,
      takeProfit: Number(b.takeProfit) || 0,
      analysisSummary: b.analysisSummary ?? null,
      isActive: b.isActive ?? true,
      createdAt: b.createdAt ?? b.issuedAt,
    }));
  } catch (err: any) {
    console.error('[V482] fetchRouaCouncilBriefs error:', err?.message?.slice(0, 80));
    return [];
  }
}


async function fetchRouaUserStats(userId?: string): Promise<UserStatsData | null> {
  try {
    if (!userId) return null;

    const dbReady = await ensureDbReady();
    if (!dbReady) return null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const closedPositions = await (db as any).position.findMany({
      where: { userId, status: 'CLOSED', closedAt: { gte: thirtyDaysAgo } },
      select: { realizedPnl: true },
    });

    const openPositions = await (db as any).position.findMany({
      where: { userId, status: 'OPEN' },
      select: { quantity: true, entryPrice: true },
    });

    const wins = closedPositions.filter((p: any) => Number(p.realizedPnl) > 0).length;
    const losses = closedPositions.filter((p: any) => Number(p.realizedPnl) < 0).length;
    const totalTrades = closedPositions.length;
    const totalPnl = closedPositions.reduce((s: number, p: any) => s + (Number(p.realizedPnl) || 0), 0);
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const settings = await (db as any).agentSettings.findUnique({
      where: { userId },
      select: { paperBalance: true },
    });
    const displayedBalance = Number(settings?.paperBalance) || 0;

    const usedMargin = openPositions.reduce((s: number, p: any) => {
      return s + Math.abs((Number(p.quantity) || 0) * (Number(p.entryPrice) || 0));
    }, 0);

    const riskExposurePercent = displayedBalance > 0 ? (usedMargin / displayedBalance) * 100 : 0;

    const grossProfit = closedPositions
      .filter((p: any) => Number(p.realizedPnl) > 0)
      .reduce((s: number, p: any) => s + Number(p.realizedPnl), 0);
    const grossLoss = Math.abs(closedPositions
      .filter((p: any) => Number(p.realizedPnl) < 0)
      .reduce((s: number, p: any) => s + Number(p.realizedPnl), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins > 0 ? 99 : 0;

    return {
      totalTrades, wins, losses,
      winRate: Math.round(winRate * 10) / 10,
      totalPnl: Math.round(totalPnl * 100) / 100,
      profitFactor: profitFactor === 99 ? 99 : Math.round(profitFactor * 100) / 100,
      displayedBalance, usedMargin,
      riskExposurePercent,
    };
  } catch (err: any) {
    console.error('[V483] fetchRouaUserStats error:', err?.message?.slice(0, 80));
    return null;
  }
}
