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
  OrderSide,
  OrderType,
} from './trading.types';

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
   * Place a new order
   * POST /api/trading/orders
   */
  @Post('orders')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async placeOrder(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;

    const request: PlaceOrderRequest = {
      credentialId: body.credentialId,
      symbol: body.symbol,
      side: body.side as OrderSide,
      type: body.type as OrderType,
      quantity: parseFloat(body.quantity),
      price: body.price ? parseFloat(body.price) : undefined,
      stopLoss: body.stopLoss ? parseFloat(body.stopLoss) : undefined,
      takeProfit: body.takeProfit ? parseFloat(body.takeProfit) : undefined,
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
    if (!body.stopLoss || parseFloat(body.stopLoss) <= 0) {
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
      side: request.side as any,
      type: request.type as any,
      quantity: request.quantity,
      price: request.price,
      stopLoss: request.stopLoss!,
      // FIX: Deterministic idempotency key based on order parameters.
      // Previously `v1-${Date.now()}-${symbol}` was always unique, defeating
      // the purpose of idempotency (preventing double-orders on network retries).
      // Now the key is derived from userId+symbol+side+type+quantity+price, so
      // identical retries within the same second are deduplicated.
      idempotencyKey: `v1-${userId}-${request.symbol}-${request.side}-${request.type}-${request.quantity}-${request.price || 'market'}`,
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
  ) {
    try {
      const userId = req.user.id;
      this.logger.log(`📋 Fetching closed positions for user: ${userId}`);
      return await this.tradingService.getClosedPositions(
        userId,
        limit ? (parseInt(limit, 10) || 100) : 100,
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
  async closePosition(@Req() req: any, @Body() body: any) {
    const request: ClosePositionRequest = {
      positionId: body.positionId,
      quantity: body.quantity ? parseFloat(body.quantity) : undefined,
    };

    if (!request.positionId) {
      throw new BadRequestException('معرف المركز مطلوب');
    }

    return this.tradingService.closePosition(
      req.user.id,
      request,
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
  ) {
    try {
      const userId = req.user.id;
      return await this.tradingService.getTradeHistory(
        userId,
        limit ? (parseInt(limit, 10) || 50) : 50,
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
