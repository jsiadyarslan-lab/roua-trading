"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OrderProducerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderProducerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let OrderProducerService = OrderProducerService_1 = class OrderProducerService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(OrderProducerService_1.name);
        this.connection = null;
        this.channel = null;
        this.queueName = 'order_queue';
        this.exchangeName = 'order_exchange';
        this.routingKey = 'order.submit';
        this.rabbitAvailable = false;
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 20;
        this.BASE_RECONNECT_DELAY_MS = 5000;
    }
    async onModuleInit() {
        const rabbitUrl = this.configService.get('RABBITMQ_URL');
        if (!rabbitUrl) {
            this.logger.warn('🐰 RABBITMQ_URL not configured — orders will execute synchronously (fallback mode)');
            return;
        }
        try {
            const CONNECT_TIMEOUT_MS = 5_000;
            await Promise.race([
                this._connect(rabbitUrl),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`RabbitMQ connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS)),
            ]);
            this.rabbitAvailable = true;
            this.logger.log('🐰 Order Producer connected to RabbitMQ');
        }
        catch (error) {
            this.logger.warn(`🐰 RabbitMQ connection failed: ${error.message} — using fallback mode`);
        }
    }
    async onModuleDestroy() {
        try {
            if (this.channel)
                await this.channel.close();
            if (this.connection)
                await this.connection.close();
        }
        catch {
        }
    }
    async sendOrder(message) {
        if (!this.rabbitAvailable || !this.channel) {
            this.logger.debug(`🐰 RabbitMQ unavailable — order ${message.orderId} will be executed synchronously`);
            return false;
        }
        try {
            const content = Buffer.from(JSON.stringify(message));
            this.channel.publish(this.exchangeName, this.routingKey, content, {
                persistent: true,
                messageId: message.orderId,
                timestamp: Date.now(),
                expiration: '300000',
                contentType: 'application/json',
            });
            this.logger.log(`🐰 Order ${message.orderId} published to ${this.queueName}`);
            return true;
        }
        catch (error) {
            this.logger.error(`🐰 Failed to publish order ${message.orderId}: ${error.message}`);
            this.rabbitAvailable = false;
            return false;
        }
    }
    async _connect(url) {
        try {
            const amqp = await Promise.resolve().then(() => __importStar(require('amqplib')));
            this.connection = await amqp.connect(url, { timeout: 5000 });
            this.connection.on('error', (err) => {
                this.logger.error(`🐰 RabbitMQ connection error: ${err.message}`);
                this.rabbitAvailable = false;
                this._reconnect(url);
            });
            this.connection.on('close', () => {
                this.logger.warn('🐰 RabbitMQ connection closed');
                this.rabbitAvailable = false;
                this._reconnect(url);
            });
            this.channel = await this.connection.createChannel();
            await this.channel.assertExchange(this.exchangeName, 'direct', {
                durable: true,
            });
            await this.channel.assertQueue(this.queueName, {
                durable: true,
                arguments: {
                    'x-message-ttl': 300000,
                    'x-dead-letter-exchange': 'order_dlx',
                },
            });
            await this.channel.bindQueue(this.queueName, this.exchangeName, this.routingKey);
            this.channel.prefetch(1);
        }
        catch (error) {
            throw new Error(`RabbitMQ connection failed: ${error.message}`);
        }
    }
    async _reconnect(url) {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            this.logger.error(`🐰 Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached — ` +
                `giving up on RabbitMQ. Orders will execute synchronously (fallback mode).`);
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1), 60000);
        this.logger.log(`🐰 Attempting RabbitMQ reconnection (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}, next in ${Math.round(delay / 1000)}s)...`);
        setTimeout(async () => {
            try {
                await this._connect(url);
                this.rabbitAvailable = true;
                this.reconnectAttempts = 0;
                this.logger.log('🐰 Reconnected to RabbitMQ');
            }
            catch (error) {
                this.logger.error(`🐰 Reconnection failed: ${error.message}`);
                this._reconnect(url);
            }
        }, delay);
    }
};
exports.OrderProducerService = OrderProducerService;
exports.OrderProducerService = OrderProducerService = OrderProducerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OrderProducerService);
//# sourceMappingURL=order-producer.service.js.map