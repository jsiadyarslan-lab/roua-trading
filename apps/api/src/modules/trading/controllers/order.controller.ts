// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Controller (V2 Thin Redirect)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// #18 UNIFIED: This controller is now a THIN REDIRECT layer.
// The unified TradingController (/api/trading/*) now provides
// both V1 and V2 pipelines. This controller retains the /api/trading/v2/*
// routes for backward compatibility, but delegates all logic to the
// same services that the unified controller uses.
//
// Clients should migrate to /api/trading/* endpoints.
// The /api/trading/v2/* routes will be removed in a future version.

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IdempotencyService } from '../services/idempotency.service';
import { RiskGatekeeperService } from '../services/risk-gatekeeper.service';
import { UnifiedRiskService } from '../services/unified-risk.service';
import { OrderStateManagerService } from '../services/order-state-manager.service';
import { PositionManagerService } from '../services/position-manager.service';
import { OrderProducerService } from '../services/order-producer.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import {
  OrderCommand,
  OrderSideEnum,
  OrderTypeEnum,
} from '../events/order.events';
import { PlaceOrderDto as V2PlaceOrderDto } from './dtos/place-order.dto';

/**
 * Order Controller — V2 Thin Redirect Layer
 *
 * #18 UNIFIED: This controller retains /api/trading/v2/* routes for
 * backward compatibility but all order pipeline logic is now also
 * available directly from the unified TradingController at /api/trading/*.
 *
 * Clients calling /api/trading/v2/* get identical behavior to
 * /api/trading/* — same services, same pipeline, same response format.
 *
 * MIGRATION GUIDE:
 * - POST /api/trading/v2/orders   → POST /api/trading/orders
 * - GET  /api/trading/v2/orders   → GET  /api/trading/orders
 * - GET  /api/trading/v2/orders/:id → GET  /api/trading/orders/:id
 * - DELETE /api/trading/v2/orders/:id → DELETE /api/trading/orders/:id
 * - GET  /api/trading/v2/positions → GET  /api/trading/positions
 * - GET  /api/trading/v2/portfolio  → GET  /api/trading/portfolio
 * - NEW: GET /api/trading/v2/status → check V2 pipeline availability
 */
@Controller('trading/v2')
@UseGuards(AuthGuard)
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(
    private readonly idempotencyService: IdempotencyService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly unifiedRisk: UnifiedRiskService,
    private readonly stateManager: OrderStateManagerService,
    private readonly positionManager: PositionManagerService,
    private readonly orderProducer: OrderProducerService,
    @Optional() @InjectQueue('execution_queue') private readonly executionQueue: Queue | null,
  ) {
    this.logger.log('📋 Order Controller (V2 thin redirect) initialized');
  }

  /**
   * POST /api/trading/v2/orders
   *
   * #18: Redirect note — identical logic is now available at POST /api/trading/orders.
   * This endpoint is retained for backward compatibility.
   */
  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(@Req() req: any, @Body() body: V2PlaceOrderDto) {
    const userId = req.user.id;

    this._validateOrderBusinessLogic(body);

    // ── Step 2: Check idempotency ──
    const isUnique = await this.idempotencyService.checkAndLock(body.idempotencyKey);
    if (!isUnique) {
      throw new ConflictException(
        'تم استلام هذا الطلب مسبقاً. لا يمكن تكرار نفس idempotencyKey خلال 24 ساعة.',
      );
    }

    // ── Step 3: Build OrderCommand ──
    const command: OrderCommand = {
      userId,
      exchangeCredentialId: body.exchangeCredentialId,
      symbol: body.symbol,
      side: body.side === 'BUY' ? OrderSideEnum.BUY : OrderSideEnum.SELL,
      type: body.type === 'MARKET' ? OrderTypeEnum.MARKET : OrderTypeEnum.LIMIT,
      quantity: Number(body.quantity),
      price: body.price != null ? Number(body.price) : undefined,
      stopLoss: body.stopLoss != null ? Number(body.stopLoss) : 0,
      takeProfit: body.takeProfit != null ? Number(body.takeProfit) : undefined,
      idempotencyKey: body.idempotencyKey,
      clientOrderId: body.clientOrderId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // ── Step 4: Create order in PENDING state ──
    let order: any;
    try {
      order = await this.stateManager.createOrder(command);
    } catch (error: any) {
      await this.idempotencyService.releaseLock(body.idempotencyKey);
      throw error;
    }

    // ── Step 5: Run risk checks (V219: UnifiedRiskService) ──
    const riskResult = await this.unifiedRisk.validateOrder(command);

    if (!riskResult.allowed) {
      await this.stateManager.rejectOrder(
        order.id,
        riskResult.reason || 'فشل في فحص المخاطر',
        riskResult.failedCheck,
      );

      await this.idempotencyService.releaseLock(body.idempotencyKey);

      throw new ForbiddenException(
        `🛡️ تم رفض الطلب: ${riskResult.reason}`,
      );
    }

    // ── Step 6: Update status to ACCEPTED ──
    await this.stateManager.updateOrderStatus(order.id, 'ACCEPTED', {
      riskScore: riskResult.riskScore,
      validatedAt: new Date().toISOString(),
    });

    // ── Step 7: Send to execution queue for async processing ──
    const queueMessage = {
      orderId: order.id,
      userId: command.userId,
      exchangeCredentialId: command.exchangeCredentialId,
      symbol: command.symbol,
      side: command.side,
      type: command.type,
      quantity: command.quantity,
      price: command.price,
      stopLoss: command.stopLoss,
      takeProfit: command.takeProfit,
      clientOrderId: command.clientOrderId,
      idempotencyKey: command.idempotencyKey,
      submittedAt: new Date(),
    };

    try {
      await this.orderProducer.sendOrder(queueMessage);
      this.logger.log(`📤 Order ${order.id} submitted to RabbitMQ order_queue`);
    } catch (rabbitError: any) {
      this.logger.warn(
        `RabbitMQ failed for ${order.id}: ${rabbitError.message} — trying BullMQ fallback`,
      );

      try {
        if (!this.executionQueue) {
          throw new Error('BullMQ execution_queue not available');
        }
        await this.executionQueue.add(
          'execute',
          queueMessage,
          {
            jobId: command.idempotencyKey,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        );

        this.logger.log(`📤 Order ${order.id} added to BullMQ execution_queue (fallback, jobId: ${command.idempotencyKey})`);
      } catch (bullError: any) {
        this.logger.error(
          `Both queues failed for order ${order.id}. Order is ACCEPTED but not submitted for execution. ` +
          `RabbitMQ: ${rabbitError.message}, BullMQ: ${bullError.message}`,
        );
      }
    }

    // ── Step 8: Return response ──
    return {
      success: true,
      data: {
        orderId: order.id,
        status: 'ACCEPTED',
        idempotencyKey: body.idempotencyKey,
        riskScore: riskResult.riskScore,
        pipeline: 'v2',
        // #18: Migration hint
        _migration: 'This endpoint is also available at POST /api/trading/orders',
      },
    };
  }

  /**
   * GET /api/trading/v2/orders
   * #18: Also available at GET /api/trading/orders
   */
  @Get('orders')
  async getOrders(
    @Req() req: any,
    @Query('symbol') symbol?: string,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
  ) {
    const userId = req.user.id;
    const filters = {
      symbol,
      status,
      limit: limitStr ? parseInt(limitStr, 10) : undefined,
    };

    const orders = await this.stateManager.findOrders(userId, filters);
    return { success: true, data: orders };
  }

  /**
   * GET /api/trading/v2/orders/:id
   * #18: Also available at GET /api/trading/orders/:id
   */
  @Get('orders/:id')
  async getOrder(@Req() req: any, @Param('id') orderId: string) {
    const order = await this.stateManager.findOrderById(orderId);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (order.userId !== req.user.id) {
      throw new ForbiddenException('ليس لديك صلاحية الوصول لهذا الطلب');
    }

    return { success: true, data: order };
  }

  /**
   * DELETE /api/trading/v2/orders/:id
   * #18: Also available at DELETE /api/trading/orders/:id
   */
  @Delete('orders/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async cancelOrder(@Req() req: any, @Param('id') orderId: string) {
    const order = await this.stateManager.findOrderById(orderId);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (order.userId !== req.user.id) {
      throw new ForbiddenException('ليس لديك صلاحية إلغاء هذا الطلب');
    }

    if (!['PENDING', 'ACCEPTED'].includes(order.status)) {
      throw new BadRequestException(
        `لا يمكن إلغاء طلب بحالة "${order.status}"`,
      );
    }

    await this.stateManager.updateOrderStatus(orderId, 'CANCELLED', {
      cancelledBy: req.user.id,
      cancelledAt: new Date().toISOString(),
    });

    return {
      success: true,
      data: { orderId, status: 'CANCELLED' },
    };
  }

  /**
   * GET /api/trading/v2/positions
   * #18: Also available at GET /api/trading/positions
   */
  @Get('positions')
  async getOpenPositions(@Req() req: any) {
    const positions = await this.positionManager.getOpenPositions(req.user.id);
    return { success: true, data: positions };
  }

  /**
   * GET /api/trading/v2/portfolio
   * #18: Also available at GET /api/trading/portfolio
   */
  @Get('portfolio')
  async getPortfolioSummary(@Req() req: any) {
    const summary = await this.positionManager.getPortfolioSummary(req.user.id);
    return { success: true, data: summary };
  }

  // ── Private: Validation ──

  /**
   * Business-logic validation beyond what class-validator DTOs can express.
   */
  private _validateOrderBusinessLogic(body: V2PlaceOrderDto): void {
    if (body.type === 'LIMIT' && !body.price) {
      throw new BadRequestException('سعر الحد مطلوب للطلبات المحددة (LIMIT)');
    }

    if (body.stopLoss !== undefined && body.stopLoss <= 0) {
      throw new BadRequestException('وقف الخسارة يجب أن يكون رقماً أكبر من صفر');
    }

    if (body.takeProfit !== undefined && body.takeProfit <= 0) {
      throw new BadRequestException('جني الأرباح يجب أن يكون رقماً أكبر من صفر');
    }

    if (!/^[A-Za-z0-9/_.-]+$/.test(body.symbol)) {
      throw new BadRequestException('رمز التداول يحتوي على أحرف غير صالحة');
    }
  }
}
