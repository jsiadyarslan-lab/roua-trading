import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { TradingService } from '../trading.service';
export declare class ExchangeSyncService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly credentialsService;
    private readonly tradingService;
    private readonly logger;
    private interval;
    private readonly INTERVAL_MS;
    private isRunning;
    private readonly exchangeCache;
    constructor(prisma: PrismaService, credentialsService: CredentialsService, tradingService: TradingService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private _getExchangeInstance;
    private _syncCycle;
    private _checkPosition;
    private _closePositionInDB;
    triggerSync(): Promise<{
        checked: number;
        closed: number;
        errors: number;
    }>;
}
