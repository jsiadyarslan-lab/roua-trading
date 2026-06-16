// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Unified Portfolio Valuation Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V218: SINGLE SOURCE OF TRUTH for portfolio valuation.
// Both RiskManager and RiskCalculator delegate to this service.
// This eliminates the possibility of formula drift between services.
//
// Formula:
//   Paper trading: paperBalance + unrealizedPnL
//   Real trading:   Portfolio.totalValue + unrealizedPnL
//
// Safety:
//   - paperBalance = 0 → fallback to DEFAULT_PAPER_BALANCE ($10,000)
//   - DB error → fallback to default balance
//   - Total ≤ 0 → return 0 for real trading, default for paper

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';

export interface PortfolioValuation {
  totalValue: number;
  paperBalance: number;
  unrealizedPnl: number;
  isPaperTrading: boolean;
  source: 'agent_settings' | 'portfolio_table' | 'default_fallback';
  positionCount: number;
}

@Injectable()
export class PortfolioValuationService {
  private readonly logger = new Logger(PortfolioValuationService.name);
  private readonly CACHE_PREFIX = 'portfolio-valuation:';
  private readonly CACHE_TTL_MS = 15 * 1000; // V-PHASE3: 15-second cache to reduce DB load

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get the unified portfolio valuation for a user.
   *
   * This is the ONLY method that should be used to calculate portfolio value
   * across ALL services (RiskManager, RiskCalculator, ExposureManager, etc.).
   *
   * V-PHASE3: Added Redis caching (15s TTL) to reduce DB queries.
   * Previously, every tick (10s for executor, 60s for agent) called this
   * for every user, causing excessive DB load. With caching, the same
   * valuation is reused within 15 seconds across all services.
   *
   * @param userId - The user ID
   * @param isPaperTrading - Whether the user is paper-trading only
   * @returns PortfolioValuation with detailed breakdown
   */
  async getValuation(userId: string, isPaperTrading = false): Promise<PortfolioValuation> {
    // V-PHASE3: Check cache first
    const cacheKey = `${this.CACHE_PREFIX}${userId}:${isPaperTrading ? 'paper' : 'real'}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch { /* Redis unavailable — proceed without cache */ }

    const valuation = isPaperTrading
      ? await this._getPaperValuation(userId)
      : await this._getRealValuation(userId);

    // V-PHASE3: Cache the result
    try {
      await this.redis.set(cacheKey, JSON.stringify(valuation), this.CACHE_TTL_MS);
    } catch { /* Redis unavailable — skip caching */ }

    return valuation;
  }

  /**
   * Quick portfolio value (just the number, no breakdown).
   * Useful for risk checks that only need the total.
   */
  async getValue(userId: string, isPaperTrading = false): Promise<number> {
    const valuation = await this.getValuation(userId, isPaperTrading);
    return valuation.totalValue;
  }

  /**
   * Auto-detect whether user is paper-trading and return valuation.
   * Checks AgentSettings and credentials to determine trading mode.
   */
  async autoDetectValuation(userId: string): Promise<PortfolioValuation> {
    // Check if user has any real credentials
    let isPaperOnly = false;
    try {
      const realCredential = await this.prisma.exchangeCredential.findFirst({
        where: {
          userId,
          isValid: true,
          exchange: { notIn: ['paper-trading', 'paper', 'sandbox', 'simulation'] },
          testnet: { not: true },
        },
      });
      isPaperOnly = !realCredential;
    } catch {
      // If we can't check credentials, assume paper for safety
      isPaperOnly = true;
    }

    return this.getValuation(userId, isPaperOnly);
  }

  // ── Private Methods ──

  /**
   * Paper Trading Valuation:
   *   paperBalance (from AgentSettings) + unrealizedPnL (from open positions)
   *
   * Fallback chain:
   *   1. AgentSettings.paperBalance → if 0 or missing → DEFAULT_PAPER_BALANCE
   *   2. On DB error → DEFAULT_PAPER_BALANCE
   */
  private async _getPaperValuation(userId: string): Promise<PortfolioValuation> {
    try {
      const agentSettings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });

      // V217: paperBalance = 0 → fallback to $10,000 default
      const paperBalance = agentSettings?.paperBalance?.toNumber()
        || parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000'))
        || 10000;

      // Calculate unrealized P&L from open positions
      const { unrealizedPnl, positionCount } = await this._calculateUnrealizedPnL(userId);

      const totalValue = paperBalance + unrealizedPnl;

      if (totalValue <= 0) {
        // Even with negative P&L, return default balance for paper trading
        const defaultBalance = parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000;
        this.logger.warn(
          `📊 V218: Paper portfolio is $${totalValue.toFixed(2)} (balance=$${paperBalance}, PnL=$${unrealizedPnl.toFixed(2)}) — using default $${defaultBalance}`,
        );
        return {
          totalValue: defaultBalance,
          paperBalance,
          unrealizedPnl,
          isPaperTrading: true,
          source: 'default_fallback',
          positionCount,
        };
      }

      return {
        totalValue,
        paperBalance,
        unrealizedPnl,
        isPaperTrading: true,
        source: 'agent_settings',
        positionCount,
      };
    } catch (err: any) {
      const defaultBalance = parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000;
      this.logger.error(
        `📊 V218: Failed to fetch paper balance for ${userId}: ${err.message} — using default $${defaultBalance}`,
      );
      return {
        totalValue: defaultBalance,
        paperBalance: defaultBalance,
        unrealizedPnl: 0,
        isPaperTrading: true,
        source: 'default_fallback',
        positionCount: 0,
      };
    }
  }

  /**
   * Real Trading Valuation:
   *   Portfolio.totalValue (from DB) + unrealizedPnL (from open positions)
   *
   * Returns 0 if total is ≤ 0 (safety: don't trade with unknown portfolio).
   */
  private async _getRealValuation(userId: string): Promise<PortfolioValuation> {
    try {
      const portfolios = await this.prisma.portfolio.aggregate({
        where: { userId },
        _sum: { totalValue: true },
      });

      const manualValue = Number(portfolios._sum.totalValue || 0);

      // Calculate unrealized P&L from open positions
      const { unrealizedPnl, positionCount } = await this._calculateUnrealizedPnL(userId);

      const totalValue = manualValue + unrealizedPnl;

      if (totalValue <= 0) {
        this.logger.warn(
          `📊 V218: Real portfolio value is $${totalValue.toFixed(2)} for user ${userId} (manual=$${manualValue}, PnL=$${unrealizedPnl.toFixed(2)}) — returning 0 for safety`,
        );
        return {
          totalValue: 0,
          paperBalance: 0,
          unrealizedPnl,
          isPaperTrading: false,
          source: 'portfolio_table',
          positionCount,
        };
      }

      return {
        totalValue,
        paperBalance: 0,
        unrealizedPnl,
        isPaperTrading: false,
        source: 'portfolio_table',
        positionCount,
      };
    } catch (err: any) {
      this.logger.error(
        `📊 V218: Failed to fetch real portfolio for ${userId}: ${err.message} — returning 0`,
      );
      return {
        totalValue: 0,
        paperBalance: 0,
        unrealizedPnl: 0,
        isPaperTrading: false,
        source: 'portfolio_table',
        positionCount: 0,
      };
    }
  }

  /**
   * Calculate unrealized P&L from open positions.
   * This is the V218 unified formula shared between paper and real trading.
   *
   * BUY  PnL = (currentPrice - entryPrice) × quantity
   * SELL PnL = (entryPrice - currentPrice) × quantity
   */
  private async _calculateUnrealizedPnL(userId: string): Promise<{ unrealizedPnl: number; positionCount: number }> {
    try {
      const openPositions = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
        select: { quantity: true, currentPrice: true, entryPrice: true, side: true },
      });

      let unrealizedPnl = 0;
      for (const p of openPositions) {
        const qty = Number(p.quantity) || 0;
        const currentPrice = Number(p.currentPrice) || Number(p.entryPrice) || 0;
        const entryPrice = Number(p.entryPrice) || 0;
        if (p.side === 'BUY') {
          unrealizedPnl += (currentPrice - entryPrice) * qty;
        } else {
          unrealizedPnl += (entryPrice - currentPrice) * qty;
        }
      }

      return { unrealizedPnl, positionCount: openPositions.length };
    } catch {
      return { unrealizedPnl: 0, positionCount: 0 };
    }
  }
}
