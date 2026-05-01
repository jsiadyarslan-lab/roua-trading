// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Lifecycle Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { ExecutionResult, OrderExecutionStatus } from '../adapters/base-adapter.interface';

/**
 * OrderLifecycleService — Execution-Aware Order State Manager
 *
 * Manages the order state transitions that are specifically triggered
 * by execution results from exchange adapters. This service works
 * alongside (not replacing) the OrderStateManagerService in the
 * Trading Module.
 *
 * Lifecycle Flow:
 * ┌───────────────────────────────────────────────────────────────┐
 * │                                                               │
 * │  ExecutionResult (from adapter)                               │
 * │       ↓                                                       │
 * │  handleExecutionResult()                                      │
 * │       ├─ Success → ACCEPTED or FILLED (depends on exchange)    │
 * │       └─ Failure → REJECTED with reason                      │
 * │       ↓                                                       │
 * │  OrderEvent recorded (immutable audit trail)                  │
 * │       ↓                                                       │
 * │  Position updated (if FILLED)                                 │
 * │                                                               │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Key Difference from OrderStateManagerService:
 * - OrderStateManagerService: Handles trading-layer transitions
 *   (PENDING → ACCEPTED → queue)
 * - OrderLifecycleService: Handles execution-layer transitions
 *   (ACCEPTED → FILLED/REJECTED after exchange response)
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('🔄 Order Lifecycle Service initialized — execution state management active');
  }

  /**
   * Handle an execution result from an exchange adapter
   *
   * This is the main entry point after an adapter returns a result.
   * It updates the order status, records events, and manages positions.
   *
   * @param result The execution result from the exchange adapter
   * @param orderId The internal order ID (not exchange order ID)
   * @param userId The user who owns the order
   */
  async handleExecutionResult(
    result: ExecutionResult,
    orderId: string,
    userId: string,
  ): Promise<void> {
    this.logger.debug(`🔄 Handling execution result for order ${orderId}: ${result.success ? 'SUCCESS' : 'FAILURE'}`);

    if (result.success) {
      await this._handleSuccess(result, orderId, userId);
    } else {
      await this._handleFailure(result, orderId, userId);
    }
  }

  /**
   * Sync order status from the exchange
   *
   * Fetches the current status of an order from the exchange
   * and updates the local database to match. Used for:
   * - REST polling fallback when WebSocket is unavailable
   * - Periodic reconciliation of order states
   * - Recovery after connection interruption
   *
   * @param orderId The internal order ID
   * @param exchangeOrderId The exchange's order ID
   * @param adapterStatus The status from the exchange adapter
   */
  async syncOrderFromExchange(
    orderId: string,
    exchangeOrderId: string,
    adapterStatus: OrderExecutionStatus,
  ): Promise<void> {
    this.logger.debug(`🔄 Syncing order ${orderId} from exchange (status: ${adapterStatus})`);

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        this.logger.warn(`Order ${orderId} not found for sync`);
        return;
      }

      // Map adapter status to our internal status
      const newStatus = this._mapAdapterStatus(adapterStatus);

      // Skip if status hasn't changed
      if (order.status === newStatus) {
        return;
      }

      // Update order and record event
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: orderId },
          data: {
            status: newStatus as any,
            exchangeOrderId,
          },
        }),
        this.prisma.orderEvent.create({
          data: {
            orderId,
            eventType: this._statusToEventType(newStatus) as any,
            payload: JSON.stringify({
              source: 'SYNC_FROM_EXCHANGE',
              previousStatus: order.status,
              newStatus,
              exchangeOrderId,
              syncedAt: new Date().toISOString(),
            }),
          },
        }),
      ]);

      this.logger.log(`🔄 Order ${orderId} synced: ${order.status} → ${newStatus}`);
    } catch (error: any) {
      this.logger.error(`Failed to sync order ${orderId}: ${error.message}`);
    }
  }

  // ── Private: Success Handling ──

  private async _handleSuccess(
    result: ExecutionResult,
    orderId: string,
    userId: string,
  ): Promise<void> {
    // Determine the new status based on execution result
    // MARKET orders on crypto exchanges often fill immediately → FILLED
    // LIMIT orders or stock orders may return ACCEPTED → need further monitoring
    const newStatus = result.status === OrderExecutionStatus.FILLED
      ? 'FILLED'
      : result.status === OrderExecutionStatus.PARTIALLY_FILLED
        ? 'PARTIALLY_FILLED'
        : 'ACCEPTED';

    // Update order and record event atomically
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: newStatus as any,
          filledQuantity: result.filledQuantity || 0,
          averagePrice: result.averagePrice,
          fee: result.fee,
          feeCurrency: result.feeCurrency,
          exchangeOrderId: result.exchangeOrderId,
        },
      }),
      this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: newStatus === 'FILLED' ? 'FILLED' as any : 'ACCEPTED' as any,
          payload: JSON.stringify({
            source: 'EXECUTION_RESULT',
            exchangeOrderId: result.exchangeOrderId,
            filledQuantity: result.filledQuantity,
            averagePrice: result.averagePrice,
            fee: result.fee,
            feeCurrency: result.feeCurrency,
            executedAt: new Date().toISOString(),
          }),
        },
      }),
    ]);

    // If FILLED, update position
    if (newStatus === 'FILLED' || newStatus === 'PARTIALLY_FILLED') {
      await this._updatePosition(orderId, result, userId);
    }

    // Audit log
    await this.auditService.log({
      userId,
      action: `ORDER_${newStatus}`,
      resource: 'order-lifecycle',
      details: JSON.stringify({
        orderId,
        exchangeOrderId: result.exchangeOrderId,
        filledQuantity: result.filledQuantity,
        averagePrice: result.averagePrice,
        fee: result.fee,
      }),
    });

    this.logger.log(
      `✅ Order ${orderId} → ${newStatus} (fill: ${result.filledQuantity} @ ${result.averagePrice})`,
    );
  }

  // ── Private: Failure Handling ──

  private async _handleFailure(
    result: ExecutionResult,
    orderId: string,
    userId: string,
  ): Promise<void> {
    // Update order to REJECTED and record event
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'REJECTED' as any,
          rejectReason: result.error || 'Execution failed',
        },
      }),
      this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: 'RISK_REJECTED' as any,
          payload: JSON.stringify({
            source: 'EXECUTION_RESULT',
            reason: result.error,
            rejectedAt: new Date().toISOString(),
          }),
        },
      }),
    ]);

    // Audit log
    await this.auditService.log({
      userId,
      action: 'ORDER_REJECTED_BY_EXCHANGE',
      resource: 'order-lifecycle',
      details: JSON.stringify({
        orderId,
        reason: result.error,
      }),
    });

    this.logger.warn(`❌ Order ${orderId} → REJECTED: ${result.error}`);
  }

  // ── Private: Position Management ──

  private async _updatePosition(
    orderId: string,
    result: ExecutionResult,
    userId: string,
  ): Promise<void> {
    if (!result.filledQuantity || result.filledQuantity <= 0) return;
    if (!result.averagePrice || result.averagePrice <= 0) return;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) return;

      // Check for existing position to add to
      const existingPosition = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol: order.symbol,
          status: 'OPEN',
          side: order.side,
        },
      });

      if (existingPosition) {
        // Add to existing position (average price calculation)
        const totalQuantity = Number(existingPosition.quantity) + result.filledQuantity;
        const avgPrice =
          (Number(existingPosition.entryPrice) * Number(existingPosition.quantity) +
            result.averagePrice * result.filledQuantity) /
          totalQuantity;

        await this.prisma.position.update({
          where: { id: existingPosition.id },
          data: {
            quantity: totalQuantity,
            entryPrice: avgPrice,
            currentPrice: result.averagePrice,
            stopLoss: Number(order.stopLoss) || existingPosition.stopLoss,
            takeProfit: Number(order.takeProfit) || existingPosition.takeProfit,
          },
        });
      } else {
        // Open new position
        const credential = await this.prisma.exchangeCredential.findUnique({
          where: { id: order.exchangeCredentialId },
        });

        await this.prisma.position.create({
          data: {
            userId,
            credentialId: order.exchangeCredentialId,
            exchange: credential?.exchange || order.exchange || 'unknown',
            symbol: order.symbol,
            side: order.side,
            status: 'OPEN',
            quantity: result.filledQuantity,
            entryPrice: result.averagePrice,
            currentPrice: result.averagePrice,
            highestPrice: result.averagePrice,
            lowestPrice: result.averagePrice,
            stopLoss: Number(order.stopLoss) || null,
            takeProfit: Number(order.takeProfit) || null,
          },
        });
      }

      // Record trade
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: order.exchangeCredentialId },
      });

      await this.prisma.trade.create({
        data: {
          userId,
          orderId,
          exchange: credential?.exchange || order.exchange || 'unknown',
          symbol: order.symbol,
          side: order.side,
          type: 'ENTRY',
          quantity: result.filledQuantity,
          price: result.averagePrice,
          fee: result.fee || 0,
          feeCurrency: result.feeCurrency,
        },
      });

      this.logger.log(
        `📊 Position updated for ${order.symbol}: ${result.filledQuantity} @ ${result.averagePrice}`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to update position for order ${orderId}: ${error.message}`);
    }
  }

  // ── Private: Status Mapping ──

  private _mapAdapterStatus(status: OrderExecutionStatus): string {
    const mapping: Record<OrderExecutionStatus, string> = {
      [OrderExecutionStatus.PENDING]: 'PENDING',
      [OrderExecutionStatus.ACCEPTED]: 'ACCEPTED',
      [OrderExecutionStatus.PARTIALLY_FILLED]: 'PARTIALLY_FILLED',
      [OrderExecutionStatus.FILLED]: 'FILLED',
      [OrderExecutionStatus.CANCELLED]: 'CANCELLED',
      [OrderExecutionStatus.REJECTED]: 'REJECTED',
      [OrderExecutionStatus.EXPIRED]: 'CANCELLED',
    };
    return mapping[status] || 'PENDING';
  }

  private _statusToEventType(status: string): string {
    const mapping: Record<string, string> = {
      PENDING: 'CREATED',
      ACCEPTED: 'ACCEPTED',
      PARTIALLY_FILLED: 'FILLED',
      FILLED: 'FILLED',
      CANCELLED: 'CANCELLED',
      REJECTED: 'RISK_REJECTED',
    };
    return mapping[status] || 'CREATED';
  }
}
