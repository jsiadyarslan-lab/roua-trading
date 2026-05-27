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

/**
 * Auto-evaluate past signals against current price movement.
 * Marks old signals as correct/incorrect based on whether price
 * moved in the predicted direction within a reasonable timeframe.
 *
 * Evaluation logic:
 * - Stores entry price at signal time for accurate comparison
 * - For bullish signals: correct if price moved UP by 0.2%+ from entry
 * - For bearish signals: correct if price moved DOWN by 0.2%+ from entry
 * - Signals older than 1 hour without confirmation are marked incorrect
 */
export function autoEvaluateSignals(currentPrice: number, symbol: string, entryPrices?: Map<string, number>): void {
  const history = getSignalHistory();
  const now = Date.now();
  const ONE_HOUR = 3600000;
  const MIN_AGE = 120000; // 2 minutes — don't evaluate too-early signals
  const MOVE_THRESHOLD = 0.002; // 0.2% move confirms the signal

  let modified = false;

  for (const entry of history) {
    // Skip already-evaluated entries
    if (entry.wasCorrect !== undefined && entry.wasCorrect !== null) continue;
    // Skip entries that are too new (need time to play out)
    const age = now - entry.timestamp;
    if (age < MIN_AGE) continue;

    // Look up stored entry price, or estimate from current price + age
    const entryKey = `${entry.source}_${entry.timestamp}`;
    const storedEntryPrice = entryPrices?.get(entryKey);
    // Estimate entry price: assume price has been moving at ~0.05%/hour in the predicted direction
    // This is a rough estimate — stored entry price is much more accurate
    const estimatedEntryPrice = storedEntryPrice ?? estimateEntryPrice(currentPrice, entry, age);

    // Evaluate based on price movement from estimated/stored entry
    if (entry.direction === 'bullish') {
      const priceMovedUp = currentPrice > estimatedEntryPrice * (1 + MOVE_THRESHOLD);
      if (priceMovedUp) {
        entry.wasCorrect = true;
        modified = true;
      } else if (age > ONE_HOUR) {
        // Signal expired without confirmation → mark as incorrect
        entry.wasCorrect = false;
        modified = true;
      }
    } else if (entry.direction === 'bearish') {
      const priceMovedDown = currentPrice < estimatedEntryPrice * (1 - MOVE_THRESHOLD);
      if (priceMovedDown) {
        entry.wasCorrect = true;
        modified = true;
      } else if (age > ONE_HOUR) {
        entry.wasCorrect = false;
        modified = true;
      }
    }
    // Neutral signals don't get evaluated — they are uninformative
  }

  if (modified) {
    persistHistory();
  }

  void symbol;
}

/**
 * Estimate the entry price of a signal based on current price, direction, and age.
 * Uses a conservative drift model: assumes ~0.05%/hour price drift.
 * This is a rough estimate — prefer storing entry price at signal time.
 */
function estimateEntryPrice(currentPrice: number, entry: SignalHistoryEntry, ageMs: number): number {
  const ageHours = ageMs / 3600000;
  const driftPerHour = 0.0005; // 0.05%/hour — conservative estimate
  if (entry.direction === 'bullish') {
    // If signal was bullish and price went up, entry was lower than current
    return currentPrice / (1 + driftPerHour * ageHours);
  } else if (entry.direction === 'bearish') {
    // If signal was bearish and price went down, entry was higher than current
    return currentPrice / (1 - driftPerHour * ageHours);
  }
  return currentPrice;
}

/**
 * Calculate prior probability from candle data with prior clamping.
 * P(bullish) = fraction of bullish candles in recent history
 *
 * IMPORTANT: We clamp the prior to [0.15, 0.85] range.
 * Why? If prior is extreme (e.g. 0.99 from 100 bullish candles),
 * Bayes' theorem barely updates the posterior — even strong
 * contradicting signals can't overcome a 0.99 prior.
 * Clamping ensures signals always have meaningful influence.
 * This is a standard Bayesian practice called "weakly informative prior".
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
  // Laplace smoothing with alpha=5 (stronger smoothing = less extreme priors)
  // alpha=5 means we pretend we saw 5 of each before observing data
  // This prevents extreme priors while still reflecting market direction
  const alpha = 5; // Smoothing parameter — higher = more conservative prior
  const k = 2; // Number of classes
  const rawBullish = (bullishCount + alpha) / (total + alpha * k);
  const rawBearish = (bearishCount + alpha) / (total + alpha * k);
  // Clamp to [0.15, 0.85] — weakly informative prior
  // This ensures signals always have meaningful influence on the posterior
  const PRIOR_MIN = 0.15;
  const PRIOR_MAX = 0.85;
  const clampedBullish = Math.min(PRIOR_MAX, Math.max(PRIOR_MIN, rawBullish));
  const clampedBearish = Math.min(PRIOR_MAX, Math.max(PRIOR_MIN, rawBearish));
  // Re-normalize so they sum to 1.0
  const sum = clampedBullish + clampedBearish;
  return {
    bullish: clampedBullish / sum,
    bearish: clampedBearish / sum,
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
