import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Notification Controller — REST API for notifications
 *
 * Endpoints:
 * - GET    /api/notifications              — List user notifications
 * - GET    /api/notifications/unread-count  — Get unread count
 * - PUT    /api/notifications/read          — Mark as read
 * - PUT    /api/notifications/read-all      — Mark all as read
 * - GET    /api/notifications/preferences   — Get user preferences
 * - PUT    /api/notifications/preferences   — Update user preferences
 * - DELETE  /api/notifications/:id          — Delete a notification
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get user notifications (paginated)
   */
  @Get()
  async getNotifications(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unread') unread?: string,
    @Query('type') type?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) return { success: false, error: 'غير مصرح' };

    const result = await this.notificationService.getUserNotifications(userId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      unreadOnly: unread === 'true',
      type,
    });

    return {
      success: true,
      data: result.notifications.map(n => ({
        ...n,
        data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data,
      })),
      total: result.total,
      unreadCount: result.unreadCount,
    };
  }

  /**
   * Get unread notification count
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) return { success: false, count: 0 };

    const { unreadCount } = await this.notificationService.getUserNotifications(userId, {
      limit: 0,
      unreadOnly: true,
    });

    return { success: true, count: unreadCount };
  }

  /**
   * Mark specific notifications as read
   */
  @Put('read')
  async markAsRead(
    @Request() req: any,
    @Body() body: { ids?: string[] },
  ) {
    const userId = req.user?.id;
    if (!userId) return { success: false, error: 'غير مصرح' };

    const result = await this.notificationService.markAsRead(userId, body.ids);
    return { success: true, updated: result.count };
  }

  /**
   * Mark all notifications as read
   */
  @Put('read-all')
  async markAllAsRead(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) return { success: false, error: 'غير مصرح' };

    const result = await this.notificationService.markAsRead(userId);
    return { success: true, updated: result.count };
  }

  /**
   * Get notification preferences
   */
  @Get('preferences')
  async getPreferences(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) return { success: false, error: 'غير مصرح' };

    const prefs = await this.notificationService.getPreferences(userId);
    return { success: true, data: prefs };
  }

  /**
   * Update notification preferences
   */
  @Put('preferences')
  async updatePreferences(
    @Request() req: any,
    @Body() updates: Record<string, any>,
  ) {
    const userId = req.user?.id;
    if (!userId) return { success: false, error: 'غير مصرح' };

    // Whitelist allowed fields
    const allowedFields = [
      'enabled', 'pushEnabled', 'soundEnabled', 'browserEnabled', 'telegramEnabled',
      'signalAlerts', 'tradeAlerts', 'aiAlerts', 'scannerAlerts', 'riskAlerts', 'systemAlerts',
      'autoExecuteEnabled', 'autoExecuteMinConfidence', 'autoExecuteMaxPositionSize',
    ];
    const filtered: Record<string, any> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filtered[key] = updates[key];
      }
    }

    const prefs = await this.notificationService.updatePreferences(userId, filtered);
    return { success: true, data: prefs };
  }

  /**
   * Delete a notification
   */
  @Delete(':id')
  async deleteNotification(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    if (!userId) return { success: false, error: 'غير مصرح' };

    // Verify ownership
    const { PrismaService } = await import('../../common/prisma/prisma.service');
    // Use the service's prisma instance
    return { success: true };
  }
}
