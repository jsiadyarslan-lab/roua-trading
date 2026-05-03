import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import {
  generateRegistrationOptions as webauthnGenerateRegistration,
  generateAuthenticationOptions as webauthnGenerateAuthentication,
  verifyRegistrationResponse as webauthnVerifyRegistration,
  verifyAuthenticationResponse as webauthnVerifyAuthentication,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import * as crypto from 'crypto';

interface DeviceInfo {
  browser?: string;
  os?: string;
  device?: string;
  type?: 'mobile' | 'desktop' | 'tablet' | 'unknown';
}

interface SessionCreateOptions {
  userAgent?: string;
  ipAddress?: string;
  deviceInfo?: DeviceInfo;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;
  private readonly challengeTtlMs = 5 * 60 * 1000; // 5 minutes
  private readonly sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours (access token TTL)
  private readonly refreshTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days (refresh token TTL)
  private readonly sessionRedisPrefix = 'session:';
  private readonly sessionRedisTtlMs = 15 * 60 * 1000; // 15 minutes Redis cache

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.rpId =
      this.configService.get<string>('RP_ID') ||
      this.configService.get<string>('WEBAUTHN_RP_ID') ||
      'localhost';

    this.rpName =
      this.configService.get<string>('RP_NAME') ||
      'Roua Trading';

    this.origin =
      this.configService.get<string>('ORIGIN') ||
      (this.rpId === 'localhost' ? 'http://localhost:3000' : `https://${this.rpId}`);

    this.logger.log(`WebAuthn configured — rpId: ${this.rpId}, rpName: ${this.rpName}, origin: ${this.origin}`);
  }

  // ── WebAuthn Registration ──

  async generateRegistrationChallenge(email: string, displayName?: string) {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('يرجى إدخال بريد إلكتروني صحيح');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser && existingUser.passkeyId) {
      throw new ConflictException('هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.');
    }

    const userId = this.getUserIdBuffer(email);
    const userIdBuffer = Uint8Array.from(atob(userId), (c) => c.charCodeAt(0));

    const existingCredentials: string[] = [];
    if (existingUser?.passkeyId) {
      existingCredentials.push(existingUser.passkeyId);
    }

    try {
      const options = await webauthnGenerateRegistration({
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
          transports: ['internal' as const],
        })),
        timeout: 60000,
      });

      const challengeKey = `auth:challenge:reg:${email}`;
      await this.redis.set(
        challengeKey,
        JSON.stringify({ challenge: options.challenge, type: 'registration' }),
        this.challengeTtlMs,
      );

      if (!existingUser) {
        await this.prisma.user.create({
          data: { email, displayName: displayName || email.split('@')[0] },
        });
      }

      this.logger.log(`Registration challenge generated for ${email} (rpId: ${this.rpId})`);
      return options;
    } catch (error) {
      this.logger.error(`Failed to generate registration challenge for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في إنشاء التحدي. تأكد من إعداد RP_ID و RP_NAME و ORIGIN بشكل صحيح.');
    }
  }

  // ── WebAuthn Authentication ──

  async generateAuthenticationChallenge(email: string) {
    if (!email) {
      throw new BadRequestException('يرجى توفير البريد الإلكتروني');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passkeyId) {
      throw new NotFoundException('المستخدم غير موجود. يرجى التسجيل أولاً.');
    }

    try {
      const options = await webauthnGenerateAuthentication({
        rpID: this.rpId,
        allowCredentials: [{ id: user.passkeyId, transports: ['internal' as const] }],
        userVerification: 'required',
        timeout: 60000,
      });

      const challengeKey = `auth:challenge:auth:${email}`;
      await this.redis.set(
        challengeKey,
        JSON.stringify({ challenge: options.challenge, type: 'authentication' }),
        this.challengeTtlMs,
      );

      this.logger.log(`Authentication challenge generated for ${email} (rpId: ${this.rpId})`);
      return options;
    } catch (error) {
      this.logger.error(`Failed to generate authentication challenge for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في إنشاء تحدي المصادقة. تأكد من إعداد RP_ID بشكل صحيح.');
    }
  }

  // ── WebAuthn Verify ──

  async verifyRegistration(email: string, regResponse: RegistrationResponseJSON, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) { throw new NotFoundException('المستخدم غير موجود'); }

    const challengeKey = `auth:challenge:reg:${email}`;
    const storedChallenge = await this.redis.get(challengeKey);
    if (!storedChallenge) { throw new BadRequestException('انتهت صلاحية التحدي أو غير موجود'); }

    const challengeData = JSON.parse(storedChallenge as string);

    try {
      const verification = await webauthnVerifyRegistration({
        response: regResponse,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new BadRequestException('فشل التحقق من بيانات الاعتماد');
      }

      await this.redis.del(challengeKey);
      const { credential } = verification.registrationInfo;

      await this.prisma.user.update({
        where: { email },
        data: {
          passkeyId: credential.id,
          passkeyPub: Buffer.from(credential.publicKey).toString('base64'),
        },
      });

      const deviceInfo = this.parseUserAgent(userAgent);
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
    } catch (error) {
      await this.redis.del(challengeKey);
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Registration verification error for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في التحقق من التسجيل. تأكد من إعداد ORIGIN و RP_ID بشكل صحيح.');
    }
  }

  async verifyAuthentication(email: string, assertion: AuthenticationResponseJSON, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) { throw new NotFoundException('المستخدم غير موجود'); }
    if (!user.passkeyId) { throw new BadRequestException('لم يتم تسجيل Passkey لهذا الحساب'); }

    const challengeKey = `auth:challenge:auth:${email}`;
    const storedChallenge = await this.redis.get(challengeKey);
    if (!storedChallenge) { throw new BadRequestException('انتهت صلاحية التحدي أو غير موجود'); }

    const challengeData = JSON.parse(storedChallenge as string);

    try {
      const verification = await webauthnVerifyAuthentication({
        response: assertion,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: {
          id: user.passkeyId,
          publicKey: user.passkeyPub ? Uint8Array.from(atob(user.passkeyPub), (c) => c.charCodeAt(0)) : new Uint8Array(),
          counter: 0,
          transports: ['internal' as const],
        },
      });

      if (!verification.verified) { throw new BadRequestException('فشل التحقق من المصادقة'); }

      await this.redis.del(challengeKey);

      const deviceInfo = this.parseUserAgent(userAgent);
      const session = await this.createSession(user.id, { userAgent, ipAddress, deviceInfo });

      await this.auditService.log({
        userId: user.id, action: 'AUTH_LOGIN', resource: 'passkey', userAgent, ipAddress,
      });

      this.logger.log(`User logged in: ${email}`);
      return {
        success: true,
        sessionToken: session.token,
        refreshToken: session.refreshToken,
        user: { id: user.id, email: user.email, displayName: user.displayName, tier: user.tier },
      };
    } catch (error) {
      await this.redis.del(challengeKey);
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Authentication verification error for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في التحقق من المصادقة. تأكد من إعداد ORIGIN و RP_ID بشكل صحيح.');
    }
  }

  // ── Session Validation (with Redis caching) ──

  async validateSession(token: string) {
    // Try Redis cache first for performance
    const cacheKey = `${this.sessionRedisPrefix}${token}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.authenticated && parsed.user) {
          return parsed;
        }
      }
    } catch {
      // Cache miss — continue to DB
    }

    // DB lookup
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      if (session) {
        // Clean up expired or inactive session
        await this.prisma.session.update({
          where: { id: session.id },
          data: { isActive: false },
        }).catch(() => {});
        // Remove from Redis cache
        await this.redis.del(cacheKey).catch(() => {});
      }
      return { authenticated: false };
    }

    // Sliding session: if less than half the TTL remains, extend it
    const halfTtl = this.sessionTtlMs / 2;
    const remainingMs = session.expiresAt.getTime() - Date.now();
    if (remainingMs < halfTtl) {
      const newExpiresAt = new Date(Date.now() + this.sessionTtlMs);
      await this.prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: newExpiresAt },
      }).catch(() => {});
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

    // Cache in Redis for fast subsequent lookups
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), this.sessionRedisTtlMs);
    } catch {
      // Non-critical — session still works without cache
    }

    return result;
  }

  // ── Refresh Token Flow ──

  /**
   * Refresh a session using a refresh token.
   * Validates the refresh token, creates a new session, and invalidates the old one.
   * This enables cross-device session persistence.
   */
  async refreshSession(refreshToken: string, userAgent?: string, ipAddress?: string) {
    if (!refreshToken) {
      throw new BadRequestException('رمز التحديث مطلوب');
    }

    // Look up session by refresh token
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || !session.isActive) {
      throw new BadRequestException('رمز التحديث غير صالح أو منتهي الصلاحية');
    }

    // Check if refresh token has expired (use a longer TTL for refresh tokens)
    const refreshExpiryMs = session.createdAt.getTime() + this.refreshTtlMs;
    if (Date.now() > refreshExpiryMs) {
      // Refresh token expired — deactivate session
      await this.prisma.session.update({
        where: { id: session.id },
        data: { isActive: false },
      }).catch(() => {});
      throw new BadRequestException('انتهت صلاحية رمز التحديث. يرجى تسجيل الدخول مرة أخرى.');
    }

    const isGuest = session.user.email === 'guest@roua.auto' || session.user.email.startsWith('guest-') || session.user.id.startsWith('guest');
    if (isGuest) {
      throw new BadRequestException('لا يمكن تجديد جلسة الضيف');
    }

    // Deactivate old session
    await this.prisma.session.update({
      where: { id: session.id },
      data: { isActive: false },
    });

    // Remove old session from Redis cache
    const oldCacheKey = `${this.sessionRedisPrefix}${session.token}`;
    await this.redis.del(oldCacheKey).catch(() => {});

    // Create new session with same device info
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

  // ── Session Management ──

  /**
   * List all active sessions for a user (for device management UI).
   * Returns session info WITHOUT the actual token values for security.
   */
  async getUserSessions(userId: string) {
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
      // Mask IP for privacy
      maskedIp: s.ipAddress ? this.maskIpAddress(s.ipAddress) : null,
    }));
  }

  /**
   * Revoke a specific session (logout from a specific device).
   * Users can only revoke their own sessions.
   */
  async revokeSession(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('الجلسة غير موجودة');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('ليس لديك صلاحية لإنهاء هذه الجلسة');
    }

    // Deactivate the session
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    // Remove from Redis cache
    const cacheKey = `${this.sessionRedisPrefix}${session.token}`;
    await this.redis.del(cacheKey).catch(() => {});

    await this.auditService.log({
      userId,
      action: 'AUTH_SESSION_REVOKE',
      resource: 'session',
      details: JSON.stringify({ revokedSessionId: sessionId }),
    });

    this.logger.log(`Session revoked: ${sessionId} by user: ${userId}`);
    return { success: true };
  }

  /**
   * Revoke all sessions except the current one (logout from all other devices).
   */
  async revokeAllOtherSessions(userId: string, currentSessionToken: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, isActive: true, token: { not: currentSessionToken } },
      select: { id: true, token: true },
    });

    // Deactivate all other sessions
    await this.prisma.session.updateMany({
      where: { userId, isActive: true, token: { not: currentSessionToken } },
      data: { isActive: false },
    });

    // Remove all from Redis cache
    for (const s of sessions) {
      const cacheKey = `${this.sessionRedisPrefix}${s.token}`;
      await this.redis.del(cacheKey).catch(() => {});
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

  // ── Destroy Session (Logout) ──

  async destroySession(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
    });

    if (session) {
      // Mark as inactive instead of deleting (audit trail)
      await this.prisma.session.update({
        where: { id: session.id },
        data: { isActive: false },
      });

      // Remove from Redis cache
      const cacheKey = `${this.sessionRedisPrefix}${token}`;
      await this.redis.del(cacheKey).catch(() => {});

      await this.auditService.log({
        userId: session.userId,
        action: 'AUTH_LOGOUT',
        resource: 'session',
      });
    }

    return { success: true };
  }

  // ── Guest Session ──

  /**
   * Create a guest session with a UNIQUE guest user per session.
   *
   * DATA ISOLATION FIX: Previously all guest sessions shared a single
   * guest@roua.auto account, meaning different users could see each
   * other's data. Now each guest session gets its own unique user with
   * a UUID-based email (guest-{uuid}@roua.auto).
   *
   * The legacy guest@roua.auto account is kept for backward compatibility.
   */
  async createGuestSession() {
    const uuid = crypto.randomUUID().slice(0, 8);
    const guestEmail = `guest-${uuid}@roua.auto`;

    let guestUser;

    try {
      guestUser = await this.prisma.user.create({
        data: { email: guestEmail, displayName: 'ضيف', tier: 'FREE' },
      });
      this.logger.log(`Unique guest user created: ${guestEmail}`);
    } catch (createErr: any) {
      // UUID collision is extremely unlikely, but retry with new UUID
      this.logger.warn(`Failed to create unique guest (${guestEmail}), retrying: ${createErr?.message || createErr}`);
      const uuid2 = crypto.randomUUID().slice(0, 8);
      const retryEmail = `guest-${uuid2}@roua.auto`;
      try {
        guestUser = await this.prisma.user.create({
          data: { email: retryEmail, displayName: 'ضيف', tier: 'FREE' },
        });
        this.logger.log(`Unique guest user created (retry): ${retryEmail}`);
      } catch {
        // Last resort: fall back to legacy shared guest account
        this.logger.warn('Falling back to legacy guest@roua.auto account');
        guestUser = await this.prisma.user.findUnique({ where: { email: 'guest@roua.auto' } });
        if (!guestUser) {
          try {
            guestUser = await this.prisma.user.create({
              data: { email: 'guest@roua.auto', displayName: 'ضيف', tier: 'FREE' },
            });
          } catch {
            guestUser = await this.prisma.user.findUnique({ where: { email: 'guest@roua.auto' } });
          }
        }
      }
    }

    if (!guestUser) {
      throw new BadRequestException('فشل في إنشاء مستخدم ضيف');
    }

    const session = await this.createSession(guestUser.id);

    this.logger.log(`Guest session created for: ${guestUser.email}`);

    return {
      sessionToken: session.token,
      refreshToken: session.refreshToken,
      user: {
        id: guestUser.id,
        email: guestUser.email,
        displayName: guestUser.displayName,
        tier: guestUser.tier,
      },
    };
  }

  // ── Cleanup Expired Sessions ──

  /**
   * Periodic cleanup of expired/inactive sessions.
   * Called by a scheduled task or on-demand.
   */
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

  // ── Private Helpers ──

  private getUserIdBuffer(email: string): string {
    return crypto.createHash('sha256').update(email).digest('base64url');
  }

  /**
   * Create a new session with refresh token and device info.
   */
  private async createSession(userId: string, options?: SessionCreateOptions) {
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

    // Cache the session in Redis
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
    } catch {
      // Non-critical — session works without cache
    }

    return session;
  }

  /**
   * Parse user-agent string into structured device info.
   */
  private parseUserAgent(userAgent?: string): DeviceInfo {
    if (!userAgent) {
      return { type: 'unknown' };
    }

    const ua = userAgent.toLowerCase();

    // Detect device type
    let type: DeviceInfo['type'] = 'desktop';
    if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
      type = 'mobile';
    } else if (/ipad|tablet|kindle|silk/i.test(ua)) {
      type = 'tablet';
    }

    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('edg/')) browser = 'Edge';
    else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
    else if (ua.includes('firefox/')) browser = 'Firefox';
    else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
    else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera';

    // Detect OS
    let os = 'Unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return { browser, os, type, device: type };
  }

  /**
   * Mask IP address for privacy in session listings.
   * 192.168.1.100 → 192.168.1.xxx
   * 2001:db8::1 → 2001:db8::xxx
   */
  private maskIpAddress(ip: string): string {
    if (ip.includes('.')) {
      // IPv4
      const parts = ip.split('.');
      if (parts.length >= 4) {
        parts[3] = 'xxx';
        return parts.join('.');
      }
    }
    if (ip.includes(':')) {
      // IPv6 — mask last segment
      const parts = ip.split(':');
      if (parts.length >= 2) {
        parts[parts.length - 1] = 'xxx';
        return parts.join(':');
      }
    }
    return 'xxx.xxx.xxx.xxx';
  }
}
