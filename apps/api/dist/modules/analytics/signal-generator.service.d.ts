import { PrismaService } from '../../common/prisma/prisma.service';
import { AnalyticalAIService } from './analytical-ai.service';
import { MarketDataAggregatorService } from './aggregator.service';
import { TechnicalIndicatorService } from './indicators.service';
import { AuditService } from '../../audit/audit.service';
import { GeneratedSignalDto, AnalysisCardDto } from './analytics.types';
export declare class SignalGeneratorService {
    private readonly prisma;
    private readonly analyticalAI;
    private readonly aggregator;
    private readonly indicators;
    private readonly auditService;
    private readonly logger;
    private readonly MIN_RISK_REWARD;
    private readonly DEFAULT_SL_PERCENT;
    private readonly MIN_SL_DISTANCE;
    private readonly SIGNAL_EXPIRY_MS;
    constructor(prisma: PrismaService, analyticalAI: AnalyticalAIService, aggregator: MarketDataAggregatorService, indicators: TechnicalIndicatorService, auditService: AuditService);
    generateSignal(userId: string, symbol: string, preComputedAnalysis?: AnalysisCardDto): Promise<GeneratedSignalDto>;
    getSignalsForSymbol(userId: string, symbol: string, limit?: number): Promise<GeneratedSignalDto[]>;
    private _determineAction;
    private _calculateStopLoss;
    private _calculateTakeProfit;
    private _calculateRiskReward;
    private _getSupportingIndicators;
    private _buildSignalReason;
    private _calculateSignalConfidence;
    private _createWaitSignal;
}
