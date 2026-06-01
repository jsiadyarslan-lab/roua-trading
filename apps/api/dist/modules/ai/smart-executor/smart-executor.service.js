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
var SmartExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartExecutorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const exchange_service_1 = require("../../exchange/exchange.service");
const audit_service_1 = require("../../../audit/audit.service");
const trading_service_1 = require("../../trading/trading.service");
const strategic_council_service_1 = require("../strategic-council/strategic-council.service");
const strategic_council_types_1 = require("../strategic-council/strategic-council.types");
const risk_gatekeeper_service_1 = require("../../trading/services/risk-gatekeeper.service");
const ai_orchestrator_service_1 = require("../services/ai-orchestrator.service");
const order_events_1 = require("../../trading/events/order.events");
const notification_service_1 = require("../../notification/notification.service");
const order_dispatcher_service_1 = require("../../trading/services/order-dispatcher.service");
const exposure_manager_service_1 = require("../../trading/services/exposure-manager.service");
const news_service_1 = require("../../news/news.service");
const credentials_service_1 = require("../../portfolio/credentials/credentials.service");
const symbol_metadata_1 = require("../../trading/services/symbol-metadata");
let SmartExecutorService = SmartExecutorService_1 = class SmartExecutorService {
    constructor(prisma, redis, exchangeService, audit, tradingService, councilService, riskGatekeeper, notificationService, orchestrator, orderDispatcher, exposureManager, newsService, credentialsService) {
        this.prisma = prisma;
        this.redis = redis;
        this.exchangeService = exchangeService;
        this.audit = audit;
        this.tradingService = tradingService;
        this.councilService = councilService;
        this.riskGatekeeper = riskGatekeeper;
        this.notificationService = notificationService;
        this.orchestrator = orchestrator;
        this.orderDispatcher = orderDispatcher;
        this.exposureManager = exposureManager;
        this.newsService = newsService;
        this.credentialsService = credentialsService;
        this.logger = new common_1.Logger(SmartExecutorService_1.name);
        this.isRunning = false;
        this.isTicking = false;
        this.startedAt = null;
        this.tickInterval = null;
        this.totalExecutions = 0;
        this.config = {
            tickIntervalMs: 10000,
            maxOpenPositions: 5,
            maxDailyLossPercent: 5,
            defaultSlippage: 0.005,
            riskPerTradePercent: 1,
            minConfidence: 65,
        };
        this.REDIS_USER_STATE_PREFIX = 'smart-executor:user:';
        this.REDIS_GLOBAL_STATE = 'smart-executor:global';
        this.REDIS_PROCESSED_PREFIX = 'smart-executor:processed:';
        this.DB_USER_STATE_KEY = 'SMART_EXECUTOR_USER_STATE';
        this.logger.log('⚔️ Smart Executor initialized — DISABLED auto-start. Will ONLY run when a user explicitly enables it. (with news risk gate)');
        setTimeout(() => {
            this._startupCleanup().catch((err) => {
                this.logger.warn(`⚔️ Startup cleanup failed: ${err.message}`);
            });
        }, 20000);
    }
    async _startupCleanup() {
        try {
            if (!this.prisma?.isAvailable?.()) {
                this.logger.warn('⚔️ Skipping startup cleanup — DB not yet available');
                return;
            }
            this.logger.log('⚔️ Running startup phantom cleanup (preserving user data)...');
            try {
                const purgeResult = await this.purgePhantomPositions();
                if (purgeResult.deleted > 0) {
                    this.logger.log(`⚔️ STARTUP: Purged ${purgeResult.deleted} phantom (zero-value) position(s)`);
                }
            }
            catch (purgeErr) {
                this.logger.warn(`⚔️ Startup phantom purge failed (non-critical): ${purgeErr.message}`);
            }
            try {
                const staleClosed = await this._autoCloseStalePaperPositions();
                if (staleClosed > 0) {
                    this.logger.log(`⚔️ STARTUP: Auto-closed ${staleClosed} stale paper position(s) (>24h)`);
                }
            }
            catch (staleErr) {
                this.logger.warn(`⚔️ Startup stale cleanup failed (non-critical): ${staleErr.message}`);
            }
            try {
                const deletedBriefs = await this.prisma.tradingBrief.deleteMany({
                    where: {
                        OR: [
                            { expiresAt: { lt: new Date() } },
                            { isActive: false },
                        ],
                    },
                });
                if (deletedBriefs.count > 0) {
                    this.logger.log(`⚔️ STARTUP: Purged ${deletedBriefs.count} expired TradingBrief(s) (preserving active ones)`);
                }
            }
            catch (briefErr) {
                this.logger.warn(`⚔️ Failed to purge expired TradingBrief records: ${briefErr.message}`);
            }
            try {
                const userKeys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
                for (const key of userKeys) {
                    await this.redis.del(key);
                }
                if (userKeys.length > 0) {
                    this.logger.log(`⚔️ STARTUP: Cleared ${userKeys.length} volatile Redis user state(s) (DB states preserved)`);
                }
            }
            catch (redisErr) {
                this.logger.warn(`⚔️ Failed to clear executor Redis states: ${redisErr.message}`);
            }
            try {
                const disabledStates = await this.prisma.setting.deleteMany({
                    where: {
                        key: { startsWith: this.DB_USER_STATE_KEY },
                        value: { contains: '"enabled":false' },
                    },
                });
                if (disabledStates.count > 0) {
                    this.logger.log(`⚔️ STARTUP: Cleaned up ${disabledStates.count} already-disabled DB executor state(s)`);
                }
            }
            catch (dbCleanErr) {
                this.logger.warn(`⚔️ Failed to clean up disabled DB user states: ${dbCleanErr.message}`);
            }
            try {
                await this.redis.del(this.REDIS_GLOBAL_STATE);
            }
            catch { }
            try {
                const lockKeys = await this.redis.scanKeys('position-lock:*');
                for (const key of lockKeys) {
                    await this.redis.del(key);
                }
                if (lockKeys.length > 0) {
                    this.logger.log(`⚔️ STARTUP: Cleared ${lockKeys.length} stale position-lock key(s) from Redis (V130 fix)`);
                }
            }
            catch (lockErr) {
                this.logger.warn(`⚔️ Failed to clear position-lock keys: ${lockErr.message}`);
            }
            try {
                const idempotencyKeys = await this.redis.scanKeys('idempotency:*');
                for (const key of idempotencyKeys) {
                    await this.redis.del(key);
                }
                if (idempotencyKeys.length > 0) {
                    this.logger.log(`⚔️ STARTUP: Cleared ${idempotencyKeys.length} stale idempotency key(s) from Redis (V132 fix)`);
                }
            }
            catch (idempErr) {
                this.logger.warn(`⚔️ Failed to clear idempotency keys: ${idempErr.message}`);
            }
            try {
                const oldCbKeys = await this.redis.scanKeys('circuit-breaker:*');
                let oldCbCleaned = 0;
                for (const key of oldCbKeys) {
                    if (key.startsWith('circuit-breaker:v2:'))
                        continue;
                    await this.redis.del(key);
                    oldCbCleaned++;
                }
                if (oldCbCleaned > 0) {
                    this.logger.log(`⚔️ STARTUP: Cleared ${oldCbCleaned} old-format circuit breaker key(s) from Redis (V137 — cross-user contamination fix)`);
                }
            }
            catch (cbCleanErr) {
                this.logger.warn(`⚔️ Failed to clear old circuit breaker keys: ${cbCleanErr.message}`);
            }
            try {
                const priceCachePatterns = [
                    'fallback:quote:*',
                    'fallback:lastprice:*',
                    'binance:quote:*',
                    'twelvedata:quote:*',
                    'exchange:quote:*',
                    'aggregator:quote:*',
                ];
                let purgedPriceKeys = 0;
                for (const pattern of priceCachePatterns) {
                    try {
                        const keys = await this.redis.scanKeys(pattern);
                        for (const key of keys) {
                            await this.redis.del(key);
                            purgedPriceKeys++;
                        }
                    }
                    catch { }
                }
                if (purgedPriceKeys > 0) {
                    this.logger.log(`⚔️ STARTUP: Purged ${purgedPriceKeys} stale price cache key(s) from Redis`);
                }
            }
            catch (priceErr) {
                this.logger.warn(`⚔️ Failed to purge price cache: ${priceErr.message}`);
            }
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const deletedAutoTrades = await this.prisma.autonomousTrade.deleteMany({
                    where: { createdAt: { lt: sevenDaysAgo } },
                });
                if (deletedAutoTrades.count > 0) {
                    this.logger.log(`⚔️ STARTUP: Purged ${deletedAutoTrades.count} stale AutonomousTrade(s) (>7 days)`);
                }
            }
            catch (autoTradeErr) {
                this.logger.warn(`⚔️ Failed to purge stale AutonomousTrade records: ${autoTradeErr.message}`);
            }
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const deletedPaperOrders = await this.prisma.paperOrder.deleteMany({
                    where: { createdAt: { lt: sevenDaysAgo } },
                });
                if (deletedPaperOrders.count > 0) {
                    this.logger.log(`⚔️ STARTUP: Purged ${deletedPaperOrders.count} stale PaperOrder(s) (>7 days)`);
                }
            }
            catch (paperErr) {
                this.logger.warn(`⚔️ Failed to purge stale PaperOrder records: ${paperErr.message}`);
            }
            try {
                const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
                const staleProcessedKeys = await this.prisma.setting.deleteMany({
                    where: {
                        key: { startsWith: this.REDIS_PROCESSED_PREFIX },
                        updatedAt: { lt: twoDaysAgo },
                    },
                });
                if (staleProcessedKeys.count > 0) {
                    this.logger.log(`⚔️ V143 STARTUP: Purged ${staleProcessedKeys.count} stale processedKey DB entries (>48h old)`);
                }
            }
            catch (processedKeyErr) {
                this.logger.warn(`⚔️ V143 Failed to purge stale processedKey entries: ${processedKeyErr.message}`);
            }
            this.logger.log('⚔️ Startup cleanup complete (user data preserved)');
            try {
                const enabledStates = await this.prisma.setting.findMany({
                    where: {
                        key: { startsWith: this.DB_USER_STATE_KEY },
                        value: { contains: '"enabled":true' },
                    },
                });
                if (enabledStates.length > 0) {
                    this.logger.log(`⚔️ RESTORE: Found ${enabledStates.length} explicitly-enabled user(s) in DB — re-enabling...`);
                    for (const state of enabledStates) {
                        try {
                            const userId = state.key.replace(this.DB_USER_STATE_KEY, '');
                            const stateData = JSON.parse(state.value);
                            await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(stateData), 86400000 * 7);
                            this.logger.log(`⚔️ RESTORE: Re-enabled user ${userId} from DB`);
                        }
                        catch (restoreErr) {
                            this.logger.warn(`⚔️ Failed to restore user state: ${restoreErr.message}`);
                        }
                    }
                    if (!this.isRunning) {
                        this.logger.log(`⚔️ RESTORE: Auto-starting executor for ${enabledStates.length} restored user(s)`);
                        await this.start('auto-restore');
                    }
                }
            }
            catch (restoreErr) {
                this.logger.warn(`⚔️ Failed to auto-restore enabled users: ${restoreErr.message}`);
            }
        }
        catch (error) {
            this.logger.warn(`⚔️ Startup cleanup failed (non-critical): ${error.message}`);
        }
    }
    onModuleDestroy() {
        this.stop();
    }
    async start(userId) {
        if (this.isRunning) {
            this.logger.warn('⚔️ Smart Executor is already running');
            return this.getStatus();
        }
        this.isRunning = true;
        this.startedAt = new Date();
        this.logger.log('⚔️ Smart Executor ACTIVATED — monitoring briefs every 2 seconds');
        this._startTickLoop();
        await this.redis.set(this.REDIS_GLOBAL_STATE, JSON.stringify({ isRunning: true, startedAt: this.startedAt.toISOString() }), 86400000);
        await this.audit.log({
            userId: userId || 'system',
            action: 'SMART_EXECUTOR_START',
            resource: 'smart-executor',
            details: JSON.stringify({ startedAt: this.startedAt }),
        });
        return this.getStatus();
    }
    async stop(userId) {
        const enabledUsers = await this._getEnabledUsers();
        const otherUsersEnabled = enabledUsers.some(id => id !== userId);
        if (otherUsersEnabled) {
            this.logger.warn(`⚔️ Cannot stop executor — ${enabledUsers.length} user(s) still enabled. Only individual disable is allowed.`);
            return this.getStatus();
        }
        if (!this.isRunning) {
            return this.getStatus();
        }
        this.isRunning = false;
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        this.logger.log('⚔️ Smart Executor STOPPED — no enabled users remain');
        await this.redis.set(this.REDIS_GLOBAL_STATE, JSON.stringify({ isRunning: false, stoppedAt: new Date().toISOString() }), 86400000);
        await this.audit.log({
            userId: userId || 'system',
            action: 'SMART_EXECUTOR_STOP',
            resource: 'smart-executor',
            details: JSON.stringify({ stoppedAt: new Date() }),
        });
        return this.getStatus();
    }
    async enableUser(userId, config) {
        if (!this.isRunning) {
            this.logger.log(`⚔️ Executor not running — auto-starting on behalf of user ${userId}`);
            try {
                await this.start(userId);
            }
            catch (error) {
                this.logger.warn(`⚔️ Failed to auto-start executor for user ${userId}: ${error.message}`);
            }
        }
        let activeCredentialId;
        try {
            const activeSetting = await this.prisma.setting.findFirst({
                where: { key: `user:${userId}:activeCredentialId` },
            });
            if (activeSetting?.value) {
                activeCredentialId = activeSetting.value;
                this.logger.log(`⚔️ V126 User ${userId} has active account: ${activeCredentialId}`);
            }
            else {
                this.logger.log(`⚔️ V126 User ${userId} has no active account selected — will skip execution until one is set`);
            }
        }
        catch (err) {
            this.logger.warn(`⚔️ V126 Could not read activeCredentialId for user ${userId}: ${err.message}`);
        }
        const userRiskSettings = await this._loadUserRiskSettings(userId);
        let isPaperTrading = false;
        let isTestnet = false;
        let exchangeName;
        if (activeCredentialId) {
            try {
                const cred = await this.prisma.exchangeCredential.findFirst({
                    where: { id: activeCredentialId, userId },
                    select: { testnet: true, exchange: true },
                });
                if (cred) {
                    isPaperTrading = cred.exchange === 'paper-trading';
                    isTestnet = cred.testnet === true && cred.exchange !== 'paper-trading';
                    exchangeName = cred.exchange;
                }
                else {
                    this.logger.warn(`⚔️ CRITICAL: activeCredentialId=${activeCredentialId} not found for user ${userId} ` +
                        `— credential was deleted. Auto-selecting new credential.`);
                    try {
                        await this.prisma.setting.deleteMany({
                            where: { key: `user:${userId}:activeCredentialId` },
                        });
                    }
                    catch { }
                    const newCred = await this.prisma.exchangeCredential.findFirst({
                        where: { userId, isValid: true },
                        orderBy: { createdAt: 'desc' },
                        select: { id: true, testnet: true, exchange: true },
                    });
                    if (newCred) {
                        activeCredentialId = newCred.id;
                        isPaperTrading = newCred.exchange === 'paper-trading';
                        isTestnet = newCred.testnet === true && newCred.exchange !== 'paper-trading';
                        exchangeName = newCred.exchange;
                        await this.prisma.setting.upsert({
                            where: { key: `user:${userId}:activeCredentialId` },
                            update: { value: newCred.id },
                            create: { key: `user:${userId}:activeCredentialId`, value: newCred.id },
                        });
                        this.logger.log(`⚔️ Auto-selected new credential ${newCred.id} (${newCred.exchange}) for user ${userId}`);
                    }
                    else {
                        activeCredentialId = undefined;
                        isPaperTrading = true;
                    }
                }
            }
            catch (err) {
                this.logger.warn(`⚔️ V135 Could not read credential metadata for user ${userId}: ${err.message}`);
            }
        }
        else {
            isPaperTrading = true;
        }
        const state = {
            enabled: true,
            dailyPnL: 0,
            dailyTrades: 0,
            dailyResetAt: new Date().toISOString(),
            lastTradeAt: null,
            consecutiveLosses: 0,
            maxOpenPositions: config?.maxOpenPositions || userRiskSettings.maxOpenPositions,
            riskPerTradePercent: config?.riskPerTradePercent || userRiskSettings.riskPerTradePercent,
            activeCredentialId,
            isPaperTrading,
            isTestnet,
            exchangeName,
        };
        await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(state), 86400000 * 7);
        await this._persistUserStateToDB(userId, state);
        this.logger.log(`⚔️ V126 Executor enabled for user ${userId} ` +
            `(activeCredential: ${activeCredentialId || 'none'}) — saved to Redis + DB`);
        await this.audit.log({
            userId,
            action: 'SMART_EXECUTOR_USER_ENABLED',
            resource: 'smart-executor',
            details: JSON.stringify(state),
        });
        return state;
    }
    async disableUser(userId) {
        await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
        await this._removeUserStateFromDB(userId);
        this.logger.log(`⚔️ Executor disabled for user ${userId} — removed from Redis + DB`);
        const remainingUsers = await this._getEnabledUsers();
        if (remainingUsers.length === 0 && this.isRunning) {
            this.logger.log(`⚔️ No enabled users remain — stopping tick loop`);
            this.isRunning = false;
            if (this.tickInterval) {
                clearInterval(this.tickInterval);
                this.tickInterval = null;
            }
            await this.redis.set(this.REDIS_GLOBAL_STATE, JSON.stringify({ isRunning: false, stoppedAt: new Date().toISOString() }), 86400000).catch(() => { });
        }
        await this.audit.log({
            userId,
            action: 'SMART_EXECUTOR_USER_DISABLED',
            resource: 'smart-executor',
        });
    }
    async getUserState(userId) {
        const raw = await this.redis.get(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
        if (raw) {
            return JSON.parse(raw);
        }
        const dbState = await this._loadUserStateFromDB(userId);
        if (dbState) {
            this.logger.log(`⚔️ Recovered user ${userId} state from DB (Redis lost it — likely restart)`);
            await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(dbState), 86400000 * 7);
            return dbState;
        }
        return null;
    }
    async getStatus(userId) {
        let todayExecutions = 0;
        let todayPnL = 0;
        let openPositions = 0;
        let activeBriefs = 0;
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const auditWhere = {
                action: 'SMART_EXECUTOR_TRADE',
                createdAt: { gte: startOfDay },
            };
            if (userId)
                auditWhere.userId = userId;
            const todayLogs = await this.prisma.auditLog.findMany({ where: auditWhere });
            todayExecutions = todayLogs.length;
            if (todayExecutions === 0) {
                try {
                    const tradeWhere = {
                        source: { in: ['smart_executor', 'auto_paper'] },
                        type: 'ENTRY',
                        executedAt: { gte: startOfDay },
                    };
                    if (userId)
                        tradeWhere.userId = userId;
                    todayExecutions = await this.prisma.trade.count({ where: tradeWhere });
                }
                catch (tradeErr) {
                    this.logger.debug(`getStatus: trade count fallback failed: ${tradeErr.message}`);
                }
            }
        }
        catch (e) {
            this.logger.debug(`getStatus: auditLog query failed: ${e.message}`);
        }
        try {
            const posWhere = { status: 'OPEN' };
            if (userId) {
                posWhere.userId = userId;
            }
            else {
                posWhere.AND = [
                    { entryPrice: { gt: 0 } },
                ];
            }
            openPositions = await this.prisma.position.count({ where: posWhere });
        }
        catch (e) {
            this.logger.debug(`getStatus: position count failed: ${e.message}`);
        }
        try {
            activeBriefs = await this.councilService.getActiveBriefsCount();
        }
        catch (e) {
            this.logger.debug(`getStatus: activeBriefs count failed: ${e.message}`);
        }
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const pnlWhere = {
                type: { in: ['EXIT', 'PARTIAL_EXIT'] },
                executedAt: { gte: startOfDay },
                pnl: { not: null },
            };
            if (userId)
                pnlWhere.userId = userId;
            const pnlTrades = await this.prisma.trade.findMany({
                where: pnlWhere,
                select: { pnl: true },
            });
            todayPnL = pnlTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
        }
        catch (e) {
            this.logger.debug(`getStatus: todayPnL calculation failed: ${e.message}`);
        }
        let dailyLossLimitReached = false;
        try {
            const threshold = this.config.maxDailyLossPercent;
            if (userId) {
                const userState = await this.getUserState(userId);
                if (userState && userState.enabled) {
                    let isSimulated = false;
                    try {
                        const activeCredId = userState.activeCredentialId;
                        if (activeCredId) {
                            const cred = await this.prisma.exchangeCredential.findFirst({
                                where: { id: activeCredId, userId },
                                select: { testnet: true, exchange: true },
                            });
                            if (cred && (cred.testnet === true || this._isSimulatedExchange(cred.exchange))) {
                                isSimulated = true;
                            }
                        }
                        else {
                            isSimulated = true;
                        }
                    }
                    catch (credErr) {
                        this.logger.debug(`getStatus: could not check credential type for ${userId}: ${credErr.message}`);
                    }
                    if (!isSimulated) {
                        const portfolio = await this._getPortfolioValue(userId);
                        if (portfolio > 0) {
                            const lossLimit = portfolio * (threshold / 100);
                            dailyLossLimitReached = todayPnL < -lossLimit;
                        }
                    }
                    else {
                        this.logger.debug(`getStatus: daily limit check BYPASSED for user ${userId} — simulated account`);
                    }
                }
            }
            else {
                const enabledUsers = await this._getEnabledUsers();
                for (const uid of enabledUsers) {
                    try {
                        const userState = await this.getUserState(uid);
                        if (userState && userState.enabled) {
                            let isSimulated = false;
                            try {
                                const activeCredId = userState.activeCredentialId;
                                if (activeCredId) {
                                    const cred = await this.prisma.exchangeCredential.findFirst({
                                        where: { id: activeCredId, userId: uid },
                                        select: { testnet: true, exchange: true },
                                    });
                                    if (cred && (cred.testnet === true || this._isSimulatedExchange(cred.exchange))) {
                                        isSimulated = true;
                                    }
                                }
                                else {
                                    isSimulated = true;
                                }
                            }
                            catch { }
                            if (isSimulated)
                                continue;
                            const portfolio = await this._getPortfolioValue(uid);
                            if (portfolio > 0) {
                                const lossLimit = portfolio * (threshold / 100);
                                const startOfDay = new Date();
                                startOfDay.setHours(0, 0, 0, 0);
                                const userPnlWhere = {
                                    type: { in: ['EXIT', 'PARTIAL_EXIT'] },
                                    executedAt: { gte: startOfDay },
                                    pnl: { not: null },
                                    userId: uid,
                                };
                                const userPnlTrades = await this.prisma.trade.findMany({
                                    where: userPnlWhere,
                                    select: { pnl: true },
                                });
                                const userDailyPnL = userPnlTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
                                if (userDailyPnL < -lossLimit) {
                                    dailyLossLimitReached = true;
                                    break;
                                }
                            }
                        }
                    }
                    catch (userErr) {
                        this.logger.debug(`getStatus: dailyLoss check failed for user ${uid}: ${userErr.message}`);
                    }
                }
            }
        }
        catch (lossErr) {
            this.logger.debug(`getStatus: dailyLossLimitReached check failed: ${lossErr.message}`);
        }
        return {
            isRunning: this.isRunning,
            startedAt: this.startedAt,
            totalExecutions: this.totalExecutions,
            todayExecutions,
            todayPnL,
            openPositions,
            lastCheckAt: this.isRunning ? new Date() : null,
            dailyLossLimitReached,
            lastError: null,
            activeBriefs,
        };
    }
    async getOpenPositions(userId) {
        try {
            if (!userId || typeof userId !== 'string' || userId.trim() === '') {
                this.logger.warn('🚨 V168: getOpenPositions called without userId — returning empty (security)');
                return [];
            }
            const where = { status: 'OPEN', userId };
            where.source = { in: ['smart_executor', 'auto_paper'] };
            const positions = await this.prisma.position.findMany({
                where,
                orderBy: { openedAt: 'desc' },
            });
            return positions.filter((pos) => {
                const qty = Number(pos.quantity);
                const entryPrice = Number(pos.entryPrice);
                const tradeValue = qty * entryPrice;
                return entryPrice > 0 && tradeValue >= 1;
            });
        }
        catch {
            return [];
        }
    }
    async purgePhantomPositions(userId) {
        try {
            if (!userId || typeof userId !== 'string' || userId.trim() === '') {
                this.logger.warn('🚨 V168: purgePhantomPositions called without userId — skipping (security)');
                return { deleted: 0 };
            }
            const where = { status: 'OPEN', userId };
            const allPositions = await this.prisma.position.findMany({ where });
            const phantomIds = [];
            for (const pos of allPositions) {
                const qty = Number(pos.quantity);
                const entryPrice = Number(pos.entryPrice);
                const tradeValue = qty * entryPrice;
                if (entryPrice <= 0 || tradeValue < 1) {
                    phantomIds.push(pos.id);
                }
            }
            if (phantomIds.length > 0) {
                await this.prisma.position.deleteMany({
                    where: { id: { in: phantomIds } },
                });
                this.logger.log(`⚔️ Purged ${phantomIds.length} phantom position(s) from database`);
            }
            return { deleted: phantomIds.length };
        }
        catch (error) {
            this.logger.error(`⚔️ Failed to purge phantom positions: ${error.message}`);
            return { deleted: 0 };
        }
    }
    async resetAutoEnabledUsers() {
        try {
            const enabledUsers = await this._getEnabledUsers();
            let disabled = 0;
            for (const userId of enabledUsers) {
                await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
                disabled++;
                this.logger.log(`⚔️ Reset auto-enabled user: ${userId}`);
            }
            this.logger.log(`⚔️ Reset ${disabled} auto-enabled user(s) — they must re-enable manually`);
            return { disabled };
        }
        catch (error) {
            this.logger.error(`⚔️ Failed to reset auto-enabled users: ${error.message}`);
            return { disabled: 0 };
        }
    }
    async nuclearCleanup(userId) {
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            this.logger.error('🚨 V168: nuclearCleanup called without userId — BLOCKED (security)');
            return {
                briefs: 0, positions: 0, trades: 0, paperOrders: 0,
                paperCredentials: 0, redisUsers: 0, redisProcessed: 0, executorStopped: false,
            };
        }
        const result = {
            briefs: 0,
            positions: 0,
            trades: 0,
            paperOrders: 0,
            paperCredentials: 0,
            redisUsers: 0,
            redisProcessed: 0,
            executorStopped: false,
        };
        this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Starting deletion of paper data for user ${userId}...`);
        try {
            await this.stop('nuclear-cleanup');
            result.executorStopped = true;
            this.logger.log('⚔️ NUCLEAR CLEANUP: Executor stopped');
        }
        catch (e) {
            this.logger.warn(`⚔️ NUCLEAR CLEANUP: Failed to stop executor: ${e.message}`);
        }
        try {
            const briefCount = await this.prisma.tradingBrief.count({ where: { userId } });
            if (briefCount > 0) {
                await this.prisma.tradingBrief.deleteMany({ where: { userId } });
                result.briefs = briefCount;
                this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${briefCount} TradingBriefs for user ${userId}`);
            }
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete TradingBriefs: ${e.message}`);
        }
        try {
            const paperPositions = await this.prisma.position.findMany({
                where: { userId, exchange: 'paper-trading' },
                select: { id: true },
            });
            if (paperPositions.length > 0) {
                await this.prisma.position.deleteMany({
                    where: { id: { in: paperPositions.map(p => p.id) } },
                });
                result.positions = paperPositions.length;
                this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${paperPositions.length} paper-trading Positions for user ${userId}`);
            }
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Positions: ${e.message}`);
        }
        try {
            const paperTrades = await this.prisma.trade.findMany({
                where: { userId, exchange: 'paper-trading' },
                select: { id: true },
            });
            if (paperTrades.length > 0) {
                await this.prisma.trade.deleteMany({
                    where: { id: { in: paperTrades.map(t => t.id) } },
                });
                result.trades = paperTrades.length;
                this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${paperTrades.length} paper-trading Trades for user ${userId}`);
            }
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Trades: ${e.message}`);
        }
        try {
            const paperOrderCount = await this.prisma.paperOrder.count({ where: { userId } });
            if (paperOrderCount > 0) {
                await this.prisma.paperOrder.deleteMany({ where: { userId } });
                result.paperOrders = paperOrderCount;
                this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${paperOrderCount} PaperOrders for user ${userId}`);
            }
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete PaperOrders: ${e.message}`);
        }
        try {
            const paperCreds = await this.prisma.exchangeCredential.findMany({
                where: { userId, exchange: 'paper-trading' },
                select: { id: true },
            });
            if (paperCreds.length > 0) {
                await this.prisma.exchangeCredential.deleteMany({
                    where: { id: { in: paperCreds.map(c => c.id) } },
                });
                result.paperCredentials = paperCreds.length;
                this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${paperCreds.length} paper-trading Credentials for user ${userId}`);
            }
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Credentials: ${e.message}`);
        }
        try {
            await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
            result.redisUsers = 1;
            this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Cleared Redis user state for ${userId}`);
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear Redis user state: ${e.message}`);
        }
        try {
            const processedKeys = await this.redis.scanKeys(`${this.REDIS_PROCESSED_PREFIX}*${userId}`);
            for (const key of processedKeys) {
                await this.redis.del(key);
                result.redisProcessed++;
            }
            if (result.redisProcessed > 0) {
                this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Cleared ${result.redisProcessed} Redis processed keys for user ${userId}`);
            }
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear Redis processed keys: ${e.message}`);
        }
        try {
            await this.redis.del(this.REDIS_GLOBAL_STATE);
            this.logger.log('⚔️ NUCLEAR CLEANUP: Cleared global executor state from Redis');
        }
        catch (e) {
            this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear global state: ${e.message}`);
        }
        this.logger.log(`⚔️ NUCLEAR CLEANUP COMPLETE: briefs=${result.briefs}, positions=${result.positions}, ` +
            `trades=${result.trades}, paperOrders=${result.paperOrders}, ` +
            `paperCredentials=${result.paperCredentials}, redisUsers=${result.redisUsers}, ` +
            `redisProcessed=${result.redisProcessed}, executorStopped=${result.executorStopped}`);
        return result;
    }
    async _getEnabledUsers() {
        const userIds = new Set();
        try {
            const keys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
            for (const k of keys) {
                try {
                    const raw = await this.redis.get(k);
                    if (raw) {
                        const state = JSON.parse(raw);
                        if (state.enabled) {
                            const userId = k.replace(this.REDIS_USER_STATE_PREFIX, '');
                            userIds.add(userId);
                            await this.redis.expire(k, 86400000 * 7).catch(() => { });
                        }
                        else {
                            await this.redis.del(k).catch(() => { });
                        }
                    }
                }
                catch {
                    await this.redis.del(k).catch(() => { });
                }
            }
        }
        catch {
        }
        if (userIds.size > 0) {
            this.logger.debug(`⚔️ Enabled users: ${userIds.size}`);
        }
        return Array.from(userIds);
    }
    async _loadUserRiskSettings(userId) {
        const defaults = {
            riskPerTradePercent: this.config.riskPerTradePercent,
            maxOpenPositions: this.config.maxOpenPositions,
            maxDailyLossPercent: this.config.maxDailyLossPercent,
            stopLossPercent: 2,
            takeProfitPercent: 4,
            riskWarningAcknowledged: false,
        };
        try {
            let globalExecutorMaxPositions;
            let globalExecutorMinConfidence;
            let globalExecutorRiskPerTrade;
            try {
                const agentExecSetting = await this.prisma.setting.findFirst({
                    where: { key: 'agentExecutorConfig' },
                });
                if (agentExecSetting) {
                    const parsed = JSON.parse(agentExecSetting.value);
                    if (parsed.executorMaxOpenPositions)
                        globalExecutorMaxPositions = parseInt(parsed.executorMaxOpenPositions, 10);
                    if (parsed.executorMinConfidence)
                        globalExecutorMinConfidence = parseInt(parsed.executorMinConfidence, 10);
                    if (parsed.executorRiskPerTrade)
                        globalExecutorRiskPerTrade = parseFloat(parsed.executorRiskPerTrade);
                }
            }
            catch (globalErr) {
                this.logger.debug(`⚔️ V144: Could not read global agentExecutorConfig: ${globalErr.message}`);
            }
            const settings = await this.prisma.setting.findMany({
                where: { key: { startsWith: `user:${userId}:` } },
            });
            const map = {};
            for (const s of settings) {
                const cleanKey = s.key.replace(`user:${userId}:`, '');
                map[cleanKey] = s.value;
            }
            return {
                riskPerTradePercent: map.userRiskPerTrade
                    ? Math.max(0.1, Math.min(10, parseFloat(map.userRiskPerTrade)))
                    : defaults.riskPerTradePercent,
                maxOpenPositions: map.userMaxOpenPositions
                    ? (() => {
                        let val = Math.max(1, Math.min(50, parseInt(map.userMaxOpenPositions, 10)));
                        if (val <= 5) {
                            val = globalExecutorMaxPositions || this.config.maxOpenPositions;
                            this.prisma.setting.upsert({
                                where: { key: `user:${userId}:userMaxOpenPositions` },
                                update: { value: String(val) },
                                create: { key: `user:${userId}:userMaxOpenPositions`, value: String(val) },
                            }).catch(() => { });
                        }
                        return val;
                    })()
                    : (globalExecutorMaxPositions || defaults.maxOpenPositions),
                maxDailyLossPercent: map.userMaxDailyLoss
                    ? Math.max(1, Math.min(50, parseFloat(map.userMaxDailyLoss)))
                    : defaults.maxDailyLossPercent,
                stopLossPercent: map.userStopLoss
                    ? Math.max(0.1, Math.min(50, parseFloat(map.userStopLoss)))
                    : defaults.stopLossPercent,
                takeProfitPercent: map.userTakeProfit
                    ? Math.max(0.1, Math.min(100, parseFloat(map.userTakeProfit)))
                    : defaults.takeProfitPercent,
                riskWarningAcknowledged: map.riskWarningAcknowledged === 'true',
            };
        }
        catch (err) {
            this.logger.debug(`⚔️ Failed to load user risk settings for ${userId}: ${err.message} — using defaults`);
            return defaults;
        }
    }
    _startTickLoop() {
        this.tickInterval = setInterval(async () => {
            if (!this.isRunning || this.isTicking)
                return;
            this.isTicking = true;
            try {
                await this._tick();
            }
            catch (error) {
                this.logger.error(`⚔️ Tick error: ${error.message}`);
            }
            finally {
                this.isTicking = false;
            }
        }, this.config.tickIntervalMs);
        try {
            const subscriber = this.redis.duplicateSubscriber();
            if (subscriber) {
                subscriber.subscribe('council:session_complete');
                subscriber.on('message', (channel, message) => {
                    if (channel === 'council:session_complete' && this.isRunning && !this.isTicking) {
                        this.logger.log('⚔️ Council session complete event received — triggering immediate tick');
                        this.isTicking = true;
                        this._tick()
                            .catch((err) => this.logger.error(`⚔️ Event-triggered tick failed: ${err.message}`))
                            .finally(() => { this.isTicking = false; });
                    }
                });
                this.logger.log('⚔️ Subscribed to council:session_complete events');
            }
        }
        catch (subErr) {
            this.logger.warn(`⚔️ Could not subscribe to council events: ${subErr.message} — falling back to polling`);
        }
    }
    async _tick() {
        let consolidatedBriefs = [];
        try {
            consolidatedBriefs = await this.councilService.getConsolidatedBriefs();
        }
        catch (e) {
            this.logger.error(`⚔️ Failed to get consolidated briefs: ${e.message}`);
            return;
        }
        if (consolidatedBriefs.length === 0) {
            this.logger.debug('⚔️ No consolidated briefs to execute — waiting for Strategic Council');
            return;
        }
        const executorBriefs = consolidatedBriefs.filter((brief) => (0, strategic_council_types_1.isExecutorTimeframe)(brief.timeframe));
        if (executorBriefs.length === 0) {
            this.logger.debug(`⚔️ ${consolidatedBriefs.length} consolidated briefs but none match executor timeframes [${strategic_council_types_1.EXECUTOR_TIMEFRAMES.join(',')}] — waiting`);
            return;
        }
        this.logger.debug(`⚔️ V134 Tick: ${executorBriefs.length} consolidated executor briefs (one per pair, no conflicts)`);
        const enabledUsers = await this._getEnabledUsers();
        if (enabledUsers.length === 0) {
            this.logger.debug(`⚔️ ${executorBriefs.length} consolidated briefs available but no enabled users — skipping`);
            return;
        }
        this.logger.debug(`⚔️ V134 Tick: ${executorBriefs.length} consolidated executor briefs, ${enabledUsers.length} users`);
        for (const userId of enabledUsers) {
            try {
                await this._processUserBriefs(userId, executorBriefs);
            }
            catch (error) {
                this.logger.error(`⚔️ Error processing user ${userId}: ${error.message}`);
            }
        }
    }
    async _processUserBriefs(userId, briefs) {
        const userState = await this.getUserState(userId);
        if (!userState || !userState.enabled)
            return;
        if (userState.maxOpenPositions === 5) {
            try {
                const dbSetting = await this.prisma.setting.findFirst({
                    where: { key: `user:${userId}:userMaxOpenPositions` },
                });
                if (!dbSetting) {
                    userState.maxOpenPositions = this.config.maxOpenPositions;
                    await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(userState), 86400000 * 7);
                    this._persistUserStateToDB(userId, userState).catch(() => { });
                    this.logger.log(`⚔️ V143: Auto-upgraded user ${userId} maxOpenPositions from 5 to ${this.config.maxOpenPositions} (no explicit user setting)`);
                }
            }
            catch (err) {
                this.logger.debug(`⚔️ V143: Could not check userMaxOpenPositions for ${userId}: ${err.message}`);
            }
        }
        if (userState.routingMode !== undefined) {
            delete userState.routingMode;
            if (userState.credentialId && !userState.activeCredentialId) {
                userState.activeCredentialId = userState.credentialId;
            }
            delete userState.credentialId;
            await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(userState), 86400000 * 7);
            this._persistUserStateToDB(userId, userState).catch(() => { });
        }
        try {
            const activeSetting = await this.prisma.setting.findFirst({
                where: { key: `user:${userId}:activeCredentialId` },
            });
            const settingsActiveId = activeSetting?.value || undefined;
            if (settingsActiveId !== userState.activeCredentialId) {
                userState.activeCredentialId = settingsActiveId;
                await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(userState), 86400000 * 7);
                this._persistUserStateToDB(userId, userState).catch(() => { });
                if (settingsActiveId) {
                    this.logger.log(`⚔️ V126 Updated activeCredentialId for user ${userId}: ${settingsActiveId}`);
                }
            }
        }
        catch (err) {
            this.logger.debug(`⚔️ Could not refresh activeCredentialId for user ${userId}: ${err.message}`);
        }
        if (!userState.activeCredentialId) {
            try {
                const firstCred = await this.prisma.exchangeCredential.findFirst({
                    where: { userId, isValid: true },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true, exchange: true },
                });
                if (firstCred) {
                    userState.activeCredentialId = firstCred.id;
                    await this.prisma.setting.upsert({
                        where: { key: `user:${userId}:activeCredentialId` },
                        update: { value: firstCred.id },
                        create: { key: `user:${userId}:activeCredentialId`, value: firstCred.id },
                    }).catch(() => { });
                    this.logger.log(`⚔️ Auto-selected credential ${firstCred.id} (${firstCred.exchange}) for user ${userId}`);
                }
                else {
                    this.logger.debug(`⚔️ User ${userId} has no credentials at all — skipping`);
                    return;
                }
            }
            catch (err) {
                this.logger.warn(`⚔️ Could not auto-select credential for ${userId}: ${err.message}`);
                return;
            }
        }
        let isSimulated = false;
        try {
            const cred = await this.prisma.exchangeCredential.findFirst({
                where: { id: userState.activeCredentialId, userId },
                select: { testnet: true, exchange: true },
            });
            if (cred) {
                isSimulated = cred.testnet === true || this._isSimulatedExchange(cred.exchange);
                const newIsPaperTrading = cred.exchange === 'paper-trading';
                const newIsTestnet = cred.testnet === true && cred.exchange !== 'paper-trading';
                const newExchangeName = cred.exchange;
                if (userState.isPaperTrading !== newIsPaperTrading ||
                    userState.isTestnet !== newIsTestnet ||
                    userState.exchangeName !== newExchangeName) {
                    userState.isPaperTrading = newIsPaperTrading;
                    userState.isTestnet = newIsTestnet;
                    userState.exchangeName = newExchangeName;
                    await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(userState), 86400000 * 7);
                    this._persistUserStateToDB(userId, userState).catch(() => { });
                }
            }
        }
        catch (err) {
            this.logger.debug(`⚔️ Could not check credential type for user ${userId}: ${err.message}`);
        }
        try {
            const freshRiskSettings = await this._loadUserRiskSettings(userId);
            let needsUpdate = false;
            if (userState.riskPerTradePercent !== freshRiskSettings.riskPerTradePercent) {
                userState.riskPerTradePercent = freshRiskSettings.riskPerTradePercent;
                needsUpdate = true;
            }
            if (userState.maxOpenPositions !== freshRiskSettings.maxOpenPositions) {
                userState.maxOpenPositions = freshRiskSettings.maxOpenPositions;
                needsUpdate = true;
            }
            if (needsUpdate) {
                await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(userState), 86400000 * 7);
                this._persistUserStateToDB(userId, userState).catch(() => { });
            }
        }
        catch (err) {
            this.logger.debug(`⚔️ Failed to refresh risk settings for ${userId}: ${err.message}`);
        }
        const dailyResetAt = new Date(userState.dailyResetAt);
        const now = new Date();
        if (now.toDateString() !== dailyResetAt.toDateString()) {
            userState.dailyPnL = 0;
            userState.dailyTrades = 0;
            userState.dailyResetAt = now.toISOString();
            userState.consecutiveLosses = 0;
        }
        const portfolio = await this._getPortfolioValue(userId);
        if (!isSimulated) {
            let userMaxDailyLossPercent = this.config.maxDailyLossPercent;
            try {
                const riskSettings = await this._loadUserRiskSettings(userId);
                userMaxDailyLossPercent = riskSettings.maxDailyLossPercent;
            }
            catch { }
            if (portfolio > 0 && userState.dailyPnL < -(portfolio * userMaxDailyLossPercent / 100)) {
                const lossLimit = (portfolio * userMaxDailyLossPercent / 100).toFixed(2);
                this.logger.warn(`⚔️ HARD STOP: User ${userId} hit daily loss limit ` +
                    `(P&L: $${userState.dailyPnL.toFixed(2)} < -$${lossLimit} = ${userMaxDailyLossPercent}% of $${portfolio.toFixed(2)}) ` +
                    `— DISABLING executor and sending notification`);
                await this.disableUser(userId);
                try {
                    await this.prisma.setting.upsert({
                        where: { key: `user:${userId}:dailyLossHit` },
                        update: { value: new Date().toDateString() },
                        create: { key: `user:${userId}:dailyLossHit`, value: new Date().toDateString() },
                    });
                }
                catch { }
                try {
                    await this.notificationService.sendNotification({
                        userId,
                        type: 'RISK_WARNING',
                        priority: 'URGENT',
                        title: '🛑 تم إيقاف التداول — حد الخسارة اليومي',
                        body: `خسارة اليوم بلغت $${Math.abs(userState.dailyPnL).toFixed(2)} (${userMaxDailyLossPercent}% من المحفظة). تم إيقاف المنفذ الذكي تلقائياً حتى الغد.`,
                        source: 'smart-executor',
                    });
                }
                catch { }
                return;
            }
            try {
                const dailyLossFlag = await this.prisma.setting.findUnique({
                    where: { key: `user:${userId}:dailyLossHit` },
                });
                if (dailyLossFlag?.value === new Date().toDateString()) {
                    this.logger.warn(`⚔️ User ${userId} already hit daily loss limit today — executor remains disabled`);
                    await this.disableUser(userId);
                    return;
                }
            }
            catch { }
        }
        const executorMaxPositions = userState.maxOpenPositions || this.config.maxOpenPositions;
        let openPositionsCount = 0;
        let totalOpenPositionsCount = 0;
        try {
            openPositionsCount = await this.prisma.position.count({
                where: { userId, status: 'OPEN', entryPrice: { gt: 0 }, source: { in: ['smart_executor', 'auto_paper'] } },
            });
            totalOpenPositionsCount = await this.prisma.position.count({
                where: { userId, status: 'OPEN', entryPrice: { gt: 0 } },
            });
        }
        catch (dbErr) {
            this.logger.warn(`⚔️ V134 Failed to count open positions for ${userId}: ${dbErr.message}`);
        }
        const rgParams = this.riskGatekeeper.getRiskParameters();
        const rgMaxPositions = rgParams.maxOpenPositions;
        const effectiveMaxPositions = Math.min(executorMaxPositions, rgMaxPositions);
        if (openPositionsCount >= executorMaxPositions && !isSimulated) {
            this.logger.debug(`⚔️ User ${userId} at EXECUTOR max positions (${openPositionsCount}/${executorMaxPositions}) — skipping all briefs`);
            return;
        }
        if (totalOpenPositionsCount >= rgMaxPositions && !isSimulated) {
            this.logger.warn(`⚔️ V144: User ${userId} at RISK GATEKEEPER max positions (total=${totalOpenPositionsCount}/${rgMaxPositions}, executor=${openPositionsCount}/${executorMaxPositions}) — RiskGatekeeper would REJECT new trades. ` +
                `Consider increasing riskConfig.maxOpenPositions in admin settings.`);
        }
        if (openPositionsCount >= executorMaxPositions && isSimulated) {
            try {
                const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
                const oldestPosition = await this.prisma.position.findFirst({
                    where: { userId, status: 'OPEN', openedAt: { lt: oneHourAgo }, source: { in: ['smart_executor', 'auto_paper'] } },
                    orderBy: { openedAt: 'asc' },
                });
                if (oldestPosition) {
                    try {
                        await this.tradingService.closePositionWithRetry(userId, {
                            positionId: oldestPosition.id,
                            closeReason: 'AUTO_STALE',
                        });
                        const closePrice = Number(oldestPosition.currentPrice) || Number(oldestPosition.entryPrice);
                        const pnl = (closePrice - Number(oldestPosition.entryPrice)) * Number(oldestPosition.quantity) * (oldestPosition.side === 'SELL' ? -1 : 1);
                        userState.dailyPnL += pnl;
                        openPositionsCount--;
                        this.logger.log(`⚔️ Paper trading: auto-closed stale position ${oldestPosition.symbol} ` +
                            `(id: ${oldestPosition.id}, PnL: $${pnl.toFixed(2)}) via TradingService to make room for new brief`);
                        try {
                            const sideLabel = oldestPosition.side === 'BUY' ? 'شراء' : 'بيع';
                            const pnlLabel = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);
                            await this.notificationService.sendNotification({
                                userId,
                                type: 'POSITION_CLOSED',
                                priority: 'HIGH',
                                title: `⚔️ إغلاق تلقائي: ${oldestPosition.symbol}`,
                                body: `تم إغلاق مركز ${sideLabel} ${oldestPosition.symbol} تلقائياً لفتح مجال لصفقة جديدة | PnL: $${pnlLabel} | سعر الإغلاق: $${closePrice.toFixed(2)}`,
                                data: {
                                    positionId: oldestPosition.id,
                                    symbol: oldestPosition.symbol,
                                    side: oldestPosition.side,
                                    closePrice,
                                    pnl,
                                    reason: 'auto_close_stale',
                                    isSimulated: isSimulated,
                                },
                                source: 'executor',
                                action: 'CLOSE',
                                pair: oldestPosition.symbol,
                            });
                        }
                        catch (notifErr) {
                            this.logger.warn(`⚔️ Failed to send close notification for ${oldestPosition.id}: ${notifErr.message}`);
                        }
                    }
                    catch (closeErr) {
                        this.logger.warn(`⚔️ TradingService close failed for stale position ${oldestPosition.id}: ${closeErr.message} — skipping (no direct DB bypass)`);
                    }
                }
            }
            catch (closeErr) {
                this.logger.warn(`⚔️ Failed to auto-close stale position for paper user ${userId}: ${closeErr.message}`);
            }
        }
        for (const brief of briefs) {
            const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
            let alreadyProcessed = await this.redis.get(processedKey);
            if (!alreadyProcessed) {
                try {
                    const dbCheck = await this.prisma.setting.findFirst({
                        where: { key: `${processedKey}:db` },
                    });
                    if (dbCheck && dbCheck.value)
                        alreadyProcessed = dbCheck.value;
                }
                catch { }
            }
            if (alreadyProcessed) {
                try {
                    const processedData = typeof alreadyProcessed === 'string' ? JSON.parse(alreadyProcessed) : alreadyProcessed;
                    const positionId = processedData?.orderId || processedData?.positionId;
                    const isDuplicateBlocked = positionId === 'duplicate-blocked' ||
                        processedData?.reason === 'duplicate-order-idempotency';
                    if (positionId && !isDuplicateBlocked) {
                        const existingPos = await this.prisma.position.findFirst({
                            where: { id: positionId, userId, status: 'OPEN' },
                        });
                        if (!existingPos) {
                            this.logger.log(`⚔️ Clearing processedKey for brief ${brief.id} — position ${positionId} is no longer OPEN`);
                            await this.redis.del(processedKey);
                            try {
                                await this.prisma.setting.deleteMany({
                                    where: { key: `${processedKey}:db` },
                                });
                            }
                            catch { }
                            alreadyProcessed = null;
                        }
                    }
                }
                catch (parseErr) {
                    this.logger.debug(`⚔️ Could not check processedKey position status: ${parseErr.message}`);
                }
                if (alreadyProcessed) {
                    this.logger.debug(`⚔️ Skipping already-processed brief ${brief.id} for user ${userId}`);
                    continue;
                }
            }
            if (brief.confidence < this.config.minConfidence) {
                this.logger.debug(`⚔️ Skipping brief ${brief.id} — confidence ${brief.confidence}% < min ${this.config.minConfidence}%`);
                continue;
            }
            const existingPosition = await this.prisma.position.findFirst({
                where: { userId, symbol: brief.pair, status: 'OPEN' },
            });
            if (existingPosition) {
                const isSameDirection = existingPosition.side === brief.direction;
                if (isSameDirection) {
                    this.logger.debug(`⚔️ V133 Skipping brief ${brief.id} — existing ${existingPosition.side} position on ${brief.pair}`);
                    continue;
                }
                if (!isSimulated) {
                    this.logger.debug(`⚔️ Skipping brief ${brief.id} — existing ${existingPosition.side} position on ${brief.pair} (no hedge for real accounts)`);
                    continue;
                }
                const positionsOnSymbol = await this.prisma.position.count({
                    where: { userId, symbol: brief.pair, status: 'OPEN' },
                });
                if (positionsOnSymbol >= 2) {
                    this.logger.debug(`⚔️ V133 Skipping brief ${brief.id} — already ${positionsOnSymbol} positions on ${brief.pair} (hedge limit reached)`);
                    continue;
                }
                this.logger.log(`⚔️ V133 Hedge allowed: executing ${brief.direction} ${brief.pair} alongside existing ${existingPosition.side}`);
            }
            const currentOpenPositionsOnPair = await this.prisma.position.count({
                where: { userId, symbol: brief.pair, status: 'OPEN' },
            });
            const maxPerSymbol = isSimulated ? 2 : 1;
            if (currentOpenPositionsOnPair >= maxPerSymbol) {
                this.logger.debug(`⚔️ User ${userId} at max positions for ${brief.pair} (${currentOpenPositionsOnPair}/${maxPerSymbol}) — skipping brief ${brief.id}`);
                continue;
            }
            try {
                await this._checkBriefForUser(userId, brief, userState, portfolio, isSimulated);
            }
            catch (error) {
                this.logger.error(`⚔️ Error checking brief ${brief.id} for user ${userId}: ${error.message}`);
            }
        }
    }
    async _checkBriefForUser(userId, brief, userState, portfolioValue, isSimulated = false) {
        let currentPrice = 0;
        let priceSource = 'none';
        try {
            const quote = await this.exchangeService.getQuote(brief.pair);
            if (quote?.price > 0) {
                currentPrice = quote.price;
                priceSource = 'exchange';
            }
        }
        catch { }
        if (!currentPrice || currentPrice <= 0) {
            try {
                const marketData = await this.orchestrator.fetchQuickMarketData(brief.pair);
                if (marketData?.price > 0) {
                    currentPrice = marketData.price;
                    priceSource = 'orchestrator';
                }
            }
            catch { }
        }
        if (!currentPrice || currentPrice <= 0) {
            currentPrice = brief.entryPrice;
            priceSource = 'brief-entry';
            this.logger.warn(`⚔️ Using stale brief entry price for ${brief.pair}: ${currentPrice}`);
        }
        const PRICE_SANITY = {
            'BTC/USDT': { min: 20000, max: 250000 }, 'BTC/USD': { min: 20000, max: 250000 },
            'ETH/USDT': { min: 500, max: 15000 }, 'ETH/USD': { min: 500, max: 15000 },
            'SOL/USDT': { min: 5, max: 1000 }, 'SOL/USD': { min: 5, max: 1000 },
            'BNB/USDT': { min: 100, max: 3000 }, 'BNB/USD': { min: 100, max: 3000 },
            'XRP/USDT': { min: 0.1, max: 10 }, 'XRP/USD': { min: 0.1, max: 10 },
            'ADA/USDT': { min: 0.05, max: 5 }, 'ADA/USD': { min: 0.05, max: 5 },
            'DOGE/USDT': { min: 0.01, max: 2 }, 'DOGE/USD': { min: 0.01, max: 2 },
            'DOT/USDT': { min: 1, max: 50 }, 'DOT/USD': { min: 1, max: 50 },
            'AVAX/USDT': { min: 5, max: 200 }, 'AVAX/USD': { min: 5, max: 200 },
            'LINK/USDT': { min: 2, max: 50 }, 'LINK/USD': { min: 2, max: 50 },
            'MATIC/USDT': { min: 0.1, max: 5 }, 'MATIC/USD': { min: 0.1, max: 5 },
            'EUR/USD': { min: 0.8, max: 1.5 }, 'GBP/USD': { min: 1.0, max: 1.8 },
            'USD/JPY': { min: 100, max: 200 }, 'XAU/USD': { min: 1000, max: 5000 },
        };
        const sanity = PRICE_SANITY[brief.pair];
        if (sanity && (currentPrice < sanity.min || currentPrice > sanity.max)) {
            this.logger.error(`⚔️ PRICE SANITY FAILED for ${brief.pair}: $${currentPrice} from ${priceSource} is outside [${sanity.min}, ${sanity.max}] — ` +
                `using brief entry price $${brief.entryPrice} instead`);
            currentPrice = brief.entryPrice;
            priceSource = 'brief-entry (sanity-fallback)';
        }
        this.logger.debug(`⚔️ ${brief.pair}: price=$${currentPrice} from ${priceSource}`);
        const strictRules = brief.strictRules || { maxSlippage: this.config.defaultSlippage };
        if (!isSimulated) {
            if (strictRules.maxEntryPrice && currentPrice > strictRules.maxEntryPrice) {
                this.logger.debug(`⚔️ Brief ${brief.id} price ${currentPrice} > maxEntry ${strictRules.maxEntryPrice} — waiting`);
                return;
            }
            if (strictRules.minEntryPrice && currentPrice < strictRules.minEntryPrice) {
                this.logger.debug(`⚔️ Brief ${brief.id} price ${currentPrice} < minEntry ${strictRules.minEntryPrice} — waiting`);
                return;
            }
        }
        const conditionsMet = isSimulated || this._areEntryConditionsMet(brief, currentPrice, strictRules);
        if (conditionsMet) {
            if (!isSimulated) {
                try {
                    const newsCheck = await this._checkNewsRisk(brief.pair, brief.direction);
                    if (newsCheck.blocked) {
                        this.logger.warn(`⚔️ V144: News risk gate BLOCKED ${brief.direction} ${brief.pair} — ` +
                            `${newsCheck.reason} (risk=${newsCheck.riskLevel}, score=${newsCheck.score.toFixed(2)})`);
                        return;
                    }
                    else if (newsCheck.warning) {
                        this.logger.log(`⚔️ V144: News risk warning for ${brief.direction} ${brief.pair} — ` +
                            `${newsCheck.reason} (proceeding with caution)`);
                    }
                }
                catch (newsError) {
                    this.logger.warn(`⚔️ V144: News risk check failed: ${newsError.message} — proceeding without news gate`);
                }
            }
            const result = await this._executeBriefForUser(userId, brief, currentPrice, userState, portfolioValue);
            if (result.success) {
                const TIMEFRAME_TTL_MS = {
                    M1: 1 * 60 * 1000,
                    M5: 5 * 60 * 1000,
                    M15: 15 * 60 * 1000,
                    M30: 30 * 60 * 1000,
                    H1: 1 * 60 * 60 * 1000,
                    H4: 4 * 60 * 60 * 1000,
                    D1: 24 * 60 * 60 * 1000,
                    W1: 7 * 24 * 60 * 60 * 1000,
                };
                const processedTtlMs = TIMEFRAME_TTL_MS[brief.timeframe] || 15 * 60 * 1000;
                const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
                const processedValue = JSON.stringify({ orderId: result.orderId, executedAt: new Date().toISOString(), pair: brief.pair, timeframe: brief.timeframe });
                await this.redis.set(processedKey, processedValue, processedTtlMs);
                try {
                    await this.prisma.setting.upsert({
                        where: { key: `${processedKey}:db` },
                        update: { value: processedValue },
                        create: { key: `${processedKey}:db`, value: processedValue },
                    });
                }
                catch { }
                this.totalExecutions++;
                this.logger.log(`⚔️ EXECUTED: ${brief.direction} ${brief.pair} @ ${currentPrice} ` +
                    `(brief: ${brief.id}, order: ${result.orderId}, user: ${userId})`);
                this.logger.debug(`⚔️ Brief ${brief.id} remains ACTIVE after execution — dedup handled by processedKey + Position.findFirst`);
                userState.dailyTrades++;
                userState.lastTradeAt = new Date().toISOString();
                await this.redis.set(`${this.REDIS_USER_STATE_PREFIX}${userId}`, JSON.stringify(userState), 86400000 * 7);
                this._persistUserStateToDB(userId, userState).catch(() => { });
                try {
                    const directionAr = brief.direction === 'BUY' ? 'شراء' : 'بيع';
                    const modeLabel = isSimulated ? 'ورقي' : 'حقيقي';
                    await this.notificationService.sendNotification({
                        userId,
                        type: 'POSITION_OPENED',
                        priority: 'HIGH',
                        title: `⚔️ المنفذ الذكي: ${directionAr} ${brief.pair}`,
                        body: `تم تنفيذ ${directionAr} ${brief.pair} @ $${currentPrice.toFixed(2)} | ثقة ${brief.confidence}% | وضع ${modeLabel} | وقف خسارة: $${brief.stopLoss?.toFixed(2) || 'غير محدد'} | هدف: $${brief.takeProfit?.toFixed(2) || 'غير محدد'}`,
                        data: {
                            briefId: brief.id,
                            orderId: result.orderId,
                            pair: brief.pair,
                            direction: brief.direction,
                            entryPrice: currentPrice,
                            stopLoss: brief.stopLoss,
                            takeProfit: brief.takeProfit,
                            confidence: brief.confidence,
                            isSimulated: isSimulated,
                        },
                        source: 'executor',
                        action: brief.direction === 'BUY' ? 'BUY' : 'SELL',
                        pair: brief.pair,
                    });
                }
                catch (notifError) {
                    this.logger.warn(`⚔️ Failed to send execution notification to user ${userId}: ${notifError.message}`);
                }
            }
            else {
                const isDuplicateOrder = result.error?.includes('أمر مكرر') ||
                    result.error?.includes('duplicate');
                if (isDuplicateOrder) {
                    this.logger.warn(`⚔️ Brief ${brief.id} for ${brief.pair} returned "أمر مكرر" — marking as processed to prevent infinite retry loop`);
                    const TIMEFRAME_TTL_MS = {
                        M1: 1 * 60 * 1000,
                        M5: 5 * 60 * 1000,
                        M15: 15 * 60 * 1000,
                        M30: 30 * 60 * 1000,
                        H1: 1 * 60 * 60 * 1000,
                        H4: 4 * 60 * 60 * 1000,
                        D1: 24 * 60 * 60 * 1000,
                        W1: 7 * 24 * 60 * 60 * 1000,
                    };
                    const processedTtlMs = TIMEFRAME_TTL_MS[brief.timeframe] || 15 * 60 * 1000;
                    const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
                    const processedValue = JSON.stringify({
                        orderId: 'duplicate-blocked',
                        executedAt: new Date().toISOString(),
                        pair: brief.pair,
                        timeframe: brief.timeframe,
                        reason: 'duplicate-order-idempotency',
                    });
                    await this.redis.set(processedKey, processedValue, processedTtlMs);
                    try {
                        await this.prisma.setting.upsert({
                            where: { key: `${processedKey}:db` },
                            update: { value: processedValue },
                            create: { key: `${processedKey}:db`, value: processedValue },
                        });
                    }
                    catch { }
                }
                else {
                    const isPositionLimitRejection = result.error?.includes('مركز مفتوح') ||
                        result.error?.includes('POSITION_SIZE_LIMIT') ||
                        result.error?.includes('الحد الأقصى');
                    if (isPositionLimitRejection) {
                        const rgParams = this.riskGatekeeper.getRiskParameters();
                        const totalPos = await this.prisma.position.count({
                            where: { userId, status: 'OPEN', entryPrice: { gt: 0 } },
                        }).catch(() => -1);
                        const executorPos = await this.prisma.position.count({
                            where: { userId, status: 'OPEN', entryPrice: { gt: 0 }, source: { in: ['smart_executor', 'auto_paper'] } },
                        }).catch(() => -1);
                        this.logger.error(`⚔️ V144 BLOCKED: Brief ${brief.id} (${brief.pair}) REJECTED by RiskGatekeeper for user ${userId}. ` +
                            `Executor positions: ${executorPos}/${userState.maxOpenPositions || this.config.maxOpenPositions}, ` +
                            `Total positions: ${totalPos}/${rgParams.maxOpenPositions}, ` +
                            `Error: ${result.error}`);
                    }
                    else {
                        this.logger.warn(`⚔️ Brief ${brief.id} execution FAILED for user ${userId}: ${result.error} — will retry on next tick`);
                    }
                }
                try {
                    await this.notificationService.sendNotification({
                        userId,
                        type: 'ORDER_REJECTED',
                        priority: 'MEDIUM',
                        title: `⚠️ فشل تنفيذ ${brief.pair}`,
                        body: `لم يتم تنفيذ ${brief.direction === 'BUY' ? 'شراء' : 'بيع'} ${brief.pair}: ${result.error || 'سبب غير معروف'}`,
                        data: {
                            briefId: brief.id,
                            pair: brief.pair,
                            direction: brief.direction,
                            error: result.error,
                        },
                        source: 'executor',
                        action: 'WARN',
                        pair: brief.pair,
                    });
                }
                catch (notifError) {
                    this.logger.warn(`⚔️ Failed to send rejection notification to user ${userId}: ${notifError.message}`);
                }
            }
        }
    }
    async _checkNewsRisk(pair, direction) {
        const safe = { blocked: false, warning: false, riskLevel: 'low', score: 0, reason: '' };
        try {
            const baseSymbol = pair.split('/')[0];
            const latestNews = await this.newsService.getLatestNews({
                symbol: baseSymbol,
                limit: 10,
            });
            if (!latestNews || latestNews.length === 0)
                return safe;
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
            const recentNews = latestNews.filter((a) => a.publishedAt && new Date(a.publishedAt) >= fourHoursAgo);
            if (recentNews.length === 0)
                return safe;
            let opposingHighImpact = 0;
            let opposingCriticalImpact = 0;
            let weightedScore = 0;
            let totalWeight = 0;
            for (const article of recentNews) {
                const sentiment = typeof article.sentiment === 'number' ? article.sentiment : 0;
                const impact = (article.impactLevel || '').toLowerCase();
                const hoursAgo = article.publishedAt
                    ? (Date.now() - new Date(article.publishedAt).getTime()) / (60 * 60 * 1000)
                    : 24;
                const isOpposing = (direction === 'BUY' && sentiment < -0.2) ||
                    (direction === 'SELL' && sentiment > 0.2);
                if (isOpposing) {
                    const impactWeight = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
                    const timeDecay = Math.max(0.2, 1 - (hoursAgo / 4));
                    const weight = impactWeight * timeDecay;
                    weightedScore += Math.abs(sentiment) * weight;
                    totalWeight += weight;
                    if (impact === 'high')
                        opposingHighImpact++;
                    if (impact === 'high' && Math.abs(sentiment) > 0.5)
                        opposingCriticalImpact++;
                }
            }
            const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
            if (opposingCriticalImpact >= 1 || opposingHighImpact >= 2) {
                return {
                    blocked: true,
                    warning: false,
                    riskLevel: 'critical',
                    score,
                    reason: `${opposingCriticalImpact} خبر حرج + ${opposingHighImpact} خبر عالي التأثير يعارض ${direction} خلال آخر 4 ساعات`,
                };
            }
            if (opposingHighImpact >= 1 && score > 0.3) {
                return {
                    blocked: true,
                    warning: false,
                    riskLevel: 'high',
                    score,
                    reason: `خبر عالي التأثير يعارض ${direction} مع نقاط مشاعر=${score.toFixed(2)}`,
                };
            }
            if (opposingHighImpact >= 1 || (score > 0.2 && recentNews.length >= 2)) {
                return {
                    blocked: false,
                    warning: true,
                    riskLevel: 'medium',
                    score,
                    reason: `${opposingHighImpact} خبر عالي التأثير معارض لكن غير حاسم — نقاط=${score.toFixed(2)}`,
                };
            }
            return safe;
        }
        catch (error) {
            this.logger.warn(`⚔️ V144: _checkNewsRisk error: ${error.message}`);
            return safe;
        }
    }
    _areEntryConditionsMet(brief, currentPrice, strictRules) {
        const slippage = strictRules.maxSlippage || this.config.defaultSlippage;
        const hasValidTP = brief.takeProfit && brief.takeProfit > 0;
        if (brief.direction === 'BUY') {
            const maxPrice = brief.entryPrice * (1 + slippage * 2);
            const hasProfitPotential = !hasValidTP || currentPrice < brief.takeProfit;
            return currentPrice <= maxPrice && hasProfitPotential;
        }
        else {
            const minPrice = brief.entryPrice * (1 - slippage * 2);
            const hasProfitPotential = !hasValidTP || currentPrice > brief.takeProfit;
            return currentPrice >= minPrice && hasProfitPotential;
        }
    }
    async _executeBriefForUser(userId, brief, currentPrice, userState, portfolioValue) {
        const result = {
            success: false,
            briefId: brief.id,
            pair: brief.pair,
            direction: brief.direction,
            entryPrice: currentPrice,
            userId,
            executedAt: new Date(),
        };
        try {
            const activeCredId = userState.activeCredentialId;
            if (!activeCredId) {
                result.error = 'No active account selected — set one in settings';
                return result;
            }
            let credential = await this.prisma.exchangeCredential.findFirst({
                where: { id: activeCredId, userId, isValid: true },
            });
            if (!credential) {
                this.logger.warn(`⚔️ Active credential ${activeCredId} not found or invalid for user ${userId}`);
                result.error = 'Active account no longer valid — select another in settings';
                return result;
            }
            const isSimulatedExecution = credential.testnet === true ||
                this._isSimulatedExchange(credential.exchange);
            if (!(0, strategic_council_types_1.isSymbolSupportedByExchange)(brief.pair, credential.exchange)) {
                result.error = `الرمز ${brief.pair} غير مدعوم على ${credential.exchange} — تخطي التنفيذ`;
                this.logger.warn(`⚔️ V131 Symbol ${brief.pair} NOT supported on ${credential.exchange} — skipping execution for user ${userId}`);
                return result;
            }
            if (!isSimulatedExecution && brief.direction === 'SELL' &&
                credential.exchange !== 'alpaca') {
                this.logger.debug(`⚔️ Skipping SELL brief ${brief.id} — ${brief.pair} SELL not possible on spot exchange ${credential.exchange}`);
                result.error = `بيع ${brief.pair} غير ممكن على حساب سبوت — يحتاج حساب مارجن/فيوتشر`;
                return result;
            }
            this.logger.log(`⚔️ V126 Executing brief ${brief.pair} for user ${userId} ` +
                `on ${credential.exchange} (testnet=${credential.testnet || false}, simulated=${isSimulatedExecution})`);
            const riskPercent = (userState.riskPerTradePercent || this.config.riskPerTradePercent) / 100;
            const riskAmount = Math.max(portfolioValue * riskPercent, 10);
            const priceRisk = Math.abs(currentPrice - brief.stopLoss);
            if (priceRisk === 0) {
                result.error = 'Invalid stop loss — price risk is 0';
                this.logger.warn(`⚔️ Brief ${brief.id} has stopLoss=${brief.stopLoss} same as currentPrice=${currentPrice} — skipping`);
                return result;
            }
            const meta = (0, symbol_metadata_1.getSymbolMetadata)(brief.pair);
            const posResult = (0, symbol_metadata_1.calculatePositionSizeFromRisk)(riskAmount, currentPrice, brief.stopLoss, brief.pair);
            let quantity = posResult.quantityUnits;
            let lots = posResult.quantityLots;
            const maxOrderValue = isSimulatedExecution
                ? Math.min(5000, portfolioValue * 0.05)
                : Math.min(10000, portfolioValue * 0.02);
            if (posResult.notional > maxOrderValue) {
                const cappedQty = maxOrderValue / currentPrice;
                lots = (0, symbol_metadata_1.roundLotSize)((0, symbol_metadata_1.unitsToLots)(cappedQty, brief.pair), brief.pair);
                quantity = (0, symbol_metadata_1.lotsToUnits)(lots, brief.pair);
                this.logger.debug(`⚔️ Position capped by maxOrderValue: notional $${posResult.notional.toFixed(2)} > $${maxOrderValue} → reduced to ${lots} lots (${quantity.toFixed(2)} units)`);
            }
            const orderValue = (0, symbol_metadata_1.calculateNotionalValue)(quantity, currentPrice);
            if (orderValue < 10) {
                result.error = `Order value too small: $${orderValue.toFixed(2)} < $10 minimum`;
                this.logger.debug(`⚔️ Brief ${brief.id} order value $${orderValue.toFixed(2)} too small — skipping`);
                return result;
            }
            if (quantity <= 0) {
                result.error = 'Invalid quantity calculated';
                return result;
            }
            const margin = (0, symbol_metadata_1.calculateMargin)(quantity, currentPrice, brief.pair);
            this.logger.debug(`⚔️ Position sizing for ${brief.pair}: lots=${lots}, units=${quantity.toFixed(2)}, ` +
                `notional=$${orderValue.toFixed(2)}, margin=$${margin.toFixed(2)} (leverage ${meta.defaultLeverage}:1), ` +
                `risk=$${(quantity * priceRisk).toFixed(2)} (${((quantity * priceRisk / portfolioValue) * 100).toFixed(2)}% of portfolio)`);
            try {
                const balanceData = await this.credentialsService.fetchAllExchangeBalances(userId);
                const availableUsd = balanceData.totalAvailableUsd;
                if (availableUsd !== undefined && availableUsd < margin) {
                    result.error = `رصيد غير كافي في ${credential.exchange} — يحتاج $${margin.toFixed(2)}، المتاح $${availableUsd.toFixed(2)}`;
                    this.logger.warn(`⚔️ MARGIN CHECK FAILED for ${userId} on ${brief.pair}: ` +
                        `needs $${margin.toFixed(2)}, available $${availableUsd.toFixed(2)} — skipping`);
                    return result;
                }
            }
            catch (balErr) {
                this.logger.debug(`⚔️ Could not verify margin for ${userId}: ${balErr.message} — proceeding`);
            }
            if (!brief.stopLoss || brief.stopLoss <= 0) {
                result.error = 'Brief has no stop-loss — BLOCKED by safety rules';
                this.logger.warn(`⚔️ Brief ${brief.id} has no stop-loss — execution BLOCKED for user ${userId}`);
                return result;
            }
            const priceShift = Math.abs(currentPrice - brief.entryPrice) / brief.entryPrice;
            let execStopLoss = brief.stopLoss;
            let execTakeProfit = brief.takeProfit;
            if (priceShift > 0.001) {
                const rr = brief.direction === 'BUY'
                    ? { sl: 1 - (brief.entryPrice - brief.stopLoss) / brief.entryPrice,
                        tp: 1 + (brief.takeProfit - brief.entryPrice) / brief.entryPrice }
                    : { sl: 1 + (brief.stopLoss - brief.entryPrice) / brief.entryPrice,
                        tp: 1 - (brief.entryPrice - brief.takeProfit) / brief.entryPrice };
                execStopLoss = brief.direction === 'BUY'
                    ? currentPrice * rr.sl
                    : currentPrice * rr.sl;
                execTakeProfit = brief.direction === 'BUY'
                    ? currentPrice * rr.tp
                    : currentPrice * rr.tp;
                this.logger.debug(`⚔️ Adjusted SL/TP for ${brief.pair}: entry ${brief.entryPrice}→${currentPrice}, ` +
                    `SL ${brief.stopLoss}→${execStopLoss.toFixed(4)}, TP ${brief.takeProfit}→${execTakeProfit.toFixed(4)}`);
            }
            const dispatchResult = await this.orderDispatcher.submitOrder({
                source: 'smart_executor',
                userId,
                credentialId: credential.id,
                symbol: brief.pair,
                side: brief.direction,
                quantity,
                price: currentPrice,
                stopLoss: execStopLoss,
                takeProfit: execTakeProfit,
                briefId: brief.id,
                isPaperTrading: isSimulatedExecution,
                timeframe: brief.timeframe,
            });
            if (!dispatchResult.success) {
                result.error = dispatchResult.error || dispatchResult.message || 'فشل الموزع';
                return result;
            }
            result.success = true;
            result.orderId = dispatchResult.orderId || 'unknown';
            await this.audit.log({
                userId,
                action: 'SMART_EXECUTOR_TRADE',
                resource: 'smart-executor',
                details: JSON.stringify({
                    briefId: brief.id,
                    orderId: result.orderId,
                    pair: brief.pair,
                    direction: brief.direction,
                    entryPrice: currentPrice,
                    stopLoss: brief.stopLoss,
                    takeProfit: brief.takeProfit,
                    quantity,
                    confidence: brief.confidence,
                    timeframe: brief.timeframe,
                    isPaperTrading: isSimulatedExecution,
                }),
            });
        }
        catch (error) {
            result.error = error.message;
            this.logger.error(`⚔️ Execution failed for brief ${brief.id} user ${userId}: ${error.message}`);
        }
        return result;
    }
    async _autoCloseStalePaperPositions() {
        this.logger.log('⚔️ Auto-close stale paper positions: DISABLED (positions kept until SL/TP hit or manual close)');
        return 0;
    }
    async _getPortfolioValue(userId) {
        try {
            const userState = await this.getUserState(userId);
            if (userState?.activeCredentialId) {
                const cred = await this.prisma.exchangeCredential.findFirst({
                    where: { id: userState.activeCredentialId, userId },
                    select: { testnet: true, exchange: true },
                });
                if (cred && (cred.testnet || this._isSimulatedExchange(cred.exchange))) {
                    return await this._getPaperPortfolioValue(userId);
                }
            }
        }
        catch { }
        try {
            const summary = await this.tradingService.getPositionSummary(userId);
            const totalValue = summary.totalValue || 0;
            if (totalValue > 0)
                return totalValue;
            this.logger.warn(`⚔️ Cannot determine portfolio value for user ${userId} — skipping execution for safety`);
            return 0;
        }
        catch (error) {
            this.logger.warn(`⚔️ Failed to get portfolio value for user ${userId}: ${error.message}`);
            return 0;
        }
    }
    _isSimulatedExchange(exchangeName) {
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
    async _selectBestCredential(userId, symbol) {
        const credentials = await this.prisma.exchangeCredential.findMany({
            where: {
                userId,
                isValid: true,
                exchange: { not: 'paper-trading' },
            },
            orderBy: [
                { testnet: 'asc' },
                { lastValidatedAt: 'desc' },
            ],
        });
        if (credentials.length === 0)
            return null;
        const symbolUpper = symbol.toUpperCase();
        const isCryptoPair = symbolUpper.includes('/') ||
            /USDT$|BUSD$|BTC$|ETH$/.test(symbolUpper);
        const isCryptoBase = /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK|UNI|ATOM|LTC|FIL|NEAR|ALGO|FTM|AAVE|MKR|SAND|MANA|AXS|GRT|ENJ|CHZ|COMP|SNX|YFI|CRV|BAL|SUSHI|1INCH|ZRX|REN|KNC|OMG|BAND|RNDR|INJ|SUI|SEI|APT|ARB|OP|MANTA|STRK|JUP|WIF|PEPE|BONK|FLOKI|SHIB|PEPE|FET|RENDER|TON|KAS|TIA|IMX|STX|RUNE|THETA|FTM|NEAR|ALGO|VET|ICP|HBAR|EGLD|XTZ|SAND|MANA|AXS|GRT)/.test(symbolUpper.split('/')[0]);
        const isStockSymbol = !symbolUpper.includes('/') &&
            /^[A-Z]{1,5}$/.test(symbolUpper) &&
            !isCryptoBase;
        const isForexOrMetal = /^(EUR|GBP|JPY|AUD|NZD|CAD|CHF|XAU|XAG)/.test(symbolUpper) ||
            /USD$|EUR$|GBP$|JPY$/.test(symbolUpper);
        const cryptoExchanges = ['binance', 'kucoin', 'bybit', 'okx', 'gateio', 'binance_test', 'binance_future_test'];
        const stockExchanges = ['alpaca'];
        if (isCryptoPair || isCryptoBase) {
            const match = credentials.find(c => cryptoExchanges.includes(c.exchange.toLowerCase()));
            if (match) {
                this.logger.debug(`⚔️ V118 Routed ${symbol} → ${match.exchange} (crypto)`);
                return match;
            }
        }
        if (isStockSymbol) {
            const match = credentials.find(c => stockExchanges.includes(c.exchange.toLowerCase()));
            if (match) {
                this.logger.debug(`⚔️ V118 Routed ${symbol} → ${match.exchange} (stock)`);
                return match;
            }
        }
        const nonTestnet = credentials.find(c => !c.testnet);
        if (nonTestnet) {
            this.logger.debug(`⚔️ V118 Routed ${symbol} → ${nonTestnet.exchange} (best-effort, non-testnet)`);
            return nonTestnet;
        }
        const first = credentials[0];
        this.logger.debug(`⚔️ V118 Routed ${symbol} → ${first.exchange} (best-effort, testnet)`);
        return first;
    }
    async _getPaperPortfolioValue(userId) {
        try {
            const settings = await this.prisma.agentSettings.findUnique({
                where: { userId },
                select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
            });
            const freeCash = settings ? Number(settings.paperBalance) : 10000;
            const openPositions = await this.prisma.position.findMany({
                where: { userId, status: 'OPEN', exchange: 'paper-trading' },
                select: { quantity: true, entryPrice: true, symbol: true, currentPrice: true, side: true },
            });
            let lockedMargin = 0;
            let unrealizedPnl = 0;
            const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
            const forexLev = Number(settings?.paperForexLeverage) || 50;
            const goldLev = Number(settings?.paperGoldLeverage) || 20;
            for (const pos of openPositions) {
                const qty = Number(pos.quantity) || 0;
                const entry = Number(pos.entryPrice) || 0;
                const current = Number(pos.currentPrice) || entry;
                const { getSymbolMetadata, AssetClass } = require('../../../modules/trading/services/symbol-metadata');
                const meta = getSymbolMetadata(pos.symbol);
                let leverage = cryptoLev;
                if (meta.assetClass === AssetClass.FOREX)
                    leverage = forexLev;
                else if (meta.assetClass === AssetClass.COMMODITY)
                    leverage = goldLev;
                const notional = qty * entry;
                lockedMargin += leverage > 1 ? notional / leverage : notional;
                unrealizedPnl += pos.side === 'BUY' ? (current - entry) * qty : (entry - current) * qty;
            }
            const equity = freeCash + lockedMargin + unrealizedPnl;
            return equity > 0 ? equity : 10000;
        }
        catch {
            return 10000;
        }
    }
    async diagnoseExecution() {
        const diagnostic = {
            timestamp: new Date().toISOString(),
            isRunning: this.isRunning,
            totalExecutions: this.totalExecutions,
            config: this.config,
        };
        try {
            const briefs = await this.councilService.getActiveBriefs();
            diagnostic.activeBriefs = {
                count: briefs.length,
                pairs: [...new Set(briefs.map((b) => b.pair))],
                directions: briefs.reduce((acc, b) => {
                    acc[b.direction] = (acc[b.direction] || 0) + 1;
                    return acc;
                }, {}),
                confidenceRange: briefs.length > 0
                    ? `${Math.min(...briefs.map((b) => b.confidence))}-${Math.max(...briefs.map((b) => b.confidence))}`
                    : 'N/A',
                sample: briefs.slice(0, 3).map((b) => ({
                    pair: b.pair,
                    direction: b.direction,
                    confidence: b.confidence,
                    entryPrice: b.entryPrice,
                    stopLoss: b.stopLoss,
                    takeProfit: b.takeProfit,
                    timeframe: b.timeframe,
                    strictRules: b.strictRules,
                })),
            };
        }
        catch (e) {
            diagnostic.activeBriefs = { error: e.message };
        }
        try {
            const enabledUsers = await this._getEnabledUsers();
            diagnostic.enabledUsers = {
                count: enabledUsers.length,
                users: enabledUsers,
            };
            diagnostic.userStates = {};
            for (const userId of enabledUsers) {
                const state = await this.getUserState(userId);
                diagnostic.userStates[userId] = state;
            }
        }
        catch (e) {
            diagnostic.enabledUsers = { error: e.message };
        }
        try {
            const briefs = await this.councilService.getActiveBriefs();
            const enabledUsers = await this._getEnabledUsers();
            if (briefs.length > 0 && enabledUsers.length > 0) {
                const testBrief = briefs[0];
                const testUserId = enabledUsers[0];
                let currentPrice = 0;
                try {
                    const marketData = await this.orchestrator.fetchQuickMarketData(testBrief.pair);
                    currentPrice = marketData.price;
                }
                catch { }
                if (!currentPrice || currentPrice <= 0) {
                    try {
                        const quote = await this.exchangeService.getQuote(testBrief.pair);
                        currentPrice = quote.price;
                    }
                    catch { }
                }
                const strictRules = testBrief.strictRules || { maxSlippage: this.config.defaultSlippage };
                const conditionsMet = currentPrice > 0 ? this._areEntryConditionsMet(testBrief, currentPrice, strictRules) : false;
                const slippage = strictRules.maxSlippage || this.config.defaultSlippage;
                diagnostic.sampleExecution = {
                    brief: {
                        id: testBrief.id,
                        pair: testBrief.pair,
                        direction: testBrief.direction,
                        entryPrice: testBrief.entryPrice,
                        takeProfit: testBrief.takeProfit,
                        stopLoss: testBrief.stopLoss,
                        confidence: testBrief.confidence,
                    },
                    currentPrice,
                    strictRules,
                    conditionsMet,
                    conditionDetails: currentPrice > 0 ? {
                        slippage,
                        maxEntryPrice: strictRules.maxEntryPrice,
                        minEntryPrice: strictRules.minEntryPrice,
                        maxEntryPriceCheck: strictRules.maxEntryPrice
                            ? `currentPrice(${currentPrice}) <= maxEntry(${strictRules.maxEntryPrice}) = ${currentPrice <= strictRules.maxEntryPrice}`
                            : 'N/A (no maxEntryPrice)',
                        minEntryPriceCheck: strictRules.minEntryPrice
                            ? `currentPrice(${currentPrice}) >= minEntry(${strictRules.minEntryPrice}) = ${currentPrice >= strictRules.minEntryPrice}`
                            : 'N/A (no minEntryPrice)',
                        buyCheck: testBrief.direction === 'BUY'
                            ? `price(${currentPrice}) <= maxPrice(${testBrief.entryPrice * (1 + slippage * 2)}) AND price(${currentPrice}) < takeProfit(${testBrief.takeProfit}) = ${currentPrice <= testBrief.entryPrice * (1 + slippage * 2) && currentPrice < testBrief.takeProfit}`
                            : 'N/A (not BUY)',
                        sellCheck: testBrief.direction === 'SELL'
                            ? `price(${currentPrice}) >= minPrice(${testBrief.entryPrice * (1 - slippage * 2)}) AND price(${currentPrice}) > takeProfit(${testBrief.takeProfit}) = ${currentPrice >= testBrief.entryPrice * (1 - slippage * 2) && currentPrice > testBrief.takeProfit}`
                            : 'N/A (not SELL)',
                    } : { error: 'Cannot get current price' },
                };
                const processedKey = `${this.REDIS_PROCESSED_PREFIX}${testBrief.id}:${testUserId}`;
                const alreadyProcessed = await this.redis.get(processedKey);
                diagnostic.sampleExecution.alreadyProcessed = alreadyProcessed ? JSON.parse(alreadyProcessed) : null;
                try {
                    const existingPos = await this.prisma.position.findFirst({
                        where: { userId: testUserId, symbol: testBrief.pair, status: 'OPEN' },
                    });
                    diagnostic.sampleExecution.existingPosition = existingPos ? { id: existingPos.id, symbol: existingPos.symbol } : null;
                }
                catch (e) {
                    diagnostic.sampleExecution.existingPosition = { error: e.message };
                }
            }
            else {
                diagnostic.sampleExecution = {
                    reason: briefs.length === 0 ? 'No active briefs' : 'No enabled users',
                };
            }
        }
        catch (e) {
            diagnostic.sampleExecution = { error: e.message };
        }
        try {
            const pong = await this.redis.ping();
            diagnostic.redis = { connected: pong === 'PONG' };
        }
        catch (e) {
            diagnostic.redis = { connected: false, error: e.message };
        }
        const issues = [];
        if (!this.isRunning)
            issues.push('Executor is NOT running — start it with POST /smart-executor/start');
        if (diagnostic.activeBriefs?.count === 0)
            issues.push('No active briefs from Strategic Council');
        if (diagnostic.enabledUsers?.count === 0)
            issues.push('No enabled users — call POST /smart-executor/user/auto-enable');
        if (diagnostic.activeBriefs?.count > 0 && diagnostic.enabledUsers?.count > 0 && diagnostic.sampleExecution?.conditionsMet === false) {
            issues.push('Entry conditions NOT met — prices may have moved since briefs were issued');
        }
        if (diagnostic.sampleExecution?.alreadyProcessed) {
            issues.push('Briefs are already processed (marked in Redis) — no new trades will happen');
        }
        try {
            const briefs = await this.councilService.getActiveBriefs();
            const enabledUsers = await this._getEnabledUsers();
            if (briefs.length > 0 && enabledUsers.length > 0) {
                const testBrief = briefs[0];
                const testUserId = enabledUsers[0];
                const userState = await this.getUserState(testUserId);
                if (userState?.enabled) {
                    let testPrice = 0;
                    try {
                        const md = await this.orchestrator.fetchQuickMarketData(testBrief.pair);
                        testPrice = md.price;
                    }
                    catch { }
                    if (!testPrice || testPrice <= 0) {
                        try {
                            const q = await this.exchangeService.getQuote(testBrief.pair);
                            testPrice = q.price;
                        }
                        catch { }
                    }
                    if (testPrice > 0) {
                        let cred = null;
                        try {
                            cred = await this.prisma.exchangeCredential.findFirst({
                                where: { userId: testUserId, exchange: 'paper-trading', isValid: true },
                            });
                            if (!cred) {
                                cred = await this.prisma.exchangeCredential.create({
                                    data: {
                                        userId: testUserId,
                                        exchange: 'paper-trading',
                                        label: 'تداول ورقي (تجريبي)',
                                        encryptedApiKey: 'paper',
                                        encryptedSecret: 'paper',
                                        iv: 'paper',
                                        authTag: 'paper',
                                        permissions: JSON.stringify(['read', 'trade']),
                                        isValid: true,
                                    },
                                });
                            }
                        }
                        catch (e) {
                            diagnostic.executionTest = { step: 'credential', error: e.message, stack: e.stack?.slice(0, 300) };
                        }
                        if (cred) {
                            const portfolioValue = (cred.testnet || this._isSimulatedExchange(cred.exchange)) ? await this._getPaperPortfolioValue(testUserId) : 0;
                            const riskPercent = (userState.riskPerTradePercent || 1) / 100;
                            const riskAmount = Math.max(portfolioValue * riskPercent, 10);
                            const priceRisk = Math.abs(testPrice - testBrief.stopLoss);
                            try {
                                const riskResult = await this.riskGatekeeper.validateOrder({
                                    userId: testUserId,
                                    exchangeCredentialId: cred.id,
                                    symbol: testBrief.pair,
                                    side: testBrief.direction === 'BUY' ? order_events_1.OrderSideEnum.BUY : order_events_1.OrderSideEnum.SELL,
                                    type: order_events_1.OrderTypeEnum.MARKET,
                                    quantity: priceRisk > 0 ? parseFloat((riskAmount / priceRisk).toFixed(6)) : 0,
                                    price: testPrice,
                                    stopLoss: testBrief.stopLoss,
                                    idempotencyKey: `debug-${Date.now()}`,
                                });
                                diagnostic.executionTest = {
                                    step: 'riskGatekeeper',
                                    riskResult: {
                                        allowed: riskResult.allowed,
                                        reason: riskResult.reason || null,
                                        riskScore: riskResult.riskScore || null,
                                        failedCheck: riskResult.failedCheck || null,
                                    },
                                    credential: { id: cred.id, exchange: cred.exchange },
                                    testPrice,
                                    quantity: priceRisk > 0 ? parseFloat((riskAmount / priceRisk).toFixed(6)) : 0,
                                    priceRisk,
                                    portfolioValue,
                                };
                            }
                            catch (e) {
                                diagnostic.executionTest = { step: 'riskGatekeeper', error: e.message, stack: e.stack?.slice(0, 500) };
                            }
                        }
                    }
                    else {
                        diagnostic.executionTest = { step: 'price', error: 'Cannot get price for any pair' };
                    }
                }
            }
        }
        catch (e) {
            diagnostic.executionTest = { step: 'unknown', error: e.message };
        }
        diagnostic.diagnosis = {
            issues,
            canExecute: this.isRunning && (diagnostic.activeBriefs?.count > 0) && (diagnostic.enabledUsers?.count > 0),
        };
        return diagnostic;
    }
    async _persistUserStateToDB(userId, state) {
        try {
            const key = `${this.DB_USER_STATE_KEY}:${userId}`;
            await this.prisma.setting.upsert({
                where: { key },
                update: { value: JSON.stringify(state) },
                create: { key, value: JSON.stringify(state) },
            });
        }
        catch (e) {
            this.logger.warn(`⚔️ Failed to persist user state to DB for ${userId}: ${e.message}`);
        }
    }
    async _removeUserStateFromDB(userId) {
        try {
            const key = `${this.DB_USER_STATE_KEY}:${userId}`;
            await this.prisma.setting.deleteMany({ where: { key } });
        }
        catch (e) {
            this.logger.warn(`⚔️ Failed to remove user state from DB for ${userId}: ${e.message}`);
        }
    }
    async _loadUserStateFromDB(userId) {
        try {
            const key = `${this.DB_USER_STATE_KEY}:${userId}`;
            const setting = await this.prisma.setting.findUnique({ where: { key } });
            if (setting) {
                const state = JSON.parse(setting.value);
                if (state && state.enabled) {
                    return state;
                }
            }
        }
        catch (e) {
            this.logger.debug(`⚔️ Failed to load user state from DB for ${userId}: ${e.message}`);
        }
        return null;
    }
    async _loadAllUserStatesFromDB() {
        try {
            const settings = await this.prisma.setting.findMany({
                where: { key: { startsWith: this.DB_USER_STATE_KEY } },
                select: { key: true, value: true },
            });
            const results = [];
            for (const setting of settings) {
                try {
                    const state = JSON.parse(setting.value);
                    if (state && state.enabled) {
                        const userId = setting.key.replace(`${this.DB_USER_STATE_KEY}:`, '');
                        results.push({ userId, state });
                    }
                }
                catch {
                }
            }
            return results;
        }
        catch (e) {
            this.logger.debug(`⚔️ Failed to load all user states from DB: ${e.message}`);
            return [];
        }
    }
    async _getAllEnabledUsersFromDB() {
        try {
            const settings = await this.prisma.setting.findMany({
                where: {
                    key: { startsWith: this.DB_USER_STATE_KEY },
                },
                select: { key: true, value: true },
            });
            const enabledUserIds = [];
            for (const setting of settings) {
                try {
                    const state = JSON.parse(setting.value);
                    if (state && state.enabled) {
                        const userId = setting.key.replace(`${this.DB_USER_STATE_KEY}:`, '');
                        enabledUserIds.push(userId);
                    }
                }
                catch {
                }
            }
            return enabledUserIds;
        }
        catch (e) {
            this.logger.debug(`⚔️ Failed to get all enabled users from DB: ${e.message}`);
            return [];
        }
    }
    async closePosition(userId, positionId, closeReason) {
        await this.tradingService.closePositionWithRetry(userId, { positionId, closeReason });
    }
};
exports.SmartExecutorService = SmartExecutorService;
exports.SmartExecutorService = SmartExecutorService = SmartExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        exchange_service_1.ExchangeService,
        audit_service_1.AuditService,
        trading_service_1.TradingService,
        strategic_council_service_1.StrategicCouncilService,
        risk_gatekeeper_service_1.RiskGatekeeperService,
        notification_service_1.NotificationService,
        ai_orchestrator_service_1.AIOrchestratorService,
        order_dispatcher_service_1.OrderDispatcherService,
        exposure_manager_service_1.ExposureManagerService,
        news_service_1.NewsService,
        credentials_service_1.CredentialsService])
], SmartExecutorService);
//# sourceMappingURL=smart-executor.service.js.map