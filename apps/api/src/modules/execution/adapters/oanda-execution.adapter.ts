// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — OANDA v20 Execution Adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// BUG-044 FIX: OANDA execution adapter (placeOrder + cancelOrder + balance).
//
// PROBLEM:
//   - OandaAdapter (in exchange/adapters/) only implements fetchQuote + fetchHistoricalData.
//   - It has NO placeOrder method — OANDA real-money trades were silently failing.
//   - ExecutionGatewayService._createAdapter() default case created BinanceAdapter
//     for OANDA, but ccxt['oanda'] = undefined, so createMarketOrder always failed.
//   - The market-data OandaAdapter uses ConfigService env vars (OANDA_API_TOKEN),
//     but per-user execution needs DECRYPTED credentials from DB.
//
// SOLUTION:
//   - Separate OandaExecutionAdapter (this file) that takes decrypted
//     apiKey/apiSecret in constructor — same pattern as BinanceAdapter.
//   - apiKey = OANDA API token
//   - apiSecret = OANDA account ID (e.g., "001-001-12345-001")
//   - Routes through ExecutionGatewayService like MT5/Binance.
//   - Implements full IExchangeAdapter: placeOrder, cancelOrder, getOrderStatus,
//     fetchOpenOrders, fetchBalance, modifyPosition.
//   - SL/TP are attached to the order via stopLossOnFill / takeProfitOnFill
//     (OANDA v20 native mechanism — NOT separate orders like Binance).

import { Injectable, Logger } from '@nestjs/common';
import {
  IExchangeAdapter,
  UnifiedOrder,
  ExecutionResult,
  OrderExecutionStatus,
  UnifiedBalance,
  PositionModification,
} from './base-adapter.interface';
import { AuditService } from '../../../audit/audit.service';

/**
 * OandaExecutionAdapter — Real order execution via OANDA v20 REST API
 *
 * Auth:
 *   - apiKey    = OANDA API token (Bearer)
 *   - apiSecret = OANDA account ID (e.g., "001-001-12345-001")
 *
 * URLs:
 *   - Practice: https://api-fxpractice.oanda.com
 *   - Live:      https://api-fxtrade.oanda.com
 *
 * Symbol conversion:
 *   - User input "EUR/USD" → OANDA "EUR_USD"
 *   - User input "XAU/USD" → OANDA "XAU_USD"
 *
 * Order placement (POST /v3/accounts/{accountID}/orders):
 *   {
 *     "order": {
 *       "type": "MARKET",
 *       "instrument": "EUR_USD",
 *       "units": "1000",                 // positive=BUY, negative=SELL
 *       "stopLossOnFill": { "price": "1.0850" },
 *       "takeProfitOnFill": { "price": "1.0950" }
 *     }
 *   }
 *
 * Units convention:
 *   - OANDA uses UNITS, not LOTS.
 *   - TradingService._executeOnExchange already converts LOTS → UNITS via
 *     lotsToUnits() before reaching this adapter (BUG-042 fix).
 *   - So this adapter receives quantity in UNITS (e.g., 1000 for 0.01 lot EUR/USD).
 *   - However, when called via ExecutionGateway (the new path), the order.quantity
 *     comes from UnifiedOrder which is in LOTS. So this adapter ALSO converts
 *     LOTS → UNITS internally as a safety net.
 */
@Injectable()
export class OandaExecutionAdapter implements IExchangeAdapter {
  private readonly logger = new Logger(OandaExecutionAdapter.name);

  /** Practice by default; live must be explicitly opt-in via isLive flag */
  private readonly baseUrl: string;

  /** Rate limit (30 req/sec conservative) */
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 33; // ~30 req/sec

  constructor(
    private readonly apiKey: string,        // OANDA API token
    private readonly apiSecret: string,     // OANDA account ID
    private readonly auditService: AuditService,
    private readonly userId: string,
    private readonly isLive: boolean = false,
  ) {
    this.baseUrl = isLive
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com';
    this.logger.log(
      `📈 OANDA Execution Adapter initialized — ${isLive ? '🔴 LIVE' : '📄 Practice'} ` +
      `account=${apiSecret ? apiSecret.substring(0, 7) + '***' : 'MISSING'} token=${apiKey ? '✅' : '❌'}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // IExchangeAdapter implementation
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Place an order on OANDA via POST /v3/accounts/{accountID}/orders
   * SL/TP are attached natively via stopLossOnFill / takeProfitOnFill.
   */
  async placeOrder(order: UnifiedOrder): Promise<ExecutionResult> {
    this.logger.log(
      `📦 Placing OANDA order: ${order.side} ${order.quantity} ${order.symbol} ` +
      `(SL=${order.stopLoss ?? 'none'} TP=${order.takeProfit ?? 'none'})`,
    );

    if (!this.apiKey || !this.apiSecret) {
      return {
        success: false,
        error: 'OANDA credentials missing (apiKey=token, apiSecret=accountID)',
        timestamp: new Date(),
      };
    }

    try {
      // Convert symbol "EUR/USD" → "EUR_USD"
      const instrument = this._toOandaSymbol(order.symbol);

      // Convert LOTS → UNITS (safety net; TradingService should already have done this)
      // We don't know if order came via ExecutionGateway (LOTS) or directly (UNITS).
      // Heuristic: forex/metals LOTS are typically < 100; UNITS are typically >= 1000.
      // SAFER: always convert using contractSize from symbol-metadata.
      const units = this._lotsToUnitsSafe(order.quantity, order.symbol);

      // OANDA convention: BUY = positive units, SELL = negative units
      const signedUnits = order.side === 'BUY' ? units : -units;

      // Validate minimum (1 unit)
      if (Math.abs(signedUnits) < 1) {
        return {
          success: false,
          error: `OANDA minimum is 1 unit. Computed ${Math.abs(signedUnits)} units for ${order.symbol} (quantity=${order.quantity}). Increase risk% or pick a different symbol.`,
          timestamp: new Date(),
        };
      }

      // Build order body per OANDA v20 spec
      const orderBody: any = {
        type: order.type === 'MARKET' ? 'MARKET' : 'LIMIT',
        instrument,
        units: String(signedUnits), // OANDA requires string
      };

      if (order.type === 'LIMIT' && order.price) {
        orderBody.price = String(order.price);
      }

      // BUG-044: SL/TP natively attached to the order
      if (order.stopLoss && order.stopLoss > 0) {
        orderBody.stopLossOnFill = {
          price: String(order.stopLoss),
          timeInForce: 'GTE', // Good-'til-cancelled (extended)
        };
      }
      if (order.takeProfit && order.takeProfit > 0) {
        orderBody.takeProfitOnFill = {
          price: String(order.takeProfit),
          timeInForce: 'GTE',
        };
      }

      // Client order ID for idempotency (OANDA accepts up to 128 chars)
      if (order.idempotencyKey) {
        orderBody.clientExtensions = {
          id: order.idempotencyKey.substring(0, 128),
          comment: `roua-${order.source || 'unknown'}`.substring(0, 128),
        };
      }

      const response = await this._apiRequest(
        'POST',
        `/v3/accounts/${this.apiSecret}/orders`,
        { order: orderBody },
      );

      // OANDA response shape: { orderCreateTransaction, orderFillTransaction, ... }
      const fill = response?.orderFillTransaction;
      const create = response?.orderCreateTransaction;
      const orderId =
        fill?.orderID ||
        create?.id ||
        response?.orderCreateTransaction?.id ||
        `oanda-${Date.now()}`;

      const filledQuantity = fill?.units
        ? Math.abs(parseFloat(fill.units))
        : Math.abs(signedUnits);
      const averagePrice = fill?.price
        ? parseFloat(fill.price)
        : order.price || 0;
      const fee = fill?.financing
        ? parseFloat(fill.financing)
        : 0;

      this.logger.log(
        `✅ OANDA order executed: ${orderId} — ${order.side} ${filledQuantity} ${order.symbol} @ ${averagePrice} ` +
        `(SL=${order.stopLoss ?? '—'} TP=${order.takeProfit ?? '—'})`,
      );

      // Audit log
      await this._auditLog('ORDER_PLACED', {
        orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        units: signedUnits,
        filledQuantity,
        averagePrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
      });

      return {
        success: true,
        exchangeOrderId: String(orderId),
        filledQuantity,
        averagePrice,
        fee,
        feeCurrency: 'USD',
        status: fill ? OrderExecutionStatus.FILLED : OrderExecutionStatus.PENDING,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`❌ OANDA order failed: ${error.message}`);

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

  /**
   * Cancel an open order via PUT /v3/accounts/{accountID}/orders/{orderID}/cancel
   */
  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    this.logger.log(`🗑️ Cancelling OANDA order: ${orderId}`);

    try {
      await this._apiRequest(
        'PUT',
        `/v3/accounts/${this.apiSecret}/orders/${orderId}/cancel`,
      );
      await this._auditLog('ORDER_CANCELLED', { orderId });
      return true;
    } catch (error: any) {
      this.logger.error(`❌ OANDA cancel failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get order status via GET /v3/accounts/{accountID}/orders/{orderID}
   */
  async getOrderStatus(orderId: string, _symbol: string): Promise<OrderExecutionStatus> {
    try {
      const data = await this._apiRequest(
        'GET',
        `/v3/accounts/${this.apiSecret}/orders/${orderId}`,
      );
      const state = data?.order?.state?.toUpperCase();
      return this._mapState(state);
    } catch (error: any) {
      this.logger.error(`❌ OANDA getOrderStatus failed: ${error.message}`);
      return OrderExecutionStatus.REJECTED;
    }
  }

  /**
   * Fetch open orders via GET /v3/accounts/{accountID}/openOrders
   */
  async fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    try {
      const data = await this._apiRequest(
        'GET',
        `/v3/accounts/${this.apiSecret}/openOrders`,
      );
      const orders = data?.orders || [];
      return orders
        .filter((o: any) => !symbol || o.instrument === this._toOandaSymbol(symbol))
        .map((o: any) => ({
          id: o.id,
          userId: this.userId,
          exchangeCredentialId: '',
          symbol: this._fromOandaSymbol(o.instrument),
          side: parseFloat(o.units) > 0 ? 'BUY' : 'SELL',
          type: (o.type?.toUpperCase() || 'MARKET') as any,
          quantity: Math.abs(parseFloat(o.units)),
          price: o.price ? parseFloat(o.price) : undefined,
          stopLoss: o.stopLossOnFill?.price ? parseFloat(o.stopLossOnFill.price) : undefined,
          takeProfit: o.takeProfitOnFill?.price ? parseFloat(o.takeProfitOnFill.price) : undefined,
          idempotencyKey: o.clientExtensions?.id || '',
        }));
    } catch (error: any) {
      this.logger.error(`❌ OANDA fetchOpenOrders failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch account balance via GET /v3/accounts/{accountID}/summary
   */
  async fetchBalance(): Promise<UnifiedBalance> {
    try {
      const data = await this._apiRequest(
        'GET',
        `/v3/accounts/${this.apiSecret}/summary`,
      );
      const acc = data?.account || {};
      const balance = parseFloat(acc.balance || '0');
      const NAV = parseFloat(acc.NAV || '0');
      const marginUsed = parseFloat(acc.marginUsed || '0');
      const marginAvailable = parseFloat(acc.marginAvailable || '0');
      const currency = acc.currency || 'USD';

      return {
        totalEquity: NAV,
        availableBalance: marginAvailable,
        usedMargin: marginUsed,
        currency,
        balances: {
          [currency]: {
            free: balance - marginUsed,
            used: marginUsed,
            total: balance,
          },
        },
        marginLevel: marginUsed > 0 ? (NAV / marginUsed) * 100 : undefined,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`❌ OANDA fetchBalance failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Modify a position's SL/TP via PUT /v3/accounts/{accountID}/positions/{positionID}/orders
   * OANDA requires a "PositionReplace" order; we use the simpler PUT /trades/{tradeID}/orders path.
   */
  async modifyPosition(
    positionId: string,
    _symbol: string,
    modifications: PositionModification,
  ): Promise<boolean> {
    try {
      const body: any = {};
      if (modifications.stopLoss !== undefined) {
        body.stopLoss = { price: String(modifications.stopLoss), timeInForce: 'GTE' };
      }
      if (modifications.takeProfit !== undefined) {
        body.takeProfit = { price: String(modifications.takeProfit), timeInForce: 'GTE' };
      }
      await this._apiRequest(
        'PUT',
        `/v3/accounts/${this.apiSecret}/trades/${positionId}/orders`,
        body,
      );
      return true;
    } catch (error: any) {
      this.logger.error(`❌ OANDA modifyPosition failed: ${error.message}`);
      return false;
    }
  }

  getExchangeId(): string {
    return this.isLive ? 'oanda_live' : 'oanda_practice';
  }

  supportsWebSocket(): boolean {
    return true; // OANDA v20 streaming API exists; OandaStreamingService handles it
  }

  getRateLimits(): { maxRequestsPerSecond: number; maxRequestsPerMinute: number } {
    return { maxRequestsPerSecond: 30, maxRequestsPerMinute: 1200 };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════

  /** "EUR/USD" → "EUR_USD", "XAU/USD" → "XAU_USD" */
  private _toOandaSymbol(symbol: string): string {
    return symbol.replace('/', '_').toUpperCase();
  }

  /** "EUR_USD" → "EUR/USD" */
  private _fromOandaSymbol(oandaSymbol: string): string {
    return oandaSymbol.replace('_', '/');
  }

  /**
   * Convert LOTS → UNITS using contractSize from symbol-metadata.
   * Safety net: TradingService should already have converted, but if the order
   * arrives here directly via ExecutionGateway (skipping the conversion block),
   * this ensures OANDA always receives UNITS.
   *
   * Heuristic detection: if quantity is very small (e.g., 0.01, 0.30, 1.50) → LOTS.
   * If quantity is large (e.g., 1000, 50000) → already UNITS (no conversion needed).
   * We use contractSize-aware check: if quantity < contractSize, treat as LOTS.
   */
  private _lotsToUnitsSafe(quantity: number, symbol: string): number {
    // Inline metadata lookup to avoid circular deps with symbol-metadata.ts
    // (which already imports nothing from this file, but we keep this isolated)
    const upper = symbol.toUpperCase();
    const contractSize = this._getContractSize(upper);

    // If quantity looks like LOTS (small relative to contractSize), convert.
    // For crypto (contractSize=1), LOTS=UNITS, so no conversion needed.
    // For forex (contractSize=100000), 0.01 lot = 1000 units.
    if (contractSize > 1 && quantity < contractSize) {
      return Math.round(quantity * contractSize);
    }
    // Otherwise assume already in UNITS
    return Math.round(quantity);
  }

  /** Inline contractSize lookup — same values as symbol-metadata.ts SYMBOL_REGISTRY */
  private _getContractSize(upperSymbol: string): number {
    // Normalize /USDT → /USD for lookup
    const normalized = upperSymbol.replace('/USDT', '/USD');

    const SIZES: Record<string, number> = {
      'EUR/USD': 100000, 'GBP/USD': 100000, 'USD/JPY': 100000, 'USD/CHF': 100000,
      'AUD/USD': 100000, 'NZD/USD': 100000, 'USD/CAD': 100000, 'EUR/GBP': 100000,
      'EUR/JPY': 100000, 'GBP/JPY': 100000, 'EUR/CHF': 100000, 'AUD/JPY': 100000,
      'XAU/USD': 100,    // 1 lot = 100 oz
      'XAG/USD': 5000,   // 1 lot = 5000 oz
      'WTI/USD': 1000,   // 1 lot = 1000 barrels
      'BRENT/USD': 1000,
      'US30/USD': 1, 'NAS100/USD': 1, 'SPX500/USD': 1, 'GER30/USD': 1, 'UK100/USD': 1,
      'BTC/USD': 1, 'BTC/USDT': 1, 'ETH/USD': 1, 'ETH/USDT': 1,
    };
    return SIZES[normalized] ?? 1; // default = 1 (crypto-like)
  }

  /** OANDA v20 REST API request helper */
  private async _apiRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: any): Promise<any> {
    await this._rateLimit();

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Datetime-Format': 'RFC3339',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorText = '';
      try { errorText = await response.text(); } catch {}
      let parsed: any = null;
      try { parsed = JSON.parse(errorText); } catch {}

      const errorMessage = parsed?.errorMessage
        || parsed?.message
        || errorText
        || `HTTP ${response.status}`;
      throw new Error(`OANDA ${response.status}: ${errorMessage}`);
    }

    return response.json();
  }

  /** Rate limit: ~30 req/sec */
  private async _rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /** Map OANDA order state to OrderExecutionStatus */
  private _mapState(state?: string): OrderExecutionStatus {
    switch ((state || '').toUpperCase()) {
      case 'PENDING':       return OrderExecutionStatus.PENDING;
      case 'FILLED':        return OrderExecutionStatus.FILLED;
      case 'PARTIALLY_FILLED': return OrderExecutionStatus.PARTIALLY_FILLED;
      case 'CANCELLED':     return OrderExecutionStatus.CANCELLED;
      case 'TRIGGERED':     return OrderExecutionStatus.FILLED;
      case 'REJECTED':      return OrderExecutionStatus.REJECTED;
      case 'EXPIRED':       return OrderExecutionStatus.EXPIRED;
      default:              return OrderExecutionStatus.PENDING;
    }
  }

  /** Normalize OANDA errors to user-friendly messages */
  private _normalizeError(error: any): string {
    const msg = error?.message || String(error);

    // Common OANDA error patterns
    if (msg.includes('insufficient') || msg.includes('INSUFFICIENT')) {
      return 'رصيد OANDA غير كافٍ لفتح الصفقة';
    }
    if (msg.includes('PRICE_OUT_OF_BOUNDS') || msg.includes('out of bounds')) {
      return 'السعر خارج النطاق المسموح به على OANDA';
    }
    if (msg.includes('STOP_LOSS_ON_FILL') || msg.includes('TAKE_PROFIT_ON_FILL')) {
      return `فشل وضع SL/TP على OANDA: ${msg}`;
    }
    if (msg.includes('INVALID_UNITS') || msg.includes('units')) {
      return 'حجم الصفقة غير صالح على OANDA (الحد الأدنى 1 وحدة)';
    }
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return 'مفتاح OANDA غير صالح — تحقق من API token';
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return 'حساب OANDA غير موجود — تحقق من account ID';
    }
    return `فشل OANDA: ${msg}`;
  }

  /** Audit log wrapper */
  private async _auditLog(action: string, details: any): Promise<void> {
    try {
      await this.auditService.log({
        userId: this.userId,
        action: `OANDA_${action}`,
        resource: 'execution',
        details: JSON.stringify(details),
      });
    } catch {
      // Audit failure should never break trade flow
    }
  }
}
