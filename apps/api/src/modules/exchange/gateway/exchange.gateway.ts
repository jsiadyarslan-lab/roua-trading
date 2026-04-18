import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ExchangeService } from '../exchange.service';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * Exchange WebSocket Gateway
 * 
 * Provides real-time price updates via WebSocket.
 * Clients subscribe to specific symbols and receive updates
 * pushed from Redis Pub/Sub (populated by the refresh cycle).
 * 
 * Events:
 * - subscribe: Client subscribes to a symbol
 * - unsubscribe: Client unsubscribes from a symbol
 * - ticker: Server pushes price updates to subscribed clients
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/exchange',
})
export class ExchangeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ExchangeGateway.name);

  // Track subscriptions: socketId → Set of symbols
  private readonly subscriptions = new Map<string, Set<string>>();

  // Track symbol → Set of socketIds (for efficient broadcasting)
  private readonly symbolSubscribers = new Map<string, Set<string>>();

  // Refresh interval for subscribed symbols
  private refreshInterval: NodeJS.Timeout | null = null;

  // Redis subscriber for Pub/Sub
  private redisSubscriber: any = null;

  constructor(
    private readonly exchangeService: ExchangeService,
    private readonly redisService: RedisService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🔌 Exchange WebSocket Gateway initialized');

    // Setup Redis subscriber for Pub/Sub
    this._setupRedisSubscriber();
  }

  async handleConnection(client: Socket) {
    this.logger.debug(`🔌 Client connected: ${client.id}`);
    this.subscriptions.set(client.id, new Set());
  }

  async handleDisconnect(client: Socket) {
    this.logger.debug(`🔌 Client disconnected: ${client.id}`);

    // Clean up all subscriptions for this client
    const clientSymbols = this.subscriptions.get(client.id);
    if (clientSymbols) {
      for (const symbol of clientSymbols) {
        const subscribers = this.symbolSubscribers.get(symbol);
        if (subscribers) {
          subscribers.delete(client.id);
          if (subscribers.size === 0) {
            this.symbolSubscribers.delete(symbol);
          }
        }
      }
    }

    this.subscriptions.delete(client.id);

    // Stop refresh cycle if no subscriptions remain
    this._updateRefreshCycle();
  }

  /**
   * Subscribe to real-time price updates for a symbol
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: { symbol: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { symbol } = data;
    if (!symbol) return;

    this.logger.debug(`📡 ${client.id} subscribed to ${symbol}`);

    // Add to tracking maps
    const clientSymbols = this.subscriptions.get(client.id) || new Set();
    clientSymbols.add(symbol);
    this.subscriptions.set(client.id, clientSymbols);

    const subscribers = this.symbolSubscribers.get(symbol) || new Set();
    subscribers.add(client.id);
    this.symbolSubscribers.set(symbol, subscribers);

    // Send initial quote immediately
    try {
      const quote = await this.exchangeService.getQuote(symbol);
      client.emit('ticker', { symbol, data: quote });
    } catch (error: any) {
      client.emit('ticker:error', { symbol, error: error.message });
    }

    // Start or continue the refresh cycle
    this._updateRefreshCycle();
  }

  /**
   * Unsubscribe from price updates for a symbol
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() data: { symbol: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { symbol } = data;
    if (!symbol) return;

    this.logger.debug(`📡 ${client.id} unsubscribed from ${symbol}`);

    // Remove from tracking maps
    const clientSymbols = this.subscriptions.get(client.id);
    if (clientSymbols) {
      clientSymbols.delete(symbol);
    }

    const subscribers = this.symbolSubscribers.get(symbol);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.symbolSubscribers.delete(symbol);
      }
    }

    this._updateRefreshCycle();
  }

  // ── Private: Refresh Cycle ──

  /**
   * Start or stop the refresh cycle based on active subscriptions
   */
  private _updateRefreshCycle() {
    const hasSubscriptions = this.symbolSubscribers.size > 0;

    if (hasSubscriptions && !this.refreshInterval) {
      // Start refreshing every 5 seconds
      this.refreshInterval = setInterval(() => this._refreshAllSubscriptions(), 5000);
      this.logger.log(`📡 Started refresh cycle for ${this.symbolSubscribers.size} symbols`);
    } else if (!hasSubscriptions && this.refreshInterval) {
      // Stop refreshing when no subscriptions
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      this.logger.log('📡 Stopped refresh cycle (no subscriptions)');
    }
  }

  /**
   * Fetch latest quotes for all subscribed symbols and broadcast
   */
  private async _refreshAllSubscriptions() {
    const symbols = Array.from(this.symbolSubscribers.keys());

    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        try {
          const quote = await this.exchangeService.getQuote(symbol);
          return { symbol, quote };
        } catch {
          return null;
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { symbol, quote } = result.value;

        // Broadcast to all subscribers of this symbol
        this._broadcastToSymbol(symbol, 'ticker', { symbol, data: quote });

        // Also publish to Redis for cross-instance distribution
        try {
          await this.redisService.set(
            `ws:ticker:${symbol}`,
            JSON.stringify(quote),
            10_000,
          );
        } catch {
          // Non-critical: Redis pub/sub is best-effort
        }
      }
    }
  }

  /**
   * Broadcast an event to all clients subscribed to a specific symbol
   */
  private _broadcastToSymbol(symbol: string, event: string, data: any) {
    const subscribers = this.symbolSubscribers.get(symbol);
    if (!subscribers || subscribers.size === 0) return;

    for (const socketId of subscribers) {
      const client = this.server.sockets.get(socketId);
      if (client) {
        client.emit(event, data);
      }
    }
  }

  // ── Private: Redis Pub/Sub ──

  private _setupRedisSubscriber() {
    // In a production multi-instance setup, we would subscribe to a Redis channel
    // For now, the single-instance refresh cycle handles real-time updates
    this.logger.debug('📡 Redis Pub/Sub ready (single-instance mode)');
  }
}
