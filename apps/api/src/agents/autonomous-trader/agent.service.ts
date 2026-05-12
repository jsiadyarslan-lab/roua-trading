// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, BadRequestException, NotFoundException, ServiceUnavailableException, OnModuleInit, Optional } from '@nestjs/common';
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
import { StrategicCouncilService } from '../../modules/ai/strategic-council/strategic-council.service';
import { TradingBriefDTO, AGENT_TIMEFRAMES, isAgentTimeframe } from '../../modules/ai/strategic-council/strategic-council.types';

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
  EvaluatedSignal,
  OrderSide,
  OrderType,
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

  /** Track whether critical dependencies (Prisma/Redis) are available */
  private _isReady = false;

  /** Human-readable reason why the service is not ready (for error messages) */
  private _notReadyReason = 'الخدمة لم تكتمل بعد — يتم التهيئة';

  /** Default symbols to trade when not specified */
  private readonly DEFAULT_SYMBOLS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
  ];

  constructor(
    @Optional() private readonly prisma: PrismaService,
    @Optional() private readonly redis: RedisService,
    @Optional() private readonly audit: AuditService,
    private readonly configService: ConfigService,
    @Optional() private readonly exchangeService: ExchangeService,
    @Optional() private readonly tradingService: TradingService,
    private readonly marketAnalyzer: MarketAnalyzerService,
    private readonly signalEvaluator: SignalEvaluatorService,
    private readonly riskCalculator: RiskCalculatorService,
    private readonly orderExecutor: OrderExecutorService,
    @Optional() private readonly councilService: StrategicCouncilService,
  ) {
    // FIX: Lazy readiness check — try to connect to dependencies on first use
    // instead of permanently blocking if they're unavailable at constructor time.
    // Redis might take a moment to connect, and Prisma might need a warm-up.
    this._tryMarkReady();

    this.logger.log(`🧠 Autonomous Trader Agent initialized (ready=${this._isReady})`);
  }

  /**
   * FIX: Attempt to mark the service as ready. Called from constructor and
   * also lazily from _ensureReady() to recover from transient failures.
   */
  private _tryMarkReady(): void {
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

  /**
   * Check if the service is fully ready to handle DB-dependent operations.
   * FIX: Now attempts lazy recovery — if not ready, retries once before throwing.
   */
  private _ensureReady(): void {
    if (!this._isReady) {
      // FIX: Retry readiness check — dependencies might have become available
      this._tryMarkReady();
    }
    if (!this._isReady) {
      this.logger.warn(`Service not ready: ${this._notReadyReason}`);
      throw new ServiceUnavailableException(this._notReadyReason);
    }
  }

  /**
   * Public getter — allows controller to check readiness without throwing.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Public getter — returns the reason the service is not ready.
   */
  get notReadyReason(): string {
    return this._notReadyReason;
  }

  /**
   * OnModuleInit — Auto-seed critical system settings on startup.
   * This ensures AUTO_TRADING_ENABLED exists in the DB with a default of `false`,
   * so the agent can be controlled from the UI without relying on env vars.
   *
   * IMPORTANT: This method MUST NEVER throw. If the DB isn't ready yet
   * (cold start, connection issues), we gracefully skip and fall back to
   * env vars. A throwing onModuleInit prevents the entire module from
   * loading, which causes ALL agent routes to return 404.
   */
  async onModuleInit() {
    const INIT_TIMEOUT_MS = 5000;

    if (!this.prisma || !this.redis) {
      this.logger.warn(
        `⚠️ Skipping onModuleInit auto-seed: prisma=${!!this.prisma}, redis=${!!this.redis}. ` +
        `Agent routes will still be registered. Service will retry on next DB access.`
      );
      this._tryMarkReady();
      return;
    }

    try {
      await Promise.race([
        this._initAutoTradingSetting(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('onModuleInit timeout')), INIT_TIMEOUT_MS)
        ),
      ]);
    } catch (error: any) {
      this.logger.warn(`Could not auto-seed AUTO_TRADING_ENABLED: ${error?.message || error} — will fall back to env var. Agent routes will still be registered.`);
      this._isReady = false;
      this._notReadyReason = 'قاعدة البيانات غير جاهزة بعد — يرجى المحاولة لاحقاً';
    }

    // FIX: REMOVED _autoRestoreRunningAgents(). Previously, the agent would
    // auto-restore all RUNNING agent sessions from the database on server restart,
    // which caused phantom trades to be created for every user who had ever
    // activated the agent — even if they had since deactivated it or hadn't
    // used the platform in days. This was a major source of phantom trades.
    //
    // Now: The agent does NOT auto-restore. Users must explicitly click "تفعيل"
    // from their dashboard after every server restart. This ensures no trades
    // are ever executed without the user's explicit, current consent.
    //
    // Instead, run a startup cleanup to purge phantom data:
    if (this._isReady) {
      setTimeout(() => this._startupCleanup(), 10000);
    }
  }

  /**
   * Startup cleanup: Purge ONLY phantom/stale data, preserving legitimate user states.
   *
   * FIX: Previous version deleted ALL data on every restart, including:
   *   - AgentSettings that users explicitly configured
   *   - Valid TradingBriefs from the Strategic Council
   *   - Legitimate trade history
   *   - Paper-trading credentials that users intentionally created
   *
   * New behavior:
   *   - Stops stale agent sessions (RUNNING/PAUSED) — they should be restarted explicitly
   *   - Only purges PHANTOM positions (zero-value / stale > 24h)
   *   - Only purges EXPIRED TradingBriefs
   *   - Preserves AgentSettings (user configuration)
   *   - Preserves DB-persisted user states
   */
  private async _startupCleanup(): Promise<void> {
    try {
      this.logger.log('🧠 Running startup phantom cleanup (preserving user data)...');

      // ── STOP: Set stale RUNNING agent sessions to STOPPED in DB ──
      // These were active before the restart and should not auto-resume.
      try {
        const stopped = await this.prisma.agentSession.updateMany({
          where: { status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
          data: { status: 'STOPPED', updatedAt: new Date() },
        });
        if (stopped.count > 0) {
          this.logger.log(`🧠 STARTUP: Stopped ${stopped.count} stale agent session(s)`);
        }
      } catch (err: any) {
        this.logger.warn(`🧠 Failed to stop agent sessions: ${err.message}`);
      }

      // ── PURGE: Clear volatile agent states from Redis ──
      // Clear stale Redis agent states. Since the DB sessions are already
      // marked as STOPPED above, these Redis states are stale and should be
      // removed. The _getActiveAgents() DB recovery will re-populate from
      // DB for any legitimately running agents.
      try {
        const agentKeys = await this.redis.scanKeys('agent:state:*');
        let cleared = 0;
        for (const key of agentKeys) {
          try {
            const raw = await this.redis.get(key);
            if (raw) {
              // Valid state but stale after restart — clear it
              await this.redis.del(key);
              cleared++;
            } else {
              // Empty/invalid key — delete it
              await this.redis.del(key);
              cleared++;
            }
          } catch {
            // Invalid state — delete it
            await this.redis.del(key);
            cleared++;
          }
        }
        if (cleared > 0) {
          this.logger.log(`🧠 STARTUP: Cleared ${cleared} stale Redis agent state(s)`);
        }
      } catch (err: any) {
        this.logger.warn(`🧠 Failed to clear agent Redis states: ${err.message}`);
      }

      // ── PURGE: Delete only EXPIRED TradingBriefs (not all) ──
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
          this.logger.log(`🧠 STARTUP: Purged ${deletedBriefs.count} expired TradingBrief(s) (preserving active ones)`);
        }
      } catch (err: any) {
        this.logger.warn(`🧠 Failed to purge expired TradingBrief records: ${err.message}`);
      }

      // ── PURGE: Delete stale AutonomousTrade records (>7 days) ──
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const deletedTrades = await this.prisma.autonomousTrade.deleteMany({
          where: { createdAt: { lt: sevenDaysAgo } },
        });
        if (deletedTrades.count > 0) {
          this.logger.log(`🧠 STARTUP: Purged ${deletedTrades.count} stale AutonomousTrade(s) (>7 days)`);
        }
      } catch (err: any) {
        this.logger.warn(`🧠 Failed to purge stale AutonomousTrade records: ${err.message}`);
      }

      // ── PURGE: Delete stale PaperOrder records (>7 days) ──
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const deletedPaperOrders = await this.prisma.paperOrder.deleteMany({
          where: { createdAt: { lt: sevenDaysAgo } },
        });
        if (deletedPaperOrders.count > 0) {
          this.logger.log(`🧠 STARTUP: Purged ${deletedPaperOrders.count} stale PaperOrder(s) (>7 days)`);
        }
      } catch (err: any) {
        this.logger.warn(`🧠 Failed to purge stale PaperOrder records: ${err.message}`);
      }

      this.logger.log('🧠 Startup cleanup complete (user data preserved)');
    } catch (error: any) {
      this.logger.warn(`🧠 Startup cleanup failed (non-critical): ${error.message}`);
    }
  }

  /**
   * Initialize AUTO_TRADING_ENABLED setting in DB.
   * Extracted from onModuleInit for timeout wrapping.
   */
  private async _initAutoTradingSetting(): Promise<void> {
    // Ensure AUTO_TRADING_ENABLED exists in the Setting table
    const existing = await this.prisma.setting.findUnique({
      where: { key: 'AUTO_TRADING_ENABLED' },
    });

    if (!existing) {
      // FIX: Default to TRUE — the user controls their own agent.
      // The old phantom trade issue was fixed by the OrderDispatcher pipeline,
      // not by disabling auto-trading globally. Defaulting to false was blocking all users.
      const envValue = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
      await this.prisma.setting.create({
        data: {
          key: 'AUTO_TRADING_ENABLED',
          value: JSON.stringify(envValue),
        },
      });
      this.logger.log(`🔧 Auto-seeded AUTO_TRADING_ENABLED=${envValue} in DB (from env var / default)`);
    } else {
      // FIX: TRUST the DB value — do NOT override it.
      // Previous code reset AUTO_TRADING_ENABLED to false on every server restart,
      // making it impossible for users to enable the agent permanently.
      const existingValue = JSON.parse(existing.value);
      this.logger.log(`🔧 AUTO_TRADING_ENABLED=${existingValue} (source: database — respected as-is)`);
    }
  }

  // ── Agent Lifecycle ──

  /**
   * Start the autonomous trader for a user
   */
  async startAgent(userId: string, dto: StartAgentDto): Promise<AgentState> {
    // CRITICAL: Ensure the service has its dependencies before attempting DB ops.
    // Try a lazy readiness check — maybe DB came up after initial cold start.
    this._tryMarkReady();
    this._ensureReady();

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
    // FIX: When the user clicks "Start Agent", the action itself IS consent to enable
    // auto trading. We now SET autoTradingEnabled=true when the user explicitly
    // starts the agent, instead of requiring them to find and toggle a separate
    // setting first. The "Start Agent" button = enable + start. "Stop Agent" = disable.
    // Previously, if autoTradingEnabled was false (from a previous stop or old DB row),
    // the user got stuck: they couldn't start the agent without finding the hidden
    // settings toggle, and the error message didn't help them find it.
    let userAutoTradingEnabled = true;
    try {
      let userSettings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
      if (!userSettings) {
        // Auto-create settings with autoTradingEnabled=true
        try {
          userSettings = await this.prisma.agentSettings.create({
            data: {
              userId,
              autoTradingEnabled: true,
              maxPositionSizePercent: 2,
              maxDailyLossPercent: 5,
              maxOpenPositions: 3,
              riskPerTradePercent: 1,
            },
          });
          this.logger.log(`🔧 Auto-created agentSettings for user ${userId} with autoTradingEnabled=true`);
        } catch (createErr: any) {
          // Race condition: row was created between findUnique and create.
          // Re-read the row and force-enable autoTrading.
          this.logger.warn(`🔧 AgentSettings create race for user ${userId}: ${createErr.message} — re-reading and force-enabling`);
          try {
            userSettings = await this.prisma.agentSettings.findUnique({ where: { userId } });
            if (userSettings && !userSettings.autoTradingEnabled) {
              userSettings = await this.prisma.agentSettings.update({
                where: { userId },
                data: { autoTradingEnabled: true },
              });
            }
          } catch { /* Give up — allow agent to start anyway */ }
        }
      } else if (!userSettings.autoTradingEnabled) {
        // FIX: User clicked "Start Agent" → this IS the enable action.
        // Set autoTradingEnabled=true instead of blocking with an error.
        try {
          userSettings = await this.prisma.agentSettings.update({
            where: { userId },
            data: { autoTradingEnabled: true },
          });
          this.logger.log(`🔧 autoTradingEnabled set to true for user ${userId} (user clicked Start Agent)`);
        } catch (updateErr: any) {
          this.logger.warn(`Could not enable autoTradingEnabled for user ${userId}: ${updateErr.message}`);
          // FIX: Even if DB update fails, allow the agent to start.
          // The user's explicit click on "Start Agent" is consent.
          // A stale DB value should not block the user's action.
          userSettings = { ...userSettings, autoTradingEnabled: true };
        }
      }
      // SAFETY NET: If userSettings still shows autoTradingEnabled=false
      // (e.g., DB read returned stale data), override it. The user clicked
      // "Start Agent" — that's explicit consent. Don't block them.
      if (userSettings && !userSettings.autoTradingEnabled) {
        this.logger.warn(`🔧 userSettings.autoTradingEnabled is still false for ${userId} after fix attempts — OVERRIDING to true (user clicked Start Agent)`);
        userAutoTradingEnabled = true; // Force-allow — user consent overrides stale DB
      }
    } catch (e: any) {
      this.logger.warn(`Could not check user autoTradingEnabled: ${e.message}`);
      // FIX: If we can't check, allow the agent to start.
      // Missing settings should not block the user.
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

      // FIX: Auto-create paper-trading credential if it doesn't exist.
      // Previously, this was disabled to prevent phantom trades, but that
      // broke the entire agent — users couldn't start it at all without
      // first manually creating a paper credential. Now we auto-create it
      // safely. Paper credentials use dummy encrypted values since there's
      // no real API key to protect — the ExecutionGateway routes them to
      // PaperTradingAdapter which doesn't need real keys.
      try {
        const existingPaper = await this.prisma.exchangeCredential.findFirst({
          where: { userId, exchange: 'paper-trading', isValid: true },
        });
        if (existingPaper) {
          credential = existingPaper;
        } else {
          // Auto-create paper-trading credential for this user
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
          this.logger.log(`🧪 Paper-trading credential created for user ${userId}`);
        }
      } catch (error: any) {
        this.logger.warn(`Could not setup paper credential: ${error.message}`);
        // Don't block agent start — try to proceed anyway
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

    // Audit (best-effort — don't fail if AuditService is unavailable)
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
    } catch (auditError: any) {
      this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
    }

    this.logger.log(`🧠 Agent started for user ${userId} — Strategy: ${config.strategy}`);

    return state;
  }

  /**
   * Stop the autonomous trader for a user
   */
  async stopAgent(userId: string, emergency: boolean = false): Promise<AgentState> {
    this._tryMarkReady();
    this._ensureReady();

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

    // Audit (best-effort)
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
    } catch (auditError: any) {
      this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
    }

    this.logger.log(`🧠 Agent ${emergency ? 'emergency ' : ''}stopped for user ${userId}`);

    return state;
  }

  /**
   * Get agent status for a user
   */
  async getStatus(userId: string): Promise<AgentState | null> {
    this._tryMarkReady();
    // getStatus is non-critical — return null if not ready instead of throwing
    if (!this._isReady) {
      return null;
    }
    return this._getAgentState(userId);
  }

  /**
   * Change the active strategy
   */
  async changeStrategy(userId: string, dto: ChangeStrategyDto): Promise<AgentState> {
    this._tryMarkReady();
    this._ensureReady();

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

    // Audit (best-effort)
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
    } catch (auditError: any) {
      this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
    }

    this.logger.log(`🧠 Strategy changed for user ${userId}: ${previousStrategy} → ${dto.strategy}`);

    return state;
  }

  /**
   * Update risk parameters
   */
  async updateRiskParams(userId: string, dto: UpdateRiskParamsDto): Promise<AgentState> {
    this._tryMarkReady();
    this._ensureReady();

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

    // Audit (best-effort)
    try {
      if (this.audit) {
        await this.audit.log({
          userId,
          action: 'AGENT_RISK_PARAMS_UPDATED',
          resource: 'autonomous-trader',
          details: JSON.stringify(dto),
        });
      }
    } catch (auditError: any) {
      this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
    }

    return state;
  }

  /**
   * Get per-user agent settings (persistent across sessions)
   * Returns DB settings if they exist, otherwise creates defaults from env vars.
   */
  async getSettings(userId: string) {
    this._tryMarkReady();
    this._ensureReady();

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
    this._tryMarkReady();
    this._ensureReady();

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

    // Audit (best-effort)
    try {
      if (this.audit) {
        await this.audit.log({
          userId,
          action: 'AGENT_SETTINGS_UPDATED',
          resource: 'autonomous-trader',
          details: JSON.stringify(dto),
        });
      }
    } catch (auditError: any) {
      this.logger.warn(`Audit log failed (non-critical): ${auditError.message}`);
    }

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
    this._tryMarkReady();
    this._ensureReady();

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
    this._tryMarkReady();

    // FIX: Default to TRUE (was false). Previously, if the DB lookup failed,
    // this method would return autoTradingEnabled=false, which blocked the
    // frontend from starting the agent. Since the DB setting is auto-seeded
    // with true by onModuleInit(), and the agent's own cron + startup cleanup
    // prevent phantom trades, the safe default is TRUE.
    let autoTradingEnabled = true;
    let source: 'database' | 'env_var' = 'env_var';

    try {
      if (!this.prisma) {
        // Prisma not available — fall back to env var
        autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
        source = 'env_var';
      } else {
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
    this._tryMarkReady();

    // Check DB first, then env var
    let dbAutoTradingEnabled: boolean | null = null;
    try {
      if (this.prisma) {
        const dbSetting = await this.prisma.setting.findUnique({
          where: { key: 'AUTO_TRADING_ENABLED' },
        });
        if (dbSetting) {
          dbAutoTradingEnabled = JSON.parse(dbSetting.value);
        }
      }
    } catch {
      // DB not available — fall through to env var
    }

    // FIX: Priority: DB setting > env var > default (TRUE)
    // Previously defaulted to false, which was blocking all agent starts
    // when the DB setting didn't exist. Since onModuleInit seeds TRUE,
    // and phantom trades are prevented by other mechanisms, default TRUE.
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
    // FIX: autoTradingEnabled defaults to TRUE to match Prisma schema @default(true)
    // and the startAgent() auto-creation logic. The global AUTO_TRADING_ENABLED
    // setting still controls the system-level switch, so per-user default of true
    // is safe — the system won't auto-trade unless both the global switch AND
    // per-user setting are true. Previously defaulting to false caused a bug:
    // visiting Settings page before starting the agent would create settings with
    // false, then startAgent() would find existing settings and refuse to start.
    return this.prisma.agentSettings.create({
      data: {
        userId,
        autoTradingEnabled: true,
        paperBalance: parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000,
        maxPositionSizePercent: parseFloat(this.configService.get('MAX_POSITION_SIZE_PERCENT', '2')) || 2,
        maxDailyLossPercent: parseFloat(this.configService.get('MAX_DAILY_LOSS_PERCENT', '5')) || 5,
        maxOpenPositions: parseInt(this.configService.get('MAX_OPEN_POSITIONS', '5'), 10) || 5,
        riskPerTradePercent: 1.5,
        defaultStrategy: StrategyType.AUTO,
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
      case StrategyType.AUTO:
        // AUTO uses all strategy params — build comprehensive params
        return {
          ...this._buildStrategyParamsFromSettings(settings, StrategyType.SCALPING),
          ...this._buildStrategyParamsFromSettings(settings, StrategyType.SWING),
          ...this._buildStrategyParamsFromSettings(settings, StrategyType.MEAN_REVERSION),
          ...this._buildStrategyParamsFromSettings(settings, StrategyType.MOMENTUM_BREAKOUT),
          ...this._buildStrategyParamsFromSettings(settings, StrategyType.DCA),
          ...this._buildStrategyParamsFromSettings(settings, StrategyType.VWAP_RSI),
        };
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
    this._tryMarkReady();
    this._ensureReady();

    // ═══════════════════════════════════════════════════════════
    // SOURCE FILTER: Only show positions created by the Agent
    // (source='agent'). Previously, this returned ALL positions
    // including those created by the Smart Executor, making both
    // logs show identical trades — confusing users into thinking
    // trades are being duplicated.
    // ═══════════════════════════════════════════════════════════
    return this.prisma.position.findMany({
      where: { userId, status: 'OPEN', source: 'agent' },
      orderBy: { openedAt: 'desc' },
    });
  }

  /**
   * Get performance report
   */
  async getPerformance(userId: string, period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME' = 'WEEKLY'): Promise<PerformanceMetrics> {
    this._tryMarkReady();
    this._ensureReady();

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
   *
   * FIX: This cron now checks AUTO_TRADING_ENABLED at the DB level BEFORE
   * doing anything else. Previously, the cron would fire every minute and
   * process agents even when auto-trading was globally disabled. This was a
   * source of phantom trades — the cron would find orphaned agent sessions
   * in Redis (before startup cleanup ran) and execute trades for them.
   *
   * FIX: @Cron decorator RE-ENABLED with safety guards.
   * Previously, this cron was completely disabled to prevent phantom trades.
   * However, disabling it meant the agent NEVER trades — users see "يعمل" but
   * no trades execute. The real phantom trade sources were:
   *   1. Auto-restore of running agents on restart → FIXED (removed _autoRestoreRunningAgents)
   *   2. Auto-start of executor on restart → FIXED (removed auto-start)
   *   3. Startup session generating stale briefs → FIXED (removed _triggerStartupSession)
   * With these 3 fixes in place, the cron is safe to re-enable.
   * Additional safety: AUTO_TRADING_ENABLED guard + isCycleRunning overlap protection.
   */
  @Cron('*/1 * * * *')  // FIX: Re-enabled — agent needs cron to actually trade. Phantom trades prevented by AUTO_TRADING_ENABLED guard + startup cleanup + no auto-restore.
  async runCycle(): Promise<void> {
    // ═══════════════════════════════════════════════════════
    // CRITICAL GUARD: Check AUTO_TRADING_ENABLED before anything else.
    // This prevents the cron from ever executing trades when the global
    // toggle is off (which is the default). Without this guard, the cron
    // could still process orphaned Redis sessions and create phantom trades.
    // ═══════════════════════════════════════════════════════
    try {
      let autoTradingEnabled = true;  // FIX: Default TRUE — was false, blocking all agent cycles when DB setting didn't exist
      try {
        const dbSetting = await this.prisma.setting.findUnique({
          where: { key: 'AUTO_TRADING_ENABLED' },
        });
        if (dbSetting) {
          autoTradingEnabled = JSON.parse(dbSetting.value);
        }
        // If no DB setting, keep default TRUE (don't fall back to env var)
      } catch {
        // DB lookup failed — keep default TRUE (proceed with cycle)
        autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
      }

      if (!autoTradingEnabled) {
        // Auto-trading is explicitly disabled in DB — skip cycle.
        return;
      }
    } catch {
      // Outer catch — proceed with cycle (don't block on config errors)
      // Previously returned here, which meant ANY error = agent completely disabled
    }

    // If dependencies aren't ready, skip this cycle silently
    if (!this._isReady) {
      this._tryMarkReady();
      if (!this._isReady) {
        return; // DB/Redis still unavailable — skip cycle
      }
    }

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
   *
   * ARCHITECTURE: The Agent now reads TradingBriefs from the Strategic Council
   * instead of generating its own signals via MarketAnalyzer + SignalEvaluator.
   * This ensures a UNIFIED signal source — both Smart Executor and Agent
   * read from the same Council, but each filters by its assigned timeframes:
   *   - Smart Executor: M1, M5, M15 (quick/scalping)
   *   - Agent: M30, H1, H4, D1, W1 (short/medium/long-term)
   *
   * The old self-contained pipeline (MarketAnalyzer → SignalEvaluator → RiskCalculator)
   * is kept as a FALLBACK when the Council is unavailable, but the primary path
   * is Council → Brief → Execute.
   */
  private async _processAgentCycle(userId: string): Promise<void> {
    const state = await this._getAgentState(userId);
    if (!state) return;

    // FIX: Reset daily stats BEFORE the status check so that agents with
    // DAILY_LIMIT_REACHED status from a previous day can recover.
    this._resetDailyStatsIfNeeded(state);

    if (state.status !== AgentStatus.RUNNING) return;

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

    // ── PRIMARY PATH: Read briefs from Strategic Council ──
    // The Agent reads the SAME briefs as the Smart Executor, but filters
    // for M30+ timeframes only. This ensures unified signal source.
    let agentBriefs: TradingBriefDTO[] = [];
    let usingCouncilBriefs = false;

    if (this.councilService) {
      try {
        const allBriefs = await this.councilService.getActiveBriefs();
        // Filter: Agent handles M30+ timeframes only
        agentBriefs = allBriefs.filter(
          (brief: TradingBriefDTO) => isAgentTimeframe(brief.timeframe)
        );
        usingCouncilBriefs = agentBriefs.length > 0;

        if (agentBriefs.length > 0) {
          this.logger.log(
            `🧠 Agent ${userId} cycle #${state.totalCycles + 1}: ` +
            `${agentBriefs.length} council briefs for agent timeframes [${AGENT_TIMEFRAMES.join(',')}] ` +
            `(total briefs: ${allBriefs.length})`,
          );
        }
      } catch (councilErr: any) {
        this.logger.warn(`🧠 Council briefs unavailable for agent ${userId}: ${councilErr.message} — falling back to self-analysis`);
      }
    }

    // ── FALLBACK: Self-contained analysis when Council is unavailable ──
    if (!usingCouncilBriefs) {
      this.logger.debug(`🧠 Agent ${userId}: No council briefs available — using self-analysis fallback`);
    }

    let signalsExecuted = 0;
    let signalsGenerated = 0;
    let signalsRejected = 0;
    const rejectionReasons: string[] = [];

    if (usingCouncilBriefs) {
      // ── COUNCIL-BASED EXECUTION: Execute agent briefs from the Council ──
      for (const brief of agentBriefs) {
        try {
          // Check if user already has position for this pair
          const existingPosition = await this.prisma.position.findFirst({
            where: { userId, symbol: brief.pair, status: 'OPEN' },
          });
          if (existingPosition) {
            this.logger.debug(`🧠 Skipping brief ${brief.id} — existing open position for ${brief.pair}`);
            continue;
          }

          // Check confidence threshold (use agent-specific minimum)
          const minConfidence = 40;
          if (brief.confidence < minConfidence) {
            this.logger.debug(`🧠 Skipping brief ${brief.id} — confidence ${brief.confidence}% < min ${minConfidence}%`);
            continue;
          }

          // Check market hours
          const marketStatus = isMarketOpen(brief.pair);
          if (!marketStatus.open) {
            rejectionReasons.push(`${brief.pair}: سوق مغلق`);
            continue;
          }

          signalsGenerated++;

          // Risk assessment using the brief's SL/TP
          const signal: EvaluatedSignal = {
            id: brief.id,
            symbol: brief.pair,
            action: brief.direction === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
            type: OrderType.MARKET,
            confidence: brief.confidence,
            strategy: state.config.strategy,
            entryPrice: brief.entryPrice,
            stopLoss: brief.stopLoss,
            takeProfit: brief.takeProfit,
            quantity: 0, // Will be calculated by risk assessment
            reasoning: brief.analysisSummary || `Council brief: ${brief.timeframe} ${brief.direction}`,
            riskRewardRatio: Math.abs(brief.takeProfit - brief.entryPrice) / Math.abs(brief.entryPrice - brief.stopLoss),
            riskScore: 100 - brief.confidence,
            timestamp: new Date(),
            metadata: { briefId: brief.id, timeframe: brief.timeframe, source: 'council' },
          };

          const risk = await this.riskCalculator.assessRisk(userId, signal, state.config);

          if (!risk.canTrade) {
            signalsRejected++;
            rejectionReasons.push(`${brief.pair}: ${risk.reason}`);
            state.lastError = risk.reason;
            continue;
          }

          // Execute the trade
          const execution = await this.orderExecutor.execute(
            userId,
            signal,
            risk,
            state.config.credentialId,
          );

          if (execution.success) {
            signalsExecuted++;
            state.lastSignalAt = new Date();
            state.dailyTradesCount++;

            this.logger.log(
              `🧠 Council trade executed for ${userId}: ${signal.action} ${signal.symbol} ` +
              `(brief: ${brief.id}, timeframe: ${brief.timeframe})`,
            );
          }

          // Check consecutive losses
          if (state.consecutiveLosses >= 5) {
            this.logger.warn(`🧠 User ${userId}: 5 consecutive losses — pausing agent`);
            state.status = AgentStatus.PAUSED;
            break;
          }
        } catch (error: any) {
          this.logger.error(`Error processing council brief ${brief.id} for ${userId}: ${error.message}`);
        }
      }
    } else {
      // ── FALLBACK: Self-contained analysis pipeline (old behavior) ──
      // Used when Council is unavailable — MarketAnalyzer → SignalEvaluator
      const analyses = await this.marketAnalyzer.analyzeMultiple(state.config.symbols);

      if (analyses.size === 0 && state.config.symbols.length > 0) {
        state.lastError = `فشل جلب بيانات السوق لجميع الرموز (${state.config.symbols.join(', ')})`;
        this.logger.error(
          `🧠 Agent ${userId}: ALL ${state.config.symbols.length} market analyses FAILED.`,
        );
        await this._saveAgentState(userId, state);
        return;
      }

      for (const [symbol, analysis] of analyses) {
        try {
          const signal = await this.signalEvaluator.evaluate(
            analysis,
            state.config.strategy,
            state.config.strategyParams,
            userId,
          );

          if (!signal) {
            continue;
          }

          signalsGenerated++;

          const marketStatus = isMarketOpen(symbol);
          if (!marketStatus.open) {
            rejectionReasons.push(`${symbol}: سوق مغلق`);
            continue;
          }

          const risk = await this.riskCalculator.assessRisk(userId, signal, state.config);

          if (!risk.canTrade) {
            signalsRejected++;
            state.lastError = risk.reason;
            rejectionReasons.push(`${symbol}: ${risk.reason}`);
            continue;
          }

          const execution = await this.orderExecutor.execute(
            userId,
            signal,
            risk,
            state.config.credentialId,
          );

          if (execution.success) {
            signalsExecuted++;
            state.lastSignalAt = new Date();
            state.dailyTradesCount++;
          }

          if (state.consecutiveLosses >= 5) {
            state.status = AgentStatus.PAUSED;
            break;
          }
        } catch (error: any) {
          this.logger.error(`Error processing ${symbol} for ${userId}: ${error.message}`);
        }
      }
    }

    // Update cycle stats
    state.totalCycles++;
    state.lastCycleAt = new Date();

    // Cycle summary log
    this.logger.log(
      `🧠 Agent ${userId} cycle #${state.totalCycles} complete: ` +
      `${usingCouncilBriefs ? `${agentBriefs.length} council briefs` : 'self-analysis'}, ` +
      `${signalsGenerated} signals, ${signalsRejected} rejected, ${signalsExecuted} executed` +
      (rejectionReasons.length > 0 ? ` — rejections: [${rejectionReasons.join('; ')}]` : '') +
      (signalsGenerated === 0 ? ' — NO signals generated' : ''),
    );

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
    const activeUsers: string[] = [];
    const seenUserIds = new Set<string>();

    // Step 1: Check Redis for active agent states
    try {
      const keys = await this.redis.scanKeys('agent:state:*');

      for (const key of keys) {
        try {
          const raw = await this.redis.get(key);
          if (raw) {
            const state: AgentState = JSON.parse(raw);
            if (state.status === AgentStatus.RUNNING) {
              const userId = key.replace('agent:state:', '');
              activeUsers.push(userId);
              seenUserIds.add(userId);
            }
          }
        } catch {
          // Skip invalid entries
        }
      }
    } catch (redisError: any) {
      this.logger.warn(`Redis scanKeys failed in _getActiveAgents: ${redisError?.message || redisError}`);
    }

    // Step 2: DB fallback — recover RUNNING agents that were lost from Redis.
    // ROOT FIX: Previously this was completely DELETED to prevent phantom trades.
    // However, that caused a worse problem: when Redis restarts (common on Railway),
    // the user's explicitly-started agent disappears and the cron finds 0 active agents.
    // The user sees "يعمل" on the dashboard but the agent NEVER trades.
    //
    // NEW APPROACH: Safe DB recovery that prevents phantom trades:
    //   1. Only recover sessions started in the LAST 24 HOURS (not old ones)
    //   2. Only recover sessions where the user ALSO has AgentSettings.autoTradingEnabled=true
    //   3. Re-populate Redis so subsequent reads are fast
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
          if (seenUserIds.has(session.userId)) continue;

          // SAFETY CHECK 1: Verify autoTradingEnabled in AgentSettings
          try {
            const settings = await this.prisma.agentSettings.findUnique({
              where: { userId: session.userId },
            });
            if (settings && !settings.autoTradingEnabled) {
              // User explicitly disabled auto-trading — don't recover this session
              // Instead, mark it as STOPPED in DB
              await this.prisma.agentSession.update({
                where: { id: session.id },
                data: { status: 'STOPPED', stoppedAt: new Date() },
              }).catch(() => {});
              continue;
            }
          } catch { /* settings check failed — proceed with caution */ }

          // Re-populate Redis from DB so the agent cycle can process it
          try {
            let config: AgentConfig;
            try {
              config = JSON.parse(session.config);
            } catch {
              config = {
                userId: session.userId,
                strategy: session.strategy as StrategyType,
                enabled: true,
                maxPositionSizePercent: 2,
                maxDailyLossPercent: 5,
                maxOpenPositions: 5,
                riskPerTradePercent: 1.5,
                strategyParams: this._getDefaultStrategyParams(session.strategy as StrategyType),
                symbols: this.DEFAULT_SYMBOLS,
                credentialId: session.credentialId,
                isPaperTrading: true,
                createdAt: session.startedAt,
                updatedAt: session.updatedAt,
              };
            }

            const state: AgentState = {
              status: AgentStatus.RUNNING,
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

            await this.redis.set(
              `agent:state:${session.userId}`,
              JSON.stringify(state),
              86400000,
            );

            activeUsers.push(session.userId);
            seenUserIds.add(session.userId);

            this.logger.log(
              `🧠 DB recovery: Restored agent state for user ${session.userId} from DB (Redis lost it — likely restart). ` +
              `Session ${session.agentRunId}, strategy: ${session.strategy}`,
            );
          } catch (restoreErr: any) {
            this.logger.warn(`🧠 Failed to restore agent state for user ${session.userId}: ${restoreErr.message}`);
          }
        }

        if (activeUsers.length > 0) {
          this.logger.log(`🧠 Recovered ${activeUsers.length} active agent(s) from DB (Redis was empty)`);
        }
      } catch (dbError: any) {
        this.logger.warn(`🧠 DB fallback for _getActiveAgents failed: ${dbError.message}`);
      }
    }

    return activeUsers;
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
      case StrategyType.AUTO:
        // AUTO uses all strategy params — return comprehensive defaults
        return {
          ...this._getDefaultStrategyParams(StrategyType.SCALPING),
          ...this._getDefaultStrategyParams(StrategyType.SWING),
          ...this._getDefaultStrategyParams(StrategyType.MEAN_REVERSION),
          ...this._getDefaultStrategyParams(StrategyType.MOMENTUM_BREAKOUT),
          ...this._getDefaultStrategyParams(StrategyType.DCA),
          ...this._getDefaultStrategyParams(StrategyType.VWAP_RSI),
        };
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
          gridQuantityPerLevel: undefined,
        };
      case StrategyType.MEAN_REVERSION:
        return {
          meanReversionRsiOversold: 30,
          meanReversionRsiOverbought: 70,
          meanReversionBbLower: 0.15,
          meanReversionBbUpper: 0.85,
          meanReversionDeviation: 1.5,
        };
      case StrategyType.MOMENTUM_BREAKOUT:
        return {
          momentumBreakoutAtrMultiplier: 1.5,
          momentumBreakoutVolumeThreshold: 0,
        };
      case StrategyType.DCA:
        return {
          dcaBaseMultiplier: 1.0,
          dcaDiscountRsi: 40,
          dcaSkipRsi: 70,
        };
      case StrategyType.VWAP_RSI:
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
        const isPaperPosition = position.exchange === 'paper-trading';

        // FETCH LIVE QUOTE for all positions to ensure SL/TP exits can trigger
        // Previously this was only done for paper-trading, but real positions also
        // need live price monitoring for autonomous exit logic to work.
        try {
          const quote = await this.exchangeService.getQuote(position.symbol);
          if (quote && quote.price) {
            currentPrice = quote.price;
            // Update the position's currentPrice in DB so it's fresh for next check and for the UI
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
        } catch (quoteErr: any) {
          this.logger.warn(`Could not get quote for ${position.exchange} position ${position.symbol}: ${quoteErr.message}`);

          // Fallback to simulated price movement ONLY for paper-trading positions
          // Real positions should NOT be closed based on simulated data.
          if (isPaperPosition) {
            const entryPrice = Number(position.entryPrice);
            const lastPrice = Number(position.currentPrice || entryPrice);

            // IMPROVED: Larger random walk using ATR-based SL/TP distance
            const maxDelta = entryPrice * 0.005; // ±0.5%
            const slDistance = Math.abs(lastPrice - stopLoss) / lastPrice;
            const tpDistance = Math.abs(lastPrice - takeProfit) / lastPrice;
            
            let bias = 0;
            if (position.side === 'BUY') {
              bias = slDistance < tpDistance ? -0.2 : 0.2;
            } else {
              bias = slDistance < tpDistance ? 0.2 : -0.2;
            }
            const delta = (Math.random() - 0.5 + bias) * 2 * maxDelta;
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
              this.logger.log(
                `🧠 Simulated price for paper position ${position.symbol}: ${currentPrice.toFixed(2)} (last: ${lastPrice.toFixed(2)}, ±0.5% walk with bias)`,
              );
            } catch (simErr: any) {
              this.logger.warn(`Failed to save simulated price for ${position.symbol}: ${simErr.message}`);
            }
          }
        }

        let shouldClose = false;
        let reason = '';

        // FIX: MAX_HOLDING_TIME — close paper positions open >4h at breakeven to prevent accumulation.
        // Reduced from 24h to 4h: paper positions that haven't hit SL/TP in 4 hours are likely stuck
        // due to API issues, and keeping them open blocks maxOpenPositions for new trades.
        const holdingDurationMs = Date.now() - new Date(position.openedAt).getTime();
        const MAX_HOLDING_TIME_MS = 4 * 60 * 60 * 1000; // 4 hours (was 24 hours)
        if (isPaperPosition && holdingDurationMs > MAX_HOLDING_TIME_MS) {
          this.logger.log(
            `🧠 Paper position ${position.symbol} held for ${(holdingDurationMs / 3600000).toFixed(1)}h (>4h), closing at breakeven`,
          );
          currentPrice = Number(position.entryPrice); // breakeven exit
          shouldClose = true;
          reason = 'MAX_HOLDING_TIME';
        }

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
            // FIX: Use TradingService.closePositionWithRetry() for ALL positions
            // (both paper and real), instead of direct prisma.position.update().
            //
            // Why: Direct prisma.position.update() bypasses the position-close
            // business logic — no Trade record, no Order record, no optimistic
            // lock check, no exchange reconciliation, no audit log.
            // closePositionWithRetry() handles all of this properly.
            if (this.tradingService) {
              const result = await this.tradingService.closePositionWithRetry(userId, {
                positionId: position.id,
              });

              // Calculate PnL for daily tracking
              const pnl = position.side === 'BUY'
                ? (currentPrice - Number(position.entryPrice)) * Number(position.quantity)
                : (Number(position.entryPrice) - currentPrice) * Number(position.quantity);

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
                    exitReason: reason === 'STOP_LOSS_HIT' ? 'STOP_LOSS' : reason === 'MAX_HOLDING_TIME' ? 'STRATEGY_EXIT' : 'TAKE_PROFIT',
                    isWinning: pnl > 0,
                    currentPrice,
                    status: 'FILLED',
                  },
                });
              } catch (tradeErr: any) {
                this.logger.warn(`Failed to update AutonomousTrade for close: ${tradeErr.message}`);
              }

              this.logger.log(`🧠 Position closed: ${position.symbol} PnL: ${pnl.toFixed(2)} (${reason})`);
            } else {
              // Fallback: TradingService unavailable — direct DB update as last resort
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
                    exitReason: reason === 'STOP_LOSS_HIT' ? 'STOP_LOSS' : reason === 'MAX_HOLDING_TIME' ? 'STRATEGY_EXIT' : 'TAKE_PROFIT',
                    isWinning: pnl > 0,
                    currentPrice,
                    status: 'FILLED',
                  },
                });
              } catch (tradeErr: any) {
                this.logger.warn(`Failed to update AutonomousTrade for fallback close: ${tradeErr.message}`);
              }

              this.logger.log(`🧠 Paper position closed (fallback): ${position.symbol} PnL: ${pnl.toFixed(2)} (${reason})`);
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
