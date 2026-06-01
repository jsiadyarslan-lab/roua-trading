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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../common/prisma/prisma.service");
const redis_service_1 = require("../common/redis/redis.service");
const audit_service_1 = require("../audit/audit.service");
const server_1 = require("@simplewebauthn/server");
const crypto = __importStar(require("crypto"));
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, redis, configService, auditService) {
        this.prisma = prisma;
        this.redis = redis;
        this.configService = configService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.challengeTtlMs = 5 * 60 * 1000;
        this.sessionTtlMs = 24 * 60 * 60 * 1000;
        this.refreshTtlMs = 30 * 24 * 60 * 60 * 1000;
        this.sessionRedisPrefix = 'session:';
        this.sessionRedisTtlMs = 15 * 60 * 1000;
        this.rpId =
            this.configService.get('RP_ID') ||
                this.configService.get('WEBAUTHN_RP_ID') ||
                'localhost';
        this.rpName =
            this.configService.get('RP_NAME') ||
                'Roua Trading';
        this.origin =
            this.configService.get('ORIGIN') ||
                (this.rpId === 'localhost' ? 'http://localhost:3000' : `https://${this.rpId}`);
        this.logger.log(`WebAuthn configured — rpId: ${this.rpId}, rpName: ${this.rpName}, origin: ${this.origin}`);
    }
    async generateRegistrationChallenge(email, displayName) {
        if (!email || !email.includes('@')) {
            throw new common_1.BadRequestException('يرجى إدخال بريد إلكتروني صحيح');
        }
        const existingUser = await this.prisma.user.findUnique({ where: { email } });
        if (existingUser && existingUser.passkeyId) {
            throw new common_1.ConflictException('هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.');
        }
        const userId = this.getUserIdBuffer(email);
        const userIdBuffer = Uint8Array.from(atob(userId), (c) => c.charCodeAt(0));
        const existingCredentials = [];
        if (existingUser?.passkeyId) {
            existingCredentials.push(existingUser.passkeyId);
        }
        try {
            const options = await (0, server_1.generateRegistrationOptions)({
                rpID: this.rpId,
                rpName: this.rpName,
                userID: userIdBuffer,
                userName: email,
                userDisplayName: displayName || email.split('@')[0],
                attestationType: 'none',
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'required',
                },
                excludeCredentials: existingCredentials.map((credId) => ({
                    id: credId,
                    transports: ['internal'],
                })),
                timeout: 60000,
            });
            const challengeKey = `auth:challenge:reg:${email}`;
            await this.redis.set(challengeKey, JSON.stringify({ challenge: options.challenge, type: 'registration' }), this.challengeTtlMs);
            this.logger.log(`Registration challenge generated for ${email} (rpId: ${this.rpId})`);
            return options;
        }
        catch (error) {
            this.logger.error(`Failed to generate registration challenge for ${email}: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.BadRequestException('حدث خطأ في إنشاء التحدي. تأكد من إعداد RP_ID و RP_NAME و ORIGIN بشكل صحيح.');
        }
    }
    async generateAuthenticationChallenge(email) {
        if (!email) {
            throw new common_1.BadRequestException('يرجى توفير البريد الإلكتروني');
        }
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !user.passkeyId) {
            throw new common_1.NotFoundException('المستخدم غير موجود. يرجى التسجيل أولاً.');
        }
        try {
            const options = await (0, server_1.generateAuthenticationOptions)({
                rpID: this.rpId,
                allowCredentials: [{ id: user.passkeyId, transports: ['internal'] }],
                userVerification: 'required',
                timeout: 60000,
            });
            const challengeKey = `auth:challenge:auth:${email}`;
            await this.redis.set(challengeKey, JSON.stringify({ challenge: options.challenge, type: 'authentication' }), this.challengeTtlMs);
            this.logger.log(`Authentication challenge generated for ${email} (rpId: ${this.rpId})`);
            return options;
        }
        catch (error) {
            this.logger.error(`Failed to generate authentication challenge for ${email}: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.BadRequestException('حدث خطأ في إنشاء تحدي المصادقة. تأكد من إعداد RP_ID بشكل صحيح.');
        }
    }
    async verifyRegistration(email, regResponse, userAgent, ipAddress) {
        let user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            try {
                user = await this.prisma.user.create({
                    data: { email, displayName: email.split('@')[0] },
                });
            }
            catch {
                user = await this.prisma.user.findUnique({ where: { email } });
            }
        }
        if (!user) {
            throw new common_1.NotFoundException('المستخدم غير موجود');
        }
        const challengeKey = `auth:challenge:reg:${email}`;
        const storedChallenge = await this.redis.get(challengeKey);
        if (!storedChallenge) {
            throw new common_1.BadRequestException('انتهت صلاحية التحدي أو غير موجود');
        }
        const challengeData = JSON.parse(storedChallenge);
        try {
            const verification = await (0, server_1.verifyRegistrationResponse)({
                response: regResponse,
                expectedChallenge: challengeData.challenge,
                expectedOrigin: this.origin,
                expectedRPID: this.rpId,
            });
            if (!verification.verified || !verification.registrationInfo) {
                throw new common_1.BadRequestException('فشل التحقق من بيانات الاعتماد');
            }
            await this.redis.del(challengeKey);
            const { credential } = verification.registrationInfo;
            await this.prisma.user.update({
                where: { email },
                data: {
                    passkeyId: credential.id,
                    passkeyPub: Buffer.from(credential.publicKey).toString('base64'),
                    passkeyCounter: credential.counter || 0,
                },
            });
            const deviceInfo = this.parseUserAgent(userAgent);
            try {
                const existingSessions = await this.prisma.session.findMany({
                    where: { userId: user.id, isActive: true },
                    select: { id: true, token: true },
                });
                if (existingSessions.length > 0) {
                    await this.prisma.session.updateMany({
                        where: { userId: user.id, isActive: true },
                        data: { isActive: false },
                    });
                    for (const s of existingSessions) {
                        const cacheKey = `${this.sessionRedisPrefix}${s.token}`;
                        await this.redis.del(cacheKey).catch(() => { });
                    }
                }
            }
            catch (rotationError) {
                this.logger.warn(`Session rotation failed for ${email}: ${rotationError?.message || rotationError}`);
            }
            const session = await this.createSession(user.id, { userAgent, ipAddress, deviceInfo });
            await this.auditService.log({
                userId: user.id, action: 'AUTH_REGISTER', resource: 'passkey',
                details: JSON.stringify({ credentialId: credential.id }), userAgent, ipAddress,
            });
            this.logger.log(`User registered: ${email}`);
            return {
                success: true,
                sessionToken: session.token,
                refreshToken: session.refreshToken,
                user: { id: user.id, email: user.email, displayName: user.displayName, tier: user.tier },
            };
        }
        catch (error) {
            await this.redis.del(challengeKey);
            if (error instanceof common_1.BadRequestException)
                throw error;
            this.logger.error(`Registration verification error for ${email}: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.BadRequestException('حدث خطأ في التحقق من التسجيل. تأكد من إعداد ORIGIN و RP_ID بشكل صحيح.');
        }
    }
    async verifyAuthentication(email, assertion, userAgent, ipAddress) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.NotFoundException('المستخدم غير موجود');
        }
        if (!user.passkeyId) {
            throw new common_1.BadRequestException('لم يتم تسجيل Passkey لهذا الحساب');
        }
        const challengeKey = `auth:challenge:auth:${email}`;
        const storedChallenge = await this.redis.get(challengeKey);
        if (!storedChallenge) {
            throw new common_1.BadRequestException('انتهت صلاحية التحدي أو غير موجود');
        }
        const challengeData = JSON.parse(storedChallenge);
        try {
            const verification = await (0, server_1.verifyAuthenticationResponse)({
                response: assertion,
                expectedChallenge: challengeData.challenge,
                expectedOrigin: this.origin,
                expectedRPID: this.rpId,
                credential: {
                    id: user.passkeyId,
                    publicKey: user.passkeyPub ? Uint8Array.from(atob(user.passkeyPub), (c) => c.charCodeAt(0)) : new Uint8Array(),
                    counter: user.passkeyCounter || 0,
                    transports: ['internal'],
                },
            });
            if (!verification.verified) {
                throw new common_1.BadRequestException('فشل التحقق من المصادقة');
            }
            await this.redis.del(challengeKey);
            const newCounter = verification.authenticationInfo?.newCounter ?? user.passkeyCounter ?? 0;
            await this.prisma.user.update({
                where: { id: user.id },
                data: { passkeyCounter: newCounter },
            });
            const deviceInfo = this.parseUserAgent(userAgent);
            try {
                const existingSessions = await this.prisma.session.findMany({
                    where: { userId: user.id, isActive: true },
                    select: { id: true, token: true },
                });
                if (existingSessions.length > 0) {
                    await this.prisma.session.updateMany({
                        where: { userId: user.id, isActive: true },
                        data: { isActive: false },
                    });
                    for (const s of existingSessions) {
                        const cacheKey = `${this.sessionRedisPrefix}${s.token}`;
                        await this.redis.del(cacheKey).catch(() => { });
                    }
                }
            }
            catch (rotationError) {
                this.logger.warn(`Session rotation failed for ${email}: ${rotationError?.message || rotationError}`);
            }
            const session = await this.createSession(user.id, { userAgent, ipAddress, deviceInfo });
            await this.auditService.log({
                userId: user.id, action: 'AUTH_LOGIN', resource: 'passkey', userAgent, ipAddress,
            });
            try {
                const existingPaperCredential = await this.prisma.exchangeCredential.findFirst({
                    where: { userId: user.id, exchange: 'paper-trading' },
                });
                if (!existingPaperCredential) {
                    await this.prisma.exchangeCredential.create({
                        data: {
                            userId: user.id,
                            exchange: 'paper-trading',
                            label: 'حساب تجريبي تجريبي',
                            encryptedApiKey: `demo-${user.id}`,
                            encryptedSecret: `demo-secret-${user.id}`,
                            iv: 'demo-iv',
                            authTag: 'demo-auth-tag',
                            permissions: JSON.stringify(['read', 'trade']),
                            isValid: true,
                        },
                    });
                    this.logger.log(`🎮 Auto-created paper-trading account for user ${user.id}`);
                    await this.auditService.log({
                        userId: user.id,
                        action: 'DEMO_ACCOUNT_CREATED',
                        resource: 'paper-trading',
                        details: 'Auto-created demo account for new user',
                        userAgent,
                        ipAddress,
                    });
                }
            }
            catch (demoErr) {
                this.logger.warn(`Failed to create demo account for user ${user.id}: ${demoErr.message}`);
            }
            this.logger.log(`User logged in: ${email}`);
            return {
                success: true,
                sessionToken: session.token,
                refreshToken: session.refreshToken,
                user: { id: user.id, email: user.email, displayName: user.displayName, tier: user.tier },
            };
        }
        catch (error) {
            await this.redis.del(challengeKey);
            if (error instanceof common_1.BadRequestException)
                throw error;
            this.logger.error(`Authentication verification error for ${email}: ${error instanceof Error ? error.message : String(error)}`);
            throw new common_1.BadRequestException('حدث خطأ في التحقق من المصادقة. تأكد من إعداد ORIGIN و RP_ID بشكل صحيح.');
        }
    }
    async validateSession(token) {
        const cacheKey = `${this.sessionRedisPrefix}${token}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.authenticated && parsed.user) {
                    return parsed;
                }
            }
        }
        catch {
        }
        const session = await this.prisma.session.findUnique({
            where: { token },
            include: { user: true },
        });
        if (!session || !session.isActive || session.expiresAt < new Date()) {
            if (session) {
                await this.prisma.session.update({
                    where: { id: session.id },
                    data: { isActive: false },
                }).catch(() => { });
                await this.redis.del(cacheKey).catch(() => { });
            }
            return { authenticated: false };
        }
        const halfTtl = this.sessionTtlMs / 2;
        const remainingMs = session.expiresAt.getTime() - Date.now();
        if (remainingMs < halfTtl) {
            const newExpiresAt = new Date(Date.now() + this.sessionTtlMs);
            await this.prisma.session.update({
                where: { id: session.id },
                data: { expiresAt: newExpiresAt },
            }).catch(() => { });
        }
        const result = {
            authenticated: true,
            user: {
                id: session.user.id,
                email: session.user.email,
                displayName: session.user.displayName,
                tier: session.user.tier,
            },
        };
        try {
            await this.redis.set(cacheKey, JSON.stringify(result), this.sessionRedisTtlMs);
        }
        catch {
        }
        return result;
    }
    async refreshSession(refreshToken, userAgent, ipAddress) {
        if (!refreshToken) {
            throw new common_1.BadRequestException('رمز التحديث مطلوب');
        }
        const session = await this.prisma.session.findUnique({
            where: { refreshToken },
            include: { user: true },
        });
        if (!session || !session.isActive) {
            throw new common_1.BadRequestException('رمز التحديث غير صالح أو منتهي الصلاحية');
        }
        const refreshExpiryMs = session.createdAt.getTime() + this.refreshTtlMs;
        if (Date.now() > refreshExpiryMs) {
            await this.prisma.session.update({
                where: { id: session.id },
                data: { isActive: false },
            }).catch(() => { });
            throw new common_1.BadRequestException('انتهت صلاحية رمز التحديث. يرجى تسجيل الدخول مرة أخرى.');
        }
        const isGuest = session.user.email === 'guest@roua.auto' || session.user.email.startsWith('guest-') || session.user.id.startsWith('guest');
        if (isGuest) {
            throw new common_1.BadRequestException('لا يمكن تجديد جلسة الضيف');
        }
        await this.prisma.session.update({
            where: { id: session.id },
            data: { isActive: false },
        });
        const oldCacheKey = `${this.sessionRedisPrefix}${session.token}`;
        await this.redis.del(oldCacheKey).catch(() => { });
        const deviceInfo = session.deviceInfo ? JSON.parse(session.deviceInfo) : this.parseUserAgent(userAgent);
        const newSession = await this.createSession(session.user.id, {
            userAgent: userAgent || session.userAgent || undefined,
            ipAddress: ipAddress || session.ipAddress || undefined,
            deviceInfo,
        });
        await this.auditService.log({
            userId: session.user.id,
            action: 'AUTH_REFRESH',
            resource: 'session',
            details: JSON.stringify({ oldSessionId: session.id, newSessionId: newSession.id }),
            userAgent,
            ipAddress,
        });
        this.logger.log(`Session refreshed for user: ${session.user.email}`);
        return {
            success: true,
            sessionToken: newSession.token,
            refreshToken: newSession.refreshToken,
            user: {
                id: session.user.id,
                email: session.user.email,
                displayName: session.user.displayName,
                tier: session.user.tier,
            },
        };
    }
    async getUserSessions(userId) {
        const sessions = await this.prisma.session.findMany({
            where: { userId, isActive: true, expiresAt: { gt: new Date() } },
            select: {
                id: true,
                deviceInfo: true,
                ipAddress: true,
                userAgent: true,
                createdAt: true,
                expiresAt: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
        });
        return sessions.map((s) => ({
            id: s.id,
            device: s.deviceInfo ? JSON.parse(s.deviceInfo) : null,
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            lastActive: s.updatedAt,
            maskedIp: s.ipAddress ? this.maskIpAddress(s.ipAddress) : null,
        }));
    }
    async revokeSession(sessionId, userId) {
        const session = await this.prisma.session.findUnique({
            where: { id: sessionId },
        });
        if (!session) {
            throw new common_1.NotFoundException('الجلسة غير موجودة');
        }
        if (session.userId !== userId) {
            throw new common_1.ForbiddenException('ليس لديك صلاحية لإنهاء هذه الجلسة');
        }
        await this.prisma.session.update({
            where: { id: sessionId },
            data: { isActive: false },
        });
        const cacheKey = `${this.sessionRedisPrefix}${session.token}`;
        await this.redis.del(cacheKey).catch(() => { });
        await this.auditService.log({
            userId,
            action: 'AUTH_SESSION_REVOKE',
            resource: 'session',
            details: JSON.stringify({ revokedSessionId: sessionId }),
        });
        this.logger.log(`Session revoked: ${sessionId} by user: ${userId}`);
        return { success: true };
    }
    async revokeAllOtherSessions(userId, currentSessionToken) {
        const sessions = await this.prisma.session.findMany({
            where: { userId, isActive: true, token: { not: currentSessionToken } },
            select: { id: true, token: true },
        });
        await this.prisma.session.updateMany({
            where: { userId, isActive: true, token: { not: currentSessionToken } },
            data: { isActive: false },
        });
        for (const s of sessions) {
            const cacheKey = `${this.sessionRedisPrefix}${s.token}`;
            await this.redis.del(cacheKey).catch(() => { });
        }
        await this.auditService.log({
            userId,
            action: 'AUTH_REVOKE_ALL',
            resource: 'session',
            details: JSON.stringify({ revokedCount: sessions.length }),
        });
        this.logger.log(`All other sessions revoked for user: ${userId} (count: ${sessions.length})`);
        return { success: true, revokedCount: sessions.length };
    }
    async destroySession(token) {
        const session = await this.prisma.session.findUnique({
            where: { token },
        });
        if (session) {
            await this.prisma.session.update({
                where: { id: session.id },
                data: { isActive: false },
            });
            const cacheKey = `${this.sessionRedisPrefix}${token}`;
            await this.redis.del(cacheKey).catch(() => { });
            await this.auditService.log({
                userId: session.userId,
                action: 'AUTH_LOGOUT',
                resource: 'session',
            });
        }
        return { success: true };
    }
    async cleanupExpiredSessions() {
        const result = await this.prisma.session.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: new Date() } },
                    { isActive: false, updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
                ],
            },
        });
        this.logger.log(`Cleaned up ${result.count} expired/inactive sessions`);
        return { cleaned: result.count };
    }
    getUserIdBuffer(email) {
        return crypto.createHash('sha256').update(email).digest('base64url');
    }
    async createSession(userId, options) {
        const token = crypto.randomBytes(32).toString('hex');
        const refreshToken = crypto.randomBytes(48).toString('hex');
        const expiresAt = new Date(Date.now() + this.sessionTtlMs);
        const deviceInfoStr = options?.deviceInfo ? JSON.stringify(options.deviceInfo) : null;
        const session = await this.prisma.session.create({
            data: {
                userId,
                token,
                refreshToken,
                deviceInfo: deviceInfoStr,
                ipAddress: options?.ipAddress || null,
                userAgent: options?.userAgent || null,
                isActive: true,
                expiresAt,
            },
        });
        const cacheKey = `${this.sessionRedisPrefix}${token}`;
        try {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (user) {
                const cacheData = JSON.stringify({
                    authenticated: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        displayName: user.displayName,
                        tier: user.tier,
                    },
                });
                await this.redis.set(cacheKey, cacheData, this.sessionRedisTtlMs);
            }
        }
        catch {
        }
        return session;
    }
    parseUserAgent(userAgent) {
        if (!userAgent) {
            return { type: 'unknown' };
        }
        const ua = userAgent.toLowerCase();
        let type = 'desktop';
        if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
            type = 'mobile';
        }
        else if (/ipad|tablet|kindle|silk/i.test(ua)) {
            type = 'tablet';
        }
        let browser = 'Unknown';
        if (ua.includes('edg/'))
            browser = 'Edge';
        else if (ua.includes('chrome/') && !ua.includes('edg/'))
            browser = 'Chrome';
        else if (ua.includes('firefox/'))
            browser = 'Firefox';
        else if (ua.includes('safari/') && !ua.includes('chrome/'))
            browser = 'Safari';
        else if (ua.includes('opera/') || ua.includes('opr/'))
            browser = 'Opera';
        let os = 'Unknown';
        if (ua.includes('windows'))
            os = 'Windows';
        else if (ua.includes('mac os'))
            os = 'macOS';
        else if (ua.includes('linux'))
            os = 'Linux';
        else if (ua.includes('android'))
            os = 'Android';
        else if (ua.includes('iphone') || ua.includes('ipad'))
            os = 'iOS';
        return { browser, os, type, device: type };
    }
    maskIpAddress(ip) {
        if (ip.includes('.')) {
            const parts = ip.split('.');
            if (parts.length >= 4) {
                parts[3] = 'xxx';
                return parts.join('.');
            }
        }
        if (ip.includes(':')) {
            const parts = ip.split(':');
            if (parts.length >= 2) {
                parts[parts.length - 1] = 'xxx';
                return parts.join(':');
            }
        }
        return 'xxx.xxx.xxx.xxx';
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        config_1.ConfigService,
        audit_service_1.AuditService])
], AuthService);
//# sourceMappingURL=auth.service.js.map