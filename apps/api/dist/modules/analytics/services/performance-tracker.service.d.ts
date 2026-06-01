import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
export interface SourcePerformance {
    source: string;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    totalPnL: number;
    maxDrawdown: number;
    sharpeRatio: number | null;
    kellyPercent: number;
    dailyPnL: number;
    dailyPnLPercent: number;
    autoStopTriggered: boolean;
    lastUpdated: Date;
}
export interface SystemHealthStatus {
    smart_executor: SourcePerformance;
    agent: SourcePerformance;
    combined: SourcePerformance;
    autoStopActive: boolean;
    recommendation: string;
}
export declare class PerformanceTrackerService {
    private readonly prisma;
    private readonly redis;
    private readonly logger;
    private readonly DAILY_LOSS_LIMIT_PCT;
    private readonly MIN_TRADES_FOR_KELLY;
    constructor(prisma: PrismaService, redis: RedisService);
    updatePerformanceCache(): Promise<void>;
    getSourcePerformance(userId: string, source: string, daysSince?: number): Promise<SourcePerformance>;
    getSystemHealth(userId: string): Promise<SystemHealthStatus>;
    getKellyPositionSize(userId: string, source: string, portfolioValue: number): Promise<number>;
    isDailyLossLimitReached(userId: string): Promise<boolean>;
    private _emptyPerformance;
    private _getFirstActiveUser;
}
