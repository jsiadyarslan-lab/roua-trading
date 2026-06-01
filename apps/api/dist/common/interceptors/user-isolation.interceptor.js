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
var UserIsolationInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserIsolationInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../prisma/prisma.service");
let UserIsolationInterceptor = UserIsolationInterceptor_1 = class UserIsolationInterceptor {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(UserIsolationInterceptor_1.name);
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const userId = request.user?.id;
        if (!userId || !this.prisma) {
            return next.handle();
        }
        return (0, rxjs_1.from)(this.prisma.setRlsUserId(userId).catch((err) => {
            this.logger.warn(`RLS context setup failed for ${userId}: ${err?.message}`);
        })).pipe((0, rxjs_1.switchMap)(() => next.handle()), (0, rxjs_1.finalize)(() => {
            this.prisma.clearRlsUserId().catch(() => { });
        }), (0, rxjs_1.catchError)((err) => {
            this.prisma.clearRlsUserId().catch(() => { });
            return (0, rxjs_1.throwError)(() => err);
        }));
    }
};
exports.UserIsolationInterceptor = UserIsolationInterceptor;
exports.UserIsolationInterceptor = UserIsolationInterceptor = UserIsolationInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserIsolationInterceptor);
//# sourceMappingURL=user-isolation.interceptor.js.map