// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Alpaca Broker Adapter
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
import axios, { AxiosInstance } from 'axios';

/**
 * AlpacaAdapter — REST-based Alpaca Markets Adapter
 *
 * Implements IBrokerAdapter for Alpaca stock trading.
 * Handles stock symbols (e.g., AAPL, TSLA, GOOGL).
 *
 * Features:
 * ┌───────────────────────────────────────────────────────────┐
 * │ - Paper trading first (paper: true by default)            │
 * │ - Full order lifecycle via Alpaca REST API                │
 * │ - Automatic error normalization to ExecutionResult        │
 * │ - Audit logging for every API call                        │
 * │ - Rate limit awareness (200 requests/min for free tier)   │
 * └───────────────────────────────────────────────────────────┘
 *
 * API Reference: https://docs.alpaca.markets/docs/about-market-data-api
 */
@Injectable()
export class AlpacaAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(AlpacaAdapter.name);
  private readonly httpClient: AxiosInstance;

  /** Alpaca rate limits (free tier) */
  private readonly rateLimits = {
    maxRequestsPerSecond: 3,
    maxRequestsPerMinute: 200,
  };

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly auditService: AuditService,
    private readonly userId: string,
    private readonly paper: boolean = true,
  ) {
    // Alpaca paper trading URL by default, live URL if paper=false
    const baseURL = this.paper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    this.httpClient = axios.create({
      baseURL,
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.apiSecret,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.logger.log(`🏛️ Alpaca adapter initialized (${this.paper ? 'PAPER' : 'LIVE'} mode)`);
  }

  // ── IBrokerAdapter Implementation ──

  async placeOrder(order: UnifiedOrder): Promise<ExecutionResult> {
    this.logger.log(`📦 Placing Alpaca order: ${order.side} ${order.quantity} ${order.symbol}`);

    try {
      const payload: any = {
        symbol: order.symbol.replace('/', ''), // AAPL not AAPL/USD
        qty: order.quantity.toString(),
        side: order.side.toLowerCase(),
        type: order.type.toLowerCase(),
        time_in_force: order.type === 'MARKET' ? 'ioc' : 'gtc',
        client_order_id: order.idempotencyKey,
      };

      if (order.type === 'LIMIT' && order.price) {
        payload.limit_price = order.price.toString();
      }

      if (order.stopLoss) {
        payload.stop_loss = { stop_price: order.stopLoss.toString() };
      }

      if (order.takeProfit) {
        payload.take_profit = { limit_price: order.takeProfit.toString() };
      }

      const response = await this.httpClient.post('/v2/orders', payload);
      const data = response.data;

      const executionResult: ExecutionResult = {
        success: true,
        exchangeOrderId: data.id,
        filledQuantity: parseFloat(data.filled_qty) || 0,
        averagePrice: parseFloat(data.filled_avg_price) || undefined,
        fee: 0, // Alpaca commission-free
        feeCurrency: 'USD',
        status: this._mapStatus(data.status),
        timestamp: new Date(),
      };

      await this._auditLog('ORDER_PLACED', {
        orderId: data.id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        filledQuantity: executionResult.filledQuantity,
        averagePrice: executionResult.averagePrice,
      });

      this.logger.log(
        `✅ Alpaca order executed: ${data.id} — ${order.side} ${executionResult.filledQuantity}/${order.quantity} ${order.symbol}`,
      );

      return executionResult;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      this.logger.error(`❌ Alpaca order failed: ${errorMessage}`);

      await this._auditLog('ORDER_FAILED', {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        error: errorMessage,
      });

      return {
        success: false,
        error: this._normalizeError(error),
        timestamp: new Date(),
      };
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    this.logger.log(`🗑️ Cancelling Alpaca order: ${orderId}`);

    try {
      await this.httpClient.delete(`/v2/orders/${orderId}`);
      await this._auditLog('ORDER_CANCELLED', { orderId, symbol });
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Cancel failed for ${orderId}: ${error.message}`);
      return false;
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus> {
    try {
      const response = await this.httpClient.get(`/v2/orders/${orderId}`);
      return this._mapStatus(response.data.status);
    } catch (error: any) {
      this.logger.error(`Failed to get order status ${orderId}: ${error.message}`);
      return OrderExecutionStatus.PENDING;
    }
  }

  async fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    try {
      const params: any = { status: 'open' };
      if (symbol) {
        params.symbols = JSON.stringify([symbol.replace('/', '')]);
      }

      const response = await this.httpClient.get('/v2/orders', { params });
      return (response.data || []).map((o: any) => this._toUnifiedOrder(o));
    } catch (error: any) {
      this.logger.error(`Failed to fetch open orders: ${error.message}`);
      return [];
    }
  }

  async fetchBalance(): Promise<UnifiedBalance> {
    try {
      const response = await this.httpClient.get('/v2/account');
      const data = response.data;

      const balances: Record<string, { free: number; used: number; total: number }> = {
        USD: {
          free: parseFloat(data.cash) || 0,
          used: parseFloat(data.position_market_value) || 0,
          total: parseFloat(data.equity) || 0,
        },
      };

      return {
        totalEquity: parseFloat(data.equity) || 0,
        availableBalance: parseFloat(data.cash) || 0,
        usedMargin: parseFloat(data.position_market_value) || 0,
        currency: 'USD',
        balances,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch balance: ${error.message}`);
      return {
        totalEquity: 0,
        availableBalance: 0,
        usedMargin: 0,
        currency: 'USD',
        balances: {},
        timestamp: new Date(),
      };
    }
  }

  getExchangeId(): string {
    return 'alpaca';
  }

  supportsWebSocket(): boolean {
    return true; // Alpaca supports streaming via WebSocket
  }

  getRateLimits(): { maxRequestsPerSecond: number; maxRequestsPerMinute: number } {
    return this.rateLimits;
  }

  // ── Private Helpers ──

  private _mapStatus(status: string): OrderExecutionStatus {
    const mapping: Record<string, OrderExecutionStatus> = {
      'new': OrderExecutionStatus.ACCEPTED,
      'partially_filled': OrderExecutionStatus.PARTIALLY_FILLED,
      'filled': OrderExecutionStatus.FILLED,
      'done_for_day': OrderExecutionStatus.PARTIALLY_FILLED,
      'canceled': OrderExecutionStatus.CANCELLED,
      'cancelled': OrderExecutionStatus.CANCELLED,
      'rejected': OrderExecutionStatus.REJECTED,
      'expired': OrderExecutionStatus.EXPIRED,
      'replaced': OrderExecutionStatus.ACCEPTED,
      'pending_replace': OrderExecutionStatus.ACCEPTED,
      'pending_cancel': OrderExecutionStatus.ACCEPTED,
      'pending_new': OrderExecutionStatus.PENDING,
      'accepted': OrderExecutionStatus.ACCEPTED,
      'accepted_for_bidding': OrderExecutionStatus.ACCEPTED,
      'stopped': OrderExecutionStatus.ACCEPTED,
      'suspended': OrderExecutionStatus.PENDING,
      'calculated': OrderExecutionStatus.PARTIALLY_FILLED,
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
      quantity: parseFloat(o.qty) || 0,
      price: o.limit_price ? parseFloat(o.limit_price) : undefined,
      stopLoss: o.stop_price ? parseFloat(o.stop_price) : undefined,
      idempotencyKey: o.client_order_id || o.id,
      clientOrderId: o.client_order_id,
    };
  }

  private _normalizeError(error: any): string {
    const message = error.response?.data?.message || error.message || 'Unknown error';

    if (message.includes('insufficient') || message.includes('buying power')) {
      return 'رصيد غير كافي في حساب Alpaca';
    }
    if (message.includes('invalid symbol')) {
      return 'رمز السهم غير صالح';
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'تم تجاوز حد الطلبات — حاول بعد قليل';
    }
    if (message.includes('market is closed') || message.includes('not open')) {
      return 'السوق مغلق حالياً — لا يمكن تنفيذ الطلب';
    }
    if (message.includes('authentication') || message.includes('API key')) {
      return 'فشل المصادقة — مفتاح API غير صالح';
    }

    return message;
  }

  private async _auditLog(action: string, details: Record<string, any>): Promise<void> {
    try {
      await this.auditService.log({
        userId: this.userId,
        action: `ALPACA_${action}`,
        resource: 'execution-adapter',
        details: JSON.stringify(details),
      });
    } catch {
      // Never fail execution flow due to audit logging issues
    }
  }
}
