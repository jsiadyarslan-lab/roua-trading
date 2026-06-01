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
var CredentialsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const prisma_extension_service_1 = require("../../../common/prisma/prisma-extension.service");
const audit_service_1 = require("../../../audit/audit.service");
const symbol_metadata_1 = require("../../trading/services/symbol-metadata");
const userid_validation_interceptor_1 = require("../../../common/interceptors/userid-validation.interceptor");
const crypto = __importStar(require("crypto"));
const ccxt = __importStar(require("ccxt"));
let CredentialsService = CredentialsService_1 = class CredentialsService {
    constructor(prisma, prismaExtension, configService, auditService) {
        this.prisma = prisma;
        this.prismaExtension = prismaExtension;
        this.configService = configService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(CredentialsService_1.name);
        this.FORBIDDEN_PERMISSIONS = ['withdraw', 'transfer', 'withdrawal', 'internaltransfer'];
        this.balanceCache = new Map();
        this.BALANCE_CACHE_TTL_MS = 5_000;
        this.BALANCE_CACHE_MAX_SIZE = 50;
        this.balanceCleanupInterval = null;
        let encryptionKey;
        try {
            const key = this.configService.get('ENCRYPTION_KEY');
            const isProduction = this.configService.get('NODE_ENV') === 'production';
            if (key) {
                const keyBuffer = Buffer.from(key, 'hex');
                if (keyBuffer.length === 32) {
                    encryptionKey = keyBuffer;
                }
                else {
                    this.logger.error(`🚨 ENCRYPTION_KEY is ${keyBuffer.length} bytes (expected 32). ` +
                        `Deriving a valid 32-byte key from it via scryptSync. ` +
                        `Generate a proper key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
                    const salt = crypto.createHash('sha256').update(`encryption-key-fix:${key}`).digest().slice(0, 16);
                    encryptionKey = crypto.scryptSync(key, salt, 32);
                }
            }
            else if (isProduction) {
                const fallback = this.configService.get('NEXTAUTH_SECRET');
                if (fallback) {
                    const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'production')}`;
                    const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
                    encryptionKey = crypto.scryptSync(fallback, salt, 32);
                    this.logger.error('🚨 SECURITY ALERT: ENCRYPTION_KEY is not set in production! ' +
                        'Using derived key from NEXTAUTH_SECRET as emergency fallback. ' +
                        'Real account credentials are at risk if NEXTAUTH_SECRET changes. ' +
                        'FIX IMMEDIATELY: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
                        'then add ENCRYPTION_KEY to Railway environment variables.');
                    setInterval(() => {
                        this.logger.error('🚨 SECURITY ALERT: ENCRYPTION_KEY still not set in production! Real account credentials at risk.');
                    }, 60_000);
                }
                else {
                    this.logger.error('🚨 CRITICAL: ENCRYPTION_KEY and NEXTAUTH_SECRET are both not set in production! ' +
                        'Using temporary random key — all stored credentials will be unreadable after restart. ' +
                        'Generate a key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
                    encryptionKey = crypto.randomBytes(32);
                }
            }
            else {
                const fallback = this.configService.get('NEXTAUTH_SECRET');
                if (!fallback) {
                    this.logger.error('⚠️ CRITICAL: ENCRYPTION_KEY and NEXTAUTH_SECRET not set! ' +
                        'Using temporary random key — credentials will be lost on restart. ' +
                        'Set ENCRYPTION_KEY for development: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
                    encryptionKey = crypto.randomBytes(32);
                }
                else {
                    const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'development')}`;
                    const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
                    encryptionKey = crypto.scryptSync(fallback, salt, 32);
                    this.logger.warn('⚠️ ENCRYPTION_KEY not set — using derived key from NEXTAUTH_SECRET+deployment (development only). ' +
                        'Set ENCRYPTION_KEY for production!');
                }
            }
        }
        catch (err) {
            this.logger.error(`🚨 CRITICAL: Encryption key derivation failed: ${err.message}. ` +
                `Using temporary random key — encrypted credentials will NOT be accessible. ` +
                `Set ENCRYPTION_KEY environment variable to fix this.`);
            encryptionKey = crypto.randomBytes(32);
        }
        this.encryptionKey = encryptionKey;
        this.balanceCleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.balanceCache) {
                if (now - entry.timestamp > this.BALANCE_CACHE_TTL_MS * 2) {
                    this.balanceCache.delete(key);
                }
            }
        }, 10 * 60 * 1000);
    }
    async addCredential(userId, data, ipAddress, userAgent) {
        const { exchange, label, apiKey, apiSecret, passphrase, testnet } = data;
        const effectiveTestnet = testnet === true || exchange.toLowerCase().includes('test');
        const validation = await this._validateApiKey(exchange, apiKey, apiSecret, passphrase, effectiveTestnet);
        if (!validation.valid) {
            await this.auditService.log({
                userId,
                action: 'CREDENTIAL_VALIDATE_FAILED',
                resource: 'exchange-credential',
                details: JSON.stringify({ exchange, label, error: validation.error }),
                ipAddress,
                userAgent,
            });
            throw new common_1.BadRequestException(`فشل في التحقق من مفتاح API: ${validation.error}`);
        }
        if (validation.permissions) {
            const hasForbidden = validation.permissions.some((p) => this.FORBIDDEN_PERMISSIONS.includes(p.toLowerCase()));
            if (hasForbidden) {
                await this.auditService.log({
                    userId,
                    action: 'CREDENTIAL_REJECTED_FORBIDDEN_PERMISSION',
                    resource: 'exchange-credential',
                    details: JSON.stringify({ exchange, label, permissions: validation.permissions }),
                    ipAddress,
                    userAgent,
                });
                throw new common_1.ForbiddenException('🚫 تم رفض المفتاح! يحتوي على صلاحيات سحب أو تحويل. رؤى لا تقبل مفاتيح تسمح بالسحب — مبدأنا: غير أمين (Non-Custodial).');
            }
        }
        const encryptedApiKey = this._encrypt(apiKey);
        const encryptedSecret = this._encrypt(apiSecret);
        const encryptedPassphrase = passphrase ? this._encrypt(passphrase) : null;
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
                testnet: effectiveTestnet,
                keyType: data.keyType || 'hmac',
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
        this.invalidateBalanceCache(userId);
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
    async getUserCredentials(userId) {
        if (!(0, userid_validation_interceptor_1.isValidUserId)(userId)) {
            this.logger.error(`🚨 SECURITY: getUserCredentials called with invalid userId="${userId}"`);
            return [];
        }
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
    async updateCredential(userId, credentialId, data, ipAddress, userAgent) {
        const credential = await this.prisma.exchangeCredential.findUnique({
            where: { id: credentialId },
        });
        if (!credential) {
            throw new common_1.NotFoundException('بيانات الاعتماد غير موجودة');
        }
        if (credential.userId !== userId) {
            throw new common_1.ForbiddenException('غير مصرح بتعديل بيانات الاعتماد هذه');
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
    async deleteCredential(userId, credentialId, ipAddress, userAgent) {
        const credential = await this.prisma.exchangeCredential.findUnique({
            where: { id: credentialId },
        });
        if (!credential) {
            throw new common_1.NotFoundException('بيانات الاعتماد غير موجودة');
        }
        if (credential.userId !== userId) {
            throw new common_1.ForbiddenException('غير مصرح بحذف بيانات الاعتماد هذه');
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
        this.invalidateBalanceCache(userId);
        try {
            const activeSetting = await this.prisma.setting.findFirst({
                where: { key: `user:${userId}:activeCredentialId` },
            });
            if (activeSetting?.value === credentialId) {
                await this.prisma.setting.delete({
                    where: { id: activeSetting.id },
                });
                this.logger.log(`🗑️ Cleared stale activeCredentialId for user ${userId}`);
            }
        }
        catch (clearErr) {
            this.logger.warn(`Failed to clear activeCredentialId: ${clearErr.message}`);
        }
        this.logger.log(`🗑️ Credential deleted: ${credential.exchange}/${credential.label}`);
        return { success: true };
    }
    async decryptCredential(credentialId, userId) {
        const credential = await this.prisma.exchangeCredential.findUnique({
            where: { id: credentialId },
        });
        if (!credential) {
            throw new common_1.NotFoundException('بيانات الاعتماد غير موجودة');
        }
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
            throw new common_1.ForbiddenException('ليس لديك صلاحية الوصول إلى بيانات الاعتماد هذه');
        }
        const apiKey = this._decrypt({
            encrypted: credential.encryptedApiKey,
            iv: credential.iv,
            authTag: credential.authTag,
        });
        const apiSecret = this._decrypt({
            encrypted: credential.encryptedSecret,
            iv: credential.secretIv ?? credential.iv,
            authTag: credential.secretAuthTag ?? credential.authTag,
        });
        let passphrase;
        if (credential.encryptedPassphrase && credential.passphraseIv) {
            try {
                passphrase = this._decrypt({
                    encrypted: credential.encryptedPassphrase,
                    iv: credential.passphraseIv,
                    authTag: credential.passphraseAuthTag,
                });
            }
            catch {
                this.logger.warn('Failed to decrypt passphrase — may be legacy data');
            }
        }
        return { apiKey, apiSecret, passphrase };
    }
    async fetchAllExchangeBalances(userId) {
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            this.logger.error(`🚨 V162 CRITICAL: fetchAllExchangeBalances called with invalid userId="${userId}" — possible auth bypass!`);
            return {
                totalEquityUsd: 0,
                totalAvailableUsd: 0,
                totalUsedMargin: 0,
                exchanges: [],
                allRealExchangesFailed: false,
                hasRealCredentials: false,
            };
        }
        this.logger.log(`🔍 V162 Balance fetch START for userId=${userId}`);
        const cacheKey = `balances:${userId}`;
        const cached = this.balanceCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.BALANCE_CACHE_TTL_MS) {
            this.logger.debug(`Balance cache HIT for user ${userId} (${Date.now() - cached.timestamp}ms old)`);
            return cached.data;
        }
        const allCredentials = await this.prisma.exchangeCredential.findMany({
            where: { userId, isValid: true },
        });
        this.logger.log(`🔍 V162 User ${userId} has ${allCredentials.length} credentials: [${allCredentials.map(c => `${c.exchange}/${c.label}`).join(', ')}]`);
        const realCredentials = allCredentials.filter((c) => c.exchange !== 'paper-trading');
        const paperCredentials = allCredentials.filter((c) => c.exchange === 'paper-trading');
        const exchangeResults = await Promise.allSettled(realCredentials.map(async (cred) => {
            try {
                if (!cred.encryptedApiKey || !cred.encryptedSecret) {
                    return {
                        exchange: cred.exchange,
                        label: cred.label,
                        credentialId: cred.id,
                        isTestnet: cred.testnet === true || cred.exchange.includes('test'),
                        equity: 0,
                        available: 0,
                        currency: 'USD',
                        usedMargin: 0,
                        assets: [],
                        error: 'بيانات الاعتماد غير مكتملة — يرجى حذف المفتاح وإضافته مرة أخرى',
                    };
                }
                const decrypted = await this.decryptCredential(cred.id, userId);
                this.logger.debug(`🔑 Credential loaded for ${cred.exchange}/${cred.label}: ` +
                    `testnet=${cred.testnet}, keyLength=${decrypted.apiKey?.length ?? 0}`);
                return await this._fetchSingleExchangeBalance(cred.exchange, cred.label, cred.id, decrypted.apiKey, decrypted.apiSecret, decrypted.passphrase, cred.testnet === true, cred.keyType || 'hmac');
            }
            catch (error) {
                this.logger.warn(`❌ V164d Failed to fetch balance for ${cred.exchange}/${cred.label}: ` +
                    `[${error.constructor?.name || 'Unknown'}] ${error.message}`);
                if (error.message?.includes('decrypt') || error.message?.includes('Unsupported state') || error.message?.includes('auth tag')) {
                    this.logger.error(`🚨 V164d DECRYPTION FAILURE for credential ${cred.id}: ${error.message}. ` +
                        `This likely means ENCRYPTION_KEY changed — user must delete and re-add their API key.`);
                }
                return {
                    exchange: cred.exchange,
                    label: cred.label,
                    credentialId: cred.id,
                    isTestnet: cred.exchange.includes('test'),
                    equity: 0,
                    available: 0,
                    currency: 'USD',
                    usedMargin: 0,
                    assets: [],
                    error: error.message || 'فشل في جلب الرصيد',
                };
            }
        }));
        const realExchanges = exchangeResults.map((r) => r.status === 'fulfilled' ? r.value : {
            exchange: 'unknown',
            label: 'فشل',
            credentialId: '',
            isTestnet: false,
            equity: 0,
            available: 0,
            currency: 'USD',
            usedMargin: 0,
            paperBalance: undefined,
            assets: [],
            error: r.reason?.message || 'خطأ غير معروف',
        });
        const exchanges = realExchanges;
        let paperBalanceUsd = 0;
        let paperAvailableUsd = 0;
        const hasPaperCredential = paperCredentials.length > 0;
        try {
            const settings = await this.prisma.agentSettings.findUnique({
                where: { userId },
            });
            paperBalanceUsd = settings ? Number(settings.paperBalance) : 10000;
            const forexLeverage = settings?.paperForexLeverage || 50;
            const goldLeverage = settings?.paperGoldLeverage || 20;
            const cryptoLeverage = settings?.paperCryptoLeverage || 1;
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
                    const meta = (0, symbol_metadata_1.getSymbolMetadata)(p.symbol);
                    let leverage = meta.defaultLeverage;
                    if (meta.assetClass === 'FOREX')
                        leverage = forexLeverage;
                    else if (meta.assetClass === 'COMMODITY')
                        leverage = goldLeverage;
                    else if (meta.assetClass === 'CRYPTO')
                        leverage = cryptoLeverage;
                    const entryNotional = Math.abs(qty * entryPrice);
                    usedMargin += leverage > 0 ? entryNotional / leverage : entryNotional;
                    if (p.side === 'BUY') {
                        unrealizedPnl += (currentPrice - entryPrice) * qty;
                    }
                    else {
                        unrealizedPnl += (entryPrice - currentPrice) * qty;
                    }
                }
            }
            catch {
            }
            const paperEquity = paperBalanceUsd + usedMargin + unrealizedPnl;
            paperAvailableUsd = Math.max(0, paperBalanceUsd + unrealizedPnl);
            exchanges.push({
                exchange: 'paper-trading',
                label: hasPaperCredential ? (paperCredentials[0].label || 'Paper Trading') : 'Paper Trading',
                credentialId: hasPaperCredential ? paperCredentials[0].id : 'paper-virtual',
                isTestnet: true,
                equity: paperEquity,
                available: paperAvailableUsd,
                currency: 'USD',
                usedMargin,
                paperBalance: paperBalanceUsd,
                assets: [{
                        currency: 'USD',
                        free: paperAvailableUsd,
                        used: usedMargin,
                        total: paperEquity,
                    }],
            });
        }
        catch (err) {
            this.logger.warn(`Failed to fetch paper balance: ${err.message}`);
        }
        if (!exchanges.some(e => e.exchange === 'paper-trading')) {
            this.logger.warn(`📋 V171: Paper balance fetch failed for user ${userId} — adding default $10,000 fallback entry. ` +
                `This is normal for new users or when AgentSettings query fails.`);
            exchanges.push({
                exchange: 'paper-trading',
                label: 'Paper Trading',
                credentialId: 'paper-virtual',
                isTestnet: true,
                equity: 10000,
                available: 10000,
                currency: 'USD',
                usedMargin: 0,
                assets: [{ currency: 'USD', free: 10000, used: 0, total: 10000 }],
            });
        }
        const hasRealCredentials = realCredentials.length > 0;
        const realExchangesSuccess = exchanges.filter((e) => e.exchange !== 'paper-trading' && !e.error && e.equity > 0);
        const realExchangesFailed = exchanges.filter((e) => e.exchange !== 'paper-trading' && (e.error || e.equity <= 0));
        const allRealExchangesFailed = hasRealCredentials && realExchangesFailed.length > 0 && realExchangesSuccess.length === 0;
        if (allRealExchangesFailed) {
            this.logger.warn(`🚨 V162: ALL ${realExchangesFailed.length} real exchange balance(s) FAILED for user ${userId}. ` +
                `Failed: [${realExchangesFailed.map(e => `${e.exchange}: ${e.error}`).join(', ')}]. ` +
                `Paper equity: $${exchanges.find(e => e.exchange === 'paper-trading')?.equity || 0}. ` +
                `Frontend must show error, NOT silently use paper balance as total.`);
        }
        const totalSources = (hasRealCredentials && !allRealExchangesFailed)
            ? exchanges.filter((e) => e.exchange !== 'paper-trading')
            : exchanges;
        const totalEquityUsd = totalSources.reduce((sum, e) => sum + e.equity, 0);
        const totalAvailableUsd = totalSources.reduce((sum, e) => sum + e.available, 0);
        const totalUsedMargin = totalSources.reduce((sum, e) => {
            if (e.usedMargin !== undefined && e.usedMargin !== null) {
                return sum + e.usedMargin;
            }
            const usedAsset = e.assets?.find((a) => a.currency === 'USD' || a.currency === 'USDT');
            return sum + (usedAsset?.used || 0);
        }, 0);
        const result = {
            totalEquityUsd,
            totalAvailableUsd,
            totalUsedMargin,
            exchanges,
            allRealExchangesFailed,
            hasRealCredentials,
        };
        if (this.balanceCache.size >= this.BALANCE_CACHE_MAX_SIZE) {
            const oldestKey = this.balanceCache.keys().next().value;
            if (oldestKey)
                this.balanceCache.delete(oldestKey);
        }
        this.balanceCache.set(cacheKey, { data: result, timestamp: Date.now() });
        const paperEquity = exchanges.find(e => e.exchange === 'paper-trading')?.equity || 0;
        const realEquity = exchanges
            .filter((e) => e.exchange !== 'paper-trading')
            .reduce((sum, e) => sum + e.equity, 0);
        this.logger.log(`💰 V162 Balance for user ${userId}: total=$${totalEquityUsd.toFixed(2)} ` +
            `(real=$${realEquity.toFixed(2)}, paper=$${paperEquity.toFixed(2)}) ` +
            `allRealFailed=${allRealExchangesFailed} hasRealCreds=${hasRealCredentials}`);
        return result;
    }
    async _fetchSingleExchangeBalance(exchange, label, credentialId, apiKey, apiSecret, passphrase, testnet = false, keyType = 'hmac') {
        const isBinance = exchange.toLowerCase().startsWith('binance');
        const isBinanceTest = exchange === 'binance_test' || exchange === 'binance_future_test';
        const normalizedExchange = isBinance ? 'binance' : exchange;
        const isTestnet = testnet || isBinanceTest || exchange.includes('test');
        const ExchangeClass = ccxt[normalizedExchange];
        if (!ExchangeClass) {
            return {
                exchange, label, credentialId, isTestnet,
                equity: 0, available: 0, currency: 'USD', usedMargin: 0, assets: [],
                error: `البورصة "${exchange}" غير مدعومة`,
            };
        }
        const exchangeConfig = {
            apiKey,
            secret: apiSecret,
            enableRateLimit: true,
            timeout: 15000,
            options: {
                defaultType: exchange === 'binance_future_test' ? 'future' : 'spot',
                adjustForTimeDifference: true,
            },
        };
        if (keyType === 'ed25519' || keyType === 'rsa') {
            this.logger.log(`🔑 V170: Using ${keyType} key for ${exchange}/${label} — CCXT will auto-detect PEM format`);
        }
        if (passphrase) {
            exchangeConfig.password = passphrase;
        }
        const instance = new ExchangeClass(exchangeConfig);
        if (isTestnet && isBinance) {
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
            }
            else {
                instance.setSandboxMode(true);
                this.logger.log(`🔑 Balance fetch: Binance Spot Testnet via CCXT sandbox mode (exchange=${exchange}, testnet=${testnet})`);
            }
        }
        const BALANCE_TIMEOUT_MS = 15_000;
        const MAX_RETRIES = 1;
        let balance;
        let lastError = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                balance = await Promise.race([
                    instance.fetchBalance(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error(`انتهت مهلة جلب الرصيد من ${exchange} (${BALANCE_TIMEOUT_MS / 1000}s)`)), BALANCE_TIMEOUT_MS)),
                ]);
                lastError = null;
                break;
            }
            catch (fetchError) {
                lastError = fetchError.message || 'Unknown error';
                this.logger.warn(`⚠️ V164d Balance fetch attempt ${attempt + 1} failed for ${exchange}/${label}: ` +
                    `[${fetchError.constructor?.name || 'Unknown'}] ${lastError}`);
                if (attempt < MAX_RETRIES && ((lastError || '').includes('timeout') || (lastError || '').includes('ETIMEDOUT') ||
                    (lastError || '').includes('ECONNREFUSED') || (lastError || '').includes('ECONNRESET') ||
                    (lastError || '').includes('network') || (lastError || '').includes('socket'))) {
                    this.logger.warn(`⚠️ Balance fetch attempt ${attempt + 1} failed for ${exchange}/${label}: ${lastError} — retrying...`);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                break;
            }
        }
        if (lastError && !balance) {
            const errMsg = lastError;
            this.logger.warn(`⚠️ V164d Balance fetch failed for ${exchange}/${label} after ${MAX_RETRIES + 1} attempts: ${errMsg}`);
            if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED') ||
                errMsg.includes('ECONNRESET') || errMsg.includes('network') || errMsg.includes('سحب')) {
                return {
                    exchange, label, credentialId, isTestnet,
                    equity: 0, available: 0, currency: 'USD', usedMargin: 0, assets: [],
                    error: `تعذر الاتصال بالبورصة — يرجى المحاولة لاحقاً`,
                    errorDetail: errMsg.substring(0, 200),
                };
            }
            if (this._isAuthError(errMsg)) {
                return {
                    exchange, label, credentialId, isTestnet,
                    equity: 0, available: 0, currency: 'USD', usedMargin: 0, assets: [],
                    error: `مفتاح API غير صالح أو منتهي الصلاحية — يرجى حذفه وإضافته مرة أخرى`,
                    errorDetail: errMsg.substring(0, 200),
                };
            }
            return {
                exchange, label, credentialId, isTestnet,
                equity: 0, available: 0, currency: 'USD', usedMargin: 0, assets: [],
                error: `خطأ في جلب الرصيد: ${errMsg.substring(0, 100)}`,
                errorDetail: errMsg.substring(0, 200),
            };
        }
        if (!balance || typeof balance !== 'object') {
            return {
                exchange, label, credentialId, isTestnet,
                equity: 0, available: 0, currency: 'USD', usedMargin: 0, assets: [],
                error: 'لم يتم استلام بيانات الرصيد من البورصة',
            };
        }
        const DUST_THRESHOLD = 0.0001;
        const INTERNAL_PREFIXES = ['LD', 'NFT', 'BETH'];
        const assets = [];
        for (const [currency, data] of Object.entries(balance)) {
            if (['free', 'used', 'total', 'info', 'timestamp', 'datetime', 'nonce'].includes(currency))
                continue;
            if (typeof data === 'object' && data !== null && 'free' in data) {
                const d = data;
                const total = Number(d.total) || 0;
                if (total <= DUST_THRESHOLD)
                    continue;
                if (INTERNAL_PREFIXES.some(prefix => currency.toUpperCase().startsWith(prefix)))
                    continue;
                assets.push({
                    currency,
                    free: Number(d.free) || 0,
                    used: Number(d.used) || 0,
                    total,
                });
            }
        }
        const usdtFree = balance.free?.USDT || balance.free?.USD || 0;
        const usdtUsed = balance.used?.USDT || balance.used?.USD || 0;
        const usdtTotal = balance.total?.USDT || balance.total?.USD || 0;
        let equity;
        let available;
        if (usdtTotal > 0) {
            equity = usdtTotal;
            available = usdtFree;
        }
        else {
            const USD_PRICES = {
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
                if (assetTotal <= 0)
                    continue;
                const price = USD_PRICES[asset.currency.toUpperCase()] || 0;
                totalUsd += assetTotal * price;
                freeUsd += assetFree * price;
            }
            equity = totalUsd || assets.reduce((sum, a) => sum + a.total, 0);
            available = freeUsd || assets.reduce((sum, a) => sum + a.free, 0);
        }
        const exchangeUsedMargin = usdtUsed;
        this.logger.log(`💰 Balance fetched from ${exchange}/${label}: equity=$${equity}, available=$${available}, ` +
            `usedMargin=$${exchangeUsedMargin}, ${assets.length} assets`);
        return {
            exchange,
            label,
            credentialId,
            isTestnet,
            equity,
            available,
            currency: 'USD',
            usedMargin: exchangeUsedMargin,
            assets,
        };
    }
    _encrypt(plaintext) {
        const iv = crypto.randomBytes(12);
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
    _decrypt(data) {
        try {
            const iv = Buffer.from(data.iv, 'hex');
            const authTag = Buffer.from(data.authTag, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            this.logger.error(`Failed to decrypt credential: ${error.message}. ` +
                `This usually means the ENCRYPTION_KEY has changed since the credential was stored. ` +
                `The credential needs to be re-added with the current encryption key.`);
            throw new common_1.BadRequestException('فشل فك تشفير بيانات الاعتماد — يرجى حذف المفتاح وإضافته مرة أخرى');
        }
    }
    async _validateApiKey(exchange, apiKey, apiSecret, passphrase, testnet = false) {
        const TIMEOUT_MS = 10_000;
        const validationPromise = this._doValidateApiKey(exchange, apiKey, apiSecret, passphrase, testnet);
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                this.logger.warn(`⏱ API key validation for ${exchange} timed out after ${TIMEOUT_MS / 1000}s — ` +
                    `REJECTING the key for safety. User should try again later.`);
                resolve({ valid: false, error: `انتهت مهلة التحقق من مفتاح API (${TIMEOUT_MS / 1000}s). يرجى المحاولة مرة أخرى.` });
            }, TIMEOUT_MS);
        });
        return Promise.race([validationPromise, timeoutPromise]);
    }
    async _doValidateApiKey(exchange, apiKey, apiSecret, passphrase, testnet = false) {
        const isBinance = exchange.toLowerCase().startsWith('binance');
        const isBinanceTest = testnet || exchange === 'binance_test' || exchange === 'binance_future_test' || (isBinance && exchange !== 'binance');
        try {
            const normalizedExchange = isBinance ? 'binance' : exchange;
            const ExchangeClass = ccxt[normalizedExchange];
            if (!ExchangeClass) {
                this.logger.warn(`Exchange "${exchange}" not found in CCXT — accepting with read-only permissions`);
                return { valid: true, permissions: ['read', 'trade'] };
            }
            const exchangeConfig = {
                apiKey,
                secret: apiSecret,
                enableRateLimit: true,
                options: {
                    defaultType: exchange === 'binance_future_test' ? 'future' : 'spot',
                    adjustForTimeDifference: true,
                },
            };
            if (passphrase) {
                exchangeConfig.password = passphrase;
            }
            if (exchange.toLowerCase() === 'alpaca') {
                const isPaperKey = apiKey.startsWith('PK') || apiSecret.startsWith('PK');
                if (isPaperKey) {
                    exchangeConfig.urls = {
                        api: {
                            ...(ExchangeClass.urls?.api || {}),
                            account: 'https://paper-api.alpaca.markets/v2',
                        },
                    };
                    this.logger.log('🔑 Alpaca paper-trading key detected — configured paper trading endpoint');
                }
                else {
                    this.logger.log('🔑 Alpaca live-trading key detected — using default endpoint');
                }
            }
            const exchangeInstance = new ExchangeClass(exchangeConfig);
            if (isBinanceTest) {
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
                }
                else {
                    exchangeInstance.setSandboxMode(true);
                    this.logger.log(`🔑 Validating Binance Spot Testnet via CCXT sandbox mode (exchange=${exchange}, testnet=${testnet})`);
                }
            }
            try {
                const balance = await exchangeInstance.fetchBalance();
                const permissions = ['read'];
                if (balance && Object.keys(balance).length > 0) {
                    permissions.push('trade');
                }
                return { valid: true, permissions };
            }
            catch (balanceError) {
                const balanceMessage = balanceError.message || '';
                if (this._isAuthError(balanceMessage)) {
                    if (exchange.toLowerCase().includes('binance')) {
                        const testnetHint = isBinanceTest
                            ? ' تأكد أن المفتاح من Binance Testnet وليس من الحساب الحي، وأن صلاحية القراءة مفعلة وأن قيود IP تسمح بخادم المنصة.'
                            : ' إذا كنت تستخدم مفتاح Testnet، اختر "Binance Spot Testnet" أو "Binance Futures Testnet" بدلاً من "Binance". تأكد أيضاً من تفعيل صلاحية القراءة وقيود IP.';
                        return { valid: false, error: `تعذر قراءة رصيد Binance بهذا المفتاح.${testnetHint}` };
                    }
                    try {
                        if (typeof exchangeInstance.fetchTicker === 'function') {
                            await exchangeInstance.fetchTicker('BTC/USDT');
                            this.logger.log(`API key validated via fetchTicker (balance failed with: ${balanceMessage.substring(0, 60)})`);
                            return { valid: true, permissions: ['read', 'trade'] };
                        }
                    }
                    catch (tickerErr) {
                        if (this._isAuthError(tickerErr.message || '')) {
                            const testnetHint2 = isBinanceTest
                                ? ' تأكد أن المفتاح من Binance Testnet وليس من الحساب الحي.'
                                : ' إذا كنت تستخدم مفتاح Testnet، اختر "Binance Spot Testnet" أو "Binance Futures Testnet" بدلاً من "Binance".';
                            return { valid: false, error: `مفتاح API غير صالح أو منتهي الصلاحية.${testnetHint2}` };
                        }
                    }
                    const testnetHint = isBinanceTest
                        ? ' تأكد أن المفتاح من Binance Testnet وليس من الحساب الحي.'
                        : ' إذا كنت تستخدم مفتاح Testnet، اختر "Binance Spot Testnet" أو "Binance Futures Testnet" بدلاً من "Binance".';
                    return { valid: false, error: `مفتاح API غير صالح أو منتهي الصلاحية.${testnetHint}` };
                }
                if (this._isConnectionError(balanceMessage)) {
                    this.logger.warn(`تعذر الاتصال بالبورصة ${exchange}: ${balanceMessage.substring(0, 80)}`);
                    return { valid: true, permissions: ['read', 'trade'] };
                }
                if (balanceMessage.includes('Permission') || balanceMessage.includes('forbidden') ||
                    balanceMessage.includes('IP ban') || balanceMessage.includes('ip not allowed')) {
                    if (exchange.toLowerCase().includes('binance')) {
                        return {
                            valid: false,
                            error: 'مفتاح Binance لا يستطيع قراءة الرصيد. فعّل صلاحية القراءة وتأكد من قيود IP أو أضف IP الخادم في Binance.',
                        };
                    }
                    this.logger.warn(`Key valid but restricted: ${balanceMessage.substring(0, 100)}`);
                    return { valid: true, permissions: ['read', 'trade'] };
                }
                try {
                    if (typeof exchangeInstance.fetchTicker === 'function') {
                        await exchangeInstance.fetchTicker('BTC/USDT');
                        this.logger.log(`API key validated via fetchTicker (balance check failed: ${balanceMessage.substring(0, 60)})`);
                        return { valid: true, permissions: ['read', 'trade'] };
                    }
                }
                catch (tickerError) {
                    const tickerMessage = tickerError.message || '';
                    if (this._isAuthError(tickerMessage)) {
                        return { valid: false, error: 'مفتاح API غير صالح أو منتهي الصلاحية' };
                    }
                    if (this._isConnectionError(tickerMessage)) {
                        this.logger.warn(`تعذر الاتصال بالبورصة ${exchange}: ${tickerMessage.substring(0, 80)}`);
                        return { valid: true, permissions: ['read', 'trade'] };
                    }
                }
                this.logger.warn(`Could not fully verify API key for ${exchange} (non-auth error): ${balanceMessage.substring(0, 100)}` +
                    ` — accepting with trade permissions. Key will be validated on first use.`);
                return { valid: true, permissions: ['read', 'trade'] };
            }
        }
        catch (error) {
            const message = error.message || 'Unknown error';
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
            this.logger.warn(`Accepting API key for ${exchange} despite validation error: ${message.substring(0, 100)}`);
            return { valid: true, permissions: ['read', 'trade'] };
        }
    }
    _isAuthError(message) {
        const authErrorPatterns = [
            'Invalid API', 'invalid api key', 'invalid signature',
            'API-key format invalid', 'Invalid API-key', 'authentication error',
            'auth error', 'invalid key',
        ];
        const ipRestrictionPatterns = [
            'access denied', 'ip not allowed', 'ip ban', 'IP restriction',
            'whitelist', 'source ip', 'for this ip address',
        ];
        const lower = message.toLowerCase();
        if (ipRestrictionPatterns.some(p => lower.includes(p.toLowerCase()))) {
            this.logger.warn(`API key is valid but has IP restriction — accepting with warning: ${message.substring(0, 100)}`);
            return false;
        }
        return authErrorPatterns.some(p => lower.includes(p.toLowerCase()));
    }
    async getServerOutboundIp() {
        try {
            const https = await Promise.resolve().then(() => __importStar(require('https')));
            const ip = await new Promise((resolve, reject) => {
                const req = https.get('https://api.ipify.org', (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data.trim()));
                });
                req.on('error', reject);
                req.setTimeout(5000, () => { req.destroy(); reject(new Error('IP detection timeout')); });
            });
            this.logger.log(`🌐 V165 Server outbound IP: ${ip}`);
            return ip;
        }
        catch (error) {
            this.logger.warn(`Failed to detect server IP: ${error.message}`);
            return 'unknown';
        }
    }
    invalidateBalanceCache(userId) {
        const cacheKey = `balances:${userId}`;
        const deleted = this.balanceCache.delete(cacheKey);
        if (deleted) {
            this.logger.debug(`🗑️ Balance cache invalidated for user ${userId}`);
        }
    }
    _isConnectionError(message) {
        const connectionErrorPatterns = [
            'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'network',
            'timeout', 'rate limit', 'Too Many Requests', '429',
            'ENOTFOUND', 'EAI_AGAIN', 'socket hang up', 'connect ETIMEDOUT',
            'SSL', 'CERT', 'unable to connect',
        ];
        const lower = message.toLowerCase();
        return connectionErrorPatterns.some(p => lower.includes(p.toLowerCase()));
    }
    async testExchangeConnectivity(exchange, userId) {
        const start = Date.now();
        let serverIp = 'unknown';
        try {
            const https = await Promise.resolve().then(() => __importStar(require('https')));
            serverIp = await new Promise((resolve) => {
                const req = https.get('https://api.ipify.org', (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data.trim() || 'unknown'));
                });
                req.on('error', () => resolve('unknown'));
                req.setTimeout(5000, () => { req.destroy(); resolve('unknown'); });
            });
        }
        catch { }
        this.logger.log(`🌐 V164d Server outbound IP: ${serverIp}`);
        try {
            const normalizedExchange = exchange.toLowerCase().startsWith('binance') ? 'binance' : exchange.toLowerCase();
            const ExchangeClass = ccxt[normalizedExchange];
            if (!ExchangeClass) {
                return { exchange, reachable: false, latencyMs: 0, error: `Exchange "${exchange}" not supported by CCXT` };
            }
            const instance = new ExchangeClass({
                enableRateLimit: true,
                timeout: 15000,
                options: { adjustForTimeDifference: true },
            });
            try {
                const pingStart = Date.now();
                await instance.publicGetPing?.() || await instance.fetchTime();
                const pingMs = Date.now() - pingStart;
                this.logger.log(`✅ V164 Connectivity test: ${exchange} ping OK (${pingMs}ms)`);
                let authTest = { hasCredentials: false };
                if (userId) {
                    const credentials = await this.prisma.exchangeCredential.findMany({
                        where: { userId, isValid: true, exchange: { startsWith: normalizedExchange } },
                        take: 1,
                    });
                    if (credentials.length > 0) {
                        const cred = credentials[0];
                        authTest.hasCredentials = true;
                        let authStart = Date.now();
                        try {
                            const decrypted = await this.decryptCredential(cred.id, userId);
                            const authInstance = new ExchangeClass({
                                apiKey: decrypted.apiKey,
                                secret: decrypted.apiSecret,
                                password: decrypted.passphrase,
                                enableRateLimit: true,
                                timeout: 15000,
                                options: { adjustForTimeDifference: true, defaultType: 'spot' },
                            });
                            if (cred.exchange === 'binance_test' || cred.exchange === 'binance_future_test') {
                                authInstance.setSandboxMode(true);
                            }
                            authStart = Date.now();
                            const balance = await authInstance.fetchBalance();
                            const authMs = Date.now() - authStart;
                            const usdtTotal = balance.total?.USDT || balance.total?.USD || 0;
                            authTest = {
                                ...authTest,
                                success: true,
                                latencyMs: authMs,
                                balanceEquity: usdtTotal,
                            };
                            this.logger.log(`✅ V164 Auth test: ${exchange} balance fetch OK (${authMs}ms, equity=$${usdtTotal})`);
                        }
                        catch (authError) {
                            const authMs = Date.now() - authStart;
                            authTest = {
                                ...authTest,
                                success: false,
                                latencyMs: authMs,
                                error: `[${authError.constructor?.name || 'Unknown'}] ${authError.message || String(authError)}`,
                                errorType: authError.constructor?.name || 'Unknown',
                            };
                            this.logger.warn(`❌ V164 Auth test: ${exchange} balance fetch FAILED (${authMs}ms): ${authError.message}`);
                        }
                    }
                }
                return { exchange, reachable: true, latencyMs: pingMs, serverTime: Date.now(), serverIp, authTest };
            }
            catch (pingError) {
                const pingMs = Date.now() - start;
                const errMsg = pingError.message || String(pingError);
                const errType = pingError.constructor?.name || 'Unknown';
                this.logger.warn(`❌ V164 Connectivity test: ${exchange} ping FAILED (${pingMs}ms): [${errType}] ${errMsg}`);
                return {
                    exchange,
                    reachable: false,
                    latencyMs: pingMs,
                    error: `[${errType}] ${errMsg}`,
                    errorType: errType,
                    serverIp,
                };
            }
        }
        catch (error) {
            return {
                exchange,
                reachable: false,
                latencyMs: Date.now() - start,
                error: error.message || String(error),
                errorType: error.constructor?.name || 'Unknown',
            };
        }
    }
};
exports.CredentialsService = CredentialsService;
exports.CredentialsService = CredentialsService = CredentialsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        prisma_extension_service_1.PrismaExtensionService,
        config_1.ConfigService,
        audit_service_1.AuditService])
], CredentialsService);
//# sourceMappingURL=credentials.service.js.map