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
  CRYPTO: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT'],
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

/** V413: Interleaved council pairs — alternates between categories so that
 *  when maxPairsPerSession limits the list, users get a balanced mix of
 *  crypto + forex + commodities instead of crypto-only.
 *
 *  Before V413: [...CRYPTO, ...FOREX, ...COMMODITIES] → maxPairs=7 → crypto only.
 *  After V413:  [BTC, EUR, XAU, ETH, GBP, WTI, SOL, USD/JPY, BRENT, ...]
 *               → maxPairs=7 → 3 crypto + 3 forex + 1 commodity.
 */
function interleaveArrays<T>(...arrays: ReadonlyArray<readonly T[]>[]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(...arrays.map(a => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (i < arr.length) result.push(arr[i]);
    }
  }
  return result;
}

export const INTERLEAVED_COUNCIL_PAIRS: string[] = interleaveArrays(
  COUNCIL_PAIRS.CRYPTO,
  COUNCIL_PAIRS.FOREX,
  COUNCIL_PAIRS.COMMODITIES,
  COUNCIL_PAIRS.INDICES,
);

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
 *
 *  V204 FIX: SL distances were still too tight for crypto markets.
 *  Analysis of 103 trades showed Smart strategy SL hit rate = 36.2%
 *  because M1 SL of 0.5% is triggered by normal crypto noise (DOGE
 *  routinely moves 2-5% in hours). Increased all SLs by 2x to survive
 *  crypto volatility. TP also adjusted to maintain R:R ratios.
 *  This should reduce SL hit rate from 36% to below 20%.
 */
export const TIMEFRAME_RR: Record<BriefTimeframe, { sl: number; tp: number; maxSlippage: number }> = {
  // V338: Reduced TP targets based on V336 data analysis of 50 trades.
  //
  // FINDINGS:
  //   - Average ACTUAL TP distance was 3.69% (config was 5% for M1/M5)
  //   - Only 8/50 trades (16%) hit TAKE_PROFIT
  //   - 19 trades had TP gap < 1% but only 8 closed as TP
  //   - 74% of trades were directionally correct but TP too far to reach
  //   - Real R:R was 2.0, not 2.5 as configured
  //
  // FIX: Reduce TP to match realistic market movement within holding window.
  // Combined with V338 Trailing TP (locks 80% profit at 90% of TP),
  // these reduced targets will be hit more often AND lock in profit when close.
  //
  // V265 kept SL at 2% minimum (good — prevents noise stops).
  M1: { sl: 0.020, tp: 0.035, maxSlippage: 0.003 },   // V338: TP 5.0%→3.5% (1:1.75) — realistic for 1min
  M5: { sl: 0.020, tp: 0.040, maxSlippage: 0.004 },   // V338: TP 5.0%→4.0% (1:2.0)
  M15: { sl: 0.020, tp: 0.050, maxSlippage: 0.005 },  // V338: TP 6.0%→5.0% (1:2.5)
  M30: { sl: 0.025, tp: 0.060, maxSlippage: 0.006 },  // V338: TP 7.5%→6.0% (1:2.4)
  H1: { sl: 0.030, tp: 0.070, maxSlippage: 0.006 },   // V338: TP 9.0%→7.0% (1:2.33)
  H4: { sl: 0.030, tp: 0.080, maxSlippage: 0.007 },   // V338: TP 9.0%→8.0% (1:2.67)
  D1: { sl: 0.050, tp: 0.125, maxSlippage: 0.010 },   // unchanged (swing trades)
  W1: { sl: 0.070, tp: 0.175, maxSlippage: 0.012 },   // unchanged (swing trades)
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
 *
 *  V408: Raised from 50 to 65 — data analysis of 683 monthly trades showed
 *  WR=36% while avg declared confidence was 75%. Low-confidence briefs (50-64%)
 *  were responsible for disproportionate losses. Raising the threshold to 65%
 *  filters out weak signals, reducing monthly trades from ~683 to ~200 with
 *  expected WR improvement to ~45%.
 *  Rollback: change back to 50.
 */
export const MIN_BRIEF_CONFIDENCE = 65; // V408: رُفع من 50 إلى 65 — إشارات أقوى فقط

/** Minimum consensus score to issue a brief — lowered from 60 to 50 to 40
 *  With 8 AI models, votes are often split. 60% was too strict and
 *  caused most consensus results to be rejected, producing zero Briefs.
 *  40% = allows even weak directional consensus to produce briefs.
 *  Risk management (SL/TP) handles downside protection.
 *
 *  V408: Raised from 55 to 70 — paired with MIN_BRIEF_CONFIDENCE=65 to
 *  enforce stronger consensus before issuing any brief. This is the
 *  filtering threshold checked at strategic-council.service.ts:1693.
 *  Briefs with consensus 55-69% will now be rejected.
 *  Rollback: change back to 55.
 */
export const MIN_CONSENSUS_SCORE = 70; // V408: رُفع من 55 إلى 70 — إجماع أقوى قبل الإصدار

export const AGENT_FAST_TIMEFRAMES: BriefTimeframe[] = ['M30', 'H1'];
export const AGENT_SLOW_TIMEFRAMES: BriefTimeframe[] = ['H4', 'D1', 'W1'];
