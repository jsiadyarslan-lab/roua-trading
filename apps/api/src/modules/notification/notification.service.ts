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
 * FIX v113: Added table existence cache to prevent Prisma error log spam
 * when UserNotification/UserNotificationPreferences tables don't exist yet.
 * Prisma logs errors at its own level BEFORE our catch block catches them,
 * causing massive "prisma:error" spam in Railway logs. The fix: check once
 * if the tables exist, and if not, skip all DB operations silently.
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

  /** Cached table existence checks — checked once, then cached for the lifetime of the process */
  private static _tablesExist: boolean | null = null;
  private static _tableCheckPromise: Promise<boolean> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  /**
   * Check if the notification tables exist in the database.
   * Result is cached for the process lifetime to avoid repeated queries.
   */
  private async _tablesExistCheck(): Promise<boolean> {
    // Return cached result if available
    if (NotificationService._tablesExist !== null) {
      return NotificationService._tablesExist;
    }

    // If a check is already in progress, wait for it
    if (NotificationService._tableCheckPromise) {
      return NotificationService._tableCheckPromise;
    }

    // Start the check
    NotificationService._tableCheckPromise = (async () => {
      try {
        // Try a lightweight query on UserNotification
        await this.prisma.userNotification.count({ take: 0 });
        NotificationService._tablesExist = true;
        this.logger.log('📦 Notification tables verified — DB persistence enabled');
        return true;
      } catch (err: any) {
        if (err?.message?.includes('does not exist')) {
          NotificationService._tablesExist = false;
          this.logger.warn('📦 UserNotification table does not exist — notifications will be real-time only (no DB persistence). Tables will be created on next deploy.');
          return false;
        }
        // Other error — assume tables exist (don't disable persistence on network errors)
        NotificationService._tablesExist = true;
        return true;
      } finally {
        NotificationService._tableCheckPromise = null;
      }
    })();

    return NotificationService._tableCheckPromise;
  }

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
      const tablesExist = await this._tablesExistCheck();

      // Check user preferences before sending (only if tables exist)
      let prefs: any = null;
      if (tablesExist) {
        try {
          prefs = await this.prisma.userNotificationPreferences.findUnique({
            where: { userId },
          });
        } catch (prefErr: any) {
          // Table might have been dropped — update cache
          if (prefErr?.message?.includes('does not exist')) {
            NotificationService._tablesExist = false;
          }
        }
      }

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

      // Persist notification to database (only if tables exist)
      let notification: any = null;
      if (tablesExist) {
        try {
          notification = await this.prisma.userNotification.create({
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
        } catch (createErr: any) {
          if (createErr?.message?.includes('does not exist')) {
            // Table was dropped — update cache
            NotificationService._tablesExist = false;
          } else {
            this.logger.warn(`Failed to persist notification: ${createErr?.message}`);
          }
        }
      }

      // Push via Socket.IO (real-time) — always try, even if DB persistence failed
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
      } else {
        this.logger.debug(`Notification persisted for offline user ${userId}: [${type}] ${title}`);
      }

      // V190: Send to external channels (Telegram/Discord) if user has them configured
      this._sendToExternalChannels(userId, { type, priority, title, body, pair, source }).catch(() => {
        // Non-blocking — don't fail the notification if external channels fail
      });

      // Auto-execute logic: if this is a signal and user has auto-execute enabled
      if (type === 'SIGNAL_GENERATED' && data.signalId && data.action && data.action !== 'WAIT') {
        await this._checkAutoExecute(userId, notification?.id, data, prefs);
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

    const tablesExist = await this._tablesExistCheck();
    if (!tablesExist) {
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    const where: any = { userId };
    if (unreadOnly) where.isRead = false;
    if (type) where.type = type;

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
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        NotificationService._tablesExist = false;
      }
      return { notifications: [], total: 0, unreadCount: 0 };
    }
  }

  /**
   * Mark notification(s) as read
   */
  async markAsRead(userId: string, notificationIds?: string[]) {
    const tablesExist = await this._tablesExistCheck();
    if (!tablesExist) return { count: 0 };

    try {
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
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        NotificationService._tablesExist = false;
      }
      return { count: 0 };
    }
  }

  /**
   * Get or create user notification preferences
   */
  async getPreferences(userId: string) {
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
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        NotificationService._tablesExist = false;
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

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, updates: Record<string, any>) {
    const tablesExist = await this._tablesExistCheck();
    if (!tablesExist) return null;

    try {
      return this.prisma.userNotificationPreferences.upsert({
        where: { userId },
        create: { userId, ...updates },
        update: updates,
      });
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        NotificationService._tablesExist = false;
      }
      return null;
    }
  }

  /**
   * Delete old read notifications (cleanup)
   */
  async cleanupOldNotifications(olderThanDays: number = 30) {
    const tablesExist = await this._tablesExistCheck();
    if (!tablesExist) return { count: 0 };

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
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        NotificationService._tablesExist = false;
      }
      return { count: 0 };
    }
  }

  // ── Private: External Channels (Telegram/Discord) ──

  /**
   * V190: Send notification to user's external channels (Telegram/Discord).
   * Reads the user's channel config from the Setting table and sends
   * the notification via HTTP POST. Non-blocking — failures are logged
   * but don't affect the core notification flow.
   */
  private async _sendToExternalChannels(
    userId: string,
    notif: { type: string; priority?: string; title: string; body: string; pair?: string; source?: string },
  ): Promise<void> {
    try {
      // Read user's external notification settings from DB
      const [enabledSetting, telegramBotToken, telegramChatId, discordWebhookUrl] = await Promise.all([
        this.prisma.setting.findUnique({ where: { key: `user:${userId}:externalNotificationsEnabled` } }).catch(() => null),
        this.prisma.setting.findUnique({ where: { key: `user:${userId}:telegramBotToken` } }).catch(() => null),
        this.prisma.setting.findUnique({ where: { key: `user:${userId}:telegramChatId` } }).catch(() => null),
        this.prisma.setting.findUnique({ where: { key: `user:${userId}:discordWebhookUrl` } }).catch(() => null),
      ]);

      // Check if external notifications are enabled
      if (enabledSetting?.value !== 'true') return;

      const priorityEmoji: Record<string, string> = {
        URGENT: '🔴',
        HIGH: '🟠',
        MEDIUM: '🟡',
        LOW: '🟢',
      };
      const emoji = priorityEmoji[notif.priority || 'MEDIUM'] || '🔔';
      const text = `${emoji} **${notif.title}**\n${notif.body}${notif.pair ? `\n\n💱 الزوج: ${notif.pair}` : ''}${notif.source ? `\n📍 المصدر: ${notif.source}` : ''}`;

      // Send to Telegram
      const botToken = telegramBotToken?.value;
      const chatId = telegramChatId?.value;
      if (botToken && chatId) {
        try {
          const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: 'Markdown',
            }),
            signal: AbortSignal.timeout(5000), // 5-second timeout
          });
          if (response.ok) {
            this.logger.debug(`📱 Telegram notification sent to user ${userId}`);
          } else {
            const errText = await response.text().catch(() => 'unknown error');
            this.logger.warn(`📱 Telegram API error for user ${userId}: ${response.status} ${errText}`);
          }
        } catch (tgErr: any) {
          this.logger.warn(`📱 Telegram send failed for user ${userId}: ${tgErr.message}`);
        }
      }

      // Send to Discord
      const webhookUrl = discordWebhookUrl?.value;
      if (webhookUrl) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: text,
              username: 'Roua Trading',
            }),
            signal: AbortSignal.timeout(5000), // 5-second timeout
          });
          if (response.ok) {
            this.logger.debug(`💬 Discord notification sent to user ${userId}`);
          } else {
            const errText = await response.text().catch(() => 'unknown error');
            this.logger.warn(`💬 Discord webhook error for user ${userId}: ${response.status} ${errText}`);
          }
        } catch (dcErr: any) {
          this.logger.warn(`💬 Discord send failed for user ${userId}: ${dcErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.debug(`External channel send failed for user ${userId}: ${err.message}`);
    }
  }

  // ── Private: Auto-Execute Logic ──

  /**
   * Check if a signal should be auto-executed for a user
   * based on their auto-execute preferences
   */
  private async _checkAutoExecute(
    userId: string,
    notificationId: string | undefined,
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
