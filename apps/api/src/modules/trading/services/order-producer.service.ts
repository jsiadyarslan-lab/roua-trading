import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderQueueMessage } from '../events/order.events';

/**
 * Order Producer Service — RabbitMQ Order Queue Publisher
 *
 * Publishes validated orders to the `order_queue` RabbitMQ queue
 * for asynchronous processing by OrderConsumerService.
 *
 * Architecture:
 * ┌───────────────────────────────────────────────────────────┐
 * │ OrderController                                          │
 * │    ↓ (after risk validation)                             │
 * │ OrderProducerService.sendOrder(msg)                      │
 * │    ↓                                                     │
 * │ RabbitMQ order_queue                                     │
 * │    ↓                                                     │
 * │ OrderConsumerService (@Processor)                        │
 * │    ↓                                                     │
 * │ ExecutionGatewayService (exchange execution)             │
 * └───────────────────────────────────────────────────────────┘
 *
 * Benefits:
 * - Decouples API response from execution latency
 * - Enables order prioritization and throttling
 * - Provides resilience through message persistence
 * - Enables horizontal scaling of order processors
 *
 * RabbitMQ Configuration:
 * - Queue: order_queue (durable, persistent)
 * - Exchange: order_exchange (direct)
 * - Routing Key: order.submit
 * - Message TTL: 5 minutes (orders expire if not processed)
 * - Prefetch: 1 (fair dispatch)
 *
 * If RabbitMQ is unavailable, falls back to direct execution.
 */
@Injectable()
export class OrderProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderProducerService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly queueName = 'order_queue';
  private readonly exchangeName = 'order_exchange';
  private readonly routingKey = 'order.submit';
  private rabbitAvailable = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rabbitUrl = this.configService.get<string>('RABBITMQ_URL');

    if (!rabbitUrl) {
      this.logger.warn('🐰 RABBITMQ_URL not configured — orders will execute synchronously (fallback mode)');
      return;
    }

    try {
      await this._connect(rabbitUrl);
      this.rabbitAvailable = true;
      this.logger.log('🐰 Order Producer connected to RabbitMQ');
    } catch (error: any) {
      this.logger.warn(`🐰 RabbitMQ connection failed: ${error.message} — using fallback mode`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Send an order to the processing queue
   *
   * If RabbitMQ is available, publishes to the queue.
   * Otherwise, returns false to signal that the caller
   * should execute the order directly (fallback).
   *
   * @param message The order queue message
   * @returns true if queued, false if fallback needed
   */
  async sendOrder(message: OrderQueueMessage): Promise<boolean> {
    if (!this.rabbitAvailable || !this.channel) {
      this.logger.debug(`🐰 RabbitMQ unavailable — order ${message.orderId} will be executed synchronously`);
      return false;
    }

    try {
      const content = Buffer.from(JSON.stringify(message));

      this.channel.publish(
        this.exchangeName,
        this.routingKey,
        content,
        {
          persistent: true,          // Survive broker restart
          messageId: message.orderId,
          timestamp: Date.now(),
          expiration: '300000',       // 5 minutes TTL
          contentType: 'application/json',
        },
      );

      this.logger.log(`🐰 Order ${message.orderId} published to ${this.queueName}`);
      return true;
    } catch (error: any) {
      this.logger.error(`🐰 Failed to publish order ${message.orderId}: ${error.message}`);
      this.rabbitAvailable = false;
      return false;
    }
  }

  // ── Private: RabbitMQ Connection ──

  private async _connect(url: string): Promise<void> {
    try {
      const amqp = await import('amqplib');
      this.connection = await amqp.connect(url);

      this.connection.on('error', (err: any) => {
        this.logger.error(`🐰 RabbitMQ connection error: ${err.message}`);
        this.rabbitAvailable = false;
        this._reconnect(url);
      });

      this.connection.on('close', () => {
        this.logger.warn('🐰 RabbitMQ connection closed');
        this.rabbitAvailable = false;
        this._reconnect(url);
      });

      this.channel = await this.connection.createChannel();

      // Assert exchange (durable)
      await this.channel.assertExchange(this.exchangeName, 'direct', {
        durable: true,
      });

      // Assert queue (durable, persistent)
      await this.channel.assertQueue(this.queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': 300000,       // 5 minutes
          'x-dead-letter-exchange': 'order_dlx',  // Dead letter exchange
        },
      });

      // Bind queue to exchange
      await this.channel.bindQueue(this.queueName, this.exchangeName, this.routingKey);

      // Set prefetch to 1 for fair dispatch
      this.channel.prefetch(1);
    } catch (error: any) {
      throw new Error(`RabbitMQ connection failed: ${error.message}`);
    }
  }

  private async _reconnect(url: string): Promise<void> {
    setTimeout(async () => {
      this.logger.log('🐰 Attempting RabbitMQ reconnection...');
      try {
        await this._connect(url);
        this.rabbitAvailable = true;
        this.logger.log('🐰 Reconnected to RabbitMQ');
      } catch (error: any) {
        this.logger.error(`🐰 Reconnection failed: ${error.message}`);
        this._reconnect(url);
      }
    }, 5000);
  }
}
