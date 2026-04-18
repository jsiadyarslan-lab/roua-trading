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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../common/prisma/prisma.service");
const redis_service_1 = require("../common/redis/redis.service");
const audit_service_1 = require("../audit/audit.service");
const crypto = require("crypto");
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, redis, configService, auditService) {
        this.prisma = prisma;
        this.redis = redis;
        this.configService = configService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.rpName = 'Roua Trading';
        this.challengeTtlMs = 5 * 60 * 1000;
        this.sessionTtlMs = 24 * 60 * 60 * 1000;
        this.rpId = this.configService.get('WEBAUTHN_RP_ID', 'localhost');
    }
    async generateRegistrationChallenge(email, displayName) {
        if (!email || !email.includes('@')) {
            throw new common_1.BadRequestException('يرجى إدخال بريد إلكتروني صحيح');
        }
        const existingUser = await this.prisma.user.findUnique({ where: { email } });
        if (existingUser && existingUser.passkeyId) {
            throw new common_1.ConflictException('هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.');
        }
        const challenge = this.generateChallenge();
        const userId = this.getUserIdBuffer(email);
        const challengeKey = `auth:challenge:reg:${email}`;
        await this.redis.set(challengeKey, JSON.stringify({ challenge, type: 'registration' }), this.challengeTtlMs);
        const options = {
            challenge,
            rp: {
                name: this.rpName,
                id: this.rpId,
            },
            user: {
                id: userId,
                name: email,
                displayName: displayName || email.split('@')[0],
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },
                { type: 'public-key', alg: -257 },
            ],
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                residentKey: 'required',
            },
        };
        if (!existingUser) {
            await this.prisma.user.create({
                data: {
                    email,
                    displayName: displayName || email.split('@')[0],
                },
            });
        }
        return options;
    }
    async generateAuthenticationChallenge(email) {
        if (!email) {
            throw new common_1.BadRequestException('يرجى توفير البريد الإلكتروني');
        }
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !user.passkeyId) {
            throw new common_1.NotFoundException('المستخدم غير موجود. يرجى التسجيل أولاً.');
        }
        const challenge = this.generateChallenge();
        const challengeKey = `auth:challenge:auth:${email}`;
        await this.redis.set(challengeKey, JSON.stringify({ challenge, type: 'authentication' }), this.challengeTtlMs);
        const options = {
            challenge,
            rpId: this.rpId,
            allowCredentials: [
                {
                    type: 'public-key',
                    id: user.passkeyId,
                    transports: ['internal'],
                },
            ],
            userVerification: 'required',
            timeout: 60000,
        };
        return options;
    }
    async verifyRegistration(email, credential, userAgent, ipAddress) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.NotFoundException('المستخدم غير موجود');
        }
        const challengeKey = `auth:challenge:reg:${email}`;
        const storedChallenge = await this.redis.get(challengeKey);
        if (!storedChallenge) {
            throw new common_1.BadRequestException('انتهت صلاحية التحدي أو غير موجود');
        }
        await this.redis.del(challengeKey);
        const credentialId = credential.id;
        await this.prisma.user.update({
            where: { email },
            data: {
                passkeyId: credentialId,
                passkeyPub: JSON.stringify(credential.response),
            },
        });
        const session = await this.createSession(user.id);
        await this.auditService.log({
            userId: user.id,
            action: 'AUTH_REGISTER',
            resource: 'passkey',
            details: JSON.stringify({ credentialId }),
            userAgent,
            ipAddress,
        });
        this.logger.log(`✅ User registered: ${email}`);
        return {
            success: true,
            sessionToken: session.token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                tier: user.tier,
            },
        };
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
        await this.redis.del(challengeKey);
        const session = await this.createSession(user.id);
        await this.auditService.log({
            userId: user.id,
            action: 'AUTH_LOGIN',
            resource: 'passkey',
            userAgent,
            ipAddress,
        });
        this.logger.log(`✅ User logged in: ${email}`);
        return {
            success: true,
            sessionToken: session.token,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                tier: user.tier,
            },
        };
    }
    async validateSession(token) {
        const session = await this.prisma.session.findUnique({
            where: { token },
            include: { user: true },
        });
        if (!session || session.expiresAt < new Date()) {
            if (session) {
                await this.prisma.session.delete({ where: { id: session.id } });
            }
            return { authenticated: false };
        }
        return {
            authenticated: true,
            user: {
                id: session.user.id,
                email: session.user.email,
                displayName: session.user.displayName,
                tier: session.user.tier,
            },
        };
    }
    async destroySession(token) {
        const session = await this.prisma.session.findUnique({
            where: { token },
        });
        if (session) {
            await this.prisma.session.delete({ where: { id: session.id } });
            await this.auditService.log({
                userId: session.userId,
                action: 'AUTH_LOGOUT',
                resource: 'session',
            });
        }
        return { success: true };
    }
    generateChallenge() {
        return crypto.randomBytes(32).toString('base64url');
    }
    getUserIdBuffer(email) {
        return crypto.createHash('sha256').update(email).digest('base64url');
    }
    async createSession(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + this.sessionTtlMs);
        return this.prisma.session.create({
            data: {
                userId,
                token,
                expiresAt,
            },
        });
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