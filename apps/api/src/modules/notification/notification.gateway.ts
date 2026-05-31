import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Notification WebSocket Gateway
 *
 * Provides real-time notification push to authenticated users.
 * Uses Socket.IO namespace `/notifications` — separate from the
 * price ticker `/exchange` namespace to avoid event collisions.
 *
 * Events:
 * - notification: Server pushes a new notification to a user
 * - auto_execute_signal: Server tells client to auto-execute a signal
 * - notifications_read: Client confirms notifications as read
 * - notification_prefs: Client requests/updates preferences
 *
 * Architecture:
 * - userId → Set<socketIds> mapping for targeted delivery
 * - Session token auth (same as ExchangeGateway)
 * - Automatic cleanup on disconnect
 */
@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  // Track: userId → Set of socketIds
  private readonly userSockets = new Map<string, Set<string>>();

  // Track: socketId → userId (for cleanup)
  private readonly socketUser = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    // Authenticate via session token
    const token =
      client.handshake.auth?.token ||
      client.handshake.query?.token ||
      client.handshake.headers?.['x-roua-session'] as string ||
      this._extractSessionFromCookie(client.handshake.headers?.cookie as string);

    if (!token) {
      this.logger.warn(`🔔 Unauthenticated connection rejected: ${client.id}`);
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
        this.logger.warn(`🔔 Invalid/expired session for connection: ${client.id}`);
        client.emit('error', { message: 'Session expired or invalid.' });
        client.disconnect(true);
        return;
      }

      const userId = session.user.id;

      // Attach user info to socket
      (client as any).user = session.user;
      (client as any).userId = userId;

      // Track socket
      this.socketUser.set(client.id, userId);
      const sockets = this.userSockets.get(userId) || new Set();
      sockets.add(client.id);
      this.userSockets.set(userId, sockets);

      // Send unread count on connect
      try {
        const unreadCount = await this.prisma.userNotification.count({
          where: { userId, isRead: false },
        });
        client.emit('unread_count', { count: unreadCount });
      } catch {
        // DB error — non-critical
      }

      this.logger.debug(`🔔 User ${userId} connected to notification gateway (${client.id})`);
    } catch (error: any) {
      this.logger.error(`🔔 Auth error for ${client.id}: ${error.message}`);
      client.emit('error', { message: 'Authentication service unavailable.' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketUser.get(client.id);

    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.socketUser.delete(client.id);
    }

    this.logger.debug(`🔔 Client disconnected: ${client.id}`);
  }

  /**
   * Send an event to a specific user (all their connected sockets)
   * Returns true if the user was online (at least one socket received it)
   */
  sendToUser(userId: string, event: string, data: any): boolean {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return false;

    for (const socketId of sockets) {
      const client = this.server.sockets.sockets.get(socketId);
      if (client) {
        client.emit(event, data);
      }
    }

    return true;
  }

  /**
   * Broadcast a PUBLIC event to ALL connected clients.
   *
   * V156 SECURITY: Only use this for inherently PUBLIC data (price tickers,
   * market status). NEVER use this for user-specific data (notifications,
   * trade results, account updates) — use sendToUser() instead.
   *
   * @param event - Event name (must be a public event type)
   * @param data - Event data (must NOT contain user-specific information)
   */
  broadcast(event: string, data: any): void {
    if (!this.server) return;

    // V156: Whitelist of public events that are safe to broadcast to ALL users.
    // These contain only market data that is inherently public.
    const PUBLIC_EVENTS = new Set([
      'ticker',          // Price ticker updates
      'ticker:error',    // Price fetch errors
      'market_status',   // Market open/close status
      'system',          // System-wide announcements
    ]);

    if (!PUBLIC_EVENTS.has(event)) {
      this.logger.warn(`🔔 SECURITY: broadcast() called with non-public event '${event}'. Use sendToUser() for user-specific data.`);
      return; // Block non-public broadcasts
    }

    this.server.emit(event, data);
  }

  /**
   * Get online status for a user
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Get count of online users
   */
  getOnlineCount(): number {
    return this.userSockets.size;
  }

  private _extractSessionFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/roua_session=([^;]+)/);
    return match ? match[1] : null;
  }
}
