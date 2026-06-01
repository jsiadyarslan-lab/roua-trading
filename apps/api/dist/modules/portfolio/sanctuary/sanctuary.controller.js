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
var SanctuaryController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SanctuaryController = void 0;
const common_1 = require("@nestjs/common");
const sanctuary_service_1 = require("./sanctuary.service");
const auth_guard_1 = require("../../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let SanctuaryController = SanctuaryController_1 = class SanctuaryController {
    constructor(sanctuaryService) {
        this.sanctuaryService = sanctuaryService;
        this.logger = new common_1.Logger(SanctuaryController_1.name);
    }
    async analyzePortfolio(req) {
        this.logger.debug(`Portfolio analysis request (user: ${req.user.id})`);
        const report = await this.sanctuaryService.analyzePortfolio(req.user.id);
        return { success: true, data: report };
    }
};
exports.SanctuaryController = SanctuaryController;
__decorate([
    (0, common_1.Get)(),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SanctuaryController.prototype, "analyzePortfolio", null);
exports.SanctuaryController = SanctuaryController = SanctuaryController_1 = __decorate([
    (0, common_1.Controller)('portfolio/sanctuary'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [sanctuary_service_1.SanctuaryService])
], SanctuaryController);
//# sourceMappingURL=sanctuary.controller.js.map