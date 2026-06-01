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
var ExecutionGatewayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionGatewayService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const credentials_service_1 = require("../../portfolio/credentials/credentials.service");
const audit_service_1 = require("../../../audit/audit.service");
const binance_adapter_1 = require("../adapters/binance.adapter");
const alpaca_adapter_1 = require("../adapters/alpaca.adapter");
const paper_trading_adapter_1 = require("../adapters/paper-trading.adapter");
const aggregator_service_1 = require("../../analytics/aggregator.service");
const redis_service_1 = require("../../../common/redis/redis.service");
let ExecutionGatewayService = ExecutionGatewayService_1 = class ExecutionGatewayService {
    constructor(prisma, credentialsService, auditService, aggregator, redisService, configService) {
        this.prisma = prisma;
        this.credentialsService = credentialsService;
        this.auditService = auditService;
        this.aggregator = aggregator;
        this.redisService = redisService;
        this.configService = configService;
        this.logger = new common_1.Logger(ExecutionGatewayService_1.name);
        this.adapterCache = new Map();
        this.ADAPTER_CACHE_TTL_MS = 5 * 60 * 1000;
        this.logger.log('🚀 Execution Gateway initialized — adapter routing active');
    }
    async getAdapterForUser(userId, exchangeCredentialId) {
        this.logger.debug(`🔍 Getting adapter for credential: ${exchangeCredentialId}`);
        const cached = this.adapterCache.get(exchangeCredentialId);
        if (cached && Date.now() - cached.createdAt < this.ADAPTER_CACHE_TTL_MS) {
            this.logger.debug(`📦 Using cached adapter for ${exchangeCredentialId}`);
            return cached.adapter;
        }
        const credential = await this.prisma.exchangeCredential.findUnique({
            where: { id: exchangeCredentialId },
        });
        if (!credential) {
            throw new common_1.NotFoundException(`بيانات الاعتماد ${exchangeCredentialId} غير موجودة`);
        }
        if (!credential.isValid) {
            throw new common_1.NotFoundException('بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API');
        }
        await this._validatePermissions(credential, userId);
        let apiKey;
        let apiSecret;
        if (this._isTestExchange(credential.exchange)) {
            apiKey = 'paper';
            apiSecret = 'paper';
        }
        else {
            const decrypted = await this.credentialsService.decryptCredential(exchangeCredentialId, userId);
            apiKey = decrypted.apiKey;
            apiSecret = decrypted.apiSecret;
        }
        const adapter = this._createAdapter(credential.exchange, apiKey, apiSecret, userId, credential.testnet === true);
        this.adapterCache.set(exchangeCredentialId, {
            adapter,
            createdAt: Date.now(),
        });
        await this.auditService.log({
            userId,
            action: 'ADAPTER_CREATED',
            resource: 'execution-gateway',
            details: JSON.stringify({
                exchange: credential.exchange,
                credentialId: exchangeCredentialId,
            }),
        });
        this.logger.log(`🚀 Adapter created: ${adapter.getExchangeId()} for credential ${exchangeCredentialId}`);
        return adapter;
    }
    async placeOrder(userId, order) {
        this.logger.log(`📤 Placing order via gateway: ${order.side} ${order.quantity} ${order.symbol}`);
        try {
            const adapter = await this.getAdapterForUser(userId, order.exchangeCredentialId);
            const result = await adapter.placeOrder(order);
            if (!result.success) {
                this.adapterCache.delete(order.exchangeCredentialId);
            }
            return result;
        }
        catch (error) {
            this.logger.error(`❌ Gateway order failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                timestamp: new Date(),
            };
        }
    }
    async cancelOrder(userId, exchangeCredentialId, orderId, symbol) {
        try {
            const adapter = await this.getAdapterForUser(userId, exchangeCredentialId);
            return adapter.cancelOrder(orderId, symbol);
        }
        catch (error) {
            this.logger.error(`❌ Gateway cancel failed: ${error.message}`);
            return false;
        }
    }
    clearCache(credentialId) {
        if (credentialId) {
            this.adapterCache.delete(credentialId);
        }
        else {
            this.adapterCache.clear();
        }
        this.logger.debug(`🗑️ Adapter cache cleared${credentialId ? ` for ${credentialId}` : ''}`);
    }
    _createAdapter(exchange, apiKey, apiSecret, userId, isCredentialTestnet = false) {
        const exchangeLower = exchange.toLowerCase();
        switch (exchangeLower) {
            case 'binance':
                const isTestnet = this.configService?.get('BINANCE_TESTNET', 'false') === 'true' || isCredentialTestnet;
                return new binance_adapter_1.BinanceAdapter(apiKey, apiSecret, this.auditService, userId, isTestnet, 'spot');
            case 'binance_test':
                return new binance_adapter_1.BinanceAdapter(apiKey, apiSecret, this.auditService, userId, true, 'spot');
            case 'binance_future_test':
                return new binance_adapter_1.BinanceAdapter(apiKey, apiSecret, this.auditService, userId, true, 'future');
            case 'alpaca':
                return new alpaca_adapter_1.AlpacaAdapter(apiKey, apiSecret, this.auditService, userId, true);
            case 'paper':
            case 'paper-trading':
                return new paper_trading_adapter_1.PaperTradingAdapter(this.prisma, this.aggregator, this.redisService, this.auditService, userId);
            default:
                this.logger.warn(`⚠️ Using generic CCXT adapter for exchange: ${exchange}`);
                return new binance_adapter_1.BinanceAdapter(apiKey, apiSecret, this.auditService, userId);
        }
    }
    async _validatePermissions(credential, userId) {
        if (this._isTestExchange(credential.exchange)) {
            this.logger.debug(`🛡️ Test exchange "${credential.exchange}" permission check: BYPASSED (simulation)`);
            return;
        }
        const FORBIDDEN_PERMISSIONS = ['withdraw', 'transfer', 'withdrawal', 'internaltransfer'];
        try {
            const permissions = JSON.parse(credential.permissions || '["read"]');
            const hasForbidden = permissions.some((p) => FORBIDDEN_PERMISSIONS.includes(p.toLowerCase()));
            if (hasForbidden) {
                await this.prisma.exchangeCredential.update({
                    where: { id: credential.id },
                    data: { isValid: false },
                });
                await this.auditService.log({
                    userId,
                    action: 'CREDENTIAL_REVOKED_FORBIDDEN_PERMISSION',
                    resource: 'execution-gateway',
                    details: JSON.stringify({
                        credentialId: credential.id,
                        exchange: credential.exchange,
                        permissions,
                    }),
                });
                throw new common_1.NotFoundException('🚫 تم إلغاء بيانات الاعتماد — تحتوي على صلاحيات سحب أو تحويل ممنوعة!');
            }
            if (!permissions.includes('trade')) {
                throw new common_1.NotFoundException('مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade.');
            }
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException)
                throw error;
            this.logger.error(`Could not parse permissions for credential ${credential.id} — BLOCKING execution for safety`);
            throw new common_1.NotFoundException('لا يمكن التحقق من صلاحيات مفتاح API — يرجى إعادة إنشاء المفتاح أو التحقق من إعدادات البورصة');
        }
    }
    _isTestExchange(exchangeName) {
        if (!exchangeName)
            return false;
        const lower = exchangeName.toLowerCase();
        const exactMatches = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'];
        if (exactMatches.includes(lower))
            return true;
        const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
        if (suffixes.some(s => lower.endsWith(s)))
            return true;
        if (lower.includes('testnet'))
            return true;
        return false;
    }
};
exports.ExecutionGatewayService = ExecutionGatewayService;
exports.ExecutionGatewayService = ExecutionGatewayService = ExecutionGatewayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        credentials_service_1.CredentialsService,
        audit_service_1.AuditService,
        aggregator_service_1.MarketDataAggregatorService,
        redis_service_1.RedisService,
        config_1.ConfigService])
], ExecutionGatewayService);
//# sourceMappingURL=execution-gateway.service.js.map