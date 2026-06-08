// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Position Monitor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { TradingService } from '../../trading/trading.service';
import { AuditService } from '../../../audit/audit.service';

/**
 * Position Monitor Service — Real-Time Position Surveillance
 *
 * Continuously monitors all open positions and automatically
 * executes protective actions:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Stop-Loss Check    — Close position if price hits SL    │
 * │ 2. Take-Profit Check  — Close position if price hits TP    │
 * │ 3. Trailing Stop      — Adjust SL as price moves favorably │
 * │ 4. Position Updates   — Update current price and unrealized│
 * │    P&L in real-time                                        │
 * │ 5. Alert Generation   — Warn when position approaches SL/TP│
 * └─────────────────────────────────────────────────────────────┘
 *
 * Safety Features:
 * - Mandatory SL on all positions (no exceptions)
 * - Trailing stop activates at 2% profit
 * - Max position age: 7 days (auto-close warning)
 *
 * Frequency: Every 30 seconds
 */
@Injectable()
export class PositionMonitorService {
  private readonly logger = new Logger(PositionMonitorService.name);

  /** Interval in milliseconds — V139: reduced from 30s to 10s for faster SL/TP response */
  private readonly MONITOR_INTERVAL_MS = 10000; // 10 seconds

  /** Trailing stop activation threshold (% profit) */
  private readonly TRAILING_ACTIVATION_PCT = 0.02; // 2%

  /** Trailing stop distance (% from highest price) */
  private readonly TRAILING_DISTANCE_PCT = 0.015; // 1.5%

  /** Maximum position age before warning (days) */
  private readonly MAX_POSITION_AGE_DAYS = 7;

  /** V176 FIX: Maximum age for paper-trading positions without SL/TP (hours).
   * Issue #10: ETH position stuck 131 hours because it had no SL/TP and
   * was paper-trading — the position monitor only warned but never auto-closed.
   * Now: paper positions older than 48h without SL/TP are auto-closed. */
  private readonly STALE_PAPER_POSITION_MAX_HOURS = 48;

  /** V176 FIX: Cooldown period after auto-close (TIME_EXPIRED, STOP_LOSS).
   * Issue #11: DOGE/SOL trades repeating every 8-10 seconds because after
   * TIME_EXPIRED auto-close, the SmartExecutor immediately re-opened the same
   * position. Now: after auto-close, the same symbol is blocked for 5 minutes.
   * Key format: cooldown:userId:symbol, Value: closeReason, TTL: 5 minutes */
  private readonly COOLDOWN_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /** Is monitor currently running */
  private isMonitoring = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    private readonly tradingService: TradingService,
    private readonly audit: AuditService,
  ) {
    this.logger.log('🛡️ Position Monitor initialized — protective surveillance active');
  }

  /**
   * Main monitoring cycle — runs every 30 seconds
   *
   * Checks all open positions for SL/TP hits and updates prices.
   */
  @Interval(30000) // restored to 30s to reduce DB load
  async runPositionMonitor(): Promise<void> {
    // FIX: Skip cycle when DB is unavailable to prevent connection pool exhaustion
    if (!this.prisma.isAvailable?.()) {
      return;
    }

    if (this.isMonitoring) {
      return; // Skip if previous cycle still running
    }

    this.isMonitoring = true;

    try {
      // ═══════════════════════════════════════════════════════════
      // RLS BYPASS: Background service queries across ALL users.
      // We must enable RLS bypass to access positions from all users.
      // After the monitor cycle, we disable bypass to restore isolation.
      // ═══════════════════════════════════════════════════════════
      await this.prisma.enableRlsBypass();

      // Step 1: Get all open positions
      // ROOT FIX: Include ALL positions regardless of source or exchange.
      // Previously, positions from 'smart_executor', 'agent', 'paper_trading'
      // were EXCLUDED from monitoring. This meant:
      //   1. Auto-traded positions NEVER had their SL/TP checked → stayed open forever
      //   2. Paper-trading positions were never monitored → no automated exits
      //   3. Smart Executor "only 1 trade" bug — first position stays open forever,
      //      blocking all new trades when user hits maxOpenPositions
      //
      // Now: ALL positions are monitored for SL/TP using real prices.
      //
      // V141 FIX: Skip positions with source='agent' — the Agent monitors its
      // own positions via _monitorOpenPositions (every 60s). Having both systems
      // monitor the same positions causes:
      //   1. Race conditions (double-close attempts, OPTIMISTIC_LOCK_FAILURE errors)
      //   2. Trailing stop overrides (Position Monitor modifies Agent position SL)
      //   3. Attribution confusion (which system triggered the close?)
      // Each system manages its own positions independently.
      // V141 FIX: Skip SL/TP monitoring and trailing stop for Agent positions
      // (the Agent monitors its own positions via _monitorOpenPositions every 60s).
      // V143 FIX: But DO allow price/PnL updates for Agent positions — otherwise
      // the dashboard shows stale prices for Agent positions for up to 60 seconds.
      //
      // Previously (V141), Agent positions were completely excluded from monitoring.
      // This meant their currentPrice and unrealizedPnl were only updated when the
      // Agent cycle ran (every 60s). Now we split:
      //   - Agent positions: price/PnL updates ONLY (no SL/TP check, no trailing stop)
      //   - Other positions: full monitoring (SL/TP, trailing stop, price updates)
      let positions: any[];
      let agentPositions: any[];
      let nonAgentPositions: any[];
      try {
        // Non-agent positions: full monitoring
        nonAgentPositions = await this.prisma.position.findMany({
          where: {
            status: 'OPEN',
            entryPrice: { gt: 0 },
            source: { not: 'agent' },
          },
        });

        // V175 FIX: Agent positions NOW get full SL/TP monitoring
        // Previously agent monitored its own positions every 60s only
        // This caused TP/SL misses when agent was busy with council sessions
        // Now position-monitor handles SL/TP for ALL positions every 10s
        agentPositions = await this.prisma.position.findMany({
          where: {
            status: 'OPEN',
            entryPrice: { gt: 0 },
            source: 'agent',
          },
        });

        positions = [...nonAgentPositions, ...agentPositions];
      } catch (dbError: any) {
        // Table may not exist yet (e.g., Prisma db:push hasn't run or Position model is new)
        if (dbError.message?.includes('does not exist')) {
          this.logger.warn('🛡️ Position table not found — skipping monitor cycle. Run `prisma db push` to create it.');
          return;
        }
        throw dbError;
      }

      if (positions.length === 0) {
        return;
      }

      this.logger.debug(`🛡️ Monitoring ${positions.length} open positions`);

      let slTriggered = 0;
      let tpTriggered = 0;
      let trailingUpdated = 0;
      let alertsSent = 0;

      // Step 2: Fetch all quotes in parallel first
      const quotePromises = positions.map((pos) =>
        this.exchangeService.getQuote(pos.symbol).catch(() => null),
      );
      const quotes = await Promise.allSettled(quotePromises);

      // Step 3: Process each position with its pre-fetched quote
      // Collect non-critical price updates for batch processing
      const priceUpdates: any[] = [];

      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const quoteResult = quotes[i];
        const currentPrice =
          quoteResult.status === 'fulfilled' && quoteResult.value?.price
            ? quoteResult.value.price
            : null;

        try {
          const result = await this._monitorPosition(position, currentPrice, priceUpdates);
          if (result.slTriggered) slTriggered++;
          if (result.tpTriggered) tpTriggered++;
          if (result.trailingUpdated) trailingUpdated++;
          if (result.alertSent) alertsSent++;
        } catch (error: any) {
          this.logger.error(
            `🛡️ Monitor error for position ${position.id}: ${error.message}`,
          );
        }
      }

      // Step 4: Batch update positions that only need price/PnL updates (no SL/TP hit)
      if (priceUpdates.length > 0) {
        try {
          await this.prisma.$transaction(priceUpdates);
          this.logger.debug(`🛡️ Batch updated ${priceUpdates.length} position price/PnL records`);
        } catch (error: any) {
          this.logger.error(`🛡️ Batch price update failed: ${error.message}`);
        }
      }

      if (slTriggered > 0 || tpTriggered > 0 || trailingUpdated > 0) {
        this.logger.log(
          `🛡️ Monitor cycle: ${slTriggered} SL, ${tpTriggered} TP, ${trailingUpdated} trailing, ${alertsSent} alerts`,
        );
      }

      // Store monitor stats
      await this.redis.set(
        'monitor:last_cycle',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          positionsMonitored: positions.length,
          slTriggered,
          tpTriggered,
          trailingUpdated,
          alertsSent,
        }),
        300000, // 5 min TTL
      );
    } catch (error: any) {
      this.logger.error(`🛡️ Position monitor cycle failed: ${error.message}`);
    } finally {
      this.isMonitoring = false;
      // RLS: Disable bypass after background service completes
      await this.prisma.disableRlsBypass().catch(() => {});
    }
  }

  /**
   * Get monitor status
   */
  async getMonitorStatus(): Promise<{
    lastCycle: any;
    openPositions: number;
    nearSL: number;
    nearTP: number;
  }> {
    const lastCycleRaw = await this.redis.get('monitor:last_cycle');
    const lastCycle = lastCycleRaw ? JSON.parse(lastCycleRaw) : null;

    let openPositions = 0;
    let nearSL = 0;
    let nearTP = 0;

    try {
      // FIX: Previously ran count() AND findMany() as two separate queries
      // for the same filter — N+1 pattern. Now combined into a single query.
      const allPositions = await this.prisma.position.findMany({
        where: { status: 'OPEN' },
      });
      openPositions = allPositions.length;

      // Fetch all quotes in parallel — deduplicate by symbol first
      // FIX: Previously fetched a quote for EACH position, even if multiple
      // positions shared the same symbol. Now deduplicates by symbol.
      const uniqueSymbols = [...new Set(allPositions.map(p => p.symbol))];
      const quoteMap = new Map<string, any>();
      const quotePromises = uniqueSymbols.map(async (symbol: string) => {
        try {
          const quote = await this.exchangeService.getQuote(symbol);
          if (quote?.price) quoteMap.set(symbol, quote);
        } catch { /* ignore individual quote failures */ }
      });
      await Promise.allSettled(quotePromises);

      for (const pos of allPositions) {
        const quote = quoteMap.get(pos.symbol);
        if (!quote?.price) continue;

        const currentPrice = quote.price;

        if (pos.stopLoss) {
          const slDistance = Math.abs(currentPrice - pos.stopLoss.toNumber()) / pos.entryPrice.toNumber();
          if (slDistance < 0.01) nearSL++;
        }

        if (pos.takeProfit) {
          const tpDistance = Math.abs(currentPrice - pos.takeProfit.toNumber()) / pos.entryPrice.toNumber();
          if (tpDistance < 0.01) nearTP++;
        }
      }
    } catch (dbError: any) {
      if (dbError.message?.includes('does not exist')) {
        this.logger.warn('🛡️ Position table not found — returning empty monitor status.');
      } else {
        throw dbError;
      }
    }

    return { lastCycle, openPositions, nearSL, nearTP };
  }

  // ── Private: Position Monitoring ──

  private async _monitorPosition(position: any, currentPrice: number | null, priceUpdates: any[]): Promise<{
    slTriggered: boolean;
    tpTriggered: boolean;
    trailingUpdated: boolean;
    alertSent: boolean;
  }> {
    const result = {
      slTriggered: false,
      tpTriggered: false,
      trailingUpdated: false,
      alertSent: false,
    };

    // Use pre-fetched price or skip
    if (currentPrice === null) {
      return result; // Skip if can't get price
    }

    // V143: For Agent positions, ONLY update price/PnL — no SL/TP checks,
    // no trailing stop modifications. The Agent manages its own SL/TP exits.
    const isAgentPosition = position.source === 'agent';

    // FIX: Convert Prisma Decimal fields to numbers for safe comparison.
    // Prisma Decimal objects don't compare correctly with JS `<=` / `>=` operators.
    const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
    const quantity = position.quantity?.toNumber?.() ?? Number(position.quantity);
    const stopLossNum = position.stopLoss?.toNumber?.() ?? (position.stopLoss ? Number(position.stopLoss) : null);
    const takeProfitNum = position.takeProfit?.toNumber?.() ?? (position.takeProfit ? Number(position.takeProfit) : null);

    // Calculate unrealized P&L
    const unrealizedPnl =
      position.side === 'BUY'
        ? (currentPrice - entryPrice) * quantity
        : (entryPrice - currentPrice) * quantity;

    const pnlPercent = (unrealizedPnl / (entryPrice * quantity)) * 100;

    // ── V175 FIX: Agent SL/TP check first, then price update ──
    if (isAgentPosition) {
      // SL check for agent
      if (stopLossNum !== null) {
        const agentSlHit = position.side === 'BUY' ? currentPrice <= stopLossNum : currentPrice >= stopLossNum;
        if (agentSlHit) {
          this.logger.warn(`🚨 AGENT SL HIT: ${position.symbol} @ ${currentPrice} (SL: ${stopLossNum})`);
          await this._closePosition(position, currentPrice, 'STOP_LOSS');
          this._checkSanctuary(position.userId).catch(() => {});
          result.slTriggered = true;
          return result;
        }
      }
      // TP check for agent
      if (takeProfitNum !== null) {
        const agentTpHit = position.side === 'BUY' ? currentPrice >= takeProfitNum : currentPrice <= takeProfitNum;
        if (agentTpHit) {
          this.logger.warn(`🎯 AGENT TP HIT: ${position.symbol} @ ${currentPrice} (TP: ${takeProfitNum})`);
          await this._closePosition(position, currentPrice, 'TAKE_PROFIT');
          this._checkSanctuary(position.userId).catch(() => {});
          result.tpTriggered = true;
          return result;
        }
      }
      // No SL/TP hit — update price/PnL only
      priceUpdates.push(
        this.prisma.position.update({
          where: { id: position.id },
          data: {
            currentPrice,
            unrealizedPnl,
            highestPrice:
              position.side === 'BUY'
                ? Math.max(position.highestPrice || currentPrice, currentPrice)
                : position.highestPrice || currentPrice,
            lowestPrice:
              position.side === 'SELL'
                ? Math.min(position.lowestPrice || currentPrice, currentPrice)
                : position.lowestPrice || currentPrice,
          },
        }),
      );
      return result;
    }

    // ── Below: Full monitoring for non-Agent positions ──

    // ── V176 FIX: Stale paper-trading position detector ──
    // Issue #10: Paper positions without SL/TP were never auto-closed.
    // They stayed open for 131+ hours, blocking new trades and showing
    // stale P&L. Now: any paper position older than 48h without SL/TP
    // is automatically closed with reason='STALE_POSITION'.
    if (position.exchange === 'paper-trading' && position.openedAt) {
      const holdingMs = Date.now() - new Date(position.openedAt).getTime();
      const holdingHours = holdingMs / (60 * 60 * 1000);
      const hasSLTP = stopLossNum !== null || takeProfitNum !== null;

      if (holdingHours > this.STALE_PAPER_POSITION_MAX_HOURS && !hasSLTP) {
        this.logger.warn(
          `🔴 V176 STALE POSITION: ${position.symbol} held ${holdingHours.toFixed(1)}h without SL/TP — auto-closing`,
        );
        await this._closePosition(position, currentPrice, 'STALE_POSITION');
        result.slTriggered = true;
        return result;
      }
    }

    // ── V176 FIX: Cooldown check after auto-close ──
    // Issue #11: After TIME_EXPIRED auto-close, the SmartExecutor immediately
    // re-opened the same position, creating a loop of trades every 8-10 seconds.
    // Now: after auto-close, the same userId+symbol is blocked for 5 minutes.
    try {
      const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
      const cooldownReason = await this.redis.get(cooldownKey);
      if (cooldownReason) {
        this.logger.debug(
          `⏳ V176 COOLDOWN: ${position.symbol} blocked for user ${position.userId} (reason: ${cooldownReason})`,
        );
        // Just update price — don't trigger any SL/TP/trailing while in cooldown
        priceUpdates.push(
          this.prisma.position.update({
            where: { id: position.id },
            data: { currentPrice, unrealizedPnl },
          }),
        );
        return result;
      }
    } catch { /* non-critical */ }

    // ── MAX_HOLDING_TIME: Smart Executor + Agent positions ──
    // Counter-trend (reversal): 45 دقيقة
    // Smart Executor مع الاتجاه: 4 ساعات
    // Agent: 48 ساعة (swing trading)
    if ((position.source === 'smart_executor' || position.source === 'agent') && position.openedAt) {
      const holdingMs = Date.now() - new Date(position.openedAt).getTime();

      const isAgent = position.source === 'agent';

      // قراءة الـ timeframe من Redis لحساب MAX_HOLDING الصحيح
      let timeframe: string | null = null;
      try {
        const tfKey = `smart-executor:position-tf:${position.userId}:${position.symbol}`;
        timeframe = await this.redis.get(tfKey);
      } catch { /* non-critical */ }

      let maxHoldingMs = this._getMaxHoldingMs(timeframe, isAgent);

      if (holdingMs > maxHoldingMs) {
        const heldMin = (holdingMs / 60000).toFixed(0);
        const maxMin  = (maxHoldingMs / 60000).toFixed(0);
        this.logger.warn(
          `⏱️ MAX_HOLDING: ${position.symbol} held ${heldMin}m > ${maxMin}m — closing`,
        );
        await this._closePosition(position, currentPrice, 'TIME_EXPIRED');
        // V176 FIX: Set cooldown after TIME_EXPIRED to prevent immediate re-open
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, 'TIME_EXPIRED', this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }
        result.slTriggered = true;
        return result;
      }
    }

    // ── Stop-Loss Check ──
    if (stopLossNum !== null) {
      const slHit =
        position.side === 'BUY'
          ? currentPrice <= stopLossNum
          : currentPrice >= stopLossNum;

      if (slHit) {
        this.logger.warn(
          `🚨 STOP-LOSS TRIGGERED: ${position.symbol} @ ${currentPrice} (SL: ${stopLossNum})`,
        );

        await this._closePosition(position, currentPrice, 'STOP_LOSS');

        // V176 FIX: Set cooldown after STOP_LOSS to prevent immediate re-open
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, 'STOP_LOSS', this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }

        result.slTriggered = true;
        return result;
      }

      // Alert if near SL (within 0.5%) — with throttling to avoid flooding
      const slDistance = Math.abs(currentPrice - stopLossNum) / entryPrice;
      if (slDistance < 0.005) {
        const alertThrottleKey = `alert:throttle:sl:${position.id}`;
        const lastAlert = await this.redis.get(alertThrottleKey);
        if (!lastAlert) {
          await this._sendAlert(position.userId, 'NEAR_STOP_LOSS', {
            positionId: position.id,
            symbol: position.symbol,
            currentPrice,
            stopLoss: stopLossNum,
            distance: slDistance,
          });
          // Throttle: only alert once per 5 minutes for the same position
          await this.redis.set(alertThrottleKey, '1', 300000);
          result.alertSent = true;
        }
      }
    }

    // ── Take-Profit Check ──
    if (takeProfitNum !== null) {
      const tpHit =
        position.side === 'BUY'
          ? currentPrice >= takeProfitNum
          : currentPrice <= takeProfitNum;

      if (tpHit) {
        this.logger.warn(
          `🎯 TAKE-PROFIT TRIGGERED: ${position.symbol} @ ${currentPrice} (TP: ${takeProfitNum})`,
        );

        await this._closePosition(position, currentPrice, 'TAKE_PROFIT');
        result.tpTriggered = true;
        return result;
      }

      // Alert if near TP (within 0.5%) — with throttling
      const tpDistance = Math.abs(currentPrice - takeProfitNum) / entryPrice;
      if (tpDistance < 0.005) {
        const alertThrottleKey = `alert:throttle:tp:${position.id}`;
        const lastAlert = await this.redis.get(alertThrottleKey);
        if (!lastAlert) {
          await this._sendAlert(position.userId, 'NEAR_TAKE_PROFIT', {
            positionId: position.id,
            symbol: position.symbol,
            currentPrice,
            takeProfit: takeProfitNum,
            distance: tpDistance,
          });
          // Throttle: only alert once per 5 minutes for the same position
          await this.redis.set(alertThrottleKey, '1', 300000);
          result.alertSent = true;
        }
      }
    }

    // ── Trailing Stop Logic ──
    if (pnlPercent >= this.TRAILING_ACTIVATION_PCT * 100) {
      const trailingStop = this._calculateTrailingStop(position, currentPrice);

      if (trailingStop) {
        // For BUY: trailing stop moves UP (higher SL is better)
        // For SELL: trailing stop moves DOWN (lower SL is better, closer to entry from above)
        const currentSL = stopLossNum || 0;
        // FIX: For SELL with no existing SL (currentSL=0), always set trailing stop.
        // Without this, `trailingStop < 0` would be false and the trailing stop
        // would never activate for SELL positions that don't have an initial SL.
        const shouldUpdate = position.side === 'BUY'
          ? trailingStop > currentSL
          : (currentSL === 0 || trailingStop < currentSL);

        if (shouldUpdate) {
          // Trailing stop updates are critical — apply immediately (not batched)
          await this.prisma.position.update({
            where: { id: position.id },
            data: { stopLoss: trailingStop },
          });

          this.logger.log(
            `📈 Trailing stop updated: ${position.symbol} SL → ${trailingStop}`,
          );

          result.trailingUpdated = true;
        }
      }
    }

    // ── Position Age Warning ──
    const positionAge = Date.now() - new Date(position.openedAt).getTime();
    const ageDays = positionAge / (1000 * 60 * 60 * 24);

    if (ageDays >= this.MAX_POSITION_AGE_DAYS) {
      await this._sendAlert(position.userId, 'POSITION_AGE_WARNING', {
        positionId: position.id,
        symbol: position.symbol,
        ageDays: Math.floor(ageDays),
      });
      result.alertSent = true;
    }

    // ── Batch price/PnL update (no SL/TP hit — just update current price) ──
    // Instead of updating each position individually, collect them for a batch transaction
    priceUpdates.push(
      this.prisma.position.update({
        where: { id: position.id },
        data: {
          currentPrice,
          unrealizedPnl,
          highestPrice:
            position.side === 'BUY'
              ? Math.max(position.highestPrice || currentPrice, currentPrice)
              : position.highestPrice || currentPrice,
          lowestPrice:
            position.side === 'SELL'
              ? Math.min(position.lowestPrice || currentPrice, currentPrice)
              : position.lowestPrice || currentPrice,
        },
      }),
    );

    return result;
  }

  private async _closePosition(
    position: any,
    currentPrice: number,
    reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXPIRED',
  ): Promise<void> {
    try {
      // FIX: Use closePositionWithRetry + convert Decimal to number
      // V141: Pass closeReason so it's stored on the Position record
      await this.tradingService.closePositionWithRetry(
        position.userId,
        {
          positionId: position.id,
          quantity: typeof position.quantity?.toNumber === 'function' 
            ? position.quantity.toNumber() 
            : Number(position.quantity),
          closeReason: reason, // V141: STOP_LOSS or TAKE_PROFIT
        },
        undefined,
        undefined,
        3, // max retries for OPTIMISTIC_LOCK_FAILURE
      );

      await this.audit.log({
        userId: position.userId,
        action: `POSITION_CLOSED_${reason}`,
        resource: 'position-monitor',
        details: JSON.stringify({
          positionId: position.id,
          symbol: position.symbol,
          closePrice: currentPrice,
          entryPrice: position.entryPrice,
          side: position.side,
          quantity: position.quantity,
        }),
      });
    } catch (error: any) {
      this.logger.error(
        `🛡️ Failed to close position ${position.id}: ${error.message}`,
      );

      // FIX V114: If closePositionWithRetry failed, try force-close as fallback.
      // This is critical for SL/TP-triggered closes — if the close fails, the
      // position stays OPEN with its SL/TP already triggered, which could lead
      // to unlimited losses. Force-close is always safe for paper-trading positions.
      // For real exchange positions, force-close is safe when the error suggests
      // the exchange might already have the position closed.
      try {
        this.logger.warn(
          `🛡️ V114 Attempting force-close for position ${position.id} after closePositionWithRetry failed`,
        );
        await this.tradingService.forceClosePosition(
          position.userId,
          position.id,
          `V114 Position Monitor fallback: ${reason} triggered but closePositionWithRetry failed — ${error.message?.substring(0, 100)}`,
        );
        this.logger.log(
          `🛡️ V114 Force-close succeeded for position ${position.id} (${reason})`,
        );
      } catch (forceErr: any) {
        this.logger.error(
          `🛡️ V114 Force-close also failed for position ${position.id}: ${forceErr.message}`,
        );
      }
    }
  }

  private _calculateTrailingStop(position: any, currentPrice: number): number | null {
    if (position.side === 'BUY') {
      // For long positions, trail below the highest price
      const highestPrice = position.highestPrice || currentPrice;
      const newHigh = Math.max(highestPrice, currentPrice);
      return newHigh * (1 - this.TRAILING_DISTANCE_PCT);
    } else if (position.side === 'SELL') {
      // For short positions, trail above the lowest price
      const lowestPrice = position.lowestPrice || currentPrice;
      const newLow = Math.min(lowestPrice, currentPrice);
      return newLow * (1 + this.TRAILING_DISTANCE_PCT);
    }
    return null;
  }

  private async _sendAlert(
    userId: string,
    type: string,
    data: any,
  ): Promise<void> {
    const alertKey = `alert:${userId}:${Date.now()}`;
    await this.redis.set(
      alertKey,
      JSON.stringify({ type, data, timestamp: new Date().toISOString() }),
      86400000, // 24 hours
    );
  }
  /**
   * يحسب MAX_HOLDING بحسب الإطار الزمني للصفقة
   * M1/M5  → 4 ساعات   (scalping)
   * M15/M30 → 12 ساعة  (intraday)
   * H1/H4   → 48 ساعة  (swing)
   * D1/W1   → 7 أيام   (position)
   * Agent   → 48 ساعة  (swing default)
   */
  private _getMaxHoldingMs(timeframe: string | null, isAgent: boolean): number {
    const H = 60 * 60 * 1000;
    if (isAgent) return 48 * H;
    if (!timeframe) return 8 * H; // default: 8 ساعات (آمن لكل TFs)
    const tf = timeframe.toUpperCase();
    if (tf === 'M1' || tf === 'M5')            return 4  * H;
    if (tf === 'M15' || tf === 'M30')          return 12 * H;
    if (tf === 'H1' || tf === 'H2' || tf === 'H4') return 48 * H;
    if (tf === 'D1' || tf === 'D3')            return 7  * 24 * H;
    if (tf === 'W1' || tf === 'W2')            return 14 * 24 * H;
    return 8 * H; // fallback
  }

  private async _checkSanctuary(userId: string): Promise<void> {
    // Non-blocking: يستدعي checkAndHaltCouncil إذا SanctuaryService متاح
    try {
      const recentLosses = await this.prisma.position.count({
        where: {
          userId,
          status: 'CLOSED',
          realizedPnl: { lt: 0 },
          closedAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) }, // آخر 3 ساعات
        },
      });
      if (recentLosses >= 10) {
        // خسارة 10 صفقات في 3 ساعات → halt المجلس ساعة (رُفع من 5 لتجنب halt غير ضروري)
        const haltUntil = new Date(Date.now() + 60 * 60 * 1000);
        await this.redis.set('council:sanctuary:halt', haltUntil.toISOString(), 60 * 60 * 1000);
        this.logger.warn(`🛡️ Sanctuary: ${recentLosses} خسائر في 3 ساعات → halt المجلس حتى ${haltUntil.toISOString()}`);
      }
    } catch { /* non-critical */ }
  }


}
