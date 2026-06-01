import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { OrderStateManagerService } from './order-state-manager.service';
export declare class PositionReconciliationService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly credentialsService;
    private readonly stateManager;
    private readonly logger;
    private interval;
    private readonly MAX_ATTEMPTS;
    private readonly INTERVAL_MS;
    constructor(prisma: PrismaService, credentialsService: CredentialsService, stateManager: OrderStateManagerService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private _processPending;
    private _reconcileRecord;
}
