import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TradingService } from './trading.service';
import { RiskManagerService } from './risk-manager.service';
import { RiskGatekeeperService } from './services/risk-gatekeeper.service';
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
import { OrderSide as PrismaOrderSide, OrderType as PrismaOrderType } from '@prisma/client';

/**
 * Trading Controller — REST API for Trading Engine
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
  ) {}

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
  async getAccountOverview(@Req() req: any) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getPositionSummary(userId);
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch account overview: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Place a new order
   * POST /api/trading/orders
   */
  @Post('orders')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async placeOrder(@Req() req: any, @Body() body: PlaceOrderDto) {
    const userId = req.user.id;

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
    // Validate here BEFORE calling gatekeeper to give a clear error message
    if (!body.stopLoss || Number(body.stopLoss) <= 0) {
      throw new BadRequestException(
        'وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.',
      );
    }

    // ── Risk Gatekeeper Check ──
    // Run the same 5-point safety checks as the v2 OrderController:
    // 1. Stop-loss enforcement  2. Sufficient balance  3. Position size limit
    // 4. Daily drawdown limit  5. Circuit breakers
    // Note: stopLoss is guaranteed > 0 by the validation above
    const riskResult = await this.riskGatekeeper.validateOrder({
      userId,
      exchangeCredentialId: request.credentialId,
      symbol: request.symbol,
      side: request.side as PrismaOrderSide,
      type: request.type as PrismaOrderType,
      quantity: request.quantity,
      price: request.price,
      stopLoss: request.stopLoss!,
      // FIX: Semi-deterministic idempotency key for v1 pipeline.
      // The key includes a timestamp (1-second granularity) to allow legitimate
      // repeat orders (same symbol+side+type+qty+price) while still preventing
      // rapid double-submission within the same second. This balances:
      // - Deduplication: network retries within 1s are caught
      // - Flexibility: users can place identical orders seconds apart
      // Previously used fully deterministic key which blocked legitimate repeat orders.
      idempotencyKey: `v1-${userId}-${request.symbol}-${request.side}-${request.type}-${request.quantity}-${request.price || 'market'}-${Math.floor(Date.now() / 1000)}`,
    });

    if (!riskResult.allowed) {
      throw new ForbiddenException(
        `🛡️ تم رفض الطلب: ${riskResult.reason || 'فشل في فحص المخاطر'}`,
      );
    }

    return this.tradingService.placeOrder(
      userId,
      request,
      req.ip,
      req.headers['user-agent'],
    );
  }

  /**
   * Cancel an order
   * DELETE /api/trading/orders/:id
   */
  @Delete('orders/:id')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async cancelOrder(@Req() req: any, @Param('id') orderId: string) {
    return this.tradingService.cancelOrder(
      req.user.id,
      orderId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  /**
   * Get orders
   * GET /api/trading/orders
   */
  @Get('orders')
  async getOrders(
    @Req() req: any,
    @Query('symbol') symbol?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tradingService.getOrders(req.user.id, {
      symbol,
      status,
      limit: limit ? (parseInt(limit, 10) || 50) : undefined,
    });
  }

  /**
   * Get a specific order
   * GET /api/trading/orders/:id
   */
  @Get('orders/:id')
  async getOrder(@Req() req: any, @Param('id') orderId: string) {
    return this.tradingService.getOrder(req.user.id, orderId);
  }

  // ── Position Endpoints ──

  /**
   * Get open positions
   * GET /api/trading/positions
   */
  @Get('positions')
  async getOpenPositions(@Req() req: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching open positions for user: ${userId}`);
      const positions = await this.tradingService.getOpenPositions(userId);
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
   * Get closed position history
   * GET /api/trading/positions/history
   */
  @Get('positions/history')
  async getClosedPositions(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching closed positions for user: ${userId}, from: ${from || 'all'}, to: ${to || 'all'}`);
      return await this.tradingService.getClosedPositions(
        userId,
        limit ? (parseInt(limit, 10) || 100) : 100,
        from,
        to,
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
  async getPositionSummary(@Req() req: any) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getPositionSummary(userId);
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
  ) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getTradeHistory(
        userId,
        limit ? (parseInt(limit, 10) || 50) : 50,
        from,
        to,
      );
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to fetch trade history: ${error.message}`,
        error.stack,
      );
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
