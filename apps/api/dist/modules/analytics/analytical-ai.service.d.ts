import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { RagService } from '../ai/services/rag.service';
import { MarketDataAggregatorService } from './aggregator.service';
import { TechnicalIndicatorService } from './indicators.service';
import { AnalysisCardDto } from './analytics.types';
import { RedisService } from '../../common/redis/redis.service';
export declare class AnalyticalAIService {
    private readonly aggregator;
    private readonly indicators;
    private readonly orchestrator;
    private readonly ragService;
    private readonly redis?;
    private readonly logger;
    private readonly SCANNER_ANALYSIS_TTL_MS;
    constructor(aggregator: MarketDataAggregatorService, indicators: TechnicalIndicatorService, orchestrator: AIOrchestratorService, ragService: RagService, redis?: RedisService | undefined);
    analyzeAsset(symbol: string): Promise<AnalysisCardDto>;
    private _generateAiAnalysis;
    private _buildAnalysisPrompt;
    private _determineSentiment;
    private _calculateConfidence;
    private _assessRiskLevel;
    private _extractKeyFactors;
}
