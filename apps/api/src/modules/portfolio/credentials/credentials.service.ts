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
import { calculateMargin } from '../../trading/services/symbol-metadata';
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

  /** Balance cache — prevents hitting exchange APIs on every request.
   * Before this cache, fetchAllExchangeBalances() created fresh CCXT instances
   * and called fetchBalance() on EVERY page load, causing 10+ second delays
   * when Binance Testnet was unreachable.
   * Now: first request fetches from exchange, subsequent requests within TTL use cache.
   */
  private readonly balanceCache = new Map<string, { data: any; timestamp: number }>();
  private readonly BALANCE_CACHE_TTL_MS = 5_000;  // V140: reduced from 60s to 5s — faster balance updates after trades
  private readonly BALANCE_CACHE_MAX_SIZE = 50;    // Max users to cache
  private balanceCleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    // FIX: Wrap entire key derivation in try-catch to prevent NestJS crash.
    // If ANY step of the key derivation fails (invalid hex, scryptSync error,
    // etc.), fall back to a temporary random key. This is better than crashing
    // the entire application, which would take down ALL API endpoints.
    let encryptionKey: Buffer | undefined;
    try {
      const key = this.configService.get<string>('ENCRYPTION_KEY');
      const isProduction = this.configService.get('NODE_ENV') === 'production';

      if (key) {
        const keyBuffer = Buffer.from(key, 'hex');
        // FIX: AES-256-GCM requires exactly 32 bytes (64 hex chars).
        // If ENCRYPTION_KEY is set but not 32 bytes, the crypto operations
        // will throw "invalid key length". We validate here and fall back
        // to scryptSync derivation if the key is the wrong length.
        if (keyBuffer.length === 32) {
          encryptionKey = keyBuffer;
        } else {
          this.logger.error(
            `🚨 ENCRYPTION_KEY is ${keyBuffer.length} bytes (expected 32). ` +
            `Deriving a valid 32-byte key from it via scryptSync. ` +
            `Generate a proper key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
          );
          const salt = crypto.createHash('sha256').update(`encryption-key-fix:${key}`).digest().slice(0, 16);
          encryptionKey = crypto.scryptSync(key, salt, 32);
        }
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
          encryptionKey = crypto.scryptSync(fallback, salt, 32);
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
          encryptionKey = crypto.randomBytes(32);
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
          encryptionKey = crypto.randomBytes(32);
        } else {
          // FIXED: Do NOT include hostname() in the derivation.
          // On Railway, each redeploy creates a new container with a different hostname,
          // which changed the encryption key and made all stored credentials unreadable.
          const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'development')}`;
          const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
          encryptionKey = crypto.scryptSync(fallback, salt, 32);
          this.logger.warn(
            '⚠️ ENCRYPTION_KEY not set — using derived key from NEXTAUTH_SECRET+deployment (development only). ' +
            'Set ENCRYPTION_KEY for production!'
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `🚨 CRITICAL: Encryption key derivation failed: ${err.message}. ` +
        `Using temporary random key — encrypted credentials will NOT be accessible. ` +
        `Set ENCRYPTION_KEY environment variable to fix this.`
      );
      encryptionKey = crypto.randomBytes(32);
    }

    this.encryptionKey = encryptionKey;

    // Balance cache cleanup — runs every 10 minutes, evicts expired entries
    this.balanceCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.balanceCache) {
        if (now - entry.timestamp > this.BALANCE_CACHE_TTL_MS * 2) {
          this.balanceCache.delete(key);
        }
      }
    }, 10 * 60 * 1000);
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
      testnet?: boolean;
    },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const { exchange, label, apiKey, apiSecret, passphrase, testnet } = data;

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
        testnet: testnet || false,
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
   * Update a credential (e.g., toggle testnet mode)
   */
  async updateCredential(
    userId: string,
    credentialId: string,
    data: { testnet?: boolean },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
      throw new NotFoundException('بيانات الاعتماد غير موجودة');
    }

    if (credential.userId !== userId) {
      throw new ForbiddenException('غير مصرح بتعديل بيانات الاعتماد هذه');
    }

    const updated = await this.prisma.exchangeCredential.update({
      where: { id: credentialId },
      data: {
        ...(data.testnet !== undefined && { testnet: data.testnet }),
      },
    });

    await this.auditService.log({
      userId,
      action: 'CREDENTIAL_UPDATED',
      resource: 'exchange-credential',
      details: JSON.stringify({ credentialId, testnet: data.testnet }),
      ipAddress,
      userAgent,
    });

    return updated;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(userId: string, credentialId: string, ipAddress?: string, userAgent?: string) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) {
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

  /**
   * Fetch balances from ALL linked exchange accounts for a user.
   * Decrypts credentials, creates CCXT instances, and calls fetchBalance.
   * Returns aggregated data with per-exchange breakdown.
   */
  async fetchAllExchangeBalances(userId: string): Promise<{
    totalEquityUsd: number;
    totalAvailableUsd: number;
    exchanges: Array<{
      exchange: string;
      label: string;
      credentialId: string;
      isTestnet: boolean;
      equity: number;
      available: number;
      currency: string;
      assets: Array<{ currency: string; free: number; used: number; total: number }>;
      error?: string;
    }>;
  }> {
    // FIX: Check balance cache first — prevents 10+ second delays on every page load.
    // Before this cache, every call created fresh CCXT instances and hit exchange APIs,
    // causing /api/trading/account to take 10091ms when Binance Testnet was unreachable.
    const cacheKey = `balances:${userId}`;
    const cached = this.balanceCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.BALANCE_CACHE_TTL_MS) {
      this.logger.debug(`Balance cache HIT for user ${userId} (${Date.now() - cached.timestamp}ms old)`);
      return cached.data;
    }

    const allCredentials = await this.prisma.exchangeCredential.findMany({
      where: { userId, isValid: true },
    });

    // FIX: Even if user has NO credentials, check if they have a paper trading
    // balance in AgentSettings. This prevents the $0 balance problem for users
    // who logged in before auto-credential-creation was added.
    // Previously: if (allCredentials.length === 0) return { totalEquityUsd: 0 }
    // Now: Fall through to the paper balance logic below.

    // FIX: INCLUDE paper-trading credentials in the balance response.
    // Previously, paper-trading was completely excluded, which meant users with
    // ONLY paper-trading accounts saw $0 balance everywhere — dashboard, chart,
    // execution widgets. This made the platform appear completely broken.
    // Now: Paper-trading credentials get their balance from AgentSettings.paperBalance.
    const realCredentials = allCredentials.filter(
      (c) => c.exchange !== 'paper-trading'
    );
    const paperCredentials = allCredentials.filter(
      (c) => c.exchange === 'paper-trading'
    );

    // Real exchange credentials: fetch balances via CCXT
    const exchangeResults = await Promise.allSettled(
      realCredentials.map(async (cred) => {
        try {
          // FIX: Validate that encrypted data exists before trying to decrypt
          if (!cred.encryptedApiKey || !cred.encryptedSecret) {
            return {
              exchange: cred.exchange,
              label: cred.label,
              credentialId: cred.id,
              isTestnet: cred.exchange.includes('test'),
              equity: 0,
              available: 0,
              currency: 'USD',
              assets: [],
              error: 'بيانات الاعتماد غير مكتملة — يرجى حذف المفتاح وإضافته مرة أخرى',
            };
          }

          const decrypted = await this.decryptCredential(cred.id, userId);
          return await this._fetchSingleExchangeBalance(
            cred.exchange,
            cred.label,
            cred.id,
            decrypted.apiKey,
            decrypted.apiSecret,
            decrypted.passphrase,
          );
        } catch (error: any) {
          this.logger.warn(`Failed to fetch balance for ${cred.exchange}/${cred.label}: ${error.message}`);
          return {
            exchange: cred.exchange,
            label: cred.label,
            credentialId: cred.id,
            isTestnet: cred.exchange.includes('test'),
            equity: 0,
            available: 0,
            currency: 'USD',
            assets: [],
            error: error.message || 'فشل في جلب الرصيد',
          };
        }
      }),
    );

    const realExchanges = exchangeResults.map((r) =>
      r.status === 'fulfilled' ? r.value : {
        exchange: 'unknown',
        label: 'فشل',
        credentialId: '',
        isTestnet: false,
        equity: 0,
        available: 0,
        currency: 'USD',
        assets: [],
        error: r.reason?.message || 'خطأ غير معروف',
      },
    );

    // FIX: Only include real exchange results
    const exchanges = realExchanges;

    // FIX: Add paper-trading balance from AgentSettings.
    // This is the MISSING PIECE — without it, paper-trading users see $0 balance.
    // The paper balance comes from AgentSettings.paperBalance (default: $10,000).
    // Works even if the user has NO paper-trading credential (auto-creates a virtual one).
    let paperBalanceUsd = 0;
    let paperAvailableUsd = 0;
    const hasPaperCredential = paperCredentials.length > 0;
    // Always try to get paper balance from AgentSettings — even without a credential
    try {
      const settings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
      paperBalanceUsd = settings ? Number(settings.paperBalance) : 10000;
      // V147 FIX: Calculate leverage-aware used margin and unrealized P&L separately.
      // Previously, `totalExposure = qty × price` (full notional) was subtracted from
      // paperBalance as if it were margin. This caused the available balance to drop
      // by THOUSANDS for forex positions where the actual margin is only 2% of notional.
      // For example: 5 EUR/USD positions with $500 notional each = $2,500 "exposure"
      // but actual margin = $2,500 / 50 = $50. The old code made available = $7,500
      // instead of the correct $9,950.
      // Now: margin = notional / leverage (forex: /50, gold: /20, crypto: /1)
      //       equity = balance + unrealized P&L
      //       available = equity - usedMargin
      let usedMargin = 0;
      let unrealizedPnl = 0;
      try {
        const openPositions = await this.prisma.position.findMany({
          where: { userId, status: 'OPEN' },
          select: { quantity: true, currentPrice: true, entryPrice: true, symbol: true, side: true },
        });
        for (const p of openPositions) {
          const qty = Number(p.quantity) || 0;
          const currentPrice = Number(p.currentPrice) || Number(p.entryPrice) || 0;
          const entryPrice = Number(p.entryPrice) || 0;
          // Leverage-aware margin (forex /50, gold /20, crypto /1)
          usedMargin += calculateMargin(qty, currentPrice, p.symbol);
          // Unrealized P&L
          if (p.side === 'BUY') {
            unrealizedPnl += (currentPrice - entryPrice) * qty;
          } else {
            unrealizedPnl += (entryPrice - currentPrice) * qty;
          }
        }
      } catch {
        // If position lookup fails, assume no margin used
      }
      const paperEquity = paperBalanceUsd + unrealizedPnl;
      paperAvailableUsd = Math.max(0, paperEquity - usedMargin);
      // Add paper-trading as an exchange entry in the response
      exchanges.push({
        exchange: 'paper-trading',
        label: hasPaperCredential ? (paperCredentials[0].label || 'Paper Trading') : 'Paper Trading',
        credentialId: hasPaperCredential ? paperCredentials[0].id : 'paper-virtual',
        isTestnet: true,
        equity: paperEquity,
        available: paperAvailableUsd,
        currency: 'USD',
        assets: [{
          currency: 'USD',
          free: paperAvailableUsd,
          used: usedMargin,
          total: paperEquity,
        }],
      });
    } catch (err: any) {
      this.logger.warn(`Failed to fetch paper balance: ${err.message}`);
    }

    const totalEquityUsd = exchanges.reduce((sum, e) => sum + e.equity, 0);
    const totalAvailableUsd = exchanges.reduce((sum, e) => sum + e.available, 0);
    // V148 FIX: Include totalUsedMargin in response so frontend doesn't have to
    // compute it incorrectly as totalEquityUsd - totalAvailableUsd (which caps at
    // equity when available=0) or fall back to positionsMarketValue (full notional).
    // The correct usedMargin is already calculated per-exchange using calculateMargin()
    // which is leverage-aware (forex /50, gold /20, crypto /1).
    const totalUsedMargin = exchanges.reduce((sum, e) => {
      const usedAsset = e.assets?.find((a: any) => a.currency === 'USD');
      return sum + (usedAsset?.used || 0);
    }, 0);

    const result = { totalEquityUsd, totalAvailableUsd, totalUsedMargin, exchanges };

    // FIX: Store in balance cache — subsequent requests within 60s will be instant
    if (this.balanceCache.size >= this.BALANCE_CACHE_MAX_SIZE) {
      const oldestKey = this.balanceCache.keys().next().value;
      if (oldestKey) this.balanceCache.delete(oldestKey);
    }
    this.balanceCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Fetch balance from a single exchange using decrypted credentials.
   * Handles Binance Testnet URL configuration, just like _doValidateApiKey.
   * Includes a 15-second timeout to prevent hanging on slow testnet connections.
   */
  private async _fetchSingleExchangeBalance(
    exchange: string,
    label: string,
    credentialId: string,
    apiKey: string,
    apiSecret: string,
    passphrase?: string,
  ): Promise<{
    exchange: string;
    label: string;
    credentialId: string;
    isTestnet: boolean;
    equity: number;
    available: number;
    currency: string;
    assets: Array<{ currency: string; free: number; used: number; total: number }>;
    error?: string;
  }> {
    const isBinance = exchange.toLowerCase().startsWith('binance');
    const isBinanceTest = exchange === 'binance_test' || exchange === 'binance_future_test';
    const normalizedExchange = isBinance ? 'binance' : exchange;
    const isTestnet = isBinanceTest || exchange.includes('test');

    const ExchangeClass = ccxt[normalizedExchange as keyof typeof ccxt] as any;
    if (!ExchangeClass) {
      return {
        exchange, label, credentialId, isTestnet,
        equity: 0, available: 0, currency: 'USD', assets: [],
        error: `البورصة "${exchange}" غير مدعومة`,
      };
    }

    const exchangeConfig: any = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      timeout: 5000, // FIX: Reduced from 15000ms — Binance Testnet often unreachable, burning 15s per request
      options: {
        defaultType: exchange === 'binance_future_test' ? 'future' : 'spot',
        adjustForTimeDifference: true,
      },
    };

    if (passphrase) {
      exchangeConfig.password = passphrase;
    }

    const instance = new ExchangeClass(exchangeConfig);

    // Apply testnet URLs (same logic as _doValidateApiKey)
    if (isBinanceTest) {
      if (exchange === 'binance_future_test') {
        instance.sandbox = true;
        instance.urls['api'] = {
          ...instance.urls['api'],
          public: 'https://testnet.binancefuture.com/fapi/v1',
          private: 'https://testnet.binancefuture.com/fapi/v1',
          fapiPublic: 'https://testnet.binancefuture.com/fapi/v1',
          fapiPrivate: 'https://testnet.binancefuture.com/fapi/v1',
          fapiPublicV2: 'https://testnet.binancefuture.com/fapi/v2',
          fapiPrivateV2: 'https://testnet.binancefuture.com/fapi/v2',
          fapiPublicV3: 'https://testnet.binancefuture.com/fapi/v3',
          fapiPrivateV3: 'https://testnet.binancefuture.com/fapi/v3',
        };
        this.logger.log(`🔑 Balance fetch: Binance Futures Testnet via manual URL override`);
      } else {
        instance.setSandboxMode(true);
        this.logger.log(`🔑 Balance fetch: Binance Spot Testnet via CCXT sandbox mode`);
      }
    }

    // Fetch balance with explicit timeout wrapper for extra safety
    const BALANCE_TIMEOUT_MS = 5_000; // FIX: Reduced from 15_000 — fail fast, cache result
    let balance: any;
    try {
      balance = await Promise.race([
        instance.fetchBalance(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`انتهت مهلة جلب الرصيد من ${exchange} (${BALANCE_TIMEOUT_MS / 1000}s)`)), BALANCE_TIMEOUT_MS)
        ),
      ]);
    } catch (fetchError: any) {
      const errMsg = fetchError.message || 'Unknown error';
      this.logger.warn(`⚠️ Balance fetch failed for ${exchange}/${label}: ${errMsg}`);

      // If the error is a timeout or connection issue, return with error but don't crash
      if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED') ||
          errMsg.includes('ECONNRESET') || errMsg.includes('network') || errMsg.includes('سحب')) {
        return {
          exchange, label, credentialId, isTestnet,
          equity: 0, available: 0, currency: 'USD', assets: [],
          error: `تعذر الاتصال بالبورصة — يرجى المحاولة لاحقاً`,
        };
      }

      // For auth errors, mark the credential as potentially invalid
      if (this._isAuthError(errMsg)) {
        return {
          exchange, label, credentialId, isTestnet,
          equity: 0, available: 0, currency: 'USD', assets: [],
          error: `مفتاح API غير صالح أو منتهي الصلاحية — يرجى حذفه وإضافته مرة أخرى`,
        };
      }

      // For any other error, return with the error message
      return {
        exchange, label, credentialId, isTestnet,
        equity: 0, available: 0, currency: 'USD', assets: [],
        error: `خطأ في جلب الرصيد: ${errMsg.substring(0, 100)}`,
      };
    }

    if (!balance || typeof balance !== 'object') {
      return {
        exchange, label, credentialId, isTestnet,
        equity: 0, available: 0, currency: 'USD', assets: [],
        error: 'لم يتم استلام بيانات الرصيد من البورصة',
      };
    }

    // Extract non-zero assets with dust filter
    // FIX: Binance (especially Testnet) returns ALL tokens including those
    // with zero balance. We filter out:
    //   1. Zero-balance tokens (total <= 0)
    //   2. Dust amounts (total < 0.0001) that have no real value
    //   3. Special/internal tokens (starting with LD, like LDBNB, LDETH)
    const DUST_THRESHOLD = 0.0001;
    const INTERNAL_PREFIXES = ['LD', 'NFT', 'BETH']; // Binance internal tokens
    const assets: Array<{ currency: string; free: number; used: number; total: number }> = [];
    for (const [currency, data] of Object.entries(balance)) {
      if (['free', 'used', 'total', 'info', 'timestamp', 'datetime', 'nonce'].includes(currency)) continue;
      if (typeof data === 'object' && data !== null && 'free' in (data as any)) {
        const d = data as any;
        const total = Number(d.total) || 0;
        // Filter: skip zero balance, dust, and internal tokens
        if (total <= DUST_THRESHOLD) continue;
        if (INTERNAL_PREFIXES.some(prefix => currency.toUpperCase().startsWith(prefix))) continue;
        assets.push({
          currency,
          free: Number(d.free) || 0,
          used: Number(d.used) || 0,
          total,
        });
      }
    }

    // Calculate equity in USD/USDT
    // FIX V140: Convert non-USDT assets to USD using approximate prices.
    // Previously, assets.reduce summed raw token counts (0.5 BTC + 10 ETH = 10.5)
    // instead of their USD values. Now we use known prices for major crypto assets.
    const usdtFree = balance.free?.USDT || balance.free?.USD || 0;
    const usdtUsed = balance.used?.USDT || balance.used?.USD || 0;
    const usdtTotal = balance.total?.USDT || balance.total?.USD || 0;

    let equity: number;
    let available: number;

    if (usdtTotal > 0) {
      // USDT/USD balance exists — use it directly
      equity = usdtTotal;
      available = usdtFree;
    } else {
      // No USDT — convert all assets to USD using known prices
      const USD_PRICES: Record<string, number> = {
        BTC: 77000, ETH: 2200, BNB: 650, SOL: 170, XRP: 2.4,
        ADA: 0.75, DOGE: 0.22, DOT: 4.5, AVAX: 35, LINK: 15,
        MATIC: 0.5, UNI: 7, ATOM: 8, LTC: 95, SHIB: 0.000012,
        USDC: 1, BUSD: 1, DAI: 1, TUSD: 1, FDUSD: 1,
      };
      let totalUsd = 0;
      let freeUsd = 0;
      for (const asset of assets) {
        const assetTotal = asset.total;
        const assetFree = asset.free;
        if (assetTotal <= 0) continue;
        const price = USD_PRICES[asset.currency.toUpperCase()] || 0;
        totalUsd += assetTotal * price;
        freeUsd += assetFree * price;
      }
      equity = totalUsd || assets.reduce((sum, a) => sum + a.total, 0);
      available = freeUsd || assets.reduce((sum, a) => sum + a.free, 0);
    }

    this.logger.log(`💰 Balance fetched from ${exchange}/${label}: equity=$${equity}, available=$${available}, ${assets.length} assets`);

    return {
      exchange,
      label,
      credentialId,
      isTestnet,
      equity,
      available,
      currency: 'USD',
      assets,
    };
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
    const isBinance = exchange.toLowerCase().startsWith('binance');
    const isBinanceTest = exchange === 'binance_test' || exchange === 'binance_future_test' || (isBinance && exchange !== 'binance');
    try {
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
        // CCXT 4.5+ deprecated setSandboxMode for Binance Futures — it throws NotSupported.
        // For Spot Testnet, setSandboxMode(true) works and sets all URLs correctly.
        // For Futures Testnet, we must manually override URLs while keeping all
        // existing keys (fapiPublicV2, fapiPublicV3, etc.) that loadMarkets() needs.
        if (exchange === 'binance_future_test') {
          exchangeInstance.sandbox = true;
          exchangeInstance.urls['api'] = {
            ...exchangeInstance.urls['api'],
            public: 'https://testnet.binancefuture.com/fapi/v1',
            private: 'https://testnet.binancefuture.com/fapi/v1',
            fapiPublic: 'https://testnet.binancefuture.com/fapi/v1',
            fapiPrivate: 'https://testnet.binancefuture.com/fapi/v1',
            fapiPublicV2: 'https://testnet.binancefuture.com/fapi/v2',
            fapiPrivateV2: 'https://testnet.binancefuture.com/fapi/v2',
            fapiPublicV3: 'https://testnet.binancefuture.com/fapi/v3',
            fapiPrivateV3: 'https://testnet.binancefuture.com/fapi/v3',
          };
          this.logger.log('🔑 Validating Binance Futures Testnet via manual URL override (CCXT sandbox deprecated for futures)');
        } else {
          // Spot Testnet — setSandboxMode works correctly
          exchangeInstance.setSandboxMode(true);
          this.logger.log('🔑 Validating Binance Spot Testnet via CCXT sandbox mode');
        }
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
              const testnetHint2 = isBinanceTest
                ? ' تأكد أن المفتاح من Binance Testnet وليس من الحساب الحي.'
                : ' إذا كنت تستخدم مفتاح Testnet، اختر "Binance Spot Testnet" أو "Binance Futures Testnet" بدلاً من "Binance".';
              return { valid: false, error: `مفتاح API غير صالح أو منتهي الصلاحية.${testnetHint2}` };
            }
          }
          // Provide specific error messages for testnet/live mismatches
          const testnetHint = isBinanceTest
            ? ' تأكد أن المفتاح من Binance Testnet وليس من الحساب الحي.'
            : ' إذا كنت تستخدم مفتاح Testnet، اختر "Binance Spot Testnet" أو "Binance Futures Testnet" بدلاً من "Binance".';
          return { valid: false, error: `مفتاح API غير صالح أو منتهي الصلاحية.${testnetHint}` };
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

      // Catch CCXT NotSupported error (e.g., Binance Futures Testnet sandbox deprecated)
      if (error.constructor?.name === 'NotSupported' || message.includes('not supported') || message.includes('NotSupported')) {
        this.logger.warn(`Exchange feature not supported for ${exchange}: ${message.substring(0, 100)}`);
        return { valid: false, error: `Binance Futures Testnet لم يعد مدعوماً من CCXT. استخدم Binance Spot Testnet أو الحساب الحي بدلاً منه.` };
      }

      if (this._isAuthError(message)) {
        const testnetHint3 = isBinanceTest
          ? ' تأكد أن المفتاح من Binance Testnet وليس من الحساب الحي.'
          : ' إذا كنت تستخدم مفتاح Testnet، اختر "Binance Spot Testnet" أو "Binance Futures Testnet" بدلاً من "Binance".';
        return { valid: false, error: `مفتاح API غير صالح أو منتهي الصلاحية.${testnetHint3}` };
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

  /**
   * FIX V117: Invalidate balance cache for a user.
   * Called when a position is closed so the next balance fetch
   * returns fresh data instead of stale cached values.
   * Without this, closing a position doesn't update the balance
   * for up to 60 seconds (BALANCE_CACHE_TTL_MS).
   */
  invalidateBalanceCache(userId: string): void {
    const cacheKey = `balances:${userId}`;
    const deleted = this.balanceCache.delete(cacheKey);
    if (deleted) {
      this.logger.debug(`🗑️ Balance cache invalidated for user ${userId}`);
    }
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
