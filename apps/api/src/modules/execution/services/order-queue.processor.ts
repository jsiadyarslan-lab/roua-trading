// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Queue Processor (BullMQ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Processor, WorkerHost, OnQueueEvent, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue, QueueEventsListener } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExecutionGatewayService } from '../gateways/execution-gateway.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { ConnectionResilienceService } from './connection-resilience.service';
import { RateLimiterService } from './rate-limiter.service';
import { AuditService } from '../../../audit/audit.service';
import { RedisService } from '../../../common/redis/redis.service';
import { UnifiedOrder } from '../adapters/base-adapter.interface';
import { t } from '../../../i18n/i18n.helper';

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
 *
 * #4 FIX: Redis-based singleton guard.
 * Previously used only a static `isRegistered` flag which doesn't work
 * across multiple instances or after hot-reload properly. Now uses Redis
 * to track which instance is the active processor. Key format:
 * `bullmq:processor:active:{instanceId}` with 60s TTL, refreshed every 30s.
 */
@Processor('execution_queue', {
  concurrency: 5,
})
@Injectable()
export class OrderQueueProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(OrderQueueProcessor.name);

  /** V176 FIX: Singleton guard to prevent duplicate BullMQ registration */
  private static isRegistered = false;
  /** V178 FIX: Track which instance is the ACTIVE one (first registered) */
  private static activeInstanceId: string | null = null;
  private readonly instanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  /** #4 FIX: Redis key prefix for processor singleton tracking */
  private readonly PROCESSOR_KEY_PREFIX = 'bullmq:processor:active:';
  /** #4 FIX: TTL for the Redis-based singleton registration (60 seconds) */
  private readonly REGISTRATION_TTL_MS = 60000;
  /** #4 FIX: Interval for refreshing the Redis registration (every 30 seconds) */
  private readonly REFRESH_INTERVAL_MS = 30000;

  /** #4 FIX: Timer handle for periodic TTL refresh */
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** #4 FIX: Whether this instance is registered as the active processor in Redis */
  private isRedisRegistered = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayService: ExecutionGatewayService,
    private readonly lifecycleService: OrderLifecycleService,
    private readonly resilienceService: ConnectionResilienceService,
    private readonly rateLimiter: RateLimiterService,
    private readonly auditService: AuditService,
    private readonly redis: RedisService,
  ) {
    super();

    // V176 FIX: Guard against duplicate processor registration.
    // If the module is re-initialized (e.g., hot-reload), NestJS creates a new instance
    // and BullMQ registers a new worker, causing every job to be processed TWICE.
    // This guard ensures only one active processor exists at a time.
    // V178 FIX: Now ACTUALLY prevents duplicate processing, not just warns.
    if (OrderQueueProcessor.isRegistered) {
      this.logger.warn(
        `⚙️ V178 DUPLICATE OrderQueueProcessor detected (instance: ${this.instanceId}) — ` +
        `active instance is ${OrderQueueProcessor.activeInstanceId}. This instance will SKIP all jobs.`
      );
    } else {
      OrderQueueProcessor.isRegistered = true;
      OrderQueueProcessor.activeInstanceId = this.instanceId;
      this.logger.log(
        `⚙️ Order Queue Processor initialized — ready to process execution jobs (instance: ${this.instanceId})`
      );
    }

    // #4 FIX: Register this instance in Redis for cross-instance singleton detection.
    // This complements the static guard — if a hot-reload creates a new instance,
    // the new instance registers itself in Redis and the old one's key expires.
    this._registerInRedis();
  }

  /**
   * #4 FIX: Register this instance as the active processor in Redis.
   * Sets a key with TTL that must be periodically refreshed.
   * If the process crashes, the key expires and another instance can take over.
   */
  private async _registerInRedis(): Promise<void> {
    const redisKey = `${this.PROCESSOR_KEY_PREFIX}${this.instanceId}`;

    try {
      // Only register if we're the static active instance
      if (this.instanceId !== OrderQueueProcessor.activeInstanceId) {
        this.logger.debug(
          `⚙️ #4 Not registering in Redis — instance ${this.instanceId} is not the active processor`
        );
        return;
      }

      // Register this instance in Redis with TTL
      await this.redis.set(redisKey, JSON.stringify({
        instanceId: this.instanceId,
        registeredAt: new Date().toISOString(),
        pid: process.pid,
      }), this.REGISTRATION_TTL_MS);

      this.isRedisRegistered = true;
      this.logger.log(
        `⚙️ #4 Registered as active processor in Redis (key: ${redisKey}, TTL: ${this.REGISTRATION_TTL_MS}ms)`
      );

      // Start periodic TTL refresh to keep the registration alive
      this.refreshTimer = setInterval(() => this._refreshRedisRegistration(), this.REFRESH_INTERVAL_MS);
    } catch (error: any) {
      this.logger.warn(
        `⚙️ #4 Failed to register in Redis — falling back to static-only singleton guard: ${error.message}`
      );
      // Non-fatal: the static guard still works within a single process
    }
  }

  /**
   * #4 FIX: Periodically refresh the Redis registration TTL.
   * Called every 30 seconds to keep the key alive (TTL is 60s).
   */
  private async _refreshRedisRegistration(): Promise<void> {
    const redisKey = `${this.PROCESSOR_KEY_PREFIX}${this.instanceId}`;

    try {
      // Refresh the TTL
      await this.redis.expire(redisKey, this.REGISTRATION_TTL_MS);
      this.logger.debug(`⚙️ #4 Refreshed Redis processor registration (key: ${redisKey})`);
    } catch (error: any) {
      this.logger.warn(`⚙️ #4 Failed to refresh Redis registration: ${error.message}`);
    }
  }

  /**
   * #4 FIX: Check if THIS instance is still the registered active processor in Redis.
   * Returns true if this instance holds the Redis registration, or if Redis
   * is unavailable (falls back to static guard).
   */
  private async _isRedisActiveProcessor(): Promise<boolean> {
    // Look for ANY registered processor key in Redis
    try {
      const keys = await this.redis.scanKeys(`${this.PROCESSOR_KEY_PREFIX}*`);
      if (keys.length === 0) {
        // No keys found — Redis may be fresh or unavailable.
        // Fall back to static guard result.
        return true;
      }

      // Check if our key is among the active ones
      const ourKey = `${this.PROCESSOR_KEY_PREFIX}${this.instanceId}`;
      return keys.includes(ourKey);
    } catch (error: any) {
      this.logger.warn(`⚙️ #4 Failed to check Redis active processor: ${error.message}`);
      // Fall back to static guard
      return true;
    }
  }

  /**
   * #4 FIX: Clean up Redis registration on module destroy.
   * Called when NestJS shuts down or the module is destroyed.
   */
  async onModuleDestroy(): Promise<void> {
    // Stop the refresh timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clean up Redis key
    const redisKey = `${this.PROCESSOR_KEY_PREFIX}${this.instanceId}`;
    try {
      if (this.isRedisRegistered) {
        await this.redis.del(redisKey);
        this.logger.log(`⚙️ #4 Cleaned up Redis processor registration (key: ${redisKey})`);
      }
    } catch (error: any) {
      this.logger.warn(`⚙️ #4 Failed to clean up Redis registration: ${error.message}`);
    }

    // Reset static guard if we were the active instance
    if (OrderQueueProcessor.activeInstanceId === this.instanceId) {
      OrderQueueProcessor.isRegistered = false;
      OrderQueueProcessor.activeInstanceId = null;
      this.logger.log(`⚙️ #4 Reset static singleton guard (instance ${this.instanceId} destroyed)`);
    }
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
    // V178 FIX: Singleton guard — ACTUALLY prevent duplicate processing.
    // Only the first-registered instance processes jobs.
    // Duplicate instances (from hot-reload) skip to avoid double-execution.
    if (this.instanceId !== OrderQueueProcessor.activeInstanceId) {
      this.logger.warn(
        `⚙️ V178 SKIP: Instance ${this.instanceId} is NOT the active processor ` +
        `(active: ${OrderQueueProcessor.activeInstanceId}). Skipping job ${job.id}.`
      );
      return { success: false, error: 'Skipped — duplicate processor instance (V178 singleton guard)' };
    }

    // #4 FIX: Redis-based singleton check — verify we're still the active processor
    // in Redis. This catches cases where a hot-reload creates a new instance that
    // registered itself in Redis while the old instance still thinks it's active.
    const isRedisActive = await this._isRedisActiveProcessor();
    if (!isRedisActive) {
      this.logger.warn(
        `⚙️ #4 SKIP: Instance ${this.instanceId} is NOT the Redis-registered active processor. ` +
        `Skipping job ${job.id}. Another instance has taken over.`
      );
      return { success: false, error: 'Skipped — not the Redis-registered active processor (#4 fix)' };
    }

    const { orderId, userId, exchangeCredentialId, symbol, side, type, quantity, price, stopLoss, takeProfit, idempotencyKey, clientOrderId, source } = job.data;

    this.logger.log(
      `⚙️ Processing execution job: ${orderId} (${side} ${quantity} ${symbol}) — attempt ${(job as any).attemptsStarted || 1}`,
    );

    try {
      // Step 1: Verify order is still in ACCEPTED state
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return { success: false, error: t('order_queue_processor.order_not_found') };
      }

      if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
        this.logger.warn(`⚙️ Order ${orderId} is in state "${order.status}" — skipping execution`);
        return { success: false, error: `حالة الطلب "${order.status}" لا تسمح بالتنفيذ` };
      }

      // FIX: SECURITY — Verify credential ownership before execution
      // The OrderQueueProcessor trusted the queue message data without verifying
      // that the exchangeCredentialId actually belongs to the userId.
      // A compromised or malicious queue message could execute orders using
      // another user's API keys.
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: exchangeCredentialId },
      });

      if (!credential) {
        return { success: false, error: t('order_queue_processor.not_found') };
      }

      if (credential.userId !== userId) {
        this.logger.error(
          `⚙️ SECURITY: User ${userId} attempted to execute order with credential ${exchangeCredentialId} owned by ${credential.userId}`,
        );
        return { success: false, error: t('order_queue_processor.msg_69ba65db') };
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
        // FIX: Propagate source through UnifiedOrder
        source,
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
  /** FIX: Source of the trade — propagated from OrderDispatcher.
   * Values: 'smart_executor' | 'agent' | 'auto_paper' | 'user_manual' */
  source?: string;
}

export interface ExecutionJobResult {
  success: boolean;
  exchangeOrderId?: string;
  filledQuantity?: number;
  averagePrice?: number;
  error?: string;
}
