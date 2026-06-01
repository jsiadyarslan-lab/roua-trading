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
var ExchangeSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeSyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const credentials_service_1 = require("../../portfolio/credentials/credentials.service");
const trading_service_1 = require("../trading.service");
const ccxt = __importStar(require("ccxt"));
let ExchangeSyncService = ExchangeSyncService_1 = class ExchangeSyncService {
    constructor(prisma, credentialsService, tradingService) {
        this.prisma = prisma;
        this.credentialsService = credentialsService;
        this.tradingService = tradingService;
        this.logger = new common_1.Logger(ExchangeSyncService_1.name);
        this.interval = null;
        this.INTERVAL_MS = 60_000;
        this.isRunning = false;
        this.exchangeCache = new Map();
    }
    async onModuleInit() {
        setTimeout(() => {
            this.interval = setInterval(() => this._syncCycle(), this.INTERVAL_MS);
            this.logger.log('🔄 Exchange Sync Service started — reconciling every 60s');
        }, 30_000);
    }
    async onModuleDestroy() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    async _getExchangeInstance(credential) {
        const cacheKey = credential.id;
        let exchange = this.exchangeCache.get(cacheKey);
        if (exchange)
            return exchange;
        try {
            const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, credential.userId);
            const isBinanceTest = credential.exchange === 'binance_test' || credential.exchange === 'binance_future_test';
            const normalizedName = isBinanceTest ? 'binance' : credential.exchange;
            const ExchangeClass = ccxt[normalizedName];
            if (!ExchangeClass) {
                this.logger.warn(`🔄 Exchange "${credential.exchange}" not supported by CCXT`);
                return null;
            }
            exchange = new ExchangeClass({
                apiKey,
                secret: apiSecret,
                enableRateLimit: true,
                timeout: 10000,
                options: {
                    defaultType: credential.exchange === 'binance_future_test' ? 'future' : 'spot',
                    adjustForTimeDifference: true,
                },
            });
            if (isBinanceTest) {
                exchange.setSandboxMode(true);
            }
            this.exchangeCache.set(cacheKey, exchange);
            setTimeout(() => this.exchangeCache.delete(cacheKey), 10 * 60 * 1000);
            return exchange;
        }
        catch (error) {
            this.logger.warn(`🔄 Failed to create exchange instance for credential ${credential.id}: ${error.message}`);
            return null;
        }
    }
    async _syncCycle() {
        if (!this.prisma.isAvailable?.()) {
            return;
        }
        if (this.isRunning)
            return;
        this.isRunning = true;
        try {
            const openPositions = await this.prisma.position.findMany({
                where: {
                    status: 'OPEN',
                    exchange: { not: 'paper-trading' },
                },
                include: {
                    credential: true,
                },
            });
            if (openPositions.length === 0) {
                this.isRunning = false;
                return;
            }
            this.logger.debug(`🔄 Exchange Sync: Checking ${openPositions.length} open position(s)`);
            let closed = 0;
            let synced = 0;
            let errors = 0;
            const byCredential = new Map();
            for (const pos of openPositions) {
                const credId = pos.credentialId;
                if (!byCredential.has(credId))
                    byCredential.set(credId, []);
                byCredential.get(credId).push(pos);
            }
            for (const [credId, positions] of byCredential) {
                const credential = positions[0]?.credential;
                if (!credential)
                    continue;
                const exchange = await this._getExchangeInstance(credential);
                if (!exchange) {
                    errors += positions.length;
                    continue;
                }
                try {
                    let exchangePositions = [];
                    try {
                        exchangePositions = await exchange.fetchPositions();
                    }
                    catch (fetchErr) {
                        this.logger.debug(`🔄 fetchPositions() not supported for ${credential.exchange}: ${fetchErr.message}`);
                    }
                    const exchangePosMap = new Map();
                    for (const ep of exchangePositions) {
                        const symbol = ep.symbol || ep.future;
                        if (symbol)
                            exchangePosMap.set(symbol, ep);
                        const normalized = symbol.replace(/[\/\-_]/g, '');
                        exchangePosMap.set(normalized, ep);
                    }
                    for (const position of positions) {
                        try {
                            const result = await this._checkPosition(position, exchange, exchangePosMap);
                            if (result === 'closed')
                                closed++;
                            else if (result === 'synced')
                                synced++;
                        }
                        catch (err) {
                            errors++;
                            this.logger.debug(`🔄 Error checking position ${position.id}: ${err.message}`);
                        }
                    }
                }
                catch (error) {
                    errors += positions.length;
                    this.logger.debug(`🔄 Exchange API error for credential ${credId}: ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            if (closed > 0 || errors > 0) {
                this.logger.log(`🔄 Exchange Sync complete: ${closed} closed by exchange, ${synced} synced, ${errors} error(s)`);
            }
        }
        catch (error) {
            this.logger.error(`🔄 Exchange Sync cycle failed: ${error.message}`);
        }
        finally {
            this.isRunning = false;
        }
    }
    async _checkPosition(position, exchange, exchangePosMap) {
        const symbol = position.symbol;
        const exchangeSymbol = position.exchangeSymbol;
        let exchangePos = exchangePosMap.get(symbol);
        if (!exchangePos && exchangeSymbol) {
            exchangePos = exchangePosMap.get(exchangeSymbol);
        }
        if (!exchangePos) {
            const normalized = symbol.replace(/[\/\-_]/g, '');
            exchangePos = exchangePosMap.get(normalized);
        }
        if (!exchangePos) {
            if (position.exchange === 'binance' || position.exchange === 'binance_test') {
                return 'synced';
            }
            await this._closePositionInDB(position, 'exchange_closed_missing');
            return 'closed';
        }
        const exchangeQty = Number(exchangePos.contracts || exchangePos.contractSize || exchangePos.quantity || 0);
        if (exchangeQty === 0) {
            await this._closePositionInDB(position, 'exchange_closed_zero_qty');
            return 'closed';
        }
        const markPrice = Number(exchangePos.markPrice || exchangePos.currentPrice || 0);
        if (markPrice > 0) {
            const currentPrice = Number(position.currentPrice);
            if (markPrice !== currentPrice) {
                const entryPrice = Number(position.entryPrice);
                const quantity = Number(position.quantity);
                const unrealizedPnl = position.side === 'BUY'
                    ? (markPrice - entryPrice) * quantity
                    : (entryPrice - markPrice) * quantity;
                await this.prisma.position.update({
                    where: { id: position.id },
                    data: {
                        currentPrice: markPrice,
                        unrealizedPnl,
                        highestPrice: Math.max(Number(position.highestPrice) || markPrice, markPrice),
                        lowestPrice: Math.min(Number(position.lowestPrice) || markPrice, markPrice),
                    },
                }).catch(() => { });
            }
        }
        return 'synced';
    }
    async _closePositionInDB(position, reason) {
        try {
            this.logger.warn(`🔄 Position ${position.id} (${position.symbol}) is CLOSED on exchange but OPEN in DB — closing (reason: ${reason})`);
            await this.tradingService.closePositionWithRetry(position.userId, {
                positionId: position.id,
            });
            this.logger.log(`🔄 Position ${position.id} synced — closed in DB to match exchange state (${reason})`);
        }
        catch (closeErr) {
            if (closeErr.message?.includes('already') || closeErr.message?.includes('alreadyClosed')) {
                this.logger.debug(`🔄 Position ${position.id} already closed — no action needed`);
                return;
            }
            this.logger.error(`🔄 TradingService close failed for position ${position.id}: ${closeErr.message} — doing direct update as last resort`);
            try {
                const currentPrice = Number(position.currentPrice) || Number(position.entryPrice);
                const entryPrice = Number(position.entryPrice);
                const quantity = Number(position.quantity);
                const pnl = position.side === 'BUY'
                    ? (currentPrice - entryPrice) * quantity
                    : (entryPrice - currentPrice) * quantity;
                await this.prisma.position.update({
                    where: { id: position.id },
                    data: {
                        status: 'CLOSED',
                        closedAt: new Date(),
                        currentPrice,
                        unrealizedPnl: 0,
                        realizedPnl: (Number(position.realizedPnl) || 0) + pnl,
                        exitPrice: currentPrice,
                        closeReason: 'EXCHANGE_SYNC',
                        source: 'exchange_sync',
                    },
                });
                await this.prisma.trade.create({
                    data: {
                        userId: position.userId,
                        positionId: position.id,
                        symbol: position.symbol,
                        side: position.side === 'BUY' ? 'SELL' : 'BUY',
                        type: 'EXIT',
                        quantity,
                        price: currentPrice,
                        pnl,
                        exchange: position.exchange,
                        source: 'exchange_sync',
                    },
                });
                this.logger.log(`🔄 Position ${position.id} closed via direct DB update (last resort, reason: ${reason})`);
            }
            catch (dbErr) {
                this.logger.error(`🔄 Failed to close position ${position.id} even via direct update: ${dbErr.message}`);
            }
        }
    }
    async triggerSync() {
        const openCount = await this.prisma.position.count({
            where: { status: 'OPEN', exchange: { not: 'paper-trading' } },
        });
        await this._syncCycle();
        return { checked: openCount, closed: 0, errors: 0 };
    }
};
exports.ExchangeSyncService = ExchangeSyncService;
exports.ExchangeSyncService = ExchangeSyncService = ExchangeSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        credentials_service_1.CredentialsService,
        trading_service_1.TradingService])
], ExchangeSyncService);
//# sourceMappingURL=exchange-sync.service.js.map