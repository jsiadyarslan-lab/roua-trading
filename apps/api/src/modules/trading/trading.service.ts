import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  OnModuleDestroy,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { CredentialsService } from '../portfolio/credentials/credentials.service';
import { ExchangeService } from '../exchange/exchange.service';
// REMOVED: RiskManagerService — deprecated, replaced by UnifiedRiskService (V219)
import { UnifiedRiskService } from './services/unified-risk.service';
import { AuditService } from '../../audit/audit.service';
import { getSymbolMetadata, AssetClass, calculateMargin } from './services/symbol-metadata';
import * as ccxt from 'ccxt';
import * as crypto from 'crypto';
import {
  PlaceOrderRequest,
  ClosePositionRequest,
} from './trading.types';
import { OrderSide as PrismaOrderSide, OrderType as PrismaOrderType, OrderStatus as PrismaOrderStatus } from './trading.types';
import { ExecutionGatewayService } from '../execution/gateways/execution-gateway.service';
// V223: StrategicCouncilService — forwardRef import for cross-module DI
import { StrategicCouncilService } from '../ai/strategic-council/strategic-council.service';
// V339: Trade Lifecycle Logger — for OPEN event logging
import { TradeLifecycleLogger } from '../../common/trade-lifecycle/trade-lifecycle.logger';
/**
 * Trading Engine Service — Roua Trading (رؤى)
 *
 * Core trading engine that handles:
 * 1. Order placement (market, limit)
 * 2. Order cancellation
 * 3. Position tracking and management
 * 4. Trade execution and recording
 * 5. Integration with exchange APIs via CCXT
 * 6. Risk management checks before execution
 * 7. Automatic position opening/closing
 *
 * Note: Order, Position, and Trade models use Decimal for financial fields.
 * When writing, pass as number/string (Prisma accepts both). When reading,
 * Decimal fields return Prisma.Decimal objects — convert using .toNumber().
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private readonly exchangeCache = new Map<string, any>(); // credentialId:exchangeName -> exchange instance
  private readonly exchangeCacheTimestamps = new Map<string, number>(); // TTL tracking
  private _exchangeCacheCleanupInterval: NodeJS.Timeout | null = null; // V220: cleanup on destroy
  private readonly EXCHANGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 50; // prevent unbounded growth

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly credentialsService: CredentialsService,
    private readonly exchangeService: ExchangeService,
    private readonly unifiedRisk: UnifiedRiskService,  // V219: Unified risk — replaces RiskManager
    private readonly auditService: AuditService,
    @Optional() private readonly executionGateway?: ExecutionGatewayService, // V226: MT5 execution (optional = safe)
    // V223: StrategicCouncilService — @Global() module provides this. Was @Optional()
    // before V223.1, which caused silent undefined → brief cancellation never ran.
    // Still marked @Optional() because TypeScript requires optional params after required ones,
    // but at runtime DI will always provide it (module is @Global). If DI ever breaks,
    // the invalidateBriefsForSymbol call will throw loudly inside the try/catch.
    @Optional() @Inject(forwardRef(() => StrategicCouncilService))
    private readonly strategicCouncil?: StrategicCouncilService,
    // V339: Trade Lifecycle Logger — for OPEN event logging
      @Optional() @Inject(TradeLifecycleLogger) private readonly lifecycle?: TradeLifecycleLogger,
  ) {
    this.logger.log(
      '⚡ Trading Engine initialized — ready for execution',
    );
    // REMOVED: _ensureExchangeCredentialColumns() — all DDL (ALTER TABLE, CREATE TABLE)
    // has been removed from application code. Schema changes must ONLY be done via
    // `prisma migrate deploy` in start.sh. Running DDL from application code:
    //   1. Causes connection pool exhaustion (each DDL query opens connections)
    //   2. Conflicts with prisma db push / migrate deploy
    //   3. Was a contributing factor to the catastrophic data loss incident
    // FIX: Clean expired exchange instances every 10 minutes (prevent memory leak)
    // V220-FIX: Store interval reference for cleanup on module destroy
    this._exchangeCacheCleanupInterval = setInterval(() => this._cleanExchangeCache(), 10 * 60 * 1000);
  }

  async onModuleDestroy(): Promise<void> {
    // V220-FIX: Clean up interval to prevent memory leak on shutdown/hot-reload
    if (this._exchangeCacheCleanupInterval) {
      clearInterval(this._exchangeCacheCleanupInterval);
      this._exchangeCacheCleanupInterval = null;
    }
  }

  private _cleanExchangeCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key] of this.exchangeCache.entries()) {
      const ts = this.exchangeCacheTimestamps.get(key) || 0;
      if (now - ts > this.EXCHANGE_CACHE_TTL_MS) {
        this.exchangeCache.delete(key);
        this.exchangeCacheTimestamps.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`🗑️ ExchangeCache: cleaned ${cleaned} expired instances (${this.exchangeCache.size} remaining)`);
    }
    // Hard limit: evict oldest if over MAX_CACHE_SIZE
    if (this.exchangeCache.size > this.MAX_CACHE_SIZE) {
      const oldest = [...this.exchangeCache.entries()].sort((a, b) => (this.exchangeCacheTimestamps.get(a[0]) || 0) - (this.exchangeCacheTimestamps.get(b[0]) || 0));
      oldest.slice(0, this.exchangeCache.size - this.MAX_CACHE_SIZE).forEach(([k]) => { this.exchangeCache.delete(k); this.exchangeCacheTimestamps.delete(k); });
    }
  }

  // REMOVED: _ensureExchangeCredentialColumns() — all DDL removed from application code.
  // Schema changes must ONLY be done via `prisma migrate deploy` in start.sh.

  // ── Order Management ──

  /**
   * Place a new order
   * 1. Validate the request
   * 2. Run risk checks
   * 3. Execute on the exchange via CCXT
   * 4. Record in database
   * 5. Open/update position
   */
  async placeOrder(
    userId: string,
    request: PlaceOrderRequest,
    ipAddress?: string,
    userAgent?: string,
  ) {
    this.logger.log(
      `📋 Order request: ${request.side} ${request.quantity} ${request.symbol} (${request.type})`,
    );

    // #1 FIX: Round quantity to appropriate precision BEFORE execution.
    // This ensures margin = quantity * price matches exactly,
    // preventing rounding errors that cause margin drift.
    // Different asset classes need different precision:
    // - Crypto: 6 decimal places (e.g., 0.001234 BTC)
    // - Forex: 2 decimal places (e.g., 1000 units)
    // - Stocks: 0 decimal places (whole shares)
    const meta = getSymbolMetadata(request.symbol);
    const precision = meta.assetClass === AssetClass.CRYPTO ? 6
      : meta.assetClass === AssetClass.FOREX ? 2
      : meta.assetClass === AssetClass.COMMODITY ? 2
      : 0;
    request.quantity = Math.round(request.quantity * Math.pow(10, precision)) / Math.pow(10, precision);

    if (request.quantity <= 0) {
      throw new BadRequestException(
        `الكمية بعد التقريب أصبحت صفراً — قيمة الطلب صغيرة جداً (${request.quantity})`,
      );
    }

    // Step 1: Validate credential ownership
    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' credentials
    const credential = await this.prisma.exchangeCredential.findFirst({
      where: { id: request.credentialId, userId },
    });

    if (!credential) {
      throw new NotFoundException('بيانات الاعتماد غير موجودة');
    }

    if (!credential.isValid) {
      throw new BadRequestException(
        'بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API',
      );
    }

    // Step 2: Check if credential has trade permission
    // FIX: Skip permissions check for paper-trading and test exchange credentials.
    // Paper-trading credentials have 'paper' as the API key (not real keys),
    // and their permissions field is often the Prisma default "read" (a plain
    // string, not a JSON array). JSON.parse("read") throws SyntaxError,
    // which crashes the entire placeOrder — meaning paper trades NEVER create
    // Position records in the DB, causing trades to disappear on page refresh.
    // Paper trading is simulation — there are no real API permissions to check.
    const isTestExchange = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'].includes(credential.exchange)
      || credential.exchange.endsWith('_test')
      || credential.exchange.endsWith('_paper')
      || credential.exchange.endsWith('-test')
      || credential.exchange.endsWith('-paper');

    if (!isTestExchange) {
      const permissions = JSON.parse(credential.permissions || '["read"]');
      if (!permissions.includes('trade')) {
        throw new ForbiddenException(
          'مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade',
        );
      }
    }

    // Step 3: Get current market price for risk check
    // FIX: For MARKET orders, use the provided price if available (e.g., from SmartExecutor
    // which already fetched it). Only fetch from ExchangeService as fallback.
    // Previously, MARKET orders always re-fetched the price, which could fail on Railway
    // for some pairs, causing paper trades to be rejected.
    let currentPrice = request.price;
    if (!currentPrice) {
      try {
        const quote = await this.exchangeService.getQuote(request.symbol);
        currentPrice = quote.price;
      } catch (error: any) {
        throw new BadRequestException(
          `فشل في جلب سعر السوق لـ ${request.symbol}: ${error.message}`,
        );
      }
    }

    // Step 4: Risk checks — SKIPPED if already validated by RiskGatekeeper.
    // V176 FIX: Removed duplicate RiskManager.checkOrderRisk() call.
    // Previously, the V1 pipeline ran TWO risk checks:
    //   1. RiskGatekeeper.validateOrder() in TradingController (5-point check)
    //   2. RiskManager.checkOrderRisk() here (overlapping checks)
    // This caused double latency and could produce contradictory results
    // (e.g., RiskGatekeeper allows but RiskManager blocks, or vice versa).
    // Now: RiskGatekeeper is the SOLE risk gateway for V1 (same as V2).
    // RiskManager is still used for position sizing calculations.
    // If RiskGatekeeper was NOT called (e.g., internal call from OrderDispatcher),
    // the `skipRiskCheck` flag can be set to false to enforce the check here.
    // V178 FIX: Inverted default — risk check runs by DEFAULT (skipRiskCheck === true means skip).
    // Previously: skipRiskCheck !== false → undefined = skip (INSECURE).
    // Now: skipRiskCheck === true → must explicitly opt-in to skip.
    // Controllers set skipRiskCheck=true after RiskGatekeeper validates.
    // Internal calls without a controller MUST go through risk check.
    // V219: Removed double risk check (RiskManager.checkOrderRisk).
    // Previously, orders went through BOTH RiskGatekeeper AND RiskManager,
    // which could CONTRADICT each other (Gatekeeper uses 2% max position,
    // RiskManager uses 20%). Now UnifiedRiskService.validateOrder() is the
    // SINGLE risk gate — called once by OrderDispatcher/Controller.
    // This code path is now only for internal calls that skipRiskCheck=false.
    const skipRiskCheck = request.skipRiskCheck === true;
    if (!skipRiskCheck) {
      const riskCheck = await this.unifiedRisk.validateOrder({
        userId,
        exchangeCredentialId: credential.id,
        symbol: request.symbol,
        side: request.side as any,
        type: (request.type || 'MARKET') as any,
        quantity: request.quantity,
        price: currentPrice,
        stopLoss: request.stopLoss || 0,
        takeProfit: request.takeProfit,
        idempotencyKey: `internal-${Date.now()}`,
        isPaperTrading: credential.exchange === 'paper-trading',
        source: request.source,
        strategy: request.strategy,
      });

      if (!riskCheck.allowed) {
        await this.auditService.log({
          userId,
          action: 'ORDER_REJECTED_RISK',
          resource: 'order',
          details: JSON.stringify({
            symbol: request.symbol,
            side: request.side,
            reason: riskCheck.reason,
          }),
          ipAddress,
          userAgent,
        });

        throw new ForbiddenException(
          `🛡️ تم رفض الطلب: ${riskCheck.reason}`,
        );
      }
    }

    // Step 5: Execute order on the exchange
    // FIX: Handle paper-trading separately — CCXT doesn't have a 'paper-trading' exchange,
    // so calling _executeOnExchange with 'paper-trading' would always fail with
    // "exchange not supported". This was the ROOT CAUSE of zero trade executions:
    // RiskGatekeeper correctly bypasses paper-trading, but TradingService always
    // tried to execute via CCXT, which fails for paper-trading credentials.
    let execution: any;
    if (credential.exchange === 'paper-trading') {
      execution = await this._executePaperTrade(request, currentPrice, userId);
    } else {
      execution = await this._executeOnExchange(
        credential.exchange,
        credential.id,
        request,
        userId,
      );
    }

    if (!execution.success) {
      // Record the failed order
      // idempotencyKey is required (String @unique)
      const order = await this.prisma.order.create({
        data: {
          userId,
          exchangeCredentialId: request.credentialId,
          exchange: credential.exchange,
          symbol: request.symbol,
          side: request.side,
          type: request.type,
          status: 'REJECTED' as PrismaOrderStatus,
          quantity: request.quantity,
          price: request.price ?? null,
          stopLoss: request.stopLoss ?? null,
          idempotencyKey: request.idempotencyKey || `legacy-${Date.now()}-${crypto.randomUUID()}`,
        },
      });

      await this.auditService.log({
        userId,
        action: 'ORDER_REJECTED_EXCHANGE',
        resource: 'order',
        details: JSON.stringify({
          orderId: order.id,
          symbol: request.symbol,
          error: execution.error,
        }),
        ipAddress,
        userAgent,
      });

      throw new BadRequestException(
        `فشل في تنفيذ الطلب: ${execution.error}`,
      );
    }

    // Step 6-9: Record order, update position, record trade, update signal — all in one transaction
    // Note: averagePrice (not averageFillPrice) is the correct field name
    // idempotencyKey is required (String @unique)
    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId,
          exchangeCredentialId: request.credentialId,
          exchange: credential.exchange,
          symbol: request.symbol,
          side: request.side,
          type: request.type,
          status:
            (execution.filledQuantity || 0) >= request.quantity
              ? ('FILLED' as PrismaOrderStatus)
              : ('PARTIALLY_FILLED' as PrismaOrderStatus),
          quantity: request.quantity,
          price: request.price ?? null,
          stopLoss: request.stopLoss ?? null,
          filledQuantity: execution.filledQuantity || 0,
          averagePrice: execution.averagePrice,
          fee: execution.fee ?? null,
          feeCurrency: execution.feeCurrency ?? null,
          exchangeOrderId: execution.exchangeOrderId,
          idempotencyKey: request.idempotencyKey || `legacy-${Date.now()}-${crypto.randomUUID()}`,
        },
      });

      // Step 7: Update or open position
      await this._updatePosition(userId, createdOrder, request, execution, tx);

      // Step 8: Record trade
      // ═══════════════════════════════════════════════════
      // FIX: Validate trade data before recording. Previously,
      // execution.filledQuantity could be null/undefined → 0,
      // and execution.averagePrice could be null → currentPrice
      // which might also be 0, producing phantom $0.00 trades.
      // ═══════════════════════════════════════════════════
      const tradeQuantity = execution.filledQuantity || 0;
      const tradePrice = execution.averagePrice || currentPrice;

      if (tradeQuantity <= 0 || tradePrice <= 0) {
        this.logger.warn(
          `Trade record skipped — invalid quantity (${tradeQuantity}) or price (${tradePrice}) for ${request.symbol}`,
        );
      } else {
        await tx.trade.create({
          data: {
            userId,
            orderId: createdOrder.id,
            credentialId: request.credentialId,
            exchange: credential.exchange,
            symbol: request.symbol,
            side: request.side,
            type: 'ENTRY',
            quantity: tradeQuantity,
            price: tradePrice,
            fee: execution.fee ?? 0,
            feeCurrency: execution.feeCurrency,
            source: request.source || (credential.exchange === 'paper-trading' ? 'auto_paper' : 'user_manual'),
          },
        });
      }

      // Step 9: If this was triggered by a signal, update signal status
      // DATA ISOLATION: Added userId filter to prevent updating other users' signals
      if (request.signalId) {
        await tx.signal
          .updateMany({
            where: { id: request.signalId, userId },
            data: { status: 'EXECUTED' },
          })
          .catch(() => {}); // Don't fail if signal not found
      }

      return createdOrder;
    });

    // Audit log
    await this.auditService.log({
      userId,
      action: 'ORDER_PLACED',
      resource: 'order',
      details: JSON.stringify({
        orderId: order.id,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        quantity: request.quantity,
        filledQuantity: execution.filledQuantity,
        averagePrice: execution.averagePrice,
        // V176: riskCheck removed from scope — RiskGatekeeper already logged the risk assessment
      }),
      ipAddress,
      userAgent,
    });

    // V172d FIX: Deduct margin from paperBalance atomically when opening a paper-trading position.
    // Uses $executeRaw to prevent race condition: findUnique→update is NOT atomic.
    // With two concurrent orders, both would read the same balance and each deduct their margin
    // independently, ignoring the other's deduction (double-spending).
    // $executeRaw UPDATE with arithmetic is atomic at the DB level.
    if (credential.exchange === 'paper-trading' && execution.success) {
      try {
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
        });
        const meta = getSymbolMetadata(request.symbol);
        const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
        const forexLev = Number(settings?.paperForexLeverage) || 50;
        const goldLev = Number(settings?.paperGoldLeverage) || 20;
        let leverage = 1;
        if (meta.assetClass === AssetClass.FOREX) leverage = forexLev;
        else if (meta.assetClass === AssetClass.COMMODITY) leverage = goldLev;
        else leverage = cryptoLev;

        const notional = request.quantity * currentPrice;
        const marginToDeduct = leverage > 1 ? notional / leverage : notional;

        // V176 FIX: Actually DEDUCT margin from paperBalance when opening a position.
        // Previously (V175), margin was only "locked" (logged) but never deducted,
        // allowing unlimited positions regardless of available balance.
        // Now: paperBalance = paperBalance - marginToDeduct (atomic SQL update).
        // On close: paperBalance = paperBalance + marginToDeduct + pnl.
        // This ensures users cannot open more positions than their balance allows.
        await this.prisma.$executeRaw`
          UPDATE "AgentSettings"
          SET "paperBalance" = "paperBalance" - ${marginToDeduct}
          WHERE "userId" = ${userId}
        `;
        this.logger.log(
          `📝 V176 Paper margin DEDUCTED: -$${marginToDeduct.toFixed(2)} (${request.symbol}, leverage: ${leverage}x)`,
        );
      } catch (err: any) {
        this.logger.warn(`V172d Failed to deduct paper margin on open: ${err.message}`);
      }
    }

    this.logger.log(
      `✅ Order executed: ${order.id} — ${request.side} ${execution.filledQuantity}/${request.quantity} ${request.symbol} @ ${execution.averagePrice}`,
    );

    return order;
  }
  async cancelOrder(
    userId: string,
    orderId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' orders
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (!['PENDING', 'ACCEPTED', 'PARTIALLY_FILLED'].includes(order.status)) {
      throw new BadRequestException(
        `لا يمكن إلغاء طلب بحالة "${order.status}"`,
      );
    }

    // Try to cancel on the exchange
    if (order.exchangeOrderId) {
      try {
        const credential =
          await this.prisma.exchangeCredential.findFirst({
            where: { id: order.exchangeCredentialId!, userId },
          });
        if (credential) {
          // V226: Route MT5 cancel through ExecutionGatewayService
          // (CCXT can't handle MT5 — ccxt['mt5'] = undefined)
          if (this._isMT5Exchange(credential.exchange)) {
            if (this.executionGateway) {
              this.logger.log(
                `📊 V226: Routing MT5 order cancel via ExecutionGateway — order ${order.exchangeOrderId}`
              );
              const cancelled = await this.executionGateway.cancelOrder(
                userId,
                credential.id,
                order.exchangeOrderId,
                order.symbol,
              );
              if (!cancelled) {
                this.logger.warn(`⚠️ V226: MT5 cancel returned false for order ${order.exchangeOrderId}`);
              }
            } else {
              this.logger.warn(`⚠️ V226: ExecutionGateway not available — cannot cancel MT5 order ${order.exchangeOrderId}`);
            }
          } else {
            // CCXT path (Binance, Alpaca, etc.)
            const { apiKey, apiSecret } =
              await this.credentialsService.decryptCredential(credential.id, userId);
            const exchange = this._getExchangeInstance(credential.exchange, apiKey, apiSecret, credential.id, (credential as any).testnet || false);
            if (exchange) {
              await exchange.cancelOrder(order.exchangeOrderId, order.symbol);
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `Failed to cancel order on exchange: ${error.message}`,
        );
        // Continue with local cancellation even if exchange cancel fails
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    await this.auditService.log({
      userId,
      action: 'ORDER_CANCELLED',
      resource: 'order',
      details: JSON.stringify({ orderId, symbol: order.symbol }),
      ipAddress,
      userAgent,
    });

    return updated;
  }

  /**
   * Get user's orders with optional filtering
   */
  async getOrders(
    userId: string,
    filters?: { symbol?: string; status?: string; limit?: number },
  ) {
    const where: any = { userId };
    if (filters?.symbol) where.symbol = filters.symbol;
    if (filters?.status) where.status = filters.status;

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
    });
  }

  /**
   * Get a specific order
   */
  async getOrder(userId: string, orderId: string) {
    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' orders
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    return order;
  }

  // ── Position Management ──

  /**
   * Get all open positions for a user
   * Uses parallel quote fetching and batch DB updates to avoid N+1 queries
   */
  async getOpenPositions(userId: string, credentialId?: string): Promise<any[]> {
    const where: any = {
      userId,
      status: 'OPEN',
    };
    if (credentialId) {
      where.credentialId = credentialId;
    }
    const positions = await this.prisma.position.findMany({
      where,
      orderBy: { openedAt: 'desc' },
    });

    if (positions.length === 0) return [];

    // V257: Return positions IMMEDIATELY with last-known prices from DB.
    // Previously, this method fetched live quotes for EVERY position from
    // Binance (getQuote), which took 2-5 seconds due to rate limits.
    //
    // Now: Return DB data as-is (currentPrice/unrealizedPnl are updated by
    // PositionMonitor every 10s). The frontend has live prices via
    // useMarketStore (WebSocket + polling) and updatePositionPrice() which
    // updates PnL in real-time without re-fetching from the backend.
    //
    // This makes getOpenPositions return in <50ms instead of 2-5s.
    return positions.map((pos: any) => {
      const entryPrice = pos.entryPrice?.toNumber?.() ?? Number(pos.entryPrice);
      const currentPrice = pos.currentPrice?.toNumber?.() ?? Number(pos.currentPrice) ?? entryPrice;
      const quantity = pos.quantity?.toNumber?.() ?? Number(pos.quantity);
      const unrealizedPnl = pos.unrealizedPnl?.toNumber?.() ?? Number(pos.unrealizedPnl) ?? 0;
      return {
        ...pos,
        entryPrice,
        currentPrice,
        quantity,
        unrealizedPnl,
      };
    });
  }

  /**
   * Get position summary
   */
  async getPositionSummary(userId: string, credentialId?: string) {
    try {
      const positions = await this.getOpenPositions(userId, credentialId);

      const totalValue = positions.reduce(
        (sum, p) => sum + (typeof p.quantity === 'number' ? p.quantity : Number(p.quantity)) * (Number(p.currentPrice) || Number(p.entryPrice)),
        0,
      );
      const totalUnrealizedPnl = positions.reduce(
        (sum, p) => sum + (Number(p.unrealizedPnl) || 0),
        0,
      );
      const totalRealizedPnl = positions.reduce(
        (sum, p) => sum + (Number(p.realizedPnl) || 0),
        0,
      );
      // V148 FIX: Calculate leverage-aware used margin instead of returning
      // totalValue (full notional) as margin. Previously, the frontend used
      // totalValue as "initialMargin" which is WRONG for leveraged positions.
      // For forex (50:1 leverage), a $108K notional position only needs $2,160 margin.
      // Using totalValue as margin caused the "مستخدم" to show $108K instead of $2.16K.
      const usedMargin = positions.reduce(
        (sum, p) => sum + calculateMargin(
          typeof p.quantity === 'number' ? p.quantity : Number(p.quantity),
          Number(p.entryPrice),  // V426: Use entryPrice (stable) not currentPrice (moves)
          p.symbol,
        ),
        0,
      );

      // V262: Return paperBalance from DB so the frontend doesn't use 10000 fallback.
      // V262.2: Calculate DISPLAYED balance = paperBalance(DB) + usedMargin.
      // The DB paperBalance has margin DEDUCTED (V176 fix). To show the
      // true wallet balance, we must ADD BACK the usedMargin.
      // This matches credentials.service.ts line 797:
      //   displayedBalance = paperBalanceUsd + usedMargin
      let paperBalance = 0;
      try {
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperBalance: true },
        });
        const dbBalance = settings?.paperBalance ? Number(settings.paperBalance) : 0;
        // displayedBalance = DB balance + usedMargin (margin locked in open positions)
        paperBalance = dbBalance + usedMargin;
      } catch { paperBalance = 10000; }

      return {
        totalPositions: positions.length,
        totalValue,
        totalUnrealizedPnl,
        totalRealizedPnl,
        usedMargin,
        paperBalance, // V262: Add this so frontend uses real balance, not 10000 fallback
        positions,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get position summary: ${error.message}`,
        error.stack,
      );
      // FIX: Previously returned fake "zero" summary that masked real failures
      // (DB down, exchange unreachable). Users saw "0 positions, $0 P&L" and
      // thought their positions were empty when the system was actually broken.
      // Now we throw so the caller gets a proper error response.
      throw new Error(`فشل في جلب ملخص المراكز: ${error.message}`);
    }
  }

  /**
   * Close a position (partially or fully)
   */
  async closePosition(
    userId: string,
    request: ClosePositionRequest,
    ipAddress?: string,
    userAgent?: string,
    _retryCount = 0, // FIX: Internal retry counter for optimistic locking
  ) {
    // ── V215 FORENSIC LOG: Track every closePosition call ──
    // Problem: Positions close at 4h with closeReason="Manual" but we don't know
    // WHO is calling closePosition. This log captures the full call stack so we can
    // identify the exact code path triggering premature closes on Railway.
    const _v215Stack = new Error().stack?.split('\n').slice(1, 6).map(s => s.trim()).join(' | ');
    const _v215HoldingMs = request.positionId ? 'pending' : 'n/a';
    this.logger.warn(
      `🔒 V215 closePosition CALLED: positionId=${request.positionId?.slice(0,12) || '?'}... ` +
      `closeReason="${request.closeReason || 'EMPTY'}" ` +
      `quantity=${request.quantity || 'full'} ` +
      `retryCount=${_retryCount} ` +
      `caller=${_v215Stack}`
    );

    // FIX: REMOVED the dynamic DDL that dropped unique constraints on Position table
    // on EVERY closePosition() call. This was a dangerous hotfix that:
    //   1. Ran destructive DDL (DROP INDEX CASCADE) inside business logic
    //   2. Executed on every close call (not just once)
    //   3. Could cause data corruption under concurrent close requests
    //   4. Removed ALL unique constraints (except PK), allowing duplicate data
    //
    // The original problem (unique constraint violations during close) is now
    // handled properly by the idempotent close logic below and the race condition
    // fix in _updatePosition() (P2002 catch with retry).

    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' positions
    // FIX: Read version for optimistic locking — prevents concurrent close race condition
    const position = await this.prisma.position.findFirst({
      where: { id: request.positionId, userId },
    });

    if (!position) {
      throw new NotFoundException('المركز غير موجود');
    }

    // ═══════════════════════════════════════════════════════════════════
    // V214 LAST LINE OF DEFENSE: Block premature close of Agent positions
    //
    // PROBLEM: Old compiled JS on Railway (pre-V184/V213) still has the
    // hardcoded 4h close for Agent positions. Despite V184 removing it
    // and V213 adding a safety net in _monitorOpenPositions, the OLD code
    // is still running and closing Agent positions at exactly 4h 0m.
    //
    // Evidence from June 12, 2026:
    //   - 10+ Agent positions ALL closed at exactly 4h 0m
    //   - closeReason = "Manual" (old default before V176)
    //   - Smart Executor positions also closing at 4h with "Manual"
    //   - This proves old pre-V141/V176 code is running on Railway
    //
    // FIX: Block ANY close of an Agent position that hasn't reached 48h,
    // UNLESS the close is triggered by SL/TP hit (valid trading exit).
    // This works regardless of which service calls closePosition — it's
    // the single point of truth for all position closes.
    // ═══════════════════════════════════════════════════════════════════
    const isAgentPosition = position.source === 'agent';
    const closeReasonStr = (request.closeReason || '').toUpperCase();
    const isSLTPClose = closeReasonStr.includes('STOP_LOSS') || closeReasonStr.includes('TAKE_PROFIT');
    const isManualClose = closeReasonStr === 'MANUAL' || closeReasonStr === '';
    // V227: USER-initiated closes ALWAYS pass through — traders must be able to close
    // their own positions at any time. Only block SYSTEM-originated non-SL/TP closes
    // (which come from old code on Railway that sends closeReason='MANUAL' at 4h).
    const isUserInitiated = request.source === 'USER';

    // V237: Also block MAX_HOLDING_TIME closeReason — this is produced by OLD Agent code
    // (pre-V224) that still has the 4h hardcoded close. Even if the Agent somehow
    // produces this reason, we block it here. MAX_HOLDING_TIME should NEVER appear
    // as a closeReason — it was removed in V224 and replaced by Position Monitor's
    // TIME_EXPIRED (which uses dynamic 48h for Agent positions).
    const isMaxHoldingClose = closeReasonStr === 'MAX_HOLDING_TIME';

    if (isAgentPosition && (!isSLTPClose || isMaxHoldingClose) && !isUserInitiated) {
      const holdingMs = position.openedAt
        ? Date.now() - new Date(position.openedAt).getTime()
        : 0;
      const holdingHours = holdingMs / (60 * 60 * 1000);
      const AGENT_MIN_HOLDING_HOURS = 48;

      // V237: Also block MAX_HOLDING_TIME even if holdingHours >= 48h — this
      // closeReason should NEVER be used for Agent positions. The Position Monitor
      // uses TIME_EXPIRED for time-based closes, not MAX_HOLDING_TIME.
      if (holdingHours < AGENT_MIN_HOLDING_HOURS || isMaxHoldingClose) {
        // Agent position hasn't reached 48h OR using forbidden closeReason — BLOCK
        this.logger.error(
          `🚨 V237 BLOCKED: Attempted to close Agent position ${position.id} (${position.symbol}) ` +
          `at ${holdingHours.toFixed(1)}h — Agent positions must be held for ${AGENT_MIN_HOLDING_HOURS}h minimum. ` +
          `closeReason="${request.closeReason || 'EMPTY'}" source="${request.source || 'SYSTEM'}" — ` +
          `Only SL/TP closes and USER-initiated closes are allowed before ${AGENT_MIN_HOLDING_HOURS}h. ` +
          `${isMaxHoldingClose ? 'MAX_HOLDING_TIME is FORBIDDEN for Agent positions (removed in V224).' : 'This close was likely triggered by OLD code (pre-V184) still running on Railway.'}`
        );

        // Instead of throwing (which would break things), just skip and return
        // the position as-is — don't close it
        return {
          order: null,
          pnl: 0,
          position,
          blockedByV237: true,
          blockedReason: isMaxHoldingClose ? 'MAX_HOLDING_TIME_FORBIDDEN' : `Agent position held ${holdingHours.toFixed(1)}h — minimum is ${AGENT_MIN_HOLDING_HOURS}h`,
        };
      }

      // Agent position has reached 48h — allow the close
      this.logger.log(
        `✅ V237 ALLOWED: Agent position ${position.id} (${position.symbol}) held ${holdingHours.toFixed(1)}h ` +
        `≥ ${AGENT_MIN_HOLDING_HOURS}h — close allowed. closeReason="${request.closeReason}"`
      );
    }

    // V237: Smart Executor minimum holding time defense
    // Smart Executor positions with TIME_EXPIRED were closing at exactly 4h because
    // the old _getMaxHoldingMs returned 4h for M1/M5 (pre-V223 code on Railway).
    // Block any TIME_EXPIRED close of Smart Executor positions before 6 hours.
    // This is a safety net until V223 code is properly deployed on Railway.
    const isSmartExecutorPosition = position.source === 'smart_executor';
    const isTimeExpiredClose = closeReasonStr === 'TIME_EXPIRED';

    if (isSmartExecutorPosition && isTimeExpiredClose && !isUserInitiated) {
      const holdingMs = position.openedAt
        ? Date.now() - new Date(position.openedAt).getTime()
        : 0;
      const holdingHours = holdingMs / (60 * 60 * 1000);
      const SMART_EXECUTOR_MIN_HOURS = 6; // Minimum 6h before TIME_EXPIRED can close

      if (holdingHours < SMART_EXECUTOR_MIN_HOURS) {
        this.logger.error(
          `🚨 V237 BLOCKED: Attempted TIME_EXPIRED close of Smart Executor position ${position.id} (${position.symbol}) ` +
          `at ${holdingHours.toFixed(1)}h — minimum is ${SMART_EXECUTOR_MIN_HOURS}h. ` +
          `This was likely triggered by old _getMaxHoldingMs (pre-V223) returning 4h for M1/M5.`
        );
        return {
          order: null,
          pnl: 0,
          position,
          blockedByV237: true,
          blockedReason: `Smart Executor TIME_EXPIRED at ${holdingHours.toFixed(1)}h — minimum is ${SMART_EXECUTOR_MIN_HOURS}h (V223: M1/M5=8h)`,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // V290: Block SYSTEM-originated MANUAL closes of Smart Executor positions
    // before 6 hours.
    //
    // PROBLEM (June 19, 2026 data): 11 of 16 trades closed at exactly "4h 0m"
    // with closeReason="Manual". The V237 guard above only blocks TIME_EXPIRED,
    // not MANUAL. Some system component (old code on Railway, or a stale
    // cron job) is sending closeReason="MANUAL" at 4h, bypassing the guard.
    //
    // Evidence:
    //   - 11 trades closed at exactly "4h 0m" — too precise for user action
    //   - All have closeReason="Manual"
    //   - P&L from those 11 closes: +$1.91 (breakeven — winners not reaching TP)
    //   - 5 SL hits: -$15.04 (all actual losses came from SL, not the 4h close)
    //
    // FIX: Block any non-USER MANUAL close of smart_executor positions
    // before 6 hours. Real user closes (source='USER') always pass through.
    // This forces the 4h-timer system (whatever it is) to either:
    //   1. Wait until 6h (giving TP more time to hit), or
    //   2. Use SL/TP closeReason (which is always allowed)
    // ═══════════════════════════════════════════════════════════════════
    const isManualCloseNonUser = isManualClose && !isUserInitiated;
    if (isSmartExecutorPosition && isManualCloseNonUser) {
      const holdingMs = position.openedAt
        ? Date.now() - new Date(position.openedAt).getTime()
        : 0;
      const holdingHours = holdingMs / (60 * 60 * 1000);
      const V290_SMART_EXECUTOR_MIN_HOURS = 6;

      if (holdingHours < V290_SMART_EXECUTOR_MIN_HOURS) {
        this.logger.error(
          `🚨 V290 BLOCKED: Attempted MANUAL close of Smart Executor position ${position.id} (${position.symbol}) ` +
          `at ${holdingHours.toFixed(1)}h — minimum is ${V290_SMART_EXECUTOR_MIN_HOURS}h. ` +
          `source="${request.source || 'SYSTEM'}" — only USER-initiated closes are allowed before ${V290_SMART_EXECUTOR_MIN_HOURS}h. ` +
          `This was likely triggered by old 4h-timer code still running.`
        );
        return {
          order: null,
          pnl: 0,
          position,
          blockedByV290: true,
          blockedReason: `V290: Smart Executor MANUAL close at ${holdingHours.toFixed(1)}h blocked — minimum is ${V290_SMART_EXECUTOR_MIN_HOURS}h (let TP/SL work)`,
        };
      }
    }

    // FIX: Optimistic locking — if another request already closed this position
    // between our read and the upcoming update, the version won't match and we'll
    // retry. This prevents double-close, duplicate EXIT trades, and PnL miscalculation.
    const positionVersion = position.version ?? 0;

    if (position.status !== 'OPEN') {
      // ── FIX: Idempotent close — if position is already CLOSED/LIQUIDATED,
      // it may still be open on the exchange (e.g. SmartExecutor closed it in
      // DB without closing on exchange). Try to close on exchange anyway and
      // return success instead of rejecting the user's request.
      this.logger.warn(
        `Position ${position.id} (${position.symbol}) status is ${position.status} — attempting exchange close for safety`,
      );

      // Try to close on exchange if we have valid credentials
      try {
        const staleCredential =
          await this.prisma.exchangeCredential.findFirst({
            where: { id: position.credentialId, userId },
          });

        if (staleCredential && staleCredential.exchange !== 'paper-trading') {
          const staleSide = position.side === 'BUY' ? 'SELL' : 'BUY';
          await this._executeOnExchange(
            staleCredential.exchange,
            staleCredential.id,
            {
              credentialId: staleCredential.id,
              symbol: position.symbol,
              side: staleSide as PrismaOrderSide,
              type: PrismaOrderType.MARKET,
              quantity: position.quantity.toNumber(),
            },
            userId,
          );
          this.logger.log(
            `Successfully closed position ${position.id} on exchange despite DB status being ${position.status}`,
          );
        }
      } catch (exchangeErr: any) {
        this.logger.warn(
          `Exchange close for already-closed position ${position.id} failed: ${exchangeErr.message}`,
        );
        // Not fatal — position may already be closed on exchange too
      }

      // Return the existing closed position (idempotent success)
      return {
        order: null,
        pnl: position.realizedPnl?.toNumber() ?? 0,
        position: await this.prisma.position.findUnique({
          where: { id: position.id },
        }),
        alreadyClosed: true,
      };
    }

    const posQuantity = position.quantity.toNumber();
    const posEntryPrice = position.entryPrice.toNumber();
    const posCurrentPrice = position.currentPrice?.toNumber() ?? null;
    const posRealizedPnl = position.realizedPnl?.toNumber() ?? 0;
    const posStopLoss = position.stopLoss?.toNumber() ?? null;

    const closeQuantity = request.quantity ?? posQuantity;
    if (closeQuantity > posQuantity) {
      throw new BadRequestException(
        `كمية الإغلاق (${closeQuantity}) أكبر من حجم المركز (${posQuantity})`,
      );
    }

    // Execute closing order on exchange
    // FIX: Handle paper-trading positions separately. Previously, closePosition
    // always called _executeOnExchange() which requires decrypting credentials.
    // But paper-trading credentials may have been deleted by _startupCleanup(),
    // making paper positions un-closeable (NotFoundException on credential).
    // Now: for paper-trading positions, use _executePaperTrade() directly.
    const credential =
      await this.prisma.exchangeCredential.findFirst({
        where: { id: position.credentialId, userId },
      });

    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';

    let execution: any;

    if (position.exchange === 'paper-trading' || !credential) {
      // Paper-trading close: simulate the close using current market price.
      // If credential was deleted by startup cleanup, we can still close the position
      // because paper trading is simulated — no real exchange connection needed.
      //
      // FIX v114: Use entryPrice as the DEFAULT close price for paper trading.
      // Previously, if posCurrentPrice was 0/null, it tried getQuote() which could
      // hang for 30+ seconds when all price providers are exhausted (TwelveData
      // rate-limited, Binance blocked, etc.). This caused close requests to timeout
      // and positions to remain stuck OPEN.
      //
      // Now: Only try getQuote with a 3-second timeout. If it fails or times out,
      // V172: Reduced getQuote timeout 3s → 1s. Paper positions always have
      // currentPrice set by the position monitor — getQuote is rarely needed.
      // V264: Use closePrice from request if provided (SL/TP exact price).
      // This fixes the SL slippage bug where closePosition fetched its own
      // price from DB (stale by 10s) instead of using the SL/TP price that
      // PositionMonitor detected.
      let closePrice = request.closePrice || posCurrentPrice;
      if (!closePrice || closePrice <= 0) {
        try {
          const quotePromise = this.exchangeService.getQuote(position.symbol);
          const quote = await Promise.race([
            quotePromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
          ]);
          closePrice = quote?.price || posEntryPrice;
        } catch {
          closePrice = posEntryPrice;
        }
      }
      // Final safety: entryPrice is always available for an OPEN position
      if (!closePrice || closePrice <= 0) {
        closePrice = posEntryPrice;
      }

      execution = await this._executePaperTrade(
        {
          credentialId: position.credentialId,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: PrismaOrderType.MARKET,
          quantity: closeQuantity,
          price: closePrice,
        },
        closePrice,
        userId,
      );
    } else if (this._isMT5Exchange(credential?.exchange) && userId && this.executionGateway) {
      // V226: Route MT5 close through ExecutionGatewayService.
      // Same fix as _executeOnExchange() — CCXT can't handle MT5.
      this.logger.log(
        `📊 V226: Routing MT5 position close via ExecutionGateway — ${position.symbol} (${closeSide})`
      );
      try {
        const result = await this.executionGateway.placeOrder(userId, {
          userId: userId,
          exchangeCredentialId: credential.id,
          symbol: position.symbol,
          side: closeSide as 'BUY' | 'SELL',
          type: 'MARKET',
          quantity: closeQuantity,
          idempotencyKey: `mt5-close-${position.id}-${Date.now()}`,
          source: 'position_close',
        });

        execution = {
          success: result.success,
          exchangeOrderId: result.exchangeOrderId,
          filledQuantity: result.filledQuantity,
          averagePrice: result.averagePrice,
          fee: result.fee,
          feeCurrency: result.feeCurrency,
          error: result.error,
        };

        if (!result.success) {
          this.logger.warn(`⚠️ V226: MT5 close failed via gateway: ${result.error}`);
        }
      } catch (mt5Err: any) {
        this.logger.error(`❌ V226: MT5 close gateway error: ${mt5Err.message}`);
        execution = { success: false, error: `فشل إغلاق مركز MT5: ${mt5Err.message}` };
      }
    } else if (this._isMT5Exchange(credential?.exchange) && !this.executionGateway) {
      // MT5 but gateway not available — fall through to CCXT (which will fail gracefully)
      this.logger.warn(`⚠️ V226: ExecutionGateway not available for MT5 close — CCXT will fail for ${position.symbol}`);
      execution = await this._executeOnExchange(
        credential.exchange,
        credential.id,
        {
          credentialId: credential.id,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: PrismaOrderType.MARKET,
          quantity: closeQuantity,
        },
        userId,
      );
    } else {
      // Real exchange close: use CCXT (Binance, Alpaca, etc.)
      execution = await this._executeOnExchange(
        credential.exchange,
        credential.id,
        {
          credentialId: credential.id,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: PrismaOrderType.MARKET,
          quantity: closeQuantity,
        },
        userId,
      );
    }

    if (!execution.success) {
      const errorMsg = execution.error || '';

      // FIX: Force-close on ANY exchange error when position is paper-trading
      // or exchange is unreachable — not just for the specific Arabic text
      // "رصيد غير متاح". Paper-trading positions have no real exchange state,
      // so force-closing in DB is always safe. For real exchange positions,
      // only force-close when the exchange is unreachable (the close might
      // have partially executed, so we can't safely force-close).
      // User-cancel errors (e.g. "order not found") should also be force-closed
      // because the position is likely already closed on the exchange.
      const isPaperTrading = position.exchange === 'paper-trading';
      const isExchangeUnreachable = /timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|unreachable/i.test(errorMsg);
      const isUserCancel = /cancel|not found|already closed|unknown order/i.test(errorMsg);
      const isInsufficientBalance = (errorMsg.includes('رصيد') && errorMsg.includes('غير متاح'))
        || /insufficient.*balance|not enough/i.test(errorMsg);

      const shouldForceClose = isPaperTrading || isExchangeUnreachable || isInsufficientBalance || isUserCancel;

      if (shouldForceClose) {
        this.logger.warn(
          `⚡ Exchange close failed for ${position.symbol} — attempting force close (DB only). ` +
          `Reason: ${isPaperTrading ? 'paper-trading' : isExchangeUnreachable ? 'exchange-unreachable' : isInsufficientBalance ? 'insufficient-balance' : 'user-cancel'}. ` +
          `Error: ${errorMsg}`,
        );
        try {
          return await this.forceClosePosition(
            userId,
            position.id,
            `Auto force-close: ${isPaperTrading ? 'paper-trading position' : isExchangeUnreachable ? 'exchange unreachable' : isInsufficientBalance ? 'insufficient balance' : 'position likely already closed'} — ${errorMsg}`,
            ipAddress,
            userAgent,
          );
        } catch (forceErr: any) {
          this.logger.error(
            `❌ Force close also failed for ${position.id}: ${forceErr.message}`,
          );
        }
      }

      // FIX V114: For paper-trading positions, NEVER leave them stuck OPEN.
      // Paper trading has no real exchange state to desync — force-close is always safe.
      // If force-close already failed above, try ONE MORE TIME with a direct DB update
      // as the absolute last resort. This prevents the "3 out of 4 close" pattern where
      // the last position gets stuck because of a transient error during force-close.
      if (isPaperTrading) {
        this.logger.warn(
          `🔴 V114 Paper-trading safety net: force-close failed for ${position.id}, attempting direct DB update as last resort`,
        );
        try {
          await this.prisma.position.update({
            where: { id: position.id },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              realizedPnl: posRealizedPnl, // No PnL change since execution failed
              exitPrice: posEntryPrice, // V140: Fallback to entry price when execution failed
              closeReason: request.closeReason || 'FORCE_CLOSE', // V141
            },
          });
          this._clearProcessedKeysForPosition(userId, position.symbol).catch(() => {});
          this.logger.log(
            `🔴 V114 Paper-trading position ${position.id} force-closed via direct DB update`,
          );
          return {
            order: null,
            pnl: 0,
            position: await this.prisma.position.findUnique({ where: { id: position.id } }),
            forceClosed: true,
            safetyNetClose: true,
          };
        } catch (dbErr: any) {
          this.logger.error(
            `❌ V114 Even direct DB update failed for ${position.id}: ${dbErr.message}`,
          );
        }
      }

      // Only throw for real trading positions where the exchange might have
      // partially executed — force-closing would lose sync with exchange state.
      throw new BadRequestException(
        `فشل في إغلاق المركز: ${execution.error}`,
      );
    }

    // Safe exit price: use explicit null checks instead of || operator
    // The || operator treats 0 as falsy, causing incorrect fallback to entry price
    const exitPrice =
      execution.averagePrice != null && execution.averagePrice > 0
        ? execution.averagePrice
        : (posCurrentPrice != null && posCurrentPrice > 0
          ? posCurrentPrice
          : posEntryPrice);

    // FIX: Deduct actual trading fees from PnL.
    // For real exchanges, execution.fee contains the actual fee charged.
    // For paper trading, fee is simulated at 0.1% per leg (entry + exit).
    const grossPnl =
      position.side === 'BUY'
        ? (exitPrice - posEntryPrice) * closeQuantity
        : (posEntryPrice - exitPrice) * closeQuantity;
    // FIX V174: Only deduct EXIT fee from PnL.
    // Entry fee was already paid when the position opened (_executePaperTrade
    // charges 0.1% at entry and records it in the ENTRY trade).
    // Adding entryFeeEstimate here caused double-counting — charging entry fee twice.
    // BTC example: exitFee=$3.90 + entryFeeEstimate=$3.89 = $7.79 extra deduction.
    const exitFee = execution.fee ?? (exitPrice * closeQuantity * 0.001);
    const totalFees = exitFee; // exit fee only — entry fee already charged at open
    const pnl = grossPnl - totalFees;

    // Record closing order, exit trade, and update position — all in one transaction
    // FIX: Optimistic locking — use version check in WHERE clause to prevent
    // concurrent close from double-executing. If version changed (another close
    // committed first), we retry the whole closePosition method.
    const { order: closedOrder } = await this.prisma.$transaction(async (tx) => {
      // FIX: Wrap order creation in try-catch — if it fails (e.g., idempotency collision),
      // still close the position. A failed audit trail is better than a stuck open position.
      let order: any = null;
      try { order = await tx.order.create({
        data: {
          userId,
          exchangeCredentialId: position.credentialId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: closeSide,
          type: 'MARKET' as PrismaOrderType,
          status: 'FILLED' as PrismaOrderStatus,
          quantity: closeQuantity,
          stopLoss: posStopLoss,
          filledQuantity: execution.filledQuantity || closeQuantity,
          averagePrice: execution.averagePrice,
          fee: execution.fee ?? null,
          feeCurrency: execution.feeCurrency ?? null,
          exchangeOrderId: execution.exchangeOrderId,
          idempotencyKey: `close-${position.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      }); } catch (orderErr: any) {
        this.logger.warn(`closePosition: Order creation failed (non-critical): ${orderErr.message}`);
        order = { id: 'manual-close-' + Date.now() };
      }

      // Record exit trade
      await tx.trade.create({
        data: {
          userId,
          orderId: order.id,
          positionId: position.id,
          credentialId: position.credentialId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: closeQuantity >= posQuantity ? 'EXIT' : 'PARTIAL_EXIT',
          quantity: closeQuantity,
          price: exitPrice,
          fee: execution.fee ?? 0,
          feeCurrency: execution.feeCurrency,
          pnl,
          source: position.source || 'user_manual', // V140B: Inherit source from position (smart_executor/agent/etc)
        },
      });

      // Update position with optimistic locking (version check)
      // If another concurrent close already updated this position, the version
      // won't match and the update will affect 0 rows — we detect this and retry.
      if (closeQuantity >= posQuantity) {
        const updateResult = await tx.position.updateMany({
          // FIX: For paper trading, skip version check — no real exchange race condition
          where: { id: position.id, ...(position.exchange === 'paper-trading' ? {} : { version: positionVersion }) },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            realizedPnl: posRealizedPnl + pnl,
            exitPrice, // V140: Store the actual close price
            closeReason: request.closeReason || 'AUTO_CLOSE', // V176: Default to AUTO_CLOSE (not MANUAL). Issue #12: auto-closes from position monitor (TIME_EXPIRED, STOP_LOSS, STALE_POSITION) were recorded as 'MANUAL' because closeReason defaulted to 'MANUAL'. This made it impossible to distinguish user-initiated closes from automatic ones. Now: 'AUTO_CLOSE' clearly indicates the close was triggered by the system.
            version: positionVersion + 1,
          },
        });
        if (updateResult.count === 0) {
          // Optimistic lock failure — another close committed first
          throw new Error('OPTIMISTIC_LOCK_FAILURE: Position was modified by another request. Please retry.');
        }
      } else {
        const updateResult = await tx.position.updateMany({
          // FIX: For paper trading, skip version check — no real exchange race condition
          where: { id: position.id, ...(position.exchange === 'paper-trading' ? {} : { version: positionVersion }) },
          data: {
            quantity: posQuantity - closeQuantity,
            realizedPnl: posRealizedPnl + pnl,
            version: positionVersion + 1,
          },
        });
        if (updateResult.count === 0) {
          throw new Error('OPTIMISTIC_LOCK_FAILURE: Position was modified by another request. Please retry.');
        }
      }

      return { order };
    });

    await this.auditService.log({
      userId,
      action: 'POSITION_CLOSED',
      resource: 'position',
      details: JSON.stringify({
        positionId: position.id,
        symbol: position.symbol,
        quantity: closeQuantity,
        pnl,
        partial: closeQuantity < Number(position.quantity),
      }),
      ipAddress,
      userAgent,
    });

    this.logger.log(
      `📈 Position closed: ${position.symbol} — PnL: ${pnl.toFixed(2)} USD`,
    );

    // V223 FIX: Cancel ALL active briefs for this symbol at the SOURCE.
    // Combined with position-monitor's own call, this covers BOTH paths:
    //   1. Manual close (closePosition API) → invalidates here
    //   2. Auto-close (SL/TP/time-expired in position-monitor) → invalidates there
    // This is the root-cause fix for the flip-flop pattern — the brief cannot
    // re-fire because it no longer exists as ACTIVE in the DB.
    try {
      if (this.strategicCouncil?.invalidateBriefsForSymbol) {
        await this.strategicCouncil.invalidateBriefsForSymbol(position.symbol, 'MANUAL_CLOSE');
      } else {
        this.logger.error(`❌ V223: strategicCouncil is undefined in trading.service — brief cancellation SKIPPED. This should never happen with @Global() module.`);
      }
    } catch (err: any) {
      // Non-critical — brief invalidation failure must not block close
    }

    // V177 FIX #17: Update trade repetition tracking after close
    try {
      const closedSide = position.side;
      const repDirLockKey = `trade-rep:dir-lock:${userId}:${position.symbol}:${closedSide}`;
      await this.redis.set(repDirLockKey, '1', 30 * 60 * 1000); // 30 min lockout (same direction)

      // V221 FIX: Symbol-level lockout — blocks BOTH directions for 15 minutes.
      // Prevents flip-flop pattern: BUY → SL → SELL immediately → SL → BUY ...
      // The old per-direction lock only blocked the SAME direction, allowing
      // immediate opposite-direction trades that cancel P&L and burn fees.
      const symbolLockKey = `trade-rep:symbol-lock:${userId}:${position.symbol}`;
      await this.redis.set(symbolLockKey, '1', 15 * 60 * 1000); // 15 min lockout (BOTH directions)

      const dailyCountKey = `trade-rep:daily:${userId}:${position.symbol}`;
      const currentCount = parseInt(await this.redis.get(dailyCountKey) || '0', 10);
      // TTL: reset at midnight
      const ttlMs = new Date().setHours(24, 0, 0, 0) - Date.now();
      await this.redis.set(dailyCountKey, String(currentCount + 1), Math.max(ttlMs, 60000));

      // Track consecutive losses
      const consecLossKey = `trade-rep:consec-loss:${userId}:${position.symbol}`;
      if (pnl < 0) {
        const currentLosses = parseInt(await this.redis.get(consecLossKey) || '0', 10);
        await this.redis.set(consecLossKey, String(currentLosses + 1), 2 * 60 * 60 * 1000); // 2h TTL
      } else {
        await this.redis.del(consecLossKey); // Reset on win
      }
    } catch (repErr: any) {
      // Non-critical — trade repetition tracking failure should not block closes
    }

    // V222 FIX: REMOVED _clearProcessedKeysForPosition call.
    //
    // PROBLEM: This function was clearing SmartExecutor's processed keys
    // IMMEDIATELY after close, allowing the executor to generate and submit
    // new briefs for the same symbol within the next 10-second tick.
    // This was a DIRECT cause of flip-flop trading:
    //   1. Position closed → processed keys cleared
    //   2. SmartExecutor tick (10s) → generates new brief for same symbol
    //   3. OrderDispatcher/UnifiedRisk → Redis checks may fail silently
    //   4. Position re-opened → user sees immediate re-open
    //
    // FIX: Let processed keys expire naturally (24h TTL). New briefs have
    // new briefIds so they won't be blocked. Old briefs being blocked for
    // 24h is GOOD — it prevents the executor from re-executing stale briefs.
    // The V222 DB cooldown in _updatePosition is the bulletproof protection.
    //
    // OLD CODE (REMOVED):
    // this._clearProcessedKeysForPosition(userId, position.symbol).catch(() => {});

    // V172d FIX: Return MARGIN + PnL to paperBalance atomically on close.
    if (position.exchange === 'paper-trading') {
      try {
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
        });
        const meta = getSymbolMetadata(position.symbol);
        const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
        const forexLev = Number(settings?.paperForexLeverage) || 50;
        const goldLev = Number(settings?.paperGoldLeverage) || 20;
        let leverage = 1;
        if (meta.assetClass === AssetClass.FOREX) leverage = forexLev;
        else if (meta.assetClass === AssetClass.COMMODITY) leverage = goldLev;
        else leverage = cryptoLev;

        const notional = posEntryPrice * closeQuantity;
        const marginToReturn = leverage > 1 ? notional / leverage : notional;

        // V176 FIX: Return margin + PnL to paperBalance on close.
        // Previously (V175), only PnL was added because margin was never deducted.
        // Now that margin is actually deducted on open, we must return it on close.
        const totalReturn = marginToReturn + pnl;
        await this.prisma.$executeRaw`
          UPDATE "AgentSettings"
          SET "paperBalance" = "paperBalance" + ${totalReturn}
          WHERE "userId" = ${userId}
        `;
        this.logger.log(
          `📝 V176 Paper balance on close: margin +$${marginToReturn.toFixed(2)}, PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}, total +$${totalReturn.toFixed(2)} (${position.symbol})`,
        );

      } catch (err: any) {
        this.logger.warn(`V172d Failed to update paper balance on close: ${err.message}`);
      }
    }

    // FIX V117: Invalidate balance cache so the next fetch returns fresh data.
    // Without this, the cached balance (60s TTL) still shows the old equity/margin
    // after closing a position, making it look like the close had no effect.
    try {
      this.credentialsService.invalidateBalanceCache(userId);
    } catch { /* non-critical */ }

    return {
      order: closedOrder,
      pnl,
      position: await this.prisma.position.findUnique({
        where: { id: position.id },
      }),
    };
  }

  /**
   * FIX: Clear Smart Executor processed Redis keys that match a closed position's
   * symbol. When a position is closed, the old `smart-executor:processed:{briefId}:{userId}`
   * key must be removed so that new briefs for the same symbol can be executed.
   *
   * The processed key stores JSON like: {"orderId":"...","executedAt":"..."}
   * The key format is: smart-executor:processed:{briefId}:{userId}
   * Since briefId is opaque, we scan all keys for this userId, get each key's value,
   * and check if the associated position's symbol matches the closed position.
   *
   * We also clear the corresponding DB-persisted keys (smart-executor:processed:*:userId:db).
   */
  private async _clearProcessedKeysForPosition(userId: string, symbol: string): Promise<void> {
    try {
      const pattern = `smart-executor:processed:*:${userId}`;
      const keys = await this.redis.scanKeys(pattern);
      let cleared = 0;

      for (const key of keys) {
        try {
          // The key format is: smart-executor:processed:{briefId}:{userId}
          // Extract the briefId from the key
          const parts = key.split(':');
          // Expected: ['smart-executor', 'processed', briefId, userId]
          const briefId = parts.length >= 4 ? parts[2] : null;

          if (!briefId) continue;

          // Look up the brief in the DB to check its pair/symbol
          const brief = await this.prisma.tradingBrief.findUnique({
            where: { id: briefId },
            select: { pair: true },
          });

          if (brief && brief.pair === symbol) {
            // Delete the Redis processed key
            await this.redis.del(key);
            // Also delete the DB-persisted fallback key
            try {
              await this.prisma.setting.deleteMany({
                where: { key: `${key}:db` },
              });
            } catch { /* non-critical */ }
            cleared++;
            this.logger.debug(
              `🗑️ Cleared processedKey ${key} for closed position ${symbol} (user: ${userId})`,
            );
          }
        } catch (keyErr: any) {
          this.logger.warn(
            `Failed to check/clear processed key ${key}: ${keyErr.message}`,
          );
        }
      }

      if (cleared > 0) {
        this.logger.log(
          `🗑️ Cleared ${cleared} processed key(s) for ${symbol} (user: ${userId}) — new positions can now be opened`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to clear processed keys for ${symbol} (user: ${userId}): ${error.message}`,
      );
    }
  }

  /**
   * FIX V114: Close position with automatic retry on optimistic lock failure
   * AND transient errors (timeout, network, rate limit).
   *
   * Previously, this only retried on OPTIMISTIC_LOCK_FAILURE. But many
   * transient errors (CCXT timeout, network reset, rate limit) also benefit
   * from a retry — especially for paper-trading positions where a retry
   * is always safe (no real exchange state to desync).
   *
   * Retry schedule:
   * - OPTIMISTIC_LOCK_FAILURE: 100ms delay (fast — the other tx just committed)
   * - Transient errors: 1s, 2s, 3s exponential backoff
   */
  async closePositionWithRetry(
    userId: string,
    request: ClosePositionRequest,
    ipAddress?: string,
    userAgent?: string,
    maxRetries = 3,
  ): Promise<any> {
    try {
      return await this.closePosition(userId, request, ipAddress, userAgent, 0);
    } catch (error: any) {
      const errMsg = error?.message || '';

      // Check if this is an optimistic lock failure — fast retry
      if (errMsg.includes('OPTIMISTIC_LOCK_FAILURE') && maxRetries > 0) {
        this.logger.warn(`Optimistic lock failure on closePosition for ${request.positionId} — retrying (${maxRetries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.closePositionWithRetry(userId, request, ipAddress, userAgent, maxRetries - 1);
      }

      // FIX V114: Also retry on transient errors (timeout, network, rate limit)
      // These are temporary failures that may succeed on retry.
      const isTransientError = /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|rate.?limit|too many|429|network|unreachable|fetch failed|Service Unavailable|502|504/i.test(errMsg);
      if (isTransientError && maxRetries > 0) {
        const delayMs = (4 - maxRetries) * 1000; // 1s, 2s, 3s backoff
        this.logger.warn(`Transient error on closePosition for ${request.positionId} — retrying in ${delayMs}ms (${maxRetries} attempts left). Error: ${errMsg.substring(0, 100)}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.closePositionWithRetry(userId, request, ipAddress, userAgent, maxRetries - 1);
      }

      throw error;
    }
  }

  /**
   * FIX: Force close a position in the database WITHOUT executing on the exchange.
   * This is used when:
   * 1. The user already closed the position manually on the exchange
   * 2. The exchange API is not accessible (insufficient balance, API key issues, etc.)
   * 3. The position is stuck and needs manual sync
   *
   * WARNING: This does NOT execute any order on the exchange. It only updates the
   * database records. Use only when you are certain the position is already closed
   * on the exchange or should be marked as closed for operational reasons.
   */
  async forceClosePosition(
    userId: string,
    positionId: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // ── V215 FORENSIC LOG: Track every forceClosePosition call ──
    const _v215Stack = new Error().stack?.split('\n').slice(1, 6).map(s => s.trim()).join(' | ');
    this.logger.warn(
      `🔒 V215 forceClosePosition CALLED: positionId=${positionId?.slice(0,12) || '?'}... ` +
      `reason="${reason}" ` +
      `caller=${_v215Stack}`
    );

    // DATA ISOLATION: Use findFirst with userId
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, userId },
    });

    if (!position) {
      throw new NotFoundException('المركز غير موجود');
    }

    if (position.status !== 'OPEN') {
      return {
        order: null,
        pnl: position.realizedPnl?.toNumber() ?? 0,
        position: await this.prisma.position.findUnique({
          where: { id: position.id },
        }),
        alreadyClosed: true,
      };
    }

    // V214 LAST LINE OF DEFENSE: Also protect Agent positions in forceClosePosition
    // Old code on Railway may use forceClosePosition as a fallback path to close Agent positions at 4h
    const isAgentForceClose = position.source === 'agent';
    const reasonUpper = (reason || '').toUpperCase();
    const isSLTPForceClose = reasonUpper.includes('STOP_LOSS') || reasonUpper.includes('TAKE_PROFIT');
    // V227: Allow USER-initiated force-closes — traders must be able to close their own positions
    const isUserForceClose = reasonUpper.includes('USER');

    if (isAgentForceClose && !isSLTPForceClose && !isUserForceClose) {
      const holdingMs = position.openedAt
        ? Date.now() - new Date(position.openedAt).getTime()
        : 0;
      const holdingHours = holdingMs / (60 * 60 * 1000);

      if (holdingHours < 48) {
        this.logger.error(
          `🚨 V214 BLOCKED forceClose: Agent position ${position.id} (${position.symbol}) ` +
          `at ${holdingHours.toFixed(1)}h — minimum 48h. reason="${reason}" — ` +
          `BLOCKED. Only SL/TP force-closes allowed before 48h.`
        );
        return {
          order: null,
          pnl: 0,
          position,
          blockedByV214: true,
          reason: `Agent position held ${holdingHours.toFixed(1)}h — minimum is 48h. Force close blocked.`,
        };
      }
    }

    // V261: Block TIME_EXPIRED force-close of Smart Executor positions.
    // ROOT CAUSE of 4h auto-close:
    //   1. PositionMonitor (old Docker cache) detects holdingMs > 4h
    //   2. Calls _closePosition → closePositionWithRetry → closePosition
    //   3. V237 blocks TIME_EXPIRED in closePosition (holdingHours < 6h)
    //   4. closePosition throws error
    //   5. _closePosition catch block → forceClosePosition (FALLBACK!)
    //   6. forceClosePosition has NO V237 defense → closes the position!
    //
    // This was the BYPASS that defeated ALL previous fixes (V223, V237, V260).
    // Every tool that tried to fix the 4h close was defeated by this fallback.
    //
    // FIX: Block ANY force-close that contains TIME_EXPIRED in the reason
    // for Smart Executor positions. Only SL/TP/user-initiated closes pass.
    const isSmartExecutorForceClose = position.source === 'smart_executor';
    const isTimeExpiredForceClose = reasonUpper.includes('TIME_EXPIRED');
    if (isSmartExecutorForceClose && isTimeExpiredForceClose && !isSLTPForceClose && !isUserForceClose) {
      this.logger.error(
        `🚨 V261 BLOCKED forceClose: Smart Executor position ${position.id} (${position.symbol}) ` +
        `TIME_EXPIRED force-close BLOCKED. reason="${reason}". ` +
        `This was the ROOT CAUSE of the 4h auto-close bug — forceClosePosition ` +
        `was bypassing V237's defense in closePosition.`
      );
      return {
        order: null,
        pnl: 0,
        position,
        blockedByV261: true,
        reason: `TIME_EXPIRED force-close of Smart Executor position BLOCKED (V261)`,
      };
    }

    const posQuantity = position.quantity.toNumber();
    const posEntryPrice = position.entryPrice.toNumber();
    const posRealizedPnl = position.realizedPnl?.toNumber() ?? 0;
    const posStopLoss = position.stopLoss?.toNumber() ?? null;

    // Get current market price for PnL calculation
    // FIX V114: Add 3-second timeout for getQuote() — same pattern as closePosition().
    // Previously, forceClosePosition() called getQuote() WITHOUT a timeout. When all
    // price providers were exhausted (TwelveData rate-limited, Binance blocked, etc.),
    // getQuote() could hang for 30+ seconds, causing the entire force-close request
    // to timeout and the position to remain stuck OPEN.
    let currentPrice = position.currentPrice?.toNumber() ?? 0;
    if (currentPrice <= 0) {
      try {
        const quotePromise = this.exchangeService.getQuote(position.symbol);
        const quote = await Promise.race([
          quotePromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        currentPrice = quote?.price ?? posEntryPrice;
      } catch {
        currentPrice = posEntryPrice;
      }
    }
    // Final safety: entryPrice is always available for an OPEN position
    if (!currentPrice || currentPrice <= 0) {
      currentPrice = posEntryPrice;
    }

    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
    // FIX V174: Only deduct exit fee (0.1%). Entry fee was charged at open.
    const grossPnl2 =
      position.side === 'BUY'
        ? (currentPrice - posEntryPrice) * posQuantity
        : (posEntryPrice - currentPrice) * posQuantity;
    const paperFees = currentPrice * posQuantity * 0.001; // exit fee only
    const pnl = grossPnl2 - paperFees;

    // Create DB records without exchange execution
    const { order: closedOrder } = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          exchangeCredentialId: position.credentialId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: closeSide,
          type: 'MARKET' as PrismaOrderType,
          status: 'FILLED' as PrismaOrderStatus,
          quantity: posQuantity,
          stopLoss: posStopLoss,
          filledQuantity: posQuantity,
          averagePrice: currentPrice,
          fee: 0,
          feeCurrency: position.symbol.split('/').pop() || 'USDT',
          exchangeOrderId: `force-${Date.now()}-${crypto.randomUUID()}`,
          idempotencyKey: `force-close-${Date.now()}-${crypto.randomUUID()}`,
        },
      });

      await tx.trade.create({
        data: {
          userId,
          orderId: order.id,
          positionId: position.id,
          credentialId: position.credentialId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: 'EXIT',
          quantity: posQuantity,
          price: currentPrice,
          fee: 0,
          feeCurrency: position.symbol.split('/').pop() || 'USDT',
          pnl,
          source: position.source || 'user_manual', // V140B: Inherit source from position (smart_executor/agent/etc)
        },
      });

      await tx.position.update({
        where: { id: position.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          realizedPnl: posRealizedPnl + pnl,
          exitPrice: currentPrice, // V140: Store the actual close price
          closeReason: reason ? reason.split(' ').slice(0, 3).join('_').toUpperCase() : 'FORCE_CLOSE', // V141: Extract reason type from force-close reason string
        },
      });

      return { order };
    });

    await this.auditService.log({
      userId,
      action: 'POSITION_FORCE_CLOSED',
      resource: 'position',
      details: JSON.stringify({
        positionId: position.id,
        symbol: position.symbol,
        quantity: posQuantity,
        pnl,
        exitPrice: currentPrice,
        reason,
        warning: 'Position was force-closed in DB only — no exchange order was executed',
      }),
      ipAddress,
      userAgent,
    });

    this.logger.warn(
      `🔴 FORCE CLOSED position ${position.id} (${position.symbol}) — reason: ${reason}. ` +
      `NO exchange order was executed. DB updated only.`,
    );

    // V222 FIX: REMOVED _clearProcessedKeysForPosition — same as closePosition.
    // See closePosition's comment for full explanation.
    // OLD CODE (REMOVED):
    // this._clearProcessedKeysForPosition(userId, position.symbol).catch(() => {});

    // V222 FIX: Set symbol-lock + direction-lock + cooldown after force-close.
    // Previously, forceClosePosition did NOT set these Redis keys, meaning:
    //   - SmartExecutor's cooldown check would NOT block the symbol
    //   - UnifiedRiskService CHECK 8 would NOT block the symbol
    // This was a critical gap — if a position was force-closed (V114 fallback),
    // nothing prevented immediate re-open except the DB cooldown in _updatePosition.
    try {
      const closedSide = position.side;
      const repDirLockKey = `trade-rep:dir-lock:${userId}:${position.symbol}:${closedSide}`;
      await this.redis.set(repDirLockKey, '1', 30 * 60 * 1000); // 30 min same-direction lockout

      const symbolLockKey = `trade-rep:symbol-lock:${userId}:${position.symbol}`;
      await this.redis.set(symbolLockKey, '1', 15 * 60 * 1000); // 15 min both-directions lockout

      const cooldownKey = `cooldown:${userId}:${position.symbol}`;
      await this.redis.set(cooldownKey, 'FORCE_CLOSE', 15 * 60 * 1000); // 15 min cooldown for SmartExecutor
    } catch (lockErr: any) {
      this.logger.warn(`V222: Failed to set symbol-lock after force-close: ${lockErr.message}`);
      // Non-critical — V222 DB cooldown in _updatePosition is the backup
    }

    // V172d FIX: Return MARGIN + PnL to paperBalance atomically on force-close.
    if (position.exchange === 'paper-trading') {
      try {
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
        });
        const meta = getSymbolMetadata(position.symbol);
        const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
        const forexLev = Number(settings?.paperForexLeverage) || 50;
        const goldLev = Number(settings?.paperGoldLeverage) || 20;
        let leverage = 1;
        if (meta.assetClass === AssetClass.FOREX) leverage = forexLev;
        else if (meta.assetClass === AssetClass.COMMODITY) leverage = goldLev;
        else leverage = cryptoLev;

        const notional = Number(position.entryPrice) * posQuantity;
        const marginToReturn = leverage > 1 ? notional / leverage : notional;
        const totalReturn = marginToReturn + pnl;

        // V176 FIX: Return margin + PnL (not just PnL) on force-close
        await this.prisma.$executeRaw`
          UPDATE "AgentSettings"
          SET "paperBalance" = "paperBalance" + ${totalReturn}
          WHERE "userId" = ${userId}
        `;
        this.logger.log(
          `📝 V176 Paper balance on force-close: margin +$${marginToReturn.toFixed(2)}, PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}, total +$${totalReturn.toFixed(2)} (${position.symbol})`,
        );
      } catch (err: any) {
        this.logger.warn(`V172d Failed to update paper balance on force-close: ${err.message}`);
      }
    }

    // FIX V117: Invalidate balance cache after force close too
    try {
      this.credentialsService.invalidateBalanceCache(userId);
    } catch { /* non-critical */ }

    return {
      order: closedOrder,
      pnl,
      position: await this.prisma.position.findUnique({
        where: { id: position.id },
      }),
      forceClosed: true,
    };
  }

  /**
   * Update stop-loss and take-profit for a position
   */
  async updatePositionLevels(
    userId: string,
    positionId: string,
    data: { stopLoss?: number; takeProfit?: number },
  ) {
    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' positions
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, userId },
    });

    if (!position) {
      throw new NotFoundException('المركز غير موجود');
    }

    if (position.status !== 'OPEN') {
      // ── FIX: Idempotent update — if position is already CLOSED/LIQUIDATED,
      // SL/TP update is meaningless. Return the position as-is instead of error.
      this.logger.warn(
        `Cannot update SL/TP for position ${positionId} — status is ${position.status}`,
      );
      return this.prisma.position.findUnique({
        where: { id: positionId },
      });
    }

    return this.prisma.position.update({
      where: { id: positionId },
      data: {
        stopLoss: data.stopLoss,
        takeProfit: data.takeProfit,
      },
    });
  }

  /**
   * Get closed positions for a user
   */
  async getClosedPositions(userId: string, limit?: number | undefined, from?: string, to?: string, credentialId?: string) {
    try {
      const where: any = { userId, status: { in: ['CLOSED', 'LIQUIDATED'] } }; // V140B: Include LIQUIDATED positions

      // V205: Filter by credentialId for account-based filtering
      // V212 FIX: Position.credentialId is NOT NULL in schema, so we CANNOT use
      // OR with { credentialId: null } — Prisma rejects it. Use direct filter instead.
      if (credentialId) {
        where.credentialId = credentialId;
      }

      // V140: Add date range filtering for daily/weekly/monthly/yearly classification
      if (from || to) {
        where.closedAt = {};
        if (from) where.closedAt.gte = new Date(from);
        if (to) where.closedAt.lte = new Date(to);
      }

      // V207 FIX: Try with trades include first. If it fails (e.g., Trade table
      // doesn't have credentialId column yet because migration wasn't applied),
      // fall back to querying without the trades include. This makes the API
      // resilient to migration failures — the user still sees their closed positions,
      // just without the trade details (exit price fallback uses entryPrice instead).
      try {
        return await this.prisma.position.findMany({
          where,
          orderBy: { closedAt: 'desc' },
          take: limit,
          include: { trades: true }, // V140: Include related trades for exit price
        });
      } catch (includeError: any) {
        // If the error is about a missing column (migration not applied), retry without include
        const errMsg = includeError?.message || '';
        if (errMsg.includes('does not exist') || errMsg.includes('column') || includeError?.code === 'P2021') {
          this.logger.warn(
            `V207: getClosedPositions failed with trades include (migration not applied?): ${errMsg.substring(0, 200)}. Retrying without trades include.`
          );
          return await this.prisma.position.findMany({
            where,
            orderBy: { closedAt: 'desc' },
            take: limit,
            // No trades include — exit price will use position.exitPrice or entryPrice
          });
        }
        // Other errors — re-throw
        throw includeError;
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch closed positions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all positions (open + closed) for a user
   * Enriches open positions with live quotes using parallel fetching
   */
  async getAllPositions(userId: string, limit: number = 100) {
    try {
      const positions = await this.prisma.position.findMany({
        where: { userId },
        orderBy: { openedAt: 'desc' },
        take: limit,
      });

      if (positions.length === 0) return [];

      // Separate open positions that need live quote enrichment
      const openPositions = positions.filter((p) => p.status === 'OPEN');

      if (openPositions.length === 0) return positions;

      // Fetch all quotes for open positions in parallel
      const quotePromises = openPositions.map((pos) =>
        this.exchangeService.getQuote(pos.symbol).catch(() => null),
      );
      const quotes = await Promise.allSettled(quotePromises);

      // Build batch updates for open positions
      const updates: any[] = [];
      const enrichedMap = new Map<string, any>();

      for (let i = 0; i < openPositions.length; i++) {
        const position = openPositions[i];
        const quoteResult = quotes[i];
        const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;

        if (quote && quote.price) {
          const currentPrice = quote.price;
          const entryPrice = position.entryPrice.toNumber();
          const quantity = position.quantity.toNumber();
          const unrealizedPnl =
            position.side === 'BUY'
              ? (currentPrice - entryPrice) * quantity
              : (entryPrice - currentPrice) * quantity;

          updates.push(
            this.prisma.position.update({
              where: { id: position.id },
              data: {
                currentPrice,
                unrealizedPnl,
                highestPrice: Math.max(
                  position.highestPrice?.toNumber() ?? currentPrice,
                  currentPrice,
                ),
                lowestPrice: Math.min(
                  position.lowestPrice?.toNumber() ?? currentPrice,
                  currentPrice,
                ),
              },
            }),
          );

          enrichedMap.set(position.id, {
            currentPrice,
            unrealizedPnl,
          });
        }
      }

      // Batch update in transaction
      if (updates.length > 0) {
        await this.prisma.$transaction(updates).catch((err: any) => {
          this.logger.warn(`Batch position update failed: ${err.message}`);
        });
      }

      // Merge enriched data into results
      return positions.map((pos) => {
        const enriched = enrichedMap.get(pos.id);
        if (enriched) {
          return { ...pos, ...enriched };
        }
        return pos;
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch all positions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get trade history
   */
  async getTradeHistory(userId: string, limit: number = 50, from?: string, to?: string, credentialId?: string) {
    try {
      const where: any = { userId };

      // V205: Filter by credentialId for account-based filtering
      // V334 CLEANUP: Removed `OR: [{ credentialId: null }]` legacy pollution.
      // Previously, when a credentialId was provided, the query ALSO returned
      // old Trade records with credentialId=NULL (from before V205 migration).
      // This meant users saw trades from OTHER accounts (or pre-migration data)
      // mixed with their current account's trades — confusing and wrong.
      //
      // Now we strictly filter by credentialId when provided. NULL-credentialId
      // trades are only returned when NO credentialId is specified (i.e., "all accounts" view).
      // Use the V334 backfill script (scripts/backfill-trade-credentialId.js) to
      // retroactively assign NULL-credentialId trades to their proper credential.
      if (credentialId) {
        where.credentialId = credentialId;
      }

      // V140: Add date range filtering
      if (from || to) {
        where.executedAt = {};
        if (from) where.executedAt.gte = new Date(from);
        if (to) where.executedAt.lte = new Date(to);
      }

      return await this.prisma.trade.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        take: limit,
      });
    } catch (error: any) {
      // V208 FIX: If the query fails, use raw SQL as fallback.
      // Prisma always includes ALL schema columns in SELECT, so even removing
      // credentialId from WHERE doesn't help — the SELECT still references it.
      // Only raw SQL can avoid referencing a column that doesn't exist yet.
      const errMsg = error?.message || '';
      const isColumnMissing = errMsg.includes('does not exist') || errMsg.includes('column') || error?.code === 'P2021';

      if (isColumnMissing) {
        this.logger.warn(
          `V208: getTradeHistory Prisma query failed (column missing?): ${errMsg.substring(0, 200)}. Using raw SQL fallback.`
        );
        try {
          // Build raw SQL that only selects columns that definitely exist
          let sql = `SELECT id, "userId", "orderId", "positionId", exchange, symbol, side, type, quantity, price, fee, "feeCurrency", pnl, "exchangeTradeId", "executedAt", source FROM "Trade" WHERE "userId" = $1`;
          const params: any[] = [userId];
          let paramIdx = 2;

          if (credentialId) {
            // V334: Strict filter — no `OR "credentialId" IS NULL` legacy pollution
            sql += ` AND "credentialId" = $${paramIdx}`;
            params.push(credentialId);
            paramIdx++;
          }

          if (from) {
            sql += ` AND "executedAt" >= $${paramIdx}`;
            params.push(new Date(from));
            paramIdx++;
          }
          if (to) {
            sql += ` AND "executedAt" <= $${paramIdx}`;
            params.push(new Date(to));
            paramIdx++;
          }

          sql += ` ORDER BY "executedAt" DESC LIMIT $${paramIdx}`;
          params.push(limit);

          const trades = await this.prisma.$queryRawUnsafe(sql, ...params);

          // Add credentialId: null to each trade for consistent shape
          return (trades as any[]).map(t => ({ ...t, credentialId: t.credentialId ?? null }));
        } catch (rawErr: any) {
          // If credentialId filter fails in raw SQL too, try WITHOUT it
          if (credentialId && (rawErr?.message || '').includes('credentialId')) {
            this.logger.warn(
              `V208: Raw SQL with credentialId also failed: ${(rawErr?.message || '').substring(0, 200)}. Trying without credentialId.`
            );
            try {
              let sql = `SELECT id, "userId", "orderId", "positionId", exchange, symbol, side, type, quantity, price, fee, "feeCurrency", pnl, "exchangeTradeId", "executedAt", source FROM "Trade" WHERE "userId" = $1`;
              const params: any[] = [userId];
              let paramIdx = 2;

              if (from) {
                sql += ` AND "executedAt" >= $${paramIdx}`;
                params.push(new Date(from));
                paramIdx++;
              }
              if (to) {
                sql += ` AND "executedAt" <= $${paramIdx}`;
                params.push(new Date(to));
                paramIdx++;
              }

              sql += ` ORDER BY "executedAt" DESC LIMIT $${paramIdx}`;
              params.push(limit);

              const trades = await this.prisma.$queryRawUnsafe(sql, ...params);
              return (trades as any[]).map(t => ({ ...t, credentialId: null }));
            } catch (rawErr2: any) {
              this.logger.error(
                `V208: Raw SQL fallback without credentialId also failed: ${rawErr2.message}`,
                rawErr2.stack,
              );
              throw rawErr2;
            }
          }
          throw rawErr;
        }
      }
      this.logger.error(
        `Failed to fetch trade history: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // ── Private Methods ──

  /**
   * V147: Determine the correct number of decimal places for a price
   * using symbol-metadata registry (consistent with SYMBOL_METADATA).
   * Falls back to price-magnitude heuristics for unknown symbols.
   */
  /**
   * V226: Check if the exchange is an MT5/MetaTrader variant.
   * MT5 accounts must be routed through ExecutionGatewayService
   * instead of CCXT because ccxt['mt5'] = undefined.
   */
  private _isMT5Exchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    return ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'].includes(lower);
  }

  private _priceDecimals(price: number, symbol?: string): number {
    if (!Number.isFinite(price) || price <= 0) return 2;
    // V147: Use symbol-metadata priceDecimals when available — this ensures
    // consistency with the lot/margin system. For example, EUR/USD has
    // priceDecimals=5 in SYMBOL_METADATA, which matches the old heuristic.
    // But for symbols like XRP/USDT (priceDecimals=4) or ADA/USDT (4),
    // the metadata is more accurate than the heuristic.
    if (symbol) {
      try {
        const meta = getSymbolMetadata(symbol);
        // Only use metadata if it returned a specific (non-default) value
        // The default metadata has priceDecimals=2 which is too coarse for forex
        if (meta.priceDecimals > 2 || meta.assetClass === AssetClass.FOREX) {
          return meta.priceDecimals;
        }
      } catch {
        // Fall through to heuristic
      }
      // Fallback heuristics for symbols not in registry
      const s = symbol.toUpperCase();
      if (s.includes('JPY')) return 3;
      if (s.includes('BTC')) return 2;
      if (s.includes('XAU') || s.includes('XAG')) return 2;
    }
    if (price > 1000) return 2;
    if (price > 1) return 5;   // forex pipette precision
    return 6;
  }

  /**
   * Get or create a cached CCXT exchange instance
   * Caches per credential+exchange combo to avoid recreating for every order
   */
  private _getExchangeInstance(exchangeName: string, apiKey: string, apiSecret: string, credentialId: string, testnet: boolean = false): any {
    const cacheKey = `${credentialId}:${exchangeName}:${testnet}`;
    let exchange = this.exchangeCache.get(cacheKey);

    if (!exchange) {
      const isLegacyBinanceTest = exchangeName === 'binance_test' || exchangeName === 'binance_future_test';
      const isTestnet = testnet || isLegacyBinanceTest;
      const normalizedName = isLegacyBinanceTest ? 'binance' : exchangeName;
      const ExchangeClass = ccxt[normalizedName as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        return null;
      }
      exchange = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
        timeout: 10000, // 10 second timeout
        options: { 
          defaultType: exchangeName === 'binance_future_test' ? 'future' : 'spot',
          adjustForTimeDifference: true
        },
      });

      if (isTestnet) {
        exchange.setSandboxMode(true);
        this.logger.log(`🛠️ TradingService: Enabled Binance Sandbox mode for ${credentialId} (testnet=${testnet}, legacy=${isLegacyBinanceTest})`);
      }

      this.exchangeCache.set(cacheKey, exchange);
      this.exchangeCacheTimestamps.set(cacheKey, Date.now());

      // Auto-cleanup after 10 minutes
      setTimeout(() => this.exchangeCache.delete(cacheKey), 10 * 60 * 1000);
    }

    return exchange;
  }

  /**
   * Get available balance for a specific symbol from the exchange.
   * This checks the ACTUAL balance on the exchange (not the cached/expected balance).
   * Used to prevent "Insufficient balance" errors when closing positions.
   *
   * FIX: Enhanced version with:
   * 1. Detailed logging to debug "available: 0" issues
   * 2. Futures wallet support (for positions opened on futures)
   * 3. Fallback to total balance if free balance is 0 (with warning)
   * 4. Better error messages for different wallet types
   *
   * @param exchange CCXT exchange instance
   * @param symbol Trading pair (e.g., 'BTC/USDT')
   * @param walletType 'spot' | 'future' | 'margin' — defaults to spot
   * @returns Available and total balance for the base currency (e.g., BTC)
   */
  private async _getAvailableBalance(
    exchange: any,
    symbol: string,
    walletType: 'spot' | 'future' | 'margin' = 'spot',
  ): Promise<{ available: number; total: number; currency: string; walletType: string; rawBalance?: any }> {
    const baseCurrency = symbol.split('/')[0];

    try {
      // Try fetching balance with specified wallet type
      const balanceParams = walletType !== 'spot' ? { type: walletType } : {};
      const balance = await exchange.fetchBalance(balanceParams);

      // DEBUG: Log full balance response for troubleshooting
      this.logger.debug(
        `🔍 Balance fetch for ${symbol} (${walletType}): ${JSON.stringify({
          baseCurrency,
          free: balance[baseCurrency]?.free,
          total: balance[baseCurrency]?.total,
          used: balance[baseCurrency]?.used,
          hasBalance: !!balance[baseCurrency],
        })}`,
      );

      // Log all currencies that have balance > 0 (for debugging)
      const nonZeroBalances = Object.entries(balance)
        .filter(([key, val]: [string, any]) => {
          if (key === 'free' || key === 'total' || key === 'used' || key === 'info') return false;
          return val && (parseFloat(val.total || 0) > 0 || parseFloat(val.free || 0) > 0);
        })
        .map(([key, val]: [string, any]) => `${key}: free=${val.free}, total=${val.total}`);

      if (nonZeroBalances.length > 0) {
        this.logger.debug(`🔍 Non-zero balances on ${walletType}: ${nonZeroBalances.join(' | ')}`);
      }

      if (!balance[baseCurrency]) {
        // Currency not found in this wallet type
        return {
          available: 0,
          total: 0,
          currency: baseCurrency,
          walletType,
          rawBalance: nonZeroBalances.length > 0 ? nonZeroBalances : undefined,
        };
      }

      let available = parseFloat(balance[baseCurrency].free || '0');
      const total = parseFloat(balance[baseCurrency].total || '0');
      const used = parseFloat(balance[baseCurrency].used || '0');

      // FIX: If available is 0 but total > 0, the balance is locked (used in open orders, etc.)
      // In this case, we can try using total with a warning
      if (available <= 0 && total > 0) {
        this.logger.warn(
          `⚡ Balance locked for ${baseCurrency}: free=${available}, used=${used}, total=${total}. ` +
          `The ${walletType} wallet shows 0 available but ${total} total. ` +
          `This usually means the balance is locked in open orders or margin positions.`,
        );

        // For closing positions, we should use total if available is 0
        // This is a fallback — the order might still fail if truly locked
        available = total;
      }

      return { available, total, currency: baseCurrency, walletType };
    } catch (error: any) {
      this.logger.warn(`⚡ Failed to fetch ${walletType} balance for ${symbol}: ${error.message}`);
      return { available: 0, total: 0, currency: baseCurrency, walletType };
    }
  }

  /**
   * FIX: Check API key permissions on the exchange.
   * Since CCXT doesn't expose Binance's apiRestrictions endpoint directly,
   * we use fetchBalance() as a proxy: if it succeeds, the key has read permissions.
   * If it fails with an auth error, the key is invalid or lacks permissions.
   *
   * @param exchange CCXT exchange instance
   * @returns Permission info based on whether fetchBalance succeeds
   */
  private async _checkApiPermissions(
    exchange: any,
  ): Promise<{ success: boolean; permissions?: any; error?: string }> {
    try {
      // Use fetchBalance as a proxy for API permissions
      const balance = await exchange.fetchBalance();

      // If we got here, the API key works for reading
      return {
        success: true,
        permissions: {
          enableReading: true,
          canFetchBalance: true,
          walletAccessible: true,
        },
      };
    } catch (error: any) {
      const message = error.message || '';
      let inferredPermissions = {
        enableReading: false,
        canFetchBalance: false,
        walletAccessible: false,
      };

      // Try to infer the issue from the error message
      if (message.includes('Invalid API-key') || message.includes('Invalid key')) {
        inferredPermissions = { ...inferredPermissions, errorType: 'INVALID_API_KEY' } as any;
      } else if (message.includes('IP')) {
        inferredPermissions = { ...inferredPermissions, errorType: 'IP_RESTRICTED' } as any;
      } else if (message.includes('timestamp') || message.includes('time')) {
        inferredPermissions = { ...inferredPermissions, errorType: 'TIME_SYNC_ISSUE' } as any;
      }

      this.logger.warn(`⚡ API key test failed: ${message}`);
      return {
        success: false,
        permissions: inferredPermissions,
        error: message,
      };
    }
  }

  /**
   * FIX: Simulate a paper trade (no real exchange connection).
   * When the credential exchange is 'paper-trading', CCXT can't execute the order
   * because there's no 'paper-trading' exchange class in CCXT. This method simulates
   * the execution by creating a mock order result with the current market price.
   *
   * Paper trading is safe — no real money is at risk. The simulation uses:
   * - Current market price as the fill price
   * - 0.1% simulated slippage
   * - 0.1% simulated fee
   * - Instant full fill (no partial fills)
   */
  private async _executePaperTrade(
    request: PlaceOrderRequest,
    currentPrice: number,
    userId?: string,
  ): Promise<{
    success: boolean;
    exchangeOrderId: string;
    filledQuantity: number;
    averagePrice: number;
    fee: number;
    feeCurrency: string;
  }> {
    // V252: Use DEFAULT_PAPER_BALANCE (10000) when paperBalance is 0 or missing.
    const DEFAULT_PAPER_BALANCE = 10000;
    let paperBalance = 0;
    if (userId) {
      try {
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperBalance: true },
        });
        if (settings?.paperBalance && Number(settings.paperBalance) > 0) {
          const balance = Number(settings.paperBalance);
          paperBalance = balance < 100 ? DEFAULT_PAPER_BALANCE : balance;
        } else {
          paperBalance = DEFAULT_PAPER_BALANCE;
        }
      } catch {
        paperBalance = DEFAULT_PAPER_BALANCE;
      }
    } else {
      paperBalance = DEFAULT_PAPER_BALANCE;
    }
    // V204: If paperBalance is 0 or negative, block the trade
    if (paperBalance <= 0) {
      this.logger.warn(`📜 V204: paperBalance is $${paperBalance} — blocking trade (no capital)`);
      return {
        success: false,
        exchangeOrderId: '',
        filledQuantity: 0,
        averagePrice: currentPrice,
        fee: 0,
        feeCurrency: 'USD',
      };
    }

    // V253: REMOVED MAX_POSITION_PERCENT check — manual trades are free.
    // V242 removed this from unified-risk.service.ts but _executePaperTrade
    // had its OWN separate check. Now removed here too.
    // The margin check (paperBalance > orderValue) is the ONLY limit.
    const orderValue = request.quantity * currentPrice;

    // V259: REMOVED slippage simulation.
    // The chart already sends the exact price (resolvedPrice).
    // Adding 0.1% slippage on top caused $66+ difference on BTC.
    // Real exchanges charge slippage naturally — paper trading should
    // fill at the exact price the user saw on the chart.
    // V146: Round price to eliminate floating-point artifacts.
    const priceDecimals = this._priceDecimals(currentPrice, request.symbol);
    const fillPrice = parseFloat(currentPrice.toFixed(priceDecimals));

    // Simulate fee: 0.1%
    const fee = request.quantity * fillPrice * 0.001;
    const feeCurrency = request.symbol.split('/').pop() || 'USDT';

    this.logger.log(
      `📜 Paper trade executed: ${request.side} ${request.quantity} ${request.symbol} @ ${fillPrice.toFixed(priceDecimals)} ` +
      `(fee: ${fee.toFixed(4)} ${feeCurrency})`,
    );

    return {
      success: true,
      exchangeOrderId: `paper-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      filledQuantity: request.quantity,
      averagePrice: fillPrice,
      fee,
      feeCurrency,
    };
  }

  /**
   * Execute an order on the exchange via CCXT
   * Only MARKET and LIMIT order types are supported
   */
  private async _executeOnExchange(
    exchangeName: string,
    credentialId: string,
    request: PlaceOrderRequest,
    userId?: string,
  ): Promise<{
    success: boolean;
    exchangeOrderId?: string;
    filledQuantity?: number;
    averagePrice?: number;
    fee?: number;
    feeCurrency?: string;
    error?: string;
  }> {
    try {
      // ── Paper Trading: skip decryption entirely ──
      // Paper-trading credentials store 'paper' as the API key/IV/authTag.
      // Attempting to decrypt 'paper' as hex with AES-256-GCM always fails.
      // Paper trades are simulated anyway — no real exchange connection needed.
      if (exchangeName === 'paper-trading') {
        const currentPrice = await this.exchangeService.getQuote(request.symbol).then(q => q?.price ?? 0).catch(() => 0);
        if (currentPrice <= 0) {
          return { success: false, error: `لا يمكن جلب سعر ${request.symbol} للتداول الورقي` };
        }
        return await this._executePaperTrade(request, currentPrice, userId);
      }

      // ═══════════════════════════════════════════════════════════════
      // V226: MT5 Execution via ExecutionGatewayService
      //
      // PROBLEM: TradingService._executeOnExchange() uses CCXT directly,
      // but ccxt['mt5'] = undefined, so ALL MT5 orders fail with:
      // "البورصة mt5 غير مدعومة"
      //
      // FIX: Route MT5 orders through ExecutionGatewayService, which
      // correctly creates an MT5Adapter (via MetaAPI Cloud SDK).
      // This is the SAME path used by the V2 BullMQ pipeline that
      // already works for manual orders via OrderController.
      //
      // The gateway handles:
      //   - Credential decryption (same as CCXT path)
      //   - MT5Adapter creation (with MetaAPI connection)
      //   - Position size checks (5% max equity)
      //   - Symbol format conversion (EUR/USD → EURUSD)
      //   - Error normalization (Arabic messages)
      // ═══════════════════════════════════════════════════════════════
      if (this._isMT5Exchange(exchangeName) && userId && this.executionGateway) {
        this.logger.log(
          `📊 V226: Routing MT5 order via ExecutionGateway — ${request.side} ${request.quantity} ${request.symbol}`
        );
        try {
          const result = await this.executionGateway.placeOrder(userId, {
            userId: userId,
            exchangeCredentialId: credentialId,
            symbol: request.symbol,
            side: request.side as 'BUY' | 'SELL',
            type: (request.type || 'MARKET') as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT',
            quantity: request.quantity,
            price: request.price,
            stopLoss: request.stopLoss,
            takeProfit: request.takeProfit,
            idempotencyKey: request.idempotencyKey || `mt5-${Date.now()}`,
            source: request.source || 'trading_service',
          });

          if (result.success) {
            this.logger.log(
              `✅ V226: MT5 order executed via gateway: ${result.exchangeOrderId} — ` +
              `${request.side} ${result.filledQuantity} ${request.symbol} @ ${result.averagePrice}`
            );
          }

          return {
            success: result.success,
            exchangeOrderId: result.exchangeOrderId,
            filledQuantity: result.filledQuantity,
            averagePrice: result.averagePrice,
            fee: result.fee,
            feeCurrency: result.feeCurrency,
            error: result.error,
          };
        } catch (gatewayErr: any) {
          this.logger.error(`❌ V226: MT5 gateway execution failed: ${gatewayErr.message}`);
          return {
            success: false,
            error: `فشل تنفيذ أمر MT5: ${gatewayErr.message}`,
          };
        }
      }

      // V226: If MT5 but gateway not available, CCXT will fail with
      // "البورصة mt5 غير مدعومة" — which is better than a silent crash.
      // This should NEVER happen if ExecutionModule is imported correctly.

      // SECURITY: Pass userId to verify credential ownership before decrypting
      const { apiKey, apiSecret } =
        await this.credentialsService.decryptCredential(credentialId, userId);

      // V168 FIX: Fetch credential to get testnet flag — WITH userId filter.
      // Previously, this query had NO userId filter, meaning any user with a
      // credentialId could read another user's testnet flag (IDOR vulnerability).
      const credential = await this.prisma.exchangeCredential.findFirst({
        where: { id: credentialId, userId },
      });
      const isTestnet = (credential as any)?.testnet || false;

      const exchange = this._getExchangeInstance(exchangeName, apiKey, apiSecret, credentialId, isTestnet);
      if (!exchange) {
        return {
          success: false,
          error: `البورصة "${exchangeName}" غير مدعومة`,
        };
      }

      // FIX: Check available balance before executing SELL orders.
      // This prevents "Insufficient balance" errors when closing positions.
      // The database may show a higher quantity than what's actually available
      // due to fees, locked funds, or other pending orders.
      //
      // FIX: Try spot, futures, and margin wallets — the position might be on any of them.
      if (request.side === 'SELL') {
        const allWallets: Array<{ type: string; available: number; total: number; raw?: any[] }> = [];

        // Check Spot wallet
        let balance = await this._getAvailableBalance(exchange, request.symbol, 'spot');
        allWallets.push({ type: 'Spot', available: balance.available, total: balance.total, raw: balance.rawBalance });

        // If spot balance is 0, try futures wallet
        if (balance.available <= 0) {
          this.logger.log(
            `🔍 Spot balance for ${request.symbol} is 0, checking futures wallet...`,
          );
          const futuresBalance = await this._getAvailableBalance(exchange, request.symbol, 'future');
          allWallets.push({ type: 'Futures', available: futuresBalance.available, total: futuresBalance.total, raw: futuresBalance.rawBalance });

          if (futuresBalance.available > 0) {
            this.logger.log(
              `✅ Found ${futuresBalance.available} ${futuresBalance.currency} in futures wallet`,
            );
            balance = futuresBalance;
          } else {
            // Try margin wallet as well
            this.logger.log(
              `🔍 Futures balance is 0, checking margin wallet...`,
            );
            const marginBalance = await this._getAvailableBalance(exchange, request.symbol, 'margin');
            allWallets.push({ type: 'Margin', available: marginBalance.available, total: marginBalance.total, raw: marginBalance.rawBalance });

            if (marginBalance.available > 0) {
              this.logger.log(
                `✅ Found ${marginBalance.available} ${balance.currency} in margin wallet`,
              );
              balance = marginBalance;
            }
          }
        }

        // If still no balance, log all attempts and return detailed error
        if (balance.available <= 0) {
          const walletSummary = allWallets
            .map(w => `${w.type}: total=${w.total}, free=${w.available}`)
            .join(' | ');

          const allNonZeroCurrencies = allWallets
            .flatMap(w => w.raw || [])
            .filter((v, i, a) => a.indexOf(v) === i) // unique
            .join(' | ');

          // FIX: Check API permissions to diagnose why balance is 0
          const apiPermissions = await this._checkApiPermissions(exchange);

          this.logger.error(
            `❌ ${request.symbol}: No ${balance.currency} balance found in any wallet. ` +
            `Checked: ${walletSummary}. ` +
            `All non-zero balances found: ${allNonZeroCurrencies || 'NONE'}. ` +
            `API Permissions: ${JSON.stringify(apiPermissions.permissions || apiPermissions.error)}. ` +
            `This usually means: (1) Position was already closed on exchange, ` +
            `(2) API key lacks wallet read permission, ` +
            `(3) Balance is in a sub-account or different wallet type, ` +
            `(4) Position was opened on different exchange/account.`,
          );

          // Build enhanced error message with API permissions info
          let permissionsInfo = '';
          if (apiPermissions.success && apiPermissions.permissions) {
            const p = apiPermissions.permissions;
            permissionsInfo = ` | API key يعمل للقراءة ✅. ` +
              `⚠️ لا يمكن التحقق من صلاحيات التداول تلقائياً. ` +
              `تأكد يدوياً في Binance: API Management → ` +
              `Enable Spot & Margin Trading + Enable Futures.`;
          } else if (apiPermissions.error) {
            permissionsInfo = ` | خطأ في فحص API: ${apiPermissions.error}`;
          }

          return {
            success: false,
            error: `رصيد ${balance.currency} غير متاح في أي محفظة. ` +
              `المحاولات: ${walletSummary}. ` +
              `العملات المتاحة: ${allNonZeroCurrencies || 'لا يوجد'}. ` +
              permissionsInfo +
              ` | الأسباب المحتملة: (1) المركز مُغلق يدوياً في Binance، ` +
              `(2) مفتاح API لا يملك صلاحية قراءة المحفظة، ` +
              `(3) الرصيد في حساب فرعي أو محفظة غير مدعومة، ` +
              `(4) المركز مفتوح في بورصة أو حساب مختلف.`,
          };
        }

        if (request.quantity > balance.available) {
          this.logger.warn(
            `⚡ Adjusting SELL quantity for ${request.symbol}: requested ${request.quantity} but only ${balance.available} ${balance.currency} available (${balance.walletType} wallet)`,
          );

          // Log the adjustment for audit purposes
          if (userId) {
            await this.auditService.log({
              userId,
              action: 'ORDER_QUANTITY_ADJUSTED',
              resource: 'trading',
              details: JSON.stringify({
                symbol: request.symbol,
                requestedQuantity: request.quantity,
                availableBalance: balance.available,
                walletType: balance.walletType,
                adjustedQuantity: balance.available,
                reason: 'Insufficient balance on exchange',
              }),
            });
          }

          // Use the available balance instead of the requested quantity
          // Apply a small buffer (99.5%) to account for rounding/fee variations
          const adjustedQuantity = Math.floor(balance.available * 0.995 * 10000) / 10000;

          if (adjustedQuantity <= 0) {
            return {
              success: false,
              error: `رصيد ${balance.currency} غير كافٍ: متاح ${balance.available}، مطلوب ${request.quantity}`,
            };
          }

          // Update the request with the adjusted quantity
          request.quantity = adjustedQuantity;
        }
      }

      let result: any;

      switch (request.type) {
        case 'MARKET':
          // Pass client_order_id to Alpaca if idempotencyKey is provided
          const params: any = {};
          if (request.idempotencyKey) {
            if (exchangeName.toLowerCase() === 'alpaca') {
              params.client_order_id = request.idempotencyKey;
            } else {
              params.idempotencyKey = request.idempotencyKey;
            }
          }

          result = await exchange.createMarketOrder(
            request.symbol,
            request.side.toLowerCase(),
            request.quantity,
            undefined,
            params,
          );
          break;

        case 'LIMIT':
          if (!request.price) {
            return {
              success: false,
              error: 'سعر الحد مطلوب للطلبات المحددة',
            };
          }
          
          const limitParams: any = {};
          if (request.idempotencyKey) {
            if (exchangeName.toLowerCase() === 'alpaca') {
              limitParams.client_order_id = request.idempotencyKey;
            } else {
              limitParams.idempotencyKey = request.idempotencyKey;
            }
          }

          result = await exchange.createLimitOrder(
            request.symbol,
            request.side.toLowerCase(),
            request.quantity,
            request.price,
            limitParams,
          );
          break;

        default:
          return {
            success: false,
            error: `نوع الطلب "${request.type}" غير مدعوم`,
          };
      }

      // V236: Place REAL Stop-Loss and Take-Profit orders on Binance (V1 path).
      // Same logic as binance.adapter.ts — after market order fills, place
      // STOP_LOSS_LIMIT and TAKE_PROFIT_LIMIT as separate exchange orders.
      // Non-blocking: if placement fails, PositionMonitor (V228) is the fallback.
      if (request.stopLoss && request.stopLoss > 0) {
        try {
          const closeSide = request.side === 'BUY' ? 'sell' : 'buy';
          await exchange.createOrder(
            request.symbol,
            'STOP_LOSS_LIMIT',
            closeSide,
            request.quantity,
            request.stopLoss,
            { stopPrice: request.stopLoss, type: 'STOP_LOSS_LIMIT' },
          );
          this.logger.log(`🛡️ V236: STOP_LOSS_LIMIT placed at ${request.stopLoss} for ${request.symbol}`);
        } catch (slErr: any) {
          this.logger.warn(`⚠️ V236: STOP_LOSS_LIMIT failed for ${request.symbol}: ${slErr.message} — PositionMonitor fallback active`);
        }
      }
      if (request.takeProfit && request.takeProfit > 0) {
        try {
          const closeSide = request.side === 'BUY' ? 'sell' : 'buy';
          await exchange.createOrder(
            request.symbol,
            'TAKE_PROFIT_LIMIT',
            closeSide,
            request.quantity,
            request.takeProfit,
            { stopPrice: request.takeProfit, type: 'TAKE_PROFIT_LIMIT' },
          );
          this.logger.log(`🎯 V236: TAKE_PROFIT_LIMIT placed at ${request.takeProfit} for ${request.symbol}`);
        } catch (tpErr: any) {
          this.logger.warn(`⚠️ V236: TAKE_PROFIT_LIMIT failed for ${request.symbol}: ${tpErr.message} — PositionMonitor fallback active`);
        }
      }

      return {
        success: true,
        exchangeOrderId: result.id,
        filledQuantity: result.filled || 0,
        averagePrice: result.average || result.price,
        fee: result.fee?.cost,
        feeCurrency: result.fee?.currency,
      };
    } catch (error: any) {
      const message = error.message || 'Unknown error';

      // Parse common CCXT errors
      if (message.includes('Insufficient')) {
        return { success: false, error: 'رصيد غير كافي لتنفيذ الطلب' };
      }
      if (message.includes('Invalid order')) {
        return {
          success: false,
          error: 'طلب غير صالح — تحقق من الكمية والسعر',
        };
      }
      if (message.includes('Rate limit')) {
        return {
          success: false,
          error: 'تم تجاوز حد الطلبات — حاول مرة أخرى بعد قليل',
        };
      }
      if (message.includes('Network')) {
        return {
          success: false,
          error: 'خطأ في الاتصال بالبورصة — تحقق من الإنترنت',
        };
      }

      return {
        success: false,
        error: `خطأ في التنفيذ: ${message}`,
      };
    }
  }

  /**
   * FIX: Convert a standard trading symbol to the exchange-specific format.
   *
   * Internal symbols use CCXT format: "BTC/USDT", "ETH/USD", "AAPL"
   * But exchanges have different requirements:
   *   - Alpaca: "BTCUSDT" (no slash), "AAPL" (stocks stay the same)
   *   - Binance: "BTC/USDT" (CCXT format, handled by ccxt library)
   *
   * This function converts the internal symbol to the format expected by
   * the exchange. The `exchangeSymbol` field is stored on Position records
   * so that exchange reconciliation (exchange-sync) can look up the position
   * by the exchange's own symbol format.
   */
  private _toAlpacaSymbol(symbol: string, exchangeName: string): string {
    if (exchangeName === 'alpaca' || exchangeName === 'alpaca_paper') {
      // Alpaca uses no slash: "BTC/USDT" → "BTCUSDT", "AAPL" → "AAPL"
      return symbol.replace('/', '');
    }
    // Binance and other CCXT exchanges use the slash format as-is
    return symbol;
  }

  /**
   * Update or create position after order execution
   *
   * FIX: Race condition prevention — Two concurrent orders for the same
   * symbol could both find no existing position and create duplicates.
   * Solution: Use "try update first, create if not found" pattern within
   * a serialized transaction. This ensures only one position is created
   * even under concurrent requests.
   */
  private async _updatePosition(
    userId: string,
    order: any,
    request: PlaceOrderRequest,
    execution: any,
    tx?: any,
  ) {
    const filledQty = execution.filledQuantity || 0;
    const fillPrice = execution.averagePrice || (order.price ? Number(order.price) : 0);

    if (filledQty <= 0) return;

    const executeUpdate = async (db: any) => {
      // Get exchange name from credential (use transaction client for consistency)
      const credential = await db.exchangeCredential.findUnique({
        where: { id: request.credentialId },
      });
      const exchangeName = credential?.exchange || 'unknown';

      const side = request.side as 'BUY' | 'SELL';

      // V350 CRITICAL FIX: REMOVE averaging entirely.
      //
      // PROBLEM: When user had an OPEN BUY position on BTC/USDT (credentialId=A)
      // and opened another BUY on BTC/USDT (same credentialId=A), the new order
      // was AVERAGED into the existing position — quantity was added, entryPrice
      // was averaged, but NO new position was created. The user would see only
      // ONE position with updated quantity — they could NOT see the second trade
      // as a separate entry with its own ID, SL, TP, and P&L.
      //
      // The user wants MT5 ticket model: each order = separate position with
      // its own ID. This matches V250's stated intent: "Each order creates a
      // SEPARATE position (like MT5 tickets)".
      //
      // FIX: Remove the existingPosition lookup and averaging entirely. Always
      // create a new position. The cooldown check still runs (per-credential).
      //
      // V349 kept the averaging "for backward compatibility" — but the user
      // explicitly wants each trade to be separate. Removing it now.
      //
      // (No findFirst lookup needed — always create new position below)

      {
        // ═══════════════════════════════════════════════════════════════════
        // V222 BULLETPROOF: DB-level cooldown — block ALL positions on a
        // symbol that was closed within the last 15 minutes, REGARDLESS of
        // direction, source, or which code path opened/closed the position.
        //
        // This is the FINAL safety net. Even if:
        //   - Redis is down (symbol-lock keys not set/read)
        //   - OrderDispatcher checks were bypassed
        //   - SmartExecutor cooldown check failed
        //   - forceClosePosition didn't set symbol-lock
        //   - MT5 sync closed the position without any cooldown
        // This DB check WILL prevent flip-flop trades.
        // ═══════════════════════════════════════════════════════════════════
        if (request.source !== "user_manual") {
          const COOLDOWN_MINUTES = 15;
          // V349: Filter cooldown by credentialId — a close on credential A (paper)
          // should NOT block a new open on credential B (MT5) for the same symbol.
          // Previously this was a global block per user+symbol, which prevented
          // multi-account users from trading the same symbol on different accounts.
          const recentlyClosed = await db.position.findFirst({
            where: {
              userId,
              symbol: request.symbol,
              status: { in: ['CLOSED', 'LIQUIDATED'] },
              closedAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
              credentialId: request.credentialId, // V349: per-credential cooldown
            },
            orderBy: { closedAt: 'desc' },
          });
          if (recentlyClosed) {
            const closedAgo = Math.round((Date.now() - new Date(recentlyClosed.closedAt!).getTime()) / 60000);
            this.logger.warn(
              `🛡️ V222 DB-COOLDOWN: BLOCKED ${side} on ${request.symbol} — ` +
              `position closed ${closedAgo} min ago (cooldown: ${COOLDOWN_MINUTES} min).`
            );
            throw new Error(
              `BLOCKED_BY_COOLDOWN: تم إغلاق مركز على ${request.symbol} قبل ${closedAgo} دقيقة — ` +
              `انتظر ${COOLDOWN_MINUTES - closedAgo} دقيقة قبل فتح مركز جديد`
            );
          }
        }

        // V250: REMOVED duplicate-position check in _updatePosition.
        // A professional trading platform MUST allow multiple positions on
        // the same symbol (averaging, pyramiding, grid, hedging).
        // V238 removed this from controllers — but forgot this check
        // inside TradingService._updatePosition.
        // Each order creates a SEPARATE position (like MT5 tickets).
        //
        // V350: Also removed the P2002 catch that was averaging on race
        // condition. Position table has no @@unique constraint, so P2002
        // should never fire. If it does, let it throw — don't silently
        // average into an existing position.

        // Open new position
        const { stopLoss, takeProfit } =
          this.unifiedRisk.getDefaultLevels(fillPrice, side);

        // CRITICAL FIX: Use SL/TP from the request (brief) if provided.
        // Previously, takeProfit was always overwritten with the default level,
        // ignoring the brief's calculated TP. Only fall back to defaults if not set.
        const defaultLevels = this.unifiedRisk.getDefaultLevels(fillPrice, side);
        const finalStopLoss = request.stopLoss ?? defaultLevels.stopLoss;
        const finalTakeProfit = request.takeProfit ?? defaultLevels.takeProfit;

        // V342 FIX: Capture the created position ID directly from create()
        // V350: Always create a NEW position — never average into existing.
        const createdPosition = await db.position.create({
          data: {
            userId,
            credentialId: request.credentialId,
            exchange: exchangeName,
            symbol: request.symbol,
            exchangeSymbol: this._toAlpacaSymbol(request.symbol, exchangeName),
            side,
            status: 'OPEN',
            quantity: filledQty,
            entryPrice: fillPrice,
            currentPrice: fillPrice,
            highestPrice: fillPrice,
            lowestPrice: fillPrice,
            stopLoss: finalStopLoss,
            takeProfit: finalTakeProfit,
            source:  request.source || (exchangeName === 'paper-trading' ? 'auto_paper' : 'user_manual'),
            timeframe: request.timeframe || null, // V204: Persist timeframe for position-monitor MAX_HOLDING
          },
          select: { id: true }, // V342: Return the ID directly
        });

        this.logger.log(
          `📊 V350: Created NEW position ${createdPosition.id.slice(0, 12)}... ` +
          `for ${side} ${filledQty} ${request.symbol} @ ${fillPrice} ` +
          `(credential ${request.credentialId.slice(0, 8)}..., source: ${request.source || 'user_manual'})`
        );

        // V339: Log OPEN event — position was created via TradingService
        if (TradeLifecycleLogger.getInstance()) {
          try {
            await TradeLifecycleLogger.getInstance()?.log({
              positionId: createdPosition.id, // V342: Use the actual ID, not a search
              userId,
              eventType: 'OPEN',
              module: 'trading.service',
              reason: `Position opened: ${side} ${request.symbol} @ ${fillPrice}`,
              price: fillPrice,
              highestPrice: fillPrice,
              lowestPrice: fillPrice,
              metadata: {
                symbol: request.symbol,
                side,
                quantity: filledQty,
                entryPrice: fillPrice,
                stopLoss: finalStopLoss,
                takeProfit: finalTakeProfit,
                source: request.source,
                exchange: exchangeName,
              },
            });
          } catch (logErr: any) {
            this.logger.warn(`V339: Failed to log OPEN event: ${logErr.message}`);
          }
        }
      }
    };

    // Always use a transaction with serializable isolation to prevent race conditions.
    // If already in a transaction, reuse it; otherwise create a new one.
    if (tx) {
      return executeUpdate(tx);
    } else {
      return this.prisma.$transaction(async (innerTx) => executeUpdate(innerTx));
    }
  }

  // ── Diagnostic Methods (READ-ONLY — no data modification) ──

  /**
   * DIAGNOSTIC: Check Trade table columns
   * Returns list of column names in the Trade table.
   * READ-ONLY — only SELECT queries.
   */
  async diagnoseTradeTable(): Promise<string[]> {
    const columns = await this.prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Trade' AND table_schema = 'public'
      ORDER BY ordinal_position
    `;
    return (columns as any[]).map((c: any) => c.column_name);
  }

  /**
   * DIAGNOSTIC: Check which migrations have been applied
   * READ-ONLY — only SELECT queries.
   */
  async diagnoseMigrations(): Promise<any[]> {
    const migrations = await this.prisma.$queryRaw`
      SELECT migration_name, finished_at, logs
      FROM _prisma_migrations
      ORDER BY started_at DESC
      LIMIT 20
    `;
    return (migrations as any[]).map((m: any) => ({
      name: m.migration_name,
      finishedAt: m.finished_at?.toISOString?.() || m.finished_at,
      success: !m.logs || m.logs.length === 0,
      hasError: m.logs && m.logs.length > 0,
      errorPreview: m.logs ? String(m.logs).substring(0, 200) : null,
    }));
  }

  /**
   * DIAGNOSTIC: Check trade counts for a user
   * READ-ONLY — only SELECT queries.
   */
  async diagnoseTradeCounts(userId: string): Promise<any> {
    // Try with Prisma first (includes credentialId in SELECT)
    try {
      const totalTrades = await this.prisma.trade.count({ where: { userId } });
      const tradesWithCred = await this.prisma.trade.count({
        where: { userId, credentialId: { not: null } },
      });
      const tradesWithoutCred = await this.prisma.trade.count({
        where: { userId, credentialId: null },
      });
      return { totalTrades, tradesWithCred, tradesWithoutCred, queryMethod: 'prisma' };
    } catch (err: any) {
      // If Prisma fails (column missing), try raw SQL without credentialId
      try {
        const result = await this.prisma.$queryRaw`
          SELECT
            COUNT(*) as "totalTrades",
            COUNT("credentialId") as "tradesWithCred",
            COUNT(*) - COUNT("credentialId") as "tradesWithoutCred"
          FROM "Trade" WHERE "userId" = ${userId}
        `;
        const row = (result as any[])[0];
        return {
          totalTrades: Number(row?.totalTrades || 0),
          tradesWithCred: Number(row?.tradesWithCred || 0),
          tradesWithoutCred: Number(row?.tradesWithoutCred || 0),
          queryMethod: 'raw_sql_fallback',
          prismaError: err.message?.substring(0, 200),
        };
      } catch (rawErr: any) {
        return {
          totalTrades: 'QUERY_FAILED',
          prismaError: err.message?.substring(0, 200),
          rawError: rawErr.message?.substring(0, 200),
        };
      }
    }
  }

  /**
   * DIAGNOSTIC: Check position counts for a user
   * READ-ONLY — only SELECT queries.
   */
  async diagnosePositionCounts(userId: string): Promise<any> {
    const openPositions = await this.prisma.position.count({
      where: { userId, status: 'OPEN' },
    });
    const closedPositions = await this.prisma.position.count({
      where: { userId, status: { in: ['CLOSED', 'LIQUIDATED'] } },
    });

    // Get distinct credentialIds for ALL positions
    const positionsByCred = await this.prisma.position.groupBy({
      by: ['credentialId'],
      where: { userId },
      _count: { id: true },
    });

    // Get distinct credentialIds for OPEN positions only
    const openByCred = await this.prisma.position.groupBy({
      by: ['credentialId'],
      where: { userId, status: 'OPEN' },
      _count: { id: true },
    });

    // Get actual open position details (symbol, credentialId, side)
    const openPositionDetails = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
      select: { id: true, symbol: true, side: true, credentialId: true, exchange: true },
    });

    return {
      openPositions,
      closedPositions,
      positionsByCredential: positionsByCred.map((g: any) => ({
        credentialId: g.credentialId?.substring(0, 12) + '...' || 'NULL',
        count: g._count.id,
      })),
      openPositionsByCredential: openByCred.map((g: any) => ({
        credentialId: g.credentialId?.substring(0, 12) + '...' || 'NULL',
        count: g._count.id,
      })),
      openPositionDetails: openPositionDetails.map((p: any) => ({
        id: p.id.substring(0, 12) + '...',
        symbol: p.symbol,
        side: p.side,
        exchange: p.exchange,
        credentialId: p.credentialId?.substring(0, 12) + '...' || 'NULL',
      })),
    };
  }

  /**
   * DIAGNOSTIC: Check user's credentials and activeCredentialId
   * READ-ONLY — only SELECT queries.
   */
  async diagnoseCredentials(userId: string): Promise<any> {
    const credentials = await this.prisma.exchangeCredential.findMany({
      where: { userId },
      select: {
        id: true,
        exchange: true,
        isValid: true,
        testnet: true,
      },
    });

    // Check Setting table for activeCredentialId
    let activeCredentialId: string | null = null;
    let activeCredentialSource: string = 'NOT_FOUND';
    try {
      const setting = await this.prisma.setting.findFirst({
        where: { key: `user:${userId}:activeCredentialId` },
      });
      if (setting?.value) {
        activeCredentialId = setting.value;
        activeCredentialSource = 'Setting table';
      }
    } catch (err: any) {
      activeCredentialSource = `ERROR: ${err.message?.substring(0, 100)}`;
    }

    // Check if the activeCredentialId matches any credential
    const activeCredExists = activeCredentialId
      ? credentials.some((c: any) => c.id === activeCredentialId)
      : null;
    const activeCredExchange = activeCredentialId
      ? credentials.find((c: any) => c.id === activeCredentialId)?.exchange || 'UNKNOWN'
      : null;

    return {
      totalCredentials: credentials.length,
      credentials: credentials.map((c: any) => ({
        id: c.id.substring(0, 12) + '...',
        fullId: c.id,
        exchange: c.exchange,
        isValid: c.isValid,
        testnet: c.testnet,
      })),
      activeCredentialId: activeCredentialId ? activeCredentialId.substring(0, 12) + '...' : null,
      activeCredentialFull: activeCredentialId,
      activeCredentialExists: activeCredExists,
      activeCredentialExchange: activeCredExchange,
      activeCredentialSource,
    };
  }

  /**
   * DIAGNOSTIC: Test the exact API queries used by the frontend
   * This tests getOpenPositions, getClosedPositions, and getTradeHistory
   * with the user's activeCredentialId to see if they return data.
   */
  async diagnoseApiQueries(userId: string): Promise<any> {
    const results: any = {};

    // Step 1: Get activeCredentialId from settings (key-value pattern)
    let activeCredentialId: string | null = null;
    try {
      const setting = await this.prisma.setting.findFirst({
        where: { key: `user:${userId}:activeCredentialId` },
      });
      activeCredentialId = setting?.value || null;
      results.activeCredentialId = activeCredentialId
        ? `${activeCredentialId.slice(0, 12)}...`
        : null;
      results.activeCredentialIdFull = activeCredentialId;
    } catch (err: any) {
      results.activeCredentialId = `ERROR: ${err.message}`;
    }

    // Step 2: Test getOpenPositions query (exact same as the real method)
    try {
      // Without credentialId
      const allOpen = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      results.openPositionsAll = allOpen.length;
      results.openPositionsAllDetails = allOpen.map(p => ({
        id: `${p.id.slice(0, 12)}...`,
        symbol: p.symbol,
        side: p.side,
        exchange: p.exchange,
        credentialId: `${p.credentialId.slice(0, 12)}...`,
        entryPrice: p.entryPrice.toNumber(),
        quantity: p.quantity.toNumber(),
      }));

      // With credentialId (same as getOpenPositions does)
      if (activeCredentialId) {
        const whereWithCred: any = { userId, status: 'OPEN', credentialId: activeCredentialId };
        const filteredOpen = await this.prisma.position.findMany({
          where: whereWithCred,
          orderBy: { openedAt: 'desc' },
        });
        results.openPositionsWithCred = filteredOpen.length;
        results.openPositionsWithCredDetails = filteredOpen.map(p => ({
          id: `${p.id.slice(0, 12)}...`,
          symbol: p.symbol,
          side: p.side,
          exchange: p.exchange,
          credentialId: `${p.credentialId.slice(0, 12)}...`,
        }));

        // V212: Removed OR null clause — Position.credentialId is NOT NULL, so Prisma rejects { credentialId: null }.
        // Direct credentialId filter is the correct approach for Position queries.
      }
    } catch (err: any) {
      results.openPositionsError = err.message;
    }

    // Step 3: Test getClosedPositions query
    try {
      const allClosed = await this.prisma.position.findMany({
        where: { userId, status: { in: ['CLOSED', 'LIQUIDATED'] } },
        orderBy: { closedAt: 'desc' },
        take: 5,
      });
      results.closedPositionsAll = (await this.prisma.position.count({
        where: { userId, status: { in: ['CLOSED', 'LIQUIDATED'] } },
      }));

      if (activeCredentialId) {
        // V212: Position.credentialId is NOT NULL — use direct filter, not OR with null
        const whereWithCred: any = {
          userId,
          status: { in: ['CLOSED', 'LIQUIDATED'] },
          credentialId: activeCredentialId,
        };
        const filteredClosed = await this.prisma.position.findMany({
          where: whereWithCred,
          orderBy: { closedAt: 'desc' },
          take: 5,
        });
        results.closedPositionsWithCred = (await this.prisma.position.count({ where: whereWithCred }));
        results.closedPositionsWithCredSample = filteredClosed.map(p => ({
          id: `${p.id.slice(0, 12)}...`,
          symbol: p.symbol,
          exchange: p.exchange,
          credentialId: `${p.credentialId.slice(0, 12)}...`,
        }));
      }
    } catch (err: any) {
      results.closedPositionsError = err.message;
    }

    // Step 4: Test getTradeHistory query
    try {
      const allTradesCount = await this.prisma.trade.count({ where: { userId } });
      results.tradesAll = allTradesCount;

      if (activeCredentialId) {
        const whereWithCred: any = {
          userId,
          OR: [{ credentialId: activeCredentialId }, { credentialId: null }],
        };
        const filteredTradesCount = await this.prisma.trade.count({ where: whereWithCred });
        results.tradesWithCred = filteredTradesCount;

        // Also test strict filtering (without OR null)
        const strictCount = await this.prisma.trade.count({
          where: { userId, credentialId: activeCredentialId },
        });
        results.tradesStrictCred = strictCount;
      }
    } catch (err: any) {
      results.tradesError = err.message;
    }

    // Step 5: Test calling the ACTUAL getOpenPositions method
    try {
      const actualOpen = await this.getOpenPositions(userId, activeCredentialId || undefined);
      results.actualGetOpenPositionsCount = actualOpen.length;
      results.actualGetOpenPositionsSample = actualOpen.slice(0, 3).map((p: any) => ({
        id: `${(p.id || '').slice(0, 12)}...`,
        symbol: p.symbol,
        side: p.side,
        exchange: p.exchange,
        credentialId: p.credentialId ? `${p.credentialId.slice(0, 12)}...` : 'MISSING',
      }));
    } catch (err: any) {
      results.actualGetOpenPositionsError = err.message;
    }

    return results;
  }

  /**
   * V213 DIAGNOSTIC: Check Agent position MAX_HOLDING settings
   * Returns all open Agent positions with their source, timeframe, and calculated
   * maxHoldingMs — critical for diagnosing why Agent positions close at 4h instead of 48h.
   */
  async diagnoseAgentMaxHolding(userId: string): Promise<any> {
    const results: any = { userId, timestamp: new Date().toISOString() };

    // Step 1: Get ALL open positions (not just agent)
    try {
      const allOpen = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
      });
      results.totalOpenPositions = allOpen.length;

      // Step 2: Analyze each position
      results.positions = allOpen.map(p => {
        const isAgent = p.source === 'agent';
        const isSmartExecutor = p.source === 'smart_executor';
        const timeframe = (p as any).timeframe || null;
        const holdingMs = Date.now() - new Date(p.openedAt).getTime();
        const holdingHours = (holdingMs / (60 * 60 * 1000)).toFixed(1);
        const H = 60 * 60 * 1000;

        // Calculate maxHoldingMs using same logic as position-monitor
        let maxHoldingMs: number;
        let maxHoldingReason: string;

        if (isAgent) {
          maxHoldingMs = 48 * H;
          maxHoldingReason = 'Agent → 48h';
        } else if (!timeframe) {
          maxHoldingMs = 8 * H;
          maxHoldingReason = 'No timeframe → 8h default';
        } else {
          const tf = timeframe.toUpperCase();
          if (tf === 'M1' || tf === 'M5') { maxHoldingMs = 4 * H; maxHoldingReason = `${tf} → 4h`; }
          else if (tf === 'M15' || tf === 'M30') { maxHoldingMs = 12 * H; maxHoldingReason = `${tf} → 12h`; }
          else if (tf === 'H1' || tf === 'H2' || tf === 'H4') { maxHoldingMs = 48 * H; maxHoldingReason = `${tf} → 48h`; }
          else if (tf === 'D1' || tf === 'D3') { maxHoldingMs = 7 * 24 * H; maxHoldingReason = `${tf} → 7d`; }
          else if (tf === 'W1' || tf === 'W2') { maxHoldingMs = 14 * 24 * H; maxHoldingReason = `${tf} → 14d`; }
          else { maxHoldingMs = 8 * H; maxHoldingReason = `Unknown TF ${tf} → 8h fallback`; }
        }

        const maxHoldingHours = (maxHoldingMs / (60 * 60 * 1000)).toFixed(0);
        const willCloseSoon = holdingMs > maxHoldingMs * 0.8; // 80% of max holding

        return {
          id: `${p.id.slice(0, 12)}...`,
          symbol: p.symbol,
          side: p.side,
          exchange: p.exchange,
          source: p.source,
          isAgent,
          isSmartExecutor,
          timeframe: timeframe || 'NULL',
          openedAt: p.openedAt,
          holdingHours: `${holdingHours}h`,
          maxHoldingHours: `${maxHoldingHours}h`,
          maxHoldingReason,
          willCloseSoon,
          overMaxHolding: holdingMs > maxHoldingMs,
          stopLoss: p.stopLoss?.toNumber() || null,
          takeProfit: p.takeProfit?.toNumber() || null,
          entryPrice: p.entryPrice?.toNumber(),
          currentPrice: p.currentPrice?.toNumber() || null,
        };
      });

      // Step 3: Summary
      const agentPositions = allOpen.filter(p => p.source === 'agent');
      const smartPositions = allOpen.filter(p => p.source === 'smart_executor');
      const otherPositions = allOpen.filter(p => p.source !== 'agent' && p.source !== 'smart_executor');

      results.summary = {
        agentPositions: agentPositions.length,
        smartExecutorPositions: smartPositions.length,
        otherPositions: otherPositions.length,
        agentPositionsWithTimeframe: agentPositions.filter(p => (p as any).timeframe).length,
        agentPositionsWithoutTimeframe: agentPositions.filter(p => !(p as any).timeframe).length,
      };

      // Step 4: Check recent closed positions for TIME_EXPIRED pattern
      const recentClosed = await this.prisma.position.findMany({
        where: {
          userId,
          status: { in: ['CLOSED', 'LIQUIDATED'] },
          source: 'agent',
          closedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { closedAt: 'desc' },
        take: 10,
      });

      results.recentAgentCloses = recentClosed.map(p => {
        const holdMs = p.closedAt
          ? new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()
          : 0;
        return {
          symbol: p.symbol,
          side: p.side,
          closeReason: p.closeReason,
          holdingTime: `${(holdMs / (60 * 60 * 1000)).toFixed(1)}h`,
          openedAt: p.openedAt,
          closedAt: p.closedAt,
          pnl: p.realizedPnl?.toNumber() || 0,
          timeframe: (p as any).timeframe || 'NULL',
        };
      });

    } catch (err: any) {
      results.error = err.message;
    }

    return results;
  }

  /**
   * V334: Backfill NULL credentialId on Trade records for a user.
   *
   * Retroactively assigns a credentialId to NULL trades by:
   *   1. Copying from the parent Position (via positionId) — most accurate
   *   2. Falling back to the user's active credential (from Setting table)
   *   3. Falling back to the user's oldest valid ExchangeCredential
   *
   * @param userId  The user whose trades should be backfilled
   * @param apply   If false (default), dry-run — returns what WOULD be updated.
   *                If true, actually writes the updates to the DB.
   * @returns       Report with counts and per-trade details
   */
  async backfillTradeCredentials(userId: string, apply: boolean = false): Promise<any> {
    const results: any = {
      userId,
      timestamp: new Date().toISOString(),
      mode: apply ? 'APPLY' : 'DRY_RUN',
      totalNullTrades: 0,
      updated: 0,
      skipped: 0,
      updates: [],
    };

    // 1. Find all NULL-credentialId trades for this user
    const nullTrades = await this.prisma.trade.findMany({
      where: { userId, credentialId: null },
      select: { id: true, positionId: true, symbol: true, executedAt: true, source: true },
      orderBy: { executedAt: 'asc' },
    });
    results.totalNullTrades = nullTrades.length;

    if (nullTrades.length === 0) {
      results.message = 'No NULL-credentialId trades found for this user.';
      return results;
    }

    // 2. Get user's ExchangeCredentials (oldest first)
    const userCreds = await this.prisma.exchangeCredential.findMany({
      where: { userId },
      select: { id: true, exchange: true, createdAt: true, isValid: true },
      orderBy: { createdAt: 'asc' },
    });

    if (userCreds.length === 0) {
      results.message = 'User has no ExchangeCredentials — cannot backfill.';
      results.skipped = nullTrades.length;
      return results;
    }

    // 3. Determine fallback credential: active setting → first valid → first
    let activeCredId: string | null = null;
    try {
      const activeSetting = await this.prisma.setting.findUnique({
        where: { key: `user:${userId}:activeCredentialId` },
        select: { value: true },
      });
      if (activeSetting?.value) {
        activeCredId = activeSetting.value.replace(/^"|"$/g, '');
      }
    } catch { /* Setting table may not exist */ }

    let fallbackCred: { id: string; exchange: string; isValid: boolean; createdAt: Date } | null = null;
    if (activeCredId) {
      fallbackCred = userCreds.find(c => c.id === activeCredId) || null;
    }
    if (!fallbackCred) {
      fallbackCred = userCreds.find(c => c.isValid) || userCreds[0] || null;
    }
    if (!fallbackCred) {
      // Should never happen since userCreds.length > 0 was checked above, but TS safety
      results.message = 'No fallback credential available.';
      results.skipped = nullTrades.length;
      return results;
    }
    const fallbackCredFinal = fallbackCred; // non-null alias for TS
    results.fallbackCredential = {
      id: fallbackCredFinal.id,
      exchange: fallbackCredFinal.exchange,
      source: activeCredId === fallbackCredFinal.id ? 'user_active_setting' :
              fallbackCredFinal.isValid ? 'first_valid' : 'oldest',
    };

    // 4. For each NULL trade, determine the credentialId
    const updates: Array<{
      tradeId: string;
      symbol: string;
      executedAt: Date;
      source: string | null;
      assignedCredentialId: string;
      assignmentSource: string;
    }> = [];
    for (const trade of nullTrades) {
      let credId: string | null = null;
      let assignmentSource = '';

      if (trade.positionId) {
        const position = await this.prisma.position.findUnique({
          where: { id: trade.positionId },
          select: { credentialId: true },
        });
        if (position?.credentialId) {
          credId = position.credentialId;
          assignmentSource = 'parent_position';
        }
      }

      if (!credId) {
        credId = fallbackCredFinal.id;
        assignmentSource = 'fallback';
      }

      updates.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        executedAt: trade.executedAt,
        source: trade.source,
        assignedCredentialId: credId,
        assignmentSource,
      });
    }

    // 5. Apply or report
    if (apply) {
      for (const u of updates) {
        await this.prisma.trade.update({
          where: { id: u.tradeId },
          data: { credentialId: u.assignedCredentialId },
        });
        results.updated++;
      }
      results.message = `Successfully updated ${results.updated} trades.`;
    } else {
      results.updated = updates.length;
      results.message = `DRY-RUN: Would update ${updates.length} trades. Call with apply=true to write.`;
    }

    results.updates = updates;
    return results;
  }

  /**
   * V336: Diagnostic — Pull precise per-trade data for TP gap analysis.
   *
   * Returns closed positions with:
   *   - trade_id, symbol, side, source
   *   - closeReason (raw from DB — NOT the portfolio's "AUTO/MANUAL/SL" mapping)
   *   - entryPrice, exitPrice, takeProfit, stopLoss
   *   - highestPrice, lowestPrice (the closest the market actually got to TP)
   *   - openedAt, closedAt, holdingMinutes
   *   - tpGapPercent: how far the best price was from TP (0% = TP was touched)
   *   - tpWasReachable: boolean — did highestPrice/lowestPrice actually reach TP?
   *
   * This is READ-ONLY — no data modification. Used to confirm/refute the
   * hypothesis that AUTO_STALE closes were happening while TP was within reach.
   *
   * @param userId  The user whose trades to analyze
   * @param limit   Max trades to return (default 50)
   * @param days    Only include trades from last N days (default 7)
   */
  async diagnoseTradeTpGaps(userId: string, limit: number = 50, days: number = 7): Promise<any> {
    // V336: Build where clause — days=0 means "all time" (no date filter)
    const where: any = {
      userId,
      status: { in: ['CLOSED', 'LIQUIDATED'] },
    };
    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // V336: Use OR to include positions where closedAt is NULL (legacy data)
      // but openedAt is within range. Some old positions may have closedAt=NULL.
      where.OR = [
        { closedAt: { gte: since } },
        { closedAt: null, openedAt: { gte: since } },
      ];
    }

    const positions = await this.prisma.position.findMany({
      where,
      select: {
        id: true,
        symbol: true,
        side: true,
        source: true,
        exchange: true,
        entryPrice: true,
        exitPrice: true,
        currentPrice: true,
        stopLoss: true,
        takeProfit: true,
        highestPrice: true,
        lowestPrice: true,
        realizedPnl: true,
        closeReason: true,
        openedAt: true,
        closedAt: true,
        timeframe: true,
      },
      orderBy: { closedAt: 'desc' },
      take: limit,
    });

    const trades = positions.map((p: any) => {
      const entry = Number(p.entryPrice);
      const exit = p.exitPrice ? Number(p.exitPrice) : (p.currentPrice ? Number(p.currentPrice) : null);
      const tp = p.takeProfit ? Number(p.takeProfit) : null;
      const sl = p.stopLoss ? Number(p.stopLoss) : null;
      const high = p.highestPrice ? Number(p.highestPrice) : null;
      const low = p.lowestPrice ? Number(p.lowestPrice) : null;
      // V336: Determine paper trading from source/exchange (no isPaperTrading column in Position)
      const isPaper = p.source === 'auto_paper' || p.exchange === 'paper-trading';

      // Determine the closest the market actually got to TP
      // For BUY: TP is above entry → highestPrice is the closest
      // For SELL: TP is below entry → lowestPrice is the closest
      let closestToTp: number | null = null;
      let tpGapPercent: number | null = null;
      let tpWasReached = false;

      if (tp !== null && entry > 0) {
        if (p.side === 'BUY') {
          // TP is above entry. highestPrice is the best the market reached.
          // If highestPrice is null, fall back to exitPrice (last known)
          closestToTp = high ?? exit ?? entry;
          // For BUY: tpWasReached when highestPrice >= TP
          tpWasReached = high !== null && high >= tp;
          // Gap: how far below TP was the highest price? (positive = didn't reach, negative = exceeded)
          tpGapPercent = ((tp - closestToTp) / entry) * 100;
        } else {
          // SELL: TP is below entry. lowestPrice is the best the market reached.
          closestToTp = low ?? exit ?? entry;
          tpWasReached = low !== null && low <= tp;
          // Gap: how far above TP was the lowest price? (positive = didn't reach)
          tpGapPercent = ((closestToTp - tp) / entry) * 100;
        }
      }

      // Similarly for SL
      let slWasReached = false;
      if (sl !== null && entry > 0) {
        if (p.side === 'BUY') {
          slWasReached = low !== null && low <= sl;
        } else {
          slWasReached = high !== null && high >= sl;
        }
      }

      const holdingMs = p.openedAt && p.closedAt
        ? new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()
        : 0;
      const holdingMinutes = Math.round(holdingMs / 60000);

      return {
        trade_id: p.id,
        symbol: p.symbol,
        side: p.side,
        source: p.source,
        exchange: p.exchange,
        isPaper,
        timeframe: p.timeframe,
        closeReason_raw: p.closeReason, // ← RAW from DB, no mapping
        entryPrice: entry,
        exitPrice: exit,
        takeProfit: tp,
        stopLoss: sl,
        highestPrice: high,
        lowestPrice: low,
        closestPriceToTp: closestToTp,
        tpGapPercent: tpGapPercent !== null ? Number(tpGapPercent.toFixed(3)) : null,
        tpWasReached,
        slWasReached,
        realizedPnl: p.realizedPnl ? Number(p.realizedPnl) : null,
        openedAt: p.openedAt,
        closedAt: p.closedAt,
        holdingMinutes,
      };
    });

    // Summary stats
    const summary = {
      totalTrades: trades.length,
      byCloseReason: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      tpReachedCount: 0,
      slReachedCount: 0,
      tpNotReachedButAutoClosed: 0,
      tpGapUnder1Percent: 0,
      tpGapUnder3Percent: 0,
      tpGapOver5Percent: 0,
      avgHoldingMinutes: 0,
    };

    for (const t of trades) {
      const reason = t.closeReason_raw || 'NULL/EMPTY';
      summary.byCloseReason[reason] = (summary.byCloseReason[reason] || 0) + 1;
      const src = t.source || 'NULL';
      summary.bySource[src] = (summary.bySource[src] || 0) + 1;

      if (t.tpWasReached) summary.tpReachedCount++;
      if (t.slWasReached) summary.slReachedCount++;

      // Trades closed by AUTO_STALE/AUTO_CLOSE/TIME_EXPIRED but TP was NOT reached
      const isAutoClose = /AUTO_STALE|AUTO_CLOSE|TIME_EXPIRED|STALE/i.test(reason);
      if (isAutoClose && !t.tpWasReached) {
        summary.tpNotReachedButAutoClosed++;
      }

      if (t.tpGapPercent !== null) {
        if (t.tpGapPercent < 1) summary.tpGapUnder1Percent++;
        else if (t.tpGapPercent < 3) summary.tpGapUnder3Percent++;
        else if (t.tpGapPercent > 5) summary.tpGapOver5Percent++;
      }
    }

    if (trades.length > 0) {
      summary.avgHoldingMinutes = Math.round(
        trades.reduce((s, t) => s + t.holdingMinutes, 0) / trades.length
      );
    }

    return {
      userId,
      generatedAt: new Date().toISOString(),
      filterDays: days,
      summary,
      trades,
    };
  }

  /**
   * V339 Phase 5: Price Integrity Check — verify highestPrice/lowestPrice consistency.
   *
   * For each closed position, asserts:
   *   - BUY: highestPrice >= entryPrice (price went up at some point)
   *   - SELL: lowestPrice <= entryPrice (price went down at some point)
   *   - highestPrice >= lowestPrice (always true)
   *   - If closeReason=STOP_LOSS: market actually breached SL (low <= SL for BUY, high >= SL for SELL)
   *   - If closeReason=TAKE_PROFIT: market actually reached TP (high >= TP for BUY, low <= TP for SELL)
   *
   * Returns violations — positions where the data is inconsistent.
   * If violations exist, historical data is NOT valid for backtesting.
   */
  async diagnosePriceIntegrity(userId: string, limit: number = 100, days: number = 30): Promise<any> {
    const where: any = {
      userId,
      status: { in: ['CLOSED', 'LIQUIDATED'] },
    };
    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      where.OR = [
        { closedAt: { gte: since } },
        { closedAt: null, openedAt: { gte: since } },
      ];
    }

    const positions = await this.prisma.position.findMany({
      where,
      select: {
        id: true, symbol: true, side: true, source: true,
        entryPrice: true, exitPrice: true, stopLoss: true, takeProfit: true,
        highestPrice: true, lowestPrice: true, closeReason: true,
        openedAt: true, closedAt: true,
      },
      orderBy: { closedAt: 'desc' },
      take: limit,
    });

    // V339: Explicit type — without it, TS infers never[] and rejects .push()
    const violations: Array<{
      positionId: string;
      symbol: string;
      side: string;
      source: string | null;
      closeReason: string;
      entryPrice: number;
      exitPrice: number | null;
      stopLoss: number | null;
      takeProfit: number | null;
      highestPrice: number | null;
      lowestPrice: number | null;
      openedAt: Date;
      closedAt: Date | null;
      issues: string[];
    }> = [];
    let checked = 0;

    for (const p of positions) {
      checked++;
      const entry = Number(p.entryPrice);
      const exit = p.exitPrice ? Number(p.exitPrice) : null;
      const sl = p.stopLoss ? Number(p.stopLoss) : null;
      const tp = p.takeProfit ? Number(p.takeProfit) : null;
      const high = p.highestPrice ? Number(p.highestPrice) : null;
      const low = p.lowestPrice ? Number(p.lowestPrice) : null;
      const reason = p.closeReason || '';

      // V339: Explicit string[] type — without it, TS infers never[] and rejects .push()
      const issues: string[] = [];

      // Check 1: highestPrice >= lowestPrice (always true)
      if (high !== null && low !== null && high < low) {
        issues.push(`highestPrice (${high}) < lowestPrice (${low}) — IMPOSSIBLE`);
      }

      // Check 2: highestPrice >= entryPrice (BUY) or lowestPrice <= entryPrice (SELL)
      if (p.side === 'BUY' && high !== null && high < entry) {
        issues.push(`BUY but highestPrice (${high}) < entry (${entry}) — price never went up`);
      }
      if (p.side === 'SELL' && low !== null && low > entry) {
        issues.push(`SELL but lowestPrice (${low}) > entry (${entry}) — price never went down`);
      }

      // Check 3: highestPrice == entryPrice (tracking bug — never updated)
      if (high !== null && high === entry) {
        issues.push(`highestPrice == entryPrice — tracking never updated (V338 bug)`);
      }
      if (low !== null && low === entry) {
        issues.push(`lowestPrice == entryPrice — tracking never updated (V338 bug)`);
      }

      // Check 4: STOP_LOSS consistency
      if (reason === 'STOP_LOSS') {
        if (p.side === 'BUY' && sl !== null && low !== null && low > sl) {
          issues.push(`STOP_LOSS close but lowestPrice (${low}) > SL (${sl}) — SL was NOT breached!`);
        }
        if (p.side === 'SELL' && sl !== null && high !== null && high < sl) {
          issues.push(`STOP_LOSS close but highestPrice (${high}) < SL (${sl}) — SL was NOT breached!`);
        }
      }

      // Check 5: TAKE_PROFIT consistency
      if (reason === 'TAKE_PROFIT') {
        if (p.side === 'BUY' && tp !== null && high !== null && high < tp) {
          issues.push(`TAKE_PROFIT close but highestPrice (${high}) < TP (${tp}) — TP was NOT reached!`);
        }
        if (p.side === 'SELL' && tp !== null && low !== null && low > tp) {
          issues.push(`TAKE_PROFIT close but lowestPrice (${low}) > TP (${tp}) — TP was NOT reached!`);
        }
      }

      // Check 6: exitPrice beyond SL/TP (slippage)
      if (exit !== null && sl !== null && reason === 'STOP_LOSS') {
        if (p.side === 'BUY' && exit < sl) {
          issues.push(`exitPrice (${exit}) < SL (${sl}) — negative slippage ${((sl - exit) / sl * 100).toFixed(3)}%`);
        }
        if (p.side === 'SELL' && exit > sl) {
          issues.push(`exitPrice (${exit}) > SL (${sl}) — negative slippage ${((exit - sl) / sl * 100).toFixed(3)}%`);
        }
      }

      if (issues.length > 0) {
        violations.push({
          positionId: p.id,
          symbol: p.symbol,
          side: p.side,
          source: p.source,
          closeReason: reason,
          entryPrice: entry,
          exitPrice: exit,
          stopLoss: sl,
          takeProfit: tp,
          highestPrice: high,
          lowestPrice: low,
          openedAt: p.openedAt,
          closedAt: p.closedAt,
          issues,
        });
      }
    }

    return {
      userId,
      generatedAt: new Date().toISOString(),
      checked,
      violationCount: violations.length,
      violationRate: checked > 0 ? (violations.length / checked * 100).toFixed(1) + '%' : '0%',
      violations: violations.slice(0, 50), // limit output
    };
  }
}
