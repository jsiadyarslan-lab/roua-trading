// ═══════════════════════════════════════════════════════════════════════
// ROUA Visual Backtesting Engine — Revolutionary Feature #1
//
// Replays historical candles through the analysis pipeline and tracks
// whether each signal was profitable. Renders results as colored
// markers on the chart: green = signal was correct, red = incorrect,
// yellow = pending. This gives traders instant visual feedback on
// which signals to trust and which to ignore.
//
// Key innovation: Unlike traditional backtesting that shows aggregate
// stats, this engine marks EACH signal directly on the chart so
// traders can SEE the pattern of success/failure in context.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

/** Result of backtesting a single signal */
export interface BacktestSignalResult {
  /** Source of the signal (e.g. 'smc:bos', 'harmonic:gartley') */
  source: string;
  /** Direction predicted */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Confidence at signal time */
  confidence: number;
  /** Candle index where signal occurred */
  candleIndex: number;
  /** Price at signal time */
  entryPrice: number;
  /** Timestamp of signal */
  timestamp: number;
  /** Actual outcome */
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  /** Price at evaluation (TP/SL hit or timeout) */
  exitPrice: number | null;
  /** P&L in percentage */
  pnlPct: number;
  /** How many candles until resolution */
  candlesToResolution: number;
  /** Risk/Reward achieved (null if SL hit) */
  achievedRR: number | null;
}

/** Aggregate backtest statistics */
export interface BacktestStats {
  /** Total signals tested */
  totalSignals: number;
  /** Wins */
  wins: number;
  /** Losses */
  losses: number;
  /** Breakeven */
  breakevens: number;
  /** Pending (not yet resolved) */
  pending: number;
  /** Win rate (excluding pending) */
  winRate: number;
  /** Average P&L per signal */
  avgPnLPct: number;
  /** Average R:R achieved */
  avgRR: number;
  /** Per-source breakdown */
  bySource: Record<string, {
    total: number; wins: number; losses: number; winRate: number; avgPnL: number;
  }>;
  /** Per-direction breakdown */
  byDirection: {
    bullish: { total: number; wins: number; winRate: number };
    bearish: { total: number; wins: number; winRate: number };
  };
}

/** A marker to render on the chart */
export interface BacktestMarker {
  time: number;
  price: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  source: string;
  confidence: number;
  pnlPct: number;
}

// ── Configuration ───────────────────────────────────────────────────

const EVALUATION_HORIZON = 20; // Look ahead 20 candles to evaluate outcome
const WIN_THRESHOLD = 0.005;   // 0.5% move in predicted direction = win
const LOSS_THRESHOLD = 0.003;  // 0.3% move against = loss

// ── Main Backtest Function ──────────────────────────────────────────

/**
 * Run a visual backtest on historical candles.
 * Replays the candle data through the signal detection logic and
 * evaluates whether each signal was correct by looking ahead.
 *
 * @param candles - Historical candle data (at least 50 candles)
 * @param signalsFn - Function that extracts signals from a slice of candles
 * @returns Backtest results with markers and statistics
 */
export function runVisualBacktest(
  candles: CandleData[],
  signalsFn: (candles: CandleData[]) => Array<{
    source: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    price: number;
  }>,
): {
  results: BacktestSignalResult[];
  stats: BacktestStats;
  markers: BacktestMarker[];
} {
  if (!candles || candles.length < 50) {
    return { results: [], stats: emptyStats(), markers: [] };
  }

  const results: BacktestSignalResult[] = [];
  const markers: BacktestMarker[] = [];

  // Slide a window across the candles and detect signals at each position
  const WINDOW_SIZE = 50;
  const STEP = 3; // Evaluate every 3rd candle for performance

  for (let i = WINDOW_SIZE; i < candles.length - EVALUATION_HORIZON; i += STEP) {
    const window = candles.slice(i - WINDOW_SIZE, i);
    const currentCandle = candles[i];
    const entryPrice = currentCandle.close;

    // Detect signals in this window
    const signals = signalsFn(window);

    for (const signal of signals) {
      // Only evaluate directional signals (skip neutral)
      if (signal.direction === 'neutral') continue;
      if (signal.confidence < 0.4) continue; // Skip very low confidence

      // Evaluate by looking ahead
      const outcome = evaluateSignalOutcome(
        signal.direction,
        entryPrice,
        candles,
        i,
      );

      const result: BacktestSignalResult = {
        source: signal.source,
        direction: signal.direction,
        confidence: signal.confidence,
        candleIndex: i,
        entryPrice,
        timestamp: currentCandle.time as number,
        ...outcome,
      };

      results.push(result);
      markers.push({
        time: currentCandle.time as number,
        price: entryPrice,
        direction: signal.direction,
        outcome: outcome.outcome,
        source: signal.source,
        confidence: signal.confidence,
        pnlPct: outcome.pnlPct,
      });
    }
  }

  const stats = calculateStats(results);

  return { results, stats, markers };
}

/**
 * Evaluate a single signal's outcome by looking ahead in the candle data.
 * Checks if price moved in the predicted direction within the evaluation horizon.
 */
function evaluateSignalOutcome(
  direction: 'bullish' | 'bearish',
  entryPrice: number,
  candles: CandleData[],
  startIndex: number,
): {
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  exitPrice: number | null;
  pnlPct: number;
  candlesToResolution: number;
  achievedRR: number | null;
} {
  const horizon = Math.min(startIndex + EVALUATION_HORIZON, candles.length);

  let maxFavorable = 0;
  let maxAdverse = 0;
  let resolutionIndex = horizon;

  for (let j = startIndex + 1; j < horizon; j++) {
    const c = candles[j];
    const move = direction === 'bullish'
      ? (c.close - entryPrice) / entryPrice
      : (entryPrice - c.close) / entryPrice;

    if (move > maxFavorable) maxFavorable = move;
    if (-move > maxAdverse) maxAdverse = -move;

    // Check win/loss thresholds
    if (move >= WIN_THRESHOLD) {
      resolutionIndex = j;
      break;
    }
    if (move <= -LOSS_THRESHOLD) {
      resolutionIndex = j;
      break;
    }
  }

  const finalMove = direction === 'bullish'
    ? (candles[resolutionIndex - 1]?.close || entryPrice) - entryPrice
    : entryPrice - (candles[resolutionIndex - 1]?.close || entryPrice);
  const pnlPct = finalMove / entryPrice;

  let outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  let achievedRR: number | null = null;

  if (resolutionIndex >= horizon) {
    outcome = 'pending';
  } else if (pnlPct >= WIN_THRESHOLD) {
    outcome = 'win';
    achievedRR = maxFavorable / (maxAdverse || entryPrice * 0.001);
  } else if (pnlPct <= -LOSS_THRESHOLD) {
    outcome = 'loss';
    achievedRR = null;
  } else {
    outcome = 'breakeven';
  }

  return {
    outcome,
    exitPrice: resolutionIndex < horizon ? candles[resolutionIndex - 1]?.close ?? null : null,
    pnlPct: Math.round(pnlPct * 10000) / 10000,
    candlesToResolution: resolutionIndex - startIndex,
    achievedRR: achievedRR !== null ? Math.round(achievedRR * 100) / 100 : null,
  };
}

// ── Statistics ──────────────────────────────────────────────────────

function calculateStats(results: BacktestSignalResult[]): BacktestStats {
  const resolved = results.filter(r => r.outcome !== 'pending');
  const wins = resolved.filter(r => r.outcome === 'win');
  const losses = resolved.filter(r => r.outcome === 'loss');
  const breakevens = resolved.filter(r => r.outcome === 'breakeven');
  const pending = results.filter(r => r.outcome === 'pending');

  // Per-source breakdown
  const bySource: Record<string, { total: number; wins: number; losses: number; winRate: number; avgPnL: number }> = {};
  for (const r of resolved) {
    if (!bySource[r.source]) bySource[r.source] = { total: 0, wins: 0, losses: 0, winRate: 0, avgPnL: 0 };
    bySource[r.source].total++;
    if (r.outcome === 'win') bySource[r.source].wins++;
    if (r.outcome === 'loss') bySource[r.source].losses++;
  }
  for (const key of Object.keys(bySource)) {
    const s = bySource[key];
    s.winRate = s.total > 0 ? s.wins / s.total : 0;
    s.avgPnL = resolved.filter(r => r.source === key).reduce((sum, r) => sum + r.pnlPct, 0) / s.total;
  }

  // Per-direction breakdown
  const bullResolved = resolved.filter(r => r.direction === 'bullish');
  const bearResolved = resolved.filter(r => r.direction === 'bearish');

  return {
    totalSignals: results.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    pending: pending.length,
    winRate: resolved.length > 0 ? wins.length / resolved.length : 0,
    avgPnLPct: resolved.length > 0 ? resolved.reduce((s, r) => s + r.pnlPct, 0) / resolved.length : 0,
    avgRR: wins.length > 0 ? wins.reduce((s, r) => s + (r.achievedRR || 0), 0) / wins.length : 0,
    bySource,
    byDirection: {
      bullish: {
        total: bullResolved.length,
        wins: bullResolved.filter(r => r.outcome === 'win').length,
        winRate: bullResolved.length > 0 ? bullResolved.filter(r => r.outcome === 'win').length / bullResolved.length : 0,
      },
      bearish: {
        total: bearResolved.length,
        wins: bearResolved.filter(r => r.outcome === 'win').length,
        winRate: bearResolved.length > 0 ? bearResolved.filter(r => r.outcome === 'win').length / bearResolved.length : 0,
      },
    },
  };
}

function emptyStats(): BacktestStats {
  return {
    totalSignals: 0, wins: 0, losses: 0, breakevens: 0, pending: 0,
    winRate: 0, avgPnLPct: 0, avgRR: 0, bySource: {},
    byDirection: { bullish: { total: 0, wins: 0, winRate: 0 }, bearish: { total: 0, wins: 0, winRate: 0 } },
  };
}

// ── Quick Backtest from existing analysis ───────────────────────────

/**
 * Quick backtest that uses already-detected signals from the analysis pipeline
 * instead of re-running signal detection. This is faster and reuses the
 * existing analysis results.
 */
export function quickBacktest(
  candles: CandleData[],
  detectedSignals: Array<{
    source: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    candleIndex?: number;
    price: number;
  }>,
): { results: BacktestSignalResult[]; stats: BacktestStats; markers: BacktestMarker[] } {
  if (!candles || candles.length < 20) {
    return { results: [], stats: emptyStats(), markers: [] };
  }

  const results: BacktestSignalResult[] = [];
  const markers: BacktestMarker[] = [];

  for (const sig of detectedSignals) {
    if (sig.direction === 'neutral' || sig.confidence < 0.4) continue;

    // Find the candle index for this signal
    const idx = sig.candleIndex ?? findClosestCandleIndex(candles, sig.price);
    if (idx < 0 || idx >= candles.length - 5) continue;

    const outcome = evaluateSignalOutcome(sig.direction, sig.price, candles, idx);

    const result: BacktestSignalResult = {
      source: sig.source,
      direction: sig.direction,
      confidence: sig.confidence,
      candleIndex: idx,
      entryPrice: sig.price,
      timestamp: candles[idx].time as number,
      ...outcome,
    };

    results.push(result);
    markers.push({
      time: candles[idx].time as number,
      price: sig.price,
      direction: sig.direction,
      outcome: outcome.outcome,
      source: sig.source,
      confidence: sig.confidence,
      pnlPct: outcome.pnlPct,
    });
  }

  return { results, stats: calculateStats(results), markers };
}

/** Find the candle index closest to a given price level */
function findClosestCandleIndex(candles: CandleData[], targetPrice: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  // Search in the last 60% of candles (more relevant)
  const start = Math.floor(candles.length * 0.4);
  for (let i = start; i < candles.length; i++) {
    const dist = Math.abs(candles[i].close - targetPrice);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}
