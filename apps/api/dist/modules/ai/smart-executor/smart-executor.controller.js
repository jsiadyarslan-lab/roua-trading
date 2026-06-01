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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SmartExecutorController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartExecutorController = void 0;
const common_1 = require("@nestjs/common");
const smart_executor_service_1 = require("./smart-executor.service");
const auth_guard_1 = require("../../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
const exposure_manager_service_1 = require("../../trading/services/exposure-manager.service");
let SmartExecutorController = SmartExecutorController_1 = class SmartExecutorController {
    constructor(executorService, exposureManager) {
        this.executorService = executorService;
        this.exposureManager = exposureManager;
        this.logger = new common_1.Logger(SmartExecutorController_1.name);
    }
    async getStatus(req) {
        const status = await this.executorService.getStatus(req.user?.id);
        return { success: true, data: status };
    }
    async start(req) {
        this.logger.log('⚔️ Smart Executor start requested');
        const status = await this.executorService.start(req.user?.id);
        return { success: true, data: status };
    }
    async stop(req) {
        const userId = req.user?.id;
        if (!userId) {
            return { success: false, error: 'المستخدم غير مُصادق عليه' };
        }
        this.logger.log(`⚔️ Smart Executor stop requested by user ${userId} — disabling user only (not global)`);
        await this.executorService.disableUser(userId);
        const status = await this.executorService.getStatus(userId);
        return { success: true, data: status, message: 'تم تعطيل المنفذ الذكي لحسابك' };
    }
    async emergencyStop(req) {
        const userId = req.user?.id;
        if (!userId) {
            return { success: false, error: 'المستخدم غير مُصادق عليه' };
        }
        this.logger.warn(`🚨 EMERGENCY STOP requested by user ${userId} — disabling executor and closing all positions`);
        await this.executorService.disableUser(userId);
        const closed = [];
        const failed = [];
        try {
            const openPositions = await this.executorService.getOpenPositions(userId);
            await Promise.allSettled(openPositions.map(async (pos) => {
                try {
                    await this.executorService.closePosition(userId, pos.id, 'EMERGENCY_STOP');
                    closed.push(pos.symbol);
                }
                catch {
                    failed.push(pos.symbol);
                }
            }));
        }
        catch (err) {
            this.logger.error(`Emergency close failed: ${err.message}`);
        }
        return {
            success: true,
            message: `تم إيقاف المنفذ الذكي وإغلاق ${closed.length} صفقة`,
            closed,
            failed,
        };
    }
    async getPositions(req) {
        const positions = await this.executorService.getOpenPositions(req.user?.id);
        return { success: true, data: positions };
    }
    async enableUser(req, body) {
        const state = await this.executorService.enableUser(req.user.id, body);
        return { success: true, data: state, message: 'تم تفعيل المنفذ الذكي' };
    }
    async disableUser(req) {
        await this.executorService.disableUser(req.user.id);
        return { success: true, message: 'تم إيقاف المنفذ الذكي' };
    }
    async getUserStatus(req) {
        const userId = req.user?.id;
        if (!userId) {
            return { success: false, error: 'المستخدم غير مُصادق عليه' };
        }
        const userState = await this.executorService.getUserState(userId);
        const globalStatus = await this.executorService.getStatus(userId);
        return {
            success: true,
            data: {
                user: userState,
                global: globalStatus,
            },
        };
    }
    async purgePhantoms() {
        const result = await this.executorService.purgePhantomPositions();
        return {
            success: true,
            data: result,
            message: `تم حذف ${result.deleted} مركز وهمي من قاعدة البيانات`,
        };
    }
    async resetAutoUsers() {
        const result = await this.executorService.resetAutoEnabledUsers();
        return {
            success: true,
            data: result,
            message: `تم تعطيل ${result.disabled} مستخدم تم تفعيلهم تلقائياً`,
        };
    }
    async debugExecution() {
        const diagnostic = await this.executorService.diagnoseExecution();
        return { success: true, data: diagnostic };
    }
    async nuclearCleanup(req) {
        const userId = req.user?.id;
        if (!userId) {
            return { success: false, error: 'المستخدم غير مُصادق عليه — لا يمكن تنفيذ التنظيف' };
        }
        this.logger.warn(`⚔️ V168 NUCLEAR CLEANUP requested by user ${userId}`);
        const result = await this.executorService.nuclearCleanup(userId);
        return {
            success: true,
            data: result,
            message: `تم حذف جميع البيانات الوهمية: ${result.briefs} وثيقة، ${result.positions} مركز، ${result.trades} صفقة، ${result.paperOrders} أمر ورقي، ${result.paperCredentials} بيانات ورقية`,
        };
    }
    async getExposure(req) {
        const userId = req.user?.id;
        if (!userId) {
            return { success: false, error: 'المستخدم غير مُصادق عليه' };
        }
        const summary = await this.exposureManager.getExposureSummary(userId);
        return { success: true, data: summary };
    }
};
exports.SmartExecutorController = SmartExecutorController;
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('status'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('start'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('stop'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "stop", null);
__decorate([
    (0, common_1.Post)('emergency-stop'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "emergencyStop", null);
__decorate([
    (0, common_1.Get)('positions'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "getPositions", null);
__decorate([
    (0, common_1.Post)('user/enable'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "enableUser", null);
__decorate([
    (0, common_1.Post)('user/disable'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "disableUser", null);
__decorate([
    (0, common_1.Get)('user/status'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "getUserStatus", null);
__decorate([
    (0, common_1.Post)('purge-phantoms'),
    (0, throttler_1.Throttle)({ default: { limit: 2, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "purgePhantoms", null);
__decorate([
    (0, common_1.Post)('reset-auto-users'),
    (0, throttler_1.Throttle)({ default: { limit: 2, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "resetAutoUsers", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('debug'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "debugExecution", null);
__decorate([
    (0, common_1.Post)('nuclear-cleanup'),
    (0, throttler_1.Throttle)({ default: { limit: 2, ttl: 300000 } }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "nuclearCleanup", null);
__decorate([
    (0, common_1.Get)('exposure'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SmartExecutorController.prototype, "getExposure", null);
exports.SmartExecutorController = SmartExecutorController = SmartExecutorController_1 = __decorate([
    (0, common_1.Controller)('smart-executor'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [smart_executor_service_1.SmartExecutorService,
        exposure_manager_service_1.ExposureManagerService])
], SmartExecutorController);
//# sourceMappingURL=smart-executor.controller.js.map