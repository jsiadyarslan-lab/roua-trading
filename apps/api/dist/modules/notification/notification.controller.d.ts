import { NotificationService } from './notification.service';
export declare class NotificationController {
    private readonly notificationService;
    constructor(notificationService: NotificationService);
    getNotifications(req: any, limit?: string, offset?: string, unread?: string, type?: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
        total?: undefined;
        unreadCount?: undefined;
    } | {
        success: boolean;
        data: {
            data: any;
            type: import(".prisma/client").$Enums.NotificationType;
            id: string;
            action: string;
            createdAt: Date;
            userId: string;
            source: string;
            body: string;
            priority: import(".prisma/client").$Enums.NotificationPriority;
            title: string;
            pair: string | null;
            isRead: boolean;
            readAt: Date | null;
        }[];
        total: number;
        unreadCount: number;
        error?: undefined;
    }>;
    getUnreadCount(req: any): Promise<{
        success: boolean;
        count: number;
    }>;
    markAsRead(req: any, body: {
        ids?: string[];
    }): Promise<{
        success: boolean;
        error: string;
        updated?: undefined;
    } | {
        success: boolean;
        updated: number;
        error?: undefined;
    }>;
    markAllAsRead(req: any): Promise<{
        success: boolean;
        error: string;
        updated?: undefined;
    } | {
        success: boolean;
        updated: number;
        error?: undefined;
    }>;
    getPreferences(req: any): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            enabled: boolean;
            pushEnabled: boolean;
            soundEnabled: boolean;
            browserEnabled: boolean;
            telegramEnabled: boolean;
            signalAlerts: boolean;
            tradeAlerts: boolean;
            aiAlerts: boolean;
            scannerAlerts: boolean;
            riskAlerts: boolean;
            systemAlerts: boolean;
            autoExecuteEnabled: boolean;
            autoExecuteMinConfidence: number;
            autoExecuteMaxPositionSize: import("@prisma/client/runtime/library").Decimal;
        } | {
            id: string;
            userId: string;
            enabled: boolean;
            pushEnabled: boolean;
            soundEnabled: boolean;
            browserEnabled: boolean;
            telegramEnabled: boolean;
            signalAlerts: boolean;
            tradeAlerts: boolean;
            aiAlerts: boolean;
            scannerAlerts: boolean;
            riskAlerts: boolean;
            systemAlerts: boolean;
            autoExecuteEnabled: boolean;
            autoExecuteMinConfidence: number;
            autoExecuteMaxPositionSize: number;
        };
        error?: undefined;
    }>;
    updatePreferences(req: any, updates: Record<string, any>): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            enabled: boolean;
            pushEnabled: boolean;
            soundEnabled: boolean;
            browserEnabled: boolean;
            telegramEnabled: boolean;
            signalAlerts: boolean;
            tradeAlerts: boolean;
            aiAlerts: boolean;
            scannerAlerts: boolean;
            riskAlerts: boolean;
            systemAlerts: boolean;
            autoExecuteEnabled: boolean;
            autoExecuteMinConfidence: number;
            autoExecuteMaxPositionSize: import("@prisma/client/runtime/library").Decimal;
        } | null;
        error?: undefined;
    }>;
    deleteNotification(req: any, id: string): Promise<{
        success: boolean;
        error: string;
    } | {
        success: boolean;
        error?: undefined;
    }>;
}
