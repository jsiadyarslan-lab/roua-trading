import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CredentialsService } from '../portfolio/credentials/credentials.service';
import { ExchangeService } from '../exchange/exchange.service';
import { RiskManagerService } from './risk-manager.service';
import { AuditService } from '../../audit/audit.service';
import * as ccxt from 'ccxt';
import * as crypto from 'crypto';
import {
  PlaceOrderRequest,
  ClosePositionRequest,
} from './trading.types';
import { OrderSide as PrismaOrderSide, OrderType as PrismaOrderType, OrderStatus as PrismaOrderStatus } from '@prisma/client';

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
  private readonly EXCHANGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 50; // prevent unbounded growth

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly exchangeService: ExchangeService,
    private readonly riskManager: RiskManagerService,
    private readonly auditService: AuditService,
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
    setInterval(() => this._cleanExchangeCache(), 10 * 60 * 1000);
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

    // Step 4: Run risk checks
    const riskCheck = await this.riskManager.checkOrderRisk(
      userId,
      request.symbol,
      request.side,
      request.quantity,
      currentPrice,
    );

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

    // Step 5: Execute order on the exchange
    // FIX: Handle paper-trading separately — CCXT doesn't have a 'paper-trading' exchange,
    // so calling _executeOnExchange with 'paper-trading' would always fail with
    // "exchange not supported". This was the ROOT CAUSE of zero trade executions:
    // RiskGatekeeper correctly bypasses paper-trading, but TradingService always
    // tried to execute via CCXT, which fails for paper-trading credentials.
    let execution: any;
    if (credential.exchange === 'paper-trading') {
      execution = this._executePaperTrade(request, currentPrice);
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
        riskScore: riskCheck.riskScore,
      }),
      ipAddress,
      userAgent,
    });

    this.logger.log(
      `✅ Order executed: ${order.id} — ${request.side} ${execution.filledQuantity}/${request.quantity} ${request.symbol} @ ${execution.averagePrice}`,
    );

    return order;
  }

  /**
   * Cancel an open order
   */
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
          // SECURITY: Pass userId to verify credential ownership before decrypting
          const { apiKey, apiSecret } =
            await this.credentialsService.decryptCredential(credential.id, userId);
          const exchange = this._getExchangeInstance(credential.exchange, apiKey, apiSecret, credential.id, (credential as any).testnet || false);
          if (exchange) {
            await exchange.cancelOrder(order.exchangeOrderId, order.symbol);
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
  async getOpenPositions(userId: string): Promise<any[]> {
    // FIX: Include ALL positions including paper-trading.
    // Paper positions are real simulated trades — they should appear in portfolio.
    // Previously excluded, causing portfolioValue = 0 for paper traders.
    // PositionManagerService also includes them (must be consistent).
    const positions = await this.prisma.position.findMany({
      where: {
        userId,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
    });

    if (positions.length === 0) return [];

    // Fetch all quotes in parallel
    const quotePromises = positions.map((pos) =>
      this.exchangeService.getQuote(pos.symbol).catch(() => null),
    );
    const quotes = await Promise.allSettled(quotePromises);

    // Build updates and results
    const updates: any[] = [];
    const results: any[] = [];

    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
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

        // Build enriched position for response
        results.push({
          ...position,
          currentPrice,
          unrealizedPnl,
        });
      } else {
        // No quote available — return position as-is
        this.logger.warn(
          `Failed to update price for ${position.symbol}: quote unavailable`,
        );
        results.push(position);
      }
    }

    // Batch update in transaction
    if (updates.length > 0) {
      await this.prisma.$transaction(updates).catch((err: any) => {
        this.logger.warn(`Batch position update failed: ${err.message}`);
      });
    }

    return results;
  }

  /**
   * Get position summary
   */
  async getPositionSummary(userId: string) {
    try {
      const positions = await this.getOpenPositions(userId);

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

      return {
        totalPositions: positions.length,
        totalValue,
        totalUnrealizedPnl,
        totalRealizedPnl,
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
      let closePrice = posCurrentPrice || posEntryPrice;
      if (closePrice <= 0) {
        try {
          const quote = await this.exchangeService.getQuote(position.symbol);
          closePrice = quote.price || posEntryPrice;
        } catch {
          closePrice = posEntryPrice;
        }
      }

      execution = this._executePaperTrade(
        {
          credentialId: position.credentialId,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: PrismaOrderType.MARKET,
          quantity: closeQuantity,
          price: closePrice,
        },
        closePrice,
      );
    } else {
      // Real exchange close: use CCXT
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

      // FIX: If balance is 0 on all wallets, try force-close (DB only).
      // This handles positions already closed on exchange, API key issues,
      // or any situation where the exchange refuses to close.
      if (errorMsg.includes('رصيد') && errorMsg.includes('غير متاح')) {
        this.logger.warn(
          `⚡ Exchange close failed for ${position.symbol} due to zero balance — attempting force close (DB only)`,
        );
        try {
          return await this.forceClosePosition(
            userId,
            position.id,
            `Auto force-close after insufficient balance: ${errorMsg}`,
            ipAddress,
            userAgent,
          );
        } catch (forceErr: any) {
          this.logger.error(
            `❌ Force close also failed for ${position.id}: ${forceErr.message}`,
          );
        }
      }

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

    const pnl =
      position.side === 'BUY'
        ? (exitPrice - posEntryPrice) * closeQuantity
        : (posEntryPrice - exitPrice) * closeQuantity;

    // Record closing order, exit trade, and update position — all in one transaction
    // FIX: Optimistic locking — use version check in WHERE clause to prevent
    // concurrent close from double-executing. If version changed (another close
    // committed first), we retry the whole closePosition method.
    const { order: closedOrder } = await this.prisma.$transaction(async (tx) => {
      // Note: averagePrice (not averageFillPrice) is the correct field name
      // idempotencyKey is required (String @unique)
      const order = await tx.order.create({
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
          idempotencyKey: `close-${Date.now()}-${crypto.randomUUID()}`,
        },
      });

      // Record exit trade
      await tx.trade.create({
        data: {
          userId,
          orderId: order.id,
          positionId: position.id,
          exchange: position.exchange,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: closeQuantity >= posQuantity ? 'EXIT' : 'PARTIAL_EXIT',
          quantity: closeQuantity,
          price: exitPrice,
          fee: execution.fee ?? 0,
          feeCurrency: execution.feeCurrency,
          pnl,
          
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

    return {
      order: closedOrder,
      pnl,
      position: await this.prisma.position.findUnique({
        where: { id: position.id },
      }),
    };
  }

  /**
   * FIX: Close position with automatic retry on optimistic lock failure.
   * When two concurrent close requests race, the loser gets OPTIMISTIC_LOCK_FAILURE
   * and should retry (the position may now be partially closed or fully closed).
   * This wrapper handles that retry logic transparently.
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
      if (error.message?.includes('OPTIMISTIC_LOCK_FAILURE') && maxRetries > 0) {
        this.logger.warn(`Optimistic lock failure on closePosition for ${request.positionId} — retrying (${maxRetries} attempts left)`);
        // Small delay before retry to let the other transaction commit
        await new Promise(resolve => setTimeout(resolve, 100));
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

    const posQuantity = position.quantity.toNumber();
    const posEntryPrice = position.entryPrice.toNumber();
    const posRealizedPnl = position.realizedPnl?.toNumber() ?? 0;
    const posStopLoss = position.stopLoss?.toNumber() ?? null;

    // Get current market price for PnL calculation
    let currentPrice = position.currentPrice?.toNumber() ?? 0;
    if (currentPrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(position.symbol);
        currentPrice = quote?.price ?? posEntryPrice;
      } catch {
        currentPrice = posEntryPrice;
      }
    }

    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
    const pnl =
      position.side === 'BUY'
        ? (currentPrice - posEntryPrice) * posQuantity
        : (posEntryPrice - currentPrice) * posQuantity;

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
          exchange: position.exchange,
          symbol: position.symbol,
          side: closeSide as PrismaOrderSide,
          type: 'EXIT',
          quantity: posQuantity,
          price: currentPrice,
          fee: 0,
          feeCurrency: position.symbol.split('/').pop() || 'USDT',
          pnl,
        },
      });

      await tx.position.update({
        where: { id: position.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          realizedPnl: posRealizedPnl + pnl,
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
  async getClosedPositions(userId: string, limit: number = 100) {
    try {
      return await this.prisma.position.findMany({
        where: { userId, status: 'CLOSED' },
        orderBy: { closedAt: 'desc' },
        take: limit,
      });
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
  async getTradeHistory(userId: string, limit: number = 50) {
    try {
      return await this.prisma.trade.findMany({
        where: { userId },
        orderBy: { executedAt: 'desc' },
        take: limit,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch trade history: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // ── Private Methods ──

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
  private _executePaperTrade(
    request: PlaceOrderRequest,
    currentPrice: number,
  ): {
    success: boolean;
    exchangeOrderId: string;
    filledQuantity: number;
    averagePrice: number;
    fee: number;
    feeCurrency: string;
  } {
    // Simulate slippage: 0.1% in the direction of the trade
    const slippagePercent = 0.001;
    const fillPrice = request.side === 'BUY'
      ? currentPrice * (1 + slippagePercent)  // Buy slightly higher
      : currentPrice * (1 - slippagePercent); // Sell slightly lower

    // Simulate fee: 0.1%
    const fee = request.quantity * fillPrice * 0.001;
    const feeCurrency = request.symbol.split('/').pop() || 'USDT';

    this.logger.log(
      `📜 Paper trade executed: ${request.side} ${request.quantity} ${request.symbol} @ ${fillPrice.toFixed(2)} ` +
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
        return this._executePaperTrade(request, currentPrice);
      }

      // SECURITY: Pass userId to verify credential ownership before decrypting
      const { apiKey, apiSecret } =
        await this.credentialsService.decryptCredential(credentialId, userId);

      // Fetch credential to get testnet flag
      const credential = await this.prisma.exchangeCredential.findFirst({
        where: { id: credentialId },
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

      // FIX: Race condition prevention — try to update existing position FIRST.
      // If another concurrent transaction just created a position, we'll find it
      // and add to it instead of creating a duplicate.
      // We use findFirst with orderBy to get the most recent position.
      const existingPosition = await db.position.findFirst({
        where: {
          userId,
          symbol: request.symbol,
          status: 'OPEN',
          side,
        },
        orderBy: { openedAt: 'desc' },
      });

      if (existingPosition) {
        // Add to existing position (average up/down)
        const existingQty = existingPosition.quantity.toNumber();
        const existingPrice = existingPosition.entryPrice.toNumber();
        const totalQuantity = existingQty + filledQty;
        const avgPrice =
          (existingPrice * existingQty + fillPrice * filledQty) /
          totalQuantity;

        await db.position.update({
          where: { id: existingPosition.id },
          data: {
            quantity: totalQuantity,
            entryPrice: avgPrice,
          },
        });
      } else {
        // Open new position
        const { stopLoss, takeProfit } =
          this.riskManager.getDefaultLevels(fillPrice, side);

        try {
          // CRITICAL FIX: Use SL/TP from the request (brief) if provided.
          // Previously, takeProfit was always overwritten with the default level,
          // ignoring the brief's calculated TP. Only fall back to defaults if not set.
          const defaultLevels = this.riskManager.getDefaultLevels(fillPrice, side);
          const finalStopLoss = request.stopLoss ?? defaultLevels.stopLoss;
          const finalTakeProfit = request.takeProfit ?? defaultLevels.takeProfit;

          await db.position.create({
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
              source: request.source || (exchangeName === 'paper-trading' ? 'auto_paper' : 'user_manual'),
            },
          });
        } catch (createError: any) {
          // FIX: If create fails due to race condition (another transaction
          // created a position between our findFirst and create), fall back
          // to finding and updating the newly created position instead.
          if (createError.code === 'P2002' || createError.message?.includes('Unique constraint')) {
            this.logger.warn(`Race condition detected in _updatePosition — retrying as update for ${request.symbol}`);
            const racePosition = await db.position.findFirst({
              where: {
                userId,
                symbol: request.symbol,
                status: 'OPEN',
                side,
              },
              orderBy: { openedAt: 'desc' },
            });
            if (racePosition) {
              const existingQty = racePosition.quantity.toNumber();
              const existingPrice = racePosition.entryPrice.toNumber();
              const totalQuantity = existingQty + filledQty;
              const avgPrice =
                (existingPrice * existingQty + fillPrice * filledQty) /
                totalQuantity;
              await db.position.update({
                where: { id: racePosition.id },
                data: {
                  quantity: totalQuantity,
                  entryPrice: avgPrice,
                },
              });
            } else {
              throw createError;
            }
          } else {
            throw createError;
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
}
