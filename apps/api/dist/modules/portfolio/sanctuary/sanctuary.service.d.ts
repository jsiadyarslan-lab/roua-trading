import { RedisService } from '../../../common/redis/redis.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
export interface RiskReport {
    summary: string;
    riskScore: number;
    totalValue: number;
    currency: string;
    positions: PositionDetail[];
    metrics: RiskMetrics;
    recommendations: string[];
    aiAnalysis: string;
    analyzedAt: Date;
}
export interface PositionDetail {
    symbol: string;
    exchange: string;
    quantity: number;
    currentPrice: number;
    value: number;
    weight: number;
    change24h: number;
    assetType: string;
}
export interface RiskMetrics {
    concentrationRisk: number;
    diversificationScore: number;
    largestPositionWeight: number;
    positionCount: number;
    varEstimate: number;
    volatilityEstimate: number;
}
export declare class SanctuaryService {
    private readonly prisma;
    private readonly credentialsService;
    private readonly exchangeService;
    private readonly orchestrator;
    private readonly auditService;
    private readonly redisService?;
    private redis?;
    private readonly logger;
    constructor(prisma: PrismaService, credentialsService: CredentialsService, exchangeService: ExchangeService, orchestrator: AIOrchestratorService, auditService: AuditService, redisService?: RedisService | undefined);
    analyzePortfolio(userId: string): Promise<RiskReport>;
    private _fetchExchangePositions;
    private _calculateRiskMetrics;
    private _calculateOverallRiskScore;
    private _generateAIAnalysis;
    private _generateRecommendations;
    private _generateSummary;
    checkAndHaltCouncil(userId: string): Promise<void>;
}
