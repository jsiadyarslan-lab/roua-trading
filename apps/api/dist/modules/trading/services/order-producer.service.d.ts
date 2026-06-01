import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderQueueMessage } from '../events/order.events';
export declare class OrderProducerService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    private connection;
    private channel;
    private readonly queueName;
    private readonly exchangeName;
    private readonly routingKey;
    private rabbitAvailable;
    private reconnectAttempts;
    private readonly MAX_RECONNECT_ATTEMPTS;
    private readonly BASE_RECONNECT_DELAY_MS;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    sendOrder(message: OrderQueueMessage): Promise<boolean>;
    private _connect;
    private _reconnect;
}
