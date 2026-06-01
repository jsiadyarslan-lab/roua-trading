import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ExchangeService } from '../exchange.service';
import { RedisService } from '../../../common/redis/redis.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
export declare class ExchangeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly exchangeService;
    private readonly redisService;
    private readonly prisma;
    server: Server;
    private readonly logger;
    private readonly subscriptions;
    private readonly symbolSubscribers;
    private refreshInterval;
    private redisSubscriber;
    constructor(exchangeService: ExchangeService, redisService: RedisService, prisma: PrismaService);
    afterInit(server: Server): void;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    handleSubscribe(data: {
        symbol: string;
    }, client: Socket): Promise<void>;
    handleUnsubscribe(data: {
        symbol: string;
    }, client: Socket): Promise<void>;
    private _updateRefreshCycle;
    private _refreshAllSubscriptions;
    private _broadcastToSymbol;
    private _setupRedisSubscriber;
    private _extractSessionFromCookie;
    broadcast(event: string, data: any): void;
}
