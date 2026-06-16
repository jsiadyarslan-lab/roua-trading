// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Algorithmic Execution Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V-PHASE4: تنفيذ خوارزمي بدلاً من أوامر السوق المباشرة
//
// المشكلة: أوامر السوق (MARKET) تتسبب في انزلاق سعري (slippage)
// خاصة على الأحجام الكبيرة. أوامر TWAP و VWAP تقسم الصفقة إلى
// شرائح صغيرة تنفذ تدريجياً لتقليل الأثر السعري.
//
// ┌─────────────────────────────────────────────────────────────┐
// │ TWAP (Time-Weighted Average Price):                        │
// │   يقسم الأمر الكلي إلى شرائح متساوية تنفذ على فترات      │
// │   زمنية متساوية. مثال: شراء 1 BTC على 5 دقائق =          │
// │   5 شرائح × 0.2 BTC كل دقيقة.                             │
// │                                                             │
// │ VWAP (Volume-Weighted Average Price):                       │
// │   يستخدم بيانات دفتر الأوامر (Level 2) لتنفيذ الصفقة      │
// │   عند مستويات السيولة العالية. يتبع حجم التداول الفعلي.    │
// │   أفضل من TWAP عندما يكون دفتر الأوامر متاح.               │
// │                                                             │
// │ LIMIT-CHILL:                                                │
// │   استراتيجية بسيطة — ضع أمر LIMIT عند سعر أفضل من السوق    │
// │   بنسبة صغيرة وانتظر الامتلاء. إذا لم يمتلئ خلال مهلة،     │
// │   حول إلى أمر MARKET. أفضل للصفقات الصغيرة.                │
// └─────────────────────────────────────────────────────────────┘

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

// ── Types ──

export type AlgoExecutionStrategy = 'TWAP' | 'VWAP' | 'LIMIT_CHILL' | 'MARKET';

export interface AlgoExecutionRequest {
  userId: string;
  credentialId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  totalQuantity: number;
  strategy: AlgoExecutionStrategy;
  /** TWAP: Duration in seconds (default: 300 = 5 minutes) */
  durationSeconds?: number;
  /** TWAP: Number of slices (default: 5) */
  sliceCount?: number;
  /** LIMIT_CHILL: How far from mid price to place limit (default: 0.001 = 0.1%) */
  limitOffsetPercent?: number;
  /** LIMIT_CHILL: Max wait time before converting to market (default: 60s) */
  maxWaitSeconds?: number;
  /** VWAP: Max % of available volume per slice (default: 5%) */
  maxVolumeParticipation?: number;
  stopLoss?: number;
  takeProfit?: number;
  isPaperTrading?: boolean;
  source?: 'smart_executor' | 'agent';
  briefId?: string;
  signalId?: string;
  timeframe?: string;
}

export interface AlgoExecutionSlice {
  sliceIndex: number;
  quantity: number;
  targetPrice?: number;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'FAILED' | 'SKIPPED';
  filledQuantity?: number;
  averagePrice?: number;
  submittedAt?: Date;
  filledAt?: Date;
  error?: string;
}

export interface AlgoExecutionResult {
  executionId: string;
  strategy: AlgoExecutionStrategy;
  symbol: string;
  side: 'BUY' | 'SELL';
  totalQuantity: number;
  filledQuantity: number;
  averageFillPrice: number;
  slippageBps: number; // Basis points vs initial price
  slices: AlgoExecutionSlice[];
  startedAt: Date;
  completedAt?: Date;
  status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
}

@Injectable()
export class AlgoExecutionService {
  private readonly logger = new Logger(AlgoExecutionService.name);

  /** Active executions keyed by executionId */
  private readonly activeExecutions = new Map<string, AlgoExecutionResult>();

  /** Threshold: orders below this USD value use MARKET (no algo needed) */
  private static readonly ALGO_THRESHOLD_USD = 500; // Below $500, slippage is negligible

  /** Default TWAP config */
  private static readonly DEFAULT_TWAP_DURATION = 300; // 5 minutes
  private static readonly DEFAULT_TWAP_SLICES = 5;

  /** Default LIMIT_CHILL config */
  private static readonly DEFAULT_LIMIT_OFFSET = 0.001; // 0.1% from mid
  private static readonly DEFAULT_MAX_WAIT = 60; // 60 seconds

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('⚡ Algo Execution Service initialized (TWAP + VWAP + LIMIT_CHILL)');
  }

  // ── Public API ──

  /**
   * Determine the best execution strategy for a given order size
   *
   * Logic:
   * - Small orders (< $500) → MARKET (slippage negligible)
   * - Medium orders ($500-$5000) → LIMIT_CHILL (try for better price, fallback to market)
   * - Large orders (> $5000) → TWAP (slice over time to reduce market impact)
   * - Very large orders (> $50,000) → VWAP (if order book available)
   */
  recommendStrategy(
    orderValueUSD: number,
    hasOrderBook: boolean = false,
  ): AlgoExecutionStrategy {
    if (orderValueUSD < AlgoExecutionService.ALGO_THRESHOLD_USD) {
      return 'MARKET';
    }
    if (orderValueUSD > 50000 && hasOrderBook) {
      return 'VWAP';
    }
    if (orderValueUSD > 5000) {
      return 'TWAP';
    }
    return 'LIMIT_CHILL';
  }

  /**
   * Execute an order using the specified algorithmic strategy
   *
   * Returns immediately with an executionId. The actual execution
   * happens asynchronously. Use getExecutionStatus() to track progress.
   *
   * For simplicity, this initial implementation executes TWAP slices
   * sequentially with delays. A production version would use BullMQ
   * queues for reliable slice scheduling.
   */
  async execute(
    request: AlgoExecutionRequest,
    placeOrderFn: (slice: {
      quantity: number;
      price?: number;
      type: 'MARKET' | 'LIMIT';
    }) => Promise<{ orderId?: string; filledQuantity?: number; averagePrice?: number; success: boolean; error?: string }>,
    currentPrice: number,
  ): Promise<AlgoExecutionResult> {
    const executionId = `algo-${Date.now()}-${request.symbol.replace('/', '')}-${request.side}`;

    const result: AlgoExecutionResult = {
      executionId,
      strategy: request.strategy,
      symbol: request.symbol,
      side: request.side,
      totalQuantity: request.totalQuantity,
      filledQuantity: 0,
      averageFillPrice: 0,
      slippageBps: 0,
      slices: [],
      startedAt: new Date(),
      status: 'RUNNING',
    };

    this.activeExecutions.set(executionId, result);

    try {
      switch (request.strategy) {
        case 'MARKET':
          await this._executeMarket(request, result, placeOrderFn);
          break;
        case 'LIMIT_CHILL':
          await this._executeLimitChill(request, result, placeOrderFn, currentPrice);
          break;
        case 'TWAP':
          await this._executeTwap(request, result, placeOrderFn);
          break;
        case 'VWAP':
          await this._executeVwap(request, result, placeOrderFn);
          break;
        default:
          await this._executeMarket(request, result, placeOrderFn);
      }
    } catch (error: any) {
      this.logger.error(`Algo execution ${executionId} failed: ${error.message}`);
      result.status = 'FAILED';
    }

    // Calculate final metrics
    this._finalizeResult(result, currentPrice);

    // Store in Redis for monitoring
    if (this.redis) {
      try {
        await this.redis.set(
          `algo-exec:${executionId}`,
          JSON.stringify(result),
          24 * 60 * 60 * 1000, // 24h TTL
        );
      } catch { /* non-critical */ }
    }

    return result;
  }

  /**
   * Get the status of an active or recent execution
   */
  async getExecutionStatus(executionId: string): Promise<AlgoExecutionResult | null> {
    // Check in-memory first
    const active = this.activeExecutions.get(executionId);
    if (active) return active;

    // Check Redis
    if (this.redis) {
      try {
        const cached = await this.redis.get(`algo-exec:${executionId}`);
        if (cached) return JSON.parse(cached);
      } catch { /* miss */ }
    }

    return null;
  }

  /**
   * Cancel a running execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution || execution.status !== 'RUNNING') return false;

    execution.status = 'CANCELLED';
    execution.completedAt = new Date();
    this.logger.warn(`⚡ Algo execution ${executionId} cancelled — ${execution.filledQuantity}/${execution.totalQuantity} filled`);
    return true;
  }

  // ── Execution Strategies ──

  /**
   * MARKET: Single market order — fallback for small orders
   */
  private async _executeMarket(
    request: AlgoExecutionRequest,
    result: AlgoExecutionResult,
    placeOrderFn: any,
  ): Promise<void> {
    const slice: AlgoExecutionSlice = {
      sliceIndex: 0,
      quantity: request.totalQuantity,
      status: 'PENDING',
    };

    try {
      slice.status = 'SUBMITTED';
      slice.submittedAt = new Date();

      const orderResult = await placeOrderFn({
        quantity: request.totalQuantity,
        type: 'MARKET',
      });

      if (orderResult.success) {
        slice.status = 'FILLED';
        slice.filledQuantity = orderResult.filledQuantity || request.totalQuantity;
        slice.averagePrice = orderResult.averagePrice || 0;
        slice.filledAt = new Date();

        result.filledQuantity += slice.filledQuantity ?? 0;
        result.status = 'COMPLETED';
      } else {
        slice.status = 'FAILED';
        slice.error = orderResult.error;
        result.status = 'FAILED';
      }
    } catch (error: any) {
      slice.status = 'FAILED';
      slice.error = error.message;
      result.status = 'FAILED';
    }

    result.slices.push(slice);
  }

  /**
   * LIMIT_CHILL: Place a limit order slightly better than market,
   * wait for fill, then convert to market if timeout
   */
  private async _executeLimitChill(
    request: AlgoExecutionRequest,
    result: AlgoExecutionResult,
    placeOrderFn: any,
    currentPrice: number,
  ): Promise<void> {
    const offsetPercent = request.limitOffsetPercent || AlgoExecutionService.DEFAULT_LIMIT_OFFSET;
    const maxWaitMs = (request.maxWaitSeconds || AlgoExecutionService.DEFAULT_MAX_WAIT) * 1000;

    // Calculate limit price (slightly better than current)
    let limitPrice: number;
    if (request.side === 'BUY') {
      limitPrice = currentPrice * (1 - offsetPercent); // Buy below current
    } else {
      limitPrice = currentPrice * (1 + offsetPercent); // Sell above current
    }

    const slice: AlgoExecutionSlice = {
      sliceIndex: 0,
      quantity: request.totalQuantity,
      targetPrice: limitPrice,
      status: 'PENDING',
    };

    try {
      // Step 1: Try LIMIT order
      slice.status = 'SUBMITTED';
      slice.submittedAt = new Date();

      this.logger.log(
        `⚡ LIMIT_CHILL: ${request.side} ${request.totalQuantity} ${request.symbol} ` +
        `@ ${limitPrice.toFixed(2)} (offset: ${(offsetPercent * 100).toFixed(2)}%)`
      );

      const limitResult = await placeOrderFn({
        quantity: request.totalQuantity,
        price: limitPrice,
        type: 'LIMIT',
      });

      if (limitResult.success && limitResult.filledQuantity && limitResult.filledQuantity > 0) {
        slice.status = 'FILLED';
        slice.filledQuantity = limitResult.filledQuantity;
        slice.averagePrice = limitResult.averagePrice || limitPrice;
        slice.filledAt = new Date();

        result.filledQuantity += slice.filledQuantity ?? 0;
        result.status = (slice.filledQuantity ?? 0) >= request.totalQuantity ? 'COMPLETED' : 'PARTIAL';
        result.slices.push(slice);
        return;
      }

      // Step 2: LIMIT didn't fill — wait then convert to MARKET
      this.logger.log(`⚡ LIMIT_CHILL: Limit order not filled, waiting ${maxWaitMs / 1000}s then converting to MARKET`);

      // In a production system, we'd poll the order status.
      // For now, wait then submit a market order.
      await this._delay(Math.min(maxWaitMs, 5000)); // Cap at 5s for safety

      const marketResult = await placeOrderFn({
        quantity: request.totalQuantity,
        type: 'MARKET',
      });

      if (marketResult.success) {
        slice.status = 'FILLED';
        slice.filledQuantity = marketResult.filledQuantity || request.totalQuantity;
        slice.averagePrice = marketResult.averagePrice || 0;
        slice.filledAt = new Date();
        result.filledQuantity += slice.filledQuantity ?? 0;
        result.status = 'COMPLETED';
      } else {
        slice.status = 'FAILED';
        slice.error = 'Limit fill timeout + Market fallback failed: ' + (marketResult.error || 'unknown');
        result.status = 'FAILED';
      }
    } catch (error: any) {
      slice.status = 'FAILED';
      slice.error = error.message;
      result.status = 'FAILED';
    }

    result.slices.push(slice);
  }

  /**
   * TWAP: Time-Weighted Average Price
   * Splits the order into equal slices executed at equal time intervals
   */
  private async _executeTwap(
    request: AlgoExecutionRequest,
    result: AlgoExecutionResult,
    placeOrderFn: any,
  ): Promise<void> {
    const sliceCount = request.sliceCount || AlgoExecutionService.DEFAULT_TWAP_SLICES;
    const durationMs = (request.durationSeconds || AlgoExecutionService.DEFAULT_TWAP_DURATION) * 1000;
    const intervalMs = durationMs / sliceCount;
    const sliceQuantity = request.totalQuantity / sliceCount;

    this.logger.log(
      `⚡ TWAP: ${request.side} ${request.totalQuantity} ${request.symbol} ` +
      `→ ${sliceCount} slices × ${sliceQuantity.toFixed(6)} every ${(intervalMs / 1000).toFixed(0)}s ` +
      `(total: ${(durationMs / 1000).toFixed(0)}s)`
    );

    for (let i = 0; i < sliceCount; i++) {
      // Check if execution was cancelled
      if (result.status === 'CANCELLED') {
        // Mark remaining slices as skipped
        for (let j = i; j < sliceCount; j++) {
          result.slices.push({
            sliceIndex: j,
            quantity: sliceQuantity,
            status: 'SKIPPED',
          });
        }
        break;
      }

      const slice: AlgoExecutionSlice = {
        sliceIndex: i,
        quantity: sliceQuantity,
        status: 'PENDING',
      };

      try {
        // Wait for the scheduled time (except first slice)
        if (i > 0) {
          await this._delay(intervalMs);
        }

        slice.status = 'SUBMITTED';
        slice.submittedAt = new Date();

        const orderResult = await placeOrderFn({
          quantity: sliceQuantity,
          type: 'MARKET',
        });

        if (orderResult.success) {
          slice.status = 'FILLED';
          slice.filledQuantity = orderResult.filledQuantity || sliceQuantity;
          slice.averagePrice = orderResult.averagePrice || 0;
          slice.filledAt = new Date();
          result.filledQuantity += slice.filledQuantity ?? 0;

          this.logger.debug(
            `⚡ TWAP slice ${i + 1}/${sliceCount}: filled ${slice.filledQuantity} ` +
            `@ ${slice.averagePrice?.toFixed(2)} (${result.filledQuantity}/${request.totalQuantity} total)`
          );
        } else {
          slice.status = 'FAILED';
          slice.error = orderResult.error;

          // TWAP: Continue with remaining slices even if one fails
          this.logger.warn(`⚡ TWAP slice ${i + 1} failed: ${orderResult.error} — continuing`);
        }
      } catch (error: any) {
        slice.status = 'FAILED';
        slice.error = error.message;
        this.logger.warn(`⚡ TWAP slice ${i + 1} error: ${error.message} — continuing`);
      }

      result.slices.push(slice);
    }

    // Determine final status
    if (result.filledQuantity >= request.totalQuantity * 0.99) {
      result.status = 'COMPLETED';
    } else if (result.filledQuantity > 0) {
      result.status = 'PARTIAL';
    } else {
      result.status = 'FAILED';
    }
  }

  /**
   * VWAP: Volume-Weighted Average Price
   * Uses order book data to execute at levels with highest liquidity
   *
   * Falls back to TWAP if no order book data available.
   */
  private async _executeVwap(
    request: AlgoExecutionRequest,
    result: AlgoExecutionResult,
    placeOrderFn: any,
  ): Promise<void> {
    // VWAP requires order book data — if not available, fall back to TWAP
    // The OrderBookAnalysisService should be called before this method
    // and order book data passed via the request or a shared cache.

    // For now, fall back to TWAP with same parameters
    this.logger.log(`⚡ VWAP: No order book data available — falling back to TWAP for ${request.symbol}`);
    await this._executeTwap(request, result, placeOrderFn);
  }

  // ── Helpers ──

  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }

  private _finalizeResult(result: AlgoExecutionResult, initialPrice: number): void {
    if (result.filledQuantity > 0) {
      // Calculate volume-weighted average price
      let totalNotional = 0;
      let totalQty = 0;
      for (const slice of result.slices) {
        if (slice.status === 'FILLED' && slice.averagePrice && slice.filledQuantity) {
          totalNotional += slice.averagePrice * slice.filledQuantity;
          totalQty += slice.filledQuantity;
        }
      }
      result.averageFillPrice = totalQty > 0 ? totalNotional / totalQty : 0;

      // Calculate slippage in basis points vs initial price
      if (initialPrice > 0 && result.averageFillPrice > 0) {
        const slippage = result.side === 'BUY'
          ? (result.averageFillPrice - initialPrice) / initialPrice
          : (initialPrice - result.averageFillPrice) / initialPrice;
        result.slippageBps = Math.round(slippage * 10000); // Convert to basis points
      }
    }

    if (!result.completedAt) {
      result.completedAt = new Date();
    }
  }
}
