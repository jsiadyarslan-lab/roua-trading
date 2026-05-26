// ═══════════════════════════════════════════════════════════
// Bayesian Consensus Engine — Stub
// ═══════════════════════════════════════════════════════════

export interface BayesianConsensus {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  signals: BayesianSignal[];
  timestamp: number;
}

export interface BayesianSignal {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;
  confidence: number;
}

export interface BayesianEngine {
  combine(signals: BayesianSignal[]): BayesianConsensus;
}

export function getBayesianEngine(): BayesianEngine {
  return {
    combine(signals: BayesianSignal[]): BayesianConsensus {
      if (!signals || signals.length === 0) {
        return { direction: 'neutral', confidence: 0, signals: [], timestamp: Date.now() };
      }
      const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
      const bullish = signals.filter(s => s.direction === 'bullish').reduce((s, sig) => s + sig.weight * sig.confidence, 0);
      const bearish = signals.filter(s => s.direction === 'bearish').reduce((s, sig) => s + sig.weight * sig.confidence, 0);
      const denom = totalWeight || 1;
      const direction = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';
      const confidence = direction === 'neutral' ? 0 : Math.max(bullish, bearish) / denom;
      return { direction, confidence, signals, timestamp: Date.now() };
    },
  };
}

export function extractSignalsFromAnalysis(analysis: Record<string, any>): BayesianSignal[] {
  if (!analysis) return [];
  const signals: BayesianSignal[] = [];
  // Extract simple directional signals from analysis object
  try {
    if (analysis.patterns) {
      for (const p of analysis.patterns) {
        if (p?.direction && p?.confidence) {
          signals.push({ source: `pattern:${p.type || 'unknown'}`, direction: p.direction, weight: 1, confidence: p.confidence / 100 });
        }
      }
    }
    if (analysis.smcData?.orderBlocks?.length) {
      const lastOB = analysis.smcData.orderBlocks[analysis.smcData.orderBlocks.length - 1];
      if (lastOB?.type) {
        signals.push({ source: 'smc:orderBlock', direction: lastOB.type === 'bullish' ? 'bullish' : 'bearish', weight: 0.8, confidence: 0.6 });
      }
    }
    if (analysis.wyckoff?.phase) {
      signals.push({ source: 'wyckoff', direction: 'neutral', weight: 0.5, confidence: 0.4 });
    }
  } catch {
    // Return whatever we have
  }
  return signals;
}
