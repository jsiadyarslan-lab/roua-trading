import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketAnalysis, StrategyType, RegimeDetection, StrategyScore } from '../types/agent.types';
export declare class AdaptiveStrategySelectorService {
    private readonly prisma;
    private readonly redis;
    private readonly logger;
    private readonly REGIME_CACHE_TTL;
    private readonly regimeHistory;
    private readonly lastSwitchTime;
    private readonly COOLDOWN_MS;
    private readonly REGIME_CONFIRMATION_BARS;
    constructor(prisma: PrismaService, redis: RedisService);
    detectRegime(market: MarketAnalysis): RegimeDetection;
    scoreStrategies(userId: string, regime: RegimeDetection): Promise<StrategyScore[]>;
    selectBestStrategy(userId: string, market: MarketAnalysis): Promise<{
        strategy: StrategyType;
        regime: RegimeDetection;
        scores: StrategyScore[];
    }>;
    private _mapRegimeToStrategies;
    private _calculateRegimeMatch;
    private _getRecentPerformance;
    private _getDrawdownPenalty;
    private _getWinRateTrend;
    private _applyConfirmation;
    private _calculateADXProxy;
    private _calculateRegimeConfidence;
    private _buildScoreReason;
}
