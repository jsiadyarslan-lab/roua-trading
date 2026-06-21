import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { AuditService } from '../../../audit/audit.service';
import { OrderQueueMessage } from '../events/order.events';
import { NotificationService } from '../../notification/notification.service';
// V339: Trade Lifecycle Logger — for OPEN event logging
import { TradeLifecycleLogger } from '../../../common/trade-lifecycle/trade-lifecycle.logger';
import * as ccxt from 'ccxt';

/**
 * Order Consumer Service — RabbitMQ Order Processor
 *
 * Consumes orders from the `order_queue` RabbitMQ queue
 * and executes them on the appropriate exchange via CCXT.
 *
 * Processing Flow:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ 1. Consume message from order_queue                           │
 * │ 2. Verify order still in ACCEPTED state                       │
 * │ 3. Decrypt exchange credentials                               │
 * │ 4. Create CCXT exchange instance                              │
 * │ 5. Execute order on exchange (MARKET or LIMIT)                │
 * │ 6. Update order status (FILLED / REJECTED)                    │
 * │ 7. Open/update position in database                           │
 * │ 8. Acknowledge message (or reject on error)                   │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Error Handling:
 * - Transient errors (network) → NACK with requeue
 * - Permanent errors (invalid order) → ACK and mark as REJECTED
 * - Dead letter queue for failed orders
 *
 * If RabbitMQ is unavailable, this service can be invoked directly
 * via processOrder() for synchronous fallback execution.
 *
 * Note: Order model uses Decimal for quantity, price, filledQuantity,
 * averagePrice, etc. When reading from Order, convert Decimal to number
 * using Number(). Position and Trade models still use Float types.
 */
@Injectable()
export class OrderConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderConsumerService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly queueName = 'order_queue';
  private rabbitAvailable = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly stateManager: OrderStateManagerService,
    private readonly auditService: AuditService,
    @Optional() private readonly notificationService?: NotificationService,
    // V339: Trade Lifecycle Logger — for OPEN event logging
      @Optional() @Inject(TradeLifecycleLogger) private readonly lifecycle?: TradeLifecycleLogger,
  ) {}

  async onModuleInit() {
    const rabbitUrl = this.configService.get<string>('RABBITMQ_URL');

    if (!rabbitUrl) {
      this.logger.warn('🐰 Consumer: RABBITMQ_URL not configured — direct execution mode only');
      return;
    }

    try {
      // FIX: Add a timeout to RabbitMQ connection so that an unreachable
      // RabbitMQ server doesn't block the entire NestJS bootstrap.
      // Without this, amqplib.connect() can hang for 60-120s (OS TCP SYN
      // timeout), preventing app.listen() from executing → ECONNREFUSED on port 3001.
      const CONNECT_TIMEOUT_MS = 5_000; // 5 seconds
      await Promise.race([
        this._connect(rabbitUrl),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`RabbitMQ connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS),
        ),
      ]);
      this.rabbitAvailable = true;
      this.logger.log('🐰 Order Consumer connected — listening on order_queue');
    } catch (error: any) {
      this.logger.warn(`🐰 Consumer: RabbitMQ connection failed: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch {
      // Ignore
    }
  }

  /**
   * Process an order directly (synchronous fallback)
   * Used when RabbitMQ is unavailable
   */
  async processOrder(message: OrderQueueMessage): Promise<{
    success: boolean;
    filledQuantity?: number;
    averagePrice?: number;
    exchangeOrderId?: string;
    error?: string;
  }> {
    this.logger.log(`⚙️ Processing order: ${message.orderId} (${message.side} ${message.quantity} ${message.symbol})`);

    try {
      // Step 1: Verify order is still in ACCEPTED state
      const order = await this.prisma.order.findUnique({
        where: { id: message.orderId },
      });

      if (!order) {
        return { success: false, error: 'الطلب غير موجود' };
      }

      // Convert Decimal status check — status is enum string, not Decimal
      if (order.status !== 'ACCEPTED' && order.status !== 'PENDING') {
        return { success: false, error: `حالة الطلب "${order.status}" لا تسمح بالتنفيذ` };
      }

      // Step 2: Get credential
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: message.exchangeCredentialId },
      });

      if (!credential || !credential.isValid) {
        await this.stateManager.updateOrderStatus(message.orderId, 'REJECTED', {
          reason: 'بيانات الاعتماد غير صالحة',
        });
        return { success: false, error: 'بيانات الاعتماد غير صالحة' };
      }

      // Step 3: Decrypt credentials
      // SECURITY: Pass userId from the queue message to verify credential ownership
      const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, message.userId);

      // Step 4: Create CCXT exchange instance
      // FIX: Handle paper-trading and test exchange names.
      // - 'paper-trading' credentials are simulated — skip CCXT entirely.
      // - Exchange names ending with '_test', '_paper', '_demo', '_sandbox',
      //   '_simulation' (e.g. 'binance_test') don't exist in CCXT. Resolve
      //   to the base name (e.g. 'binance') so CCXT can instantiate correctly.

      // Skip paper-trading orders — they are handled by the Smart Executor
      // and don't go through a real exchange.
      if (credential.exchange === 'paper-trading') {
        this.logger.log(`📝 Order ${message.orderId} is paper-trading — skipping CCXT execution`);
        await this.stateManager.updateOrderStatus(message.orderId, 'FILLED', {
          filledQuantity: message.quantity,
          averagePrice: message.price ?? 0,
          filledAt: new Date().toISOString(),
        });
        await this._updatePosition(message, message.quantity, message.price ?? 0);
        return {
          success: true,
          filledQuantity: message.quantity,
          averagePrice: message.price ?? 0,
        };
      }

      // Resolve CCXT exchange class name (e.g. 'binance_test' → 'binance')
      let exchangeName = credential.exchange;
      const testSuffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
      for (const suffix of testSuffixes) {
        if (exchangeName.toLowerCase().endsWith(suffix)) {
          exchangeName = exchangeName.slice(0, -suffix.length);
          this.logger.debug(`🔧 Resolved exchange "${credential.exchange}" → "${exchangeName}" for CCXT`);
          break;
        }
      }

      const ExchangeClass = ccxt[exchangeName as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        await this.stateManager.updateOrderStatus(message.orderId, 'REJECTED', {
          reason: `البورصة "${credential.exchange}" غير مدعومة`,
        });
        return { success: false, error: `البورصة "${credential.exchange}" غير مدعومة` };
      }

      const exchange = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });

      // Step 5: Record SENT_TO_EXCHANGE event
      await this.stateManager.updateOrderStatus(message.orderId, 'ACCEPTED', {
        event: 'SENT_TO_EXCHANGE',
        sentAt: new Date().toISOString(),
      });

      // Step 6: Execute order
      let result: any;
      try {
        if (message.type === 'MARKET') {
          result = await exchange.createMarketOrder(
            message.symbol,
            message.side.toLowerCase(),
            message.quantity,
          );
        } else if (message.type === 'LIMIT') {
          result = await exchange.createLimitOrder(
            message.symbol,
            message.side.toLowerCase(),
            message.quantity,
            message.price,
          );
        }

        // Step 7: Update order as FILLED
        const filledQuantity = result?.filled || message.quantity;
        const averagePrice = result?.average || result?.price || message.price;

        await this.stateManager.updateOrderStatus(message.orderId, 'FILLED', {
          filledQuantity,
          averagePrice,
          exchangeOrderId: result?.id,
          fee: result?.fee?.cost,
          feeCurrency: result?.fee?.currency,
          filledAt: new Date().toISOString(),
        });

        // Step 8: Open or update position
        await this._updatePosition(message, filledQuantity, averagePrice);

        // Audit
        await this.auditService.log({
          userId: message.userId,
          action: 'ORDER_EXECUTED',
          resource: 'order',
          details: JSON.stringify({
            orderId: message.orderId,
            symbol: message.symbol,
            side: message.side,
            filledQuantity,
            averagePrice,
            exchangeOrderId: result?.id,
          }),
        });

        this.logger.log(
          `✅ Order executed: ${message.orderId} — ${message.side} ${filledQuantity}/${message.quantity} ${message.symbol} @ ${averagePrice}`,
        );

        // UX: Push real-time notification to user
        if (this.notificationService) {
          this.notificationService.sendNotification({
            userId: message.userId,
            type: 'ORDER_FILLED',
            priority: 'HIGH',
            title: `تم تنفيذ أمر ${message.side === 'BUY' ? 'شراء' : 'بيع'} ${message.symbol}`,
            body: `تم تنفيذ ${filledQuantity} ${message.symbol} بسعر ${averagePrice}`,
            data: {
              orderId: message.orderId,
              symbol: message.symbol,
              side: message.side,
              quantity: filledQuantity,
              averagePrice,
              exchangeOrderId: result?.id,
            },
            source: 'trade',
            action: message.side === 'BUY' ? 'BUY' : 'SELL',
            pair: message.symbol,
          }).catch((e: any) => this.logger.warn(`Notification push failed: ${e.message}`));
        }

        return {
          success: true,
          filledQuantity,
          averagePrice,
          exchangeOrderId: result?.id,
        };
      } catch (error: any) {
        // Exchange execution failed
        const errorMessage = error.message || 'Unknown error';

        await this.stateManager.updateOrderStatus(message.orderId, 'REJECTED', {
          reason: errorMessage,
          rejectedAt: new Date().toISOString(),
        });

        // UX: Push real-time rejection notification to user
        if (this.notificationService) {
          this.notificationService.sendNotification({
            userId: message.userId,
            type: 'ORDER_REJECTED',
            priority: 'HIGH',
            title: `تم رفض أمر ${message.side === 'BUY' ? 'شراء' : 'بيع'} ${message.symbol}`,
            body: `السبب: ${errorMessage.substring(0, 150)}`,
            data: {
              orderId: message.orderId,
              symbol: message.symbol,
              side: message.side,
              reason: errorMessage,
            },
            source: 'trade',
            action: 'WARN',
            pair: message.symbol,
          }).catch((e: any) => this.logger.warn(`Notification push failed: ${e.message}`));
        }

        this.logger.error(`❌ Order execution failed: ${message.orderId} — ${errorMessage}`);

        return { success: false, error: errorMessage };
      }
    } catch (error: any) {
      this.logger.error(`Order processing error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ── Private: Position Management ──

  private async _updatePosition(
    message: OrderQueueMessage,
    filledQuantity: number,
    fillPrice: number,
  ): Promise<void> {
    if (filledQuantity <= 0) return;

    // FIX: Wrap the entire position lookup + create/update in a Prisma transaction
    // with SERIALIZABLE isolation to prevent race conditions.
    // Without a transaction, two concurrent orders for the same symbol/side
    // could both find no existing position (findFirst returns null) and both
    // create new positions, resulting in duplicate open positions.
    //
    // The SERIALIZABLE isolation level ensures that if two transactions
    // read the same data concurrently, one will fail and retry, preventing
    // the duplicate position creation.
    try {
      // V342: Transaction returns the position ID for lifecycle logging
      const txResult = await this.prisma.$transaction(async (tx) => {
        const credential = await tx.exchangeCredential.findUnique({
          where: { id: message.exchangeCredentialId },
        });

        if (!credential) return null;

        // FIX: Verify credential ownership within the transaction
        if (credential.userId !== message.userId) {
          this.logger.error(
            `🐰 SECURITY: User ${message.userId} attempted to use credential ${message.exchangeCredentialId} owned by ${credential.userId}`,
          );
          return null;
        }

        // Check for existing position to add to — WITHIN the transaction
        const existingPosition = await tx.position.findFirst({
          where: {
            userId: message.userId,
            symbol: message.symbol,
            status: 'OPEN',
            side: message.side as any,
          },
        });

        let positionId: string;
        let isNewPosition = false;

        if (existingPosition) {
          // Add to existing position (average price)
          const totalQuantity = Number(existingPosition.quantity) + filledQuantity;
          const avgPrice =
            (Number(existingPosition.entryPrice) * Number(existingPosition.quantity) +
              fillPrice * filledQuantity) /
            totalQuantity;

          await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              quantity: totalQuantity,
              entryPrice: avgPrice,
              stopLoss: message.stopLoss,
              takeProfit: message.takeProfit,
            },
          });
          positionId = existingPosition.id;
        } else {
          // ═══════════════════════════════════════════════════════════════════
          // V222 BULLETPROOF: DB-level cooldown — block ALL new positions on
          // a symbol that was closed within the last 15 minutes. This catches
          // the V2 BullMQ queue path which bypasses OrderDispatcher checks.
          // ═══════════════════════════════════════════════════════════════════
          const COOLDOWN_MINUTES = 15;
          const recentlyClosed = await tx.position.findFirst({
            where: {
              userId: message.userId,
              symbol: message.symbol,
              status: { in: ['CLOSED', 'LIQUIDATED'] },
              closedAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
            },
            orderBy: { closedAt: 'desc' },
          });
          if (recentlyClosed) {
            const closedAgo = Math.round((Date.now() - new Date(recentlyClosed.closedAt!).getTime()) / 60000);
            this.logger.warn(
              `🛡️ V222 QUEUE-COOLDOWN: BLOCKED ${message.side} on ${message.symbol} — ` +
              `position closed ${closedAgo} min ago (cooldown: ${COOLDOWN_MINUTES} min)`
            );
            return null; // Drop the order — don't create position
          }

          // Also check for ANY existing open position (regardless of direction)
          const anyExistingOpen = await tx.position.findFirst({
            where: { userId: message.userId, symbol: message.symbol, status: 'OPEN' },
          });
          if (anyExistingOpen) {
            this.logger.warn(
              `🛡️ V222 QUEUE-DUPLICATE: BLOCKED ${message.side} on ${message.symbol} — ` +
              `existing ${anyExistingOpen.side} position already open`
            );
            return null; // Drop the order
          }

          // Open new position
          // V342: Capture the created position ID directly from create()
          const createdPosition = await tx.position.create({
            data: {
              userId: message.userId,
              credentialId: message.exchangeCredentialId,
              exchange: credential.exchange,
              symbol: message.symbol,
              // V342 FIX: Set exchangeSymbol for reconciliation (was missing)
              exchangeSymbol: message.symbol,
              side: message.side as any,
              status: 'OPEN',
              quantity: filledQuantity,
              entryPrice: fillPrice,
              currentPrice: fillPrice,
              highestPrice: fillPrice,
              lowestPrice: fillPrice,
              stopLoss: message.stopLoss,
              takeProfit: message.takeProfit,
              source: message.source || (credential.exchange === 'paper-trading' ? 'auto_paper' : 'user_manual'),
            },
            select: { id: true },
          });
          positionId = createdPosition.id;
          isNewPosition = true;
        }

        // Record trade within the same transaction
        await tx.trade.create({
          data: {
            userId: message.userId,
            credentialId: message.exchangeCredentialId,
            exchange: credential.exchange,
            symbol: message.symbol,
            side: message.side as any,
            type: 'ENTRY',
            quantity: filledQuantity,
            price: fillPrice,
            // FIX: Same source propagation fix for Trade records
            source: message.source || (credential.exchange === 'paper-trading' ? 'auto_paper' : 'user_manual'),
          },
        });

        return { positionId, isNewPosition };
      }, {
        // FIX: Use SERIALIZABLE isolation level to prevent race conditions
        // where two concurrent transactions both read the same state and
        // both create new positions.
        isolationLevel: 'Serializable' as any,
      });

      // V339: Log OPEN event — only for NEW positions (not when adding to existing)
      // V342: Uses the positionId returned from the transaction — no findFirst needed
      if (this.lifecycle && txResult && txResult.isNewPosition) {
        try {
          await this.lifecycle.log({
            positionId: txResult.positionId,
            userId: message.userId,
            eventType: 'OPEN',
            module: 'order-consumer',
            reason: `Position opened: ${message.side} ${message.symbol} @ ${fillPrice}`,
            price: fillPrice,
            highestPrice: fillPrice,
            lowestPrice: fillPrice,
            metadata: {
              symbol: message.symbol,
              side: message.side,
              quantity: filledQuantity,
              entryPrice: fillPrice,
              stopLoss: message.stopLoss,
              takeProfit: message.takeProfit,
              source: message.source,
              exchangeCredentialId: message.exchangeCredentialId,
              orderId: message.orderId,
            },
          });
        } catch (logErr: any) {
          // Never block trading — just log the error
          this.logger.warn(`V339: Failed to log OPEN event: ${logErr.message}`);
        }
      }
    } catch (error: any) {
      // Log the error but don't crash — the order was already executed on the exchange
      // FIX: Write to PositionReconciliation table for automatic retry.
      // Previously, the error was silently swallowed, meaning the user had an
      // open exchange position but no database record. This is dangerous because:
      // 1. User can't see their position in the platform
      // 2. Risk checks won't account for this exposure
      // 3. No way to track or resolve the discrepancy
      this.logger.error(
        `🐰 Position update transaction failed for order ${message.orderId}: ${error.message}`,
      );

      // Write to reconciliation table for background job to retry
      try {
        await this.prisma.positionReconciliation.upsert({
          where: { orderId: message.orderId },
          create: {
            orderId: message.orderId,
            userId: message.userId,
            exchangeCredentialId: message.exchangeCredentialId,
            symbol: message.symbol,
            side: message.side,
            filledQuantity: filledQuantity,
            fillPrice: fillPrice,
            stopLoss: message.stopLoss,
            takeProfit: message.takeProfit,
            status: 'PENDING',
            lastError: error.message?.substring(0, 500),
          },
          update: {
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
            lastError: error.message?.substring(0, 500),
            status: 'PENDING', // Reset to PENDING for retry
          },
        });
        this.logger.log(
          `🐰 Position reconciliation record created for order ${message.orderId} — will be retried by background job`,
        );
      } catch (reconError: any) {
        // Even reconciliation writing failed — log critically
        this.logger.error(
          `🐰 CRITICAL: Failed to write reconciliation record for order ${message.orderId}: ${reconError.message}`,
        );
      }
    }
  }

  // ── Private: RabbitMQ Connection ──

  private async _connect(url: string): Promise<void> {
    const amqp = await import('amqplib');
    // FIX: Pass timeout option to amqplib.connect() — this sets the socket
    // timeout for the TCP connection handshake. Without it, amqplib uses
    // the OS default TCP SYN timeout (60-120s), which can block NestJS startup.
    this.connection = await amqp.connect(url, { timeout: 5000 });

    this.connection.on('error', () => {
      this.rabbitAvailable = false;
    });

    this.connection.on('close', () => {
      this.rabbitAvailable = false;
    });

    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(this.queueName, { durable: true });
    this.channel.prefetch(1);

    // Start consuming
    await this.channel.consume(this.queueName, async (msg: any) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString()) as OrderQueueMessage;
        this.logger.debug(`🐰 Consuming order: ${content.orderId}`);

        const result = await this.processOrder(content);

        if (result.success) {
          this.channel.ack(msg);
        } else {
          // Check if it's a transient error
          const transientErrors = ['Network', 'timeout', 'ETIMEDOUT', 'ECONNRESET'];
          const isTransient = transientErrors.some((e) =>
            result.error?.includes(e),
          );

          if (isTransient) {
            // Requeue for retry
            this.channel.nack(msg, false, true);
          } else {
            // Permanent error — acknowledge and move on
            this.channel.ack(msg);
          }
        }
      } catch (error: any) {
        this.logger.error(`🐰 Message processing error: ${error.message}`);
        this.channel.nack(msg, false, false);
      }
    });
  }
}
