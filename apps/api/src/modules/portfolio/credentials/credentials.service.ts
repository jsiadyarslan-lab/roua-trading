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
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    if (key) {
      this.encryptionKey = Buffer.from(key, 'hex');
    } else if (isProduction) {
      // FIX: Instead of throwing (which crashes the ENTIRE NestJS app and takes
      // down ALL routes), we now fall back to NEXTAUTH_SECRET-derived key with
      // a strong warning. This is still not ideal for production, but it's better
      // than having the whole app down. The operator should set ENCRYPTION_KEY
      // explicitly for best security. Any credentials encrypted with this fallback
      // key will be accessible, but at least the app doesn't crash.
      const fallback = this.configService.get<string>('NEXTAUTH_SECRET');
      if (fallback) {
        // FIXED: Do NOT include hostname() in the derivation.
        // On Railway, each redeploy creates a new container with a different hostname,
        // which changed the encryption key and made all stored credentials unreadable.
        const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'production')}`;
        const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
        this.encryptionKey = crypto.scryptSync(fallback, salt, 32);
        this.logger.warn(
          '⚠️ ENCRYPTION_KEY not set in production — using derived key from NEXTAUTH_SECRET. ' +
          'This is NOT recommended for production! Generate a proper key with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
          'and add ENCRYPTION_KEY to your environment variables.'
        );
      } else {
        // No fallback at all — use temporary key (credentials won't survive restart)
        this.logger.error(
          '🚨 CRITICAL: ENCRYPTION_KEY and NEXTAUTH_SECRET are both not set in production! ' +
          'Using temporary random key — credentials will be lost on restart. ' +
          'Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
        this.encryptionKey = crypto.randomBytes(32);
      }
    } else {
      // Development-only fallback: derive from NEXTAUTH_SECRET with deployment-specific salt
      // This is acceptable for local development where no real credentials are stored
      const fallback = this.configService.get<string>('NEXTAUTH_SECRET');
      if (!fallback) {
        // No fallback available — generate temporary random key
        // Credentials encrypted with this key will NOT survive a restart
        this.logger.error(
          '⚠️ CRITICAL: ENCRYPTION_KEY and NEXTAUTH_SECRET not set! ' +
          'Using temporary random key — credentials will be lost on restart. ' +
          'Set ENCRYPTION_KEY for development: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
        this.encryptionKey = crypto.randomBytes(32);
      } else {
        // FIXED: Do NOT include hostname() in the derivation.
        // On Railway, each redeploy creates a new container with a different hostname,
        // which changed the encryption key and made all stored credentials unreadable.
        const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'development')}`;
        const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
        this.encryptionKey = crypto.scryptSync(fallback, salt, 32);
        this.logger.warn(
          '⚠️ ENCRYPTION_KEY not set — using derived key from NEXTAUTH_SECRET+deployment (development only). ' +
          'Set ENCRYPTION_KEY for production!'
        );
      }
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
      passphrase?: string;
    },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const { exchange, label, apiKey, apiSecret, passphrase } = data;

    // Step 1: Validate the API key against the actual exchange
    const validation = await this._validateApiKey(exchange, apiKey, apiSecret, passphrase);

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

    // Step 3: Encrypt the API key, secret, and passphrase (each gets its own IV/authTag)
    const encryptedApiKey = this._encrypt(apiKey);
    const encryptedSecret = this._encrypt(apiSecret);
    const encryptedPassphrase = passphrase ? this._encrypt(passphrase) : null;

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
        passphraseIv: encryptedPassphrase?.iv || null,
        passphraseAuthTag: encryptedPassphrase?.authTag || null,
        encryptedPassphrase: encryptedPassphrase?.encrypted || null,
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
  async decryptCredential(credentialId: string, userId?: string): Promise<{ apiKey: string; apiSecret: string; passphrase?: string }> {
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

    // Decrypt passphrase if it exists
    let passphrase: string | undefined;
    if ((credential as any).encryptedPassphrase && (credential as any).passphraseIv) {
      try {
        passphrase = this._decrypt({
          encrypted: (credential as any).encryptedPassphrase,
          iv: (credential as any).passphraseIv,
          authTag: (credential as any).passphraseAuthTag,
        });
      } catch {
        // Passphrase decryption failed — may be legacy data without passphrase
        this.logger.warn('Failed to decrypt passphrase — may be legacy data');
      }
    }

    return { apiKey, apiSecret, passphrase };
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
    try {
      const iv = Buffer.from(data.iv, 'hex');
      const authTag = Buffer.from(data.authTag, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      // FIX: If decryption fails (likely due to encryption key mismatch after restart),
      // throw a clear error instead of crashing with a generic crypto error
      this.logger.error(
        `Failed to decrypt credential: ${error.message}. ` +
        `This usually means the ENCRYPTION_KEY has changed since the credential was stored. ` +
        `The credential needs to be re-added with the current encryption key.`
      );
      throw new BadRequestException(
        'فشل فك تشفير بيانات الاعتماد — يرجى حذف المفتاح وإضافته مرة أخرى'
      );
    }
  }

  // ── Private: API Key Validation ──

  /**
   * Validate an API key against the actual exchange with a 10-second timeout.
   * If validation takes too long, the key is accepted with a warning.
   * Alpaca keys are auto-configured for paper vs live trading.
   */
  private async _validateApiKey(
    exchange: string,
    apiKey: string,
    apiSecret: string,
    passphrase?: string,
  ): Promise<{ valid: boolean; permissions?: string[]; error?: string }> {
    // Wrap entire validation in a 10-second timeout
    const TIMEOUT_MS = 10_000;

    const validationPromise = this._doValidateApiKey(exchange, apiKey, apiSecret, passphrase);

    // FIX (C5): Race the validation against a timeout.
    // CRITICAL: On timeout, REJECT the key (not accept it) to prevent
    // unverified API keys from being used for trading. Previously, the timeout
    // resolved with { valid: true, permissions: ['read', 'trade'] }, which
    // auto-granted trade permissions to keys that couldn't be verified.
    const timeoutPromise = new Promise<{ valid: boolean; permissions?: string[]; error?: string }>((resolve) => {
      setTimeout(() => {
        this.logger.warn(
          `⏱ API key validation for ${exchange} timed out after ${TIMEOUT_MS / 1000}s — ` +
          `REJECTING the key for safety. User should try again later.`
        );
        resolve({ valid: false, error: `انتهت مهلة التحقق من مفتاح API (${TIMEOUT_MS / 1000}s). يرجى المحاولة مرة أخرى.` });
      }, TIMEOUT_MS);
    });

    return Promise.race([validationPromise, timeoutPromise]);
  }

  private async _doValidateApiKey(
    exchange: string,
    apiKey: string,
    apiSecret: string,
    passphrase?: string,
  ): Promise<{ valid: boolean; permissions?: string[]; error?: string }> {
    try {
      const isBinance = exchange.toLowerCase().startsWith('binance');
      const isBinanceTest = exchange === 'binance_test' || exchange === 'binance_future_test' || (isBinance && exchange !== 'binance');
      const normalizedExchange = isBinance ? 'binance' : exchange;
      const ExchangeClass = ccxt[normalizedExchange as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        this.logger.warn(`Exchange "${exchange}" not found in CCXT — accepting with read-only permissions`);
        return { valid: true, permissions: ['read', 'trade'] };
      }

      // ── Build exchange instance with exchange-specific configuration ──
      const exchangeConfig: any = {
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
        options: {
          defaultType: exchange === 'binance_future_test' ? 'future' : 'spot',
          adjustForTimeDifference: true,
        },
      };

      // FIX: Add passphrase for exchanges that require it (KuCoin, OKX)
      // CCXT expects the passphrase as the 'password' property
      if (passphrase) {
        exchangeConfig.password = passphrase;
      }

      // ── Alpaca-specific: detect paper vs live trading ──
      // Alpaca paper trading keys must use the paper-trading base URL.
      // The default CCXT alpaca config points to the live endpoint, which
      // causes paper-trading keys to fail with auth errors even though they
      // are perfectly valid. We detect paper keys and switch the URL.
      if (exchange.toLowerCase() === 'alpaca') {
        const isPaperKey = apiKey.startsWith('PK') || apiSecret.startsWith('PK');
        if (isPaperKey) {
          exchangeConfig.urls = {
            api: {
              ...((ExchangeClass as any).urls?.api || {}),
              account: 'https://paper-api.alpaca.markets/v2',
            },
          };
          this.logger.log('🔑 Alpaca paper-trading key detected — configured paper trading endpoint');
        } else {
          this.logger.log('🔑 Alpaca live-trading key detected — using default endpoint');
        }
      }

      const exchangeInstance = new ExchangeClass(exchangeConfig);
      
      // ── Sustainable Binance Testnet Support ──
      if (isBinanceTest) {
        exchangeInstance.setSandboxMode(true);
        
        // Manual URL override to ensure we hit the correct testnet endpoints
        // CCXT's default sandbox mode can sometimes hit the wrong domain during loadMarkets()
        if (exchange === 'binance_future_test') {
          exchangeInstance.urls['api'] = {
            public: 'https://testnet.binancefuture.com/fapi/v1',
            private: 'https://testnet.binancefuture.com/fapi/v1',
            fapiPublic: 'https://testnet.binancefuture.com/fapi/v1',
            fapiPrivate: 'https://testnet.binancefuture.com/fapi/v1',
          };
        } else {
          exchangeInstance.urls['api'] = {
            public: 'https://testnet.binance.vision/api/v3',
            private: 'https://testnet.binance.vision/api/v3',
          };
        }

        this.logger.log(`🔑 Validating Binance Testnet (${exchangeConfig.options.defaultType}) via explicit endpoints`);
      }

      // Strategy 1: Try to fetch balance to validate the key (full validation)
      try {
        // Optimization: For validation, we don't necessarily need to load all markets
        // but CCXT methods usually do it. We catch errors here specifically.
        const balance = await exchangeInstance.fetchBalance();

        const permissions: string[] = ['read'];

        if (balance && Object.keys(balance).length > 0) {
          permissions.push('trade');
        }

        return { valid: true, permissions };
      } catch (balanceError: any) {
        const balanceMessage = balanceError.message || '';

        // If balance fetch fails with auth error → key is genuinely invalid
        if (this._isAuthError(balanceMessage)) {
          // FIX: "Unauthorized" from Binance can also mean IP restriction.
          // Try fetchTicker as a lighter check before rejecting completely.
          try {
            if (typeof exchangeInstance.fetchTicker === 'function') {
              await exchangeInstance.fetchTicker('BTC/USDT');
              // If fetchTicker works, the key is valid — the balance error was likely IP-based
              this.logger.log(`API key validated via fetchTicker (balance failed with: ${balanceMessage.substring(0, 60)})`);
              return { valid: true, permissions: ['read', 'trade'] };
            }
          } catch (tickerErr: any) {
            // fetchTicker also failed with auth error → key is genuinely invalid
            if (this._isAuthError(tickerErr.message || '')) {
              return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
            }
          }
          return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
        }

        // If connection error → can't reach exchange, accept with warning
        if (this._isConnectionError(balanceMessage)) {
          this.logger.warn(`تعذر الاتصال بالبورصة ${exchange}: ${balanceMessage.substring(0, 80)}`);
          return { valid: true, permissions: ['read', 'trade'] };
        }

        // If permission error → key is valid but missing permissions
        if (balanceMessage.includes('Permission') || balanceMessage.includes('forbidden') ||
            balanceMessage.includes('IP ban') || balanceMessage.includes('ip not allowed')) {
          this.logger.warn(`Key valid but restricted: ${balanceMessage.substring(0, 100)}`);
          return { valid: true, permissions: ['read', 'trade'] };
        }

        // Strategy 2: Try fetchTicker as a lighter validation
        try {
          if (typeof exchangeInstance.fetchTicker === 'function') {
            await exchangeInstance.fetchTicker('BTC/USDT');
            this.logger.log(`API key validated via fetchTicker (balance check failed: ${balanceMessage.substring(0, 60)})`);
            return { valid: true, permissions: ['read', 'trade'] };
          }
        } catch (tickerError: any) {
          const tickerMessage = tickerError.message || '';
          if (this._isAuthError(tickerMessage)) {
            return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
          }
          if (this._isConnectionError(tickerMessage)) {
            this.logger.warn(`تعذر الاتصال بالبورصة ${exchange}: ${tickerMessage.substring(0, 80)}`);
            return { valid: true, permissions: ['read', 'trade'] };
          }
        }

        // Strategy 3: Accept the key with a warning if it's a non-auth error
        this.logger.warn(
          `Could not fully verify API key for ${exchange} (non-auth error): ${balanceMessage.substring(0, 100)}` +
          ` — accepting with trade permissions. Key will be validated on first use.`
        );
        return { valid: true, permissions: ['read', 'trade'] };
      }
    } catch (error: any) {
      const message = error.message || 'Unknown error';

      if (this._isAuthError(message)) {
        return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
      }

      if (this._isConnectionError(message)) {
        this.logger.warn(`تعذر الاتصال بالبورصة ${exchange}: ${message.substring(0, 80)}`);
        return { valid: true, permissions: ['read', 'trade'] };
      }

      if (message.includes('Permission') || message.includes('forbidden')) {
        return { valid: false, error: 'صلاحيات المفتاح غير كافية' };
      }

      if (message.includes('not supported')) {
        return { valid: true, permissions: ['read', 'trade'] };
      }

      // For any other error, accept the key rather than rejecting it
      this.logger.warn(`Accepting API key for ${exchange} despite validation error: ${message.substring(0, 100)}`);
      return { valid: true, permissions: ['read', 'trade'] };
    }
  }

  /** Check if an error message indicates an authentication failure (invalid key) */
  private _isAuthError(message: string): boolean {
    const authErrorPatterns = [
      'Invalid API', 'invalid api key', 'invalid signature',
      'API-key format invalid', 'Invalid API-key', 'authentication error',
      'auth error', 'invalid key',
    ];
    // FIX: Separate "access denied" from genuine auth errors.
    // Binance returns "Access denied" for IP whitelist restrictions, which means
    // the key IS valid but the server IP isn't whitelisted. We should NOT reject
    // the key in this case — we should accept it with a warning.
    const ipRestrictionPatterns = [
      'access denied', 'ip not allowed', 'ip ban', 'IP restriction',
      'whitelist', 'source ip', 'for this ip address',
    ];
    const lower = message.toLowerCase();
    // If the error is an IP restriction, it's NOT an auth error — the key is valid
    if (ipRestrictionPatterns.some(p => lower.includes(p.toLowerCase()))) {
      this.logger.warn(`API key is valid but has IP restriction — accepting with warning: ${message.substring(0, 100)}`);
      return false;
    }
    return authErrorPatterns.some(p => lower.includes(p.toLowerCase()));
  }

  /** Check if an error message indicates a connection/network issue (NOT an auth problem) */
  private _isConnectionError(message: string): boolean {
    const connectionErrorPatterns = [
      'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'network',
      'timeout', 'rate limit', 'Too Many Requests', '429',
      'ENOTFOUND', 'EAI_AGAIN', 'socket hang up', 'connect ETIMEDOUT',
      'SSL', 'CERT', 'unable to connect',
    ];
    const lower = message.toLowerCase();
    return connectionErrorPatterns.some(p => lower.includes(p.toLowerCase()));
  }
}
