// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BriefTimeframe = 'H1' | 'H4' | 'D1' | 'W1';
export type BriefDirection = 'BUY' | 'SELL';
export type BriefReviewStatus = 'ACTIVE' | 'MODIFIED' | 'CANCELLED';

export interface StrictRules {
  maxEntryPrice?: number;
  minEntryPrice?: number;
  maxSlippage: number; // default 0.1%
}

export interface TradingBriefDTO {
  id: string;
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
