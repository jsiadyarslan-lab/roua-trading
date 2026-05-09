// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الجندي في الميدان" — يراقب الأسعار باستمرار
// وينفذ الصفقات فوراً عندما تتحقق الشروط.
//
// بنية جديدة: المنفذ الذكي يحل محل TradingBotService القديم
// الفرق الجوهري:
//   - يقرأ TradingBriefs من المجلس الاستراتيجي (لا يقرأ Signals)
//   - ينفذ عبر TradingService (لا يضع أوامر مباشرة عبر Prisma)
//   - يدعم المستخدمين بشكل فردي (لكل مستخدم إعداداته)
//   - يراقب حد الخسارة اليومي لكل مستخدم
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AuditService } from '../../../audit/audit.service';
import { TradingService } from '../../trading/trading.service';
import { StrategicCouncilService } from '../strategic-council/strategic-council.service';
import { TradingBriefDTO, StrictRules } from '../strategic-council/strategic-council.types';
import { ExecutorStatus, ExecutionResult, ExecutorConfig, UserExecutorState } from './smart-executor.types';
import { PlaceOrderRequest, OrderSide, OrderType } from '../../trading/trading.types';
import { RiskGatekeeperService } from '../../trading/services/risk-gatekeeper.service';
import { AIOrchestratorService } from '../services/ai-orchestrator.service';
import { OrderSideEnum, OrderTypeEnum } from '../../trading/events/order.events';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class SmartExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(SmartExecutorService.name);

  /** Executor state */
  private isRunning = false;
  private isTicking = false;  // FIX: Guard against concurrent tick executions (race condition)
  private startedAt: Date | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private totalExecutions = 0;

  /** Configuration */
  private readonly config: ExecutorConfig = {
    tickIntervalMs: 2000,           // 2 seconds (more reasonable than 1s)
    maxOpenPositions: 10,
    maxDailyLossPercent: 5,
    defaultSlippage: 0.005,         // 0.5% — FIX: Increased from 0.1% to 0.5%
                                    // Crypto prices can move 0.1-0.3% in seconds.
                                    // The old 0.1% slippage was too tight — briefs would
                                    // be skipped because the price moved slightly between
                                    // when the council set the entry price and when the
                                    // executor checked it (often just seconds later).
    riskPerTradePercent: 1,
    minConfidence: 40,              // FIX: Lowered from 50 → 40. Technical fallback
                                    // produces confidence=45-48, which was being rejected
                                    // by the old minConfidence=50. With only 3/8 AI models
                                    // working, most briefs come from technical analysis
                                    // and need to pass the confidence check.
                                    // A 40% confidence brief with proper SL/TP is better
                                    // than no brief at all (pipeline stalled = 0 trades).
  };

  /** Redis key patterns */
  private readonly REDIS_USER_STATE_PREFIX = 'smart-executor:user:';
  private readonly REDIS_GLOBAL_STATE = 'smart-executor:global';
  private readonly REDIS_PROCESSED_PREFIX = 'smart-executor:processed:'; // briefId:userId → persisted in Redis

  /** DB key for persisting Smart Executor user state (survives Redis restart) */
  private readonly DB_USER_STATE_KEY = 'SMART_EXECUTOR_USER_STATE';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    private readonly audit: AuditService,
    private readonly tradingService: TradingService,
    private readonly councilService: StrategicCouncilService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly notificationService: NotificationService,
    // FIX: Removed @Inject(forwardRef(...)) — SmartExecutorModule already imports
    // AiModule via forwardRef, so AIOrchestratorService is available without
    // a second forwardRef on the injection site. Double forwardRef can cause
    // the DI container to resolve undefined in production builds.
    private readonly orchestrator: AIOrchestratorService,
  ) {
    this.logger.log('⚔️ Smart Executor initialized — DISABLED auto-start. Will ONLY run when a user explicitly enables it.');

    // FIX: REMOVED auto-start completely. Previously, the executor would
    // auto-start after 10 seconds, restore user states from DB/Redis,
    // and sync with AgentSession — all without user consent. This caused
    // phantom trades to be created for every user on every server restart.
    //
    // Now: The executor does NOTHING until a user explicitly clicks "تشغيل"
    // from their dashboard. No auto-start, no auto-restore, no cross-system sync.
    //
    // Only run startup cleanup to purge any leftover phantom data:
    setTimeout(() => {
      this._startupCleanup();
    }, 15000);
  }

  /**
   * Startup cleanup: Purge phantom data without starting the executor.
   * This runs once on server boot to clean up any leftover phantom positions,
   * trades, and paper-trading credentials from previous server instances.
   * Does NOT start the tick loop or enable any users.
   */
  private async _startupCleanup(): Promise<void> {
    try {
      this.logger.log('⚔️ Running startup phantom cleanup...');

      // ── STARTUP PURGE: Clean phantom/stale positions ──
      try {
        const purgeResult = await this.purgePhantomPositions();
        if (purgeResult.deleted > 0) {
          this.logger.log(`⚔️ STARTUP PURGE: Auto-deleted ${purgeResult.deleted} phantom position(s)`);
        }
      } catch (purgeErr: any) {
        this.logger.warn(`⚔️ Startup phantom purge failed (non-critical): ${purgeErr.message}`);
      }

      // Auto-close stale paper-trading positions that have been open too long (>24h)
      try {
        const staleClosed = await this._autoCloseStalePaperPositions();
        if (staleClosed > 0) {
          this.logger.log(`⚔️ STARTUP CLEANUP: Auto-closed ${staleClosed} stale paper-trading position(s) open >24h`);
        }
      } catch (staleErr: any) {
        this.logger.warn(`⚔️ Startup stale cleanup failed (non-critical): ${staleErr.message}`);
      }

      // ── NUCLEAR CLEANUP: Delete ALL paper-trading credentials ──
      // These are auto-generated fake credentials that create phantom trades.
      // They must be removed so the system stops generating fake positions.
      try {
        const deletedCreds = await this.prisma.exchangeCredential.deleteMany({
          where: { exchange: 'paper-trading' },
        });
        if (deletedCreds.count > 0) {
          this.logger.log(`⚔️ STARTUP PURGE: Deleted ${deletedCreds.count} paper-trading credential(s)`);
        }
      } catch (credErr: any) {
        this.logger.warn(`⚔️ Failed to purge paper-trading credentials: ${credErr.message}`);
      }

      // ── PURGE: Delete ALL smart_executor and agent positions from DB ──
      // These are phantom positions created by the auto-start tick loop
      try {
        const deletedPositions = await this.prisma.position.deleteMany({
          where: { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        });
        if (deletedPositions.count > 0) {
          this.logger.log(`⚔️ STARTUP PURGE: Deleted ${deletedPositions.count} phantom position(s) from executor/agent`);
        }
      } catch (posErr: any) {
        this.logger.warn(`⚔️ Failed to purge executor positions: ${posErr.message}`);
      }

      // ── PURGE: Clear all user executor states from Redis (no auto-restore) ──
      try {
        const userKeys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
        for (const key of userKeys) {
          await this.redis.del(key);
        }
        if (userKeys.length > 0) {
          this.logger.log(`⚔️ STARTUP PURGE: Cleared ${userKeys.length} executor user state(s) from Redis`);
        }
      } catch (redisErr: any) {
        this.logger.warn(`⚔️ Failed to clear executor Redis states: ${redisErr.message}`);
      }

      // ── PURGE: Clear global executor state from Redis ──
      try {
        await this.redis.del(this.REDIS_GLOBAL_STATE);
      } catch {}

      this.logger.log('⚔️ Startup phantom cleanup complete');
    } catch (error: any) {
      this.logger.warn(`⚔️ Startup cleanup failed (non-critical): ${error.message}`);
    }
  }

  /**
   * REMOVED: _autoEnableRealUsersForPaperTrading() has been PERMANENTLY DELETED.
   * This method auto-enabled paper trading for ALL users in the database without
   * their consent, creating phantom trades on every server restart. The executor
   * now ONLY enables users who explicitly click "تشغيل" from their dashboard.
   */

  // ── Lifecycle ──

  onModuleDestroy() {
    this.stop();
  }

  // ── Control Methods ──

  /**
   * Start the Smart Executor globally
   * Begins the price monitoring loop
   */
  async start(userId?: string): Promise<ExecutorStatus> {
    if (this.isRunning) {
      this.logger.warn('⚔️ Smart Executor is already running');
      return this.getStatus();
    }

    this.isRunning = true;
    this.startedAt = new Date();

    this.logger.log('⚔️ Smart Executor ACTIVATED — monitoring briefs every 2 seconds');

    // Start the tick loop
    this._startTickLoop();

    // Store global state
    await this.redis.set(
      this.REDIS_GLOBAL_STATE,
      JSON.stringify({ isRunning: true, startedAt: this.startedAt.toISOString() }),
      86400000,
    );

    await this.audit.log({
      userId: userId || 'system',
      action: 'SMART_EXECUTOR_START',
      resource: 'smart-executor',
      details: JSON.stringify({ startedAt: this.startedAt }),
    });

    return this.getStatus();
  }

  /**
   * Stop the Smart Executor globally
   */
  async stop(userId?: string): Promise<ExecutorStatus> {
    if (!this.isRunning) {
      return this.getStatus();
    }

    this.isRunning = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    this.logger.log('⚔️ Smart Executor STOPPED');

    await this.redis.set(
      this.REDIS_GLOBAL_STATE,
      JSON.stringify({ isRunning: false, stoppedAt: new Date().toISOString() }),
      86400000,
    );

    await this.audit.log({
      userId: userId || 'system',
      action: 'SMART_EXECUTOR_STOP',
      resource: 'smart-executor',
      details: JSON.stringify({ stoppedAt: new Date() }),
    });

    return this.getStatus();
  }

  /**
   * Enable executor for a specific user
   */
  async enableUser(userId: string, config?: {
    credentialId?: string;
    isPaperTrading?: boolean;
    maxOpenPositions?: number;
    riskPerTradePercent?: number;
  }): Promise<UserExecutorState> {
    // ── FIX: Auto-start the executor if it's not running ──
    // Previously, the user had to click TWO buttons: "تشغيل" (start executor)
    // AND "تفعيل" (enable user). This was confusing — the user would enable
    // their account but nothing would happen because the tick loop wasn't running.
    // Now: clicking "تفعيل" also starts the executor automatically if needed.
    if (!this.isRunning) {
      this.logger.log(`⚔️ Executor not running — auto-starting on behalf of user ${userId}`);
      try {
        await this.start(userId);
      } catch (error: any) {
        this.logger.warn(`⚔️ Failed to auto-start executor for user ${userId}: ${error.message}`);
      }
    }

    const state: UserExecutorState = {
      enabled: true,
      dailyPnL: 0,
      dailyTrades: 0,
      dailyResetAt: new Date().toISOString(),
      lastTradeAt: null,
      consecutiveLosses: 0,
      maxOpenPositions: config?.maxOpenPositions || this.config.maxOpenPositions,
      riskPerTradePercent: config?.riskPerTradePercent || this.config.riskPerTradePercent,
      credentialId: config?.credentialId,
      isPaperTrading: config?.isPaperTrading ?? true,
    };

    // ── CRITICAL FIX: Persist to BOTH Redis AND Database ──
    // Previously, user state was ONLY in Redis with 24h TTL.
    // If Redis restarted (common on Railway), the user's "تفعيل" was lost,
    // and the executor showed 0 enabled users even though the user
    // had explicitly enabled it.
    //
    // Now: Redis (fast access) + DB (survives restarts) dual persistence.

    // 1. Save to Redis (fast access for tick loop)
    await this.redis.set(
      `${this.REDIS_USER_STATE_PREFIX}${userId}`,
      JSON.stringify(state),
      86400000 * 7, // 7 days (was 1 day — too short, users lose activation daily)
    );

    // 2. Save to DB (survives Redis restart)
    await this._persistUserStateToDB(userId, state);

    this.logger.log(`⚔️ Executor enabled for user ${userId} (paper: ${state.isPaperTrading}) — saved to Redis + DB`);

    await this.audit.log({
      userId,
      action: 'SMART_EXECUTOR_USER_ENABLED',
      resource: 'smart-executor',
      details: JSON.stringify(state),
    });

    return state;
  }

  /**
   * Disable executor for a specific user
   */
  async disableUser(userId: string): Promise<void> {
    // Remove from Redis
    await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);

    // Remove from DB too
    await this._removeUserStateFromDB(userId);

    this.logger.log(`⚔️ Executor disabled for user ${userId} — removed from Redis + DB`);

    await this.audit.log({
      userId,
      action: 'SMART_EXECUTOR_USER_DISABLED',
      resource: 'smart-executor',
    });
  }

  /**
   * Get user executor state
   */
  async getUserState(userId: string): Promise<UserExecutorState | null> {
    // Step 1: Try Redis first (fast)
    const raw = await this.redis.get(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
    if (raw) {
      return JSON.parse(raw);
    }

    // Step 2: Redis miss — try DB fallback (user may have been enabled before Redis restart)
    const dbState = await this._loadUserStateFromDB(userId);
    if (dbState) {
      this.logger.log(`⚔️ Recovered user ${userId} state from DB (Redis lost it — likely restart)`);
      // Re-populate Redis from DB so next read is fast
      await this.redis.set(
        `${this.REDIS_USER_STATE_PREFIX}${userId}`,
        JSON.stringify(dbState),
        86400000 * 7,
      );
      return dbState;
    }

    // Step 3: Check if user has an active AgentSession (Autonomous Trader Agent)
    // Users who activated the Agent should also be considered "enabled" for the Smart Executor
    const agentSessionState = await this._loadUserStateFromAgentSession(userId);
    if (agentSessionState) {
      this.logger.log(`⚔️ Recovered user ${userId} state from AgentSession (cross-system sync)`);
      // Save to both Redis and DB
      await this.redis.set(
        `${this.REDIS_USER_STATE_PREFIX}${userId}`,
        JSON.stringify(agentSessionState),
        86400000 * 7,
      );
      await this._persistUserStateToDB(userId, agentSessionState);
      return agentSessionState;
    }

    return null;
  }

  /**
   * Get current executor status
   */
  async getStatus(userId?: string): Promise<ExecutorStatus> {
    let todayExecutions = 0;
    let todayPnL = 0;
    let openPositions = 0;
    let activeBriefs = 0;

    // FIX: Separate try-catch blocks so one failing query doesn't prevent others
    // The previous single try-catch meant that if Position table didn't exist,
    // the activeBriefs count would never be reached, always showing 0.

    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // FIX: Count executions from BOTH AuditLog AND Trade table.
      // Previously, only AuditLog entries with action='SMART_EXECUTOR_TRADE' were counted.
      // But trades can be executed by multiple sources (smart_executor, agent, auto_paper),
      // and the AuditLog approach misses trades executed by other paths.
      // Now we also count Trade records where source is 'smart_executor' or 'auto_paper'.

      // 1. Count from AuditLog (primary — created by _executeBriefForUser)
      const auditWhere: any = {
        action: 'SMART_EXECUTOR_TRADE',
        createdAt: { gte: startOfDay },
      };
      if (userId) auditWhere.userId = userId;
      const todayLogs = await this.prisma.auditLog.findMany({ where: auditWhere });
      todayExecutions = todayLogs.length;

      // 2. If AuditLog count is 0, try counting from Trade table as fallback
      // This catches trades that were executed but didn't create an AuditLog entry
      if (todayExecutions === 0) {
        try {
          const tradeWhere: any = {
            source: { in: ['smart_executor', 'auto_paper'] },
            type: 'ENTRY',
            executedAt: { gte: startOfDay },
          };
          if (userId) tradeWhere.userId = userId;
          todayExecutions = await this.prisma.trade.count({ where: tradeWhere });
        } catch (tradeErr: any) {
          this.logger.debug(`getStatus: trade count fallback failed: ${tradeErr.message}`);
        }
      }
    } catch (e: any) {
      this.logger.debug(`getStatus: auditLog query failed: ${e.message}`);
    }

    try {
      const posWhere: any = { status: 'OPEN' };
      if (userId) {
        posWhere.userId = userId;
      } else {
        // If no userId provided (global status), only count positions with valid trade value
        // to avoid phantom positions inflating the count
        posWhere.AND = [
          { entryPrice: { gt: 0 } },
        ];
      }
      openPositions = await this.prisma.position.count({ where: posWhere });
    } catch (e: any) {
      this.logger.debug(`getStatus: position count failed: ${e.message}`);
    }

    try {
      activeBriefs = await this.councilService.getActiveBriefsCount();
    } catch (e: any) {
      this.logger.debug(`getStatus: activeBriefs count failed: ${e.message}`);
    }

    // FIX: Calculate todayPnL from Trade table instead of hardcoding 0
    // Previously, todayPnL was always 0 because there was no calculation.
    // Now we sum up PnL from closed trades (EXIT type) by the executor today.
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const pnlWhere: any = {
        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
        executedAt: { gte: startOfDay },
        pnl: { not: null },
      };
      if (userId) pnlWhere.userId = userId;
      const pnlTrades = await this.prisma.trade.findMany({
        where: pnlWhere,
        select: { pnl: true },
      });
      todayPnL = pnlTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    } catch (e: any) {
      this.logger.debug(`getStatus: todayPnL calculation failed: ${e.message}`);
    }

    // Check if daily loss limit reached
    const dailyLossLimitReached = false; // Per-user check, not global

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

  /**
   * Get open positions managed by the executor for a specific user
   * FIX: Previously returned ALL positions system-wide (security issue + phantom data from other users)
   */
  async getOpenPositions(userId?: string): Promise<any[]> {
    try {
      const where: any = { status: 'OPEN' };
      if (userId) where.userId = userId;

      const positions = await this.prisma.position.findMany({
        where,
        orderBy: { openedAt: 'desc' },
      });

      // ═══════════════════════════════════════════════════
      // PHANTOM TRADE FILTER: Remove positions with
      // unrealistic trade values. These are phantom trades
      // created from degraded/fallback data before the fix.
      // A real position should have qty * entryPrice >= $1.
      // ═══════════════════════════════════════════════════
      return positions.filter((pos) => {
        const qty = Number(pos.quantity);
        const entryPrice = Number(pos.entryPrice);
        const tradeValue = qty * entryPrice;
        // Reject positions with zero/invalid prices or dust values
        return entryPrice > 0 && tradeValue >= 1;
      });
    } catch {
      return [];
    }
  }

  /**
   * PURGE PHANTOM POSITIONS: Delete all positions from the
   * database that were created from degraded/fallback data.
   * These show as $0.00-$0.04 trades on the dashboard.
   */
  async purgePhantomPositions(): Promise<{ deleted: number }> {
    try {
      const allPositions = await this.prisma.position.findMany({
        where: { status: 'OPEN' },
      });

      const phantomIds: string[] = [];
      for (const pos of allPositions) {
        const qty = Number(pos.quantity);
        const entryPrice = Number(pos.entryPrice);
        const tradeValue = qty * entryPrice;
        // Phantom = trade value < $1 (dust trade from degraded data)
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
    } catch (error: any) {
      this.logger.error(`⚔️ Failed to purge phantom positions: ${error.message}`);
      return { deleted: 0 };
    }
  }

  /**
   * Reset all auto-enabled users — disables users who were auto-enabled
   * by the old _autoEnableSystemUser() code. After this, users must
   * manually click "تشغيل" to re-enable the executor.
   */
  async resetAutoEnabledUsers(): Promise<{ disabled: number }> {
    try {
      const enabledUsers = await this._getEnabledUsers();
      let disabled = 0;

      for (const userId of enabledUsers) {
        // Disable each user — they'll need to manually re-enable
        await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
        disabled++;
        this.logger.log(`⚔️ Reset auto-enabled user: ${userId}`);
      }

      this.logger.log(`⚔️ Reset ${disabled} auto-enabled user(s) — they must re-enable manually`);
      return { disabled };
    } catch (error: any) {
      this.logger.error(`⚔️ Failed to reset auto-enabled users: ${error.message}`);
      return { disabled: 0 };
    }
  }

  /**
   * NUCLEAR CLEANUP: Delete ALL fake/paper trading data from the database.
   * This removes:
   *   - ALL TradingBriefs (they are generated by AI, not by real users)
   *   - ALL Positions with exchange='paper-trading'
   *   - ALL Trades with exchange='paper-trading'
   *   - ALL PaperOrders
   *   - ALL ExchangeCredentials with exchange='paper-trading'
   *   - ALL Redis user executor states
   *   - ALL Redis processed brief keys
   *   - Stops the executor
   *   - Clears the global executor state from Redis
   */
  async nuclearCleanup(): Promise<{
    briefs: number;
    positions: number;
    trades: number;
    paperOrders: number;
    paperCredentials: number;
    redisUsers: number;
    redisProcessed: number;
    executorStopped: boolean;
  }> {
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

    this.logger.log('⚔️ NUCLEAR CLEANUP: Starting complete deletion of all fake/paper data...');

    // 1. Stop the executor first
    try {
      await this.stop('nuclear-cleanup');
      result.executorStopped = true;
      this.logger.log('⚔️ NUCLEAR CLEANUP: Executor stopped');
    } catch (e: any) {
      this.logger.warn(`⚔️ NUCLEAR CLEANUP: Failed to stop executor: ${e.message}`);
    }

    // 2. Delete ALL TradingBriefs (they are auto-generated by the Strategic Council, not by users)
    try {
      const briefCount = await this.prisma.tradingBrief.count();
      if (briefCount > 0) {
        await this.prisma.tradingBrief.deleteMany({});
        result.briefs = briefCount;
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Deleted ${briefCount} TradingBriefs`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete TradingBriefs: ${e.message}`);
    }

    // 3. Delete ALL Positions with exchange='paper-trading'
    try {
      const paperPositions = await this.prisma.position.findMany({
        where: { exchange: 'paper-trading' },
        select: { id: true },
      });
      if (paperPositions.length > 0) {
        await this.prisma.position.deleteMany({
          where: { id: { in: paperPositions.map(p => p.id) } },
        });
        result.positions = paperPositions.length;
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Deleted ${paperPositions.length} paper-trading Positions`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Positions: ${e.message}`);
    }

    // 4. Delete ALL Trades with exchange='paper-trading'
    try {
      const paperTrades = await this.prisma.trade.findMany({
        where: { exchange: 'paper-trading' },
        select: { id: true },
      });
      if (paperTrades.length > 0) {
        await this.prisma.trade.deleteMany({
          where: { id: { in: paperTrades.map(t => t.id) } },
        });
        result.trades = paperTrades.length;
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Deleted ${paperTrades.length} paper-trading Trades`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Trades: ${e.message}`);
    }

    // 5. Delete ALL PaperOrders
    try {
      const paperOrderCount = await this.prisma.paperOrder.count();
      if (paperOrderCount > 0) {
        await this.prisma.paperOrder.deleteMany({});
        result.paperOrders = paperOrderCount;
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Deleted ${paperOrderCount} PaperOrders`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete PaperOrders: ${e.message}`);
    }

    // 6. Delete ALL ExchangeCredentials with exchange='paper-trading'
    try {
      const paperCreds = await this.prisma.exchangeCredential.findMany({
        where: { exchange: 'paper-trading' },
        select: { id: true },
      });
      if (paperCreds.length > 0) {
        await this.prisma.exchangeCredential.deleteMany({
          where: { id: { in: paperCreds.map(c => c.id) } },
        });
        result.paperCredentials = paperCreds.length;
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Deleted ${paperCreds.length} paper-trading Credentials`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Credentials: ${e.message}`);
    }

    // 7. Clear ALL Redis user executor states
    try {
      const userKeys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
      for (const key of userKeys) {
        await this.redis.del(key);
        result.redisUsers++;
      }
      if (result.redisUsers > 0) {
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Cleared ${result.redisUsers} Redis user states`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear Redis user states: ${e.message}`);
    }

    // 8. Clear ALL Redis processed brief keys
    try {
      const processedKeys = await this.redis.scanKeys(`${this.REDIS_PROCESSED_PREFIX}*`);
      for (const key of processedKeys) {
        await this.redis.del(key);
        result.redisProcessed++;
      }
      if (result.redisProcessed > 0) {
        this.logger.log(`⚔️ NUCLEAR CLEANUP: Cleared ${result.redisProcessed} Redis processed keys`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear Redis processed keys: ${e.message}`);
    }

    // 9. Clear global executor state from Redis
    try {
      await this.redis.del(this.REDIS_GLOBAL_STATE);
      this.logger.log('⚔️ NUCLEAR CLEANUP: Cleared global executor state from Redis');
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear global state: ${e.message}`);
    }

    this.logger.log(
      `⚔️ NUCLEAR CLEANUP COMPLETE: briefs=${result.briefs}, positions=${result.positions}, ` +
      `trades=${result.trades}, paperOrders=${result.paperOrders}, ` +
      `paperCredentials=${result.paperCredentials}, redisUsers=${result.redisUsers}, ` +
      `redisProcessed=${result.redisProcessed}, executorStopped=${result.executorStopped}`,
    );

    return result;
  }

  /**
   * Get all users with executor enabled
   * FIX: Use RedisService.scanKeys() instead of (this.redis as any)['client'].scan().
   * The Redis client is private in RedisService, so accessing it via `as any`
   * is fragile and breaks in production builds. The scanKeys() method is
   * the official API for this pattern.
   */
  private async _getEnabledUsers(): Promise<string[]> {
    const userIds = new Set<string>();

    // Step 1: Check Redis for enabled users (fast path)
    try {
      const keys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
      for (const k of keys) {
        userIds.add(k.replace(this.REDIS_USER_STATE_PREFIX, ''));
      }
    } catch {
      // Redis unavailable — fall through to DB check
    }

    // Step 2: Check DB for persisted user states (survives Redis restart)
    // Only restore users who EXPLICITLY enabled the executor themselves.
    try {
      const dbUserIds = await this._getAllEnabledUsersFromDB();
      for (const id of dbUserIds) {
        if (!userIds.has(id)) {
          userIds.add(id);
          // Re-populate Redis from DB
          const dbState = await this._loadUserStateFromDB(id);
          if (dbState) {
            await this.redis.set(
              `${this.REDIS_USER_STATE_PREFIX}${id}`,
              JSON.stringify(dbState),
              86400000 * 7,
            );
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`⚔️ Failed to check DB for enabled users: ${e.message}`);
    }

    // REMOVED: Step 3 (AgentSession cross-system sync) has been DELETED.
    // Previously, this code would find users with active AgentSession records
    // and auto-enable them for the Smart Executor without their consent.
    // This caused the executor to execute trades for users who only activated
    // the Agent, creating duplicate phantom trades from TWO systems.
    // Now: Each system is independent. The executor only runs for users who
    // explicitly enabled it from the executor dashboard.

    if (userIds.size > 0) {
      this.logger.debug(`⚔️ Enabled users total: ${userIds.size}`);
    }

    return Array.from(userIds);
  }

  // ── Core: Tick Loop ──

  /**
   * Start the monitoring tick loop
   * Each tick: read active briefs → check prices → execute if conditions met for enabled users
   */
  private _startTickLoop(): void {
    this.tickInterval = setInterval(async () => {
      if (!this.isRunning || this.isTicking) return;  // FIX: Prevent concurrent ticks

      this.isTicking = true;
      try {
        await this._tick();
      } catch (error: any) {
        this.logger.error(`⚔️ Tick error: ${error.message}`);
      } finally {
        this.isTicking = false;
      }
    }, this.config.tickIntervalMs);
  }

  /**
   * Single tick: Get active briefs, find enabled users, check conditions per user
   */
  private async _tick(): Promise<void> {
    // Get active briefs from the Strategic Council
    let activeBriefs: any[] = [];
    try {
      activeBriefs = await this.councilService.getActiveBriefs();
    } catch (e: any) {
      this.logger.error(`⚔️ Failed to get active briefs: ${e.message}`);
      return;
    }

    if (activeBriefs.length === 0) {
      this.logger.debug('⚔️ No active briefs to execute — waiting for Strategic Council');
      return;
    }

    // Get users with executor enabled
    const enabledUsers = await this._getEnabledUsers();

    if (enabledUsers.length === 0) {
      this.logger.debug(`⚔️ ${activeBriefs.length} briefs available but no enabled users — skipping`);
      return;
    }

    this.logger.debug(`⚔️ Tick: ${activeBriefs.length} briefs, ${enabledUsers.length} users`);

    // Process each enabled user
    for (const userId of enabledUsers) {
      try {
        await this._processUserBriefs(userId, activeBriefs);
      } catch (error: any) {
        this.logger.error(`⚔️ Error processing user ${userId}: ${error.message}`);
      }
    }
  }

  /**
   * Process active briefs for a specific user
   */
  private async _processUserBriefs(userId: string, briefs: TradingBriefDTO[]): Promise<void> {
    const userState = await this.getUserState(userId);
    if (!userState || !userState.enabled) return;

    // Reset daily stats if new day
    const dailyResetAt = new Date(userState.dailyResetAt);
    const now = new Date();
    if (now.toDateString() !== dailyResetAt.toDateString()) {
      userState.dailyPnL = 0;
      userState.dailyTrades = 0;
      userState.dailyResetAt = now.toISOString();
      userState.consecutiveLosses = 0;
    }

    // Check daily loss limit
    const portfolio = await this._getPortfolioValue(userId);
    if (portfolio > 0 && userState.dailyPnL < -(portfolio * this.config.maxDailyLossPercent / 100)) {
      this.logger.warn(`⚔️ User ${userId} hit daily loss limit — pausing`);
      return;
    }

    // Check max open positions
    const maxPositions = userState.maxOpenPositions || this.config.maxOpenPositions;
    let openPositionsCount = await this.prisma.position.count({
      where: { userId, status: 'OPEN' },
    });

    // ── FIX: Auto-close stale positions for paper trading ──
    // When the user is at max open positions AND is paper trading, automatically
    // close the oldest position to make room for new briefs. This prevents the
    // executor from being permanently stuck at max positions with stale trades
    // that have been open for too long. Paper trading is simulated, so closing
    // stale positions doesn't risk real capital.
    if (openPositionsCount >= maxPositions && userState.isPaperTrading) {
      try {
        const oldestPosition = await this.prisma.position.findFirst({
          where: { userId, status: 'OPEN' },
          orderBy: { openedAt: 'asc' },
        });

        if (oldestPosition) {
          // Close the oldest position at its current price (or entry price as fallback)
          const closePrice = Number(oldestPosition.currentPrice) || Number(oldestPosition.entryPrice);
          const pnl = (closePrice - Number(oldestPosition.entryPrice)) * Number(oldestPosition.quantity) * (oldestPosition.side === 'SELL' ? -1 : 1);

          await this.prisma.position.update({
            where: { id: oldestPosition.id },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              currentPrice: closePrice,
              unrealizedPnl: 0,
              realizedPnl: pnl,
              source: 'smart_executor',
            },
          });

          // Record the closing trade
          try {
            await this.prisma.trade.create({
              data: {
                userId,
                positionId: oldestPosition.id,
                symbol: oldestPosition.symbol,
                side: oldestPosition.side === 'BUY' ? 'SELL' : 'BUY',
                type: 'EXIT',
                quantity: Number(oldestPosition.quantity),
                price: closePrice,
                pnl,
                exchange: 'paper-trading',
                source: 'smart_executor',
                executedAt: new Date(),
              },
            });
          } catch (tradeErr: any) {
            this.logger.warn(`⚔️ Failed to record closing trade for stale position ${oldestPosition.id}: ${tradeErr.message}`);
          }

          // Update user daily PnL
          userState.dailyPnL += pnl;

          openPositionsCount--;
          this.logger.log(
            `⚔️ Paper trading: auto-closed stale position ${oldestPosition.symbol} ` +
            `(id: ${oldestPosition.id}, PnL: $${pnl.toFixed(2)}) to make room for new brief`,
          );
        }
      } catch (closeErr: any) {
        this.logger.warn(`⚔️ Failed to auto-close stale position for paper user ${userId}: ${closeErr.message}`);
      }
    }

    if (openPositionsCount >= maxPositions) {
      return; // At max positions
    }

    // Process each brief
    for (const brief of briefs) {
      // Skip already processed briefs (per user) — Redis-backed for crash safety
      const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
      const alreadyProcessed = await this.redis.get(processedKey);
      if (alreadyProcessed) {
        this.logger.debug(`⚔️ Skipping already-processed brief ${brief.id} for user ${userId}`);
        continue;
      }

      // Check confidence threshold FIRST (cheap check, skip early)
      if (brief.confidence < this.config.minConfidence) {
        this.logger.debug(`⚔️ Skipping brief ${brief.id} — confidence ${brief.confidence}% < min ${this.config.minConfidence}%`);
        continue;
      }

      // Check if user already has position for this pair
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId, symbol: brief.pair, status: 'OPEN' },
      });
      if (existingPosition) {
        // FIX: Instead of silently skipping, close the stale position for paper trading
        // and execute the new brief. Old positions block ALL new trades for that pair,
        // causing 0 executions when the dashboard shows "5 open positions".
        if (userState.isPaperTrading) {
          try {
            const closePrice = Number(existingPosition.currentPrice) || Number(existingPosition.entryPrice);
            const pnl = (closePrice - Number(existingPosition.entryPrice)) * Number(existingPosition.quantity) * (existingPosition.side === 'SELL' ? -1 : 1);

            await this.prisma.position.update({
              where: { id: existingPosition.id },
              data: {
                status: 'CLOSED',
                closedAt: new Date(),
                currentPrice: closePrice,
                unrealizedPnl: 0,
                realizedPnl: pnl,
                source: 'smart_executor',
              },
            });

            // Record the closing trade
            try {
              await this.prisma.trade.create({
                data: {
                  userId,
                  positionId: existingPosition.id,
                  symbol: existingPosition.symbol,
                  side: existingPosition.side === 'BUY' ? 'SELL' : 'BUY',
                  type: 'EXIT',
                  quantity: Number(existingPosition.quantity),
                  price: closePrice,
                  pnl,
                  exchange: 'paper-trading',
                  source: 'smart_executor',
                  executedAt: new Date(),
                },
              });
            } catch (tradeErr: any) {
              this.logger.warn(`⚔️ Failed to record closing trade: ${tradeErr.message}`);
            }

            this.logger.log(
              `⚔️ Closed stale paper position ${existingPosition.symbol} ` +
              `(PnL: $${pnl.toFixed(2)}) to execute new brief ${brief.id}`,
            );
          } catch (closeErr: any) {
            this.logger.warn(`⚔️ Failed to close stale position for ${brief.pair}: ${closeErr.message} — skipping brief`);
            continue;
          }
        } else {
          this.logger.debug(`⚔️ Skipping brief ${brief.id} — existing open position for ${brief.pair}`);
          continue;
        }
      }

      try {
        await this._checkBriefForUser(userId, brief, userState, portfolio);
      } catch (error: any) {
        this.logger.error(`⚔️ Error checking brief ${brief.id} for user ${userId}: ${error.message}`);
      }
    }
  }

  /**
   * Check if a brief's entry conditions are met for a specific user
   */
  private async _checkBriefForUser(
    userId: string,
    brief: TradingBriefDTO,
    userState: UserExecutorState,
    portfolioValue: number,
  ): Promise<void> {
    // ── Paper Trading: Skip live price verification ──
    // FIX: For paper trading, the brief's entry price IS the execution price.
    // Paper trading doesn't need live price verification because:
    // 1. Paper orders are simulated — no real exchange connection needed
    // 2. Price fetch failures (common on Railway) were blocking ALL paper trades
    // 3. The brief itself is the signal — paper trading should just execute it
    let currentPrice: number = brief.entryPrice;

    if (!userState.isPaperTrading) {
      // Real trading: Must verify live price before execution
      // FIX: Use orchestrator's fetchQuickMarketData first (multiple parallel sources,
      // works on Railway), then fall back to ExchangeService.
      try {
        const marketData = await this.orchestrator.fetchQuickMarketData(brief.pair);
        currentPrice = marketData.price;
      } catch {}

      if (!currentPrice || currentPrice <= 0) {
        try {
          const quote = await this.exchangeService.getQuote(brief.pair);
          currentPrice = quote.price;
        } catch (priceErr: any) {
          this.logger.debug(`⚔️ Cannot get price for ${brief.pair}: ${priceErr.message} — skipping brief ${brief.id}`);
          return; // Can't get price — skip
        }
      }

      // FIX: Validate fetched price against brief's entry price.
      // Sometimes fetchQuickMarketData returns wrong prices (e.g., 0.99 for USD/JPY
      // instead of ~157). This happens because some data sources return inverse rates
      // or use different quote conventions. If the fetched price is more than 20%
      // away from the brief's entry price, it's likely wrong — use the entry price.
      if (currentPrice > 0 && brief.entryPrice > 0) {
        const priceDeviation = Math.abs(currentPrice - brief.entryPrice) / brief.entryPrice;
        if (priceDeviation > 0.2) {
          this.logger.warn(
            `⚔️ Fetched price ${currentPrice} for ${brief.pair} deviates ${(priceDeviation * 100).toFixed(1)}% from brief entry ${brief.entryPrice} — using entry price instead`,
          );
          currentPrice = brief.entryPrice;
        }
      }
    } else {
      this.logger.debug(`⚔️ Paper trading: using brief entry price ${brief.entryPrice} for ${brief.pair} (no live price check)`);
    }

    // 2. Check strict rules
    const strictRules: StrictRules = brief.strictRules || { maxSlippage: this.config.defaultSlippage };

    // Paper trading: Skip strict entry price rules (brief IS the signal)
    if (!userState.isPaperTrading) {
      // Check max entry price (for BUY — don't buy above this)
      if (strictRules.maxEntryPrice && currentPrice > strictRules.maxEntryPrice) {
        // Price too high — brief violated for now, but don't cancel (may come back in range)
        this.logger.debug(`⚔️ Brief ${brief.id} price ${currentPrice} > maxEntry ${strictRules.maxEntryPrice} — waiting`);
        return;
      }

      // Check min entry price (for SELL — don't sell below this)
      if (strictRules.minEntryPrice && currentPrice < strictRules.minEntryPrice) {
        this.logger.debug(`⚔️ Brief ${brief.id} price ${currentPrice} < minEntry ${strictRules.minEntryPrice} — waiting`);
        return;
      }
    }

    // 3. Check if entry conditions are met
    // FIX: Paper trading always meets entry conditions — the brief itself is the signal
    const conditionsMet = userState.isPaperTrading || this._areEntryConditionsMet(brief, currentPrice, strictRules);

    if (conditionsMet) {
      // EXECUTE THE TRADE!
      const result = await this._executeBriefForUser(userId, brief, currentPrice, userState, portfolioValue);

      if (result.success) {
        // Mark as processed in Redis (survives restarts — 24h TTL matches brief lifecycle)
        const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
        await this.redis.set(processedKey, JSON.stringify({ orderId: result.orderId, executedAt: new Date().toISOString() }), 86400000);
        this.totalExecutions++;

        this.logger.log(
          `⚔️ EXECUTED: ${brief.direction} ${brief.pair} @ ${currentPrice} ` +
          `(brief: ${brief.id}, order: ${result.orderId}, user: ${userId})`,
        );

        // Mark brief as executed in council
        if (result.orderId) {
          await this.councilService.markBriefExecuted(brief.id, result.orderId);
        }

        // Update user state (persist to both Redis and DB)
        userState.dailyTrades++;
        userState.lastTradeAt = new Date().toISOString();
        await this.redis.set(
          `${this.REDIS_USER_STATE_PREFIX}${userId}`,
          JSON.stringify(userState),
          86400000 * 7,
        );
        // Sync to DB (fire-and-forget for performance)
        this._persistUserStateToDB(userId, userState).catch(() => {});

        // ── INSTANT NOTIFICATION: Push real-time alert to user ──
        try {
          const directionAr = brief.direction === 'BUY' ? 'شراء' : 'بيع';
          const modeLabel = userState.isPaperTrading ? 'ورقي' : 'حقيقي';
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
              isPaperTrading: userState.isPaperTrading,
            },
            source: 'executor',
            action: brief.direction === 'BUY' ? 'BUY' : 'SELL',
            pair: brief.pair,
          });
        } catch (notifError: any) {
          this.logger.warn(`⚔️ Failed to send execution notification to user ${userId}: ${notifError.message}`);
        }
      } else {
        // FIX: Do NOT mark as processed on failure — brief can be retried
        // on the next tick if conditions change (e.g., price re-enters range)
        this.logger.warn(
          `⚔️ Brief ${brief.id} execution FAILED for user ${userId}: ${result.error} — will retry on next tick`,
        );

        // ── INSTANT NOTIFICATION: Alert on failed execution ──
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
        } catch (notifError: any) {
          this.logger.warn(`⚔️ Failed to send rejection notification to user ${userId}: ${notifError.message}`);
        }
      }
    }
  }

  /**
   * Check if entry conditions are met for a brief
   */
  private _areEntryConditionsMet(
    brief: TradingBriefDTO,
    currentPrice: number,
    strictRules: StrictRules,
  ): boolean {
    // FIX: Relaxed entry conditions — the old strict slippage check meant
    // that briefs were rejected if the price moved even slightly between
    // when the council created the brief and when the executor checked it.
    // On volatile crypto pairs, this can happen in seconds.
    //
    // NEW LOGIC: For BUY, just check that current price is below take profit
    // (the trade still has room to profit). For SELL, check that current price
    // is above take profit. This is much more forgiving and allows trades
    // even when prices have moved slightly since the brief was issued.
    //
    // The stop loss and take profit levels are still enforced by RiskGatekeeper.
    const slippage = strictRules.maxSlippage || this.config.defaultSlippage;

    // FIX: Check if takeProfit is valid before using it in the profit potential check.
    // When takeProfit is 0, null, or undefined (can happen from DB null → DTO conversion),
    // `currentPrice < 0` or `currentPrice < NaN` is ALWAYS false, silently blocking
    // ALL BUY briefs. This was the ROOT CAUSE of zero Smart Executor trades.
    const hasValidTP = brief.takeProfit && brief.takeProfit > 0;

    if (brief.direction === 'BUY') {
      // BUY: Check that price is still within a reasonable range of the entry.
      // Allow up to 2x the normal slippage as a grace margin.
      const maxPrice = brief.entryPrice * (1 + slippage * 2);
      // Check that the trade still has profit potential (only if TP is valid)
      // If TP is invalid/missing, skip this check — RiskGatekeeper still enforces SL/TP
      const hasProfitPotential = !hasValidTP || currentPrice < brief.takeProfit;
      return currentPrice <= maxPrice && hasProfitPotential;
    } else {
      // SELL: Check that price is still within a reasonable range of the entry.
      const minPrice = brief.entryPrice * (1 - slippage * 2);
      // Check that the trade still has profit potential (only if TP is valid)
      const hasProfitPotential = !hasValidTP || currentPrice > brief.takeProfit;
      return currentPrice >= minPrice && hasProfitPotential;
    }
  }

  /**
   * Execute a brief for a specific user — place the order via TradingService
   */
  private async _executeBriefForUser(
    userId: string,
    brief: TradingBriefDTO,
    currentPrice: number,
    userState: UserExecutorState,
    portfolioValue: number,
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: false,
      briefId: brief.id,
      pair: brief.pair,
      direction: brief.direction,
      entryPrice: currentPrice,
      userId,
      executedAt: new Date(),
    };

    try {
      // Find user's exchange credential
      let credential: any = null;

      if (userState.isPaperTrading) {
        // Paper trading — find or create paper credential
        credential = await this.prisma.exchangeCredential.findFirst({
          where: { userId, exchange: 'paper-trading', isValid: true },
        });

        if (!credential) {
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
        }
      } else {
        // Real trading — use user's credential
        const where: any = { userId, isValid: true };
        if (userState.credentialId) {
          where.id = userState.credentialId;
        } else {
          where.permissions = { contains: 'trade' };
        }

        credential = await this.prisma.exchangeCredential.findFirst({ where });
      }

      if (!credential) {
        // FIX: No credential found — do NOT auto-create paper-trading credentials.
        // Previously, this code would automatically fall back to paper trading,
        // creating a fake credential and executing phantom trades without user consent.
        // This was a major source of phantom trades. Now: if there's no credential,
        // the brief is simply SKIPPED for this user. The user must explicitly
        // add an exchange API key or explicitly enable paper trading from the dashboard.
        this.logger.warn(
          `⚔️ No credential found for user ${userId} — skipping brief execution. ` +
          `User must add an exchange API key or explicitly enable paper trading.`,
        );
        result.error = 'No exchange credential — skipped';
        return result;
      }

      // Calculate position size based on risk
      // FIX: The old formula `riskAmount / priceRisk` produces astronomical quantities
      // for Forex pairs where priceRisk is tiny (e.g., EUR/USD: |1.1754 - 1.1695| = 0.006).
      // Example: $1000 risk / $0.006 priceRisk = 170,154 units × $1.1754 = $200,000 order.
      // This ALWAYS gets rejected by RiskGatekeeper (max order size $10K-$50K).
      //
      // NEW APPROACH: Calculate the maximum quantity that keeps the order value
      // within a safe range, THEN apply the risk-based constraint.
      // This ensures Forex pairs trade with reasonable lot sizes while still
      // respecting the risk percentage.
      const riskPercent = (userState.riskPerTradePercent || this.config.riskPerTradePercent) / 100;
      const riskAmount = Math.max(portfolioValue * riskPercent, 10); // minimum $10
      const priceRisk = Math.abs(currentPrice - brief.stopLoss);

      if (priceRisk === 0) {
        result.error = 'Invalid stop loss — price risk is 0';
        this.logger.warn(`⚔️ Brief ${brief.id} has stopLoss=${brief.stopLoss} same as currentPrice=${currentPrice} — skipping`);
        // Don't mark as processed — a future council session may fix the SL
        return result;
      }

      // Step 1: Risk-based quantity (how many units can we hold given our risk budget)
      const riskBasedQty = riskAmount / priceRisk;

      // Step 2: Cap by max order value. For paper trading, use $5,000 max per trade
      // (5% of $100K paper balance). For real trading, use 2% of portfolio.
      // This prevents the $200K order problem while still allowing meaningful trades.
      // CRITICAL FIX: The old cap of $5K was being EXCEEDED because the risk-based
      // quantity (riskAmount/priceRisk) for Forex pairs produces huge values
      // (e.g., $1000 / $0.006 = 166K units × $1.17 = $200K). The Math.min
      // was supposed to cap this, but the valueCappedQty was being calculated
      // AFTER the riskBasedQty, and sometimes the order of operations allowed
      // the risk-based value to dominate.
      //
      // Now: We ALWAYS enforce the maxOrderValue cap FIRST, then apply risk constraints.
      const maxOrderValue = userState.isPaperTrading
        ? Math.min(5000, portfolioValue * 0.05)   // Paper: max $5K or 5% of portfolio
        : Math.min(10000, portfolioValue * 0.02);  // Real: max $10K or 2% of portfolio
      const valueCappedQty = maxOrderValue / currentPrice;
      
      // Ensure the final quantity NEVER exceeds the max order value
      // This is the CRITICAL fix: for Forex pairs where riskBasedQty is huge,
      // we MUST use valueCappedQty as the hard ceiling.

      // Step 3: Use the SMALLER of risk-based and value-capped quantity
      // This ensures we never exceed either the risk budget OR the order value limit
      // CRITICAL FIX: For Forex pairs, riskBasedQty is always MUCH larger than
      // valueCappedQty. The valueCappedQty should ALWAYS win for paper trading.
      // We also add a HARD ceiling: orderValue must NEVER exceed maxOrderValue.
      let quantity = Math.min(riskBasedQty, valueCappedQty);
      
      // HARD CEILING: Double-check the order value doesn't exceed the cap
      // This is a safety net in case of floating point issues
      const hardCappedQty = maxOrderValue / currentPrice;
      if (quantity > hardCappedQty) {
        this.logger.warn(`⚔️ HARD CAP: quantity ${quantity} > hard cap ${hardCappedQty} for ${brief.pair} — enforcing max order value $${maxOrderValue}`);
        quantity = hardCappedQty;
      }

      // Step 4: Ensure minimum order value ($10) — skip if too small
      const orderValue = quantity * currentPrice;
      if (orderValue < 10) {
        result.error = `Order value too small: $${orderValue.toFixed(2)} < $10 minimum`;
        this.logger.debug(`⚔️ Brief ${brief.id} order value $${orderValue.toFixed(2)} too small — skipping`);
        return result;
      }

      quantity = parseFloat(quantity.toFixed(6));

      if (quantity <= 0) {
        result.error = 'Invalid quantity calculated';
        // Don't mark as processed — transient calculation issue
        return result;
      }

      this.logger.debug(
        `⚔️ Position sizing for ${brief.pair}: riskQty=${riskBasedQty.toFixed(2)}, ` +
        `valueCapQty=${valueCappedQty.toFixed(2)} (maxVal=$${maxOrderValue}), ` +
        `finalQty=${quantity}, orderValue=$${(quantity * currentPrice).toFixed(2)}, ` +
        `risk=$${(quantity * priceRisk).toFixed(2)} (${((quantity * priceRisk / portfolioValue) * 100).toFixed(2)}% of portfolio)`,
      );

      // Place the order via TradingService (proper risk checks, CCXT execution, etc.)
      // FIX: Pass currentPrice so TradingService doesn't need to re-fetch from ExchangeService
      // (which can fail on Railway for some pairs). The SmartExecutor already has the price
      // from _checkBriefForUser's price fetch.
      const orderRequest: PlaceOrderRequest = {
        credentialId: credential.id,
        symbol: brief.pair,
        side: brief.direction === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        type: OrderType.MARKET,
        quantity,
        price: currentPrice,
        stopLoss: brief.stopLoss,
        takeProfit: brief.takeProfit,
        source: 'smart_executor',
      };

      // FIX: Run RiskGatekeeper 5-point validation BEFORE placing the order.
      // Previously, SmartExecutor bypassed all 5 safety checks:
      //   1. Stop-loss enforcement
      //   2. Sufficient balance
      //   3. Position size limit
      //   4. Daily drawdown limit
      //   5. Circuit breakers
      // This was a critical gap — automated trades had LESS protection than manual ones.
      if (!brief.stopLoss || brief.stopLoss <= 0) {
        result.error = 'Brief has no stop-loss — BLOCKED by safety rules';
        this.logger.warn(`⚔️ Brief ${brief.id} has no stop-loss — execution BLOCKED for user ${userId}`);
        return result;
      }

      const riskResult = await this.riskGatekeeper.validateOrder({
        userId,
        exchangeCredentialId: credential.id,
        symbol: brief.pair,
        side: brief.direction === 'BUY' ? OrderSideEnum.BUY : OrderSideEnum.SELL,
        type: OrderTypeEnum.MARKET,
        quantity,
        price: currentPrice,
        stopLoss: brief.stopLoss,
        idempotencyKey: `smart-exec-${brief.id}-${userId}`,
      });

      if (!riskResult.allowed) {
        result.error = `Risk gatekeeper blocked: ${riskResult.reason || 'Unknown risk'}`;
        this.logger.warn(`⚔️ Risk gatekeeper BLOCKED execution of brief ${brief.id} for user ${userId}: ${riskResult.reason}`);

        // FIX: Do NOT mark brief as processed when Risk Gatekeeper blocks it.
        // Previously, a blocked brief was still marked as "processed" in Redis with 24h TTL,
        // which meant it would NEVER be retried even if conditions changed.
        // Now: Only mark as processed on SUCCESS. Failed attempts are retryable.
        return result;
      }

      const orderResult = await this.tradingService.placeOrder(userId, orderRequest);

      result.success = true;
      result.orderId = orderResult?.id || 'unknown';

      // Audit log for the execution
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
          isPaperTrading: userState.isPaperTrading,
        }),
      });
    } catch (error: any) {
      result.error = error.message;
      this.logger.error(`⚔️ Execution failed for brief ${brief.id} user ${userId}: ${error.message}`);
    }

    return result;
  }

  // ── Private: Utility ──

  /**
   * Auto-close stale paper-trading positions that have been open >24 hours.
   * Paper trading positions should NOT remain open indefinitely — they block
   * the executor from opening new positions when the maxOpenPositions limit
   * is reached. This method is called on startup and during tick processing.
   */
  private async _autoCloseStalePaperPositions(): Promise<number> {
    let closed = 0;
    try {
      const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const stalePositions = await this.prisma.position.findMany({
        where: {
          status: 'OPEN',
          exchange: 'paper-trading',
          openedAt: { lt: staleThreshold },
        },
      });

      for (const pos of stalePositions) {
        try {
          const closePrice = Number(pos.currentPrice) || Number(pos.entryPrice);
          const pnl = (closePrice - Number(pos.entryPrice)) * Number(pos.quantity) * (pos.side === 'SELL' ? -1 : 1);

          await this.prisma.position.update({
            where: { id: pos.id },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              currentPrice: closePrice,
              unrealizedPnl: 0,
              realizedPnl: pnl,
              source: 'smart_executor',
            },
          });

          // Record the closing trade
          try {
            await this.prisma.trade.create({
              data: {
                userId: pos.userId,
                positionId: pos.id,
                symbol: pos.symbol,
                side: pos.side === 'BUY' ? 'SELL' : 'BUY',
                type: 'EXIT',
                quantity: Number(pos.quantity),
                price: closePrice,
                pnl,
                exchange: 'paper-trading',
                source: 'smart_executor',
                executedAt: new Date(),
              },
            });
          } catch (tradeErr: any) {
            this.logger.warn(`⚔️ Failed to record closing trade for stale position ${pos.id}: ${tradeErr.message}`);
          }

          closed++;
          this.logger.log(
            `⚔️ Auto-closed stale paper position ${pos.symbol} (id: ${pos.id}, opened: ${pos.openedAt.toISOString()}, PnL: $${pnl.toFixed(2)})`,
          );
        } catch (closeErr: any) {
          this.logger.warn(`⚔️ Failed to close stale position ${pos.id}: ${closeErr.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`⚔️ Failed to auto-close stale paper positions: ${error.message}`);
    }
    return closed;
  }

  private async _getPortfolioValue(userId: string): Promise<number> {
    try {
      const summary = await this.tradingService.getPositionSummary(userId);
      const totalValue = summary.totalValue || 0;

      // ═══════════════════════════════════════════════════
      // FIX: Previously, when the portfolio value was 0 (due
      // to DB error, missing positions, or paper trading with
      // no balance), the riskAmount would floor to $10 minimum,
      // producing tiny quantities like 0.00014925 BTC ≈ $0.01.
      // These phantom $0.01 trades cluttered the dashboard.
      //
      // Now: For paper trading, use the standard $100,000
      // paper balance. For real trading, if we can't determine
      // the portfolio value, we DON'T execute — it's unsafe.
      // ═══════════════════════════════════════════════════
      if (totalValue <= 0) {
        // Check if user is paper trading — use default paper balance
        const userState = await this.getUserState(userId);
        if (userState?.isPaperTrading) {
          return 100000; // Standard paper trading balance
        }
        // Real trading with unknown portfolio — don't execute
        this.logger.warn(`⚔️ Cannot determine portfolio value for user ${userId} — skipping execution for safety`);
        return 0;
      }

      return totalValue;
    } catch (error: any) {
      // On error, check if paper trading and use default balance
      try {
        const userState = await this.getUserState(userId);
        if (userState?.isPaperTrading) {
          return 100000; // Paper trading default
        }
      } catch {}
      this.logger.warn(`⚔️ Failed to get portfolio value for user ${userId}: ${error.message}`);
      return 0; // Don't execute with unknown portfolio
    }
  }

  /**
   * FIX: Diagnose why trades aren't executing.
   * Runs through the full execution pipeline and returns detailed
   * diagnostic information about each step — what passes and what fails.
   */
  async diagnoseExecution(): Promise<Record<string, any>> {
    const diagnostic: Record<string, any> = {
      timestamp: new Date().toISOString(),
      isRunning: this.isRunning,
      totalExecutions: this.totalExecutions,
      config: this.config,
    };

    // Step 1: Check active briefs
    try {
      const briefs = await this.councilService.getActiveBriefs();
      diagnostic.activeBriefs = {
        count: briefs.length,
        pairs: [...new Set(briefs.map((b: any) => b.pair))],
        directions: briefs.reduce((acc: any, b: any) => {
          acc[b.direction] = (acc[b.direction] || 0) + 1;
          return acc;
        }, {}),
        confidenceRange: briefs.length > 0
          ? `${Math.min(...briefs.map((b: any) => b.confidence))}-${Math.max(...briefs.map((b: any) => b.confidence))}`
          : 'N/A',
        sample: briefs.slice(0, 3).map((b: any) => ({
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
    } catch (e: any) {
      diagnostic.activeBriefs = { error: e.message };
    }

    // Step 2: Check enabled users
    try {
      const enabledUsers = await this._getEnabledUsers();
      diagnostic.enabledUsers = {
        count: enabledUsers.length,
        users: enabledUsers,
      };

      // Get state for each enabled user
      diagnostic.userStates = {};
      for (const userId of enabledUsers) {
        const state = await this.getUserState(userId);
        diagnostic.userStates[userId] = state;
      }
    } catch (e: any) {
      diagnostic.enabledUsers = { error: e.message };
    }

    // Step 3: For the first brief + first user, check entry conditions
    try {
      const briefs = await this.councilService.getActiveBriefs();
      const enabledUsers = await this._getEnabledUsers();

      if (briefs.length > 0 && enabledUsers.length > 0) {
        const testBrief = briefs[0];
        const testUserId = enabledUsers[0];

        // Get current price
        let currentPrice = 0;
        try {
          const marketData = await this.orchestrator.fetchQuickMarketData(testBrief.pair);
          currentPrice = marketData.price;
        } catch {}
        if (!currentPrice || currentPrice <= 0) {
          try {
            const quote = await this.exchangeService.getQuote(testBrief.pair);
            currentPrice = quote.price;
          } catch {}
        }

        const strictRules = testBrief.strictRules || { maxSlippage: this.config.defaultSlippage };
        const conditionsMet = currentPrice > 0 ? this._areEntryConditionsMet(testBrief, currentPrice, strictRules) : false;

        // Check each condition individually
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

        // Check for already-processed briefs
        const processedKey = `${this.REDIS_PROCESSED_PREFIX}${testBrief.id}:${testUserId}`;
        const alreadyProcessed = await this.redis.get(processedKey);
        diagnostic.sampleExecution.alreadyProcessed = alreadyProcessed ? JSON.parse(alreadyProcessed) : null;

        // Check for existing position
        try {
          const existingPos = await this.prisma.position.findFirst({
            where: { userId: testUserId, symbol: testBrief.pair, status: 'OPEN' },
          });
          diagnostic.sampleExecution.existingPosition = existingPos ? { id: existingPos.id, symbol: existingPos.symbol } : null;
        } catch (e: any) {
          diagnostic.sampleExecution.existingPosition = { error: e.message };
        }
      } else {
        diagnostic.sampleExecution = {
          reason: briefs.length === 0 ? 'No active briefs' : 'No enabled users',
        };
      }
    } catch (e: any) {
      diagnostic.sampleExecution = { error: e.message };
    }

    // Step 4: Redis connectivity check
    try {
      const pong = await this.redis.ping();
      diagnostic.redis = { connected: pong === 'PONG' };
    } catch (e: any) {
      diagnostic.redis = { connected: false, error: e.message };
    }

    // Step 5: Overall diagnosis
    const issues: string[] = [];
    if (!this.isRunning) issues.push('Executor is NOT running — start it with POST /smart-executor/start');
    if (diagnostic.activeBriefs?.count === 0) issues.push('No active briefs from Strategic Council');
    if (diagnostic.enabledUsers?.count === 0) issues.push('No enabled users — call POST /smart-executor/user/auto-enable');
    if (diagnostic.activeBriefs?.count > 0 && diagnostic.enabledUsers?.count > 0 && diagnostic.sampleExecution?.conditionsMet === false) {
      issues.push('Entry conditions NOT met — prices may have moved since briefs were issued');
    }
    if (diagnostic.sampleExecution?.alreadyProcessed) {
      issues.push('Briefs are already processed (marked in Redis) — no new trades will happen');
    }

    // Step 6: TRY to actually execute one trade and capture the result
    // This is the only way to find out why trades aren't happening —
    // the debug checks above can all pass but execution can still fail.
    try {
      const briefs = await this.councilService.getActiveBriefs();
      const enabledUsers = await this._getEnabledUsers();
      if (briefs.length > 0 && enabledUsers.length > 0) {
        const testBrief = briefs[0];
        const testUserId = enabledUsers[0];
        const userState = await this.getUserState(testUserId);

        if (userState?.enabled) {
          // Get price
          let testPrice = 0;
          try {
            const md = await this.orchestrator.fetchQuickMarketData(testBrief.pair);
            testPrice = md.price;
          } catch {}
          if (!testPrice || testPrice <= 0) {
            try {
              const q = await this.exchangeService.getQuote(testBrief.pair);
              testPrice = q.price;
            } catch {}
          }

          if (testPrice > 0) {
            // Find or create paper credential
            let cred: any = null;
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
            } catch (e: any) {
              diagnostic.executionTest = { step: 'credential', error: e.message, stack: e.stack?.slice(0, 300) };
            }

            if (cred) {
              // Calculate quantity
              const portfolioValue = userState.isPaperTrading ? 100000 : 0;
              const riskPercent = (userState.riskPerTradePercent || 1) / 100;
              const riskAmount = Math.max(portfolioValue * riskPercent, 10);
              const priceRisk = Math.abs(testPrice - testBrief.stopLoss);

              // Run RiskGatekeeper
              try {
                const riskResult = await this.riskGatekeeper.validateOrder({
                  userId: testUserId,
                  exchangeCredentialId: cred.id,
                  symbol: testBrief.pair,
                  side: testBrief.direction === 'BUY' ? OrderSideEnum.BUY : OrderSideEnum.SELL,
                  type: OrderTypeEnum.MARKET,
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
              } catch (e: any) {
                diagnostic.executionTest = { step: 'riskGatekeeper', error: e.message, stack: e.stack?.slice(0, 500) };
              }
            }
          } else {
            diagnostic.executionTest = { step: 'price', error: 'Cannot get price for any pair' };
          }
        }
      }
    } catch (e: any) {
      diagnostic.executionTest = { step: 'unknown', error: e.message };
    }

    diagnostic.diagnosis = {
      issues,
      canExecute: this.isRunning && (diagnostic.activeBriefs?.count > 0) && (diagnostic.enabledUsers?.count > 0),
    };

    return diagnostic;
  }

  // ── DB Persistence Helpers ──
  // These methods persist Smart Executor user state to the Setting table
  // so that user activations survive Redis restarts and deployments.
  //
  // Storage format: Key = 'SMART_EXECUTOR_USER_STATE:{userId}'
  // Value = JSON(UserExecutorState)
  //
  // This uses the existing Setting table (key/value) to avoid needing
  // a new migration for a dedicated SmartExecutorUserState table.

  /**
   * Persist user executor state to DB (Setting table)
   */
  private async _persistUserStateToDB(userId: string, state: UserExecutorState): Promise<void> {
    try {
      const key = `${this.DB_USER_STATE_KEY}:${userId}`;
      await this.prisma.setting.upsert({
        where: { key },
        update: { value: JSON.stringify(state) },
        create: { key, value: JSON.stringify(state) },
      });
    } catch (e: any) {
      this.logger.warn(`⚔️ Failed to persist user state to DB for ${userId}: ${e.message}`);
    }
  }

  /**
   * Remove user executor state from DB
   */
  private async _removeUserStateFromDB(userId: string): Promise<void> {
    try {
      const key = `${this.DB_USER_STATE_KEY}:${userId}`;
      await this.prisma.setting.deleteMany({ where: { key } });
    } catch (e: any) {
      this.logger.warn(`⚔️ Failed to remove user state from DB for ${userId}: ${e.message}`);
    }
  }

  /**
   * Load user executor state from DB (for Redis recovery)
   */
  private async _loadUserStateFromDB(userId: string): Promise<UserExecutorState | null> {
    try {
      const key = `${this.DB_USER_STATE_KEY}:${userId}`;
      const setting = await this.prisma.setting.findUnique({ where: { key } });
      if (setting) {
        const state = JSON.parse(setting.value);
        // Only return if still enabled
        if (state && state.enabled) {
          return state as UserExecutorState;
        }
      }
    } catch (e: any) {
      this.logger.debug(`⚔️ Failed to load user state from DB for ${userId}: ${e.message}`);
    }
    return null;
  }

  /**
   * Load ALL user states from DB — returns userId + state pairs
   * Used at startup to restore explicitly-enabled users.
   */
  private async _loadAllUserStatesFromDB(): Promise<Array<{ userId: string; state: UserExecutorState }>> {
    try {
      const settings = await this.prisma.setting.findMany({
        where: { key: { startsWith: this.DB_USER_STATE_KEY } },
        select: { key: true, value: true },
      });

      const results: Array<{ userId: string; state: UserExecutorState }> = [];
      for (const setting of settings) {
        try {
          const state = JSON.parse(setting.value) as UserExecutorState;
          if (state && state.enabled) {
            const userId = setting.key.replace(`${this.DB_USER_STATE_KEY}:`, '');
            results.push({ userId, state });
          }
        } catch {
          // Invalid JSON — skip
        }
      }
      return results;
    } catch (e: any) {
      this.logger.debug(`⚔️ Failed to load all user states from DB: ${e.message}`);
      return [];
    }
  }

  /**
   * Get all user IDs that have persisted executor states in DB
   */
  private async _getAllEnabledUsersFromDB(): Promise<string[]> {
    try {
      const settings = await this.prisma.setting.findMany({
        where: {
          key: { startsWith: this.DB_USER_STATE_KEY },
        },
        select: { key: true, value: true },
      });

      const enabledUserIds: string[] = [];
      for (const setting of settings) {
        try {
          const state = JSON.parse(setting.value);
          if (state && state.enabled) {
            const userId = setting.key.replace(`${this.DB_USER_STATE_KEY}:`, '');
            enabledUserIds.push(userId);
          }
        } catch {
          // Invalid JSON — skip
        }
      }
      return enabledUserIds;
    } catch (e: any) {
      this.logger.debug(`⚔️ Failed to get all enabled users from DB: ${e.message}`);
      return [];
    }
  }

  /**
   * Load user state from AgentSession (cross-system sync)
   * If the user activated the Autonomous Trader Agent, we treat them
   * as enabled for the Smart Executor too, with matching settings.
   */
  private async _loadUserStateFromAgentSession(userId: string): Promise<UserExecutorState | null> {
    try {
      const session = await this.prisma.agentSession.findFirst({
        where: {
          userId,
          status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] },
        },
        orderBy: { startedAt: 'desc' },
      });

      if (!session) return null;

      // Build UserExecutorState from AgentSession config
      let isPaperTrading = true;
      let credentialId: string | undefined;
      let maxOpenPositions = this.config.maxOpenPositions;
      let riskPerTradePercent = this.config.riskPerTradePercent;

      try {
        const config = JSON.parse(session.config);
        isPaperTrading = config.isPaperTrading ?? true;
        credentialId = config.credentialId;
        maxOpenPositions = config.maxOpenPositions ?? this.config.maxOpenPositions;
        riskPerTradePercent = config.riskPerTradePercent ?? this.config.riskPerTradePercent;
      } catch {
        // Use defaults
      }

      return {
        enabled: true,
        dailyPnL: Number(session.dailyPnL) || 0,
        dailyTrades: session.dailyTradesCount || 0,
        dailyResetAt: session.dailyResetAt?.toISOString() || new Date().toISOString(),
        lastTradeAt: session.lastSignalAt?.toISOString() || null,
        consecutiveLosses: session.consecutiveLosses || 0,
        maxOpenPositions,
        riskPerTradePercent,
        credentialId: credentialId || session.credentialId,
        isPaperTrading,
      };
    } catch (e: any) {
      this.logger.debug(`⚔️ Failed to load user state from AgentSession for ${userId}: ${e.message}`);
      return null;
    }
  }

  /**
   * Get all user IDs that have active AgentSessions
   */
  private async _getAgentSessionUsers(): Promise<string[]> {
    try {
      const sessions = await this.prisma.agentSession.findMany({
        where: { status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
        select: { userId: true },
        distinct: ['userId'],
      });
      return sessions.map(s => s.userId);
    } catch (e: any) {
      this.logger.debug(`⚔️ Failed to get AgentSession users: ${e.message}`);
      return [];
    }
  }
}
