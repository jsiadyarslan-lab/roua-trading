// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BriefTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';
export type BriefDirection = 'BUY' | 'SELL';
export type BriefReviewStatus = 'ACTIVE' | 'MODIFIED' | 'CANCELLED' | 'EXECUTED';

export interface StrictRules {
  maxEntryPrice?: number;
  minEntryPrice?: number;
  maxSlippage: number; // default 0.1%
}

export interface TradingBriefDTO {
  id: string;
  userId?: string | null;
  pair: string;
  direction: BriefDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number; // 0-100
  timeframe: BriefTimeframe;
  issuedAt: Date;
  expiresAt: Date;
  isActive: boolean;
  strictRules: StrictRules;
  lastReviewedAt: Date;
  reviewStatus: BriefReviewStatus;
  analysisSummary?: string;
}

export interface CouncilSessionResult {
  timestamp: string;
  pairsAnalyzed: number;
  briefsIssued: number;
  briefsModified: number;
  briefsCancelled: number;
  briefsExecuted: number;
  durationMs: number;
  /** Diagnostic log entries for debugging why briefs aren't created */
  diagnostics?: string[];
}

/** Pairs that the Strategic Council MUST review in every session */
export const COUNCIL_PAIRS = {
  CRYPTO: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT'],
  FOREX: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  STOCKS: ['AAPL', 'MSFT', 'GOOGL', 'TSLA'],
  COMMODITIES: ['XAU/USD'],
} as const;

/** All pairs flattened */
export const ALL_COUNCIL_PAIRS: string[] = [
  ...COUNCIL_PAIRS.CRYPTO,
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.STOCKS,
  ...COUNCIL_PAIRS.COMMODITIES,
];

/** Timeframes the Council covers (Focused on rapid scalping/intraday + swing/position) */
export const COUNCIL_TIMEFRAMES: BriefTimeframe[] = ['M1', 'M5', 'M15'];

/** Expiry durations per timeframe (in milliseconds) */
export const TIMEFRAME_EXPIRY_MS: Record<BriefTimeframe, number> = {
  M1: 1 * 60 * 1000,                // 1 minute
  M5: 5 * 60 * 1000,                // 5 minutes
  M15: 15 * 60 * 1000,              // 15 minutes
  M30: 30 * 60 * 1000,              // 30 minutes
  H1: 1 * 60 * 60 * 1000,           // 1 hour
  H4: 4 * 60 * 60 * 1000,           // 4 hours
  D1: 24 * 60 * 60 * 1000,          // 1 day
  W1: 7 * 24 * 60 * 60 * 1000,      // 1 week
};

/** Risk/reward ratios per timeframe — FIX: Increased maxSlippage for crypto
 *  The old 0.1% slippage was too tight for crypto. BTC can move 0.1-0.3% in
 *  seconds, so briefs were constantly being skipped by the executor because
 *  the price had already moved past the entry price + 0.1% tolerance.
 */
export const TIMEFRAME_RR: Record<BriefTimeframe, { sl: number; tp: number; maxSlippage: number }> = {
  M1: { sl: 0.001, tp: 0.002, maxSlippage: 0.0005 },    // 0.1% SL, 0.2% TP, 0.05% slippage
  M5: { sl: 0.002, tp: 0.004, maxSlippage: 0.001 },     // 0.2% SL, 0.4% TP, 0.1% slippage
  M15: { sl: 0.003, tp: 0.006, maxSlippage: 0.002 },     // 0.3% SL, 0.6% TP, 0.2% slippage
  M30: { sl: 0.004, tp: 0.008, maxSlippage: 0.003 },     // 0.4% SL, 0.8% TP, 0.3% slippage
  H1: { sl: 0.005, tp: 0.01, maxSlippage: 0.005 },     // 0.5% SL, 1% TP, 0.5% slippage
  H4: { sl: 0.01, tp: 0.02, maxSlippage: 0.005 },       // 1% SL, 2% TP, 0.5% slippage
  D1: { sl: 0.02, tp: 0.04, maxSlippage: 0.008 },       // 2% SL, 4% TP, 0.8% slippage
  W1: { sl: 0.04, tp: 0.08, maxSlippage: 0.010 },       // 4% SL, 8% TP, 1.0% slippage
};

/** Timeframe classification: Smart Executor vs Agent
 *  Smart Executor: M1, M5, M15 (quick/scalping trades)
 *  Agent: M30, H1, H4, D1, W1 (short/medium/long-term trades)
 */
export const EXECUTOR_TIMEFRAMES: BriefTimeframe[] = ['M1', 'M5', 'M15'];
export const AGENT_TIMEFRAMES: BriefTimeframe[] = ['M30', 'H1', 'H4', 'D1', 'W1'];

export function isExecutorTimeframe(tf: BriefTimeframe): boolean {
  return EXECUTOR_TIMEFRAMES.includes(tf);
}

export function isAgentTimeframe(tf: BriefTimeframe): boolean {
  return AGENT_TIMEFRAMES.includes(tf);
}

/** Minimum confidence score to issue a brief — lowered from 50 to 40
 *  With only 3-5/8 AI models working, most briefs come from technical
 *  analysis fallback which produces confidence=45-48. The old threshold
 *  of 50 rejected ALL technical fallback briefs, causing 0 trades.
 *  A 40% confidence brief with proper SL/TP is safer than no brief.
 */
export const MIN_BRIEF_CONFIDENCE = 40;

/** Minimum consensus score to issue a brief — lowered from 60 to 50 to 40
 *  With 8 AI models, votes are often split. 60% was too strict and
 *  caused most consensus results to be rejected, producing zero Briefs.
 *  40% = allows even weak directional consensus to produce briefs.
 *  Risk management (SL/TP) handles downside protection.
 */
export const MIN_CONSENSUS_SCORE = 40;

export const AGENT_FAST_TIMEFRAMES: BriefTimeframe[] = ['M30', 'H1'];
export const AGENT_SLOW_TIMEFRAMES: BriefTimeframe[] = ['H4', 'D1', 'W1'];
