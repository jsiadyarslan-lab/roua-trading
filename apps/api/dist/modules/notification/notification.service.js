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
var NotificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const notification_gateway_1 = require("./notification.gateway");
let NotificationService = NotificationService_1 = class NotificationService {
    constructor(prisma, gateway) {
        this.prisma = prisma;
        this.gateway = gateway;
        this.logger = new common_1.Logger(NotificationService_1.name);
    }
    async _tablesExistCheck() {
        if (NotificationService_1._tablesExist !== null) {
            return NotificationService_1._tablesExist;
        }
        if (NotificationService_1._tableCheckPromise) {
            return NotificationService_1._tableCheckPromise;
        }
        NotificationService_1._tableCheckPromise = (async () => {
            try {
                await this.prisma.userNotification.count({ take: 0 });
                NotificationService_1._tablesExist = true;
                this.logger.log('📦 Notification tables verified — DB persistence enabled');
                return true;
            }
            catch (err) {
                if (err?.message?.includes('does not exist')) {
                    NotificationService_1._tablesExist = false;
                    this.logger.warn('📦 UserNotification table does not exist — notifications will be real-time only (no DB persistence). Tables will be created on next deploy.');
                    return false;
                }
                NotificationService_1._tablesExist = true;
                return true;
            }
            finally {
                NotificationService_1._tableCheckPromise = null;
            }
        })();
        return NotificationService_1._tableCheckPromise;
    }
    async sendNotification(params) {
        const { userId, type, priority = 'MEDIUM', title, body, data = {}, source = 'system', action = 'INFO', pair } = params;
        try {
            const tablesExist = await this._tablesExistCheck();
            let prefs = null;
            if (tablesExist) {
                try {
                    prefs = await this.prisma.userNotificationPreferences.findUnique({
                        where: { userId },
                    });
                }
                catch (prefErr) {
                    if (prefErr?.message?.includes('does not exist')) {
                        NotificationService_1._tablesExist = false;
                    }
                }
            }
            if (prefs) {
                if (!prefs.enabled) {
                    this.logger.debug(`Notification suppressed for user ${userId}: master toggle off`);
                    return null;
                }
                const sourceMap = {
                    signal: 'signalAlerts',
                    trade: 'tradeAlerts',
                    ai: 'aiAlerts',
                    scanner: 'scannerAlerts',
                    system: 'systemAlerts',
                };
                const prefKey = sourceMap[source];
                if (prefKey && !prefs[prefKey]) {
                    this.logger.debug(`Notification suppressed for user ${userId}: ${source} alerts off`);
                    return null;
                }
                if (type === 'RISK_WARNING' && !prefs.riskAlerts) {
                    this.logger.debug(`Notification suppressed for user ${userId}: risk alerts off`);
                    return null;
                }
            }
            let notification = null;
            if (tablesExist) {
                try {
                    notification = await this.prisma.userNotification.create({
                        data: {
                            userId,
                            type: type,
                            priority: priority,
                            title,
                            body,
                            data: JSON.stringify(data),
                            source,
                            action,
                            pair,
                        },
                    });
                }
                catch (createErr) {
                    if (createErr?.message?.includes('does not exist')) {
                        NotificationService_1._tablesExist = false;
                    }
                    else {
                        this.logger.warn(`Failed to persist notification: ${createErr?.message}`);
                    }
                }
            }
            const notifId = notification?.id || `temp-${Date.now()}`;
            const notifTimestamp = notification?.createdAt?.toISOString() || new Date().toISOString();
            const pushed = this.gateway.sendToUser(userId, 'notification', {
                id: notifId,
                type,
                priority,
                title,
                body,
                data,
                source,
                action,
                pair,
                timestamp: notifTimestamp,
                isRead: false,
            });
            if (pushed) {
                this.logger.debug(`Notification pushed to user ${userId}: [${type}] ${title}`);
            }
            else {
                this.logger.debug(`Notification persisted for offline user ${userId}: [${type}] ${title}`);
            }
            if (type === 'SIGNAL_GENERATED' && data.signalId && data.action && data.action !== 'WAIT') {
                await this._checkAutoExecute(userId, notification?.id, data, prefs);
            }
            return notification;
        }
        catch (error) {
            this.logger.error(`Failed to send notification to user ${userId}: ${error.message}`);
            return null;
        }
    }
    async broadcastNotification(params) {
        const { type, priority = 'MEDIUM', title, body, data = {}, source = 'system', action = 'INFO', pair } = params;
        this.gateway.broadcast('notification', {
            type,
            priority,
            title,
            body,
            data,
            source,
            action,
            pair,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Broadcast notification: [${type}] ${title}`);
    }
    async getUserNotifications(userId, options) {
        const { limit = 50, offset = 0, unreadOnly = false, type } = options || {};
        const tablesExist = await this._tablesExistCheck();
        if (!tablesExist) {
            return { notifications: [], total: 0, unreadCount: 0 };
        }
        const where = { userId };
        if (unreadOnly)
            where.isRead = false;
        if (type)
            where.type = type;
        try {
            const [notifications, total, unreadCount] = await Promise.all([
                this.prisma.userNotification.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                this.prisma.userNotification.count({ where }),
                this.prisma.userNotification.count({
                    where: { userId, isRead: false },
                }),
            ]);
            return { notifications, total, unreadCount };
        }
        catch (err) {
            if (err?.message?.includes('does not exist')) {
                NotificationService_1._tablesExist = false;
            }
            return { notifications: [], total: 0, unreadCount: 0 };
        }
    }
    async markAsRead(userId, notificationIds) {
        const tablesExist = await this._tablesExistCheck();
        if (!tablesExist)
            return { count: 0 };
        try {
            if (notificationIds && notificationIds.length > 0) {
                return this.prisma.userNotification.updateMany({
                    where: { id: { in: notificationIds }, userId },
                    data: { isRead: true, readAt: new Date() },
                });
            }
            return this.prisma.userNotification.updateMany({
                where: { userId, isRead: false },
                data: { isRead: true, readAt: new Date() },
            });
        }
        catch (err) {
            if (err?.message?.includes('does not exist')) {
                NotificationService_1._tablesExist = false;
            }
            return { count: 0 };
        }
    }
    async getPreferences(userId) {
        const tablesExist = await this._tablesExistCheck();
        if (!tablesExist) {
            return {
                id: 'no-table',
                userId,
                enabled: true,
                pushEnabled: true,
                soundEnabled: true,
                browserEnabled: true,
                telegramEnabled: false,
                signalAlerts: true,
                tradeAlerts: true,
                aiAlerts: true,
                scannerAlerts: true,
                riskAlerts: true,
                systemAlerts: true,
                autoExecuteEnabled: false,
                autoExecuteMinConfidence: 75,
                autoExecuteMaxPositionSize: 0.02,
            };
        }
        try {
            let prefs = await this.prisma.userNotificationPreferences.findUnique({
                where: { userId },
            });
            if (!prefs) {
                prefs = await this.prisma.userNotificationPreferences.create({
                    data: { userId },
                });
            }
            return prefs;
        }
        catch (err) {
            if (err?.message?.includes('does not exist')) {
                NotificationService_1._tablesExist = false;
            }
            return {
                id: 'no-table',
                userId,
                enabled: true,
                pushEnabled: true,
                soundEnabled: true,
                browserEnabled: true,
                telegramEnabled: false,
                signalAlerts: true,
                tradeAlerts: true,
                aiAlerts: true,
                scannerAlerts: true,
                riskAlerts: true,
                systemAlerts: true,
                autoExecuteEnabled: false,
                autoExecuteMinConfidence: 75,
                autoExecuteMaxPositionSize: 0.02,
            };
        }
    }
    async updatePreferences(userId, updates) {
        const tablesExist = await this._tablesExistCheck();
        if (!tablesExist)
            return null;
        try {
            return this.prisma.userNotificationPreferences.upsert({
                where: { userId },
                create: { userId, ...updates },
                update: updates,
            });
        }
        catch (err) {
            if (err?.message?.includes('does not exist')) {
                NotificationService_1._tablesExist = false;
            }
            return null;
        }
    }
    async cleanupOldNotifications(olderThanDays = 30) {
        const tablesExist = await this._tablesExistCheck();
        if (!tablesExist)
            return { count: 0 };
        try {
            const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
            const result = await this.prisma.userNotification.deleteMany({
                where: {
                    isRead: true,
                    createdAt: { lt: cutoff },
                },
            });
            this.logger.log(`Cleaned up ${result.count} old notifications`);
            return result;
        }
        catch (err) {
            if (err?.message?.includes('does not exist')) {
                NotificationService_1._tablesExist = false;
            }
            return { count: 0 };
        }
    }
    async _checkAutoExecute(userId, notificationId, signalData, prefs) {
        if (!prefs?.autoExecuteEnabled)
            return;
        const minConfidence = prefs.autoExecuteMinConfidence || 75;
        const confidence = signalData.confidence || 0;
        if (confidence < minConfidence) {
            this.logger.debug(`Auto-execute skipped for user ${userId}: confidence ${confidence}% < ${minConfidence}%`);
            return;
        }
        this.gateway.sendToUser(userId, 'auto_execute_signal', {
            notificationId,
            signalId: signalData.signalId,
            pair: signalData.pair,
            action: signalData.action,
            confidence,
            entryPrice: signalData.entryPrice,
            stopLoss: signalData.stopLoss,
            takeProfit: signalData.takeProfit,
            maxPositionSizePercent: Number(prefs.autoExecuteMaxPositionSize) || 0.02,
        });
        this.logger.log(`Auto-execute signal pushed to user ${userId}: ${signalData.action} ${signalData.pair} (${confidence}%)`);
    }
};
exports.NotificationService = NotificationService;
NotificationService._tablesExist = null;
NotificationService._tableCheckPromise = null;
exports.NotificationService = NotificationService = NotificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notification_gateway_1.NotificationGateway])
], NotificationService);
//# sourceMappingURL=notification.service.js.map