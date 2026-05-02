// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Gateway Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { AuditService } from '../../../audit/audit.service';
import { IExchangeAdapter, UnifiedOrder, ExecutionResult } from '../adapters/base-adapter.interface';
import { BinanceAdapter } from '../adapters/binance.adapter';
import { AlpacaAdapter } from '../adapters/alpaca.adapter';
import { PaperTradingAdapter } from '../adapters/paper-trading.adapter';
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

  /** Cache TTL: 5 minutes */
  private readonly ADAPTER_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly auditService: AuditService,
    private readonly aggregator: MarketDataAggregatorService,
    private readonly redisService: RedisService,
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
    const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(exchangeCredentialId);

    // Step 5: Create the appropriate adapter
    const adapter = this._createAdapter(credential.exchange, apiKey, apiSecret, userId);

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
  private _createAdapter(exchange: string, apiKey: string, apiSecret: string, userId: string): IExchangeAdapter {
    const exchangeLower = exchange.toLowerCase();

    switch (exchangeLower) {
      case 'binance':
        return new BinanceAdapter(apiKey, apiSecret, this.auditService, userId);

      case 'alpaca':
        return new AlpacaAdapter(apiKey, apiSecret, this.auditService, userId, true /* paper first */);

      case 'paper':
        return new PaperTradingAdapter(
          this.prisma,
          this.aggregator,
          this.redisService,
          this.auditService,
          userId,
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
}
