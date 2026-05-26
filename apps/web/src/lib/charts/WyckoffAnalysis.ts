// Wyckoff Phase Detector — STANDALONE
import type { CandleData } from './types';

export type WyckoffPhase = 'Accumulation' | 'Markup' | 'Distribution' | 'Markdown' | 'Unknown';

export interface WyckoffResult {
  phase: WyckoffPhase;
  labelAr: string;
  confidence: number;
  events: { type: string; labelAr: string; time: number; price: number }[];
  bias: 'bullish' | 'bearish' | 'neutral';
}

export function detectWyckoff(candles: CandleData[]): WyckoffResult {
  if (candles.length < 30) return { phase: 'Unknown', labelAr: 'غير محدد', confidence: 0, events: [], bias: 'neutral' };

  const slice = candles.slice(-60);
  const prices = slice.map(c => c.close);
  const volumes = slice.map(c => c.volume);
  const avgVol = volumes.reduce((s,v) => s+v, 0) / volumes.length;

  // Price range analysis
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const range = maxP - minP;
  const current = prices[prices.length - 1];
  const posInRange = (current - minP) / (range || 1);

  // Volume trend: compare first half vs second half
  const vol1st = volumes.slice(0, 30).reduce((s,v) => s+v, 0) / 30;
  const vol2nd = volumes.slice(30).reduce((s,v) => s+v, 0) / 30;
  const volTrend = vol2nd / vol1st;

  // Price trend: linear regression slope
  const n = prices.length;
  const sumX = n*(n-1)/2, sumY = prices.reduce((s,p)=>s+p,0);
  const sumXY = prices.reduce((s,p,i)=>s+i*p,0);
  const sumX2 = n*(n-1)*(2*n-1)/6;
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const slopeNorm = slope / (sumY/n); // normalized slope

  const events: WyckoffResult['events'] = [];
  let phase: WyckoffPhase = 'Unknown';
  let confidence = 0.5;
  let bias: 'bullish'|'bearish'|'neutral' = 'neutral';

  if (posInRange < 0.3 && slopeNorm < 0 && volTrend > 1.1) {
    // Low price, declining, increasing volume = Accumulation
    phase = 'Accumulation'; bias = 'bullish'; confidence = 0.65;
    events.push({ type: 'SC', labelAr: 'ذعر البيع', time: slice[slice.length-1].time, price: minP });
  } else if (slopeNorm > 0.001 && posInRange > 0.3 && posInRange < 0.7) {
    phase = 'Markup'; bias = 'bullish'; confidence = 0.70;
    events.push({ type: 'SOS', labelAr: 'قوة', time: slice[slice.length-1].time, price: current });
  } else if (posInRange > 0.7 && slopeNorm > -0.001 && volTrend > 1.1) {
    phase = 'Distribution'; bias = 'bearish'; confidence = 0.65;
    events.push({ type: 'BC', labelAr: 'ذروة الشراء', time: slice[slice.length-1].time, price: maxP });
  } else if (slopeNorm < -0.001 && posInRange < 0.5) {
    phase = 'Markdown'; bias = 'bearish'; confidence = 0.68;
    events.push({ type: 'LPSY', labelAr: 'ضعف', time: slice[slice.length-1].time, price: current });
  }

  const labels: Record<WyckoffPhase, string> = {
    'Accumulation': 'تراكم', 'Markup': 'صعود', 'Distribution': 'توزيع', 'Markdown': 'هبوط', 'Unknown': 'غير محدد'
  };

  return { phase, labelAr: labels[phase], confidence, events, bias };
}
