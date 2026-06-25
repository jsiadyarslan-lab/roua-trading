// ─── V472: Yahoo Finance direct API (FREE, no key) ────────────
// يستدعي Yahoo Finance مباشرة — لا يمر عبر NestJS
// يعمل في Edge/Node بدون أي API key

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  previousClose: number;
  marketState: string;
}

// خريطة الرموز إلى صيغة Yahoo Finance
const YAHOO_SYMBOLS: Record<string, string> = {
  // Crypto
  'BTC': 'BTC-USD',
  'BTCUSD': 'BTC-USD',
  'ETH': 'ETH-USD',
  'ETHUSD': 'ETH-USD',
  'SOL': 'SOL-USD',
  'DOGE': 'DOGE-USD',
  'XRP': 'XRP-USD',
  'ADA': 'ADA-USD',
  'AVAX': 'AVAX-USD',
  'LINK': 'LINK-USD',
  'MATIC': 'MATIC-USD',
  'DOT': 'DOT-USD',
  // Commodities
  'XAU': 'GC=F',
  'XAUUSD': 'GC=F',
  'GOLD': 'GC=F',
  'XAG': 'SI=F',
  'XAGUSD': 'SI=F',
  'SILVER': 'SI=F',
  'WTI': 'CL=F',
  'CL': 'CL=F',
  'OIL': 'CL=F',
  'BRENT': 'BZ=F',
  'BZ': 'BZ=F',
  'NG': 'NG=F',
  // Forex
  'EURUSD': 'EURUSD=X',
  'EUR': 'EURUSD=X',
  'GBPUSD': 'GBPUSD=X',
  'GBP': 'GBPUSD=X',
  'USDJPY': 'JPY=X',
  'JPY': 'JPY=X',
  'USDCHF': 'CHF=X',
  'CHF': 'CHF=X',
  'AUDUSD': 'AUDUSD=X',
  'AUD': 'AUDUSD=X',
  'USDCAD': 'USDCAD=X',
  'CAD': 'USDCAD=X',
  'NZDUSD': 'NZDUSD=X',
  // Indices
  'SPX': '^GSPC',
  'NDX': '^NDX',
  'DJI': '^DJI',
  'DXY': 'DX-Y.NYB',
  'VIX': '^VIX',
  'FTSE': '^FTSE',
  'DAX': '^GDAXI',
  'CAC': '^FCHI',
  'NIKKEI': '^N225',
  'N225': '^N225',
  'HSI': '^HSI',
  // Popular stocks
  'AAPL': 'AAPL',
  'TSLA': 'TSLA',
  'NVDA': 'NVDA',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'META': 'META',
};

function resolveYahooSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  // إذا الرمز موجود مباشرة
  if (YAHOO_SYMBOLS[upper]) return YAHOO_SYMBOLS[upper];
  // إذا الرمز يحتوي على .SR (سعودي) — استخدمه كما هو
  if (upper.endsWith('.SR')) return upper;
  // إذا الرمز يحتوي على .IS / .HK / .T / etc — استخدمه كما هو
  if (/\.(IS|HK|T|L|PA|DE|SW|NS|ME|SR)$/.test(upper)) return upper;
  // افتراضي: استخدم الرمز كما هو
  return upper;
}

/**
 * يجلب سعر لحظي من Yahoo Finance مباشرة
 * Yahoo Finance API مجاني ولا يحتاج API key
 */
export async function getQuote(symbol: string): Promise<QuoteData | null> {
  const yahooSymbol = resolveYahooSymbol(symbol);

  try {
    // Yahoo Finance v8 chart API — مجاني وبدون مفتاح
    // نستخدم query1.finance.yahoo.com (v7) لأنه أكثر استقرارًا
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[YahooFinance] ${yahooSymbol} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    if (!meta || !meta.regularMarketPrice) return null;

    const price = Number(meta.regularMarketPrice);
    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: yahooSymbol,
      price,
      change,
      changePercent,
      high: Number(meta.regularMarketDayHigh ?? price),
      low: Number(meta.regularMarketDayLow ?? price),
      open: Number(meta.regularMarketDayOpen ?? price),
      volume: Number(meta.regularMarketVolume ?? 0),
      previousClose,
      marketState: meta.marketState ?? 'UNKNOWN',
    };
  } catch (err: any) {
    console.warn(`[YahooFinance] Failed ${yahooSymbol}: ${err?.message?.slice(0, 80)}`);
    return null;
  }
}

/**
 * يجلب بيانات تاريخية (candles) من Yahoo Finance
 */
export async function getHistoricalData(
  symbol: string,
  interval: string = '1d',
  range: string = '1mo',
): Promise<Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>> {
  const yahooSymbol = resolveYahooSymbol(symbol);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) return [];

    const candles: Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }> = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (quote.open?.[i] == null || quote.close?.[i] == null) continue;
      candles.push({
        open: Number(quote.open[i]),
        high: Number(quote.high[i]),
        low: Number(quote.low[i]),
        close: Number(quote.close[i]),
        volume: Number(quote.volume?.[i] ?? 0),
        timestamp: timestamps[i] * 1000,
      });
    }

    return candles;
  } catch (err: any) {
    console.warn(`[YahooFinance] Historical failed ${yahooSymbol}: ${err?.message?.slice(0, 80)}`);
    return [];
  }
}
