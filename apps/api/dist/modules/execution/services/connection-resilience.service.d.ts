import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExecutionGatewayService } from '../gateways/execution-gateway.service';
import { OrderLifecycleService } from './order-lifecycle.service';
export declare class ConnectionResilienceService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly prisma;
    private readonly gatewayService;
    private readonly lifecycleService;
    private readonly logger;
    private readonly connectionState;
    private readonly healthSubject;
    private readonly pollingSubscriptions;
    private heartbeatInterval;
    private readonly POLLING_INTERVAL_MS;
    private readonly HEARTBEAT_INTERVAL_MS;
    private readonly watchedOrders;
    constructor(configService: ConfigService, prisma: PrismaService, gatewayService: ExecutionGatewayService, lifecycleService: OrderLifecycleService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    watchOrder(order: {
        id: string;
        userId: string;
        exchangeCredentialId: string;
        symbol: string;
        exchangeOrderId?: string;
    }): Promise<void>;
    unwatchOrder(orderId: string): void;
    heartbeat(exchangeId: string): Observable<boolean>;
    getConnectionStatus(): Record<string, {
        connected: boolean;
        mode: string;
        lastHeartbeat: Date | null;
    }>;
    private _startPolling;
    private _pollOrderStatus;
    private _checkAllHeartbeats;
    private _initConnectionState;
    private _updateConnectionState;
    private _performSnapshotRecovery;
}
