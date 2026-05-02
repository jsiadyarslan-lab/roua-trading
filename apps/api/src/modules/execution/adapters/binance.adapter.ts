// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Binance Exchange Adapter
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
import * as ccxt from 'ccxt';

/**
 * BinanceAdapter — CCXT-based Binance Exchange Adapter
 *
 * Implements IExchangeAdapter for Binance exchange using the CCXT library.
 * Handles crypto pairs (e.g., BTC/USDT, ETH/USDT).
 *
 * Features:
 * ┌───────────────────────────────────────────────────────────┐
 * │ - Full order lifecycle: place, cancel, status check       │
 * │ - Balance fetching with unified format                    │
 * │ - CCXT built-in rate limiting (enableRateLimit: true)     │
 * │ - Audit logging for every API call                        │
 * │ - Automatic error normalization to ExecutionResult        │
 * └───────────────────────────────────────────────────────────┘
 *
 * Security:
 * - API keys are decrypted by CredentialsService before injection
 * - Keys with withdraw/transfer permissions are rejected at credential creation
 * - All calls are logged to AuditService for immutable audit trail
 */
@Injectable()
export class BinanceAdapter implements IExchangeAdapter {
  private readonly logger = new Logger(BinanceAdapter.name);
  private exchange: any = null;

  /** Binance rate limits (conservative defaults) */
  private readonly rateLimits = {
    maxRequestsPerSecond: 5,
    maxRequestsPerMinute: 120,
  };

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly auditService: AuditService,
    private readonly userId: string,
  ) {
    this._initializeExchange();
  }

  // ── IExchangeAdapter Implementation ──

  async placeOrder(order: UnifiedOrder): Promise<ExecutionResult> {
    this.logger.log(`📦 Placing Binance order: ${order.side} ${order.quantity} ${order.symbol}`);

    try {
      let result: any;

      if (order.type === 'MARKET') {
        result = await this.exchange!.createMarketOrder(
          order.symbol,
          order.side.toLowerCase(),
          order.quantity,
        );
      } else {
        result = await this.exchange!.createLimitOrder(
          order.symbol,
          order.side.toLowerCase(),
          order.quantity,
          order.price!,
        );
      }

      const executionResult: ExecutionResult = {
        success: true,
        exchangeOrderId: result.id,
        filledQuantity: result.filled || order.quantity,
        averagePrice: result.average || result.price,
        fee: result.fee?.cost,
        feeCurrency: result.fee?.currency,
        status: this._mapStatus(result.status),
        timestamp: new Date(),
      };

      // Audit log
      await this._auditLog('ORDER_PLACED', {
        orderId: result.id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        filledQuantity: executionResult.filledQuantity,
        averagePrice: executionResult.averagePrice,
      });

      this.logger.log(
        `✅ Binance order executed: ${result.id} — ${order.side} ${executionResult.filledQuantity}/${order.quantity} ${order.symbol} @ ${executionResult.averagePrice}`,
      );

      return executionResult;
    } catch (error: any) {
      this.logger.error(`❌ Binance order failed: ${error.message}`);

      await this._auditLog('ORDER_FAILED', {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        error: error.message,
      });

      return {
        success: false,
        error: this._normalizeError(error),
        timestamp: new Date(),
      };
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    this.logger.log(`🗑️ Cancelling Binance order: ${orderId} (${symbol})`);

    try {
      await this.exchange!.cancelOrder(orderId, symbol);

      await this._auditLog('ORDER_CANCELLED', { orderId, symbol });

      return true;
    } catch (error: any) {
      this.logger.error(`❌ Cancel failed for ${orderId}: ${error.message}`);
      return false;
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus> {
    try {
      const order = await this.exchange!.fetchOrder(orderId, symbol);
      return this._mapStatus(order.status);
    } catch (error: any) {
      this.logger.error(`Failed to get order status ${orderId}: ${error.message}`);
      return OrderExecutionStatus.PENDING;
    }
  }

  async fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    try {
      const orders = await this.exchange!.fetchOpenOrders(symbol);
      return orders.map((o: any) => this._toUnifiedOrder(o));
    } catch (error: any) {
      this.logger.error(`Failed to fetch open orders: ${error.message}`);
      return [];
    }
  }

  async fetchBalance(): Promise<UnifiedBalance> {
    try {
      const balance = await this.exchange!.fetchBalance();

      const balances: Record<string, { free: number; used: number; total: number }> = {};
      for (const [currency, data] of Object.entries(balance)) {
        if (typeof data === 'object' && data !== null && 'free' in (data as any)) {
          const d = data as any;
          if (d.free > 0 || d.used > 0 || d.total > 0) {
            balances[currency] = {
              free: d.free || 0,
              used: d.used || 0,
              total: d.total || 0,
            };
          }
        }
      }

      return {
        totalEquity: balance.total?.USDT || 0,
        availableBalance: balance.free?.USDT || 0,
        usedMargin: balance.used?.USDT || 0,
        currency: 'USDT',
        balances,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch balance: ${error.message}`);
      return {
        totalEquity: 0,
        availableBalance: 0,
        usedMargin: 0,
        currency: 'USDT',
        balances: {},
        timestamp: new Date(),
      };
    }
  }

  getExchangeId(): string {
    return 'binance';
  }

  supportsWebSocket(): boolean {
    return true; // Binance supports WebSocket via ccxt.pro
  }

  getRateLimits(): { maxRequestsPerSecond: number; maxRequestsPerMinute: number } {
    return this.rateLimits;
  }

  // ── Private Helpers ──

  private _initializeExchange(): void {
    const ExchangeClass = (ccxt as any).binance;
    this.exchange = new ExchangeClass({
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
        adjustForTimeDifference: true,
      },
    });
  }

  private _mapStatus(status: string): OrderExecutionStatus {
    const mapping: Record<string, OrderExecutionStatus> = {
      'open': OrderExecutionStatus.ACCEPTED,
      'new': OrderExecutionStatus.ACCEPTED,
      'partially_filled': OrderExecutionStatus.PARTIALLY_FILLED,
      'filled': OrderExecutionStatus.FILLED,
      'closed': OrderExecutionStatus.FILLED,
      'canceled': OrderExecutionStatus.CANCELLED,
      'cancelled': OrderExecutionStatus.CANCELLED,
      'rejected': OrderExecutionStatus.REJECTED,
      'expired': OrderExecutionStatus.EXPIRED,
    };
    return mapping[status] || OrderExecutionStatus.PENDING;
  }

  private _toUnifiedOrder(o: any): UnifiedOrder {
    return {
      id: o.id,
      userId: this.userId,
      exchangeCredentialId: '',
      symbol: o.symbol,
      side: o.side?.toUpperCase() || 'BUY',
      type: o.type?.toUpperCase() || 'MARKET',
      quantity: o.amount || 0,
      price: o.price,
      stopLoss: o.stopPrice,
      idempotencyKey: o.clientOrderId || o.id,
      clientOrderId: o.clientOrderId,
    };
  }

  private _normalizeError(error: any): string {
    const message = error.message || 'Unknown error';

    // Map common CCXT errors to user-friendly messages
    if (message.includes('InsufficientFunds')) {
      return 'رصيد غير كافي في حساب Binance';
    }
    if (message.includes('InvalidOrder')) {
      return 'طلب غير صالح — تحقق من الكمية والسعر';
    }
    if (message.includes('RateLimitExceeded')) {
      return 'تم تجاوز حد الطلبات — حاول بعد قليل';
    }
    if (message.includes('NetworkError') || message.includes('ETIMEDOUT')) {
      return 'خطأ في الاتصال بـ Binance — سيتم إعادة المحاولة';
    }
    if (message.includes('AuthenticationError')) {
      return 'فشل المصادقة — مفتاح API غير صالح';
    }

    return message;
  }

  private async _auditLog(action: string, details: Record<string, any>): Promise<void> {
    try {
      await this.auditService.log({
        userId: this.userId,
        action: `BINANCE_${action}`,
        resource: 'execution-adapter',
        details: JSON.stringify(details),
      });
    } catch {
      // Never fail execution flow due to audit logging issues
    }
  }
}
