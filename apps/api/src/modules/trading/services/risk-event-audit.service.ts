// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Risk Event Audit Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V218: Every risk decision (accept/reject/warn) is logged to the RiskEvent table.
// This creates a full audit trail for:
//   - Debugging: Why was an order rejected?
//   - Compliance: Show risk decisions to auditors
//   - Analytics: Track risk patterns over time
//   - Improvement: Identify false positives in risk checks

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export type RiskDecision = 'ACCEPT' | 'REJECT' | 'WARN';
export type RiskService = 'RiskManager' | 'RiskCalculator' | 'RiskGatekeeper' | 'PriceValidation' | 'PositionMonitor';

export interface RiskEventInput {
  userId: string;
  service: RiskService;
  decision: RiskDecision;
  reason: string;
  symbol?: string;
  orderValue?: number;
  portfolioValue?: number;
  positionPct?: number;
  riskScore?: number;
  source?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class RiskEventAuditService {
  private readonly logger = new Logger(RiskEventAuditService.name);

  // Rate limit: max 1 event per userId+service+symbol per 10 seconds
  // Prevents flooding the DB with duplicate events during rapid risk checks
  private readonly eventCache = new Map<string, number>();
  private readonly EVENT_RATE_LIMIT_MS = 10000;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Log a risk event to the database.
   *
   * This is a FIRE-AND-FORGET operation — it never throws.
   * Errors are logged but don't block the calling risk check.
   * Rate-limited to prevent DB flooding during rapid checks.
   */
  async log(event: RiskEventInput): Promise<void> {
    try {
      // Rate limit check
      const cacheKey = `${event.userId}:${event.service}:${event.symbol || ''}:${event.decision}`;
      const lastLogTime = this.eventCache.get(cacheKey);
      if (lastLogTime && Date.now() - lastLogTime < this.EVENT_RATE_LIMIT_MS) {
        return; // Skip — rate limited
      }
      this.eventCache.set(cacheKey, Date.now());

      // Only log to DB if available
      if (!this.prisma?.isAvailable?.()) {
        return;
      }

      await this.prisma.riskEvent.create({
        data: {
          userId: event.userId,
          service: event.service,
          decision: event.decision,
          reason: event.reason.substring(0, 500), // Cap reason length
          symbol: event.symbol,
          orderValue: event.orderValue,
          portfolioValue: event.portfolioValue,
          positionPct: event.positionPct,
          riskScore: event.riskScore,
          source: event.source,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        },
      });
    } catch (err: any) {
      // Never throw — risk event logging must not break risk checks
      this.logger.debug(`RiskEvent log failed: ${err.message}`);
    }
  }

  /**
   * Get recent risk events for a user (for admin dashboard / debugging).
   */
  async getRecentEvents(userId: string, limit = 50): Promise<any[]> {
    try {
      return await this.prisma.riskEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch {
      return [];
    }
  }

  /**
   * Get risk event statistics for a user (for admin dashboard).
   */
  async getEventStats(userId: string, hours = 24): Promise<{
    total: number;
    accepts: number;
    rejects: number;
    warnings: number;
    byService: Record<string, number>;
    topRejectReasons: string[];
  }> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const events = await this.prisma.riskEvent.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { decision: true, service: true, reason: true },
      });

      const accepts = events.filter(e => e.decision === 'ACCEPT').length;
      const rejects = events.filter(e => e.decision === 'REJECT').length;
      const warnings = events.filter(e => e.decision === 'WARN').length;

      const byService: Record<string, number> = {};
      for (const e of events) {
        byService[e.service] = (byService[e.service] || 0) + 1;
      }

      const rejectReasons = events
        .filter(e => e.decision === 'REJECT')
        .map(e => e.reason);
      const reasonCounts: Record<string, number> = {};
      for (const r of rejectReasons) {
        reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      }
      const topRejectReasons = Object.entries(reasonCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([reason]) => reason);

      return {
        total: events.length,
        accepts,
        rejects,
        warnings,
        byService,
        topRejectReasons,
      };
    } catch {
      return { total: 0, accepts: 0, rejects: 0, warnings: 0, byService: {}, topRejectReasons: [] };
    }
  }

  /**
   * Cleanup old rate-limit cache entries (call periodically).
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, time] of this.eventCache.entries()) {
      if (now - time > this.EVENT_RATE_LIMIT_MS * 2) {
        this.eventCache.delete(key);
      }
    }
  }
}
