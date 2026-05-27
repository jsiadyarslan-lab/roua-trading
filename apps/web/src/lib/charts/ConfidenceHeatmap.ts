// ═══════════════════════════════════════════════════════════
// Confidence Heatmap — Real Signal-Based Implementation
// Computes confidence per candle from actual signal overlap,
// not fixed 0.3 per candle. Confluence zones where multiple
// signals agree show higher confidence.
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface HeatmapPoint {
  time: number;
  price: number;
  confidence: number;
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface HeatmapResult {
  points: HeatmapPoint[];
  dominantDirection: 'bullish' | 'bearish' | 'neutral';
  coverage: number;
  avgConfidence: number;
  /** Number of confluence zones (3+ agreeing signals) */
  confluenceZones: number;
}

/** A signal that covers a range of candles */
interface SignalRange {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  startTime: number;
  endTime: number;
  keyPrice: number;
}

/**
 * Extract signal ranges from analysis data.
 * Each signal has a time range it covers (not just a single candle).
 */
function extractSignalRanges(analysis: Record<string, any>): SignalRange[] {
  const ranges: SignalRange[] = [];
  if (!analysis) return ranges;

  try {
    // SMC Order Blocks — cover from OB formation to current
    if (analysis.smcData?.orderBlocks) {
      for (const ob of analysis.smcData.orderBlocks) {
        if (!ob?.time) continue;
        ranges.push({
          source: 'smc:orderBlock',
          direction: ob.type === 'bullish' ? 'bullish' : 'bearish',
          confidence: 0.6,
          startTime: ob.time,
          endTime: ob.endTime || Date.now() / 1000,
          keyPrice: ob.price || ob.high || ob.low || 0,
        });
      }
    }

    // SMC FVG — cover the gap zone
    if (analysis.smcData?.fvgs) {
      for (const fvg of analysis.smcData.fvgs) {
        if (fvg.filled) continue;
        if (!fvg.time) continue;
        ranges.push({
          source: 'smc:fvg',
          direction: fvg.type === 'bullish' ? 'bullish' : 'bearish',
          confidence: 0.55,
          startTime: fvg.time,
          endTime: fvg.endTime || Date.now() / 1000,
          keyPrice: (fvg.high + fvg.low) / 2,
        });
      }
    }

    // SMC BOS/CHoCH — covers from break forward
    if (analysis.smcData?.structureBreaks) {
      for (const br of analysis.smcData.structureBreaks) {
        if (!br.time) continue;
        ranges.push({
          source: `smc:${br.type || 'bos'}`,
          direction: br.direction === 'bullish' || br.type?.includes('bullish') ? 'bullish' : 'bearish',
          confidence: 0.7,
          startTime: br.time,
          endTime: br.endTime || Date.now() / 1000,
          keyPrice: br.price || 0,
        });
      }
    }

    // Harmonic patterns — cover from X to D (and PRZ zone)
    if (analysis.patterns) {
      for (const p of analysis.patterns) {
        const startTime = p.points?.X?.time || p.time;
        const endTime = p.points?.D?.time || Date.now() / 1000;
        if (!startTime) continue;
        ranges.push({
          source: `pattern:${p.type || 'unknown'}`,
          direction: p.direction || 'neutral',
          confidence: p.confidence || 0.5,
          startTime,
          endTime: Math.max(endTime, startTime),
          keyPrice: p.przLevel || p.price || p.points?.D?.price || 0,
        });
      }
    }

    // Wyckoff phases — cover the entire accumulation/distribution
    if (analysis.wyckoff?.phase) {
      const wyckoffStart = analysis.wyckoff.startTime || analysis.wyckoff.events?.[0]?.time || Date.now() / 1000 - 86400;
      const dir = (analysis.wyckoff.phase === 'Accumulation' || analysis.wyckoff.phase === 'Markup') ? 'bullish'
        : (analysis.wyckoff.phase === 'Distribution' || analysis.wyckoff.phase === 'Markdown') ? 'bearish' : 'neutral';
      ranges.push({
        source: 'wyckoff',
        direction: dir,
        confidence: 0.5,
        startTime: wyckoffStart,
        endTime: Date.now() / 1000,
        keyPrice: analysis.wyckoff.keyLevel || 0,
      });
    }

    // Elliott Wave — cover wave duration
    if (analysis.elliottPattern?.waveLabel) {
      const isImpulse = analysis.elliottPattern.waveLabel.startsWith('1') ||
        analysis.elliottPattern.waveLabel.startsWith('3') ||
        analysis.elliottPattern.waveLabel.startsWith('5');
      const ewStart = analysis.elliottPattern.startTime || analysis.elliottPattern.points?.[0]?.time || Date.now() / 1000 - 86400;
      ranges.push({
        source: 'elliott:wave',
        direction: isImpulse ? 'bullish' : 'bearish',
        confidence: analysis.elliottPattern.confidence || 0.5,
        startTime: ewStart,
        endTime: Date.now() / 1000,
        keyPrice: analysis.elliottPattern.keyLevel || 0,
      });
    }
  } catch {
    // Return whatever we have
  }

  return ranges;
}

export function buildHeatmap(candles: CandleData[], signals: any[]): HeatmapResult {
  if (!candles || candles.length === 0) {
    return { points: [], dominantDirection: 'neutral', coverage: 0, avgConfidence: 0, confluenceZones: 0 };
  }

  // If we have raw analysis data (not just signal array), extract ranges
  const signalRanges: SignalRange[] = Array.isArray(signals) && signals.length > 0 && signals[0]?.source
    ? [] // Already extracted — use the old approach as fallback
    : extractSignalRanges(signals as Record<string, any>);

  // If no ranges extracted, try the old signal format as fallback
  if (signalRanges.length === 0 && Array.isArray(signals) && signals.length > 0) {
    for (const sig of signals) {
      if (!sig?.source) continue;
      signalRanges.push({
        source: sig.source,
        direction: sig.direction || 'neutral',
        confidence: sig.confidence || 0.3,
        startTime: candles[0]?.time || 0,
        endTime: candles[candles.length - 1]?.time || Date.now() / 1000,
        keyPrice: 0,
      });
    }
  }

  // If still no signals, return candle-based result with momentum analysis
  if (signalRanges.length === 0) {
    const recent = candles.slice(-30);
    // Analyze momentum from candle structure even without explicit signals
    const points: HeatmapPoint[] = recent.map((c, i) => {
      // Simple momentum-based confidence: consecutive candles in same direction
      let momentum = 0;
      const lookback = Math.min(i, 5);
      for (let j = i - lookback; j < i; j++) {
        if (j < 0) continue;
        if (recent[j].close > recent[j].open) momentum++;
        else momentum--;
      }
      const direction = c.close > c.open ? 'bullish' : c.close < c.open ? 'bearish' : 'neutral' as const;
      // Confidence from momentum alignment (not just candle color)
      const alignment = Math.abs(momentum) / lookback;
      const confidence = 0.1 + alignment * 0.2; // 0.1-0.3 range for no-signal case
      return {
        time: c.time,
        price: c.close,
        confidence,
        direction: momentum > 0 ? 'bullish' : momentum < 0 ? 'bearish' : direction,
      };
    });
    return {
      points,
      dominantDirection: points.filter(p => p.direction === 'bullish').length > points.filter(p => p.direction === 'bearish').length * 1.3 ? 'bullish'
        : points.filter(p => p.direction === 'bearish').length > points.filter(p => p.direction === 'bullish').length * 1.3 ? 'bearish' : 'neutral',
      coverage: recent.length / Math.max(candles.length, 1),
      avgConfidence: points.reduce((s, p) => s + p.confidence, 0) / points.length,
      confluenceZones: 0,
    };
  }

  // For each candle, compute confidence based on overlapping signals
  const recent = candles.slice(-60);
  const points: HeatmapPoint[] = [];
  let confluenceZones = 0;

  for (const candle of recent) {
    // Find all signals that cover this candle's time
    const coveringSignals = signalRanges.filter(sr =>
      candle.time >= sr.startTime && candle.time <= sr.endTime + 3600 // +1h buffer
    );

    if (coveringSignals.length === 0) {
      points.push({
        time: candle.time,
        price: candle.close,
        confidence: 0.1,
        direction: 'neutral',
      });
      continue;
    }

    // Count directional agreement
    const bullishSignals = coveringSignals.filter(s => s.direction === 'bullish');
    const bearishSignals = coveringSignals.filter(s => s.direction === 'bearish');
    const neutralSignals = coveringSignals.filter(s => s.direction === 'neutral');

    const bullishStrength = bullishSignals.reduce((s, sig) => s + sig.confidence, 0);
    const bearishStrength = bearishSignals.reduce((s, sig) => s + sig.confidence, 0);
    const totalStrength = bullishStrength + bearishStrength + neutralSignals.length * 0.3;

    // Determine direction
    let direction: 'bullish' | 'bearish' | 'neutral';
    if (bullishStrength > bearishStrength * 1.5) direction = 'bullish';
    else if (bearishStrength > bullishStrength * 1.5) direction = 'bearish';
    else direction = 'neutral';

    // Calculate confidence:
    // More agreeing signals = higher confidence
    // Conflicting signals = lower confidence
    // Proximity-weighted: signals closer to this candle's price get more weight
    const agreementCount = Math.max(bullishSignals.length, bearishSignals.length);
    const conflictCount = Math.min(bullishSignals.length, bearishSignals.length);
    const agreementBonus = Math.min(0.3, agreementCount * 0.1);
    const conflictPenalty = conflictCount * 0.1;
    
    // Proximity weighting: signals whose keyPrice is closer to this candle get boosted
    const proximityWeight = coveringSignals.reduce((sum, sig) => {
      if (sig.keyPrice > 0 && candle.close > 0) {
        const dist = Math.abs(sig.keyPrice - candle.close) / candle.close;
        return sum + Math.max(0, 1 - dist * 20); // Closer = higher weight
      }
      return sum + 0.5;
    }, 0) / coveringSignals.length;
    
    const baseConfidence = totalStrength > 0
      ? Math.max(bullishStrength, bearishStrength) / totalStrength
      : 0.3;

    let confidence = Math.min(0.95, baseConfidence + agreementBonus - conflictPenalty + (proximityWeight - 0.5) * 0.1);
    confidence = Math.max(0.1, confidence); // Floor at 0.1

    // Track confluence zones (3+ signals agreeing)
    if (agreementCount >= 3 && conflictCount === 0) {
      confluenceZones++;
    }

    points.push({
      time: candle.time,
      price: candle.close,
      confidence,
      direction,
    });
  }

  // Compute dominant direction
  const bullishCount = points.filter(p => p.direction === 'bullish').length;
  const bearishCount = points.filter(p => p.direction === 'bearish').length;
  const dominantDirection = bullishCount > bearishCount * 1.3 ? 'bullish'
    : bearishCount > bullishCount * 1.3 ? 'bearish' : 'neutral';

  const avgConfidence = points.length > 0
    ? points.reduce((s, p) => s + p.confidence, 0) / points.length : 0;

  return {
    points,
    dominantDirection,
    coverage: recent.length / Math.max(candles.length, 1),
    avgConfidence,
    confluenceZones,
  };
}

/** Alias for buildHeatmap — used by RouaChart component */
export function renderHeatmapOnChart(candles: CandleData[], signals: any[]): HeatmapResult {
  return buildHeatmap(candles, signals);
}
