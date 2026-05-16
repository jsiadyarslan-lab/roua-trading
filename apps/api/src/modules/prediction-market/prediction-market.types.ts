/**
 * Prediction Market Types — Polymarket Integration (Phase 7)
 *
 * Core interfaces for the PredictionGap system:
 * - PredictionEvent: A market event from Polymarket/Kalshi
 * - ImpactAssessment: Structured analysis of event impact on assets
 * - PredictionGap: Difference between market and AI probabilities
 */

// ── Polymarket API Response Types ──

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
  outcomePrices: string[];  // ["0.65", "0.35"] = 65% Yes, 35% No
  outcomes: string[];       // ["Yes", "No"]
  volume?: number;
  liquidity?: number;
  active: boolean;
  closed: boolean;
  acceptingOrders?: boolean;
  endDate?: string;
}

// ── Internal Types ──

export interface UnifiedPredictionEvent {
  sourceId: string;
  source: 'polymarket' | 'kalshi';
  title: string;
  description?: string;
  category?: string;
  relatedSymbols: string[];
  marketProbability: number; // 0.0 - 1.0
  volume24h: number;
  liquidity: number;
  endDate?: Date;
  active: boolean;
  raw: PolymarketEvent; // Original data for reference
}

export interface ImpactAssessment {
  primarySymbols: {
    symbol: string;
    expectedDirection: 'UP' | 'DOWN' | 'VOLATILE';
    expectedMagnitude: number; // 0-100
    confidence: number; // 0-100
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
  signalBoost: number; // +0.05 for alignment, -0.08 for conflict
  confidence: number; // Model confidence 0-1
  recommendation: string;
}

export interface PredictionMarketVote {
  vote: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  eventsAnalyzed: number;
  avgGap: number;
}

// ── Adapter Interface ──

export interface IPredictionMarketAdapter {
  readonly name: string;
  fetchActiveEvents(limit?: number, offset?: number): Promise<UnifiedPredictionEvent[]>;
  fetchEventDetails(eventId: string): Promise<UnifiedPredictionEvent | null>;
  fetchEventsByCategory(category: string): Promise<UnifiedPredictionEvent[]>;
}
