import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { OrderCommand, OrderEventTypeEnum, OrderStatusEnum } from '../events/order.events';

/**
 * Order State Manager Service — Order Lifecycle Management
 *
 * Manages the complete lifecycle of trading orders:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ PENDING → ACCEPTED → SENT_TO_EXCHANGE → FILLED             │
 * │    │                                                      │
 * │    └→ RISK_REJECTED                                       │
 * │                                                          │
 * │ Any state → CANCELLED                                     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * All state transitions are recorded as OrderEvent (append-only log)
 * providing a complete audit trail that cannot be modified.
 *
 * Features:
 * - createOrder: Creates initial PENDING order in DB
 * - updateOrderStatus: Transitions order state with event logging
 * - findOrderById: Retrieves order with full event history
 * - Immutable event log for compliance and debugging
 */
@Injectable()
export class OrderStateManagerService {
  private readonly logger = new Logger(OrderStateManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('📋 Order State Manager initialized — lifecycle tracking active');
  }

  /**
   * Create a new order in PENDING state
   * Records a CREATED event in the event log
   *
   * @param command The validated order command
   * @returns The created Order record
   */
  async createOrder(command: OrderCommand): Promise<any> {
    this.logger.debug(`📋 Creating order: ${command.side} ${command.quantity} ${command.symbol}`);

    // Create order with PENDING status and initial CREATED event
    const order = await this.prisma.order.create({
      data: {
        userId: command.userId,
        exchangeCredentialId: command.exchangeCredentialId,
        symbol: command.symbol,
        side: command.side as any,
        type: command.type as any,
        quantity: command.quantity as any,
        price: command.price ? (command.price as any) : null,
        stopLoss: command.stopLoss as any,
        takeProfit: command.takeProfit ? (command.takeProfit as any) : null,
        status: 'PENDING' as any,
        filledQuantity: 0 as any,
        idempotencyKey: command.idempotencyKey,
        clientOrderId: command.clientOrderId,
        events: {
          create: {
            eventType: 'CREATED' as any,
            payload: JSON.stringify({
              command: {
                symbol: command.symbol,
                side: command.side,
                type: command.type,
                quantity: command.quantity,
                price: command.price,
                stopLoss: command.stopLoss,
                takeProfit: command.takeProfit,
              },
              ipAddress: command.ipAddress,
              userAgent: command.userAgent,
            }),
          },
        },
      },
      include: { events: true },
    });

    // Audit log
    await this.auditService.log({
      userId: command.userId,
      action: 'ORDER_CREATED',
      resource: 'order',
      details: JSON.stringify({
        orderId: order.id,
        symbol: command.symbol,
        side: command.side,
        type: command.type,
        quantity: command.quantity,
        stopLoss: command.stopLoss,
        idempotencyKey: command.idempotencyKey,
      }),
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
    });

    this.logger.log(`📋 Order created: ${order.id} — ${command.side} ${command.quantity} ${command.symbol}`);

    return order;
  }

  /**
   * Update order status with event logging
   *
   * This is the ONLY way to change order status.
   * Every transition is recorded as an immutable OrderEvent.
   *
   * @param orderId The order ID
   * @param status The new status
   * @param payload Optional event payload (reason, fill data, etc.)
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatusEnum | string,
    payload?: Record<string, any>,
  ): Promise<void> {
    this.logger.debug(`📋 Updating order ${orderId} → ${status}`);

    // Map status to event type
    const eventType = this._statusToEventType(status);

    // Update order status and create event in a transaction
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: status as any,
          ...(payload?.filledQuantity !== undefined && { filledQuantity: payload.filledQuantity as any }),
          ...(payload?.averagePrice !== undefined && { averagePrice: payload.averagePrice as any }),
          ...(payload?.exchangeOrderId !== undefined && { exchangeOrderId: payload.exchangeOrderId }),
        },
      }),
      this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: eventType as any,
          payload: payload ? JSON.stringify(payload) : null,
        },
      }),
    ]);

    this.logger.log(`📋 Order ${orderId} → ${status} (event: ${eventType})`);
  }

  /**
   * Reject an order due to risk check failure
   * Creates a RISK_REJECTED event with the rejection reason
   */
  async rejectOrder(orderId: string, reason: string, failedCheck?: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'REJECTED' as any },
      }),
      this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: 'RISK_REJECTED' as any,
          payload: JSON.stringify({ reason, failedCheck }),
        },
      }),
    ]);

    this.logger.warn(`🛡️ Order ${orderId} REJECTED: ${reason}`);
  }

  /**
   * Find an order by ID with full event history
   */
  async findOrderById(orderId: string): Promise<any> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        events: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`الطلب ${orderId} غير موجود`);
    }

    return order;
  }

  /**
   * Find orders for a user with optional filters
   */
  async findOrders(
    userId: string,
    filters?: { symbol?: string; status?: string; limit?: number },
  ): Promise<any[]> {
    const where: any = { userId };
    if (filters?.symbol) where.symbol = filters.symbol;
    if (filters?.status) where.status = filters.status;

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      include: {
        events: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
    });
  }

  /**
   * Get the full event history for an order (append-only log)
   */
  async getOrderEvents(orderId: string): Promise<any[]> {
    return this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });
  }

  // ── Private Helpers ──

  /**
   * Map order status to event type
   */
  private _statusToEventType(status: string): string {
    const mapping: Record<string, string> = {
      PENDING: 'CREATED',
      ACCEPTED: 'CREATED',
      PARTIALLY_FILLED: 'FILLED',
      FILLED: 'FILLED',
      CANCELLED: 'CANCELLED',
      REJECTED: 'RISK_REJECTED',
    };
    return mapping[status] || 'CREATED';
  }
}
