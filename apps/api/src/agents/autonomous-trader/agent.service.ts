// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { ExchangeService } from '../../modules/exchange/exchange.service';
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
export class AutonomousTraderAgentService {
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
    private readonly marketAnalyzer: MarketAnalyzerService,
    private readonly signalEvaluator: SignalEvaluatorService,
    private readonly riskCalculator: RiskCalculatorService,
    private readonly orderExecutor: OrderExecutorService,
  ) {
    this.logger.log('🧠 Autonomous Trader Agent initialized');
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

    // Validate credential
    let credential: any;
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

    // Build agent config (with NaN protection)
    const config: AgentConfig = {
      userId,
      strategy: dto.strategy,
      enabled: true,
      maxPositionSizePercent: dto.maxPositionSizePercent ?? (parseFloat(this.configService.get('MAX_POSITION_SIZE_PERCENT', '2')) || 2),
      maxDailyLossPercent: dto.maxDailyLossPercent ?? (parseFloat(this.configService.get('MAX_DAILY_LOSS_PERCENT', '5')) || 5),
      maxOpenPositions: dto.maxOpenPositions ?? (parseInt(this.configService.get('MAX_OPEN_POSITIONS', '5'), 10) || 5),
      riskPerTradePercent: dto.riskPerTradePercent ?? 1.5,
      strategyParams: dto.strategyParams ?? this._getDefaultStrategyParams(dto.strategy),
      symbols: dto.symbols ?? this.DEFAULT_SYMBOLS,
      credentialId: dto.credentialId,
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
          gridQuantityPerLevel: 0,
        };
      default:
        return {};
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
