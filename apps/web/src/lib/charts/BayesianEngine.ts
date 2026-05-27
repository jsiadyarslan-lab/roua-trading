// ═══════════════════════════════════════════════════════════
// Bayesian Consensus Engine — Real Naive Bayes Implementation
// Uses Bayes' Theorem: P(A|B) = P(B|A) * P(A) / P(B)
// With Laplace Smoothing and adaptive priors from market data
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface BayesianConsensus {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  signals: BayesianSignal[];
  timestamp: number;
  /** Posterior probability for bullish */
  posteriorBullish: number;
  /** Posterior probability for bearish */
  posteriorBearish: number;
  /** Prior probability derived from market data */
  prior: { bullish: number; bearish: number };
  /** Per-signal likelihood contributions */
  likelihoods: Array<{ source: string; likelihoodBull: number; likelihoodBear: number }>;
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

/** Signal history record for adaptive likelihood estimation */
interface SignalHistoryEntry {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  wasCorrect: boolean;
  timestamp: number;
}

/** In-memory signal history with persistence */
const signalHistory: SignalHistoryEntry[] = [];
const MAX_HISTORY = 2000;

/** Get signal history, loading from localStorage if available */
function getSignalHistory(): SignalHistoryEntry[] {
  if (signalHistory.length > 0) return signalHistory;
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('roua-signal-history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          signalHistory.push(...parsed.slice(-MAX_HISTORY));
        }
      }
    }
  } catch { /* localStorage not available */ }
  return signalHistory;
}

/** Persist signal history to localStorage */
function persistHistory(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('roua-signal-history', JSON.stringify(signalHistory.slice(-MAX_HISTORY)));
    }
  } catch { /* localStorage not available */ }
}

/** Record the outcome of a signal for adaptive learning */
export function recordSignalOutcome(source: string, direction: 'bullish' | 'bearish' | 'neutral', wasCorrect: boolean): void {
  const history = getSignalHistory();
  history.push({ source, direction, wasCorrect, timestamp: Date.now() });
  // Trim old entries
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  persistHistory();
}

/** Auto-evaluate past signals against current price movement */
export function autoEvaluateSignals(currentPrice: number, symbol: string): void {
  // This is called periodically to mark old signals as correct/incorrect
  // based on whether price moved in the predicted direction
  const history = getSignalHistory();
  const recent = history.filter(h => !h.wasCorrect && h.timestamp > Date.now() - 3600000); // Last hour
  // No auto-evaluation logic here - just keep for future expansion
  void currentPrice;
  void symbol;
  void recent;
}

/**
 * Calculate prior probability from candle data.
 * P(bullish) = fraction of bullish candles in recent history
 */
function calculatePrior(candles: CandleData[]): { bullish: number; bearish: number } {
  if (!candles || candles.length < 10) {
    return { bullish: 0.5, bearish: 0.5 };
  }
  const recent = candles.slice(-100);
  let bullishCount = 0;
  let bearishCount = 0;
  for (const c of recent) {
    if (c.close > c.open) bullishCount++;
    else if (c.close < c.open) bearishCount++;
  }
  const total = bullishCount + bearishCount;
  if (total === 0) return { bullish: 0.5, bearish: 0.5 };
  // Laplace smoothing with alpha=1, k=2 (two classes)
  return {
    bullish: (bullishCount + 1) / (total + 2),
    bearish: (bearishCount + 1) / (total + 2),
  };
}

/**
 * Calculate likelihood P(signal | direction) from historical performance.
 * If no history exists, falls back to the signal's own confidence.
 */
function calculateLikelihood(
  source: string,
  signalDirection: 'bullish' | 'bearish' | 'neutral',
  targetDirection: 'bullish' | 'bearish',
  signalConfidence: number,
): number {
  const history = getSignalHistory();
  const sourceHistory = history.filter(h => h.source === source);

  if (sourceHistory.length >= 10) {
    // Use empirical likelihood from history
    const dirHistory = sourceHistory.filter(h => h.direction === signalDirection);
    const correctForTarget = dirHistory.filter(h => h.wasCorrect && (
      (targetDirection === 'bullish' && signalDirection === 'bullish') ||
      (targetDirection === 'bearish' && signalDirection === 'bearish')
    )).length;
    // Laplace smoothing: alpha=1, k=2
    return (correctForTarget + 1) / (dirHistory.length + 2);
  }

  // Fallback: use the signal's confidence as proxy
  // If signal direction matches target, likelihood = confidence
  // If signal is neutral, likelihood = 0.5 (uninformative)
  // If signal contradicts target, likelihood = 1 - confidence
  if (signalDirection === 'neutral') return 0.5;
  if (signalDirection === targetDirection) return Math.max(0.01, signalConfidence);
  return Math.max(0.01, 1 - signalConfidence);
}

export function getBayesianEngine(candles?: CandleData[]): BayesianEngine {
  return {
    combine(signals: BayesianSignal[]): BayesianConsensus {
      if (!signals || signals.length === 0) {
        return {
          direction: 'neutral', confidence: 0, signals: [],
          timestamp: Date.now(),
          posteriorBullish: 0.5, posteriorBearish: 0.5,
          prior: { bullish: 0.5, bearish: 0.5 },
          likelihoods: [],
        };
      }

      // Step 1: Calculate prior from market data (or use default 0.5/0.5)
      const prior = candles && candles.length >= 10
        ? calculatePrior(candles)
        : { bullish: 0.5, bearish: 0.5 };

      // Step 2: Calculate likelihoods P(signals | bullish) and P(signals | bearish)
      // Under Naive Bayes assumption of conditional independence:
      // P(signals | direction) = product of P(each_signal | direction)
      let likelihoodBullish = 1.0;
      let likelihoodBearish = 1.0;
      const likelihoods: Array<{ source: string; likelihoodBull: number; likelihoodBear: number }> = [];

      for (const sig of signals) {
        const pBull = calculateLikelihood(sig.source, sig.direction, 'bullish', sig.confidence);
        const pBear = calculateLikelihood(sig.source, sig.direction, 'bearish', sig.confidence);
        likelihoodBullish *= pBull;
        likelihoodBearish *= pBear;
        likelihoods.push({ source: sig.source, likelihoodBull: pBull, likelihoodBear: pBear });
      }

      // Step 3: Apply Bayes' Theorem
      // P(bullish | signals) = P(signals | bullish) * P(bullish) / P(signals)
      // P(signals) = P(signals|bullish)*P(bullish) + P(signals|bearish)*P(bearish)
      const numeratorBull = likelihoodBullish * prior.bullish;
      const numeratorBear = likelihoodBearish * prior.bearish;
      const evidence = numeratorBull + numeratorBear;

      const posteriorBullish = evidence > 0 ? numeratorBull / evidence : 0.5;
      const posteriorBearish = evidence > 0 ? numeratorBear / evidence : 0.5;

      // Step 4: Determine direction and confidence from posterior
      let direction: 'bullish' | 'bearish' | 'neutral';
      let confidence: number;

      const margin = Math.abs(posteriorBullish - posteriorBearish);
      if (margin < 0.1) {
        // Too close to call — neutral
        direction = 'neutral';
        confidence = margin; // Low confidence
      } else if (posteriorBullish > posteriorBearish) {
        direction = 'bullish';
        confidence = posteriorBullish;
      } else {
        direction = 'bearish';
        confidence = posteriorBearish;
      }

      return {
        direction,
        confidence: Math.min(0.95, confidence),
        signals,
        timestamp: Date.now(),
        posteriorBullish,
        posteriorBearish,
        prior,
        likelihoods,
      };
    },
  };
}

export function extractSignalsFromAnalysis(analysis: Record<string, any>): BayesianSignal[] {
  if (!analysis) return [];
  const signals: BayesianSignal[] = [];
  try {
    // Candlestick patterns — weight by confidence
    if (analysis.patterns) {
      for (const p of analysis.patterns) {
        if (p?.direction && p?.confidence) {
          const conf = p.confidence / 100;
          signals.push({
            source: `pattern:${p.type || 'unknown'}`,
            direction: p.direction,
            weight: 0.6 + conf * 0.4, // 0.6-1.0 based on confidence
            confidence: conf,
          });
        }
      }
    }

    // SMC Order Blocks — weight by proximity and type
    if (analysis.smcData?.orderBlocks?.length) {
      for (const ob of analysis.smcData.orderBlocks.slice(-3)) {
        if (ob?.type) {
          const dir: 'bullish' | 'bearish' = ob.type === 'bullish' ? 'bullish' : 'bearish';
          // Order blocks closer to current price are more relevant
          const proximity = ob.proximity || 0.7;
          signals.push({
            source: 'smc:orderBlock',
            direction: dir,
            weight: 0.6 + proximity * 0.3,
            confidence: 0.55 + proximity * 0.2,
          });
        }
      }
    }

    // SMC BOS/CHoCH — strong directional signal
    if (analysis.smcData?.structureBreaks?.length) {
      for (const br of analysis.smcData.structureBreaks.slice(-2)) {
        const dir: 'bullish' | 'bearish' = br.type?.includes('bullish') ? 'bullish' : 'bearish';
        signals.push({
          source: `smc:${br.type || 'bos'}`,
          direction: dir,
          weight: 0.8,
          confidence: 0.65,
        });
      }
    }

    // Wyckoff phase — NOW WITH ACTUAL DIRECTIONAL SIGNAL
    if (analysis.wyckoff?.phase) {
      const phase = analysis.wyckoff.phase;
      // Accumulation → bullish (buyers stepping in)
      // Markup → bullish (trend established)
      // Distribution → bearish (sellers stepping in)
      // Markdown → bearish (trend established)
      let dir: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let conf = 0.4;
      if (phase === 'Accumulation' || phase === 'Markup') {
        dir = 'bullish';
        conf = phase === 'Markup' ? 0.6 : 0.5;
      } else if (phase === 'Distribution' || phase === 'Markdown') {
        dir = 'bearish';
        conf = phase === 'Markdown' ? 0.6 : 0.5;
      }
      signals.push({ source: 'wyckoff', direction: dir, weight: 0.5, confidence: conf });
    }

    // Elliott Wave
    if (analysis.elliottPattern?.waveLabel) {
      const label = analysis.elliottPattern.waveLabel;
      const isImpulse = label.startsWith('1') || label.startsWith('3') || label.startsWith('5');
      signals.push({
        source: 'elliott:wave',
        direction: isImpulse ? 'bullish' : 'bearish',
        weight: 0.7,
        confidence: analysis.elliottPattern.confidence || 0.5,
      });
    }

    // Volume Profile — if POC is above current price → bearish pressure, below → bullish
    if (analysis.volumeProfile?.poc) {
      // This is context-dependent; neutral for now unless we have current price
      signals.push({
        source: 'volumeProfile:poc',
        direction: 'neutral',
        weight: 0.3,
        confidence: 0.35,
      });
    }

  } catch {
    // Return whatever we have
  }
  return signals;
}
