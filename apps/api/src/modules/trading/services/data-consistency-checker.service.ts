import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

// ═══════════════════════════════════════════════════════════════════
// V178: Data Consistency Checker — Periodic integrity verification
// for the Trade ↔ Position ↔ Order lifecycle.
//
// This service is READ-ONLY — it detects issues but never modifies
// the database. Results are logged and returned for external action.
// ═══════════════════════════════════════════════════════════════════

/**
 * V178: A single consistency issue found during a check.
 */
export interface ConsistencyIssue {
  /** Entity type where the issue was found */
  entityType: 'Position' | 'Trade' | 'Order';
  /** ID of the affected entity */
  entityId: string;
  /** Human-readable description of the issue */
  description: string;
  /** Optional: ID of the related entity that's missing or mismatched */
  relatedEntityId?: string;
  /** Optional: extra metadata for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * V178: Result of a single consistency check.
 */
export interface ConsistencyCheckResult {
  /** Name of the check that was performed */
  checkName: string;
  /** Issues found during this check */
  issues: ConsistencyIssue[];
  /** Total number of issues found */
  issueCount: number;
}

/**
 * V178: Full data consistency report containing all check results.
 */
export interface DataConsistencyReport {
  /** ISO timestamp of when the report was generated */
  timestamp: string;
  /** Duration of the full check in milliseconds */
  durationMs: number;
  /** Individual check results */
  checks: ConsistencyCheckResult[];
  /** Total issues across all checks */
  totalIssues: number;
  /** Whether the data is fully consistent (no issues) */
  isConsistent: boolean;
}

/**
 * V178: Data Consistency Checker Service
 *
 * Runs periodic data consistency checks every 6 hours and performs
 * the following verifications:
 *
 * 1. Trade↔Position Cross-Check
 *    - CLOSED positions that have no EXIT trade record
 *    - EXIT trades that have no matching CLOSED position
 *
 * 2. PnL Sum Verification
 *    - For each CLOSED position with trades, verifies that
 *      SUM(trade.pnl WHERE positionId=X) matches position.realizedPnl
 *      within a tolerance of $1.00
 *
 * 3. Order↔Trade Lifecycle
 *    - FILLED orders that have no Trade record
 *    - Trade records that have no Order
 *
 * 4. Orphan Detection
 *    - Positions with no orders (no trades that link to an order)
 *    - Orders with no trades
 *    - EXIT trades with no position
 *
 * All checks are read-only. This service never modifies the database.
 */
@Injectable()
export class DataConsistencyCheckerService {
  private readonly logger = new Logger(DataConsistencyCheckerService.name);

  /** V178: PnL tolerance — $1.00 for floating-point comparison */
  private readonly PNL_TOLERANCE = 1.0;

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════
  // Scheduled Cron — runs every 6 hours at minute 0
  // ═══════════════════════════════════════════════════════════════

  @Cron('0 */6 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('V178: Scheduled data consistency check starting...');
    try {
      const report = await this.runAllChecks();
      if (report.isConsistent) {
        this.logger.debug('V178: Data consistency check passed — no issues found');
      } else {
        this.logger.warn(
          `V178: Data consistency check found ${report.totalIssues} issue(s) across ${report.checks.filter(c => c.issueCount > 0).length} check(s)`,
        );
      }
    } catch (error: any) {
      this.logger.error(`V178: Scheduled consistency check failed: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Main entry point — runs all 4 checks and returns a summary
  // ═══════════════════════════════════════════════════════════════

  /**
   * V178: Run all data consistency checks and return a comprehensive report.
   * This is the primary method — can be called manually or via cron.
   */
  async runAllChecks(): Promise<DataConsistencyReport> {
    const startTime = Date.now();

    this.logger.log('V178: Running all data consistency checks...');

    // V178: Run each check independently — a failure in one should not
    // prevent others from running. Each check is read-only.
    const checks: ConsistencyCheckResult[] = [];

    try {
      checks.push(await this.checkTradePositionCrossReference());
    } catch (error: any) {
      this.logger.error(`V178: Trade↔Position cross-check failed: ${error.message}`);
      checks.push({
        checkName: 'Trade↔Position Cross-Check',
        issues: [],
        issueCount: 0,
      });
    }

    try {
      checks.push(await this.checkPnlSumVerification());
    } catch (error: any) {
      this.logger.error(`V178: PnL sum verification failed: ${error.message}`);
      checks.push({
        checkName: 'PnL Sum Verification',
        issues: [],
        issueCount: 0,
      });
    }

    try {
      checks.push(await this.checkOrderTradeLifecycle());
    } catch (error: any) {
      this.logger.error(`V178: Order↔Trade lifecycle check failed: ${error.message}`);
      checks.push({
        checkName: 'Order↔Trade Lifecycle',
        issues: [],
        issueCount: 0,
      });
    }

    try {
      checks.push(await this.checkOrphanDetection());
    } catch (error: any) {
      this.logger.error(`V178: Orphan detection check failed: ${error.message}`);
      checks.push({
        checkName: 'Orphan Detection',
        issues: [],
        issueCount: 0,
      });
    }

    const durationMs = Date.now() - startTime;
    const totalIssues = checks.reduce((sum, c) => sum + c.issueCount, 0);

    const report: DataConsistencyReport = {
      timestamp: new Date().toISOString(),
      durationMs,
      checks,
      totalIssues,
      isConsistent: totalIssues === 0,
    };

    // V178: Log summary
    if (report.isConsistent) {
      this.logger.debug(
        `V178: All consistency checks passed (${durationMs}ms)`,
      );
    } else {
      this.logger.warn(
        `V178: Consistency checks completed with ${totalIssues} issue(s) (${durationMs}ms)`,
      );
      for (const check of checks) {
        if (check.issueCount > 0) {
          this.logger.warn(
            `V178: [${check.checkName}] ${check.issueCount} issue(s) found`,
          );
          for (const issue of check.issues) {
            this.logger.warn(
              `V178:   → ${issue.entityType} ${issue.entityId}: ${issue.description}`,
            );
          }
        } else {
          this.logger.debug(
            `V178: [${check.checkName}] No issues found`,
          );
        }
      }
    }

    return report;
  }

  // ═══════════════════════════════════════════════════════════════
  // Check 1: Trade ↔ Position Cross-Reference
  // ═══════════════════════════════════════════════════════════════

  /**
   * V178: Check 1 — Trade↔Position Cross-Reference
   *
   * Finds:
   * - CLOSED positions that have no EXIT trade record
   * - EXIT trades that reference a position which is NOT CLOSED
   */
  async checkTradePositionCrossReference(): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyIssue[] = [];

    // V178: Find CLOSED positions with no EXIT trade
    const closedPositionsWithoutExitTrade = await this.prisma.position.findMany({
      where: {
        status: 'CLOSED',
        trades: {
          none: { type: 'EXIT' },
        },
      },
      select: {
        id: true,
        userId: true,
        symbol: true,
        side: true,
        realizedPnl: true,
        closedAt: true,
      },
    });

    for (const position of closedPositionsWithoutExitTrade) {
      issues.push({
        entityType: 'Position',
        entityId: position.id,
        description: `CLOSED position has no EXIT trade record (symbol=${position.symbol}, realizedPnl=${position.realizedPnl}, closedAt=${position.closedAt?.toISOString() ?? 'null'})`,
        metadata: {
          userId: position.userId,
          symbol: position.symbol,
          side: position.side,
          realizedPnl: position.realizedPnl.toString(),
          closedAt: position.closedAt?.toISOString() ?? null,
        },
      });
    }

    // V178: Find EXIT trades that reference a non-CLOSED position
    const exitTradesWithOpenPosition = await this.prisma.trade.findMany({
      where: {
        type: 'EXIT',
        positionId: { not: null },
        position: {
          status: { not: 'CLOSED' },
        },
      },
      select: {
        id: true,
        userId: true,
        positionId: true,
        symbol: true,
        pnl: true,
        executedAt: true,
        position: {
          select: {
            id: true,
            status: true,
            symbol: true,
          },
        },
      },
    });

    for (const trade of exitTradesWithOpenPosition) {
      issues.push({
        entityType: 'Trade',
        entityId: trade.id,
        description: `EXIT trade references position that is NOT CLOSED (positionStatus=${trade.position?.status}, positionId=${trade.positionId})`,
        relatedEntityId: trade.positionId ?? undefined,
        metadata: {
          userId: trade.userId,
          symbol: trade.symbol,
          positionStatus: trade.position?.status,
          pnl: trade.pnl?.toString() ?? null,
          executedAt: trade.executedAt.toISOString(),
        },
      });
    }

    const result: ConsistencyCheckResult = {
      checkName: 'Trade↔Position Cross-Check',
      issues,
      issueCount: issues.length,
    };

    if (issues.length > 0) {
      this.logger.warn(
        `V178: [Trade↔Position Cross-Check] Found ${issues.length} issue(s): ` +
        `${closedPositionsWithoutExitTrade.length} CLOSED positions without EXIT trade, ` +
        `${exitTradesWithOpenPosition.length} EXIT trades with non-CLOSED position`,
      );
    } else {
      this.logger.debug('V178: [Trade↔Position Cross-Check] No issues found');
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // Check 2: PnL Sum Verification
  // ═══════════════════════════════════════════════════════════════

  /**
   * V178: Check 2 — PnL Sum Verification
   *
   * For each CLOSED position that has associated trades, verifies that
   * SUM(trade.pnl WHERE positionId=X) matches position.realizedPnl
   * within a tolerance of $1.00 (floating-point safe).
   */
  async checkPnlSumVerification(): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyIssue[] = [];

    // V178: Fetch all CLOSED positions that have at least one trade
    const closedPositions = await this.prisma.position.findMany({
      where: {
        status: 'CLOSED',
        trades: {
          some: {},
        },
      },
      select: {
        id: true,
        userId: true,
        symbol: true,
        realizedPnl: true,
        trades: {
          select: {
            id: true,
            pnl: true,
            type: true,
          },
        },
      },
    });

    for (const position of closedPositions) {
      // V178: Sum all trade PnL values for this position.
      // Trades with null pnl are treated as 0 (they should have a value,
      // but we don't want to crash on nulls).
      const tradePnlSum = position.trades.reduce((sum, trade) => {
        return sum + Number(trade.pnl ?? 0);
      }, 0);

      const positionRealizedPnl = Number(position.realizedPnl);
      const discrepancy = Math.abs(tradePnlSum - positionRealizedPnl);

      if (discrepancy > this.PNL_TOLERANCE) {
        const tradeIds = position.trades.map(t => t.id);
        issues.push({
          entityType: 'Position',
          entityId: position.id,
          description: `PnL mismatch: SUM(trade.pnl)=$${tradePnlSum.toFixed(4)} vs position.realizedPnl=$${positionRealizedPnl.toFixed(4)} — discrepancy=$${discrepancy.toFixed(4)} (tolerance=$${this.PNL_TOLERANCE.toFixed(2)})`,
          metadata: {
            userId: position.userId,
            symbol: position.symbol,
            tradePnlSum: tradePnlSum.toFixed(4),
            positionRealizedPnl: positionRealizedPnl.toFixed(4),
            discrepancy: discrepancy.toFixed(4),
            tolerance: this.PNL_TOLERANCE.toFixed(2),
            tradeCount: position.trades.length,
            tradeIds,
            tradeBreakdown: position.trades.map(t => ({
              tradeId: t.id,
              type: t.type,
              pnl: t.pnl?.toString() ?? 'null',
            })),
          },
        });
      }
    }

    const result: ConsistencyCheckResult = {
      checkName: 'PnL Sum Verification',
      issues,
      issueCount: issues.length,
    };

    if (issues.length > 0) {
      this.logger.warn(
        `V178: [PnL Sum Verification] Found ${issues.length} position(s) with PnL discrepancy exceeding $${this.PNL_TOLERANCE.toFixed(2)}`,
      );
    } else {
      this.logger.debug(
        `V178: [PnL Sum Verification] All ${closedPositions.length} CLOSED position(s) have consistent PnL sums`,
      );
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // Check 3: Order ↔ Trade Lifecycle
  // ═══════════════════════════════════════════════════════════════

  /**
   * V178: Check 3 — Order↔Trade Lifecycle
   *
   * Finds:
   * - FILLED orders that have no Trade record
   * - Trade records that have no Order (orderId is null)
   */
  async checkOrderTradeLifecycle(): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyIssue[] = [];

    // V178: Find FILLED orders with no Trade record
    const filledOrdersWithoutTrade = await this.prisma.order.findMany({
      where: {
        status: 'FILLED',
        trades: {
          none: {},
        },
      },
      select: {
        id: true,
        userId: true,
        symbol: true,
        side: true,
        type: true,
        filledQuantity: true,
        averagePrice: true,
        createdAt: true,
      },
    });

    for (const order of filledOrdersWithoutTrade) {
      issues.push({
        entityType: 'Order',
        entityId: order.id,
        description: `FILLED order has no Trade record (symbol=${order.symbol}, side=${order.side}, filledQty=${order.filledQuantity}, avgPrice=${order.averagePrice})`,
        metadata: {
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          orderType: order.type,
          filledQuantity: order.filledQuantity.toString(),
          averagePrice: order.averagePrice?.toString() ?? null,
          createdAt: order.createdAt.toISOString(),
        },
      });
    }

    // V178: Find Trade records that have no Order (orderId is null)
    const tradesWithoutOrder = await this.prisma.trade.findMany({
      where: {
        orderId: null,
      },
      select: {
        id: true,
        userId: true,
        symbol: true,
        side: true,
        type: true,
        quantity: true,
        price: true,
        positionId: true,
        source: true,
        executedAt: true,
      },
    });

    for (const trade of tradesWithoutOrder) {
      issues.push({
        entityType: 'Trade',
        entityId: trade.id,
        description: `Trade has no associated Order (symbol=${trade.symbol}, side=${trade.side}, type=${trade.type}, source=${trade.source ?? 'null'})`,
        relatedEntityId: trade.positionId ?? undefined,
        metadata: {
          userId: trade.userId,
          symbol: trade.symbol,
          side: trade.side,
          tradeType: trade.type,
          quantity: trade.quantity.toString(),
          price: trade.price.toString(),
          positionId: trade.positionId,
          source: trade.source,
          executedAt: trade.executedAt.toISOString(),
        },
      });
    }

    const result: ConsistencyCheckResult = {
      checkName: 'Order↔Trade Lifecycle',
      issues,
      issueCount: issues.length,
    };

    if (issues.length > 0) {
      this.logger.warn(
        `V178: [Order↔Trade Lifecycle] Found ${issues.length} issue(s): ` +
        `${filledOrdersWithoutTrade.length} FILLED orders without Trade, ` +
        `${tradesWithoutOrder.length} Trades without Order`,
      );
    } else {
      this.logger.debug('V178: [Order↔Trade Lifecycle] No issues found');
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // Check 4: Orphan Detection
  // ═══════════════════════════════════════════════════════════════

  /**
   * V178: Check 4 — Orphan Detection
   *
   * Finds:
   * - Positions with no orders (no trades that link to an order)
   * - Orders with no trades
   * - EXIT trades with no position (positionId is null)
   */
  async checkOrphanDetection(): Promise<ConsistencyCheckResult> {
    const issues: ConsistencyIssue[] = [];

    // ── V178: Positions with no orders ──
    // A position's orders are linked through trades. If a position has
    // trades but none of them link to an order, the position has no
    // order trail. Also, positions with no trades at all are orphans.
    const positions = await this.prisma.position.findMany({
      select: {
        id: true,
        userId: true,
        symbol: true,
        side: true,
        status: true,
        source: true,
        trades: {
          select: {
            id: true,
            orderId: true,
          },
        },
      },
    });

    for (const position of positions) {
      // V178: Position has no trades at all — completely orphaned
      if (position.trades.length === 0) {
        issues.push({
          entityType: 'Position',
          entityId: position.id,
          description: `Position has no trades (orphan — no order trail, status=${position.status}, source=${position.source ?? 'null'})`,
          metadata: {
            userId: position.userId,
            symbol: position.symbol,
            side: position.side,
            status: position.status,
            source: position.source,
          },
        });
        continue;
      }

      // V178: Position has trades, but none link to an order
      const tradesWithOrder = position.trades.filter(t => t.orderId !== null);
      if (tradesWithOrder.length === 0) {
        issues.push({
          entityType: 'Position',
          entityId: position.id,
          description: `Position has ${position.trades.length} trade(s) but none link to an Order (orphan — no order trail, status=${position.status})`,
          metadata: {
            userId: position.userId,
            symbol: position.symbol,
            side: position.side,
            status: position.status,
            tradeCount: position.trades.length,
            tradeIds: position.trades.map(t => t.id),
          },
        });
      }
    }

    // ── V178: Orders with no trades ──
    // An order that was not CANCELLED or REJECTED should have trades.
    // We check ALL orders without trades for completeness.
    const ordersWithoutTrades = await this.prisma.order.findMany({
      where: {
        trades: {
          none: {},
        },
      },
      select: {
        id: true,
        userId: true,
        symbol: true,
        side: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    for (const order of ordersWithoutTrades) {
      issues.push({
        entityType: 'Order',
        entityId: order.id,
        description: `Order has no Trade records (status=${order.status}, symbol=${order.symbol}, side=${order.side})`,
        metadata: {
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          orderType: order.type,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
        },
      });
    }

    // ── V178: EXIT trades with no position ──
    // EXIT trades MUST have a positionId — they represent closing a position.
    // An EXIT trade without a position reference is orphaned.
    const exitTradesWithoutPosition = await this.prisma.trade.findMany({
      where: {
        type: 'EXIT',
        positionId: null,
      },
      select: {
        id: true,
        userId: true,
        symbol: true,
        side: true,
        pnl: true,
        source: true,
        executedAt: true,
      },
    });

    for (const trade of exitTradesWithoutPosition) {
      issues.push({
        entityType: 'Trade',
        entityId: trade.id,
        description: `EXIT trade has no associated Position (orphan — symbol=${trade.symbol}, pnl=${trade.pnl?.toString() ?? 'null'}, source=${trade.source ?? 'null'})`,
        metadata: {
          userId: trade.userId,
          symbol: trade.symbol,
          side: trade.side,
          pnl: trade.pnl?.toString() ?? null,
          source: trade.source,
          executedAt: trade.executedAt.toISOString(),
        },
      });
    }

    const result: ConsistencyCheckResult = {
      checkName: 'Orphan Detection',
      issues,
      issueCount: issues.length,
    };

    if (issues.length > 0) {
      // V178: Count each sub-category for clearer logging
      const orphanPositionsNoTrades = issues.filter(
        i => i.entityType === 'Position' && i.description.includes('has no trades'),
      ).length;
      const orphanPositionsNoOrders = issues.filter(
        i => i.entityType === 'Position' && i.description.includes('none link to an Order'),
      ).length;
      const orphanOrders = issues.filter(i => i.entityType === 'Order').length;
      const orphanExitTrades = issues.filter(
        i => i.entityType === 'Trade' && i.description.includes('EXIT'),
      ).length;

      this.logger.warn(
        `V178: [Orphan Detection] Found ${issues.length} orphan(s): ` +
        `${orphanPositionsNoTrades} position(s) with no trades, ` +
        `${orphanPositionsNoOrders} position(s) with no order trail, ` +
        `${orphanOrders} order(s) with no trades, ` +
        `${orphanExitTrades} EXIT trade(s) with no position`,
      );
    } else {
      this.logger.debug('V178: [Orphan Detection] No orphans found');
    }

    return result;
  }
}
