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
var AuthGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthGuard = exports.Public = exports.IS_PUBLIC_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
exports.IS_PUBLIC_KEY = 'isPublic';
const Public = () => (0, common_1.SetMetadata)(exports.IS_PUBLIC_KEY, true);
exports.Public = Public;
let AuthGuard = AuthGuard_1 = class AuthGuard {
    constructor(prisma, reflector, redis) {
        this.prisma = prisma;
        this.reflector = reflector;
        this.redis = redis;
        this.logger = new common_1.Logger(AuthGuard_1.name);
        this.SESSION_CACHE_PREFIX = 'session:';
        this.SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const isPublic = this.reflector.getAllAndOverride(exports.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        const cookieToken = request.cookies?.['roua_session'];
        const authHeader = request.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ')
            ? authHeader.slice(7)
            : authHeader;
        const headerToken = request.headers['x-roua-session'];
        const sessionToken = cookieToken || bearerToken || headerToken;
        if (sessionToken) {
            if (this.redis) {
                const cacheKey = `${this.SESSION_CACHE_PREFIX}${sessionToken}`;
                try {
                    const cached = await this.redis.get(cacheKey);
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (parsed.authenticated && parsed.user) {
                            request.user = parsed.user;
                            try {
                                await this.prisma.setRlsUserId(parsed.user.id);
                            }
                            catch {
                            }
                            return true;
                        }
                    }
                }
                catch {
                }
            }
            try {
                if (!this.prisma.isAvailable()) {
                    this.logger.warn('DB unavailable during session validation — rejecting');
                    throw new common_1.UnauthorizedException('يرجى تسجيل الدخول للوصول إلى هذا المورد');
                }
                const session = await this.prisma.session.findUnique({
                    where: { token: sessionToken },
                    include: { user: true },
                });
                if (session && session.isActive && session.expiresAt > new Date()) {
                    request.user = session.user;
                    try {
                        await this.prisma.setRlsUserId(session.user.id);
                    }
                    catch {
                    }
                    if (this.redis) {
                        try {
                            const cacheKey = `${this.SESSION_CACHE_PREFIX}${sessionToken}`;
                            const cacheData = JSON.stringify({
                                authenticated: true,
                                user: {
                                    id: session.user.id,
                                    email: session.user.email,
                                    displayName: session.user.displayName,
                                    tier: session.user.tier,
                                },
                            });
                            await this.redis.set(cacheKey, cacheData, this.SESSION_CACHE_TTL_MS);
                        }
                        catch {
                        }
                    }
                    return true;
                }
                if (session) {
                    await this.prisma.session.update({
                        where: { id: session.id },
                        data: { isActive: false },
                    }).catch(() => { });
                    if (this.redis) {
                        const cacheKey = `${this.SESSION_CACHE_PREFIX}${sessionToken}`;
                        await this.redis.del(cacheKey).catch(() => { });
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Session validation failed: ${error?.message || error}`);
            }
        }
        if (isPublic) {
            return true;
        }
        this.logger.warn(`Unauthenticated request to protected route: ${request.method} ${request.url}`);
        throw new common_1.UnauthorizedException('يرجى تسجيل الدخول للوصول إلى هذا المورد');
    }
    async clearRlsContext() {
        try {
            await this.prisma.clearRlsUserId();
        }
        catch {
        }
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = AuthGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        core_1.Reflector,
        redis_service_1.RedisService])
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map