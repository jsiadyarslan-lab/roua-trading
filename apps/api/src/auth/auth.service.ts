import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;
  private readonly challengeTtlMs = 5 * 60 * 1000; // 5 minutes
  private readonly sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    // WebAuthn Relying Party configuration from environment variables
    // Supports both RP_ID (new standard) and WEBAUTHN_RP_ID (legacy) for backwards compatibility
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

  /**
   * Generate a WebAuthn registration challenge using @simplewebauthn/server
   */
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

    // Get existing credentials for excludeCredentials
    const existingCredentials: string[] = [];
    if (existingUser?.passkeyId) {
      existingCredentials.push(existingUser.passkeyId);
    }

    try {
      // Use @simplewebauthn/server for proper WebAuthn option generation
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

      // Store challenge in Redis with 5-min TTL
      const challengeKey = `auth:challenge:reg:${email}`;
      await this.redis.set(
        challengeKey,
        JSON.stringify({ challenge: options.challenge, type: 'registration' }),
        this.challengeTtlMs,
      );

      // Create user if doesn't exist
      if (!existingUser) {
        await this.prisma.user.create({
          data: {
            email,
            displayName: displayName || email.split('@')[0],
          },
        });
      }

      this.logger.log(`Registration challenge generated for ${email} (rpId: ${this.rpId})`);

      return options;
    } catch (error) {
      this.logger.error(`Failed to generate registration challenge for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في إنشاء التحدي. تأكد من إعداد RP_ID و RP_NAME و ORIGIN بشكل صحيح.');
    }
  }

  /**
   * Generate a WebAuthn authentication challenge for existing user using @simplewebauthn/server
   */
  async generateAuthenticationChallenge(email: string) {
    if (!email) {
      throw new BadRequestException('يرجى توفير البريد الإلكتروني');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passkeyId) {
      throw new NotFoundException('المستخدم غير موجود. يرجى التسجيل أولاً.');
    }

    try {
      // Use @simplewebauthn/server for proper authentication options
      const options = await webauthnGenerateAuthentication({
        rpID: this.rpId,
        allowCredentials: [
          {
            id: user.passkeyId,
            transports: ['internal' as const],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      });

      // Store challenge in Redis with 5-min TTL
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

  /**
   * Verify registration credential using @simplewebauthn/server and create session
   */
  async verifyRegistration(email: string, regResponse: RegistrationResponseJSON, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // Verify challenge exists in Redis
    const challengeKey = `auth:challenge:reg:${email}`;
    const storedChallenge = await this.redis.get(challengeKey);

    if (!storedChallenge) {
      throw new BadRequestException('انتهت صلاحية التحدي أو غير موجود');
    }

    const challengeData = JSON.parse(storedChallenge as string);

    try {
      // Use @simplewebauthn/server for proper cryptographic verification
      const verification = await webauthnVerifyRegistration({
        response: regResponse,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        this.logger.warn(`Registration verification failed for ${email}`);
        throw new BadRequestException('فشل التحقق من بيانات الاعتماد');
      }

      // Clean up used challenge
      await this.redis.del(challengeKey);

      const { credential } = verification.registrationInfo;

      // Store passkey credential
      await this.prisma.user.update({
        where: { email },
        data: {
          passkeyId: credential.id,
          passkeyPub: Buffer.from(credential.publicKey).toString('base64'),
        },
      });

      // Create session
      const session = await this.createSession(user.id);

      // Audit log
      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_REGISTER',
        resource: 'passkey',
        details: JSON.stringify({ credentialId: credential.id }),
        userAgent,
        ipAddress,
      });

      this.logger.log(`User registered: ${email}`);

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
    } catch (error) {
      // Clean up challenge on failure too
      await this.redis.del(challengeKey);
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Registration verification error for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في التحقق من التسجيل. تأكد من إعداد ORIGIN و RP_ID بشكل صحيح.');
    }
  }

  /**
   * Verify authentication assertion using @simplewebauthn/server and create session
   */
  async verifyAuthentication(email: string, assertion: AuthenticationResponseJSON, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (!user.passkeyId) {
      throw new BadRequestException('لم يتم تسجيل Passkey لهذا الحساب');
    }

    // Verify challenge exists in Redis
    const challengeKey = `auth:challenge:auth:${email}`;
    const storedChallenge = await this.redis.get(challengeKey);

    if (!storedChallenge) {
      throw new BadRequestException('انتهت صلاحية التحدي أو غير موجود');
    }

    const challengeData = JSON.parse(storedChallenge as string);

    try {
      // Use @simplewebauthn/server for proper cryptographic verification
      const verification = await webauthnVerifyAuthentication({
        response: assertion,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: {
          id: user.passkeyId,
          publicKey: user.passkeyPub
            ? Uint8Array.from(atob(user.passkeyPub), (c) => c.charCodeAt(0))
            : new Uint8Array(),
          counter: 0,
          transports: ['internal' as const],
        },
      });

      if (!verification.verified) {
        this.logger.warn(`Authentication verification failed for ${email}`);
        throw new BadRequestException('فشل التحقق من المصادقة');
      }

      // Clean up used challenge
      await this.redis.del(challengeKey);

      // Create session
      const session = await this.createSession(user.id);

      // Audit log
      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_LOGIN',
        resource: 'passkey',
        userAgent,
        ipAddress,
      });

      this.logger.log(`User logged in: ${email}`);

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
    } catch (error) {
      // Clean up challenge on failure too
      await this.redis.del(challengeKey);
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Authentication verification error for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('حدث خطأ في التحقق من المصادقة. تأكد من إعداد ORIGIN و RP_ID بشكل صحيح.');
    }
  }

  /**
   * Validate an existing session
   */
  async validateSession(token: string) {
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

  /**
   * Destroy a session (logout)
   */
  async destroySession(token: string) {
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

  /**
   * Create a guest session — used by POST /api/auth/guest
   * as a fallback when Next.js can't create sessions directly.
   *
   * This finds or creates the guest@roua.auto user and creates
   * a new session for them. No authentication required.
   */
  async createGuestSession() {
    const GUEST_EMAIL = 'guest@roua.auto';

    let guestUser = await this.prisma.user.findUnique({ where: { email: GUEST_EMAIL } });

    if (!guestUser) {
      try {
        guestUser = await this.prisma.user.create({
          data: {
            email: GUEST_EMAIL,
            displayName: 'ضيف',
            tier: 'FREE',
          },
        });
        this.logger.log(`Guest user created: ${GUEST_EMAIL}`);
      } catch (createErr: any) {
        // Concurrent creation — find the existing one
        guestUser = await this.prisma.user.findUnique({ where: { email: GUEST_EMAIL } });
      }
    }

    if (!guestUser) {
      throw new BadRequestException('فشل في إنشاء مستخدم ضيف');
    }

    const session = await this.createSession(guestUser.id);

    this.logger.log(`Guest session created for: ${GUEST_EMAIL}`);

    return {
      sessionToken: session.token,
      user: {
        id: guestUser.id,
        email: guestUser.email,
        displayName: guestUser.displayName,
        tier: guestUser.tier,
      },
    };
  }

  // ── Private Helpers ──

  private getUserIdBuffer(email: string): string {
    return crypto.createHash('sha256').update(email).digest('base64url');
  }

  private async createSession(userId: string) {
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
}
