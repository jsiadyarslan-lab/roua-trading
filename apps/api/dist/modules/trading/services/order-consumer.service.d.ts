import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { AuditService } from '../../../audit/audit.service';
import { OrderQueueMessage } from '../events/order.events';
import { NotificationService } from '../../notification/notification.service';
export declare class OrderConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly prisma;
    private readonly credentialsService;
    private readonly stateManager;
    private readonly auditService;
    private readonly notificationService?;
    private readonly logger;
    private connection;
    private channel;
    private readonly queueName;
    private rabbitAvailable;
    constructor(configService: ConfigService, prisma: PrismaService, credentialsService: CredentialsService, stateManager: OrderStateManagerService, auditService: AuditService, notificationService?: NotificationService | undefined);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    processOrder(message: OrderQueueMessage): Promise<{
        success: boolean;
        filledQuantity?: number;
        averagePrice?: number;
        exchangeOrderId?: string;
        error?: string;
    }>;
    private _updatePosition;
    private _connect;
}
