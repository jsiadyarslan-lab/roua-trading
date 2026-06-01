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
var RiskManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const config_1 = require("@nestjs/config");
const symbol_metadata_1 = require("./services/symbol-metadata");
let RiskManagerService = RiskManagerService_1 = class RiskManagerService {
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(RiskManagerService_1.name);
        this.lastSettingsSync = 0;
        this.SETTINGS_SYNC_INTERVAL = 30000;
        this.maxPositionSizePercent = parseFloat(this.configService.get('RISK_MAX_POSITION_PERCENT', '20'));
        this.maxOpenPositions = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '10'), 10);
        this.maxDailyLossPercent = parseFloat(this.configService.get('RISK_MAX_DAILY_LOSS_PERCENT', '5'));
        this.defaultStopLossPercent = parseFloat(this.configService.get('RISK_DEFAULT_STOP_LOSS', '3'));
        this.defaultTakeProfitPercent = parseFloat(this.configService.get('RISK_DEFAULT_TAKE_PROFIT', '6'));
        this.minOrderSize = parseFloat(this.configService.get('RISK_MIN_ORDER_SIZE', '10'));
        this.syncSettingsFromDB().catch((err) => this.logger.warn(`syncSettingsFromDB failed at startup: ${err?.message || err}`));
        this.logger.log('🛡️ Risk Manager initialized — protecting your capital (with DB sync)');
    }
    async syncSettingsFromDB() {
        const now = Date.now();
        if (now - this.lastSettingsSync < this.SETTINGS_SYNC_INTERVAL) {
            return;
        }
        this.lastSettingsSync = now;
        if (!this.prisma?.isAvailable?.()) {
            return;
        }
        try {
            const settings = await this.prisma.setting.findMany();
            const settingsMap = {};
            for (const s of settings) {
                try {
                    settingsMap[s.key] = JSON.parse(s.value);
                }
                catch {
                    settingsMap[s.key] = s.value;
                }
            }
            const riskConfig = settingsMap.riskConfig;
            if (riskConfig) {
                if (riskConfig.maxDrawdown)
                    this.maxDailyLossPercent = parseFloat(riskConfig.maxDrawdown);
                if (riskConfig.maxOpenPositions) {
                    let val = parseInt(riskConfig.maxOpenPositions, 10);
                    if (val <= 5) {
                        val = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '20'), 10);
                        this.logger.warn(`🛡️ V144: Auto-upgrading RiskManager.maxOpenPositions from ${riskConfig.maxOpenPositions} to ${val} (stale old default)`);
                        this.prisma.setting.upsert({
                            where: { key: 'riskConfig' },
                            update: { value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(val) }) },
                            create: { key: 'riskConfig', value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(val) }) },
                        }).catch(() => { });
                    }
                    this.maxOpenPositions = val;
                }
                if (riskConfig.stopLossDefault)
                    this.defaultStopLossPercent = parseFloat(riskConfig.stopLossDefault);
                if (riskConfig.takeProfitDefault)
                    this.defaultTakeProfitPercent = parseFloat(riskConfig.takeProfitDefault);
                if (riskConfig.riskPerTrade)
                    this.maxPositionSizePercent = parseFloat(riskConfig.riskPerTrade) * 5;
            }
            this.logger.debug('🛡️ Risk parameters synced from DB');
        }
        catch (error) {
            this.logger.warn(`🛡️ Failed to sync settings from DB: ${error.message} — using env defaults`);
        }
    }
    async checkOrderRisk(userId, symbol, side, quantity, price, exchangeName, exchangeCredentialId) {
        await this.syncSettingsFromDB();
        let isSimulated = this._isTestExchange(exchangeName || '');
        if (!isSimulated && exchangeCredentialId) {
            try {
                const cred = await this.prisma.exchangeCredential.findUnique({
                    where: { id: exchangeCredentialId },
                    select: { testnet: true, exchange: true },
                });
                if (cred && cred.testnet === true) {
                    isSimulated = true;
                    this.logger.debug(`🛡️ RiskManager: Testnet credential detected (${cred.exchange}, testnet=true) — treating as simulated`);
                }
            }
            catch { }
        }
        if (!isSimulated) {
            const realCredential = await this.prisma.exchangeCredential.findFirst({
                where: { userId, isValid: true, exchange: { not: 'paper-trading' }, testnet: { not: true } },
            });
            const hasOnlySimulatedCredentials = !realCredential;
            if (hasOnlySimulatedCredentials) {
                this.logger.debug(`🛡️ RiskManager: User ${userId} has only simulated credentials — bypassing value limits`);
            }
            if (hasOnlySimulatedCredentials) {
                const openPositions = await this.prisma.position.count({
                    where: { userId, status: 'OPEN' },
                });
                if (openPositions >= this.maxOpenPositions) {
                    return {
                        allowed: false,
                        reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
                    };
                }
                return { allowed: true, riskScore: 10 };
            }
        }
        if (isSimulated) {
            const openPositions = await this.prisma.position.count({
                where: { userId, status: 'OPEN' },
            });
            if (openPositions >= this.maxOpenPositions) {
                return {
                    allowed: false,
                    reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
                };
            }
            this.logger.debug(`🛡️ Paper trading order ALLOWED by RiskManager (position count: ${openPositions}/${this.maxOpenPositions}, no value limit for simulation)`);
            return { allowed: true, riskScore: 10 };
        }
        const orderValue = quantity * price;
        if (orderValue < this.minOrderSize) {
            return {
                allowed: false,
                reason: `حجم الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSize} USD)`,
            };
        }
        const openPositions = await this.prisma.position.count({
            where: { userId, status: 'OPEN' },
        });
        if (openPositions >= this.maxOpenPositions) {
            return {
                allowed: false,
                reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
            };
        }
        const portfolioValue = await this._estimatePortfolioValue(userId, false);
        if (portfolioValue > 0) {
            const positionPercent = (orderValue / portfolioValue) * 100;
            if (positionPercent > this.maxPositionSizePercent) {
                return {
                    allowed: false,
                    reason: `حجم المركز (${positionPercent.toFixed(1)}%) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%)`,
                };
            }
        }
        const dailyLoss = await this._calculateDailyLoss(userId);
        if (portfolioValue > 0 && dailyLoss < 0) {
            const lossPercent = (Math.abs(dailyLoss) / portfolioValue) * 100;
            if (lossPercent >= this.maxDailyLossPercent) {
                return {
                    allowed: false,
                    reason: `خسائرك اليومية (${lossPercent.toFixed(1)}%) تجاوزت الحد الأقصى (${this.maxDailyLossPercent}%)`,
                };
            }
        }
        const riskScore = this._calculateRiskScore(orderValue, portfolioValue, openPositions, dailyLoss);
        return { allowed: true, riskScore };
    }
    calculatePositionSize(portfolioValue, entryPrice, stopLossPrice, riskPercent = 1, symbol) {
        const riskAmount = portfolioValue * (riskPercent / 100);
        const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
        if (riskPerUnit <= 0) {
            return { quantity: 0, riskAmount: 0 };
        }
        if (symbol) {
            const meta = (0, symbol_metadata_1.getSymbolMetadata)(symbol);
            const result = (0, symbol_metadata_1.calculatePositionSizeFromRisk)(riskAmount, entryPrice, stopLossPrice, symbol);
            const maxPositionValue = portfolioValue * (this.maxPositionSizePercent / 100);
            let quantityUnits = result.quantityUnits;
            let quantityLots = result.quantityLots;
            if (result.notional > maxPositionValue) {
                quantityUnits = maxPositionValue / entryPrice;
                quantityLots = (0, symbol_metadata_1.roundLotSize)((0, symbol_metadata_1.unitsToLots)(quantityUnits, symbol), symbol);
                quantityUnits = (0, symbol_metadata_1.lotsToUnits)(quantityLots, symbol);
            }
            this.logger.debug(`📊 Position sizing for ${symbol}: lots=${quantityLots}, units=${quantityUnits.toFixed(2)}, ` +
                `margin=$${(0, symbol_metadata_1.calculateMargin)(quantityUnits, entryPrice, symbol).toFixed(2)}, ` +
                `notional=$${(0, symbol_metadata_1.calculateNotionalValue)(quantityUnits, entryPrice).toFixed(2)}, ` +
                `risk=$${(Math.abs(entryPrice - stopLossPrice) * quantityUnits).toFixed(2)}`);
            return {
                quantity: Math.floor(quantityUnits * 1000000) / 1000000,
                riskAmount,
                lots: quantityLots,
                margin: (0, symbol_metadata_1.calculateMargin)(quantityUnits, entryPrice, symbol),
                notional: (0, symbol_metadata_1.calculateNotionalValue)(quantityUnits, entryPrice),
            };
        }
        const quantity = riskAmount / riskPerUnit;
        return { quantity: Math.floor(quantity * 1000000) / 1000000, riskAmount };
    }
    getDefaultLevels(entryPrice, side) {
        if (side === 'BUY') {
            return {
                stopLoss: entryPrice * (1 - this.defaultStopLossPercent / 100),
                takeProfit: entryPrice * (1 + this.defaultTakeProfitPercent / 100),
            };
        }
        else {
            return {
                stopLoss: entryPrice * (1 + this.defaultStopLossPercent / 100),
                takeProfit: entryPrice * (1 - this.defaultTakeProfitPercent / 100),
            };
        }
    }
    getRiskParameters() {
        return {
            maxPositionSizePercent: this.maxPositionSizePercent,
            maxOpenPositions: this.maxOpenPositions,
            maxDailyLossPercent: this.maxDailyLossPercent,
            defaultStopLossPercent: this.defaultStopLossPercent,
            defaultTakeProfitPercent: this.defaultTakeProfitPercent,
            minOrderSize: this.minOrderSize,
        };
    }
    async _estimatePortfolioValue(userId, isPaperTrading = false) {
        if (isPaperTrading) {
            try {
                const agentSettings = await this.prisma.agentSettings.findUnique({
                    where: { userId },
                });
                const paperBalance = agentSettings?.paperBalance?.toNumber() ?? 10000;
                this.logger.debug(`🛡️ Paper trading portfolio value: $${paperBalance} (from AgentSettings)`);
                return paperBalance;
            }
            catch {
                this.logger.debug(`🛡️ Paper trading portfolio value: $10000 (default)`);
                return 10000;
            }
        }
        const portfolios = await this.prisma.portfolio.aggregate({
            where: { userId },
            _sum: { totalValue: true },
        });
        const manualValue = Number(portfolios._sum.totalValue || 0);
        const openPositions = await this.prisma.position.findMany({
            where: { userId, status: 'OPEN' },
        });
        const positionsValue = openPositions.reduce((sum, p) => {
            return sum + Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice));
        }, 0);
        return manualValue + positionsValue;
    }
    _isTestExchange(exchangeName) {
        if (!exchangeName)
            return false;
        const lower = exchangeName.toLowerCase();
        const exactMatches = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'];
        if (exactMatches.includes(lower))
            return true;
        const suffixPatterns = ['_test', '_paper', '_demo', '_sandbox', '_simulation', '-test', '-paper'];
        if (suffixPatterns.some(s => lower.endsWith(s)))
            return true;
        if (lower.includes('testnet'))
            return true;
        return false;
    }
    async _calculateDailyLoss(userId) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTrades = await this.prisma.trade.findMany({
            where: {
                userId,
                executedAt: { gte: todayStart },
                type: { in: ['EXIT', 'PARTIAL_EXIT'] },
            },
        });
        return todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    }
    _calculateRiskScore(orderValue, portfolioValue, openPositions, dailyLoss) {
        let score = 0;
        if (portfolioValue > 0) {
            score += Math.min(30, (orderValue / portfolioValue) * 100 * 1.5);
        }
        score += Math.min(30, openPositions * 3);
        if (dailyLoss < 0 && portfolioValue > 0) {
            score += Math.min(40, (Math.abs(dailyLoss) / portfolioValue) * 100 * 8);
        }
        return Math.min(100, Math.round(score));
    }
};
exports.RiskManagerService = RiskManagerService;
exports.RiskManagerService = RiskManagerService = RiskManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], RiskManagerService);
//# sourceMappingURL=risk-manager.service.js.map