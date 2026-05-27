// ═══════════════════════════════════════════════════════════════════════
// ROUA Auto-Trade Engine — Phase 3
//
// When the system detects high confluence (3+ agreeing signals),
// it automatically proposes a trade with Entry/SL/TP/Position Size.
//
// Risk management:
// - Default risk: 1-2% of account balance per trade
// - SL at pattern invalidation level (not random ATR)
// - TP at pattern target (measured move = price from D to C)
// - Risk/Reward ratio must be ≥ 1:2
// - Position size calculated from risk % and SL distance
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
  /** Reward amount in quote currency */
  rewardAmount: number;
  /** Risk/Reward ratio */
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
  status: 'pending' | 'active' | 'hit_tp' | 'hit_sl' | 'expired';
  /** Timestamp when proposed */
  proposedAt: number;
  /** Arabic description */
  descriptionAr: string;
  /** Timeframe */
  timeframe: string;
}

/** A signal contributing to a trade proposal */
export interface TradeSignal {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  keyLevel: number;
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
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_RISK: RiskParams = {
  riskPerTrade: 0.01,       // 1% risk per trade
  accountBalance: 10000,    // $10,000 default
  minRRRatio: 2.0,          // Minimum 1:2 R:R
  maxPositionFraction: 0.1, // Max 10% of account in one position
  minConfluence: 60,        // Minimum 60% confluence score
  minAgreeingSignals: 3,    // Minimum 3 agreeing signals
  maxSLPct: 0.03,           // Max 3% SL distance
  atrSLMultiplier: 2.0,     // 2x ATR for SL fallback
};

// ── In-memory State ─────────────────────────────────────────────────

const proposals = new Map<string, TradeProposal>();
const MAX_PROPOSALS = 50;
const RISK_PARAMS_KEY = 'roua-risk-params';

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

// ── SL/TP Calculation ───────────────────────────────────────────────

/**
 * Calculate Stop Loss price based on pattern invalidation level.
 * Falls back to ATR-based SL if no pattern level available.
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
    const slDistance = Math.abs(entryPrice - patternInvalidation);
    const slPct = slDistance / entryPrice;

    // Don't use pattern SL if it's too far
    if (slPct <= params.maxSLPct) {
      return patternInvalidation;
    }
  }

  // Fallback: ATR-based stop loss
  const atr = calcATR(candles, 14);
  if (direction === 'bullish') {
    return entryPrice - atr * params.atrSLMultiplier;
  } else {
    return entryPrice + atr * params.atrSLMultiplier;
  }
}

/**
 * Calculate Take Profit levels based on measured move / pattern target.
 * TP1 = 1:1 R:R, TP2 = 1:1.5 R:R, TP3 = 1:2 R:R or pattern target.
 */
function calculateTakeProfits(
  direction: 'bullish' | 'bearish',
  entryPrice: number,
  stopLoss: number,
  patternTarget: number | null,
): number[] {
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

  return [Math.round(tp1 * 100) / 100, Math.round(tp2 * 100) / 100, Math.round(tp3 * 100) / 100];
}

/**
 * Calculate position size based on risk parameters.
 * positionSize = (accountBalance × riskPerTrade) / |entry - stopLoss|
 */
function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  params: RiskParams,
): number {
  const riskAmount = params.accountBalance * params.riskPerTrade;
  const slDistance = Math.abs(entryPrice - stopLoss);

  if (slDistance === 0) return 0;

  let positionSize = riskAmount / slDistance;

  // Cap position size
  const maxPosition = (params.accountBalance * params.maxPositionFraction) / entryPrice;
  positionSize = Math.min(positionSize, maxPosition);

  return Math.round(positionSize * 10000) / 10000; // 4 decimal places
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
}): TradeProposal | null {
  const {
    candles, direction, confluenceScore, signals,
    patternInvalidation, patternTarget, patternSource,
    currentPrice, timeframe,
  } = opts;

  const params = getRiskParams();

  // ── Gate 1: Minimum confluence ──
  if (confluenceScore < params.minConfluence) return null;

  // ── Gate 2: Direction must be clear ──
  if (direction === 'neutral') return null;

  // ── Gate 3: Minimum agreeing signals ──
  const agreeingSignals = signals.filter(s => s.direction === direction);
  if (agreeingSignals.length < params.minAgreeingSignals) return null;

  // ── Calculate Entry, SL, TP ──
  const entryPrice = currentPrice;
  const stopLoss = calculateStopLoss(direction, entryPrice, patternInvalidation || null, candles, params);
  const takeProfits = calculateTakeProfits(direction, entryPrice, stopLoss, patternTarget || null);

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
  const avgSignalConf = agreeingSignals.reduce((s, sig) => s + sig.confidence, 0) / agreeingSignals.length;
  const confidence = Math.min(0.95, avgSignalConf * (confluenceScore / 100) * 1.1);

  // ── Arabic Description ──
  const dirAr = direction === 'bullish' ? 'شراء' : 'بيع';
  const signalNames = agreeingSignals.map(s => s.source).join(' + ');
  const descriptionAr = `اقتراح ${dirAr}: تقارب ${agreeingSignals.length} إشارات (${signalNames}) | R:R = 1:${rrRatio.toFixed(1)} | ثقة ${Math.round(confidence * 100)}%`;

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
    confluenceScore,
    agreeingSignals,
    patternSource: patternSource || 'confluence',
    confidence,
    status: 'pending',
    proposedAt: Date.now(),
    descriptionAr,
    timeframe,
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
  return Array.from(proposals.values()).filter(p => p.status === 'pending' || p.status === 'active');
}

/** Update proposal status */
export function updateProposalStatus(id: string, status: TradeProposal['status']): void {
  const proposal = proposals.get(id);
  if (proposal) {
    proposal.status = status;
    proposals.set(id, proposal);
  }
}

/**
 * Auto-evaluate pending proposals against current price.
 * Updates status to hit_tp or hit_sl if price reached those levels.
 */
export function autoEvaluateProposals(currentPrice: number): TradeProposal[] {
  const updated: TradeProposal[] = [];

  for (const proposal of proposals.values()) {
    if (proposal.status !== 'pending' && proposal.status !== 'active') continue;

    let newStatus: TradeProposal['status'] | null = null;

    if (proposal.direction === 'bullish') {
      if (currentPrice >= proposal.takeProfits[2]) {
        newStatus = 'hit_tp';
      } else if (currentPrice <= proposal.stopLoss) {
        newStatus = 'hit_sl';
      }
    } else {
      if (currentPrice <= proposal.takeProfits[2]) {
        newStatus = 'hit_tp';
      } else if (currentPrice >= proposal.stopLoss) {
        newStatus = 'hit_sl';
      }
    }

    if (newStatus) {
      proposal.status = newStatus;
      proposals.set(proposal.id, proposal);
      updated.push(proposal);
    }

    // Expire proposals older than 24 hours
    if (Date.now() - proposal.proposedAt > 86400000 && proposal.status === 'pending') {
      proposal.status = 'expired';
      proposals.set(proposal.id, proposal);
      updated.push(proposal);
    }
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
  hitTP: number;
  hitSL: number;
  expired: number;
  winRate: number;
  avgRR: number;
} {
  const all = Array.from(proposals.values());
  const completed = all.filter(p => p.status === 'hit_tp' || p.status === 'hit_sl');
  const wins = all.filter(p => p.status === 'hit_tp');

  return {
    total: all.length,
    pending: all.filter(p => p.status === 'pending' || p.status === 'active').length,
    hitTP: wins.length,
    hitSL: all.filter(p => p.status === 'hit_sl').length,
    expired: all.filter(p => p.status === 'expired').length,
    winRate: completed.length > 0 ? wins.length / completed.length : 0,
    avgRR: completed.length > 0 ? completed.reduce((s, p) => s + p.rrRatio, 0) / completed.length : 0,
  };
}
