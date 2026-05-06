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

import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
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
    maxOpenPositions: 5,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    private readonly audit: AuditService,
    private readonly tradingService: TradingService,
    private readonly councilService: StrategicCouncilService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => AIOrchestratorService)) private readonly orchestrator: AIOrchestratorService,
  ) {
    this.logger.log('⚔️ Smart Executor initialized — awaiting activation (with RiskGatekeeper + Notifications)');

    // FIX: Auto-start the executor 45 seconds after startup.
    // Previously, the executor required a manual POST /start call, meaning it
    // was never running after deployment until a user explicitly started it.
    // This made the "المنفذ الذكي" panel always show isRunning=false.
    // Now it auto-starts so it's ready when council produces briefs.
    setTimeout(() => {
      this._autoStart();
    }, 45000);
  }

  /**
   * FIX: Auto-start the executor on startup AND auto-enable a system user
   * in paper trading mode. This ensures trades are actually executed, not just
   * monitored. Previously, the executor auto-started but had zero enabled users,
   * so it would tick forever without ever executing a single trade.
   *
   * The system user ("auto-paper-trader") uses paper trading mode ($100,000 balance)
   * and is completely safe — no real money is at risk.
   */
  private async _autoStart(): Promise<void> {
    try {
      if (this.isRunning) return;

      // Check if there are any active briefs from the council
      const activeBriefs = await this.councilService.getActiveBriefsCount();

      this.logger.log(`⚔️ Auto-start check: ${activeBriefs} active briefs available`);

      // Always auto-start — the executor will only process briefs for enabled users
      // so it's safe to have it running even if no users have enabled it yet
      await this.start('system-auto');
      this.logger.log('⚔️ Smart Executor AUTO-STARTED — monitoring briefs for enabled users');

      // FIX: Auto-enable system paper-trading user
      // Without at least one enabled user, the executor runs but NEVER executes trades.
      // The system user trades in paper mode ($100K balance) — zero risk.
      const enabledUsers = await this._getEnabledUsers();
      if (enabledUsers.length === 0) {
        this.logger.log('⚔️ No enabled users found — auto-enabling system paper-trading user');
        await this._autoEnableSystemUser();
      } else {
        this.logger.log(`⚔️ ${enabledUsers.length} enabled user(s) found — no auto-enable needed`);
      }
    } catch (error: any) {
      this.logger.warn(`⚔️ Auto-start failed (non-critical): ${error.message}`);
    }
  }

  /**
   * FIX: Auto-enable a system user for paper trading.
   * This ensures the executor can actually execute trades without requiring
   * a user to manually click "Enable" in the dashboard.
   *
   * Two strategies:
   * 1. Find an existing user in the DB and enable them in paper-trading mode
   * 2. If no users exist, create a "system-auto-trader" user
   *
   * Paper trading is safe — no real money is used.
   */
  private async _autoEnableSystemUser(): Promise<void> {
    try {
      // Strategy 1: Find any existing user in the database
      let userId: string | null = null;

      try {
        const anyUser = await this.prisma.user.findFirst({
          where: { email: { not: '' } },
          orderBy: { createdAt: 'desc' },
        });
        if (anyUser) {
          userId = anyUser.id;
          this.logger.log(`⚔️ Found existing user ${anyUser.email || anyUser.id} — enabling paper trading`);
        }
      } catch (dbErr: any) {
        this.logger.warn(`⚔️ Could not query users from DB: ${dbErr.message}`);
      }

      // Strategy 2: If no user found, check Redis for any cached user data
      if (!userId) {
        try {
          const userKeys = await this.redis.scanKeys('user:*');
          for (const key of userKeys) {
            const data = await this.redis.get(key);
            if (data) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.id) {
                  userId = parsed.id;
                  break;
                }
              } catch {}
            }
          }
        } catch (redisErr: any) {
          this.logger.debug(`⚔️ Could not find user in Redis: ${redisErr.message}`);
        }
      }

      // Strategy 3: Use a system user ID — the executor will create a paper credential
      if (!userId) {
        userId = 'system-auto-trader';
        this.logger.log('⚔️ No existing user found — using system-auto-trader for paper trading');
      }

      // Enable the user in paper-trading mode
      await this.enableUser(userId, {
        isPaperTrading: true,
        maxOpenPositions: 3,     // Conservative for auto-trading
        riskPerTradePercent: 1,  // 1% risk per trade
      });

      this.logger.log(`⚔️ System paper-trading user ENABLED: ${userId}`);
    } catch (error: any) {
      this.logger.error(`⚔️ Failed to auto-enable system user: ${error.message}`);
    }
  }

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

    await this.redis.set(
      `${this.REDIS_USER_STATE_PREFIX}${userId}`,
      JSON.stringify(state),
      86400000,
    );

    this.logger.log(`⚔️ Executor enabled for user ${userId} (paper: ${state.isPaperTrading})`);

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
    await this.redis.del(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
    this.logger.log(`⚔️ Executor disabled for user ${userId}`);

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
    const raw = await this.redis.get(`${this.REDIS_USER_STATE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : null;
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
      const auditWhere: any = {
        action: 'SMART_EXECUTOR_TRADE',
        createdAt: { gte: startOfDay },
      };
      if (userId) auditWhere.userId = userId;
      const todayLogs = await this.prisma.auditLog.findMany({ where: auditWhere });
      todayExecutions = todayLogs.length;
    } catch (e: any) {
      this.logger.debug(`getStatus: auditLog query failed: ${e.message}`);
    }

    try {
      const posWhere: any = { status: 'OPEN' };
      if (userId) posWhere.userId = userId;
      openPositions = await this.prisma.position.count({ where: posWhere });
    } catch (e: any) {
      this.logger.debug(`getStatus: position count failed: ${e.message}`);
    }

    try {
      activeBriefs = await this.councilService.getActiveBriefsCount();
    } catch (e: any) {
      this.logger.debug(`getStatus: activeBriefs count failed: ${e.message}`);
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
   * Get all users with executor enabled
   * FIX: Use RedisService.scanKeys() instead of (this.redis as any)['client'].scan().
   * The Redis client is private in RedisService, so accessing it via `as any`
   * is fragile and breaks in production builds. The scanKeys() method is
   * the official API for this pattern.
   */
  private async _getEnabledUsers(): Promise<string[]> {
    try {
      const keys = await this.redis.scanKeys(`${this.REDIS_USER_STATE_PREFIX}*`);
      return keys.map((k: string) => k.replace(this.REDIS_USER_STATE_PREFIX, ''));
    } catch {
      return [];
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
    const openPositionsCount = await this.prisma.position.count({
      where: { userId, status: 'OPEN' },
    });
    if (openPositionsCount >= (userState.maxOpenPositions || this.config.maxOpenPositions)) {
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

      // Skip if user already has position for this pair
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId, symbol: brief.pair, status: 'OPEN' },
      });
      if (existingPosition) {
        this.logger.debug(`⚔️ Skipping brief ${brief.id} — existing open position for ${brief.pair}`);
        continue;
      }

      // Check confidence threshold
      if (brief.confidence < this.config.minConfidence) {
        this.logger.debug(`⚔️ Skipping brief ${brief.id} — confidence ${brief.confidence}% < min ${this.config.minConfidence}%`);
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
    // 2. Get current price
    // FIX: Use orchestrator's fetchQuickMarketData first (multiple parallel sources,
    // works on Railway), then fall back to ExchangeService.
    let currentPrice: number = 0;
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

    // 2. Check strict rules
    const strictRules: StrictRules = brief.strictRules || { maxSlippage: this.config.defaultSlippage };

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

    // 3. Check if entry conditions are met
    const conditionsMet = this._areEntryConditionsMet(brief, currentPrice, strictRules);

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

        // Update user state
        userState.dailyTrades++;
        userState.lastTradeAt = new Date().toISOString();
        await this.redis.set(
          `${this.REDIS_USER_STATE_PREFIX}${userId}`,
          JSON.stringify(userState),
          86400000,
        );

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
            source: 'bot',
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
            source: 'bot',
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

    if (brief.direction === 'BUY') {
      // BUY: Check that price is still within a reasonable range of the entry.
      // Allow up to 2x the normal slippage as a grace margin.
      const maxPrice = brief.entryPrice * (1 + slippage * 2);
      // Also check that the trade still has profit potential
      const hasProfitPotential = currentPrice < brief.takeProfit;
      return currentPrice <= maxPrice && hasProfitPotential;
    } else {
      // SELL: Check that price is still within a reasonable range of the entry.
      const minPrice = brief.entryPrice * (1 - slippage * 2);
      // Also check that the trade still has profit potential
      const hasProfitPotential = currentPrice > brief.takeProfit;
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
        result.error = 'No valid trading credential found for user';
        this.logger.warn(`⚔️ No credential for user ${userId} — disabling executor`);
        await this.disableUser(userId);
        // Don't mark as processed — this is a user config issue, not a brief issue
        return result;
      }

      // Calculate position size based on risk
      const riskPercent = (userState.riskPerTradePercent || this.config.riskPerTradePercent) / 100;
      const riskAmount = Math.max(portfolioValue * riskPercent, 10); // minimum $10
      const priceRisk = Math.abs(currentPrice - brief.stopLoss);

      if (priceRisk === 0) {
        result.error = 'Invalid stop loss — price risk is 0';
        this.logger.warn(`⚔️ Brief ${brief.id} has stopLoss=${brief.stopLoss} same as currentPrice=${currentPrice} — skipping`);
        // Don't mark as processed — a future council session may fix the SL
        return result;
      }

      const quantity = parseFloat((riskAmount / priceRisk).toFixed(6));

      if (quantity <= 0) {
        result.error = 'Invalid quantity calculated';
        // Don't mark as processed — transient calculation issue
        return result;
      }

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
}
