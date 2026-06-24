// V469: Stub — سيُستبدل بـ NestJS API calls لاحقًا
export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  volume: number;
}

export async function getQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'}/api/exchange/quote/${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data ?? null;
  } catch { return null; }
}

export async function getHistoricalData(symbol: string, interval: string = '1d', range: string = '1mo'): Promise<any[]> {
  return [];
}
