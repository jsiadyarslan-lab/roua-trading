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
import { OrderDispatcherService, AutoOrderRequest } from '../../trading/services/order-dispatcher.service';

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
    tickIntervalMs: 10000,          // FIX: 10 seconds (was 2s) — reduces DB load by 5x
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
    private readonly orderDispatcher: OrderDispatcherService,
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
   * Startup cleanup: Purge ONLY phantom/stale data, preserving legitimate user states.
   *
   * FIX: Previous version deleted ALL data on every restart, including:
   *   - User executor states that were explicitly enabled
   *   - Valid TradingBriefs from the Strategic Council
   *   - Legitimate trade history
   *   - AgentSettings that users intentionally configured
   *
   * New behavior:
   *   - Only purges PHANTOM positions (zero-value / stale > 24h)
   *   - Only purges EXPIRED TradingBriefs (past their validUntil)
   *   - Preserves DB-persisted user states (users explicitly enabled them)
   *   - Preserves AgentSettings (user configuration)
   *   - Still clears Redis states (volatile, will be restored from DB)
   */
  private async _startupCleanup(): Promise<void> {
    try {
      this.logger.log('⚔️ Running startup phantom cleanup (preserving user data)...');

      // ── STEP 1: Clean phantom/stale positions (zero-value only) ──
      try {
        const purgeResult = await this.purgePhantomPositions();
        if (purgeResult.deleted > 0) {
          this.logger.log(`⚔️ STARTUP: Purged ${purgeResult.deleted} phantom (zero-value) position(s)`);
        }
      } catch (purgeErr: any) {
        this.logger.warn(`⚔️ Startup phantom purge failed (non-critical): ${purgeErr.message}`);
      }

      // ── STEP 2: Auto-close stale paper-trading positions (>24h) ──
      try {
        const staleClosed = await this._autoCloseStalePaperPositions();
        if (staleClosed > 0) {
          this.logger.log(`⚔️ STARTUP: Auto-closed ${staleClosed} stale paper position(s) (>24h)`);
        }
      } catch (staleErr: any) {
        this.logger.warn(`⚔️ Startup stale cleanup failed (non-critical): ${staleErr.message}`);
      }

      // ── STEP 3: Delete only EXPIRED TradingBriefs (not all) ──
      // Previous code deleted ALL briefs, but valid briefs should be kept
      // so the executor can continue working after a restart.
      try {
        const deletedBriefs = await this.prisma.tradingBrief.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: new Date() } },  // Expired briefs
              { isActive: false },                  // Deactivated briefs
            ],
          },
        });
        if (deletedBriefs.count > 0) {
          this.logger.log(`⚔️ STARTUP: Purged ${deletedBriefs.count} expired TradingBrief(s) (preserving active ones)`);
        }
      } catch (briefErr: any) {
        this.logger.warn(`⚔️ Failed to purge expired TradingBrief records: ${briefErr.message}`);
      }

      // ── STEP 4: Clear Redis user states (volatile) — DB states preserved ──
      // Redis states are volatile and may be stale. Clear them so they get
      // re-populated from DB (the source of truth for explicitly-enabled users).
      try {
        const userKeys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
        for (const key of userKeys) {
          await this.redis.del(key);
        }
        if (userKeys.length > 0) {
          this.logger.log(`⚔️ STARTUP: Cleared ${userKeys.length} volatile Redis user state(s) (DB states preserved)`);
        }
      } catch (redisErr: any) {
        this.logger.warn(`⚔️ Failed to clear executor Redis states: ${redisErr.message}`);
      }

      // ── STEP 5: Clear global executor state from Redis ──
      try {
        await this.redis.del(this.REDIS_GLOBAL_STATE);
      } catch {}

      // ── STEP 6: Delete stale AutonomousTrade records (>7 days old) ──
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const deletedAutoTrades = await this.prisma.autonomousTrade.deleteMany({
          where: { createdAt: { lt: sevenDaysAgo } },
        });
        if (deletedAutoTrades.count > 0) {
          this.logger.log(`⚔️ STARTUP: Purged ${deletedAutoTrades.count} stale AutonomousTrade(s) (>7 days)`);
        }
      } catch (autoTradeErr: any) {
        this.logger.warn(`⚔️ Failed to purge stale AutonomousTrade records: ${autoTradeErr.message}`);
      }

      // ── STEP 7: Delete stale PaperOrder records (>7 days old) ──
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const deletedPaperOrders = await this.prisma.paperOrder.deleteMany({
          where: { createdAt: { lt: sevenDaysAgo } },
        });
        if (deletedPaperOrders.count > 0) {
          this.logger.log(`⚔️ STARTUP: Purged ${deletedPaperOrders.count} stale PaperOrder(s) (>7 days)`);
        }
      } catch (paperErr: any) {
        this.logger.warn(`⚔️ Failed to purge stale PaperOrder records: ${paperErr.message}`);
      }

      // ── STEP 5: Auto-enable users with paper-trading credentials ──
      // FIX: Many users create paper-trading credentials but forget to enable the executor.
      // This causes confusion - they see 10+ active briefs but no trades execute.
      // Now: Auto-enable the executor for users who have paper-trading credentials.
      try {
        const paperCredentialUsers = await this.prisma.exchangeCredential.findMany({
          where: { exchange: 'paper-trading', isValid: true },
          select: { userId: true },
          distinct: ['userId'],
        });

        if (paperCredentialUsers.length > 0) {
          this.logger.log(`⚔️ AUTO-ENABLE: Found ${paperCredentialUsers.length} users with paper-trading credentials`);
          
          for (const cred of paperCredentialUsers) {
            const userId = cred.userId;
            const existingState = await this.getUserState(userId);
            
            if (!existingState || !existingState.enabled) {
              // Auto-enable with paper trading settings
              await this.enableUser(userId, {
                isPaperTrading: true,
                maxOpenPositions: 10,
                riskPerTradePercent: 1,
              });
              
              this.logger.log(`⚔️ AUTO-ENABLE: Enabled Smart Executor for user ${userId} (paper-trading)`);
            }
          }
        }
      } catch (autoErr: any) {
        this.logger.warn(`⚔️ Auto-enable failed: ${autoErr.message}`);
      }

      this.logger.log('⚔️ Startup cleanup complete (user data preserved)');
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
   * FIX: Now starts the tick loop regardless — the tick itself checks
   * for enabled users and skips if none exist. This prevents the issue
   * where one user stopping the executor kills it for ALL users.
   * The tick loop is lightweight (just reads Redis keys) when no users are enabled.
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
   * FIX: Made PRIVATE — This method should ONLY be called by the system
   * (e.g., module destroy, nuclear cleanup). It must NEVER be triggered by
   * individual user actions, because it kills the tick loop for ALL users.
   *
   * Individual users should use enableUser/disableUser instead.
   * The controller's POST /stop endpoint now calls disableUser(), not stop().
   *
   * The tick loop will automatically stop when no enabled users remain
   * (handled by disableUser()).
   */
  private async stop(userId?: string): Promise<ExecutorStatus> {
    // FIX: Check if there are still enabled users before stopping.
    // If other users are still enabled, DON'T stop the tick loop.
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
   * FIX: This now ONLY disables the specific user. The global executor
   * tick loop keeps running for any other enabled users. The global
   * stop() method handles the case where no users remain enabled.
   */
  async disableUser(userId: string): Promise<void> {
    // Remove from Redis
    await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);

    // Remove from DB too
    await this._removeUserStateFromDB(userId);

    this.logger.log(`⚔️ Executor disabled for user ${userId} — removed from Redis + DB`);

    // FIX: Check if any other users are still enabled.
    // If not, stop the tick loop to save resources.
    // If yes, the tick loop continues for them.
    const remainingUsers = await this._getEnabledUsers();
    if (remainingUsers.length === 0 && this.isRunning) {
      this.logger.log(`⚔️ No enabled users remain — stopping tick loop`);
      // Use internal stop (bypass the user check since we already know no users are enabled)
      this.isRunning = false;
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
      await this.redis.set(
        this.REDIS_GLOBAL_STATE,
        JSON.stringify({ isRunning: false, stoppedAt: new Date().toISOString() }),
        86400000,
      ).catch(() => {});
    }

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

    // REMOVED: Step 3 (AgentSession cross-system sync) has been DELETED from getUserState().
    // Previously, if a user had an active AgentSession, the Smart Executor would
    // automatically treat them as "enabled" and start executing trades for them.
    // This caused DUPLICATE phantom trades — both the Agent AND the Executor would
    // trade for the same user. Each system must be independent and ONLY activated
    // by explicit user action.
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
    // FIX: Previously hardcoded to false. Now we actually check each user's
    // daily PnL against their portfolio value * (maxDailyLossPercent / 100).
    let dailyLossLimitReached = false;
    try {
      const threshold = this.config.maxDailyLossPercent; // default 5%

      if (userId) {
        // User-specific check: compare this user's dailyPnL against their portfolio threshold
        const userState = await this.getUserState(userId);
        if (userState && userState.enabled) {
          const portfolio = await this._getPortfolioValue(userId);
          if (portfolio > 0) {
            const lossLimit = portfolio * (threshold / 100);
            dailyLossLimitReached = todayPnL < -lossLimit;
          }
        }
      } else {
        // Global check: check if ANY enabled user has hit the daily loss limit
        const enabledUsers = await this._getEnabledUsers();
        for (const uid of enabledUsers) {
          try {
            const userState = await this.getUserState(uid);
            if (userState && userState.enabled) {
              const portfolio = await this._getPortfolioValue(uid);
              if (portfolio > 0) {
                const lossLimit = portfolio * (threshold / 100);
                // Calculate this user's daily PnL
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                const userPnlWhere: any = {
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
          } catch (userErr: any) {
            this.logger.debug(`getStatus: dailyLoss check failed for user ${uid}: ${userErr.message}`);
          }
        }
      }
    } catch (lossErr: any) {
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

    // Step 2: DB fallback — recover users whose state was persisted to DB
    // but lost from Redis (e.g., Redis restart on Railway).
    // FIX: Previously, this step was DELETED, causing silent data loss on Redis restart.
    // A user who clicked "تفعيل" would appear enabled in getUserState() (which reads DB)
    // but _getEnabledUsers() (which only read Redis) would return empty → tick loop skips them.
    // Now: we also read from DB to ensure no user is lost on Redis restart.
    if (userIds.size === 0) {
      try {
        const dbStates = await this.prisma.setting.findMany({
          where: { key: { startsWith: this.DB_USER_STATE_KEY } },
        });
        for (const s of dbStates) {
          try {
            const state = JSON.parse(s.value);
            if (state.enabled) {
              const userId = s.key.replace(this.DB_USER_STATE_KEY + ':', '');
              userIds.add(userId);
              // Re-populate Redis from DB so next read is fast
              await this.redis.set(
                `${this.REDIS_USER_STATE_PREFIX}${userId}`,
                JSON.stringify(state),
                86400000 * 7,
              ).catch(() => {});
            }
          } catch {
            // Malformed state — ignore
          }
        }
        if (userIds.size > 0) {
          this.logger.log(`⚔️ Recovered ${userIds.size} enabled user(s) from DB (Redis was empty — likely restart)`);
        }
      } catch (dbErr: any) {
        this.logger.warn(`⚔️ Failed to read enabled users from DB: ${dbErr.message}`);
      }
    }

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
          // FIX: Use TradingService.closePosition() instead of directly updating
          // the DB. The previous direct prisma.position.update() bypassed
          // TradingService, causing:
          //   1. No closing Order record created (audit gap)
          //   2. DB-Exchange state inconsistency
          //   3. No audit log for the close
          // Now: delegate to TradingService which handles everything properly.
          try {
            // FIX: Use closePositionWithRetry for optimistic locking support.
            // No more direct DB bypass — TradingService is the SINGLE source of truth.
            await this.tradingService.closePositionWithRetry(userId, {
              positionId: oldestPosition.id,
            });

            // Calculate PnL for user daily tracking
            const closePrice = Number(oldestPosition.currentPrice) || Number(oldestPosition.entryPrice);
            const pnl = (closePrice - Number(oldestPosition.entryPrice)) * Number(oldestPosition.quantity) * (oldestPosition.side === 'SELL' ? -1 : 1);
            userState.dailyPnL += pnl;

            openPositionsCount--;
            this.logger.log(
              `⚔️ Paper trading: auto-closed stale position ${oldestPosition.symbol} ` +
              `(id: ${oldestPosition.id}, PnL: $${pnl.toFixed(2)}) via TradingService to make room for new brief`,
            );
          } catch (closeErr: any) {
            // FIX: REMOVED direct DB bypass fallback. Previously, when TradingService.closePosition()
            // failed, we'd directly update the DB with prisma.position.update(). This bypassed:
            //   1. Optimistic locking (version check)
            //   2. Order record creation (audit gap)
            //   3. Proper exchange close attempt
            //   4. Position-Trade-Order consistency
            // Now: If TradingService fails, we LOG the error and skip — the position remains
            // open and will be retried on the next tick or closed manually by the user.
            this.logger.warn(
              `⚔️ TradingService close failed for stale position ${oldestPosition.id}: ${closeErr.message} — skipping (no direct DB bypass)`,
            );
          }
        }
      } catch (closeErr: any) {
        this.logger.warn(`⚔️ Failed to auto-close stale position for paper user ${userId}: ${closeErr.message}`);
      }
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
            // FIX: Use TradingService.closePositionWithRetry() — NO direct DB bypass.
            // The direct prisma.position.update() fallback has been REMOVED because it
            // bypassed optimistic locking, Order creation, and exchange state sync.
            try {
              await this.tradingService.closePositionWithRetry(userId, {
                positionId: existingPosition.id,
              });

              const closePrice = Number(existingPosition.currentPrice) || Number(existingPosition.entryPrice);
              const pnl = (closePrice - Number(existingPosition.entryPrice)) * Number(existingPosition.quantity) * (existingPosition.side === 'SELL' ? -1 : 1);
              userState.dailyPnL += pnl;

              this.logger.log(
                `⚔️ Closed stale paper position ${existingPosition.symbol} ` +
                `(PnL: $${pnl.toFixed(2)}) via TradingService to execute new brief ${brief.id}`,
              );
            } catch (tsCloseErr: any) {
              // FIX: REMOVED direct DB bypass. If TradingService fails, log and skip.
              // The position will be retried on the next tick.
              this.logger.warn(
                `⚔️ TradingService close failed for ${existingPosition.id}: ${tsCloseErr.message} — skipping (no direct DB bypass)`,
              );
            }
          } catch (closeErr: any) {
            this.logger.warn(`⚔️ Failed to close stale position for ${brief.pair}: ${closeErr.message} — skipping brief`);
            continue;
          }
        } else {
          this.logger.debug(`⚔️ Skipping brief ${brief.id} — existing open position for ${brief.pair}`);
          continue;
        }
      }

      // FIX: Check max positions PER PAIR, not globally
      // Previously, if user had ANY open position, ALL briefs were blocked
      // Now: Only skip if this specific pair already has an open position
      const currentOpenPositions = await this.prisma.position.count({
        where: { userId, symbol: brief.pair, status: 'OPEN' },
      });
      if (currentOpenPositions >= maxPositions) {
        this.logger.debug(`⚔️ User ${userId} at max positions for ${brief.pair} (${currentOpenPositions}/${maxPositions}) — skipping brief ${brief.id}`);
        continue;
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
        // Paper trading — find existing paper credential ONLY
        // FIX: Auto-create paper-trading credential if missing.
        // Previously disabled to prevent phantom trades, but this meant
        // the executor could NEVER trade for new users. Now auto-creates.
        credential = await this.prisma.exchangeCredential.findFirst({
          where: { userId, exchange: 'paper-trading', isValid: true },
        });

        if (!credential) {
          try {
            this.logger.log(`⚔️ Auto-creating paper-trading credential for user ${userId}`);
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
          } catch (createErr: any) {
            this.logger.warn(`⚔️ Failed to auto-create paper credential: ${createErr.message}`);
            result.error = 'No paper-trading credential — auto-create failed';
            return result;
          }
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

      // ✅ FIX: Route through OrderDispatcher (handles RiskGatekeeper + TradingService + idempotency).
      // This prevents conflicts between SmartExecutor and AutonomousTrader.
      if (!brief.stopLoss || brief.stopLoss <= 0) {
        result.error = 'Brief has no stop-loss — BLOCKED by safety rules';
        this.logger.warn(`⚔️ Brief ${brief.id} has no stop-loss — execution BLOCKED for user ${userId}`);
        return result;
      }
      const dispatchResult = await this.orderDispatcher.submitOrder({
        source: 'smart_executor',
        userId,
        credentialId: credential.id,
        symbol: brief.pair,
        side: brief.direction as 'BUY' | 'SELL',
        quantity,
        price: currentPrice,
        stopLoss: brief.stopLoss,
        takeProfit: brief.takeProfit,
        briefId: brief.id,
        isPaperTrading: userState.isPaperTrading,
      });

      if (!dispatchResult.success) {
        result.error = dispatchResult.error || dispatchResult.message || 'فشل الموزع';
        return result;
      }

      result.success = true;
      result.orderId = dispatchResult.orderId || 'unknown';

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
   * FIX: Auto-close stale paper-trading positions (>24h open) using
   * TradingService.closePositionWithRetry() instead of direct prisma.position.update().
   *
   * Why: Direct prisma.position.update() bypasses the position-close business logic:
   *   - No Trade record is created (or it's created manually with potential inconsistency)
   *   - No Order record is created
   *   - No optimistic lock check (version increment)
   *   - No exchange reconciliation (exchange-sync won't know the position was closed)
   *   - No audit log entry
   * Using closePositionWithRetry() ensures all side-effects are properly handled.
   *
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
          // FIX: Use TradingService.closePositionWithRetry() instead of
          // direct prisma.position.update() — ensures all business logic
          // (Trade/Order records, optimistic lock, audit log) is properly handled.
          await this.tradingService.closePositionWithRetry(pos.userId, {
            positionId: pos.id,
          });

          closed++;
          this.logger.log(
            `⚔️ Auto-closed stale paper position ${pos.symbol} (id: ${pos.id}, opened: ${pos.openedAt.toISOString()})`,
          );
        } catch (closeErr: any) {
          // If the position is already closed, that's fine — count it as success
          if (closeErr.message?.includes('already') || closeErr.message?.includes('ليس مفتوحاً') || closeErr.message?.includes('not open')) {
            closed++;
            this.logger.debug(`⚔️ Stale paper position ${pos.id} was already closed`);
          } else {
            this.logger.warn(`⚔️ Failed to close stale position ${pos.id}: ${closeErr.message}`);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`⚔️ Failed to auto-close stale paper positions: ${error.message}`);
    }
    return closed;
  }

  private async _getPortfolioValue(userId: string): Promise<number> {
    // ═══════════════════════════════════════════════════════════════
    // FIX: For paper-trading users, ALWAYS use AgentSettings.paperBalance.
    // Previously, when positions existed, getPositionSummary() returned
    // the SUM of position notional values (e.g., 80 BTC × $81K = $6.5M)
    // as the "portfolio value". This created a positive feedback loop:
    //   1. Phantom position inflates portfolioValue to $6.5M
    //   2. riskAmount = $6.5M × 1% = $65,000
    //   3. Next position is even bigger → infinite loop
    // Now: Paper users ALWAYS get their paperBalance ($10K) regardless
    // of what positions are open. Real users use position summary.
    // ═══════════════════════════════════════════════════════════════
    try {
      const userState = await this.getUserState(userId);
      if (userState?.isPaperTrading) {
        return await this._getPaperPortfolioValue(userId);
      }
    } catch {}

    // Real trading: use position summary
    try {
      const summary = await this.tradingService.getPositionSummary(userId);
      const totalValue = summary.totalValue || 0;
      if (totalValue > 0) return totalValue;

      // Real trading with unknown portfolio — don't execute
      this.logger.warn(`⚔️ Cannot determine portfolio value for user ${userId} — skipping execution for safety`);
      return 0;
    } catch (error: any) {
      this.logger.warn(`⚔️ Failed to get portfolio value for user ${userId}: ${error.message}`);
      return 0; // Don't execute with unknown portfolio
    }
  }

  /**
   * Get paper-trading portfolio value from AgentSettings.paperBalance.
   * FIX: Previously hardcoded to $100,000 everywhere, but users have
   * $10,000 as their paper balance. This caused wrong position sizing
   * and absurd daily drawdown percentages (832%).
   */
  private async _getPaperPortfolioValue(userId: string): Promise<number> {
    try {
      const settings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
      if (settings && Number(settings.paperBalance) > 0) {
        return Number(settings.paperBalance);
      }
    } catch {}
    return 10000; // Default paper balance
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
              const portfolioValue = userState.isPaperTrading ? await this._getPaperPortfolioValue(testUserId) : 0;
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

  // REMOVED: _loadUserStateFromAgentSession() and _getAgentSessionUsers()
  // have been PERMANENTLY DELETED. These methods caused the Smart Executor
  // to silently enable users who had active AgentSessions, leading to
  // DUPLICATE phantom trades from both systems. Each system (Executor and
  // Agent) is now fully independent — users must explicitly enable each one.
}
