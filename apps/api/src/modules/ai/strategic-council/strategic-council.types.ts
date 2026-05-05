// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BriefTimeframe = 'H1' | 'H4' | 'D1' | 'W1';
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

/** Timeframes the Council covers */
export const COUNCIL_TIMEFRAMES: BriefTimeframe[] = ['H1', 'H4', 'D1', 'W1'];

/** Expiry durations per timeframe (in milliseconds) */
export const TIMEFRAME_EXPIRY_MS: Record<BriefTimeframe, number> = {
  H1: 1 * 60 * 60 * 1000,           // 1 hour
  H4: 4 * 60 * 60 * 1000,           // 4 hours
  D1: 24 * 60 * 60 * 1000,          // 1 day
  W1: 7 * 24 * 60 * 60 * 1000,      // 1 week
};

/** Risk/reward ratios per timeframe */
export const TIMEFRAME_RR: Record<BriefTimeframe, { sl: number; tp: number; maxSlippage: number }> = {
  H1: { sl: 0.005, tp: 0.01, maxSlippage: 0.001 },     // 0.5% SL, 1% TP
  H4: { sl: 0.01, tp: 0.02, maxSlippage: 0.001 },       // 1% SL, 2% TP
  D1: { sl: 0.02, tp: 0.04, maxSlippage: 0.002 },       // 2% SL, 4% TP
  W1: { sl: 0.04, tp: 0.08, maxSlippage: 0.003 },       // 4% SL, 8% TP
};

/** Minimum confidence score to issue a brief */
export const MIN_BRIEF_CONFIDENCE = 50;

/** Minimum consensus score to issue a brief — lowered from 60 to 50
 *  With 8 AI models, votes are often split. 60% was too strict and
 *  caused most consensus results to be rejected, producing zero Briefs.
 *  50% = majority threshold (more than half agree).
 */
export const MIN_CONSENSUS_SCORE = 50;
