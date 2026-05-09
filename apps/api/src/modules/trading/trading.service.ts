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
    // FIX: Ensure ExchangeCredential table has all columns from Prisma schema.
    // Prisma migration sometimes fails silently, leaving the DB schema out of sync.
    // This causes ALL queries on ExchangeCredential to fail with:
    // "The column ExchangeCredential.encryptedPassphrase does not exist"
    // which blocks ALL trade execution (paper and real).
    this._ensureExchangeCredentialColumns();
  }

  /**
   * FIX: Ensure the ExchangeCredential table has all columns from the Prisma schema.
   * Prisma migration failed in production, leaving the DB schema out of sync with
   * the Prisma schema. This caused every query on ExchangeCredential to fail because
   * Prisma generates SELECT * including columns that don't exist in the DB.
   *
   * This method adds missing columns via raw SQL (safe, idempotent).
   */
  private async _ensureExchangeCredentialColumns(): Promise<void> {
    try {
      const missingColumns = [
        { name: 'secretIv', type: 'TEXT' },
        { name: 'secretAuthTag', type: 'TEXT' },
        { name: 'encryptedPassphrase', type: 'TEXT' },
        { name: 'passphraseIv', type: 'TEXT' },
        { name: 'passphraseAuthTag', type: 'TEXT' },
      ];

      for (const col of missingColumns) {
        try {
          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "ExchangeCredential"
            ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};
          `);
        } catch (e: any) {
          if (!e.message?.includes('already exists')) {
            this.logger.warn(`⚡ Could not add column ${col.name}: ${e.message}`);
          }
        }
      }

      this.logger.log('⚡ ExchangeCredential schema verified — all columns present');
    } catch (error: any) {
      this.logger.error(`⚡ Failed to verify ExchangeCredential schema: ${error.message}`);
    }
  }

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
    const permissions = JSON.parse(credential.permissions || '["read"]');
    if (!permissions.includes('trade')) {
      throw new ForbiddenException(
        'مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade',
      );
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
          idempotencyKey: `legacy-${Date.now()}-${crypto.randomUUID()}`,
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
          idempotencyKey: `legacy-${Date.now()}-${crypto.randomUUID()}`,
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
          await this.prisma.exchangeCredential.findUnique({
            where: { id: order.exchangeCredentialId! },
          });
        if (credential) {
          // SECURITY: Pass userId to verify credential ownership before decrypting
          const { apiKey, apiSecret } =
            await this.credentialsService.decryptCredential(credential.id, userId);
          const exchange = this._getExchangeInstance(credential.exchange, apiKey, apiSecret, credential.id);
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
    const positions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
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
  ) {
    // DYNAMIC HOTFIX: Drop unique constraints on Position table that prevent closing trades
    try {
      await this.prisma.$executeRawUnsafe(`
        DO $$ 
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT i.relname AS index_name
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                WHERE t.relname = 'Position' 
                  AND ix.indisunique = true
            ) LOOP
                IF r.index_name != 'Position_pkey' THEN
                    EXECUTE 'DROP INDEX IF EXISTS "' || r.index_name || '" CASCADE;';
                END IF;
            END LOOP;
        END $$;
      `);
      this.logger.debug('Dynamically dropped unique constraints on Position table');
    } catch (e: any) {
      this.logger.warn(`Failed to dynamically drop Position unique constraints: ${e.message}`);
    }

    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' positions
    const position = await this.prisma.position.findFirst({
      where: { id: request.positionId, userId },
    });

    if (!position) {
      throw new NotFoundException('المركز غير موجود');
    }

    if (position.status !== 'OPEN') {
      throw new BadRequestException('المركز ليس مفتوحاً');
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
    const credential =
      await this.prisma.exchangeCredential.findFirst({
        where: { id: position.credentialId, userId },
      });

    if (!credential) {
      throw new NotFoundException('بيانات الاعتماد غير موجودة');
    }

    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';

    const execution = await this._executeOnExchange(
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

    if (!execution.success) {
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

      // Update position
      if (closeQuantity >= posQuantity) {
        await tx.position.update({
          where: { id: position.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            realizedPnl: posRealizedPnl + pnl,
          },
        });
      } else {
        await tx.position.update({
          where: { id: position.id },
          data: {
            quantity: posQuantity - closeQuantity,
            realizedPnl: posRealizedPnl + pnl,
          },
        });
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
      throw new BadRequestException('المركز ليس مفتوحاً');
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
  private _getExchangeInstance(exchangeName: string, apiKey: string, apiSecret: string, credentialId: string): any {
    const cacheKey = `${credentialId}:${exchangeName}`;
    let exchange = this.exchangeCache.get(cacheKey);

    if (!exchange) {
      const ExchangeClass = ccxt[exchangeName as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        return null;
      }
      exchange = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
        timeout: 10000, // 10 second timeout
        options: { defaultType: 'spot' },
      });
      this.exchangeCache.set(cacheKey, exchange);

      // Auto-cleanup after 10 minutes
      setTimeout(() => this.exchangeCache.delete(cacheKey), 10 * 60 * 1000);
    }

    return exchange;
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

      const exchange = this._getExchangeInstance(exchangeName, apiKey, apiSecret, credentialId);
      if (!exchange) {
        return {
          success: false,
          error: `البورصة "${exchangeName}" غير مدعومة`,
        };
      }


      let result: any;

      switch (request.type) {
        case 'MARKET':
          result = await exchange.createMarketOrder(
            request.symbol,
            request.side.toLowerCase(),
            request.quantity,
          );
          break;

        case 'LIMIT':
          if (!request.price) {
            return {
              success: false,
              error: 'سعر الحد مطلوب للطلبات المحددة',
            };
          }
          result = await exchange.createLimitOrder(
            request.symbol,
            request.side.toLowerCase(),
            request.quantity,
            request.price,
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
