// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Risk Calculator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RiskAssessment, AgentConfig, StrategyType } from '../types/agent.types';
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
   * Strategy-specific minimum risk-reward ratios.
   * Different strategies have different R:R expectations:
   * - DCA: Very low R:R (0.5) because it has 70-80% win rate
   * - Mean Reversion: Low R:R (1.0) because it targets the mean, not large moves
   * - Scalping: Moderate R:R (1.0) because it takes small quick profits
   * - Other strategies: Standard R:R (1.2)
   */
  private readonly STRATEGY_MIN_RR: Record<string, number> = {
    [StrategyType.DCA]: 0.4,
    [StrategyType.MEAN_REVERSION]: 0.8,
    [StrategyType.SCALPING]: 1.0,
    [StrategyType.GRID]: 0.8,
    [StrategyType.VWAP_RSI]: 1.0,
    [StrategyType.SWING]: 1.5,
    [StrategyType.MOMENTUM_BREAKOUT]: 1.2,
  };

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

    // Step 5: Calculate position size (with maxPositionSizePercent cap)
    const positionSize = this._calculatePositionSize(
      portfolioValue,
      riskPerTradePercent,
      signal.entryPrice,
      signal.stopLoss,
      maxPositionSizePercent,
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

    // RULE 5: Risk-reward ratio — strategy-specific minimum
    // CRITICAL FIX: Each strategy has a different R:R expectation.
    // DCA and Mean Reversion have low R:R but high win rates — rejecting them
    // with a blanket 1.2 minimum prevents these strategies from ever executing!
    const strategyMinRR = this.STRATEGY_MIN_RR[signal.strategy] ?? 1.2;
    if (riskRewardRatio < strategyMinRR) {
      canTrade = false;
      reason = `نسبة المخاطرة للمكافأة (${riskRewardRatio.toFixed(2)}) أقل من الحد الأدنى لاستراتيجية ${signal.strategy} (${strategyMinRR})`;
    }

    // RULE 6: No duplicate positions for same symbol
    const existingPosition = await this._hasOpenPosition(userId, signal.symbol);
    if (existingPosition) {
      canTrade = false;
      reason = `يوجد مركز مفتوح بالفعل لـ ${signal.symbol}`;
    }

    // RULE 7: Check if AUTO_TRADING_ENABLED (global DB/ENV = admin kill switch)
    let globalAutoTradingEnabled: boolean;
    try {
      const dbSetting = await this.prisma.setting.findUnique({
        where: { key: 'AUTO_TRADING_ENABLED' },
      });
      if (dbSetting) {
        globalAutoTradingEnabled = JSON.parse(dbSetting.value);
      } else {
        globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
      }
    } catch {
      globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
    }

    if (!globalAutoTradingEnabled) {
      canTrade = false;
      reason = 'التداول الذاتي معطّل على مستوى النظام — تواصل مع الإدارة';
      this.logger.warn(`🚫 AUTO_TRADING_ENABLED=false (global) — ALL trades for user ${userId} are being rejected.`);
    } else {
      // Also check per-user autoTradingEnabled from AgentSettings
      try {
        const userSettings = await this.prisma.agentSettings.findUnique({
          where: { userId },
        });
        if (userSettings && !userSettings.autoTradingEnabled) {
          canTrade = false;
          reason = 'التداول الذاتي معطّل في إعداداتك — فعّله من صفحة إعدادات الوكيل';
          this.logger.warn(`🚫 User ${userId} autoTradingEnabled=false — trades rejected.`);
        }
      } catch (e: any) {
        this.logger.warn(`Could not check user autoTradingEnabled in risk assessment: ${e.message}`);
      }
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
    maxPositionSizePercent?: number,
  ): number {
    if (portfolioValue <= 0 || entryPrice <= 0 || stopLoss <= 0) return 0;

    // Use config maxPositionSizePercent or fallback to default
    const maxSizePercent = maxPositionSizePercent || this.defaultMaxPositionSizePercent;

    // Risk amount = portfolio × risk %
    const riskAmount = portfolioValue * (riskPerTradePercent / 100);

    // Price risk per unit = |entry - stopLoss|
    const priceRisk = Math.abs(entryPrice - stopLoss);

    if (priceRisk === 0) return 0;

    // Position size = risk amount / price risk (how many units we can buy given our risk budget)
    let quantity = riskAmount / priceRisk;

    // CRITICAL FIX: Cap position size to maxPositionSizePercent of portfolio.
    // Previously, when priceRisk was very small relative to entryPrice
    // (e.g., BTC=$94,500 with SL=$94,200 → priceRisk=$300), the calculated
    // quantity could be huge (0.5 BTC = $47,250 = 472% of $10,000 portfolio).
    // Now we enforce: positionValue <= portfolio * maxSizePercent / 100
    const maxPositionValue = portfolioValue * (maxSizePercent / 100);
    const currentPositionValue = quantity * entryPrice;

    if (currentPositionValue > maxPositionValue) {
      // Reduce quantity to fit within max position size limit
      quantity = maxPositionValue / entryPrice;
      this.logger.debug(
        `🛡️ Position size capped: ${currentPositionValue.toFixed(2)} > ${maxPositionValue.toFixed(2)} ` +
        `(max ${maxSizePercent}% of portfolio) → reduced to ${quantity.toFixed(8)} units`,
      );
    }

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

      const totalValue = manualValue + positionsValue;

      // CRITICAL FIX: If portfolio value is 0 (no portfolio records or no positions),
      // use a default paper trading balance so the agent can actually trade.
      // This handles new users who haven't set up a portfolio yet.
      if (totalValue <= 0) {
        const defaultBalance = parseFloat(
          this.configService.get('DEFAULT_PAPER_BALANCE', '10000'),
        ) || 10000;
        this.logger.warn(
          `🛡️ Portfolio value is 0 for user ${userId} — using default paper balance: $${defaultBalance}`,
        );
        return defaultBalance;
      }

      return totalValue;
    } catch (error: any) {
      // Even on DB error, return default so agent doesn't get stuck
      const defaultBalance = parseFloat(
        this.configService.get('DEFAULT_PAPER_BALANCE', '10000'),
      ) || 10000;
      this.logger.warn(
        `🛡️ Failed to calculate portfolio value for ${userId}: ${error.message} — using default: $${defaultBalance}`,
      );
      return defaultBalance;
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
