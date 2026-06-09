// ─────────────────────────────────────────────────────────────
// طبقة تشخيص الشموع — frontend فقط، بدون أي تغيير سلوكي.
// الهدف: معرفة أي مسار يُنفَّذ فعلياً على الجوال لتحديد سبب
// "يرسم جسماً ثم يختفي ويعود للسعر الصحيح، ولا تفتح شمعة جديدة".
//
// تُفعَّل فقط بإضافة ?diag=1 إلى رابط الصفحة، فلا تؤثر على المستخدمين.
// ─────────────────────────────────────────────────────────────

export interface ChartDiag {
  priceTicks: number;       // عدد استدعاءات updateLastCandle (نبضات السعر)
  klineUpdates: number;     // _flushUpdateCandle على شمعة موجودة
  newCandleFired: number;   // _flushUpdateCandle فتح شمعة جديدة
  setCandlesCalls: number;  // عدد استدعاءات setCandles (setData كامل) ← المشتبه الأول
  lastSetReason: string;    // سبب آخر setCandles
  lastPriceAt: number;      // توقيت آخر نبضة سعر (ms)
  lastKlineAt: number;      // توقيت آخر kline (ms)
  lastCandleTime: number;   // وقت آخر شمعة (Unix ثوانٍ) — إن لم يتغيّر = لا شمعات جديدة
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
