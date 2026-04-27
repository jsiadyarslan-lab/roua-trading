// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Position Monitor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { TradingService } from '../../trading/trading.service';
import { AuditService } from '../../../audit/audit.service';

/**
 * Position Monitor Service — Real-Time Position Surveillance
 *
 * Continuously monitors all open positions and automatically
 * executes protective actions:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Stop-Loss Check    — Close position if price hits SL    │
 * │ 2. Take-Profit Check  — Close position if price hits TP    │
 * │ 3. Trailing Stop      — Adjust SL as price moves favorably │
 * │ 4. Position Updates   — Update current price and unrealized│
 * │    P&L in real-time                                        │
 * │ 5. Alert Generation   — Warn when position approaches SL/TP│
 * └─────────────────────────────────────────────────────────────┘
 *
 * Safety Features:
 * - Mandatory SL on all positions (no exceptions)
 * - Trailing stop activates at 2% profit
 * - Max position age: 7 days (auto-close warning)
 *
 * Frequency: Every 30 seconds
 */
@Injectable()
export class PositionMonitorService {
  private readonly logger = new Logger(PositionMonitorService.name);

  /** Interval in milliseconds */
  private readonly MONITOR_INTERVAL_MS = 30000; // 30 seconds

  /** Trailing stop activation threshold (% profit) */
  private readonly TRAILING_ACTIVATION_PCT = 0.02; // 2%

  /** Trailing stop distance (% from highest price) */
  private readonly TRAILING_DISTANCE_PCT = 0.015; // 1.5%

  /** Maximum position age before warning (days) */
  private readonly MAX_POSITION_AGE_DAYS = 7;

  /** Is monitor currently running */
  private isMonitoring = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    private readonly tradingService: TradingService,
    private readonly audit: AuditService,
  ) {
    this.logger.log('🛡️ Position Monitor initialized — protective surveillance active');
  }

  /**
   * Main monitoring cycle — runs every 30 seconds
   *
   * Checks all open positions for SL/TP hits and updates prices.
   */
  @Interval(30000)
  async runPositionMonitor(): Promise<void> {
    if (this.isMonitoring) {
      return; // Skip if previous cycle still running
    }

    this.isMonitoring = true;

    try {
      // Step 1: Get all open positions
      let positions: any[];
      try {
        positions = await this.prisma.position.findMany({
          where: { status: 'OPEN' },
        });
      } catch (dbError: any) {
        // Table may not exist yet (e.g., Prisma db:push hasn't run or Position model is new)
        if (dbError.message?.includes('does not exist')) {
          this.logger.warn('🛡️ Position table not found — skipping monitor cycle. Run `prisma db push` to create it.');
          return;
        }
        throw dbError;
      }

      if (positions.length === 0) {
        return;
      }

      this.logger.debug(`🛡️ Monitoring ${positions.length} open positions`);

      let slTriggered = 0;
      let tpTriggered = 0;
      let trailingUpdated = 0;
      let alertsSent = 0;

      // Step 2: Fetch all quotes in parallel first
      const quotePromises = positions.map((pos) =>
        this.exchangeService.getQuote(pos.symbol).catch(() => null),
      );
      const quotes = await Promise.allSettled(quotePromises);

      // Step 3: Process each position with its pre-fetched quote
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const quoteResult = quotes[i];
        const currentPrice =
          quoteResult.status === 'fulfilled' && quoteResult.value?.price
            ? quoteResult.value.price
            : null;

        try {
          const result = await this._monitorPosition(position, currentPrice);
          if (result.slTriggered) slTriggered++;
          if (result.tpTriggered) tpTriggered++;
          if (result.trailingUpdated) trailingUpdated++;
          if (result.alertSent) alertsSent++;
        } catch (error: any) {
          this.logger.error(
            `🛡️ Monitor error for position ${position.id}: ${error.message}`,
          );
        }
      }

      if (slTriggered > 0 || tpTriggered > 0 || trailingUpdated > 0) {
        this.logger.log(
          `🛡️ Monitor cycle: ${slTriggered} SL, ${tpTriggered} TP, ${trailingUpdated} trailing, ${alertsSent} alerts`,
        );
      }

      // Store monitor stats
      await this.redis.set(
        'monitor:last_cycle',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          positionsMonitored: positions.length,
          slTriggered,
          tpTriggered,
          trailingUpdated,
          alertsSent,
        }),
        300000, // 5 min TTL
      );
    } catch (error: any) {
      this.logger.error(`🛡️ Position monitor cycle failed: ${error.message}`);
    } finally {
      this.isMonitoring = false;
    }
  }

  /**
   * Get monitor status
   */
  async getMonitorStatus(): Promise<{
    lastCycle: any;
    openPositions: number;
    nearSL: number;
    nearTP: number;
  }> {
    const lastCycleRaw = await this.redis.get('monitor:last_cycle');
    const lastCycle = lastCycleRaw ? JSON.parse(lastCycleRaw) : null;

    let openPositions = 0;
    let nearSL = 0;
    let nearTP = 0;

    try {
      openPositions = await this.prisma.position.count({
        where: { status: 'OPEN' },
      });

      // Count positions near SL/TP (within 1%)
      const allPositions = await this.prisma.position.findMany({
        where: { status: 'OPEN' },
      });

      // Fetch all quotes in parallel
      const quotePromises = allPositions.map((pos) =>
        this.exchangeService.getQuote(pos.symbol).catch(() => null),
      );
      const quotes = await Promise.allSettled(quotePromises);

      for (let i = 0; i < allPositions.length; i++) {
        const pos = allPositions[i];
        const quoteResult = quotes[i];
        if (quoteResult.status !== 'fulfilled' || !quoteResult.value?.price) continue;

        const currentPrice = quoteResult.value.price;

        if (pos.stopLoss) {
          const slDistance = Math.abs(currentPrice - pos.stopLoss.toNumber()) / pos.entryPrice.toNumber();
          if (slDistance < 0.01) nearSL++;
        }

        if (pos.takeProfit) {
          const tpDistance = Math.abs(currentPrice - pos.takeProfit.toNumber()) / pos.entryPrice.toNumber();
          if (tpDistance < 0.01) nearTP++;
        }
      }
    } catch (dbError: any) {
      if (dbError.message?.includes('does not exist')) {
        this.logger.warn('🛡️ Position table not found — returning empty monitor status.');
      } else {
        throw dbError;
      }
    }

    return { lastCycle, openPositions, nearSL, nearTP };
  }

  // ── Private: Position Monitoring ──

  private async _monitorPosition(position: any, currentPrice: number | null): Promise<{
    slTriggered: boolean;
    tpTriggered: boolean;
    trailingUpdated: boolean;
    alertSent: boolean;
  }> {
    const result = {
      slTriggered: false,
      tpTriggered: false,
      trailingUpdated: false,
      alertSent: false,
    };

    // Use pre-fetched price or skip
    if (currentPrice === null) {
      return result; // Skip if can't get price
    }

    // Calculate unrealized P&L
    const unrealizedPnl =
      position.side === 'BUY'
        ? (currentPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - currentPrice) * position.quantity;

    const pnlPercent = (unrealizedPnl / (position.entryPrice * position.quantity)) * 100;

    // Update position with current data
    await this.prisma.position.update({
      where: { id: position.id },
      data: {
        currentPrice,
        unrealizedPnl,
        highestPrice:
          position.side === 'BUY'
            ? Math.max(position.highestPrice || currentPrice, currentPrice)
            : position.highestPrice || currentPrice,
        lowestPrice:
          position.side === 'SELL'
            ? Math.min(position.lowestPrice || currentPrice, currentPrice)
            : position.lowestPrice || currentPrice,
      },
    });

    // ── Stop-Loss Check ──
    if (position.stopLoss) {
      const slHit =
        position.side === 'BUY'
          ? currentPrice <= position.stopLoss
          : currentPrice >= position.stopLoss;

      if (slHit) {
        this.logger.warn(
          `🚨 STOP-LOSS TRIGGERED: ${position.symbol} @ ${currentPrice} (SL: ${position.stopLoss})`,
        );

        await this._closePosition(position, currentPrice, 'STOP_LOSS');
        result.slTriggered = true;
        return result;
      }

      // Alert if near SL (within 0.5%)
      const slDistance = Math.abs(currentPrice - position.stopLoss) / position.entryPrice;
      if (slDistance < 0.005) {
        await this._sendAlert(position.userId, 'NEAR_STOP_LOSS', {
          positionId: position.id,
          symbol: position.symbol,
          currentPrice,
          stopLoss: position.stopLoss,
          distance: slDistance,
        });
        result.alertSent = true;
      }
    }

    // ── Take-Profit Check ──
    if (position.takeProfit) {
      const tpHit =
        position.side === 'BUY'
          ? currentPrice >= position.takeProfit
          : currentPrice <= position.takeProfit;

      if (tpHit) {
        this.logger.warn(
          `🎯 TAKE-PROFIT TRIGGERED: ${position.symbol} @ ${currentPrice} (TP: ${position.takeProfit})`,
        );

        await this._closePosition(position, currentPrice, 'TAKE_PROFIT');
        result.tpTriggered = true;
        return result;
      }

      // Alert if near TP (within 0.5%)
      const tpDistance = Math.abs(currentPrice - position.takeProfit) / position.entryPrice;
      if (tpDistance < 0.005) {
        await this._sendAlert(position.userId, 'NEAR_TAKE_PROFIT', {
          positionId: position.id,
          symbol: position.symbol,
          currentPrice,
          takeProfit: position.takeProfit,
          distance: tpDistance,
        });
        result.alertSent = true;
      }
    }

    // ── Trailing Stop Logic ──
    if (pnlPercent >= this.TRAILING_ACTIVATION_PCT * 100) {
      const trailingStop = this._calculateTrailingStop(position, currentPrice);

      if (trailingStop) {
        // For BUY: trailing stop moves UP (higher SL is better)
        // For SELL: trailing stop moves DOWN (lower SL is better, closer to entry from above)
        const currentSL = position.stopLoss || 0;
        const shouldUpdate = position.side === 'BUY'
          ? trailingStop > currentSL
          : trailingStop < currentSL;

        if (shouldUpdate) {
          await this.prisma.position.update({
            where: { id: position.id },
            data: { stopLoss: trailingStop },
          });

          this.logger.log(
            `📈 Trailing stop updated: ${position.symbol} SL → ${trailingStop}`,
          );

          result.trailingUpdated = true;
        }
      }
    }

    // ── Position Age Warning ──
    const positionAge = Date.now() - new Date(position.openedAt).getTime();
    const ageDays = positionAge / (1000 * 60 * 60 * 24);

    if (ageDays >= this.MAX_POSITION_AGE_DAYS) {
      await this._sendAlert(position.userId, 'POSITION_AGE_WARNING', {
        positionId: position.id,
        symbol: position.symbol,
        ageDays: Math.floor(ageDays),
      });
      result.alertSent = true;
    }

    return result;
  }

  private async _closePosition(
    position: any,
    currentPrice: number,
    reason: 'STOP_LOSS' | 'TAKE_PROFIT',
  ): Promise<void> {
    try {
      await this.tradingService.closePosition(
        position.userId,
        {
          positionId: position.id,
          quantity: position.quantity,
        },
        undefined,
        undefined,
      );

      await this.audit.log({
        userId: position.userId,
        action: `POSITION_CLOSED_${reason}`,
        resource: 'position-monitor',
        details: JSON.stringify({
          positionId: position.id,
          symbol: position.symbol,
          closePrice: currentPrice,
          entryPrice: position.entryPrice,
          side: position.side,
          quantity: position.quantity,
        }),
      });
    } catch (error: any) {
      this.logger.error(
        `🛡️ Failed to close position ${position.id}: ${error.message}`,
      );
    }
  }

  private _calculateTrailingStop(position: any, currentPrice: number): number | null {
    if (position.side === 'BUY') {
      // For long positions, trail below the highest price
      const highestPrice = position.highestPrice || currentPrice;
      const newHigh = Math.max(highestPrice, currentPrice);
      return newHigh * (1 - this.TRAILING_DISTANCE_PCT);
    } else if (position.side === 'SELL') {
      // For short positions, trail above the lowest price
      const lowestPrice = position.lowestPrice || currentPrice;
      const newLow = Math.min(lowestPrice, currentPrice);
      return newLow * (1 + this.TRAILING_DISTANCE_PCT);
    }
    return null;
  }

  private async _sendAlert(
    userId: string,
    type: string,
    data: any,
  ): Promise<void> {
    const alertKey = `alert:${userId}:${Date.now()}`;
    await this.redis.set(
      alertKey,
      JSON.stringify({ type, data, timestamp: new Date().toISOString() }),
      86400000, // 24 hours
    );
  }
}
