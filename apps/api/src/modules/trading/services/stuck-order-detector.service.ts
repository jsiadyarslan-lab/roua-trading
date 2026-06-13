// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Stuck Order Detector Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V220: كشف الأوامر العالقة في حالة PENDING/ACCEPTED
// للأوامر التي لم تُعالج خلال 5 دقائق
// يمنع تجميد رأس المال بسبب أوامر لا تُنفذ أبداً
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { OrderStatus } from '@prisma/client';

/** Maximum time an order can stay in PENDING/ACCEPTED before being flagged (5 minutes) */
const STUCK_ORDER_THRESHOLD_MS = 5 * 60 * 1000;

/** How often to run the stuck order detection (every 60 seconds) */
const DETECTION_INTERVAL_MS = 60 * 1000;

/** Non-terminal order statuses that can become stuck */
const STUCKABLE_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED'];

/** Valid order state transitions — prevents illegal jumps */
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACCEPTED', 'RISK_REJECTED', 'CANCELLED'],
  ACCEPTED: ['SENT_TO_EXCHANGE', 'RISK_REJECTED', 'CANCELLED'],
  SENT_TO_EXCHANGE: ['FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED'],
  RISK_REJECTED: [], // terminal
  CANCELLED: [],     // terminal
  FILLED: [],        // terminal
  PARTIALLY_FILLED: ['FILLED', 'CANCELLED'],
  REJECTED: [],      // terminal
};

export interface StuckOrderReport {
  orderId: string;
  userId: string;
  symbol: string;
  status: string;
  ageMinutes: number;
  action: 'ESCALATE' | 'CANCEL' | 'RETRY';
}

@Injectable()
export class StuckOrderDetectorService implements OnModuleDestroy {
  private readonly logger = new Logger(StuckOrderDetectorService.name);
  private _detectionInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this._startDetection();
  }

  onModuleDestroy(): void {
    if (this._detectionInterval) {
      clearInterval(this._detectionInterval);
      this._detectionInterval = null;
    }
  }

  private _startDetection(): void {
    // Run detection every 60 seconds
    this._detectionInterval = setInterval(async () => {
      try {
        await this.detectAndResolveStuckOrders();
      } catch (err: any) {
        this.logger.error(`Stuck order detection failed: ${err.message}`);
      }
    }, DETECTION_INTERVAL_MS);
  }

  /**
   * Detect orders stuck in non-terminal states beyond the threshold.
   * Returns a report of stuck orders with recommended actions.
   */
  async detectAndResolveStuckOrders(): Promise<StuckOrderReport[]> {
    const threshold = new Date(Date.now() - STUCK_ORDER_THRESHOLD_MS);

    const stuckOrders = await this.prisma.order.findMany({
      where: {
        status: { in: STUCKABLE_STATUSES },
        createdAt: { lt: threshold },
      },
      take: 50, // Process in batches
      orderBy: { createdAt: 'asc' },
    });

    if (stuckOrders.length === 0) return [];

    this.logger.warn(`🔍 Found ${stuckOrders.length} stuck order(s) older than ${STUCK_ORDER_THRESHOLD_MS / 1000 / 60} minutes`);

    const reports: StuckOrderReport[] = [];

    for (const order of stuckOrders) {
      const ageMinutes = Math.round((Date.now() - order.createdAt.getTime()) / 60000);

      // Determine action based on age and status
      let action: StuckOrderReport['action'];
      if (ageMinutes > 30) {
        // Very old — cancel to free capital
        action = 'CANCEL';
      } else if (ageMinutes > 15) {
        // Old — try retry
        action = 'RETRY';
      } else {
        // Recently stuck — just escalate
        action = 'ESCALATE';
      }

      const report: StuckOrderReport = {
        orderId: order.id,
        userId: order.userId,
        symbol: order.symbol,
        status: order.status,
        ageMinutes,
        action,
      };

      reports.push(report);

      // Log the stuck order
      this.logger.warn(
        `🔍 Stuck order: ${order.id} | ${order.symbol} | status=${order.status} | age=${ageMinutes}m | action=${action}`
      );

      // Take action on very old orders (CANCEL)
      if (action === 'CANCEL') {
        try {
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED' as OrderStatus,
              rejectReason: `V220: Auto-cancelled stuck order (was ${order.status} for ${ageMinutes} minutes)`,
            },
          });
          this.logger.log(`🔍 Cancelled stuck order ${order.id} (${order.status} → CANCELLED, age=${ageMinutes}m)`);
        } catch (err: any) {
          this.logger.error(`Failed to cancel stuck order ${order.id}: ${err.message}`);
        }
      }
    }

    // Store last detection result in Redis for monitoring
    try {
      await this.redis.set(
        'stuck-orders:last-detection',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          count: stuckOrders.length,
          actions: reports.map(r => ({ id: r.orderId, action: r.action })),
        }),
        5 * 60 * 1000, // 5 min TTL
      );
    } catch { /* non-critical */ }

    return reports;
  }

  /**
   * Validate that an order state transition is legal.
   * Returns true if the transition is valid, false otherwise.
   */
  isValidTransition(fromStatus: string, toStatus: string): boolean {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed) return false; // Unknown or terminal state
    return allowed.includes(toStatus);
  }

  /**
   * Get the count of currently stuck orders (for monitoring/dashboard).
   */
  async getStuckOrderCount(): Promise<number> {
    const threshold = new Date(Date.now() - STUCK_ORDER_THRESHOLD_MS);
    return this.prisma.order.count({
      where: {
        status: { in: STUCKABLE_STATUSES },
        createdAt: { lt: threshold },
      },
    });
  }
}
