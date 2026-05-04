// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الجندي في الميدان" — يراقب الأسعار باستمرار
// وينفذ الصفقات فوراً عندما تتحقق الشروط.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AuditService } from '../../../audit/audit.service';
import { StrategicCouncilService } from '../strategic-council/strategic-council.service';
import { TradingBriefDTO, StrictRules } from '../strategic-council/strategic-council.types';
import { ExecutorStatus, ExecutionResult, ExecutorConfig } from './smart-executor.types';

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
    tickIntervalMs: 1000,          // 1 second
    maxOpenPositions: 5,
    maxDailyLossPercent: 5,
    defaultSlippage: 0.001,        // 0.1%
  };

  /** Track processed brief IDs to avoid double execution */
  private readonly processedBriefIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    private readonly audit: AuditService,
    private readonly councilService: StrategicCouncilService,
  ) {
    this.logger.log('⚔️ Smart Executor initialized — awaiting activation');
  }

  // ── Lifecycle ──

  onModuleDestroy() {
    this.stop();
  }

  // ── Control Methods ──

  /**
   * Start the Smart Executor
   * Begins the price monitoring loop
   */
  async start(userId?: string): Promise<ExecutorStatus> {
    if (this.isRunning) {
      this.logger.warn('⚔️ Smart Executor is already running');
      return this.getStatus();
    }

    this.isRunning = true;
    this.startedAt = new Date();
    this.processedBriefIds.clear();

    this.logger.log('⚔️ Smart Executor ACTIVATED — monitoring prices every second');

    // Start the tick loop
    this._startTickLoop();

    await this.audit.log({
      userId: userId || 'system',
      action: 'SMART_EXECUTOR_START',
      resource: 'smart-executor',
      details: JSON.stringify({ startedAt: this.startedAt }),
    });

    return this.getStatus();
  }

  /**
   * Stop the Smart Executor
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

    await this.audit.log({
      userId: userId || 'system',
      action: 'SMART_EXECUTOR_STOP',
      resource: 'smart-executor',
      details: JSON.stringify({ stoppedAt: new Date() }),
    });

    return this.getStatus();
  }

  /**
   * Get current executor status
   */
  async getStatus(): Promise<ExecutorStatus> {
    let todayExecutions = 0;
    let todayPnL = 0;
    let openPositions = 0;

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
    } catch {
      // Ignore DB errors in status
    }

    // Check if daily loss limit reached
    const dailyLossLimitReached = await this._isDailyLossLimitReached();

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

  // ── Core: Tick Loop ──

  /**
   * Start the monitoring tick loop
   * Each tick: read active briefs → check prices → execute if conditions met
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
   * Single tick: Check all active briefs against current prices
   */
  private async _tick(): Promise<void> {
    // Safety check: daily loss limit
    if (await this._isDailyLossLimitReached()) {
      this.logger.warn('⚔️ Daily loss limit reached — pausing execution');
      return;
    }

    // Safety check: max open positions
    const openPositionsCount = await this.prisma.position.count({
      where: { status: 'OPEN' },
    });
    if (openPositionsCount >= this.config.maxOpenPositions) {
      return; // Silently skip — no need to log every second
    }

    // Get active briefs from the Strategic Council
    const activeBriefs = await this.councilService.getActiveBriefs();

    if (activeBriefs.length === 0) {
      return; // No briefs to execute
    }

    // Check each brief
    for (const brief of activeBriefs) {
      // Skip already processed briefs
      if (this.processedBriefIds.has(brief.id)) {
        continue;
      }

      try {
        await this._checkBrief(brief);
      } catch (error: any) {
        this.logger.error(`⚔️ Error checking brief ${brief.id}: ${error.message}`);
      }
    }
  }

  /**
   * Check if a brief's entry conditions are met
   */
  private async _checkBrief(brief: TradingBriefDTO): Promise<void> {
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
      // Price too high — brief violated
      await this._cancelBrief(brief.id, 'Price exceeded maxEntryPrice');
      return;
    }

    // Check min entry price (for SELL — don't sell below this)
    if (strictRules.minEntryPrice && currentPrice < strictRules.minEntryPrice) {
      // Price too low — brief violated
      await this._cancelBrief(brief.id, 'Price below minEntryPrice');
      return;
    }

    // 3. Check if entry conditions are met
    const conditionsMet = this._areEntryConditionsMet(brief, currentPrice, strictRules);

    if (conditionsMet) {
      // EXECUTE THE TRADE!
      const result = await this._executeBrief(brief, currentPrice);

      if (result.success) {
        this.processedBriefIds.add(brief.id);
        this.totalExecutions++;

        this.logger.log(
          `⚔️ EXECUTED: ${brief.direction} ${brief.pair} @ ${currentPrice} ` +
          `(brief: ${brief.id}, order: ${result.orderId})`,
        );
      }
    }
    // If conditions not met — just wait for the next tick
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
      // Allow entry if price is within slippage range of entry price
      const maxPrice = brief.entryPrice * (1 + slippage);
      return currentPrice <= maxPrice;
    } else {
      // For SELL: current price should be at or near the entry price
      const minPrice = brief.entryPrice * (1 - slippage);
      return currentPrice >= minPrice;
    }
  }

  /**
   * Execute a brief — place the actual order
   * Uses the existing Trading infrastructure
   */
  private async _executeBrief(brief: TradingBriefDTO, currentPrice: number): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: false,
      briefId: brief.id,
      pair: brief.pair,
      direction: brief.direction,
      entryPrice: currentPrice,
      executedAt: new Date(),
    };

    try {
      // Find a valid exchange credential with trade permission
      // The executor uses the first available credential
      const credential = await this.prisma.exchangeCredential.findFirst({
        where: {
          isValid: true,
          permissions: { contains: 'trade' },
        },
      });

      if (!credential) {
        result.error = 'No valid trading credential found';
        this.logger.warn(`⚔️ Cannot execute brief ${brief.id}: no valid trading credential`);
        return result;
      }

      // Calculate position size (1% of portfolio value — conservative)
      const portfolioAssets = await this.prisma.portfolioAsset.findMany({
        where: { portfolio: { userId: credential.userId } },
      });
      const totalValue = portfolioAssets.reduce(
        (sum, a) => sum + Number(a.quantity) * (Number(a.currentPrice) || Number(a.avgPrice) || 0),
        0,
      );
      const positionSize = Math.max(
        (totalValue * 0.01) / currentPrice, // 1% of portfolio
        0.00001, // minimum
      );

      // Create the order via Prisma (directly, to use the existing Order model)
      const order = await this.prisma.order.create({
        data: {
          userId: credential.userId,
          exchangeCredentialId: credential.id,
          exchange: credential.exchange,
          symbol: brief.pair,
          side: brief.direction as any,
          type: 'MARKET' as any,
          status: 'PENDING' as any,
          quantity: positionSize,
          stopLoss: brief.stopLoss,
          takeProfit: brief.takeProfit,
          idempotencyKey: `executor-${brief.id}-${Date.now()}`,
        },
      });

      result.success = true;
      result.orderId = order.id;

      // Audit log for the execution
      await this.audit.log({
        userId: credential.userId,
        action: 'SMART_EXECUTOR_TRADE',
        resource: 'smart-executor',
        details: JSON.stringify({
          briefId: brief.id,
          orderId: order.id,
          pair: brief.pair,
          direction: brief.direction,
          entryPrice: currentPrice,
          stopLoss: brief.stopLoss,
          takeProfit: brief.takeProfit,
          quantity: positionSize,
          confidence: brief.confidence,
          timeframe: brief.timeframe,
        }),
      });

      // Mark the brief as executed (deactivate it)
      await this.prisma.tradingBrief.update({
        where: { id: brief.id },
        data: {
          isActive: false,
          reviewStatus: 'CANCELLED',
        },
      });
    } catch (error: any) {
      result.error = error.message;
      this.logger.error(`⚔️ Execution failed for brief ${brief.id}: ${error.message}`);
    }

    return result;
  }

  /**
   * Cancel a brief that violated strict rules
   */
  private async _cancelBrief(briefId: string, reason: string): Promise<void> {
    try {
      await this.prisma.tradingBrief.update({
        where: { id: briefId },
        data: {
          isActive: false,
          reviewStatus: 'CANCELLED',
        },
      });

      this.processedBriefIds.add(briefId); // Don't check again

      this.logger.warn(`⚔️ Brief ${briefId} cancelled: ${reason}`);
    } catch (error: any) {
      this.logger.error(`Failed to cancel brief ${briefId}: ${error.message}`);
    }
  }

  /**
   * Check if daily loss limit has been reached
   */
  private async _isDailyLossLimitReached(): Promise<boolean> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // Sum today's closed position PnL
      const result = await this.prisma.position.aggregate({
        where: {
          status: 'CLOSED',
          closedAt: { gte: startOfDay },
        },
        _sum: { realizedPnl: true },
      });

      const dailyPnL = Number(result._sum.realizedPnl || 0);

      // Get approximate portfolio value
      const totalPortfolioValue = 10000; // Default fallback

      const maxDailyLoss = totalPortfolioValue * (this.config.maxDailyLossPercent / 100);

      return dailyPnL < 0 && Math.abs(dailyPnL) >= maxDailyLoss;
    } catch {
      return false; // If we can't check, allow trading
    }
  }
}
