// ─── Stock Tool Implementations ────────────────────────────────
// Handlers for stock analysis tools used by the assistant.
// Reuses existing infrastructure: fmp-api, yahoo-finance, technical-analysis, db.

import { db } from '@/lib/db';
import { getCompanyProfile, getStockQuote, getKeyMetrics, getKeyMetricsTTM, getStockRating, getIncomeStatements, getIncomeStatementsTTM, getStockPeers } from '@/lib/fmp-api';
import { fetchYahooAllData } from '@/lib/yahoo-finance';
import { performTechnicalAnalysis } from '@/lib/technical-analysis';
import { getQuote, getHistoricalData } from '@/lib/financial-apis';
import type { Locale } from './tools';

// ─── Asset Impact Detection ────────────────────────────────────
// Maps keywords in article content to affected assets and their expected impact.

interface AssetImpactEntry {
  name: string;
  nameAr: string;
  impact: 'high' | 'medium' | 'low';
  direction: 'up' | 'down' | 'neutral';
  estimatedChange: string;
  estimatedChangeAr: string;
}

interface ScenarioEntry {
  name: string;
  nameAr: string;
  probability: string;
  description: string;
  descriptionAr: string;
}

interface RelatedReportEntry {
  title: string;
  slug: string;
  relevance: 'high' | 'medium';
}

// Keyword → asset impact mapping
const ASSET_KEYWORD_MAP: Array<{
  keywords: string[];
  keywordsAr: string[];
  assets: AssetImpactEntry[];
}> = [
  {
    keywords: ['oil', 'crude', 'brent', 'wti', 'opec', 'petroleum', 'strait of hormuz'],
    keywordsAr: ['نفط', 'خام', 'برنت', 'أوبك', 'بترول', 'مضيق هرمز', 'إمدادات النفط'],
    assets: [
      { name: 'Brent Crude', nameAr: 'خام برنت', impact: 'high', direction: 'up', estimatedChange: '+15-20%', estimatedChangeAr: '+15-20%' },
      { name: 'XLE (Energy ETF)', nameAr: 'صندوق الطاقة XLE', impact: 'medium', direction: 'up', estimatedChange: '+8-12%', estimatedChangeAr: '+8-12%' },
      { name: 'Airlines', nameAr: 'أسهم الطيران', impact: 'medium', direction: 'down', estimatedChange: '-10-15%', estimatedChangeAr: '-10-15%' },
    ],
  },
  {
    keywords: ['gold', 'xau', 'precious metal', 'safe haven'],
    keywordsAr: ['ذهب', 'معادن ثمينة', 'ملاذ آمن'],
    assets: [
      { name: 'Gold (XAU)', nameAr: 'الذهب', impact: 'high', direction: 'up', estimatedChange: '+5-10%', estimatedChangeAr: '+5-10%' },
      { name: 'Silver (XAG)', nameAr: 'الفضة', impact: 'medium', direction: 'up', estimatedChange: '+3-8%', estimatedChangeAr: '+3-8%' },
    ],
  },
  {
    keywords: ['bitcoin', 'crypto', 'cryptocurrency', 'btc', 'digital asset'],
    keywordsAr: ['بتكوين', 'عملات رقمية', 'عملات مشفرة', 'كريبتو'],
    assets: [
      { name: 'Bitcoin (BTC)', nameAr: 'البتكوين', impact: 'high', direction: 'up', estimatedChange: '+10-25%', estimatedChangeAr: '+10-25%' },
      { name: 'Ethereum (ETH)', nameAr: 'الإيثريوم', impact: 'medium', direction: 'up', estimatedChange: '+8-20%', estimatedChangeAr: '+8-20%' },
    ],
  },
  {
    keywords: ['interest rate', 'fed', 'federal reserve', 'rate hike', 'rate cut', 'monetary policy'],
    keywordsAr: ['فائدة', 'احتياطي فيدرالي', 'رفع الفائدة', 'خفض الفائدة', 'سياسة نقدية'],
    assets: [
      { name: 'USD', nameAr: 'الدولار', impact: 'high', direction: 'up', estimatedChange: '+2-5%', estimatedChangeAr: '+2-5%' },
      { name: 'Bonds', nameAr: 'السندات', impact: 'high', direction: 'down', estimatedChange: '-3-7%', estimatedChangeAr: '-3-7%' },
      { name: 'Gold (XAU)', nameAr: 'الذهب', impact: 'medium', direction: 'down', estimatedChange: '-3-5%', estimatedChangeAr: '-3-5%' },
    ],
  },
  {
    keywords: ['inflation', 'cpi', 'consumer price', 'price index'],
    keywordsAr: ['تضخم', 'أسعار المستهلكين', 'مؤشر الأسعار'],
    assets: [
      { name: 'Gold (XAU)', nameAr: 'الذهب', impact: 'high', direction: 'up', estimatedChange: '+3-8%', estimatedChangeAr: '+3-8%' },
      { name: 'Real Estate', nameAr: 'العقارات', impact: 'medium', direction: 'up', estimatedChange: '+2-5%', estimatedChangeAr: '+2-5%' },
    ],
  },
  {
    keywords: ['recession', 'economic slowdown', 'downturn', 'contraction'],
    keywordsAr: ['ركود', 'تباطؤ اقتصادي', 'انكماش'],
    assets: [
      { name: 'S&P 500', nameAr: 'مؤشر S&P 500', impact: 'high', direction: 'down', estimatedChange: '-10-20%', estimatedChangeAr: '-10-20%' },
      { name: 'Gold (XAU)', nameAr: 'الذهب', impact: 'medium', direction: 'up', estimatedChange: '+5-10%', estimatedChangeAr: '+5-10%' },
      { name: 'VIX', nameAr: 'مؤشر الخوف VIX', impact: 'high', direction: 'up', estimatedChange: '+30-50%', estimatedChangeAr: '+30-50%' },
    ],
  },
];

// Detect affected assets from content
function detectAssetImpacts(content: string, title: string): AssetImpactEntry[] {
  const combined = (content + ' ' + title).toLowerCase();
  const impacts: AssetImpactEntry[] = [];

  for (const mapping of ASSET_KEYWORD_MAP) {
    const matched = mapping.keywords.some(k => combined.includes(k.toLowerCase())) ||
                    mapping.keywordsAr.some(k => combined.includes(k));
    if (matched) {
      impacts.push(...mapping.assets);
    }
  }

  // Adjust direction based on negative keywords
  const negativeKeywords = ['crisis', 'war', 'conflict', 'sanctions', 'block', 'disruption', 'shortage', 'fear'];
  const negativeAr = ['أزمة', 'حرب', 'نزاع', 'عقوبات', 'حصار', 'نقص', 'خوف', 'توتر'];
  const isNegative = negativeKeywords.some(k => combined.includes(k)) || negativeAr.some(k => combined.includes(k));

  // For safe-haven assets, negative news = price up
  if (isNegative) {
    for (const impact of impacts) {
      if (impact.name.includes('Gold') || impact.name.includes('VIX') || impact.name.includes('XAU')) {
        impact.direction = 'up';
      }
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return impacts.filter(a => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });
}

// Detect scenarios from content
function detectScenarios(content: string, title: string, locale: Locale): ScenarioEntry[] {
  const combined = (content + ' ' + title).toLowerCase();
  const isAr = locale === 'ar';
  const scenarios: ScenarioEntry[] = [];

  // Oil crisis scenario
  if (combined.includes('oil') || combined.includes('نفط') || combined.includes('hormuz') || combined.includes('هرمز')) {
    scenarios.push(
      {
        name: 'Bullish', nameAr: 'صاعد',
        probability: '60%',
        description: 'Strait remains blocked for another month → Brent $120-130',
        descriptionAr: 'استمرار إغلاق المضيق شهراً إضافياً ← برنت 120-130$',
      },
      {
        name: 'Bearish', nameAr: 'هابط',
        probability: '40%',
        description: 'US-Iran deal within 2 weeks → Brent $85-90',
        descriptionAr: 'اتفاق أمريكي-إيراني خلال أسبوعين ← برنت 85-90$',
      },
    );
  }
  // Gold scenario
  else if (combined.includes('gold') || combined.includes('ذهب') || combined.includes('xau')) {
    scenarios.push(
      {
        name: 'Bullish', nameAr: 'صاعد',
        probability: '55%',
        description: 'Geopolitical tensions escalate → Gold $2,400+',
        descriptionAr: 'تصعيد التوترات الجيوسياسية ← ذهب فوق 2400$',
      },
      {
        name: 'Bearish', nameAr: 'هابط',
        probability: '45%',
        description: 'De-escalation and rate hikes → Gold $2,200',
        descriptionAr: 'تراجع التوترات ورفع الفائدة ← ذهب 2200$',
      },
    );
  }
  // Generic market scenario
  else if (combined.includes('market') || combined.includes('سوق') || combined.includes('stock') || combined.includes('أسهم')) {
    scenarios.push(
      {
        name: 'Optimistic', nameAr: 'متفائل',
        probability: '50%',
        description: 'Positive resolution stabilizes markets',
        descriptionAr: 'حل إيجابي يستقر الأسواق',
      },
      {
        name: 'Pessimistic', nameAr: 'متشائم',
        probability: '50%',
        description: 'Escalation leads to further volatility',
        descriptionAr: 'التصعيد يؤدي لمزيد من التقلبات',
      },
    );
  }

  return scenarios;
}

// Search for related reports in DB
async function findRelatedReports(content: string, title: string): Promise<RelatedReportEntry[]> {
  try {
    const terms = (title + ' ' + content.slice(0, 500)).split(/\s+/)
      .filter(t => t.length > 3)
      .slice(0, 4);

    if (terms.length === 0) return [];

    const searchConditions = terms.flatMap(term => [
      { title: { contains: term, mode: 'insensitive' as const } },
      { titleAr: { contains: term, mode: 'insensitive' as const } },
    ]);

    // Search in economic reports
    const reports = await db.economicReport.findMany({
      where: { OR: searchConditions },
      select: { title: true, slug: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return reports.map(r => ({
      title: r.title,
      slug: r.slug,
      relevance: 'medium' as const,
    }));
  } catch {
    return [];
  }
}

// Calculate confidence score based on content quality
function calculateConfidence(content: string, sentiment?: string | null): number {
  let score = 60; // Base

  // More content = higher confidence
  if (content.length > 1000) score += 10;
  if (content.length > 3000) score += 5;

  // Sentiment data available
  if (sentiment) score += 5;

  // Specific numbers mentioned
  const numberMatches = content.match(/\$?\d+\.?\d*/g);
  if (numberMatches && numberMatches.length > 3) score += 10;

  return Math.min(score, 95);
}

// ─── 1. Get Stock Fundamentals ─────────────────────────────────

export async function getStockFundamentals(symbol: string): Promise<Record<string, any>> {
  try {
    const [profile, quote, metricsAnnual, metricsTTM, rating, income, incomeTTM, peers] = await Promise.allSettled([
      getCompanyProfile(symbol),
      getStockQuote(symbol),
      getKeyMetrics(symbol),
      getKeyMetricsTTM(symbol),
      getStockRating(symbol),
      getIncomeStatements(symbol, 4),
      getIncomeStatementsTTM(symbol),
      getStockPeers(symbol),
    ]);

    const companyProfile = profile.status === 'fulfilled' ? profile.value : null;
    const stockQuote = quote.status === 'fulfilled' ? quote.value : null;
    const keyMetricsAnnual = metricsAnnual.status === 'fulfilled' ? metricsAnnual.value : null;
    const keyMetricsTTM = metricsTTM.status === 'fulfilled' ? metricsTTM.value : null;
    const stockRating = rating.status === 'fulfilled' ? rating.value : null;
    const incomeStatements = income.status === 'fulfilled' ? income.value : null;
    const ttmIncome = incomeTTM.status === 'fulfilled' ? incomeTTM.value : null;
    const peersList = peers.status === 'fulfilled' ? peers.value : [];

    // Prefer TTM metrics over annual — they are more current
    const keyMetrics = keyMetricsTTM || keyMetricsAnnual;

    // ── Compute sector P/E from peers (for comparison) ──
    let sectorPeRatio: number | null = null;
    let sectorComparison: Record<string, any> | null = null;
    try {
      if (peersList.length > 0) {
        // Fetch quotes for top 5 peers to compute sector average P/E
        const peerQuotes = await Promise.allSettled(
          peersList.slice(0, 5).map(p => getStockQuote(p))
        );
        const validPeerPEs = peerQuotes
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value.peRatioTTM || r.value.peRatio)
          .filter((pe: number) => pe > 0 && pe < 500); // Filter out extreme outliers

        if (validPeerPEs.length >= 2) {
          sectorPeRatio = Math.round((validPeerPEs.reduce((a: number, b: number) => a + b, 0) / validPeerPEs.length) * 10) / 10;
          const currentPE = stockQuote?.peRatioTTM || stockQuote?.peRatio || keyMetrics?.per || 0;
          if (currentPE > 0 && sectorPeRatio > 0) {
            const premium = Math.round(((currentPE - sectorPeRatio) / sectorPeRatio) * 100);
            sectorComparison = {
              sectorPeRatio,
              stockPE: currentPE,
              premiumDiscount: premium,
              premiumLabel: premium > 0 ? 'premium' : 'discount',
              interpretation: premium > 0
                ? `Trading at ${premium}% premium to sector (P/E ${currentPE} vs sector avg ${sectorPeRatio})`
                : premium < 0
                  ? `Trading at ${Math.abs(premium)}% discount to sector (P/E ${currentPE} vs sector avg ${sectorPeRatio})`
                  : `Trading in line with sector average (P/E ${currentPE})`,
              peers: peersList.slice(0, 5),
            };
          }
        }
      }
    } catch { /* sector comparison is optional — don't fail if it errors */ }

    if (!companyProfile && !stockQuote) {
      const yahooData = await fetchYahooAllData(symbol).catch(() => null);
      if (yahooData) {
        return {
          symbol,
          source: 'yahoo_finance',
          company: yahooData.profile?.longName || symbol,
          sector: yahooData.profile?.sector || 'N/A',
          industry: yahooData.profile?.industry || 'N/A',
          price: yahooData.quote?.regularMarketPrice || 0,
          change: yahooData.quote?.regularMarketChangePercent || 0,
          marketCap: yahooData.quote?.marketCap || 0,
          peRatio: yahooData.summaryDetail?.trailingPE || null,
          eps: yahooData.financialData?.earningsGrowth || null,
          dividendYield: yahooData.summaryDetail?.dividendYield || null,
          beta: yahooData.summaryDetail?.beta || null,
          description: (yahooData.profile?.longBusinessSummary || '').slice(0, 500),
        };
      }
    }

    // Determine which data period we're using
    const metricsPeriod = keyMetricsTTM ? 'TTM' : 'annual';
    const peRatioTTM = stockQuote?.peRatioTTM || keyMetricsTTM?.per || null;
    const peRatioAnnual = stockQuote?.peRatio || keyMetricsAnnual?.per || null;

    return {
      symbol,
      source: 'fmp',
      dataPeriod: metricsPeriod,
      company: companyProfile?.name || symbol,
      sector: companyProfile?.sector || 'N/A',
      industry: companyProfile?.industry || 'N/A',
      price: stockQuote?.price || 0,
      change: stockQuote?.changePercent || 0,
      marketCap: stockQuote?.marketCap || companyProfile?.marketCap || 0,
      // P/E ratios — TTM preferred for current valuation
      peRatio: peRatioTTM || peRatioAnnual || null,
      peRatioTTM: peRatioTTM,
      peRatioAnnual: peRatioAnnual,
      eps: stockQuote?.eps || null,
      roe: keyMetrics?.roe || null,
      roa: keyMetrics?.roa || null,
      debtToEquity: keyMetrics?.debtToEquity || null,
      grossMargin: keyMetrics?.grossMargin || null,
      netMargin: keyMetrics?.netMargin || null,
      revenueGrowth: keyMetrics?.revenueGrowth || null,
      earningsGrowth: keyMetrics?.earningsGrowth || null,
      dividendYield: keyMetrics?.dividendYield || null,
      beta: keyMetrics?.beta || null,
      rating: stockRating?.rating || null,
      ratingScore: stockRating?.ratingScore || null,
      priceTarget: stockRating?.priceTargets || null,
      dcf: stockRating?.dcf || null,
      // ── Sector comparison (NEW) ──
      sectorComparison,
      // ── TTM Revenue & Earnings (most current data) ──
      ttmRevenue: ttmIncome ? {
        date: ttmIncome.date || 'TTM',
        revenue: ttmIncome.revenue,
        grossProfit: ttmIncome.grossProfit,
        operatingIncome: ttmIncome.operatingIncome,
        netIncome: ttmIncome.netIncome,
        eps: ttmIncome.eps,
      } : null,
      // ── Annual Revenue trend (for historical comparison) ──
      recentRevenue: incomeStatements?.slice(0, 4).map((s: any) => ({
        date: s.date,
        revenue: s.revenue,
        netIncome: s.netIncome,
        eps: s.eps,
      })) || null,
      description: (companyProfile?.description || '').slice(0, 500),
      // ── Data sources for attribution ──
      sources: {
        profile: companyProfile ? 'FMP Company Profile' : null,
        quote: stockQuote ? 'FMP Real-time Quote' : null,
        metrics: keyMetricsTTM ? 'FMP Key Metrics (TTM)' : keyMetricsAnnual ? 'FMP Key Metrics (Annual)' : null,
        rating: stockRating ? 'FMP Analyst Rating' : null,
        incomeTTM: ttmIncome ? 'FMP Income Statement (TTM)' : null,
        incomeStatements: incomeStatements ? 'FMP Income Statements (Annual)' : null,
        peers: peersList.length > 0 ? 'FMP Stock Peers' : null,
      },
    };
  } catch (error: any) {
    return { symbol, error: error.message || 'Failed to fetch fundamentals' };
  }
}

// ─── 2. Get Stock Technical ────────────────────────────────────

export async function getStockTechnical(symbol: string): Promise<Record<string, any>> {
  try {
    const historicalData = await getHistoricalData(symbol, 180);

    if (!historicalData || historicalData.length < 20) {
      return { symbol, error: 'Insufficient historical data for technical analysis' };
    }

    const quoteData = await getQuote(symbol).catch(() => null);
    const currentPrice = quoteData?.price || historicalData[historicalData.length - 1]?.close || 0;
    const changePercent = quoteData?.changePercent || 0;

    const ohlcvData = historicalData.map((d: any) => ({
      date: d.date || d.timestamp || '',
      open: d.open || 0,
      high: d.high || 0,
      low: d.low || 0,
      close: d.close || 0,
      volume: d.volume || 0,
    }));

    const analysis = performTechnicalAnalysis(ohlcvData, symbol, currentPrice, changePercent);

    return {
      symbol,
      currentPrice: analysis.currentPrice,
      changePercent: analysis.changePercent,
      overallSignal: analysis.overallSignal,
      overallScore: analysis.overallScore,
      trend: {
        direction: analysis.trend.direction,
        strength: analysis.trend.strength,
        descriptionAr: analysis.trend.descriptionAr,
        descriptionEn: analysis.trend.descriptionEn,
      },
      supportLevels: analysis.supportLevels.map((l: any) => ({
        price: l.price,
        strength: l.strength,
        label: l.labelAr,
      })),
      resistanceLevels: analysis.resistanceLevels.map((l: any) => ({
        price: l.price,
        strength: l.strength,
        label: l.labelAr,
      })),
      movingAverages: {
        sma20: analysis.movingAverages.sma20,
        sma50: analysis.movingAverages.sma50,
        crossover: analysis.movingAverages.crossover,
        priceVsSMA20: analysis.movingAverages.priceVsSMA20,
        priceVsSMA50: analysis.movingAverages.priceVsSMA50,
      },
      indicators: analysis.indicators.map((i: any) => ({
        name: i.name,
        value: i.value,
        signal: i.signal,
        descriptionAr: i.descriptionAr,
        descriptionEn: i.descriptionEn,
      })),
      tradeSetup: {
        direction: analysis.tradeSetup.direction,
        entryPrice: analysis.tradeSetup.entryPrice,
        stopLoss: analysis.tradeSetup.stopLoss,
        targetPrice: analysis.tradeSetup.targetPrice,
        riskRewardRatio: analysis.tradeSetup.riskRewardRatio,
        confidence: analysis.tradeSetup.confidence,
        reasoningAr: analysis.tradeSetup.reasoningAr,
        reasoningEn: analysis.tradeSetup.reasoningEn,
      },
      volatility: analysis.volatility,
      summaryAr: analysis.summaryAr,
      summaryEn: analysis.summaryEn,
    };
  } catch (error: any) {
    return { symbol, error: error.message || 'Failed to fetch technical analysis' };
  }
}

// ─── 3. Get Stock News ─────────────────────────────────────────

// ── Relevance scoring for news articles ──
// Prevents false positives like "Blue Gold" (tequila) or "gold medal" (World Cup)
// when searching for the precious metal.

interface ScoredArticle {
  article: any;
  score: number;
}

// Terms that indicate the article is NOT about financial gold/commodities
const FINANCIAL_NEGATIVE_CONTEXTS: Record<string, string[]> = {
  Gold: ['world cup', 'medal', 'olympic', 'tequila', 'blue gold', 'golden globe', 'golden state', 'goldman', 'goldsmith', 'fishing', 'recipe', 'cook', 'food', 'restaurant', 'sport', 'award', 'ceremony', 'gaming', 'video game'],
  XAU: ['world cup', 'medal', 'olympic', 'tequila', 'sport'],
  Oil: ['oil painting', 'essential oil', 'olive oil', 'coconut oil', 'oil spill cleanup volunteer', 'hair oil', 'skin oil', 'massage oil', 'cooking oil', 'recipe'],
  Silver: ['silver medal', 'olympic', 'silver lining', 'silver screen', 'silverware', 'jewelry', 'antique', 'cutlery'],
  Copper: ['copper pipe', 'copper wire theft', 'copper sink', 'copper cookware', 'plumbing'],
  'Crude Oil': ['essential oil', 'olive oil', 'cooking'],
};

// Categories that are definitely financial/market-related
const FINANCIAL_CATEGORIES = [
  'اقتصاد كلي', 'أسواق مالية', 'أسهم', 'عملات', 'سلع', 'طاقة', 'معادن ثمينة',
  'فوركس', 'كريبتو', 'تقارير اقتصادية', 'تحليلات',
  'economy', 'markets', 'stocks', 'forex', 'commodities', 'energy', 'metals',
  'crypto', 'analysis', 'macro',
];

// Category IDs that are financial (English keys from the dual-column system)
const FINANCIAL_CATEGORY_IDS = [
  'economy', 'markets', 'stocks', 'forex', 'commodities', 'energy', 'precious-metals',
  'crypto', 'analysis', 'macro', 'oil-gas', 'currencies',
];

function scoreArticleRelevance(
  article: any,
  symbol: string,
  companyName: string,
  allSearchTerms: string[]
): number {
  let score = 0;
  const titleLower = (article.title || '').toLowerCase();
  const titleArLower = (article.titleAr || '').toLowerCase();
  const summaryLower = (article.summary || '').toLowerCase();
  const summaryArLower = (article.summaryAr || '').toLowerCase();
  const contentLower = (article.content || '').toLowerCase();
  const titleAndSummary = titleLower + ' ' + titleArLower + ' ' + summaryLower + ' ' + summaryArLower;

  // ── Positive signals ──

  // 1. Exact symbol/company name in title (+5, very strong signal)
  for (const term of allSearchTerms) {
    if (titleLower.includes(term.toLowerCase()) || titleArLower.includes(term.toLowerCase())) {
      score += 5;
      break;
    }
  }

  // 2. Term in summary (+3, strong signal)
  for (const term of allSearchTerms) {
    if (summaryLower.includes(term.toLowerCase()) || summaryArLower.includes(term.toLowerCase())) {
      score += 3;
      break;
    }
  }

  // 3. Term in content (+1, weak signal — many false positives here)
  for (const term of allSearchTerms) {
    if (contentLower.includes(term.toLowerCase())) {
      score += 1;
      break;
    }
  }

  // 4. Financial category match (+4, strong relevance booster)
  const articleCategory = (article.category || '').toLowerCase();
  const articleCategoryId = (article.categoryId || '').toLowerCase();
  if (FINANCIAL_CATEGORIES.some(c => articleCategory.includes(c.toLowerCase()))) {
    score += 4;
  }
  if (FINANCIAL_CATEGORY_IDS.some(c => articleCategoryId.includes(c))) {
    score += 4;
  }

  // 5. affectedAssets JSON contains the symbol (+5, very strong signal)
  try {
    const assetsRaw = article.affectedAssets;
    if (assetsRaw) {
      let assets: any[] = [];
      if (typeof assetsRaw === 'string') {
        assets = JSON.parse(assetsRaw || '[]');
      } else if (Array.isArray(assetsRaw)) {
        assets = assetsRaw;
      }
      const assetsStr = JSON.stringify(assets).toLowerCase();
      const symbolUpper = symbol.toUpperCase();
      const companyLower = companyName.toLowerCase();
      if (assetsStr.includes(symbolUpper) || assetsStr.includes(companyLower) ||
          assetsStr.includes('gold') || assetsStr.includes('xau') || assetsStr.includes('ذهب')) {
        score += 5;
      }
    }
  } catch { /* ignore JSON parse errors */ }

  // 6. aiAnalysis JSON contains the symbol (+4, strong signal)
  try {
    const aiRaw = article.aiAnalysis;
    if (aiRaw && typeof aiRaw === 'string') {
      const aiLower = aiRaw.toLowerCase();
      const companyLower = companyName.toLowerCase();
      if (aiLower.includes(companyLower) || aiLower.includes(symbol.toLowerCase())) {
        score += 4;
      }
      // Check if AI analysis mentions financial gold
      if (companyLower === 'gold' || companyLower === 'crude oil') {
        if (aiLower.includes('xau') || aiLower.includes('precious metal') || aiLower.includes('safe haven') ||
            aiLower.includes('commodity') || aiLower.includes('inflation') || aiLower.includes('fed') ||
            aiLower.includes('crude') || aiLower.includes('brent') || aiLower.includes('wti')) {
          score += 3;
        }
      }
    }
  } catch { /* ignore */ }

  // ── Negative signals ──

  // 7. Penalize articles with non-financial contexts
  const negativeContexts = FINANCIAL_NEGATIVE_CONTEXTS[companyName] || [];
  for (const neg of negativeContexts) {
    if (titleAndSummary.includes(neg.toLowerCase())) {
      score -= 8; // Heavy penalty — almost certainly not relevant
      break;
    }
  }

  // 8. If the term only appears in content (not title/summary), penalize
  const termInTitleOrSummary = allSearchTerms.some(term =>
    titleLower.includes(term.toLowerCase()) ||
    titleArLower.includes(term.toLowerCase()) ||
    summaryLower.includes(term.toLowerCase()) ||
    summaryArLower.includes(term.toLowerCase())
  );
  const termInContent = allSearchTerms.some(term =>
    contentLower.includes(term.toLowerCase())
  );
  if (!termInTitleOrSummary && termInContent) {
    score -= 3; // Weak match — likely false positive
  }

  return score;
}

export async function getStockNews(symbol: string, limit: number = 5, locale: Locale = 'ar'): Promise<Record<string, any>> {
  try {
    const companyNameMap: Record<string, string> = {
      AAPL: 'Apple', MSFT: 'Microsoft', GOOGL: 'Google Alphabet', AMZN: 'Amazon',
      NVDA: 'Nvidia', META: 'Meta Facebook', TSLA: 'Tesla', AMD: 'AMD',
      NFLX: 'Netflix', INTC: 'Intel', BA: 'Boeing', DIS: 'Disney',
      JPM: 'JPMorgan', V: 'Visa', MA: 'Mastercard', PYPL: 'PayPal',
      BTC: 'Bitcoin', ETH: 'Ethereum', XAU: 'Gold', XAG: 'Silver',
      XAUUSD: 'Gold', USDJPY: 'Yen', EURUSD: 'Euro', GBPUSD: 'Pound',
      // Gold futures / commodity tickers that AI might send
      'GC=F': 'Gold', 'GC': 'Gold', 'SI=F': 'Silver', 'SI': 'Silver',
      'CL=F': 'Crude Oil', 'CL': 'Crude Oil', 'BZ=F': 'Brent Crude', 'BZ': 'Brent',
      'HG=F': 'Copper', 'HG': 'Copper', 'NG=F': 'Natural Gas', 'NG': 'Natural Gas',
      'DX=F': 'Dollar Index', 'DX': 'Dollar Index',
      'ES=F': 'S&P 500', 'NQ=F': 'Nasdaq', 'YM=F': 'Dow Jones', 'RTY=F': 'Russell',
      'ZN=F': 'Treasury Bond', 'ZB=F': 'Treasury Bond', 'ZF=F': 'Treasury Note',
      'KC=F': 'Coffee', 'ZC=F': 'Corn', 'ZW=F': 'Wheat', 'CT=F': 'Cotton',
    };

    const companyName = companyNameMap[symbol.toUpperCase()] || symbol;
    const searchTerms = [symbol, companyName].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    // Expand search terms with specific financial contexts for commodities
    // This helps match articles that are actually about financial markets
    const financialContextTerms: Record<string, string[]> = {
      Gold: ['gold price', 'gold market', 'gold futures', 'xauusd', 'precious metal', 'safe haven', 'gold etf'],
      Silver: ['silver price', 'silver market', 'xagusd', 'precious metal'],
      'Crude Oil': ['crude oil price', 'oil market', 'brent crude', 'wti crude', 'oil futures', 'opec'],
      'Brent Crude': ['brent crude', 'oil market', 'opec', 'oil futures'],
      'Natural Gas': ['natural gas price', 'gas market', 'lng'],
      Copper: ['copper price', 'copper market', 'industrial metal'],
      'Dollar Index': ['dollar index', 'dxy', 'us dollar', 'usd'],
      Bitcoin: ['bitcoin price', 'btc price', 'crypto market', 'cryptocurrency'],
      Ethereum: ['ethereum price', 'eth price', 'crypto market', 'cryptocurrency'],
    };
    const contextTerms = financialContextTerms[companyName] || [];
    const allSearchTerms = [...searchTerms, ...contextTerms];

    // Fetch MORE articles than needed (3x), then re-rank by relevance
    const fetchLimit = Math.max(limit * 3, 15);

    // ── ENHANCED SEMANTIC SEARCH (RAG) ──
    // Search in BOTH text columns AND the affectedAssets JSON field.
    // affectedAssets is TEXT in PostgreSQL (not jsonb), so Prisma `contains` works!
    // This is critical: articles tagged with symbol EURUSD in affectedAssets
    // may not have "EURUSD" in their title/summary.
    let articles: any[] = [];
    const selectFields = {
      id: true, title: true, titleAr: true,
      summary: true, summaryAr: true, sentiment: true,
      category: true, categoryId: true, slug: true, url: true, sourceName: true, locale: true, fetchedAt: true,
      affectedAssets: true, aiAnalysis: true, content: true,
    };

    // Build search conditions for text columns (title, summary, content)
    const textSearchConditions = searchTerms.flatMap(term => [
      { title: { contains: term, mode: 'insensitive' as const } },
      { titleAr: { contains: term, mode: 'insensitive' as const } },
      { summary: { contains: term, mode: 'insensitive' as const } },
      { summaryAr: { contains: term, mode: 'insensitive' as const } },
      { content: { contains: term, mode: 'insensitive' as const } },
      { contentAr: { contains: term, mode: 'insensitive' as const } },
    ]);

    // Build search conditions for affectedAssets JSON text field
    // This searches for the symbol inside the JSON string like: "symbol":"EURUSD"
    const assetSearchConditions = searchTerms.flatMap(term => [
      { affectedAssets: { contains: term, mode: 'insensitive' as const } },
    ]);

    // Also add the company name to asset search
    if (companyName && companyName !== symbol) {
      assetSearchConditions.push(
        { affectedAssets: { contains: companyName, mode: 'insensitive' as const } },
      );
    }

    // Add context terms to asset search too (e.g., "gold price", "crude oil")
    for (const ctxTerm of contextTerms.slice(0, 3)) {
      assetSearchConditions.push(
        { affectedAssets: { contains: ctxTerm, mode: 'insensitive' as const } },
      );
    }

    try {
      articles = await db.newsItem.findMany({
        where: {
          isReady: true,
          OR: [
            ...textSearchConditions,
            ...assetSearchConditions,
          ],
        },
        select: selectFields,
        orderBy: { fetchedAt: 'desc' },
        take: fetchLimit,
      });
    } catch (primaryErr: any) {
      // Fallback: text-only search without affectedAssets (in case of column issues)
      console.warn('[getStockNews] Primary query failed, using fallback:', primaryErr.message);
      try {
        articles = await db.newsItem.findMany({
          where: {
            isReady: true,
            OR: searchTerms.flatMap(term => [
              { title: { contains: term, mode: 'insensitive' as const } },
              { titleAr: { contains: term, mode: 'insensitive' as const } },
              { summary: { contains: term, mode: 'insensitive' as const } },
              { summaryAr: { contains: term, mode: 'insensitive' as const } },
            ]),
          },
          select: selectFields,
          orderBy: { fetchedAt: 'desc' },
          take: fetchLimit,
        });
      } catch {
        articles = [];
      }
    }

    // If still no results, try broader keyword match (e.g., "ذهب" for Gold)
    if (articles.length === 0) {
      const broaderTerms: Record<string, string[]> = {
        XAU: ['ذهب', 'Gold', 'ذهبية', 'معادن ثمينة'],
        XAUUSD: ['ذهب', 'Gold', 'دولار', 'ذهبية'],
        'GC=F': ['ذهب', 'Gold', 'معادن ثمينة', 'ذهبية'],
        GC: ['ذهب', 'Gold', 'معادن ثمينة'],
        'SI=F': ['فضة', 'Silver', 'معادن ثمينة'],
        SI: ['فضة', 'Silver'],
        'CL=F': ['نفط', 'Oil', 'خام', 'Crude', 'برنت', 'Brent'],
        CL: ['نفط', 'Oil', 'خام'],
        'BZ=F': ['برنت', 'Brent', 'نفط', 'خام'],
        BZ: ['برنت', 'Brent', 'نفط'],
        'NG=F': ['غاز طبيعي', 'Natural Gas', 'غاز'],
        'HG=F': ['نحاس', 'Copper', 'معادن'],
        'DX=F': ['دولار', 'Dollar Index', 'عملة'],
        'ES=F': ['مؤشر', 'S&P', 'أسهم'],
        'NQ=F': ['ناسداك', 'Nasdaq', 'مؤشر'],
        BTC: ['بتكوين', 'Bitcoin', 'كريبتو', 'crypto', 'عملات رقمية'],
        ETH: ['إيثريوم', 'Ethereum', 'كريبتو', 'crypto', 'عملات رقمية'],
        OIL: ['نفط', 'Oil', 'خام', 'Crude', 'برنت', 'Brent'],
      };
      const extras = broaderTerms[symbol.toUpperCase()];
      if (extras) {
        try {
          articles = await db.newsItem.findMany({
            where: {
              isReady: true,
              OR: extras.flatMap(term => [
                { title: { contains: term, mode: 'insensitive' as const } },
                { titleAr: { contains: term, mode: 'insensitive' as const } },
                { summary: { contains: term, mode: 'insensitive' as const } },
                { summaryAr: { contains: term, mode: 'insensitive' as const } },
              ]),
            },
            select: selectFields,
            orderBy: { fetchedAt: 'desc' },
            take: fetchLimit,
          });
        } catch {
          // Final fallback — return empty results gracefully
        }
      }
    }

    // ── Re-rank articles by relevance score ──
    // This filters out false positives like "Blue Gold" (tequila) when searching for financial Gold
    if (articles.length > 0) {
      const scored: ScoredArticle[] = articles.map(article => ({
        article,
        score: scoreArticleRelevance(article, symbol, companyName, allSearchTerms),
      }));

      // Sort by relevance score (descending), then by date
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.article.fetchedAt?.getTime?.() || 0) - (a.article.fetchedAt?.getTime?.() || 0);
      });

      // Filter: only keep articles with positive relevance score
      // (score > 0 means the article is actually about the financial asset)
      const relevant = scored.filter(s => s.score > 0);

      // Take the top `limit` articles
      articles = relevant.slice(0, limit).map(s => s.article);

      // If we filtered everything out, include the top scored ones anyway
      // (better to show something than nothing, but flag low relevance)
      if (articles.length === 0 && scored.length > 0) {
        articles = scored.slice(0, limit).map(s => ({
          ...s.article,
          _lowRelevance: true,
        }));
      }
    }

    // ── Compute quantitative sentiment analysis ──
    let sentimentSummary = null;
    if (articles.length > 0) {
      const positive = articles.filter(a =>
        a.sentiment === 'positive' || a.sentiment === 'bullish' || a.sentiment === 'إيجابي'
      ).length;
      const negative = articles.filter(a =>
        a.sentiment === 'negative' || a.sentiment === 'bearish' || a.sentiment === 'سلبي'
      ).length;
      const neutral = articles.filter(a =>
        a.sentiment === 'neutral' || a.sentiment === 'mixed' || a.sentiment === 'محايد'
      ).length;
      const noSentiment = articles.length - positive - negative - neutral;

      const positivePercent = Math.round((positive / articles.length) * 100);
      const negativePercent = Math.round((negative / articles.length) * 100);

      let momentumLabel: string;
      let momentumLabelAr: string;
      let momentumEmoji: string;
      if (positivePercent >= 60) {
        momentumLabel = 'Bullish';
        momentumLabelAr = 'صاعد';
        momentumEmoji = '🟢';
      } else if (negativePercent >= 60) {
        momentumLabel = 'Bearish';
        momentumLabelAr = 'هابط';
        momentumEmoji = '🔴';
      } else {
        momentumLabel = 'Neutral / Mixed';
        momentumLabelAr = 'محايد / مختلط';
        momentumEmoji = '🟡';
      }

      sentimentSummary = {
        total: articles.length,
        positive,
        negative,
        neutral,
        noSentiment,
        positivePercent,
        negativePercent,
        momentumLabel,
        momentumLabelAr,
        momentumEmoji,
      };
    }

    // ── Format relative time for each article ──
    const now = new Date();
    const formatRelativeTime = (date: Date, locale: Locale = 'ar'): { relative: string; formatted: string } => {
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      const relativeMap: Record<Locale, (min: number, hr: number, day: number) => string> = {
        ar: (min, hr, day) => {
          if (min < 1) return 'الآن';
          if (min < 60) return `منذ ${min} دقيقة`;
          if (hr < 24) return `منذ ${hr} ساعة`;
          if (day === 1) return 'أمس';
          if (day < 7) return `منذ ${day} أيام`;
          return date.toLocaleDateString('ar-SA');
        },
        en: (min, hr, day) => {
          if (min < 1) return 'just now';
          if (min < 60) return `${min}m ago`;
          if (hr < 24) return `${hr}h ago`;
          if (day === 1) return 'yesterday';
          if (day < 7) return `${day}d ago`;
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        },
        fr: (min, hr, day) => {
          if (min < 1) return "à l'instant";
          if (min < 60) return `il y a ${min} min`;
          if (hr < 24) return `il y a ${hr}h`;
          if (day === 1) return 'hier';
          if (day < 7) return `il y a ${day}j`;
          return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        },
        tr: (min, hr, day) => {
          if (min < 1) return 'şimdi';
          if (min < 60) return `${min} dk önce`;
          if (hr < 24) return `${hr} saat önce`;
          if (day === 1) return 'dün';
          if (day < 7) return `${day} gün önce`;
          return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
        },
        es: (min, hr, day) => {
          if (min < 1) return 'ahora';
          if (min < 60) return `hace ${min} min`;
          if (hr < 24) return `hace ${hr}h`;
          if (day === 1) return 'ayer';
          if (day < 7) return `hace ${day}d`;
          return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        },
      };

      const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      return {
        relative: relativeMap[locale](diffMin, diffHr, diffDay),
        formatted,
      };
    };

    return {
      symbol,
      count: articles.length,
      // ── Quantitative sentiment summary ──
      sentimentSummary,
      articles: articles.map(a => {
        const dateObj = a.fetchedAt ? new Date(a.fetchedAt) : null;
        const dateInfo = dateObj ? formatRelativeTime(dateObj, locale) : { relative: '', formatted: '' };
        // ── Internal URL: always link to the article on رؤى platform ──
        // Use the USER's locale to build the correct language route:
        // Arabic (default) = /news/{slug}, others = /{locale}/news/{slug}
        // The article pages handle translation automatically for all 5 locales
        const internalUrl = locale === 'ar'
          ? `/news/${a.slug}`
          : `/${locale}/news/${a.slug}`;
        return {
          id: a.id,
          title: a.titleAr || a.title,
          titleEn: a.title,
          summary: (a.summaryAr || a.summary || '').slice(0, 300),
          sentiment: a.sentiment,
          category: a.category,
          // ── Enhanced fields ──
          // CRITICAL: Always use internal رؤى URL — never link externally
          url: internalUrl,
          sourceName: a.sourceName || null,
          dateRelative: dateInfo.relative,
          dateFormatted: dateInfo.formatted,
          date: a.fetchedAt?.toISOString?.() || '',
        };
      }),
    };
  } catch (error: any) {
    return { symbol, error: error.message || 'Failed to fetch stock news' };
  }
}

// ─── 4. Get Stock Quote ────────────────────────────────────────

export async function getStockQuoteData(symbol: string): Promise<Record<string, any>> {
  try {
    const fmpQuote = await getStockQuote(symbol).catch(() => null);
    if (fmpQuote) {
      return {
        symbol, source: 'fmp',
        price: fmpQuote.price, change: fmpQuote.change, changePercent: fmpQuote.changePercent,
        high: fmpQuote.high, low: fmpQuote.low, open: fmpQuote.open,
        volume: fmpQuote.volume, previousClose: fmpQuote.previousClose,
        marketCap: fmpQuote.marketCap, peRatio: fmpQuote.peRatio, eps: fmpQuote.eps,
      };
    }

    const quote = await getQuote(symbol);
    if (quote) {
      return {
        symbol, source: 'yahoo',
        price: quote.price, change: quote.change, changePercent: quote.changePercent,
        high: quote.high, low: quote.low, volume: quote.volume,
      };
    }

    return { symbol, error: 'No quote data available' };
  } catch (error: any) {
    return { symbol, error: error.message || 'Failed to fetch quote' };
  }
}

// ─── 5. Compare Stocks ─────────────────────────────────────────

export async function compareStocks(symbol1: string, symbol2: string): Promise<Record<string, any>> {
  try {
    // ── V2: Enhanced comparison with fundamentals, technicals, recommendations, and news ──
    // Fetch all data in parallel for both stocks
    const [
      yahooData1, yahooData2,
      fundamentals1, fundamentals2,
      technical1, technical2,
      recommendations1, recommendations2,
    ] = await Promise.all([
      fetchYahooAllData(symbol1).catch(() => null),
      fetchYahooAllData(symbol2).catch(() => null),
      getStockFundamentals(symbol1).catch(() => null),
      getStockFundamentals(symbol2).catch(() => null),
      getStockTechnical(symbol1).catch(() => null),
      getStockTechnical(symbol2).catch(() => null),
      getStockRecommendations(symbol1).catch(() => null),
      getStockRecommendations(symbol2).catch(() => null),
    ]);

    // ── Extract Yahoo Finance comparison data (same as before) ──
    const extractComparison = (data: any, sym: string) => {
      if (!data) return { symbol: sym, error: 'No data available' };
      return {
        symbol: sym, name: data.profile?.longName || sym,
        price: data.quote?.regularMarketPrice || 0,
        changePercent: data.quote?.regularMarketChangePercent || 0,
        marketCap: data.quote?.marketCap || 0,
        peRatio: data.summaryDetail?.trailingPE || null,
        eps: data.financialData?.earningsGrowth || null,
        revenueGrowth: data.financialData?.revenueGrowth || null,
        profitMargin: data.financialData?.profitMargins || null,
        beta: data.summaryDetail?.beta || null,
        dividendYield: data.summaryDetail?.dividendYield || null,
      };
    };

    // ── Extract fundamentals comparison ──
    const extractFundamentals = (fund: any) => {
      if (!fund || fund.error) return null;
      return {
        sector: fund.sector || null,
        industry: fund.industry || null,
        peRatio: fund.peRatio || null,
        peRatioTTM: fund.peRatioTTM || null,
        eps: fund.eps || null,
        roe: fund.roe || null,
        roa: fund.roa || null,
        grossMargin: fund.grossMargin || null,
        netMargin: fund.netMargin || null,
        revenueGrowth: fund.revenueGrowth || null,
        earningsGrowth: fund.earningsGrowth || null,
        debtToEquity: fund.debtToEquity || null,
        dividendYield: fund.dividendYield || null,
        beta: fund.beta || null,
        rating: fund.rating || null,
        ratingScore: fund.ratingScore || null,
        dcf: fund.dcf || null,
        priceTarget: fund.priceTarget || null,
        sectorComparison: fund.sectorComparison || null,
      };
    };

    // ── Extract technical comparison ──
    const extractTechnical = (tech: any) => {
      if (!tech || tech.error) return null;
      return {
        overallSignal: tech.overallSignal || null,
        overallScore: tech.overallScore || null,
        trend: tech.trend || null,
        supportLevels: tech.supportLevels || [],
        resistanceLevels: tech.resistanceLevels || [],
        movingAverages: tech.movingAverages || null,
        tradeSetup: tech.tradeSetup || null,
        volatility: tech.volatility || null,
      };
    };

    // ── Extract recommendations ──
    const extractRecommendation = (rec: any) => {
      if (!rec || rec.error) return null;
      return {
        aiRecommendation: rec.aiRecommendation || null,
        analystRating: rec.analystRating || null,
      };
    };

    const comp1 = extractComparison(yahooData1, symbol1);
    const comp2 = extractComparison(yahooData2, symbol2);
    const fund1 = extractFundamentals(fundamentals1);
    const fund2 = extractFundamentals(fundamentals2);
    const tech1 = extractTechnical(technical1);
    const tech2 = extractTechnical(technical2);
    const rec1 = extractRecommendation(recommendations1);
    const rec2 = extractRecommendation(recommendations2);

    // ── Compute comparative metrics ──
    let comparativeMetrics: Record<string, any> = {};

    // P/E comparison
    if (fund1?.peRatioTTM && fund2?.peRatioTTM) {
      const peDiff = ((fund1.peRatioTTM - fund2.peRatioTTM) / fund2.peRatioTTM * 100).toFixed(1);
      comparativeMetrics.peComparison = {
        stock1: fund1.peRatioTTM,
        stock2: fund2.peRatioTTM,
        difference: `${peDiff}%`,
        cheaper: fund1.peRatioTTM < fund2.peRatioTTM ? symbol1 : symbol2,
      };
    }

    // Revenue growth comparison
    if (fund1?.revenueGrowth != null && fund2?.revenueGrowth != null) {
      comparativeMetrics.revenueGrowthComparison = {
        stock1: `${(fund1.revenueGrowth * 100).toFixed(1)}%`,
        stock2: `${(fund2.revenueGrowth * 100).toFixed(1)}%`,
        faster: fund1.revenueGrowth > fund2.revenueGrowth ? symbol1 : symbol2,
      };
    }

    // Margin comparison
    if (fund1?.netMargin != null && fund2?.netMargin != null) {
      comparativeMetrics.marginComparison = {
        stock1: `${(fund1.netMargin * 100).toFixed(1)}%`,
        stock2: `${(fund2.netMargin * 100).toFixed(1)}%`,
        moreProfitable: fund1.netMargin > fund2.netMargin ? symbol1 : symbol2,
      };
    }

    // Technical signal comparison
    if (tech1?.overallSignal && tech2?.overallSignal) {
      const signalOrder: Record<string, number> = { 'Strong Buy': 5, 'Buy': 4, 'Neutral': 3, 'Sell': 2, 'Strong Sell': 1 };
      const score1 = signalOrder[tech1.overallSignal] || 3;
      const score2 = signalOrder[tech2.overallSignal] || 3;
      comparativeMetrics.technicalComparison = {
        stock1Signal: tech1.overallSignal,
        stock2Signal: tech2.overallSignal,
        stock1Score: tech1.overallScore,
        stock2Score: tech2.overallScore,
        bullishCandidate: score1 >= score2 ? symbol1 : symbol2,
      };
    }

    // ── Compute unified recommendation ──
    let unifiedRecommendation: Record<string, any> | null = null;
    try {
      // Score each stock based on multiple factors
      let score1 = 50, score2 = 50;

      // Technical signal scoring
      const signalScores: Record<string, number> = { 'Strong Buy': 20, 'Buy': 15, 'Neutral': 0, 'Sell': -15, 'Strong Sell': -20 };
      if (tech1?.overallSignal) score1 += signalScores[tech1.overallSignal] || 0;
      if (tech2?.overallSignal) score2 += signalScores[tech2.overallSignal] || 0;

      // Fundamentals scoring
      if (fund1?.revenueGrowth != null && fund2?.revenueGrowth != null) {
        if (fund1.revenueGrowth > fund2.revenueGrowth) score1 += 10; else score2 += 10;
      }
      if (fund1?.netMargin != null && fund2?.netMargin != null) {
        if (fund1.netMargin > fund2.netMargin) score1 += 10; else score2 += 10;
      }
      if (fund1?.peRatioTTM != null && fund2?.peRatioTTM != null) {
        // Lower P/E is better (cheaper)
        if (fund1.peRatioTTM < fund2.peRatioTTM) score1 += 5; else score2 += 5;
      }

      // Analyst rating scoring
      if (rec1?.analystRating?.score != null) score1 += Math.min(rec1.analystRating.score, 10);
      if (rec2?.analystRating?.score != null) score2 += Math.min(rec2.analystRating.score, 10);

      const preferred = score1 >= score2 ? symbol1 : symbol2;
      const preferredScore = Math.max(score1, score2);
      const confidence = Math.min(Math.max(Math.abs(score1 - score2) * 2 + 50, 55), 90);

      unifiedRecommendation = {
        preferredStock: preferred,
        confidence: confidence,
        score1,
        score2,
        reasoning: score1 > score2 + 10
          ? `${symbol1} outperforms ${symbol2} on key metrics`
          : score2 > score1 + 10
            ? `${symbol2} outperforms ${symbol1} on key metrics`
            : `Both stocks are closely matched with slight edge to ${preferred}`,
      };
    } catch { /* recommendation computation is optional */ }

    // ── Compute arbitrage opportunity ──
    let arbitrageOpportunity: Record<string, any> | null = null;
    try {
      const price1 = comp1.price || yahooData1?.quote?.regularMarketPrice || 0;
      const price2 = comp2.price || yahooData2?.quote?.regularMarketPrice || 0;
      const change1 = comp1.changePercent || 0;
      const change2 = comp2.changePercent || 0;

      // Divergence: when two correlated stocks move in opposite directions
      const divergence = Math.abs(change1 - change2);
      const isDivergent = divergence > 1.5 && Math.sign(change1) !== Math.sign(change2);

      // P/E gap: potential value arbitrage
      const peGap = fund1?.peRatioTTM && fund2?.peRatioTTM
        ? Math.abs(fund1.peRatioTTM - fund2.peRatioTTM) / Math.min(fund1.peRatioTTM, fund2.peRatioTTM) * 100
        : 0;

      if (isDivergent || peGap > 30) {
        const oversold = change1 < change2 ? symbol1 : symbol2;
        const overbought = change1 < change2 ? symbol2 : symbol1;
        arbitrageOpportunity = {
          type: isDivergent ? 'price_divergence' : 'valuation_gap',
          divergence: `${divergence.toFixed(2)}%`,
          peGap: peGap > 0 ? `${peGap.toFixed(1)}%` : null,
          oversoldStock: oversold,
          overboughtStock: overbought,
          opportunity: isDivergent
            ? `${oversold} may be oversold while ${overbought} is overbought — potential pair trade`
            : `Significant P/E gap (${peGap.toFixed(1)}%) suggests ${oversold} may be undervalued relative to ${overbought}`,
        };
      }
    } catch { /* arbitrage computation is optional */ }

    return {
      comparison: [comp1, comp2],
      fundamentals: [fund1, fund2],
      technicals: [tech1, tech2],
      recommendations: [rec1, rec2],
      comparativeMetrics,
      unifiedRecommendation,
      arbitrageOpportunity,
      period: '6 months',
    };
  } catch (error: any) {
    return { symbol1, symbol2, error: error.message || 'Failed to compare stocks' };
  }
}

// ─── 6. Get Stock Recommendations ──────────────────────────────

export async function getStockRecommendations(symbol: string): Promise<Record<string, any>> {
  try {
    const recommendation = await db.personalizedRecommendation.findFirst({
      where: { asset: symbol },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, asset: true, title: true, action: true,
        confidenceScore: true, reasoning: true,
        entryPrice: true, targetPrice: true,
        stopLoss: true, timeHorizon: true, createdAt: true,
      },
    });

    const rating = await getStockRating(symbol).catch(() => null);

    return {
      symbol,
      aiRecommendation: recommendation ? {
        action: recommendation.action,
        confidence: recommendation.confidenceScore,
        reasoning: recommendation.reasoning,
        entryPrice: recommendation.entryPrice,
        targetPrice: recommendation.targetPrice,
        stopLoss: recommendation.stopLoss,
        timeHorizon: recommendation.timeHorizon,
        date: recommendation.createdAt?.toISOString?.() || '',
      } : null,
      analystRating: rating ? {
        rating: rating.rating, score: rating.ratingScore,
        recommendation: rating.ratingRecommendation,
        dcf: rating.dcf, priceTargets: rating.priceTargets,
      } : null,
    };
  } catch (error: any) {
    return { symbol, error: error.message || 'Failed to fetch recommendations' };
  }
}

// ─── 7. Search Articles ────────────────────────────────────────

export async function searchArticles(query: string, locale?: string): Promise<Record<string, any>> {
  try {
    const terms = query.split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return { query, count: 0, articles: [] };

    const userLocale = (locale || 'ar') as Locale;

    // Search in text columns AND affectedAssets JSON field
    const textConditions = terms.slice(0, 3).flatMap(term => [
      { title: { contains: term, mode: 'insensitive' as const } },
      { titleAr: { contains: term, mode: 'insensitive' as const } },
      { summary: { contains: term, mode: 'insensitive' as const } },
      { summaryAr: { contains: term, mode: 'insensitive' as const } },
    ]);

    const assetConditions = terms.slice(0, 3).flatMap(term => [
      { affectedAssets: { contains: term, mode: 'insensitive' as const } },
    ]);

    // Don't filter by locale — search all languages to find more relevant results
    const articles = await db.newsItem.findMany({
      where: { isReady: true, OR: [...textConditions, ...assetConditions] },
      select: {
        id: true, title: true, titleAr: true,
        summary: true, summaryAr: true,
        category: true, sentiment: true,
        slug: true, sourceName: true, fetchedAt: true,
        affectedAssets: true,
      },
      orderBy: { fetchedAt: 'desc' },
      take: 8,
    });

    return {
      query, count: articles.length,
      articles: articles.map(a => {
        // ── Internal URL: always link to article on رؤى platform ──
        const internalUrl = userLocale === 'ar'
          ? `/news/${a.slug}`
          : `/${userLocale}/news/${a.slug}`;
        return {
          id: a.id,
          title: a.titleAr || a.title,
          titleEn: a.title,
          summary: (a.summaryAr || a.summary || '').slice(0, 200),
          sentiment: a.sentiment, category: a.category,
          // CRITICAL: Always use internal رؤى URL — never link externally
          url: internalUrl,
          sourceName: a.sourceName || null,
          date: a.fetchedAt?.toISOString?.() || '',
        };
      }),
    };
  } catch (error: any) {
    return { query, error: error.message || 'Search failed' };
  }
}

// ─── 8. Summarize Page (Enhanced — Structured Analytical Card) ─

export async function summarizePage(pageUrl: string, locale: Locale = 'ar'): Promise<Record<string, any>> {
  try {
    // ── Route 1: Article/Report page (has /news/ or /reports/ slug) ──
    const slugMatch = pageUrl.match(/\/(?:reports|news)\/([^/?]+)/);

    // ── Route 2: Market/Home page (no slug — use market indicators + latest news) ──
    if (!slugMatch) {
      // Detect if this is a market-related page
      const urlPath = (() => { try { return new URL(pageUrl, 'https://rouaa.app').pathname; } catch { return pageUrl; } })();
      const isMarketPage = /\/markets|\/advisor|\/signals|\/(ar|en|fr|tr|es)\/?$|\/(ar|en|fr|tr|es)\/markets/.test(urlPath);
      const isHomePage = /^(\/(ar|en|fr|tr|es)?)?\/?$/.test(urlPath);

      if (isMarketPage || isHomePage) {
        // Build a market summary from current indicators + latest news
        const [indicators, latestNews] = await Promise.all([
          db.marketIndicator.findMany({
            take: 15,
            orderBy: { lastUpdated: 'desc' },
            select: { nameAr: true, name: true, symbol: true, value: true, changePercent: true, category: true },
          }).catch(() => []),
          db.newsItem.findMany({
            where: { isReady: true },
            select: {
              titleAr: true, title: true,
              summaryAr: true, summary: true,
              sentiment: true, category: true,
              affectedAssets: true, fetchedAt: true,
            },
            orderBy: { fetchedAt: 'desc' },
            take: 8,
          }).catch(() => []),
        ]);

        // Build market context text
        const isAr = locale === 'ar';
        const marketLines = indicators.map(i => {
          const name = isAr && i.nameAr ? i.nameAr : (i.name || i.symbol);
          const dir = i.changePercent >= 0 ? '+' : '';
          return `- ${name} (${i.symbol}): ${i.value} (${dir}${i.changePercent.toFixed(2)}%)`;
        }).join('\n');

        // Build news summary
        const newsLines = latestNews.map((n, i) => {
          const t = isAr && n.titleAr ? n.titleAr : n.title;
          const s = isAr && n.summaryAr ? n.summaryAr : n.summary;
          return `${i + 1}. ${t}\n   ${s.slice(0, 200)}`;
        }).join('\n\n');

        // Detect sentiment from news
        const positive = latestNews.filter(n => n.sentiment === 'positive' || n.sentiment === 'bullish').length;
        const negative = latestNews.filter(n => n.sentiment === 'negative' || n.sentiment === 'bearish').length;
        const total = latestNews.length;
        const overallSentiment = positive > negative ? 'bullish' : negative > positive ? 'bearish' : 'neutral';

        return {
          pageUrl,
          type: isMarketPage ? 'market_page' : 'home_page',
          title: isAr ? 'ملخص السوق' : 'Market Summary',
          marketIndicators: marketLines,
          latestNews: newsLines,
          sentiment: overallSentiment,
          newsCount: total,
          positiveCount: positive,
          negativeCount: negative,
          confidence: total > 0 ? Math.round((Math.max(positive, negative) / total) * 100) : 50,
        };
      }

      // Not a known page type — return error
      return { pageUrl, error: 'Could not extract page identifier from URL. This feature works on news, report, and market pages.' };
    }

    const slug = slugMatch[1];
    let title = '';
    let content = '';
    let summary = '';
    let sentiment: string | null = null;
    let aiAnalysis: string | null = null;
    let pageType = 'unknown';

    // Try report first
    const report = await db.economicReport.findFirst({
      where: { slug },
      select: { title: true, summary: true, content: true, keyIndicators: true },
    }).catch(() => null);

    if (report) {
      title = report.title;
      content = report.content || '';
      summary = report.summary || '';
      pageType = 'report';
    }

    // If not a report, try news article
    if (!report) {
      const article = await db.newsItem.findFirst({
        where: { slug },
        select: {
          title: true, titleAr: true,
          summary: true, summaryAr: true,
          content: true, contentAr: true,
          aiAnalysis: true, sentiment: true,
        },
      }).catch(() => null);

      if (article) {
        title = article.titleAr || article.title;
        content = article.contentAr || article.content || '';
        summary = article.summaryAr || article.summary || '';
        aiAnalysis = article.aiAnalysis;
        sentiment = article.sentiment;
        pageType = 'news';
      }
    }

    if (!title && !content) {
      return { pageUrl, error: 'Page content not found' };
    }

    // ── Build structured analytical response ──

    // 1. Detect affected assets
    const affectedAssets = detectAssetImpacts(content, title);

    // 2. Detect scenarios
    const scenarios = detectScenarios(content, title, locale);

    // 3. Find related reports (RAG)
    const relatedReports = await findRelatedReports(content, title);

    // 4. Calculate confidence
    const confidence = calculateConfidence(content, sentiment);

    // 5. Build recommendation from detected data
    let recommendation: Record<string, any> | null = null;
    if (affectedAssets.length > 0) {
      const primaryAsset = affectedAssets[0];
      recommendation = {
        action: primaryAsset.direction === 'up' ? 'buy' : 'sell',
        asset: primaryAsset.name,
        assetAr: primaryAsset.nameAr,
        direction: primaryAsset.direction,
        estimatedChange: primaryAsset.estimatedChange,
        confidence: confidence,
      };
    }

    return {
      pageUrl,
      type: pageType,
      title,
      summary: summary.slice(0, 500),
      contentPreview: content.slice(0, 4000),
      aiAnalysis,
      sentiment,
      // ── Structured analytical data ──
      affectedAssets,
      scenarios,
      relatedReports,
      recommendation,
      confidence,
    };
  } catch (error: any) {
    return { pageUrl, error: error.message || 'Failed to summarize page' };
  }
}

// ─── 9. Get Market Events (Economic Calendar from DB) ──────────

export async function getMarketEvents(
  days: number = 3,
  importance?: string,
  locale: Locale = 'ar'
): Promise<Record<string, any>> {
  try {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);

    // Build where clause
    const whereClause: any = {
      eventDate: {
        gte: now,
        lte: endDate,
      },
    };

    // Filter by importance if specified
    if (importance === 'high' || importance === 'critical') {
      whereClause.importance = { in: [importance, 'high', 'critical'] };
    } else {
      // By default, only show medium+ importance events
      whereClause.importance = { in: ['medium', 'high', 'critical'] };
    }

    let events = await db.economicEvent.findMany({
      where: whereClause,
      orderBy: [
        { importance: 'desc' },
        { eventDate: 'asc' },
      ],
      take: 15,
    });

    // ── Fallback: If no upcoming events, try without importance filter ──
    if (events.length === 0) {
      const allUpcoming = await db.economicEvent.findMany({
        where: {
          eventDate: { gte: now, lte: endDate },
        },
        orderBy: [
          { importance: 'desc' },
          { eventDate: 'asc' },
        ],
        take: 15,
      });
      events = allUpcoming;
    }

    // ── Fallback: If still no upcoming events, try recent past events (last 3 days) ──
    let showingPastEvents = false;
    if (events.length === 0) {
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - 3);
      const recentPast = await db.economicEvent.findMany({
        where: {
          eventDate: { gte: pastDate, lte: now },
        },
        orderBy: { eventDate: 'desc' },
        take: 10,
      });
      events = recentPast;
      showingPastEvents = recentPast.length > 0;
    }

    // ── Fallback: If STILL no events, check total count in table ──
    let totalEventsInDb = 0;
    if (events.length === 0) {
      totalEventsInDb = await db.economicEvent.count();
    }

    if (events.length === 0) {
      const noEventsMsg: Record<Locale, string> = {
        ar: 'لا توجد أحداث اقتصادية في قاعدة البيانات حالياً. قد يحتاج جدول الأحداث الاقتصادية إلى تحديث — يتم تحديثه تلقائياً من مصادر البيانات.',
        en: 'No economic events found in the database currently. The economic events table may need updating — it is automatically refreshed from data sources.',
        fr: "Aucun événement économique trouvé dans la base de données actuellement. La table des événements économiques peut nécessiter une mise à jour — elle est automatiquement actualisée depuis les sources de données.",
        tr: 'Şu anda veritabanında ekonomik olay bulunamadı. Ekonomik olaylar tablosunun güncellenmesi gerekebilir — veri kaynaklarından otomatik olarak yenilenir.',
        es: 'No se encontraron eventos económicos en la base de datos actualmente. La tabla de eventos económicos puede necesitar actualización — se actualiza automáticamente desde las fuentes de datos.',
      };

      const suggestionMsg: Record<Locale, string> = {
        ar: 'يمكنك بدلاً من ذلك سؤالي عن: تحليل سهم معين، أخبار الذهب أو النفط، أو مقارنة بين أسهم.',
        en: 'You can instead ask me about: a specific stock analysis, gold or oil news, or a comparison between stocks.',
        fr: 'Vous pouvez plutôt me demander : une analyse d\'action spécifique, des actualités sur l\'or ou le pétrole, ou une comparaison entre actions.',
        tr: 'Bunun yerine bana şunu sorabilirsiniz: belirli bir hisse analizi, altın veya petrol haberleri, veya hisseler arası karşılaştırma.',
        es: 'En su lugar puedes preguntarme sobre: un análisis de acciones específico, noticias de oro o petróleo, o una comparación entre acciones.',
      };

      return {
        count: 0,
        events: [],
        totalEventsInDb,
        isEmpty: true,
        message: noEventsMsg[locale],
        suggestion: suggestionMsg[locale],
      };
    }

    // Importance label mapping
    const importanceLabels: Record<string, Record<Locale, string>> = {
      low: { ar: 'منخفض', en: 'Low', fr: 'Faible', tr: 'Düşük', es: 'Bajo' },
      medium: { ar: 'متوسط', en: 'Medium', fr: 'Moyen', tr: 'Orta', es: 'Medio' },
      high: { ar: 'مرتفع', en: 'High', fr: 'Élevé', tr: 'Yüksek', es: 'Alto' },
      critical: { ar: 'حرج', en: 'Critical', fr: 'Critique', tr: 'Kritik', es: 'Crítico' },
    };

    // Event type labels
    const eventTypeLabels: Record<string, Record<Locale, string>> = {
      indicator: { ar: 'مؤشر اقتصادي', en: 'Economic Indicator', fr: 'Indicateur économique', tr: 'Ekonomik Gösterge', es: 'Indicador económico' },
      speech: { ar: 'تصريح', en: 'Speech', fr: 'Discours', tr: 'Konuşma', es: 'Discurso' },
      meeting: { ar: 'اجتماع', en: 'Meeting', fr: 'Réunion', tr: 'Toplantı', es: 'Reunión' },
      earnings: { ar: 'أرباح', en: 'Earnings', fr: 'Résultats', tr: 'Kazanç', es: 'Ganancias' },
      other: { ar: 'أخرى', en: 'Other', fr: 'Autre', tr: 'Diğer', es: 'Otro' },
    };

    // Country flag mapping
    const countryFlags: Record<string, string> = {
      US: '🇺🇸', EU: '🇪🇺', GB: '🇬🇧', JP: '🇯🇵', CH: '🇨🇭', CA: '🇨🇦',
      AU: '🇦🇺', NZ: '🇳🇿', DE: '🇩🇪', FR: '🇫🇷', CN: '🇨🇳', IN: '🇮🇳',
      SA: '🇸🇦', AE: '🇦🇪', KR: '🇰🇷', SG: '🇸🇬', HK: '🇭🇰', BR: '🇧🇷',
      RU: '🇷🇺', MX: '🇲🇽', ZA: '🇿🇦', TR: '🇹🇷', EG: '🇪🇬',
    };

    return {
      count: events.length,
      showingPastEvents,
      dateRange: {
        from: now.toISOString(),
        to: endDate.toISOString(),
        days,
      },
      events: events.map(e => ({
        id: e.id,
        name: locale === 'ar' && e.eventNameAr ? e.eventNameAr : e.eventName,
        nameEn: e.eventName,
        nameAr: e.eventNameAr || e.eventName,
        date: e.eventDate.toISOString(),
        country: e.country,
        countryFlag: countryFlags[e.country] || '',
        currency: e.currency,
        importance: e.importance,
        importanceLabel: importanceLabels[e.importance]?.[locale] || e.importance,
        eventType: e.eventType,
        eventTypeLabel: eventTypeLabels[e.eventType]?.[locale] || e.eventType,
        forecast: e.forecast,
        previous: e.previous,
        actual: e.actual,
        isReleased: e.isActualReleased,
      })),
    };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch market events' };
  }
}

// ─── 10. Search by Asset Symbol (RAG in affectedAssets) ──────────

/**
 * Searches articles where the given asset symbol appears in the `affectedAssets` JSON field.
 * This is the MOST precise search — it finds articles that the AI pipeline already
 * identified as affecting this specific symbol.
 * Essential for forex pairs (EURUSD, GBPUSD) and commodities that rarely appear in titles.
 */
export async function searchByAsset(
  symbol: string,
  limit: number = 8,
  locale: Locale = 'ar'
): Promise<Record<string, any>> {
  try {
    const symbolUpper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // ── Pre-resolve common asset names to trading symbols ──
    // Maps user-friendly names (in all 5 languages) to proper trading symbols
    const NAME_TO_SYMBOL: Record<string, string> = {
      // Gold — all languages
      'GOLD': 'XAUUSD', 'XAU': 'XAUUSD', 'OR': 'XAUUSD', 'ORO': 'XAUUSD',
      'ALTIN': 'XAUUSD', 'ذهب': 'XAUUSD', 'الذهب': 'XAUUSD',
      // Silver
      'SILVER': 'XAGUSD', 'XAG': 'XAGUSD', 'ARGENT': 'XAGUSD', 'PLATA': 'XAGUSD',
      'GUMUS': 'XAGUSD', 'فضة': 'XAGUSD', 'الفضة': 'XAGUSD',
      // Oil / Crude
      'OIL': 'CL', 'CRUDE': 'CL', 'BRENT': 'BZ', 'WTI': 'CL',
      'PETROLE': 'CL', 'PETROLEO': 'CL', 'PETROL': 'CL',
      'نفط': 'CL', 'النفط': 'CL', 'خام': 'CL', 'برنت': 'BZ',
      // Bitcoin
      'BITCOIN': 'BTCUSD', 'BTC': 'BTCUSD', 'BTCUSD': 'BTCUSD', 'BTCUSDT': 'BTCUSD',
      'بتكوين': 'BTCUSD', 'البتكوين': 'BTCUSD',
      // Ethereum
      'ETHEREUM': 'ETHUSD', 'ETH': 'ETHUSD',
      'إيثريوم': 'ETHUSD',
      // EUR/USD — V12: Do NOT map standalone "EUR" or "يورو" to EURUSD
      // because "يورو" could be part of EUR/JPY, EUR/GBP, etc.
      // Only map explicit EUR/USD terms
      'EURO': 'EURUSD', 'يورو دولار': 'EURUSD', 'اليورو دولار': 'EURUSD',
      // GBP/USD
      'POUND': 'GBPUSD', 'STERLING': 'GBPUSD',
      'جنيه دولار': 'GBPUSD', 'الجنيه دولار': 'GBPUSD',
      // USD/JPY — V12: Do NOT map standalone "JPY" or "ين" to USDJPY
      // because "ين" could be part of EUR/JPY, GBP/JPY, etc.
      'دولار ين': 'USDJPY',
      // EUR/JPY
      'EURJPY': 'EURJPY', 'يورو ين': 'EURJPY', 'اليورو ين': 'EURJPY',
      // GBP/JPY
      'GBPJPY': 'GBPJPY', 'جنيه ين': 'GBPJPY', 'الجنيه ين': 'GBPJPY',
      // USD/CHF — V12: standalone "فرنك" could be part of EUR/CHF, GBP/CHF
      'USDCHF': 'USDCHF', 'دولار فرنك': 'USDCHF',
      // AUD/USD
      'AUDUSD': 'AUDUSD', 'دولار أسترالي': 'AUDUSD', 'أسترالي': 'AUDUSD',
      // NZD/USD
      'NZDUSD': 'NZDUSD', 'دولار نيوزيلندي': 'NZDUSD', 'نيوزيلندي': 'NZDUSD',
      // USD/CAD
      'USDCAD': 'USDCAD', 'دولار كندي': 'USDCAD', 'كندي': 'USDCAD',
      // EUR/GBP
      'EURGBP': 'EURGBP', 'يورو جنيه': 'EURGBP',
      // NASDAQ
      'NASDAQ': 'NDX', 'NQ': 'NDX', 'ناسداك': 'NDX',
      // S&P 500
      'SP500': 'SPX', 'SPY': 'SPX', 'S&P': 'SPX',
      // DAX
      'DAX': 'DAX',
      // Popular Stocks
      'APPLE': 'AAPL', 'ابل': 'AAPL', 'أبل': 'AAPL',
      'TESLA': 'TSLA', 'تسلا': 'TSLA',
      'MICROSOFT': 'MSFT', 'مايكروسوفت': 'MSFT',
      'GOOGLE': 'GOOGL', 'جوجل': 'GOOGL', 'ALPHABET': 'GOOGL',
      'AMAZON': 'AMZN', 'امازون': 'AMZN', 'أمازون': 'AMZN',
      'NVIDIA': 'NVDA', 'انفيديا': 'NVDA', 'إنفيديا': 'NVDA',
      'META': 'META', 'ميتا': 'META',
      'NETFLIX': 'NFLX', 'نتفلكس': 'NFLX', 'نتفليكس': 'NFLX',
    };

    // Resolve the input symbol through the name map
    const resolvedSymbol = NAME_TO_SYMBOL[symbolUpper] || NAME_TO_SYMBOL[symbol.toUpperCase()] || symbolUpper;

    // Map resolved symbol to search aliases
    const symbolAliases: Record<string, string[]> = {
      EURUSD: ['EURUSD', 'EUR/USD', 'Euro Dollar', 'يورو دولار', 'Euro', 'Dollar'],
      GBPUSD: ['GBPUSD', 'GBP/USD', 'Pound Dollar', 'Cable', 'جنيه إسترليني'],
      USDJPY: ['USDJPY', 'USD/JPY', 'Dollar Yen', 'دولار ين'],
      USDCHF: ['USDCHF', 'USD/CHF', 'Swissy', 'فرنك سويسري', 'دولار فرنك'],
      AUDUSD: ['AUDUSD', 'AUD/USD', 'Aussie', 'دولار أسترالي'],
      NZDUSD: ['NZDUSD', 'NZD/USD', 'Kiwi', 'دولار نيوزيلندي'],
      USDCAD: ['USDCAD', 'USD/CAD', 'Loonie', 'دولار كندي'],
      EURGBP: ['EURGBP', 'EUR/GBP', 'يورو جنيه'],
      EURJPY: ['EURJPY', 'EUR/JPY', 'يورو ين', 'Euro Yen'],
      GBPJPY: ['GBPJPY', 'GBP/JPY', 'جنيه ين', 'Pound Yen'],
      EURAUD: ['EURAUD', 'EUR/AUD'],
      EURNZD: ['EURNZD', 'EUR/NZD'],
      EURCAD: ['EURCAD', 'EUR/CAD'],
      EURCHF: ['EURCHF', 'EUR/CHF', 'يورو فرنك'],
      GBPAUD: ['GBPAUD', 'GBP/AUD'],
      GBPNZD: ['GBPNZD', 'GBP/NZD'],
      GBPCAD: ['GBPCAD', 'GBP/CAD'],
      GBPCHF: ['GBPCHF', 'GBP/CHF', 'جنيه فرنك'],
      AUDJPY: ['AUDJPY', 'AUD/JPY'],
      NZDJPY: ['NZDJPY', 'NZD/JPY'],
      CADJPY: ['CADJPY', 'CAD/JPY'],
      CHFJPY: ['CHFJPY', 'CHF/JPY'],
      XAUUSD: ['XAUUSD', 'XAU', 'Gold', 'ذهب', 'الذهب', 'Or', 'Oro', 'Altın', 'Gold Price'],
      XAGUSD: ['XAGUSD', 'XAG', 'Silver', 'فضة', 'الفضة', 'Argent', 'Plata', 'Gümüş'],
      BTCUSD: ['BTCUSD', 'BTC', 'Bitcoin', 'بتكوين', 'البتكوين', 'BTCUSDT'],
      ETHUSD: ['ETHUSD', 'ETH', 'Ethereum', 'إيثريوم'],
      CL: ['CL', 'WTI', 'Crude Oil', 'Oil', 'نفط', 'النفط', 'خام', 'Pétrole', 'Petróleo', 'Petrol'],
      BZ: ['BZ', 'Brent', 'برنت', 'Brent Crude'],
      NDX: ['NDX', 'NASDAQ', 'Nasdaq 100', 'ناسداك'],
      SPX: ['SPX', 'S&P 500', 'SPY', 'SP500'],
      DAX: ['DAX', 'DAX 40', 'German DAX'],
      // Popular stocks
      AAPL: ['AAPL', 'Apple', 'ابل', 'أبل'],
      TSLA: ['TSLA', 'Tesla', 'تسلا'],
      MSFT: ['MSFT', 'Microsoft', 'مايكروسوفت'],
      GOOGL: ['GOOGL', 'Google', 'Alphabet', 'جوجل'],
      AMZN: ['AMZN', 'Amazon', 'امازون', 'أمازون'],
      NVDA: ['NVDA', 'NVIDIA', 'انفيديا', 'إنفيديا'],
      META: ['META', 'Meta', 'Facebook', 'ميتا'],
      NFLX: ['NFLX', 'Netflix', 'نتفليكس'],
    };

    const searchSymbols = symbolAliases[resolvedSymbol] || [resolvedSymbol, symbolUpper, symbol];

    // ── IMPORTANT: Separate search terms for DB query vs text search ──
    // Some terms like "Or" (French for gold) or "XAU" match too broadly in text.
    // "Or" matches the English word "or" in every article → false positives.
    // We use ALL terms for affectedAssets search (JSON field, precise match),
    // but only UNAMBIGUOUS terms for title/summary text search.

    const AMBIGUOUS_TERMS = new Set([
      'or',      // French "or" = gold, but English "or" is everywhere
      'xau',     // Too short, matches in unexpected contexts
      'xag',     // Same
      'cl',      // Too short, common abbreviation
      'bz',      // Too short
      'eth',     // Ambiguous: Ethereum vs other "eth" words
      'eur',     // Too short for text search
      'gbp',     // Too short
      'jpy',     // Too short
      'chf',     // Too short
      'aud',     // Too short
      'nzd',     // Too short
      'cad',     // Too short
      'spx',     // Too short
      'ndX',     // Too short
      'dax',     // Could match company names
    ]);

    // Terms safe for text search (unambiguous, meaningful words)
    const textSearchTerms = searchSymbols.filter(s => !AMBIGUOUS_TERMS.has(s.toLowerCase()));

    // Build OR conditions for affectedAssets field (use ALL terms — JSON field is precise)
    const assetConditions = searchSymbols.flatMap(s => [
      { affectedAssets: { contains: s, mode: 'insensitive' as const } },
    ]);

    // Text search: only use unambiguous terms to avoid false positives
    const textConditions = textSearchTerms.flatMap(s => [
      { title: { contains: s, mode: 'insensitive' as const } },
      { titleAr: { contains: s, mode: 'insensitive' as const } },
      { summary: { contains: s, mode: 'insensitive' as const } },
      { summaryAr: { contains: s, mode: 'insensitive' as const } },
    ]);

    const selectFields = {
      id: true, title: true, titleAr: true,
      summary: true, summaryAr: true, sentiment: true,
      category: true, categoryId: true, slug: true,
      sourceName: true, locale: true, fetchedAt: true,
      affectedAssets: true,
    };

    // ── Locale-aware article fetching ──
    // V6: Filter by locale to avoid showing Turkish/French articles to Arabic/English users.
    // We try the user's locale first, then fall back to all locales if too few results.
    const LOCALE_MAP: Record<string, string[]> = {
      ar: ['ar', 'ar-SA'],
      en: ['en', 'en-US', 'en-GB'],
      fr: ['fr', 'fr-FR'],
      tr: ['tr', 'tr-TR'],
      es: ['es', 'es-ES'],
    };
    const preferredLocales = LOCALE_MAP[locale] || ['en'];

    // Phase 1: Try fetching articles in the user's locale
    let articles: any[] = [];
    try {
      articles = await db.newsItem.findMany({
        where: {
          isReady: true,
          locale: { in: preferredLocales },
          OR: [...assetConditions, ...textConditions],
        },
        select: selectFields,
        orderBy: { fetchedAt: 'desc' },
        take: Math.max(limit * 2, 15),
      });
    } catch { /* locale field might not exist */ }

    // Phase 2: If too few locale-matched results, broaden search
    if (articles.length < 3) {
      try {
        const broaderArticles = await db.newsItem.findMany({
          where: {
            isReady: true,
            OR: [...assetConditions, ...textConditions],
          },
          select: selectFields,
          orderBy: { fetchedAt: 'desc' },
          take: Math.max(limit * 2, 15),
        });
        // Merge, deduplicate by id
        const existingIds = new Set(articles.map(a => a.id));
        for (const a of broaderArticles) {
          if (!existingIds.has(a.id)) {
            articles.push(a);
          }
        }
      } catch {
        // Final fallback
        try {
          articles = await db.newsItem.findMany({
            where: {
              isReady: true,
              OR: textConditions,
            },
            select: selectFields,
            orderBy: { fetchedAt: 'desc' },
            take: limit,
          });
        } catch {
          articles = [];
        }
      }
    }

    // Score and rank articles — prioritize those with symbol in affectedAssets
    // AND verify content relevance (penalize/remove mis-tagged articles)
    const COMMODITY_NAMES: Record<string, string[]> = {
      XAUUSD: ['gold', 'ذهب', 'الذهب', 'oro', 'altın', 'goud', 'gold price', 'xauusd', 'xau/usd'],
      XAGUSD: ['silver', 'فضة', 'الفضة', 'argent', 'plata', 'gümüş', 'xagusd', 'xag/usd'],
      CL: ['oil', 'crude', 'wti', 'نفط', 'النفط', 'خام', 'pétrole', 'petróleo', 'petrol', 'crude oil'],
      BZ: ['brent', 'برنت', 'brent crude'],
      BTCUSD: ['bitcoin', 'btc', 'بتكوين', 'البتكوين', 'btcusdt', 'crypto'],
      ETHUSD: ['ethereum', 'إيثريوم', 'eth/usd', 'ether'],
      EURUSD: ['euro', 'يورو', 'eur/usd', 'euro dollar', 'eurusd'],
      GBPUSD: ['pound', 'sterling', 'جنيه', 'gbp/usd', 'gbpusd', 'cable'],
      USDJPY: ['yen', 'ين', 'usd/jpy', 'usdjpy', 'dollar yen'],
      USDCHF: ['franc', 'فرنك', 'usd/chf', 'usdchf'],
      AUDUSD: ['aussie', 'أسترالي', 'aud/usd', 'audusd'],
      NZDUSD: ['kiwi', 'نيوزيلندي', 'nzd/usd', 'nzdusd'],
      USDCAD: ['loonie', 'كندي', 'usd/cad', 'usdcad'],
      NDX: ['nasdaq', 'ناسداك', 'nasdaq 100'],
      SPX: ['s&p 500', 'sp500', 'spy', 's&p'],
      DAX: ['dax 40', 'german dax'],
    };

    // ── Category mismatch map ──
    // If we're searching for a commodity/forex/crypto, articles about individual stocks
    // are almost certainly mis-tagged and should be heavily penalized.
    const ASSET_TYPE_MAP: Record<string, 'commodity' | 'forex' | 'crypto' | 'index'> = {
      XAUUSD: 'commodity', XAGUSD: 'commodity', CL: 'commodity', BZ: 'commodity',
      BTCUSD: 'crypto', ETHUSD: 'crypto',
      EURUSD: 'forex', GBPUSD: 'forex', USDJPY: 'forex', USDCHF: 'forex',
      AUDUSD: 'forex', NZDUSD: 'forex', USDCAD: 'forex',
      EURGBP: 'forex', EURJPY: 'forex', GBPJPY: 'forex',
      NDX: 'index', SPX: 'index', DAX: 'index',
    };
    const searchedAssetType = ASSET_TYPE_MAP[resolvedSymbol];
    const STOCK_CATEGORIES = new Set(['stocks', 'acciones', 'stock analysis', 'أسهم', 'actions']);

    const relevantNames = COMMODITY_NAMES[resolvedSymbol] || searchSymbols.map(s => s.toLowerCase());

    /** Word-boundary check: returns true only if `term` appears as a whole word in `text` */
    function hasWord(text: string, term: string): boolean {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-zA-ZÀ-ÿآ-ي])${escaped}(?:[^a-zA-ZÀ-ÿآ-ي]|$)`, 'i');
      return regex.test(text);
    }

    const scored = articles.map(article => {
      let score = 0;
      const assetsRaw = article.affectedAssets;
      let hasAssetTag = false;

      if (assetsRaw && typeof assetsRaw === 'string') {
        try {
          const assets = JSON.parse(assetsRaw || '[]');
          const hasSymbol = assets.some((a: any) =>
            (a.symbol || '').toUpperCase() === resolvedSymbol ||
            searchSymbols.some(s => (a.symbol || '').toUpperCase() === s.toUpperCase())
          );
          if (hasSymbol) { score += 10; hasAssetTag = true; }
        } catch { /* ignore */ }
        // Also check raw string
        if (assetsRaw.toUpperCase().includes(resolvedSymbol)) { score += 5; hasAssetTag = true; }
      }

      // Title/summary match — use WORD-BOUNDARY matching, not substring
      const titleStr = (article.titleAr || article.title || '').toLowerCase();
      const summaryStr = (article.summaryAr || article.summary || '').toLowerCase();
      const contentStr = titleStr + ' ' + summaryStr;

      let hasContentMatch = false;

      // Check unambiguous search terms with word boundaries
      for (const s of textSearchTerms) {
        if (hasWord(titleStr, s.toLowerCase())) { score += 3; hasContentMatch = true; }
        if (hasWord(summaryStr, s.toLowerCase())) { score += 2; hasContentMatch = true; }
      }
      // Check commodity-specific names with word boundaries
      for (const name of relevantNames) {
        if (hasWord(contentStr, name.toLowerCase())) { score += 2; hasContentMatch = true; }
      }

      // ── CRITICAL: Relevance verification ──
      // If an article has the asset TAG but the content (title+summary) does NOT
      // mention the asset or any of its known names, it's likely MIS-TAGGED.
      if (hasAssetTag && !hasContentMatch) {
        score -= 20; // Strong penalty — likely mis-tagged by AI analyzer
      }

      // ── Category mismatch: commodity/forex/crypto query → stock article ──
      // If we're searching for gold/XAUUSD and the article is in "Stocks"/"Acciones",
      // it's almost certainly a false positive from the stock pipeline.
      if (searchedAssetType) {
        const articleCategory = ((article.category || '') + ' ' + (article.categoryId || '')).toLowerCase();
        const isStockArticle = STOCK_CATEGORIES.has(articleCategory.trim()) ||
          ['stock analyzer', 'analizador de acciones', 'stock analysis'].some(s =>
            (article.sourceName || '').toLowerCase().includes(s)
          );
        if (isStockArticle && searchedAssetType !== 'index') {
          // Stock article for a non-stock query → massive penalty
          score -= 25;
        }
      }

      // Is the searched asset the PRIMARY asset in affectedAssets?
      if (hasAssetTag && assetsRaw && typeof assetsRaw === 'string') {
        try {
          const assets = JSON.parse(assetsRaw || '[]');
          if (Array.isArray(assets) && assets.length > 0) {
            const firstAsset = assets[0];
            const firstSymbol = (firstAsset?.symbol || '').toUpperCase();
            if (firstSymbol !== resolvedSymbol &&
                !searchSymbols.some(s => firstSymbol === s.toUpperCase())) {
              score -= 10; // Secondary/cascade asset — not the main focus
            }
          }
        } catch { /* ignore */ }
      }

      // Financial category boost
      const cat = (article.categoryId || '').toLowerCase();
      if (['forex', 'currencies', 'commodities', 'crypto'].includes(cat)) score += 3;
      if (['stocks', 'economy'].includes(cat)) score += 1;

      // Source quality boost — financial sources are more likely to have correct tags
      const sourceName = (article.sourceName || '').toLowerCase();
      if (['investing.com', 'forexlive', 'fxstreet', 'dailyfx', 'kitco', 'goldprice'].some(s => sourceName.includes(s))) {
        score += 3;
      }
      // Generic sources (stock analyzer, etc.) more likely to mis-tag
      if (['stock analyzer', 'analizador', 'automated', 'algorithm'].some(s => sourceName.includes(s))) {
        score -= 5; // Stronger penalty for automated stock analyzers
      }

      // ── V6: Locale mismatch penalty ──
      // If user's locale is Arabic but the article is in Turkish/French, penalize heavily.
      // Prefer articles in the user's language.
      if (article.locale && preferredLocales.length > 0) {
        if (preferredLocales.includes(article.locale)) {
          score += 8; // Strong boost for articles in user's language
        } else {
          score -= 20; // Strong penalty for wrong-language articles
          // Extra penalty for Spanish articles when user is English (common problem)
          if (article.locale.startsWith('es') && (locale === 'en' || locale === 'ar')) {
            score -= 15; // Additional penalty — Spanish crypto articles are a major source of wrong-locale results
          }
        }
      }

      // ── V6: Misleading keyword penalty ──
      // "Goldman Sachs" appears when searching for "Gold" — these are NOT about gold.
      // Same for "Goldman" in any article about stocks, not commodities.
      if (resolvedSymbol === 'XAUUSD') {
        const titleEn = (article.title || '').toLowerCase();
        const summaryEn = (article.summary || '').toLowerCase();
        const fullText = titleEn + ' ' + summaryEn;
        if (fullText.includes('goldman')) {
          score -= 30; // Almost certainly NOT about gold as a commodity
        }
        if (fullText.includes('goldman sachs') || fullText.includes('goldman says')) {
          score -= 50; // Definitely about Goldman Sachs the bank, not gold
        }
      }
      // Same for "Fortune" when searching for crypto (e.g., Fortune Crypto 100 ≠ Bitcoin news)
      if (resolvedSymbol === 'BTCUSD' || resolvedSymbol === 'ETHUSD') {
        const titleEn = (article.title || '').toLowerCase();
        if (titleEn.includes('fortune crypto') || titleEn.includes('fortune 100')) {
          score -= 20; // Listicle, not actual crypto analysis
        }
      }

      // ── V8: Promotional/advertising article filter ──
      // Exclude articles that are advertisements for trading platforms, brokers, etc.
      const fullTitle = (article.title || '') + ' ' + (article.titleAr || '');
      const fullSummaryLower = (article.summary || '') + ' ' + (article.summaryAr || '');
      const fullTextLower = (fullTitle + ' ' + fullSummaryLower).toLowerCase();
      
      // Promotional platform keywords (trading platforms, brokers, etc.)
      const PROMO_KEYWORDS = [
        'mitrade', 'etoro', 'plus500', 'avatrade', 'iq option', 'binance referral',
        'signup bonus', 'register now', 'open account', 'trade with us',
        'سجّل الآن', 'افتح حساب', 'تداول معنا', 'مكافأة التسجيل',
        'inscríbete ahora', 'abre cuenta', 'opera con nosotros',
        'inscrivez-vous', 'ouvrez un compte', 'tradez avec nous',
        'kaydolun', 'hesap açın', 'bizimle işlem yapın',
      ];
      const isPromotional = PROMO_KEYWORDS.some(kw => fullTextLower.includes(kw));
      if (isPromotional) {
        score -= 40; // Strong penalty for promotional content
      }
      
      // Non-financial article filter (sports, entertainment, etc.)
      const NON_FINANCIAL_KEYWORDS = [
        'medalya', 'madalya', 'champion', 'championnat', 'campeón', 'championnat',
        'world cup', 'كأس العالم', 'coupe du monde', 'copa del mundo', 'dünya kupası',
        'festival', 'concert', 'مهرجان', 'حفل', 'festival de musique',
        'olympics', 'أولمبي', 'olimpiyat', 'olímpico', 'olympique',
        'movie', 'film', 'فيلم', 'cinéma', 'cine', 'sinema',
        'esports', 'gaming', 'لعب', 'jeu vidéo',
        'recipe', 'cooking', 'وصفة', 'receta', 'recette', 'yemek tarifi',
      ];
      const isNonFinancial = NON_FINANCIAL_KEYWORDS.some(kw => fullTextLower.includes(kw));
      if (isNonFinancial) {
        score -= 35; // Strong penalty for non-financial content
      }
      
      // Untranslated headline penalty (English headline for non-English user)
      // If user's locale is not English but the article title is in English while summary is translated,
      // the title wasn't properly translated
      if (locale !== 'en' && article.title && article.titleAr) {
        const titleEn = article.title;
        const isEnglishOnlyTitle = /^[A-Za-z0-9\s'".,:;!?()\-–—$%&@#+=\/\\]+$/.test(titleEn);
        if (isEnglishOnlyTitle && article.titleAr && article.titleAr !== titleEn) {
          // Title is English but there IS an Arabic translation available
          // Minor penalty — the display code should prefer the translated version
          score -= 2;
        }
      }

      return { article, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.article.fetchedAt?.getTime?.() || 0) - (a.article.fetchedAt?.getTime?.() || 0);
    });

    // Only include articles with positive relevance score (negative = mis-tagged/irrelevant)
    let topArticles = scored.filter(s => s.score > 0).slice(0, limit * 2).map(s => s.article);

    // ── V7: Locale-aware filtering after scoring ──
    // If we have enough articles in the user's locale, filter out wrong-locale ones.
    // This prevents Spanish/French articles from appearing for English/Arabic users.
    if (preferredLocales.length > 0 && topArticles.length > 3) {
      const userLocaleArticles = topArticles.filter(a =>
        !a.locale || preferredLocales.includes(a.locale)
      );
      // If at least 3 articles match user's locale, use only those
      if (userLocaleArticles.length >= 3) {
        topArticles = userLocaleArticles;
      }
    }
    topArticles = topArticles.slice(0, limit);

    // NO fallback with negative scores — returning no articles is better than returning
    // wrong articles (e.g., MSFT analysis for a gold query). The AI will handle
    // the empty result gracefully with a "no direct news found" response.

    // Compute sentiment summary
    let sentimentSummary = null;
    if (topArticles.length > 0) {
      const positive = topArticles.filter(a =>
        a.sentiment === 'positive' || a.sentiment === 'bullish'
      ).length;
      const negative = topArticles.filter(a =>
        a.sentiment === 'negative' || a.sentiment === 'bearish'
      ).length;
      const total = topArticles.length;
      const positivePercent = Math.round((positive / total) * 100);
      const negativePercent = Math.round((negative / total) * 100);

      let momentumLabel = 'Neutral / Mixed';
      let momentumEmoji = '🟡';
      if (positivePercent >= 60) { momentumLabel = 'Bullish'; momentumEmoji = '🟢'; }
      else if (negativePercent >= 60) { momentumLabel = 'Bearish'; momentumEmoji = '🔴'; }

      sentimentSummary = { total, positive, negative, positivePercent, negativePercent, momentumLabel, momentumEmoji };
    }

    return {
      symbol: resolvedSymbol,
      count: topArticles.length,
      sentimentSummary,
      articles: topArticles.map(a => {
        const internalUrl = locale === 'ar'
          ? `/news/${a.slug}`
          : `/${locale}/news/${a.slug}`;
        // V6: Smart title selection — prefer user's locale, not just Arabic
        const articleLocale = a.locale || 'en';
        const isUserLocale = preferredLocales.includes(articleLocale);
        const title = isUserLocale
          ? (locale === 'ar' && a.titleAr ? a.titleAr : a.title)
          : (a.titleAr || a.title); // Fallback: prefer Arabic then original
        const summary = isUserLocale
          ? (locale === 'ar' && a.summaryAr ? a.summaryAr : a.summary || '')
          : (a.summaryAr || a.summary || '');
        // V6: Human-readable date instead of ISO string
        const dateStr = a.fetchedAt
          ? new Date(a.fetchedAt).toLocaleDateString(
              locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : locale === 'es' ? 'es-ES' : 'en-US',
              { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            )
          : '';
        return {
          id: a.id,
          title: title.slice(0, 200),
          titleEn: a.title,
          summary: summary.slice(0, 300),
          sentiment: a.sentiment,
          category: a.category,
          url: internalUrl,
          sourceName: a.sourceName || null,
          date: dateStr,
          locale: articleLocale,
        };
      }),
      looseRelevance: topArticles.length > 0 && scored.filter(s => s.score > 0).length === 0,
    };
  } catch (error: any) {
    return { symbol, error: error.message || 'Asset search failed' };
  }
}

// ─── 11. Get Forex Movers ────────────────────────────────────────

/**
 * Finds the top-moving forex pairs based on news sentiment and volume.
 * Searches articles tagged with forex pair symbols in affectedAssets.
 */
export async function getForexMovers(
  period: string = 'week',
  locale: Locale = 'ar'
): Promise<Record<string, any>> {
  try {
    const majorPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD'];

    // Determine date range based on period
    const now = new Date();
    const startDate = new Date(now);
    if (period === 'week') startDate.setDate(startDate.getDate() - 7);
    else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
    else startDate.setDate(startDate.getDate() - 3);

    // Search for forex-related articles in the period
    const forexArticles = await db.newsItem.findMany({
      where: {
        isReady: true,
        fetchedAt: { gte: startDate },
        OR: [
          ...majorPairs.flatMap(pair => [
            { affectedAssets: { contains: pair, mode: 'insensitive' as const } },
          ]),
          { categoryId: { equals: 'forex', mode: 'insensitive' as const } },
          { category: { contains: 'فوركس', mode: 'insensitive' as const } },
          { category: { contains: 'Forex', mode: 'insensitive' as const } },
          { category: { contains: 'currencies', mode: 'insensitive' as const } },
          { category: { contains: 'عملات', mode: 'insensitive' as const } },
        ],
      },
      select: {
        id: true, title: true, titleAr: true,
        summary: true, summaryAr: true, sentiment: true,
        category: true, slug: true, sourceName: true, fetchedAt: true,
        affectedAssets: true,
      },
      orderBy: { fetchedAt: 'desc' },
      take: 30,
    });

    // Group articles by forex pair
    const pairData: Record<string, { positive: number; negative: number; neutral: number; articles: any[] }> = {};

    for (const article of forexArticles) {
      let matchedPair = '';
      try {
        const assets = JSON.parse(article.affectedAssets || '[]');
        for (const pair of majorPairs) {
          if (assets.some((a: any) => (a.symbol || '').toUpperCase() === pair)) {
            matchedPair = pair;
            break;
          }
        }
      } catch { /* ignore */ }

      // Fallback: check title/summary for pair names
      if (!matchedPair) {
        const text = `${article.title} ${article.titleAr} ${article.summary} ${article.summaryAr}`.toUpperCase();
        for (const pair of majorPairs) {
          if (text.includes(pair)) {
            matchedPair = pair;
            break;
          }
        }
      }

      if (matchedPair) {
        if (!pairData[matchedPair]) {
          pairData[matchedPair] = { positive: 0, negative: 0, neutral: 0, articles: [] };
        }
        const sent = (article.sentiment || '').toLowerCase();
        if (sent === 'positive' || sent === 'bullish') pairData[matchedPair].positive++;
        else if (sent === 'negative' || sent === 'bearish') pairData[matchedPair].negative++;
        else pairData[matchedPair].neutral++;

        if (pairData[matchedPair].articles.length < 3) {
          const internalUrl = locale === 'ar'
            ? `/news/${article.slug}`
            : `/${locale}/news/${article.slug}`;
          pairData[matchedPair].articles.push({
            title: article.titleAr || article.title,
            summary: (article.summaryAr || article.summary || '').slice(0, 200),
            sentiment: article.sentiment,
            url: internalUrl,
            sourceName: article.sourceName || null,
            date: article.fetchedAt?.toISOString?.() || '',
          });
        }
      }
    }

    // Sort pairs by total article count (most active = top mover)
    const sortedPairs = Object.entries(pairData)
      .map(([pair, data]) => {
        const total = data.positive + data.negative + data.neutral;
        const sentimentScore = data.positive - data.negative;
        const direction = sentimentScore > 0 ? 'bullish' : sentimentScore < 0 ? 'bearish' : 'neutral';
        return { pair, ...data, total, sentimentScore, direction };
      })
      .sort((a, b) => b.total - a.total);

    const directionLabels: Record<string, Record<Locale, string>> = {
      bullish: { ar: 'صاعد', en: 'Bullish', fr: 'Haussier', tr: 'Yükseliş', es: 'Alcista' },
      bearish: { ar: 'هابط', en: 'Bearish', fr: 'Baissier', tr: 'Düşüş', es: 'Bajista' },
      neutral: { ar: 'محايد', en: 'Neutral', fr: 'Neutre', tr: 'Nötr', es: 'Neutral' },
    };

    return {
      period,
      count: sortedPairs.length,
      totalArticles: forexArticles.length,
      movers: sortedPairs.map(p => ({
        pair: p.pair,
        direction: p.direction,
        directionLabel: directionLabels[p.direction]?.[locale] || p.direction,
        totalArticles: p.total,
        sentimentScore: p.sentimentScore,
        articles: p.articles,
      })),
      message: sortedPairs.length === 0
        ? (locale === 'ar'
            ? 'لا توجد أخبار فوركس كافية في الفترة المحددة. جرب فترة أطول أو اسأل عن زوج عملات محدد.'
            : 'Not enough forex news in the specified period. Try a longer period or ask about a specific pair.')
        : undefined,
    };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch forex movers' };
  }
}
