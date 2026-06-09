// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Gateway Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { AuditService } from '../../../audit/audit.service';
import { IExchangeAdapter, UnifiedOrder, ExecutionResult } from '../adapters/base-adapter.interface';
import { BinanceAdapter } from '../adapters/binance.adapter';
import { AlpacaAdapter } from '../adapters/alpaca.adapter';
import { PaperTradingAdapter } from '../adapters/paper-trading.adapter';
import { MT5Adapter } from '../adapters/mt5.adapter';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * ExecutionGatewayService — Exchange Adapter Router
 *
 * Central service that creates and returns the correct exchange adapter
 * based on the user's exchange credential. This decouples the execution
 * logic from specific exchange implementations.
 *
 * Architecture:
 * ┌───────────────────────────────────────────────────────────┐
 * │ OrderController / OrderQueueProcessor                     │
 * │    ↓                                                      │
 * │ ExecutionGatewayService.getAdapterForUser()               │
 * │    ↓                                                      │
 * │ ┌─────────────┐ ┌─────────────┐ ┌───────────────────┐    │
 * │ │ Binance      │ │ Alpaca      │ │ Paper Trading     │    │
 * │ │ Adapter      │ │ Adapter     │ │ Adapter           │    │
 * │ │ (CCXT)       │ │ (REST)      │ │ (Simulation)      │    │
 * │ └─────────────┘ └─────────────┘ └───────────────────┘    │
 * └───────────────────────────────────────────────────────────┘
 *
 * Adapter Selection Rules:
 * - "binance" exchange → BinanceAdapter (CCXT)
 * - "alpaca" exchange → AlpacaAdapter (REST API, paper first)
 * - "paper" exchange → PaperTradingAdapter (simulation)
 * - Any other CCXT-supported exchange → BinanceAdapter pattern (generic CCXT)
 *
 * Security:
 * - Re-validates credential permissions before every adapter creation
 * - Rejects credentials with withdraw/transfer permissions
 * - Decrypts API keys only at adapter creation time (never stored in memory)
 */
@Injectable()
export class ExecutionGatewayService {
  private readonly logger = new Logger(ExecutionGatewayService.name);

  /** Cache of adapters per credential (short-lived, cleared on error) */
  private readonly adapterCache: Map<string, { adapter: IExchangeAdapter; createdAt: number }> = new Map();

  /** V176 FIX: Reduced cache TTL from 5 minutes to 60 seconds.
   * Previously, adapters (containing decrypted API keys) lived in memory for 5 minutes.
   * This increased the window for memory-scraping attacks to extract keys.
   * Now: 60 seconds is sufficient for batching related orders while minimizing exposure. */
  private readonly ADAPTER_CACHE_TTL_MS = 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly auditService: AuditService,
    private readonly aggregator: MarketDataAggregatorService,
    private readonly redisService: RedisService,
    private readonly configService?: ConfigService,
  ) {
    this.logger.log('🚀 Execution Gateway initialized — adapter routing active');
  }

  /**
   * Get the appropriate exchange adapter for a user's exchange credential
   *
   * This method:
   * 1. Looks up the credential by ID
   * 2. Validates the credential is active and has trade permissions
   * 3. Re-checks for forbidden permissions (withdraw/transfer)
   * 4. Decrypts the API keys
   * 5. Creates and returns the appropriate adapter
   *
   * @param userId The user ID (for audit and adapter context)
   * @param exchangeCredentialId The credential ID to look up
   * @returns The appropriate IExchangeAdapter instance
   */
  async getAdapterForUser(userId: string, exchangeCredentialId: string): Promise<IExchangeAdapter> {
    this.logger.debug(`🔍 Getting adapter for credential: ${exchangeCredentialId}`);

    // Step 1: Check adapter cache
    const cached = this.adapterCache.get(exchangeCredentialId);
    if (cached && Date.now() - cached.createdAt < this.ADAPTER_CACHE_TTL_MS) {
      this.logger.debug(`📦 Using cached adapter for ${exchangeCredentialId}`);
      return cached.adapter;
    }

    // Step 2: Look up credential
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { id: exchangeCredentialId },
    });

    if (!credential) {
      throw new NotFoundException(`بيانات الاعتماد ${exchangeCredentialId} غير موجودة`);
    }

    if (!credential.isValid) {
      throw new NotFoundException('بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API');
    }

    // Step 3: Re-validate permissions (security: check before EVERY execution)
    await this._validatePermissions(credential, userId);

    // Step 4: Decrypt credentials
    // V181 FIX: Only skip decryption for PURE paper/simulation (no broker connection).
    // Previously, _isTestExchange() included mt5_demo and other broker demo accounts,
    // which caused their credentials (account number + password) to be replaced with
    // 'paper'/'paper' — making them completely non-functional.
    // MT5 accounts (both live and demo) need their real credentials decrypted.
    let apiKey: string;
    let apiSecret: string;
    let passphrase: string | undefined;
    if (this._isPaperOnly(credential.exchange)) {
      apiKey = 'paper';
      apiSecret = 'paper';
    } else {
      const decrypted = await this.credentialsService.decryptCredential(exchangeCredentialId, userId);
      apiKey = decrypted.apiKey;
      apiSecret = decrypted.apiSecret;
      passphrase = decrypted.passphrase;
    }

    // Step 5: Create the appropriate adapter
    const adapter = await this._createAdapter(credential.exchange, apiKey, apiSecret, userId, (credential as any).testnet === true, passphrase);

    // Step 6: Cache the adapter
    this.adapterCache.set(exchangeCredentialId, {
      adapter,
      createdAt: Date.now(),
    });

    // Audit log
    await this.auditService.log({
      userId,
      action: 'ADAPTER_CREATED',
      resource: 'execution-gateway',
      details: JSON.stringify({
        exchange: credential.exchange,
        credentialId: exchangeCredentialId,
      }),
    });

    this.logger.log(`🚀 Adapter created: ${adapter.getExchangeId()} for credential ${exchangeCredentialId}`);

    return adapter;
  }

  /**
   * Place an order using the appropriate adapter
   * Convenience method that combines getAdapter + placeOrder
   *
   * @param userId The user ID
   * @param order The unified order to execute
   * @returns Execution result from the exchange
   */
  async placeOrder(userId: string, order: UnifiedOrder): Promise<ExecutionResult> {
    this.logger.log(`📤 Placing order via gateway: ${order.side} ${order.quantity} ${order.symbol}`);

    try {
      const adapter = await this.getAdapterForUser(userId, order.exchangeCredentialId);
      const result = await adapter.placeOrder(order);

      // Clear cache on failure (credential might be invalid)
      if (!result.success) {
        this.adapterCache.delete(order.exchangeCredentialId);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`❌ Gateway order failed: ${error.message}`);

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Cancel an order using the appropriate adapter
   *
   * @param userId The user ID
   * @param exchangeCredentialId The credential to use
   * @param orderId The exchange order ID
   * @param symbol The trading pair symbol
   */
  async cancelOrder(
    userId: string,
    exchangeCredentialId: string,
    orderId: string,
    symbol: string,
  ): Promise<boolean> {
    try {
      const adapter = await this.getAdapterForUser(userId, exchangeCredentialId);
      return adapter.cancelOrder(orderId, symbol);
    } catch (error: any) {
      this.logger.error(`❌ Gateway cancel failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear the adapter cache (e.g., when a credential is updated)
   */
  clearCache(credentialId?: string): void {
    if (credentialId) {
      this.adapterCache.delete(credentialId);
    } else {
      this.adapterCache.clear();
    }
    this.logger.debug(`🗑️ Adapter cache cleared${credentialId ? ` for ${credentialId}` : ''}`);
  }

  // ── Private Helpers ──

  /**
   * Create the appropriate adapter based on exchange type
   */
  private async _createAdapter(exchange: string, apiKey: string, apiSecret: string, userId: string, isCredentialTestnet: boolean = false, passphrase?: string): Promise<IExchangeAdapter> {
    const exchangeLower = exchange.toLowerCase();

    switch (exchangeLower) {
      case 'binance':
        // FIX: Read BINANCE_TESTNET env var
        const isTestnet = this.configService?.get('BINANCE_TESTNET', 'false') === 'true' || isCredentialTestnet;
        return new BinanceAdapter(apiKey, apiSecret, this.auditService, userId, isTestnet, 'spot');
      
      case 'binance_test':
        return new BinanceAdapter(apiKey, apiSecret, this.auditService, userId, true /* isSandbox */, 'spot');
      
      case 'binance_future_test':
        return new BinanceAdapter(apiKey, apiSecret, this.auditService, userId, true /* isSandbox */, 'future');

      case 'alpaca':
        // V176 FIX: Support live Alpaca trading via ALPACA_LIVE_ENABLED env var.
        // Previously, paper mode was hardcoded to true, making live trading impossible.
        // Now: check env var AND credential testnet flag before defaulting to paper.
        // Safety: live mode requires explicit opt-in (env var OR credential flag).
        const isAlpacaLive = this.configService?.get('ALPACA_LIVE_ENABLED', 'false') === 'true'
          || isCredentialTestnet === false; // credential.testnet=false implies live intent
        const alpacaPaper = !isAlpacaLive; // Default to paper unless explicitly enabled
        if (isAlpacaLive) {
          this.logger.warn(`🔴 Alpaca LIVE mode activated for user ${userId} — real money at risk!`);
          await this.auditService.log({
            userId,
            action: 'ALPACA_LIVE_MODE_ACTIVATED',
            resource: 'execution-gateway',
            details: JSON.stringify({ credentialId: `${exchangeLower}-***`, isLive: true }),
          });
        }
        return new AlpacaAdapter(apiKey, apiSecret, this.auditService, userId, alpacaPaper);

      case 'paper':
      case 'paper-trading':  // FIX: DB stores 'paper-trading' but switch only matched 'paper'
                             // This was the ROOT CAUSE of ALL paper-trading orders failing — they
                             // fell through to the default case and created a BinanceAdapter with
                             // dummy API keys, which immediately fails on authentication.
                             // The RiskGatekeeper's _isTestExchange() correctly recognizes both
                             // 'paper' and 'paper-trading', but the ExecutionGateway did not.
        return new PaperTradingAdapter(
          this.prisma,
          this.aggregator,
          this.redisService,
          this.auditService,
          userId,
        );

      case 'mt5':
      case 'mt5_demo':
      case 'metatrader5':
      case 'metatrader':
        // MT5 integration via MetaAPI Cloud SDK.
        // apiKey = account number, apiSecret = password, passphrase = server name.
        // V181 FIX: MT5 Demo accounts are NO LONGER treated as paper trading.
        // They connect to a real MetaTrader broker and must enforce risk checks.
        const isMT5Demo = exchangeLower === 'mt5_demo' || isCredentialTestnet;
        return new MT5Adapter(
          this.prisma,
          this.auditService,
          userId,
          {
            accountId: apiKey,            // MT5 account number stored as apiKey
            password: apiSecret,          // MT5 password stored as apiSecret
            server: passphrase || '',     // MT5 server name from passphrase
            isDemo: isMT5Demo,
          },
        );

      default:
        // For other CCXT-supported exchanges, use the BinanceAdapter pattern
        // (generic CCXT adapter with the same implementation)
        this.logger.warn(`⚠️ Using generic CCXT adapter for exchange: ${exchange}`);
        return new BinanceAdapter(apiKey, apiSecret, this.auditService, userId);
    }
  }

  /**
   * Re-validate credential permissions before execution
   * SECURITY: This check runs before EVERY order execution
   */
  private async _validatePermissions(credential: any, userId: string): Promise<void> {
    // V181 FIX: Only skip permission validation for PURE paper/simulation.
    // Previously, mt5_demo and other broker demo accounts also bypassed this check,
    // which was wrong because they use real broker credentials that need validation.
    if (this._isPaperOnly(credential.exchange)) {
      this.logger.debug(`🛡️ Paper-only exchange "${credential.exchange}" permission check: BYPASSED (pure simulation)`);
      return;
    }
    // MT5 accounts don't use CCXT permission model — they use account/password
    if (this._isMT5Exchange(credential.exchange)) {
      this.logger.debug(`🛡️ MT5 exchange "${credential.exchange}" — skipping CCXT permission check (uses MetaAPI auth)`);
      return;
    }

    const FORBIDDEN_PERMISSIONS = ['withdraw', 'transfer', 'withdrawal', 'internaltransfer'];

    try {
      const permissions = JSON.parse(credential.permissions || '["read"]');

      const hasForbidden = permissions.some((p: string) =>
        FORBIDDEN_PERMISSIONS.includes(p.toLowerCase()),
      );

      if (hasForbidden) {
        // CRITICAL: Invalidate the credential immediately
        await this.prisma.exchangeCredential.update({
          where: { id: credential.id },
          data: { isValid: false },
        });

        await this.auditService.log({
          userId,
          action: 'CREDENTIAL_REVOKED_FORBIDDEN_PERMISSION',
          resource: 'execution-gateway',
          details: JSON.stringify({
            credentialId: credential.id,
            exchange: credential.exchange,
            permissions,
          }),
        });

        throw new NotFoundException(
          '🚫 تم إلغاء بيانات الاعتماد — تحتوي على صلاحيات سحب أو تحويل ممنوعة!',
        );
      }

      // Verify trade permission exists
      if (!permissions.includes('trade')) {
        throw new NotFoundException(
          'مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade.',
        );
      }
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      // On parse error, REJECT execution — safer than allowing with warning
      this.logger.error(`Could not parse permissions for credential ${credential.id} — BLOCKING execution for safety`);
      throw new NotFoundException(
        'لا يمكن التحقق من صلاحيات مفتاح API — يرجى إعادة إنشاء المفتاح أو التحقق من إعدادات البورصة',
      );
    }
  }

  /**
   * V181: Check if the exchange is an MT5/MetaTrader variant.
   * MT5 accounts need special handling for permissions (no CCXT permission model).
   */
  private _isMT5Exchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    return ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'].includes(lower);
  }

  /**
   * Check if an exchange name represents a test/paper/simulation environment.
   * Mirrors the same logic in RiskGatekeeperService._isTestExchange().
   * V181: Removed mt5_demo from exact matches — broker demos are NOT paper.
   */
  private _isTestExchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    const exactMatches = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'];
    if (exactMatches.includes(lower)) return true;
    const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
    if (suffixes.some(s => lower.endsWith(s))) return true;
    if (lower.includes('testnet')) return true;
    return false;
  }

  /**
   * V181: Pure paper/simulation detection — NO real broker connection.
   * Same logic as RiskGatekeeperService._isPaperOnly().
   * Only these accounts should skip credential decryption and permission checks.
   */
  private _isPaperOnly(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    return ['paper-trading', 'paper', 'sandbox', 'simulation'].includes(lower);
  }
}
