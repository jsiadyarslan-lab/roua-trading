// ═══════════════════════════════════════════════════════════════════════
// ROUA Auto-Trade Engine — Phase 3 (Upgraded)
//
// When the system detects high confluence (3+ agreeing signals),
// it automatically proposes a trade with Entry/SL/TP/Position Size.
//
// UPGRADES from Phase 3:
// - Trailing stop logic (move SL to breakeven + trail)
// - Daily loss limit (circuit breaker)
// - Maximum concurrent trades
// - Spread/slippage buffer on entry
// - Breakeven move (move SL to entry after TP1)
// - Trade history with P&L tracking
// - MTF confluence integration (stronger entries)
// - Partial close at TP1 (50%) and TP2 (30%)
// - Risk-adjusted position sizing with Kelly criterion hint
// - Trade scoring system (quality metrics)
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';

// ── Types ───────────────────────────────────────────────────────────

/** A proposed trade from the auto-trade engine */
export interface TradeProposal {
  /** Unique proposal ID */
  id: string;
  /** Trade direction */
  direction: 'bullish' | 'bearish';
  /** Entry price */
  entryPrice: number;
  /** Stop loss price */
  stopLoss: number;
  /** Take profit price(s) — TP1, TP2, TP3 */
  takeProfits: number[];
  /** Position size in base currency */
  positionSize: number;
  /** Risk amount in quote currency */
  riskAmount: number;
  /** Reward amount in quote currency (to TP3) */
  rewardAmount: number;
  /** Risk/Reward ratio (to TP3) */
  rrRatio: number;
  /** Confluence score (0-100) that triggered this proposal */
  confluenceScore: number;
  /** Which signals agreed for this trade */
  agreeingSignals: TradeSignal[];
  /** Pattern type that provides the invalidation level */
  patternSource: string;
  /** Confidence of the proposal (0-1) */
  confidence: number;
  /** Current status of the proposal */
  status: 'pending' | 'active' | 'hit_tp1' | 'hit_tp2' | 'hit_tp3' | 'hit_sl' | 'trail_sl' | 'breakeven' | 'expired' | 'closed';
  /** Timestamp when proposed */
  proposedAt: number;
  /** Arabic description */
  descriptionAr: string;
  /** Timeframe */
  timeframe: string;
  /** Spread buffer applied (in quote currency) */
  spreadBuffer: number;
  /** Trailing stop activation level (price) */
  trailActivation: number;
  /** Trailing stop distance (in quote currency) */
  trailDistance: number;
  /** Current trailing stop price (updated in real-time) */
  currentTrailSL: number | null;
  /** Quality score (0-100) — composite metric */
  qualityScore: number;
  /** Partial close schedule */
  partialCloses: PartialClose[];
  /** MTF confluence data (if available) */
  mtfConfluence?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    score: number;
    agreeingTFs: number;
  };
  /** P&L tracking */
  pnl: TradePnL;
}

/** A signal contributing to a trade proposal */
export interface TradeSignal {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  keyLevel: number;
}

/**
 * Optional boost data from revolutionary engines.
 * All fields are optional — if not provided, behavior is identical to before.
 * This allows the revolutionary engines to enhance trade decisions
 * WITHOUT changing any existing code path.
 */
export interface RevolutionaryBoost {
  /** Confluence zone near current price — boosts confluenceScore if strong */
  confluenceZoneBoost?: {
    score: number;         // Zone score 0-100
    direction: 'bullish' | 'bearish' | 'neutral';
    isActive: boolean;     // Price is inside/near the zone
    signalCount: number;   // How many signals cluster in this zone
  };
  /** Per-source win rates from visual backtest — weights signal confidence */
  backtestSourceWeights?: Record<string, {
    winRate: number;       // 0-1 historical win rate for this source
    sampleSize: number;    // How many signals evaluated
  }>;
  /** Best correlation combo that includes one of our signals — boosts confidence */
  correlationBoost?: {
    combinedWinRate: number;  // 0-1 combined win rate
    lift: number;             // >1 = improvement over individual signal
    partnerSource: string;    // The other source in the combo
  };
  /** Pattern prediction near completion — adds an early signal */
  predictionNearCompletion?: {
    patternType: string;
    predictedDirection: 'bullish' | 'bearish';
    completionPct: number;   // 0-100 how complete
    confidence: number;      // Prediction confidence 0-1
    targetPrice: number;     // Expected completion price
  };
  /** Risk assessment from AI explanation — can reduce confidence */
  explanationRisk?: 'low' | 'medium' | 'high';
}

/** Partial close schedule */
export interface PartialClose {
  /** Price level for partial close */
  price: number;
  /** Fraction of position to close (0-1) */
  fraction: number;
  /** Whether this partial close has been executed */
  executed: boolean;
}

/** P&L tracking for a trade */
export interface TradePnL {
  /** Realized P&L from partial closes */
  realized: number;
  /** Unrealized P&L at current price */
  unrealized: number;
  /** Fees estimated (0.1% per trade for Binance) */
  fees: number;
  /** Net P&L (realized - fees) */
  netPnL: number;
}

/** Risk management parameters */
export interface RiskParams {
  /** Risk per trade as fraction of account (default: 0.01 = 1%) */
  riskPerTrade: number;
  /** Account balance in quote currency (e.g. USDT) */
  accountBalance: number;
  /** Minimum R:R ratio to accept a trade (default: 2.0) */
  minRRRatio: number;
  /** Maximum position size as fraction of account (default: 0.1 = 10%) */
  maxPositionFraction: number;
  /** Minimum confluence score to propose (default: 60) */
  minConfluence: number;
  /** Minimum agreeing signals (default: 3) */
  minAgreeingSignals: number;
  /** Maximum SL distance as % of price (default: 3%) */
  maxSLPct: number;
  /** ATR multiplier for SL fallback (default: 2.0) */
  atrSLMultiplier: number;
  /** Daily loss limit as fraction of account (default: 3%) */
  dailyLossLimit: number;
  /** Maximum concurrent trades (default: 3) */
  maxConcurrentTrades: number;
  /** Spread/slippage buffer in basis points (default: 5 bps = 0.05%) */
  spreadBufferBps: number;
  /** Enable trailing stop (default: true) */
  enableTrailingStop: boolean;
  /** Trail activation: distance from entry as multiple of risk (default: 1.0 = TP1) */
  trailActivationRR: number;
  /** Trail distance: ATR multiplier for trailing distance (default: 1.5) */
  trailATRMultiplier: number;
  /** Enable breakeven move after TP1 (default: true) */
  enableBreakeven: boolean;
  /** Enable partial closes (default: true) */
  enablePartialCloses: boolean;
}

/** Daily trade statistics */
export interface DailyStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number;
  avgRR: number;
  maxDrawdown: number;
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_RISK: RiskParams = {
  riskPerTrade: 0.01,       // 1% risk per trade
  accountBalance: 10000,    // $10,000 default
  minRRRatio: 1.5,          // Minimum 1:1.5 R:R (was 2.0 — too strict for crypto)
  maxPositionFraction: 0.1, // Max 10% of account in one position
  minConfluence: 55,        // V262: Raised from 40 → 55 for higher quality proposals
  minAgreeingSignals: 3,    // V262: Raised from 2 → 3 — need stronger consensus
  maxSLPct: 0.03,           // Max 3% SL distance
  atrSLMultiplier: 2.0,     // 2x ATR for SL fallback
  dailyLossLimit: 0.03,     // 3% daily loss limit
  maxConcurrentTrades: 3,   // Max 3 concurrent trades
  spreadBufferBps: 5,       // 5 bps = 0.05% spread buffer
  enableTrailingStop: true, // Enable trailing stop
  trailActivationRR: 1.0,   // Activate trail at 1:1 R:R (TP1)
  trailATRMultiplier: 1.5,  // 1.5x ATR trailing distance
  enableBreakeven: true,    // Move SL to breakeven after TP1
  enablePartialCloses: true, // Enable partial closes
};

// ── In-memory State ─────────────────────────────────────────────────

const proposals = new Map<string, TradeProposal>();
const tradeHistory = new Map<string, TradeProposal>();
const MAX_PROPOSALS = 50;
const MAX_HISTORY = 200;
const RISK_PARAMS_KEY = 'roua-risk-params';

// Daily tracking
let dailyPnL = 0;
let dailyTrades = 0;
let dailyDate = new Date().toISOString().split('T')[0];
let dailyStatsHistory: DailyStats[] = [];

// ── Risk Parameter Management ───────────────────────────────────────

/** Get current risk parameters (from localStorage or defaults) */
export function getRiskParams(): RiskParams {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(RISK_PARAMS_KEY);
      if (stored) {
        return { ...DEFAULT_RISK, ...JSON.parse(stored) };
      }
    }
  } catch { /* not available */ }
  return { ...DEFAULT_RISK };
}

/** Update risk parameters (persists to localStorage) */
export function updateRiskParams(params: Partial<RiskParams>): void {
  const current = getRiskParams();
  const updated = { ...current, ...params };
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(RISK_PARAMS_KEY, JSON.stringify(updated));
    }
  } catch { /* not available */ }
}

// ── Daily Loss Limit Check ──────────────────────────────────────────

/**
 * Check if we've hit the daily loss limit.
 * If so, no new trades should be proposed until the next day.
 */
function checkDailyLossLimit(params: RiskParams): boolean {
  // Reset daily counter if new day
  const today = new Date().toISOString().split('T')[0];
  if (today !== dailyDate) {
    // Save yesterday's stats
    if (dailyTrades > 0) {
      dailyStatsHistory.push({
        date: dailyDate,
        trades: dailyTrades,
        wins: Array.from(proposals.values()).filter(p => p.status === 'hit_tp1' || p.status === 'hit_tp2' || p.status === 'hit_tp3').length,
        losses: Array.from(proposals.values()).filter(p => p.status === 'hit_sl').length,
        pnl: dailyPnL,
        winRate: 0,
        avgRR: 0,
        maxDrawdown: 0,
      });
      dailyStatsHistory = dailyStatsHistory.slice(-30); // Keep last 30 days
    }
    dailyPnL = 0;
    dailyTrades = 0;
    dailyDate = today;
  }

  const dailyLossAmount = params.accountBalance * params.dailyLossLimit;
  return dailyPnL < -dailyLossAmount;
}

/** Record a trade result for daily tracking */
function recordTradeResult(pnl: number): void {
  dailyPnL += pnl;
  dailyTrades++;
}

// ── Concurrent Trades Check ─────────────────────────────────────────

/** Check if we can take another trade */
function canTakeTrade(params: RiskParams): boolean {
  const activeCount = Array.from(proposals.values())
    .filter(p => p.status === 'pending' || p.status === 'active' || p.status === 'breakeven')
    .length;
  return activeCount < params.maxConcurrentTrades;
}

// ── SL/TP Calculation ───────────────────────────────────────────────

/**
 * Calculate Stop Loss price based on pattern invalidation level.
 * Falls back to ATR-based SL if no pattern level available.
 * Includes spread buffer to avoid getting stopped out by noise.
 */
function calculateStopLoss(
  direction: 'bullish' | 'bearish',
  entryPrice: number,
  patternInvalidation: number | null,
  candles: CandleData[],
  params: RiskParams,
): number {
  // Primary: use pattern invalidation level
  if (patternInvalidation && patternInvalidation > 0) {
    // BUG-011 FIX: Validate that patternInvalidation is on the CORRECT side of entry.
    // For bullish: SL must be BELOW entry (patternInvalidation < entryPrice).
    // For bearish: SL must be ABOVE entry (patternInvalidation > entryPrice).
    // Without this check, a distribution UTAD level ABOVE current price would be
    // used as SL for a bullish trade → SL on wrong side → immediate loss guaranteed.
    const isOnCorrectSide = direction === 'bullish'
      ? patternInvalidation < entryPrice
      : patternInvalidation > entryPrice;

    if (isOnCorrectSide) {
      const slDistance = Math.abs(entryPrice - patternInvalidation);
      const slPct = slDistance / entryPrice;

      // Don't use pattern SL if it's too far
      if (slPct <= params.maxSLPct) {
        // Add spread buffer
        return direction === 'bullish'
          ? patternInvalidation - entryPrice * (params.spreadBufferBps / 10000)
          : patternInvalidation + entryPrice * (params.spreadBufferBps / 10000);
      }
    }
    // If patternInvalidation is on wrong side OR too far, fall through to ATR-based SL
  }

  // Fallback: ATR-based stop loss
  const atr = calcATR(candles, 14);
  const spreadBuf = entryPrice * (params.spreadBufferBps / 10000);
  if (direction === 'bullish') {
    return entryPrice - atr * params.atrSLMultiplier - spreadBuf;
  } else {
    return entryPrice + atr * params.atrSLMultiplier + spreadBuf;
  }
}

/**
 * Calculate Take Profit levels based on measured move / pattern target.
 * TP1 = 1:1 R:R (50% close), TP2 = 1:1.5 R:R (30% close), TP3 = 1:2 R:R or pattern target (20% close).
 */
function calculateTakeProfits(
  direction: 'bullish' | 'bearish',
  entryPrice: number,
  stopLoss: number,
  patternTarget: number | null,
  params: RiskParams,
): { takeProfits: number[]; partialCloses: PartialClose[] } {
  const risk = Math.abs(entryPrice - stopLoss);

  const tp1 = direction === 'bullish'
    ? entryPrice + risk * 1.0
    : entryPrice - risk * 1.0;

  const tp2 = direction === 'bullish'
    ? entryPrice + risk * 1.5
    : entryPrice - risk * 1.5;

  // TP3: use pattern target if available and it exceeds 2:1 R:R
  let tp3: number;
  if (patternTarget && patternTarget > 0) {
    const targetReward = direction === 'bullish'
      ? patternTarget - entryPrice
      : entryPrice - patternTarget;
    tp3 = targetReward >= risk * 2 ? patternTarget : (direction === 'bullish' ? entryPrice + risk * 2 : entryPrice - risk * 2);
  } else {
    tp3 = direction === 'bullish' ? entryPrice + risk * 2 : entryPrice - risk * 2;
  }

  // Subtract spread buffer from TPs (we need price to exceed TP by spread)
  const spreadBuf = entryPrice * (params.spreadBufferBps / 10000);
  const adjustedTPs = [
    Math.round((tp1 + (direction === 'bullish' ? -spreadBuf : spreadBuf)) * 100) / 100,
    Math.round((tp2 + (direction === 'bullish' ? -spreadBuf : spreadBuf)) * 100) / 100,
    Math.round((tp3 + (direction === 'bullish' ? -spreadBuf : spreadBuf)) * 100) / 100,
  ];

  // Partial close schedule
  const partialCloses: PartialClose[] = params.enablePartialCloses ? [
    { price: adjustedTPs[0], fraction: 0.5, executed: false },  // Close 50% at TP1
    { price: adjustedTPs[1], fraction: 0.3, executed: false },  // Close 30% at TP2
    // Remaining 20% runs to TP3 or trailing stop
  ] : [];

  return { takeProfits: adjustedTPs, partialCloses };
}

/**
 * Calculate Kelly fraction from trade history.
 * Kelly criterion: K = W - (1-W) / R
 *   where W = win rate, R = average win / average loss
 * Capped at 0.25 (quarter-Kelly) — professional standard to avoid over-betting.
 */
function calculateKellyFraction(): number {
  const history = Array.from(tradeHistory.values());
  const completed = history.filter(p => p.status === 'hit_tp1' || p.status === 'hit_tp2' || p.status === 'hit_tp3' || p.status === 'hit_sl');
  if (completed.length < 10) return 0; // Not enough data for reliable Kelly

  const wins = completed.filter(p => p.status !== 'hit_sl');
  const losses = completed.filter(p => p.status === 'hit_sl');

  // BUG-013 FIX: Don't bet 25% on lucky streaks.
  // Old code: if (losses.length === 0) return 0.25; — bets 25% of account after 10 lucky wins.
  // This is reckless — the true win rate is unknown with 0 losses.
  // New code: require at least 30 trades AND 5 losses before computing Kelly.
  // Without losses, the Kelly formula is undefined (division by zero in the odds ratio).
  // Return 0 (no Kelly boost) — fall back to fixed riskPerTrade.
  if (completed.length < 30 || losses.length < 5) return 0;

  const winRate = wins.length / completed.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + Math.abs(p.pnl.netPnL), 0) / wins.length : 0;
  const avgLoss = losses.reduce((s, p) => s + Math.abs(p.pnl.netPnL), 0) / losses.length;

  if (avgLoss === 0) return 0; // BUG-013: was 0.25 — now 0 (can't compute Kelly without avgLoss)

  const rawKelly = winRate - (1 - winRate) / (avgWin / avgLoss);
  const kellyFraction = Math.min(0.25, Math.max(0, rawKelly));

  return kellyFraction;
}

/**
 * Calculate position size based on risk parameters.
 * Uses Kelly-capped risk fraction when sufficient trade history exists.
 * positionSize = (accountBalance × effectiveRiskFraction) / |entry - stopLoss|
 */
function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  params: RiskParams,
): number {
  // Use Kelly-capped fraction if available, otherwise fall back to fixed riskPerTrade
  const kellyFraction = calculateKellyFraction();
  const effectiveRisk = kellyFraction > 0 ? kellyFraction : params.riskPerTrade;
  const riskAmount = params.accountBalance * effectiveRisk;
  const slDistance = Math.abs(entryPrice - stopLoss);

  if (slDistance === 0) return 0;

  let positionSize = riskAmount / slDistance;

  // Cap position size
  const maxPosition = (params.accountBalance * params.maxPositionFraction) / entryPrice;
  positionSize = Math.min(positionSize, maxPosition);

  return Math.round(positionSize * 10000) / 10000; // 4 decimal places
}

// ── Quality Score ───────────────────────────────────────────────────

/**
 * Calculate a composite quality score for a trade proposal.
 * Combines confluence, R:R, signal count, and MTF alignment.
 * Score range: 0-100
 */
function calculateQualityScore(opts: {
  confluenceScore: number;
  rrRatio: number;
  agreeingSignals: number;
  mtfConfluence?: { score: number; agreeingTFs: number };
  volRegime?: string;
}): number {
  let score = 0;

  // Confluence component (0-30 points)
  score += Math.min(30, opts.confluenceScore * 0.3);

  // R:R component (0-25 points)
  score += Math.min(25, opts.rrRatio * 10);

  // Signal count component (0-20 points)
  score += Math.min(20, opts.agreeingSignals * 5);

  // MTF confluence component (0-15 points)
  if (opts.mtfConfluence) {
    score += Math.min(15, opts.mtfConfluence.score * 0.15);
  }

  // Volatility bonus (0-10 points) — normal vol = best
  if (opts.volRegime === 'normal') score += 10;
  else if (opts.volRegime === 'low') score += 8;
  else if (opts.volRegime === 'high') score += 3;
  else if (opts.volRegime === 'extreme') score += 0;

  return Math.min(100, Math.round(score));
}

// ── Trailing Stop Calculation ───────────────────────────────────────

/**
 * Calculate trailing stop parameters.
 * Trail activates at trailActivationRR (default: 1.0 = TP1 level).
 * Trail distance = trailATRMultiplier × ATR from current price.
 */
function calculateTrailingStop(
  direction: 'bullish' | 'bearish',
  entryPrice: number,
  stopLoss: number,
  candles: CandleData[],
  params: RiskParams,
): { trailActivation: number; trailDistance: number } {
  const risk = Math.abs(entryPrice - stopLoss);
  const atr = calcATR(candles, 14);

  const trailActivation = direction === 'bullish'
    ? entryPrice + risk * params.trailActivationRR
    : entryPrice - risk * params.trailActivationRR;

  const trailDistance = atr * params.trailATRMultiplier;

  return {
    trailActivation: Math.round(trailActivation * 100) / 100,
    trailDistance: Math.round(trailDistance * 100) / 100,
  };
}

// ── Main Export: Generate Trade Proposal ─────────────────────────────

/**
 * Generate a trade proposal from confluence analysis results.
 *
 * @param opts - Analysis inputs for proposal generation
 * @returns TradeProposal if conditions met, null otherwise
 */
export function generateTradeProposal(opts: {
  candles: CandleData[];
  direction: 'bullish' | 'bearish' | 'neutral';
  confluenceScore: number;
  signals: TradeSignal[];
  patternInvalidation?: number;
  patternTarget?: number;
  patternSource?: string;
  currentPrice: number;
  timeframe: string;
  mtfConfluence?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    score: number;
    agreeingTFs: number;
  };
  volRegime?: string;
  /** Optional boost from revolutionary engines — has NO effect if not provided */
  revolutionaryBoost?: RevolutionaryBoost;
}): TradeProposal | null {
  const {
    candles, direction, confluenceScore, signals,
    patternInvalidation, patternTarget, patternSource,
    currentPrice, timeframe, mtfConfluence, volRegime,
    revolutionaryBoost,
  } = opts;

  const params = getRiskParams();

  // ── Gate 1: Minimum confluence ──
  // V262: Raised from 40 → 55. Higher threshold = fewer but better proposals.
  // Exception: single ultra-high-confidence signal (≥0.9) can bypass with 40%.
  const hasUltraHighConfidence = signals.some(s => s.confidence >= 0.9 && s.direction === direction);
  const effectiveMinConfluence = hasUltraHighConfidence
    ? Math.max(40, params.minConfluence - 15)  // Still need 40% even for ultra-high-confidence
    : params.minConfluence;
  if (confluenceScore < effectiveMinConfluence) return null;

  // ── Gate 2: Direction must be clear ──
  if (direction === 'neutral') return null;

  // ── Gate 3: Minimum agreeing signals ──
  // V262: Raised from 2 → 3. Need real consensus, not coincidence.
  // Exception: single signal with ≥0.9 confidence can trade with 1 supporting signal.
  const agreeingSignals = signals.filter(s => s.direction === direction);
  const effectiveMinSignals = hasUltraHighConfidence
    ? 2  // Ultra-high-confidence needs at least 1 other supporting signal
    : params.minAgreeingSignals;
  if (agreeingSignals.length < effectiveMinSignals) return null;

  // ── Gate 4: Daily loss limit ──
  if (checkDailyLossLimit(params)) return null;

  // ── Gate 5: Maximum concurrent trades ──
  if (!canTakeTrade(params)) return null;

  // ── Gate 6: MTF confluence (optional but strengthens) ──
  // If MTF is available and disagrees, require higher confluence
  if (mtfConfluence && mtfConfluence.direction !== direction && mtfConfluence.score > 60) {
    // MTF disagrees with our direction — need stronger local confluence
    if (confluenceScore < 55) return null; // Was 75 — too strict when MTF disagrees
  }

  // ── Calculate Entry, SL, TP ──
  const entryPrice = currentPrice;
  const stopLoss = calculateStopLoss(direction, entryPrice, patternInvalidation || null, candles, params);
  const { takeProfits, partialCloses } = calculateTakeProfits(direction, entryPrice, stopLoss, patternTarget || null, params);

  // ── Validate R:R ──
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfits[2] - entryPrice); // Use TP3 for R:R
  const rrRatio = risk > 0 ? reward / risk : 0;

  if (rrRatio < params.minRRRatio) return null;

  // ── Calculate Position Size ──
  const positionSize = calculatePositionSize(entryPrice, stopLoss, params);
  const riskAmount = positionSize * risk;
  const rewardAmount = positionSize * reward;

  // ── Confidence ──
  // V225 FIX: Fallback for missing confidence values — prevents NaN propagation
  const avgSignalConf = agreeingSignals.reduce((s, sig) => s + (sig.confidence ?? 0.5), 0) / agreeingSignals.length;
  let confidence = Math.min(0.95, avgSignalConf * (confluenceScore / 100) * 1.1);

  // Boost confidence if MTF agrees
  if (mtfConfluence && mtfConfluence.direction === direction && mtfConfluence.score > 50) {
    confidence = Math.min(0.95, confidence + mtfConfluence.score * 0.001);
  }

  // ── Revolutionary Engine Boosts ──
  // All boosts are GUARDED — they only apply if revolutionary data is provided.
  // If no revolutionaryBoost is passed, this entire block is skipped.

  let effectiveConfluenceScore = confluenceScore;
  let revBoostDescription = '';

  if (revolutionaryBoost) {
    // 1. Confluence Zone Boost: If price is near a strong active zone that
    //    agrees with our direction, boost confluenceScore by up to 15 points
    if (revolutionaryBoost.confluenceZoneBoost) {
      const czb = revolutionaryBoost.confluenceZoneBoost;
      if (czb.isActive && czb.direction === direction) {
        const zoneBoost = Math.min(15, Math.round(czb.score * 0.15));
        effectiveConfluenceScore = Math.min(100, effectiveConfluenceScore + zoneBoost);
        revBoostDescription += ` | منطقة تقارب ${czb.signalCount} إشارات (+${zoneBoost})`;
      }
    }

    // 2. Backtest Source Weights: Adjust signal confidence based on historical
    //    win rates. Sources with >60% win rate get a small boost, <40% get reduced.
    if (revolutionaryBoost.backtestSourceWeights) {
      for (const sig of agreeingSignals) {
        const w = revolutionaryBoost.backtestSourceWeights[sig.source];
        if (w && w.sampleSize >= 5) {
          if (w.winRate > 0.6) {
            sig.confidence = Math.min(0.95, sig.confidence * (1 + (w.winRate - 0.5) * 0.2));
          } else if (w.winRate < 0.4) {
            sig.confidence = Math.max(0.1, sig.confidence * (0.8 + w.winRate * 0.5));
          }
        }
      }
    }

    // 3. Correlation Boost: If a known high-performing combo exists that
    //    matches our signals, boost confidence proportionally
    if (revolutionaryBoost.correlationBoost) {
      const cb = revolutionaryBoost.correlationBoost;
      if (cb.lift > 1.1 && cb.combinedWinRate > 0.55) {
        const corrBoost = Math.min(0.08, (cb.lift - 1) * 0.05);
        confidence = Math.min(0.95, confidence + corrBoost);
        revBoostDescription += ` | تركيبة ${cb.partnerSource} (تحسن ${Math.round(cb.lift * 100 - 100)}%)`;
      }
    }

    // 4. Prediction Near Completion: If a pattern is near completion in our
    //    direction, add it as an extra agreeing signal (only if >= 70% complete)
    if (revolutionaryBoost.predictionNearCompletion) {
      const pred = revolutionaryBoost.predictionNearCompletion;
      if (pred.predictedDirection === direction && pred.completionPct >= 70 && pred.confidence >= 0.4) {
        agreeingSignals.push({
          source: `prediction:${pred.patternType}`,
          direction: pred.predictedDirection,
          confidence: pred.confidence * (pred.completionPct / 100),
          keyLevel: pred.targetPrice,
        });
        revBoostDescription += ` | نمط ${pred.patternType} ${pred.completionPct}% مكتمل`;
      }
    }

    // 5. Explanation Risk: If AI explanation rates this as HIGH risk,
    //    reduce confidence. If LOW risk, small boost.
    if (revolutionaryBoost.explanationRisk === 'high') {
      confidence = Math.max(0.1, confidence * 0.85);
      revBoostDescription += ' | ⚠️ مخاطر عالية';
    } else if (revolutionaryBoost.explanationRisk === 'low') {
      confidence = Math.min(0.95, confidence + 0.03);
    }

    // Recalculate avg signal confidence after weight adjustments
    const adjustedAvgConf = agreeingSignals.reduce((s, sig) => s + (sig.confidence ?? 0.5), 0) / agreeingSignals.length;
    confidence = Math.min(0.95, adjustedAvgConf * (effectiveConfluenceScore / 100) * 1.1);
  }

  // ── Quality Score ──
  const qualityScore = calculateQualityScore({
    confluenceScore,
    rrRatio,
    agreeingSignals: agreeingSignals.length,
    mtfConfluence,
    volRegime,
  });

  // ── Trailing Stop ──
  const { trailActivation, trailDistance } = params.enableTrailingStop
    ? calculateTrailingStop(direction, entryPrice, stopLoss, candles, params)
    : { trailActivation: 0, trailDistance: 0 };

  // ── Spread Buffer ──
  const spreadBuffer = Math.round(entryPrice * (params.spreadBufferBps / 10000) * 100) / 100;

  // ── Arabic Description ──
  const dirAr = direction === 'bullish' ? 'شراء' : 'بيع';
  const signalNames = agreeingSignals.map(s => s.source).join(' + ');
  let descriptionAr = `اقتراح ${dirAr}: تقارب ${agreeingSignals.length} إشارات (${signalNames}) | R:R = 1:${rrRatio.toFixed(1)} | ثقة ${Math.round(confidence * 100)}% | جودة ${qualityScore}`;

  if (mtfConfluence && mtfConfluence.direction === direction) {
    descriptionAr += ` | MTF: ${mtfConfluence.agreeingTFs} فريمات`;
  }

  // Append revolutionary boost description if any
  if (revBoostDescription) {
    descriptionAr += revBoostDescription;
  }

  const proposal: TradeProposal = {
    id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    direction,
    entryPrice: Math.round(entryPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    takeProfits,
    positionSize,
    riskAmount: Math.round(riskAmount * 100) / 100,
    rewardAmount: Math.round(rewardAmount * 100) / 100,
    rrRatio: Math.round(rrRatio * 100) / 100,
    confluenceScore: effectiveConfluenceScore,
    agreeingSignals,
    patternSource: patternSource || 'confluence',
    confidence,
    status: 'pending',
    proposedAt: Date.now(),
    descriptionAr,
    timeframe,
    spreadBuffer,
    trailActivation,
    trailDistance,
    currentTrailSL: null,
    qualityScore,
    partialCloses,
    mtfConfluence: mtfConfluence ? {
      direction: mtfConfluence.direction,
      score: mtfConfluence.score,
      agreeingTFs: mtfConfluence.agreeingTFs,
    } : undefined,
    pnl: { realized: 0, unrealized: 0, fees: 0, netPnL: 0 },
  };

  // Store proposal
  proposals.set(proposal.id, proposal);
  if (proposals.size > MAX_PROPOSALS) {
    const oldest = Array.from(proposals.keys())[0];
    if (oldest) proposals.delete(oldest);
  }

  return proposal;
}

// ── Proposal Management ─────────────────────────────────────────────

/** Get all proposals */
export function getTradeProposals(): TradeProposal[] {
  return Array.from(proposals.values()).sort((a, b) => b.proposedAt - a.proposedAt);
}

/** Get active proposals only */
export function getActiveProposals(): TradeProposal[] {
  return Array.from(proposals.values()).filter(p => p.status === 'pending' || p.status === 'active' || p.status === 'breakeven');
}

/** Get trade history (completed trades) */
export function getTradeHistory(): TradeProposal[] {
  return Array.from(tradeHistory.values()).sort((a, b) => b.proposedAt - a.proposedAt);
}

/** Update proposal status */
export function updateProposalStatus(id: string, status: TradeProposal['status']): void {
  const proposal = proposals.get(id);
  if (proposal) {
    proposal.status = status;
    proposals.set(id, proposal);

    // Move completed trades to history
    if (status === 'hit_tp3' || status === 'hit_sl' || status === 'expired' || status === 'closed') {
      tradeHistory.set(id, { ...proposal });
      if (tradeHistory.size > MAX_HISTORY) {
        const oldestKey = Array.from(tradeHistory.keys())[0];
        if (oldestKey) tradeHistory.delete(oldestKey);
      }
    }
  }
}

/**
 * Auto-evaluate pending proposals against current price.
 * Handles TP hits, SL hits, breakeven moves, trailing stops, and partial closes.
 */
export function autoEvaluateProposals(currentPrice: number, candles?: CandleData[]): TradeProposal[] {
  const updated: TradeProposal[] = [];
  const params = getRiskParams();
  const atr = candles ? calcATR(candles, 14) : 0;

  for (const proposal of proposals.values()) {
    if (proposal.status !== 'pending' && proposal.status !== 'active' && proposal.status !== 'breakeven') continue;

    let newStatus: TradeProposal['status'] | null = null;
    let pnlChange = 0;

    // ── Check Stop Loss hit ──
    const effectiveSL = proposal.currentTrailSL ?? proposal.stopLoss;

    if (proposal.direction === 'bullish') {
      if (currentPrice <= effectiveSL) {
        // FIX: Classify trailing stop hits as 'trail_sl' instead of 'breakeven'.
        // A trailing stop can be hit at any price level — if the trail followed
        // price up and then reversed, the exit could be in profit, not breakeven.
        // 'breakeven' is reserved for the TP1 move-SL-to-entry behavior.
        newStatus = proposal.currentTrailSL ? 'trail_sl' : 'hit_sl';
        // Calculate P&L for SL hit
        const slDistance = Math.abs(proposal.entryPrice - effectiveSL);
        pnlChange = -proposal.positionSize * slDistance;
      }
    } else {
      if (currentPrice >= effectiveSL) {
        newStatus = proposal.currentTrailSL ? 'trail_sl' : 'hit_sl';
        const slDistance = Math.abs(proposal.entryPrice - effectiveSL);
        pnlChange = -proposal.positionSize * slDistance;
      }
    }

    // ── Check Take Profit hits ──
    if (!newStatus) {
      if (proposal.direction === 'bullish') {
        if (currentPrice >= proposal.takeProfits[2] && (proposal.status as string) !== 'hit_tp3') {
          newStatus = 'hit_tp3';
          // BUG-012 FIX: TP3 closes the REMAINING position (20%), not 100%.
          // TP1 closed 50%, TP2 closed 30%, so only 20% remains at TP3.
          // Old code: pnlChange = positionSize * |TP3 - entry| (100% — 5× overstated).
          // New code: compute remaining fraction from executed partial closes.
          const remainingFraction = 1 - proposal.partialCloses
            .filter(pc => pc.executed)
            .reduce((sum, pc) => sum + pc.fraction, 0);
          pnlChange = proposal.positionSize * remainingFraction * Math.abs(proposal.takeProfits[2] - proposal.entryPrice);
        } else if (currentPrice >= proposal.takeProfits[1] && (proposal.status as string) !== 'hit_tp2') {
          newStatus = 'hit_tp2';
          // Partial close P&L
          if (proposal.partialCloses.length > 0 && !proposal.partialCloses[1].executed) {
            proposal.partialCloses[1].executed = true;
            pnlChange = proposal.positionSize * 0.3 * Math.abs(proposal.takeProfits[1] - proposal.entryPrice);
          }
        } else if (currentPrice >= proposal.takeProfits[0] && proposal.status === 'pending') {
          newStatus = 'hit_tp1';
          // First partial close
          if (proposal.partialCloses.length > 0 && !proposal.partialCloses[0].executed) {
            proposal.partialCloses[0].executed = true;
            pnlChange = proposal.positionSize * 0.5 * Math.abs(proposal.takeProfits[0] - proposal.entryPrice);
          }

          // ── Move SL to breakeven after TP1 ──
          if (params.enableBreakeven) {
            proposal.stopLoss = proposal.entryPrice;
            proposal.status = 'breakeven';
            newStatus = null; // Don't close yet — trail from breakeven
          }
        }
      } else {
        if (currentPrice <= proposal.takeProfits[2] && (proposal.status as string) !== 'hit_tp3') {
          newStatus = 'hit_tp3';
          // BUG-012 FIX: TP3 closes the REMAINING position (20%), not 100%.
          const remainingFraction = 1 - proposal.partialCloses
            .filter(pc => pc.executed)
            .reduce((sum, pc) => sum + pc.fraction, 0);
          pnlChange = proposal.positionSize * remainingFraction * Math.abs(proposal.takeProfits[2] - proposal.entryPrice);
        } else if (currentPrice <= proposal.takeProfits[1] && (proposal.status as string) !== 'hit_tp2') {
          newStatus = 'hit_tp2';
          if (proposal.partialCloses.length > 0 && !proposal.partialCloses[1].executed) {
            proposal.partialCloses[1].executed = true;
            pnlChange = proposal.positionSize * 0.3 * Math.abs(proposal.takeProfits[1] - proposal.entryPrice);
          }
        } else if (currentPrice <= proposal.takeProfits[0] && proposal.status === 'pending') {
          newStatus = 'hit_tp1';
          if (proposal.partialCloses.length > 0 && !proposal.partialCloses[0].executed) {
            proposal.partialCloses[0].executed = true;
            pnlChange = proposal.positionSize * 0.5 * Math.abs(proposal.takeProfits[0] - proposal.entryPrice);
          }
          if (params.enableBreakeven) {
            proposal.stopLoss = proposal.entryPrice;
            proposal.status = 'breakeven';
            newStatus = null;
          }
        }
      }
    }

    // ── Smart Trailing Stop Update (V262) ──
    // Enhanced trailing that:
    // 1. Uses adaptive ATR (tighter in low-vol, wider in high-vol)
    // 2. Locks in profit progressively (tighter as price moves in our favor)
    // 3. Only moves trail when price moves enough (step-based, not every tick)
    if (!newStatus && params.enableTrailingStop && atr > 0) {
      const hasHitTP1 = proposal.status === 'breakeven' || (proposal.status as string) === 'hit_tp1' || (proposal.status as string) === 'hit_tp2';

      if (hasHitTP1) {
        // ── Adaptive ATR multiplier ──
        // The further price moves in our favor, the tighter the trail becomes.
        // At TP1: trailDistance = 1.5 × ATR (default, room to breathe)
        // At TP2: trailDistance = 1.0 × ATR (tighter, protecting more profit)
        // Beyond TP2: trailDistance = 0.7 × ATR (very tight, locking profit)
        const profitDistance = proposal.direction === 'bullish'
          ? currentPrice - proposal.entryPrice
          : proposal.entryPrice - currentPrice;
        const risk = Math.abs(proposal.entryPrice - proposal.stopLoss);
        const profitInR = risk > 0 ? profitDistance / risk : 0;

        let adaptiveATRMultiplier: number;
        if (profitInR >= 2.0) {
          // Beyond TP2 — very tight trail
          adaptiveATRMultiplier = 0.7;
        } else if (profitInR >= 1.5) {
          // At TP2 level — tighter trail
          adaptiveATRMultiplier = 1.0;
        } else if (profitInR >= 1.0) {
          // At TP1 level — normal trail
          adaptiveATRMultiplier = params.trailATRMultiplier;
        } else {
          // Not yet at TP1 — don't trail yet (breakeven handles this)
          adaptiveATRMultiplier = params.trailATRMultiplier;
        }

        const trailDist = atr * adaptiveATRMultiplier;

        // ── Step-based trailing ──
        // Only move trail if new position is at least 0.2 × ATR better
        // This prevents tiny movements from constantly shifting the trail
        const minStepSize = atr * 0.2;

        if (proposal.direction === 'bullish') {
          const newTrailSL = currentPrice - trailDist;
          if (!proposal.currentTrailSL) {
            // First trail activation
            proposal.currentTrailSL = Math.round(newTrailSL * 100) / 100;
          } else if (newTrailSL > proposal.currentTrailSL + minStepSize) {
            // Only move if improvement exceeds minimum step
            proposal.currentTrailSL = Math.round(newTrailSL * 100) / 100;
          }
        } else {
          const newTrailSL = currentPrice + trailDist;
          if (!proposal.currentTrailSL) {
            proposal.currentTrailSL = Math.round(newTrailSL * 100) / 100;
          } else if (newTrailSL < proposal.currentTrailSL - minStepSize) {
            proposal.currentTrailSL = Math.round(newTrailSL * 100) / 100;
          }
        }
      }
    }

    // ── Update P&L ──
    proposal.pnl.unrealized = proposal.direction === 'bullish'
      ? (currentPrice - proposal.entryPrice) * proposal.positionSize
      : (proposal.entryPrice - currentPrice) * proposal.positionSize;

    if (pnlChange !== 0) {
      proposal.pnl.realized += pnlChange;
      proposal.pnl.fees += proposal.positionSize * proposal.entryPrice * 0.001; // 0.1% fee estimate
      proposal.pnl.netPnL = proposal.pnl.realized - proposal.pnl.fees;
      recordTradeResult(pnlChange);
    }

    // ── Apply status change ──
    if (newStatus) {
      proposal.status = newStatus;
      // Move completed trades to history
      // V262: trail_sl is also a completed trade — it's the smart exit
      if (newStatus === 'hit_tp3' || newStatus === 'hit_sl' || newStatus === 'trail_sl') {
        // For trail_sl: calculate P&L based on trail stop level vs entry
        if (newStatus === 'trail_sl' && proposal.currentTrailSL) {
          const trailPnL = proposal.direction === 'bullish'
            ? (proposal.currentTrailSL - proposal.entryPrice) * proposal.positionSize
            : (proposal.entryPrice - proposal.currentTrailSL) * proposal.positionSize;
          proposal.pnl.realized += trailPnL;
          proposal.pnl.fees += proposal.positionSize * proposal.entryPrice * 0.001;
          proposal.pnl.netPnL = proposal.pnl.realized - proposal.pnl.fees;
        }
        tradeHistory.set(proposal.id, { ...proposal });
      }
    }

    // ── Expire old proposals ──
    if (Date.now() - proposal.proposedAt > 86400000 && proposal.status === 'pending') {
      proposal.status = 'expired';
      tradeHistory.set(proposal.id, { ...proposal });
    }

    proposals.set(proposal.id, proposal);
    updated.push(proposal);
  }

  return updated;
}

/** Clear all proposals */
export function clearProposals(): void {
  proposals.clear();
}

/** Get proposal statistics */
export function getProposalStats(): {
  total: number;
  pending: number;
  active: number;
  hitTP1: number;
  hitTP2: number;
  hitTP3: number;
  hitSL: number;
  breakeven: number;
  expired: number;
  winRate: number;
  avgRR: number;
  totalPnL: number;
  avgQualityScore: number;
  dailyPnL: number;
  dailyTrades: number;
} {
  const all = Array.from(proposals.values());
  const history = Array.from(tradeHistory.values());
  const completed = history.filter(p => p.status === 'hit_tp1' || p.status === 'hit_tp2' || p.status === 'hit_tp3' || p.status === 'hit_sl' || p.status === 'trail_sl');
  // V262: trail_sl counts as a WIN if it exited in profit (trailSL better than entry)
  const wins = history.filter(p => p.status === 'hit_tp1' || p.status === 'hit_tp2' || p.status === 'hit_tp3'
    || (p.status === 'trail_sl' && p.pnl.netPnL > 0));

  const totalPnL = history.reduce((s, p) => s + p.pnl.netPnL, 0);
  const avgQuality = completed.length > 0
    ? completed.reduce((s, p) => s + p.qualityScore, 0) / completed.length
    : 0;

  return {
    total: all.length + history.length,
    pending: all.filter(p => p.status === 'pending').length,
    active: all.filter(p => p.status === 'active' || p.status === 'breakeven').length,
    hitTP1: history.filter(p => p.status === 'hit_tp1').length,
    hitTP2: history.filter(p => p.status === 'hit_tp2').length,
    hitTP3: history.filter(p => p.status === 'hit_tp3').length,
    hitSL: history.filter(p => p.status === 'hit_sl').length,
    breakeven: all.filter(p => p.status === 'breakeven').length,
    expired: history.filter(p => p.status === 'expired').length,
    winRate: completed.length > 0 ? wins.length / completed.length : 0,
    avgRR: completed.length > 0 ? completed.reduce((s, p) => s + (Number.isFinite(p.rrRatio) ? p.rrRatio : 0), 0) / completed.length : 0,
    totalPnL,
    avgQualityScore: Math.round(avgQuality),
    dailyPnL,
    dailyTrades,
  };
}

/** Get daily stats history */
export function getDailyStats(): DailyStats[] {
  return dailyStatsHistory;
}

/** Check if trading is allowed (daily limit not reached) */
export function isTradingAllowed(): boolean {
  const params = getRiskParams();
  return !checkDailyLossLimit(params) && canTakeTrade(params);
}
