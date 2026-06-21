import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V339: Trade Lifecycle Logger — Single Source of Truth for every trade event.
 *
 * Every position state change MUST be logged here. This eliminates "blind debugging"
 * — we can trace exactly WHO closed a trade, WHEN, and WHY, with the exact price
 * at the moment of decision.
 *
 * Usage:
 *   await this.lifecycle.log({
 *     positionId: 'cmq...',
 *     userId: 'cmq...',
 *     eventType: 'CLOSE_REQUEST',
 *     closingSource: 'POSITION_MONITOR',
 *     module: 'position-monitor',
 *     reason: 'TIME_EXPIRED at 240min',
 *     price: 71.51553,
 *     highestPrice: 72.09,
 *     lowestPrice: 70.49,
 *     metadata: { holdingMinutes: 240, pnl: -8.22, tpProgress: 0.92 },
 *   });
 *
 * Design principles:
 *   1. NEVER block trading — if logging fails, log error and continue
 *   2. NEVER throw — this is observability, not business logic
 *   3. ALWAYS include positionId + userId for querying
 *   4. ALWAYS include price at moment of decision (for replay debugging)
 *   5. closingSource is REQUIRED for CLOSE_* events — UNKNOWN is forbidden
 */

export type LifecycleEventType =
  | 'OPEN'
  | 'MONITOR_TICK'
  | 'SL_UPDATE'
  | 'TP_UPDATE'
  | 'SL_HIT'
  | 'TP_HIT'
  | 'CLOSE_REQUEST'
  | 'CLOSE_EXECUTED'
  | 'CLOSE_BLOCKED'
  | 'TIME_EXPIRED'
  | 'STALE_CLOSE'
  | 'EXCHANGE_SYNC'
  | 'FORCE_CLOSE';

export type ClosingSource =
  | 'POSITION_MONITOR'
  | 'RISK_ENGINE'
  | 'TIMEOUT_SERVICE'
  | 'USER'
  | 'TP_ENGINE'
  | 'SL_ENGINE'
  | 'SMART_EXECUTOR'
  | 'EXCHANGE_SYNC'
  | 'UNKNOWN'; // Forbidden for CLOSE_* — will log error if used

export interface LifecycleLogInput {
  positionId: string;
  userId: string;
  eventType: LifecycleEventType;
  closingSource?: ClosingSource;
  module: string;
  reason?: string;
  price?: number;
  highestPrice?: number;
  lowestPrice?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class TradeLifecycleLogger {
  private readonly logger = new Logger(TradeLifecycleLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a trade lifecycle event. NEVER throws — failures are logged and swallowed.
   * This is observability, not business logic.
   */
  async log(input: LifecycleLogInput): Promise<void> {
    try {
      // Validate: closingSource is REQUIRED for CLOSE_* events
      if (
        (input.eventType === 'CLOSE_REQUEST' ||
          input.eventType === 'CLOSE_EXECUTED' ||
          input.eventType === 'CLOSE_BLOCKED' ||
          input.eventType === 'TIME_EXPIRED' ||
          input.eventType === 'STALE_CLOSE' ||
          input.eventType === 'EXCHANGE_SYNC' ||
          input.eventType === 'FORCE_CLOSE' ||
          input.eventType === 'SL_HIT' ||
          input.eventType === 'TP_HIT') &&
        !input.closingSource
      ) {
        this.logger.error(
          `🚨 V339 INTEGRITY: ${input.eventType} event for position ${input.positionId?.slice(0, 12)}... ` +
            `has no closingSource! This is forbidden. Module: ${input.module}`,
        );
        // Don't return — still log with UNKNOWN so it shows up in audits
        input.closingSource = 'UNKNOWN';
      }

      // Warn on UNKNOWN closingSource (it's logged but flagged for investigation)
      if (input.closingSource === 'UNKNOWN') {
        this.logger.warn(
          `⚠️ V339: UNKNOWN closingSource for position ${input.positionId?.slice(0, 12)}... ` +
            `event=${input.eventType} module=${input.module} — investigate!`,
        );
      }

      await this.prisma.tradeLifecycleLog.create({
        data: {
          positionId: input.positionId,
          userId: input.userId,
          eventType: input.eventType,
          closingSource: input.closingSource || null,
          module: input.module,
          reason: input.reason || null,
          price: input.price ?? null,
          highestPrice: input.highestPrice ?? null,
          lowestPrice: input.lowestPrice ?? null,
          // V339: Prisma Json field requires JsonValue or undefined (not plain null).
          // Use undefined when metadata is absent so Prisma leaves the column NULL.
          metadata: input.metadata ?? undefined,
        },
      });
    } catch (err: any) {
      // NEVER throw — this is observability. Log and continue.
      this.logger.error(
        `🚨 V339: Failed to log lifecycle event for position ${input.positionId?.slice(0, 12)}... ` +
          `event=${input.eventType} module=${input.module}: ${err?.message || err}`,
      );
    }
  }

  /**
   * Retrieve the full lifecycle log for a position (for replay debugging).
   */
  async getLifecycle(positionId: string): Promise<any[]> {
    try {
      return await this.prisma.tradeLifecycleLog.findMany({
        where: { positionId },
        orderBy: { createdAt: 'asc' },
      });
    } catch (err: any) {
      this.logger.error(`Failed to get lifecycle for ${positionId}: ${err?.message}`);
      return [];
    }
  }

  /**
   * Retrieve lifecycle logs filtered by closingSource (for audit queries).
   * Example: getAllByClosingSource('UNKNOWN') → find all bad closures.
   */
  async getAllByClosingSource(
    closingSource: ClosingSource,
    limit: number = 100,
  ): Promise<any[]> {
    try {
      return await this.prisma.tradeLifecycleLog.findMany({
        where: { closingSource },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (err: any) {
      this.logger.error(`Failed to query by closingSource ${closingSource}: ${err?.message}`);
      return [];
    }
  }
}
