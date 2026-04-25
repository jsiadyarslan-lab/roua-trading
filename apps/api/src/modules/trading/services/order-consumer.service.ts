import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { AuditService } from '../../../audit/audit.service';
import { OrderQueueMessage } from '../events/order.events';
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
  ) {}

  async onModuleInit() {
    const rabbitUrl = this.configService.get<string>('RABBITMQ_URL');

    if (!rabbitUrl) {
      this.logger.warn('🐰 Consumer: RABBITMQ_URL not configured — direct execution mode only');
      return;
    }

    try {
      await this._connect(rabbitUrl);
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
      const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id);

      // Step 4: Create CCXT exchange instance
      const ExchangeClass = ccxt[credential.exchange as keyof typeof ccxt] as any;
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

    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: message.exchangeCredentialId },
    });

    if (!credential) return;

    // Check for existing position to add to
    const existingPosition = await this.prisma.position.findFirst({
      where: {
        userId: message.userId,
        symbol: message.symbol,
        status: 'OPEN',
        side: message.side as any,
      },
    });

    if (existingPosition) {
      // Add to existing position (average price)
      // Position model uses Float — no Decimal conversion needed
      const totalQuantity = existingPosition.quantity + filledQuantity;
      const avgPrice =
        (existingPosition.entryPrice * existingPosition.quantity +
          fillPrice * filledQuantity) /
        totalQuantity;

      await this.prisma.position.update({
        where: { id: existingPosition.id },
        data: {
          quantity: totalQuantity,
          entryPrice: avgPrice,
          stopLoss: message.stopLoss,
          takeProfit: message.takeProfit,
        },
      });
    } else {
      // Open new position
      // Position model uses Float types
      await this.prisma.position.create({
        data: {
          userId: message.userId,
          credentialId: message.exchangeCredentialId,
          exchange: credential.exchange,
          symbol: message.symbol,
          side: message.side as any,
          status: 'OPEN',
          quantity: filledQuantity,
          entryPrice: fillPrice,
          currentPrice: fillPrice,
          highestPrice: fillPrice,
          lowestPrice: fillPrice,
          stopLoss: message.stopLoss,
          takeProfit: message.takeProfit,
        },
      });
    }

    // Record trade
    // Trade model uses Float types
    await this.prisma.trade.create({
      data: {
        userId: message.userId,
        exchange: credential.exchange,
        symbol: message.symbol,
        side: message.side as any,
        type: 'ENTRY',
        quantity: filledQuantity,
        price: fillPrice,
      },
    });
  }

  // ── Private: RabbitMQ Connection ──

  private async _connect(url: string): Promise<void> {
    const amqp = await import('amqplib');
    this.connection = await amqp.connect(url);

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
