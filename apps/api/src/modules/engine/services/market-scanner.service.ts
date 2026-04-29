// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Market Scanner Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { SignalGeneratorService } from '../../analytics/signal-generator.service';
import { AnalyticalAIService } from '../../analytics/analytical-ai.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { AuditService } from '../../../audit/audit.service';
import { isMarketOpen } from '../../../common/utils/market-hours.util';

/**
 * Market Scanner Service — Autonomous Market Surveillance
 *
 * Periodically scans configured watchlists and popular symbols
 * for trading opportunities. When a high-confidence signal is
 * detected, it generates and stores a signal for bot execution.
 *
 * Scan Strategy:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Load user's watchlists + default symbols                │
 * │ 2. For each symbol: fetch aggregated quote                 │
 * │ 3. Run technical analysis (if data available)              │
 * │ 4. Generate signal if technical score > threshold          │
 * │ 5. Store signal if confidence >= 70%                       │
 * │ 6. Notify via Redis pub/sub for real-time updates          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Frequency: Every 5 minutes
 * Symbols: Watchlist + top crypto + top stocks
 */
@Injectable()
export class MarketScannerService {
  private readonly logger = new Logger(MarketScannerService.name);

  /** Minimum confidence to store a signal */
  private readonly MIN_CONFIDENCE = 70;

  /** Minimum technical score for BUY/SELL */
  private readonly MIN_TECH_SCORE = 30;

  /** Default symbols to always scan */
  private readonly DEFAULT_SYMBOLS = [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
    'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL',
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD',
  ];

  /** Symbols being scanned in current cycle */
  private isScanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly signalGenerator: SignalGeneratorService,
    private readonly analyticalAI: AnalyticalAIService,
    private readonly aggregator: MarketDataAggregatorService,
    private readonly audit: AuditService,
  ) {
    this.logger.log('🔍 Market Scanner initialized — surveillance active');
  }

  /**
   * Main scan cycle — runs every 5 minutes
   *
   * Fetches all symbols to scan, then processes them in batches
   * to avoid overwhelming the APIs.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runMarketScan(): Promise<void> {
    if (this.isScanning) {
      this.logger.warn('🔍 Previous scan still running — skipping this cycle');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();

    try {
      this.logger.log('🔍 Starting market scan cycle...');

      // Step 1: Collect all symbols to scan
      const symbols = await this._collectSymbols();
      this.logger.log(`🔍 Scanning ${symbols.length} symbols`);

      // Step 2: Process symbols in batches of 5 (to respect rate limits)
      const batchSize = 5;
      const results = {
        scanned: 0,
        signalsGenerated: 0,
        opportunitiesFound: 0,
        errors: 0,
      };

      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const batchResults = await this._processBatch(batch);

        results.scanned += batchResults.scanned;
        results.signalsGenerated += batchResults.signalsGenerated;
        results.opportunitiesFound += batchResults.opportunitiesFound;
        results.errors += batchResults.errors;

        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await this._sleep(1000);
        }
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `🔍 Scan complete: ${results.scanned} scanned, ${results.signalsGenerated} signals, ${results.opportunitiesFound} opportunities, ${results.errors} errors (${elapsed}ms)`,
      );

      // Store scan summary in Redis
      await this.redis.set(
        'scanner:last_scan',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          durationMs: elapsed,
          ...results,
        }),
        3600000, // 1 hour TTL
      );
    } catch (error: any) {
      this.logger.error(`🔍 Scan cycle failed: ${error.message}`);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Force a manual scan (via API)
   */
  async forceScan(userId: string, symbols?: string[]): Promise<any> {
    this.logger.log(`🔍 Manual scan triggered by user ${userId}`);

    const scanSymbols = symbols || await this._collectSymbols();
    const results = await this._processBatch(scanSymbols);

    await this.audit.log({
      userId,
      action: 'SCANNER_MANUAL_TRIGGER',
      resource: 'market-scanner',
      details: JSON.stringify({ symbols: scanSymbols, results }),
    });

    return {
      success: true,
      symbolsScanned: scanSymbols.length,
      ...results,
    };
  }

  /**
   * Get last scan results from Redis
   */
  async getLastScan(): Promise<any> {
    const cached = await this.redis.get('scanner:last_scan');
    return cached ? JSON.parse(cached) : null;
  }

  // ── Private: Symbol Collection ──

  /**
   * Collect all symbols to scan:
   * - Default symbols
   * - Symbols from all user watchlists
   * - Symbols from active signals
   */
  private async _collectSymbols(): Promise<string[]> {
    const symbolSet = new Set<string>(this.DEFAULT_SYMBOLS);

    try {
      // Add symbols from user watchlists (if table exists)
      const watchlists = await (this.prisma as any).watchlist?.findMany({
        select: { symbols: true },
      });

      if (watchlists) {
        for (const wl of watchlists) {
          if (Array.isArray(wl.symbols)) {
            wl.symbols.forEach((s: string) => symbolSet.add(s));
          }
        }
      }
    } catch {
      // Watchlist table might not exist yet
    }

    try {
      // Add symbols from active signals
      const activeSignals = await this.prisma.signal.findMany({
        where: { status: 'ACTIVE' },
        select: { pair: true },
        distinct: ['pair'],
      });

      activeSignals.forEach((s) => symbolSet.add(s.pair));
    } catch {
      // Signal table might not exist yet
    }

    return Array.from(symbolSet);
  }

  // ── Private: Batch Processing ──

  private async _processBatch(symbols: string[]): Promise<{
    scanned: number;
    signalsGenerated: number;
    opportunitiesFound: number;
    errors: number;
  }> {
    const results = { scanned: 0, signalsGenerated: 0, opportunitiesFound: 0, errors: 0 };

    for (const symbol of symbols) {
      try {
        results.scanned++;

        // ═══════════════════════════════════════════════════
        // MARKET HOURS GATE: Skip symbols whose markets are
        // currently closed (e.g., forex/stocks on weekends).
        // Crypto (24/7) is always allowed.
        // ═══════════════════════════════════════════════════
        const marketStatus = isMarketOpen(symbol);
        if (!marketStatus.open) {
          this.logger.debug(`🔍 Skipping ${symbol} — market closed: ${marketStatus.reason}`);
          continue;
        }

        // Step 1: Quick quote check
        const quote = await this.aggregator.getAggregatedQuote(symbol);

        if (!quote || quote.price === 0) {
          continue; // Skip if no data
        }

        // Step 2: Check for extreme moves (> 5% change)
        if (Math.abs(quote.changePercent) >= 5) {
          results.opportunitiesFound++;
          this.logger.log(`🚨 ${symbol} extreme move detected: ${quote.changePercent}%`);

          // Publish alert to Redis
          await this.redis.set(
            `scanner:alert:${symbol}`,
            JSON.stringify({
              symbol,
              changePercent: quote.changePercent,
              price: quote.price,
              timestamp: new Date().toISOString(),
            }),
            300000, // 5 min TTL
          );
        }

        // Step 3: Run full analysis for high-volatility or trending symbols
        if (Math.abs(quote.changePercent) >= 2) {
          try {
            const analysis = await this.analyticalAI.analyzeAsset(symbol);

            // If high confidence and clear direction, generate signal
            if (
              analysis.confidence >= this.MIN_CONFIDENCE &&
              analysis.sentiment !== 'NEUTRAL' &&
              analysis.sentiment !== 'MIXED'
            ) {
              // Get a system user or first admin to generate signal for
              const systemUser = await this._getSystemUser();
              if (systemUser) {
                // Pass pre-computed analysis to avoid double analysis
                const signal = await this.signalGenerator.generateSignal(systemUser.id, symbol, analysis);
                results.signalsGenerated++;

                this.logger.log(
                  `📡 Auto-signal generated: ${signal.action} ${symbol} (confidence: ${signal.confidence}%)`,
                );
              }
            }
          } catch (analysisError: any) {
            this.logger.debug(`Analysis failed for ${symbol}: ${analysisError.message}`);
          }
        }
      } catch (error: any) {
        results.errors++;
        this.logger.debug(`Scan error for ${symbol}: ${error.message}`);
      }
    }

    return results;
  }

  // ── Private: Helpers ──

  private async _getSystemUser(): Promise<{ id: string } | null> {
    try {
      // FIX: Prefer a PRO/PREMIUM tier user over the oldest user.
      // The oldest user might be a guest account; signals should be attributed
      // to a real user with appropriate permissions.
      const admin = await this.prisma.user.findFirst({
        where: { tier: { in: ['PRO', 'PREMIUM', 'INSTITUTIONAL'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (admin) return admin;

      // Fallback: any user (including guest) if no admin exists
      const user = await this.prisma.user.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return user;
    } catch {
      return null;
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
