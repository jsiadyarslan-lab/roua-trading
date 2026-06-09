// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Paper Trading Exchange Adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import {
  IExchangeAdapter,
  UnifiedOrder,
  ExecutionResult,
  OrderExecutionStatus,
  UnifiedBalance,
} from './base-adapter.interface';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';
import { calculateMargin, getSymbolMetadata, AssetClass } from '../../trading/services/symbol-metadata';

/**
 * PaperTradingAdapter — Simulated Exchange for Risk-Free Trading
 *
 * Provides a complete simulation of real exchange behavior without
 * actually executing orders on any exchange. Designed for:
 *
 * ┌───────────────────────────────────────────────────────────┐
 * │ - Testing trading strategies before going live            │
 * │ - Onboarding new users with virtual funds                 │
 * │ - Validating the full order pipeline end-to-end           │
 * │ - Simulating realistic market conditions                  │
 * └───────────────────────────────────────────────────────────┘
 *
 * Simulation Features:
 * - Market orders: Instant execution at current market price
 * - Limit orders: Pending until price reaches limit (checked via Redis polling)
 * - Slippage: 0.1% default (configurable via PAPER_SLIPPAGE_PERCENT)
 * - Commission: 0.1% default (configurable via PAPER_COMMISSION_PERCENT)
 * - Orders stored in PaperOrder table for persistence
 * - Unrealistic fills prevented with price validation
 */
@Injectable()
export class PaperTradingAdapter implements IExchangeAdapter {
  private readonly logger = new Logger(PaperTradingAdapter.name);

  /** Default simulation parameters */
  private readonly slippagePercent: number;
  private readonly commissionPercent: number;

  /** In-memory store for pending limit orders (checked periodically) */
  private readonly pendingLimitOrders: Map<string, UnifiedOrder> = new Map();

  /** V176: Interval for checking pending limit orders */
  private limitCheckInterval: NodeJS.Timeout | null = null;
  private readonly LIMIT_CHECK_INTERVAL_MS = 10_000; // Check every 10 seconds

  /** Paper trading rate limits (generous — no real exchange to throttle) */
  private readonly rateLimits = {
    maxRequestsPerSecond: 20,
    maxRequestsPerMinute: 1000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: MarketDataAggregatorService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly userId: string,
  ) {
    this.slippagePercent = parseFloat(
      process.env.PAPER_SLIPPAGE_PERCENT || '0.1',
    );
    this.commissionPercent = parseFloat(
      process.env.PAPER_COMMISSION_PERCENT || '0.1',
    );

    this.logger.log(
      `📝 Paper Trading adapter initialized (slippage: ${this.slippagePercent}%, commission: ${this.commissionPercent}%)`,
    );

    // V176 FIX: Start periodic limit order checker.
    // Previously, limit orders were stored in Redis with TTL but NEVER checked.
    // They stayed PENDING forever because no code compared market price vs limit price.
    // Now: every 10 seconds, check all pending limit orders and fill if price reached.
    this.limitCheckInterval = setInterval(() => this._checkPendingLimitOrders(), this.LIMIT_CHECK_INTERVAL_MS);
    this.logger.log(`📝 V176 Limit order checker started — checking every ${this.LIMIT_CHECK_INTERVAL_MS / 1000}s`);
  }

  /** V176: Cleanup interval on adapter disposal */
  destroy(): void {
    if (this.limitCheckInterval) {
      clearInterval(this.limitCheckInterval);
      this.limitCheckInterval = null;
    }
  }

  // ── IExchangeAdapter Implementation ──

  async placeOrder(order: UnifiedOrder): Promise<ExecutionResult> {
    this.logger.log(`📝 Placing paper order: ${order.side} ${order.quantity} ${order.symbol}`);

    try {
      // Step 1: Get current market price from aggregator
      const currentPrice = await this._getCurrentPrice(order.symbol);

      if (currentPrice <= 0) {
        return {
          success: false,
          error: `لا يمكن الحصول على السعر الحالي لـ ${order.symbol}`,
          timestamp: new Date(),
        };
      }

      // V180 FIX: Re-introduce order value limit for paper trading.
      // Previously REMOVED entirely, allowing positions of 86% of portfolio.
      // Paper trading must enforce the same risk discipline as real trading,
      // otherwise test results don't reflect real-world behavior.
      // A position of $8,500 on a $10K account is gambling, not trading.
      const MAX_PAPER_ORDER_VALUE = 500; // $500 max notional per order (5% of $10K)
      const orderNotional = order.quantity * currentPrice;
      if (orderNotional > MAX_PAPER_ORDER_VALUE) {
        return {
          success: false,
          error: `قيمة الطلب الورقي ($${orderNotional.toFixed(2)}) تتجاوز الحد الأقصى ($${MAX_PAPER_ORDER_VALUE}). يجب أن يعكس التداول الورقي السلوك الحقيقي.`,
          timestamp: new Date(),
        };
      }

      // Step 2: Handle order type
      if (order.type === 'MARKET') {
        return await this._executeMarketOrder(order, currentPrice);
      } else {
        return await this._executeLimitOrder(order, currentPrice);
      }
    } catch (error: any) {
      this.logger.error(`❌ Paper order failed: ${error.message}`);

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    this.logger.log(`🗑️ Cancelling paper order: ${orderId}`);

    try {
      // Remove from pending limit orders
      this.pendingLimitOrders.delete(orderId);

      // Update in database
      await this.prisma.paperOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' as any },
      });

      await this._auditLog('ORDER_CANCELLED', { orderId, symbol });

      return true;
    } catch (error: any) {
      this.logger.error(`❌ Cancel failed for ${orderId}: ${error.message}`);
      return false;
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus> {
    try {
      const order = await this.prisma.paperOrder.findUnique({
        where: { id: orderId },
      });

      if (!order) return OrderExecutionStatus.PENDING;

      const statusMap: Record<string, OrderExecutionStatus> = {
        PENDING: OrderExecutionStatus.PENDING,
        ACCEPTED: OrderExecutionStatus.ACCEPTED,
        PARTIALLY_FILLED: OrderExecutionStatus.PARTIALLY_FILLED,
        FILLED: OrderExecutionStatus.FILLED,
        CANCELLED: OrderExecutionStatus.CANCELLED,
        REJECTED: OrderExecutionStatus.REJECTED,
      };

      return statusMap[order.status as string] || OrderExecutionStatus.PENDING;
    } catch {
      return OrderExecutionStatus.PENDING;
    }
  }

  async fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    try {
      const where: any = { userId: this.userId, status: 'PENDING' };
      if (symbol) where.symbol = symbol;

      const orders = await this.prisma.paperOrder.findMany({ where });

      return orders.map((o: any) => ({
        id: o.id,
        userId: o.userId,
        exchangeCredentialId: '',
        symbol: o.symbol,
        side: o.side as 'BUY' | 'SELL',
        type: o.type as 'MARKET' | 'LIMIT',
        quantity: Number(o.quantity),
        price: o.price ? Number(o.price) : undefined,
        stopLoss: o.stopLoss ? Number(o.stopLoss) : undefined,
        takeProfit: o.takeProfit ? Number(o.takeProfit) : undefined,
        idempotencyKey: o.idempotencyKey,
        clientOrderId: o.clientOrderId || undefined,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch open orders: ${error.message}`);
      return [];
    }
  }

  async fetchBalance(): Promise<UnifiedBalance> {
    // ═══════════════════════════════════════════════════════════════
    // FIX: Fetch the user's actual paper balance from AgentSettings.
    // Previously hardcoded to $100,000 which was wrong for most users
    // whose paper balance is $10,000. Also, the usedMargin calculation
    // was wrong — it computed the full notional value (qty * price)
    // instead of the actual margin used. For crypto paper trading
    // without leverage, margin = notional value of the position.
    // ═══════════════════════════════════════════════════════════════
    const fallbackBalance = 10000;
    let baseBalance = fallbackBalance;

    try {
      // Fetch user's configured paper balance from AgentSettings
      const settings = await this.prisma.agentSettings.findUnique({
        where: { userId: this.userId },
      });
      if (settings && Number(settings.paperBalance) > 0) {
        baseBalance = Number(settings.paperBalance);
      }
    } catch {
      // AgentSettings not available — use fallback
    }

    try {
      // Calculate used margin from open positions
      // V146 FIX: Use leverage-aware margin calculation instead of raw notional value.
      // For forex (50:1 leverage), margin = notional / 50
      // For crypto spot (1:1), margin = notional (full collateral)
      const openPositions = await this.prisma.position.findMany({
        where: { userId: this.userId, status: 'OPEN' },
      });

      const usedMargin = openPositions.reduce(
        (sum, p) => sum + calculateMargin(
          Number(p.quantity),
          Number(p.currentPrice) || Number(p.entryPrice),
          p.symbol,
        ),
        0,
      );

      // Calculate unrealized P&L
      const unrealizedPnL = openPositions.reduce(
        (sum, p) => sum + Number(p.unrealizedPnl || 0),
        0,
      );

      // FIX: totalEquity = baseBalance + unrealizedPnL (not just baseBalance)
      // This accounts for the floating P&L from open positions
      const totalEquity = baseBalance + unrealizedPnL;
      const freeMargin = Math.max(0, totalEquity - usedMargin);

      this.logger.debug(
        `📝 Paper balance: base=$${baseBalance}, usedMargin=$${usedMargin.toFixed(2)}, ` +
        `unrealizedPnL=$${unrealizedPnL.toFixed(2)}, equity=$${totalEquity.toFixed(2)}, ` +
        `free=$${freeMargin.toFixed(2)}, positions=${openPositions.length}`
      );

      return {
        totalEquity,
        availableBalance: freeMargin,
        usedMargin,
        currency: 'USD',
        balances: {
          USD: {
            free: freeMargin,
            used: usedMargin,
            total: totalEquity,
          },
        },
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch paper balance: ${error.message}`);
      return {
        totalEquity: baseBalance,
        availableBalance: baseBalance,
        usedMargin: 0,
        currency: 'USD',
        balances: { USD: { free: baseBalance, used: 0, total: baseBalance } },
        timestamp: new Date(),
      };
    }
  }

  getExchangeId(): string {
    return 'paper';
  }

  supportsWebSocket(): boolean {
    return false; // Paper trading uses polling
  }

  getRateLimits(): { maxRequestsPerSecond: number; maxRequestsPerMinute: number } {
    return this.rateLimits;
  }

  // ── Private: Order Execution ──

  /**
   * Execute a market order immediately at current price
   * Applies slippage and commission simulation
   */
  private async _executeMarketOrder(
    order: UnifiedOrder,
    currentPrice: number,
  ): Promise<ExecutionResult> {
    // Apply slippage (0.1% default)
    const slippageMultiplier = 1 + (this.slippagePercent / 100) * (order.side === 'BUY' ? 1 : -1);
    const rawFillPrice = currentPrice * slippageMultiplier;
    // V146 FIX: Round to eliminate floating-point artifacts before storing
    const decimals = this._priceDecimals(rawFillPrice, order.symbol);
    const fillPrice = parseFloat(rawFillPrice.toFixed(decimals));

    // Calculate commission (0.1% default)
    const commission = (order.quantity * fillPrice) * (this.commissionPercent / 100);

    // Create paper order in database
    const paperOrder = await this.prisma.paperOrder.create({
      data: {
        userId: this.userId,
        symbol: order.symbol,
        side: order.side as any,
        type: order.type as any,
        quantity: order.quantity,
        price: fillPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        status: 'FILLED' as any,
        filledQuantity: order.quantity,
        averagePrice: fillPrice,
        fee: commission,
        feeCurrency: 'USD',
        slippage: Math.abs(fillPrice - currentPrice),
        idempotencyKey: order.idempotencyKey,
        clientOrderId: order.clientOrderId,
      },
    });

    await this._auditLog('ORDER_PLACED', {
      orderId: paperOrder.id,
      symbol: order.symbol,
      side: order.side,
      type: 'MARKET',
      quantity: order.quantity,
      fillPrice,
      slippage: Math.abs(fillPrice - currentPrice),
      commission,
      marketPrice: currentPrice,
    });

    this.logger.log(
      `✅ Paper market order filled: ${paperOrder.id} — ${order.side} ${order.quantity} ${order.symbol} @ ${fillPrice.toFixed(decimals)} (market: ${currentPrice.toFixed(decimals)}, slippage: ${this.slippagePercent}%)`,
    );

    return {
      success: true,
      exchangeOrderId: paperOrder.id,
      filledQuantity: order.quantity,
      averagePrice: fillPrice,
      fee: commission,
      feeCurrency: 'USD',
      status: OrderExecutionStatus.FILLED,
      timestamp: new Date(),
    };
  }

  /**
   * Execute a limit order — store as PENDING until price reaches target
   * Uses Redis for periodic price checking
   */
  private async _executeLimitOrder(
    order: UnifiedOrder,
    currentPrice: number,
  ): Promise<ExecutionResult> {
    const limitPrice = order.price!;

    // Check if limit price is already reachable
    const isFillable =
      (order.side === 'BUY' && currentPrice <= limitPrice) ||
      (order.side === 'SELL' && currentPrice >= limitPrice);

    if (isFillable) {
      // Fill immediately at limit price
      const commission = (order.quantity * limitPrice) * (this.commissionPercent / 100);

      const paperOrder = await this.prisma.paperOrder.create({
        data: {
          userId: this.userId,
          symbol: order.symbol,
          side: order.side as any,
          type: order.type as any,
          quantity: order.quantity,
          price: limitPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          status: 'FILLED' as any,
          filledQuantity: order.quantity,
          averagePrice: limitPrice,
          fee: commission,
          feeCurrency: 'USD',
          slippage: 0,
          idempotencyKey: order.idempotencyKey,
          clientOrderId: order.clientOrderId,
        },
      });

      await this._auditLog('ORDER_PLACED', {
        orderId: paperOrder.id,
        symbol: order.symbol,
        side: order.side,
        type: 'LIMIT',
        quantity: order.quantity,
        fillPrice: limitPrice,
        commission,
      });

      return {
        success: true,
        exchangeOrderId: paperOrder.id,
        filledQuantity: order.quantity,
        averagePrice: limitPrice,
        fee: commission,
        feeCurrency: 'USD',
        status: OrderExecutionStatus.FILLED,
        timestamp: new Date(),
      };
    }

    // Store as pending — will be checked periodically via Redis
    const paperOrder = await this.prisma.paperOrder.create({
      data: {
        userId: this.userId,
        symbol: order.symbol,
        side: order.side as any,
        type: order.type as any,
        quantity: order.quantity,
        price: limitPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        status: 'PENDING' as any,
        filledQuantity: 0,
        idempotencyKey: order.idempotencyKey,
        clientOrderId: order.clientOrderId,
      },
    });

    // Add to pending limit orders for periodic checking
    this.pendingLimitOrders.set(paperOrder.id, order);

    // Store check schedule in Redis (check every 10 seconds)
    await this.redisService.set(
      `paper:limit:${paperOrder.id}`,
      JSON.stringify({
        orderId: paperOrder.id,
        symbol: order.symbol,
        side: order.side,
        limitPrice,
        quantity: order.quantity,
      }),
      86400000, // 24h TTL
    );

    await this._auditLog('ORDER_PENDING', {
      orderId: paperOrder.id,
      symbol: order.symbol,
      side: order.side,
      type: 'LIMIT',
      limitPrice,
      currentPrice,
    });

    this.logger.log(
      `📝 Paper limit order pending: ${paperOrder.id} — ${order.side} ${order.quantity} ${order.symbol} @ ${limitPrice} (current: ${currentPrice})`,
    );

    return {
      success: true,
      exchangeOrderId: paperOrder.id,
      filledQuantity: 0,
      status: OrderExecutionStatus.ACCEPTED,
      timestamp: new Date(),
    };
  }

  // ── Private: Limit Order Checker ──

  /**
   * V176 FIX: Periodically check all pending limit orders and fill them
   * if the current market price has reached the limit price.
   *
   * Previously, limit orders were stored in Redis + in-memory Map but
   * NO code ever compared market price vs limit price. They stayed
   * PENDING forever. This is the missing piece.
   *
   * Fill logic:
   * - BUY limit: fill when marketPrice <= limitPrice
   * - SELL limit: fill when marketPrice >= limitPrice
   *
   * Also auto-cancels orders older than 24 hours.
   */
  private async _checkPendingLimitOrders(): Promise<void> {
    if (this.pendingLimitOrders.size === 0) return;

    const orderIds = [...this.pendingLimitOrders.keys()];

    for (const orderId of orderIds) {
      try {
        // Fetch order from DB to check status and age
        const paperOrder = await this.prisma.paperOrder.findUnique({
          where: { id: orderId },
        });

        if (!paperOrder || paperOrder.status !== 'PENDING') {
          // Order was already filled/cancelled externally — remove from memory
          this.pendingLimitOrders.delete(orderId);
          continue;
        }

        // Auto-cancel orders older than 24 hours
        const orderAge = Date.now() - new Date(paperOrder.createdAt).getTime();
        if (orderAge > 86400000) {
          await this.prisma.paperOrder.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' as any },
          });
          this.pendingLimitOrders.delete(orderId);
          await this._cleanupRedisKey(orderId);
          this.logger.log(`📝 V176 Limit order auto-cancelled (24h expired): ${orderId}`);
          continue;
        }

        // Get current market price
        const currentPrice = await this._getCurrentPrice(paperOrder.symbol);
        const limitPrice = Number(paperOrder.price);
        const side = paperOrder.side as 'BUY' | 'SELL';

        // Check if limit price is reachable
        const isFillable =
          (side === 'BUY' && currentPrice <= limitPrice) ||
          (side === 'SELL' && currentPrice >= limitPrice);

        if (isFillable) {
          // Fill the order at limit price
          const commission = (Number(paperOrder.quantity) * limitPrice) * (this.commissionPercent / 100);

          await this.prisma.paperOrder.update({
            where: { id: orderId },
            data: {
              status: 'FILLED' as any,
              filledQuantity: Number(paperOrder.quantity),
              averagePrice: limitPrice,
              fee: commission,
              feeCurrency: 'USD',
              slippage: 0,
            },
          });

          this.pendingLimitOrders.delete(orderId);
          await this._cleanupRedisKey(orderId);

          await this._auditLog('LIMIT_ORDER_FILLED', {
            orderId,
            symbol: paperOrder.symbol,
            side,
            limitPrice,
            currentPrice,
            quantity: Number(paperOrder.quantity),
            commission,
          });

          this.logger.log(
            `✅ V176 Limit order filled by checker: ${orderId} — ${side} ${paperOrder.quantity} ${paperOrder.symbol} @ ${limitPrice} (market: ${currentPrice})`,
          );
        }
      } catch (error: any) {
        this.logger.error(`V176 Limit check failed for order ${orderId}: ${error.message}`);
      }
    }
  }

  /** V176: Clean up Redis key for a filled/cancelled limit order */
  private async _cleanupRedisKey(orderId: string): Promise<void> {
    try {
      await this.redisService.del(`paper:limit:${orderId}`);
    } catch { /* non-critical */ }
  }

  // ── Private Helpers ──

  private async _getCurrentPrice(symbol: string): Promise<number> {
    try {
      const quote = await this.aggregator.getAggregatedQuote(symbol);
      const price = quote.price || 0;

      // ═══════════════════════════════════════════════════
      // FIX: Previously returned 0 when the aggregator failed,
      // which could lead to paper orders being placed at $0.00
      // if the caller didn't properly validate. Now we throw
      // so the caller's price validation (currentPrice <= 0)
      // in placeOrder() properly rejects the order.
      // ═══════════════════════════════════════════════════
      if (price <= 0) {
        throw new Error(`لا يمكن الحصول على سعر صالح لـ ${symbol} — تم إلغاء الأمر الوهمي`);
      }

      return price;
    } catch (error: any) {
      this.logger.error(`Failed to get price for ${symbol}: ${error.message}`);
      // Throw instead of returning 0 — let the caller handle the failure
      throw new Error(`فشل في جلب السعر لـ ${symbol}: ${error.message}`);
    }
  }

  private async _auditLog(action: string, details: Record<string, any>): Promise<void> {
    try {
      await this.auditService.log({
        userId: this.userId,
        action: `PAPER_${action}`,
        resource: 'execution-adapter',
        details: JSON.stringify(details),
      });
    } catch {
      // Never fail execution flow due to audit logging issues
    }
  }

  /**
   * V147: Determine the correct number of decimal places for a price
   * using symbol-metadata registry (consistent with SYMBOL_METADATA).
   * Falls back to price-magnitude heuristics for unknown symbols.
   */
  private _priceDecimals(price: number, symbol?: string): number {
    if (!Number.isFinite(price) || price <= 0) return 2;
    if (symbol) {
      try {
        const meta = getSymbolMetadata(symbol);
        if (meta.priceDecimals > 2 || meta.assetClass === AssetClass.FOREX) {
          return meta.priceDecimals;
        }
      } catch {
        // Fall through to heuristic
      }
      const s = symbol.toUpperCase();
      if (s.includes('JPY')) return 3;
      if (s.includes('BTC')) return 2;
      if (s.includes('XAU') || s.includes('XAG')) return 2;
    }
    if (price > 1000) return 2;
    if (price > 1) return 5;   // forex pipette precision
    return 6;
  }
}
