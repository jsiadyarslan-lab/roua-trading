"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const common_1 = require("@nestjs/common");
const notification_service_1 = require("./notification.service");
let NotificationController = class NotificationController {
    constructor(notificationService) {
        this.notificationService = notificationService;
    }
    async getNotifications(req, limit, offset, unread, type) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, error: 'غير مصرح' };
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
    async getUnreadCount(req) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, count: 0 };
        const { unreadCount } = await this.notificationService.getUserNotifications(userId, {
            limit: 0,
            unreadOnly: true,
        });
        return { success: true, count: unreadCount };
    }
    async markAsRead(req, body) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, error: 'غير مصرح' };
        const result = await this.notificationService.markAsRead(userId, body.ids);
        return { success: true, updated: result.count };
    }
    async markAllAsRead(req) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, error: 'غير مصرح' };
        const result = await this.notificationService.markAsRead(userId);
        return { success: true, updated: result.count };
    }
    async getPreferences(req) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, error: 'غير مصرح' };
        const prefs = await this.notificationService.getPreferences(userId);
        return { success: true, data: prefs };
    }
    async updatePreferences(req, updates) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, error: 'غير مصرح' };
        const allowedFields = [
            'enabled', 'pushEnabled', 'soundEnabled', 'browserEnabled', 'telegramEnabled',
            'signalAlerts', 'tradeAlerts', 'aiAlerts', 'scannerAlerts', 'riskAlerts', 'systemAlerts',
            'autoExecuteEnabled', 'autoExecuteMinConfidence', 'autoExecuteMaxPositionSize',
        ];
        const filtered = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filtered[key] = updates[key];
            }
        }
        const prefs = await this.notificationService.updatePreferences(userId, filtered);
        return { success: true, data: prefs };
    }
    async deleteNotification(req, id) {
        const userId = req.user?.id;
        if (!userId)
            return { success: false, error: 'غير مصرح' };
        const { PrismaService } = await Promise.resolve().then(() => __importStar(require('../../common/prisma/prisma.service')));
        return { success: true };
    }
};
exports.NotificationController = NotificationController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('unread')),
    __param(4, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "getUnreadCount", null);
__decorate([
    (0, common_1.Put)('read'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.Put)('read-all'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "markAllAsRead", null);
__decorate([
    (0, common_1.Get)('preferences'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "getPreferences", null);
__decorate([
    (0, common_1.Put)('preferences'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "updatePreferences", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationController.prototype, "deleteNotification", null);
exports.NotificationController = NotificationController = __decorate([
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notification_service_1.NotificationService])
], NotificationController);
//# sourceMappingURL=notification.controller.js.map