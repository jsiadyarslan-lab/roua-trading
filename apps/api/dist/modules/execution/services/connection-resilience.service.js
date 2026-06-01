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
var ConnectionResilienceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionResilienceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const execution_gateway_service_1 = require("../gateways/execution-gateway.service");
const order_lifecycle_service_1 = require("./order-lifecycle.service");
const base_adapter_interface_1 = require("../adapters/base-adapter.interface");
let ConnectionResilienceService = ConnectionResilienceService_1 = class ConnectionResilienceService {
    constructor(configService, prisma, gatewayService, lifecycleService) {
        this.configService = configService;
        this.prisma = prisma;
        this.gatewayService = gatewayService;
        this.lifecycleService = lifecycleService;
        this.logger = new common_1.Logger(ConnectionResilienceService_1.name);
        this.connectionState = new Map();
        this.healthSubject = new rxjs_1.Subject();
        this.pollingSubscriptions = new Map();
        this.heartbeatInterval = null;
        this.POLLING_INTERVAL_MS = 5000;
        this.HEARTBEAT_INTERVAL_MS = 30000;
        this.watchedOrders = new Map();
        this.logger.log('🔗 Connection Resilience Service initialized');
    }
    async onModuleInit() {
        this.heartbeatInterval = (0, rxjs_1.interval)(this.HEARTBEAT_INTERVAL_MS).subscribe(() => {
            this._checkAllHeartbeats();
        });
        this.logger.log('🔗 Heartbeat monitoring started (every 30s)');
    }
    onModuleDestroy() {
        if (this.heartbeatInterval) {
            this.heartbeatInterval.unsubscribe();
        }
        for (const [, sub] of this.pollingSubscriptions) {
            sub.unsubscribe();
        }
        this.pollingSubscriptions.clear();
        this.watchedOrders.clear();
    }
    async watchOrder(order) {
        this.logger.log(`🔗 Watching order: ${order.id} (${order.symbol})`);
        this.watchedOrders.set(order.id, {
            orderId: order.id,
            userId: order.userId,
            exchangeCredentialId: order.exchangeCredentialId,
            symbol: order.symbol,
            exchangeOrderId: order.exchangeOrderId,
            watchedAt: new Date(),
            mode: 'POLLING',
        });
        try {
            const adapter = await this.gatewayService.getAdapterForUser(order.userId, order.exchangeCredentialId);
            const exchangeId = adapter.getExchangeId();
            if (adapter.supportsWebSocket()) {
                this.logger.debug(`🔗 ${exchangeId} supports WebSocket — using REST polling with WS health check`);
                this._initConnectionState(exchangeId, true);
            }
            else {
                this.logger.debug(`🔗 ${exchangeId} does NOT support WebSocket — REST polling only`);
                this._initConnectionState(exchangeId, false);
            }
        }
        catch (error) {
            this.logger.warn(`🔗 Cannot check adapter for order ${order.id}: ${error.message}`);
        }
        this._startPolling(order.id);
    }
    unwatchOrder(orderId) {
        const sub = this.pollingSubscriptions.get(orderId);
        if (sub) {
            sub.unsubscribe();
            this.pollingSubscriptions.delete(orderId);
        }
        this.watchedOrders.delete(orderId);
        this.logger.debug(`🔗 Stopped watching order: ${orderId}`);
    }
    heartbeat(exchangeId) {
        return new rxjs_1.Observable((subscriber) => {
            const checkHealth = () => {
                const state = this.connectionState.get(exchangeId);
                subscriber.next(state?.connected || false);
            };
            checkHealth();
            const healthSub = this.healthSubject.subscribe({
                next: (event) => {
                    if (event.exchangeId === exchangeId) {
                        subscriber.next(event.healthy);
                    }
                },
            });
            return () => healthSub.unsubscribe();
        });
    }
    getConnectionStatus() {
        const status = {};
        for (const [exchangeId, state] of this.connectionState) {
            status[exchangeId] = {
                connected: state.connected,
                mode: state.connected && state.supportsWebSocket ? 'WEBSOCKET' : 'POLLING',
                lastHeartbeat: state.lastHeartbeat,
            };
        }
        return status;
    }
    _startPolling(orderId) {
        if (this.pollingSubscriptions.has(orderId))
            return;
        const sub = (0, rxjs_1.interval)(this.POLLING_INTERVAL_MS).subscribe(async () => {
            await this._pollOrderStatus(orderId);
        });
        this.pollingSubscriptions.set(orderId, sub);
        this._pollOrderStatus(orderId);
    }
    async _pollOrderStatus(orderId) {
        const watched = this.watchedOrders.get(orderId);
        if (!watched || !watched.exchangeOrderId)
            return;
        try {
            const adapter = await this.gatewayService.getAdapterForUser(watched.userId, watched.exchangeCredentialId);
            const adapterStatus = await adapter.getOrderStatus(watched.exchangeOrderId, watched.symbol);
            await this.lifecycleService.syncOrderFromExchange(watched.orderId, watched.exchangeOrderId, adapterStatus);
            const exchangeId = adapter.getExchangeId();
            this._updateConnectionState(exchangeId, true);
            if (adapterStatus === base_adapter_interface_1.OrderExecutionStatus.FILLED ||
                adapterStatus === base_adapter_interface_1.OrderExecutionStatus.CANCELLED ||
                adapterStatus === base_adapter_interface_1.OrderExecutionStatus.REJECTED ||
                adapterStatus === base_adapter_interface_1.OrderExecutionStatus.EXPIRED) {
                this.logger.log(`🔗 Order ${orderId} reached terminal state: ${adapterStatus} — stopping poll`);
                this.unwatchOrder(orderId);
            }
        }
        catch (error) {
            this.logger.warn(`🔗 Poll failed for order ${orderId}: ${error.message}`);
            const watched2 = this.watchedOrders.get(orderId);
            if (watched2) {
                try {
                    const adapter = await this.gatewayService.getAdapterForUser(watched2.userId, watched2.exchangeCredentialId);
                    this._updateConnectionState(adapter.getExchangeId(), false);
                }
                catch {
                }
            }
        }
    }
    _checkAllHeartbeats() {
        for (const [exchangeId, state] of this.connectionState) {
            if (state.lastHeartbeat) {
                const timeSinceLastHeartbeat = Date.now() - state.lastHeartbeat.getTime();
                if (timeSinceLastHeartbeat > 60000) {
                    this.logger.warn(`🔗 Heartbeat timeout for ${exchangeId} — connection considered lost`);
                    this._updateConnectionState(exchangeId, false);
                }
            }
        }
    }
    _initConnectionState(exchangeId, supportsWebSocket) {
        if (!this.connectionState.has(exchangeId)) {
            this.connectionState.set(exchangeId, {
                connected: true,
                supportsWebSocket,
                lastHeartbeat: new Date(),
                reconnectAttempts: 0,
            });
        }
    }
    _updateConnectionState(exchangeId, connected) {
        const state = this.connectionState.get(exchangeId);
        if (state) {
            const wasConnected = state.connected;
            state.connected = connected;
            state.lastHeartbeat = new Date();
            if (connected) {
                state.reconnectAttempts = 0;
            }
            else {
                state.reconnectAttempts++;
            }
            if (wasConnected !== connected) {
                this.healthSubject.next({ exchangeId, healthy: connected });
                if (!connected) {
                    this.logger.warn(`🔗 ${exchangeId} connection LOST — switching to REST polling fallback`);
                }
                else {
                    this.logger.log(`🔗 ${exchangeId} connection RESTORED — requesting snapshot recovery`);
                    this._performSnapshotRecovery(exchangeId);
                }
            }
        }
    }
    async _performSnapshotRecovery(exchangeId) {
        this.logger.log(`🔗 Starting snapshot recovery for ${exchangeId}`);
        if (!this.prisma?.isAvailable?.()) {
            this.logger.warn(`🔗 Skipping snapshot recovery for ${exchangeId} — DB not yet available`);
            return;
        }
        try {
            const activeOrders = await this.prisma.order.findMany({
                where: {
                    exchange: exchangeId,
                    status: { in: ['PENDING', 'ACCEPTED', 'PARTIALLY_FILLED'] },
                },
            });
            this.logger.log(`🔗 Snapshot recovery: found ${activeOrders.length} active orders for ${exchangeId}`);
            for (const order of activeOrders) {
                if (order.exchangeOrderId) {
                    try {
                        const adapter = await this.gatewayService.getAdapterForUser(order.userId, order.exchangeCredentialId);
                        const adapterStatus = await adapter.getOrderStatus(order.exchangeOrderId, order.symbol);
                        await this.lifecycleService.syncOrderFromExchange(order.id, order.exchangeOrderId, adapterStatus);
                    }
                    catch (error) {
                        this.logger.warn(`🔗 Snapshot recovery failed for order ${order.id}: ${error.message}`);
                    }
                }
            }
            this.logger.log(`🔗 Snapshot recovery completed for ${exchangeId}`);
        }
        catch (error) {
            this.logger.error(`🔗 Snapshot recovery error for ${exchangeId}: ${error.message}`);
        }
    }
};
exports.ConnectionResilienceService = ConnectionResilienceService;
exports.ConnectionResilienceService = ConnectionResilienceService = ConnectionResilienceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        execution_gateway_service_1.ExecutionGatewayService,
        order_lifecycle_service_1.OrderLifecycleService])
], ConnectionResilienceService);
//# sourceMappingURL=connection-resilience.service.js.map