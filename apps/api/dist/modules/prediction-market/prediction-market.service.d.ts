import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { PolymarketAdapter } from './adapters/polymarket.adapter';
import { ImpactAssessment, PredictionGapAnalysis, PredictionMarketVote } from './prediction-market.types';
export declare class PredictionMarketService {
    private readonly prisma;
    private readonly redis;
    private readonly configService;
    private readonly polymarketAdapter;
    private readonly orchestrator?;
    private readonly logger;
    private syncInProgress;
    private lastSyncAt;
    constructor(prisma: PrismaService, redis: RedisService, configService: ConfigService, polymarketAdapter: PolymarketAdapter, orchestrator?: AIOrchestratorService | undefined);
    syncEvents(force?: boolean): Promise<{
        synced: number;
        updated: number;
    }>;
    calculateAIProbability(eventId: string): Promise<number | null>;
    analyzePredictionGap(eventId: string, symbol: string): Promise<PredictionGapAnalysis | null>;
    getGapsForSymbol(symbol: string): Promise<PredictionGapAnalysis[]>;
    getCouncilVote(symbol: string): Promise<PredictionMarketVote | null>;
    generateImpactAssessment(eventId: string): Promise<ImpactAssessment | null>;
    getActiveEvents(filters?: {
        symbol?: string;
        category?: string;
    }): Promise<any[]>;
    getTopGapEvents(limit?: number): Promise<any[]>;
    getPortfolioImpactEvents(userId: string): Promise<any[]>;
    private _analyzeMarketTrend;
    private _getAIQualitativeAnalysis;
    private _computeGapAnalysis;
    private _computeGapsForSymbol;
    private _getActiveEventsForSymbol;
}
