// ─── Realtime Search Engine V2 ──────────────────────────────────
// V1000: AI-Agent-First Architecture
//
// Uses Yahoo Finance (FREE, no API key needed!) and other
// financial APIs to fetch REAL-TIME prices.
// Falls back to ZAI web search only on the Z.ai platform.
//
// This solves the stale DB prices problem WITHOUT requiring
// any external API keys.

import { getQuote, type QuoteData } from '@/lib/financial-apis';

// ─── Types ────────────────────────────────────────────────────────

export interface RealtimePrice {
  symbol: string;
  name: string;
  nameAr: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  source: string;
  snippet: string;
  searchTimestamp: number;
}

export interface RealtimeSearchResult {
  prices: RealtimePrice[];
  marketContext: string;
  searchTimeMs: number;
  queriesUsed: number;
  sources: string[];
}

// ─── Symbol to Yahoo Finance format mapping ────────────────────

const YAHOO_SYMBOL_MAP: Record<string, {
  yahooSymbol: string;
  nameAr: string;
  nameEn: string;
  category: string;
}> = {
  // Crypto
  'BTC':  { yahooSymbol: 'BTC-USD',  nameAr: 'البتكوين',     nameEn: 'Bitcoin',        category: 'crypto' },
  'ETH':  { yahooSymbol: 'ETH-USD',  nameAr: 'الإيثريوم',    nameEn: 'Ethereum',       category: 'crypto' },
  'SOL':  { yahooSymbol: 'SOL-USD',  nameAr: 'سولانا',       nameEn: 'Solana',         category: 'crypto' },
  'DOGE': { yahooSymbol: 'DOGE-USD', nameAr: 'دوجكوين',      nameEn: 'Dogecoin',       category: 'crypto' },
  'XRP':  { yahooSymbol: 'XRP-USD',  nameAr: 'ريبيل',        nameEn: 'XRP',            category: 'crypto' },
  // Commodities
  'XAU':  { yahooSymbol: 'GC=F',     nameAr: 'الذهب',         nameEn: 'Gold',            category: 'commodity' },
  'XAG':  { yahooSymbol: 'SI=F',     nameAr: 'الفضة',         nameEn: 'Silver',          category: 'commodity' },
  'WTI':  { yahooSymbol: 'CL=F',     nameAr: 'النفط الخام',   nameEn: 'Crude Oil WTI',   category: 'commodity' },
  'BRENT':{ yahooSymbol: 'BZ=F',     nameAr: 'نفط برنت',      nameEn: 'Brent Oil',       category: 'commodity' },
  // Forex
  'EURUSD': { yahooSymbol: 'EURUSD=X', nameAr: 'يورو/دولار',  nameEn: 'EUR/USD',       category: 'forex' },
  'GBPUSD': { yahooSymbol: 'GBPUSD=X', nameAr: 'جنيه/دولار',  nameEn: 'GBP/USD',       category: 'forex' },
  'USDJPY': { yahooSymbol: 'USDJPY=X', nameAr: 'دولار/ين',    nameEn: 'USD/JPY',       category: 'forex' },
  'USDCHF': { yahooSymbol: 'USDCHF=X', nameAr: 'دولار/فرنك',  nameEn: 'USD/CHF',       category: 'forex' },
  'AUDUSD': { yahooSymbol: 'AUDUSD=X', nameAr: 'أسترالي/دولار', nameEn: 'AUD/USD',     category: 'forex' },
  'USDCAD': { yahooSymbol: 'USDCAD=X', nameAr: 'دولار/كندي',  nameEn: 'USD/CAD',       category: 'forex' },
  // Indices
  'SPX':  { yahooSymbol: '^GSPC',    nameAr: 'إس آند بي 500',  nameEn: 'S&P 500',       category: 'index' },
  'NDX':  { yahooSymbol: '^IXIC',    nameAr: 'ناسداك',          nameEn: 'Nasdaq 100',    category: 'index' },
  'DJI':  { yahooSymbol: '^DJI',     nameAr: 'داو جونز',        nameEn: 'Dow Jones',     category: 'index' },
  'DXY':  { yahooSymbol: 'DX-Y.NYB', nameAr: 'مؤشر الدولار',    nameEn: 'US Dollar Index', category: 'index' },
  'FTSE': { yahooSymbol: '^FTSE',    nameAr: 'فوتسي 100',       nameEn: 'FTSE 100',      category: 'index' },
  'NKY':  { yahooSymbol: '^N225',    nameAr: 'نيكي 225',        nameEn: 'Nikkei 225',    category: 'index' },
  // Saudi market
  'TASI': { yahooSymbol: '1561.SR',  nameAr: 'مؤشر تداول',     nameEn: 'Tadawul All Share', category: 'index' },
  // Bonds
  'US10Y': { yahooSymbol: '^TNX',    nameAr: 'سندات أمريكية 10 سنوات', nameEn: 'US 10Y Treasury', category: 'bond' },
};

// ─── Asset detection from user message ──────────────────────────

const SYMBOL_PATTERNS: Array<{ pattern: RegExp; symbol: string }> = [
  { pattern: /\b(btc|bitcoin|بيتكوين|بتكوين)\b/i, symbol: 'BTC' },
  { pattern: /\b(eth|ethereum|إيثريوم|ايثريوم)\b/i, symbol: 'ETH' },
  { pattern: /\b(sol|solana|سولانا)\b/i, symbol: 'SOL' },
  { pattern: /\b(doge|دوجكوين)\b/i, symbol: 'DOGE' },
  { pattern: /\b(xrp|ريبيل)\b/i, symbol: 'XRP' },
  { pattern: /\b(xau|gold|ذهب)\b/i, symbol: 'XAU' },
  { pattern: /\b(xag|silver|فضة)\b/i, symbol: 'XAG' },
  { pattern: /\b(oil|wti|نفط)\b/i, symbol: 'WTI' },
  { pattern: /\b(brent|برنت)\b/i, symbol: 'BRENT' },
  { pattern: /\b(eurusd|يورو\s*دولار)\b/i, symbol: 'EURUSD' },
  { pattern: /\b(gbpusd|جنيه\s*دولار)\b/i, symbol: 'GBPUSD' },
  { pattern: /\b(usdjpy|دولار\s*ين)\b/i, symbol: 'USDJPY' },
  { pattern: /\b(s&p|spx|سب\s*اند\s*بي)\b/i, symbol: 'SPX' },
  { pattern: /\b(nasdaq|ndx|ناسداك)\b/i, symbol: 'NDX' },
  { pattern: /\b(dxy|مؤشر\s*الدولار)\b/i, symbol: 'DXY' },
  { pattern: /\b(dow|دوو|داو)\b/i, symbol: 'DJI' },
  { pattern: /\b(ftse|فوتسي|بريطان)\b/i, symbol: 'FTSE' },
  { pattern: /\b(nikkei|نيكي|يابان)\b/i, symbol: 'NKY' },
  { pattern: /\b(tasi|تداول|tadawul|السعودية)\b/i, symbol: 'TASI' },
  { pattern: /\b(us10y|سندات|treasury)\b/i, symbol: 'US10Y' },
];

function detectAssetsInMessage(message: string): string[] {
  const symbols = new Set<string>();
  const lower = message.toLowerCase();

  for (const { pattern, symbol } of SYMBOL_PATTERNS) {
    if (pattern.test(lower)) {
      symbols.add(symbol);
    }
  }

  // If no specific asset detected, default to major ones
  if (symbols.size === 0) {
    if (/سوق|market|أسهم|stocks|أسعار|prices|تحليل|analysis|كيف|how|صباح|morning|ملخص|summary/i.test(lower)) {
      return ['BTC', 'XAU', 'WTI', 'SPX', 'EURUSD'];
    }
  }

  return [...symbols];
}

// ─── Fetch real-time prices using Yahoo Finance ────────────────

export async function searchRealTimePrices(
  userMessage: string,
  locale: string = 'ar',
): Promise<RealtimeSearchResult> {
  const startTime = Date.now();
  const prices: RealtimePrice[] = [];
  const sources: string[] = [];
  let queriesUsed = 0;

  // Detect which assets the user is asking about
  const detectedSymbols = detectAssetsInMessage(userMessage);
  const symbolsToSearch = detectedSymbols.length > 0 ? detectedSymbols : ['BTC', 'XAU', 'WTI', 'SPX', 'EURUSD'];

  console.log(`[RealtimeSearch] Fetching real-time prices for: ${symbolsToSearch.join(', ')}`);

  // Fetch quotes for all symbols in parallel
  const quotePromises = symbolsToSearch.slice(0, 8).map(async (symbol) => {
    const mapping = YAHOO_SYMBOL_MAP[symbol];

    if (!mapping) {
      // Try the symbol directly with getQuote (it handles Yahoo format)
      try {
        const quote = await getQuote(symbol);
        if (quote && quote.price > 0) {
          queriesUsed++;
          sources.push('Yahoo Finance');
          return {
            symbol,
            name: symbol,
            nameAr: symbol,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            source: 'Yahoo Finance',
            snippet: `${symbol}: $${quote.price.toFixed(2)} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)`,
            searchTimestamp: Date.now(),
          } as RealtimePrice;
        }
      } catch {
        // Ignore individual failures
      }
      return null;
    }

    try {
      // Use Yahoo Finance via our financial-apis module
      const quote = await getQuote(mapping.yahooSymbol);
      queriesUsed++;

      if (quote && quote.price > 0) {
        sources.push('Yahoo Finance');
        return {
          symbol,
          name: mapping.nameEn,
          nameAr: mapping.nameAr,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          source: 'Yahoo Finance',
          snippet: `${mapping.nameEn} (${symbol}): $${quote.price.toLocaleString()} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)`,
          searchTimestamp: Date.now(),
        } as RealtimePrice;
      }

      // Quote returned null or price = 0
      return null;
    } catch (err: any) {
      console.warn(`[RealtimeSearch] Failed to fetch ${symbol} (${mapping.yahooSymbol}): ${err.message?.slice(0, 60)}`);
      return null;
    }
  });

  const results = await Promise.allSettled(quotePromises);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      prices.push(result.value);
    }
  }

  // Build market context string from prices
  const contextParts: string[] = [];
  if (prices.length > 0) {
    const isAr = locale === 'ar';
    contextParts.push(isAr
      ? '=== الأسعار المباشرة (من Yahoo Finance — الآن) ==='
      : '=== REAL-TIME PRICES (from Yahoo Finance — NOW) ===');

    for (const p of prices) {
      if (p.price !== null) {
        const changeStr = p.changePercent !== null
          ? `${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%`
          : '';
        const name = isAr ? p.nameAr : p.name;
        contextParts.push(`${name} (${p.symbol}): $${p.price.toLocaleString()} ${changeStr}`);
      }
    }
  }

  const searchTimeMs = Date.now() - startTime;
  const foundCount = prices.filter(p => p.price !== null).length;
  console.log(`[RealtimeSearch] Found ${foundCount}/${prices.length} real-time prices in ${searchTimeMs}ms (${queriesUsed} queries, sources: ${[...new Set(sources)].join(',')})`);

  return {
    prices,
    marketContext: contextParts.join('\n'),
    searchTimeMs,
    queriesUsed,
    sources: [...new Set(sources)],
  };
}

// ─── Search for specific stock price ───────────────────────────

export async function searchStockPrice(
  stockSymbol: string,
): Promise<{ price: number | null; change: number | null; changePercent: number | null; source: string }> {
  try {
    const quote = await getQuote(stockSymbol);
    if (quote && quote.price > 0) {
      return {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        source: 'Yahoo Finance',
      };
    }
  } catch {
    // Ignore
  }
  return { price: null, change: null, changePercent: null, source: '' };
}
