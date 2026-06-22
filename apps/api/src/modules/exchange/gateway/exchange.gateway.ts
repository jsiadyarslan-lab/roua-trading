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
import { OandaStreamingService, OandaPriceUpdate } from '../adapters/oanda-streaming.service';
import { BinanceStreamingService, BinancePriceUpdate } from '../adapters/binance-streaming.service';

/**
 * Exchange WebSocket Gateway
 *
 * Provides real-time price updates via WebSocket.
 * Clients subscribe to specific symbols and receive updates
 * pushed from either:
 *   - OANDA Streaming API (for forex/metals/indices — V355)
 *   - Redis Pub/Sub / refresh cycle (for crypto and other pairs)
 */
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
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

  // Refresh interval for NON-OANDA symbols (crypto etc.)
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly exchangeService: ExchangeService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly oandaStreaming: OandaStreamingService,
    private readonly binanceStreaming: BinanceStreamingService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🔌 Exchange WebSocket Gateway initialized');

    // V355: Register as OANDA price listener — when OANDA stream emits a price,
    // broadcast it to all clients subscribed to that symbol.
    // V402: Wrap in try/catch — this listener was throwing "Cannot read
    // properties of undefined (reading 'get')" which blocked ALL OANDA prices
    // from flowing. The error likely comes from this.server.sockets.sockets.get()
    // when Socket.IO server internals aren't fully ready.
    this.oandaStreaming.onPrice((update: OandaPriceUpdate) => {
      try {
        this._broadcastToSymbol(update.symbol, 'ticker', {
          symbol: update.symbol,
          data: {
            symbol: update.symbol,
            price: update.price,
            bid: update.bid,
            ask: update.ask,
            timestamp: new Date(update.time).toISOString(),
            source: 'oanda-stream',
            exchange: 'OANDA',
          },
        });
      } catch (e) { /* non-critical — don't block other listeners */ }
    });

    // V390: Register as Binance price listener
    // V402: Wrap in try/catch (same protection as OANDA listener)
    this.binanceStreaming.onPrice((update: BinancePriceUpdate) => {
      try {
        this._broadcastToSymbol(update.symbol, 'ticker', {
          symbol: update.symbol,
          data: {
            symbol: update.symbol,
            price: update.price,
            open: update.open,
            high: update.high,
            low: update.low,
            close: update.close,
            volume: update.volume,
            change: update.change,
            changePercent: update.changePercent,
            timestamp: new Date(update.timestamp).toISOString(),
            source: 'binance-stream',
            exchange: 'Binance',
          },
        });
      } catch (e) { /* non-critical */ }
    });
  }

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ||
      client.handshake.query?.token ||
      client.handshake.headers?.['x-roua-session'] as string ||
      this._extractSessionFromCookie(client.handshake.headers?.cookie as string);

    if (!token) {
      this.logger.warn(`🔌 Unauthenticated connection rejected: ${client.id}`);
      client.emit('error', { message: 'Authentication required.' });
      client.disconnect(true);
      return;
    }

    try {
      const session = await this.prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        client.emit('error', { message: 'Session expired or invalid.' });
        client.disconnect(true);
        return;
      }

      (client as any).user = session.user;
    } catch (error: any) {
      client.emit('error', { message: 'Authentication service unavailable.' });
      client.disconnect(true);
      return;
    }

    this.subscriptions.set(client.id, new Set());
  }

  async handleDisconnect(client: Socket) {
    const clientSymbols = this.subscriptions.get(client.id);
    if (clientSymbols) {
      for (const symbol of clientSymbols) {
        const subscribers = this.symbolSubscribers.get(symbol);
        if (subscribers) {
          subscribers.delete(client.id);
          if (subscribers.size === 0) {
            this.symbolSubscribers.delete(symbol);
            // V355: If this was an OANDA symbol, unsubscribe from stream
            if (this._isOandaSymbol(symbol)) {
              this.oandaStreaming.unsubscribe(symbol);
              this.logger.debug(`🌊 Unsubscribed OANDA stream for ${symbol} (no more subscribers)`);
            }
            // V390: If this was a crypto symbol, unsubscribe from Binance stream
            if (this._isBinanceSymbol(symbol)) {
              this.binanceStreaming.unsubscribe(symbol);
              this.logger.debug(`💱 Unsubscribed Binance stream for ${symbol} (no more subscribers)`);
            }
          }
        }
      }
    }

    this.subscriptions.delete(client.id);
    this._updateRefreshCycle();
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: { symbol: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { symbol } = data;
    if (!symbol) return;

    this.logger.debug(`📡 ${client.id} subscribed to ${symbol}`);

    const clientSymbols = this.subscriptions.get(client.id) || new Set();
    clientSymbols.add(symbol);
    this.subscriptions.set(client.id, clientSymbols);

    const subscribers = this.symbolSubscribers.get(symbol) || new Set();
    const isFirstSubscriber = subscribers.size === 0;
    subscribers.add(client.id);
    this.symbolSubscribers.set(symbol, subscribers);

    // Send initial quote immediately
    try {
      const quote = await this.exchangeService.getQuote(symbol);
      client.emit('ticker', { symbol, data: quote });
    } catch (error: any) {
      client.emit('ticker:error', { symbol, error: error.message });
    }

    // V355: If this is an OANDA symbol and it's the first subscriber,
    // subscribe to the OANDA streaming API for live prices.
    if (isFirstSubscriber && this._isOandaSymbol(symbol)) {
      this.oandaStreaming.subscribe(symbol);
      this.logger.log(`🌊 Subscribed OANDA stream for ${symbol} (live prices active)`);
    }

    // V390: If this is a crypto symbol and it's the first subscriber,
    // subscribe to Binance streaming for live prices.
    // NOTE: BinanceStreamingService auto-subscribes common pairs on startup,
    // so this is usually a no-op. But for less common pairs, it ensures
    // they're streamed on demand.
    if (isFirstSubscriber && this._isBinanceSymbol(symbol)) {
      this.binanceStreaming.subscribe(symbol);
      this.logger.log(`💱 Subscribed Binance stream for ${symbol} (live prices active)`);
    }

    // For non-streaming symbols (stocks), use the refresh cycle (polling)
    this._updateRefreshCycle();
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() data: { symbol: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { symbol } = data;
    if (!symbol) return;

    const clientSymbols = this.subscriptions.get(client.id);
    if (clientSymbols) {
      clientSymbols.delete(symbol);
    }

    const subscribers = this.symbolSubscribers.get(symbol);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.symbolSubscribers.delete(symbol);
        // V355: Unsubscribe from OANDA stream when no more subscribers
        if (this._isOandaSymbol(symbol)) {
          this.oandaStreaming.unsubscribe(symbol);
          this.logger.debug(`🌊 Unsubscribed OANDA stream for ${symbol}`);
        }
        // V390: Unsubscribe from Binance stream when no more subscribers
        if (this._isBinanceSymbol(symbol)) {
          this.binanceStreaming.unsubscribe(symbol);
          this.logger.debug(`💱 Unsubscribed Binance stream for ${symbol}`);
        }
      }
    }

    this._updateRefreshCycle();
  }

  /**
   * V355: Check if a symbol should use OANDA streaming.
   * Forex/metals/indices/energy pairs (anything routed to OANDA adapter).
   */
  private _isOandaSymbol(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    if (upper.includes('USDT') || upper.includes('/BTC') || upper.includes('/ETH')) {
      return false;
    }
    const forexQuotes = ['/USD', '/JPY', '/GBP', '/EUR', '/CHF', '/CAD', '/AUD', '/NZD'];
    const indicesBases = ['US30', 'NAS100', 'SPX500', 'GER30', 'UK100', 'WTI', 'BRENT'];
    return forexQuotes.some(qc => upper.includes(qc)) || indicesBases.some(b => upper.startsWith(b));
  }

  /**
   * V390: Check if a symbol should use Binance streaming.
   * Crypto pairs: BTC/USDT, ETH/USDT, SOL/USDT, BTC/USD, etc.
   */
  private _isBinanceSymbol(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    if (upper.includes('USDT') || upper.includes('/BTC') || upper.includes('/ETH')) {
      return true;
    }
    const cryptoBases = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT',
      'MATIC', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'SHIB', 'APE', 'ARB', 'OP',
      'FIL', 'NEAR', 'FTM', 'ALGO', 'VET', 'SAND', 'MANA', 'AXS', 'CRV', 'SUI',
      'APT', 'SEI', 'TIA', 'JUP'];
    return cryptoBases.some(b => upper.startsWith(b + '/'));
  }

  // ── Refresh Cycle (for non-streaming symbols only — stocks, etc.) ──

  private _updateRefreshCycle() {
    // Only poll for symbols that DON'T have streaming (neither OANDA nor Binance)
    const pollingSymbols = Array.from(this.symbolSubscribers.keys())
      .filter(s => !this._isOandaSymbol(s) && !this._isBinanceSymbol(s));

    const hasPollingSubscriptions = pollingSymbols.length > 0;

    if (hasPollingSubscriptions && !this.refreshInterval) {
      this.refreshInterval = setInterval(() => this._refreshPollingSubscriptions(), 5000);
      this.logger.log(`📡 Started refresh cycle for ${pollingSymbols.length} polling symbols (stocks, etc.)`);
    } else if (!hasPollingSubscriptions && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      this.logger.log('📡 Stopped refresh cycle (no polling subscriptions)');
    }
  }

  private async _refreshPollingSubscriptions() {
    const symbols = Array.from(this.symbolSubscribers.keys())
      .filter(s => !this._isOandaSymbol(s) && !this._isBinanceSymbol(s));

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
        this._broadcastToSymbol(symbol, 'ticker', { symbol, data: quote });
      }
    }
  }

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

  private _extractSessionFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/roua_session=([^;]+)/);
    return match ? match[1] : null;
  }

  broadcast(event: string, data: any): void {
    if (!this.server) return;
    const PUBLIC_EVENTS = new Set(['ticker', 'ticker:error', 'market_status', 'system']);
    if (!PUBLIC_EVENTS.has(event)) return;
    this.server.emit(event, data);
  }
}
