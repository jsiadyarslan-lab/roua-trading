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
  // V292: Outcome data — populated from TradeJournal (linked by briefId).
  // These fields are undefined for briefs that were never executed, and
  // populated only after the corresponding position is closed.
  outcomePips?: number;       // Signed P&L in price units (e.g., +0.0234 or -125.50)
  outcomePct?: number;        // Signed P&L as % of entry price
  closedAt?: Date;            // When the executed position was closed
  durationMs?: number;        // How long the position was held
  result?: 'WIN' | 'LOSS' | 'BREAKEVEN';  // Classified result
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
  // V432: All 12 backend-supported crypto pairs (matches LAZIC_SUPPORTED_SYMBOLS)
  CRYPTO: [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT',
    'DOT/USDT', 'MATIC/USDT', 'AVAX/USDT', 'LINK/USDT', 'UNI/USDT',
  ],
  FOREX: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'],
  STOCKS: ['AAPL', 'MSFT', 'GOOGL', 'TSLA'],
  COMMODITIES: ['XAU/USD', 'XAG/USD', 'WTI/USD', 'BRENT/USD'],
  // V353: Indices added for OANDA integration
  INDICES: ['US30/USD', 'NAS100/USD', 'SPX500/USD', 'GER30/USD', 'UK100/USD'],
} as const;

/** V353: All OANDA-supported pairs (forex + metals + indices + energy).
 *  Used for paper-trading users who can trade ALL pairs (simulation).
 *  These pairs get real-time OANDA data via ExchangeService._selectAdapter(). */
export const OANDA_SUPPORTED_PAIRS: string[] = [
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.COMMODITIES,
  ...COUNCIL_PAIRS.INDICES,
];

/** Pairs supported by Binance (the exchange used by all current users).
 *  Only these pairs will generate EXECUTABLE briefs.
 *  Other pairs generate advisory-only briefs (market context). */
export const BINANCE_SUPPORTED_PAIRS: string[] = [
  ...COUNCIL_PAIRS.CRYPTO,
];

/** Pairs NOT supported by Binance — analysis only, no execution.
 *  These can be used for market sentiment but orders will always fail on Binance.
 *  However, they ARE supported on MT5 (forex + commodities). */
export const NON_BINANCE_PAIRS: string[] = [
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.STOCKS,
  ...COUNCIL_PAIRS.COMMODITIES,
];

/** V226: Pairs supported by MT5/MetaTrader broker.
 *  Forex majors + commodities (gold/silver) + crypto.
 *  Paper-trading supports ALL pairs (simulation).
 *  V353: Added indices + energy (WTI, BRENT). */
export const MT5_SUPPORTED_PAIRS: string[] = [
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.COMMODITIES,
  ...COUNCIL_PAIRS.INDICES,
  ...COUNCIL_PAIRS.CRYPTO,
];

/** All pairs flattened (for backward compat and market scanning) */
export const ALL_COUNCIL_PAIRS: string[] = [
  ...COUNCIL_PAIRS.CRYPTO,
  ...COUNCIL_PAIRS.FOREX,
  ...COUNCIL_PAIRS.STOCKS,
  ...COUNCIL_PAIRS.COMMODITIES,
  ...COUNCIL_PAIRS.INDICES,
];

/** Check if a symbol is supported by the given exchange.
 *  V226: Now supports MT5 with forex + commodities + crypto pairs.
 *  Returns true if the symbol can be executed on the exchange. */
export function isSymbolSupportedByExchange(symbol: string, exchange: string): boolean {
  const exchangeId = exchange.toLowerCase().replace('_test', '').replace('-test', '');
  switch (exchangeId) {
    case 'binance':
      return BINANCE_SUPPORTED_PAIRS.includes(symbol);
    case 'mt5':
    case 'mt5_demo':
    case 'metatrader5':
    case 'metatrader':
      // MT5 supports forex + commodities + crypto (via CFDs)
      return MT5_SUPPORTED_PAIRS.includes(symbol);
    case 'paper':
    case 'paper-trading':
      // Paper trading supports ALL pairs (simulation)
      return true;
    default:
      // For unknown exchanges, only allow crypto pairs (safe default)
      return BINANCE_SUPPORTED_PAIRS.includes(symbol);
  }
}

/** Timeframes the Council covers (Focused on rapid scalping/intraday + swing/position) */
export const COUNCIL_TIMEFRAMES: BriefTimeframe[] = ['M1', 'M5', 'M15'];

/** Expiry durations per timeframe (in milliseconds) */
export const TIMEFRAME_EXPIRY_MS: Record<BriefTimeframe, number> = {
  M1: 5 * 60 * 1000,                // BUG-036 FIX: was 1 min (expired before next 15-min session). Now 5 min.
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
 *
 *  V204 FIX: SL distances were still too tight for crypto markets.
 *  Analysis of 103 trades showed Smart strategy SL hit rate = 36.2%
 *  because M1 SL of 0.5% is triggered by normal crypto noise (DOGE
 *  routinely moves 2-5% in hours). Increased all SLs by 2x to survive
 *  crypto volatility. TP also adjusted to maintain R:R ratios.
 *  This should reduce SL hit rate from 36% to below 20%.
 */
export const TIMEFRAME_RR: Record<BriefTimeframe, { sl: number; tp: number; maxSlippage: number }> = {
  // BUG-066p: Unified R:R = 1.2 across ALL timeframes (was 1.75-2.67).
  //
  // PROBLEM (discovered via deep trace):
  //   - BUG-066j reduced strategy calculateLevels() to R:R=1.2, but the 7 strategies
  //     are DEAD CODE — never called by the Agent at runtime.
  //   - The Agent's actual SL/TP comes from TIMEFRAME_RR (this constant).
  //   - Old values produced R:R=2.33-2.67 for H1/H4 → SL=3%, TP=7%.
  //   - Live data confirmed: Agent trades had avg SL=3.14%, TP=7.52%, R:R=2.60.
  //   - This means BUG-066j had ZERO effect on live trades.
  //
  // FIX: Reduce TP to sl × 1.2 for every timeframe.
  //   - SL stays the same (represents valid volatility range per timeframe)
  //   - TP reduced so R:R = 1.2 uniformly (matches BUG-066j intent)
  //   - TP will be reached faster → higher win rate → positive expectancy
  //
  // SL values kept from V265 (2% min prevents noise stops).
  // TP values recalculated as sl × 1.2.
  M1: { sl: 0.020, tp: 0.024, maxSlippage: 0.003 },   // BUG-066p: R:R 1.75→1.2 (TP 3.5%→2.4%)
  M5: { sl: 0.020, tp: 0.024, maxSlippage: 0.004 },   // BUG-066p: R:R 2.0→1.2 (TP 4.0%→2.4%)
  M15: { sl: 0.020, tp: 0.024, maxSlippage: 0.005 },  // BUG-066p: R:R 2.5→1.2 (TP 5.0%→2.4%)
  M30: { sl: 0.025, tp: 0.030, maxSlippage: 0.006 },  // BUG-066p: R:R 2.4→1.2 (TP 6.0%→3.0%)
  H1: { sl: 0.030, tp: 0.036, maxSlippage: 0.006 },   // BUG-066p: R:R 2.33→1.2 (TP 7.0%→3.6%)
  H4: { sl: 0.030, tp: 0.036, maxSlippage: 0.007 },   // BUG-066p: R:R 2.67→1.2 (TP 8.0%→3.6%)
  D1: { sl: 0.050, tp: 0.060, maxSlippage: 0.010 },   // BUG-066p: R:R 2.5→1.2 (TP 12.5%→6.0%)
  W1: { sl: 0.070, tp: 0.084, maxSlippage: 0.012 },   // BUG-066p: R:R 2.5→1.2 (TP 17.5%→8.4%)
};

/** BUG-066p: Minimum risk/reward ratio enforced by RiskGatekeeper.
 *  Reduced from 1.5 to 1.2 to match the unified R:R target.
 *  Any trade with R:R < 1.2:1 is rejected. */
export const MIN_RISK_REWARD_RATIO = 1.2;

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
