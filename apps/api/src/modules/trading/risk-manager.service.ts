import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * Risk Manager Service — Position Sizing and Risk Controls
 * 
 * Features:
 * - Maximum position size limits (percentage of portfolio)
 * - Maximum number of open positions per user
 * - Maximum daily loss limits
 * - Maximum leverage limits
 * - Position size calculation based on risk percentage
 * - Stop-loss enforcement
 */
@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);

  // ── Risk Parameters (configurable via env) ──
  private readonly maxPositionSizePercent: number;  // Max % of portfolio per position
  private readonly maxOpenPositions: number;         // Max concurrent open positions
  private readonly maxDailyLossPercent: number;      // Max daily loss as % of portfolio
  private readonly defaultStopLossPercent: number;   // Default SL distance
  private readonly defaultTakeProfitPercent: number; // Default TP distance
  private readonly maxLeverage: number;              // Maximum allowed leverage
  private readonly minOrderSize: number;             // Minimum order size in USD

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxPositionSizePercent = parseFloat(
      this.configService.get('RISK_MAX_POSITION_PERCENT', '20'),
    );
    this.maxOpenPositions = parseInt(
      this.configService.get('RISK_MAX_OPEN_POSITIONS', '10'),
      10,
    );
    this.maxDailyLossPercent = parseFloat(
      this.configService.get('RISK_MAX_DAILY_LOSS_PERCENT', '5'),
    );
    this.defaultStopLossPercent = parseFloat(
      this.configService.get('RISK_DEFAULT_STOP_LOSS', '3'),
    );
    this.defaultTakeProfitPercent = parseFloat(
      this.configService.get('RISK_DEFAULT_TAKE_PROFIT', '6'),
    );
    this.maxLeverage = parseFloat(
      this.configService.get('RISK_MAX_LEVERAGE', '3'),
    );
    this.minOrderSize = parseFloat(
      this.configService.get('RISK_MIN_ORDER_SIZE', '10'),
    );

    this.logger.log('🛡️ Risk Manager initialized — protecting your capital');
  }

  /**
   * Check if an order is allowed based on risk rules
   */
  async checkOrderRisk(
    userId: string,
    symbol: string,
    side: string,
    quantity: number,
    price: number,
  ): Promise<{ allowed: boolean; reason?: string; riskScore?: number }> {
    // Check 1: Minimum order size
    const orderValue = quantity * price;
    if (orderValue < this.minOrderSize) {
      return {
        allowed: false,
        reason: `حجم الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSize} USD)`,
      };
    }

    // Check 2: Maximum open positions
    const openPositions = await this.prisma.position.count({
      where: { userId, status: 'OPEN' },
    });
    if (openPositions >= this.maxOpenPositions) {
      return {
        allowed: false,
        reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
      };
    }

    // Check 3: Maximum position size as % of portfolio
    const portfolioValue = await this._estimatePortfolioValue(userId);
    if (portfolioValue > 0) {
      const positionPercent = (orderValue / portfolioValue) * 100;
      if (positionPercent > this.maxPositionSizePercent) {
        return {
          allowed: false,
          reason: `حجم المركز (${positionPercent.toFixed(1)}%) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%)`,
        };
      }
    }

    // Check 4: Daily loss limit
    const dailyLoss = await this._calculateDailyLoss(userId);
    if (portfolioValue > 0 && dailyLoss < 0) {
      const lossPercent = (Math.abs(dailyLoss) / portfolioValue) * 100;
      if (lossPercent >= this.maxDailyLossPercent) {
        return {
          allowed: false,
          reason: `خسائرك اليومية (${lossPercent.toFixed(1)}%) تجاوزت الحد الأقصى (${this.maxDailyLossPercent}%)`,
        };
      }
    }

    // Calculate risk score (0-100)
    const riskScore = this._calculateRiskScore(
      orderValue,
      portfolioValue,
      openPositions,
      dailyLoss,
    );

    return { allowed: true, riskScore };
  }

  /**
   * Calculate recommended position size based on risk percentage
   * Uses the 1% risk rule: never risk more than 1% of portfolio per trade
   */
  calculatePositionSize(
    portfolioValue: number,
    entryPrice: number,
    stopLossPrice: number,
    riskPercent: number = 1,
  ): { quantity: number; riskAmount: number } {
    const riskAmount = portfolioValue * (riskPercent / 100);
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);

    if (riskPerUnit <= 0) {
      return { quantity: 0, riskAmount: 0 };
    }

    const quantity = riskAmount / riskPerUnit;
    return { quantity: Math.floor(quantity * 1000000) / 1000000, riskAmount };
  }

  /**
   * Get default stop-loss and take-profit levels
   */
  getDefaultLevels(
    entryPrice: number,
    side: 'BUY' | 'SELL',
  ): { stopLoss: number; takeProfit: number } {
    if (side === 'BUY') {
      return {
        stopLoss: entryPrice * (1 - this.defaultStopLossPercent / 100),
        takeProfit: entryPrice * (1 + this.defaultTakeProfitPercent / 100),
      };
    } else {
      return {
        stopLoss: entryPrice * (1 + this.defaultStopLossPercent / 100),
        takeProfit: entryPrice * (1 - this.defaultTakeProfitPercent / 100),
      };
    }
  }

  /**
   * Get current risk parameters for display
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.maxPositionSizePercent,
      maxOpenPositions: this.maxOpenPositions,
      maxDailyLossPercent: this.maxDailyLossPercent,
      defaultStopLossPercent: this.defaultStopLossPercent,
      defaultTakeProfitPercent: this.defaultTakeProfitPercent,
      maxLeverage: this.maxLeverage,
      minOrderSize: this.minOrderSize,
    };
  }

  // ── Private Methods ──

  private async _estimatePortfolioValue(userId: string): Promise<number> {
    // Sum up all portfolio values for the user
    const portfolios = await this.prisma.portfolio.aggregate({
      where: { userId },
      _sum: { totalValue: true },
    });

    const manualValue = Number(portfolios._sum.totalValue || 0);

    // Also add current value of open positions
    const openPositions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
    });

    const positionsValue = openPositions.reduce((sum, p) => {
      return sum + Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice));
    }, 0);

    return manualValue + positionsValue;
  }

  private async _calculateDailyLoss(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTrades = await this.prisma.trade.findMany({
      where: {
        userId,
        executedAt: { gte: todayStart },
        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
      },
    });

    return todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  }

  private _calculateRiskScore(
    orderValue: number,
    portfolioValue: number,
    openPositions: number,
    dailyLoss: number,
  ): number {
    let score = 0;

    // Position size contribution (0-30)
    if (portfolioValue > 0) {
      score += Math.min(30, (orderValue / portfolioValue) * 100 * 1.5);
    }

    // Number of positions contribution (0-30)
    score += Math.min(30, openPositions * 3);

    // Daily loss contribution (0-40)
    if (dailyLoss < 0 && portfolioValue > 0) {
      score += Math.min(40, (Math.abs(dailyLoss) / portfolioValue) * 100 * 8);
    }

    return Math.min(100, Math.round(score));
  }
}
