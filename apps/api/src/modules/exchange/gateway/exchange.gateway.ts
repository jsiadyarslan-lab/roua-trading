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
import { PrismaService } from '../../../common/prisma/prisma.service';

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
 *
 * FIX: CORS changed from static origin (localhost only) to dynamic validation.
 * Previously, if CORS_ORIGIN env var was unset or set to localhost, WebSocket
 * connections from production Railway URLs (*.up.railway.app) were rejected.
 * Now we accept all origins since authentication is enforced in handleConnection().
 */
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      // Allow all origins — authentication is handled in handleConnection()
      // via session token validation. CORS is not a security boundary for
      // WebSocket connections (browsers enforce CORS but any HTTP client can
      // spoof Origin). The real security is the session token check.
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/exchange',
})
export class ExchangeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

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
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🔌 Exchange WebSocket Gateway initialized');

    // Setup Redis subscriber for Pub/Sub
    this._setupRedisSubscriber();
  }

  async handleConnection(client: Socket) {
    // FIX: Authenticate WebSocket connections to prevent unauthorized access.
    // Previously, anyone could connect and subscribe to price feeds.
    // Now we check for a valid session token in handshake auth or query.
    const token =
      client.handshake.auth?.token ||
      client.handshake.query?.token ||
      client.handshake.headers?.['x-roua-session'] as string ||
      // Also check cookie (parsed from handshake headers)
      this._extractSessionFromCookie(client.handshake.headers?.cookie as string);

    if (!token) {
      this.logger.warn(`🔌 Unauthenticated connection rejected: ${client.id}`);
      client.emit('error', { message: 'Authentication required. Provide token in auth, query, or cookie.' });
      client.disconnect(true);
      return;
    }

    // Validate session token against database
    try {
      const session = await this.prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        this.logger.warn(`🔌 Invalid/expired session for connection: ${client.id}`);
        client.emit('error', { message: 'Session expired or invalid.' });
        client.disconnect(true);
        return;
      }

      // Attach user info to socket for downstream use
      (client as any).user = session.user;
      this.logger.debug(`🔌 Authenticated client connected: ${client.id} (user: ${session.user.displayName})`);
    } catch (error: any) {
      // DB unavailable — reject connection to prevent unauthorized access
      this.logger.error(`🔌 DB unavailable during WS auth — rejecting connection: ${client.id}`);
      client.emit('error', { message: 'Authentication service unavailable. Please try again later.' });
      client.disconnect(true);
      return;
    }

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
      // Refresh every 15 seconds — balanced between responsiveness and API sustainability.
      // With a 600s quote cache, most hits are Redis cache reads (not actual API calls).
      // FIX: Changed from 5s to 15s to reduce unnecessary load when data hasn't changed.
      this.refreshInterval = setInterval(() => this._refreshAllSubscriptions(), 15000);
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
      const client = this.server.sockets.sockets.get(socketId);
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

  /**
   * Extract session token from cookie header string
   */
  private _extractSessionFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/roua_session=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Broadcast a PUBLIC event to ALL connected clients.
   *
   * V156 SECURITY: Only use this for inherently PUBLIC data (price tickers,
   * market status). NEVER use this for user-specific data (notifications,
   * trade results, account updates) — use targeted emits instead.
   *
   * @param event - Event name (must be a public event type)
   * @param data - Event data (must NOT contain user-specific information)
   */
  broadcast(event: string, data: any): void {
    if (!this.server) return;

    // V156: Whitelist of public events that are safe to broadcast to ALL users.
    const PUBLIC_EVENTS = new Set([
      'ticker',          // Price ticker updates
      'ticker:error',    // Price fetch errors
      'market_status',   // Market open/close status
      'system',          // System-wide announcements
    ]);

    if (!PUBLIC_EVENTS.has(event)) {
      this.logger.warn(`🔌 SECURITY: broadcast() called with non-public event '${event}'. Use targeted emits for user-specific data.`);
      return; // Block non-public broadcasts
    }

    this.server.emit(event, data);
  }
}
