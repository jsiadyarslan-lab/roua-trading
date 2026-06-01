import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
export interface ExposureCheckResult {
    allowed: boolean;
    reason?: string;
    totalOpenPositions: number;
    totalExposure: number;
    positionsBySource: Record<string, number>;
    existingPositionOnSymbol: boolean;
}
export interface ExposureLimits {
    maxTotalPositions: number;
    maxExposurePercent: number;
    onePositionPerSymbol: boolean;
}
export declare class ExposureManagerService {
    private readonly prisma;
    private readonly redis;
    private readonly logger;
    private readonly POSITION_LOCK_PREFIX;
    constructor(prisma: PrismaService, redis: RedisService);
    canOpenPosition(userId: string, symbol: string, side: string, estimatedValue: number, limits?: Partial<ExposureLimits>): Promise<ExposureCheckResult>;
    releasePositionLock(userId: string, symbol: string): Promise<void>;
    getExposureSummary(userId: string): Promise<{
        totalOpenPositions: number;
        totalExposure: number;
        positionsBySource: Record<string, number>;
        dailyPnL: number;
        symbols: string[];
    }>;
    private _getPortfolioValue;
}
