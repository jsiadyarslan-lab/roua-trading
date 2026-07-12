// ─────────────────────────────────────────────────────────────
// — frontend , without any behavioral change.
// goal: with which path includes on mobile to identify cause
// "chart what then in price correct, candle new".
//
// ?diag=1 to url page, on users.
// ─────────────────────────────────────────────────────────────

export interface ChartDiag {
 priceTicks: number; // count updateLastCandle ( price)
 klineUpdates: number; // _flushUpdateCandle on candle 
 newCandleFired: number; // _flushUpdateCandle candle new
 setCandlesCalls: number; // count setCandles (setData complete) ← first
 lastSetReason: string; // reason last setCandles
 lastPriceAt: number; // last price (ms)
 lastKlineAt: number; // last kline (ms)
 lastCandleTime: number; // time last candle (Unix ) — = candles new
 startedAt: number;
}

export const chartDiag: ChartDiag = {
 priceTicks: 0,
 klineUpdates: 0,
 newCandleFired: 0,
 setCandlesCalls: 0,
 lastSetReason: '',
 lastPriceAt: 0,
 lastKlineAt: 0,
 lastCandleTime: 0,
 startedAt: Date.now(),
};

export function diagEnabled(): boolean {
 if (typeof window === 'undefined') return false;
 try {
 return new URLSearchParams(window.location.search).has('diag');
 } catch {
 return false;
 }
}
