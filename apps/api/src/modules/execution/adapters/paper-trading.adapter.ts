// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Paper Trading Broker Adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import {
  IBrokerAdapter,
  UnifiedOrder,
  ExecutionResult,
  OrderExecutionStatus,
  UnifiedBalance,
} from './base-adapter.interface';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * PaperTradingAdapter — Simulated Broker for Risk-Free Trading
 *
 * Provides a complete simulation of real broker behavior without
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
export class PaperTradingAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(PaperTradingAdapter.name);

  /** Default simulation parameters */
  private readonly slippagePercent: number;
  private readonly commissionPercent: number;

  /** In-memory store for pending limit orders (checked periodically) */
  private readonly pendingLimitOrders: Map<string, UnifiedOrder> = new Map();

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
  }

  // ── IBrokerAdapter Implementation ──

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
    // Paper trading starts with $100,000 virtual balance
    // In production, this would be tracked in a dedicated table
    const defaultBalance = 100000;

    try {
      // Calculate used margin from open positions
      const openPositions = await this.prisma.position.findMany({
        where: { userId: this.userId, status: 'OPEN' },
      });

      const usedMargin = openPositions.reduce(
        (sum, p) => sum + p.quantity * (p.currentPrice || p.entryPrice),
        0,
      );

      // Calculate unrealized P&L
      const unrealizedPnL = openPositions.reduce(
        (sum, p) => sum + (p.unrealizedPnl || 0),
        0,
      );

      const totalEquity = defaultBalance + unrealizedPnL;

      return {
        totalEquity,
        availableBalance: Math.max(0, totalEquity - usedMargin),
        usedMargin,
        currency: 'USD',
        balances: {
          USD: {
            free: Math.max(0, totalEquity - usedMargin),
            used: usedMargin,
            total: totalEquity,
          },
        },
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch paper balance: ${error.message}`);
      return {
        totalEquity: defaultBalance,
        availableBalance: defaultBalance,
        usedMargin: 0,
        currency: 'USD',
        balances: { USD: { free: defaultBalance, used: 0, total: defaultBalance } },
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
    const fillPrice = currentPrice * slippageMultiplier;

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
      `✅ Paper market order filled: ${paperOrder.id} — ${order.side} ${order.quantity} ${order.symbol} @ ${fillPrice.toFixed(2)} (market: ${currentPrice.toFixed(2)}, slippage: ${this.slippagePercent}%)`,
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

  // ── Private Helpers ──

  private async _getCurrentPrice(symbol: string): Promise<number> {
    try {
      const quote = await this.aggregator.getAggregatedQuote(symbol);
      return quote.price || 0;
    } catch (error: any) {
      this.logger.error(`Failed to get price for ${symbol}: ${error.message}`);
      return 0;
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
}
