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
var CoachController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoachController = void 0;
const common_1 = require("@nestjs/common");
const coach_service_1 = require("./coach.service");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let CoachController = CoachController_1 = class CoachController {
    constructor(coachService) {
        this.coachService = coachService;
        this.logger = new common_1.Logger(CoachController_1.name);
    }
    async getPerformanceAdvice(req) {
        const userId = req.user.id;
        this.logger.log(`Performance advice request for user ${userId}`);
        return this.coachService.getPerformanceAdvice(userId);
    }
    async askCoach(req, body) {
        const userId = req.user.id;
        this.logger.log(`Coach question from user ${userId}`);
        return this.coachService.askCoach(userId, body.question, body.contextAdviceId);
    }
    async getAdviceHistory(req) {
        const userId = req.user.id;
        return this.coachService.getAdviceHistory(userId);
    }
};
exports.CoachController = CoachController;
__decorate([
    (0, common_1.Post)('performance'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CoachController.prototype, "getPerformanceAdvice", null);
__decorate([
    (0, common_1.Post)('ask'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CoachController.prototype, "askCoach", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CoachController.prototype, "getAdviceHistory", null);
exports.CoachController = CoachController = CoachController_1 = __decorate([
    (0, common_1.Controller)('coach'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [coach_service_1.CoachService])
], CoachController);
//# sourceMappingURL=coach.controller.js.map