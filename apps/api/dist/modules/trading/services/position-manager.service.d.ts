import { PrismaService } from '../../../common/prisma/prisma.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { PositionInfo, PortfolioSummary } from '../events/order.events';
import { RedisService } from '../../../common/redis/redis.service';
export declare class PositionManagerService {
    private readonly prisma;
    private readonly aggregator;
    private readonly redis?;
    private readonly logger;
    private readonly DAILY_PNL_TTL_MS;
    constructor(prisma: PrismaService, aggregator: MarketDataAggregatorService, redis?: RedisService | undefined);
    getOpenPositions(userId: string): Promise<PositionInfo[]>;
    calculateUnrealizedPnL(position: {
        side: string;
        entryPrice: number;
        currentPrice: number;
        quantity: number;
    }): number;
    getPortfolioSummary(userId: string): Promise<PortfolioSummary>;
    getDailyPnL(userId: string): Promise<number>;
}
