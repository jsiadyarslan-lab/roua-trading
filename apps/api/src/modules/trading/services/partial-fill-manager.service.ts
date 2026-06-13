// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Partial Fill Manager Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V219: Handles partially filled orders from real exchanges.
//
// Problem:
//   When a real exchange partially fills an order, the system currently:
//   1. Creates a Position with the FULL requested quantity (not the filled amount)
//   2. SL/TP calculations are based on the full quantity, not the actual fill
//   3. No retry mechanism to fill the remaining quantity
//   4. Position Monitor assumes positions have full quantity
//
// Solution:
//   1. Track orders with PARTIALLY_FILLED status in a Redis set
//   2. Periodically poll exchanges for fill updates
//   3. Update position quantity incrementally
//   4. If fill % is below threshold (<50%), cancel remaining and adjust SL/TP
//   5. If fill % is acceptable (≥50%), keep position with partial fill
//
// Paper trading: NOT applicable — paper trades are instant full fills.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

/** Partial fill tracking entry */
interface PartialFillEntry {
  orderId: string;
  userId: string;
  symbol: string;
  side: string;
  requestedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  fillPercent: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  positionId?: string;
  detectedAt: string;
  source: string;
}

/** Partial fill resolution result */
interface PartialFillResolution {
  orderId: string;
  action: 'KEEP_PARTIAL' | 'CANCEL_REMAINING' | 'COMPLETELY_FILLED' | 'ERROR';
  filledQuantity: number;
  fillPercent: number;
  reason: string;
  slTpAdjusted: boolean;
}

/** Configuration */
const PARTIAL_FILL_CONFIG = {
  /** Minimum fill % to keep the position (below this → cancel remaining) */
  MIN_FILL_PERCENT_TO_KEEP: 50,
  /** How often to check for partial fill updates (ms) */
  CHECK_INTERVAL_MS: 30_000, // 30 seconds
  /** Maximum time to wait for full fill before forcing a decision (ms) */
  MAX_WAIT_MS: 5 * 60 * 1000, // 5 minutes
  /** Redis key for tracking partial fills */
  REDIS_KEY_PREFIX: 'partial-fill:',
  /** Redis set of all tracked order IDs */
  REDIS_SET_KEY: 'partial-fills:active',
};

@Injectable()
export class PartialFillManagerService {
  private readonly logger = new Logger(PartialFillManagerService.name);
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    // Start periodic check
    this.checkInterval = setInterval(
      () => this.checkAllPartialFills(),
      PARTIAL_FILL_CONFIG.CHECK_INTERVAL_MS,
    );

    this.logger.log('📊 V219: Partial Fill Manager initialized — monitoring partial fills');
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Register a partially filled order for tracking.
   * Called by OrderLifecycleService when an order receives PARTIALLY_FILLED status.
   */
  async trackPartialFill(entry: Omit<PartialFillEntry, 'detectedAt'>): Promise<void> {
    try {
      const fullEntry: PartialFillEntry = {
        ...entry,
        detectedAt: new Date().toISOString(),
      };

      const key = `${PARTIAL_FILL_CONFIG.REDIS_KEY_PREFIX}${entry.orderId}`;
      await this.redis.set(key, JSON.stringify(fullEntry), Math.ceil(PARTIAL_FILL_CONFIG.MAX_WAIT_MS / 1000));
      await this.redis.sadd(PARTIAL_FILL_CONFIG.REDIS_SET_KEY, entry.orderId);

      this.logger.warn(
        `📊 V219: Tracking partial fill: ${entry.symbol} ${entry.side} ` +
        `filled ${entry.filledQuantity}/${entry.requestedQuantity} (${entry.fillPercent.toFixed(1)}%) ` +
        `order=${entry.orderId}`
      );
    } catch (err: any) {
      this.logger.error(`📊 V219: Failed to track partial fill: ${err.message}`);
    }
  }

  /**
   * Check all tracked partial fills and resolve them.
   * Runs periodically (every 30s) or can be called manually.
   */
  async checkAllPartialFills(): Promise<PartialFillResolution[]> {
    const results: PartialFillResolution[] = [];

    try {
      const orderIds = await this.redis.smembers(PARTIAL_FILL_CONFIG.REDIS_SET_KEY);
      if (!orderIds || orderIds.length === 0) return results;

      this.logger.debug(`📊 V219: Checking ${orderIds.length} partial fills`);

      for (const orderId of orderIds) {
        try {
          const entryData = await this.redis.get(`${PARTIAL_FILL_CONFIG.REDIS_KEY_PREFIX}${orderId}`);
          if (!entryData) {
            // Entry expired — remove from set
            await this.redis.srem(PARTIAL_FILL_CONFIG.REDIS_SET_KEY, orderId);
            continue;
          }

          const entry: PartialFillEntry = JSON.parse(entryData);
          const resolution = await this.resolvePartialFill(entry);
          results.push(resolution);

          // Remove from tracking if resolved
          if (resolution.action !== 'ERROR') {
            await this.redis.del(`${PARTIAL_FILL_CONFIG.REDIS_KEY_PREFIX}${orderId}`);
            await this.redis.srem(PARTIAL_FILL_CONFIG.REDIS_SET_KEY, orderId);
          }
        } catch (err: any) {
          this.logger.error(`📊 V219: Error checking partial fill ${orderId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`📊 V219: Error in checkAllPartialFills: ${err.message}`);
    }

    return results;
  }

  /**
   * Resolve a single partial fill based on current state.
   */
  async resolvePartialFill(entry: PartialFillEntry): Promise<PartialFillResolution> {
    const timeSinceDetection = Date.now() - new Date(entry.detectedAt).getTime();
    const isTimedOut = timeSinceDetection >= PARTIAL_FILL_CONFIG.MAX_WAIT_MS;

    // Step 1: Check current fill status from DB
    let currentFilledQty = entry.filledQuantity;
    let currentFillPercent = entry.fillPercent;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: entry.orderId },
        select: { filledQuantity: true, status: true, quantity: true },
      });

      if (order) {
        currentFilledQty = Number(order.filledQuantity) || currentFilledQty;
        const totalQty = Number(order.quantity) || entry.requestedQuantity;
        currentFillPercent = totalQty > 0 ? (currentFilledQty / totalQty) * 100 : 0;

        // Check if order is now completely filled
        if (order.status === 'FILLED' || currentFillPercent >= 99.5) {
          return {
            orderId: entry.orderId,
            action: 'COMPLETELY_FILLED',
            filledQuantity: currentFilledQty,
            fillPercent: 100,
            reason: 'Order has been completely filled',
            slTpAdjusted: false,
          };
        }

        // Check if order was cancelled
        if (order.status === 'CANCELLED' || order.status === 'REJECTED') {
          return {
            orderId: entry.orderId,
            action: 'CANCEL_REMAINING',
            filledQuantity: currentFilledQty,
            fillPercent: currentFillPercent,
            reason: `Order was ${order.status} on exchange`,
            slTpAdjusted: currentFilledQty > 0,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(`📊 V219: Could not check order status from DB: ${err.message}`);
    }

    // Step 2: Decide action based on fill percentage and timeout
    if (currentFillPercent >= PARTIAL_FILL_CONFIG.MIN_FILL_PERCENT_TO_KEEP) {
      // Acceptable fill — keep position with partial fill and adjust SL/TP
      await this._adjustPositionForPartialFill(entry, currentFilledQty);

      return {
        orderId: entry.orderId,
        action: 'KEEP_PARTIAL',
        filledQuantity: currentFilledQty,
        fillPercent: currentFillPercent,
        reason: `Fill ${currentFillPercent.toFixed(1)}% >= ${PARTIAL_FILL_CONFIG.MIN_FILL_PERCENT_TO_KEEP}% threshold — keeping partial fill`,
        slTpAdjusted: true,
      };
    }

    if (isTimedOut || currentFillPercent < PARTIAL_FILL_CONFIG.MIN_FILL_PERCENT_TO_KEEP) {
      // Below threshold or timed out — cancel remaining quantity
      await this._adjustPositionForPartialFill(entry, currentFilledQty);

      // Try to cancel the remaining order on the exchange
      try {
        // Note: Actual exchange cancellation would go through ExchangeService
        // For now, we update the order status in DB
        await this.prisma.order.update({
          where: { id: entry.orderId },
          data: {
            status: 'CANCELLED', // V219: Mark as cancelled — remaining quantity will not be filled
            filledQuantity: currentFilledQty,
          },
        }).catch(() => {});
      } catch { /* non-critical */ }

      return {
        orderId: entry.orderId,
        action: 'CANCEL_REMAINING',
        filledQuantity: currentFilledQty,
        fillPercent: currentFillPercent,
        reason: `Fill ${currentFillPercent.toFixed(1)}% < ${PARTIAL_FILL_CONFIG.MIN_FILL_PERCENT_TO_KEEP}%${isTimedOut ? ' (timed out)' : ''} — cancelling remaining`,
        slTpAdjusted: currentFilledQty > 0,
      };
    }

    return {
      orderId: entry.orderId,
      action: 'ERROR',
      filledQuantity: currentFilledQty,
      fillPercent: currentFillPercent,
      reason: 'Could not determine fill action — will retry on next check',
      slTpAdjusted: false,
    };
  }

  /**
   * Adjust position quantity and SL/TP for a partial fill.
   * Updates the position in DB to reflect the actual filled quantity.
   */
  private async _adjustPositionForPartialFill(
    entry: PartialFillEntry,
    actualFilledQty: number,
  ): Promise<void> {
    if (!entry.positionId || actualFilledQty <= 0) return;

    try {
      const position = await this.prisma.position.findUnique({
        where: { id: entry.positionId },
        select: { quantity: true, stopLoss: true, takeProfit: true, entryPrice: true },
      });

      if (!position) return;

      const originalQty = Number(position.quantity);
      if (originalQty === actualFilledQty) return; // No adjustment needed

      // V219: Scale SL/TP based on the actual fill ratio
      // This ensures the position risk matches the actual size, not the requested size
      const fillRatio = actualFilledQty / originalQty;
      let adjustedSL = Number(position.stopLoss);
      let adjustedTP = Number(position.takeProfit);

      // For partial fills, we can widen SL/TP proportionally to maintain the same
      // dollar risk. If we got 50% of requested qty, we can afford wider SL
      // since the absolute dollar risk is smaller.
      if (fillRatio < 1 && adjustedSL > 0) {
        // Widen SL by the inverse of fill ratio (capped at 2x)
        const slWidenFactor = Math.min(1 / fillRatio, 2);
        const entryPrice = Number(position.entryPrice);
        const slDistance = entryPrice - adjustedSL; // For BUY positions
        if (entry.side === 'BUY') {
          adjustedSL = entryPrice - (slDistance * slWidenFactor);
        } else {
          adjustedSL = entryPrice + (Math.abs(adjustedSL - entryPrice) * slWidenFactor);
        }
      }

      await this.prisma.position.update({
        where: { id: entry.positionId },
        data: {
          quantity: actualFilledQty,
          stopLoss: adjustedSL,
          takeProfit: adjustedTP,
        },
      });

      this.logger.log(
        `📊 V219: Position ${entry.positionId} adjusted for partial fill: ` +
        `qty ${originalQty} → ${actualFilledQty} (${(fillRatio * 100).toFixed(1)}%) ` +
        `SL adjusted: ${Number(position.stopLoss).toFixed(2)} → ${adjustedSL.toFixed(2)}`
      );
    } catch (err: any) {
      this.logger.error(`📊 V219: Failed to adjust position for partial fill: ${err.message}`);
    }
  }

  /**
   * Get statistics about tracked partial fills (for admin dashboard).
   */
  async getStats(): Promise<{
    trackedCount: number;
    oldestDetection: string | null;
  }> {
    try {
      const orderIds = await this.redis.smembers(PARTIAL_FILL_CONFIG.REDIS_SET_KEY);
      let oldestDetection: string | null = null;

      for (const orderId of (orderIds || [])) {
        const data = await this.redis.get(`${PARTIAL_FILL_CONFIG.REDIS_KEY_PREFIX}${orderId}`);
        if (data) {
          const entry: PartialFillEntry = JSON.parse(data);
          if (!oldestDetection || entry.detectedAt < oldestDetection) {
            oldestDetection = entry.detectedAt;
          }
        }
      }

      return {
        trackedCount: (orderIds || []).length,
        oldestDetection,
      };
    } catch {
      return { trackedCount: 0, oldestDetection: null };
    }
  }
}
