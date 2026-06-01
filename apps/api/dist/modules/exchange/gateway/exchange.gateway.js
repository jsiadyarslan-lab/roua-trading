"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExchangeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const exchange_service_1 = require("../exchange.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
let ExchangeGateway = ExchangeGateway_1 = class ExchangeGateway {
    constructor(exchangeService, redisService, prisma) {
        this.exchangeService = exchangeService;
        this.redisService = redisService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ExchangeGateway_1.name);
        this.subscriptions = new Map();
        this.symbolSubscribers = new Map();
        this.refreshInterval = null;
        this.redisSubscriber = null;
    }
    afterInit(server) {
        this.logger.log('🔌 Exchange WebSocket Gateway initialized');
        this._setupRedisSubscriber();
    }
    async handleConnection(client) {
        const token = client.handshake.auth?.token ||
            client.handshake.query?.token ||
            client.handshake.headers?.['x-roua-session'] ||
            this._extractSessionFromCookie(client.handshake.headers?.cookie);
        if (!token) {
            this.logger.warn(`🔌 Unauthenticated connection rejected: ${client.id}`);
            client.emit('error', { message: 'Authentication required. Provide token in auth, query, or cookie.' });
            client.disconnect(true);
            return;
        }
        try {
            const session = await this.prisma.session.findUnique({
                where: { token },
                include: { user: true },
            });
            if (!session || session.expiresAt < new Date()) {
                this.logger.warn(`🔌 Invalid/expired session for connection: ${client.id}`);
                client.emit('error', { message: 'Session expired or invalid.' });
                client.disconnect(true);
                return;
            }
            client.user = session.user;
            this.logger.debug(`🔌 Authenticated client connected: ${client.id} (user: ${session.user.displayName})`);
        }
        catch (error) {
            this.logger.error(`🔌 DB unavailable during WS auth — rejecting connection: ${client.id}`);
            client.emit('error', { message: 'Authentication service unavailable. Please try again later.' });
            client.disconnect(true);
            return;
        }
        this.subscriptions.set(client.id, new Set());
    }
    async handleDisconnect(client) {
        this.logger.debug(`🔌 Client disconnected: ${client.id}`);
        const clientSymbols = this.subscriptions.get(client.id);
        if (clientSymbols) {
            for (const symbol of clientSymbols) {
                const subscribers = this.symbolSubscribers.get(symbol);
                if (subscribers) {
                    subscribers.delete(client.id);
                    if (subscribers.size === 0) {
                        this.symbolSubscribers.delete(symbol);
                    }
                }
            }
        }
        this.subscriptions.delete(client.id);
        this._updateRefreshCycle();
    }
    async handleSubscribe(data, client) {
        const { symbol } = data;
        if (!symbol)
            return;
        this.logger.debug(`📡 ${client.id} subscribed to ${symbol}`);
        const clientSymbols = this.subscriptions.get(client.id) || new Set();
        clientSymbols.add(symbol);
        this.subscriptions.set(client.id, clientSymbols);
        const subscribers = this.symbolSubscribers.get(symbol) || new Set();
        subscribers.add(client.id);
        this.symbolSubscribers.set(symbol, subscribers);
        try {
            const quote = await this.exchangeService.getQuote(symbol);
            client.emit('ticker', { symbol, data: quote });
        }
        catch (error) {
            client.emit('ticker:error', { symbol, error: error.message });
        }
        this._updateRefreshCycle();
    }
    async handleUnsubscribe(data, client) {
        const { symbol } = data;
        if (!symbol)
            return;
        this.logger.debug(`📡 ${client.id} unsubscribed from ${symbol}`);
        const clientSymbols = this.subscriptions.get(client.id);
        if (clientSymbols) {
            clientSymbols.delete(symbol);
        }
        const subscribers = this.symbolSubscribers.get(symbol);
        if (subscribers) {
            subscribers.delete(client.id);
            if (subscribers.size === 0) {
                this.symbolSubscribers.delete(symbol);
            }
        }
        this._updateRefreshCycle();
    }
    _updateRefreshCycle() {
        const hasSubscriptions = this.symbolSubscribers.size > 0;
        if (hasSubscriptions && !this.refreshInterval) {
            this.refreshInterval = setInterval(() => this._refreshAllSubscriptions(), 15000);
            this.logger.log(`📡 Started refresh cycle for ${this.symbolSubscribers.size} symbols`);
        }
        else if (!hasSubscriptions && this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            this.logger.log('📡 Stopped refresh cycle (no subscriptions)');
        }
    }
    async _refreshAllSubscriptions() {
        const symbols = Array.from(this.symbolSubscribers.keys());
        const results = await Promise.allSettled(symbols.map(async (symbol) => {
            try {
                const quote = await this.exchangeService.getQuote(symbol);
                return { symbol, quote };
            }
            catch {
                return null;
            }
        }));
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                const { symbol, quote } = result.value;
                this._broadcastToSymbol(symbol, 'ticker', { symbol, data: quote });
                try {
                    await this.redisService.set(`ws:ticker:${symbol}`, JSON.stringify(quote), 10_000);
                }
                catch {
                }
            }
        }
    }
    _broadcastToSymbol(symbol, event, data) {
        const subscribers = this.symbolSubscribers.get(symbol);
        if (!subscribers || subscribers.size === 0)
            return;
        for (const socketId of subscribers) {
            const client = this.server.sockets.sockets.get(socketId);
            if (client) {
                client.emit(event, data);
            }
        }
    }
    _setupRedisSubscriber() {
        this.logger.debug('📡 Redis Pub/Sub ready (single-instance mode)');
    }
    _extractSessionFromCookie(cookieHeader) {
        if (!cookieHeader)
            return null;
        const match = cookieHeader.match(/roua_session=([^;]+)/);
        return match ? match[1] : null;
    }
    broadcast(event, data) {
        if (!this.server)
            return;
        const PUBLIC_EVENTS = new Set([
            'ticker',
            'ticker:error',
            'market_status',
            'system',
        ]);
        if (!PUBLIC_EVENTS.has(event)) {
            this.logger.warn(`🔌 SECURITY: broadcast() called with non-public event '${event}'. Use targeted emits for user-specific data.`);
            return;
        }
        this.server.emit(event, data);
    }
};
exports.ExchangeGateway = ExchangeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ExchangeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ExchangeGateway.prototype, "handleSubscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('unsubscribe'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ExchangeGateway.prototype, "handleUnsubscribe", null);
exports.ExchangeGateway = ExchangeGateway = ExchangeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: (origin, callback) => {
                callback(null, true);
            },
            credentials: true,
        },
        namespace: '/exchange',
    }),
    __metadata("design:paramtypes", [exchange_service_1.ExchangeService,
        redis_service_1.RedisService,
        prisma_service_1.PrismaService])
], ExchangeGateway);
//# sourceMappingURL=exchange.gateway.js.map