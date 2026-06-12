// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — MetaTrader 5 (MT5) Exchange Adapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// يربط منصة رؤى بحسابات MT5 عبر MetaAPI Cloud SDK.
// يدعم:
//   - حسابات Demo (تُنفذ فحوصات المخاطر بالكامل — كحساب حقيقي)
//   - حسابات Live (تُعامل كحقيقي)
//   - تنفيذ الأوامر Market/Limit
//   - جلب الأرصدة والمراكز المفتوحة
//   - إلغاء الأوامر المعلقة
//
// V181: حسابات Demo لا تتجاوز فحوصات المخاطر. الفرق الوحيد بين
// Demo و Live هو نوع الأموال (افتراضية مقابل حقيقية)، وليس مستوى الحماية.
// هذا يضمن أن سلوك التداول التجريبي يعكس الحساب الحقيقي بدقة.
//
// بيانات الاعتماد:
//   - apiKey      = رقم حساب MT5 (مثال: "12345678")
//   - apiSecret   = كلمة سر الحساب (مشفرة)
//   - passphrase  = اسم السيرفر (مثال: "MetaQuotes-Demo")
//
// متغيرات البيئة المطلوبة:
//   - METAAPI_TOKEN = رمز الوصول لـ MetaAPI Cloud

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
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * MetaAPI Connection State
 */
interface MT5ConnectionState {
  accountId: string;
  connection: any; // MetaApi MetaApiConnection instance
  connectedAt: number;
  isDemo: boolean;
}

/**
 * MT5Adapter — MetaTrader 5 Exchange Adapter for Roua Trading
 *
 * Architecture:
 * ┌───────────────────────────────────────────────────────────┐
 * │ Roua Trading Platform                                      │
 * │    ↓                                                       │
 * │ MT5Adapter.placeOrder() / cancelOrder() / fetchBalance()  │
 * │    ↓                                                       │
 * │ MetaAPI Cloud SDK                                          │
 * │    ↓                                                       │
 * │ MT5 Terminal (User's broker server)                        │
 * └───────────────────────────────────────────────────────────┘
 *
 * Connection Management:
 * - Connections are cached per accountId with 5-minute TTL
 * - Reconnection is automatic via MetaAPI SDK
 * - Demo accounts are flagged for display/audit only (V181: NOT for risk bypass)
 *
 * Symbol Mapping:
 * - MT5 uses formats like "EURUSD", "XAUUSD", "BTCUSD"
 * - Roua uses CCXT format like "EUR/USD", "XAU/USD", "BTC/USDT"
 * - This adapter handles the conversion automatically
 */
@Injectable()
export class MT5Adapter implements IExchangeAdapter {
  private readonly logger = new Logger(MT5Adapter.name);

  /** Connection cache — prevents creating new connections on every request */
  private static readonly connectionCache = new Map<string, MT5ConnectionState>();
  private static readonly CONNECTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /** MetaAPI SDK instance — lazy loaded */
  private metaApi: any = null;

  /** MT5 rate limits (conservative for MetaAPI) */
  private readonly rateLimits = {
    maxRequestsPerSecond: 5,
    maxRequestsPerMinute: 100,
  };

  /** Position size limit — max 5% of equity per order */
  private readonly MAX_POSITION_PERCENT = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly userId: string,
    private readonly accountInfo: {
      accountId: string;       // MT5 account number (stored as apiKey)
      password: string;         // MT5 password (stored as apiSecret, decrypted)
      server: string;           // MT5 server name (stored as passphrase)
      isDemo: boolean;          // true = demo account, false = live
    },
  ) {
    this.logger.log(
      `📊 MT5 Adapter initialized: account=${this.accountInfo.accountId}, ` +
      `server=${this.accountInfo.server}, demo=${this.accountInfo.isDemo}`,
    );
  }

  // ── IExchangeAdapter Implementation ──

  async placeOrder(order: UnifiedOrder): Promise<ExecutionResult> {
    this.logger.log(`📊 MT5 placing order: ${order.side} ${order.quantity} ${order.symbol}`);

    try {
      const connection = await this._getConnection();

      // Step 1: Position size check — max 5% of equity
      const equity = await this._getEquity(connection);
      if (equity > 0) {
        const mt5Symbol = this._toMT5Symbol(order.symbol);
        const currentPrice = await this._getCurrentPrice(connection, mt5Symbol);
        if (currentPrice > 0) {
          const orderValue = order.quantity * currentPrice;
          const positionPercent = (orderValue / equity) * 100;
          if (positionPercent > this.MAX_POSITION_PERCENT) {
            this.logger.warn(
              `📊 MT5 order rejected — positionPercent ${positionPercent.toFixed(1)}% > ${this.MAX_POSITION_PERCENT}% ` +
              `(orderValue=$${orderValue.toFixed(2)}, equity=$${equity.toFixed(2)})`,
            );
            return {
              success: false,
              error: `حجم المركز (${positionPercent.toFixed(1)}% من الرصيد) يتجاوز الحد الأقصى (${this.MAX_POSITION_PERCENT}%)`,
              timestamp: new Date(),
            };
          }
        }
      }

      // Step 2: Convert symbol format
      const mt5Symbol = this._toMT5Symbol(order.symbol);

      // Step 3: Execute order via MetaAPI
      const actionType = order.side === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
      const volume = this._normalizeVolume(order.quantity, mt5Symbol);

      const result = await connection.createOrder({
        actionType,
        symbol: mt5Symbol,
        volume,
        ...(order.type === 'LIMIT' && order.price ? { price: order.price } : {}),
        ...(order.stopLoss ? { stopLoss: order.stopLoss } : {}),
        ...(order.takeProfit ? { takeProfit: order.takeProfit } : {}),
        comment: `Roua-${order.idempotencyKey?.slice(0, 20) || Date.now()}`,
      });

      // Step 4: Map result to ExecutionResult
      const executionResult: ExecutionResult = {
        success: true,
        exchangeOrderId: result.orderId || result.id || `mt5-${Date.now()}`,
        filledQuantity: volume,
        averagePrice: result.price || order.price || 0,
        fee: result.commission || 0,
        feeCurrency: 'USD',
        status: OrderExecutionStatus.FILLED,
        timestamp: new Date(),
      };

      await this._auditLog('MT5_ORDER_PLACED', {
        orderId: executionResult.exchangeOrderId,
        symbol: mt5Symbol,
        side: order.side,
        type: order.type,
        quantity: volume,
        price: executionResult.averagePrice,
        isDemo: this.accountInfo.isDemo,
      });

      this.logger.log(
        `✅ MT5 order executed: ${executionResult.exchangeOrderId} — ` +
        `${order.side} ${volume} ${mt5Symbol} @ ${executionResult.averagePrice}`,
      );

      return executionResult;
    } catch (error: any) {
      this.logger.error(`❌ MT5 order failed: ${error.message}`);

      // Common error patterns — map to user-friendly messages
      const errorMsg = error.message || '';
      if (errorMsg.includes('No connection') || errorMsg.includes('ECONNREFUSED')) {
        return {
          success: false,
          error: 'فشل الاتصال بسيرفر MT5 — تأكد أن الـ Terminal مفتوح أو أن الـ VPS يعمل',
          timestamp: new Date(),
        };
      }
      if (errorMsg.includes('Invalid volume') || errorMsg.includes('volume')) {
        return {
          success: false,
          error: `حجم الكمية غير صالح لـ MT5: ${order.quantity} — تحقق من الحد الأدنى والأقصى للحجم على ${order.symbol}`,
          timestamp: new Date(),
        };
      }
      if (errorMsg.includes('Insufficient') || errorMsg.includes('Not enough money')) {
        return {
          success: false,
          error: 'رصيد غير كافٍ في حساب MT5 لفتح هذا المركز',
          timestamp: new Date(),
        };
      }
      if (errorMsg.includes('Market is closed') || errorMsg.includes('trade is disabled')) {
        return {
          success: false,
          error: 'السوق مغلق حالياً — لا يمكن تنفيذ الصفقة',
          timestamp: new Date(),
        };
      }

      return {
        success: false,
        error: `فشل تنفيذ أمر MT5: ${errorMsg}`,
        timestamp: new Date(),
      };
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    this.logger.log(`📊 MT5 cancelling order: ${orderId}`);

    try {
      const connection = await this._getConnection();

      // MetaAPI: cancel a pending order
      await connection.cancelOrder(orderId);

      await this._auditLog('MT5_ORDER_CANCELLED', { orderId, symbol });
      return true;
    } catch (error: any) {
      this.logger.error(`❌ MT5 cancel failed for ${orderId}: ${error.message}`);
      return false;
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus> {
    try {
      const connection = await this._getConnection();

      // Check history orders
      const historyOrders = await connection.getHistoryOrdersByPosition(orderId);
      if (historyOrders && historyOrders.length > 0) {
        const order = historyOrders[0];
        return this._mapOrderStatus(order.state || order.status);
      }

      // Check pending orders
      const pendingOrders = await connection.getPendingOrders();
      const pending = pendingOrders?.find((o: any) => o.id === orderId);
      if (pending) {
        return OrderExecutionStatus.PENDING;
      }

      return OrderExecutionStatus.PENDING;
    } catch (error: any) {
      this.logger.error(`Failed to get MT5 order status for ${orderId}: ${error.message}`);
      return OrderExecutionStatus.PENDING;
    }
  }

  async fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    try {
      const connection = await this._getConnection();
      const pendingOrders = await connection.getPendingOrders();

      if (!pendingOrders || pendingOrders.length === 0) return [];

      return pendingOrders
        .filter((o: any) => !symbol || this._fromMT5Symbol(o.symbol) === symbol)
        .map((o: any) => ({
          id: o.id,
          userId: this.userId,
          exchangeCredentialId: '',
          symbol: this._fromMT5Symbol(o.symbol),
          side: (o.actionType === 'ORDER_TYPE_BUY' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
          type: 'LIMIT' as 'LIMIT',
          quantity: o.volume || o.currentVolume || 0,
          price: o.price || o.openPrice,
          stopLoss: o.stopLoss,
          takeProfit: o.takeProfit,
          idempotencyKey: o.comment || o.id,
        }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch MT5 open orders: ${error.message}`);
      return [];
    }
  }

  async fetchBalance(): Promise<UnifiedBalance> {
    try {
      const connection = await this._getConnection();
      const accountInfo = await connection.getAccountInformation();

      const equity = accountInfo.equity || 0;
      const balance = accountInfo.balance || 0;
      const margin = accountInfo.margin || 0;
      const freeMargin = accountInfo.freeMargin || Math.max(0, equity - margin);
      const currency = accountInfo.currency || 'USD';

      this.logger.debug(
        `📊 MT5 balance: balance=$${balance}, equity=$${equity}, ` +
        `margin=$${margin}, free=$${freeMargin}, currency=${currency}`,
      );

      return {
        totalEquity: equity,
        availableBalance: freeMargin,
        usedMargin: margin,
        currency,
        balances: {
          [currency]: {
            free: freeMargin,
            used: margin,
            total: equity,
          },
        },
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch MT5 balance: ${error.message}`);
      return {
        totalEquity: 0,
        availableBalance: 0,
        usedMargin: 0,
        currency: 'USD',
        balances: { USD: { free: 0, used: 0, total: 0 } },
        timestamp: new Date(),
      };
    }
  }

  getExchangeId(): string {
    return 'mt5';
  }

  supportsWebSocket(): boolean {
    return true; // MetaAPI supports WebSocket for real-time data
  }

  getRateLimits(): { maxRequestsPerSecond: number; maxRequestsPerMinute: number } {
    return this.rateLimits;
  }

  // ── V226: Position Modification ──

  /**
   * V226: Modify an existing MT5 position's stop-loss and/or take-profit.
   * This is critical for the Agent and PositionMonitor which need to
   * update SL/TP on open positions (trailing stop, breakeven, etc.).
   *
   * MT5 natively supports position modification via MetaAPI:
   *   connection.modifyPosition(positionId, { stopLoss, takeProfit })
   *
   * @param positionId The MT5 position ticket number
   * @param symbol The trading pair (CCXT format, will be converted)
   * @param modifications Object with optional stopLoss and/or takeProfit
   */
  async modifyPosition(positionId: string, symbol: string, modifications: PositionModification): Promise<boolean> {
    this.logger.log(
      `📊 V226: MT5 modifying position ${positionId} (${symbol}): ` +
      `SL=${modifications.stopLoss ?? 'unchanged'}, TP=${modifications.takeProfit ?? 'unchanged'}`
    );

    try {
      const connection = await this._getConnection();

      // Build modification payload — only include fields that are specified
      const modifyParams: Record<string, any> = {};
      if (modifications.stopLoss !== undefined) {
        modifyParams.stopLoss = modifications.stopLoss;
      }
      if (modifications.takeProfit !== undefined) {
        modifyParams.takeProfit = modifications.takeProfit;
      }

      // MetaAPI: modifyPosition takes the position ticket and modification object
      await connection.modifyPosition(positionId, modifyParams);

      await this._auditLog('MT5_POSITION_MODIFIED', {
        positionId,
        symbol,
        stopLoss: modifications.stopLoss,
        takeProfit: modifications.takeProfit,
        isDemo: this.accountInfo.isDemo,
      });

      this.logger.log(
        `✅ V226: MT5 position ${positionId} modified: ` +
        `SL=${modifications.stopLoss ?? 'unchanged'}, TP=${modifications.takeProfit ?? 'unchanged'}`
      );

      return true;
    } catch (error: any) {
      this.logger.error(`❌ V226: MT5 modify position ${positionId} failed: ${error.message}`);

      // Common error patterns
      const errorMsg = error.message || '';
      if (errorMsg.includes('Invalid stops') || errorMsg.includes('invalid stop')) {
        this.logger.warn(
          `⚠️ MT5: Invalid SL/TP values for position ${positionId}. ` +
          `SL=${modifications.stopLoss}, TP=${modifications.takeProfit}. ` +
          `MT5 requires SL below current price for BUY, above for SELL.`
        );
      }
      if (errorMsg.includes('Position not found') || errorMsg.includes('position does not exist')) {
        this.logger.warn(`⚠️ MT5: Position ${positionId} not found — may already be closed`);
      }

      return false;
    }
  }

  // ── Private: Connection Management ──

  /**
   * Get or create a MetaAPI connection for this account.
   * Connections are cached for 5 minutes to avoid repeated setup.
   */
  private async _getConnection(): Promise<any> {
    const cacheKey = this.accountInfo.accountId;
    const cached = MT5Adapter.connectionCache.get(cacheKey);

    // Check cache validity
    if (cached && Date.now() - cached.connectedAt < MT5Adapter.CONNECTION_TTL_MS) {
      try {
        // V175 FIX: isConnected() removed from MetaAPI SDK v29+.
        // Instead of checking isConnected(), just try to use the cached connection.
        // If it's stale, the next operation will throw and we'll reconnect.
        return cached.connection;
      } catch {
        // Connection dead — remove from cache and reconnect
        MT5Adapter.connectionCache.delete(cacheKey);
      }
    }

    // Create new connection
    const metaApi = await this._getMetaApiInstance();
    const accountApi = metaApi.metatraderAccountApi;

    // V172: Find existing account by login number first.
    // getAccount() expects MetaAPI UUID, not login number.
    let account;
    try {
      const allAccounts = await accountApi.getAccountsWithInfiniteScrollPagination();
      const existing = allAccounts.find((a: any) => String(a.login) === String(this.accountInfo.accountId));
      if (existing) {
        account = await accountApi.getAccount(existing.id);
        this.logger.log(`📊 Found existing MT5 account ${this.accountInfo.accountId} (MetaAPI ID: ${existing.id})`);
      }
    } catch (searchErr: any) {
      this.logger.warn(`📊 Failed to search MetaAPI accounts: ${searchErr.message?.substring(0, 100)}`);
    }

    // V187: If not found, create with CORRECT MetaAPI parameters.
    // ROOT CAUSE of 503/timeout errors (deep research):
    //   1. type was 'demo'/'live' — WRONG! Must be 'cloud-g1' or 'cloud-g2'
    //   2. quoteStreamingIntervalSeconds — WRONG! Must be quoteStreamingIntervalInSeconds
    //   3. Missing deploy() + waitConnected() after createAccount()
    if (!account) {
      this.logger.log(`📊 V187: Creating MT5 account ${this.accountInfo.accountId} (type=cloud-g2)...`);
      try {
        account = await accountApi.createAccount({
          login: this.accountInfo.accountId,
          password: this.accountInfo.password,
          server: this.accountInfo.server,
          type: 'cloud-g2',  // V187: MUST be 'cloud-g1' or 'cloud-g2', NOT 'demo'/'live'!
          name: `Roua-${this.userId.slice(0, 8)}`,
          platform: 'mt5',
          magic: 123456,
          quoteStreamingIntervalInSeconds: 2.5,  // V187: Correct field name
          reliability: 'high',
        });

        // V187: CRITICAL — deploy() + waitConnected() are required!
        this.logger.log(`📊 V187: Deploying MT5 account ${this.accountInfo.accountId}...`);
        await account.deploy();
        this.logger.log(`📊 V187: Waiting for broker connection...`);
        await account.waitConnected();
        this.logger.log(`📊 V187: MT5 account created, deployed, and connected!`);
      } catch (createErr: any) {
        this.logger.warn(
          `📊 V187: Failed to create/deploy MT5 account ${this.accountInfo.accountId}: ` +
          `${createErr.message?.substring(0, 100)}`
        );
        throw new Error(`فشل تسجيل حساب MT5: ${createErr.message?.substring(0, 80) || 'خطأ غير معروف'}`);
      }
    }

    // V187: Check account state and connection status
    const accountState = (account as any).state;
    const connectionStatus = (account as any).connectionStatus;
    this.logger.log(
      `📊 V187: Account ${this.accountInfo.accountId} state=${accountState || '?'}, ` +
      `connectionStatus=${connectionStatus || '?'}`
    );

    if (accountState && !['DEPLOYED', 'DEPLOYING'].includes(accountState)) {
      this.logger.warn(`📊 V187: Account is ${accountState}, deploying...`);
      try {
        await (account as any).deploy();
        await (account as any).waitDeployed();
      } catch (deployErr: any) {
        this.logger.warn(`📊 V187: Deploy failed: ${deployErr.message?.substring(0, 80)}`);
        throw new Error(`حساب MT5 غير مُنشر (حالة: ${accountState}): ${deployErr.message?.substring(0, 60)}`);
      }
    }

    // V187: Wait for broker connection if not connected
    if (connectionStatus && connectionStatus !== 'CONNECTED') {
      this.logger.warn(`📊 V187: Account deployed but not connected to broker (status=${connectionStatus}). Waiting...`);
      try {
        await account.waitConnected();
      } catch {
        // Try to proceed anyway
      }
    }

    // Connect to the account
    const connection = account.getRPCConnection();
    // V175 FIX: isConnected() removed from MetaAPI SDK v29+.
    // Just call connect() directly — if already connected, it's a no-op.
    try {
      await connection.connect();
      await connection.waitSynchronized();
    } catch (connectErr: any) {
      // Connection might already be established — try to proceed
      this.logger.warn(`📊 MT5 connect/sync note: ${connectErr.message?.substring(0, 80)}`);
    }

    // Cache the connection
    const state: MT5ConnectionState = {
      accountId: this.accountInfo.accountId,
      connection,
      connectedAt: Date.now(),
      isDemo: this.accountInfo.isDemo,
    };
    MT5Adapter.connectionCache.set(cacheKey, state);

    // Cleanup old connections
    this._cleanupStaleConnections();

    this.logger.log(`📊 MT5 connected: account=${this.accountInfo.accountId}, demo=${this.accountInfo.isDemo}`);

    return connection;
  }

  /**
   * Lazy-load MetaAPI SDK instance.
   * The token is read from METAAPI_TOKEN environment variable.
   */
  private async _getMetaApiInstance(): Promise<any> {
    if (this.metaApi) return this.metaApi;

    try {
      // Dynamic import to avoid hard dependency at compile time
      // MetaApi is the default export of metaapi.cloud-sdk
      const metaApiModule: any = await import('metaapi.cloud-sdk');
      const MetaApiClass = metaApiModule.default || metaApiModule;
      const token = process.env.METAAPI_TOKEN;

      if (!token) {
        throw new Error('METAAPI_TOKEN غير مضبوط — مطلوب للاتصال بـ MetaAPI Cloud');
      }

      this.metaApi = new MetaApiClass(token);
      return this.metaApi;
    } catch (error: any) {
      if (error.message?.includes('METAAPI_TOKEN')) throw error;
      throw new Error(`فشل في تحميل MetaAPI SDK: ${error.message}. تأكد من تثبيت metaapi.cloud-sdk`);
    }
  }

  /**
   * Remove expired connections from cache
   */
  private _cleanupStaleConnections(): void {
    const now = Date.now();
    for (const [key, state] of MT5Adapter.connectionCache.entries()) {
      if (now - state.connectedAt > MT5Adapter.CONNECTION_TTL_MS) {
        try {
          state.connection.close?.();
        } catch { /* non-critical */ }
        MT5Adapter.connectionCache.delete(key);
      }
    }
  }

  // ── Private: Symbol Conversion ──

  /**
   * Convert CCXT-style symbol (EUR/USD) to MT5 format (EURUSD)
   */
  private _toMT5Symbol(ccxtSymbol: string): string {
    // Remove slashes and convert to uppercase
    // EUR/USD → EURUSD, XAU/USD → XAUUSD, BTC/USDT → BTCUSD
    let mt5Symbol = ccxtSymbol.replace('/', '').toUpperCase();

    // Handle USDT suffix — MT5 typically doesn't use USDT
    if (mt5Symbol.endsWith('USDT')) {
      mt5Symbol = mt5Symbol.replace('USDT', 'USD');
    }

    return mt5Symbol;
  }

  /**
   * Convert MT5-style symbol (EURUSD) to CCXT format (EUR/USD)
   */
  private _fromMT5Symbol(mt5Symbol: string): string {
    const symbol = mt5Symbol.toUpperCase();

    // Known forex pairs — 6 chars, split in middle
    const forexPairs = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURGBP', 'EURJPY', 'GBPJPY', 'CHFJPY', 'AUDJPY', 'CADJPY', 'NZDJPY',
      'EURAUD', 'EURCAD', 'EURNZD', 'EURCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD',
      'GBPSGD', 'AUDCAD', 'AUDNZD', 'AUDSGD', 'CADCHF', 'NZDCAD', 'NZDCHF',
      'NZDSGD', 'USDSGD', 'USDHKD', 'USDSEK', 'USDNOK', 'USDDKK', 'USDZAR',
      'USDTRY', 'USDCNH', 'USDMXN', 'USDPLN', 'USDCZK', 'USDHUF', 'USDTHB',
    ];

    // Known commodities
    const commodityPairs = [
      'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDEUR', 'XPDUSD',
      'XCUUSD', 'XBRUSD', 'XTIUSD',  // Copper, Brent, WTI
    ];

    // Known crypto
    const cryptoPairs = [
      'BTCUSD', 'ETHUSD', 'LTCUSD', 'BCHUSD', 'XRPUSD', 'ADAUSD',
      'SOLUSD', 'DOTUSD', 'DOGEUSD', 'AVAXUSD', 'MATICUSD',
    ];

    if (forexPairs.includes(symbol)) {
      // Major pairs: first 3 + / + last 3
      return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    }

    if (commodityPairs.includes(symbol)) {
      // Commodities: XAU/USD, XAG/USD, etc.
      return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    }

    if (cryptoPairs.includes(symbol)) {
      // Crypto: BTC/USD, ETH/USD — add USDT for CCXT compatibility
      return `${symbol.slice(0, -3)}/USDT`;
    }

    // Fallback: try to split at common base currencies
    const bases = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'USDT'];
    for (const base of bases) {
      if (symbol.endsWith(base) && symbol.length > base.length) {
        const quote = base;
        const currency = symbol.slice(0, symbol.length - base.length);
        return `${currency}/${quote}`;
      }
    }

    // Last resort: return as-is with a slash in the middle
    const mid = Math.ceil(symbol.length / 2);
    return `${symbol.slice(0, mid)}/${symbol.slice(mid)}`;
  }

  // ── Private: Market Data ──

  /**
   * Get current price for a symbol from MT5
   */
  private async _getCurrentPrice(connection: any, mt5Symbol: string): Promise<number> {
    try {
      const quote = await connection.getSymbolPrice(mt5Symbol);
      if (quote) {
        return quote.bid || quote.ask || quote.last || 0;
      }
      return 0;
    } catch (error: any) {
      this.logger.warn(`Failed to get MT5 price for ${mt5Symbol}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get account equity from MT5
   */
  private async _getEquity(connection: any): Promise<number> {
    try {
      const accountInfo = await connection.getAccountInformation();
      return accountInfo?.equity || 0;
    } catch {
      return 0;
    }
  }

  // ── Private: Helpers ──

  /**
   * Normalize volume to MT5 requirements:
   * - Must be positive
   * - Must respect minimum volume step (typically 0.01 lots)
   * - Must be within broker's allowed range
   */
  private _normalizeVolume(quantity: number, _mt5Symbol: string): number {
    // MT5 uses lots — most brokers use 0.01 step
    // For now, round to 2 decimal places (0.01 lot step)
    const volume = Math.max(0.01, Math.round(quantity * 100) / 100);
    return volume;
  }

  /**
   * Map MT5 order state to OrderExecutionStatus
   */
  private _mapOrderStatus(state: string): OrderExecutionStatus {
    const stateLower = (state || '').toLowerCase();
    if (stateLower.includes('filled') || stateLower.includes('deal')) {
      return OrderExecutionStatus.FILLED;
    }
    if (stateLower.includes('partial')) {
      return OrderExecutionStatus.PARTIALLY_FILLED;
    }
    if (stateLower.includes('cancel')) {
      return OrderExecutionStatus.CANCELLED;
    }
    if (stateLower.includes('reject')) {
      return OrderExecutionStatus.REJECTED;
    }
    if (stateLower.includes('expire')) {
      return OrderExecutionStatus.EXPIRED;
    }
    return OrderExecutionStatus.PENDING;
  }

  /**
   * Audit log helper
   */
  private async _auditLog(action: string, details: Record<string, any>): Promise<void> {
    try {
      await this.auditService.log({
        userId: this.userId,
        action: `MT5_${action}`,
        resource: 'execution-adapter',
        details: JSON.stringify({
          ...details,
          accountId: this.accountInfo.accountId,
          server: this.accountInfo.server,
          isDemo: this.accountInfo.isDemo,
        }),
      });
    } catch {
      // Never fail execution flow due to audit logging issues
    }
  }

  /**
   * Cleanup — close connections when adapter is discarded
   */
  destroy(): void {
    const cacheKey = this.accountInfo.accountId;
    const cached = MT5Adapter.connectionCache.get(cacheKey);
    if (cached) {
      try {
        cached.connection.close?.();
      } catch { /* non-critical */ }
      MT5Adapter.connectionCache.delete(cacheKey);
    }
  }
}
