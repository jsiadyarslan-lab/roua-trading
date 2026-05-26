// Volume Profile — POC, VAH, VAL — STANDALONE
import type { CandleData } from './types';

export interface VolumeProfileResult {
  poc: number;      // Point of Control (highest volume price)
  vah: number;      // Value Area High
  val: number;      // Value Area Low
  levels: { price: number; volume: number; pct: number }[];
}

export function calcVolumeProfile(candles: CandleData[], bins = 20): VolumeProfileResult {
  if (candles.length < 10) return { poc: 0, vah: 0, val: 0, levels: [] };

  const prices = candles.map(c => (c.high + c.low) / 2);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceRange = maxP - minP;

  // FIX: Guard against zero/near-zero price range (e.g., stablecoins or single-price data).
  // If all prices are identical, there's no meaningful volume profile to compute.
  if (priceRange < minP * 0.0001) {
    return { poc: minP, vah: maxP, val: minP, levels: [{ price: minP, volume: candles.reduce((s, c) => s + c.volume, 0), pct: 1 }] };
  }

  const binSize = priceRange / bins;

  const profile = Array.from({ length: bins }, (_, i) => ({
    price: minP + (i + 0.5) * binSize,
    volume: 0,
    pct: 0,
  }));

  candles.forEach((c, i) => {
    const mid = prices[i];
    const bin = Math.min(bins - 1, Math.floor((mid - minP) / binSize));
    profile[bin].volume += c.volume;
  });

  const totalVol = profile.reduce((s, b) => s + b.volume, 0);
  profile.forEach(b => b.pct = b.volume / totalVol);

  // POC
  const poc = profile.reduce((a, b) => b.volume > a.volume ? b : a);

  // Value Area (70% of volume around POC)
  const targetVol = totalVol * 0.70;
  let accumulated = poc.volume;
  let vahIdx = profile.indexOf(poc);
  let valIdx = vahIdx;

  while (accumulated < targetVol) {
    const upVol = vahIdx < bins - 1 ? profile[vahIdx + 1].volume : 0;
    const downVol = valIdx > 0 ? profile[valIdx - 1].volume : 0;
    if (upVol >= downVol && vahIdx < bins - 1) { vahIdx++; accumulated += upVol; }
    else if (valIdx > 0) { valIdx--; accumulated += downVol; }
    else break;
  }

  return {
    poc: poc.price,
    vah: profile[vahIdx].price + binSize / 2,
    val: profile[valIdx].price - binSize / 2,
    levels: profile,
  };
}
