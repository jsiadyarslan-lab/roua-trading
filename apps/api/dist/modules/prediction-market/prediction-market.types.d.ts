export interface PolymarketEvent {
    id: string;
    slug: string;
    title: string;
    description?: string;
    startDate: string;
    endDate?: string;
    image?: string;
    liquidity?: number;
    volume?: number;
    active: boolean;
    closed: boolean;
    archived: boolean;
    markets: PolymarketMarket[];
    tags?: string[];
}
export interface PolymarketMarket {
    id: string;
    question: string;
    conditionId?: string;
    outcomePrices: string[];
    outcomes: string[];
    volume?: number;
    liquidity?: number;
    active: boolean;
    closed: boolean;
    acceptingOrders?: boolean;
    endDate?: string;
}
export interface UnifiedPredictionEvent {
    sourceId: string;
    source: 'polymarket' | 'kalshi';
    title: string;
    description?: string;
    category?: string;
    relatedSymbols: string[];
    marketProbability: number;
    volume24h: number;
    liquidity: number;
    endDate?: Date;
    active: boolean;
    raw: PolymarketEvent;
}
export interface ImpactAssessment {
    primarySymbols: {
        symbol: string;
        expectedDirection: 'UP' | 'DOWN' | 'VOLATILE';
        expectedMagnitude: number;
        confidence: number;
    }[];
    secondaryEffects: string[];
    hedgeComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
    timeHorizon: 'IMMEDIATE' | 'SHORT' | 'MEDIUM' | 'LONG';
}
export interface PredictionGapAnalysis {
    eventId: string;
    symbol: string;
    marketProbability: number;
    aiProbability: number;
    gap: number;
    gapDirection: 'market_higher' | 'ai_higher' | 'aligned';
    signalBoost: number;
    confidence: number;
    recommendation: string;
}
export interface PredictionMarketVote {
    vote: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reason: string;
    eventsAnalyzed: number;
    avgGap: number;
}
export interface IPredictionMarketAdapter {
    readonly name: string;
    fetchActiveEvents(limit?: number, offset?: number): Promise<UnifiedPredictionEvent[]>;
    fetchEventDetails(eventId: string): Promise<UnifiedPredictionEvent | null>;
    fetchEventsByCategory(category: string): Promise<UnifiedPredictionEvent[]>;
}
