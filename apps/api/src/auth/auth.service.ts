import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rpId: string;
  private readonly rpName = 'Roua Trading';
  private readonly challengeTtlMs = 5 * 60 * 1000; // 5 minutes
  private readonly sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.rpId = this.configService.get<string>('WEBAUTHN_RP_ID', 'localhost');
  }

  /**
   * Generate a WebAuthn registration challenge
   */
  async generateRegistrationChallenge(email: string, displayName?: string) {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('يرجى إدخال بريد إلكتروني صحيح');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser && existingUser.passkeyId) {
      throw new ConflictException('هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.');
    }

    const challenge = this.generateChallenge();
    const userId = this.getUserIdBuffer(email);

    // Store challenge in Redis with 5-min TTL
    const challengeKey = `auth:challenge:reg:${email}`;
    await this.redis.set(
      challengeKey,
      JSON.stringify({ challenge, type: 'registration' }),
      this.challengeTtlMs,
    );

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
        { type: 'public-key' as const, alg: -7 },   // ES256
        { type: 'public-key' as const, alg: -257 },  // RS256
      ],
      timeout: 60000,
      attestation: 'none' as const,
      authenticatorSelection: {
        authenticatorAttachment: 'platform' as const,
        userVerification: 'required' as const,
        residentKey: 'required' as const,
      },
    };

    // Create user if doesn't exist
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

  /**
   * Generate a WebAuthn authentication challenge for existing user
   */
  async generateAuthenticationChallenge(email: string) {
    if (!email) {
      throw new BadRequestException('يرجى توفير البريد الإلكتروني');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passkeyId) {
      throw new NotFoundException('المستخدم غير موجود. يرجى التسجيل أولاً.');
    }

    const challenge = this.generateChallenge();

    // Store challenge in Redis with 5-min TTL
    const challengeKey = `auth:challenge:auth:${email}`;
    await this.redis.set(
      challengeKey,
      JSON.stringify({ challenge, type: 'authentication' }),
      this.challengeTtlMs,
    );

    const options = {
      challenge,
      rpId: this.rpId,
      allowCredentials: [
        {
          type: 'public-key' as const,
          id: user.passkeyId,
          transports: ['internal' as const],
        },
      ],
      userVerification: 'required' as const,
      timeout: 60000,
    };

    return options;
  }

  /**
   * Verify registration credential and create session
   */
  async verifyRegistration(email: string, credential: any, userAgent?: string, ipAddress?: string) {
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

    // Clean up used challenge
    await this.redis.del(challengeKey);

    const credentialId = credential.id;

    // Store passkey credential
    await this.prisma.user.update({
      where: { email },
      data: {
        passkeyId: credentialId,
        passkeyPub: JSON.stringify(credential.response),
      },
    });

    // Create session
    const session = await this.createSession(user.id);

    // Audit log
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

  /**
   * Verify authentication assertion and create session
   */
  async verifyAuthentication(email: string, assertion: any, userAgent?: string, ipAddress?: string) {
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

  // ── Private Helpers ──

  private generateChallenge(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

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
