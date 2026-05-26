// ═══════════════════════════════════════════════════════════
// Bayesian Integration Engine — Combines signals from all detectors
// Weighted by historical accuracy of each detector
// SMC Order Block + Wyckoff Accumulation + Volume POC below = reinforced
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';

// ── Signal types from different detectors ────────────────
export interface DetectorSignal {
  source: string;           // 'SMC' | 'Wyckoff' | 'Elliott' | 'VolumeProfile' | 'Geometric' | 'Harmonic' | 'Candlestick'
  type: string;             // 'order_block' | 'accumulation' | '5-wave' | 'poc_below' | etc.
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;       // 0-1
  price: number;            // Relevant price level
  time?: number;            // Relevant timestamp
  labelAr?: string;         // Arabic label
  labelEn?: string;         // English label
}

// ── Historical accuracy tracker per detector ─────────────
export interface DetectorAccuracy {
  source: string;
  totalSignals: number;
  correctSignals: number;
  accuracy: number;         // 0-1
  lastUpdated: number;
}

// ── Bayesian output ──────────────────────────────────────
export interface BayesianConsensus {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;       // 0-1
  posteriorBullish: number;  // P(bullish | signals)
  posteriorBearish: number;  // P(bearish | signals)
  posteriorNeutral: number;  // P(neutral | signals)
  reinforcingSignals: ReinforcingSignal[];
  conflictingSignals: ConflictingSignal[];
  keyLevels: KeyLevel[];
  detectorWeights: { source: string; weight: number; signal: DetectorSignal }[];
}

export interface ReinforcingSignal {
  sources: string[];
  direction: 'bullish' | 'bearish';
  description: string;
  descriptionAr: string;
  strength: number;  // 0-1, how strongly they reinforce each other
}

export interface ConflictingSignal {
  sources: string[];
  directions: ('bullish' | 'bearish')[];
  description: string;
  descriptionAr: string;
}

export interface KeyLevel {
  price: number;
  type: 'support' | 'resistance' | 'poc' | 'ob' | 'neckline' | 'fib';
  source: string;
  strength: number;  // 0-1
  label: string;
}

// ── Default detector accuracies (based on typical market research) ──
const DEFAULT_ACCURACIES: Record<string, number> = {
  'SMC': 0.62,           // Order blocks + FVG + BOS/CHoCH
  'Wyckoff': 0.58,       // Phase detection
  'Elliott': 0.52,       // Wave counting (notoriously difficult)
  'VolumeProfile': 0.65, // POC/VAH/VAL levels
  'Geometric': 0.60,     // Chart patterns (DT/DB/H&S/Triangle)
  'Harmonic': 0.55,      // XABCD patterns
  'Candlestick': 0.56,   // Single/multi-candle patterns
  'TrendLine': 0.58,     // SR levels + trend lines
};

// ── Known reinforcing combinations ───────────────────────
const REINFORCING_COMBOS: Array<{
  sources: string[];
  types: string[];
  direction: 'bullish' | 'bearish';
  description: string;
  descriptionAr: string;
  boost: number;
}> = [
  {
    sources: ['SMC', 'Wyckoff', 'VolumeProfile'],
    types: ['order_block', 'accumulation', 'poc_below'],
    direction: 'bullish',
    description: 'Bullish OB + Wyckoff Accumulation + POC below price',
    descriptionAr: 'كتلة أوامر صعودية + تراكم ويكوف + POC أسفل السعر',
    boost: 0.25,
  },
  {
    sources: ['SMC', 'Wyckoff'],
    types: ['order_block', 'distribution'],
    direction: 'bearish',
    description: 'Bearish OB + Wyckoff Distribution',
    descriptionAr: 'كتلة أوامر هبوطية + توزيع ويكوف',
    boost: 0.2,
  },
  {
    sources: ['Elliott', 'SMC'],
    types: ['5-wave', 'bos'],
    direction: 'bullish',
    description: 'Elliott impulse wave + BOS bullish',
    descriptionAr: 'موجة إليوت الدافعة + كسر هيكلي صعودي',
    boost: 0.22,
  },
  {
    sources: ['Geometric', 'VolumeProfile'],
    types: ['double_bottom', 'poc_below'],
    direction: 'bullish',
    description: 'Double Bottom + POC below = strong support zone',
    descriptionAr: 'قاع مزدوج + POC أسفل = منطقة دعم قوية',
    boost: 0.18,
  },
  {
    sources: ['Harmonic', 'SMC'],
    types: ['gartley', 'fvg'],
    direction: 'bullish',
    description: 'Gartley PRZ + Bullish FVG = high-probability reversal',
    descriptionAr: 'منطقة انعكاس جارتلي + فجوة القيمة العادلة الصعودية',
    boost: 0.2,
  },
  {
    sources: ['Wyckoff', 'VolumeProfile'],
    types: ['accumulation', 'poc_zone'],
    direction: 'bullish',
    description: 'Accumulation + POC in value area = smart money loading',
    descriptionAr: 'تراكم + POC في منطقة القيمة = أموال ذكية تتجمّع',
    boost: 0.15,
  },
];

// ── Bayesian Integration Engine ──────────────────────────
export class BayesianEngine {
  private accuracies: Map<string, DetectorAccuracy> = new Map();
  private _history: Map<string, { correct: number; total: number }> = new Map();

  constructor() {
    // Initialize with default accuracies
    for (const [source, accuracy] of Object.entries(DEFAULT_ACCURACIES)) {
      this.accuracies.set(source, {
        source,
        totalSignals: 100,
        correctSignals: Math.round(accuracy * 100),
        accuracy,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Combine signals using Bayesian updating
   * P(direction | signal) = P(signal | direction) × P(direction) / P(signal)
   */
  combine(signals: DetectorSignal[]): BayesianConsensus {
    if (signals.length === 0) {
      return {
        direction: 'neutral',
        confidence: 0,
        posteriorBullish: 0.33,
        posteriorBearish: 0.33,
        posteriorNeutral: 0.34,
        reinforcingSignals: [],
        conflictingSignals: [],
        keyLevels: [],
        detectorWeights: [],
      };
    }

    // Prior: uniform distribution (33% each)
    let pBull = 0.33;
    let pBear = 0.33;
    let pNeut = 0.34;

    const detectorWeights: BayesianConsensus['detectorWeights'] = [];

    // Apply Bayesian update for each signal
    for (const signal of signals) {
      const accuracy = this._getAccuracy(signal.source);
      const weight = this._calcWeight(signal.source, accuracy);

      detectorWeights.push({ source: signal.source, weight, signal });

      // Likelihood: P(signal | direction)
      const likelihoodGivenDir = accuracy * signal.confidence;
      const likelihoodGivenOther = (1 - accuracy) * 0.5;

      // Update posteriors using Bayes' theorem
      if (signal.direction === 'bullish') {
        pBull *= likelihoodGivenDir;
        pBear *= likelihoodGivenOther;
        pNeut *= (1 - signal.confidence) * 0.5 + 0.25;
      } else if (signal.direction === 'bearish') {
        pBear *= likelihoodGivenDir;
        pBull *= likelihoodGivenOther;
        pNeut *= (1 - signal.confidence) * 0.5 + 0.25;
      } else {
        // Neutral signal reduces both directional probabilities
        pNeut *= 1.0;
        pBull *= 0.7;
        pBear *= 0.7;
      }
    }

    // Normalize
    const total = pBull + pBear + pNeut;
    pBull /= total;
    pBear /= total;
    pNeut /= total;

    // Apply reinforcing combination boosts
    const { reinforcing, conflicting } = this._findReinforcingCombos(signals);
    for (const r of reinforcing) {
      if (r.direction === 'bullish') pBull += r.strength * 0.1;
      else pBear += r.strength * 0.1;
    }

    // Re-normalize after boosts
    const total2 = pBull + pBear + pNeut;
    pBull /= total2;
    pBear /= total2;
    pNeut /= total2;

    // Determine direction and confidence
    let direction: 'bullish' | 'bearish' | 'neutral';
    let confidence: number;

    if (pBull > pBear && pBull > pNeut) {
      direction = 'bullish';
      confidence = pBull;
    } else if (pBear > pBull && pBear > pNeut) {
      direction = 'bearish';
      confidence = pBear;
    } else {
      direction = 'neutral';
      confidence = pNeut;
    }

    // Extract key levels
    const keyLevels = this._extractKeyLevels(signals);

    return {
      direction,
      confidence: Math.min(0.95, confidence),
      posteriorBullish: pBull,
      posteriorBearish: pBear,
      posteriorNeutral: pNeut,
      reinforcingSignals: reinforcing,
      conflictingSignals: conflicting,
      keyLevels,
      detectorWeights,
    };
  }

  /**
   * Update detector accuracy based on outcome feedback
   */
  updateAccuracy(source: string, wasCorrect: boolean): void {
    const entry = this._history.get(source) || { correct: 0, total: 0 };
    entry.total++;
    if (wasCorrect) entry.correct++;
    this._history.set(source, entry);

    // Update accuracy with exponential smoothing
    const current = this.accuracies.get(source);
    if (current) {
      const newAccuracy = entry.total >= 10
        ? entry.correct / entry.total
        : (current.accuracy * 0.8) + (wasCorrect ? 0.2 : 0); // Smooth update
      current.accuracy = newAccuracy;
      current.totalSignals = entry.total;
      current.correctSignals = entry.correct;
      current.lastUpdated = Date.now();
    }
  }

  /**
   * Get current accuracy for all detectors
   */
  getAccuracies(): DetectorAccuracy[] {
    return Array.from(this.accuracies.values());
  }

  // ── Private ────────────────────────────────────────────

  private _getAccuracy(source: string): number {
    return this.accuracies.get(source)?.accuracy || 0.5;
  }

  private _calcWeight(source: string, accuracy: number): number {
    // Weight = accuracy × signal_count_factor
    // More accurate detectors get more weight
    return accuracy;
  }

  private _findReinforcingCombos(signals: DetectorSignal[]): {
    reinforcing: ReinforcingSignal[];
    conflicting: ConflictingSignal[];
  } {
    const reinforcing: ReinforcingSignal[] = [];
    const conflicting: ConflictingSignal[] = [];

    const signalMap = new Map<string, DetectorSignal[]>();
    for (const s of signals) {
      const list = signalMap.get(s.source) || [];
      list.push(s);
      signalMap.set(s.source, list);
    }

    // Check predefined reinforcing combos
    for (const combo of REINFORCING_COMBOS) {
      const matched = combo.sources.every(src => signalMap.has(src));
      if (!matched) continue;

      const comboSignals = combo.sources.flatMap(src => signalMap.get(src) || []);
      const directions = comboSignals.map(s => s.direction);

      // Check if directions align with the combo's expected direction
      const aligned = directions.filter(d => d === combo.direction).length;
      const total = directions.length;

      if (aligned / total >= 0.5) {
        reinforcing.push({
          sources: combo.sources,
          direction: combo.direction,
          description: combo.description,
          descriptionAr: combo.descriptionAr,
          strength: combo.boost * (aligned / total),
        });
      }
    }

    // Find conflicting signals (different sources, opposite directions)
    const bullishSources = signals.filter(s => s.direction === 'bullish').map(s => s.source);
    const bearishSources = signals.filter(s => s.direction === 'bearish').map(s => s.source);

    if (bullishSources.length > 0 && bearishSources.length > 0) {
      conflicting.push({
        sources: [...bullishSources, ...bearishSources],
        directions: ['bullish', 'bearish'],
        description: `${bullishSources.join(', ')} signal bullish while ${bearishSources.join(', ')} signal bearish`,
        descriptionAr: `${bullishSources.join('، ')} يشير للصعود بينما ${bearishSources.join('، ')} يشير للهبوط`,
      });
    }

    return { reinforcing, conflicting };
  }

  private _extractKeyLevels(signals: DetectorSignal[]): KeyLevel[] {
    const levels: KeyLevel[] = [];

    for (const signal of signals) {
      if (signal.price <= 0) continue;

      let type: KeyLevel['type'] = 'support';
      let label = signal.type;

      switch (signal.source) {
        case 'SMC':
          type = signal.direction === 'bullish' ? 'support' : 'resistance';
          label = signal.type === 'order_block'
            ? (signal.direction === 'bullish' ? 'OB صعودي' : 'OB هبوطي')
            : signal.type;
          break;
        case 'VolumeProfile':
          type = 'poc';
          label = 'POC';
          break;
        case 'Geometric':
          type = signal.direction === 'bullish' ? 'support' : 'resistance';
          label = signal.labelAr || signal.type;
          break;
        default:
          type = signal.direction === 'bullish' ? 'support' : 'resistance';
      }

      levels.push({
        price: signal.price,
        type,
        source: signal.source,
        strength: signal.confidence,
        label,
      });
    }

    // Sort by strength
    return levels.sort((a, b) => b.strength - a.strength).slice(0, 8);
  }
}

// ── Singleton ────────────────────────────────────────────
let _instance: BayesianEngine | null = null;

export function getBayesianEngine(): BayesianEngine {
  if (!_instance) {
    _instance = new BayesianEngine();
  }
  return _instance;
}

// ── Helper: Convert all detector outputs to unified signals ──
export function extractSignalsFromAnalysis(analysis: {
  smcData?: {
    orderBlocks: Array<{ type: string; low: number; high: number; strength: number }>;
    fvgs: Array<{ type: string; high: number; low: number }>;
    structureBreaks: Array<{ type: string; direction: string; price: number }>;
  };
  wyckoff?: { phase: string; bias: string; confidence: number };
  elliottPattern?: { direction: string; confidence: number; currentWave: string; nextTarget?: number } | null;
  volumeProfile?: { poc: number; vah: number; val: number };
  geoPatterns?: Array<{ type: string; direction: string; confidence: number; target?: number }>;
  patterns?: Array<{ type: string; direction: string; confidence: number; price: number }>;
  currentPrice?: number;
}): DetectorSignal[] {
  const signals: DetectorSignal[] = [];
  const price = analysis.currentPrice || 0;

  // SMC signals
  if (analysis.smcData) {
    for (const ob of analysis.smcData.orderBlocks) {
      signals.push({
        source: 'SMC',
        type: 'order_block',
        direction: ob.type === 'bullish' ? 'bullish' : 'bearish',
        confidence: ob.strength,
        price: (ob.low + ob.high) / 2,
        labelAr: ob.type === 'bullish' ? 'كتلة أوامر صعودية' : 'كتلة أوامر هبوطية',
        labelEn: ob.type === 'bullish' ? 'Bullish OB' : 'Bearish OB',
      });
    }

    for (const fvg of analysis.smcData.fvgs) {
      signals.push({
        source: 'SMC',
        type: 'fvg',
        direction: fvg.type === 'bullish' ? 'bullish' : 'bearish',
        confidence: 0.6,
        price: (fvg.low + fvg.high) / 2,
        labelAr: fvg.type === 'bullish' ? 'فجوة صعودية' : 'فجوة هبوطية',
        labelEn: fvg.type === 'bullish' ? 'Bullish FVG' : 'Bearish FVG',
      });
    }

    for (const brk of analysis.smcData.structureBreaks) {
      signals.push({
        source: 'SMC',
        type: brk.type.toLowerCase() === 'bos' ? 'bos' : 'choch',
        direction: brk.direction === 'bullish' ? 'bullish' : 'bearish',
        confidence: 0.7,
        price: brk.price,
        labelAr: brk.type === 'BOS' ? 'كسر هيكلي' : 'تغير السمة',
        labelEn: brk.type,
      });
    }
  }

  // Wyckoff signals
  if (analysis.wyckoff && analysis.wyckoff.phase !== 'Unknown') {
    signals.push({
      source: 'Wyckoff',
      type: analysis.wyckoff.phase.toLowerCase(),
      direction: analysis.wyckoff.bias === 'bullish' ? 'bullish'
        : analysis.wyckoff.bias === 'bearish' ? 'bearish' : 'neutral',
      confidence: analysis.wyckoff.confidence,
      price,
      labelAr: analysis.wyckoff.phase === 'Accumulation' ? 'تراكم'
        : analysis.wyckoff.phase === 'Distribution' ? 'توزيع'
        : analysis.wyckoff.phase === 'Markup' ? 'صعود'
        : analysis.wyckoff.phase === 'Markdown' ? 'هبوط' : 'غير محدد',
      labelEn: analysis.wyckoff.phase,
    });
  }

  // Elliott Wave signals
  if (analysis.elliottPattern) {
    signals.push({
      source: 'Elliott',
      type: analysis.elliottPattern.currentWave === '5' ? '5-wave' : 'corrective',
      direction: analysis.elliottPattern.direction === 'bullish' ? 'bullish' : 'bearish',
      confidence: analysis.elliottPattern.confidence,
      price: analysis.elliottPattern.nextTarget || price,
      labelAr: `موجة ${analysis.elliottPattern.currentWave}`,
      labelEn: `Wave ${analysis.elliottPattern.currentWave}`,
    });
  }

  // Volume Profile signals
  if (analysis.volumeProfile && analysis.volumeProfile.poc > 0) {
    const pocDir = price > analysis.volumeProfile.poc ? 'bullish' : price < analysis.volumeProfile.poc ? 'bearish' : 'neutral';
    signals.push({
      source: 'VolumeProfile',
      type: price > analysis.volumeProfile.poc ? 'poc_below' : 'poc_above',
      direction: pocDir,
      confidence: 0.6,
      price: analysis.volumeProfile.poc,
      labelAr: 'نقطة التحكم',
      labelEn: 'POC',
    });
  }

  // Geometric pattern signals
  if (analysis.geoPatterns) {
    for (const geo of analysis.geoPatterns) {
      signals.push({
        source: 'Geometric',
        type: geo.type.replace(/\s/g, '_').toLowerCase(),
        direction: geo.direction === 'bullish' ? 'bullish' : geo.direction === 'bearish' ? 'bearish' : 'neutral',
        confidence: geo.confidence,
        price: geo.target || price,
        labelAr: geo.type,
        labelEn: geo.type,
      });
    }
  }

  // Candlestick pattern signals
  if (analysis.patterns) {
    for (const p of analysis.patterns) {
      signals.push({
        source: 'Candlestick',
        type: p.type.replace(/\s/g, '_').toLowerCase(),
        direction: p.direction === 'bullish' ? 'bullish' : p.direction === 'bearish' ? 'bearish' : 'neutral',
        confidence: p.confidence,
        price: p.price,
        labelAr: p.type,
        labelEn: p.type,
      });
    }
  }

  return signals;
}
