import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Optional,
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { TradingService } from './trading.service';
import { RiskManagerService } from './risk-manager.service';
import { RiskGatekeeperService } from './services/risk-gatekeeper.service';
import { IdempotencyService } from './services/idempotency.service';
import { OrderStateManagerService } from './services/order-state-manager.service';
import { PositionManagerService } from './services/position-manager.service';
import { OrderProducerService } from './services/order-producer.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import {
  PlaceOrderRequest,
  ClosePositionRequest,
  PlaceOrderDto,
  ClosePositionDto,
  OrderSide,
  OrderType,
} from './trading.types';
import { OrderSide as PrismaOrderSide, OrderType as PrismaOrderType } from './trading.types';
import {
  OrderCommand,
  OrderSideEnum,
  OrderTypeEnum,
} from './events/order.events';
import { PlaceOrderDto as V2PlaceOrderDto } from './controllers/dtos/place-order.dto';

/**
 * Trading Controller — Unified REST API for Trading Engine
 *
 * #18 UNIFIED: This controller now provides BOTH V1 and V2 pipelines.
 * The V1 code path is DEPRECATED and will be removed in a future version.
 * The V2 pipeline (idempotency → state manager → BullMQ) is now the default
 * when V2 services are available.
 *
 * V2 features integrated into this controller:
 * - Idempotency via IdempotencyService
 * - CQRS pipeline with OrderStateManager
 * - BullMQ/RabbitMQ dual-queue async execution
 * - Full event sourcing with OrderEvent records
 * - Position management via PositionManagerService
 *
 * All endpoints require authentication via AuthGuard.
 * Each handler wraps service calls in try/catch to return
 * meaningful Arabic error messages instead of generic 500s.
 */
@Controller('trading')
@UseGuards(AuthGuard)
export class TradingController {
  private readonly logger = new Logger(TradingController.name);

  constructor(
    private readonly tradingService: TradingService,
    private readonly riskManager: RiskManagerService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    // #18: V2 services — optional so controller still works if V2 infra is down
    @Optional() private readonly idempotencyService?: IdempotencyService,
    @Optional() private readonly stateManager?: OrderStateManagerService,
    @Optional() private readonly positionManager?: PositionManagerService,
    @Optional() private readonly orderProducer?: OrderProducerService,
    // #18: BullMQ queue — optional, may be null if Redis is down
    @Optional() @InjectQueue('execution_queue') private readonly executionQueue?: Queue | null,
  ) {
    const v2Available = !!(this.idempotencyService && this.stateManager && this.positionManager && this.orderProducer);
    this.logger.log(`📋 TradingController initialized — V2 pipeline: ${v2Available ? '✅ AVAILABLE' : '❌ UNAVAILABLE (falling back to V1)'}`);
  }

  /**
   * #18: Check if the V2 pipeline (idempotency + state manager + BullMQ) is available.
   */
  private _isV2Available(): boolean {
    return !!(
      this.idempotencyService &&
      this.stateManager &&
      this.positionManager &&
      this.orderProducer
    );
  }

  /**
   * #18: Add deprecation headers to V1-only responses.
   * Now also indicates V2 pipeline availability.
   */
  private _addDeprecationHeaders(res: Response): void {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Jan 2027 00:00:00 GMT');
    res.setHeader('Link', '</api/trading/v2/orders>; rel="successor-version"');
    res.setHeader('X-V2-Pipeline-Available', this._isV2Available() ? 'true' : 'false');
  }

  // ── Order Endpoints ──

  /**
   * Get trading account overview
   * GET /api/trading/account
   *
   * FIX: This endpoint was missing — the performance agent was monitoring
   * /api/trading/account which returned 404, causing a 10-second proxy
   * retry loop (2 retries × 2s delay each). Now returns position summary
   * quickly so the endpoint responds in <100ms instead of timing out.
   */
  @Get('account')
  async getAccountOverview(
    @Req() req: any,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getPositionSummary(userId, credentialId);
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch account overview: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Place a new order — Unified V1/V2 pipeline
   * POST /api/trading/orders
   *
   * #18 UNIFIED: Tries V2 pipeline first (idempotency + state manager + BullMQ)
   * when V2 services are available. Falls back to V1 pipeline if V2 is down.
   *
   * V2 pipeline flow:
   * 1. Validate request body
   * 2. Check idempotencyKey → 409 if duplicate
   * 3. Create OrderCommand & register in OrderStateManager (PENDING)
   * 4. Run RiskGatekeeperService checks
   * 5. Update to ACCEPTED & send to execution queue
   * 6. Return { orderId, status }
   *
   * V1 pipeline (fallback):
   * 1. Validate + RiskGatekeeper
   * 2. TradingService.placeOrder (direct execution)
   */
  @Post('orders')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async placeOrder(@Req() req: any, @Body() body: PlaceOrderDto, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;

    // ── Shared validation (used by both V1 and V2 pipelines) ──
    const request: PlaceOrderRequest = {
      credentialId: body.credentialId,
      symbol: body.symbol,
      side: body.side as OrderSide,
      type: body.type as OrderType,
      quantity: Number(body.quantity),
      price: body.price != null ? Number(body.price) : undefined,
      stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
      takeProfit: body.takeProfit != null ? Number(body.takeProfit) : undefined,
      signalId: body.signalId,
    };

    // Validate required fields
    if (
      !request.credentialId ||
      !request.symbol ||
      !request.side ||
      !request.type ||
      !request.quantity
    ) {
      throw new BadRequestException(
        'بيانات الطلب غير مكتملة — يرجى تعبئة جميع الحقول المطلوبة',
      );
    }

    if (!['BUY', 'SELL'].includes(request.side)) {
      throw new BadRequestException(
        'جانب الطلب يجب أن يكون BUY أو SELL',
      );
    }

    if (!['MARKET', 'LIMIT'].includes(request.type)) {
      throw new BadRequestException('نوع الطلب غير صالح');
    }

    if (request.quantity <= 0) {
      throw new BadRequestException(
        'الكمية يجب أن تكون أكبر من صفر',
      );
    }

    // ── Stop-loss is MANDATORY (enforced by RiskGatekeeper check #1) ──
    if (!body.stopLoss || Number(body.stopLoss) <= 0) {
      throw new BadRequestException(
        'وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.',
      );
    }

    // ── LIMIT orders require a price (#18: added from V2 validation) ──
    if (request.type === 'LIMIT' && !request.price) {
      throw new BadRequestException('سعر الحد مطلوب للطلبات المحددة (LIMIT)');
    }

    // ═══════════════════════════════════════════════════════════════
    // #18 UNIFIED: Try V2 pipeline first when V2 services are available
    // ═══════════════════════════════════════════════════════════════
    if (this._isV2Available()) {
      return this._placeOrderV2(userId, body, request, req, res);
    }

    // ═══════════════════════════════════════════════════════════════
    // V1 FALLBACK (DEPRECATED) — used when V2 services are unavailable
    // ═══════════════════════════════════════════════════════════════
    this.logger.warn('⚠️ V2 pipeline unavailable — falling back to V1 (deprecated)');
    return this._placeOrderV1(userId, request, req, res);
  }

  /**
   * #18: V2 order pipeline — Idempotency → State Manager → Risk → Queue
   * Extracted from OrderController for unified access.
   */
  private async _placeOrderV2(
    userId: string,
    body: PlaceOrderDto,
    request: PlaceOrderRequest,
    req: any,
    res: Response,
  ) {
    // ── Step 1: Check idempotency (if key provided) ──
    const idempotencyKey = (body as any).idempotencyKey ||
      `v1-${userId}-${request.symbol}-${request.side}-${request.type}-${request.quantity}-${request.price || 'market'}-${Math.floor(Date.now() / 1000)}`;

    const isUnique = await this.idempotencyService!.checkAndLock(idempotencyKey);
    if (!isUnique) {
      throw new ConflictException(
        'تم استلام هذا الطلب مسبقاً. لا يمكن تكرار نفس idempotencyKey خلال 24 ساعة.',
      );
    }

    // ── Step 2: Build OrderCommand ──
    const command: OrderCommand = {
      userId,
      exchangeCredentialId: request.credentialId,
      symbol: request.symbol,
      side: request.side === 'BUY' ? OrderSideEnum.BUY : OrderSideEnum.SELL,
      type: request.type === 'MARKET' ? OrderTypeEnum.MARKET : OrderTypeEnum.LIMIT,
      quantity: request.quantity,
      price: request.price,
      stopLoss: request.stopLoss ?? 0,
      takeProfit: request.takeProfit,
      idempotencyKey,
      clientOrderId: (body as any).clientOrderId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // ── Step 3: Create order in PENDING state ──
    let order: any;
    try {
      order = await this.stateManager!.createOrder(command);
    } catch (error: any) {
      await this.idempotencyService!.releaseLock(idempotencyKey);
      throw error;
    }

    // ── Step 4: Run risk checks ──
    const riskResult = await this.riskGatekeeper.validateOrder(command);

    if (!riskResult.allowed) {
      await this.stateManager!.rejectOrder(
        order.id,
        riskResult.reason || 'فشل في فحص المخاطر',
        riskResult.failedCheck,
      );
      await this.idempotencyService!.releaseLock(idempotencyKey);
      throw new ForbiddenException(
        `🛡️ تم رفض الطلب: ${riskResult.reason}`,
      );
    }

    // ── Step 5: Update status to ACCEPTED ──
    await this.stateManager!.updateOrderStatus(order.id, 'ACCEPTED', {
      riskScore: riskResult.riskScore,
      validatedAt: new Date().toISOString(),
    });

    // ── Step 6: Send to execution queue ──
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
      await this.orderProducer!.sendOrder(queueMessage);
      this.logger.log(`📤 Order ${order.id} submitted to RabbitMQ order_queue`);
    } catch (rabbitError: any) {
      this.logger.warn(
        `RabbitMQ failed for ${order.id}: ${rabbitError.message} — trying BullMQ fallback`,
      );
      try {
        if (!this.executionQueue) {
          throw new Error('BullMQ execution_queue not available');
        }
        await this.executionQueue.add('execute', queueMessage, {
          jobId: command.idempotencyKey,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });
        this.logger.log(`📤 Order ${order.id} added to BullMQ execution_queue (fallback)`);
      } catch (bullError: any) {
        this.logger.error(
          `Both queues failed for order ${order.id}. Order is ACCEPTED but not submitted. ` +
          `RabbitMQ: ${rabbitError.message}, BullMQ: ${bullError.message}`,
        );
      }
    }

    // ── Step 7: Return V2 response ──
    return {
      success: true,
      data: {
        orderId: order.id,
        status: 'ACCEPTED',
        idempotencyKey,
        riskScore: riskResult.riskScore,
        pipeline: 'v2',
      },
    };
  }

  /**
   * #18: V1 order pipeline (DEPRECATED) — direct TradingService execution
   * Only used when V2 services (idempotency, state manager) are unavailable.
   */
  private async _placeOrderV1(
    userId: string,
    request: PlaceOrderRequest,
    req: any,
    res: Response,
  ) {
    // ── Risk Gatekeeper Check ──
    const riskResult = await this.riskGatekeeper.validateOrder({
      userId,
      exchangeCredentialId: request.credentialId,
      symbol: request.symbol,
      side: request.side as PrismaOrderSide,
      type: request.type as PrismaOrderType,
      quantity: request.quantity,
      price: request.price,
      stopLoss: request.stopLoss!,
      idempotencyKey: `v1-${userId}-${request.symbol}-${request.side}-${request.type}-${request.quantity}-${request.price || 'market'}-${Math.floor(Date.now() / 1000)}`,
    });

    if (!riskResult.allowed) {
      throw new ForbiddenException(
        `🛡️ تم رفض الطلب: ${riskResult.reason || 'فشل في فحص المخاطر'}`,
      );
    }

    // Set skipRiskCheck=true because RiskGatekeeper already validated above.
    request.skipRiskCheck = true;

    // Mark V1 as deprecated in response headers
    this._addDeprecationHeaders(res);

    const result = await this.tradingService.placeOrder(
      userId,
      request,
      req.ip,
      req.headers['user-agent'],
    );

    // Add pipeline indicator to the response
    if (result && typeof result === 'object') {
      (result as any).pipeline = 'v1-deprecated';
    }
    return result;
  }

  /**
   * Cancel an order — Unified V1/V2 pipeline
   * DELETE /api/trading/orders/:id
   *
   * #18 UNIFIED: Uses V2 state manager when available for proper event sourcing.
   */
  @Delete('orders/:id')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async cancelOrder(@Req() req: any, @Param('id') orderId: string) {
    // ── V2 path: State manager with event sourcing ──
    if (this.stateManager) {
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

    // ── V1 fallback (deprecated) ──
    return this.tradingService.cancelOrder(
      req.user.id,
      orderId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  /**
   * Get orders — Unified V1/V2 pipeline
   * GET /api/trading/orders
   *
   * #18 UNIFIED: Uses V2 state manager when available for richer order data.
   */
  @Get('orders')
  async getOrders(
    @Req() req: any,
    @Query('symbol') symbol?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    // ── V2 path: State manager with event-sourced orders ──
    if (this.stateManager) {
      const filters = {
        symbol,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
      };
      const orders = await this.stateManager.findOrders(req.user.id, filters);
      return { success: true, data: orders };
    }

    // ── V1 fallback (deprecated) ──
    return this.tradingService.getOrders(req.user.id, {
      symbol,
      status,
      limit: limit ? (parseInt(limit, 10) || 50) : undefined,
    });
  }

  /**
   * Get a specific order — Unified V1/V2 pipeline
   * GET /api/trading/orders/:id
   *
   * #18 UNIFIED: Uses V2 state manager when available for full event history.
   */
  @Get('orders/:id')
  async getOrder(@Req() req: any, @Param('id') orderId: string) {
    // ── V2 path: State manager with event-sourced order details ──
    if (this.stateManager) {
      const order = await this.stateManager.findOrderById(orderId);

      if (!order) {
        throw new NotFoundException('الطلب غير موجود');
      }

      if (order.userId !== req.user.id) {
        throw new ForbiddenException('ليس لديك صلاحية الوصول لهذا الطلب');
      }

      return { success: true, data: order };
    }

    // ── V1 fallback (deprecated) ──
    return this.tradingService.getOrder(req.user.id, orderId);
  }

  // ── Position Endpoints ──

  /**
   * Get open positions
   * GET /api/trading/positions
   */
  @Get('positions')
  async getOpenPositions(
    @Req() req: any,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching open positions for user: ${userId}, credentialId: ${credentialId || 'all'}`);
      const positions = await this.tradingService.getOpenPositions(userId, credentialId);
      this.logger.log(`📋 Found ${positions.length} open positions`);
      return positions;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch open positions: ${error.message}`,
        error.stack,
      );
      throw error; // Let the global exception filter handle it
    }
  }

  /**
   * Get trading history (closed trades) — lightweight alias for AICoachPanel
   * GET /api/trading/history?limit=50
   * Returns { trades: [...] } with camelCase fields matching frontend expectations.
   * The /positions/history endpoint returns raw Prisma models with snake_case;
   * this endpoint maps them to the format AICoachPanel expects.
   */
  @Get('history')
  async getTradingHistory(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching trading history for user: ${userId}, credentialId: ${credentialId || 'all'}`);
      const positions = await this.tradingService.getClosedPositions(
        userId,
        limit ? (parseInt(limit, 10) || 50) : 50,
        from,
        to,
        credentialId,
      );
      // Map Prisma Position model to frontend-friendly trade format
      const trades = (Array.isArray(positions) ? positions : []).map((p: any) => {
        const lastTrade = p.trades?.length > 0 ? p.trades[p.trades.length - 1] : null;
        return {
          id: p.id,
          symbol: p.symbol,
          side: p.side?.toLowerCase() === 'buy' ? 'long' : 'short',
          entryPrice: Number(p.entryPrice) || 0,
          exitPrice: lastTrade ? Number(lastTrade.price) : (Number(p.exitPrice) || 0),
          qty: Number(p.quantity) || 0,
          realizedPnl: Number(p.realizedPnl) || 0,
          realizedPct: p.entryPrice > 0 ? ((Number(p.realizedPnl) || 0) / (Number(p.entryPrice) * Number(p.quantity))) * 100 : 0,
          closeTime: p.closedAt ? new Date(p.closedAt).getTime() : Date.now(),
          status: p.status,
        };
      });
      return { success: true, trades };
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch trading history: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get closed position history
   * GET /api/trading/positions/history
   */
  @Get('positions/history')
  async getClosedPositions(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching closed positions for user: ${userId}, credentialId: ${credentialId || 'all'}, from: ${from || 'all'}, to: ${to || 'all'}`);
      // V227: Support limit=0 to fetch ALL closed positions (no limit).
      // Previously capped at 100, frontend used limit=500 but still missed
      // positions beyond 500. Now limit=0 means "fetch everything".
      const parsedLimit = limit ? parseInt(limit, 10) : 100;
      const effectiveLimit = parsedLimit === 0 ? undefined : (parsedLimit || 100);
      return await this.tradingService.getClosedPositions(
        userId,
        effectiveLimit as any,
        from,
        to,
        credentialId,
      );
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch closed positions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all positions (open + closed)
   * GET /api/trading/positions/all
   */
  @Get('positions/all')
  async getAllPositions(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching all positions for user: ${userId}`);
      return await this.tradingService.getAllPositions(
        userId,
        limit ? (parseInt(limit, 10) || 100) : 100,
      );
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch all positions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get position summary
   * GET /api/trading/positions/summary
   */
  @Get('positions/summary')
  async getPositionSummary(
    @Req() req: any,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getPositionSummary(userId, credentialId);
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch position summary: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Close a position
   * POST /api/trading/positions/close
   */
  @Post('positions/close')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async closePosition(@Req() req: any, @Body() body: ClosePositionDto) {
    const request: ClosePositionRequest = {
      positionId: body.positionId,
      quantity: body.quantity != null ? Number(body.quantity) : undefined,
      closeReason: 'MANUAL', // V141: User manually closed the position
    };

    if (!request.positionId) {
      throw new BadRequestException('معرف المركز مطلوب');
    }

    // FIX: Use closePositionWithRetry to handle OPTIMISTIC_LOCK_FAILURE
    return this.tradingService.closePositionWithRetry(
      req.user.id,
      request,
      req.ip,
      req.headers['user-agent'],
      3, // max retries for OPTIMISTIC_LOCK_FAILURE
    );
  }

  /**
   * Force close a position (DB only — no exchange execution)
   * POST /api/trading/positions/force-close
   *
   * Use this when:
   * - The position is already closed on the exchange but still shows OPEN in DB
   * - The exchange API is not accessible and you need to sync the DB state
   */
  @Post('positions/force-close')
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async forceClosePosition(@Req() req: any, @Body() body: any) {
    const positionId = body.positionId;
    const reason = body.reason || 'User requested force close';

    if (!positionId) {
      throw new BadRequestException('معرف المركز مطلوب');
    }

    return this.tradingService.forceClosePosition(
      req.user.id,
      positionId,
      reason,
      req.ip,
      req.headers['user-agent'],
    );
  }

  /**
   * Update position stop-loss/take-profit
   * POST /api/trading/positions/:id/levels
   */
  @Post('positions/:id/levels')
  async updatePositionLevels(
    @Req() req: any,
    @Param('id') positionId: string,
    @Body() body: any,
  ) {
    return this.tradingService.updatePositionLevels(req.user.id, positionId, {
      stopLoss: body.stopLoss ? parseFloat(body.stopLoss) : undefined,
      takeProfit: body.takeProfit ? parseFloat(body.takeProfit) : undefined,
    });
  }

  // ── Trade History ──

  /**
   * Get trade history
   * GET /api/trading/trades
   */
  @Get('trades')
  async getTradeHistory(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getTradeHistory(
        userId,
        limit ? (parseInt(limit, 10) || 50) : 50,
        from,
        to,
        credentialId,
      );
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch trade history: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // ── V2-Style Endpoints (newly added for #18 unification) ──

  /**
   * Get portfolio summary — V2 PositionManagerService
   * GET /api/trading/portfolio
   *
   * #18 UNIFIED: Provides V2 portfolio summary via PositionManagerService.
   * Falls back to TradingService position summary if V2 is unavailable.
   */
  @Get('portfolio')
  async getPortfolioSummary(
    @Req() req: any,
    @Query('credentialId') credentialId?: string,
  ) {
    try {
      const userId = req.user.id;

      // ── V2 path: PositionManagerService with live P&L ──
      if (this.positionManager) {
        const summary = await this.positionManager.getPortfolioSummary(userId, credentialId);
        return { success: true, data: summary };
      }

      // ── V1 fallback ──
      return await this.tradingService.getPositionSummary(userId, credentialId);
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch portfolio summary: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check V2 pipeline availability
   * GET /api/trading/v2/status
   *
   * #18 UNIFIED: Returns whether the V2 pipeline services are available.
   * Useful for client-side feature flags and monitoring.
   */
  @Get('v2/status')
  getV2Status() {
    const available = this._isV2Available();
    return {
      success: true,
      data: {
        v2Pipeline: available,
        services: {
          idempotency: !!this.idempotencyService,
          stateManager: !!this.stateManager,
          positionManager: !!this.positionManager,
          orderProducer: !!this.orderProducer,
          executionQueue: !!this.executionQueue,
        },
        message: available
          ? 'V2 pipeline is active — all V2 services available'
          : 'V2 pipeline is inactive — falling back to V1 (deprecated)',
      },
    };
  }

  // ── Diagnostic (READ-ONLY) ──

  /**
   * DIAGNOSTIC: Check database state for trade visibility issues
   * GET /api/trading/diagnose
   *
   * READ-ONLY — no data modification. Only SELECT queries.
   * This endpoint helps diagnose why trades don't appear.
   * Can be removed after the issue is resolved.
   */
  @Get('diagnose')
  async diagnoseTrades(@Req() req: any) {
    const userId = req.user.id;
    const results: any = { userId, timestamp: new Date().toISOString(), checks: {} };

    try {
      // Check 1: Does the Trade table have a credentialId column?
      const tradeColumns = await this.tradingService.diagnoseTradeTable();
      results.checks.tradeTableColumns = tradeColumns;
      results.checks.tradeHasCredentialId = tradeColumns?.includes('credentialId') ?? false;
    } catch (err: any) {
      results.checks.tradeTableColumns = `ERROR: ${err.message}`;
      results.checks.tradeHasCredentialId = 'UNKNOWN';
    }

    try {
      // Check 2: Which migrations have been applied?
      const migrations = await this.tradingService.diagnoseMigrations();
      results.checks.appliedMigrations = migrations;
    } catch (err: any) {
      results.checks.appliedMigrations = `ERROR: ${err.message}`;
    }

    try {
      // Check 3: Trade counts (total, with credentialId, without credentialId)
      const tradeStats = await this.tradingService.diagnoseTradeCounts(userId);
      results.checks.tradeStats = tradeStats;
    } catch (err: any) {
      results.checks.tradeStats = `ERROR: ${err.message}`;
    }

    try {
      // Check 4: Position counts (open, closed, by credentialId)
      const positionStats = await this.tradingService.diagnosePositionCounts(userId);
      results.checks.positionStats = positionStats;
    } catch (err: any) {
      results.checks.positionStats = `ERROR: ${err.message}`;
    }

    try {
      // Check 5: User's credentials and activeCredentialId
      const credentialInfo = await this.tradingService.diagnoseCredentials(userId);
      results.checks.credentials = credentialInfo;
    } catch (err: any) {
      results.checks.credentials = `ERROR: ${err.message}`;
    }

    try {
      // Check 6: Test actual API queries with credentialId
      const apiQueryResults = await this.tradingService.diagnoseApiQueries(userId);
      results.checks.apiQueries = apiQueryResults;
    } catch (err: any) {
      results.checks.apiQueries = `ERROR: ${err.message}`;
    }

    return { success: true, diagnostic: results };
  }

  /**
   * V213 DIAGNOSTIC: Check Agent MAX_HOLDING settings
   * GET /api/trading/diagnose/max-holding
   */
  @Get('diagnose/max-holding')
  async diagnoseMaxHolding(@Req() req: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`🛡️ V213: Diagnosing MAX_HOLDING for user ${userId}`);
      const result = await this.tradingService.diagnoseAgentMaxHolding(userId);
      return { success: true, diagnostic: result };
    } catch (error: any) {
      this.logger.error(`V213 diagnose max-holding failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ── Risk Management ──

  /**
   * Get risk parameters
   * GET /api/trading/risk/parameters
   */
  @Get('risk/parameters')
  async getRiskParameters() {
    return this.riskManager.getRiskParameters();
  }

  /**
   * Calculate position size
   * POST /api/trading/risk/position-size
   */
  @Post('risk/position-size')
  async calculatePositionSize(@Body() body: any) {
    const portfolioValue = parseFloat(body.portfolioValue) || 0;
    const entryPrice = parseFloat(body.entryPrice) || 0;
    const stopLossPrice = parseFloat(body.stopLossPrice) || 0;
    const riskPercent = parseFloat(body.riskPercent) || 1;

    if (!portfolioValue || !entryPrice || !stopLossPrice) {
      throw new BadRequestException(
        'قيمة المحفظة وسعر الدخول ووقف الخسارة مطلوبة',
      );
    }

    return this.riskManager.calculatePositionSize(
      portfolioValue,
      entryPrice,
      stopLossPrice,
      riskPercent,
    );
  }
}
