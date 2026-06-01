"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NotificationGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
let NotificationGateway = NotificationGateway_1 = class NotificationGateway {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(NotificationGateway_1.name);
        this.userSockets = new Map();
        this.socketUser = new Map();
    }
    async handleConnection(client) {
        const token = client.handshake.auth?.token ||
            client.handshake.query?.token ||
            client.handshake.headers?.['x-roua-session'] ||
            this._extractSessionFromCookie(client.handshake.headers?.cookie);
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
            client.user = session.user;
            client.userId = userId;
            this.socketUser.set(client.id, userId);
            const sockets = this.userSockets.get(userId) || new Set();
            sockets.add(client.id);
            this.userSockets.set(userId, sockets);
            try {
                const unreadCount = await this.prisma.userNotification.count({
                    where: { userId, isRead: false },
                });
                client.emit('unread_count', { count: unreadCount });
            }
            catch {
            }
            this.logger.debug(`🔔 User ${userId} connected to notification gateway (${client.id})`);
        }
        catch (error) {
            this.logger.error(`🔔 Auth error for ${client.id}: ${error.message}`);
            client.emit('error', { message: 'Authentication service unavailable.' });
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
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
    sendToUser(userId, event, data) {
        const sockets = this.userSockets.get(userId);
        if (!sockets || sockets.size === 0)
            return false;
        for (const socketId of sockets) {
            const client = this.server.sockets.sockets.get(socketId);
            if (client) {
                client.emit(event, data);
            }
        }
        return true;
    }
    broadcast(event, data) {
        if (!this.server)
            return;
        const PUBLIC_EVENTS = new Set([
            'ticker',
            'ticker:error',
            'market_status',
            'system',
        ]);
        if (!PUBLIC_EVENTS.has(event)) {
            this.logger.warn(`🔔 SECURITY: broadcast() called with non-public event '${event}'. Use sendToUser() for user-specific data.`);
            return;
        }
        this.server.emit(event, data);
    }
    isUserOnline(userId) {
        const sockets = this.userSockets.get(userId);
        return !!sockets && sockets.size > 0;
    }
    getOnlineCount() {
        return this.userSockets.size;
    }
    _extractSessionFromCookie(cookieHeader) {
        if (!cookieHeader)
            return null;
        const match = cookieHeader.match(/roua_session=([^;]+)/);
        return match ? match[1] : null;
    }
};
exports.NotificationGateway = NotificationGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], NotificationGateway.prototype, "server", void 0);
exports.NotificationGateway = NotificationGateway = NotificationGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: (origin, callback) => {
                callback(null, true);
            },
            credentials: true,
        },
        namespace: '/notifications',
    }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationGateway);
//# sourceMappingURL=notification.gateway.js.map