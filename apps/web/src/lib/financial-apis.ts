// ─── V473: استخدم NestJS backend الخاص بمنصة roua-trading ─────
// المنصة لديها ExchangeService + NewsService + StrategicCouncilService
// لا حاجة لـ Yahoo Finance خارجي — كل البيانات موجودة في الباك اند

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

// الـ NestJS API URL (نفس الحاوية على Railway)
const NESTJS_API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

// خريطة الرموز —roua-trading يستخدم صيغة مختلفة قليلاً
const SYMBOL_MAP: Record<string, string> = {
  // Crypto — roua-trading يستخدم USDT
  'BTC': 'BTCUSDT',
  'BTCUSD': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'ETHUSD': 'ETHUSDT',
  'SOL': 'SOLUSDT',
  'DOGE': 'DOGEUSDT',
  'XRP': 'XRPUSDT',
  // Commodities — roua-trading يستخدم XAUUSD, XAGUSD
  'XAU': 'XAUUSD',
  'XAUUSD': 'XAUUSD',
  'GOLD': 'XAUUSD',
  'XAG': 'XAGUSD',
  'XAGUSD': 'XAGUSD',
  'SILVER': 'XAGUSD',
  'WTI': 'WTI',
  'CL': 'WTI',
  'OIL': 'WTI',
  'BRENT': 'BRENT',
  'BZ': 'BRENT',
  // Forex — roua-trading يستخدم EURUSD, GBPUSD
  'EURUSD': 'EURUSD',
  'EUR': 'EURUSD',
  'GBPUSD': 'GBPUSD',
  'GBP': 'GBPUSD',
  'USDJPY': 'USDJPY',
  'JPY': 'USDJPY',
  'USDCHF': 'USDCHF',
  'CHF': 'USDCHF',
  'AUDUSD': 'AUDUSD',
  'AUD': 'AUDUSD',
  'USDCAD': 'USDCAD',
  'CAD': 'USDCAD',
  // Indices — قد تكون متاحة
  'SPX': 'SPX',
  'NDX': 'NDX',
  'DJI': 'DJI',
  'DXY': 'DXY',
};

function resolveSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  return SYMBOL_MAP[upper] ?? upper;
}

/**
 * يجلب سعر لحظي من NestJS ExchangeService
 * يستخدم /api/exchange/quote/:symbol
 */
export async function getQuote(symbol: string): Promise<QuoteData | null> {
  const resolvedSymbol = resolveSymbol(symbol);

  try {
    const url = `${NESTJS_API}/api/exchange/quote/${encodeURIComponent(resolvedSymbol)}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[NestJS Quote] ${resolvedSymbol} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    // NestJS ExchangeService.getQuote يرجع UnifiedQuoteDto
    const quote = data?.data ?? data;
    if (!quote || !quote.price) return null;

    const price = Number(quote.price);
    const change = Number(quote.change ?? 0);
    const changePercent = Number(quote.changePercent ?? 0);

    return {
      symbol: resolvedSymbol,
      price,
      change,
      changePercent,
      high: Number(quote.high ?? price),
      low: Number(quote.low ?? price),
      open: Number(quote.open ?? price),
      volume: Number(quote.volume ?? 0),
      previousClose: price - change,
      marketState: 'REGULAR',
    };
  } catch (err: any) {
    console.warn(`[NestJS Quote] Failed ${resolvedSymbol}: ${err?.message?.slice(0, 80)}`);

    // V473: fallback لـ Yahoo Finance إذا فشل NestJS (للأصول غير المدعومة)
    return await getQuoteFromYahoo(symbol).catch(() => null);
  }
}

/**
 * Fallback: Yahoo Finance direct API (للأصول غير المدعومة في NestJS)
 */
async function getQuoteFromYahoo(symbol: string): Promise<QuoteData | null> {
  const yahooSymbols: Record<string, string> = {
    'SPX': '^GSPC', 'NDX': '^NDX', 'DJI': '^DJI', 'DXY': 'DX-Y.NYB',
    'VIX': '^VIX', 'FTSE': '^FTSE', 'DAX': '^GDAXI', 'CAC': '^FCHI',
    'AAPL': 'AAPL', 'TSLA': 'TSLA', 'NVDA': 'NVDA', 'MSFT': 'MSFT',
  };

  const yahooSymbol = yahooSymbols[symbol.toUpperCase()] ?? symbol.toUpperCase();

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
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
  } catch {
    return null;
  }
}

/**
 * يجلب بيانات تاريخية (candles)
 * أولاً يحاول NestJS، إذا فشل ي fallback لـ Yahoo Finance مباشرة
 */
export async function getHistoricalData(
  symbol: string,
  interval: string = '1d',
  range: string = '1mo',
): Promise<Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>> {
  const resolvedSymbol = resolveSymbol(symbol);

  // V476: أولاً حاول Yahoo Finance مباشرة (أكثر موثوقية للـ candles)
  const yahooCandles = await getHistoricalFromYahoo(symbol, interval, range);
  if (yahooCandles.length >= 20) {
    return yahooCandles;
  }

  // fallback لـ NestJS
  try {
    const url = `${NESTJS_API}/api/exchange/candle/${encodeURIComponent(resolvedSymbol)}?interval=${interval}&range=${range}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return yahooCandles; // ارجع ما لدينا من Yahoo

    const data = await res.json();
    const candles = data?.data ?? data?.candles ?? [];
    if (!Array.isArray(candles)) return yahooCandles;

    const mapped = candles.map((c: any) => ({
      open: Number(c.open ?? c.o ?? 0),
      high: Number(c.high ?? c.h ?? 0),
      low: Number(c.low ?? c.l ?? 0),
      close: Number(c.close ?? c.c ?? 0),
      volume: Number(c.volume ?? c.v ?? 0),
      timestamp: Number(c.timestamp ?? c.t ?? 0) * (c.timestamp < 1e12 ? 1000 : 1),
    }));

    return mapped.length >= 20 ? mapped : yahooCandles;
  } catch (err: any) {
    console.warn(`[NestJS Candle] Failed ${resolvedSymbol}: ${err?.message?.slice(0, 80)}`);
    return yahooCandles;
  }
}

/**
 * يجلب candles من Yahoo Finance مباشرة
 * V476: Yahoo Finance أكثر موثوقية للـ candles من NestJS
 */
async function getHistoricalFromYahoo(
  symbol: string,
  interval: string,
  range: string,
): Promise<Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>> {
  // خريطة الرموز لـ Yahoo Finance
  const yahooSymbolMap: Record<string, string> = {
    'BTC': 'BTC-USD', 'BTCUSDT': 'BTC-USD',
    'ETH': 'ETH-USD', 'ETHUSDT': 'ETH-USD',
    'SOL': 'SOL-USD', 'SOLUSDT': 'SOL-USD',
    'DOGE': 'DOGE-USD', 'DOGEUSDT': 'DOGE-USD',
    'XRP': 'XRP-USD', 'XRPUSDT': 'XRP-USD',
    // V516 Fix 5: إضافة ADA/BNB/MATIC/LINK/AVAX لخريطة Yahoo
    'ADA': 'ADA-USD', 'ADAUSDT': 'ADA-USD',
    'BNB': 'BNB-USD', 'BNBUSDT': 'BNB-USD',
    'MATIC': 'MATIC-USD', 'MATICUSDT': 'MATIC-USD',
    'LINK': 'LINK-USD', 'LINKUSDT': 'LINK-USD',
    'AVAX': 'AVAX-USD', 'AVAXUSDT': 'AVAX-USD',
    'DOT': 'DOT-USD', 'DOTUSDT': 'DOT-USD',
    'UNI': 'UNI-USD', 'UNIUSDT': 'UNI-USD',
    'ATOM': 'ATOM-USD', 'ATOMUSDT': 'ATOM-USD',
    'LTC': 'LTC-USD', 'LTCUSDT': 'LTC-USD',
    'XAU': 'GC=F', 'XAUUSD': 'GC=F', 'GOLD': 'GC=F',
    'XAG': 'SI=F', 'XAGUSD': 'SI=F',
    'WTI': 'CL=F', 'CL': 'CL=F', 'OIL': 'CL=F',
    'BRENT': 'BZ=F', 'BZ': 'BZ=F',
    'EURUSD': 'EURUSD=X', 'EUR': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X', 'GBP': 'GBPUSD=X',
    'USDJPY': 'JPY=X', 'JPY': 'JPY=X',
    'USDCHF': 'CHF=X', 'CHF': 'CHF=X',
    'AUDUSD': 'AUDUSD=X', 'AUD': 'AUDUSD=X',
    'USDCAD': 'USDCAD=X', 'CAD': 'USDCAD=X',
    'SPX': '^GSPC', 'NDX': '^NDX', 'DJI': '^DJI', 'DXY': 'DX-Y.NYB',
    'VIX': '^VIX', 'FTSE': '^FTSE', 'DAX': '^GDAXI', 'CAC': '^FCHI',
    'AAPL': 'AAPL', 'TSLA': 'TSLA', 'NVDA': 'NVDA', 'MSFT': 'MSFT',
    'GOOGL': 'GOOGL', 'AMZN': 'AMZN', 'META': 'META',
  };

  const yahooSymbol = yahooSymbolMap[symbol.toUpperCase()] ?? symbol.toUpperCase();

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
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
        high: Number(quote.high[i] ?? quote.open[i]),
        low: Number(quote.low[i] ?? quote.close[i]),
        close: Number(quote.close[i]),
        volume: Number(quote.volume?.[i] ?? 0),
        timestamp: timestamps[i] * 1000,
      });
    }

    return candles;
  } catch (err: any) {
    console.warn(`[Yahoo Candle] Failed ${yahooSymbol}: ${err?.message?.slice(0, 80)}`);
    return [];
  }
}
