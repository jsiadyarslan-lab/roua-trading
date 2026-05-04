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
import { OrderSideEnum, OrderTypeEnum } from '../../trading/events/order.events';

@Injectable()
export class SmartExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(SmartExecutorService.name);

  /** Executor state */
  private isRunning = false;
  private startedAt: Date | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private totalExecutions = 0;

  /** Configuration */
  private readonly config: ExecutorConfig = {
    tickIntervalMs: 2000,           // 2 seconds (more reasonable than 1s)
    maxOpenPositions: 5,
    maxDailyLossPercent: 5,
    defaultSlippage: 0.001,         // 0.1%
    riskPerTradePercent: 1,
    minConfidence: 70,
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
  ) {
    this.logger.log('⚔️ Smart Executor initialized — awaiting activation (with RiskGatekeeper)');
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
  async getStatus(): Promise<ExecutorStatus> {
    let todayExecutions = 0;
    let todayPnL = 0;
    let openPositions = 0;
    let activeBriefs = 0;

    try {
      // Count today's executions from audit log
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayLogs = await this.prisma.auditLog.findMany({
        where: {
          action: 'SMART_EXECUTOR_TRADE',
          createdAt: { gte: startOfDay },
        },
      });
      todayExecutions = todayLogs.length;

      // Count open positions (system-level)
      openPositions = await this.prisma.position.count({
        where: { status: 'OPEN' },
      });

      // Count active briefs
      activeBriefs = await this.councilService.getActiveBriefsCount();
    } catch {
      // Ignore DB errors in status
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
   * Get open positions managed by the executor
   */
  async getOpenPositions(): Promise<any[]> {
    try {
      return await this.prisma.position.findMany({
        where: { status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
    } catch {
      return [];
    }
  }

  /**
   * Get all users with executor enabled
   */
  private async _getEnabledUsers(): Promise<string[]> {
    try {
      const client = (this.redis as any)['client'];
      const keys: string[] = [];
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'MATCH', `${this.REDIS_USER_STATE_PREFIX}*`, 'COUNT', 100);
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0');

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
      if (!this.isRunning) return;

      try {
        await this._tick();
      } catch (error: any) {
        this.logger.error(`⚔️ Tick error: ${error.message}`);
      }
    }, this.config.tickIntervalMs);
  }

  /**
   * Single tick: Get active briefs, find enabled users, check conditions per user
   */
  private async _tick(): Promise<void> {
    // Get active briefs from the Strategic Council
    const activeBriefs = await this.councilService.getActiveBriefs();

    if (activeBriefs.length === 0) {
      return; // No briefs to execute
    }

    // Get users with executor enabled
    const enabledUsers = await this._getEnabledUsers();

    if (enabledUsers.length === 0) {
      return; // No users to execute for
    }

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
        continue;
      }

      // Skip if user already has position for this pair
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId, symbol: brief.pair, status: 'OPEN' },
      });
      if (existingPosition) continue;

      // Check confidence threshold
      if (brief.confidence < this.config.minConfidence) continue;

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
    // 1. Get current price
    let currentPrice: number;
    try {
      const quote = await this.exchangeService.getQuote(brief.pair);
      currentPrice = quote.price;
    } catch {
      return; // Can't get price — skip
    }

    // 2. Check strict rules
    const strictRules: StrictRules = brief.strictRules || { maxSlippage: this.config.defaultSlippage };

    // Check max entry price (for BUY — don't buy above this)
    if (strictRules.maxEntryPrice && currentPrice > strictRules.maxEntryPrice) {
      // Price too high — brief violated for now, but don't cancel (may come back in range)
      return;
    }

    // Check min entry price (for SELL — don't sell below this)
    if (strictRules.minEntryPrice && currentPrice < strictRules.minEntryPrice) {
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
    const slippage = strictRules.maxSlippage || this.config.defaultSlippage;

    if (brief.direction === 'BUY') {
      // For BUY: current price should be at or near the entry price
      const maxPrice = brief.entryPrice * (1 + slippage);
      return currentPrice <= maxPrice;
    } else {
      // For SELL: current price should be at or near the entry price
      const minPrice = brief.entryPrice * (1 - slippage);
      return currentPrice >= minPrice;
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
        return result;
      }

      // Calculate position size based on risk
      const riskPercent = (userState.riskPerTradePercent || this.config.riskPerTradePercent) / 100;
      const riskAmount = Math.max(portfolioValue * riskPercent, 10); // minimum $10
      const priceRisk = Math.abs(currentPrice - brief.stopLoss);

      if (priceRisk === 0) {
        result.error = 'Invalid stop loss — price risk is 0';
        return result;
      }

      const quantity = parseFloat((riskAmount / priceRisk).toFixed(6));

      if (quantity <= 0) {
        result.error = 'Invalid quantity calculated';
        return result;
      }

      // Place the order via TradingService (proper risk checks, CCXT execution, etc.)
      const orderRequest: PlaceOrderRequest = {
        credentialId: credential.id,
        symbol: brief.pair,
        side: brief.direction === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        type: OrderType.MARKET,
        quantity,
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
        stopLoss: brief.stopLoss,
        idempotencyKey: `smart-exec-${brief.id}-${userId}`,
      });

      if (!riskResult.allowed) {
        result.error = `Risk gatekeeper blocked: ${riskResult.reason || 'Unknown risk'}`;
        this.logger.warn(`⚔️ Risk gatekeeper BLOCKED execution of brief ${brief.id} for user ${userId}: ${riskResult.reason}`);
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
      return summary.totalValue || 0;
    } catch {
      return 0;
    }
  }
}
