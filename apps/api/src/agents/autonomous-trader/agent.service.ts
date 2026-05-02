// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, BadRequestException, NotFoundException, ServiceUnavailableException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { ExchangeService } from '../../modules/exchange/exchange.service';
import { TradingService } from '../../modules/trading/trading.service';
import { isMarketOpen } from '../../common/utils/market-hours.util';

import { MarketAnalyzerService } from './services/market-analyzer.service';
import { SignalEvaluatorService } from './services/signal-evaluator.service';
import { RiskCalculatorService } from './services/risk-calculator.service';
import { OrderExecutorService } from './services/order-executor.service';

import {
  AgentStatus,
  AgentConfig,
  AgentState,
  StrategyType,
  StrategyParams,
  PerformanceMetrics,
  StartAgentDto,
  ChangeStrategyDto,
  UpdateRiskParamsDto,
  UpdateAgentSettingsDto,
  AgentDecision,
} from './types/agent.types';
import { PerformanceTracker } from './models/performance';

/**
 * AutonomousTraderAgentService — The Brain of Autonomous Trading
 *
 * This service orchestrates the entire autonomous trading cycle:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    AUTONOMOUS TRADING CYCLE                 │
 * │                                                             │
 * │  1. MARKET ANALYSIS    → MarketAnalyzerService              │
 * │  2. SIGNAL EVALUATION  → SignalEvaluatorService             │
 * │  3. RISK ASSESSMENT    → RiskCalculatorService              │
 * │  4. ORDER EXECUTION    → OrderExecutorService               │
 * │  5. PERFORMANCE TRACK  → PerformanceTracker                 │
 * │  6. AUDIT & LOG        → AuditService + Redis               │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Safety Systems:
 * - Daily loss limit → auto-stop agent when exceeded
 * - Mandatory stop-loss → NO trade without SL
 * - No withdrawal capability → trading permissions only
 * - Full audit trail → every decision recorded
 * - Emergency stop → close all positions immediately
 *
 * Schedule: Runs every 60 seconds (configurable)
 */
@Injectable()
export class AutonomousTraderAgentService implements OnModuleInit {
  private readonly logger = new Logger(AutonomousTraderAgentService.name);

  /** Track if a cycle is currently running to prevent overlap */
  private isCycleRunning = false;

  /** Default symbols to trade when not specified */
  private readonly DEFAULT_SYMBOLS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
    private readonly exchangeService: ExchangeService,
    private readonly tradingService: TradingService,
    private readonly marketAnalyzer: MarketAnalyzerService,
    private readonly signalEvaluator: SignalEvaluatorService,
    private readonly riskCalculator: RiskCalculatorService,
    private readonly orderExecutor: OrderExecutorService,
  ) {
    this.logger.log('🧠 Autonomous Trader Agent initialized');
  }

  /**
   * OnModuleInit — Auto-seed critical system settings on startup.
   * This ensures AUTO_TRADING_ENABLED exists in the DB with a default of `true`,
   * so the agent can be controlled from the UI without relying on env vars.
   */
  async onModuleInit() {
    try {
      // Ensure AUTO_TRADING_ENABLED exists in the Setting table
      const existing = await this.prisma.setting.findUnique({
        where: { key: 'AUTO_TRADING_ENABLED' },
      });

      if (!existing) {
        // Read current env var value to use as initial DB value, defaulting to true
        const envValue = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
        await this.prisma.setting.create({
          data: {
            key: 'AUTO_TRADING_ENABLED',
            value: JSON.stringify(envValue),
          },
        });
        this.logger.log(`🔧 Auto-seeded AUTO_TRADING_ENABLED=${envValue} in DB (from env var / default)`);
      } else {
        this.logger.log(`🔧 AUTO_TRADING_ENABLED=${JSON.parse(existing.value)} already in DB (source: database)`);
      }
    } catch (error: any) {
      this.logger.warn(`Could not auto-seed AUTO_TRADING_ENABLED: ${error.message} — will fall back to env var`);
    }
  }

  // ── Agent Lifecycle ──

  /**
   * Start the autonomous trader for a user
   */
  async startAgent(userId: string, dto: StartAgentDto): Promise<AgentState> {
    // Check if agent is already running
    const existingState = await this._getAgentState(userId);
    if (existingState && existingState.status === AgentStatus.RUNNING) {
      throw new BadRequestException('الوكيل يعمل بالفعل — أوقفه أولاً ثم أعد تشغيله');
    }

    // CRITICAL CHECK: Fail-fast if AUTO_TRADING_ENABLED is false
    // Step 1: Check global system-level toggle (DB first, then env var)
    let globalAutoTradingEnabled: boolean;
    try {
      const dbSetting = await this.prisma.setting.findUnique({
        where: { key: 'AUTO_TRADING_ENABLED' },
      });
      if (dbSetting) {
        globalAutoTradingEnabled = JSON.parse(dbSetting.value);
      } else {
        globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
      }
    } catch {
      globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
    }

    if (!globalAutoTradingEnabled) {
      this.logger.error(`🚫 AUTO_TRADING_ENABLED=false (global) — cannot start agent for user ${userId}`);
      throw new BadRequestException(
        'التداول الذاتي معطّل على مستوى النظام — لا يمكن تفعيل الوكيل. يمكنك تفعيله من إعدادات النظام',
      );
    }

    // Step 2: Check per-user autoTradingEnabled from DB settings
    let userAutoTradingEnabled = true;
    try {
      const userSettings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
      if (userSettings && !userSettings.autoTradingEnabled) {
        userAutoTradingEnabled = false;
      }
    } catch (e: any) {
      this.logger.warn(`Could not check user autoTradingEnabled: ${e.message}`);
    }

    if (!userAutoTradingEnabled) {
      this.logger.warn(`🚫 User ${userId} has autoTradingEnabled=false — cannot start agent`);
      throw new BadRequestException(
        'التداول الذاتي معطّل في إعداداتك — فعّله من صفحة إعدادات الوكيل',
      );
    }

    // Validate credential OR allow paper trading mode
    let credential: any = null;
    let isPaperTrading = false;

    // Determine if this is a paper trading session
    // Paper trading mode: no real credentialId, or credentialId starts with 'paper-'
    const isPaperCredentialId = !dto.credentialId || dto.credentialId.trim() === '' || dto.credentialId.startsWith('paper-');

    if (isPaperCredentialId) {
      // Paper trading mode — no real exchange connection needed
      isPaperTrading = true;
      this.logger.log(`🧠 Agent starting in PAPER TRADING mode for user ${userId}`);

      // Auto-create a paper trading credential record if one doesn't exist
      try {
        const existingPaper = await this.prisma.exchangeCredential.findFirst({
          where: { userId, exchange: 'paper-trading', isValid: true },
        });
        if (existingPaper) {
          credential = existingPaper;
        } else {
          credential = await this.prisma.exchangeCredential.create({
            data: {
              userId,
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
          this.logger.log(`🧠 Auto-created paper trading credential for user ${userId}`);
        }
      } catch (error: any) {
        this.logger.warn(`Could not create paper credential: ${error.message}`);
        // Continue without a DB record — paper trading doesn't need one
      }
    } else {
      // Real credential — validate it
      try {
        credential = await this.prisma.exchangeCredential.findFirst({
          where: { id: dto.credentialId, userId, isValid: true },
        });
      } catch (error: any) {
        this.logger.error(`Database error looking up credential: ${error.message}`);
        throw new ServiceUnavailableException('خطأ في قاعدة البيانات — يرجى المحاولة لاحقاً');
      }

      if (!credential) {
        throw new NotFoundException('بيانات الاعتماد غير صالحة أو غير موجودة');
      }

      let permissions: string[] = ['read'];
      try {
        permissions = JSON.parse(credential.permissions || '["read"]');
      } catch {
        permissions = ['read'];
      }
      if (!permissions.includes('trade')) {
        throw new BadRequestException('مفتاح API لا يملك صلاحية التداول');
      }
    }

    // Load user's persistent settings (DB first, env vars as fallback)
    let userSettings: any = null;
    try {
      userSettings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
    } catch (e: any) {
      this.logger.warn(`Could not load user settings: ${e.message}`);
    }

    // Build agent config: DTO > DB Settings > Env Vars > Hardcoded defaults
    const config: AgentConfig = {
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
        (parseInt(this.configService.get('MAX_OPEN_POSITIONS', '5'), 10) || 5),
      riskPerTradePercent: dto.riskPerTradePercent ??
        (userSettings ? Number(userSettings.riskPerTradePercent) : undefined) ??
        1.5,
      strategyParams: dto.strategyParams ??
        (userSettings ? this._buildStrategyParamsFromSettings(userSettings, dto.strategy) : undefined) ??
        this._getDefaultStrategyParams(dto.strategy),
      symbols: dto.symbols ??
        (userSettings && userSettings.defaultSymbols ? userSettings.defaultSymbols.split(',').filter(Boolean) : undefined) ??
        this.DEFAULT_SYMBOLS,
      credentialId: isPaperTrading ? (credential?.id || `paper-${userId}`) : dto.credentialId,
      isPaperTrading,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Build initial state
    const agentRunId = `run-${userId}-${Date.now()}`;
    const state: AgentState = {
      status: AgentStatus.RUNNING,
      config,
      startedAt: new Date(),
      dailyPnL: 0,
      dailyTradesCount: 0,
      dailyResetAt: new Date(),
      consecutiveLosses: 0,
      totalCycles: 0,
    };

    // Store in Redis (fast access for cycle)
    await this._saveAgentState(userId, state);

    // Persist to DB (survives Redis restart)
    try {
      await this.prisma.agentSession.create({
        data: {
          userId,
          agentRunId,
          status: AgentStatus.RUNNING,
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
    } catch (dbError: any) {
      this.logger.error(`Failed to persist agent session to DB: ${dbError.message}`);
      // Non-fatal — Redis is the primary store, DB is backup
    }

    // Audit
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

    this.logger.log(`🧠 Agent started for user ${userId} — Strategy: ${config.strategy}`);

    return state;
  }

  /**
   * Stop the autonomous trader for a user
   */
  async stopAgent(userId: string, emergency: boolean = false): Promise<AgentState> {
    const state = await this._getAgentState(userId);
    if (!state) {
      throw new NotFoundException('الوكيل غير نشط');
    }

    state.status = emergency ? AgentStatus.EMERGENCY_STOP : AgentStatus.STOPPED;

    await this._saveAgentState(userId, state);

    // Update DB session
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
    } catch (dbError: any) {
      this.logger.error(`Failed to update agent session in DB: ${dbError.message}`);
    }

    // If emergency, close all positions
    if (emergency) {
      this.logger.warn(`🚨 Emergency stop for user ${userId} — closing all positions`);
      await this.orderExecutor.emergencyCloseAll(userId);
    }

    // Clear strategy cache
    this.signalEvaluator.clearUserStrategies(userId);

    // Audit
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

    this.logger.log(`🧠 Agent ${emergency ? 'emergency ' : ''}stopped for user ${userId}`);

    return state;
  }

  /**
   * Get agent status for a user
   */
  async getStatus(userId: string): Promise<AgentState | null> {
    return this._getAgentState(userId);
  }

  /**
   * Change the active strategy
   */
  async changeStrategy(userId: string, dto: ChangeStrategyDto): Promise<AgentState> {
    const state = await this._getAgentState(userId);
    if (!state || state.status !== AgentStatus.RUNNING) {
      throw new BadRequestException('الوكيل ليس في حالة تشغيل');
    }

    const previousStrategy = state.config.strategy;
    state.config.strategy = dto.strategy;
    state.config.strategyParams = dto.strategyParams ?? this._getDefaultStrategyParams(dto.strategy);
    state.config.updatedAt = new Date();

    // Update strategy in evaluator
    this.signalEvaluator.updateStrategy(userId, dto.strategy, state.config.strategyParams);

    await this._saveAgentState(userId, state);

    // Audit
    await this.audit.log({
      userId,
      action: 'AGENT_STRATEGY_CHANGED',
      resource: 'autonomous-trader',
      details: JSON.stringify({
        from: previousStrategy,
        to: dto.strategy,
      }),
    });

    this.logger.log(`🧠 Strategy changed for user ${userId}: ${previousStrategy} → ${dto.strategy}`);

    return state;
  }

  /**
   * Update risk parameters
   */
  async updateRiskParams(userId: string, dto: UpdateRiskParamsDto): Promise<AgentState> {
    const state = await this._getAgentState(userId);
    if (!state) {
      throw new NotFoundException('الوكيل غير نشط');
    }

    if (dto.maxPositionSizePercent) state.config.maxPositionSizePercent = dto.maxPositionSizePercent;
    if (dto.maxDailyLossPercent) state.config.maxDailyLossPercent = dto.maxDailyLossPercent;
    if (dto.maxOpenPositions) state.config.maxOpenPositions = dto.maxOpenPositions;
    if (dto.riskPerTradePercent) state.config.riskPerTradePercent = dto.riskPerTradePercent;
    state.config.updatedAt = new Date();

    await this._saveAgentState(userId, state);

    await this.audit.log({
      userId,
      action: 'AGENT_RISK_PARAMS_UPDATED',
      resource: 'autonomous-trader',
      details: JSON.stringify(dto),
    });

    return state;
  }

  /**
   * Get per-user agent settings (persistent across sessions)
   * Returns DB settings if they exist, otherwise creates defaults from env vars.
   */
  async getSettings(userId: string) {
    let settings = await this.prisma.agentSettings.findUnique({
      where: { userId },
    });

    // If no settings exist yet, create default settings
    if (!settings) {
      settings = await this._createDefaultSettings(userId);
    }

    // Parse defaultSymbols from comma-separated string to array
    const result = { ...settings };
    (result as any).defaultSymbols = settings.defaultSymbols
      ? settings.defaultSymbols.split(',').filter(Boolean)
      : this.DEFAULT_SYMBOLS;

    return result;
  }

  /**
   * Update per-user agent settings
   * These settings persist across agent restarts and are used as defaults
   * when starting the agent.
   */
  async updateSettings(userId: string, dto: UpdateAgentSettingsDto) {
    // Ensure settings row exists
    let settings = await this.prisma.agentSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this._createDefaultSettings(userId);
    }

    // Build update data from DTO
    const updateData: any = {};

    if (dto.autoTradingEnabled !== undefined) updateData.autoTradingEnabled = dto.autoTradingEnabled;
    if (dto.paperBalance !== undefined) updateData.paperBalance = dto.paperBalance;
    if (dto.maxPositionSizePercent !== undefined) updateData.maxPositionSizePercent = dto.maxPositionSizePercent;
    if (dto.maxDailyLossPercent !== undefined) updateData.maxDailyLossPercent = dto.maxDailyLossPercent;
    if (dto.maxOpenPositions !== undefined) updateData.maxOpenPositions = dto.maxOpenPositions;
    if (dto.riskPerTradePercent !== undefined) updateData.riskPerTradePercent = dto.riskPerTradePercent;
    if (dto.defaultStrategy !== undefined) updateData.defaultStrategy = dto.defaultStrategy;

    // Strategy-specific params
    if (dto.scalpingTimeframe !== undefined) updateData.scalpingTimeframe = dto.scalpingTimeframe;
    if (dto.scalpingTakeProfitPips !== undefined) updateData.scalpingTakeProfitPips = dto.scalpingTakeProfitPips;
    if (dto.scalpingStopLossPips !== undefined) updateData.scalpingStopLossPips = dto.scalpingStopLossPips;
    if (dto.scalpingMaxSpread !== undefined) updateData.scalpingMaxSpread = dto.scalpingMaxSpread;
    if (dto.swingTimeframe !== undefined) updateData.swingTimeframe = dto.swingTimeframe;
    if (dto.swingHoldingPeriodHours !== undefined) updateData.swingHoldingPeriodHours = dto.swingHoldingPeriodHours;
    if (dto.swingTrendLookback !== undefined) updateData.swingTrendLookback = dto.swingTrendLookback;
    if (dto.gridLevels !== undefined) updateData.gridLevels = dto.gridLevels;
    if (dto.gridSpacingPercent !== undefined) updateData.gridSpacingPercent = dto.gridSpacingPercent;
    if (dto.gridQuantityPerLevel !== undefined) updateData.gridQuantityPerLevel = dto.gridQuantityPerLevel;

    // Default symbols: convert array to comma-separated string
    if (dto.defaultSymbols !== undefined) {
      updateData.defaultSymbols = dto.defaultSymbols.join(',');
    }

    const updated = await this.prisma.agentSettings.update({
      where: { userId },
      data: updateData,
    });

    // If agent is currently running, apply risk params immediately
    const state = await this._getAgentState(userId);
    if (state && state.status === AgentStatus.RUNNING) {
      if (dto.maxPositionSizePercent !== undefined) state.config.maxPositionSizePercent = dto.maxPositionSizePercent;
      if (dto.maxDailyLossPercent !== undefined) state.config.maxDailyLossPercent = dto.maxDailyLossPercent;
      if (dto.maxOpenPositions !== undefined) state.config.maxOpenPositions = dto.maxOpenPositions;
      if (dto.riskPerTradePercent !== undefined) state.config.riskPerTradePercent = dto.riskPerTradePercent;

      // Update strategy params if provided
      if (dto.scalpingTimeframe || dto.scalpingTakeProfitPips || dto.scalpingStopLossPips || dto.scalpingMaxSpread ||
          dto.swingTimeframe || dto.swingHoldingPeriodHours || dto.swingTrendLookback ||
          dto.gridLevels || dto.gridSpacingPercent || dto.gridQuantityPerLevel) {
        state.config.strategyParams = this._buildStrategyParamsFromSettings(updated, state.config.strategy);
      }

      state.config.updatedAt = new Date();
      await this._saveAgentState(userId, state);
    }

    // Audit
    await this.audit.log({
      userId,
      action: 'AGENT_SETTINGS_UPDATED',
      resource: 'autonomous-trader',
      details: JSON.stringify(dto),
    });

    // Parse defaultSymbols for response
    const result = { ...updated };
    (result as any).defaultSymbols = updated.defaultSymbols
      ? updated.defaultSymbols.split(',').filter(Boolean)
      : this.DEFAULT_SYMBOLS;

    return result;
  }

  /**
   * Update system-level AUTO_TRADING_ENABLED setting in DB
   * This allows toggling auto-trading from the UI without changing env vars
   */
  async updateSystemAutoTrading(enabled: boolean): Promise<void> {
    try {
      await this.prisma.setting.upsert({
        where: { key: 'AUTO_TRADING_ENABLED' },
        update: { value: JSON.stringify(enabled) },
        create: { key: 'AUTO_TRADING_ENABLED', value: JSON.stringify(enabled) },
      });
      this.logger.log(`🔧 System AUTO_TRADING_ENABLED set to ${enabled} in DB`);
    } catch (error: any) {
      this.logger.error(`Failed to update system AUTO_TRADING_ENABLED: ${error.message}`);
      throw error;
    }
  }

  /**
   * Public status endpoint — no auth required.
   * Returns only autoTradingEnabled and source (safe to expose publicly).
   */
  async getPublicStatus() {
    let autoTradingEnabled = true;
    let source: 'database' | 'env_var' = 'env_var';

    try {
      const dbSetting = await this.prisma.setting.findUnique({
        where: { key: 'AUTO_TRADING_ENABLED' },
      });
      if (dbSetting) {
        autoTradingEnabled = JSON.parse(dbSetting.value);
        source = 'database';
      } else {
        autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
        source = 'env_var';
      }
    } catch {
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

  /**
   * Get system-level status information
   * Shows global configuration like AUTO_TRADING_ENABLED status.
   * Checks DB first, then env var, then defaults to true.
   */
  async getSystemStatus() {
    // Check DB first, then env var
    let dbAutoTradingEnabled: boolean | null = null;
    try {
      const dbSetting = await this.prisma.setting.findUnique({
        where: { key: 'AUTO_TRADING_ENABLED' },
      });
      if (dbSetting) {
        dbAutoTradingEnabled = JSON.parse(dbSetting.value);
      }
    } catch {
      // DB not available — fall through to env var
    }

    // Priority: DB setting > env var > default (true)
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

  /**
   * Create default settings for a user, combining env var defaults with DB persistence.
   */
  private async _createDefaultSettings(userId: string) {
    return this.prisma.agentSettings.create({
      data: {
        userId,
        autoTradingEnabled: true,
        paperBalance: parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000,
        maxPositionSizePercent: parseFloat(this.configService.get('MAX_POSITION_SIZE_PERCENT', '2')) || 2,
        maxDailyLossPercent: parseFloat(this.configService.get('MAX_DAILY_LOSS_PERCENT', '5')) || 5,
        maxOpenPositions: parseInt(this.configService.get('MAX_OPEN_POSITIONS', '5'), 10) || 5,
        riskPerTradePercent: 1.5,
        defaultStrategy: StrategyType.SCALPING,
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

  /**
   * Build StrategyParams from AgentSettings for the given strategy type.
   */
  private _buildStrategyParamsFromSettings(settings: any, strategy: StrategyType): StrategyParams {
    switch (strategy) {
      case StrategyType.SCALPING:
        return {
          scalpingTimeframe: settings.scalpingTimeframe || '5m',
          scalpingTakeProfitPips: settings.scalpingTakeProfitPips ?? 15,
          scalpingStopLossPips: settings.scalpingStopLossPips ?? 10,
          scalpingMaxSpread: settings.scalpingMaxSpread ?? 3,
        };
      case StrategyType.SWING:
        return {
          swingTimeframe: settings.swingTimeframe || '1h',
          swingHoldingPeriodHours: settings.swingHoldingPeriodHours ?? 48,
          swingTrendLookback: settings.swingTrendLookback ?? 50,
        };
      case StrategyType.GRID:
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

  /**
   * Get open positions managed by the agent
   */
  async getOpenPositions(userId: string) {
    return this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
  }

  /**
   * Get performance report
   */
  async getPerformance(userId: string, period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME' = 'WEEKLY'): Promise<PerformanceMetrics> {
    const tracker = new PerformanceTracker();

    // Get completed trades from DB
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
      // Safely parse strategy from metadata — fallback to SWING if unavailable
      let strategy: StrategyType = StrategyType.SWING;
      try {
        const metadata = (trade as any).metadata;
        if (metadata && typeof metadata === 'string') {
          const parsed = JSON.parse(metadata);
          if (parsed.strategy && Object.values(StrategyType).includes(parsed.strategy)) {
            strategy = parsed.strategy;
          }
        }
      } catch {
        // Malformed JSON — use default
      }

      tracker.addTrade({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side as 'BUY' | 'SELL',
        strategy,
        pnl: Number(trade.pnl || 0),
        fee: Number(trade.fee || 0),
        openedAt: trade.executedAt,
        closedAt: trade.executedAt,
      });
    }

    return tracker.calculateMetrics(period);
  }

  // ── Main Trading Cycle ──

  /**
   * Main cycle — runs every 60 seconds
   * Processes all active agents
   */
  @Cron('*/1 * * * *')
  async runCycle(): Promise<void> {
    if (this.isCycleRunning) {
      this.logger.debug('Previous cycle still running — skipping');
      return;
    }

    this.isCycleRunning = true;

    try {
      // Find all running agents
      const activeAgents = await this._getActiveAgents();

      if (activeAgents.length === 0) {
        return;
      }

      this.logger.debug(`🧠 Processing ${activeAgents.length} active agents`);

      for (const userId of activeAgents) {
        try {
          await this._processAgentCycle(userId);
        } catch (error: any) {
          this.logger.error(`Agent cycle failed for ${userId}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Cycle error: ${error.message}`);
    } finally {
      this.isCycleRunning = false;
    }
  }

  /**
   * Process a single agent's trading cycle
   */
  private async _processAgentCycle(userId: string): Promise<void> {
    const state = await this._getAgentState(userId);
    if (!state || state.status !== AgentStatus.RUNNING) return;

    // Reset daily stats if new day
    this._resetDailyStatsIfNeeded(state);

    // Check if daily loss limit reached
    const dailyLimitReached = await this.riskCalculator.isDailyLimitReached(
      userId,
      state.config.maxDailyLossPercent,
    );

    if (dailyLimitReached) {
      this.logger.warn(`🧠 User ${userId} hit daily loss limit — auto-stopping`);
      state.status = AgentStatus.DAILY_LIMIT_REACHED;
      await this._saveAgentState(userId, state);
      return;
    }

    // CRITICAL: Monitor existing positions for SL/TP exits BEFORE opening new ones
    await this._monitorOpenPositions(userId, state);

    // Analyze markets for configured symbols
    const analyses = await this.marketAnalyzer.analyzeMultiple(state.config.symbols);

    let signalsExecuted = 0;

    for (const [symbol, analysis] of analyses) {
      try {
        // Step 1: Evaluate signal
        const signal = await this.signalEvaluator.evaluate(
          analysis,
          state.config.strategy,
          state.config.strategyParams,
          userId,
        );

        if (!signal) continue;

        // Step 2: Market hours check
        const marketStatus = isMarketOpen(symbol);
        if (!marketStatus.open) {
          this.logger.debug(`🧠 Skipping ${symbol} — market closed: ${marketStatus.reason}`);
          continue;
        }

        // Step 3: Risk assessment
        const risk = await this.riskCalculator.assessRisk(userId, signal, state.config);

        if (!risk.canTrade) {
          // Record the rejection as an audit decision + update agent state
          this.logger.debug(`🧠 Trade rejected for ${symbol}: ${risk.reason}`);
          state.lastError = risk.reason;
          // If auto-trading is disabled, record prominently in agent state
          if (risk.reason?.includes('AUTO_TRADING_ENABLED')) {
            this.logger.warn(`🚫 Agent ${userId}: AUTO_TRADING_ENABLED is false — no trades will execute`);
          }
          continue;
        }

        // Step 4: Execute the trade
        const execution = await this.orderExecutor.execute(
          userId,
          signal,
          risk,
          state.config.credentialId,
        );

        if (execution.success) {
          signalsExecuted++;
          state.lastSignalAt = new Date();

          // Update daily stats
          state.dailyTradesCount++;

          this.logger.log(
            `🧠 Trade executed for ${userId}: ${signal.action} ${signal.symbol}`,
          );
        }

        // Step 5: Check if we should stop after consecutive losses
        if (state.consecutiveLosses >= 5) {
          this.logger.warn(`🧠 User ${userId}: 5 consecutive losses — pausing agent`);
          state.status = AgentStatus.PAUSED;
          break;
        }
      } catch (error: any) {
        this.logger.error(`Error processing ${symbol} for ${userId}: ${error.message}`);
      }
    }

    // Update cycle stats
    state.totalCycles++;
    state.lastCycleAt = new Date();
    await this._saveAgentState(userId, state);
  }

  // ── Private Helpers ──

  private async _getAgentState(userId: string): Promise<AgentState | null> {
    try {
      const raw = await this.redis.get(`agent:state:${userId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Redis read failed — try DB fallback
    }

    // DB fallback: recover agent state if Redis lost it (e.g., Redis restart)
    try {
      const session = await this.prisma.agentSession.findFirst({
        where: { userId, status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
        orderBy: { startedAt: 'desc' },
      });

      if (session) {
        this.logger.log(`🧠 Recovered agent state from DB for user ${userId} (session ${session.agentRunId})`);

        let config: AgentConfig;
        try {
          config = JSON.parse(session.config);
        } catch {
          config = {
            userId,
            strategy: session.strategy as StrategyType,
            enabled: true,
            maxPositionSizePercent: 2,
            maxDailyLossPercent: 5,
            maxOpenPositions: 5,
            riskPerTradePercent: 1.5,
            strategyParams: this._getDefaultStrategyParams(session.strategy as StrategyType),
            symbols: this.DEFAULT_SYMBOLS,
            credentialId: session.credentialId,
            createdAt: session.startedAt,
            updatedAt: session.updatedAt,
          };
        }

        const state: AgentState = {
          status: session.status as AgentStatus,
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

        // Re-populate Redis from DB
        await this._saveAgentState(userId, state);

        return state;
      }
    } catch (dbError: any) {
      this.logger.error(`DB fallback for agent state also failed: ${dbError.message}`);
    }

    return null;
  }

  private async _saveAgentState(userId: string, state: AgentState): Promise<void> {
    try {
      await this.redis.set(
        `agent:state:${userId}`,
        JSON.stringify(state),
        86400000, // 24 hours TTL
      );
    } catch (error: any) {
      this.logger.error(`Failed to save agent state for ${userId}: ${error.message}`);
    }

    // Also sync to DB (fire-and-forget for performance)
    this._syncStateToDB(userId, state).catch((err) => {
      this.logger.error(`Failed to sync agent state to DB: ${err.message}`);
    });
  }

  /**
   * Sync agent state to DB for persistence across Redis restarts.
   * Fire-and-forget — should not block the main cycle.
   */
  private async _syncStateToDB(userId: string, state: AgentState): Promise<void> {
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
    } catch {
      // Silent — DB sync is best-effort
    }
  }

  private async _getActiveAgents(): Promise<string[]> {
    try {
      // Use the public scanKeys method (safe, no private property access)
      const keys = await this.redis.scanKeys('agent:state:*');

      const activeUsers: string[] = [];

      for (const key of keys) {
        try {
          const raw = await this.redis.get(key);
          if (raw) {
            const state: AgentState = JSON.parse(raw);
            if (state.status === AgentStatus.RUNNING) {
              const userId = key.replace('agent:state:', '');
              activeUsers.push(userId);
            }
          }
        } catch {
          // Skip invalid entries
        }
      }

      return activeUsers;
    } catch {
      return [];
    }
  }

  private _resetDailyStatsIfNeeded(state: AgentState): void {
    const now = new Date();
    const resetDate = state.dailyResetAt ? new Date(state.dailyResetAt) : new Date(0);

    const isNewDay =
      now.getFullYear() !== resetDate.getFullYear() ||
      now.getMonth() !== resetDate.getMonth() ||
      now.getDate() !== resetDate.getDate();

    if (isNewDay) {
      state.dailyPnL = 0;
      state.dailyTradesCount = 0;
      state.dailyResetAt = now;

      // If agent was paused due to daily limit, resume it
      if (state.status === AgentStatus.DAILY_LIMIT_REACHED) {
        state.status = AgentStatus.RUNNING;
      }
    }
  }

  private _getDefaultStrategyParams(strategy: StrategyType): StrategyParams {
    switch (strategy) {
      case StrategyType.SCALPING:
        return {
          scalpingTimeframe: '5m',
          scalpingTakeProfitPips: 15,
          scalpingStopLossPips: 10,
          scalpingMaxSpread: 3,
        };
      case StrategyType.SWING:
        return {
          swingTimeframe: '1h',
          swingHoldingPeriodHours: 48,
          swingTrendLookback: 50,
        };
      case StrategyType.GRID:
        return {
          gridLevels: 5,
          gridSpacingPercent: 0.5,
          gridQuantityPerLevel: undefined, // Will be calculated by risk manager based on portfolio
        };
      default:
        return {};
    }
  }

  /**
   * Monitor open positions for stop-loss / take-profit hits.
   * Closes positions when SL/TP is reached and updates daily PnL.
   * This is CRITICAL — without it, the agent gets stuck after maxOpenPositions.
   *
   * FIX: Now also updates currentPrice for paper-trading positions from live quotes,
   * so SL/TP exits can actually trigger. Previously, paper positions had their
   * currentPrice frozen at entryPrice, so SL/TP never fired.
   */
  private async _monitorOpenPositions(userId: string, state: AgentState): Promise<void> {
    try {
      const positions = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
      });

      if (positions.length === 0) return;

      for (const position of positions) {
        let currentPrice = Number(position.currentPrice || position.entryPrice);
        const stopLoss = Number(position.stopLoss || 0);
        const takeProfit = Number(position.takeProfit || 0);

        // CRITICAL FIX: Update currentPrice for paper-trading positions from live quotes
        // Without this, paper positions never have their price updated, so SL/TP never triggers
        const isPaperPosition = position.exchange === 'paper-trading';
        if (isPaperPosition) {
          try {
            const quote = await this.exchangeService.getQuote(position.symbol);
            if (quote && quote.price) {
              currentPrice = quote.price;
              // Update the position's currentPrice in DB so it's fresh for next check
              await this.prisma.position.update({
                where: { id: position.id },
                data: {
                  currentPrice: quote.price,
                  unrealizedPnl: position.side === 'BUY'
                    ? (quote.price - Number(position.entryPrice)) * Number(position.quantity)
                    : (Number(position.entryPrice) - quote.price) * Number(position.quantity),
                },
              });
              this.logger.debug(`🧠 Updated paper position ${position.symbol} price: ${quote.price}`);
            }
          } catch (quoteErr: any) {
            this.logger.warn(`Could not get quote for paper position ${position.symbol}: ${quoteErr.message}`);
          }
        }

        let shouldClose = false;
        let reason = '';

        if (position.side === 'BUY') {
          if (stopLoss > 0 && currentPrice <= stopLoss) {
            shouldClose = true;
            reason = 'STOP_LOSS_HIT';
          } else if (takeProfit > 0 && currentPrice >= takeProfit) {
            shouldClose = true;
            reason = 'TAKE_PROFIT_HIT';
          }
        } else if (position.side === 'SELL') {
          if (stopLoss > 0 && currentPrice >= stopLoss) {
            shouldClose = true;
            reason = 'STOP_LOSS_HIT';
          } else if (takeProfit > 0 && currentPrice <= takeProfit) {
            shouldClose = true;
            reason = 'TAKE_PROFIT_HIT';
          }
        }

        if (shouldClose) {
          this.logger.log(`🧠 Auto-closing position ${position.id} (${position.symbol}): ${reason}`);
          try {
            // For paper positions, close directly in DB (TradingService may not handle them)
            if (isPaperPosition) {
              const pnl = position.side === 'BUY'
                ? (currentPrice - Number(position.entryPrice)) * Number(position.quantity)
                : (Number(position.entryPrice) - currentPrice) * Number(position.quantity);

              await this.prisma.position.update({
                where: { id: position.id },
                data: {
                  status: 'CLOSED',
                  currentPrice,
                  unrealizedPnl: pnl,
                  closedAt: new Date(),
                },
              });

              // Update daily PnL tracking
              state.dailyPnL += pnl;
              if (pnl < 0) {
                state.consecutiveLosses++;
              } else if (pnl > 0) {
                state.consecutiveLosses = 0;
              }

              // Update the AutonomousTrade record
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
                    exitReason: reason === 'STOP_LOSS_HIT' ? 'STOP_LOSS' : 'TAKE_PROFIT',
                    isWinning: pnl > 0,
                    currentPrice,
                    status: 'FILLED',
                  },
                });
              } catch (tradeErr: any) {
                this.logger.warn(`Failed to update AutonomousTrade for paper close: ${tradeErr.message}`);
              }

              this.logger.log(`🧠 Paper position closed: ${position.symbol} PnL: ${pnl.toFixed(2)} (${reason})`);
            } else {
              // Real position — use TradingService
              const result = await this.tradingService.closePosition(userId, {
                positionId: position.id,
              });

              // Update daily PnL tracking
              const pnl = Number(result?.pnl || 0);
              state.dailyPnL += pnl;
              if (pnl < 0) {
                state.consecutiveLosses++;
              } else if (pnl > 0) {
                state.consecutiveLosses = 0;
              }

              // Update the AutonomousTrade record
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
                    exitReason: reason === 'STOP_LOSS_HIT' ? 'STOP_LOSS' : 'TAKE_PROFIT',
                    isWinning: pnl > 0,
                    currentPrice,
                  },
                });
              } catch (tradeErr: any) {
                this.logger.error(`Failed to update AutonomousTrade on close: ${tradeErr.message}`);
              }

              this.logger.log(`🧠 Position closed: ${position.symbol} PnL=${pnl.toFixed(2)} reason=${reason}`);
            }
          } catch (error: any) {
            this.logger.error(`Failed to close position ${position.id}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Position monitoring failed for ${userId}: ${error.message}`);
    }
  }

  private _getPeriodStart(period: string): Date {
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
}
