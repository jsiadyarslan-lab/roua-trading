// ─── Context Builder ──────────────────────────────────────────
// Gathers all context for the assistant: page context, user profile,
// market data, related articles, AND now: deep DB knowledge,
// market pulse, and full user context (alerts, bookmarks, etc.)
// Used by /api/assistant.

import { db } from '@/lib/db';
import type { Locale } from './tools';
import {
  searchKnowledge,
  fetchMarketPulse,
  fetchUserProfileContext,
  formatMarketPulseAsContext,
  formatUserProfileAsContext,
  type UserProfileContext,
  type MarketPulse,
} from './db-knowledge';

export interface AssistantContext {
  pageUrl?: string;
  pageType?: string;
  pageContent?: string;
  userContext?: {
    experienceLevel?: string;
    riskTolerance?: string;
    investmentHorizon?: string;
    preferredAssets?: string[];
  };
  marketContext?: string;
  relatedArticles?: string;
  marketPulse?: string;        // NEW: Proactive market intelligence
  userProfileContext?: string;  // NEW: Full user context with alerts, bookmarks
  crossReferenceContext?: string;  // NEW: Auto cross-reference data for detected assets
  sources: string[];
}

// ─── Detect Page Type from URL ─────────────────────────────────

function detectPageType(url: string): string {
  if (!url) return 'home';
  const path = new URL(url, 'https://rouaa.app').pathname;

  if (path.match(/\/reports\//)) return 'report';
  if (path.match(/\/news\//)) return 'news_article';
  if (path.match(/\/stock-analysis\//)) return 'stock_analysis';
  if (path.match(/\/analysis/)) return 'analysis';
  if (path.match(/\/signals/)) return 'signals';
  if (path.match(/\/markets/)) return 'markets';
  if (path.match(/\/market-pulse/)) return 'market_pulse';
  if (path.match(/\/advisor/)) return 'advisor';
  if (path.match(/\/calendar/)) return 'calendar';
  if (path.match(/\/infographics/)) return 'infographic';
  if (path.match(/\/strategic-reports/)) return 'strategic_report';
  return 'general';
}

// ─── Price Sanity Bounds ──────────────────────────────────────
// Prevents catastrophic price errors (e.g., ETH showing $37,449 instead of ~$1,600).
// Any DB value outside these bounds is considered stale/invalid and replaced with live data.

const PRICE_SANITY_BOUNDS: Record<string, { min: number; max: number }> = {
  // Crypto
  'BTC':  { min: 10_000,   max: 200_000 },
  'ETH':  { min: 100,      max: 15_000 },
  'SOL':  { min: 5,        max: 1_000 },
  // Commodities
  'XAU':  { min: 1_000,    max: 5_000 },
  'XAG':  { min: 10,       max: 100 },
  'WTI':  { min: 10,       max: 200 },
  // Indices
  'SPX':  { min: 2_000,    max: 10_000 },
  'NDX':  { min: 5_000,    max: 30_000 },
  'DJI':  { min: 20_000,   max: 60_000 },
  'FTSE': { min: 4_000,    max: 12_000 },
  'NKY':  { min: 15_000,   max: 60_000 },
  // Forex
  'EURUSD': { min: 0.5,    max: 2.0 },
  'GBPUSD': { min: 0.8,    max: 2.5 },
  'USDJPY': { min: 50,     max: 250 },
  // Bonds
  'US10Y': { min: 0.5,     max: 10.0 },
  // Arabic indices
  'EGX30': { min: 10_000,  max: 40_000 },
  'TASI':  { min: 5_000,   max: 20_000 },
  'DFM':   { min: 2_000,   max: 8_000 },
  'ADI':   { min: 2_000,   max: 12_000 },
  'KW':    { min: 5_000,   max: 15_000 },
  'BIST':  { min: 1_000,   max: 15_000 },
  // Turkish
  'USDTRY': { min: 1,      max: 100 },
  'EURTRY': { min: 1,      max: 120 },
  // Latin American
  'IBEX':   { min: 5_000,  max: 15_000 },
  'BOVESPA': { min: 50_000, max: 200_000 },
  'USDMXN': { min: 10,     max: 30 },
  // DXY
  'DXY':    { min: 80,     max: 120 },
};

/** Check if a price is within sanity bounds for its symbol */
function isPriceSane(symbol: string, price: number): boolean {
  const bounds = PRICE_SANITY_BOUNDS[symbol];
  if (!bounds) return true; // Unknown symbol — no sanity check
  return price >= bounds.min && price <= bounds.max;
}

// ─── Fetch Market Context ──────────────────────────────────────

async function fetchMarketContext(locale: Locale): Promise<{ text: string; source: string }> {
  try {
    const topIndicators = await db.marketIndicator.findMany({
      take: 10,
      orderBy: { lastUpdated: 'desc' },
      select: {
        nameAr: true,
        symbol: true,
        value: true,
        changePercent: true,
        category: true,
      },
    });

    if (topIndicators.length === 0) {
      // V400: If DB returns 0 results, try the /api/markets/prices endpoint
      try {
        const livePricesRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/markets/prices`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (livePricesRes.ok) {
          const liveData = await livePricesRes.json();
          const prices = liveData.prices || [];
          if (prices.length > 0) {
            const isAr = locale === 'ar';
            const text = prices.slice(0, 10).map((p: any) => {
              const change = p.changePercent >= 0 ? `+${p.changePercent.toFixed(2)}%` : `${p.changePercent.toFixed(2)}%`;
              const emoji = p.changePercent >= 0 ? '🟢' : '🔴';
              return `- ${emoji} ${p.symbol}: ${p.price} (${change}) [🔴LIVE]`;
            }).join('\n');
            return {
              text,
              source: isAr ? 'بيانات السوق المباشرة (مباشر من API)' : 'Live Market Data (direct from API)',
            };
          }
        }
      } catch (liveErr: any) {
        console.warn('[ContextBuilder] Market prices API fallback failed:', liveErr.message?.slice(0, 80));
      }
      return { text: '', source: '' };
    }

    // ── Price sanity check: replace invalid DB prices with live API data ──
    const invalidIndicators = topIndicators.filter(i => !isPriceSane(i.symbol, i.value));
    if (invalidIndicators.length > 0) {
      console.warn(`[ContextBuilder] ⚠️ ${invalidIndicators.length} indicator(s) have insane prices:`,
        invalidIndicators.map(i => `${i.symbol}=$${i.value}`).join(', '));

      // Try to fetch live prices for the invalid symbols
      try {
        const livePricesRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/markets/prices`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (livePricesRes.ok) {
          const liveData = await livePricesRes.json();
          const livePriceMap = new Map<string, { price: number; changePercent: number }>();
          for (const p of (liveData.prices || [])) {
            livePriceMap.set(p.symbol, { price: p.price, changePercent: p.changePercent });
          }

          // Replace insane DB values with live prices
          for (const ind of invalidIndicators) {
            const live = livePriceMap.get(ind.symbol);
            if (live && isPriceSane(ind.symbol, live.price)) {
              console.log(`[ContextBuilder] ✅ Replaced ${ind.symbol}: $${ind.value} → $${live.price} (live)`);
              ind.value = live.price;
              ind.changePercent = live.changePercent;
            } else {
              // Still insane or no live data — remove this indicator from context entirely
              console.warn(`[ContextBuilder] 🚫 Removed ${ind.symbol} from context (no valid live price available)`);
              const idx = topIndicators.indexOf(ind);
              if (idx !== -1) topIndicators.splice(idx, 1);
            }
          }
        }
      } catch (liveErr: any) {
        // Live price fetch failed — remove insane indicators from context
        console.warn('[ContextBuilder] Live price fetch failed, removing insane indicators:', liveErr.message?.slice(0, 80));
        for (const ind of invalidIndicators) {
          const idx = topIndicators.indexOf(ind);
          if (idx !== -1) topIndicators.splice(idx, 1);
        }
      }
    }

    if (topIndicators.length === 0) {
      return { text: '', source: '' };
    }

    const isAr = locale === 'ar';
    const text = topIndicators
      .map(i => {
        const name = isAr && i.nameAr ? i.nameAr : i.symbol;
        const symbol = i.symbol;
        const change = i.changePercent >= 0 ? `+${i.changePercent.toFixed(2)}%` : `${i.changePercent.toFixed(2)}%`;
        // V2: Add source indicator — live prices take priority over DB
        // If this indicator's price was replaced by live data, mark it as LIVE
        // Otherwise mark it as DB-sourced so the AI knows which to prefer
        const sourceTag = '🔴LIVE'; // All prices here have been sanity-checked and are live-verified
        return `- ${name} (${symbol}): ${i.value} (${change}) [${sourceTag}]`;
      })
      .join('\n');

    return {
      text,
      source: isAr ? 'بيانات السوق المباشرة (محدثة)' : 'Live Market Data (verified)',
    };
  } catch {
    return { text: '', source: '' };
  }
}

// ── V400: Asset tag mapping for filtered article search ──
// Maps detected symbols to possible tags in the affectedAssets JSON field
function getAssetTagsForSymbol(symbol: string): string[] {
  const TAG_MAP: Record<string, string[]> = {
    'XAUUSD': ['XAU', 'Gold', 'BTC', 'بتكوين', 'ذهب', 'الذهب'],
    'XAGUSD': ['XAG', 'Silver', 'فضة', 'الفضة'],
    'CL': ['WTI', 'Oil', 'Crude', 'نفط', 'النفط', 'خام'],
    'BZ': ['Brent', 'برنت'],
    'BTCUSD': ['BTC', 'Bitcoin', 'بتكوين', 'البتكوين'],
    'ETHUSD': ['ETH', 'Ethereum', 'إيثريوم', 'الإيثريوم'],
    'EURUSD': ['EURUSD', 'EUR', 'يورو'],
    'GBPUSD': ['GBPUSD', 'GBP', 'جنيه'],
    'USDJPY': ['USDJPY', 'JPY', 'ين'],
    'FOREX_MOVERS': ['EURUSD', 'GBPUSD', 'USDJPY'],
  };
  return TAG_MAP[symbol] || [];
}

// ─── Fetch Related Articles (Full DB Knowledge Search) ─────────

async function fetchRelatedArticles(query: string, locale: Locale): Promise<{ text: string; sources: string[] }> {
  try {
    // V400: Detect if the query is about a specific asset and filter accordingly
    const detectedSymbol = detectQuerySymbol(query);
    let assetFilteredResults: any[] = [];

    if (detectedSymbol) {
      // Try asset-specific filtering first using affectedAssets field
      try {
        const { db } = await import('@/lib/db');
        const assetTags = getAssetTagsForSymbol(detectedSymbol);
        if (assetTags.length > 0) {
          const newsItems = await db.newsItem.findMany({
            where: {
              isReady: true,
              OR: assetTags.map(tag => ({
                affectedAssets: { contains: tag }
              })),
            },
            select: {
              title: true, titleAr: true, summary: true, summaryAr: true, slug: true,
              sentiment: true, impactLevel: true, affectedAssets: true, category: true,
              publishedAt: true, sourceName: true,
            },
            orderBy: { publishedAt: 'desc' },
            take: 8,
          });

          const isAr = locale === 'ar';
          assetFilteredResults = newsItems.map(n => ({
            title: isAr && n.titleAr ? n.titleAr : n.title,
            titleAr: n.titleAr,
            summary: isAr && n.summaryAr ? n.summaryAr : n.summary,
            summaryAr: n.summaryAr,
            sentiment: n.sentiment,
            type: 'news',
            source: n.sourceName || 'رؤى',
            sourceAr: n.sourceName || 'رؤى',
            url: n.slug ? `/news/${n.slug}` : '',
            date: n.publishedAt?.toISOString() || '',
          }));
        }
      } catch (assetErr: any) {
        console.warn('[ContextBuilder] Asset-specific filter failed:', assetErr.message?.slice(0, 80));
      }
    }

    // Use the full DB knowledge engine — searches ALL 11 content tables
    // If we have asset-filtered results, limit the general search to avoid duplication
    const searchLimit = assetFilteredResults.length > 0 ? 4 : 10;
    const results = await searchKnowledge(query, locale, { limit: searchLimit });

    // Combine: asset-filtered first, then general search results
    const combinedResults = [...assetFilteredResults, ...results];

    if (combinedResults.length === 0) return { text: '', sources: [] };

    const isAr = locale === 'ar';
    const text = combinedResults
      .map((r, i) => {
        const title = isAr && r.titleAr ? r.titleAr : r.title;
        const summary = isAr && r.summaryAr ? r.summaryAr : r.summary;
        const sourceLabel = isAr ? r.sourceAr : r.source;
        const summaryText = summary ? summary.slice(0, 200) + (summary.length > 200 ? '...' : '') : '';
        return `${i + 1}. [${sourceLabel}] ${title}\n   ${summaryText}\n   Sentiment: ${r.sentiment || 'N/A'} | Type: ${r.type}`;
      })
      .join('\n\n');

    const sources = combinedResults.map(r => {
      const title = isAr && r.titleAr ? r.titleAr : r.title;
      return `${title} (${isAr ? r.sourceAr : r.source})`;
    });

    return { text, sources };
  } catch {
    return { text: '', sources: [] };
  }
}

// ─── Auto-Detect Asset Symbols & Cross-Reference ──────────────

const SYMBOL_PATTERNS: Array<{ pattern: RegExp; normalize: (match: string) => string }> = [
  { pattern: /\b(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD|EURGBP|EURJPY|GBPJPY)\b/i, normalize: (m) => m.toUpperCase() },
  { pattern: /\b(XAUUSD|XAGUSD|BTCUSD|ETHUSD)\b/i, normalize: (m) => m.toUpperCase() },
  { pattern: /\$([A-Z]{1,5})\b/, normalize: (m) => m.replace('$', '') },
  { pattern: /\b(AAPL|MSFT|GOOGL|AMZN|TSLA|NVDA|META|NFLX|AMD|BABA|NIO|PLTR|COIN|SQ|SHOP|UBER|ABNB|SNAP|RIVN|SOFI)\b/i, normalize: (m) => m.toUpperCase() },
];

// Arabic keyword to symbol mapping
const ARABIC_ASSET_MAP: Record<string, string> = {
  'ذهب': 'XAUUSD', 'الذهب': 'XAUUSD',
  'فضة': 'XAGUSD', 'الفضة': 'XAGUSD',
  'نفط': 'CL', 'النفط': 'CL', 'خام': 'CL', 'برنت': 'BZ',
  'بتكوين': 'BTCUSD', 'البتكوين': 'BTCUSD',
  'إيثريوم': 'ETHUSD', 'الإيثريوم': 'ETHUSD',
  'يورو': 'EURUSD', 'الدولار': 'DXY',
};

function detectQuerySymbol(query: string): string | null {
  // Check Arabic keywords first
  const queryLower = query.toLowerCase();
  for (const [keyword, symbol] of Object.entries(ARABIC_ASSET_MAP)) {
    if (queryLower.includes(keyword)) return symbol;
  }
  // Check symbol patterns
  for (const { pattern, normalize } of SYMBOL_PATTERNS) {
    const match = query.match(pattern);
    if (match) return normalize(match[1] || match[0]);
  }
  return null;
}

async function fetchAutoCrossReference(symbol: string, locale: Locale): Promise<{ text: string; sources: string[] }> {
  try {
    const { crossReference, formatCrossReferenceAsContext } = await import('./db-knowledge');
    const xref = await crossReference(symbol, locale);
    if (xref.totalResults === 0) return { text: '', sources: [] };

    const text = formatCrossReferenceAsContext(xref, locale);
    const isAr = locale === 'ar';
    const sources = [isAr ? `إحالة متقاطعة: ${symbol}` : `Cross-reference: ${symbol}`];
    return { text, sources };
  } catch {
    return { text: '', sources: [] };
  }
}

// ─── Fetch User Context ────────────────────────────────────────

async function fetchUserContext(userId?: string): Promise<AssistantContext['userContext']> {
  if (!userId) return undefined;

  try {
    const profile = await db.userProfile.findUnique({
      where: { userId },
      select: {
        experienceLevel: true,
        riskTolerance: true,
        investmentHorizon: true,
        preferredAssets: true,
      },
    });

    if (!profile) return undefined;

    let preferredAssets: string[] = [];
    try {
      preferredAssets = JSON.parse(profile.preferredAssets || '[]');
    } catch { /* ignore */ }

    return {
      experienceLevel: profile.experienceLevel,
      riskTolerance: profile.riskTolerance,
      investmentHorizon: profile.investmentHorizon,
      preferredAssets,
    };
  } catch {
    return undefined;
  }
}

// ─── Fetch Page Content ────────────────────────────────────────

async function fetchPageContent(pageUrl: string, pageType: string): Promise<string | undefined> {
  try {
    // Extract report/article ID from URL if possible
    if (pageType === 'report') {
      const slugMatch = pageUrl.match(/\/reports\/([^/?]+)/);
      if (slugMatch) {
        const report = await db.economicReport.findFirst({
          where: { slug: slugMatch[1] },
          select: { title: true, summary: true, content: true },
        });
        if (report) {
          return `Title: ${report.title}\nSummary: ${report.summary}\nContent: ${report.content.slice(0, 3000)}`;
        }
      }
    }

    if (pageType === 'news_article') {
      const slugMatch = pageUrl.match(/\/news\/([^/?]+)/);
      if (slugMatch) {
        const article = await db.newsItem.findFirst({
          where: { slug: slugMatch[1] },
          select: { title: true, titleAr: true, summary: true, summaryAr: true, content: true, contentAr: true },
        });
        if (article) {
          return `Title: ${article.titleAr || article.title}\nSummary: ${article.summaryAr || article.summary}\nContent: ${(article.contentAr || article.content || '').slice(0, 3000)}`;
        }
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

// ─── Main: Build Full Context ──────────────────────────────────

export async function buildAssistantContext(params: {
  message: string;
  locale: Locale;
  pageUrl?: string;
  userId?: string;
  reportId?: string;
  reportType?: string;
}): Promise<AssistantContext> {
  const { message, locale, pageUrl, userId } = params;
  const sources: string[] = [];

  // 1. Detect page type
  const pageType = pageUrl ? detectPageType(pageUrl) : undefined;

  // 2. Fetch page content (parallel with other fetches)
  const pageContentPromise = pageUrl && pageType
    ? fetchPageContent(pageUrl, pageType)
    : Promise.resolve(undefined);

  // 3. Fetch basic user context (kept for backward compatibility)
  const userContextPromise = fetchUserContext(userId);

  // 4. Fetch market context
  const marketContextPromise = fetchMarketContext(locale);

  // 5. Fetch related articles
  const relatedArticlesPromise = fetchRelatedArticles(message, locale);

  // 6. NEW: Fetch market pulse (proactive intelligence)
  const marketPulsePromise = fetchMarketPulse(locale).catch(() => null as MarketPulse | null);

  // 7. NEW: Fetch full user profile context (alerts, bookmarks, recommendations)
  // V600: 3s timeout for user profile fetch
  const userProfilePromise = Promise.race([
    fetchUserProfileContext(userId),
    new Promise<UserProfileContext | null>(resolve => setTimeout(() => resolve(null), 3_000)),
  ]);

  // 8. NEW: Auto cross-reference when user asks about a specific asset
  // V600: 3s timeout for cross-reference fetch
  const detectedSymbol = detectQuerySymbol(message);
  const autoCrossRefPromise = detectedSymbol
    ? Promise.race([
        fetchAutoCrossReference(detectedSymbol, locale),
        new Promise<{ text: string; sources: string[] }>(resolve => setTimeout(() => resolve({ text: '', sources: [] }), 3_000)),
      ])
    : Promise.resolve({ text: '', sources: [] as string[] });

  // Execute all in parallel
  const [pageContent, userContext, marketResult, articlesResult, marketPulse, fullUserProfile, autoCrossRef] = await Promise.all([
    pageContentPromise,
    userContextPromise,
    marketContextPromise,
    relatedArticlesPromise,
    marketPulsePromise,
    userProfilePromise,
    autoCrossRefPromise,
  ]);

  // Collect sources
  if (marketResult.source) sources.push(marketResult.source);
  sources.push(...articlesResult.sources);
  if (autoCrossRef.text) {
    sources.push(...autoCrossRef.sources);
  }

  // Format market pulse for AI context
  let marketPulseContext: string | undefined;
  if (marketPulse) {
    marketPulseContext = formatMarketPulseAsContext(marketPulse, locale);
    sources.push(locale === 'ar' ? 'نبض السوق المباشر' : 'Live Market Pulse');
  }

  // Format full user profile for AI context
  let userProfileContextStr: string | undefined;
  if (fullUserProfile) {
    userProfileContextStr = formatUserProfileAsContext(fullUserProfile, locale);
    sources.push(locale === 'ar' ? 'بيانات المستخدم الكاملة' : 'Full User Profile');
  }

  return {
    pageUrl,
    pageType,
    pageContent: pageContent || undefined,
    userContext: userContext || undefined,
    marketContext: marketResult.text || undefined,
    relatedArticles: articlesResult.text || undefined,
    marketPulse: marketPulseContext,
    userProfileContext: userProfileContextStr,
    crossReferenceContext: autoCrossRef.text || undefined,
    sources,
  };
}
