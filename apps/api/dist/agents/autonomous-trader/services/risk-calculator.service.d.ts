import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RiskAssessment, AgentConfig } from '../types/agent.types';
import { EvaluatedSignal } from '../types/agent.types';
export declare class RiskCalculatorService {
    private readonly prisma;
    private readonly redis;
    private readonly configService;
    private readonly logger;
    private defaultMaxPositionSizePercent;
    private defaultMaxDailyLossPercent;
    private defaultMaxOpenPositions;
    private defaultRiskPerTradePercent;
    constructor(prisma: PrismaService, redis: RedisService, configService: ConfigService);
    private readonly STRATEGY_MIN_RR;
    assessRisk(userId: string, signal: EvaluatedSignal, config: AgentConfig): Promise<RiskAssessment>;
    isDailyLimitReached(userId: string, maxDailyLossPercent: number): Promise<boolean>;
    getRiskParameters(): {
        maxPositionSizePercent: number;
        maxDailyLossPercent: number;
        maxOpenPositions: number;
        riskPerTradePercent: number;
    };
    private _calculatePositionSize;
    private _calculateRiskScore;
    private _getPortfolioValue;
    private _getDailyPnL;
    private _getAgentDailyPnL;
    private _getOpenPositionsCount;
    private _hasOpenPosition;
}
