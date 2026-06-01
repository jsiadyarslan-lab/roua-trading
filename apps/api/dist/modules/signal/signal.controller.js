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
var SignalController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalController = void 0;
const common_1 = require("@nestjs/common");
const signal_service_1 = require("./signal.service");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let SignalController = SignalController_1 = class SignalController {
    constructor(signalService) {
        this.signalService = signalService;
        this.logger = new common_1.Logger(SignalController_1.name);
    }
    async generateSignal(req, pair) {
        this.logger.debug(`Signal generation request: ${pair} (user: ${req.user.id})`);
        let decodedPair;
        try {
            decodedPair = decodeURIComponent(pair);
        }
        catch {
            decodedPair = pair;
        }
        const signal = await this.signalService.generateSignal(req.user.id, decodedPair);
        return { success: true, data: signal };
    }
    async getActiveSignals(req) {
        const signals = await this.signalService.getActiveSignals(req.user.id);
        return { success: true, data: signals };
    }
    async getSignalHistory(req) {
        const signals = await this.signalService.getSignalHistory(req.user.id);
        return { success: true, data: signals };
    }
    async executeSignal(req, signalId, body) {
        const userId = req.user.id;
        if (!body.credentialId) {
            throw new common_1.BadRequestException('معرف بيانات الاعتماد مطلوب لتنفيذ الإشارة');
        }
        const result = await this.signalService.executeSignal(userId, signalId, body.credentialId, body.quantity);
        return { success: true, data: result };
    }
    async cancelSignal(req, id) {
        const signal = await this.signalService.cancelSignal(req.user.id, id);
        return { success: true, data: signal };
    }
};
exports.SignalController = SignalController;
__decorate([
    (0, common_1.Post)('generate/:pair'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('pair')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SignalController.prototype, "generateSignal", null);
__decorate([
    (0, common_1.Get)('active'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SignalController.prototype, "getActiveSignals", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SignalController.prototype, "getSignalHistory", null);
__decorate([
    (0, common_1.Post)(':id/execute'),
    (0, throttler_1.Throttle)({ medium: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SignalController.prototype, "executeSignal", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SignalController.prototype, "cancelSignal", null);
exports.SignalController = SignalController = SignalController_1 = __decorate([
    (0, common_1.Controller)('signals'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [signal_service_1.SignalService])
], SignalController);
//# sourceMappingURL=signal.controller.js.map