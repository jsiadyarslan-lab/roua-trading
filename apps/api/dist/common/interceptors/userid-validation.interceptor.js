"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UserIdValidationInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserIdValidationInterceptor = void 0;
exports.validateUserId = validateUserId;
exports.isValidUserId = isValidUserId;
const common_1 = require("@nestjs/common");
let UserIdValidationInterceptor = UserIdValidationInterceptor_1 = class UserIdValidationInterceptor {
    constructor() {
        this.logger = new common_1.Logger(UserIdValidationInterceptor_1.name);
    }
    intercept(context, CallHandler) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user) {
            const userId = user.id;
            if (!userId || typeof userId !== 'string' || userId.trim() === '') {
                this.logger.error(`🚨 SECURITY: Authenticated request has invalid userId="${userId}" — ` +
                    `possible auth bypass or session corruption! Path: ${request.method} ${request.url}`);
                throw new common_1.ForbiddenException('هوية المستخدم غير صالحة — يرجى تسجيل الدخول مرة أخرى');
            }
        }
        return CallHandler.handle();
    }
};
exports.UserIdValidationInterceptor = UserIdValidationInterceptor;
exports.UserIdValidationInterceptor = UserIdValidationInterceptor = UserIdValidationInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], UserIdValidationInterceptor);
function validateUserId(userId, context) {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        throw new common_1.ForbiddenException(`هوية المستخدم غير صالحة${context ? ` (${context})` : ''} — يرجى تسجيل الدخول مرة أخرى`);
    }
    return userId;
}
function isValidUserId(userId) {
    return !!userId && typeof userId === 'string' && userId.trim() !== '';
}
//# sourceMappingURL=userid-validation.interceptor.js.map