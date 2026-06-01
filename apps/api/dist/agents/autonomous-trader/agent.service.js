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
var AutonomousTraderAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousTraderAgentService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const redis_service_1 = require("../../common/redis/redis.service");
const audit_service_1 = require("../../audit/audit.service");
const exchange_service_1 = require("../../modules/exchange/exchange.service");
const trading_service_1 = require("../../modules/trading/trading.service");
const market_hours_util_1 = require("../../common/utils/market-hours.util");
const market_analyzer_service_1 = require("./services/market-analyzer.service");
const signal_evaluator_service_1 = require("./services/signal-evaluator.service");
const risk_calculator_service_1 = require("./services/risk-calculator.service");
const order_executor_service_1 = require("./services/order-executor.service");
const strategic_council_service_1 = require("../../modules/ai/strategic-council/strategic-council.service");
const strategic_council_types_1 = require("../../modules/ai/strategic-council/strategic-council.types");
const agent_types_1 = require("./types/agent.types");
const performance_1 = require("./models/performance");
let AutonomousTraderAgentService = AutonomousTraderAgentService_1 = class AutonomousTraderAgentService {
    constructor(prisma, redis, audit, configService, exchangeService, tradingService, marketAnalyzer, signalEvaluator, riskCalculator, orderExecutor, councilService) {
        this.prisma = prisma;
        this.redis = redis;
        this.audit = audit;
        this.configService = configService;
        this.exchangeService = exchangeService;
        this.tradingService = tradingService;
        this.marketAnalyzer = marketAnalyzer;
        this.signalEvaluator = signalEvaluator;
        this.riskCalculator = riskCalculator;
        this.orderExecutor = orderExecutor;
        this.councilService = councilService;
        this.logger = new common_1.Logger(AutonomousTraderAgentService_1.name);
        this.isCycleRunning = false;
        this._isReady = false;
        this._notReadyReason = 'الخدمة لم تكتمل بعد — يتم التهيئة';
        this.DEFAULT_SYMBOLS = [
            'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
        ];
        this._tryMarkReady();
        this.logger.log(`🧠 Autonomous Trader Agent initialized (ready=${this._isReady})`);
    }
    _tryMarkReady() {
        if (!this.prisma) {
            this._notReadyReason = 'قاعدة البيانات غير متاحة — يرجى المحاولة لاحقاً';
            return;
        }
        if (!this.redis) {
            this._notReadyReason = 'خدمة التخزين المؤقت غير متاحة — يرجى المحاولة لاحقاً';
            return;
        }
        this._isReady = true;
        this._notReadyReason = '';
    }
    _ensureReady() {
        if (!this._isReady) {
            this._tryMarkReady();
        }
        if (!this._isReady) {
            this.logger.warn(`Service not ready: ${this._notReadyReason}`);
            throw new common_1.ServiceUnavailableException(this._notReadyReason);
        }
    }
    get isReady() {
        return this._isReady;
    }
    get notReadyReason() {
        return this._notReadyReason;
    }
    async onModuleInit() {
        const INIT_TIMEOUT_MS = 5000;
        if (!this.prisma || !this.redis) {
            this.logger.warn(`⚠️ Skipping onModuleInit auto-seed: prisma=${!!this.prisma}, redis=${!!this.redis}. ` +
                `Agent routes will still be registered. Service will retry on next DB access.`);
            this._tryMarkReady();
            return;
        }
        try {
            await Promise.race([
                this._initAutoTradingSetting(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('onModuleInit timeout')), INIT_TIMEOUT_MS)),
            ]);
        }
        catch (error) {
            this.logger.warn(`Could not auto-seed AUTO_TRADING_ENABLED: ${error?.message || error} — will fall back to env var. Agent routes will still be registered.`);
            this._isReady = false;
            this._notReadyReason = 'قاعدة البيانات غير جاهزة بعد — يرجى المحاولة لاحقاً';
        }
        if (this._isReady) {
            setTimeout(() => this._startupCleanup(), 10000);
        }
    }
    async _startupCleanup() {
        try {
            if (!this.prisma?.isAvailable?.()) {
                this.logger.warn('🧠 Skipping startup cleanup — DB not yet available');
                return;
            }
            this.logger.log('🧠 Running startup phantom cleanup (preserving user data)...');
            try {
                const stopped = await this.prisma.agentSession.updateMany({
                    where: { status: { in: ['STARTING', 'STOPPING'] } },
                    data: { status: 'STOPPED', updatedAt: new Date() },
                });
                if (stopped.count > 0) {
                    this.logger.log(`🧠 STARTUP: Stopped ${stopped.count} transitional agent session(s) (STARTING/STOPPING)`);
                }
                const running = await this.prisma.agentSession.count({
                    where: { status: 'RUNNING' },
                });
                if (running > 0) {
                    this.logger.log(`🧠 STARTUP: Preserved ${running} RUNNING agent session(s) — will auto-resume`);
                }
            }
            catch (err) {
                this.logger.warn(`🧠 Failed to update agent sessions: ${err.message}`);
            }
            try {
                const agentKeys = await this.redis.scanKeys('agent:state:*');
                let cleared = 0;
                for (const key of agentKeys) {
                    try {
                        const raw = await this.redis.get(key);
                        if (raw) {
                            await this.redis.del(key);
                            cleared++;
                        }
                        else {
                            await this.redis.del(key);
                            cleared++;
                        }
                    }
                    catch {
                        await this.redis.del(key);
                        cleared++;
                    }
                }
                if (cleared > 0) {
                    this.logger.log(`🧠 STARTUP: Cleared ${cleared} stale Redis agent state(s)`);
                }
            }
            catch (err) {
                this.logger.warn(`🧠 Failed to clear agent Redis states: ${err.message}`);
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
                    this.logger.log(`🧠 STARTUP: Cleared ${oldCbCleaned} old-format circuit breaker key(s) (V137 — cross-user contamination fix)`);
                }
            }
            catch (cbErr) {
                this.logger.warn(`🧠 Failed to clear old circuit breaker keys: ${cbErr.message}`);
            }
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const deletedTrades = await this.prisma.autonomousTrade.deleteMany({
                    where: { createdAt: { lt: sevenDaysAgo } },
                });
                if (deletedTrades.count > 0) {
                    this.logger.log(`🧠 STARTUP: Purged ${deletedTrades.count} stale AutonomousTrade(s) (>7 days)`);
                }
            }
            catch (err) {
                this.logger.warn(`🧠 Failed to purge stale AutonomousTrade records: ${err.message}`);
            }
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const deletedPaperOrders = await this.prisma.paperOrder.deleteMany({
                    where: { createdAt: { lt: sevenDaysAgo } },
                });
                if (deletedPaperOrders.count > 0) {
                    this.logger.log(`🧠 STARTUP: Purged ${deletedPaperOrders.count} stale PaperOrder(s) (>7 days)`);
                }
            }
            catch (err) {
                this.logger.warn(`🧠 Failed to purge stale PaperOrder records: ${err.message}`);
            }
            this.logger.log('🧠 Startup cleanup complete (user data preserved)');
        }
        catch (error) {
            this.logger.warn(`🧠 Startup cleanup failed (non-critical): ${error.message}`);
        }
    }
    async _initAutoTradingSetting() {
        const existing = await this.prisma.setting.findUnique({
            where: { key: 'AUTO_TRADING_ENABLED' },
        });
        if (!existing) {
            const envValue = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
            await this.prisma.setting.create({
                data: {
                    key: 'AUTO_TRADING_ENABLED',
                    value: JSON.stringify(envValue),
                },
            });
            this.logger.log(`🔧 Auto-seeded AUTO_TRADING_ENABLED=${envValue} in DB (from env var / default)`);
        }
        else {
            const existingValue = JSON.parse(existing.value);
            this.logger.log(`🔧 AUTO_TRADING_ENABLED=${existingValue} (source: database — respected as-is)`);
        }
    }
    async startAgent(userId, dto) {
        this._tryMarkReady();
        this._ensureReady();
        const existingState = await this._getAgentState(userId);
        if (existingState && existingState.status === agent_types_1.AgentStatus.RUNNING) {
            throw new common_1.BadRequestException('الوكيل يعمل بالفعل — أوقفه أولاً ثم أعد تشغيله');
        }
        if (existingState && existingState.status === agent_types_1.AgentStatus.DAILY_LIMIT_REACHED) {
            this.logger.log(`🧠 User ${userId} restarting agent after daily limit — resetting daily stats`);
            existingState.dailyPnL = 0;
            existingState.dailyTradesCount = 0;
            existingState.dailyResetAt = new Date();
            existingState.consecutiveLosses = 0;
            existingState.status = agent_types_1.AgentStatus.RUNNING;
            await this._saveAgentState(userId, existingState);
            try {
                const session = await this.prisma.agentSession.findFirst({
                    where: { userId, status: 'DAILY_LIMIT_REACHED' },
                    orderBy: { startedAt: 'desc' },
                });
                if (session) {
                    await this.prisma.agentSession.update({
                        where: { id: session.id },
                        data: {
                            status: agent_types_1.AgentStatus.RUNNING,
                            dailyPnL: 0,
                            dailyTradesCount: 0,
                            dailyResetAt: new Date(),
                        },
                    });
                }
            }
            catch (dbErr) {
                this.logger.warn(`Failed to update DB session on daily limit reset: ${dbErr.message}`);
            }
            try {
                if (this.audit) {
                    await this.audit.log({
                        userId,
                        action: 'AGENT_DAILY_LIMIT_OVERRIDE',
                        resource: 'autonomous-trader',
                        details: JSON.stringify({ message: 'User overrode daily loss limit and restarted agent' }),
                    });
                }
            }
            catch { }
            return existingState;
        }
        let globalAutoTradingEnabled;
        try {
            const dbSetting = await this.prisma.setting.findUnique({
                where: { key: 'AUTO_TRADING_ENABLED' },
            });
            if (dbSetting) {
                globalAutoTradingEnabled = JSON.parse(dbSetting.value);
            }
            else {
                globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
            }
        }
        catch {
            globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
        }
        if (!globalAutoTradingEnabled) {
            this.logger.error(`🚫 AUTO_TRADING_ENABLED=false (global) — cannot start agent for user ${userId}`);
            throw new common_1.BadRequestException('التداول الذاتي معطّل على مستوى النظام — لا يمكن تفعيل الوكيل. يمكنك تفعيله من إعدادات النظام');
        }
        let userAutoTradingEnabled = true;
        try {
            let userSettings = await this.prisma.agentSettings.findUnique({
                where: { userId },
            });
            if (!userSettings) {
                try {
                    userSettings = await this.prisma.agentSettings.create({
                        data: {
                            userId,
                            autoTradingEnabled: true,
                            maxPositionSizePercent: 2,
                            maxDailyLossPercent: 5,
                            maxOpenPositions: parseInt(this.configService.get('MAX_OPEN_POSITIONS', '20'), 10) || 20,
                            riskPerTradePercent: 1,
                        },
                    });
                    this.logger.log(`🔧 Auto-created agentSettings for user ${userId} with autoTradingEnabled=true`);
                }
                catch (createErr) {
                    this.logger.warn(`🔧 AgentSettings create race for user ${userId}: ${createErr.message} — re-reading and force-enabling`);
                    try {
                        userSettings = await this.prisma.agentSettings.findUnique({ where: { userId } });
                        if (userSettings && !userSettings.autoTradingEnabled) {
                            userSettings = await this.prisma.agentSettings.update({
                                where: { userId },
                                data: { autoTradingEnabled: true },
                            });
                        }
                    }
                    catch { }
                }
            }
            else if (!userSettings.autoTradingEnabled) {
                try {
                    userSettings = await this.prisma.agentSettings.update({
                        where: { userId },
                        data: { autoTradingEnabled: true },
                    });
                    this.logger.log(`🔧 autoTradingEnabled set to true for user ${userId} (user clicked Start Agent)`);
                }
                catch (updateErr) {
                    this.logger.warn(`Could not enable autoTradingEnabled for user ${userId}: ${updateErr.message}`);
                    userSettings = { ...userSettings, autoTradingEnabled: true };
                }
            }
            if (userSettings && !userSettings.autoTradingEnabled) {
                this.logger.warn(`🔧 userSettings.autoTradingEnabled is still false for ${userId} after fix attempts — OVERRIDING to true (user clicked Start Agent)`);
                userAutoTradingEnabled = true;
            }
        }
        catch (e) {
            this.logger.warn(`Could not check user autoTradingEnabled: ${e.message}`);
        }
        if (!userAutoTradingEnabled) {
            this.logger.warn(`🚫 User ${userId} has autoTradingEnabled=false — cannot start agent`);
            throw new common_1.BadRequestException('التداول الذاتي معطّل في إعداداتك — فعّله من صفحة إعدادات الوكيل');
        }
        let credential = null;
        let isPaperTrading = false;
        let isTestnet = false;
        let exchangeName;
        let effectiveCredentialId = dto.credentialId;
        if (!effectiveCredentialId || effectiveCredentialId.trim() === '' || effectiveCredentialId.startsWith('paper-')) {
            try {
                const activeSetting = await this.prisma.setting.findFirst({
                    where: { key: `user:${userId}:activeCredentialId` },
                });
                if (activeSetting?.value) {
                    effectiveCredentialId = activeSetting.value;
                    this.logger.log(`🧠 V126 Agent using active account from settings: ${effectiveCredentialId}`);
                }
            }
            catch (err) {
                this.logger.warn(`🧠 V126 Could not read activeCredentialId for user ${userId}: ${err.message}`);
            }
        }
        if (!effectiveCredentialId || effectiveCredentialId.trim() === '' || effectiveCredentialId.startsWith('paper-')) {
            isPaperTrading = true;
            this.logger.log(`🧠 Agent starting in PAPER TRADING mode for user ${userId} (no active account selected)`);
            try {
                const existingPaper = await this.prisma.exchangeCredential.findFirst({
                    where: { userId, exchange: 'paper-trading', isValid: true },
                });
                if (existingPaper) {
                    credential = existingPaper;
                    effectiveCredentialId = existingPaper.id;
                }
                else {
                    this.logger.log(`🧪 Auto-creating paper-trading credential for user ${userId}`);
                    credential = await this.prisma.exchangeCredential.create({
                        data: {
                            userId,
                            exchange: 'paper-trading',
                            label: 'Paper Trading (Auto)',
                            encryptedApiKey: 'paper',
                            encryptedSecret: 'paper',
                            iv: 'auto-paper',
                            authTag: 'auto-paper',
                            secretIv: 'auto-paper',
                            secretAuthTag: 'auto-paper',
                            permissions: JSON.stringify(['read', 'trade']),
                            isValid: true,
                            lastValidatedAt: new Date(),
                            testnet: true,
                        },
                    });
                    effectiveCredentialId = credential.id;
                    this.logger.log(`🧪 Paper-trading credential created for user ${userId}`);
                }
            }
            catch (error) {
                this.logger.warn(`Could not setup paper credential: ${error.message}`);
            }
        }
        else {
            try {
                credential = await this.prisma.exchangeCredential.findFirst({
                    where: { id: effectiveCredentialId, userId, isValid: true },
                });
            }
            catch (error) {
                this.logger.error(`Database error looking up credential: ${error.message}`);
                throw new common_1.ServiceUnavailableException('خطأ في قاعدة البيانات — يرجى المحاولة لاحقاً');
            }
            if (!credential) {
                throw new common_1.NotFoundException('الحساب المفعّل غير صالح أو غير موجود — اختر حساباً آخر من الإعدادات');
            }
            isPaperTrading = credential.exchange === 'paper-trading';
            isTestnet = credential.testnet === true && credential.exchange !== 'paper-trading';
            exchangeName = credential.exchange;
            this.logger.log(`🧠 V135 Agent starting for user ${userId} on ${credential.exchange} ` +
                `(testnet=${credential.testnet || false}, isPaperTrading=${isPaperTrading}, isTestnet=${isTestnet})`);
        }
        let userSettings = null;
        try {
            userSettings = await this.prisma.agentSettings.findUnique({
                where: { userId },
            });
        }
        catch (e) {
            this.logger.warn(`Could not load user settings: ${e.message}`);
        }
        let globalAgentMaxPositions;
        try {
            const agentExecSetting = await this.prisma.setting.findFirst({
                where: { key: 'agentExecutorConfig' },
            });
            if (agentExecSetting) {
                const parsed = JSON.parse(agentExecSetting.value);
                if (parsed.agentMaxOpenPositions) {
                    globalAgentMaxPositions = parseInt(parsed.agentMaxOpenPositions, 10);
                    this.logger.log(`🧠 V145: Read agentMaxOpenPositions=${globalAgentMaxPositions} from admin settings`);
                }
            }
        }
        catch (globalErr) {
            this.logger.debug(`🧠 V145: Could not read global agentExecutorConfig: ${globalErr.message}`);
        }
        const config = {
            userId,
            strategy: dto.strategy,
            enabled: true,
            maxPositionSizePercent: dto.maxPositionSizePercent ??
                (userSettings ? Number(userSettings.maxPositionSizePercent) : undefined) ??
                (parseFloat(this.configService.get('MAX_POSITION_SIZE_PERCENT', '2')) || 2),
            maxDailyLossPercent: dto.maxDailyLossPercent ??
                (userSettings ? Number(userSettings.maxDailyLossPercent) : undefined) ??
                (parseFloat(this.configService.get('MAX_DAILY_LOSS_PERCENT', '5')) || 5),
            maxOpenPositions: dto.maxOpenPositions ??
                (userSettings ? Number(userSettings.maxOpenPositions) : undefined) ??
                globalAgentMaxPositions ??
                (parseInt(this.configService.get('MAX_OPEN_POSITIONS', '20'), 10) || 20),
            riskPerTradePercent: dto.riskPerTradePercent ??
                (userSettings ? Number(userSettings.riskPerTradePercent) : undefined) ??
                1.5,
            strategyParams: dto.strategyParams ??
                (userSettings ? this._buildStrategyParamsFromSettings(userSettings, dto.strategy) : undefined) ??
                this._getDefaultStrategyParams(dto.strategy),
            symbols: dto.symbols ??
                (userSettings && userSettings.defaultSymbols ? userSettings.defaultSymbols.split(',').filter(Boolean) : undefined) ??
                this.DEFAULT_SYMBOLS,
            credentialId: effectiveCredentialId || credential?.id || `paper-${userId}`,
            isPaperTrading,
            isTestnet,
            exchangeName,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const agentRunId = `run-${userId}-${Date.now()}`;
        const state = {
            status: agent_types_1.AgentStatus.RUNNING,
            config,
            startedAt: new Date(),
            dailyPnL: 0,
            dailyTradesCount: 0,
            dailyResetAt: new Date(),
            consecutiveLosses: 0,
            totalCycles: 0,
        };
        await this._saveAgentState(userId, state);
        try {
            await this.prisma.agentSession.create({
                data: {
                    userId,
                    agentRunId,
                    status: agent_types_1.AgentStatus.RUNNING,
                    strategy: config.strategy,
                    config: JSON.stringify(config),
                    credentialId: config.credentialId,
                    dailyPnL: 0,
                    dailyTradesCount: 0,
                    totalCycles: 0,
                    consecutiveLosses: 0,
                    startedAt: new Date(),
                    dailyResetAt: new Date(),
                },
            });
        }
        catch (dbError) {
            this.logger.error(`Failed to persist agent session to DB: ${dbError.message}`);
        }
        try {
            if (this.audit) {
                await this.audit.log({
                    userId,
                    action: 'AGENT_STARTED',
                    resource: 'autonomous-trader',
                    details: JSON.stringify({
                        strategy: config.strategy,
                        symbols: config.symbols,
                        maxPositionSizePercent: config.maxPositionSizePercent,
                        maxDailyLossPercent: config.maxDailyLossPercent,
                        maxOpenPositions: config.maxOpenPositions,
                    }),
                });
            }
        }
        catch (auditError) {
            this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
        }
        this.logger.log(`🧠 Agent started for user ${userId} — Strategy: ${config.strategy}`);
        return state;
    }
    async stopAgent(userId, emergency = false) {
        this._tryMarkReady();
        this._ensureReady();
        const state = await this._getAgentState(userId);
        if (!state) {
            throw new common_1.NotFoundException('الوكيل غير نشط');
        }
        state.status = emergency ? agent_types_1.AgentStatus.EMERGENCY_STOP : agent_types_1.AgentStatus.STOPPED;
        await this._saveAgentState(userId, state);
        if (emergency) {
            try {
                const openPositions = await this.prisma.position.findMany({
                    where: { userId, status: 'OPEN' },
                    select: { id: true, symbol: true },
                });
                if (openPositions.length > 0) {
                    this.logger.warn(`🧠 EMERGENCY STOP: closing ${openPositions.length} open positions for user ${userId}`);
                    await Promise.allSettled(openPositions.map((pos) => this.tradingService.closePositionWithRetry(userId, {
                        positionId: pos.id,
                        closeReason: 'EMERGENCY_STOP',
                    }).catch((err) => this.logger.error(`Failed to close position ${pos.id} (${pos.symbol}): ${err.message}`))));
                }
            }
            catch (closeErr) {
                this.logger.error(`Emergency position close failed: ${closeErr.message}`);
            }
        }
        try {
            const session = await this.prisma.agentSession.findFirst({
                where: { userId, status: 'RUNNING' },
                orderBy: { startedAt: 'desc' },
            });
            if (session) {
                await this.prisma.agentSession.update({
                    where: { id: session.id },
                    data: {
                        status: state.status,
                        stoppedAt: new Date(),
                        dailyPnL: state.dailyPnL,
                        dailyTradesCount: state.dailyTradesCount,
                        totalCycles: state.totalCycles,
                        consecutiveLosses: state.consecutiveLosses,
                        lastError: state.lastError,
                    },
                });
            }
        }
        catch (dbError) {
            this.logger.error(`Failed to update agent session in DB: ${dbError.message}`);
        }
        if (emergency) {
            this.logger.warn(`🚨 Emergency stop for user ${userId} — closing all positions`);
            await this.orderExecutor.emergencyCloseAll(userId);
        }
        this.signalEvaluator.clearUserStrategies(userId);
        try {
            if (this.audit) {
                await this.audit.log({
                    userId,
                    action: emergency ? 'AGENT_EMERGENCY_STOP' : 'AGENT_STOPPED',
                    resource: 'autonomous-trader',
                    details: JSON.stringify({
                        dailyPnL: state.dailyPnL,
                        dailyTradesCount: state.dailyTradesCount,
                        totalCycles: state.totalCycles,
                    }),
                });
            }
        }
        catch (auditError) {
            this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
        }
        this.logger.log(`🧠 Agent ${emergency ? 'emergency ' : ''}stopped for user ${userId}`);
        return state;
    }
    async getStatus(userId) {
        this._tryMarkReady();
        if (!this._isReady) {
            return null;
        }
        return this._getAgentState(userId);
    }
    async changeStrategy(userId, dto) {
        this._tryMarkReady();
        this._ensureReady();
        const state = await this._getAgentState(userId);
        if (!state || state.status !== agent_types_1.AgentStatus.RUNNING) {
            throw new common_1.BadRequestException('الوكيل ليس في حالة تشغيل');
        }
        const previousStrategy = state.config.strategy;
        state.config.strategy = dto.strategy;
        state.config.strategyParams = dto.strategyParams ?? this._getDefaultStrategyParams(dto.strategy);
        state.config.updatedAt = new Date();
        this.signalEvaluator.updateStrategy(userId, dto.strategy, state.config.strategyParams);
        await this._saveAgentState(userId, state);
        try {
            if (this.audit) {
                await this.audit.log({
                    userId,
                    action: 'AGENT_STRATEGY_CHANGED',
                    resource: 'autonomous-trader',
                    details: JSON.stringify({
                        from: previousStrategy,
                        to: dto.strategy,
                    }),
                });
            }
        }
        catch (auditError) {
            this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
        }
        this.logger.log(`🧠 Strategy changed for user ${userId}: ${previousStrategy} → ${dto.strategy}`);
        return state;
    }
    async updateRiskParams(userId, dto) {
        this._tryMarkReady();
        this._ensureReady();
        const state = await this._getAgentState(userId);
        if (!state) {
            throw new common_1.NotFoundException('الوكيل غير نشط');
        }
        if (dto.maxPositionSizePercent)
            state.config.maxPositionSizePercent = dto.maxPositionSizePercent;
        if (dto.maxDailyLossPercent)
            state.config.maxDailyLossPercent = dto.maxDailyLossPercent;
        if (dto.maxOpenPositions)
            state.config.maxOpenPositions = dto.maxOpenPositions;
        if (dto.riskPerTradePercent)
            state.config.riskPerTradePercent = dto.riskPerTradePercent;
        state.config.updatedAt = new Date();
        await this._saveAgentState(userId, state);
        try {
            if (this.audit) {
                await this.audit.log({
                    userId,
                    action: 'AGENT_RISK_PARAMS_UPDATED',
                    resource: 'autonomous-trader',
                    details: JSON.stringify(dto),
                });
            }
        }
        catch (auditError) {
            this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
        }
        return state;
    }
    async getSettings(userId) {
        this._tryMarkReady();
        this._ensureReady();
        let settings = await this.prisma.agentSettings.findUnique({
            where: { userId },
        });
        if (!settings) {
            settings = await this._createDefaultSettings(userId);
        }
        const result = { ...settings };
        result.defaultSymbols = settings.defaultSymbols
            ? settings.defaultSymbols.split(',').filter(Boolean)
            : this.DEFAULT_SYMBOLS;
        return result;
    }
    async updateSettings(userId, dto) {
        this._tryMarkReady();
        this._ensureReady();
        let settings = await this.prisma.agentSettings.findUnique({
            where: { userId },
        });
        if (!settings) {
            settings = await this._createDefaultSettings(userId);
        }
        const updateData = {};
        if (dto.autoTradingEnabled !== undefined)
            updateData.autoTradingEnabled = dto.autoTradingEnabled;
        if (dto.paperBalance !== undefined)
            updateData.paperBalance = dto.paperBalance;
        if (dto.paperForexLeverage !== undefined)
            updateData.paperForexLeverage = dto.paperForexLeverage;
        if (dto.paperGoldLeverage !== undefined)
            updateData.paperGoldLeverage = dto.paperGoldLeverage;
        if (dto.paperCryptoLeverage !== undefined)
            updateData.paperCryptoLeverage = dto.paperCryptoLeverage;
        if (dto.maxPositionSizePercent !== undefined)
            updateData.maxPositionSizePercent = dto.maxPositionSizePercent;
        if (dto.maxDailyLossPercent !== undefined)
            updateData.maxDailyLossPercent = dto.maxDailyLossPercent;
        if (dto.maxOpenPositions !== undefined)
            updateData.maxOpenPositions = dto.maxOpenPositions;
        if (dto.riskPerTradePercent !== undefined)
            updateData.riskPerTradePercent = dto.riskPerTradePercent;
        if (dto.defaultStrategy !== undefined)
            updateData.defaultStrategy = dto.defaultStrategy;
        if (dto.scalpingTimeframe !== undefined)
            updateData.scalpingTimeframe = dto.scalpingTimeframe;
        if (dto.scalpingTakeProfitPips !== undefined)
            updateData.scalpingTakeProfitPips = dto.scalpingTakeProfitPips;
        if (dto.scalpingStopLossPips !== undefined)
            updateData.scalpingStopLossPips = dto.scalpingStopLossPips;
        if (dto.scalpingMaxSpread !== undefined)
            updateData.scalpingMaxSpread = dto.scalpingMaxSpread;
        if (dto.swingTimeframe !== undefined)
            updateData.swingTimeframe = dto.swingTimeframe;
        if (dto.swingHoldingPeriodHours !== undefined)
            updateData.swingHoldingPeriodHours = dto.swingHoldingPeriodHours;
        if (dto.swingTrendLookback !== undefined)
            updateData.swingTrendLookback = dto.swingTrendLookback;
        if (dto.gridLevels !== undefined)
            updateData.gridLevels = dto.gridLevels;
        if (dto.gridSpacingPercent !== undefined)
            updateData.gridSpacingPercent = dto.gridSpacingPercent;
        if (dto.gridQuantityPerLevel !== undefined)
            updateData.gridQuantityPerLevel = dto.gridQuantityPerLevel;
        if (dto.defaultSymbols !== undefined) {
            updateData.defaultSymbols = dto.defaultSymbols.join(',');
        }
        const updated = await this.prisma.agentSettings.update({
            where: { userId },
            data: updateData,
        });
        const state = await this._getAgentState(userId);
        if (state && state.status === agent_types_1.AgentStatus.RUNNING) {
            if (dto.maxPositionSizePercent !== undefined)
                state.config.maxPositionSizePercent = dto.maxPositionSizePercent;
            if (dto.maxDailyLossPercent !== undefined)
                state.config.maxDailyLossPercent = dto.maxDailyLossPercent;
            if (dto.maxOpenPositions !== undefined)
                state.config.maxOpenPositions = dto.maxOpenPositions;
            if (dto.riskPerTradePercent !== undefined)
                state.config.riskPerTradePercent = dto.riskPerTradePercent;
            if (dto.scalpingTimeframe || dto.scalpingTakeProfitPips || dto.scalpingStopLossPips || dto.scalpingMaxSpread ||
                dto.swingTimeframe || dto.swingHoldingPeriodHours || dto.swingTrendLookback ||
                dto.gridLevels || dto.gridSpacingPercent || dto.gridQuantityPerLevel) {
                state.config.strategyParams = this._buildStrategyParamsFromSettings(updated, state.config.strategy);
            }
            state.config.updatedAt = new Date();
            await this._saveAgentState(userId, state);
        }
        try {
            if (this.audit) {
                await this.audit.log({
                    userId,
                    action: 'AGENT_SETTINGS_UPDATED',
                    resource: 'autonomous-trader',
                    details: JSON.stringify(dto),
                });
            }
        }
        catch (auditError) {
            this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
        }
        const result = { ...updated };
        result.defaultSymbols = updated.defaultSymbols
            ? updated.defaultSymbols.split(',').filter(Boolean)
            : this.DEFAULT_SYMBOLS;
        return result;
    }
    async updateSystemAutoTrading(enabled) {
        this._tryMarkReady();
        this._ensureReady();
        try {
            await this.prisma.setting.upsert({
                where: { key: 'AUTO_TRADING_ENABLED' },
                update: { value: JSON.stringify(enabled) },
                create: { key: 'AUTO_TRADING_ENABLED', value: JSON.stringify(enabled) },
            });
            this.logger.log(`🔧 System AUTO_TRADING_ENABLED set to ${enabled} in DB`);
        }
        catch (error) {
            this.logger.error(`Failed to update system AUTO_TRADING_ENABLED: ${error.message}`);
            throw error;
        }
    }
    async getPublicStatus() {
        this._tryMarkReady();
        let autoTradingEnabled = true;
        let source = 'env_var';
        try {
            if (!this.prisma) {
                autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
                source = 'env_var';
            }
            else {
                const dbSetting = await this.prisma.setting.findUnique({
                    where: { key: 'AUTO_TRADING_ENABLED' },
                });
                if (dbSetting) {
                    autoTradingEnabled = JSON.parse(dbSetting.value);
                    source = 'database';
                }
                else {
                    autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
                    source = 'env_var';
                }
            }
        }
        catch {
            autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
            source = 'env_var';
        }
        return {
            success: true,
            data: {
                autoTradingEnabled,
                source,
            },
        };
    }
    async getSystemStatus() {
        this._tryMarkReady();
        let dbAutoTradingEnabled = null;
        try {
            if (this.prisma) {
                const dbSetting = await this.prisma.setting.findUnique({
                    where: { key: 'AUTO_TRADING_ENABLED' },
                });
                if (dbSetting) {
                    dbAutoTradingEnabled = JSON.parse(dbSetting.value);
                }
            }
        }
        catch {
        }
        const envAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
        const autoTradingEnabled = dbAutoTradingEnabled !== null ? dbAutoTradingEnabled : envAutoTradingEnabled;
        const defaultPaperBalance = parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000;
        return {
            success: true,
            data: {
                autoTradingEnabled,
                globalAutoTradingEnabled: autoTradingEnabled,
                source: dbAutoTradingEnabled !== null ? 'database' : 'env_var',
                defaultPaperBalance,
                nodeEnv: this.configService.get('NODE_ENV', 'development'),
                message: autoTradingEnabled
                    ? 'التداول الذاتي مفعّل على مستوى النظام'
                    : 'التداول الذاتي معطّل على مستوى النظام',
            },
        };
    }
    async _createDefaultSettings(userId) {
        return this.prisma.agentSettings.create({
            data: {
                userId,
                autoTradingEnabled: true,
                paperBalance: parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000,
                maxPositionSizePercent: parseFloat(this.configService.get('MAX_POSITION_SIZE_PERCENT', '2')) || 2,
                maxDailyLossPercent: parseFloat(this.configService.get('MAX_DAILY_LOSS_PERCENT', '5')) || 5,
                maxOpenPositions: parseInt(this.configService.get('MAX_OPEN_POSITIONS', '20'), 10) || 20,
                riskPerTradePercent: 1.5,
                defaultStrategy: agent_types_1.StrategyType.AUTO,
                scalpingTimeframe: '5m',
                scalpingTakeProfitPips: 15,
                scalpingStopLossPips: 10,
                scalpingMaxSpread: 3,
                swingTimeframe: '1h',
                swingHoldingPeriodHours: 48,
                swingTrendLookback: 50,
                gridLevels: 5,
                gridSpacingPercent: 0.5,
                defaultSymbols: this.DEFAULT_SYMBOLS.join(','),
            },
        });
    }
    _buildStrategyParamsFromSettings(settings, strategy) {
        switch (strategy) {
            case agent_types_1.StrategyType.AUTO:
                return {
                    ...this._buildStrategyParamsFromSettings(settings, agent_types_1.StrategyType.SCALPING),
                    ...this._buildStrategyParamsFromSettings(settings, agent_types_1.StrategyType.SWING),
                    ...this._buildStrategyParamsFromSettings(settings, agent_types_1.StrategyType.MEAN_REVERSION),
                    ...this._buildStrategyParamsFromSettings(settings, agent_types_1.StrategyType.MOMENTUM_BREAKOUT),
                    ...this._buildStrategyParamsFromSettings(settings, agent_types_1.StrategyType.DCA),
                    ...this._buildStrategyParamsFromSettings(settings, agent_types_1.StrategyType.VWAP_RSI),
                };
            case agent_types_1.StrategyType.SCALPING:
                return {
                    scalpingTimeframe: settings.scalpingTimeframe || '5m',
                    scalpingTakeProfitPips: settings.scalpingTakeProfitPips ?? 15,
                    scalpingStopLossPips: settings.scalpingStopLossPips ?? 10,
                    scalpingMaxSpread: settings.scalpingMaxSpread ?? 3,
                };
            case agent_types_1.StrategyType.SWING:
                return {
                    swingTimeframe: settings.swingTimeframe || '1h',
                    swingHoldingPeriodHours: settings.swingHoldingPeriodHours ?? 48,
                    swingTrendLookback: settings.swingTrendLookback ?? 50,
                };
            case agent_types_1.StrategyType.GRID:
                return {
                    gridLevels: settings.gridLevels ?? 5,
                    gridSpacingPercent: settings.gridSpacingPercent ?? 0.5,
                    gridQuantityPerLevel: settings.gridQuantityPerLevel
                        ? Number(settings.gridQuantityPerLevel)
                        : undefined,
                };
            default:
                return {};
        }
    }
    async getOpenPositions(userId) {
        this._tryMarkReady();
        this._ensureReady();
        return this.prisma.position.findMany({
            where: { userId, status: 'OPEN', source: 'agent' },
            orderBy: { openedAt: 'desc' },
        });
    }
    async getPerformance(userId, period = 'WEEKLY') {
        this._tryMarkReady();
        this._ensureReady();
        const tracker = new performance_1.PerformanceTracker();
        const todayStart = this._getPeriodStart(period);
        const trades = await this.prisma.trade.findMany({
            where: {
                userId,
                executedAt: { gte: todayStart },
                type: { in: ['EXIT', 'PARTIAL_EXIT'] },
                pnl: { not: null },
            },
            orderBy: { executedAt: 'asc' },
        });
        for (const trade of trades) {
            let strategy = agent_types_1.StrategyType.SWING;
            try {
                const metadata = trade.metadata;
                if (metadata && typeof metadata === 'string') {
                    const parsed = JSON.parse(metadata);
                    if (parsed.strategy && Object.values(agent_types_1.StrategyType).includes(parsed.strategy)) {
                        strategy = parsed.strategy;
                    }
                }
            }
            catch {
            }
            tracker.addTrade({
                id: trade.id,
                symbol: trade.symbol,
                side: trade.side,
                strategy,
                pnl: Number(trade.pnl || 0),
                fee: Number(trade.fee || 0),
                openedAt: trade.executedAt,
                closedAt: trade.executedAt,
            });
        }
        return tracker.calculateMetrics(period);
    }
    async runCycle() {
        try {
            let autoTradingEnabled = true;
            try {
                const dbSetting = await this.prisma.setting.findUnique({
                    where: { key: 'AUTO_TRADING_ENABLED' },
                });
                if (dbSetting) {
                    autoTradingEnabled = JSON.parse(dbSetting.value);
                }
            }
            catch {
                autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
            }
            if (!autoTradingEnabled) {
                return;
            }
        }
        catch {
        }
        if (!this._isReady) {
            this._tryMarkReady();
            if (!this._isReady) {
                return;
            }
        }
        if (this.isCycleRunning) {
            this.logger.debug('Previous cycle still running — skipping');
            return;
        }
        this.isCycleRunning = true;
        try {
            const activeAgents = await this._getActiveAgents();
            if (activeAgents.length === 0) {
                return;
            }
            this.logger.debug(`🧠 Processing ${activeAgents.length} active agents`);
            for (const userId of activeAgents) {
                try {
                    await this._processAgentCycle(userId);
                }
                catch (error) {
                    this.logger.error(`Agent cycle failed for ${userId}: ${error.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`Cycle error: ${error.message}`);
        }
        finally {
            this.isCycleRunning = false;
        }
    }
    async _processAgentCycle(userId) {
        const state = await this._getAgentState(userId);
        if (!state)
            return;
        this._resetDailyStatsIfNeeded(state);
        if (state.status !== agent_types_1.AgentStatus.RUNNING)
            return;
        try {
            const activeSetting = await this.prisma.setting.findFirst({
                where: { key: `user:${userId}:activeCredentialId` },
            });
            const settingsActiveId = activeSetting?.value || undefined;
            if (settingsActiveId && settingsActiveId !== state.config.credentialId) {
                state.config.credentialId = settingsActiveId;
                const credential = await this.prisma.exchangeCredential.findFirst({
                    where: { id: settingsActiveId, userId, isValid: true },
                    select: { testnet: true, exchange: true },
                });
                if (credential) {
                    state.config.isPaperTrading = credential.exchange === 'paper-trading';
                    state.config.isTestnet = credential.testnet === true && credential.exchange !== 'paper-trading';
                    state.config.exchangeName = credential.exchange;
                    this.logger.log(`🧠 V136 Agent credential updated for user ${userId}: ` +
                        `${credential.exchange} (isPaperTrading=${state.config.isPaperTrading}, isTestnet=${state.config.isTestnet})`);
                }
                await this._saveAgentState(userId, state);
            }
            else if (!settingsActiveId && state.config.credentialId && !state.config.credentialId.startsWith('paper-')) {
                state.config.credentialId = `paper-${userId}`;
                state.config.isPaperTrading = true;
                state.config.isTestnet = false;
                state.config.exchangeName = undefined;
                this.logger.log(`🧠 V136 Agent credential removed for user ${userId} — reverting to paper trading`);
                await this._saveAgentState(userId, state);
            }
        }
        catch (err) {
            this.logger.debug(`🧠 V136 Could not refresh credential for user ${userId}: ${err.message}`);
        }
        const dailyLimitReached = await this.riskCalculator.isDailyLimitReached(userId, state.config.maxDailyLossPercent);
        if (dailyLimitReached) {
            this.logger.warn(`🧠 HARD STOP: User ${userId} hit daily loss limit — auto-stopping agent`);
            state.status = agent_types_1.AgentStatus.DAILY_LIMIT_REACHED;
            await this._saveAgentState(userId, state);
            try {
                await this.prisma.setting.upsert({
                    where: { key: `user:${userId}:agentDailyLossHit` },
                    update: { value: new Date().toDateString() },
                    create: { key: `user:${userId}:agentDailyLossHit`, value: new Date().toDateString() },
                });
            }
            catch { }
            try {
                this.logger.warn(`🛑 Agent ${userId}: Daily loss limit reached — agent stopped automatically. Risk alert would be sent to user.`);
            }
            catch { }
            return;
        }
        try {
            const dailyLossFlag = await this.prisma.setting.findUnique({
                where: { key: `user:${userId}:agentDailyLossHit` },
            });
            if (dailyLossFlag?.value === new Date().toDateString()) {
                this.logger.warn(`🧠 User ${userId} already hit daily loss limit today — agent remains stopped`);
                state.status = agent_types_1.AgentStatus.DAILY_LIMIT_REACHED;
                await this._saveAgentState(userId, state);
                return;
            }
        }
        catch { }
        await this._monitorOpenPositions(userId, state);
        let agentBriefs = [];
        let usingCouncilBriefs = false;
        if (this.councilService) {
            try {
                const allBriefs = await this.councilService.getActiveBriefs();
                agentBriefs = allBriefs.filter((brief) => (0, strategic_council_types_1.isAgentTimeframe)(brief.timeframe));
                usingCouncilBriefs = agentBriefs.length > 0;
                if (agentBriefs.length > 0) {
                    this.logger.log(`🧠 Agent ${userId} cycle #${state.totalCycles + 1}: ` +
                        `${agentBriefs.length} council briefs for agent timeframes [${strategic_council_types_1.AGENT_TIMEFRAMES.join(',')}] ` +
                        `(total briefs: ${allBriefs.length})`);
                }
            }
            catch (councilErr) {
                this.logger.warn(`🧠 Council briefs unavailable for agent ${userId}: ${councilErr.message} — falling back to self-analysis`);
            }
        }
        if (!usingCouncilBriefs) {
            this.logger.debug(`🧠 Agent ${userId}: No council briefs available — using self-analysis fallback`);
        }
        let signalsExecuted = 0;
        let signalsGenerated = 0;
        let signalsRejected = 0;
        const rejectionReasons = [];
        if (usingCouncilBriefs) {
            for (const brief of agentBriefs) {
                try {
                    const existingPosition = await this.prisma.position.findFirst({
                        where: { userId, symbol: brief.pair, status: 'OPEN', source: 'agent' },
                    });
                    if (existingPosition) {
                        this.logger.debug(`🧠 Skipping brief ${brief.id} — Agent already has position for ${brief.pair} ` +
                            `(existing: ${existingPosition.side})`);
                        continue;
                    }
                    const minConfidence = 65;
                    if (brief.confidence < minConfidence) {
                        this.logger.debug(`🧠 Skipping brief ${brief.id} — confidence ${brief.confidence}% < min ${minConfidence}%`);
                        continue;
                    }
                    const userExchange = state.config.exchangeName || 'binance';
                    if (!(0, strategic_council_types_1.isSymbolSupportedByExchange)(brief.pair, userExchange)) {
                        this.logger.debug(`🧠 Skipping brief ${brief.id} — ${brief.pair} not supported on ${userExchange}`);
                        continue;
                    }
                    const isSpotExchange = !state.config.isPaperTrading &&
                        !state.config.isTestnet &&
                        userExchange !== 'alpaca';
                    const isBriefSell = brief.direction === 'SELL';
                    if (isSpotExchange && isBriefSell) {
                        this.logger.debug(`🧠 Skipping SELL brief ${brief.id} — ${brief.pair} SELL not possible on spot exchange ${userExchange} (need margin/futures for short selling)`);
                        continue;
                    }
                    const marketStatus = (0, market_hours_util_1.isMarketOpen)(brief.pair);
                    if (!marketStatus.open) {
                        rejectionReasons.push(`${brief.pair}: سوق مغلق`);
                        continue;
                    }
                    signalsGenerated++;
                    const signal = {
                        id: brief.id,
                        symbol: brief.pair,
                        action: brief.direction === 'BUY' ? agent_types_1.OrderSide.BUY : agent_types_1.OrderSide.SELL,
                        type: agent_types_1.OrderType.MARKET,
                        confidence: brief.confidence,
                        strategy: state.config.strategy,
                        entryPrice: brief.entryPrice,
                        stopLoss: brief.stopLoss,
                        takeProfit: brief.takeProfit,
                        quantity: 0,
                        reasoning: brief.analysisSummary || `Council brief: ${brief.timeframe} ${brief.direction}`,
                        riskRewardRatio: Math.abs(brief.takeProfit - brief.entryPrice) / Math.abs(brief.entryPrice - brief.stopLoss),
                        riskScore: 100 - brief.confidence,
                        timestamp: new Date(),
                        timeframe: brief.timeframe,
                        metadata: { briefId: brief.id, timeframe: brief.timeframe, source: 'council' },
                    };
                    const risk = await this.riskCalculator.assessRisk(userId, signal, state.config);
                    if (!risk.canTrade) {
                        signalsRejected++;
                        rejectionReasons.push(`${brief.pair}: ${risk.reason}`);
                        state.lastError = risk.reason;
                        continue;
                    }
                    this.logger.log(`🧠 Agent ${userId}: Executing signal — ${signal.action} ${signal.symbol} ` +
                        `(confidence: ${signal.confidence}%, RR: ${signal.riskRewardRatio?.toFixed(2)}, ` +
                        `brief: ${brief.id}, timeframe: ${brief.timeframe})`);
                    signalsGenerated++;
                    const execution = await this.orderExecutor.execute(userId, signal, risk, state.config.credentialId);
                    if (execution.success) {
                        signalsExecuted++;
                        state.dailyTradesCount++;
                        state.dailyPnL -= (execution.fee || 0);
                        this.logger.log(`✅ Agent ${userId}: Trade executed — ${signal.action} ${signal.symbol} ` +
                            `@ ${execution.averagePrice?.toFixed(2)} (order: ${execution.orderId})`);
                    }
                    else {
                        signalsRejected++;
                        rejectionReasons.push(`${brief.pair}: ${execution.error}`);
                        state.lastError = execution.error || 'فشل تنفيذ الصفقة';
                        this.logger.warn(`⚠️ Agent ${userId}: Trade rejected — ${signal.action} ${signal.symbol}: ${execution.error}`);
                    }
                    try {
                        await this.redis.set(`agent:decision:${userId}:${signal.symbol}`, JSON.stringify({
                            action: signal.action,
                            symbol: signal.symbol,
                            confidence: signal.confidence,
                            entryPrice: signal.entryPrice,
                            stopLoss: signal.stopLoss,
                            takeProfit: signal.takeProfit,
                            strategy: signal.strategy,
                            reasoning: signal.reasoning,
                            briefId: brief.id,
                            timeframe: brief.timeframe,
                            generatedAt: new Date().toISOString(),
                            status: execution.success ? 'EXECUTED' : 'REJECTED',
                            orderId: execution.orderId,
                        }), 300000);
                    }
                    catch (redisErr) {
                        this.logger.debug(`Could not cache agent decision: ${redisErr.message}`);
                    }
                    try {
                        await this.prisma.signal.upsert({
                            where: { id: `agent-${brief.id}` },
                            create: {
                                id: `agent-${brief.id}`,
                                userId,
                                pair: signal.symbol,
                                action: signal.action,
                                status: 'ACTIVE',
                                entryPrice: signal.entryPrice,
                                stopLoss: signal.stopLoss,
                                takeProfit: signal.takeProfit,
                                confidence: Math.round(signal.confidence),
                                reason: signal.reasoning || `Agent signal: ${signal.action} ${signal.symbol}`,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                            },
                            update: {
                                status: 'ACTIVE',
                                confidence: Math.round(signal.confidence),
                                updatedAt: new Date(),
                            },
                        });
                    }
                    catch (signalErr) {
                        this.logger.debug(`Could not store agent signal: ${signalErr.message}`);
                    }
                    state.lastSignalAt = new Date();
                    if (state.consecutiveLosses >= 5) {
                        this.logger.warn(`🧠 User ${userId}: 5 consecutive losses — pausing agent`);
                        state.status = agent_types_1.AgentStatus.PAUSED;
                        break;
                    }
                }
                catch (error) {
                    this.logger.error(`Error processing council brief ${brief.id} for ${userId}: ${error.message}`);
                }
            }
        }
        else {
            this.logger.debug(`🧠 Agent ${userId}: No M30+ council briefs available — waiting for next Council session. ` +
                `Agent does NOT fall back to self-analysis to avoid competing with SmartExecutor.`);
        }
        state.totalCycles++;
        state.lastCycleAt = new Date();
        this.logger.log(`🧠 Agent ${userId} cycle #${state.totalCycles} complete: ` +
            `${usingCouncilBriefs ? `${agentBriefs.length} council briefs` : 'self-analysis'}, ` +
            `${signalsGenerated} signals, ${signalsExecuted} executed, ${signalsRejected} rejected` +
            (rejectionReasons.length > 0 ? ` — rejections: [${rejectionReasons.join('; ')}]` : '') +
            (signalsGenerated === 0 ? ' — NO signals generated' : ''));
        await this._saveAgentState(userId, state);
    }
    async _getAgentState(userId) {
        try {
            const raw = await this.redis.get(`agent:state:${userId}`);
            if (raw) {
                return JSON.parse(raw);
            }
        }
        catch {
        }
        try {
            const session = await this.prisma.agentSession.findFirst({
                where: { userId, status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
                orderBy: { startedAt: 'desc' },
            });
            if (session) {
                this.logger.log(`🧠 Recovered agent state from DB for user ${userId} (session ${session.agentRunId})`);
                let config;
                try {
                    config = JSON.parse(session.config);
                }
                catch {
                    config = {
                        userId,
                        strategy: session.strategy,
                        enabled: true,
                        maxPositionSizePercent: 2,
                        maxDailyLossPercent: 5,
                        maxOpenPositions: 20,
                        riskPerTradePercent: 1.5,
                        strategyParams: this._getDefaultStrategyParams(session.strategy),
                        symbols: this.DEFAULT_SYMBOLS,
                        credentialId: session.credentialId,
                        createdAt: session.startedAt,
                        updatedAt: session.updatedAt,
                    };
                }
                const state = {
                    status: session.status,
                    config,
                    startedAt: session.startedAt,
                    dailyPnL: Number(session.dailyPnL),
                    dailyTradesCount: session.dailyTradesCount,
                    dailyResetAt: session.dailyResetAt ?? undefined,
                    consecutiveLosses: session.consecutiveLosses,
                    totalCycles: session.totalCycles,
                    lastError: session.lastError ?? undefined,
                    lastCycleAt: session.lastCycleAt ?? undefined,
                    lastSignalAt: session.lastSignalAt ?? undefined,
                };
                await this._saveAgentState(userId, state);
                return state;
            }
        }
        catch (dbError) {
            this.logger.error(`DB fallback for agent state also failed: ${dbError.message}`);
        }
        return null;
    }
    async _saveAgentState(userId, state) {
        try {
            await this.redis.set(`agent:state:${userId}`, JSON.stringify(state), 86400000);
        }
        catch (error) {
            this.logger.error(`Failed to save agent state for ${userId}: ${error.message}`);
        }
        this._syncStateToDB(userId, state).catch((err) => {
            this.logger.error(`Failed to sync agent state to DB: ${err.message}`);
        });
    }
    async _syncStateToDB(userId, state) {
        try {
            const session = await this.prisma.agentSession.findFirst({
                where: { userId, status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
                orderBy: { startedAt: 'desc' },
            });
            if (session) {
                await this.prisma.agentSession.update({
                    where: { id: session.id },
                    data: {
                        status: state.status,
                        dailyPnL: state.dailyPnL,
                        dailyTradesCount: state.dailyTradesCount,
                        totalCycles: state.totalCycles,
                        consecutiveLosses: state.consecutiveLosses,
                        lastError: state.lastError ?? null,
                        lastCycleAt: state.lastCycleAt ?? null,
                        lastSignalAt: state.lastSignalAt ?? null,
                        dailyResetAt: state.dailyResetAt ?? null,
                    },
                });
            }
        }
        catch {
        }
    }
    async _getActiveAgents() {
        const activeUsers = [];
        const seenUserIds = new Set();
        try {
            const keys = await this.redis.scanKeys('agent:state:*');
            for (const key of keys) {
                try {
                    const raw = await this.redis.get(key);
                    if (raw) {
                        const state = JSON.parse(raw);
                        if (state.status === agent_types_1.AgentStatus.RUNNING) {
                            const userId = key.replace('agent:state:', '');
                            activeUsers.push(userId);
                            seenUserIds.add(userId);
                        }
                    }
                }
                catch {
                }
            }
        }
        catch (redisError) {
            this.logger.warn(`Redis scanKeys failed in _getActiveAgents: ${redisError?.message || redisError}`);
        }
        if (activeUsers.length === 0) {
            try {
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const runningSessions = await this.prisma.agentSession.findMany({
                    where: {
                        status: 'RUNNING',
                        startedAt: { gte: twentyFourHoursAgo },
                    },
                    orderBy: { startedAt: 'desc' },
                });
                for (const session of runningSessions) {
                    if (seenUserIds.has(session.userId))
                        continue;
                    try {
                        const settings = await this.prisma.agentSettings.findUnique({
                            where: { userId: session.userId },
                        });
                        if (settings && !settings.autoTradingEnabled) {
                            await this.prisma.agentSession.update({
                                where: { id: session.id },
                                data: { status: 'STOPPED', stoppedAt: new Date() },
                            }).catch(() => { });
                            continue;
                        }
                    }
                    catch { }
                    try {
                        let config;
                        try {
                            config = JSON.parse(session.config);
                        }
                        catch {
                            config = {
                                userId: session.userId,
                                strategy: session.strategy,
                                enabled: true,
                                maxPositionSizePercent: 2,
                                maxDailyLossPercent: 5,
                                maxOpenPositions: 20,
                                riskPerTradePercent: 1.5,
                                strategyParams: this._getDefaultStrategyParams(session.strategy),
                                symbols: this.DEFAULT_SYMBOLS,
                                credentialId: session.credentialId,
                                isPaperTrading: true,
                                isTestnet: false,
                                exchangeName: undefined,
                                createdAt: session.startedAt,
                                updatedAt: session.updatedAt,
                            };
                        }
                        const state = {
                            status: agent_types_1.AgentStatus.RUNNING,
                            config,
                            startedAt: session.startedAt,
                            dailyPnL: Number(session.dailyPnL),
                            dailyTradesCount: session.dailyTradesCount,
                            dailyResetAt: session.dailyResetAt ?? new Date(),
                            consecutiveLosses: session.consecutiveLosses,
                            totalCycles: session.totalCycles,
                            lastError: session.lastError ?? undefined,
                            lastCycleAt: session.lastCycleAt ?? undefined,
                            lastSignalAt: session.lastSignalAt ?? undefined,
                        };
                        await this.redis.set(`agent:state:${session.userId}`, JSON.stringify(state), 86400000);
                        activeUsers.push(session.userId);
                        seenUserIds.add(session.userId);
                        this.logger.log(`🧠 DB recovery: Restored agent state for user ${session.userId} from DB (Redis lost it — likely restart). ` +
                            `Session ${session.agentRunId}, strategy: ${session.strategy}`);
                    }
                    catch (restoreErr) {
                        this.logger.warn(`🧠 Failed to restore agent state for user ${session.userId}: ${restoreErr.message}`);
                    }
                }
                if (activeUsers.length > 0) {
                    this.logger.log(`🧠 Recovered ${activeUsers.length} active agent(s) from DB (Redis was empty)`);
                }
            }
            catch (dbError) {
                this.logger.warn(`🧠 DB fallback for _getActiveAgents failed: ${dbError.message}`);
            }
        }
        return activeUsers;
    }
    _resetDailyStatsIfNeeded(state) {
        const now = new Date();
        const resetDate = state.dailyResetAt ? new Date(state.dailyResetAt) : new Date(0);
        const isNewDay = now.getFullYear() !== resetDate.getFullYear() ||
            now.getMonth() !== resetDate.getMonth() ||
            now.getDate() !== resetDate.getDate();
        if (isNewDay) {
            state.dailyPnL = 0;
            state.dailyTradesCount = 0;
            state.dailyResetAt = now;
            if (state.status === agent_types_1.AgentStatus.DAILY_LIMIT_REACHED) {
                state.status = agent_types_1.AgentStatus.RUNNING;
            }
        }
    }
    _getDefaultStrategyParams(strategy) {
        switch (strategy) {
            case agent_types_1.StrategyType.AUTO:
                return {
                    ...this._getDefaultStrategyParams(agent_types_1.StrategyType.SCALPING),
                    ...this._getDefaultStrategyParams(agent_types_1.StrategyType.SWING),
                    ...this._getDefaultStrategyParams(agent_types_1.StrategyType.MEAN_REVERSION),
                    ...this._getDefaultStrategyParams(agent_types_1.StrategyType.MOMENTUM_BREAKOUT),
                    ...this._getDefaultStrategyParams(agent_types_1.StrategyType.DCA),
                    ...this._getDefaultStrategyParams(agent_types_1.StrategyType.VWAP_RSI),
                };
            case agent_types_1.StrategyType.SCALPING:
                return {
                    scalpingTimeframe: '5m',
                    scalpingTakeProfitPips: 15,
                    scalpingStopLossPips: 10,
                    scalpingMaxSpread: 3,
                };
            case agent_types_1.StrategyType.SWING:
                return {
                    swingTimeframe: '1h',
                    swingHoldingPeriodHours: 48,
                    swingTrendLookback: 50,
                };
            case agent_types_1.StrategyType.GRID:
                return {
                    gridLevels: 5,
                    gridSpacingPercent: 0.5,
                    gridQuantityPerLevel: undefined,
                };
            case agent_types_1.StrategyType.MEAN_REVERSION:
                return {
                    meanReversionRsiOversold: 30,
                    meanReversionRsiOverbought: 70,
                    meanReversionBbLower: 0.15,
                    meanReversionBbUpper: 0.85,
                    meanReversionDeviation: 1.5,
                };
            case agent_types_1.StrategyType.MOMENTUM_BREAKOUT:
                return {
                    momentumBreakoutAtrMultiplier: 1.5,
                    momentumBreakoutVolumeThreshold: 0,
                };
            case agent_types_1.StrategyType.DCA:
                return {
                    dcaBaseMultiplier: 1.0,
                    dcaDiscountRsi: 40,
                    dcaSkipRsi: 70,
                };
            case agent_types_1.StrategyType.VWAP_RSI:
                return {
                    vwapRsiBuyMin: 50,
                    vwapRsiBuyMax: 70,
                    vwapRsiSellMin: 30,
                    vwapRsiSellMax: 50,
                };
            default:
                return {};
        }
    }
    async _monitorOpenPositions(userId, state) {
        try {
            const positions = await this.prisma.position.findMany({
                where: { userId, status: 'OPEN', source: 'agent' },
            });
            if (positions.length === 0)
                return;
            for (const position of positions) {
                let currentPrice = Number(position.currentPrice || position.entryPrice);
                const stopLoss = Number(position.stopLoss || 0);
                const takeProfit = Number(position.takeProfit || 0);
                const isPaperPosition = position.exchange === 'paper-trading';
                try {
                    const quote = await this.exchangeService.getQuote(position.symbol);
                    if (quote && quote.price) {
                        currentPrice = quote.price;
                        await this.prisma.position.update({
                            where: { id: position.id },
                            data: {
                                currentPrice: quote.price,
                                unrealizedPnl: position.side === 'BUY'
                                    ? (quote.price - Number(position.entryPrice)) * Number(position.quantity)
                                    : (Number(position.entryPrice) - quote.price) * Number(position.quantity),
                            },
                        });
                        this.logger.debug(`🧠 Updated ${position.exchange} position ${position.symbol} price: ${quote.price}`);
                    }
                }
                catch (quoteErr) {
                    this.logger.warn(`Could not get quote for ${position.exchange} position ${position.symbol}: ${quoteErr.message}`);
                    if (isPaperPosition) {
                        const entryPrice = Number(position.entryPrice);
                        const lastPrice = Number(position.currentPrice || entryPrice);
                        const maxDelta = entryPrice * 0.005;
                        const delta = (Math.random() - 0.5) * 2 * maxDelta;
                        currentPrice = Math.max(lastPrice + delta, entryPrice * 0.5);
                        try {
                            await this.prisma.position.update({
                                where: { id: position.id },
                                data: {
                                    currentPrice,
                                    unrealizedPnl: position.side === 'BUY'
                                        ? (currentPrice - entryPrice) * Number(position.quantity)
                                        : (entryPrice - currentPrice) * Number(position.quantity),
                                },
                            });
                            this.logger.log(`🧠 Simulated price for paper position ${position.symbol}: ${currentPrice.toFixed(2)} (last: ${lastPrice.toFixed(2)}, ±0.5% unbiased walk)`);
                        }
                        catch (simErr) {
                            this.logger.warn(`Failed to save simulated price for ${position.symbol}: ${simErr.message}`);
                        }
                    }
                }
                let shouldClose = false;
                let reason = '';
                const holdingDurationMs = Date.now() - new Date(position.openedAt).getTime();
                const MAX_HOLDING_TIME_MS = 4 * 60 * 60 * 1000;
                if (isPaperPosition && holdingDurationMs > MAX_HOLDING_TIME_MS) {
                    this.logger.log(`🧠 Paper position ${position.symbol} held for ${(holdingDurationMs / 3600000).toFixed(1)}h (>4h), closing at breakeven`);
                    currentPrice = Number(position.entryPrice);
                    shouldClose = true;
                    reason = 'MAX_HOLDING_TIME';
                }
                if (position.side === 'BUY') {
                    if (stopLoss > 0 && currentPrice <= stopLoss) {
                        shouldClose = true;
                        reason = 'STOP_LOSS_HIT';
                    }
                    else if (takeProfit > 0 && currentPrice >= takeProfit) {
                        shouldClose = true;
                        reason = 'TAKE_PROFIT_HIT';
                    }
                }
                else if (position.side === 'SELL') {
                    if (stopLoss > 0 && currentPrice >= stopLoss) {
                        shouldClose = true;
                        reason = 'STOP_LOSS_HIT';
                    }
                    else if (takeProfit > 0 && currentPrice <= takeProfit) {
                        shouldClose = true;
                        reason = 'TAKE_PROFIT_HIT';
                    }
                }
                if (shouldClose) {
                    this.logger.log(`🧠 Auto-closing position ${position.id} (${position.symbol}): ${reason}`);
                    try {
                        if (this.tradingService) {
                            const result = await this.tradingService.closePositionWithRetry(userId, {
                                positionId: position.id,
                                closeReason: reason,
                            });
                            const pnl = position.side === 'BUY'
                                ? (currentPrice - Number(position.entryPrice)) * Number(position.quantity)
                                : (Number(position.entryPrice) - currentPrice) * Number(position.quantity);
                            state.dailyPnL += pnl;
                            if (pnl < 0) {
                                state.consecutiveLosses++;
                            }
                            else if (pnl > 0) {
                                state.consecutiveLosses = 0;
                            }
                            try {
                                await this.prisma.autonomousTrade.updateMany({
                                    where: {
                                        userId,
                                        symbol: position.symbol,
                                        status: 'FILLED',
                                        exitPrice: null,
                                    },
                                    data: {
                                        exitPrice: currentPrice,
                                        pnl,
                                        closedAt: new Date(),
                                        holdingDurationMs: Date.now() - new Date(position.openedAt).getTime(),
                                        exitReason: reason === 'STOP_LOSS_HIT' ? 'STOP_LOSS' : reason === 'MAX_HOLDING_TIME' ? 'STRATEGY_EXIT' : 'TAKE_PROFIT',
                                        isWinning: pnl > 0,
                                        currentPrice,
                                        status: 'FILLED',
                                    },
                                });
                            }
                            catch (tradeErr) {
                                this.logger.warn(`Failed to update AutonomousTrade for close: ${tradeErr.message}`);
                            }
                            this.logger.log(`🧠 Position closed: ${position.symbol} PnL: ${pnl.toFixed(2)} (${reason})`);
                        }
                        else {
                            this.logger.warn(`🧠 TradingService unavailable for position close — using direct DB update as fallback`);
                            const pnl = position.side === 'BUY'
                                ? (currentPrice - Number(position.entryPrice)) * Number(position.quantity)
                                : (Number(position.entryPrice) - currentPrice) * Number(position.quantity);
                            await this.prisma.position.update({
                                where: { id: position.id },
                                data: {
                                    status: 'CLOSED',
                                    currentPrice,
                                    unrealizedPnl: pnl,
                                    realizedPnl: (Number(position.realizedPnl) || 0) + pnl,
                                    exitPrice: currentPrice,
                                    closeReason: reason,
                                    closedAt: new Date(),
                                },
                            });
                            try {
                                await this.prisma.trade.create({
                                    data: {
                                        userId,
                                        positionId: position.id,
                                        exchange: position.exchange,
                                        symbol: position.symbol,
                                        side: position.side === 'BUY' ? 'SELL' : 'BUY',
                                        type: 'EXIT',
                                        quantity: Number(position.quantity),
                                        price: currentPrice,
                                        fee: 0,
                                        feeCurrency: position.symbol.split('/').pop() || 'USDT',
                                        pnl,
                                        source: position.source || 'agent',
                                    },
                                });
                            }
                            catch (tradeErr) {
                                this.logger.warn(`Failed to create EXIT trade for fallback close: ${tradeErr.message}`);
                            }
                            state.dailyPnL += pnl;
                            if (pnl < 0) {
                                state.consecutiveLosses++;
                            }
                            else if (pnl > 0) {
                                state.consecutiveLosses = 0;
                            }
                            try {
                                await this.prisma.autonomousTrade.updateMany({
                                    where: {
                                        userId,
                                        symbol: position.symbol,
                                        status: 'FILLED',
                                        exitPrice: null,
                                    },
                                    data: {
                                        exitPrice: currentPrice,
                                        pnl,
                                        closedAt: new Date(),
                                        holdingDurationMs: Date.now() - new Date(position.openedAt).getTime(),
                                        exitReason: reason === 'STOP_LOSS_HIT' ? 'STOP_LOSS' : reason === 'MAX_HOLDING_TIME' ? 'STRATEGY_EXIT' : 'TAKE_PROFIT',
                                        isWinning: pnl > 0,
                                        currentPrice,
                                        status: 'FILLED',
                                    },
                                });
                            }
                            catch (tradeErr) {
                                this.logger.warn(`Failed to update AutonomousTrade for fallback close: ${tradeErr.message}`);
                            }
                            this.logger.log(`🧠 Paper position closed (fallback): ${position.symbol} PnL: ${pnl.toFixed(2)} (${reason})`);
                        }
                    }
                    catch (error) {
                        this.logger.error(`Failed to close position ${position.id}: ${error.message}`);
                    }
                }
            }
        }
        catch (error) {
            this.logger.error(`Position monitoring failed for ${userId}: ${error.message}`);
        }
    }
    _getPeriodStart(period) {
        const now = new Date();
        switch (period) {
            case 'DAILY':
                return new Date(now.getFullYear(), now.getMonth(), now.getDate());
            case 'WEEKLY':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case 'MONTHLY':
                return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            default:
                return new Date(0);
        }
    }
};
exports.AutonomousTraderAgentService = AutonomousTraderAgentService;
__decorate([
    (0, schedule_1.Cron)('*/1 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentService.prototype, "runCycle", null);
exports.AutonomousTraderAgentService = AutonomousTraderAgentService = AutonomousTraderAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        audit_service_1.AuditService,
        config_1.ConfigService,
        exchange_service_1.ExchangeService,
        trading_service_1.TradingService,
        market_analyzer_service_1.MarketAnalyzerService,
        signal_evaluator_service_1.SignalEvaluatorService,
        risk_calculator_service_1.RiskCalculatorService,
        order_executor_service_1.OrderExecutorService,
        strategic_council_service_1.StrategicCouncilService])
], AutonomousTraderAgentService);
//# sourceMappingURL=agent.service.js.map