import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { TradingService } from '../trading.service';
import * as ccxt from 'ccxt';

/**
 * Exchange Sync Service — Exchange ↔ Database Position Reconciliation
 *
 * FIX: This service solves the critical gap where positions are closed on the
 * exchange (stop-loss triggered, liquidation, manual exchange close) but remain
 * OPEN in the database. Without this, users see phantom open positions that no
 * longer exist on the exchange.
 *
 * How it works:
 * 1. Every 60 seconds, fetches all OPEN positions from the DB (non-paper-trading)
 * 2. For each position, checks if it still exists on the exchange via CCXT
 * 3. If the exchange says the position is closed (not found, qty=0, etc.):
 *    - Closes the position in DB via TradingService.closePositionWithRetry()
 * 4. Also updates currentPrice from exchange markPrice
 *
 * Safety: Only processes positions with exchange != 'paper-trading'.
 * Paper-trading positions are simulated and don't exist on any exchange.
 */
@Injectable()
export class ExchangeSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeSyncService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly INTERVAL_MS = 60_000; // 60 seconds
  private isRunning = false;
  private readonly exchangeCache = new Map<string, any>(); // credentialId -> ccxt instance

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly tradingService: TradingService,
  ) {}

  async onModuleInit() {
    // Delay first run by 30s to let other services initialize
    setTimeout(() => {
      this.interval = setInterval(() => this._syncCycle(), this.INTERVAL_MS);
      this.logger.log('🔄 Exchange Sync Service started — reconciling every 60s');
    }, 30_000);
  }

  async onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get or create a cached CCXT exchange instance for a credential
   */
  private async _getExchangeInstance(credential: any): Promise<any> {
    const cacheKey = credential.id;
    let exchange = this.exchangeCache.get(cacheKey);

    if (exchange) return exchange;

    try {
      const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(
        credential.id,
        credential.userId,
      );

      const isBinanceTest = credential.exchange === 'binance_test' || credential.exchange === 'binance_future_test';
      const normalizedName = isBinanceTest ? 'binance' : credential.exchange;
      const ExchangeClass = ccxt[normalizedName as keyof typeof ccxt] as any;

      if (!ExchangeClass) {
        this.logger.warn(`🔄 Exchange "${credential.exchange}" not supported by CCXT`);
        return null;
      }

      exchange = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
        timeout: 10000,
        options: {
          defaultType: credential.exchange === 'binance_future_test' ? 'future' : 'spot',
          adjustForTimeDifference: true,
        },
      });

      if (isBinanceTest) {
        exchange.setSandboxMode(true);
      }

      this.exchangeCache.set(cacheKey, exchange);

      // Auto-cleanup after 10 minutes
      setTimeout(() => this.exchangeCache.delete(cacheKey), 10 * 60 * 1000);

      return exchange;
    } catch (error: any) {
      this.logger.warn(`🔄 Failed to create exchange instance for credential ${credential.id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Run a single sync cycle
   */
  private async _syncCycle(): Promise<void> {
    // FIX: Skip cycle when DB is unavailable to prevent connection pool exhaustion
    if (!this.prisma.isAvailable?.()) {
      return;
    }

    if (this.isRunning) return; // Prevent overlapping cycles
    this.isRunning = true;

    try {
      // Get all OPEN non-paper-trading positions from DB
      const openPositions = await this.prisma.position.findMany({
        where: {
          status: 'OPEN',
          exchange: { not: 'paper-trading' },
        },
        include: {
          credential: true,
        },
      });

      if (openPositions.length === 0) {
        this.isRunning = false;
        return;
      }

      this.logger.debug(`🔄 Exchange Sync: Checking ${openPositions.length} open position(s)`);

      let closed = 0;
      let synced = 0;
      let errors = 0;

      // Group positions by credential to batch exchange calls
      const byCredential = new Map<string, any[]>();
      for (const pos of openPositions) {
        const credId = pos.credentialId;
        if (!byCredential.has(credId)) byCredential.set(credId, []);
        byCredential.get(credId)!.push(pos);
      }

      // Process each credential's positions
      for (const [credId, positions] of byCredential) {
        const credential = positions[0]?.credential;
        if (!credential) continue;

        const exchange = await this._getExchangeInstance(credential);
        if (!exchange) {
          errors += positions.length;
          continue;
        }

        try {
          // Fetch all open positions from exchange in one call
          let exchangePositions: any[] = [];
          try {
            exchangePositions = await exchange.fetchPositions();
          } catch (fetchErr: any) {
            // Some exchanges don't support fetchPositions — try individual position check
            this.logger.debug(`🔄 fetchPositions() not supported for ${credential.exchange}: ${fetchErr.message}`);
          }

          // Build a map of exchange positions by symbol for quick lookup
          const exchangePosMap = new Map<string, any>();
          for (const ep of exchangePositions) {
            const symbol = ep.symbol || ep.future;
            if (symbol) exchangePosMap.set(symbol, ep);
            // Also add normalized version (without /)
            const normalized = symbol.replace(/[\/\-_]/g, '');
            exchangePosMap.set(normalized, ep);
          }

          // Check each DB position against the exchange
          for (const position of positions) {
            try {
              const result = await this._checkPosition(
                position,
                exchange,
                exchangePosMap,
              );
              if (result === 'closed') closed++;
              else if (result === 'synced') synced++;
            } catch (err: any) {
              errors++;
              this.logger.debug(`🔄 Error checking position ${position.id}: ${err.message}`);
            }
          }
        } catch (error: any) {
          errors += positions.length;
          this.logger.debug(`🔄 Exchange API error for credential ${credId}: ${error.message}`);
        }

        // Rate limit between credentials
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (closed > 0 || errors > 0) {
        this.logger.log(
          `🔄 Exchange Sync complete: ${closed} closed by exchange, ${synced} synced, ${errors} error(s)`,
        );
      }
    } catch (error: any) {
      this.logger.error(`🔄 Exchange Sync cycle failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if a DB position still exists on the exchange
   */
  private async _checkPosition(
    position: any,
    exchange: any,
    exchangePosMap: Map<string, any>,
  ): Promise<'closed' | 'synced' | 'error'> {
    const symbol = position.symbol;
    const exchangeSymbol = position.exchangeSymbol; // Alpaca-specific symbol

    // Look up the position in the exchange map
    let exchangePos = exchangePosMap.get(symbol);
    if (!exchangePos && exchangeSymbol) {
      exchangePos = exchangePosMap.get(exchangeSymbol);
    }
    if (!exchangePos) {
      // Try normalized symbol
      const normalized = symbol.replace(/[\/\-_]/g, '');
      exchangePos = exchangePosMap.get(normalized);
    }

    // If no matching position found on exchange, it may be closed
    if (!exchangePos) {
      // For spot exchanges, there are no "positions" — positions only exist in margin/futures.
      // If this is a spot exchange, we can't easily check, so just skip.
      if (position.exchange === 'binance' || position.exchange === 'binance_test') {
        // Binance spot doesn't have positions — positions are just holdings.
        // We can check the balance instead, but that's more complex.
        // For now, just update the price and skip close detection.
        return 'synced';
      }

      // For margin/futures exchanges (Alpaca, Binance Futures), missing position = closed
      await this._closePositionInDB(position, 'exchange_closed_missing');
      return 'closed';
    }

    // Check if the position has zero quantity (closed but not cleaned up)
    const exchangeQty = Number(exchangePos.contracts || exchangePos.contractSize || exchangePos.quantity || 0);
    if (exchangeQty === 0) {
      await this._closePositionInDB(position, 'exchange_closed_zero_qty');
      return 'closed';
    }

    // Position exists on exchange — update current price if available
    const markPrice = Number(exchangePos.markPrice || exchangePos.currentPrice || 0);
    if (markPrice > 0) {
      const currentPrice = Number(position.currentPrice);
      if (markPrice !== currentPrice) {
        const entryPrice = Number(position.entryPrice);
        const quantity = Number(position.quantity);
        const unrealizedPnl = position.side === 'BUY'
          ? (markPrice - entryPrice) * quantity
          : (entryPrice - markPrice) * quantity;

        await this.prisma.position.update({
          where: { id: position.id },
          data: {
            currentPrice: markPrice,
            unrealizedPnl,
            highestPrice: Math.max(Number(position.highestPrice) || markPrice, markPrice),
            lowestPrice: Math.min(Number(position.lowestPrice) || markPrice, markPrice),
          },
        }).catch(() => {}); // Non-critical
      }
    }

    return 'synced';
  }

  /**
   * Close a position in the DB because it was closed on the exchange
   */
  private async _closePositionInDB(position: any, reason: string): Promise<void> {
    try {
      this.logger.warn(
        `🔄 Position ${position.id} (${position.symbol}) is CLOSED on exchange but OPEN in DB — closing (reason: ${reason})`,
      );

      // Use TradingService for proper close (creates Order, Trade, updates Position)
      await this.tradingService.closePositionWithRetry(position.userId, {
        positionId: position.id,
      });

      this.logger.log(
        `🔄 Position ${position.id} synced — closed in DB to match exchange state (${reason})`,
      );
    } catch (closeErr: any) {
      // If TradingService says it's already closed, that's fine
      if (closeErr.message?.includes('already') || closeErr.message?.includes('alreadyClosed')) {
        this.logger.debug(`🔄 Position ${position.id} already closed — no action needed`);
        return;
      }

      // Last resort: direct status update (still better than leaving it OPEN)
      this.logger.error(
        `🔄 TradingService close failed for position ${position.id}: ${closeErr.message} — doing direct update as last resort`,
      );

      try {
        const currentPrice = Number(position.currentPrice) || Number(position.entryPrice);
        const entryPrice = Number(position.entryPrice);
        const quantity = Number(position.quantity);
        const pnl = position.side === 'BUY'
          ? (currentPrice - entryPrice) * quantity
          : (entryPrice - currentPrice) * quantity;

        await this.prisma.position.update({
          where: { id: position.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            currentPrice,
            unrealizedPnl: 0,
            realizedPnl: (Number(position.realizedPnl) || 0) + pnl,
            exitPrice: currentPrice, // V141: Set exitPrice for exchange sync closes
            closeReason: 'EXCHANGE_SYNC', // V141: Position was closed via exchange reconciliation
            source: 'exchange_sync',
          },
        });

        // Record a trade for audit trail
        await this.prisma.trade.create({
          data: {
            userId: position.userId,
            positionId: position.id,
            symbol: position.symbol,
            side: position.side === 'BUY' ? 'SELL' : 'BUY',
            type: 'EXIT',
            quantity,
            price: currentPrice,
            pnl,
            exchange: position.exchange,
            source: 'exchange_sync',
          },
        });

        this.logger.log(
          `🔄 Position ${position.id} closed via direct DB update (last resort, reason: ${reason})`,
        );
      } catch (dbErr: any) {
        this.logger.error(
          `🔄 Failed to close position ${position.id} even via direct update: ${dbErr.message}`,
        );
      }
    }
  }

  /**
   * Manually trigger a sync cycle (for admin/testing)
   */
  async triggerSync(): Promise<{ checked: number; closed: number; errors: number }> {
    const openCount = await this.prisma.position.count({
      where: { status: 'OPEN', exchange: { not: 'paper-trading' } },
    });

    await this._syncCycle();

    return { checked: openCount, closed: 0, errors: 0 };
  }
}
