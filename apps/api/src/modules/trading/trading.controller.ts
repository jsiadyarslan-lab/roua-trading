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
} from '@nestjs/common';
import { TradingService } from './trading.service';
import { RiskManagerService } from './risk-manager.service';
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
 * All endpoints require authentication via AuthGuard
 */
@Controller('trading')
@UseGuards(AuthGuard)
export class TradingController {
  constructor(
    private readonly tradingService: TradingService,
    private readonly riskManager: RiskManagerService,
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
      stopPrice: body.stopPrice ? parseFloat(body.stopPrice) : undefined,
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
      throw new Error(
        'بيانات الطلب غير مكتملة — يرجى تعبئة جميع الحقول المطلوبة',
      );
    }

    if (!['BUY', 'SELL'].includes(request.side)) {
      throw new Error('جانب الطلب يجب أن يكون BUY أو SELL');
    }

    if (
      !['MARKET', 'LIMIT', 'STOP_LIMIT', 'TAKE_PROFIT'].includes(
        request.type,
      )
    ) {
      throw new Error('نوع الطلب غير صالح');
    }

    if (request.quantity <= 0) {
      throw new Error('الكمية يجب أن تكون أكبر من صفر');
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
      limit: limit ? parseInt(limit, 10) : undefined,
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
    return this.tradingService.getOpenPositions(req.user.id);
  }

  /**
   * Get position summary
   * GET /api/trading/positions/summary
   */
  @Get('positions/summary')
  async getPositionSummary(@Req() req: any) {
    return this.tradingService.getPositionSummary(req.user.id);
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
      throw new Error('معرف المركز مطلوب');
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
    return this.tradingService.getTradeHistory(
      req.user.id,
      limit ? parseInt(limit, 10) : 50,
    );
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
      throw new Error(
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
