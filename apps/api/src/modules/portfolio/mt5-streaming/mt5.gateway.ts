import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MT5StreamingService, MT5BalanceUpdate, MT5PositionUpdate, MT5PriceUpdate, MT5ConnectionStatus } from './mt5-streaming.service';

/**
 * V196: MT5 WebSocket Gateway
 *
 * Pushes real-time MT5 data from MetaAPI streaming connections
 * to the frontend via Socket.IO namespace `/mt5`.
 *
 * Events emitted to clients:
 *   - mt5:balance    — Account balance/equity/margin update
 *   - mt5:position   — Position open/close/modify
 *   - mt5:price      — Symbol price tick with account metrics
 *   - mt5:status     — Connection health status
 *
 * Events received from clients:
 *   - mt5:subscribe  — Subscribe to a credential's updates
 *   - mt5:unsubscribe — Unsubscribe from a credential's updates
 *   - mt5:subscribe:symbol — Subscribe to market data for a symbol
 *
 * Architecture:
 *   MetaAPI ←WS→ MT5StreamingService ←EventEmitter→ MT5Gateway ←Socket.IO→ Frontend
 *
 * FALLBACK: If streaming is not connected, the frontend still
 * gets data via polling (existing fetchAccount mechanism).
 * This gateway is ADDITIVE only.
 */
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/mt5',
})
export class MT5Gateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MT5Gateway.name);

  /** Track: userId → Set of socketIds */
  private readonly userSockets = new Map<string, Set<string>>();

  /** Track: socketId → userId */
  private readonly socketUser = new Map<string, string>();

  /** Track: socketId → Set of credentialIds the socket is subscribed to */
  private readonly socketSubscriptions = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamingService: MT5StreamingService,
  ) {
    // Set bidirectional reference (streaming service pushes events to gateway)
    this.streamingService.setGateway(this);
  }

  // ═══════════════════════════════════════════════════════════
  // CONNECTION LIFECYCLE
  // ═══════════════════════════════════════════════════════════

  async handleConnection(client: Socket) {
    // Authenticate via session token (same pattern as NotificationGateway)
    const token =
      client.handshake.auth?.token ||
      client.handshake.query?.token ||
      client.handshake.headers?.['x-roua-session'] as string ||
      this._extractSessionFromCookie(client.handshake.headers?.cookie as string);

    if (!token) {
      this.logger.warn(`📊 MT5 WS: Unauthenticated connection rejected: ${client.id}`);
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
        this.logger.warn(`📊 MT5 WS: Invalid/expired session for: ${client.id}`);
        client.emit('error', { message: 'Session expired or invalid.' });
        client.disconnect(true);
        return;
      }

      const userId = session.userId;

      // Register socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      this.socketUser.set(client.id, userId);
      this.socketSubscriptions.set(client.id, new Set());

      // Send current connection status for all user's MT5 credentials
      this._sendInitialStatus(client, userId);

      this.logger.log(`📊 MT5 WS: Client connected: ${client.id} (user: ${userId.slice(0, 8)}...)`);
    } catch (err: any) {
      this.logger.error(`📊 MT5 WS: Connection auth failed: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUser.get(client.id);
    if (userId) {
      this.userSockets.get(userId)?.delete(client.id);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketUser.delete(client.id);
    this.socketSubscriptions.delete(client.id);

    this.logger.log(`📊 MT5 WS: Client disconnected: ${client.id}`);
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT HANDLERS (called directly by MT5StreamingService)
  // ═══════════════════════════════════════════════════════════

  handleBalanceUpdate(update: MT5BalanceUpdate) {
    this._emitToUser(update.userId, 'mt5:balance', update);
  }

  handlePositionUpdate(update: MT5PositionUpdate) {
    this._emitToUser(update.userId, 'mt5:position', update);
  }

  handlePriceUpdate(update: MT5PriceUpdate) {
    // Only emit to sockets subscribed to this credential
    for (const [socketId, subs] of this.socketSubscriptions.entries()) {
      if (subs.has(update.credentialId)) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('mt5:price', update);
        }
      }
    }
  }

  handleConnectionStatus(status: MT5ConnectionStatus) {
    // Emit to all sockets that might care about this credential
    for (const [socketId, subs] of this.socketSubscriptions.entries()) {
      if (subs.has(status.credentialId)) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('mt5:status', status);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENT EVENT HANDLERS (V197: Added @SubscribeMessage handlers)
  // ═══════════════════════════════════════════════════════════

  /**
   * V197: Handle mt5:subscribe — client subscribes to a credential's updates.
   * Without this, the frontend's socket.emit('mt5:subscribe', { credentialId })
   * was silently ignored, so price/status events were never delivered.
   */
  @SubscribeMessage('mt5:subscribe')
  handleSubscribe(client: Socket, payload: { credentialId: string }) {
    const subs = this.socketSubscriptions.get(client.id);
    if (subs && payload?.credentialId) {
      subs.add(payload.credentialId);
      this.logger.log(`📊 MT5 WS: Socket ${client.id} subscribed to credential ${payload.credentialId.slice(0, 8)}...`);

      // Send current status immediately on subscribe
      const status = this.streamingService.getConnectionStatus(payload.credentialId);
      if (status) {
        client.emit('mt5:status', status);
      }

      // Send cached balance if available
      const balance = this.streamingService.getAccountInfo(payload.credentialId);
      if (balance) {
        client.emit('mt5:balance', balance);
      }
    }
  }

  /**
   * V197: Handle mt5:unsubscribe — client unsubscribes from a credential's updates.
   */
  @SubscribeMessage('mt5:unsubscribe')
  handleUnsubscribe(client: Socket, payload: { credentialId: string }) {
    const subs = this.socketSubscriptions.get(client.id);
    if (subs && payload?.credentialId) {
      subs.delete(payload.credentialId);
      this.logger.log(`📊 MT5 WS: Socket ${client.id} unsubscribed from credential ${payload.credentialId.slice(0, 8)}...`);
    }
  }

  /**
   * V197: Handle mt5:subscribe:symbol — client requests live price for a symbol.
   */
  @SubscribeMessage('mt5:subscribe:symbol')
  async handleSubscribeSymbol(client: Socket, payload: { credentialId: string; symbol: string }) {
    if (payload?.credentialId && payload?.symbol) {
      const success = await this.streamingService.subscribeToSymbol(payload.credentialId, payload.symbol);
      if (success) {
        this.logger.log(`📊 MT5 WS: Socket ${client.id} subscribed to symbol ${payload.symbol}`);
      }
    }
  }

  private async _sendInitialStatus(client: Socket, userId: string) {
    // Find user's MT5 credentials and send their streaming status
    try {
      const mt5Creds = await this.prisma.exchangeCredential.findMany({
        where: {
          userId,
          exchange: { in: ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'] },
          isValid: true,
        },
        select: { id: true, exchange: true, label: true },
      });

      for (const cred of mt5Creds) {
        const status = this.streamingService.getConnectionStatus(cred.id);
        if (status) {
          client.emit('mt5:status', status);
        }

        // Send cached balance if available
        const balance = this.streamingService.getAccountInfo(cred.id);
        if (balance) {
          client.emit('mt5:balance', balance);
        }
      }
    } catch (err: any) {
      this.logger.warn(`📊 MT5 WS: Failed to send initial status: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private _emitToUser(userId: string, event: string, data: any) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) return;

    for (const socketId of socketIds) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  }

  private _extractSessionFromCookie(cookie: string | undefined): string | null {
    if (!cookie) return null;
    try {
      const match = cookie.match(/roua_session=([^;]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
