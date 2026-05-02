// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Risk Calculator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RiskAssessment, AgentConfig } from '../types/agent.types';
import { EvaluatedSignal } from '../types/agent.types';

/**
 * RiskCalculatorService — Smart risk management engine
 *
 * Calculates position size, validates risk limits, and ensures
 * every trade adheres to the strict safety rules of the platform.
 *
 * Safety Rules (NON-NEGOTIABLE):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Stop-loss is MANDATORY for every position               │
 * │ 2. Max position size: 1-2% of portfolio per trade          │
 * │ 3. Max daily loss: 5% of portfolio — agent auto-stops      │
 * │ 4. Max open positions: 5 per user                          │
 * │ 5. Risk-reward ratio must be >= 1:1.5                      │
 * │ 6. No new trades if daily loss limit reached                │
 * │ 7. No withdrawal capability (trading permissions only)      │
 * │ 8. Full audit trail for every risk decision                 │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class RiskCalculatorService {
  private readonly logger = new Logger(RiskCalculatorService.name);

  // Default risk parameters (overridden by agent config and DB settings)
  private defaultMaxPositionSizePercent = 2;
  private defaultMaxDailyLossPercent = 5;
  private defaultMaxOpenPositions = 5;
  private defaultRiskPerTradePercent = 1.5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    // Load defaults from env
    this.defaultMaxPositionSizePercent = parseFloat(
      this.configService.get('MAX_POSITION_SIZE_PERCENT', '2'),
    );
    this.defaultMaxDailyLossPercent = parseFloat(
      this.configService.get('MAX_DAILY_LOSS_PERCENT', '5'),
    );
    this.defaultMaxOpenPositions = parseInt(
      this.configService.get('MAX_OPEN_POSITIONS', '5'),
      10,
    );

    this.logger.log('🛡️ Risk Calculator initialized — capital protection active');
  }

  /**
   * Full risk assessment for a potential trade
   * Returns whether the trade is allowed and all calculated risk metrics
   */
  async assessRisk(
    userId: string,
    signal: EvaluatedSignal,
    config: AgentConfig,
  ): Promise<RiskAssessment> {
    // Step 1: Get current portfolio value
    const portfolioValue = await this._getPortfolioValue(userId);

    // Step 2: Calculate daily P&L
    const dailyPnL = await this._getDailyPnL(userId);
    const dailyLossPercent = portfolioValue > 0
      ? (Math.abs(Math.min(0, dailyPnL)) / portfolioValue) * 100
      : 0;

    // Step 3: Count open positions
    const openPositionsCount = await this._getOpenPositionsCount(userId);

    // Step 4: Apply risk limits from config (or defaults)
    const maxPositionSizePercent = config.maxPositionSizePercent || this.defaultMaxPositionSizePercent;
    const maxDailyLossPercent = config.maxDailyLossPercent || this.defaultMaxDailyLossPercent;
    const maxOpenPositions = config.maxOpenPositions || this.defaultMaxOpenPositions;
    const riskPerTradePercent = config.riskPerTradePercent || this.defaultRiskPerTradePercent;

    // Step 5: Calculate position size
    const positionSize = this._calculatePositionSize(
      portfolioValue,
      riskPerTradePercent,
      signal.entryPrice,
      signal.stopLoss,
    );

    // Step 6: Calculate risk-reward ratio
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfit - signal.entryPrice);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    // Step 7: Calculate risk score (0-100)
    const riskScore = this._calculateRiskScore({
      positionSize,
      portfolioValue,
      maxPositionSizePercent,
      openPositionsCount,
      maxOpenPositions,
      dailyLossPercent,
      maxDailyLossPercent,
      riskRewardRatio,
      volatility: signal.metadata?.volatility,
    });

    // Step 8: Validate all safety rules
    let canTrade = true;
    let reason: string | undefined;

    // RULE 1: Mandatory stop-loss (already enforced by strategy, but double-check)
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      canTrade = false;
      reason = 'وقف الخسارة إجباري — لا يمكن فتح مركز بدون وقف خسارة';
    }

    // RULE 2: Daily loss limit
    if (dailyLossPercent >= maxDailyLossPercent) {
      canTrade = false;
      reason = `الخسارة اليومية (${dailyLossPercent.toFixed(1)}%) تجاوزت الحد (${maxDailyLossPercent}%) — توقف الوكيل تلقائياً`;
    }

    // RULE 3: Max open positions
    if (openPositionsCount >= maxOpenPositions) {
      canTrade = false;
      reason = `عدد المراكز المفتوحة (${openPositionsCount}) بلغ الحد الأقصى (${maxOpenPositions})`;
    }

    // RULE 4: Position size within limit
    const positionValuePercent = portfolioValue > 0
      ? (positionSize * signal.entryPrice / portfolioValue) * 100
      : 0;

    if (positionValuePercent > maxPositionSizePercent) {
      canTrade = false;
      reason = `حجم المركز (${positionValuePercent.toFixed(1)}%) يتجاوز الحد (${maxPositionSizePercent}%)`;
    }

    // RULE 5: Risk-reward ratio
    if (riskRewardRatio < 1.5) {
      canTrade = false;
      reason = `نسبة المخاطرة للمكافأة (${riskRewardRatio.toFixed(2)}) أقل من الحد الأدنى (1.5)`;
    }

    // RULE 6: No duplicate positions for same symbol
    const existingPosition = await this._hasOpenPosition(userId, signal.symbol);
    if (existingPosition) {
      canTrade = false;
      reason = `يوجد مركز مفتوح بالفعل لـ ${signal.symbol}`;
    }

    // RULE 7: Check if AUTO_TRADING_ENABLED
    const autoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
    if (!autoTradingEnabled) {
      canTrade = false;
      reason = 'التداول الذاتي معطّل — يمكن تفعيله عبر AUTO_TRADING_ENABLED';
    }

    if (canTrade) {
      this.logger.debug(
        `🛡️ Trade allowed: ${signal.action} ${signal.symbol} ` +
        `qty=${positionSize.toFixed(6)} risk=${riskScore}`,
      );
    } else {
      this.logger.warn(`🛡️ Trade rejected: ${reason}`);
    }

    return {
      canTrade,
      reason,
      positionSize,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      riskRewardRatio,
      riskScore,
      dailyPnL,
      dailyLossPercent,
      openPositionsCount,
      portfolioValue,
    };
  }

  /**
   * Check if daily loss limit has been reached
   */
  async isDailyLimitReached(userId: string, maxDailyLossPercent: number): Promise<boolean> {
    const dailyPnL = await this._getDailyPnL(userId);
    const portfolioValue = await this._getPortfolioValue(userId);

    if (portfolioValue <= 0) return false;

    const lossPercent = (Math.abs(Math.min(0, dailyPnL)) / portfolioValue) * 100;
    return lossPercent >= maxDailyLossPercent;
  }

  /**
   * Get current risk parameters
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.defaultMaxPositionSizePercent,
      maxDailyLossPercent: this.defaultMaxDailyLossPercent,
      maxOpenPositions: this.defaultMaxOpenPositions,
      riskPerTradePercent: this.defaultRiskPerTradePercent,
    };
  }

  // ── Private Helpers ──

  private _calculatePositionSize(
    portfolioValue: number,
    riskPerTradePercent: number,
    entryPrice: number,
    stopLoss: number,
  ): number {
    if (portfolioValue <= 0 || entryPrice <= 0 || stopLoss <= 0) return 0;

    // Risk amount = portfolio × risk %
    const riskAmount = portfolioValue * (riskPerTradePercent / 100);

    // Price risk per unit = |entry - stopLoss|
    const priceRisk = Math.abs(entryPrice - stopLoss);

    if (priceRisk === 0) return 0;

    // Position size = risk amount / price risk
    const quantity = riskAmount / priceRisk;

    return parseFloat(quantity.toFixed(8));
  }

  private _calculateRiskScore(params: {
    positionSize: number;
    portfolioValue: number;
    maxPositionSizePercent: number;
    openPositionsCount: number;
    maxOpenPositions: number;
    dailyLossPercent: number;
    maxDailyLossPercent: number;
    riskRewardRatio: number;
    volatility?: string;
  }): number {
    let score = 0;

    // Position size relative to portfolio (0-30 points)
    if (params.portfolioValue > 0) {
      const positionPercent = (params.positionSize * 100) / params.portfolioValue;
      score += Math.min(30, (positionPercent / params.maxPositionSizePercent) * 30);
    }

    // Open positions ratio (0-25 points)
    score += Math.min(25, (params.openPositionsCount / params.maxOpenPositions) * 25);

    // Daily loss contribution (0-30 points)
    score += Math.min(30, (params.dailyLossPercent / params.maxDailyLossPercent) * 30);

    // R:R ratio penalty (0-15 points)
    if (params.riskRewardRatio < 2.0) score += 15;
    else if (params.riskRewardRatio < 3.0) score += 8;

    // Volatility bonus
    if (params.volatility === 'EXTREME') score += 15;
    else if (params.volatility === 'HIGH') score += 8;

    return Math.min(100, Math.round(score));
  }

  private async _getPortfolioValue(userId: string): Promise<number> {
    try {
      // Aggregate portfolio value
      const portfolios = await this.prisma.portfolio.aggregate({
        where: { userId },
        _sum: { totalValue: true },
      });

      const manualValue = Number(portfolios._sum.totalValue || 0);

      // Add open positions value
      const positions = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
      });

      const positionsValue = positions.reduce((sum, p) => {
        return sum + Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice));
      }, 0);

      return manualValue + positionsValue;
    } catch {
      return 0;
    }
  }

  private async _getDailyPnL(userId: string): Promise<number> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const trades = await this.prisma.trade.findMany({
        where: {
          userId,
          executedAt: { gte: todayStart },
          type: { in: ['EXIT', 'PARTIAL_EXIT'] },
        },
      });

      return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    } catch {
      return 0;
    }
  }

  private async _getOpenPositionsCount(userId: string): Promise<number> {
    try {
      return await this.prisma.position.count({
        where: { userId, status: 'OPEN' },
      });
    } catch {
      return 0;
    }
  }

  private async _hasOpenPosition(userId: string, symbol: string): Promise<boolean> {
    try {
      const count = await this.prisma.position.count({
        where: { userId, symbol, status: 'OPEN' },
      });
      return count > 0;
    } catch {
      return false;
    }
  }
}
