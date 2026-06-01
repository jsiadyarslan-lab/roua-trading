import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { TradingService } from '../../trading/trading.service';
import { AuditService } from '../../../audit/audit.service';
export declare class PositionMonitorService {
    private readonly prisma;
    private readonly redis;
    private readonly exchangeService;
    private readonly tradingService;
    private readonly audit;
    private readonly logger;
    private readonly MONITOR_INTERVAL_MS;
    private readonly TRAILING_ACTIVATION_PCT;
    private readonly TRAILING_DISTANCE_PCT;
    private readonly MAX_POSITION_AGE_DAYS;
    private isMonitoring;
    constructor(prisma: PrismaService, redis: RedisService, exchangeService: ExchangeService, tradingService: TradingService, audit: AuditService);
    runPositionMonitor(): Promise<void>;
    getMonitorStatus(): Promise<{
        lastCycle: any;
        openPositions: number;
        nearSL: number;
        nearTP: number;
    }>;
    private _monitorPosition;
    private _closePosition;
    private _calculateTrailingStop;
    private _sendAlert;
    private _checkSanctuary;
}
