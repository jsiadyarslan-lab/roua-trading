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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RiskGatekeeperService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskGatekeeperService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const credentials_service_1 = require("../../portfolio/credentials/credentials.service");
const exchange_service_1 = require("../../exchange/exchange.service");
const ccxt = __importStar(require("ccxt"));
let RiskGatekeeperService = RiskGatekeeperService_1 = class RiskGatekeeperService {
    constructor(prisma, configService, credentialsService, exchangeService, redis) {
        this.prisma = prisma;
        this.configService = configService;
        this.credentialsService = credentialsService;
        this.exchangeService = exchangeService;
        this.redis = redis;
        this.logger = new common_1.Logger(RiskGatekeeperService_1.name);
        this.CB_BASE_COOLDOWN_MS = 60_000;
        this.CB_MAX_COOLDOWN_MS = 30 * 60 * 1000;
        this.circuitBreakerState = new Map();
        this.CB_REDIS_PREFIX = 'circuit-breaker:v2:';
        this.lastSettingsSync = 0;
        this.SETTINGS_SYNC_INTERVAL = 30000;
        this.maxPositionSizePercent = parseFloat(this.configService.get('RISK_MAX_POSITION_PERCENT', '5'));
        this.maxOpenPositions = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '10'), 10);
        this.executorMaxOpenPositions = parseInt(this.configService.get('EXECUTOR_MAX_OPEN_POSITIONS', '5'), 10);
        this.agentMaxOpenPositions = parseInt(this.configService.get('AGENT_MAX_OPEN_POSITIONS', '5'), 10);
        this.maxDailyLossPercent = parseFloat(this.configService.get('RISK_MAX_DAILY_LOSS_PERCENT', '5'));
        this.minOrderSizeUSD = parseFloat(this.configService.get('RISK_MIN_ORDER_SIZE', '10'));
        this.maxOrderSizeUSD = parseFloat(this.configService.get('RISK_MAX_ORDER_SIZE', '5000'));
        this.stopLossDefault = parseFloat(this.configService.get('RISK_STOP_LOSS_DEFAULT', '2'));
        this.circuitBreakerThresholdPercent = parseFloat(this.configService.get('RISK_CIRCUIT_BREAKER_THRESHOLD', '10'));
        this.syncSettingsFromDB().catch((err) => this.logger.warn(`syncSettingsFromDB failed at startup: ${err?.message || err}`));
        this.logger.log('🛡️ Risk Gatekeeper initialized — pre-trade validation active (with DB sync)');
    }
    async onModuleInit() {
        const INIT_TIMEOUT_MS = 5_000;
        await Promise.race([
            this._loadCircuitBreakerStateFromRedis(),
            new Promise((resolve) => setTimeout(() => {
                this.logger.warn(`🛡️ Circuit breaker Redis load timed out after ${INIT_TIMEOUT_MS / 1000}s — continuing with empty state`);
                resolve();
            }, INIT_TIMEOUT_MS)),
        ]);
    }
    async onModuleDestroy() {
        await this._saveCircuitBreakerStateToRedis();
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
            const settings = await this.prisma.setting.findMany({
                where: {
                    key: { in: ['riskConfig', 'botConfig', 'AUTO_TRADING_ENABLED', 'agentExecutorConfig'] },
                },
            });
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
                        const newVal = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '20'), 10);
                        this.logger.warn(`🛡️ V144: Auto-upgrading riskConfig.maxOpenPositions from ${val} to ${newVal} (stale old default detected)`);
                        val = newVal;
                        this.prisma.setting.upsert({
                            where: { key: 'riskConfig' },
                            update: { value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(newVal) }) },
                            create: { key: 'riskConfig', value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(newVal) }) },
                        }).catch((dbErr) => {
                            this.logger.warn(`🛡️ V144: Failed to update riskConfig in DB: ${dbErr?.message}`);
                        });
                    }
                    this.maxOpenPositions = val;
                }
                if (riskConfig.stopLossDefault)
                    this.stopLossDefault = parseFloat(riskConfig.stopLossDefault);
                if (riskConfig.circuitBreakerThreshold)
                    this.circuitBreakerThresholdPercent = parseFloat(riskConfig.circuitBreakerThreshold);
            }
            const botConfig = settingsMap.botConfig;
            if (botConfig) {
                if (botConfig.maxPositionSize)
                    this.maxOrderSizeUSD = parseFloat(botConfig.maxPositionSize);
            }
            const agentExecConfig = settingsMap.agentExecutorConfig;
            if (agentExecConfig) {
                const execMax = parseInt(agentExecConfig.executorMaxOpenPositions || '15', 10);
                const agentMax = parseInt(agentExecConfig.agentMaxOpenPositions || '15', 10);
                this.executorMaxOpenPositions = execMax;
                this.agentMaxOpenPositions = agentMax;
                this.logger.debug(`🛡️ V145: Per-source limits — executor=${execMax}, agent=${agentMax}`);
                if (!settingsMap.riskConfig?.maxOpenPositions) {
                    const impliedGlobal = execMax + agentMax;
                    if (this.maxOpenPositions < impliedGlobal) {
                        this.logger.warn(`🛡️ V144: Global maxOpenPositions (${this.maxOpenPositions}) is less than executor+agent total (${impliedGlobal}). Consider increasing riskConfig.maxOpenPositions to at least ${impliedGlobal}.`);
                    }
                }
            }
            this.logger.debug(`🛡️ Risk parameters synced from DB — maxOpenPositions=${this.maxOpenPositions}`);
        }
        catch (error) {
            this.logger.warn(`🛡️ Failed to sync settings from DB: ${error.message} — using env defaults`);
        }
    }
    async validateOrder(command) {
        await this.syncSettingsFromDB();
        this.logger.debug(`🛡️ Validating order: ${command.side} ${command.quantity} ${command.symbol} (key: ${command.idempotencyKey})`);
        const slCheck = await this.enforceStopLoss(command);
        if (!slCheck.allowed)
            return slCheck;
        const balanceCheck = await this.checkSufficientBalance(command);
        if (!balanceCheck.allowed)
            return balanceCheck;
        const sizeCheck = await this.checkPositionSizeLimit(command);
        if (!sizeCheck.allowed)
            return sizeCheck;
        const drawdownCheck = await this.checkDailyDrawdownLimit(command.userId, command.exchangeCredentialId);
        if (!drawdownCheck.allowed)
            return drawdownCheck;
        const overallDrawdownCheck = await this.checkOverallDrawdownLimit(command.userId, command.exchangeCredentialId);
        if (!overallDrawdownCheck.allowed)
            return overallDrawdownCheck;
        const circuitCheck = await this.checkCircuitBreakers(command.userId, command.symbol);
        if (!circuitCheck.allowed)
            return circuitCheck;
        const riskScore = await this._calculateRiskScore(command);
        this.logger.debug(`🛡️ Order validated: ${command.symbol} (risk score: ${riskScore})`);
        return {
            allowed: true,
            riskScore,
        };
    }
    async enforceStopLoss(command) {
        if (!command.stopLoss || command.stopLoss <= 0) {
            this.logger.warn(`🛡️ ORDER REJECTED: No stop-loss for ${command.symbol}`);
            return {
                allowed: false,
                reason: 'وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.',
                failedCheck: 'STOPLOSS_ENFORCEMENT',
            };
        }
        let referencePrice = command.price;
        if (!referencePrice || referencePrice <= 0) {
            try {
                const quote = await this.exchangeService.getQuote(command.symbol);
                if (quote && quote.price > 0) {
                    referencePrice = quote.price;
                    this.logger.debug(`🛡️ Fetched market price for SL validation: ${command.symbol} = $${referencePrice}`);
                }
            }
            catch {
                this.logger.warn(`🛡️ Cannot fetch price for ${command.symbol} — skipping SL direction check`);
                return { allowed: true };
            }
        }
        if (!referencePrice || referencePrice <= 0) {
            this.logger.warn(`🛡️ No reference price for ${command.symbol} — skipping SL direction check`);
            return { allowed: true };
        }
        if (command.side === 'BUY' && command.stopLoss >= referencePrice) {
            return {
                allowed: false,
                reason: 'وقف الخسارة لأمر الشراء يجب أن يكون أقل من سعر الدخول.',
                failedCheck: 'STOPLOGIC_ENFORCEMENT',
            };
        }
        if (command.side === 'SELL' && command.stopLoss <= referencePrice) {
            return {
                allowed: false,
                reason: 'وقف الخسارة لأمر البيع يجب أن يكون أعلى من سعر الدخول.',
                failedCheck: 'STOPLOGIC_ENFORCEMENT',
            };
        }
        return { allowed: true };
    }
    async checkSufficientBalance(command) {
        try {
            const credential = await this.prisma.exchangeCredential.findUnique({
                where: { id: command.exchangeCredentialId },
            });
            if (!credential) {
                return {
                    allowed: false,
                    reason: 'بيانات الاعتماد غير موجودة.',
                    failedCheck: 'BALANCE_CHECK',
                };
            }
            if (credential.userId !== command.userId) {
                this.logger.error(`🛡️ SECURITY: User ${command.userId} attempted to use credential ${command.exchangeCredentialId} owned by ${credential.userId}`);
                return {
                    allowed: false,
                    reason: 'بيانات الاعتماد لا تنتمي لحسابك.',
                    failedCheck: 'CREDENTIAL_OWNERSHIP',
                };
            }
            if (!credential.isValid) {
                return {
                    allowed: false,
                    reason: 'بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API.',
                    failedCheck: 'BALANCE_CHECK',
                };
            }
            if (this._isSimulatedCredential(credential)) {
                this.logger.debug(`🛡️ Simulated credential "${credential.exchange}" (testnet=${credential.testnet}) balance check: BYPASSED (virtual balance) — allowing order`);
                return { allowed: true };
            }
            const permissions = JSON.parse(credential.permissions || '["read"]');
            if (!permissions.includes('trade')) {
                return {
                    allowed: false,
                    reason: 'مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade.',
                    failedCheck: 'BALANCE_CHECK',
                };
            }
            let currentPrice = command.price;
            if (!currentPrice) {
                try {
                    const quote = await this.exchangeService.getQuote(command.symbol);
                    currentPrice = quote.price;
                }
                catch {
                    this.logger.error(`Cannot fetch price for ${command.symbol} — rejecting order to protect capital`);
                    return {
                        allowed: false,
                        reason: 'لا يمكن التحقق من سعر الصفقة — تم رفض الطلب لحماية رأس المال.',
                        failedCheck: 'BALANCE_CHECK',
                    };
                }
            }
            const orderValue = command.quantity * (currentPrice || 0);
            if (orderValue < this.minOrderSizeUSD) {
                return {
                    allowed: false,
                    reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSizeUSD} USD).`,
                    failedCheck: 'BALANCE_CHECK',
                };
            }
            if (orderValue > this.maxOrderSizeUSD) {
                return {
                    allowed: false,
                    reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) تتجاوز الحد الأقصى (${this.maxOrderSizeUSD} USD).`,
                    failedCheck: 'BALANCE_CHECK',
                };
            }
            try {
                const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, command.userId);
                let ExchangeClass = ccxt[credential.exchange];
                if (!ExchangeClass) {
                    const realName = this._resolveRealExchangeName(credential.exchange);
                    if (realName && ccxt[realName]) {
                        ExchangeClass = ccxt[realName];
                        this.logger.debug(`🛡️ Resolved exchange "${credential.exchange}" → "${realName}" for CCXT lookup`);
                    }
                }
                if (ExchangeClass) {
                    const exchange = new ExchangeClass({
                        apiKey,
                        secret: apiSecret,
                        enableRateLimit: true,
                    });
                    const balance = await exchange.fetchBalance();
                    const quoteCurrency = command.symbol.split('/').pop() || 'USDT';
                    const availableBalance = balance[quoteCurrency]?.free || 0;
                    if (command.side === 'BUY' && availableBalance < orderValue) {
                        return {
                            allowed: false,
                            reason: `رصيد غير كافي. المتاح: ${availableBalance.toFixed(2)} ${quoteCurrency}، المطلوب: ${orderValue.toFixed(2)} ${quoteCurrency}.`,
                            failedCheck: 'BALANCE_CHECK',
                        };
                    }
                    if (command.side === 'SELL') {
                        const baseCurrency = command.symbol.split('/')[0] || '';
                        const baseBalance = balance[baseCurrency]?.free || 0;
                        if (baseBalance < command.quantity) {
                            return {
                                allowed: false,
                                reason: `رصيد غير كافي من ${baseCurrency}. المتاح: ${baseBalance.toFixed(6)} ${baseCurrency}، المطلوب: ${command.quantity} ${baseCurrency}.`,
                                failedCheck: 'BALANCE_CHECK',
                            };
                        }
                    }
                }
                else {
                    this.logger.warn(`🛡️ Exchange "${credential.exchange}" not found in CCXT — allowing order (execution layer will validate)`);
                }
            }
            catch (error) {
                const isDecryptError = error.message?.includes('decrypt') ||
                    error.message?.includes('initialization vector') ||
                    error.message?.includes('فشل فك تشفير');
                if (isDecryptError) {
                    this.logger.error(`🛡️ Credential decryption failed for ${credential.exchange} (likely ENCRYPTION_KEY changed) — ` +
                        `REJECTING order to protect capital (fail-closed)`);
                    return {
                        allowed: false,
                        reason: 'فشل فك تشفير بيانات الاعتماد — لا يمكن التحقق من الرصيد. تم رفض الطلب لحماية رأس المال. يرجى إعادة إدخال مفاتيح API.',
                        failedCheck: 'BALANCE_CHECK',
                    };
                }
                else {
                    this.logger.error(`Balance verification failed for ${command.symbol}: ${error.message} — rejecting order`);
                    return {
                        allowed: false,
                        reason: 'فشل التحقق من الرصيد — تم رفض الطلب لحماية رأس المال.',
                        failedCheck: 'BALANCE_CHECK',
                    };
                }
            }
            return { allowed: true };
        }
        catch (error) {
            this.logger.error(`Balance check error: ${error.message} — rejecting order`);
            return {
                allowed: false,
                reason: 'فشل فحص الرصيد — تم رفض الطلب لحماية رأس المال.',
                failedCheck: 'BALANCE_CHECK',
            };
        }
    }
    async checkPositionSizeLimit(command) {
        try {
            const isPaperByFlag = command.isPaperTrading === true;
            const credential = await this.prisma.exchangeCredential.findUnique({
                where: { id: command.exchangeCredentialId },
            });
            const isSimulatedByCredential = this._isSimulatedCredential(credential);
            if (isPaperByFlag || isSimulatedByCredential) {
                const orderSource = command.source || 'auto_paper';
                const isExecutor = ['smart_executor', 'auto_paper'].includes(orderSource);
                const perSourceLimit = isExecutor ? this.executorMaxOpenPositions : this.agentMaxOpenPositions;
                const sourcePositions = await this.prisma.position.count({
                    where: {
                        userId: command.userId,
                        status: 'OPEN',
                        source: isExecutor ? { in: ['smart_executor', 'auto_paper'] } : orderSource,
                    },
                });
                if (sourcePositions >= perSourceLimit) {
                    return {
                        allowed: false,
                        reason: `لديك ${sourcePositions} مركز مفتوح من ${isExecutor ? 'المنفذ' : 'الوكيل'} بالفعل (الحد الأقصى: ${perSourceLimit}). أغلق بعض المراكز أولاً.`,
                        failedCheck: 'POSITION_SIZE_LIMIT',
                    };
                }
                const totalOpenPositions = await this.prisma.position.count({
                    where: { userId: command.userId, status: 'OPEN' },
                });
                if (totalOpenPositions >= this.maxOpenPositions) {
                    return {
                        allowed: false,
                        reason: `لديك ${totalOpenPositions} مركز مفتوح إجمالاً (الحد الأقصى العام: ${this.maxOpenPositions}). أغلق بعض المراكز أولاً.`,
                        failedCheck: 'POSITION_SIZE_LIMIT',
                    };
                }
                this.logger.debug(`🛡️ Paper trading order ALLOWED (source=${orderSource}: ${sourcePositions}/${perSourceLimit}, total: ${totalOpenPositions}/${this.maxOpenPositions})`);
                try {
                    const settings = await this.prisma.agentSettings.findUnique({
                        where: { userId: command.userId },
                        select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true },
                    });
                    const paperBalance = settings?.paperBalance ? Number(settings.paperBalance) : 10000;
                    const cryptoLev = settings?.paperCryptoLeverage ? Number(settings.paperCryptoLeverage) : 1;
                    const forexLev = settings?.paperForexLeverage ? Number(settings.paperForexLeverage) : 50;
                    const allOpen = await this.prisma.position.findMany({
                        where: { userId: command.userId, status: 'OPEN' },
                        select: { quantity: true, currentPrice: true, entryPrice: true, symbol: true },
                    });
                    let currentUsed = 0;
                    for (const pos of allOpen) {
                        const notional = Math.abs((Number(pos.quantity) || 0) * (Number(pos.currentPrice) || Number(pos.entryPrice) || 0));
                        const symIsForex = (pos.symbol || '').includes('/') && !(pos.symbol || '').match(/USDT|BTC|ETH|SOL|BNB/i);
                        currentUsed += symIsForex ? notional / forexLev : (cryptoLev > 1 ? notional / cryptoLev : notional);
                    }
                    const newNotional = Math.abs((command.quantity || 0) * (command.price || 0));
                    if (newNotional > 10) {
                        const symIsForex = (command.symbol || '').includes('/') && !(command.symbol || '').match(/USDT|BTC|ETH|SOL|BNB/i);
                        const newMargin = symIsForex ? newNotional / forexLev : (cryptoLev > 1 ? newNotional / cryptoLev : newNotional);
                        if ((currentUsed + newMargin) > paperBalance * 1.02) {
                            const available = Math.max(0, paperBalance - currentUsed);
                            return {
                                allowed: false,
                                reason: `هامش الورق غير كافٍ. الرصيد: $${paperBalance.toFixed(0)}، المستخدم: $${currentUsed.toFixed(0)}، المتاح: $${available.toFixed(0)}، مطلوب للمركز الجديد: $${newMargin.toFixed(0)}.`,
                                failedCheck: 'PAPER_MARGIN_CHECK',
                            };
                        }
                    }
                }
                catch {
                }
                return { allowed: true };
            }
            const orderSource = command.source || 'user_manual';
            const isExecutor = ['smart_executor', 'auto_paper'].includes(orderSource);
            const perSourceLimit = isExecutor ? this.executorMaxOpenPositions : this.agentMaxOpenPositions;
            const sourcePositions = await this.prisma.position.count({
                where: {
                    userId: command.userId,
                    status: 'OPEN',
                    source: isExecutor ? { in: ['smart_executor', 'auto_paper'] } : orderSource,
                },
            });
            if (sourcePositions >= perSourceLimit) {
                return {
                    allowed: false,
                    reason: `لديك ${sourcePositions} مركز مفتوح من ${isExecutor ? 'المنفذ' : 'الوكيل'} بالفعل (الحد الأقصى: ${perSourceLimit}). أغلق بعض المراكز أولاً.`,
                    failedCheck: 'POSITION_SIZE_LIMIT',
                };
            }
            const openPositions = await this.prisma.position.count({
                where: { userId: command.userId, status: 'OPEN' },
            });
            if (openPositions >= this.maxOpenPositions) {
                return {
                    allowed: false,
                    reason: `لديك ${openPositions} مركز مفتوح إجمالاً (الحد الأقصى العام: ${this.maxOpenPositions}). أغلق بعض المراكز أولاً.`,
                    failedCheck: 'POSITION_SIZE_LIMIT',
                };
            }
            let currentPrice = command.price;
            if (!currentPrice) {
                try {
                    const quote = await this.exchangeService.getQuote(command.symbol);
                    currentPrice = quote.price;
                }
                catch {
                    return { allowed: false, reason: 'Price unavailable — cannot verify position size limit', failedCheck: 'POSITION_SIZE_LIMIT' };
                }
            }
            const orderValue = command.quantity * (currentPrice || 0);
            const portfolioValue = await this._estimatePortfolioValue(command.userId);
            if (portfolioValue > 0) {
                const positionPercent = (orderValue / portfolioValue) * 100;
                if (positionPercent > this.maxPositionSizePercent) {
                    return {
                        allowed: false,
                        reason: `حجم المركز (${positionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%). قلل الكمية.`,
                        failedCheck: 'POSITION_SIZE_LIMIT',
                    };
                }
            }
            return { allowed: true };
        }
        catch (error) {
            this.logger.error(`Position size check error: ${error.message}`);
            return { allowed: false, reason: 'Cannot verify position size limit', failedCheck: 'POSITION_SIZE_LIMIT' };
        }
    }
    async checkDailyDrawdownLimit(userId, exchangeCredentialId) {
        try {
            if (exchangeCredentialId) {
                const credential = await this.prisma.exchangeCredential.findUnique({
                    where: { id: exchangeCredentialId },
                });
                if (this._isSimulatedCredential(credential)) {
                    this.logger.debug(`🛡️ Simulated credential "${credential?.exchange}" (testnet=${credential?.testnet}) daily drawdown check: BYPASSED (simulation)`);
                    return { allowed: true };
                }
            }
            else {
                const realCredential = await this.prisma.exchangeCredential.findFirst({
                    where: { userId, isValid: true, exchange: { not: 'paper-trading' }, testnet: { not: true } },
                });
                if (!realCredential) {
                    this.logger.debug(`🛡️ Simulated-only user daily drawdown check: BYPASSED`);
                    return { allowed: true };
                }
            }
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const tradeWhere = {
                userId,
                executedAt: { gte: todayStart },
                type: { in: ['EXIT', 'PARTIAL_EXIT'] },
            };
            if (exchangeCredentialId) {
                const credential = await this.prisma.exchangeCredential.findUnique({
                    where: { id: exchangeCredentialId },
                    select: { exchange: true },
                });
                if (credential) {
                    tradeWhere.exchange = credential.exchange;
                }
            }
            const todayTrades = await this.prisma.trade.findMany({
                where: tradeWhere,
            });
            const dailyPnL = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
            if (dailyPnL < 0) {
                const portfolioValue = await this._estimatePortfolioValue(userId);
                if (portfolioValue > 0) {
                    const lossPercent = (Math.abs(dailyPnL) / portfolioValue) * 100;
                    if (lossPercent >= this.maxDailyLossPercent) {
                        return {
                            allowed: false,
                            reason: `خسائرك اليومية (${lossPercent.toFixed(1)}%) تجاوزت الحد الأقصى (${this.maxDailyLossPercent}%). توقف عن التداول ليومك — حماية رأس المال أولوية.`,
                            failedCheck: 'DAILY_DRAWDOWN',
                        };
                    }
                }
            }
            return { allowed: true };
        }
        catch (error) {
            this.logger.error(`Daily drawdown check error: ${error.message}`);
            return { allowed: false, reason: 'Cannot verify daily drawdown limit', failedCheck: 'DAILY_DRAWDOWN' };
        }
    }
    async checkOverallDrawdownLimit(userId, exchangeCredentialId) {
        try {
            if (exchangeCredentialId) {
                const credential = await this.prisma.exchangeCredential.findUnique({ where: { id: exchangeCredentialId } });
                if (this._isSimulatedCredential(credential))
                    return { allowed: true };
            }
            const maxOverallDrawdownPercent = parseFloat(this.configService.get('RISK_MAX_OVERALL_DRAWDOWN_PERCENT', '30'));
            const allTrades = await this.prisma.trade.findMany({
                where: { userId, type: { in: ['EXIT', 'PARTIAL_EXIT'] } },
                select: { pnl: true },
            });
            const totalPnL = allTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
            if (totalPnL < 0) {
                const portfolioValue = await this._estimatePortfolioValue(userId);
                if (portfolioValue > 0) {
                    const originalValue = portfolioValue + Math.abs(totalPnL);
                    const overallLossPercent = (Math.abs(totalPnL) / originalValue) * 100;
                    if (overallLossPercent >= maxOverallDrawdownPercent) {
                        this.logger.warn(`🛡️ OVERALL DRAWDOWN: User ${userId} overall loss ${overallLossPercent.toFixed(1)}% >= limit ${maxOverallDrawdownPercent}%`);
                        return {
                            allowed: false,
                            reason: `إجمالي خسائرك (${overallLossPercent.toFixed(1)}%) تجاوز الحد الأقصى الكلي (${maxOverallDrawdownPercent}%). يرجى مراجعة استراتيجيتك قبل الاستمرار.`,
                            failedCheck: 'OVERALL_DRAWDOWN',
                        };
                    }
                }
            }
            return { allowed: true };
        }
        catch (err) {
            this.logger.warn(`Overall drawdown check failed (non-fatal): ${err.message}`);
            return { allowed: true };
        }
    }
    async checkCircuitBreakers(userId, symbol) {
        const cbKey = `${userId}:${symbol}`;
        const state = this.circuitBreakerState.get(cbKey);
        if (state && state.triggered && state.until > new Date()) {
            const remainingMs = state.until.getTime() - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            const remainingSec = Math.ceil(remainingMs / 1000);
            const timeStr = remainingMs < 60000
                ? `${remainingSec} ثانية`
                : `${remainingMin} دقيقة`;
            return {
                allowed: false,
                reason: `تداول ${symbol} متوقف مؤقتاً لك بسبب تقلب شديد (مستوى ${state.level}). يُستأنف بعد ${timeStr}.`,
                failedCheck: 'CIRCUIT_BREAKER',
            };
        }
        if (state && state.triggered && state.until <= new Date()) {
            try {
                const quote = await this.exchangeService.getQuote(symbol);
                if (quote && Math.abs(quote.changePercent) <= this.circuitBreakerThresholdPercent) {
                    this.circuitBreakerState.delete(cbKey);
                    this._persistCircuitBreakerToRedis(cbKey);
                    this.logger.log(`🟢 Circuit breaker RESET for ${symbol} — volatility subsided (${quote.changePercent.toFixed(1)}%)`);
                }
                else {
                    const newLevel = state.level + 1;
                    const cooldownMs = Math.min(this.CB_BASE_COOLDOWN_MS * Math.pow(2, newLevel - 1), this.CB_MAX_COOLDOWN_MS);
                    const newUntil = new Date(Date.now() + cooldownMs);
                    this.circuitBreakerState.set(cbKey, {
                        triggered: true,
                        until: newUntil,
                        level: newLevel,
                        triggeredAt: state.triggeredAt,
                        consecutiveTriggers: state.consecutiveTriggers + 1,
                    });
                    this._persistCircuitBreakerToRedis(cbKey);
                    this.logger.warn(`🔴 Circuit breaker RE-TRIGGERED for ${symbol}: still volatile (${quote?.changePercent?.toFixed(1)}%) — level ${newLevel}, cooldown ${Math.round(cooldownMs / 1000)}s`);
                    return {
                        allowed: false,
                        reason: `تقلب شديد مستمر في ${symbol} (مستوى ${newLevel}). التداول متوقف لك لمدة ${Math.round(cooldownMs / 60000)} دقيقة حمايةً لك.`,
                        failedCheck: 'CIRCUIT_BREAKER',
                    };
                }
            }
            catch {
                this.circuitBreakerState.delete(cbKey);
                this._persistCircuitBreakerToRedis(cbKey);
            }
        }
        try {
            const quote = await this.exchangeService.getQuote(symbol);
            if (quote && Math.abs(quote.changePercent) > this.circuitBreakerThresholdPercent) {
                const previousState = this.circuitBreakerState.get(cbKey);
                const level = previousState ? previousState.level + 1 : 1;
                const consecutiveTriggers = previousState ? previousState.consecutiveTriggers + 1 : 1;
                const cooldownMs = Math.min(this.CB_BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.CB_MAX_COOLDOWN_MS);
                const until = new Date(Date.now() + cooldownMs);
                this.circuitBreakerState.set(cbKey, {
                    triggered: true,
                    until,
                    level,
                    triggeredAt: new Date(),
                    consecutiveTriggers,
                });
                this._persistCircuitBreakerToRedis(cbKey);
                const cooldownSec = Math.round(cooldownMs / 1000);
                const cooldownMin = Math.round(cooldownMs / 60000);
                const cooldownStr = cooldownMs < 60000
                    ? `${cooldownSec} ثانية`
                    : `${cooldownMin} دقيقة`;
                this.logger.warn(`🔴 Circuit breaker triggered for ${symbol}: ${quote.changePercent.toFixed(1)}% move (level ${level}, cooldown ${cooldownSec}s)`);
                return {
                    allowed: false,
                    reason: `تقلب شديد في ${symbol} (${quote.changePercent.toFixed(1)}%). التداول متوقف مؤقتاً لمدة ${cooldownStr} حمايةً لك (مستوى ${level}).`,
                    failedCheck: 'CIRCUIT_BREAKER',
                };
            }
        }
        catch {
        }
        return { allowed: true };
    }
    async _saveCircuitBreakerStateToRedis() {
        if (!this.redis)
            return;
        try {
            for (const [cbKey, state] of this.circuitBreakerState.entries()) {
                if (state.triggered && state.until > new Date()) {
                    const remainingMs = state.until.getTime() - Date.now();
                    const key = `${this.CB_REDIS_PREFIX}${cbKey}`;
                    const value = JSON.stringify({
                        triggered: state.triggered,
                        until: state.until.toISOString(),
                        level: state.level,
                        triggeredAt: state.triggeredAt.toISOString(),
                        consecutiveTriggers: state.consecutiveTriggers,
                    });
                    const ttlMs = remainingMs + 60000;
                    await this.redis.set(key, value, ttlMs);
                }
            }
        }
        catch (error) {
            this.logger.warn(`🛡️ Failed to persist circuit breaker state to Redis: ${error.message}`);
        }
    }
    async _loadCircuitBreakerStateFromRedis() {
        if (!this.redis)
            return;
        try {
            try {
                const oldKeys = await this.redis.scanKeys('circuit-breaker:*');
                let oldCleaned = 0;
                for (const oldKey of oldKeys) {
                    if (oldKey.startsWith('circuit-breaker:v2:'))
                        continue;
                    await this.redis.del(oldKey).catch(() => { });
                    oldCleaned++;
                }
                if (oldCleaned > 0) {
                    this.logger.log(`🛡️ V137: Cleaned up ${oldCleaned} old-format circuit breaker key(s) (missing userId)`);
                }
            }
            catch (cleanErr) {
                this.logger.warn(`🛡️ V137: Failed to clean up old circuit breaker keys: ${cleanErr.message}`);
            }
            const keys = await this.redis.scanKeys(`${this.CB_REDIS_PREFIX}*`);
            for (const key of keys) {
                const data = await this.redis.get(key);
                if (!data)
                    continue;
                try {
                    const state = JSON.parse(data);
                    const cbKey = key.replace(this.CB_REDIS_PREFIX, '');
                    const until = new Date(state.until);
                    if (until > new Date()) {
                        this.circuitBreakerState.set(cbKey, {
                            triggered: state.triggered,
                            until,
                            level: state.level,
                            triggeredAt: new Date(state.triggeredAt),
                            consecutiveTriggers: state.consecutiveTriggers,
                        });
                        this.logger.log(`🛡️ Restored circuit breaker for ${cbKey} from Redis (level ${state.level}, expires ${until.toISOString()})`);
                    }
                    else {
                        await this.redis.del(key).catch(() => { });
                    }
                }
                catch {
                    await this.redis.del(key).catch(() => { });
                }
            }
        }
        catch (error) {
            this.logger.warn(`🛡️ Failed to load circuit breaker state from Redis: ${error.message}`);
        }
    }
    async _persistCircuitBreakerToRedis(cbKey) {
        if (!this.redis)
            return;
        try {
            const state = this.circuitBreakerState.get(cbKey);
            if (!state)
                return;
            const key = `${this.CB_REDIS_PREFIX}${cbKey}`;
            if (state.triggered && state.until > new Date()) {
                const remainingMs = state.until.getTime() - Date.now();
                const value = JSON.stringify({
                    triggered: state.triggered,
                    until: state.until.toISOString(),
                    level: state.level,
                    triggeredAt: state.triggeredAt.toISOString(),
                    consecutiveTriggers: state.consecutiveTriggers,
                });
                const ttlMs = remainingMs + 60000;
                await this.redis.set(key, value, ttlMs);
            }
            else {
                await this.redis.del(key).catch(() => { });
            }
        }
        catch (error) {
            this.logger.warn(`🛡️ Failed to persist circuit breaker state for ${cbKey}: ${error.message}`);
        }
    }
    getRiskParameters() {
        return {
            maxPositionSizePercent: this.maxPositionSizePercent,
            maxOpenPositions: this.maxOpenPositions,
            executorMaxOpenPositions: this.executorMaxOpenPositions,
            agentMaxOpenPositions: this.agentMaxOpenPositions,
            maxDailyLossPercent: this.maxDailyLossPercent,
            minOrderSizeUSD: this.minOrderSizeUSD,
            maxOrderSizeUSD: this.maxOrderSizeUSD,
            stopLossDefault: this.stopLossDefault,
            circuitBreakerThresholdPercent: this.circuitBreakerThresholdPercent,
        };
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
    _isSimulatedCredential(credential) {
        if (!credential)
            return false;
        if (this._isTestExchange(credential.exchange))
            return true;
        if (credential.testnet === true)
            return true;
        return false;
    }
    _resolveRealExchangeName(exchangeName) {
        if (!exchangeName)
            return undefined;
        const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
        for (const suffix of suffixes) {
            if (exchangeName.toLowerCase().endsWith(suffix)) {
                return exchangeName.slice(0, -suffix.length);
            }
        }
        if (exchangeName.toLowerCase().includes('testnet')) {
            return exchangeName.replace(/testnet/i, '');
        }
        return undefined;
    }
    async _estimatePortfolioValue(userId) {
        const paperCredential = await this.prisma.exchangeCredential.findFirst({
            where: { userId, exchange: 'paper-trading', isValid: true },
        });
        if (paperCredential) {
            try {
                const settings = await this.prisma.agentSettings.findUnique({
                    where: { userId },
                    select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
                });
                const freeCash = settings ? Number(settings.paperBalance) : 10000;
                const openPositions = await this.prisma.position.findMany({
                    where: { userId, status: 'OPEN', exchange: 'paper-trading' },
                    select: { quantity: true, entryPrice: true, symbol: true },
                }).catch(() => []);
                let lockedMargin = 0;
                const { getSymbolMetadata, AssetClass } = require('../../../modules/trading/services/symbol-metadata');
                const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
                const forexLev = Number(settings?.paperForexLeverage) || 50;
                const goldLev = Number(settings?.paperGoldLeverage) || 20;
                for (const pos of openPositions) {
                    const meta = getSymbolMetadata(pos.symbol);
                    let leverage = cryptoLev;
                    if (meta.assetClass === AssetClass.FOREX)
                        leverage = forexLev;
                    else if (meta.assetClass === AssetClass.COMMODITY)
                        leverage = goldLev;
                    const notional = Number(pos.quantity) * Number(pos.entryPrice);
                    lockedMargin += leverage > 1 ? notional / leverage : notional;
                }
                const equity = freeCash + lockedMargin;
                return equity > 0 ? equity : 10000;
            }
            catch {
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
    async _getPaperBalance(userId) {
        try {
            const settings = await this.prisma.agentSettings.findUnique({
                where: { userId },
            });
            if (settings && Number(settings.paperBalance) > 0) {
                return Number(settings.paperBalance);
            }
        }
        catch { }
        return 10000;
    }
    async _calculateRiskScore(command) {
        let score = 0;
        const portfolioValue = await this._estimatePortfolioValue(command.userId);
        let currentPrice = command.price || 0;
        if (!currentPrice) {
            try {
                const quote = await this.exchangeService.getQuote(command.symbol);
                currentPrice = quote.price;
            }
            catch {
            }
        }
        const orderValue = command.quantity * (currentPrice || 0);
        if (portfolioValue > 0) {
            score += Math.min(30, (orderValue / portfolioValue) * 100 * 1.5);
        }
        const openPositions = await this.prisma.position.count({
            where: { userId: command.userId, status: 'OPEN' },
        });
        score += Math.min(30, openPositions * 3);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTrades = await this.prisma.trade.findMany({
            where: {
                userId: command.userId,
                executedAt: { gte: todayStart },
                type: { in: ['EXIT', 'PARTIAL_EXIT'] },
            },
        });
        const dailyPnL = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
        if (dailyPnL < 0 && portfolioValue > 0) {
            score += Math.min(40, (Math.abs(dailyPnL) / portfolioValue) * 100 * 8);
        }
        return Math.min(100, Math.round(score));
    }
};
exports.RiskGatekeeperService = RiskGatekeeperService;
exports.RiskGatekeeperService = RiskGatekeeperService = RiskGatekeeperService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        credentials_service_1.CredentialsService,
        exchange_service_1.ExchangeService,
        redis_service_1.RedisService])
], RiskGatekeeperService);
//# sourceMappingURL=risk-gatekeeper.service.js.map