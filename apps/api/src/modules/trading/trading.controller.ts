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
// REMOVED: RiskManagerService — deprecated, replaced by UnifiedRiskService (V219)
import { UnifiedRiskService } from './services/unified-risk.service';
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
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

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
    private readonly unifiedRisk: UnifiedRiskService,  // V219: Unified risk — replaces RiskManager + RiskGatekeeper
    private readonly prisma: PrismaService,  // V349: For diagnostic endpoints
    private readonly redis: RedisService,    // V351c: For monitor heartbeat check
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
   * V238: REMOVED duplicate-position check.
   *
   * PROBLEM: V234/V237 blocked opening a new position when one already
   * exists on the same symbol+credential. This is WRONG for a professional
   * trading platform:
   *
   *   - Binance Spot: allows buying the same symbol multiple times (averaging)
   *   - Binance Futures (One-way): merges into one position (averaging)
   *   - Binance Futures (Hedge): allows long + short simultaneously
   *   - MT5: each trade is a SEPARATE position with unique ticket
   *   - Bybit: same as Binance
   *
   * A trading platform MUST allow:
   *   - Averaging down/up (buy more at different prices)
   *   - Pyramiding (add to winning position)
   *   - Grid trading (multiple positions at different levels)
   *   - Hedging (long + short on same symbol, hedge mode)
   *
   * The previous V221/V234/V237 checks treated this like a toy —
   * "one position per symbol" is a game rule, not a trading rule.
   *
   * FIX: Remove ALL duplicate-position checks from the backend.
   * Each order creates a SEPARATE position in the DB (like MT5 tickets).
   * The UI can optionally merge display by symbol (Binance-style averaging),
   * but the backend MUST allow multiple positions.
   *
   * Safety is still enforced by:
   *   - UnifiedRiskService (margin, daily loss, position size %)
   *   - IdempotencyService (prevents double-submit of same order)
   *   - 15-minute cooldown after SL/TP close (OrderDispatcher V221-hotfix)
   */

  /**
   * @deprecated V238: This method is no longer used — kept for backward compat.
   * Always returns null (no existing position found).
   */
  private async _findExistingOpenPosition(_userId: string, _symbol: string, _credentialId?: string): Promise<any | null> {
    return null;
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
    // V239: Accept both credentialId (frontend V1) and exchangeCredentialId (V2)
    const resolvedCredentialId = body.credentialId || (body as any).exchangeCredentialId;
    if (!resolvedCredentialId) {
      throw new BadRequestException('credentialId مطلوب');
    }
    const request: PlaceOrderRequest = {
      credentialId: resolvedCredentialId,
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
    // V249: MANUAL TRADES = SYNCHRONOUS EXECUTION (V1 path)
    // AUTOMATED TRADES = ASYNC QUEUE (V2 path)
    //
    // PROBLEM: V2 pipeline (BullMQ queue) is ASYNC. The controller creates
    // an order in PENDING state, sends it to the queue, and returns
    // immediately. The actual position creation + margin deduction happens
    // 2-10 seconds later when the queue worker picks it up.
    //
    // This caused:
    //   1. Widget execution takes 6 seconds (polling for completion)
    //   2. Positions don't appear in Open Positions (position not in DB yet)
    //   3. Margin not deducted (margin deduction happens in the queue)
    //   4. Chart button "doesn't work" (returns ACCEPTED but no position)
    //
    // FIX: For manual trades (source='user_manual'), use V1 path which
    // calls TradingService.placeOrder DIRECTLY (synchronous):
    //   - Position created immediately in DB
    //   - Margin deducted immediately
    //   - Returns the filled order with entry price
    //   - No queue, no polling, no delay
    //
    // For automated trades (smart_executor, agent), keep V2 queue —
    // async execution is fine for bots (they don't need instant feedback).
    // ═══════════════════════════════════════════════════════════════
    const orderSource = (body as any).source || (request as any).source || 'user_manual';
    const isManualTrade = orderSource === 'user_manual' || orderSource === 'USER';

    if (isManualTrade) {
      // V249: Manual trades → V1 synchronous path (immediate execution)
      return this._placeOrderV1(userId, request, req, res);
    }

    // Automated trades → V2 async queue
    if (this._isV2Available()) {
      return this._placeOrderV2(userId, body, request, req, res);
    }

    // V2 unavailable → V1 fallback
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
    // V238: REMOVED V234/V237 duplicate-position check.
    // A professional trading platform MUST allow multiple positions on the
    // same symbol (averaging, pyramiding, grid, hedging). Each order creates
    // a separate position with a unique ID (like MT5 tickets).
    // Safety is enforced by UnifiedRiskService (margin, daily loss, etc.)
    // and IdempotencyService (prevents double-submit of the same order).

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
      // V240: Set source='user_manual' so risk check doesn't count manual trades
      // against the SmartExecutor's 5-position limit.
      source: 'user_manual',
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
    const riskResult = await this.unifiedRisk.validateOrder(command);

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
    // V249: Set source='user_manual' so TradingService creates the position
    // with the correct source (enables V243 risk bypass + V246 no auto-close)
    if (!request.source) {
      request.source = 'user_manual';
    }

    // ── V219: Risk Check via UnifiedRiskService ──
    const riskResult = await this.unifiedRisk.validateOrder({
      userId,
      exchangeCredentialId: request.credentialId,
      symbol: request.symbol,
      side: request.side as PrismaOrderSide,
      type: request.type as PrismaOrderType,
      quantity: request.quantity,
      price: request.price,
      stopLoss: request.stopLoss!,
      source: request.source,
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
      closeReason: 'USER_MANUAL', // V227: 'USER_' prefix for V214 — user-initiated closes always pass
      source: 'USER', // V227: Allow through V214 defense — traders MUST be able to close their own positions
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

  /**
   * V334: Backfill NULL credentialId on Trade records
   * POST /api/trading/backfill-credentials?apply=true
   *
   * Retroactively assigns credentialId to NULL trades for the authenticated user.
   * - DRY-RUN by default (returns what WOULD be updated)
   * - Pass apply=true to actually write to the DB
   *
   * Strategy:
   *   1. Copy from parent Position (via positionId) — most accurate
   *   2. Fallback to user's active credential (from Setting table)
   *   3. Fallback to user's oldest valid ExchangeCredential
   */
  @Post('backfill-credentials')
  async backfillCredentials(@Req() req: any, @Query('apply') apply?: string) {
    try {
      const userId = req.user.id;
      const shouldApply = apply === 'true' || apply === '1';
      this.logger.log(`🔧 V334: Backfilling NULL credentialId for user ${userId} (mode: ${shouldApply ? 'APPLY' : 'DRY_RUN'})`);
      const result = await this.tradingService.backfillTradeCredentials(userId, shouldApply);
      return { success: true, result };
    } catch (error: any) {
      this.logger.error(`V334 backfill-credentials failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * V336: Diagnostic — TP gap analysis for closed trades
   * GET /api/trading/diagnose/tp-gaps?limit=50&days=7
   *
   * Returns per-trade data showing:
   *   - Raw closeReason from DB (not the portfolio's AUTO/MANUAL/SL mapping)
   *   - takeProfit, stopLoss, entryPrice, exitPrice
   *   - highestPrice/lowestPrice (closest the market got to TP)
   *   - tpGapPercent: how far the best price was from TP
   *   - tpWasReached: did the market actually touch TP?
   *
   * READ-ONLY — no data modification.
   */
  @Get('diagnose/tp-gaps')
  async diagnoseTpGaps(@Req() req: any, @Query('limit') limit?: string, @Query('days') days?: string) {
    try {
      const userId = req.user.id;
      const parsedLimit = limit ? parseInt(limit, 10) : 50;
      const parsedDays = days ? parseInt(days, 10) : 7;
      this.logger.log(`🔬 V336: TP gap analysis for user ${userId} (limit=${parsedLimit}, days=${parsedDays})`);
      const result = await this.tradingService.diagnoseTradeTpGaps(userId, parsedLimit, parsedDays);
      return { success: true, diagnostic: result };
    } catch (error: any) {
      this.logger.error(`V336 TP gap analysis failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * V339 Phase 5: Price Integrity Check
   * GET /api/trading/diagnose/price-integrity?limit=100&days=30
   *
   * Verifies highestPrice/lowestPrice consistency for closed positions.
   * Returns violations where data is inconsistent.
   */
  @Get('diagnose/price-integrity')
  async diagnosePriceIntegrity(@Req() req: any, @Query('limit') limit?: string, @Query('days') days?: string) {
    try {
      const userId = req.user.id;
      const parsedLimit = limit ? parseInt(limit, 10) : 100;
      const parsedDays = days ? parseInt(days, 10) : 30;
      this.logger.log(`🔬 V339: Price integrity check for user ${userId} (limit=${parsedLimit}, days=${parsedDays})`);
      const result = await this.tradingService.diagnosePriceIntegrity(userId, parsedLimit, parsedDays);
      return { success: true, diagnostic: result };
    } catch (error: any) {
      this.logger.error(`V339 price integrity check failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * V339 Phase 6: Replay Debug — get full lifecycle log for a position
   * GET /api/trading/diagnose/lifecycle/:positionId
   *
   * Returns the complete event timeline for a position (OPEN → MONITOR_TICK → SL_UPDATE → CLOSE).
   * Use this to replay a trade decision-by-decision.
   */
  @Get('diagnose/lifecycle/:positionId')
  async getPositionLifecycle(@Req() req: any, @Param('positionId') positionId: string) {
    try {
      const userId = req.user.id;
      this.logger.log(`🔬 V339: Lifecycle replay for position ${positionId}`);
      // Use the lifecycle logger to get the timeline
      // We need to inject it — but to keep this simple, query directly
      const logs = await (this as any).tradingService.prisma.tradeLifecycleLog.findMany({
        where: { positionId, userId },
        orderBy: { createdAt: 'asc' },
      });
      return { success: true, positionId, userId, events: logs };
    } catch (error: any) {
      this.logger.error(`V339 lifecycle query failed: ${error.message}`, error.stack);
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
    return this.unifiedRisk.getRiskParameters();
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

    return this.unifiedRisk.calculatePositionSize(
      portfolioValue,
      entryPrice,
      stopLossPrice,
      riskPercent,
    );
  }

  /**
   * V349 DIAGNOSTIC: Test paper trade creation end-to-end.
   * GET /api/trading/diagnose/paper-trade-test?symbol=BTC/USDT&side=BUY&qty=0.001&sl=95000
   *
   * This endpoint SIMULATES a paper trade (no actual order placed) and reports:
   *   - Whether the active credential is paper-trading
   *   - Whether there's an existing OPEN position on the same symbol+side+credential
   *   - Whether the cooldown would block the trade
   *   - What the position WOULD look like (entryPrice, SL, TP, source)
   *
   * READ-ONLY — does NOT create any records. Use this to diagnose why paper
   * trades don't appear in the portfolio.
   */
  @Get('diagnose/paper-trade-test')
  async diagnosePaperTradeTest(
    @Req() req: any,
    @Query('symbol') symbol?: string,
    @Query('side') side?: string,
    @Query('qty') qty?: string,
    @Query('sl') sl?: string,
  ) {
    try {
      const userId = req.user.id;
      const testSymbol = symbol || 'BTC/USDT';
      const testSide = (side || 'BUY').toUpperCase() as 'BUY' | 'SELL';
      const testQty = qty ? parseFloat(qty) : 0.001;
      const testSl = sl ? parseFloat(sl) : 0;

      this.logger.log(`🔬 V349: Paper trade test for user ${userId} — ${testSide} ${testQty} ${testSymbol} SL=${testSl}`);

      const result: any = {
        userId,
        timestamp: new Date().toISOString(),
        testParams: { symbol: testSymbol, side: testSide, qty: testQty, sl: testSl },
        checks: {} as any,
      };

      // Check 1: Get user's active credential
      try {
        const setting = await this.prisma.setting.findFirst({
          where: { key: `user:${userId}:activeCredentialId` },
        });
        const activeCredId = setting?.value || null;

        if (!activeCredId) {
          result.checks.activeCredential = { status: 'NO_ACTIVE_CREDENTIAL', message: 'لا يوجد حساب نشط — اضبط حساب التداول في الإعدادات' };
          return { success: true, diagnostic: result };
        }

        const cred = await this.prisma.exchangeCredential.findUnique({
          where: { id: activeCredId },
          select: { id: true, exchange: true, isValid: true, testnet: true },
        });

        result.checks.activeCredential = {
          credentialId: activeCredId.slice(0, 12) + '...',
          exchange: cred?.exchange || 'NOT_FOUND',
          isValid: cred?.isValid,
          isPaper: cred?.exchange === 'paper-trading',
          isTestnet: cred?.testnet,
        };

        if (!cred) {
          result.checks.activeCredential.status = 'CREDENTIAL_NOT_FOUND';
          return { success: true, diagnostic: result };
        }

        if (!cred.isValid) {
          result.checks.activeCredential.status = 'CREDENTIAL_INVALID';
          return { success: true, diagnostic: result };
        }

        // Check 2: Existing OPEN positions on the same symbol+side (ALL credentials)
        const allExistingOpen = await this.prisma.position.findMany({
          where: { userId, symbol: testSymbol, status: 'OPEN', side: testSide as any },
          select: { id: true, credentialId: true, exchange: true, side: true, quantity: true, entryPrice: true, source: true, openedAt: true },
          orderBy: { openedAt: 'desc' },
        });

        result.checks.allOpenPositionsOnSymbol = allExistingOpen.map(p => ({
          id: p.id.slice(0, 12) + '...',
          credentialId: p.credentialId.slice(0, 12) + '...',
          isOnActiveCredential: p.credentialId === activeCredId,
          exchange: p.exchange,
          side: p.side,
          quantity: p.quantity.toNumber(),
          entryPrice: p.entryPrice.toNumber(),
          source: p.source,
          openedAt: p.openedAt,
        }));

        result.checks.openPositionsCount = allExistingOpen.length;
        result.checks.openPositionsOnActiveCredential = allExistingOpen.filter(p => p.credentialId === activeCredId).length;
        result.checks.openPositionsOnOtherCredentials = allExistingOpen.filter(p => p.credentialId !== activeCredId).length;

        // V349: Explain what WOULD happen with the new fix
        if (allExistingOpen.some(p => p.credentialId === activeCredId)) {
          result.checks.prediction = {
            action: 'WOULD_AVERAGE_INTO_EXISTING_POSITION',
            message: 'سيتم إضافة الكمية إلى المركز المفتوح على نفس الحساب (averaging)',
            note: 'لن يتم إنشاء مركز جديد — سيتم تحديث المركز الحالي بكمية وسعر متوسط',
          };
        } else if (allExistingOpen.length > 0) {
          result.checks.prediction = {
            action: 'WOULD_CREATE_NEW_POSITION',
            message: 'سيتم إنشاء مركز جديد على الحساب النشط (لا يوجد مركز مفتوح على نفس الحساب)',
            note: `يوجد ${allExistingOpen.length} مركز مفتوح على حسابات أخرى — لن يتم دمجهم بفضل إصلاح V349`,
          };
        } else {
          result.checks.prediction = {
            action: 'WOULD_CREATE_NEW_POSITION',
            message: 'سيتم إنشاء مركز جديد — لا توجد مراكز مفتوحة على هذا الرمز',
          };
        }

        // Check 3: Cooldown check (per-credential after V349)
        const COOLDOWN_MINUTES = 15;
        const recentlyClosed = await this.prisma.position.findFirst({
          where: {
            userId,
            symbol: testSymbol,
            status: { in: ['CLOSED', 'LIQUIDATED'] },
            closedAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
            credentialId: activeCredId,
          },
          orderBy: { closedAt: 'desc' },
          select: { id: true, closedAt: true, closeReason: true, credentialId: true },
        });

        if (recentlyClosed) {
          const closedAgo = Math.round((Date.now() - new Date(recentlyClosed.closedAt!).getTime()) / 60000);
          result.checks.cooldown = {
            status: 'BLOCKED_BY_COOLDOWN',
            closedMinutesAgo: closedAgo,
            cooldownMinutes: COOLDOWN_MINUTES,
            waitMinutes: COOLDOWN_MINUTES - closedAgo,
            closeReason: recentlyClosed.closeReason,
            positionId: recentlyClosed.id.slice(0, 12) + '...',
            note: 'ينطبق فقط على المصادر الآلية (smart_executor/agent) — الصفقات اليدوية تتجاوز هذا الفحص',
          };
        } else {
          result.checks.cooldown = { status: 'OK', message: 'لا يوجد cooldown على الحساب النشط' };
        }

        // Check 4: Paper balance check
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
        });
        const paperBalance = settings?.paperBalance ? Number(settings.paperBalance) : 0;
        result.checks.paperBalance = {
          balance: paperBalance,
          hasBalance: paperBalance > 0,
          fallback: paperBalance <= 0 ? 'سيتم استخدام 10000 كافتراضي' : 'none',
        };

        // Check 5: Recent positions (last 5) for context
        const recentPositions = await this.prisma.position.findMany({
          where: { userId },
          orderBy: { openedAt: 'desc' },
          take: 5,
          select: { id: true, symbol: true, side: true, status: true, exchange: true, credentialId: true, source: true, openedAt: true, closedAt: true, closeReason: true },
        });
        result.checks.recentPositions = recentPositions.map(p => ({
          id: p.id.slice(0, 12) + '...',
          symbol: p.symbol,
          side: p.side,
          status: p.status,
          exchange: p.exchange,
          credentialId: p.credentialId.slice(0, 12) + '...',
          isOnActiveCredential: p.credentialId === activeCredId,
          source: p.source,
          openedAt: p.openedAt,
          closedAt: p.closedAt,
          closeReason: p.closeReason,
        }));

      } catch (err: any) {
        result.checks.error = err.message;
      }

      return { success: true, diagnostic: result };
    } catch (error: any) {
      this.logger.error(`V349 paper trade test failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * V351 MASTER DIAGNOSTIC: Check everything at once.
   * GET /api/trading/diagnose/master?positionId=cmq...
   *
   * This endpoint checks:
   *   1. Deploy version (confirms V349/V350 is live)
   *   2. TradeLifecycleLogger.getInstance() status (DI resolution check)
   *   3. TradeLifecycleLog table existence (migration applied?)
   *   4. Total lifecycle events for this user (any logging happening?)
   *   5. Specific position details (does the position exist?)
   *   6. Lifecycle events for the specific position
   *
   * Use this to get a complete picture in ONE request.
   */
  @Get('diagnose/master')
  async diagnoseMaster(
    @Req() req: any,
    @Query('positionId') positionId?: string,
  ) {
    const userId = req.user.id;
    const result: any = {
      userId,
      timestamp: new Date().toISOString(),
      checks: {} as any,
    };

    // Check 1: Deploy version — confirms which code is running
    result.checks.deployVersion = {
      deployCommit: process.env.DEPLOY_COMMIT || 'unknown',
      buildCache: process.env.BUILD_CACHE || 'unknown',
      nodeEnv: process.env.NODE_ENV || 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
    };

    // Check 2: TradeLifecycleLogger static instance status
    try {
      // V348: Static instance pattern — if constructor ran, getInstance() returns the instance
      const { TradeLifecycleLogger } = await import('../../common/trade-lifecycle/trade-lifecycle.logger');
      const instance = TradeLifecycleLogger.getInstance();
      result.checks.lifecycleLogger = {
        staticInstanceExists: !!instance,
        status: instance ? '✅ ACTIVE — constructor ran, DI resolved' : '❌ NULL — constructor never ran (DI failure)',
        impact: instance
          ? 'Lifecycle logging SHOULD work — events will be written to DB'
          : 'Lifecycle logging WILL NOT work — all if(getLifecycle()) checks are skipped',
      };
    } catch (err: any) {
      result.checks.lifecycleLogger = { status: `IMPORT_ERROR: ${err.message}` };
    }

    // Check 3: PositionStateMachine static instance status
    try {
      const { PositionStateMachine } = await import('../../common/state-machine/position-state-machine.service');
      const instance = PositionStateMachine.getInstance();
      result.checks.stateMachine = {
        staticInstanceExists: !!instance,
        status: instance ? '✅ ACTIVE' : '❌ NULL — DI failure',
      };
    } catch (err: any) {
      result.checks.stateMachine = { status: `IMPORT_ERROR: ${err.message}` };
    }

    // Check 4: TradeLifecycleLog table existence + total events for user
    try {
      // Try a simple count query — if table doesn't exist, this throws
      const totalEvents = await this.prisma.tradeLifecycleLog.count({
        where: { userId },
      });
      result.checks.tradeLifecycleLogTable = {
        exists: true,
        totalEventsForUser: totalEvents,
        status: totalEvents > 0 ? '✅ Events ARE being logged' : '⚠️ Table exists but 0 events — logging code not running or failing',
      };

      // Get recent events (any position) for context
      if (totalEvents > 0) {
        const recentEvents = await this.prisma.tradeLifecycleLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { positionId: true, eventType: true, module: true, createdAt: true, reason: true },
        });
        result.checks.recentLifecycleEvents = recentEvents.map(e => ({
          positionId: e.positionId.slice(0, 12) + '...',
          eventType: e.eventType,
          module: e.module,
          createdAt: e.createdAt,
          reason: e.reason?.substring(0, 80),
        }));
      }
    } catch (err: any) {
      const errMsg = err.message || '';
      const isTableMissing = errMsg.includes('does not exist') || errMsg.includes('relation') || err.code === 'P2021';
      result.checks.tradeLifecycleLogTable = {
        exists: false,
        status: isTableMissing
          ? '❌ TABLE MISSING — migration 20260621000000_add_trade_lifecycle_log was NOT applied to production DB'
          : `❌ QUERY ERROR: ${errMsg.substring(0, 200)}`,
        fix: isTableMissing
          ? 'Run: prisma migrate deploy --schema=./prisma/schema.prisma (on Railway shell or restart to trigger start.sh migration)'
          : 'Check Prisma client generation',
      };
    }

    // Check 5: Position details (if positionId provided)
    if (positionId) {
      // Sanitize positionId — strip any trailing JS code (defensive against copy-paste errors)
      const cleanPositionId = positionId.split("'")[0].split(')')[0].trim();

      try {
        const position = await this.prisma.position.findFirst({
          where: { id: cleanPositionId, userId },
          select: {
            id: true,
            symbol: true,
            side: true,
            status: true,
            exchange: true,
            source: true,
            quantity: true,
            entryPrice: true,
            stopLoss: true,
            takeProfit: true,
            openedAt: true,
            closedAt: true,
            closeReason: true,
            credentialId: true,
          },
        });

        result.checks.position = position
          ? {
              exists: true,
              id: position.id,
              symbol: position.symbol,
              side: position.side,
              status: position.status,
              exchange: position.exchange,
              source: position.source,
              quantity: position.quantity.toNumber(),
              entryPrice: position.entryPrice.toNumber(),
              stopLoss: position.stopLoss?.toNumber() ?? null,
              takeProfit: position.takeProfit?.toNumber() ?? null,
              openedAt: position.openedAt,
              closedAt: position.closedAt,
              closeReason: position.closeReason,
              credentialId: position.credentialId.slice(0, 12) + '...',
              isPaper: position.exchange === 'paper-trading',
            }
          : {
              exists: false,
              searchedId: cleanPositionId,
              note: 'Position not found — check the positionId (make sure no JS code is appended)',
            };

        // Check 6: Lifecycle events for this specific position
        if (position) {
          try {
            const events = await this.prisma.tradeLifecycleLog.findMany({
              where: { positionId: cleanPositionId, userId },
              orderBy: { createdAt: 'asc' },
            });
            result.checks.positionLifecycle = {
              eventsCount: events.length,
              events: events.map(e => ({
                eventType: e.eventType,
                module: e.module,
                closingSource: e.closingSource,
                reason: e.reason,
                price: e.price?.toNumber() ?? null,
                createdAt: e.createdAt,
              })),
              status: events.length > 0 ? '✅ Events found' : '⚠️ No events — OPEN event was not logged (DI failure or table missing)',
            };
          } catch (err: any) {
            result.checks.positionLifecycle = { error: err.message?.substring(0, 200) };
          }
        }
      } catch (err: any) {
        result.checks.position = { error: err.message?.substring(0, 200) };
      }
    }

    // Check 7: Recent positions (last 3) for context
    try {
      const recentPositions = await this.prisma.position.findMany({
        where: { userId },
        orderBy: { openedAt: 'desc' },
        take: 3,
        select: { id: true, symbol: true, side: true, status: true, source: true, exchange: true, openedAt: true, credentialId: true },
      });
      result.checks.recentPositions = recentPositions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        status: p.status,
        source: p.source,
        exchange: p.exchange,
        openedAt: p.openedAt,
        credentialId: p.credentialId.slice(0, 12) + '...',
        isPaper: p.exchange === 'paper-trading',
      }));
    } catch (err: any) {
      result.checks.recentPositions = { error: err.message?.substring(0, 200) };
    }

    // V351: Check 8 — PositionMonitor health (the critical missing piece)
    // If MONITOR_TICK events are missing, this will tell us WHY:
    //   - Is Redis 'monitor:last_cycle' set? (confirms monitor is running)
    //   - What was the last cycle timestamp?
    //   - How many positions did it process?
    try {
      // V351c: Check Redis for monitor heartbeat
      // 'monitor:heartbeat' is written at the START of every @Interval invocation (V351c)
      // 'monitor:last_cycle' is written at the END of every successful cycle
      // Comparing both tells us exactly where the monitor fails:
      //   - No heartbeat → @Interval not firing at all
      //   - Heartbeat fresh, no last_cycle → cycle starts but throws before completing
      //   - Both fresh → monitor working
      let monitorHeartbeat: any = null;
      let monitorStartHeartbeat: any = null;
      try {
        const heartbeatRaw = await this.redis.get('monitor:last_cycle');
        monitorHeartbeat = heartbeatRaw ? JSON.parse(heartbeatRaw) : null;
        const startHeartbeatRaw = await this.redis.get('monitor:heartbeat');
        monitorStartHeartbeat = startHeartbeatRaw ? JSON.parse(startHeartbeatRaw) : null;
      } catch (e: any) {
        monitorHeartbeat = { error: e.message?.substring(0, 200) };
      }

      // V351c: Check Redis availability
      const redisAvailable = this.redis.getIsAvailable?.() ?? false;

      // Get ALL MONITOR_TICK events globally (across all users)
      const globalMonitorTicks = await this.prisma.tradeLifecycleLog.count({
        where: { eventType: 'MONITOR_TICK' },
      });
      const globalOpenEvents = await this.prisma.tradeLifecycleLog.count({
        where: { eventType: 'OPEN' },
      });
      const globalCloseEvents = await this.prisma.tradeLifecycleLog.count({
        where: { eventType: { in: ['CLOSE_REQUEST', 'CLOSE_EXECUTED', 'CLOSE_BLOCKED'] } },
      });
      const globalSlUpdates = await this.prisma.tradeLifecycleLog.count({
        where: { eventType: 'SL_UPDATE' },
      });

      // V351c: Count ALL open positions globally (not just this user's)
      const allOpenPositions = await this.prisma.position.count({
        where: { status: 'OPEN' },
      });

      result.checks.monitorHealth = {
        redisAvailable,
        monitorHeartbeat,  // 'monitor:last_cycle' — written at END of successful cycle
        monitorStartHeartbeat,  // 'monitor:heartbeat' — written at START of every @Interval call (V351c)
        startHeartbeatAgeSeconds: monitorStartHeartbeat?.timestamp
          ? Math.round((Date.now() - new Date(monitorStartHeartbeat.timestamp).getTime()) / 1000)
          : null,
        heartbeatAgeSeconds: monitorHeartbeat?.timestamp
          ? Math.round((Date.now() - new Date(monitorHeartbeat.timestamp).getTime()) / 1000)
          : null,
        // V351d: Quote fetch stats from last cycle — reveals why MONITOR_TICK is 0
        quoteSuccessCount: monitorHeartbeat?.quoteSuccessCount ?? null,
        quoteFailCount: monitorHeartbeat?.quoteFailCount ?? null,
        quoteFailuresBySymbol: monitorHeartbeat?.quoteFailuresBySymbol ?? null,
        globalOpenPositions: allOpenPositions,
        globalMonitorTicks,
        globalOpenEvents,
        globalCloseEvents,
        globalSlUpdates,
        status: (() => {
          if (!redisAvailable) return '❌ Redis is DOWN — monitor cannot write heartbeat or acquire locks. Monitor may be skipping all cycles.';
          const startAge = monitorStartHeartbeat?.timestamp
            ? Math.round((Date.now() - new Date(monitorStartHeartbeat.timestamp).getTime()) / 1000)
            : null;
          // V351c: If start heartbeat is fresh, @Interval IS firing
          if (startAge !== null && startAge <= 5) {
            // @Interval is firing — check if cycle completes
            if (monitorHeartbeat) {
              const endAge = Math.round((Date.now() - new Date(monitorHeartbeat.timestamp).getTime()) / 1000);
              if (endAge <= 5) {
                // V351d: Check quote fetch stats
                const qSuccess = monitorHeartbeat.quoteSuccessCount ?? 0;
                const qFail = monitorHeartbeat.quoteFailCount ?? 0;
                if (qFail > 0 && qSuccess === 0) {
                  return `❌ Monitor runs but ALL ${qFail} quote fetches FAILED — exchangeService.getQuote() is broken. Sample: ${JSON.stringify(monitorHeartbeat.quoteFailuresBySymbol || {}).substring(0, 300)}`;
                }
                if (qFail > 0 && qSuccess > 0) {
                  return `⚠️ Monitor runs: ${qSuccess} quotes OK, ${qFail} FAILED. Some positions monitored, some not.`;
                }
                if (globalMonitorTicks === 0 && allOpenPositions > 0) {
                  return `⚠️ Monitor @Interval fires AND completes but 0 MONITOR_TICK — all positions fail before reaching log line`;
                }
                return `✅ Monitor is running (start ${startAge}s ago, end ${endAge}s ago, ${monitorHeartbeat.positionsMonitored} positions, ${qSuccess} quotes OK)`;
              }
              return `⚠️ @Interval fires (start ${startAge}s) but last completed cycle was ${endAge}s ago — cycles are slow or stuck`;
            }
            return `❌ @Interval IS firing (start ${startAge}s ago) but NO cycle ever completes — cycle throws before reaching the end. Check Railway logs for "Position monitor cycle failed". Likely: prisma.enableRlsBypass() throws, or self-healing disabled monitor, or DB query fails.`;
          }
          // No fresh start heartbeat
          if (!monitorStartHeartbeat) {
            if (globalMonitorTicks > 0) return '⚠️ No start heartbeat but MONITOR_TICK events exist — monitor ran before V351c deploy';
            return '❌ NO start heartbeat AND 0 MONITOR_TICK — @Interval is NOT firing at all. ScheduleModule may not be registered, or PositionMonitor constructor threw before @Interval could register.';
          }
          return `❌ Start heartbeat is STALE (${startAge}s old) — @Interval stopped firing ${startAge}s ago. Monitor may have crashed.`;
        })(),
        diagnosis: (() => {
          if (globalMonitorTicks > 0) return 'Monitor logging works for some positions';
          if (!redisAvailable) return 'Redis is down — monitor cannot function. Check REDIS_URL env var.';
          const startAge = monitorStartHeartbeat?.timestamp
            ? Math.round((Date.now() - new Date(monitorStartHeartbeat.timestamp).getTime()) / 1000)
            : null;
          if (startAge === null || startAge > 5) {
            return '❌ @Interval is NOT firing. Likely causes: (a) ScheduleModule.forRoot() not registered, (b) PositionMonitor constructor threw, (c) NestJS DI did not instantiate PositionMonitorService. Check Railway startup logs for "🛡️ Position Monitor initialized".';
          }
          if (!monitorHeartbeat) {
            return '❌ @Interval IS firing but cycle never completes. Likely: (a) prisma.enableRlsBypass() throws, (b) self-healing disabled position-monitor, (c) DB query for open positions fails. Check Railway logs for "🛡️ Position monitor cycle failed".';
          }
          // V351d: Check quote fetch stats
          const qSuccess = monitorHeartbeat.quoteSuccessCount ?? 0;
          const qFail = monitorHeartbeat.quoteFailCount ?? 0;
          if (qFail > 0 && qSuccess === 0) {
            const failures = monitorHeartbeat.quoteFailuresBySymbol || {};
            const sample = Object.entries(failures).slice(0, 3).map(([s, e]) => `${s}: ${e}`).join(' | ');
            return `❌ ROOT CAUSE FOUND: exchangeService.getQuote() fails for ALL symbols. ${qFail} failures, 0 successes. Sample: ${sample}. Fix the exchange adapter configuration (Binance/OANDA/TwelveData API keys, network access, etc.).`;
          }
          if (globalMonitorTicks === 0 && allOpenPositions > 0) {
            return '⚠️ Monitor runs and completes but 0 MONITOR_TICK — all positions fail before reaching the MONITOR_TICK log line. Likely: exchangeService.getQuote() fails for all symbols. Check ExchangeService logs.';
          }
          return 'No events at all — lifecycle logging is completely broken';
        })(),
      };

      // V351: Check for the specific position's MONITOR_TICK events
      if (positionId) {
        const cleanPositionId = positionId.split("'")[0].split(')')[0].trim();
        const positionTicks = await this.prisma.tradeLifecycleLog.count({
          where: { positionId: cleanPositionId, eventType: 'MONITOR_TICK' },
        });
        result.checks.positionMonitorTicks = {
          count: positionTicks,
          status: positionTicks > 0
            ? '✅ This position IS being monitored'
            : '❌ ZERO MONITOR_TICK for this position — it is NOT being monitored by PositionMonitor',
        };
      }
    } catch (err: any) {
      result.checks.monitorHealth = { error: err.message?.substring(0, 200) };
    }

    // Summary
    result.summary = {
      deployLive: result.checks.deployVersion?.deployCommit !== 'unknown',
      lifecycleLoggerActive: result.checks.lifecycleLogger?.staticInstanceExists === true,
      stateMachineActive: result.checks.stateMachine?.staticInstanceExists === true,
      lifecycleTableExists: result.checks.tradeLifecycleLogTable?.exists === true,
      anyEventsLogged: (result.checks.tradeLifecycleLogTable?.totalEventsForUser ?? 0) > 0,
      positionFound: result.checks.position?.exists === true,
      positionHasLifecycle: (result.checks.positionLifecycle?.eventsCount ?? 0) > 0,
      monitorLoggingTicks: (result.checks.monitorHealth?.globalMonitorTicks ?? 0) > 0,
      positionIsMonitored: (result.checks.positionMonitorTicks?.count ?? 0) > 0,
    };

    result.diagnosis = (() => {
      const s = result.summary;
      if (!s.deployLive) return '⚠️ Deploy commit unknown — Railway build may have failed';
      if (!s.lifecycleTableExists) return '❌ TradeLifecycleLog table missing — migration not applied. Run prisma migrate deploy.';
      if (!s.lifecycleLoggerActive) return '❌ TradeLifecycleLogger static instance is NULL — constructor never ran. DI failure persists despite V347/V348.';
      if (!s.anyEventsLogged) return '⚠️ Logger is active and table exists, but 0 events logged. OPEN event logging code path may have a bug.';
      if (!s.monitorLoggingTicks) return '❌ ZERO MONITOR_TICK events globally — PositionMonitor @Interval is not running, OR getLifecycle() returns null inside it, OR all positions fail before reaching MONITOR_TICK log line. This is the critical issue to fix next.';
      if (positionId && s.positionFound && !s.positionIsMonitored) return '⚠️ Position exists, monitor logs ticks globally, but THIS position has 0 MONITOR_TICK — possibly quote fetch fails for this symbol, or position was excluded';
      if (positionId && s.positionFound && !s.positionHasLifecycle) return '⚠️ Position exists but has 0 lifecycle events. This specific position may have been created before V339 was deployed.';
      if (positionId && !s.positionFound) return '❌ Position not found — check the positionId (was it created on this user account?)';
      return '✅ Everything looks healthy — lifecycle logging is working';
    })();

    return { success: true, diagnostic: result };
  }
}
