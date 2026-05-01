// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Queue Processor (BullMQ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Processor, WorkerHost, OnQueueEvent, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue, QueueEventsListener } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExecutionGatewayService } from '../gateways/execution-gateway.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { ConnectionResilienceService } from './connection-resilience.service';
import { RateLimiterService } from './rate-limiter.service';
import { AuditService } from '../../../audit/audit.service';
import { UnifiedOrder } from '../adapters/base-adapter.interface';

/**
 * OrderQueueProcessor — BullMQ Worker for Order Execution
 *
 * Processes jobs from the `execution_queue` BullMQ queue.
 * Each job represents a validated, risk-checked order that needs
 * to be executed on the appropriate exchange.
 *
 * Processing Flow:
 * ┌───────────────────────────────────────────────────────────────┐
 * │                                                               │
 * │  Job received from execution_queue                            │
 * │    ↓                                                          │
 * │  1. Extract userId + exchangeCredentialId from job data       │
 * │  2. Check rate limits (RateLimiterService)                    │
 * │  3. Get adapter via ExecutionGatewayService                   │
 * │  4. Execute order via adapter.placeOrder()                    │
 * │  5. Handle result via OrderLifecycleService                   │
 * │  6. Watch order via ConnectionResilienceService               │
 * │  7. Audit log the execution                                   │
 * │                                                               │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Error Handling:
 * - Rate limited → retry with exponential backoff
 * - Transient errors (network) → retry up to 3 times
 * - Permanent errors (invalid order) → mark as REJECTED, no retry
 *
 * Job Configuration:
 * - Queue: execution_queue
 * - Job ID: idempotencyKey (guarantees uniqueness)
 * - Concurrency: 5 (process up to 5 orders simultaneously)
 * - Attempts: 3 with exponential backoff (5s, 25s, 125s)
 */
@Processor('execution_queue', {
  concurrency: 5,
})
@Injectable()
export class OrderQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderQueueProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayService: ExecutionGatewayService,
    private readonly lifecycleService: OrderLifecycleService,
    private readonly resilienceService: ConnectionResilienceService,
    private readonly rateLimiter: RateLimiterService,
    private readonly auditService: AuditService,
  ) {
    super();
    this.logger.log('⚙️ Order Queue Processor initialized — ready to process execution jobs');
  }

  /**
   * Process an execution job
   *
   * This method is called automatically by BullMQ when a job
   * is available in the execution_queue. It extends WorkerHost
   * and implements the process() method.
   *
   * @param job The BullMQ job containing the order data
   * @param token Optional token for job stabilization
   */
  async process(job: Job<ExecutionJobData>, token?: string): Promise<ExecutionJobResult> {
    const { orderId, userId, exchangeCredentialId, symbol, side, type, quantity, price, stopLoss, takeProfit, idempotencyKey, clientOrderId } = job.data;

    this.logger.log(
      `⚙️ Processing execution job: ${orderId} (${side} ${quantity} ${symbol}) — attempt ${(job as any).attemptsStarted || 1}`,
    );

    try {
      // Step 1: Verify order is still in ACCEPTED state
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return { success: false, error: 'الطلب غير موجود' };
      }

      if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
        this.logger.warn(`⚙️ Order ${orderId} is in state "${order.status}" — skipping execution`);
        return { success: false, error: `حالة الطلب "${order.status}" لا تسمح بالتنفيذ` };
      }

      // Step 2: Check rate limits
      const exchange = order.exchange || 'unknown';
      const withinLimits = await this.rateLimiter.checkRateLimit(exchange, userId);

      if (!withinLimits) {
        // Rate limited — throw to trigger BullMQ retry with backoff
        throw new Error(`Rate limit exceeded for ${exchange} — will retry`);
      }

      // Step 3: Build UnifiedOrder from job data
      const unifiedOrder: UnifiedOrder = {
        id: orderId,
        userId,
        exchangeCredentialId,
        symbol,
        side: side as 'BUY' | 'SELL',
        type: type as 'MARKET' | 'LIMIT',
        quantity,
        price,
        stopLoss,
        takeProfit,
        idempotencyKey,
        clientOrderId,
      };

      // Step 4: Record SENT_TO_EXCHANGE event
      await this.prisma.orderEvent.create({
        data: {
          orderId,
          eventType: 'SENT_TO_EXCHANGE' as any,
          payload: JSON.stringify({
            source: 'QUEUE_PROCESSOR',
            jobId: job.id,
            attempt: (job as any).attemptsStarted || 1,
            sentAt: new Date().toISOString(),
          }),
        },
      });

      // Step 5: Execute via ExecutionGatewayService
      const result = await this.gatewayService.placeOrder(userId, unifiedOrder);

      // Step 6: Handle result via OrderLifecycleService
      await this.lifecycleService.handleExecutionResult(result, orderId, userId);

      // Step 7: If order has exchangeOrderId, start watching it
      if (result.success && result.exchangeOrderId) {
        await this.resilienceService.watchOrder({
          id: orderId,
          userId,
          exchangeCredentialId,
          symbol,
          exchangeOrderId: result.exchangeOrderId,
        });
      }

      // Step 8: Audit log
      await this.auditService.log({
        userId,
        action: result.success ? 'ORDER_EXECUTED_VIA_QUEUE' : 'ORDER_EXECUTION_FAILED_VIA_QUEUE',
        resource: 'execution-queue',
        details: JSON.stringify({
          orderId,
          symbol,
          side,
          type,
          quantity,
          jobId: job.id,
          success: result.success,
          exchangeOrderId: result.exchangeOrderId,
          filledQuantity: result.filledQuantity,
          averagePrice: result.averagePrice,
          error: result.error,
        }),
      });

      return {
        success: result.success,
        exchangeOrderId: result.exchangeOrderId,
        filledQuantity: result.filledQuantity,
        averagePrice: result.averagePrice,
        error: result.error,
      };
    } catch (error: any) {
      this.logger.error(
        `⚙️ Execution job failed: ${orderId} — ${error.message}`,
      );

      // Determine if this is a retryable error
      const isTransient = this._isTransientError(error);

      if (!isTransient) {
        // Permanent error — mark order as REJECTED
        await this.lifecycleService.handleExecutionResult(
          {
            success: false,
            error: error.message,
            timestamp: new Date(),
          },
          orderId,
          userId,
        );
      }

      // Re-throw to trigger BullMQ retry logic
      throw error;
    }
  }

  // ── Private Helpers ──

  /**
   * Determine if an error is transient (retryable) or permanent
   */
  private _isTransientError(error: any): boolean {
    const message = error.message || '';
    const transientPatterns = [
      'Rate limit',
      'Network',
      'timeout',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'socket hang up',
      'internal server error',
      '502',
      '503',
      '504',
      'Service Unavailable',
      'Too Many Requests',
      '429',
    ];

    return transientPatterns.some((pattern) =>
      message.toLowerCase().includes(pattern.toLowerCase()),
    );
  }
}

// ── Job Data Types ──

export interface ExecutionJobData {
  orderId: string;
  userId: string;
  exchangeCredentialId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  idempotencyKey: string;
  clientOrderId?: string;
}

export interface ExecutionJobResult {
  success: boolean;
  exchangeOrderId?: string;
  filledQuantity?: number;
  averagePrice?: number;
  error?: string;
}
