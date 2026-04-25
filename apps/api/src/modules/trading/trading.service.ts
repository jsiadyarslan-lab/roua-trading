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
import {
  PlaceOrderRequest,
  ClosePositionRequest,
  OrderSide,
  OrderType,
} from './trading.types';

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
 * Note: Order model uses Decimal for quantity, price, stopLoss, takeProfit,
 * filledQuantity, averagePrice, fee. When writing, pass as number/string
 * (Prisma accepts both). When reading, Decimal fields return Prisma.Decimal
 * objects — convert using Number() or .toNumber().
 * Position and Trade models still use Float types.
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

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
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: request.credentialId },
    });

    if (!credential || credential.userId !== userId) {
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
    let currentPrice = request.price;
    if (!currentPrice || request.type === 'MARKET') {
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
    const execution = await this._executeOnExchange(
      credential.exchange,
      credential.id,
      request,
    );

    if (!execution.success) {
      // Record the failed order
      // idempotencyKey is required (String @unique)
      const order = await this.prisma.order.create({
        data: {
          userId,
          exchangeCredentialId: request.credentialId,
          exchange: credential.exchange,
          symbol: request.symbol,
          side: request.side as any,
          type: request.type as any,
          status: 'REJECTED' as any,
          quantity: request.quantity,
          price: request.price ?? null,
          stopLoss: request.stopLoss ?? null,
          idempotencyKey: `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

    // Step 6: Record successful order
    // Note: averagePrice (not averageFillPrice) is the correct field name
    // idempotencyKey is required (String @unique)
    const order = await this.prisma.order.create({
      data: {
        userId,
        exchangeCredentialId: request.credentialId,
        exchange: credential.exchange,
        symbol: request.symbol,
        side: request.side as any,
        type: request.type as any,
        status:
          (execution.filledQuantity || 0) >= request.quantity
            ? 'FILLED' as any
            : 'PARTIALLY_FILLED' as any,
        quantity: request.quantity,
        price: request.price ?? null,
        stopLoss: request.stopLoss ?? null,
        filledQuantity: execution.filledQuantity || 0,
        averagePrice: execution.averagePrice,
        fee: execution.fee ?? null,
        feeCurrency: execution.feeCurrency ?? null,
        exchangeOrderId: execution.exchangeOrderId,
        idempotencyKey: `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });

    // Step 7: Update or open position
    await this._updatePosition(userId, order, request, execution);

    // Step 8: Record trade
    await this.prisma.trade.create({
      data: {
        userId,
        orderId: order.id,
        exchange: credential.exchange,
        symbol: request.symbol,
        side: request.side,
        type: 'ENTRY',
        quantity: execution.filledQuantity || 0,
        price: execution.averagePrice || currentPrice,
        fee: execution.fee,
        feeCurrency: execution.feeCurrency,
      },
    });

    // Step 9: If this was triggered by a signal, update signal status
    if (request.signalId) {
      await this.prisma.signal
        .update({
          where: { id: request.signalId },
          data: { status: 'EXECUTED' },
        })
        .catch(() => {}); // Don't fail if signal not found
    }

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
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
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
          const { apiKey, apiSecret } =
            await this.credentialsService.decryptCredential(credential.id);
          const ExchangeClass = ccxt[
            credential.exchange as keyof typeof ccxt
          ] as any;
          const exchange = new ExchangeClass({
            apiKey,
            secret: apiSecret,
            enableRateLimit: true,
          });
          await exchange.cancelOrder(order.exchangeOrderId, order.symbol);
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
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('الطلب غير موجود');
    }

    return order;
  }

  // ── Position Management ──

  /**
   * Get all open positions for a user
   */
  async getOpenPositions(userId: string): Promise<any[]> {
    const positions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    // Update current prices and PnL
    for (const position of positions) {
      try {
        const quote = await this.exchangeService.getQuote(position.symbol);
        const currentPrice = quote.price;
        const unrealizedPnl =
          position.side === 'BUY'
            ? (currentPrice - position.entryPrice) * position.quantity
            : (position.entryPrice - currentPrice) * position.quantity;

        await this.prisma.position.update({
          where: { id: position.id },
          data: {
            currentPrice,
            unrealizedPnl,
            highestPrice: Math.max(
              position.highestPrice || currentPrice,
              currentPrice,
            ),
            lowestPrice: Math.min(
              position.lowestPrice || currentPrice,
              currentPrice,
            ),
          },
        });

        // Update in-memory for response
        position.currentPrice = currentPrice;
        position.unrealizedPnl = unrealizedPnl;
      } catch (error: any) {
        this.logger.warn(
          `Failed to update price for ${position.symbol}: ${error.message}`,
        );
      }
    }

    return positions;
  }

  /**
   * Get position summary
   */
  async getPositionSummary(userId: string) {
    const positions = await this.getOpenPositions(userId);

    const totalValue = positions.reduce(
      (sum, p) => sum + p.quantity * (p.currentPrice || p.entryPrice),
      0,
    );
    const totalUnrealizedPnl = positions.reduce(
      (sum, p) => sum + (p.unrealizedPnl || 0),
      0,
    );
    const totalRealizedPnl = positions.reduce(
      (sum, p) => sum + (p.realizedPnl || 0),
      0,
    );

    return {
      totalPositions: positions.length,
      totalValue,
      totalUnrealizedPnl,
      totalRealizedPnl,
      positions,
    };
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
    const position = await this.prisma.position.findUnique({
      where: { id: request.positionId },
    });

    if (!position || position.userId !== userId) {
      throw new NotFoundException('المركز غير موجود');
    }

    if (position.status !== 'OPEN') {
      throw new BadRequestException('المركز ليس مفتوحاً');
    }

    const closeQuantity = request.quantity || position.quantity;
    if (closeQuantity > position.quantity) {
      throw new BadRequestException(
        `كمية الإغلاق (${closeQuantity}) أكبر من حجم المركز (${position.quantity})`,
      );
    }

    // Execute closing order on exchange
    const credential =
      await this.prisma.exchangeCredential.findUnique({
        where: { id: position.credentialId },
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
        side: closeSide as OrderSide,
        type: OrderType.MARKET,
        quantity: closeQuantity,
      },
    );

    if (!execution.success) {
      throw new BadRequestException(
        `فشل في إغلاق المركز: ${execution.error}`,
      );
    }

    const pnl =
      position.side === 'BUY'
        ? ((execution.averagePrice ||
            position.currentPrice ||
            position.entryPrice) -
            position.entryPrice) *
          closeQuantity
        : (position.entryPrice -
            (execution.averagePrice ||
              position.currentPrice ||
              position.entryPrice)) *
          closeQuantity;

    // Record closing order
    // Note: averagePrice (not averageFillPrice) is the correct field name
    // idempotencyKey is required (String @unique)
    const order = await this.prisma.order.create({
      data: {
        userId,
        exchangeCredentialId: position.credentialId,
        exchange: position.exchange,
        symbol: position.symbol,
        side: closeSide as any,
        type: 'MARKET' as any,
        status: 'FILLED' as any,
        quantity: closeQuantity,
        stopLoss: position.stopLoss ?? null,
        filledQuantity: execution.filledQuantity || closeQuantity,
        averagePrice: execution.averagePrice,
        fee: execution.fee ?? null,
        feeCurrency: execution.feeCurrency ?? null,
        exchangeOrderId: execution.exchangeOrderId,
        idempotencyKey: `close-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });

    // Record exit trade
    await this.prisma.trade.create({
      data: {
        userId,
        orderId: order.id,
        positionId: position.id,
        exchange: position.exchange,
        symbol: position.symbol,
        side: closeSide as OrderSide,
        type: closeQuantity >= position.quantity ? 'EXIT' : 'PARTIAL_EXIT',
        quantity: closeQuantity,
        price:
          execution.averagePrice ||
          position.currentPrice ||
          position.entryPrice,
        fee: execution.fee,
        feeCurrency: execution.feeCurrency,
        pnl,
      },
    });

    // Update position
    if (closeQuantity >= position.quantity) {
      await this.prisma.position.update({
        where: { id: position.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          realizedPnl: (position.realizedPnl || 0) + pnl,
        },
      });
    } else {
      await this.prisma.position.update({
        where: { id: position.id },
        data: {
          quantity: position.quantity - closeQuantity,
          realizedPnl: (position.realizedPnl || 0) + pnl,
        },
      });
    }

    await this.auditService.log({
      userId,
      action: 'POSITION_CLOSED',
      resource: 'position',
      details: JSON.stringify({
        positionId: position.id,
        symbol: position.symbol,
        quantity: closeQuantity,
        pnl,
        partial: closeQuantity < position.quantity,
      }),
      ipAddress,
      userAgent,
    });

    this.logger.log(
      `📈 Position closed: ${position.symbol} — PnL: ${pnl.toFixed(2)} USD`,
    );

    return {
      order,
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
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
    });

    if (!position || position.userId !== userId) {
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
   * Get trade history
   */
  async getTradeHistory(userId: string, limit: number = 50) {
    return this.prisma.trade.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    });
  }

  // ── Private Methods ──

  /**
   * Execute an order on the exchange via CCXT
   * Only MARKET and LIMIT order types are supported
   */
  private async _executeOnExchange(
    exchangeName: string,
    credentialId: string,
    request: PlaceOrderRequest,
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
      const { apiKey, apiSecret } =
        await this.credentialsService.decryptCredential(credentialId);

      const ExchangeClass = ccxt[
        exchangeName as keyof typeof ccxt
      ] as any;
      if (!ExchangeClass) {
        return {
          success: false,
          error: `البورصة "${exchangeName}" غير مدعومة`,
        };
      }

      const exchange = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });

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
   */
  private async _updatePosition(
    userId: string,
    order: any,
    request: PlaceOrderRequest,
    execution: any,
  ) {
    const filledQty = execution.filledQuantity || 0;
    const fillPrice = execution.averagePrice || (order.price ? Number(order.price) : 0);

    if (filledQty <= 0) return;

    // Get exchange name from credential
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: request.credentialId },
    });
    const exchangeName = credential?.exchange || 'unknown';

    if (request.side === 'BUY') {
      // For BUY orders, check if there's an existing position to add to
      const existingPosition = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol: request.symbol,
          status: 'OPEN',
          side: 'BUY',
        },
      });

      if (existingPosition) {
        // Add to existing position (average up)
        const totalQuantity = existingPosition.quantity + filledQty;
        const avgPrice =
          (existingPosition.entryPrice * existingPosition.quantity +
            fillPrice * filledQty) /
          totalQuantity;

        await this.prisma.position.update({
          where: { id: existingPosition.id },
          data: {
            quantity: totalQuantity,
            entryPrice: avgPrice,
          },
        });
      } else {
        // Open new position
        const { stopLoss, takeProfit } =
          this.riskManager.getDefaultLevels(fillPrice, 'BUY');

        await this.prisma.position.create({
          data: {
            userId,
            credentialId: request.credentialId,
            exchange: exchangeName,
            symbol: request.symbol,
            side: 'BUY',
            status: 'OPEN',
            quantity: filledQty,
            entryPrice: fillPrice,
            currentPrice: fillPrice,
            highestPrice: fillPrice,
            lowestPrice: fillPrice,
            stopLoss: request.stopLoss ?? stopLoss,
            takeProfit,
          },
        });
      }
    } else {
      // For SELL orders (short positions)
      const existingPosition = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol: request.symbol,
          status: 'OPEN',
          side: 'SELL',
        },
      });

      if (existingPosition) {
        // Add to existing short position
        const totalQuantity = existingPosition.quantity + filledQty;
        const avgPrice =
          (existingPosition.entryPrice * existingPosition.quantity +
            fillPrice * filledQty) /
          totalQuantity;

        await this.prisma.position.update({
          where: { id: existingPosition.id },
          data: {
            quantity: totalQuantity,
            entryPrice: avgPrice,
          },
        });
      } else {
        // Open new short position
        const { stopLoss, takeProfit } =
          this.riskManager.getDefaultLevels(fillPrice, 'SELL');

        await this.prisma.position.create({
          data: {
            userId,
            credentialId: request.credentialId,
            exchange: exchangeName,
            symbol: request.symbol,
            side: 'SELL',
            status: 'OPEN',
            quantity: filledQty,
            entryPrice: fillPrice,
            currentPrice: fillPrice,
            highestPrice: fillPrice,
            lowestPrice: fillPrice,
            stopLoss: request.stopLoss ?? stopLoss,
            takeProfit,
          },
        });
      }
    }
  }
}
