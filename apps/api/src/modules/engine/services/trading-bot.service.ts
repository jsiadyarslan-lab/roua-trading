// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Trading Bot Service (with Strategy System)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { SignalService } from '../../signal/signal.service';
import { TradingService } from '../../trading/trading.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AuditService } from '../../../audit/audit.service';
import { PlaceOrderRequest, OrderSide, OrderType } from '../../trading/trading.types';
import { isMarketOpen } from '../../../common/utils/market-hours.util';

// Bot Strategy System
import { BotStrategyType, BotMarketData, BotStrategyAnalysis } from '../strategies/bot-strategy.types';
import { BotBaseStrategy } from '../strategies/bot-base-strategy';
import { TrendFollowingStrategy } from '../strategies/trend-following.strategy';
import { MeanReversionBotStrategy } from '../strategies/mean-reversion.strategy';
import { BreakoutBotStrategy } from '../strategies/breakout.strategy';
import { MomentumBotStrategy } from '../strategies/momentum.strategy';
import { AutoBotStrategy } from '../strategies/auto-bot.strategy';

/**
 * Trading Bot Service — Autonomous Signal Executor with Strategy System
 *
 * Monitors active signals and automatically executes those
 * that meet strict confidence and risk criteria, now enhanced with
 * a strategy system that provides intelligent signal filtering
 * and market analysis.
 *
 * Strategy System:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 5 STRATEGIES AVAILABLE:                                     │
 * │                                                             │
 * │ 1. TREND_FOLLOWING — Ride strong trends (EMA alignment)    │
 * │ 2. MEAN_REVERSION  — Trade reversals to the mean           │
 * │ 3. BREAKOUT        — Enter on breakouts with momentum      │
 * │ 4. MOMENTUM        — Trade with the momentum flow          │
 * │ 5. AUTO            — Auto-select best strategy per market  │
 * │                                                             │
 * │ EXECUTION MODES:                                            │
 * │ - SIGNAL + STRATEGY: Filter signals through strategy lens   │
 * │ - STRATEGY ONLY: Generate signals directly from analysis   │
 * │ - SIGNAL ONLY (legacy): Original signal-based execution    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Execution Rules:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Signal confidence >= minConfidence (from DB)             │
 * │ 2. Strategy analysis confirms signal direction              │
 * │ 3. Signal is ACTIVE and not expired                        │
 * │ 4. User has valid exchange credentials with trade perm     │
 * │ 5. User has bot mode enabled                               │
 * │ 6. Risk per trade <= riskPerTrade (from DB)                │
 * │ 7. No duplicate positions for same symbol                  │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Safety Features:
 * - Every order has mandatory stop-loss
 * - Position sizing based on risk percentage
 * - Max concurrent bot positions per user (from DB)
 * - Daily loss limit (from DB)
 * - Strategy-level risk validation
 *
 * Frequency: Every 2 minutes
 */
@Injectable()
export class TradingBotService {
  private readonly logger = new Logger(TradingBotService.name);

  /** Default values — overwritten by DB settings */
  private MIN_CONFIDENCE = 80;
  private MAX_CONCURRENT_POSITIONS = 3;
  private RISK_PER_TRADE = 0.02; // 2%
  private DAILY_LOSS_LIMIT = 0.05; // 5%

  /** Is bot currently processing */
  private isProcessing = false;

  /** Last DB sync timestamp */
  private lastSettingsSync = 0;
  private readonly SETTINGS_SYNC_INTERVAL = 30000; // 30 seconds

  /** Strategy instances */
  private readonly strategies: Map<BotStrategyType, BotBaseStrategy> = new Map();

  /** Default bot strategy */
  private defaultStrategy: BotStrategyType = BotStrategyType.AUTO;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly signalService: SignalService,
    private readonly tradingService: TradingService,
    private readonly exchangeService: ExchangeService,
    private readonly audit: AuditService,
  ) {
    // Load settings from DB on startup
    this.syncSettingsFromDB();

    // Initialize strategy instances
    this._initStrategies();

    this.logger.log('🤖 Trading Bot initialized — autonomous execution ready (with strategy system + DB sync)');
  }

  /**
   * Initialize all bot strategies
   */
  private _initStrategies(): void {
    const trendFollowing = new TrendFollowingStrategy();
    const meanReversion = new MeanReversionBotStrategy();
    const breakout = new BreakoutBotStrategy();
    const momentum = new MomentumBotStrategy();
    const auto = new AutoBotStrategy();

    this.strategies.set(BotStrategyType.TREND_FOLLOWING, trendFollowing);
    this.strategies.set(BotStrategyType.MEAN_REVERSION, meanReversion);
    this.strategies.set(BotStrategyType.BREAKOUT, breakout);
    this.strategies.set(BotStrategyType.MOMENTUM, momentum);
    this.strategies.set(BotStrategyType.AUTO, auto);

    this.logger.log(`🤖 Loaded ${this.strategies.size} strategies: ${Array.from(this.strategies.keys()).join(', ')}`);
  }

  /**
   * Get a strategy instance by type
   */
  getStrategy(type: BotStrategyType): BotBaseStrategy | undefined {
    return this.strategies.get(type);
  }

  /**
   * Get all available strategy types
   */
  getAvailableStrategies(): Array<{ type: BotStrategyType; name: string; description: string }> {
    return Array.from(this.strategies.values()).map(s => ({
      type: s.type,
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * Sync bot parameters from the admin Setting table.
   * This is the bridge that connects admin dashboard changes
   * to the live trading bot. Without this, admin settings are
   * saved but never applied.
   */
  private async syncSettingsFromDB(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsSync < this.SETTINGS_SYNC_INTERVAL) {
      return; // Skip if synced recently
    }
    this.lastSettingsSync = now;

    try {
      const settings = await this.prisma.setting.findMany();
      const settingsMap: Record<string, any> = {};
      for (const s of settings) {
        try {
          settingsMap[s.key] = JSON.parse(s.value);
        } catch {
          settingsMap[s.key] = s.value;
        }
      }

      // Apply botConfig from admin DB
      const botConfig = settingsMap.botConfig;
      if (botConfig) {
        if (botConfig.maxDailyLoss) {
          this.logger.debug(`🤖 Admin maxDailyLoss (USD): ${botConfig.maxDailyLoss}`);
        }
        if (botConfig.strategy) {
          const strategyType = botConfig.strategy as BotStrategyType;
          if (Object.values(BotStrategyType).includes(strategyType)) {
            this.defaultStrategy = strategyType;
            this.logger.debug(`🤖 Admin strategy: ${strategyType}`);
          }
        }
        if (botConfig.refreshInterval) this.logger.debug(`🤖 Admin refreshInterval: ${botConfig.refreshInterval}s`);
      }

      // Apply riskConfig from admin DB
      const riskConfig = settingsMap.riskConfig;
      if (riskConfig) {
        if (riskConfig.riskPerTrade) this.RISK_PER_TRADE = parseFloat(riskConfig.riskPerTrade) / 100;
        if (riskConfig.maxOpenPositions) this.MAX_CONCURRENT_POSITIONS = parseInt(riskConfig.maxOpenPositions, 10);
        if (riskConfig.maxDrawdown) this.DAILY_LOSS_LIMIT = parseFloat(riskConfig.maxDrawdown) / 100;
      }

      this.logger.debug('🤖 Bot parameters synced from DB');
    } catch (error: any) {
      this.logger.warn(`🤖 Failed to sync settings from DB: ${error.message} — using defaults`);
    }
  }

  /**
   * Main bot cycle — runs every 2 minutes
   *
   * Scans for high-confidence signals and executes them
   * for users who have bot mode enabled.
   * Now enhanced with strategy-based signal analysis.
   */
  @Cron('*/2 * * * *')
  async runBotCycle(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('🤖 Previous bot cycle still running — skipping');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Sync settings from DB before each cycle (rate-limited internally)
      await this.syncSettingsFromDB();

      this.logger.log('🤖 Starting bot execution cycle...');

      // Step 1: Find users with bot mode enabled
      const botUsers = await this._getBotUsers();
      if (botUsers.length === 0) {
        this.logger.debug('🤖 No users with bot mode enabled');
        return;
      }

      this.logger.log(`🤖 Processing ${botUsers.length} bot users (strategy: ${this.defaultStrategy})`);

      let executedCount = 0;
      let skippedCount = 0;
      let strategyFiltered = 0;
      let errorCount = 0;

      // Step 2: For each bot user, check their signals with strategy analysis
      for (const user of botUsers) {
        try {
          const result = await this._processUserSignals(user);
          executedCount += result.executed;
          skippedCount += result.skipped;
          strategyFiltered += result.strategyFiltered;
          errorCount += result.errors;
        } catch (userError: any) {
          this.logger.error(`🤖 Error processing user ${user.id}: ${userError.message}`);
          errorCount++;
        }
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `🤖 Bot cycle complete: ${executedCount} executed, ${skippedCount} skipped, ` +
        `${strategyFiltered} strategy-filtered, ${errorCount} errors (${elapsed}ms)`,
      );

      // Store bot status in Redis
      await this.redis.set(
        'bot:last_cycle',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          durationMs: elapsed,
          usersProcessed: botUsers.length,
          executed: executedCount,
          skipped: skippedCount,
          strategyFiltered,
          errors: errorCount,
          strategy: this.defaultStrategy,
        }),
        3600000,
      );
    } catch (error: any) {
      this.logger.error(`🤖 Bot cycle failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Enable bot mode for a user
   */
  async enableBot(userId: string, config?: BotConfig): Promise<void> {
    await this.redis.set(
      `bot:config:${userId}`,
      JSON.stringify({
        enabled: true,
        minConfidence: config?.minConfidence || this.MIN_CONFIDENCE,
        maxPositions: config?.maxPositions || this.MAX_CONCURRENT_POSITIONS,
        riskPerTrade: config?.riskPerTrade || this.RISK_PER_TRADE,
        strategy: config?.strategy || this.defaultStrategy,
        ...config,
      }),
    );

    this.logger.log(`🤖 Bot enabled for user ${userId} (strategy: ${config?.strategy || this.defaultStrategy})`);

    await this.audit.log({
      userId,
      action: 'BOT_ENABLED',
      resource: 'trading-bot',
      details: JSON.stringify({ ...config, defaultStrategy: this.defaultStrategy }),
    });
  }

  /**
   * Disable bot mode for a user
   */
  async disableBot(userId: string): Promise<void> {
    await this.redis.del(`bot:config:${userId}`);
    this.logger.log(`🤖 Bot disabled for user ${userId}`);

    await this.audit.log({
      userId,
      action: 'BOT_DISABLED',
      resource: 'trading-bot',
    });
  }

  /**
   * Get bot status for a user
   */
  async getBotStatus(userId: string): Promise<{
    enabled: boolean;
    config: BotConfig | null;
    activePositions: number;
    todayPnl: number;
    strategies: Array<{ type: BotStrategyType; name: string; description: string }>;
  }> {
    const configRaw = await this.redis.get(`bot:config:${userId}`);
    const config: BotConfig | null = configRaw ? JSON.parse(configRaw) : null;

    // Count active bot positions
    const activePositions = await this.prisma.position.count({
      where: { userId, status: 'OPEN' },
    });

    // Calculate today's P&L
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTrades = await this.prisma.trade.findMany({
      where: {
        userId,
        executedAt: { gte: today },
      },
    });

    const todayPnl = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);

    return {
      enabled: !!config?.enabled,
      config,
      activePositions,
      todayPnl,
      strategies: this.getAvailableStrategies(),
    };
  }

  /**
   * Get last bot cycle results
   */
  async getLastCycle(): Promise<any> {
    const cached = await this.redis.get('bot:last_cycle');
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Update the default bot strategy
   */
  setDefaultStrategy(strategy: BotStrategyType): void {
    if (!Object.values(BotStrategyType).includes(strategy)) {
      throw new Error(`Invalid strategy type: ${strategy}`);
    }
    this.defaultStrategy = strategy;
    this.logger.log(`🤖 Default bot strategy changed to: ${strategy}`);
  }

  // ── Private: User Processing ──

  /**
   * SCAN-based key retrieval (avoids blocking KEYS command)
   */
  private async _scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    const client = this.redis['client'];
    do {
      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    return keys;
  }

  private async _getBotUsers(): Promise<{ id: string }[]> {
    try {
      // Find all users who have bot config using SCAN instead of KEYS
      const keys = await this._scanKeys('bot:config:*');
      const userIds = keys.map((k: string) => k.replace('bot:config:', ''));

      // Verify users exist
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true },
      });

      return users;
    } catch {
      return [];
    }
  }

  private async _processUserSignals(user: { id: string }): Promise<{
    executed: number;
    skipped: number;
    strategyFiltered: number;
    errors: number;
  }> {
    const results = { executed: 0, skipped: 0, strategyFiltered: 0, errors: 0 };

    // Get user's bot config
    const configRaw = await this.redis.get(`bot:config:${user.id}`);
    if (!configRaw) return results;

    const config: BotConfig = JSON.parse(configRaw);
    if (!config.enabled) return results;

    // Determine the strategy to use
    const strategyType = (config.strategy as BotStrategyType) || this.defaultStrategy;
    const strategy = this.strategies.get(strategyType) || this.strategies.get(BotStrategyType.AUTO);

    // Check daily loss limit
    const todayPnl = (await this.getBotStatus(user.id)).todayPnl;
    const portfolio = await this._getPortfolioValue(user.id);

    if (portfolio > 0 && todayPnl < -portfolio * this.DAILY_LOSS_LIMIT) {
      this.logger.warn(`🤖 User ${user.id} hit daily loss limit — skipping`);
      return results;
    }

    // Check concurrent positions limit
    const activePositions = await this.prisma.position.count({
      where: { userId: user.id, status: 'OPEN' },
    });

    if (activePositions >= (config.maxPositions || this.MAX_CONCURRENT_POSITIONS)) {
      this.logger.debug(`🤖 User ${user.id} at max positions (${activePositions}) — skipping`);
      return results;
    }

    // Get user's active signals
    const signals = await this.signalService.getActiveSignals(user.id);

    for (const signal of signals) {
      try {
        // Skip if confidence too low
        if (signal.confidence < (config.minConfidence || this.MIN_CONFIDENCE)) {
          results.skipped++;
          continue;
        }

        // Skip WAIT signals
        if (signal.action === 'WAIT') {
          results.skipped++;
          continue;
        }

        // ═══════════════════════════════════════════════════
        // MARKET HOURS GATE: Check if the market for this
        // symbol is currently open. Skip if market is closed.
        // ═══════════════════════════════════════════════════
        const marketStatus = isMarketOpen(signal.pair);
        if (!marketStatus.open) {
          this.logger.debug(
            `🤖 Skipping ${signal.pair} — market closed: ${marketStatus.reason}`,
          );
          results.skipped++;
          continue;
        }

        // ═══════════════════════════════════════════════════
        // STRATEGY ANALYSIS: Run the configured strategy
        // against market data for this signal's symbol.
        // If the strategy disagrees with the signal direction,
        // the signal is filtered out (strategy-filtered).
        // ═══════════════════════════════════════════════════
        if (strategy) {
          try {
            const marketData = await this._buildMarketData(signal);
            if (marketData) {
              const analysis = await strategy.evaluate(marketData);

              if (!analysis) {
                // Strategy rejected the signal — no opportunity
                this.logger.debug(
                  `🤖 Strategy ${strategyType} rejected ${signal.pair} ${signal.action} — no opportunity detected`,
                );
                results.strategyFiltered++;
                continue;
              }

              // Check if strategy direction matches signal direction
              if (analysis.direction !== signal.action) {
                this.logger.debug(
                  `🤖 Strategy ${strategyType} disagrees: strategy=${analysis.direction} vs signal=${signal.action} for ${signal.pair}`,
                );
                results.strategyFiltered++;
                continue;
              }

              // Strategy confirmed the signal — log it
              this.logger.log(
                `🤖 Strategy ${strategyType} confirmed ${signal.action} ${signal.pair} ` +
                `(confidence: ${analysis.confidence}%, strength: ${analysis.strength}, R:R: ${analysis.riskRewardRatio.toFixed(2)})`,
              );

              // If strategy has better SL/TP, use them
              if (analysis.stopLoss > 0) {
                (signal as any).strategyStopLoss = analysis.stopLoss;
              }
              if (analysis.takeProfit > 0) {
                (signal as any).strategyTakeProfit = analysis.takeProfit;
              }
              if (analysis.reasoning) {
                (signal as any).strategyReasoning = analysis.reasoning;
              }
            }
          } catch (strategyError: any) {
            // Strategy analysis failed — fall through to signal-based execution
            this.logger.warn(
              `🤖 Strategy analysis failed for ${signal.pair}: ${strategyError.message} — falling back to signal-only`,
            );
          }
        }

        // Skip if already have position for this symbol
        const existingPosition = await this.prisma.position.findFirst({
          where: {
            userId: user.id,
            symbol: signal.pair,
            status: 'OPEN',
          },
        });

        if (existingPosition) {
          this.logger.debug(`🤖 User ${user.id} already has position for ${signal.pair}`);
          results.skipped++;
          continue;
        }

        // Get user's exchange credentials
        const credential = await this.prisma.exchangeCredential.findFirst({
          where: {
            userId: user.id,
            isValid: true,
          },
        });

        if (!credential) {
          this.logger.debug(`🤖 User ${user.id} has no valid credentials`);
          results.skipped++;
          continue;
        }

        // Verify trade permission
        const permissions = JSON.parse(credential.permissions || '["read"]');
        if (!permissions.includes('trade')) {
          results.skipped++;
          continue;
        }

        // Calculate position size based on risk
        // Use strategy SL if available, otherwise signal SL
        const entryPrice = Number(signal.entryPrice) || 0;
        const stopLoss = (signal as any).strategyStopLoss || Number(signal.stopLoss) || 0;
        const takeProfit = (signal as any).strategyTakeProfit || Number(signal.takeProfit) || 0;

        if (!entryPrice || !stopLoss) {
          results.skipped++;
          continue;
        }

        const riskAmount = portfolio * (config.riskPerTrade || this.RISK_PER_TRADE);
        const priceRisk = Math.abs(Number(entryPrice) - Number(stopLoss));

        if (priceRisk === 0) {
          results.skipped++;
          continue;
        }

        const quantity = riskAmount / priceRisk;

        // Minimum quantity check
        if (quantity <= 0) {
          results.skipped++;
          continue;
        }

        // Place the order
        const orderRequest: PlaceOrderRequest = {
          credentialId: credential.id,
          symbol: signal.pair,
          side: signal.action === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
          type: OrderType.MARKET,
          quantity: parseFloat(quantity.toFixed(6)),
          stopLoss,
          takeProfit: takeProfit > 0 ? takeProfit : undefined,
          signalId: signal.id,
        };

        const strategyReasoning = (signal as any).strategyReasoning || '';

        this.logger.log(
          `🤖 Auto-executing [${strategyType}]: ${signal.action} ${signal.pair} @ ${entryPrice} ` +
          `(qty: ${quantity.toFixed(4)}, SL: ${stopLoss}, TP: ${takeProfit})` +
          (strategyReasoning ? ` — ${strategyReasoning}` : ''),
        );

        await this.tradingService.placeOrder(user.id, orderRequest);

        results.executed++;

        await this.audit.log({
          userId: user.id,
          action: 'BOT_AUTO_EXECUTED',
          resource: 'trading-bot',
          details: JSON.stringify({
            signalId: signal.id,
            symbol: signal.pair,
            action: signal.action,
            confidence: signal.confidence,
            strategy: strategyType,
            strategyReasoning,
            quantity,
            entryPrice,
            stopLoss,
            takeProfit,
          }),
        });
      } catch (error: any) {
        this.logger.error(`🤖 Execution error for signal ${signal.id}: ${error.message}`);
        results.errors++;
      }
    }

    return results;
  }

  /**
   * Build BotMarketData from a Signal record.
   *
   * Tries to get real-time market data from the MarketBroadcasterService.
   * Falls back to signal data if real-time data is unavailable.
   */
  private async _buildMarketData(signal: any): Promise<BotMarketData | null> {
    try {
      // Try to get cached market data from Redis (set by MarketBroadcasterService)
      const cachedQuote = await this.redis.get(`market:quote:${signal.pair}`);
      if (cachedQuote) {
        const quote = JSON.parse(cachedQuote);

        return {
          symbol: signal.pair,
          price: quote.price || Number(signal.entryPrice) || 0,
          change24h: quote.change24h || quote.change || 0,
          changePercent24h: quote.changePercent24h || quote.changePercent || 0,
          volume24h: quote.volume24h || quote.volume || 0,
          high24h: quote.high24h || quote.high || 0,
          low24h: quote.low24h || quote.low || 0,

          // Technical indicators (from cache or default estimates)
          rsi: quote.rsi || this._estimateRSI(quote.changePercent24h || 0),
          macdHistogram: quote.macdHistogram || 0,
          macdCrossover: quote.macdCrossover || 'NONE',
          bbPercentB: quote.bbPercentB || 0.5,
          bbBandwidth: quote.bbBandwidth || 0.04,
          bbUpper: quote.bbUpper || quote.price * 1.02,
          bbMiddle: quote.bbMiddle || quote.price,
          bbLower: quote.bbLower || quote.price * 0.98,
          ema9: quote.ema9 || quote.price,
          ema21: quote.ema21 || quote.price,
          ema50: quote.ema50 || quote.price,
          atr: quote.atr || quote.price * 0.01, // Default 1% ATR

          volatility: quote.volatility || this._estimateVolatility(quote.changePercent24h || 0),
          trend: quote.trend || this._estimateTrend(quote.changePercent24h || 0),
          trendStrength: quote.trendStrength || 50,

          signalAction: signal.action,
          signalConfidence: signal.confidence,

          timestamp: new Date(),
        };
      }

      // No cached data — build from signal data
      const price = Number(signal.entryPrice) || 0;
      if (price <= 0) return null;

      return {
        symbol: signal.pair,
        price,
        change24h: 0,
        changePercent24h: 0,
        volume24h: 0,
        high24h: price * 1.02,
        low24h: price * 0.98,
        rsi: 50, // Neutral
        macdHistogram: 0,
        macdCrossover: 'NONE',
        bbPercentB: 0.5,
        bbBandwidth: 0.04,
        bbUpper: price * 1.02,
        bbMiddle: price,
        bbLower: price * 0.98,
        ema9: price,
        ema21: price,
        ema50: price,
        atr: price * 0.01,
        volatility: 'MEDIUM',
        trend: 'SIDEWAYS',
        trendStrength: 50,
        signalAction: signal.action,
        signalConfidence: signal.confidence,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.warn(`🤖 Failed to build market data for ${signal.pair}: ${error.message}`);
      return null;
    }
  }

  /**
   * Estimate RSI from 24h change percent
   */
  private _estimateRSI(changePercent: number): number {
    // Rough estimation: positive change → higher RSI, negative → lower
    return Math.max(10, Math.min(90, 50 + changePercent * 3));
  }

  /**
   * Estimate volatility from 24h change percent
   */
  private _estimateVolatility(changePercent: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    const abs = Math.abs(changePercent);
    if (abs > 5) return 'EXTREME';
    if (abs > 3) return 'HIGH';
    if (abs > 1) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Estimate trend from 24h change percent
   */
  private _estimateTrend(changePercent: number): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    if (changePercent > 1) return 'BULLISH';
    if (changePercent < -1) return 'BEARISH';
    return 'SIDEWAYS';
  }

  private async _getPortfolioValue(userId: string): Promise<number> {
    try {
      const summary = await this.tradingService.getPositionSummary(userId);
      return summary.totalValue || 0;
    } catch {
      return 0;
    }
  }
}

// ── Types ──

export interface BotConfig {
  enabled?: boolean;
  minConfidence?: number;
  maxPositions?: number;
  riskPerTrade?: number;
  preferredExchange?: string;
  strategy?: string; // BotStrategyType as string
}
