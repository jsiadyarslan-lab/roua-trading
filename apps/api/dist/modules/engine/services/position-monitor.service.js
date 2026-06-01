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
var PositionMonitorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionMonitorService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const exchange_service_1 = require("../../exchange/exchange.service");
const trading_service_1 = require("../../trading/trading.service");
const audit_service_1 = require("../../../audit/audit.service");
let PositionMonitorService = PositionMonitorService_1 = class PositionMonitorService {
    constructor(prisma, redis, exchangeService, tradingService, audit) {
        this.prisma = prisma;
        this.redis = redis;
        this.exchangeService = exchangeService;
        this.tradingService = tradingService;
        this.audit = audit;
        this.logger = new common_1.Logger(PositionMonitorService_1.name);
        this.MONITOR_INTERVAL_MS = 10000;
        this.TRAILING_ACTIVATION_PCT = 0.02;
        this.TRAILING_DISTANCE_PCT = 0.015;
        this.MAX_POSITION_AGE_DAYS = 7;
        this.isMonitoring = false;
        this.logger.log('🛡️ Position Monitor initialized — protective surveillance active');
    }
    async runPositionMonitor() {
        if (!this.prisma.isAvailable?.()) {
            return;
        }
        if (this.isMonitoring) {
            return;
        }
        this.isMonitoring = true;
        try {
            await this.prisma.enableRlsBypass();
            let positions;
            let agentPositions;
            let nonAgentPositions;
            try {
                nonAgentPositions = await this.prisma.position.findMany({
                    where: {
                        status: 'OPEN',
                        entryPrice: { gt: 0 },
                        source: { not: 'agent' },
                    },
                });
                agentPositions = await this.prisma.position.findMany({
                    where: {
                        status: 'OPEN',
                        entryPrice: { gt: 0 },
                        source: 'agent',
                    },
                });
                positions = [...nonAgentPositions, ...agentPositions];
            }
            catch (dbError) {
                if (dbError.message?.includes('does not exist')) {
                    this.logger.warn('🛡️ Position table not found — skipping monitor cycle. Run `prisma db push` to create it.');
                    return;
                }
                throw dbError;
            }
            if (positions.length === 0) {
                return;
            }
            this.logger.debug(`🛡️ Monitoring ${positions.length} open positions`);
            let slTriggered = 0;
            let tpTriggered = 0;
            let trailingUpdated = 0;
            let alertsSent = 0;
            const quotePromises = positions.map((pos) => this.exchangeService.getQuote(pos.symbol).catch(() => null));
            const quotes = await Promise.allSettled(quotePromises);
            const priceUpdates = [];
            for (let i = 0; i < positions.length; i++) {
                const position = positions[i];
                const quoteResult = quotes[i];
                const currentPrice = quoteResult.status === 'fulfilled' && quoteResult.value?.price
                    ? quoteResult.value.price
                    : null;
                try {
                    const result = await this._monitorPosition(position, currentPrice, priceUpdates);
                    if (result.slTriggered)
                        slTriggered++;
                    if (result.tpTriggered)
                        tpTriggered++;
                    if (result.trailingUpdated)
                        trailingUpdated++;
                    if (result.alertSent)
                        alertsSent++;
                }
                catch (error) {
                    this.logger.error(`🛡️ Monitor error for position ${position.id}: ${error.message}`);
                }
            }
            if (priceUpdates.length > 0) {
                try {
                    await this.prisma.$transaction(priceUpdates);
                    this.logger.debug(`🛡️ Batch updated ${priceUpdates.length} position price/PnL records`);
                }
                catch (error) {
                    this.logger.error(`🛡️ Batch price update failed: ${error.message}`);
                }
            }
            if (slTriggered > 0 || tpTriggered > 0 || trailingUpdated > 0) {
                this.logger.log(`🛡️ Monitor cycle: ${slTriggered} SL, ${tpTriggered} TP, ${trailingUpdated} trailing, ${alertsSent} alerts`);
            }
            await this.redis.set('monitor:last_cycle', JSON.stringify({
                timestamp: new Date().toISOString(),
                positionsMonitored: positions.length,
                slTriggered,
                tpTriggered,
                trailingUpdated,
                alertsSent,
            }), 300000);
        }
        catch (error) {
            this.logger.error(`🛡️ Position monitor cycle failed: ${error.message}`);
        }
        finally {
            this.isMonitoring = false;
            await this.prisma.disableRlsBypass().catch(() => { });
        }
    }
    async getMonitorStatus() {
        const lastCycleRaw = await this.redis.get('monitor:last_cycle');
        const lastCycle = lastCycleRaw ? JSON.parse(lastCycleRaw) : null;
        let openPositions = 0;
        let nearSL = 0;
        let nearTP = 0;
        try {
            const allPositions = await this.prisma.position.findMany({
                where: { status: 'OPEN' },
            });
            openPositions = allPositions.length;
            const uniqueSymbols = [...new Set(allPositions.map(p => p.symbol))];
            const quoteMap = new Map();
            const quotePromises = uniqueSymbols.map(async (symbol) => {
                try {
                    const quote = await this.exchangeService.getQuote(symbol);
                    if (quote?.price)
                        quoteMap.set(symbol, quote);
                }
                catch { }
            });
            await Promise.allSettled(quotePromises);
            for (const pos of allPositions) {
                const quote = quoteMap.get(pos.symbol);
                if (!quote?.price)
                    continue;
                const currentPrice = quote.price;
                if (pos.stopLoss) {
                    const slDistance = Math.abs(currentPrice - pos.stopLoss.toNumber()) / pos.entryPrice.toNumber();
                    if (slDistance < 0.01)
                        nearSL++;
                }
                if (pos.takeProfit) {
                    const tpDistance = Math.abs(currentPrice - pos.takeProfit.toNumber()) / pos.entryPrice.toNumber();
                    if (tpDistance < 0.01)
                        nearTP++;
                }
            }
        }
        catch (dbError) {
            if (dbError.message?.includes('does not exist')) {
                this.logger.warn('🛡️ Position table not found — returning empty monitor status.');
            }
            else {
                throw dbError;
            }
        }
        return { lastCycle, openPositions, nearSL, nearTP };
    }
    async _monitorPosition(position, currentPrice, priceUpdates) {
        const result = {
            slTriggered: false,
            tpTriggered: false,
            trailingUpdated: false,
            alertSent: false,
        };
        if (currentPrice === null) {
            return result;
        }
        const isAgentPosition = position.source === 'agent';
        const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
        const quantity = position.quantity?.toNumber?.() ?? Number(position.quantity);
        const stopLossNum = position.stopLoss?.toNumber?.() ?? (position.stopLoss ? Number(position.stopLoss) : null);
        const takeProfitNum = position.takeProfit?.toNumber?.() ?? (position.takeProfit ? Number(position.takeProfit) : null);
        const unrealizedPnl = position.side === 'BUY'
            ? (currentPrice - entryPrice) * quantity
            : (entryPrice - currentPrice) * quantity;
        const pnlPercent = (unrealizedPnl / (entryPrice * quantity)) * 100;
        if (isAgentPosition) {
            priceUpdates.push(this.prisma.position.update({
                where: { id: position.id },
                data: {
                    currentPrice,
                    unrealizedPnl,
                    highestPrice: position.side === 'BUY'
                        ? Math.max(position.highestPrice || currentPrice, currentPrice)
                        : position.highestPrice || currentPrice,
                    lowestPrice: position.side === 'SELL'
                        ? Math.min(position.lowestPrice || currentPrice, currentPrice)
                        : position.lowestPrice || currentPrice,
                },
            }));
            return result;
        }
        if (position.source === 'smart_executor' && position.openedAt) {
            const holdingMs = Date.now() - new Date(position.openedAt).getTime();
            const maxHoldingMs = 4 * 60 * 60 * 1000;
            if (holdingMs > maxHoldingMs) {
                this.logger.warn(`⏱️ MAX_HOLDING: ${position.symbol} held ${(holdingMs / 3600000).toFixed(1)}h > 4h — closing`);
                await this._closePosition(position, currentPrice, 'STOP_LOSS');
                result.slTriggered = true;
                return result;
            }
        }
        if (stopLossNum !== null) {
            const slHit = position.side === 'BUY'
                ? currentPrice <= stopLossNum
                : currentPrice >= stopLossNum;
            if (slHit) {
                this.logger.warn(`🚨 STOP-LOSS TRIGGERED: ${position.symbol} @ ${currentPrice} (SL: ${stopLossNum})`);
                await this._closePosition(position, currentPrice, 'STOP_LOSS');
                this._checkSanctuary(position.userId).catch(() => { });
                result.slTriggered = true;
                return result;
            }
            const slDistance = Math.abs(currentPrice - stopLossNum) / entryPrice;
            if (slDistance < 0.005) {
                const alertThrottleKey = `alert:throttle:sl:${position.id}`;
                const lastAlert = await this.redis.get(alertThrottleKey);
                if (!lastAlert) {
                    await this._sendAlert(position.userId, 'NEAR_STOP_LOSS', {
                        positionId: position.id,
                        symbol: position.symbol,
                        currentPrice,
                        stopLoss: stopLossNum,
                        distance: slDistance,
                    });
                    await this.redis.set(alertThrottleKey, '1', 300000);
                    result.alertSent = true;
                }
            }
        }
        if (takeProfitNum !== null) {
            const tpHit = position.side === 'BUY'
                ? currentPrice >= takeProfitNum
                : currentPrice <= takeProfitNum;
            if (tpHit) {
                this.logger.warn(`🎯 TAKE-PROFIT TRIGGERED: ${position.symbol} @ ${currentPrice} (TP: ${takeProfitNum})`);
                await this._closePosition(position, currentPrice, 'TAKE_PROFIT');
                this._checkSanctuary(position.userId).catch(() => { });
                result.tpTriggered = true;
                return result;
            }
            const tpDistance = Math.abs(currentPrice - takeProfitNum) / entryPrice;
            if (tpDistance < 0.005) {
                const alertThrottleKey = `alert:throttle:tp:${position.id}`;
                const lastAlert = await this.redis.get(alertThrottleKey);
                if (!lastAlert) {
                    await this._sendAlert(position.userId, 'NEAR_TAKE_PROFIT', {
                        positionId: position.id,
                        symbol: position.symbol,
                        currentPrice,
                        takeProfit: takeProfitNum,
                        distance: tpDistance,
                    });
                    await this.redis.set(alertThrottleKey, '1', 300000);
                    result.alertSent = true;
                }
            }
        }
        if (pnlPercent >= this.TRAILING_ACTIVATION_PCT * 100) {
            const trailingStop = this._calculateTrailingStop(position, currentPrice);
            if (trailingStop) {
                const currentSL = stopLossNum || 0;
                const shouldUpdate = position.side === 'BUY'
                    ? trailingStop > currentSL
                    : (currentSL === 0 || trailingStop < currentSL);
                if (shouldUpdate) {
                    await this.prisma.position.update({
                        where: { id: position.id },
                        data: { stopLoss: trailingStop },
                    });
                    this.logger.log(`📈 Trailing stop updated: ${position.symbol} SL → ${trailingStop}`);
                    result.trailingUpdated = true;
                }
            }
        }
        const positionAge = Date.now() - new Date(position.openedAt).getTime();
        const ageDays = positionAge / (1000 * 60 * 60 * 24);
        if (ageDays >= this.MAX_POSITION_AGE_DAYS) {
            await this._sendAlert(position.userId, 'POSITION_AGE_WARNING', {
                positionId: position.id,
                symbol: position.symbol,
                ageDays: Math.floor(ageDays),
            });
            result.alertSent = true;
        }
        priceUpdates.push(this.prisma.position.update({
            where: { id: position.id },
            data: {
                currentPrice,
                unrealizedPnl,
                highestPrice: position.side === 'BUY'
                    ? Math.max(position.highestPrice || currentPrice, currentPrice)
                    : position.highestPrice || currentPrice,
                lowestPrice: position.side === 'SELL'
                    ? Math.min(position.lowestPrice || currentPrice, currentPrice)
                    : position.lowestPrice || currentPrice,
            },
        }));
        return result;
    }
    async _closePosition(position, currentPrice, reason) {
        try {
            await this.tradingService.closePositionWithRetry(position.userId, {
                positionId: position.id,
                quantity: typeof position.quantity?.toNumber === 'function'
                    ? position.quantity.toNumber()
                    : Number(position.quantity),
                closeReason: reason,
            }, undefined, undefined, 3);
            await this.audit.log({
                userId: position.userId,
                action: `POSITION_CLOSED_${reason}`,
                resource: 'position-monitor',
                details: JSON.stringify({
                    positionId: position.id,
                    symbol: position.symbol,
                    closePrice: currentPrice,
                    entryPrice: position.entryPrice,
                    side: position.side,
                    quantity: position.quantity,
                }),
            });
        }
        catch (error) {
            this.logger.error(`🛡️ Failed to close position ${position.id}: ${error.message}`);
            try {
                this.logger.warn(`🛡️ V114 Attempting force-close for position ${position.id} after closePositionWithRetry failed`);
                await this.tradingService.forceClosePosition(position.userId, position.id, `V114 Position Monitor fallback: ${reason} triggered but closePositionWithRetry failed — ${error.message?.substring(0, 100)}`);
                this.logger.log(`🛡️ V114 Force-close succeeded for position ${position.id} (${reason})`);
            }
            catch (forceErr) {
                this.logger.error(`🛡️ V114 Force-close also failed for position ${position.id}: ${forceErr.message}`);
            }
        }
    }
    _calculateTrailingStop(position, currentPrice) {
        if (position.side === 'BUY') {
            const highestPrice = position.highestPrice || currentPrice;
            const newHigh = Math.max(highestPrice, currentPrice);
            return newHigh * (1 - this.TRAILING_DISTANCE_PCT);
        }
        else if (position.side === 'SELL') {
            const lowestPrice = position.lowestPrice || currentPrice;
            const newLow = Math.min(lowestPrice, currentPrice);
            return newLow * (1 + this.TRAILING_DISTANCE_PCT);
        }
        return null;
    }
    async _sendAlert(userId, type, data) {
        const alertKey = `alert:${userId}:${Date.now()}`;
        await this.redis.set(alertKey, JSON.stringify({ type, data, timestamp: new Date().toISOString() }), 86400000);
    }
    async _checkSanctuary(userId) {
        try {
            const recentLosses = await this.prisma.position.count({
                where: {
                    userId,
                    status: 'CLOSED',
                    realizedPnl: { lt: 0 },
                    closedAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
                },
            });
            if (recentLosses >= 5) {
                const haltUntil = new Date(Date.now() + 60 * 60 * 1000);
                await this.redis.set('council:sanctuary:halt', haltUntil.toISOString(), 60 * 60 * 1000);
                this.logger.warn(`🛡️ Sanctuary: ${recentLosses} خسائر في 3 ساعات → halt المجلس حتى ${haltUntil.toISOString()}`);
            }
        }
        catch { }
    }
};
exports.PositionMonitorService = PositionMonitorService;
__decorate([
    (0, schedule_1.Interval)(10000),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PositionMonitorService.prototype, "runPositionMonitor", null);
exports.PositionMonitorService = PositionMonitorService = PositionMonitorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        exchange_service_1.ExchangeService,
        trading_service_1.TradingService,
        audit_service_1.AuditService])
], PositionMonitorService);
//# sourceMappingURL=position-monitor.service.js.map