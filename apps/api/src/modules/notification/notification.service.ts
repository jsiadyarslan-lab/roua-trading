import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

/**
 * Notification Service — Real-time + Persisted Notification Engine
 *
 * Manages the full lifecycle of user notifications:
 * 1. Create notification in database (persistent)
 * 2. Push notification via Socket.IO (real-time)
 * 3. Track read/unread state
 * 4. Respect per-user notification preferences
 *
 * Integration Points:
 * - OrderConsumer: emits ORDER_FILLED / ORDER_REJECTED
 * - SignalService: emits SIGNAL_GENERATED
 * - RiskGatekeeperService: emits RISK_WARNING
 * - PositionManagerService: emits POSITION_OPENED / POSITION_CLOSED
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  /**
   * Send a notification to a specific user
   * Persists to DB and pushes via Socket.IO if the user is online
   */
  async sendNotification(params: {
    userId: string;
    type: 'SIGNAL_GENERATED' | 'ORDER_FILLED' | 'ORDER_REJECTED' | 'ORDER_ACCEPTED' | 'POSITION_OPENED' | 'POSITION_CLOSED' | 'RISK_WARNING' | 'PRICE_ALERT' | 'AI_INSIGHT' | 'SYSTEM';
    priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    body: string;
    data?: Record<string, any>;
    source?: string;
    action?: string;
    pair?: string;
  }) {
    const { userId, type, priority = 'MEDIUM', title, body, data = {}, source = 'system', action = 'INFO', pair } = params;

    try {
      // Check user preferences before sending
      const prefs = await this.prisma.userNotificationPreferences.findUnique({
        where: { userId },
      });

      // If preferences exist, respect them
      if (prefs) {
        if (!prefs.enabled) {
          this.logger.debug(`Notification suppressed for user ${userId}: master toggle off`);
          return null;
        }

        // Check source-specific toggles
        const sourceMap: Record<string, string> = {
          signal: 'signalAlerts',
          trade: 'tradeAlerts',
          ai: 'aiAlerts',
          scanner: 'scannerAlerts',
          system: 'systemAlerts',
        };
        const prefKey = sourceMap[source];
        if (prefKey && !(prefs as any)[prefKey]) {
          this.logger.debug(`Notification suppressed for user ${userId}: ${source} alerts off`);
          return null;
        }

        // Check type-specific toggles
        if (type === 'RISK_WARNING' && !prefs.riskAlerts) {
          this.logger.debug(`Notification suppressed for user ${userId}: risk alerts off`);
          return null;
        }
      }

      // Persist notification to database
      const notification = await this.prisma.userNotification.create({
        data: {
          userId,
          type: type as any,
          priority: priority as any,
          title,
          body,
          data: JSON.stringify(data),
          source,
          action,
          pair,
        },
      });

      // Push via Socket.IO (real-time) — regardless of pushEnabled,
      // we always try to push since it's the primary UX improvement
      const pushed = this.gateway.sendToUser(userId, 'notification', {
        id: notification.id,
        type,
        priority,
        title,
        body,
        data,
        source,
        action,
        pair,
        timestamp: notification.createdAt.toISOString(),
        isRead: false,
      });

      if (pushed) {
        this.logger.debug(`Notification pushed to user ${userId}: [${type}] ${title}`);
      } else {
        this.logger.debug(`Notification persisted for offline user ${userId}: [${type}] ${title}`);
      }

      // Auto-execute logic: if this is a signal and user has auto-execute enabled
      if (type === 'SIGNAL_GENERATED' && data.signalId && data.action && data.action !== 'WAIT') {
        await this._checkAutoExecute(userId, notification.id, data, prefs);
      }

      return notification;
    } catch (error: any) {
      this.logger.error(`Failed to send notification to user ${userId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Send notification to all connected users (system-wide broadcast)
   */
  async broadcastNotification(params: {
    type: 'SYSTEM' | 'PRICE_ALERT' | 'AI_INSIGHT';
    priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    body: string;
    data?: Record<string, any>;
    source?: string;
    action?: string;
    pair?: string;
  }) {
    const { type, priority = 'MEDIUM', title, body, data = {}, source = 'system', action = 'INFO', pair } = params;

    // Broadcast via Socket.IO to all connected clients
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

  /**
   * Get notifications for a user (paginated)
   */
  async getUserNotifications(userId: string, options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    type?: string;
  }) {
    const { limit = 50, offset = 0, unreadOnly = false, type } = options || {};

    const where: any = { userId };
    if (unreadOnly) where.isRead = false;
    if (type) where.type = type;

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

  /**
   * Mark notification(s) as read
   */
  async markAsRead(userId: string, notificationIds?: string[]) {
    if (notificationIds && notificationIds.length > 0) {
      return this.prisma.userNotification.updateMany({
        where: { id: { in: notificationIds }, userId },
        data: { isRead: true, readAt: new Date() },
      });
    }

    // Mark all as read
    return this.prisma.userNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Get or create user notification preferences
   */
  async getPreferences(userId: string) {
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

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, updates: Record<string, any>) {
    return this.prisma.userNotificationPreferences.upsert({
      where: { userId },
      create: { userId, ...updates },
      update: updates,
    });
  }

  /**
   * Delete old read notifications (cleanup)
   */
  async cleanupOldNotifications(olderThanDays: number = 30) {
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

  // ── Private: Auto-Execute Logic ──

  /**
   * Check if a signal should be auto-executed for a user
   * based on their auto-execute preferences
   */
  private async _checkAutoExecute(
    userId: string,
    notificationId: string,
    signalData: Record<string, any>,
    prefs: any,
  ) {
    if (!prefs?.autoExecuteEnabled) return;

    const minConfidence = prefs.autoExecuteMinConfidence || 75;
    const confidence = signalData.confidence || 0;

    if (confidence < minConfidence) {
      this.logger.debug(
        `Auto-execute skipped for user ${userId}: confidence ${confidence}% < ${minConfidence}%`,
      );
      return;
    }

    // Notify the frontend to auto-execute
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

    this.logger.log(
      `Auto-execute signal pushed to user ${userId}: ${signalData.action} ${signalData.pair} (${confidence}%)`,
    );
  }
}
