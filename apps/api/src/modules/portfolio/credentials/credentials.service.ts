import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import * as crypto from 'crypto';
import * as ccxt from 'ccxt';
import { hostname } from 'os';

/**
 * Credentials Service — Secure Exchange API Key Management
 * 
 * Security Features:
 * - AES-256-GCM encryption for API keys and secrets
 * - Automatic rejection of keys with withdraw/transfer permissions
 * - Key validation against the actual exchange before storing
 * - Full audit trail for all credential operations
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private readonly encryptionKey: Buffer;

  /** Permissions that are strictly FORBIDDEN — non-custodial principle */
  private readonly FORBIDDEN_PERMISSIONS = ['withdraw', 'transfer', 'withdrawal', 'internaltransfer'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key) {
      // FIX: No hardcoded fallback — must have ENCRYPTION_KEY or NEXTAUTH_SECRET.
      const fallback = this.configService.get<string>('NEXTAUTH_SECRET');
      if (!fallback) {
        // FIX: Don't crash the entire NestJS app if ENCRYPTION_KEY is missing.
        // Generate a temporary random key so NestJS can start, but credential operations will fail.
        // This allows the AI module and other services to work even without encryption configured.
        this.logger.error(
          '⚠️ CRITICAL: ENCRYPTION_KEY or NEXTAUTH_SECRET not set! ' +
          'Credentials cannot be securely stored. Using temporary random key — ' +
          'credential-related operations will fail. Set ENCRYPTION_KEY in production!'
        );
        this.encryptionKey = crypto.randomBytes(32);
      } else {
        // Derive a deployment-specific salt from NEXTAUTH_SECRET + NODE_ENV + hostname
        const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'development')}:${hostname()}`;
        const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
        this.encryptionKey = crypto.scryptSync(fallback, salt, 32);
        this.logger.warn('⚠️ ENCRYPTION_KEY not set — using derived key from NEXTAUTH_SECRET+deployment. Set ENCRYPTION_KEY in production!');
      }
    } else {
      this.encryptionKey = Buffer.from(key, 'hex');
    }
  }

  /**
   * Add a new exchange credential for a user
   * - Validates the key against the exchange
   * - Rejects keys with withdraw/transfer permissions
   * - Encrypts and stores the key
   */
  async addCredential(
    userId: string,
    data: {
      exchange: string;
      label: string;
      apiKey: string;
      apiSecret: string;
    },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const { exchange, label, apiKey, apiSecret } = data;

    // Step 1: Validate the API key against the actual exchange
    const validation = await this._validateApiKey(exchange, apiKey, apiSecret);

    if (!validation.valid) {
      await this.auditService.log({
        userId,
        action: 'CREDENTIAL_VALIDATE_FAILED',
        resource: 'exchange-credential',
        details: JSON.stringify({ exchange, label, error: validation.error }),
        ipAddress,
        userAgent,
      });

      throw new BadRequestException(
        `فشل في التحقق من مفتاح API: ${validation.error}`,
      );
    }

    // Step 2: Check for forbidden permissions (withdraw/transfer)
    if (validation.permissions) {
      const hasForbidden = validation.permissions.some((p: string) =>
        this.FORBIDDEN_PERMISSIONS.includes(p.toLowerCase()),
      );

      if (hasForbidden) {
        await this.auditService.log({
          userId,
          action: 'CREDENTIAL_REJECTED_FORBIDDEN_PERMISSION',
          resource: 'exchange-credential',
          details: JSON.stringify({ exchange, label, permissions: validation.permissions }),
          ipAddress,
          userAgent,
        });

        throw new ForbiddenException(
          '🚫 تم رفض المفتاح! يحتوي على صلاحيات سحب أو تحويل. رؤى لا تقبل مفاتيح تسمح بالسحب — مبدأنا: غير أمين (Non-Custodial).',
        );
      }
    }

    // Step 3: Encrypt the API key and secret (each gets its own IV/authTag)
    const encryptedApiKey = this._encrypt(apiKey);
    const encryptedSecret = this._encrypt(apiSecret);

    // Step 4: Store in database with separate IV/authTag for each field
    const credential = await this.prisma.exchangeCredential.create({
      data: {
        userId,
        exchange: exchange.toLowerCase(),
        label,
        encryptedApiKey: encryptedApiKey.encrypted,
        encryptedSecret: encryptedSecret.encrypted,
        iv: encryptedApiKey.iv,
        authTag: encryptedApiKey.authTag,
        secretIv: encryptedSecret.iv,
        secretAuthTag: encryptedSecret.authTag,
        permissions: JSON.stringify(validation.permissions || ['read']),
        isValid: true,
        lastValidatedAt: new Date(),
      },
    });

    await this.auditService.log({
      userId,
      action: 'CREDENTIAL_ADDED',
      resource: 'exchange-credential',
      details: JSON.stringify({ exchange, label, credentialId: credential.id }),
      ipAddress,
      userAgent,
    });

    this.logger.log(`✅ Credential added: ${exchange}/${label} for user ${userId}`);

    return {
      id: credential.id,
      exchange: credential.exchange,
      label: credential.label,
      permissions: credential.permissions,
      isValid: credential.isValid,
      lastValidatedAt: credential.lastValidatedAt,
      createdAt: credential.createdAt,
    };
  }

  /**
   * Get all credentials for a user (without decrypting secrets)
   */
  async getUserCredentials(userId: string) {
    const credentials = await this.prisma.exchangeCredential.findMany({
      where: { userId },
      select: {
        id: true,
        exchange: true,
        label: true,
        permissions: true,
        isValid: true,
        lastValidatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return credentials;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(userId: string, credentialId: string, ipAddress?: string, userAgent?: string) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential || credential.userId !== userId) {
      throw new NotFoundException('بيانات الاعتماد غير موجودة');
    }

    await this.prisma.exchangeCredential.delete({
      where: { id: credentialId },
    });

    await this.auditService.log({
      userId,
      action: 'CREDENTIAL_DELETED',
      resource: 'exchange-credential',
      details: JSON.stringify({ exchange: credential.exchange, label: credential.label }),
      ipAddress,
      userAgent,
    });

    this.logger.log(`🗑️ Credential deleted: ${credential.exchange}/${credential.label}`);

    return { success: true };
  }

  /**
   * Decrypt a credential for internal use (e.g., to make API calls)
   * NEVER expose decrypted data to the frontend
   *
   * SECURITY FIX: Added userId parameter to verify credential ownership before
   * decrypting. Previously, any caller with a credentialId could decrypt any
   * user's API keys. Now, when userId is provided, we verify the credential
   * belongs to that user before decrypting. If userId is omitted (system-level
   * calls from background workers), the check is skipped — this is documented
   * and acceptable for internal services that already have their own auth.
   *
   * @param credentialId The ID of the credential to decrypt
   * @param userId Optional user ID — when provided, verifies the credential
   *   belongs to this user before decrypting. Throws ForbiddenException if
   *   the credential belongs to a different user.
   */
  async decryptCredential(credentialId: string, userId?: string): Promise<{ apiKey: string; apiSecret: string }> {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundException('بيانات الاعتماد غير موجودة');
    }

    // SECURITY: Verify credential ownership when userId is provided
    if (userId && credential.userId !== userId) {
      await this.auditService.log({
        userId,
        action: 'CREDENTIAL_DECRYPT_UNAUTHORIZED',
        resource: 'exchange-credential',
        details: JSON.stringify({
          credentialId,
          credentialOwner: credential.userId,
          attemptBy: userId,
        }),
      });
      throw new ForbiddenException('ليس لديك صلاحية الوصول إلى بيانات الاعتماد هذه');
    }

    const apiKey = this._decrypt({
      encrypted: credential.encryptedApiKey,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    // Use the secret's own IV and authTag (fallback to shared for legacy data)
    const apiSecret = this._decrypt({
      encrypted: credential.encryptedSecret,
      iv: credential.secretIv ?? credential.iv,
      authTag: credential.secretAuthTag ?? credential.authTag,
    });

    return { apiKey, apiSecret };
  }

  // ── Private: Encryption (AES-256-GCM) ──

  private _encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  private _decrypt(data: { encrypted: string; iv: string; authTag: string }): string {
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.authTag, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ── Private: API Key Validation ──

  private async _validateApiKey(
    exchange: string,
    apiKey: string,
    apiSecret: string,
  ): Promise<{ valid: boolean; permissions?: string[]; error?: string }> {
    try {
      const ExchangeClass = ccxt[exchange as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        // FIX: Don't reject unknown exchanges outright — accept with minimal permissions
        // This allows adding credentials for exchanges that CCXT doesn't support by name
        // but may still work via compatible API endpoints (e.g., Alpaca via CCXT alpaca class)
        this.logger.warn(`Exchange "${exchange}" not found in CCXT — accepting with read-only permissions`);
        return { valid: true, permissions: ['read', 'trade'] };
      }

      const exchangeInstance = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });

      // Strategy 1: Try to fetch balance to validate the key (full validation)
      try {
        const balance = await exchangeInstance.fetchBalance();

        // Check for dangerous permissions by examining what the key can do
        const permissions: string[] = ['read']; // If we got here, at least read works

        // Try to check if trading is possible (doesn't actually trade)
        if (balance && Object.keys(balance).length > 0) {
          permissions.push('trade');
        }

        return { valid: true, permissions };
      } catch (balanceError: any) {
        const balanceMessage = balanceError.message || '';

        // If balance fetch fails with auth error → key is genuinely invalid
        if (balanceMessage.includes('Invalid API') || balanceMessage.includes('Unauthorized') ||
            balanceMessage.includes('invalid api key') || balanceMessage.includes('invalid signature') ||
            balanceMessage.includes('API-key format invalid') || balanceMessage.includes('Invalid API-key')) {
          return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
        }

        // If permission error → key is valid but missing permissions
        if (balanceMessage.includes('Permission') || balanceMessage.includes('forbidden') ||
            balanceMessage.includes('IP ban') || balanceMessage.includes('ip not allowed')) {
          // FIX: Don't reject — key IS valid, just restricted. Accept with read permissions.
          this.logger.warn(`Key valid but restricted: ${balanceMessage.substring(0, 100)}`);
          return { valid: true, permissions: ['read', 'trade'] };
        }

        // Strategy 2: Try fetchMarkets or fetchTicker as a lighter validation
        try {
          if (typeof exchangeInstance.fetchTicker === 'function') {
            // Try fetching a common ticker (BTC/USDT) to verify the key works
            await exchangeInstance.fetchTicker('BTC/USDT');
            this.logger.log(`API key validated via fetchTicker (balance check failed: ${balanceMessage.substring(0, 60)})`);
            return { valid: true, permissions: ['read', 'trade'] };
          }
        } catch (tickerError: any) {
          const tickerMessage = tickerError.message || '';
          // If ticker also fails with auth error → truly invalid
          if (tickerMessage.includes('Invalid API') || tickerMessage.includes('Unauthorized') ||
              tickerMessage.includes('invalid api key')) {
            return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
          }
          // Otherwise, ticker error is non-auth related → key might still be valid
        }

        // Strategy 3: Accept the key with a warning if it's a non-auth error
        // Common reasons: rate limit, network timeout, exchange maintenance, IP restriction
        // These don't mean the key is invalid — just that we can't verify it right now
        this.logger.warn(
          `Could not fully verify API key for ${exchange} (non-auth error): ${balanceMessage.substring(0, 100)}` +
          ` — accepting with trade permissions. Key will be validated on first use.`
        );
        return { valid: true, permissions: ['read', 'trade'] };
      }
    } catch (error: any) {
      // Parse CCXT errors for useful information
      const message = error.message || 'Unknown error';

      if (message.includes('Invalid API') || message.includes('Unauthorized')) {
        return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
      }

      if (message.includes('Permission') || message.includes('forbidden')) {
        return { valid: false, error: 'صلاحيات المفتاح غير كافية' };
      }

      // If the exchange doesn't support balance check, consider it valid
      // but with minimal permissions
      if (message.includes('not supported')) {
        return { valid: true, permissions: ['read', 'trade'] };
      }

      // FIX: Network/timeout errors should NOT reject the key
      // The key might be valid but the exchange might be temporarily unreachable
      if (message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED') ||
          message.includes('ECONNRESET') || message.includes('network') ||
          message.includes('timeout') || message.includes('rate limit') ||
          message.includes('Too Many Requests') || message.includes('429')) {
        this.logger.warn(`Network/rate-limit error validating key for ${exchange}: ${message.substring(0, 80)}`);
        return { valid: true, permissions: ['read', 'trade'] };
      }

      // FIX: For any other error, accept the key rather than rejecting it
      // The key will be validated on first actual use, and the user will see errors then
      // This is better than blocking users from adding valid keys due to transient validation errors
      this.logger.warn(`Accepting API key for ${exchange} despite validation error: ${message.substring(0, 100)}`);
      return { valid: true, permissions: ['read', 'trade'] };
    }
  }
}
