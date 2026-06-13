// ═══════════════════════════════════════════════════════════
// Indicator Worker — Web Worker for heavy indicator calculations
// Moves calculateIndicator (Ichimoku 5 lines + cloud, etc.)
// off the main thread to prevent UI stuttering
// 300 candles with Ichimoku may take 10-50ms causing visible jank
// ═══════════════════════════════════════════════════════════

// Web Worker message types
interface WorkerRequest {
  type: 'calculate';
  id: string;
  indicator: string;
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  params: Record<string, number>;
}

interface WorkerResponse {
  type: 'result' | 'error';
  id: string;
  indicator: string;
  data?: any;
  error?: string;
  durationMs: number;
}

// ── Indicator calculations (pure functions, no DOM) ──────

function calcSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

function calcEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (ema === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      ema = sum / period;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

function calcRSI(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length < period + 1) return closes.map(() => null);

  let avgGain = 0, avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) result.push(null);
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function calcMACD(closes: number[], fast: number, slow: number, signal: number): {
  macd: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
} {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine.push(emaFast[i]! - emaSlow[i]!);
    } else {
      macdLine.push(null);
    }
  }

  const validMacd = macdLine.filter(v => v !== null) as number[];
  const signalLine = calcEMA(validMacd, signal);

  const resultSignal: (number | null)[] = [];
  let vi = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      resultSignal.push(signalLine[vi] || null);
      vi++;
    } else {
      resultSignal.push(null);
    }
  }

  const histogram: (number | null)[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null && resultSignal[i] !== null) {
      histogram.push(macdLine[i]! - resultSignal[i]!);
    } else {
      histogram.push(null);
    }
  }

  return { macd: macdLine, signalLine: resultSignal, histogram };
}

function calcBollingerBands(closes: number[], period: number, stdDev: number): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const middle = calcSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(closes[j] - middle[i]!, 2);
    }
    const sd = Math.sqrt(sumSq / period);
    upper.push(middle[i]! + sd * stdDev);
    lower.push(middle[i]! - sd * stdDev);
  }

  return { upper, middle, lower };
}

function calcIchimoku(candles: WorkerRequest['candles'], conversion: number, base: number, spanB: number): {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  senkouA: (number | null)[];
  senkouB: (number | null)[];
  chikou: (number | null)[];
} {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const n = candles.length;

  function midHL(highs: number[], lows: number[], period: number, offset: number): (number | null)[] {
    const result: (number | null)[] = [];
    for (let i = 0; i < highs.length; i++) {
      const idx = i + offset;
      if (idx < period - 1 || idx >= highs.length) { result.push(null); continue; }
      let hMax = -Infinity, lMin = Infinity;
      for (let j = idx - period + 1; j <= idx; j++) {
        if (highs[j] > hMax) hMax = highs[j];
        if (lows[j] < lMin) lMin = lows[j];
      }
      result.push((hMax + lMin) / 2);
    }
    return result;
  }

  const tenkan = midHL(highs, lows, conversion, 0);
  const kijun = midHL(highs, lows, base, 0);

  // Senkou A = (Tenkan + Kijun) / 2, shifted forward by 'base' periods
  // V225 FIX: Apply displacement — Senkou Span A must be shifted 'base' periods ahead.
  // The old code placed Senkou A at the calculation index (no shift), causing
  // the Ichimoku cloud to be drawn at the wrong position.
  const senkouA: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (tenkan[i] !== null && kijun[i] !== null) {
      const targetIdx = i + base;  // Shift forward by 'base' periods
      if (targetIdx < n) {
        senkouA[targetIdx] = (tenkan[i]! + kijun[i]!) / 2;
      }
    }
  }

  // Senkou B = midpoint of highest high and lowest low over spanB periods, shifted forward
  // V225 FIX: Apply displacement — Senkou Span B must be shifted 'base' periods ahead.
  const rawSenkouB = midHL(highs, lows, spanB, 0);
  const senkouB: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rawSenkouB[i] !== null) {
      const targetIdx = i + base;  // Shift forward by 'base' periods
      if (targetIdx < n) {
        senkouB[targetIdx] = rawSenkouB[i];
      }
    }
  }

  // Chikou = close shifted back by base periods
  const chikou: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (i + base < n) {
      chikou.push(closes[i + base]);
    } else {
      chikou.push(null);
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

function calcATR(candles: WorkerRequest['candles'], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length < 2) return candles.map(() => null);

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }

  result.push(null); // First candle has no TR
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      result.push(trs.slice(0, period).reduce((s, v) => s + v, 0) / period);
    } else {
      const prev = result[result.length - 1]!;
      result.push((prev * (period - 1) + trs[i]) / period);
    }
  }
  return result;
}

function calcStochastic(candles: WorkerRequest['candles'], kPeriod: number, dPeriod: number): {
  k: (number | null)[];
  d: (number | null)[];
} {
  const k: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { k.push(null); continue; }
    let highest = -Infinity, lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    const range = highest - lowest;
    k.push(range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100);
  }

  const validK = k.filter(v => v !== null) as number[];
  const d = calcSMA(validK, dPeriod);

  const resultD: (number | null)[] = [];
  let vi = 0;
  for (let i = 0; i < k.length; i++) {
    if (k[i] !== null) {
      resultD.push(d[vi] || null);
      vi++;
    } else {
      resultD.push(null);
    }
  }

  return { k, d: resultD };
}

function calcADX(candles: WorkerRequest['candles'], period: number): (number | null)[] {
  // Simplified ADX calculation
  const result: (number | null)[] = [];
  if (candles.length < period * 2) return candles.map(() => null);

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }

  // V225 FIX: Wilder's smoothing initial value must be AVERAGE (sum/p), not raw sum.
  // The old code pushed raw `sum` which is p× too large, making ALL subsequent
  // smoothed values p× too large. DI/ADX values were completely wrong.
  function smooth(arr: number[], p: number): number[] {
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i < p) { sum += arr[i]; if (i === p - 1) result.push(sum / p); else result.push(0); continue; }
      const val = result[i - 1] - result[i - 1] / p + arr[i];
      result.push(val);
    }
    return result;
  }

  const smoothTR = smooth(tr, period);
  const smoothPlusDM = smooth(plusDM, period);
  const smoothMinusDM = smooth(minusDM, period);

  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0) { dx.push(0); continue; }
    const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const sum = plusDI + minusDI;
    dx.push(sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100);
  }

  // ADX = smoothed DX
  for (let i = 0; i < candles.length; i++) {
    if (i < period * 2 - 1) { result.push(null); continue; }
    if (result.length === 0 || result[result.length - 1] === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += dx[j] || 0;
      result.push(sum / period);
    } else {
      const prev = result[result.length - 1]!;
      result.push((prev * (period - 1) + (dx[i] || 0)) / period);
    }
  }

  return result;
}

// ── Message handler ──────────────────────────────────────
self.onmessage = function (e: MessageEvent<WorkerRequest>) {
  const { type, id, indicator, candles, params } = e.data;
  const start = Date.now();

  try {
    const closes = candles.map(c => c.close);
    let data: any;

    switch (indicator) {
      case 'sma':
        data = calcSMA(closes, params.period || 20);
        break;
      case 'ema':
        data = calcEMA(closes, params.period || 12);
        break;
      case 'rsi':
        data = calcRSI(closes, params.period || 14);
        break;
      case 'macd':
        data = calcMACD(closes, params.fast || 12, params.slow || 26, params.signal || 9);
        break;
      case 'bb':
        data = calcBollingerBands(closes, params.period || 20, params.stdDev || 2);
        break;
      case 'ichimoku':
        data = calcIchimoku(candles, params.conversion || 9, params.base || 26, params.spanB || 52);
        break;
      case 'atr':
        data = calcATR(candles, params.period || 14);
        break;
      case 'stochastic':
        data = calcStochastic(candles, params.kPeriod || 14, params.dPeriod || 3);
        break;
      case 'adx':
        data = calcADX(candles, params.period || 14);
        break;
      default:
        throw new Error(`Unknown indicator: ${indicator}`);
    }

    const response: WorkerResponse = {
      type: 'result',
      id,
      indicator,
      data,
      durationMs: Date.now() - start,
    };

    (self as any).postMessage(response);
  } catch (err: any) {
    const response: WorkerResponse = {
      type: 'error',
      id,
      indicator,
      error: err?.message || 'Calculation failed',
      durationMs: Date.now() - start,
    };

    (self as any).postMessage(response);
  }
};
