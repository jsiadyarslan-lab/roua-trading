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

/** Pairs that the Strategic Council MUST review in every session
 *
 *  V131 FIX: Split pairs into EXCHANGE-SUPPORTED and ANALYSIS-ONLY categories.
 *
 *  PROBLEM: All 3 users trade on Binance (binance_test), which ONLY supports
 *  crypto pairs. The old code generated briefs for AAPL, GBP/USD, etc. —
 *  these would pass the council, pass the executor, and then FAIL at the
 *  exchange with "binance does not have market symbol AAPL". This wasted
 *  AI API calls, Redis idempotency locks, and executor ticks.
 *
 *  FIX: Only EXCHANGE_SUPPORTED pairs get briefs that are eligible for
 *  execution. ANALYSIS_ONLY pairs are used for market context but their
 *  briefs are marked as non-executable.
 *
 *  For Binance: Only crypto pairs (BTC/USDT, ETH/USDT, etc.)
 *  For future multi-exchange: Filter per-user based on their exchange
 */
export const COUNCIL_PAIRS = {
  CRYPTO: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT'],
  FOREX: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
  STOCKS: ['AAPL', 'MSFT', 'GOOGL', 'TSLA'],
  COMMODITIES: ['XAU/USD'],
} as const;

/** Pairs supported by Binance (the exchange used by all current users).
 *  Only these pairs will generate EXECUTABLE briefs.
 *  Other pairs generate advisory-only briefs (market context). */
export const BINANCE_SUPPORTED_PAIRS: string[] = [
  ...COUNCIL_PAIRS.CRYPTO,
];

/** Pairs NOT supported by Binance — analysis only, no execution.
 *  These can be used for market sentiment but orders will always fail. */
export const NON_BINANCE_PAIRS: string[] = [
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.STOCKS,
  ...COUNCIL_PAIRS.COMMODITIES,
];

/** All pairs flattened (for backward compat and market scanning) */
export const ALL_COUNCIL_PAIRS: string[] = [
  ...COUNCIL_PAIRS.CRYPTO,
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.STOCKS,
  ...COUNCIL_PAIRS.COMMODITIES,
];

/** Check if a symbol is supported by the given exchange.
 *  Currently all users use Binance, so we check against BINANCE_SUPPORTED_PAIRS.
 *  Returns true if the symbol can be executed on the exchange. */
export function isSymbolSupportedByExchange(symbol: string, exchange: string): boolean {
  const exchangeId = exchange.toLowerCase().replace('_test', '').replace('-test', '');
  switch (exchangeId) {
    case 'binance':
      return BINANCE_SUPPORTED_PAIRS.includes(symbol);
    default:
      // For unknown exchanges, only allow crypto pairs (safe default)
      return BINANCE_SUPPORTED_PAIRS.includes(symbol);
  }
}

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

/** Risk/reward ratios per timeframe — V177: Redesigned R:R by timeframe category.
 *
 *  V177 FIX #13: Old flat 1:2 ratio (V134) didn't account for different
 *  volatility profiles across timeframe categories:
 *    - Scalping (M1, M5): 1:2.5 — tighter stops, better reward needed
 *    - Intraday (M15, M30): 1:3 — more room for price movement
 *    - Swing (H1, H4): 1:3 — swing needs room to breathe
 *    - Position (D1, W1): 1:2.5 — wider stops, still good reward
 *
 *  V134 FIX (preserved): The old M1 SL of 0.1% was IMMEDIATELY triggered
 *  by normal crypto volatility. Minimums M1=0.5% survive noise.
 */
export const TIMEFRAME_RR: Record<BriefTimeframe, { sl: number; tp: number; maxSlippage: number }> = {
  M1: { sl: 0.005, tp: 0.0125, maxSlippage: 0.002 },   // V177: 1:2.5 — Scalping: tighter stops, better reward
  M5: { sl: 0.008, tp: 0.020, maxSlippage: 0.003 },    // V177: 1:2.5 — Scalping
  M15: { sl: 0.010, tp: 0.030, maxSlippage: 0.004 },   // V177: 1:3 — Intraday: more room
  M30: { sl: 0.012, tp: 0.036, maxSlippage: 0.005 },   // V177: 1:3 — Intraday
  H1: { sl: 0.015, tp: 0.045, maxSlippage: 0.005 },    // V177: 1:3 — Swing: needs room
  H4: { sl: 0.02, tp: 0.060, maxSlippage: 0.005 },     // V177: 1:3 — Swing
  D1: { sl: 0.03, tp: 0.075, maxSlippage: 0.008 },     // V177: 1:2.5 — Position: wider stops
  W1: { sl: 0.05, tp: 0.125, maxSlippage: 0.010 },     // V177: 1:2.5 — Position
};

/** V177 FIX #13: Minimum risk/reward ratio enforced by RiskGatekeeper.
 *  Any trade with R:R < 1.5:1 is rejected — ensures positive expected value. */
export const MIN_RISK_REWARD_RATIO = 1.5;

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
export const MIN_BRIEF_CONFIDENCE = 50; // V175: رُفع من 40 إلى 50

/** Minimum consensus score to issue a brief — lowered from 60 to 50 to 40
 *  With 8 AI models, votes are often split. 60% was too strict and
 *  caused most consensus results to be rejected, producing zero Briefs.
 *  40% = allows even weak directional consensus to produce briefs.
 *  Risk management (SL/TP) handles downside protection.
 */
export const MIN_CONSENSUS_SCORE = 55; // V175: رُفع من 40 إلى 55 — إشارات أقل لكن جودة أعلى

export const AGENT_FAST_TIMEFRAMES: BriefTimeframe[] = ['M30', 'H1'];
export const AGENT_SLOW_TIMEFRAMES: BriefTimeframe[] = ['H4', 'D1', 'W1'];
