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
//
// V137: PER-USER ISOLATION ARCHITECTURE
// ══════════════════════════════════════════════
// كل مستخدم له سياق تداول مستقل تماماً:
//   - حالة المنفذ:   Redis `smart-executor:user:{userId}` (معزول)
//   - بيانات الاعتماد: DB `ExchangeCredential` (لكل مستخدم، مع فحص userId)
//   - المراكز:       DB `Position` (مفلترة بـ userId)
//   - حدود المخاطر:  لكل مستخدم حد يومي وعدد مراكز خاص به
//   - Circuit breaker: Redis `circuit-breaker:v2:{userId}:{symbol}` (إصلاح V137)
//
// مكونات مشتركة (تعمل لكل المستخدمين):
//   - المجلس الاستراتيجي → يُنشئ إشارات/توصيات عالمية
//   - مجلس AI → يُنشئ تحليلات AI عالمية
//   - الإشارات → إشارات سوق مشتركة
//   - السكانر → يفحص السوق لكل المستخدمين
// ══════════════════════════════════════════════
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AuditService } from '../../../audit/audit.service';
import { TradingService } from '../../trading/trading.service';
import { StrategicCouncilService } from '../strategic-council/strategic-council.service';
import { TradingBriefDTO, StrictRules, EXECUTOR_TIMEFRAMES, isExecutorTimeframe, isSymbolSupportedByExchange } from '../strategic-council/strategic-council.types';
import { ExecutorStatus, ExecutionResult, ExecutorConfig, UserExecutorState } from './smart-executor.types';
import { PlaceOrderRequest, OrderSide, OrderType } from '../../trading/trading.types';
import { RiskGatekeeperService } from '../../trading/services/risk-gatekeeper.service';
import { AIOrchestratorService } from '../services/ai-orchestrator.service';
import { OrderSideEnum, OrderTypeEnum } from '../../trading/events/order.events';
import { NotificationService } from '../../notification/notification.service';
import { OrderDispatcherService, AutoOrderRequest } from '../../trading/services/order-dispatcher.service';
import { ExposureManagerService } from '../../trading/services/exposure-manager.service';
import { NewsService } from '../../news/news.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import {
  getSymbolMetadata,
  calculatePositionSizeFromRisk,
  lotsToUnits,
  unitsToLots,
  roundLotSize,
  calculateMargin,
  calculateNotionalValue,
  AssetClass,
} from '../../trading/services/symbol-metadata';

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
    maxOpenPositions: 5,            // Safe default for real accounts. Paper/testnet can increase via settings.
    maxDailyLossPercent: 5,
    defaultSlippage: 0.005,         // 0.5% — FIX: Increased from 0.1% to 0.5%
    riskPerTradePercent: 1,
    minConfidence: 65,              // SAFE DEFAULT for real accounts: 65% minimum confidence.
                                    // 40% means the AI is more uncertain than certain.
                                    // For paper/testnet, this can be lowered via settings.
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
    private readonly exposureManager: ExposureManagerService,
    private readonly newsService: NewsService,
    private readonly credentialsService: CredentialsService,
  ) {
    this.logger.log('⚔️ Smart Executor initialized — DISABLED auto-start. Will ONLY run when a user explicitly enables it. (with news risk gate)');

    // FIX (V136): Only run startup cleanup. No auto-restore, no heartbeat.
    //
    // ROOT CAUSE of multiple bugs:
    //   1. _autoRestoreFromDB() read ALL SMART_EXECUTOR_USER_STATE:* entries from DB
    //      and restored EVERY user — even those who were auto-enabled by AuthService
    //      and never explicitly clicked "تشغيل". This caused the executor to trade
    //      for ALL users on every server restart.
    //   2. The 60-second heartbeat kept re-enabling users from DB, making it
    //      impossible to truly disable the executor for any user.
    //   3. Combined with AuthService's auto-enable (now removed), this created
    //      phantom trades for every user who ever logged in.
    //
    // V136 PRINCIPLE: The executor ONLY runs for users who explicitly enable it.
    //   - Startup: Only cleanup phantom data (no restore)
    //   - New user registration: No auto-enable (AuthService fix)
    //   - User clicks "تشغيل": enableUser() adds them to the tick loop
    //   - User clicks "إيقاف": disableUser() removes them
    //   - Server restart: Users must re-enable (explicit consent required)
    //
    // This ensures ZERO phantom trades and full user isolation.
    setTimeout(() => {
      this._startupCleanup().catch((err: any) => {
        this.logger.warn(`⚔️ Startup cleanup failed: ${err.message}`);
      });
    }, 20000); // 20s — give DB more time to be ready on Railway cold starts
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
      // SUSTAINABLE FIX: Skip cleanup if DB is not available.
      // Each query on an unavailable DB creates a new connection pool,
      // leaking PostgreSQL connection slots and causing cascading failures.
      if (!this.prisma?.isAvailable?.()) {
        this.logger.warn('⚔️ Skipping startup cleanup — DB not yet available');
        return;
      }

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

      // ── STEP 4: Clear Redis user states (volatile cache only) ──
      // V140B FIX: Only clear Redis cache, NOT DB states!
      // Previously this deleted BOTH Redis and DB user states on every restart,
      // which meant users had to manually re-enable the executor after EVERY
      // NestJS restart (crash, deployment, Railway cycling). This caused the
      // executor to "stop after a few minutes" because NestJS restarts frequently.
      //
      // Now: Redis cache is cleared (volatile, will be re-populated from DB),
      // but DB states are PRESERVED so auto-restore can re-enable the user.
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

      // ── STEP 4.1: V140B — REMOVED destructive DB cleanup ──
      // Previously deleted ALL SMART_EXECUTOR_USER_STATE:* from DB on startup.
      // This was needed in V136 to clean up auto-created states from AuthService,
      // but now that AuthService no longer auto-creates states (V136 removed it),
      // ALL remaining DB states are from users who EXPLICITLY enabled the executor.
      // Deleting them caused the "executor stops after a few minutes" bug.
      //
      // Instead: Only delete states that have enabled=false (already disabled).
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
      } catch (dbCleanErr: any) {
        this.logger.warn(`⚔️ Failed to clean up disabled DB user states: ${dbCleanErr.message}`);
      }

      // ── STEP 5: Clear global executor state from Redis ──
      try {
        await this.redis.del(this.REDIS_GLOBAL_STATE);
      } catch {}

      // ── STEP 5.1: Clear stale position-lock keys from Redis (V130) ──
      // Before V130, ExposureManager.canOpenPosition() created Redis locks
      // (position-lock:userId:symbol) that were never released. These stale
      // locks can persist after deployment and block ALL trade execution.
      // Even though we no longer use canOpenPosition() in the execution path,
      // clearing these on startup ensures a clean state.
      try {
        const lockKeys = await this.redis.scanKeys('position-lock:*');
        for (const key of lockKeys) {
          await this.redis.del(key);
        }
        if (lockKeys.length > 0) {
          this.logger.log(`⚔️ STARTUP: Cleared ${lockKeys.length} stale position-lock key(s) from Redis (V130 fix)`);
        }
      } catch (lockErr: any) {
        this.logger.warn(`⚔️ Failed to clear position-lock keys: ${lockErr.message}`);
      }

      // ── STEP 5.2: Clear stale idempotency keys from Redis (V132) ──
      // V132 changed the idempotency key structure. Old cross-source keys
      // (sha256(userId:symbol:side)) can block valid re-execution. Clear them.
      try {
        const idempotencyKeys = await this.redis.scanKeys('idempotency:*');
        for (const key of idempotencyKeys) {
          await this.redis.del(key);
        }
        if (idempotencyKeys.length > 0) {
          this.logger.log(`⚔️ STARTUP: Cleared ${idempotencyKeys.length} stale idempotency key(s) from Redis (V132 fix)`);
        }
      } catch (idempErr: any) {
        this.logger.warn(`⚔️ Failed to clear idempotency keys: ${idempErr.message}`);
      }

      // ── STEP 5.3: Clear OLD format circuit breaker keys from Redis (V137) ──
      // V137 changed the circuit breaker key format from `circuit-breaker:{symbol}`
      // (cross-user contamination) to `circuit-breaker:v2:{userId}:{symbol}` (per-user).
      // Old keys could apply User A's circuit breaker to ALL users on restart.
      try {
        const oldCbKeys = await this.redis.scanKeys('circuit-breaker:*');
        let oldCbCleaned = 0;
        for (const key of oldCbKeys) {
          // Only delete old-format keys (no 'v2:' prefix)
          if (key.startsWith('circuit-breaker:v2:')) continue;
          await this.redis.del(key);
          oldCbCleaned++;
        }
        if (oldCbCleaned > 0) {
          this.logger.log(`⚔️ STARTUP: Cleared ${oldCbCleaned} old-format circuit breaker key(s) from Redis (V137 — cross-user contamination fix)`);
        }
      } catch (cbCleanErr: any) {
        this.logger.warn(`⚔️ Failed to clear old circuit breaker keys: ${cbCleanErr.message}`);
      }

      // ── STEP 5.5: Clear stale price cache from Redis ──
      // FIX: If the old Promise.any() bug cached wrong prices (e.g., $34.98 for BTC),
      // those stale entries can persist for up to 5 minutes in the fallback cache.
      // On startup, purge ALL price-related Redis keys so fresh data is fetched.
      try {
        const priceCachePatterns = [
          'fallback:quote:*',   // FreeFallbackAdapter cache (5min TTL)
          'fallback:lastprice:*', // FreeFallbackAdapter poisoned cache (24h TTL)
          'binance:quote:*',    // BinanceAdapter cache (3s TTL)
          'twelvedata:quote:*', // TwelveDataAdapter cache (10min TTL)
          'exchange:quote:*',   // ExchangeService cache (30s TTL)
          'aggregator:quote:*', // AggregatorService cache
        ];
        let purgedPriceKeys = 0;
        for (const pattern of priceCachePatterns) {
          try {
            const keys = await this.redis.scanKeys(pattern);
            for (const key of keys) {
              await this.redis.del(key);
              purgedPriceKeys++;
            }
          } catch { /* pattern scan failed — skip */ }
        }
        if (purgedPriceKeys > 0) {
          this.logger.log(`⚔️ STARTUP: Purged ${purgedPriceKeys} stale price cache key(s) from Redis`);
        }
      } catch (priceErr: any) {
        this.logger.warn(`⚔️ Failed to purge price cache: ${priceErr.message}`);
      }

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

      // ── STEP 8: V143 — Clean up stale processedKey DB entries ──
      // The Setting table accumulates `smart-executor:processed:*:db` entries
      // for every brief execution. These never get cleaned up and grow indefinitely.
      // Briefs expire within 24h max, so any processedKey older than 48h is stale.
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
      } catch (processedKeyErr: any) {
        this.logger.warn(`⚔️ V143 Failed to purge stale processedKey entries: ${processedKeyErr.message}`);
      }

      // ── REMOVED: Auto-enable for paper-trading users ──
      // ROOT FIX: Auto-enabling the Smart Executor for ALL users with paper-trading
      // credentials violates explicit user consent. It causes:
      //   1. Trades executing without the user's knowledge
      //   2. Both Agent AND Executor running simultaneously (duplicate trades)
      //   3. Users confused about why trades appear they didn't authorize
      // The executor MUST ONLY be enabled by explicit user action ("تشغيل" button).
      //
      // Cross-system coordination is handled by ExposureManagerService:
      //   - Tracks total open positions across BOTH systems (executor + agent)
      //   - Prevents exceeding global limits regardless of source
      //   - One position per symbol enforced at the exposure level
      //   - No mutual exclusion lock needed — exposure-based coordination

      this.logger.log('⚔️ Startup cleanup complete (user data preserved)');

      // ── V140B: Auto-restore explicitly-enabled users from DB ──
      // After cleanup, re-populate Redis from DB for users who had
      // explicitly enabled the executor (enabled: true). This prevents
      // the "executor stops after a few minutes" bug caused by NestJS
      // restarts (Railway cycling, crashes, deployments).
      //
      // This is SAFE because V136 already removed AuthService auto-creation.
      // ALL remaining DB states with enabled:true are from users who
      // explicitly clicked "تفعيل" in the UI.
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

              // Re-populate Redis from DB
              await this.redis.set(
                `${this.REDIS_USER_STATE_PREFIX}${userId}`,
                JSON.stringify(stateData),
                86400000 * 7, // 7-day TTL
              );

              this.logger.log(`⚔️ RESTORE: Re-enabled user ${userId} from DB`);
            } catch (restoreErr: any) {
              this.logger.warn(`⚔️ Failed to restore user state: ${restoreErr.message}`);
            }
          }

          // Auto-start the global executor if any users were restored
          if (!this.isRunning) {
            this.logger.log(`⚔️ RESTORE: Auto-starting executor for ${enabledStates.length} restored user(s)`);
            await this.start('auto-restore');
          }
        }
      } catch (restoreErr: any) {
        this.logger.warn(`⚔️ Failed to auto-restore enabled users: ${restoreErr.message}`);
      }
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

  /**
   * REMOVED (V136): _autoRestoreFromDB() has been PERMANENTLY DELETED.
   *
   * ROOT CAUSE: This method read ALL SMART_EXECUTOR_USER_STATE:* entries from DB
   * and restored EVERY user — including those auto-enabled by AuthService without
   * explicit consent. Combined with the 60-second heartbeat, this meant:
   *   - Every user who ever logged in got their executor state restored
   *   - The tick loop would trade for ALL restored users
   *   - Disabling a user was futile — the heartbeat would re-enable them
   *   - Phantom trades appeared for users who never clicked "تشغيل"
   *
   * V136: The executor ONLY enables users who explicitly click "تشغيل" via enableUser().
   * On server restart, users must re-enable. This ensures explicit consent.
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
   *
   * V126 SUSTAINABLE ARCHITECTURE: User-driven account selection.
   *
   * The user selects which account to trade on from their settings page.
   * The executor reads activeCredentialId from user settings and executes
   * on that account. No routing mode, no paper/real mode, no auto-routing.
   * Just: user picks account → executor executes on it. Period.
   */
  async enableUser(userId: string, config?: {
    maxOpenPositions?: number;
    riskPerTradePercent?: number;
  }): Promise<UserExecutorState> {
    // ── Auto-start the executor if it's not running ──
    if (!this.isRunning) {
      this.logger.log(`⚔️ Executor not running — auto-starting on behalf of user ${userId}`);
      try {
        await this.start(userId);
      } catch (error: any) {
        this.logger.warn(`⚔️ Failed to auto-start executor for user ${userId}: ${error.message}`);
      }
    }

    // ── Read activeCredentialId from user settings (the user chose it) ──
    let activeCredentialId: string | undefined;
    try {
      const activeSetting = await this.prisma.setting.findFirst({
        where: { key: `user:${userId}:activeCredentialId` },
      });
      if (activeSetting?.value) {
        activeCredentialId = activeSetting.value;
        this.logger.log(`⚔️ V126 User ${userId} has active account: ${activeCredentialId}`);
      } else {
        this.logger.log(`⚔️ V126 User ${userId} has no active account selected — will skip execution until one is set`);
      }
    } catch (err: any) {
      this.logger.warn(`⚔️ V126 Could not read activeCredentialId for user ${userId}: ${err.message}`);
    }

    // ── Read risk settings from user's saved preferences. ──
    const userRiskSettings = await this._loadUserRiskSettings(userId);

    // V135: Read credential metadata for display (isTestnet, isPaperTrading, exchangeName)
    let isPaperTrading = false;
    let isTestnet = false;
    let exchangeName: string | undefined;
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
        } else {
          // CRITICAL FIX: activeCredentialId points to a deleted credential.
          // Auto-select a new valid credential for this user instead of
          // silently falling through to paper trading mode.
          this.logger.warn(
            `⚔️ CRITICAL: activeCredentialId=${activeCredentialId} not found for user ${userId} ` +
            `— credential was deleted. Auto-selecting new credential.`
          );
          // Clear stale setting
          try {
            await this.prisma.setting.deleteMany({
              where: { key: `user:${userId}:activeCredentialId` },
            });
          } catch { /* ignore */ }
          // Find a new valid credential
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
            // Persist the new selection
            await this.prisma.setting.upsert({
              where: { key: `user:${userId}:activeCredentialId` },
              update: { value: newCred.id },
              create: { key: `user:${userId}:activeCredentialId`, value: newCred.id },
            });
            this.logger.log(
              `⚔️ Auto-selected new credential ${newCred.id} (${newCred.exchange}) for user ${userId}`
            );
          } else {
            activeCredentialId = undefined;
            isPaperTrading = true;
          }
        }
      } catch (err: any) {
        this.logger.warn(`⚔️ V135 Could not read credential metadata for user ${userId}: ${err.message}`);
      }
    } else {
      isPaperTrading = true;  // No credential = paper mode
    }

    const state: UserExecutorState = {
      enabled: true,
      dailyPnL: 0,
      dailyTrades: 0,
      dailyResetAt: new Date().toISOString(),
      lastTradeAt: null,
      consecutiveLosses: 0,
      maxOpenPositions: config?.maxOpenPositions || userRiskSettings.maxOpenPositions,
      riskPerTradePercent: config?.riskPerTradePercent || userRiskSettings.riskPerTradePercent,
      activeCredentialId,
      isPaperTrading,  // V135
      isTestnet,       // V135
      exchangeName,    // V135
    };

    // ── Persist to BOTH Redis AND Database ──
    await this.redis.set(
      `${this.REDIS_USER_STATE_PREFIX}${userId}`,
      JSON.stringify(state),
      86400000 * 7,
    );

    await this._persistUserStateToDB(userId, state);

    this.logger.log(
      `⚔️ V126 Executor enabled for user ${userId} ` +
      `(activeCredential: ${activeCredentialId || 'none'}) — saved to Redis + DB`
    );

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
    // V135 FIX: Previously, this checked ALL users including simulated accounts
    // (paper/testnet). Simulated accounts should bypass the daily loss limit
    // (matching _processUserBriefs behavior). Without this bypass:
    //   - Paper/testnet accounts would show "daily limit exceeded" even with 0 trades
    //   - The widget would show "حد يومي" status incorrectly
    //   - This was the root cause of the user's reported bug: "لماذا يعطيني تم
    //     تجاوز الحد اليومي وهو لم ينفذ اصلا"
    let dailyLossLimitReached = false;
    try {
      const threshold = this.config.maxDailyLossPercent; // default 5%

      if (userId) {
        // User-specific check
        const userState = await this.getUserState(userId);
        if (userState && userState.enabled) {
          // V135: Check if user's active credential is simulated (paper/testnet)
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
            } else {
              // No credential = paper mode by default
              isSimulated = true;
            }
          } catch (credErr: any) {
            this.logger.debug(`getStatus: could not check credential type for ${userId}: ${credErr.message}`);
          }

          // V135: SKIP daily loss limit check for simulated accounts
          if (!isSimulated) {
            const portfolio = await this._getPortfolioValue(userId);
            if (portfolio > 0) {
              const lossLimit = portfolio * (threshold / 100);
              dailyLossLimitReached = todayPnL < -lossLimit;
            }
          } else {
            this.logger.debug(`getStatus: daily limit check BYPASSED for user ${userId} — simulated account`);
          }
        }
      } else {
        // Global check: check if ANY enabled user has hit the daily loss limit
        const enabledUsers = await this._getEnabledUsers();
        for (const uid of enabledUsers) {
          try {
            const userState = await this.getUserState(uid);
            if (userState && userState.enabled) {
              // V135: Skip simulated accounts in global check too
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
                } else {
                  isSimulated = true;
                }
              } catch { /* assume not simulated for safety */ }

              if (isSimulated) continue;  // Skip simulated accounts

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
   * SECURITY FIX (V168): userId is now REQUIRED — previously optional,
   * allowing cross-user data leakage when userId was not provided.
   * If userId is not provided, returns empty array (fail-safe).
   */
  async getOpenPositions(userId?: string): Promise<any[]> {
    try {
      // ═══════════════════════════════════════════════════════════
      // V168 SECURITY FIX: userId is now REQUIRED for this method.
      // Previously, if userId was undefined, the query returned ALL
      // positions from ALL users — a critical data leakage bug.
      // Now: If no userId is provided, return empty array (fail-safe).
      // ═══════════════════════════════════════════════════════════
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        this.logger.warn('🚨 V168: getOpenPositions called without userId — returning empty (security)');
        return [];
      }

      const where: any = { status: 'OPEN', userId };

      // ═══════════════════════════════════════════════════════════
      // SOURCE FILTER: Only show positions created by the
      // Smart Executor (source='smart_executor' or 'auto_paper').
      // Previously, this returned ALL positions including those
      // created by the Agent (source='agent'), making both logs
      // show identical trades — confusing users into thinking
      // trades are being duplicated.
      // ═══════════════════════════════════════════════════════════
      where.source = { in: ['smart_executor', 'auto_paper'] };

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
   *
   * V168 SECURITY FIX: userId is now REQUIRED. Previously, if no userId
   * was provided, this method could delete positions from ALL users.
   * Now: If userId is not provided, returns { deleted: 0 } (fail-safe).
   */
  async purgePhantomPositions(userId?: string): Promise<{ deleted: number }> {
    try {
      // V168 SECURITY: Require userId to prevent cross-user data deletion
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        this.logger.warn('🚨 V168: purgePhantomPositions called without userId — skipping (security)');
        return { deleted: 0 };
      }

      const where: any = { status: 'OPEN', userId };

      const allPositions = await this.prisma.position.findMany({ where });

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
   *
   * V168 SECURITY FIX: Added required userId parameter. All delete operations
   * are now scoped to the specified user only. Previously, this deleted
   * ALL users' paper-trading data — a critical cross-user data destruction bug.
   */
  async nuclearCleanup(userId: string): Promise<{
    briefs: number;
    positions: number;
    trades: number;
    paperOrders: number;
    paperCredentials: number;
    redisUsers: number;
    redisProcessed: number;
    executorStopped: boolean;
  }> {
    // V168 SECURITY: Require userId to prevent cross-user data destruction
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

    // 1. Stop the executor first
    try {
      await this.stop('nuclear-cleanup');
      result.executorStopped = true;
      this.logger.log('⚔️ NUCLEAR CLEANUP: Executor stopped');
    } catch (e: any) {
      this.logger.warn(`⚔️ NUCLEAR CLEANUP: Failed to stop executor: ${e.message}`);
    }

    // 2. Delete user's TradingBriefs (V168: scoped to userId)
    try {
      const briefCount = await this.prisma.tradingBrief.count({ where: { userId } });
      if (briefCount > 0) {
        await this.prisma.tradingBrief.deleteMany({ where: { userId } });
        result.briefs = briefCount;
        this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${briefCount} TradingBriefs for user ${userId}`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete TradingBriefs: ${e.message}`);
    }

    // 3. Delete user's Positions with exchange='paper-trading' (V168: scoped to userId)
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
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Positions: ${e.message}`);
    }

    // 4. Delete user's Trades with exchange='paper-trading' (V168: scoped to userId)
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
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Trades: ${e.message}`);
    }

    // 5. Delete user's PaperOrders (V168: scoped to userId)
    try {
      const paperOrderCount = await this.prisma.paperOrder.count({ where: { userId } });
      if (paperOrderCount > 0) {
        await this.prisma.paperOrder.deleteMany({ where: { userId } });
        result.paperOrders = paperOrderCount;
        this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Deleted ${paperOrderCount} PaperOrders for user ${userId}`);
      }
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete PaperOrders: ${e.message}`);
    }

    // 6. Delete user's ExchangeCredentials with exchange='paper-trading' (V168: scoped to userId)
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
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to delete paper Credentials: ${e.message}`);
    }

    // 7. Clear user's Redis executor state (V168: scoped to userId)
    try {
      await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
      result.redisUsers = 1;
      this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Cleared Redis user state for ${userId}`);
    } catch (e: any) {
      this.logger.error(`⚔️ NUCLEAR CLEANUP: Failed to clear Redis user state: ${e.message}`);
    }

    // 8. Clear user's Redis processed brief keys (V168: scoped to userId)
    try {
      const processedKeys = await this.redis.scanKeys(`${this.REDIS_PROCESSED_PREFIX}*${userId}`);
      for (const key of processedKeys) {
        await this.redis.del(key);
        result.redisProcessed++;
      }
      if (result.redisProcessed > 0) {
        this.logger.log(`⚔️ V168 NUCLEAR CLEANUP: Cleared ${result.redisProcessed} Redis processed keys for user ${userId}`);
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
   *
   * V136: Only reads from Redis — NO DB fallback.
   *
   * ROOT CAUSE of cross-user bug: The DB fallback read ALL
   * SMART_EXECUTOR_USER_STATE:* entries, including those auto-created by
   * AuthService for users who never explicitly enabled trading. This meant
   * the tick loop would trade for EVERY user who ever logged in.
   *
   * Now: Only Redis entries created by enableUser() (explicit user action)
   * are checked. If Redis restarts, users must re-enable via the UI.
   * This is the correct trade-off: explicit consent > convenience.
   */
  private async _getEnabledUsers(): Promise<string[]> {
    const userIds = new Set<string>();

    // Only read from Redis — entries are created by enableUser() (explicit action)
    try {
      const keys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
      for (const k of keys) {
        // Verify the state is actually enabled (not stale)
        try {
          const raw = await this.redis.get(k);
          if (raw) {
            const state = JSON.parse(raw);
            if (state.enabled) {
              const userId = k.replace(this.REDIS_USER_STATE_PREFIX, '');
              userIds.add(userId);
              // V140B: Refresh TTL on every read to prevent 7-day silent expiry.
              // Without this, the Redis key expires after 7 days and the user
              // is silently dropped from the tick loop.
              await this.redis.expire(k, 86400000 * 7).catch(() => {});
            } else {
              // Disabled state — clean up from Redis
              await this.redis.del(k).catch(() => {});
            }
          }
        } catch {
          // Malformed entry — remove it
          await this.redis.del(k).catch(() => {});
        }
      }
    } catch {
      // Redis unavailable — no users can be processed
    }

    if (userIds.size > 0) {
      this.logger.debug(`⚔️ Enabled users: ${userIds.size}`);
    }

    return Array.from(userIds);
  }

  // ── User Risk Settings (Single Source of Truth) ──

  /**
   * SUSTAINABLE FIX: Load user's risk settings from the Setting table.
   *
   * PROBLEM: User risk settings (userRiskPerTrade, userMaxDailyLoss, etc.)
   * were stored in the Setting table via the Settings page UI, but the
   * Smart Executor NEVER read them. It used hardcoded values (1%, 5 positions)
   * instead, making the Settings page risk controls write-only — users would
   * change percentages and nothing would happen.
   *
   * SOLUTION: This method is the SINGLE SOURCE OF TRUTH for reading risk
   * settings. It reads from the same Setting table that the Settings page
   * writes to (key format: "user:{userId}:userRiskPerTrade"), and falls
   * back to the executor's default config if no user override exists.
   *
   * This is called:
   *   1. In enableUser() — when a user activates the executor
   *   2. In _processUserBriefs() — every tick, so changes take effect within 10s
   *
   * Key format in Setting table: "user:{userId}:{settingName}"
   * Values are stored as strings (e.g., "1", "5")
   */
  private async _loadUserRiskSettings(userId: string): Promise<{
    riskPerTradePercent: number;
    maxOpenPositions: number;
    maxDailyLossPercent: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    riskWarningAcknowledged: boolean;
  }> {
    const defaults = {
      riskPerTradePercent: this.config.riskPerTradePercent,    // 1%
      maxOpenPositions: this.config.maxOpenPositions,          // 15 (V132: Increased from 5 to 15)
      maxDailyLossPercent: this.config.maxDailyLossPercent,    // 5%
      stopLossPercent: 2,                                       // 2%
      takeProfitPercent: 4,                                     // 4%
      riskWarningAcknowledged: false,
    };

    try {
      // V144: Also read global agentExecutorConfig from admin settings
      let globalExecutorMaxPositions: number | undefined;
      let globalExecutorMinConfidence: number | undefined;
      let globalExecutorRiskPerTrade: number | undefined;
      try {
        const agentExecSetting = await this.prisma.setting.findFirst({
          where: { key: 'agentExecutorConfig' },
        });
        if (agentExecSetting) {
          const parsed = JSON.parse(agentExecSetting.value);
          if (parsed.executorMaxOpenPositions) globalExecutorMaxPositions = parseInt(parsed.executorMaxOpenPositions, 10);
          if (parsed.executorMinConfidence) globalExecutorMinConfidence = parseInt(parsed.executorMinConfidence, 10);
          if (parsed.executorRiskPerTrade) globalExecutorRiskPerTrade = parseFloat(parsed.executorRiskPerTrade);
        }
      } catch (globalErr: any) {
        this.logger.debug(`⚔️ V144: Could not read global agentExecutorConfig: ${globalErr.message}`);
      }

      const settings = await this.prisma.setting.findMany({
        where: { key: { startsWith: `user:${userId}:` } },
      });

      const map: Record<string, string> = {};
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
              // V143: If the stored value is the OLD default (5), auto-upgrade to new default (15).
              // The value 5 was NEVER a deliberate user choice — it was the hardcoded default
              // in auth.service.ts, SmartExecutorPanel.tsx, and mobile/bot/page.tsx.
              // Upgrading it here prevents the "refresh risk settings" code from
              // downgrading the auto-migrated 15 back to 5 on every tick.
              if (val <= 5) {
                val = globalExecutorMaxPositions || this.config.maxOpenPositions; // 15
                // Also update the DB setting so next read returns the new value
                this.prisma.setting.upsert({
                  where: { key: `user:${userId}:userMaxOpenPositions` },
                  update: { value: String(val) },
                  create: { key: `user:${userId}:userMaxOpenPositions`, value: String(val) },
                }).catch(() => {});
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
    } catch (err: any) {
      this.logger.debug(`⚔️ Failed to load user risk settings for ${userId}: ${err.message} — using defaults`);
      return defaults;
    }
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

    // ═══════════════════════════════════════════════════════════════════
    // V132: Subscribe to council completion events for immediate execution.
    // Previously, the executor waited for the next tick (up to 10s) after
    // a council session completed. Now it's notified immediately via Redis
    // pub/sub, reducing latency from "up to 10s" to "near-instant".
    // ═══════════════════════════════════════════════════════════════════
    try {
      const subscriber = this.redis.duplicateSubscriber();
      if (subscriber) {
        subscriber.subscribe('council:session_complete');
        subscriber.on('message', (channel: string, message: string) => {
          if (channel === 'council:session_complete' && this.isRunning && !this.isTicking) {
            this.logger.log('⚔️ Council session complete event received — triggering immediate tick');
            this.isTicking = true;
            this._tick()
              .catch((err: any) => this.logger.error(`⚔️ Event-triggered tick failed: ${err.message}`))
              .finally(() => { this.isTicking = false; });
          }
        });
        this.logger.log('⚔️ Subscribed to council:session_complete events');
      }
    } catch (subErr: any) {
      this.logger.warn(`⚔️ Could not subscribe to council events: ${subErr.message} — falling back to polling`);
    }
  }

  /**
   * Single tick: Get active briefs, find enabled users, check conditions per user
   */
  private async _tick(): Promise<void> {
    // ═══════════════════════════════════════════════════════════════════
    // V134: Use CONSOLIDATED briefs — ONE direction per pair.
    //
    // ROOT CAUSE FIX for "opened and closed after 1 second":
    //   getActiveBriefs() returns ALL briefs including conflicting
    //   directions for the same pair (M1=BUY, M5=SELL). Processing
    //   these sequentially caused: open BUY → close BUY → open SELL → loop.
    //
    //   getConsolidatedBriefs() merges conflicting briefs into ONE
    //   direction per pair (weighted vote by confidence * timeframe).
    //   This guarantees the executor sees at most ONE brief per pair.
    // ═══════════════════════════════════════════════════════════════════
    let consolidatedBriefs: TradingBriefDTO[] = [];
    try {
      consolidatedBriefs = await this.councilService.getConsolidatedBriefs();
    } catch (e: any) {
      this.logger.error(`⚔️ Failed to get consolidated briefs: ${e.message}`);
      return;
    }

    if (consolidatedBriefs.length === 0) {
      this.logger.debug('⚔️ No consolidated briefs to execute — waiting for Strategic Council');
      return;
    }

    // ── TIMEFRAME FILTER: Only process briefs for executor timeframes (M1/M5/M15) ──
    // The Smart Executor handles quick/scalping trades only.
    // Briefs for M30+ are handled by the Autonomous Agent.
    const executorBriefs = consolidatedBriefs.filter(
      (brief: TradingBriefDTO) => isExecutorTimeframe(brief.timeframe)
    );

    if (executorBriefs.length === 0) {
      this.logger.debug(
        `⚔️ ${consolidatedBriefs.length} consolidated briefs but none match executor timeframes [${EXECUTOR_TIMEFRAMES.join(',')}] — waiting`,
      );
      return;
    }

    this.logger.debug(`⚔️ V134 Tick: ${executorBriefs.length} consolidated executor briefs (one per pair, no conflicts)`);

    // Get users with executor enabled
    const enabledUsers = await this._getEnabledUsers();

    if (enabledUsers.length === 0) {
      this.logger.debug(`⚔️ ${executorBriefs.length} consolidated briefs available but no enabled users — skipping`);
      return;
    }

    this.logger.debug(`⚔️ V134 Tick: ${executorBriefs.length} consolidated executor briefs, ${enabledUsers.length} users`);

    // Process each enabled user
    for (const userId of enabledUsers) {
      try {
        await this._processUserBriefs(userId, executorBriefs);
      } catch (error: any) {
        this.logger.error(`⚔️ Error processing user ${userId}: ${error.message}`);
      }
    }
  }

  /**
   * Process active briefs for a specific user
   *
   * V126: Simplified. The executor reads the user's activeCredentialId
   * and executes on that account. No routing modes, no paper/real detection.
   * The user is in control — they chose their account in settings.
   */
  private async _processUserBriefs(userId: string, briefs: TradingBriefDTO[]): Promise<void> {
    const userState = await this.getUserState(userId);
    if (!userState || !userState.enabled) return;

    // ═══════════════════════════════════════════════════════════════════
    // V143: Auto-migrate maxOpenPositions from old default (5) to new (15).
    // The old frontend hardcoded maxOpenPositions=5 when enabling the executor.
    // This caused the executor to stop after 5 trades and never recover.
    // Now: If the user has 5 and no explicit per-user setting in DB, upgrade to 15.
    // ═══════════════════════════════════════════════════════════════════
    if (userState.maxOpenPositions === 5) {
      try {
        const dbSetting = await this.prisma.setting.findFirst({
          where: { key: `user:${userId}:userMaxOpenPositions` },
        });
        if (!dbSetting) {
          // User never explicitly set maxOpenPositions — upgrade from old default 5 to new default 15
          userState.maxOpenPositions = this.config.maxOpenPositions; // 15
          await this.redis.set(
            `${this.REDIS_USER_STATE_PREFIX}${userId}`,
            JSON.stringify(userState),
            86400000 * 7,
          );
          this._persistUserStateToDB(userId, userState).catch(() => {});
          this.logger.log(`⚔️ V143: Auto-upgraded user ${userId} maxOpenPositions from 5 to ${this.config.maxOpenPositions} (no explicit user setting)`);
        }
      } catch (err: any) {
        this.logger.debug(`⚔️ V143: Could not check userMaxOpenPositions for ${userId}: ${err.message}`);
      }
    }

    // V126: Migrate old state format if needed
    if ((userState as any).routingMode !== undefined) {
      delete (userState as any).routingMode;
      // V135: Don't delete isPaperTrading — it's now a legitimate field
      if ((userState as any).credentialId && !userState.activeCredentialId) {
        userState.activeCredentialId = (userState as any).credentialId;
      }
      delete (userState as any).credentialId;
      await this.redis.set(
        `${this.REDIS_USER_STATE_PREFIX}${userId}`,
        JSON.stringify(userState),
        86400000 * 7,
      );
      this._persistUserStateToDB(userId, userState).catch(() => {});
    }

    // V126: Re-read activeCredentialId from user settings (may have changed)
    try {
      const activeSetting = await this.prisma.setting.findFirst({
        where: { key: `user:${userId}:activeCredentialId` },
      });
      const settingsActiveId = activeSetting?.value || undefined;
      if (settingsActiveId !== userState.activeCredentialId) {
        userState.activeCredentialId = settingsActiveId;
        await this.redis.set(
          `${this.REDIS_USER_STATE_PREFIX}${userId}`,
          JSON.stringify(userState),
          86400000 * 7,
        );
        this._persistUserStateToDB(userId, userState).catch(() => {});
        if (settingsActiveId) {
          this.logger.log(`⚔️ V126 Updated activeCredentialId for user ${userId}: ${settingsActiveId}`);
        }
      }
    } catch (err: any) {
      this.logger.debug(`⚔️ Could not refresh activeCredentialId for user ${userId}: ${err.message}`);
    }

    // V126 FIX: If no active credential selected, auto-pick the first available one.
    // Before this fix: if the user never visited settings to pick an account,
    // the executor silently skipped ALL briefs forever — no trades ever executed.
    if (!userState.activeCredentialId) {
      try {
        const firstCred = await this.prisma.exchangeCredential.findFirst({
          where: { userId, isValid: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, exchange: true },
        });
        if (firstCred) {
          userState.activeCredentialId = firstCred.id;
          // Persist so next tick doesn't repeat this lookup
          await this.prisma.setting.upsert({
            where: { key: `user:${userId}:activeCredentialId` },
            update: { value: firstCred.id },
            create: { key: `user:${userId}:activeCredentialId`, value: firstCred.id },
          }).catch(() => {});
          this.logger.log(`⚔️ Auto-selected credential ${firstCred.id} (${firstCred.exchange}) for user ${userId}`);
        } else {
          this.logger.debug(`⚔️ User ${userId} has no credentials at all — skipping`);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`⚔️ Could not auto-select credential for ${userId}: ${err.message}`);
        return;
      }
    }

    // V126: Determine if the active credential is simulated (paper/testnet)
    // This is only used for risk check bypass (paper accounts skip balance checks)
    let isSimulated = false;
    try {
      const cred = await this.prisma.exchangeCredential.findFirst({
        where: { id: userState.activeCredentialId, userId },
        select: { testnet: true, exchange: true },
      });
      if (cred) {
        isSimulated = cred.testnet === true || this._isSimulatedExchange(cred.exchange);
        // V135: Update trading mode metadata in user state for frontend display
        const newIsPaperTrading = cred.exchange === 'paper-trading';
        const newIsTestnet = cred.testnet === true && cred.exchange !== 'paper-trading';
        const newExchangeName = cred.exchange;
        if (userState.isPaperTrading !== newIsPaperTrading ||
            userState.isTestnet !== newIsTestnet ||
            userState.exchangeName !== newExchangeName) {
          userState.isPaperTrading = newIsPaperTrading;
          userState.isTestnet = newIsTestnet;
          userState.exchangeName = newExchangeName;
          // Persist updated metadata
          await this.redis.set(
            `${this.REDIS_USER_STATE_PREFIX}${userId}`,
            JSON.stringify(userState),
            86400000 * 7,
          );
          this._persistUserStateToDB(userId, userState).catch(() => {});
        }
      }
    } catch (err: any) {
      this.logger.debug(`⚔️ Could not check credential type for user ${userId}: ${err.message}`);
    }

    // ── Refresh risk settings from user preferences every tick. ──
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
        await this.redis.set(
          `${this.REDIS_USER_STATE_PREFIX}${userId}`,
          JSON.stringify(userState),
          86400000 * 7,
        );
        this._persistUserStateToDB(userId, userState).catch(() => {});
      }
    } catch (err: any) {
      this.logger.debug(`⚔️ Failed to refresh risk settings for ${userId}: ${err.message}`);
    }

    // Reset daily stats if new day
    const dailyResetAt = new Date(userState.dailyResetAt);
    const now = new Date();
    if (now.toDateString() !== dailyResetAt.toDateString()) {
      userState.dailyPnL = 0;
      userState.dailyTrades = 0;
      userState.dailyResetAt = now.toISOString();
      userState.consecutiveLosses = 0;
    }

    // V124 FIX: Skip daily loss limit for SIMULATED accounts (paper + testnet).
    // Both use virtual funds — blocking for "daily drawdown" defeats the purpose.
    // Only REAL accounts (non-testnet) need this protection for real capital.
    const portfolio = await this._getPortfolioValue(userId);
    if (!isSimulated) {
      // Read the user's own daily loss limit from their settings
      let userMaxDailyLossPercent = this.config.maxDailyLossPercent; // default 5%
      try {
        const riskSettings = await this._loadUserRiskSettings(userId);
        userMaxDailyLossPercent = riskSettings.maxDailyLossPercent;
      } catch { /* use default */ }

      if (portfolio > 0 && userState.dailyPnL < -(portfolio * userMaxDailyLossPercent / 100)) {
        const lossLimit = (portfolio * userMaxDailyLossPercent / 100).toFixed(2);
        this.logger.warn(
          `⚔️ HARD STOP: User ${userId} hit daily loss limit ` +
          `(P&L: $${userState.dailyPnL.toFixed(2)} < -$${lossLimit} = ${userMaxDailyLossPercent}% of $${portfolio.toFixed(2)}) ` +
          `— DISABLING executor and sending notification`
        );

        // ── HARD STOP: Disable executor for this user until tomorrow ──
        await this.disableUser(userId);

        // ── Persist daily loss flag to DB so restart doesn't reset it ──
        try {
          await this.prisma.setting.upsert({
            where: { key: `user:${userId}:dailyLossHit` },
            update: { value: new Date().toDateString() },
            create: { key: `user:${userId}:dailyLossHit`, value: new Date().toDateString() },
          });
        } catch { /* non-fatal */ }

        // ── Notify user ──
        // V169 FIX: Use sendNotification() instead of non-existent sendToUser()
        try {
          await this.notificationService.sendNotification({
            userId,
            type: 'RISK_WARNING',
            priority: 'URGENT',
            title: '🛑 تم إيقاف التداول — حد الخسارة اليومي',
            body: `خسارة اليوم بلغت $${Math.abs(userState.dailyPnL).toFixed(2)} (${userMaxDailyLossPercent}% من المحفظة). تم إيقاف المنفذ الذكي تلقائياً حتى الغد.`,
            source: 'smart-executor',
          });
        } catch { /* non-fatal */ }

        return;
      }

      // ── Check if daily loss was hit today (persisted across restarts) ──
      try {
        const dailyLossFlag = await this.prisma.setting.findUnique({
          where: { key: `user:${userId}:dailyLossHit` },
        });
        if (dailyLossFlag?.value === new Date().toDateString()) {
          this.logger.warn(`⚔️ User ${userId} already hit daily loss limit today — executor remains disabled`);
          await this.disableUser(userId);
          return;
        }
      } catch { /* non-fatal */ }
    }

    // ═══════════════════════════════════════════════════════════
    // V134: SIMPLIFIED position count — direct DB query instead
    // of ExposureManager (which acquired Redis locks that never
    // released, causing deadlocks).
    //
    // The ExposureManager.getExposureSummary() was reading from DB
    // anyway — there's no need for a separate service with Redis
    // locks just to count open positions. A simple Prisma count()
    // is faster, simpler, and has no deadlock risk.
    // ═══════════════════════════════════════════════════════════
    const executorMaxPositions = userState.maxOpenPositions || this.config.maxOpenPositions;
    let openPositionsCount = 0;
    let totalOpenPositionsCount = 0; // V144: Also count ALL positions for RiskGatekeeper awareness
    try {
      // V141 FIX: Only count THIS system's own positions (smart_executor + auto_paper).
      // Previously counted ALL positions including Agent positions, which meant:
      //   1. Agent's 5 positions blocked the Executor from opening any trades
      //   2. If Agent had 15+ positions, the Executor was completely locked out
      //   3. The Executor thought it was "full" when it had zero of its own positions
      // Now: Each system counts only its own positions for its own limit.
      openPositionsCount = await this.prisma.position.count({
        where: { userId, status: 'OPEN', entryPrice: { gt: 0 }, source: { in: ['smart_executor', 'auto_paper'] } },
      });
      // V144: Also count ALL positions (all sources) — this is what the RiskGatekeeper
      // will check. If total positions >= RG's maxOpenPositions, the order will be
      // rejected by the RiskGatekeeper even though our executor count says we have room.
      // By checking both limits here, we can skip briefs early and log the real reason.
      totalOpenPositionsCount = await this.prisma.position.count({
        where: { userId, status: 'OPEN', entryPrice: { gt: 0 } },
      });
    } catch (dbErr: any) {
      this.logger.warn(`⚔️ V134 Failed to count open positions for ${userId}: ${dbErr.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // V144: Use the EFFECTIVE max positions = MIN(executor limit, RiskGatekeeper limit)
    // The RiskGatekeeper will REJECT any order that would exceed its limit,
    // regardless of what the executor thinks. By pre-checking here, we:
    //   1. Avoid wasting AI API calls on briefs that can't be executed
    //   2. Log the REAL reason trades are being blocked
    //   3. Give the user clear feedback about which limit is binding
    // ═══════════════════════════════════════════════════════════════════
    const rgParams = this.riskGatekeeper.getRiskParameters();
    const rgMaxPositions = rgParams.maxOpenPositions;
    const effectiveMaxPositions = Math.min(executorMaxPositions, rgMaxPositions);

    // V176 FIX: Check cooldown before opening any new positions.
    // Issue #11: After TIME_EXPIRED/STOP_LOSS auto-close, the SmartExecutor
    // immediately re-opened the same position, creating trades every 8-10 seconds.
    // The position monitor now sets a 5-minute cooldown per userId+symbol.
    // We must check this cooldown before processing any briefs.
    try {
      const cooldownBriefs: string[] = [];
      for (const brief of briefs) {
        const cooldownKey = `cooldown:${userId}:${brief.pair}`;
        const cooldownReason = await this.redis.get(cooldownKey);
        if (cooldownReason) {
          this.logger.debug(
            `⏳ V176 COOLDOWN: Skipping ${brief.pair} for user ${userId} — cooldown active (reason: ${cooldownReason})`,
          );
          cooldownBriefs.push(brief.pair);
        }
      }
      // Filter out briefs that are in cooldown
      if (cooldownBriefs.length > 0) {
        const before = briefs.length;
        briefs = briefs.filter(b => !cooldownBriefs.includes(b.pair));
        this.logger.debug(
          `⏳ V176: Filtered ${cooldownBriefs.length} cooldown briefs (${before} → ${briefs.length} remaining)`,
        );
        if (briefs.length === 0) {
          this.logger.debug(`⏳ V176: All briefs for user ${userId} are in cooldown — skipping cycle`);
          return;
        }
      }
    } catch (cooldownErr: any) {
      this.logger.warn(`V176 Cooldown check failed: ${cooldownErr.message} — continuing without cooldown check`);
    }

    if (openPositionsCount >= executorMaxPositions && !isSimulated) {
      this.logger.debug(
        `⚔️ User ${userId} at EXECUTOR max positions (${openPositionsCount}/${executorMaxPositions}) — skipping all briefs`,
      );
      return;
    }

    if (totalOpenPositionsCount >= rgMaxPositions && !isSimulated) {
      this.logger.warn(
        `⚔️ V144: User ${userId} at RISK GATEKEEPER max positions (total=${totalOpenPositionsCount}/${rgMaxPositions}, executor=${openPositionsCount}/${executorMaxPositions}) — RiskGatekeeper would REJECT new trades. ` +
        `Consider increasing riskConfig.maxOpenPositions in admin settings.`
      );
      // Don't return — the executor might still try (some briefs might close positions first)
      // But log clearly so the admin knows the real bottleneck.
    }

    // V124 FIX: Auto-close stale positions for SIMULATED accounts (paper + testnet).
    // Simulated accounts use virtual funds, so closing stale positions is safe.
    if (openPositionsCount >= executorMaxPositions && isSimulated) {
      try {
        // FIX: Reduced from 4 hours to 1 hour — paper trading positions should
        // rotate faster to demonstrate the platform's capabilities. A 4-hour
        // stale threshold meant the executor was stuck with one trade for hours,
        // making the platform look broken to new users testing paper trading.
        const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
        // V141 FIX: Only evict THIS system's own stale positions.
        // Previously, the Executor would close the Agent's positions to make room
        // for its own trades — the Agent never knew why its positions disappeared.
        // Now: Each system only evicts its own stale positions.
        const oldestPosition = await this.prisma.position.findFirst({
          where: { userId, status: 'OPEN', openedAt: { lt: oneHourAgo }, source: { in: ['smart_executor', 'auto_paper'] } },
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
            // V141: Pass closeReason so it's stored on the Position record
            await this.tradingService.closePositionWithRetry(userId, {
              positionId: oldestPosition.id,
              closeReason: 'AUTO_STALE', // V141: Position auto-closed because it was stale (>1h old)
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

            // FIX: Send POSITION_CLOSED notification so the frontend removes the position immediately.
            // Previously, the Smart Executor closed positions but never notified the frontend,
            // causing closed positions to persist in the UI until the user clicked "Close All".
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
            } catch (notifErr: any) {
              this.logger.warn(`⚔️ Failed to send close notification for ${oldestPosition.id}: ${notifErr.message}`);
            }
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
      // V177 FIX #15: Correlation check — max 3 correlated crypto positions
      const CRYPTO_CORRELATION_LIMIT = 3;
      try {
        const cryptoPositions = await this.prisma.position.count({
          where: {
            userId,
            status: 'OPEN',
            source: { in: ['smart_executor', 'auto_paper'] },
            symbol: { in: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'DOGE/USDT', 'ADA/USDT', 'XRP/USDT'] },
          },
        });
        if (cryptoPositions >= CRYPTO_CORRELATION_LIMIT) {
          const isCryptoBrief = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'DOGE/USDT', 'ADA/USDT', 'XRP/USDT'].includes(brief.pair);
          if (isCryptoBrief) {
            this.logger.debug(`⚔️ V177 Correlation limit: ${cryptoPositions} crypto positions ≥ ${CRYPTO_CORRELATION_LIMIT} — skipping ${brief.pair}`);
            continue; // Skip this brief — too many correlated positions
          }
        }
      } catch { /* non-critical */ }

      // Skip already processed briefs (per user) — Redis-backed for crash safety
      const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
      // FIX: Check DB as fallback — Redis may have been cleared on restart
      // causing duplicate executions. DB is the source of truth.
      let alreadyProcessed = await this.redis.get(processedKey);
      if (!alreadyProcessed) {
        try {
          const dbCheck = await this.prisma.setting.findFirst({
            where: { key: `${processedKey}:db` },
          });
          if (dbCheck && dbCheck.value) alreadyProcessed = dbCheck.value;
        } catch { /* non-critical */ }
      }
      if (alreadyProcessed) {
        // FIX: Check if the position from this brief is still OPEN.
        // If the user manually closed the position, the processedKey should be cleared
        // so the executor can execute new briefs for the same pair.
        // This is the ROOT CAUSE of "only one trade at a time" — when the user closes
        // a position manually, the processedKey stays set for 24 hours, blocking ALL
        // new briefs for that pair even though the position no longer exists.
        try {
          const processedData = typeof alreadyProcessed === 'string' ? JSON.parse(alreadyProcessed) : alreadyProcessed;
          const positionId = processedData?.orderId || processedData?.positionId;

          // FIX v113: Skip clearing for "duplicate-blocked" entries.
          // These are set when an order was blocked by idempotency (أمر مكرر).
          // If we clear them, the same brief gets retried → hits أمر مكرر again →
          // sets processedKey again → gets cleared → infinite loop!
          const isDuplicateBlocked = positionId === 'duplicate-blocked' ||
            processedData?.reason === 'duplicate-order-idempotency';

          if (positionId && !isDuplicateBlocked) {
            const existingPos = await this.prisma.position.findFirst({
              where: { id: positionId, userId, status: 'OPEN' },
            });
            if (!existingPos) {
              // Position is no longer open — clear processedKey and allow re-execution
              this.logger.log(`⚔️ Clearing processedKey for brief ${brief.id} — position ${positionId} is no longer OPEN`);
              await this.redis.del(processedKey);
              try {
                await this.prisma.setting.deleteMany({
                  where: { key: `${processedKey}:db` },
                });
              } catch { /* non-critical */ }
              alreadyProcessed = null; // Allow re-execution
            }
          }
        } catch (parseErr: any) {
          this.logger.debug(`⚔️ Could not check processedKey position status: ${parseErr.message}`);
        }

        if (alreadyProcessed) {
          this.logger.debug(`⚔️ Skipping already-processed brief ${brief.id} for user ${userId}`);
          continue;
        }
      }

      // Check confidence threshold FIRST (cheap check, skip early)
      if (brief.confidence < this.config.minConfidence) {
        this.logger.debug(`⚔️ Skipping brief ${brief.id} — confidence ${brief.confidence}% < min ${this.config.minConfidence}%`);
        continue;
      }

      // ── POSITION DUPLICATE CHECK: Check if user already has position for this pair (ANY source) ──
      // SUSTAINABLE FIX (V130): Replaced ExposureManager.canOpenPosition() with simple DB check.
      //
      // WHY: canOpenPosition() acquired a Redis lock (position-lock:userId:symbol) that was
      // NEVER released by any caller. This caused permanent deadlocks where:
      //   - Lock acquired → brief conditions not met → lock stays for 30s (TTL)
      //   - Next tick → lock still held → "Position lock contention" → ALL trades blocked
      //   - With 3 users × 4 pairs = 12 locks cycling, 90% of ticks were blocked
      //
      // The lock was REDUNDANT because OrderDispatcher already prevents duplicates via:
      //   1. IdempotencyService (cross-source userId:symbol:side lock, 60s TTL)
      //   2. Position.findFirst() in submitOrder() — prevents same-symbol duplicates
      //   3. RiskGatekeeper — validates order before execution
      //
      // Now: Simple Position.findFirst() check — no locks, no deadlocks, same safety.
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId, symbol: brief.pair, status: 'OPEN' },
      });

      if (existingPosition) {
        // ═══════════════════════════════════════════════════════════════════
        // V133 FIX: STOP closing existing positions to execute new briefs.
        //
        // ROOT CAUSE of "opened and closed after 1 second":
        //   The Strategic Council generates MULTIPLE briefs for the same
        //   high-conviction pair (e.g., BTC/USDT BUY and BTC/USDT SELL).
        //   The old logic (V124) would:
        //     1. Brief A: BTC/USDT BUY → Open BUY position
        //     2. Brief B: BTC/USDT SELL → Find BUY position → CLOSE it → Open SELL
        //     3. Next tick: Brief A still active → Find SELL position → CLOSE it → Open BUY
        //     4. INFINITE LOOP: open→close→open→close every 10 seconds
        //
        //   The user sees: "opened 2 trades and closed them after 1 second"
        //
        // NEW BEHAVIOR:
        //   - If same-direction position exists → SKIP (already have this trade)
        //   - If opposite-direction position exists AND paper trading → Allow hedge
        //   - If opposite-direction position exists AND real trading → SKIP
        //   - NEVER close an existing position just to execute a new brief
        //
        // Positions should ONLY be closed by:
        //   1. Position Monitor (SL/TP hit)
        //   2. Auto-close stale positions (>1h for paper)
        //   3. User manual close
        //   4. Emergency stop
        // ═══════════════════════════════════════════════════════════════════
        const isSameDirection = existingPosition.side === brief.direction;

        if (isSameDirection) {
          // Already have a position in the same direction — skip
          this.logger.debug(
            `⚔️ V133 Skipping brief ${brief.id} — existing ${existingPosition.side} position on ${brief.pair}`,
          );
          continue;
        }

        // Opposite direction — only allow for paper trading (hedge)
        if (!isSimulated) {
          this.logger.debug(
            `⚔️ Skipping brief ${brief.id} — existing ${existingPosition.side} position on ${brief.pair} (no hedge for real accounts)`,
          );
          continue;
        }

        // Paper trading: Allow opposite-direction brief as a hedge
        // BUT check if we already have 2 positions on this symbol (BUY + SELL)
        const positionsOnSymbol = await this.prisma.position.count({
          where: { userId, symbol: brief.pair, status: 'OPEN' },
        });
        if (positionsOnSymbol >= 2) {
          this.logger.debug(
            `⚔️ V133 Skipping brief ${brief.id} — already ${positionsOnSymbol} positions on ${brief.pair} (hedge limit reached)`,
          );
          continue;
        }

        // Opposite direction, paper trading, under hedge limit — ALLOW
        this.logger.log(
          `⚔️ V133 Hedge allowed: executing ${brief.direction} ${brief.pair} alongside existing ${existingPosition.side}`,
        );
      }

      // FIX: Check max positions PER PAIR (not globally).
      // The OLD code compared per-symbol count against the GLOBAL max (10),
      // which meant the check almost never triggered (you'd need 10+ positions
      // on the SAME symbol). Now: For paper trading, allow 2 per symbol (hedge).
      // For real trading, strict 1 per symbol.
      const currentOpenPositionsOnPair = await this.prisma.position.count({
        where: { userId, symbol: brief.pair, status: 'OPEN' },
      });
      // V124 FIX: Per-symbol position limit — simulated accounts allow 2 (hedge),
      // real accounts strict 1 per symbol.
      const maxPerSymbol = isSimulated ? 2 : 1;
      if (currentOpenPositionsOnPair >= maxPerSymbol) {
        this.logger.debug(`⚔️ User ${userId} at max positions for ${brief.pair} (${currentOpenPositionsOnPair}/${maxPerSymbol}) — skipping brief ${brief.id}`);
        continue;
      }

      try {
        await this._checkBriefForUser(userId, brief, userState, portfolio, isSimulated);
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
    isSimulated: boolean = false,
  ): Promise<void> {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CRITICAL FIX: Price fetching with sanity validation
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // The OLD code used orchestrator first → exchangeService fallback.
    // Problem: orchestrator's Promise.any() could return wrong prices
    // (e.g., $34.98 for BTC), and the 20% deviation check against
    // brief.entryPrice was unreliable because the brief itself could
    // have been generated with a wrong price.
    //
    // NEW APPROACH: 
    // 1. Use ExchangeService as PRIMARY (it has proper adapters + fallbacks)
    // 2. Use orchestrator as SECONDARY
    // 3. Apply sanity ranges INDEPENDENT of brief.entryPrice
    // 4. Both paper and real trading use live prices
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let currentPrice: number = 0;
    let priceSource = 'none';

    // Source 1 (PRIMARY): ExchangeService — proper adapter chain with fallbacks
    try {
      const quote = await this.exchangeService.getQuote(brief.pair);
      if (quote?.price > 0) {
        currentPrice = quote.price;
        priceSource = 'exchange';
      }
    } catch {}

    // Source 2 (SECONDARY): AI Orchestrator — multiple parallel sources
    if (!currentPrice || currentPrice <= 0) {
      try {
        const marketData = await this.orchestrator.fetchQuickMarketData(brief.pair);
        if (marketData?.price > 0) {
          currentPrice = marketData.price;
          priceSource = 'orchestrator';
        }
      } catch {}
    }

    // Source 3 (LAST RESORT): Brief entry price (up to 15 minutes stale)
    if (!currentPrice || currentPrice <= 0) {
      currentPrice = brief.entryPrice;
      priceSource = 'brief-entry';
      this.logger.warn(`⚔️ Using stale brief entry price for ${brief.pair}: ${currentPrice}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SANITY CHECK: Validate price against known ranges
    // This catches the $34.98-for-BTC bug regardless of which source it came from.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const PRICE_SANITY: Record<string, { min: number; max: number }> = {
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
      this.logger.error(
        `⚔️ PRICE SANITY FAILED for ${brief.pair}: $${currentPrice} from ${priceSource} is outside [${sanity.min}, ${sanity.max}] — ` +
        `using brief entry price $${brief.entryPrice} instead`
      );
      currentPrice = brief.entryPrice;
      priceSource = 'brief-entry (sanity-fallback)';
    }

    this.logger.debug(`⚔️ ${brief.pair}: price=$${currentPrice} from ${priceSource}`);

    // 2. Check strict rules
    const strictRules: StrictRules = brief.strictRules || { maxSlippage: this.config.defaultSlippage };

    // V124 FIX: Simulated accounts (paper + testnet) skip strict entry price rules.
    // The brief IS the signal — no need to verify price proximity.
    // Only REAL accounts need strict entry conditions to protect capital.
    if (!isSimulated) {
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
    // V124 FIX: Simulated accounts (paper + testnet) always meet entry conditions.
    // Only REAL accounts need to verify price proximity to brief entry.
    const conditionsMet = isSimulated || this._areEntryConditionsMet(brief, currentPrice, strictRules);

    if (conditionsMet) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // V144: NEWS RISK GATE — Check for opposing high-impact news
      // before executing the trade. This is the last line of defense
      // against trading against major news events.
      //
      // If there's high-impact negative news opposing the brief direction,
      // we SKIP the execution for REAL accounts (paper accounts proceed
      // since they're simulated and for testing).
      //
      // Example: Brief says BUY BTC but there's high-impact negative news
      // (exchange hack, regulatory ban) → SKIP real execution.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (!isSimulated) {
        try {
          const newsCheck = await this._checkNewsRisk(brief.pair, brief.direction);
          if (newsCheck.blocked) {
            this.logger.warn(
              `⚔️ V144: News risk gate BLOCKED ${brief.direction} ${brief.pair} — ` +
              `${newsCheck.reason} (risk=${newsCheck.riskLevel}, score=${newsCheck.score.toFixed(2)})`
            );
            return; // Skip execution — news opposes this trade
          } else if (newsCheck.warning) {
            this.logger.log(
              `⚔️ V144: News risk warning for ${brief.direction} ${brief.pair} — ` +
              `${newsCheck.reason} (proceeding with caution)`
            );
          }
        } catch (newsError: any) {
          // Non-blocking: news check failure should NOT prevent execution
          this.logger.warn(`⚔️ V144: News risk check failed: ${newsError.message} — proceeding without news gate`);
        }
      }

      // EXECUTE THE TRADE!
      const result = await this._executeBriefForUser(userId, brief, currentPrice, userState, portfolioValue);

      if (result.success) {
        // FIX: Mark as processed in Redis with TTL based on the brief's timeframe.
        // Previously used 24h TTL which blocked new positions for the same pair
        // long after the brief expired. Now the TTL matches the timeframe's natural
        // duration so processed keys expire when the brief would naturally be stale:
        //   M1: 1 minute, M5: 5 minutes, M15: 15 minutes
        // For other timeframes, fall back to 15 minutes.
        const TIMEFRAME_TTL_MS: Record<string, number> = {
          M1: 1 * 60 * 1000,      // 1 minute
          M5: 5 * 60 * 1000,      // 5 minutes
          M15: 15 * 60 * 1000,    // 15 minutes
          M30: 30 * 60 * 1000,    // 30 minutes
          H1: 1 * 60 * 60 * 1000, // 1 hour
          H4: 4 * 60 * 60 * 1000, // 4 hours
          D1: 24 * 60 * 60 * 1000, // 24 hours
          W1: 7 * 24 * 60 * 60 * 1000, // 7 days
        };
        const processedTtlMs = TIMEFRAME_TTL_MS[brief.timeframe] || 15 * 60 * 1000;
        const processedKey = `${this.REDIS_PROCESSED_PREFIX}${brief.id}:${userId}`;
        const processedValue = JSON.stringify({ orderId: result.orderId, executedAt: new Date().toISOString(), pair: brief.pair, timeframe: brief.timeframe });
        await this.redis.set(processedKey, processedValue, processedTtlMs);
        // FIX: Also save to DB so dedup survives Redis restart
        try {
          await this.prisma.setting.upsert({
            where: { key: `${processedKey}:db` },
            update: { value: processedValue },
            create: { key: `${processedKey}:db`, value: processedValue },
          });
        } catch { /* non-critical */ }
        this.totalExecutions++;

        this.logger.log(
          `⚔️ EXECUTED: ${brief.direction} ${brief.pair} @ ${currentPrice} ` +
          `(brief: ${brief.id}, order: ${result.orderId}, user: ${userId})`,
        );

        // ── ROOT FIX: Do NOT mark brief as EXECUTED (isActive=false) ──
        // Previously, after executing a brief, we called markBriefExecuted() which
        // sets isActive=false, removing it from the active briefs pool. This caused
        // the "only 1 trade" bug — after the first brief was executed and deactivated,
        // there were no more active briefs to process, even though dozens existed.
        //
        // Now: Keep the brief ACTIVE. The deduplication is handled by:
        //   1. Redis processedKey (smart-executor:processed:{briefId}:{userId}) — timeframe-based TTL
        //      prevents the SAME brief from being executed twice for the SAME user
        //   2. Position.findFirst in OrderDispatcher — prevents duplicate positions
        //      for the same user+symbol from ANY source
        //   3. Brief natural expiry (expiresAt) — briefs automatically become inactive
        //      after their timeframe expires
        //
        // This allows the brief to remain visible in the Council dashboard and
        // available for other users who haven't executed it yet.
        // The brief will be cleaned up naturally when it expires or when the next
        // Council session reviews it.
        this.logger.debug(`⚔️ Brief ${brief.id} remains ACTIVE after execution — dedup handled by processedKey + Position.findFirst`);

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
        } catch (notifError: any) {
          this.logger.warn(`⚔️ Failed to send execution notification to user ${userId}: ${notifError.message}`);
        }
      } else {
        // ── FIX v112: Handle "أمر مكرر" (duplicate order) gracefully ──
        // When the OrderDispatcher returns "أمر مكرر", it means the order
        // was ALREADY submitted before (idempotency key is locked in Redis).
        // This happens when:
        //   1. The processedKey was cleared (position closed) but the
        //      OrderDispatcher's idempotency key is still locked (24h TTL)
        //   2. The same brief+symbol+side combination was already executed
        // In both cases, retrying is useless — it will ALWAYS fail.
        // The fix: Mark the brief as processed to stop the infinite retry loop.
        const isDuplicateOrder = result.error?.includes('أمر مكرر') ||
          result.error?.includes('duplicate');

        if (isDuplicateOrder) {
          this.logger.warn(
            `⚔️ Brief ${brief.id} for ${brief.pair} returned "أمر مكرر" — marking as processed to prevent infinite retry loop`,
          );
          // Mark as processed so we don't retry this brief+user combination
          const TIMEFRAME_TTL_MS: Record<string, number> = {
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
          } catch { /* non-critical */ }
        } else {
          // For other failures (risk check, SL missing, etc.) — don't mark as processed,
          // brief can be retried on the next tick if conditions change
          // V144: Enhanced logging for RiskGatekeeper POSITION_SIZE_LIMIT rejections
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
            this.logger.error(
              `⚔️ V144 BLOCKED: Brief ${brief.id} (${brief.pair}) REJECTED by RiskGatekeeper for user ${userId}. ` +
              `Executor positions: ${executorPos}/${userState.maxOpenPositions || this.config.maxOpenPositions}, ` +
              `Total positions: ${totalPos}/${rgParams.maxOpenPositions}, ` +
              `Error: ${result.error}`
            );
          } else {
            this.logger.warn(
              `⚔️ Brief ${brief.id} execution FAILED for user ${userId}: ${result.error} — will retry on next tick`,
            );
          }
        }

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
  // ── V144: News Risk Gate ──

  /**
   * V144: Check news risk before executing a trade.
   * Returns whether the trade should be blocked or warned about
   * based on recent high-impact news opposing the trade direction.
   *
   * This is the executor's last line of defense against trading
   * against major news events. Only applies to REAL accounts
   * (paper accounts bypass this check).
   *
   * Blocking criteria:
   * - 2+ high-impact news articles in the last 4 hours opposing the direction
   * - OR 1+ critical-impact news with strongly opposing sentiment (score < -0.5 for BUY, > +0.5 for SELL)
   * - News must be recent (< 4 hours old) to be relevant
   *
   * Warning criteria (proceed but log):
   * - 1 high-impact opposing news
   * - OR moderately opposing sentiment
   */
  private async _checkNewsRisk(
    pair: string,
    direction: 'BUY' | 'SELL',
  ): Promise<{
    blocked: boolean;
    warning: boolean;
    riskLevel: string;
    score: number;
    reason: string;
  }> {
    const safe = { blocked: false, warning: false, riskLevel: 'low', score: 0, reason: '' };

    try {
      const baseSymbol = pair.split('/')[0];
      const latestNews = await this.newsService.getLatestNews({
        symbol: baseSymbol,
        limit: 10,
      });

      if (!latestNews || latestNews.length === 0) return safe;

      // Only consider news from the last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const recentNews = latestNews.filter((a: any) =>
        a.publishedAt && new Date(a.publishedAt) >= fourHoursAgo
      );

      if (recentNews.length === 0) return safe;

      // Find opposing high-impact news
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

        // Is this news opposing the brief direction?
        const isOpposing = (direction === 'BUY' && sentiment < -0.2) ||
                           (direction === 'SELL' && sentiment > 0.2);

        if (isOpposing) {
          const impactWeight = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
          const timeDecay = Math.max(0.2, 1 - (hoursAgo / 4));
          const weight = impactWeight * timeDecay;

          weightedScore += Math.abs(sentiment) * weight;
          totalWeight += weight;

          if (impact === 'high') opposingHighImpact++;
          if (impact === 'high' && Math.abs(sentiment) > 0.5) opposingCriticalImpact++;
        }
      }

      const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

      // Determine blocking/warning level
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
    } catch (error: any) {
      this.logger.warn(`⚔️ V144: _checkNewsRisk error: ${error.message}`);
      return safe; // Non-blocking on error
    }
  }

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
   *
   * V126: Simplified. Uses the user's activeCredentialId directly.
   * No routing modes, no auto-routing, no credential selection logic.
   * The user chose their account in settings — we execute on it. Period.
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
      // ═══════════════════════════════════════════════════════════════
      // V126: Use the user's active credential. No routing, no choice.
      // The user selected this account in their settings — we execute on it.
      // ═══════════════════════════════════════════════════════════════
      const activeCredId = userState.activeCredentialId;
      if (!activeCredId) {
        result.error = 'No active account selected — set one in settings';
        return result;
      }

      let credential = await this.prisma.exchangeCredential.findFirst({
        where: { id: activeCredId, userId, isValid: true },
      });

      if (!credential) {
        // The active credential may have been deleted or invalidated
        this.logger.warn(`⚔️ Active credential ${activeCredId} not found or invalid for user ${userId}`);
        result.error = 'Active account no longer valid — select another in settings';
        return result;
      }

      // Determine if this is a simulated execution (paper/testnet)
      // Used only for: risk check bypass, position sizing, and notifications
      const isSimulatedExecution = credential.testnet === true ||
        this._isSimulatedExchange(credential.exchange);

      // ═══════════════════════════════════════════════════════════════════
      // V131 FIX: Check if the symbol is supported by the user's exchange.
      //
      // PROBLEM: All 3 users trade on Binance (binance_test), which ONLY
      // supports crypto pairs. The old code attempted to execute briefs for
      // AAPL, GBP/USD, etc., which always failed with:
      //   "binance does not have market symbol AAPL"
      // This wasted AI API calls, Redis idempotency locks, and executor
      // ticks — 2 out of 3 briefs per cycle were guaranteed to fail.
      //
      // FIX: Skip execution if the symbol isn't supported by the exchange.
      // The brief remains in the DB (may become executable if the user
      // switches to a different exchange that supports it), but no order
      // is dispatched and no idempotency lock is acquired.
      // ═══════════════════════════════════════════════════════════════════
      if (!isSymbolSupportedByExchange(brief.pair, credential.exchange)) {
        result.error = `الرمز ${brief.pair} غير مدعوم على ${credential.exchange} — تخطي التنفيذ`;
        this.logger.warn(
          `⚔️ V131 Symbol ${brief.pair} NOT supported on ${credential.exchange} — skipping execution for user ${userId}`,
        );
        return result;
      }

      // V146d: On SPOT exchanges, SELL requires owning the base currency.
      // You can't short-sell on spot — only sell what you already hold.
      // The Executor opens NEW positions, so SELL on spot = "go short" which
      // is impossible without margin/futures. Skip these briefs entirely.
      if (!isSimulatedExecution && brief.direction === 'SELL' &&
          credential.exchange !== 'alpaca') { // Alpaca supports short on stocks
        this.logger.debug(
          `⚔️ Skipping SELL brief ${brief.id} — ${brief.pair} SELL not possible on spot exchange ${credential.exchange}`,
        );
        result.error = `بيع ${brief.pair} غير ممكن على حساب سبوت — يحتاج حساب مارجن/فيوتشر`;
        return result;
      }

      this.logger.log(
        `⚔️ V126 Executing brief ${brief.pair} for user ${userId} ` +
        `on ${credential.exchange} (testnet=${credential.testnet || false}, simulated=${isSimulatedExecution})`,
      );

      // ── Confidence-Based Position Sizing ────────────────────────────
      // كلما ارتفعت ثقة المجلس → حجم أكبر (حد أقصى 1.5x)
      // 55-64% → 0.50x | 65-74% → 0.75x | 75-84% → 1.00x
      // 85-94% → 1.25x | 95%+   → 1.50x
      const confidenceMultiplier = (() => {
        const conf = brief.confidence ?? 70;
        if (conf >= 95) return 1.50;
        if (conf >= 85) return 1.25;
        if (conf >= 75) return 1.00;
        if (conf >= 65) return 0.75;
        return 0.50; // 55-64%
      })();

      // V177 FIX #15: Drawdown-based position sizing
      // Reduce position size during losing streaks to protect capital
      let drawdownMultiplier = 1.0;
      try {
        const recentLossesKey = `executor:recent-losses:${userId}`;
        const recentLosses = parseInt(await this.redis.get(recentLossesKey) || '0', 10);
        if (recentLosses >= 5) drawdownMultiplier = 0.25;  // 5+ losses → 25% size
        else if (recentLosses >= 3) drawdownMultiplier = 0.50;  // 3-4 losses → 50% size
        else if (recentLosses >= 2) drawdownMultiplier = 0.75;  // 2 losses → 75% size
        if (drawdownMultiplier < 1.0) {
          this.logger.debug(`⚔️ V177 Drawdown scaling: ${recentLosses} recent losses → ${drawdownMultiplier}x multiplier`);
        }
      } catch { /* non-critical */ }

      const baseRiskPercent = (userState.riskPerTradePercent || this.config.riskPerTradePercent) / 100;
      const riskPercent = baseRiskPercent * confidenceMultiplier * drawdownMultiplier;
      const riskAmount = Math.max(portfolioValue * riskPercent, 10); // minimum $10

      this.logger.log(
        `⚔️ Position sizing: confidence=${brief.confidence}% → multiplier=${confidenceMultiplier}x → risk=${(riskPercent*100).toFixed(2)}%`
      );
      const priceRisk = Math.abs(currentPrice - brief.stopLoss);

      if (priceRisk === 0) {
        result.error = 'Invalid stop loss — price risk is 0';
        this.logger.warn(`⚔️ Brief ${brief.id} has stopLoss=${brief.stopLoss} same as currentPrice=${currentPrice} — skipping`);
        return result;
      }

      // V146: Use symbol-aware position sizing with lot normalization
      const meta = getSymbolMetadata(brief.pair);
      const posResult = calculatePositionSizeFromRisk(riskAmount, currentPrice, brief.stopLoss, brief.pair);

      let quantity = posResult.quantityUnits;
      let lots = posResult.quantityLots;

      // Cap by max order value (paper: $5K or 5%, real: $10K or 2%)
      const maxOrderValue = isSimulatedExecution
        ? Math.min(5000, portfolioValue * 0.05)
        : Math.min(10000, portfolioValue * 0.02);

      if (posResult.notional > maxOrderValue) {
        // Reduce quantity to fit within max order value
        const cappedQty = maxOrderValue / currentPrice;
        lots = roundLotSize(unitsToLots(cappedQty, brief.pair), brief.pair);
        quantity = lotsToUnits(lots, brief.pair);

        this.logger.debug(
          `⚔️ Position capped by maxOrderValue: notional $${posResult.notional.toFixed(2)} > $${maxOrderValue} → reduced to ${lots} lots (${quantity.toFixed(2)} units)`
        );
      }

      // Ensure minimum order value ($10) — skip if too small
      const orderValue = calculateNotionalValue(quantity, currentPrice);
      if (orderValue < 10) {
        result.error = `Order value too small: $${orderValue.toFixed(2)} < $10 minimum`;
        this.logger.debug(`⚔️ Brief ${brief.id} order value $${orderValue.toFixed(2)} too small — skipping`);
        return result;
      }

      if (quantity <= 0) {
        result.error = 'Invalid quantity calculated';
        return result;
      }

      const margin = calculateMargin(quantity, currentPrice, brief.pair);
      this.logger.debug(
        `⚔️ Position sizing for ${brief.pair}: lots=${lots}, units=${quantity.toFixed(2)}, ` +
        `notional=$${orderValue.toFixed(2)}, margin=$${margin.toFixed(2)} (leverage ${meta.defaultLeverage}:1), ` +
        `risk=$${(quantity * priceRisk).toFixed(2)} (${((quantity * priceRisk / portfolioValue) * 100).toFixed(2)}% of portfolio)`,
      );

      // ── MARGIN CHECK: Verify available balance before submitting order ──
      // SmartExecutor previously skipped this check, causing orders to be placed
      // even when available margin was $0. Now we fetch live balance and compare.
      try {
        const balanceData = await this.credentialsService.fetchAllExchangeBalances(userId);
        const availableUsd = balanceData.totalAvailableUsd;
        if (availableUsd !== undefined && availableUsd < margin) {
          result.error = `رصيد غير كافي في ${credential.exchange} — يحتاج $${margin.toFixed(2)}، المتاح $${availableUsd.toFixed(2)}`;
          this.logger.warn(
            `⚔️ MARGIN CHECK FAILED for ${userId} on ${brief.pair}: ` +
            `needs $${margin.toFixed(2)}, available $${availableUsd.toFixed(2)} — skipping`
          );
          return result;
        }
      } catch (balErr: any) {
        // Non-fatal — log and continue (exchange API may be temporarily unavailable)
        this.logger.debug(`⚔️ Could not verify margin for ${userId}: ${balErr.message} — proceeding`);
      }

      // ✅ FIX: Route through OrderDispatcher (handles RiskGatekeeper + TradingService + idempotency).
      // This prevents conflicts between SmartExecutor and AutonomousTrader.
      if (!brief.stopLoss || brief.stopLoss <= 0) {
        result.error = 'Brief has no stop-loss — BLOCKED by safety rules';
        this.logger.warn(`⚔️ Brief ${brief.id} has no stop-loss — execution BLOCKED for user ${userId}`);
        return result;
      }
      // FIX: Recalculate SL/TP from current price if brief price is stale
      // A brief from 15 minutes ago has SL/TP based on old entry price.
      // Using stale SL/TP causes incorrect risk levels.
      const priceShift = Math.abs(currentPrice - brief.entryPrice) / brief.entryPrice;
      let execStopLoss = brief.stopLoss;
      let execTakeProfit = brief.takeProfit;
      if (priceShift > 0.001) { // Price moved more than 0.1% from brief
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
        this.logger.debug(
          `⚔️ Adjusted SL/TP for ${brief.pair}: entry ${brief.entryPrice}→${currentPrice}, ` +
          `SL ${brief.stopLoss}→${execStopLoss.toFixed(4)}, TP ${brief.takeProfit}→${execTakeProfit.toFixed(4)}`
        );
      }

      // V124: Pass isSimulatedExecution to OrderDispatcher.
      // For testnet credentials, this is true (bypass risk checks)
      // even though the execution goes through CCXT (not simulated fill).
      // TradingService determines execution path by checking credential.exchange === 'paper-trading',
      // NOT by this flag — so testnet credentials still get CCXT execution.
      // نحفظ الـ timeframe في Redis حتى يستخدمه position-monitor لـ MAX_HOLDING
      const tfKey = `smart-executor:position-tf:${userId}:${brief.pair}`;
      await this.redis.set(tfKey, brief.timeframe, 7 * 24 * 60 * 60 * 1000);

      const dispatchResult = await this.orderDispatcher.submitOrder({
        source: 'smart_executor',
        userId,
        credentialId: credential.id,
        symbol: brief.pair,
        side: brief.direction as 'BUY' | 'SELL',
        quantity,
        price: currentPrice,
        stopLoss: execStopLoss,
        takeProfit: execTakeProfit,
        briefId: brief.id,
        isPaperTrading: isSimulatedExecution,
        timeframe: brief.timeframe, // V132: Pass timeframe for smart idempotency TTL
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
          isPaperTrading: isSimulatedExecution,
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
    // ═══════════════════════════════════════════════════════════════
    // FIX: DISABLED auto-closing of paper positions on startup.
    // Previously, any paper position older than 24h was auto-closed
    // on server restart. This caused paper trades to DISAPPEAR on
    // page refresh because:
    //   1. User opens paper trade → position in DB with status=OPEN
    //   2. Server restarts (deploy, crash, etc.)
    //   3. This function closes ALL paper positions > 24h
    //   4. User refreshes page → API returns no position → DISAPPEARED
    //
    // Paper positions should only be closed when:
    // - The user manually closes them
    // - Stop-loss or take-profit is hit (monitored by _monitorOpenPositions)
    // - The position's SL/TP monitoring detects the condition
    //
    // Do NOT auto-close based on age alone. A position that has been
    // open for 48 hours with a valid SL/TP is a LEGITIMATE position.
    // ═══════════════════════════════════════════════════════════════
    this.logger.log('⚔️ Auto-close stale paper positions: DISABLED (positions kept until SL/TP hit or manual close)');
    return 0;
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
      if (userState?.activeCredentialId) {
        // Check if the active credential is simulated
        const cred = await this.prisma.exchangeCredential.findFirst({
          where: { id: userState.activeCredentialId, userId },
          select: { testnet: true, exchange: true },
        });
        if (cred && (cred.testnet || this._isSimulatedExchange(cred.exchange))) {
          return await this._getPaperPortfolioValue(userId);
        }
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
  /**
   * V124: Determine if an exchange name represents a simulated environment.
   * Same logic as RiskGatekeeper._isTestExchange() — checks for test/demo/paper
   * patterns in the exchange name string.
   */
  private _isSimulatedExchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    const exactMatches = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'];
    if (exactMatches.includes(lower)) return true;
    const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
    if (suffixes.some(s => lower.endsWith(s))) return true;
    if (lower.includes('testnet')) return true;
    return false;
  }

  /**
   * FIX V118: Select the best exchange credential for a given symbol.
   * Routes based on symbol type:
   *   - Crypto pairs (BTC/USDT, ETH/USD, etc.) → crypto exchanges (Binance, KuCoin, Bybit, OKX, Gate.io)
   *   - Stock symbols (AAPL, TSLA, etc.) → stock exchanges (Alpaca)
   *   - Forex/XAU → any available real credential (best effort)
   *
   * Priority: non-testnet credentials first, then testnet.
   * Among same-priority credentials, the most recently validated one wins.
   */
  private async _selectBestCredential(userId: string, symbol: string): Promise<any | null> {
    // Get all valid real (non-paper) credentials for this user
    const credentials = await this.prisma.exchangeCredential.findMany({
      where: {
        userId,
        isValid: true,
        exchange: { not: 'paper-trading' },
      },
      orderBy: [
        { testnet: 'asc' },        // Prefer non-testnet (production) credentials
        { lastValidatedAt: 'desc' }, // Most recently validated first
      ],
    });

    if (credentials.length === 0) return null;

    // ── Symbol-to-exchange routing ──
    const symbolUpper = symbol.toUpperCase();

    // Crypto pairs: contain / or end with USDT/USD/BTC/ETH
    const isCryptoPair = symbolUpper.includes('/') ||
      /USDT$|BUSD$|BTC$|ETH$/.test(symbolUpper);
    const isCryptoBase = /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK|UNI|ATOM|LTC|FIL|NEAR|ALGO|FTM|AAVE|MKR|SAND|MANA|AXS|GRT|ENJ|CHZ|COMP|SNX|YFI|CRV|BAL|SUSHI|1INCH|ZRX|REN|KNC|OMG|BAND|RNDR|INJ|SUI|SEI|APT|ARB|OP|MANTA|STRK|JUP|WIF|PEPE|BONK|FLOKI|SHIB|PEPE|FET|RENDER|TON|KAS|TIA|IMX|STX|RUNE|THETA|FTM|NEAR|ALGO|VET|ICP|HBAR|EGLD|XTZ|SAND|MANA|AXS|GRT)/.test(symbolUpper.split('/')[0]);

    // Stock symbols: typically 1-5 uppercase letters, no /
    const isStockSymbol = !symbolUpper.includes('/') &&
      /^[A-Z]{1,5}$/.test(symbolUpper) &&
      !isCryptoBase;

    // Forex / XAU
    const isForexOrMetal = /^(EUR|GBP|JPY|AUD|NZD|CAD|CHF|XAU|XAG)/.test(symbolUpper) ||
      /USD$|EUR$|GBP$|JPY$/.test(symbolUpper);

    // Crypto exchanges
    const cryptoExchanges = ['binance', 'kucoin', 'bybit', 'okx', 'gateio', 'binance_test', 'binance_future_test'];

    // Stock exchanges
    const stockExchanges = ['alpaca'];

    if (isCryptoPair || isCryptoBase) {
      // Route to crypto exchange
      const match = credentials.find(c => cryptoExchanges.includes(c.exchange.toLowerCase()));
      if (match) {
        this.logger.debug(`⚔️ V118 Routed ${symbol} → ${match.exchange} (crypto)`);
        return match;
      }
    }

    if (isStockSymbol) {
      // Route to stock exchange
      const match = credentials.find(c => stockExchanges.includes(c.exchange.toLowerCase()));
      if (match) {
        this.logger.debug(`⚔️ V118 Routed ${symbol} → ${match.exchange} (stock)`);
        return match;
      }
    }

    // For forex/metals/unknown, try any real credential (best effort)
    // Prefer non-testnet
    const nonTestnet = credentials.find(c => !c.testnet);
    if (nonTestnet) {
      this.logger.debug(`⚔️ V118 Routed ${symbol} → ${nonTestnet.exchange} (best-effort, non-testnet)`);
      return nonTestnet;
    }

    // Use first available (might be testnet)
    const first = credentials[0];
    this.logger.debug(`⚔️ V118 Routed ${symbol} → ${first.exchange} (best-effort, testnet)`);
    return first;
  }

  private async _getPaperPortfolioValue(userId: string): Promise<number> {
    // V172d: paperBalance is now FREE CASH (margin deducted on open).
    // Portfolio value = freeCash + lockedMargin + unrealizedPnL = full equity.
    // We approximate: equity ≈ freeCash + lockedMargin (skip unrealizedPnL for simplicity).
    try {
      const settings = await this.prisma.agentSettings.findUnique({
        where: { userId },
        select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
      });
      const freeCash = settings ? Number(settings.paperBalance) : 10000;

      // Calculate locked margin from open positions
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
        if (meta.assetClass === AssetClass.FOREX) leverage = forexLev;
        else if (meta.assetClass === AssetClass.COMMODITY) leverage = goldLev;
        const notional = qty * entry;
        lockedMargin += leverage > 1 ? notional / leverage : notional;
        unrealizedPnl += pos.side === 'BUY' ? (current - entry) * qty : (entry - current) * qty;
      }

      const equity = freeCash + lockedMargin + unrealizedPnl;
      return equity > 0 ? equity : 10000;
    } catch {
      return 10000;
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
              const portfolioValue = (cred.testnet || this._isSimulatedExchange(cred.exchange)) ? await this._getPaperPortfolioValue(testUserId) : 0;
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

  async closePosition(userId: string, positionId: string, closeReason: string): Promise<void> {
    await this.tradingService.closePositionWithRetry(userId, { positionId, closeReason });
  }

}
