export type BriefTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';
export type BriefDirection = 'BUY' | 'SELL';
export type BriefReviewStatus = 'ACTIVE' | 'MODIFIED' | 'CANCELLED' | 'EXECUTED';
export interface StrictRules {
    maxEntryPrice?: number;
    minEntryPrice?: number;
    maxSlippage: number;
}
export interface TradingBriefDTO {
    id: string;
    userId?: string | null;
    pair: string;
    direction: BriefDirection;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
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
    diagnostics?: string[];
}
export declare const COUNCIL_PAIRS: {
    readonly CRYPTO: readonly ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "ADA/USDT", "XRP/USDT", "DOGE/USDT"];
    readonly FOREX: readonly ["EUR/USD", "GBP/USD", "USD/JPY"];
    readonly STOCKS: readonly ["AAPL", "MSFT", "GOOGL", "TSLA"];
    readonly COMMODITIES: readonly ["XAU/USD"];
};
export declare const BINANCE_SUPPORTED_PAIRS: string[];
export declare const NON_BINANCE_PAIRS: string[];
export declare const ALL_COUNCIL_PAIRS: string[];
export declare function isSymbolSupportedByExchange(symbol: string, exchange: string): boolean;
export declare const COUNCIL_TIMEFRAMES: BriefTimeframe[];
export declare const TIMEFRAME_EXPIRY_MS: Record<BriefTimeframe, number>;
export declare const TIMEFRAME_RR: Record<BriefTimeframe, {
    sl: number;
    tp: number;
    maxSlippage: number;
}>;
export declare const EXECUTOR_TIMEFRAMES: BriefTimeframe[];
export declare const AGENT_TIMEFRAMES: BriefTimeframe[];
export declare function isExecutorTimeframe(tf: BriefTimeframe): boolean;
export declare function isAgentTimeframe(tf: BriefTimeframe): boolean;
export declare const MIN_BRIEF_CONFIDENCE = 50;
export declare const MIN_CONSENSUS_SCORE = 55;
export declare const AGENT_FAST_TIMEFRAMES: BriefTimeframe[];
export declare const AGENT_SLOW_TIMEFRAMES: BriefTimeframe[];
