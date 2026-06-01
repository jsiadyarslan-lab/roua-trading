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
var IntegrationGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationGuard = exports.IntegrationRoute = exports.IS_INTEGRATION_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
exports.IS_INTEGRATION_KEY = 'isIntegrationRoute';
const IntegrationRoute = () => (0, common_1.SetMetadata)(exports.IS_INTEGRATION_KEY, true);
exports.IntegrationRoute = IntegrationRoute;
let IntegrationGuard = IntegrationGuard_1 = class IntegrationGuard {
    constructor(reflector) {
        this.reflector = reflector;
        this.logger = new common_1.Logger(IntegrationGuard_1.name);
    }
    async canActivate(context) {
        const isIntegration = this.reflector.getAllAndOverride(exports.IS_INTEGRATION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!isIntegration) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-integration-key'];
        const expectedKey = process.env.INTEGRATION_API_KEY;
        if (!expectedKey) {
            this.logger.warn('INTEGRATION_API_KEY not configured — integration access denied');
            throw new common_1.UnauthorizedException('مفتاح التكامل غير مُعد — يرجى تهيئة INTEGRATION_API_KEY');
        }
        if (!apiKey) {
            this.logger.warn(`Missing X-Integration-Key header from ${request.ip}`);
            throw new common_1.UnauthorizedException('مفتاح التكامل مطلوب (X-Integration-Key)');
        }
        if (apiKey.length !== expectedKey.length) {
            this.logger.warn(`Invalid integration key attempt from ${request.ip}`);
            throw new common_1.UnauthorizedException('مفتاح التكامل غير صالح');
        }
        let result = 0;
        for (let i = 0; i < apiKey.length; i++) {
            result |= apiKey.charCodeAt(i) ^ expectedKey.charCodeAt(i);
        }
        if (result !== 0) {
            this.logger.warn(`Invalid integration key attempt from ${request.ip}`);
            throw new common_1.UnauthorizedException('مفتاح التكامل غير صالح');
        }
        request.isIntegration = true;
        return true;
    }
};
exports.IntegrationGuard = IntegrationGuard;
exports.IntegrationGuard = IntegrationGuard = IntegrationGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], IntegrationGuard);
//# sourceMappingURL=integration.guard.js.map