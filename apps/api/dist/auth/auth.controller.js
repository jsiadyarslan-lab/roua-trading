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
var AuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const throttler_1 = require("@nestjs/throttler");
const auth_guard_1 = require("../common/guards/auth.guard");
let AuthController = AuthController_1 = class AuthController {
    constructor(authService) {
        this.authService = authService;
        this.logger = new common_1.Logger(AuthController_1.name);
        this.logger.log('AuthController initialized — WebAuthn + Session Management endpoints ready');
    }
    async registerChallenge(body) {
        this.logger.log(`Registration challenge requested for: ${body.email}`);
        return this.authService.generateRegistrationChallenge(body.email, body.displayName);
    }
    async authChallenge(email) {
        this.logger.log(`Authentication challenge requested for: ${email}`);
        return this.authService.generateAuthenticationChallenge(email);
    }
    async verify(body, req, res) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip || req.socket.remoteAddress;
        if (body.credential) {
            this.logger.log(`Registration verification for: ${body.email}`);
            const result = await this.authService.verifyRegistration(body.email, body.credential, userAgent, ipAddress);
            res.cookie('roua_session', result.sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
            });
            if (result.refreshToken) {
                res.cookie('roua_refresh', result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                    path: '/',
                });
            }
            return { success: true, user: result.user };
        }
        if (body.assertion) {
            this.logger.log(`Authentication verification for: ${body.email}`);
            const result = await this.authService.verifyAuthentication(body.email, body.assertion, userAgent, ipAddress);
            res.cookie('roua_session', result.sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
            });
            if (result.refreshToken) {
                res.cookie('roua_refresh', result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                    path: '/',
                });
            }
            return { success: true, user: result.user };
        }
        return { error: 'بيانات اعتماد غير صالحة' };
    }
    async checkSession(req) {
        const sessionToken = req.cookies?.['roua_session'] ||
            req.headers.authorization?.replace('Bearer ', '');
        if (!sessionToken) {
            return { authenticated: false };
        }
        return this.authService.validateSession(sessionToken);
    }
    async logout(req, res) {
        const sessionToken = req.cookies?.['roua_session'] ||
            req.headers.authorization?.replace('Bearer ', '');
        if (sessionToken) {
            await this.authService.destroySession(sessionToken);
        }
        res.clearCookie('roua_session');
        res.clearCookie('roua_refresh');
        return { success: true };
    }
    async refreshSession(req, res) {
        let refreshToken = req.cookies?.['roua_refresh'];
        if (!refreshToken) {
            const authHeader = req.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                refreshToken = authHeader.slice(7).trim();
            }
        }
        if (!refreshToken) {
            refreshToken = req.headers['x-roua-refresh'];
        }
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip || req.socket.remoteAddress;
        if (!refreshToken) {
            return { authenticated: false, error: 'NO_REFRESH_TOKEN' };
        }
        try {
            const result = await this.authService.refreshSession(refreshToken, userAgent, ipAddress);
            res.cookie('roua_session', result.sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
            });
            if (result.refreshToken) {
                res.cookie('roua_refresh', result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                    path: '/',
                });
            }
            return {
                success: true,
                authenticated: true,
                user: result.user,
                data: {
                    token: result.sessionToken,
                    refresh: result.refreshToken,
                },
            };
        }
        catch (error) {
            res.clearCookie('roua_session');
            res.clearCookie('roua_refresh');
            return {
                authenticated: false,
                error: error.message || 'REFRESH_FAILED',
            };
        }
    }
    async listSessions(req) {
        const userId = req.user?.id;
        if (!userId) {
            return { sessions: [] };
        }
        const sessions = await this.authService.getUserSessions(userId);
        return { sessions };
    }
    async revokeSession(sessionId, req) {
        const userId = req.user?.id;
        if (!userId) {
            return { success: false, error: 'UNAUTHENTICATED' };
        }
        return this.authService.revokeSession(sessionId, userId);
    }
    async revokeAllOtherSessions(req) {
        const userId = req.user?.id;
        const currentToken = req.cookies?.['roua_session'] || req.headers.authorization?.replace('Bearer ', '');
        if (!userId) {
            return { success: false, error: 'UNAUTHENTICATED' };
        }
        return this.authService.revokeAllOtherSessions(userId, currentToken);
    }
    async cleanupSessions() {
        return this.authService.cleanupExpiredSessions();
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    (0, auth_guard_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerChallenge", null);
__decorate([
    (0, common_1.Get)('challenge'),
    (0, auth_guard_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Query)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "authChallenge", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, auth_guard_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verify", null);
__decorate([
    (0, common_1.Get)('session'),
    (0, auth_guard_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "checkSession", null);
__decorate([
    (0, common_1.Delete)('session'),
    (0, auth_guard_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, auth_guard_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refreshSession", null);
__decorate([
    (0, common_1.Get)('sessions'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "listSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:id'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "revokeSession", null);
__decorate([
    (0, common_1.Delete)('sessions'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "revokeAllOtherSessions", null);
__decorate([
    (0, common_1.Post)('cleanup'),
    (0, throttler_1.Throttle)({ default: { limit: 2, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "cleanupSessions", null);
exports.AuthController = AuthController = AuthController_1 = __decorate([
    (0, common_1.Controller)('auth'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map