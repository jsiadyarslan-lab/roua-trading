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
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IdempotencyService } from '../services/idempotency.service';
import { RiskGatekeeperService } from '../services/risk-gatekeeper.service';
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

/**
 * Order Controller — Trading Order API
 *
 * Main entry point for placing trading orders.
 * Implements the full order pipeline:
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 1. Validate request body                                        │
 * │ 2. Check idempotencyKey (prevent duplicates) → 409 if exists    │
 * │ 3. Create OrderCommand & register in OrderStateManager (PENDING)│
 * │ 4. Run RiskGatekeeperService checks                             │
 * │    ├─ Failed → RISK_REJECTED event + 403 response              │
 * │    └─ Passed → ACCEPTED event                                   │
 * │ 5. Send to execution_queue (BullMQ) for async execution         │
 * │ 6. Return { orderId, status }                                   │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Endpoints:
 * - POST   /api/trading/orders         — Place a new order
 * - GET    /api/trading/orders          — List orders
 * - GET    /api/trading/orders/:id      — Get order details
 * - DELETE /api/trading/orders/:id      — Cancel order
 * - GET    /api/trading/positions       — Get open positions
 * - GET    /api/trading/portfolio       — Get portfolio summary
 */
@Controller('trading/v2')
@UseGuards(AuthGuard)
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(
    private readonly idempotencyService: IdempotencyService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly stateManager: OrderStateManagerService,
    private readonly positionManager: PositionManagerService,
    private readonly orderProducer: OrderProducerService,
    @InjectQueue('execution_queue') private readonly executionQueue: Queue,
  ) {
    this.logger.log('📋 Order Controller initialized (with BullMQ execution_queue)');
  }

  /**
   * POST /api/trading/orders
   *
   * Place a new trading order.
   *
   * Body:
   * {
   *   exchangeCredentialId: string;
   *   symbol: string;
   *   side: 'BUY' | 'SELL';
   *   type: 'MARKET' | 'LIMIT';
   *   quantity: number;
   *   price?: number;
   *   stopLoss: number;      // إجباري
   *   takeProfit?: number;
   *   idempotencyKey: string;
   * }
   */
  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async placeOrder(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;

    // ── Step 1: Validate required fields ──
    this._validateOrderBody(body);

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
      side: body.side as OrderSideEnum,
      type: body.type as OrderTypeEnum,
      quantity: parseFloat(body.quantity),
      price: body.price ? parseFloat(body.price) : undefined,
      stopLoss: parseFloat(body.stopLoss),
      takeProfit: body.takeProfit ? parseFloat(body.takeProfit) : undefined,
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
      // Release idempotency lock on creation failure
      await this.idempotencyService.releaseLock(body.idempotencyKey);
      throw error;
    }

    // ── Step 5: Run risk checks ──
    const riskResult = await this.riskGatekeeper.validateOrder(command);

    if (!riskResult.allowed) {
      // Record RISK_REJECTED event
      await this.stateManager.rejectOrder(
        order.id,
        riskResult.reason || 'فشل في فحص المخاطر',
        riskResult.failedCheck,
      );

      // Release idempotency lock so client can fix and retry
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

    // ── Step 7: Send to BullMQ execution_queue for async execution ──
    try {
      await this.executionQueue.add(
        'execute',
        {
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
        },
        {
          jobId: command.idempotencyKey, // Unique job ID (prevents duplicates)
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );

      this.logger.log(`📤 Order ${order.id} added to execution_queue (jobId: ${command.idempotencyKey})`);
    } catch (queueError: any) {
      // BullMQ queue submission failed — try RabbitMQ as fallback
      this.logger.warn(
        `BullMQ queue failed for ${order.id}: ${queueError.message} — trying RabbitMQ fallback`,
      );

      try {
        await this.orderProducer.sendOrder({
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
        });
      } catch (rabbitError: any) {
        // Both queues failed — order is ACCEPTED but not yet submitted
        // It will be picked up by a retry mechanism or manual reconciliation
        this.logger.error(
          `Both queues failed for order ${order.id}. Order is ACCEPTED but not submitted for execution.`,
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
      },
    };
  }

  /**
   * GET /api/trading/orders
   * List user's orders with optional filters
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
   * GET /api/trading/orders/:id
   * Get order details with full event history
   */
  @Get('orders/:id')
  async getOrder(@Req() req: any, @Param('id') orderId: string) {
    const order = await this.stateManager.findOrderById(orderId);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    // Verify ownership
    if (order.userId !== req.user.id) {
      throw new ForbiddenException('ليس لديك صلاحية الوصول لهذا الطلب');
    }

    return { success: true, data: order };
  }

  /**
   * DELETE /api/trading/orders/:id
   * Cancel a pending order
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
   * GET /api/trading/positions
   * Get all open positions for the user
   */
  @Get('positions')
  async getOpenPositions(@Req() req: any) {
    const positions = await this.positionManager.getOpenPositions(req.user.id);
    return { success: true, data: positions };
  }

  /**
   * GET /api/trading/portfolio
   * Get complete portfolio summary
   */
  @Get('portfolio')
  async getPortfolioSummary(@Req() req: any) {
    const summary = await this.positionManager.getPortfolioSummary(req.user.id);
    return { success: true, data: summary };
  }

  // ── Private: Validation ──

  private _validateOrderBody(body: any): void {
    const required = ['exchangeCredentialId', 'symbol', 'side', 'type', 'quantity', 'stopLoss', 'idempotencyKey'];
    const missing = required.filter((field) => !body[field]);

    if (missing.length > 0) {
      throw new BadRequestException(
        `حقول مطلوبة مفقودة: ${missing.join(', ')}`,
      );
    }

    if (!['BUY', 'SELL'].includes(body.side)) {
      throw new BadRequestException('جانب الطلب يجب أن يكون BUY أو SELL');
    }

    if (!['MARKET', 'LIMIT'].includes(body.type)) {
      throw new BadRequestException('نوع الطلب يجب أن يكون MARKET أو LIMIT');
    }

    const quantity = parseFloat(body.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      throw new BadRequestException('الكمية يجب أن تكون رقماً أكبر من صفر');
    }

    const stopLoss = parseFloat(body.stopLoss);
    if (isNaN(stopLoss) || stopLoss <= 0) {
      throw new BadRequestException('وقف الخسارة يجب أن يكون رقماً أكبر من صفر');
    }

    if (body.type === 'LIMIT' && !body.price) {
      throw new BadRequestException('سعر الحد مطلوب للطلبات المحددة (LIMIT)');
    }

    if (body.price) {
      const price = parseFloat(body.price);
      if (isNaN(price) || price <= 0) {
        throw new BadRequestException('السعر يجب أن يكون رقماً أكبر من صفر');
      }
    }
  }
}
