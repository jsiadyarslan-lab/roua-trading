// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Position Monitor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, forwardRef, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { TradingService } from '../../trading/trading.service';
import { AuditService } from '../../../audit/audit.service';
import { PerformanceEventsService } from '../../analytics/services/performance-events.service';
// V185: مجلس الذكاء — مجلة التداول + الشفاء الذاتي
import { TradeJournalService } from '../../ai/council-intelligence/trade-journal.service';
import { SelfHealingService } from '../../ai/council-intelligence/self-healing.service';
// V453: CouncilVoteAccuracy — feed trade outcomes back to council for learning
import { CouncilVoteAccuracyService } from '../../ai/council-intelligence/council-vote-accuracy.service';
// V223: StrategicCouncilService — to cancel briefs on position close
import { StrategicCouncilService } from '../../ai/strategic-council/strategic-council.service';
// V271: Feature flags
import { FeatureFlagService } from '../../../common/feature-flags/feature-flag.service';
// BUG-063: Partial TP Service — 3-stage profit taking
import { PartialTPService } from './partial-tp.service';
// BUG-064: Position Intelligence — active position management
import { PositionIntelligenceService } from './position-intelligence.service';
// V339: Trade Lifecycle Logger — for audit trail of every close decision
import { TradeLifecycleLogger } from '../../../common/trade-lifecycle/trade-lifecycle.logger';
// V341: Position State Machine — single decision point for position lifecycle
import { PositionStateMachine } from '../../../common/state-machine/position-state-machine.service';
import { getSymbolMetadata } from '../../trading/services/symbol-metadata';

/** V270: RegimeType matching MarketRegimeService output */
type RegimeType = 'BULL' | 'BEAR' | 'RANGE' | 'VOLATILE' | 'TRANSITIONAL';

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
  /**
   * V340: Monitoring interval — 1 second for SL/TP detection (critical).
   * MONITOR_TICK logging is sampled to every 5s to reduce DB load.
   *
   * WHY 1s interval but 5s logging:
   *   - SL/TP MUST be checked every 1s — missing a tick means slippage
   *   - But logging every 1s creates 3600 logs/hour/position = too much DB load
   *   - 5s sampling = 720 logs/hour/position — manageable
   *   - Price/PnL updates still happen every 1s (via priceUpdates batch)
   *   - Only the lifecycle LOG is sampled
   *
   * PERFORMANCE:
   *   - 5 positions × 1 update/sec = 5 updates/sec (batched in 1 transaction)
   *   - 5 positions × 1 log/5s = 1 log/sec (acceptable)
   *   - Total: ~6 DB ops/sec (well within Prisma pool capacity)
   */
  private readonly MONITOR_INTERVAL_MS = 1000; // V340: 1 second for SL/TP
  private readonly MONITOR_TICK_LOG_INTERVAL_MS = 5000; // V342: Log every 5s
  private lastTickLogTime: Map<string, number> = new Map(); // positionId → last log timestamp

  /** Trailing stop activation threshold (% profit) */
  private readonly TRAILING_ACTIVATION_PCT = 0.02; // 2%

  /** Trailing stop distance (% from highest price) — V177 FIX #16: tightened from 1.5% to 1.2% */
  private readonly TRAILING_DISTANCE_PCT = 0.012; // 1.2%

  /** V338: Trailing Take Profit — lock in profit when price reaches 90% of TP distance.
   * When the market moves 90% of the way to TP, move SL to lock in ~80% of the profit.
   * This converts "almost-won" trades (TP gap < 1%) into realized wins instead of
   * letting TIME_EXPIRED or reversal close them at breakeven/loss.
   *
   * Data-driven justification (V336 analysis of 50 trades):
   *   - 19 trades had TP gap < 1% but only 8 closed as TAKE_PROFIT
   *   - 5 TIME_EXPIRED closes had gap < 1% (lost ~$426 in potential profit)
   *   - 74% of trades were directionally correct but not monetized
   *
   * Mechanism:
   *   1. Calculate progress: how far price has moved toward TP (0% = entry, 100% = TP hit)
   *   2. When progress >= 90%, move SL to lock in 80% of the unrealized profit
   *   3. If price reverses, the tightened SL closes the trade with profit locked
   *   4. If price continues to TP, normal TP close fires
   */
  private readonly TRAILING_TP_TRIGGER_PCT = 0.90; // Trigger at 90% of TP distance
  private readonly TRAILING_TP_LOCK_PCT = 0.80;    // Lock in 80% of profit at trigger

  /** Maximum position age before warning (days) */
  private readonly MAX_POSITION_AGE_DAYS = 7;

  /** V176 FIX: Maximum age for paper-trading positions without SL/TP (hours).
   * Issue #10: ETH position stuck 131 hours because it had no SL/TP and
   * was paper-trading — the position monitor only warned but never auto-closed.
   * Now: paper positions older than 48h without SL/TP are auto-closed. */
  private readonly STALE_PAPER_POSITION_MAX_HOURS = 48;

  /** V338: Completely DISABLE TIME_EXPIRED for smart_executor positions.
   * V336 data analysis confirmed: 16 trades closed at exactly 240min (4h),
   * 5 of which had TP gap < 1% — meaning the market was about to hit TP
   * but the timer killed the trade first. TIME_EXPIRED is the #1 profit killer.
   *
   * For Agent positions, TIME_EXPIRED already requires 48h (V214).
   * For smart_executor, we now rely on:
   *   1. SL/TP natural exits
   *   2. Trailing Take Profit (V338) — locks in profit at 90% of TP
   *   3. STALE_POSITION (48h for paper without SL/TP)
   *
   * This is a HARD disable — no Redis flag, no feature toggle, just removed.
   */
  private readonly DISABLE_TIME_EXPIRED_SMART_EXECUTOR = true;

  /** V176/V221 FIX: Cooldown period after auto-close (TIME_EXPIRED, STOP_LOSS).
   * Issue #11: DOGE/SOL trades repeating every 8-10 seconds because after
   * TIME_EXPIRED auto-close, the SmartExecutor immediately re-opened the same
   * position. Now: after auto-close, the same symbol is blocked for 15 minutes.
   * V221: Increased from 5 min to 15 min to prevent flip-flop pattern
   * (BUY → SL → SELL immediately → SL → BUY).
   * Key format: cooldown:userId:symbol, Value: closeReason, TTL: 15 minutes */
  private readonly COOLDOWN_TTL_MS = 15 * 60 * 1000; // 15 minutes

  /** Is monitor currently running */
  private isMonitoring = false;

  // V351e: Compiled code version — NOT an env var, NOT a Docker ARG.
  // This string is baked into the compiled JS by tsc. If the diagnostic
  // shows this version, the V351e code IS running. If it shows something
  // else or is missing, Railway is running stale cached code.
  // This is the ONLY reliable way to verify which code is actually executing,
  // because DEPLOY_COMMIT comes from RAILWAY_GIT_COMMIT_SHA (auto-updated
  // by Railway to the latest push) and does NOT reflect the actual build.
  public static readonly CODE_VERSION = 'V351i';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly exchangeService: ExchangeService,
    private readonly tradingService: TradingService,
    private readonly audit: AuditService,
    private readonly performanceEvents: PerformanceEventsService,
    // V185: مجلس الذكاء — @Optional حتى لا يفشل إذا لم يكن الموديول متاحاً
    @Optional() private readonly journal?: TradeJournalService,
    @Optional() private readonly voteAccuracy?: CouncilVoteAccuracyService,
    @Optional() private readonly selfHealing?: SelfHealingService,
    // V223: StrategicCouncilService — @Global() module provides this. Was @Optional()
    // before V223.1, which caused silent undefined → brief cancellation never ran.
    // Still marked @Optional() because TypeScript requires optional params after required ones,
    // but at runtime DI will always provide it (module is @Global). If DI ever breaks,
    // the invalidateBriefsForSymbol call will throw loudly inside the try/catch.
    @Optional() @Inject(forwardRef(() => StrategicCouncilService))
    private readonly strategicCouncil?: StrategicCouncilService,
    // V270: MarketRegimeService for regime-aware position management.
    // Injected via string token (same pattern as AdaptiveSchedule in V267)
    // to avoid circular import with CouncilIntelligenceModule.
    @Optional() @Inject('MARKET_REGIME_SERVICE') private readonly regimeService?: any,
    // V271: Feature flags for safe rollback
    @Optional() private readonly featureFlags?: FeatureFlagService,
    // V339: Trade Lifecycle Logger — for audit trail of every close decision
      @Optional() @Inject(TradeLifecycleLogger) private readonly lifecycle?: TradeLifecycleLogger,
    // V341: Position State Machine — single decision point for close decisions
      @Optional() @Inject(PositionStateMachine) private readonly stateMachine?: PositionStateMachine,
    // BUG-063: Partial TP Service — for 3-stage profit taking
    @Optional() private readonly partialTP?: PartialTPService,
    // BUG-064: Position Intelligence — active position management
    @Optional() private readonly positionIntel?: PositionIntelligenceService,
  ) {
    // V347: Verify critical dependencies are injected
    if (!this.lifecycle) {
      this.logger.error('🚨🚨🚨 V347 CRITICAL: TradeLifecycleLogger is NOT injected! All lifecycle logging will be SKIPPED. Check TradeLifecycleModule registration in AppModule.');
    }
    if (!this.stateMachine) {
      this.logger.error('🚨🚨🚨 V347 CRITICAL: PositionStateMachine is NOT injected! V341 state machine checks will be SKIPPED. Check StateMachineModule registration in AppModule.');
    }
    this.logger.log('🛡️ Position Monitor initialized — protective surveillance active'
      + (this.journal ? ' + TradeJournal' : '')
      + (this.selfHealing ? ' + SelfHealing' : '')
      + (this.strategicCouncil ? ' + V223 BriefInvalidation' : '')
      + (this.regimeService && this.featureFlags?.isEnabled('V270') ? ' + V270 RegimeAware' : '')
      + (this.lifecycle ? ' + V339 LifecycleLog' : ' + ❌NO LifecycleLog')
      + (this.stateMachine ? ' + V341 StateMachine' : ' + ❌NO StateMachine'));
    // V351e: Loud startup log with code version — must appear in Railway logs
    this.logger.log(`🔧 V351i: PositionMonitorService CODE_VERSION=${PositionMonitorService.CODE_VERSION} — self-healing check REMOVED entirely`);
    console.log(`🔧 V351i: PositionMonitorService CODE_VERSION=${PositionMonitorService.CODE_VERSION} — self-healing check REMOVED entirely`);

    // V351h: CRITICAL FIX — Clear any existing self-healing disable flag on startup.
    // The self-healing service may have disabled position-monitor due to transient
    // failures (criticalThreshold was 2, now Infinity). Without this clear, the
    // monitor stays disabled FOREVER (death loop: disabled → skip → never report
    // success → failure count never resets → re-disabled on next failure).
    // Every deploy/restart should give the monitor a fresh start.
    // NOTE: Constructor can't be async, so we fire-and-forget the clear.
    if (this.selfHealing) {
      this.selfHealing.enableComponent('position-monitor')
        .then(() => this.logger.log('🔧 V351h: Cleared self-healing disable flag for position-monitor — monitor will run normally'))
        .catch((err: any) => this.logger.warn(`V351h: Failed to clear self-healing flag: ${err.message}`));
    }
  }

  /**
   * V348: Get effective lifecycle logger — tries DI first, falls back to static instance.
   * This bypasses any DI injection failures.
   */
  private getLifecycle(): TradeLifecycleLogger | null {
    // Try DI-injected instance first
    if (this.lifecycle) return this.lifecycle ?? null;
    // Fall back to static instance (set in TradeLifecycleLogger constructor)
    return TradeLifecycleLogger.getInstance();
  }

  /**
   * V348: Get effective state machine — tries DI first, falls back to static instance.
   */
  private getStateMachine(): PositionStateMachine | null {
    if (this.stateMachine) return this.stateMachine ?? null;
    return PositionStateMachine.getInstance();
  }

  /**
   * Main monitoring cycle — runs every 1 second (V340: was 10s)
   *
   * Checks all open positions for SL/TP hits and updates prices.
   * V340: Reduced to 1s for tick-level price accuracy.
   * V223 FIX: Restored to 10s to match MONITOR_INTERVAL_MS and reduce
   * SL/TP detection latency from 30s → 10s (was causing 0.3–1% slippage per SL hit).
   * V340: Further reduced to 1s — 84% violation rate in price-integrity check
   * proved 10s was too coarse for accurate highestPrice/lowestPrice tracking.
   */
  @Interval(1000)
  async runPositionMonitor(): Promise<void> {
    // V351c: Heartbeat — write to Redis at the START of every cycle invocation,
    // BEFORE any code that could throw. This lets us distinguish:
    //   - @Interval NOT firing at all (no heartbeat)
    //   - @Interval firing but cycle throws before completing (heartbeat exists, stale)
    //   - @Interval firing and completing (heartbeat fresh, monitor:last_cycle also set)
    try {
      const now = Date.now();
      await this.redis.set('monitor:heartbeat', JSON.stringify({
        timestamp: new Date(now).toISOString(),
        epochMs: now,
        // V351e: Include CODE_VERSION so we can verify which compiled code is running
        codeVersion: PositionMonitorService.CODE_VERSION,
      }), 30000); // 30s TTL — if @Interval stops, this key expires
    } catch { /* non-critical */ }

    // FIX: Skip cycle when DB is unavailable to prevent connection pool exhaustion
    if (!this.prisma.isAvailable?.()) {
      // V351g: Write skip reason to Redis for diagnostic
      try { await this.redis.set('monitor:skip_reason', JSON.stringify({ reason: 'DB_UNAVAILABLE', timestamp: new Date().toISOString() }), 30000); } catch {}
      return;
    }

    // V351i: REMOVED self-healing check entirely.
    // Position monitor is TOO CRITICAL to ever skip. Self-healing was disabling
    // it after just 2 transient failures, creating a death loop where the monitor
    // could never recover (disabled → skip → never report success → never reset).
    // This caused 20+ debugging attempts to find the root cause.
    // The monitor MUST run unconditionally — if it fails, log the error and
    // continue, but NEVER skip the entire cycle.

    // V351i: Clear any stale self-healing disable flag on every cycle.
    // This ensures that even if self-healing disabled the monitor in a previous
    // process (before V351i was deployed), the flag gets cleared within 1 second
    // of this code running.
    try {
      await this.redis.del('self-healing:disabled:position-monitor');
    } catch { /* non-critical */ }

    if (this.isMonitoring) {
      // V351g: Write skip reason to Redis for diagnostic
      try { await this.redis.set('monitor:skip_reason', JSON.stringify({ reason: 'PREVIOUS_CYCLE_STILL_RUNNING', timestamp: new Date().toISOString() }), 30000); } catch {}
      return; // Skip if previous cycle still running
    }

    this.isMonitoring = true;
    // V351g: Clear skip reason — we're entering the cycle
    try { await this.redis.del('monitor:skip_reason'); } catch {}

    try {
      // V351g: Write cycle progress to Redis at each step
      const writeProgress = async (step: string, extra?: any) => {
        try {
          await this.redis.set('monitor:cycle_progress', JSON.stringify({
            step,
            timestamp: new Date().toISOString(),
            ...extra,
          }), 60000); // 60s TTL
        } catch {}
      };

      await writeProgress('ENTERING_TRY_BLOCK');

      // ═══════════════════════════════════════════════════════════
      // RLS BYPASS: Background service queries across ALL users.
      // We must enable RLS bypass to access positions from all users.
      // After the monitor cycle, we disable bypass to restore isolation.
      // ═══════════════════════════════════════════════════════════
      await writeProgress('BEFORE_RLS_BYPASS');
      await this.prisma.enableRlsBypass();
      await writeProgress('AFTER_RLS_BYPASS');

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

        // BUG-063: Register new positions for Partial TP (if not already registered)
        if (this.partialTP) {
          for (const pos of positions) {
            const isRegistered = await this.partialTP.isRegistered(pos.id);
            if (!isRegistered && pos.stopLoss && pos.takeProfit) {
              await this.partialTP.registerPosition(
                pos.id,
                pos.userId,
                pos.symbol,
                pos.side as 'BUY' | 'SELL',
                pos.entryPrice?.toNumber?.() ?? Number(pos.entryPrice),
                pos.takeProfit?.toNumber?.() ?? Number(pos.takeProfit),
                pos.stopLoss?.toNumber?.() ?? Number(pos.stopLoss),
                pos.quantity?.toNumber?.() ?? Number(pos.quantity),
              );
            }
          }
        }
      } catch (dbError: any) {
        // Table may not exist yet (e.g., Prisma db:push hasn't run or Position model is new)
        if (dbError.message?.includes('does not exist')) {
          this.logger.warn('🛡️ Position table not found — skipping monitor cycle. Run `prisma db push` to create it.');
          await writeProgress('POSITION_TABLE_NOT_FOUND');
          return;
        }
        throw dbError;
      }

      await writeProgress('POSITIONS_FETCHED', { count: positions.length });

      if (positions.length === 0) {
        await writeProgress('ZERO_POSITIONS_RETURN');
        return;
      }

      this.logger.debug(`🛡️ Monitoring ${positions.length} open positions`);

      let slTriggered = 0;
      let tpTriggered = 0;
      let trailingUpdated = 0;
      let alertsSent = 0;

      // Step 2: Fetch all quotes in parallel first
      // V351d: Capture the actual error from getQuote (not just null) so we can
      // log WHY quotes are failing. Previously .catch(() => null) swallowed the
      // error silently, making it impossible to diagnose why MONITOR_TICK was 0.
      const quotePromises = positions.map((pos) =>
        this.exchangeService.getQuote(pos.symbol)
          .then((quote) => ({ quote, error: null as string | null }))
          .catch((err: any) => ({ quote: null, error: err?.message?.substring(0, 200) || 'unknown error' })),
      );
      const quoteResults = await Promise.allSettled(quotePromises);

      // V351d: Track quote fetch failures for diagnostic
      let quoteSuccessCount = 0;
      let quoteFailCount = 0;
      const quoteFailuresBySymbol: Record<string, string> = {};

      // V351g: Write progress after quotes fetched
      await writeProgress('QUOTES_FETCHED');

      // Step 3: Process each position with its pre-fetched quote
      // Collect non-critical price updates for batch processing
      const priceUpdates: any[] = [];

      // V228 FIX: Pass the full quote (with high/low) instead of just .price
      // This lets _monitorPosition capture TP/SL peaks that happen BETWEEN ticks
      // (e.g., price touches TP for 2 seconds then retraces — currentPrice misses it).
      // The fix uses quote.high/low (24h ticker) filtered against position.highestPrice/lowestPrice
      // to only consider NEW peaks that occurred since the last tick.
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const quoteResult = quoteResults[i];
        // V351d: Unwrap the { quote, error } shape from our improved catch
        let quote: any = null;
        let quoteError: string | null = null;
        if (quoteResult.status === 'fulfilled' && quoteResult.value) {
          quote = quoteResult.value.quote;
          quoteError = quoteResult.value.error;
        }
        if (quote) {
          quoteSuccessCount++;
        } else {
          quoteFailCount++;
          quoteFailuresBySymbol[position.symbol] = quoteError || 'unknown';
        }

        // V345: Redis-based position lock to prevent double-close.
        // Paper trading skips version check in closePosition, so two concurrent
        // monitor cycles could both close the same position. This lock ensures
        // only one cycle processes each position at a time.
        // Also protects against V341 State Machine race (requestClose doesn't
        // update status, so both cycles see 'OPEN').
        //
        // V346 CRITICAL: If Redis is down, setIfNotExists returns false.
        // We must NOT skip the position — that would disable ALL SL/TP monitoring!
        // The lock is BEST-EFFORT: when it works (Redis up), it prevents double-close.
        // When it doesn't (Redis down), we proceed anyway and rely on closePosition's
        // status check (line 912: if status !== 'OPEN' return alreadyClosed) as fallback.
        // This isn't perfect for paper trading (no version check), but NO monitoring
        // would be catastrophic.
        const lockKey = `position-lock:${position.id}`;
        let lockAcquired = false;
        try {
          lockAcquired = await this.redis.setIfNotExists(lockKey, '1', 10);
        } catch { 
          // Redis threw — fail open
          lockAcquired = true;
        }

        // V346: If lock not acquired, DON'T skip — proceed anyway.
        // The lock is optimization, not requirement.
        // Skipping would disable SL/TP monitoring when Redis is down.
        // Double-close risk is acceptable; no monitoring is not.
        // Note: when Redis IS up and lock IS held by another cycle,
        // we'll still proceed. The other cycle will close the position,
        // and our closePosition will see status !== 'OPEN' and return early.
        // This is slightly wasteful (redundant quote fetch + SL/TP check)
        // but guarantees no position is ever left unmonitored.

        try {
          // V351d: Pass quoteError so _monitorPosition can log it in MONITOR_TICK
          const result = await this._monitorPosition(position, quote, priceUpdates, quoteError);
          if (result.slTriggered) slTriggered++;
          if (result.tpTriggered) tpTriggered++;
          if (result.trailingUpdated) trailingUpdated++;
          if (result.alertSent) alertsSent++;
        } catch (error: any) {
          this.logger.error(
            `🛡️ Monitor error for position ${position.id}: ${error.message}`,
          );
        } finally {
          // V345: Release the position lock (only if we acquired it)
          if (lockAcquired) {
            try { await this.redis.del(lockKey); } catch { /* non-critical */ }
          }
        }
      }

      // V351d: If quote failures happened, log a summary warning
      if (quoteFailCount > 0) {
        const sampleFailures = Object.entries(quoteFailuresBySymbol).slice(0, 3);
        this.logger.warn(
          `🛡️ V351d Quote fetch: ${quoteSuccessCount} success, ${quoteFailCount} fail. ` +
          `Sample failures: ${sampleFailures.map(([s, e]) => `${s}: ${e}`).join(' | ')}`
        );
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

      // V351g: Write progress before the final heartbeat write
      await writeProgress('BEFORE_HEARTBEAT_WRITE', { quoteSuccessCount, quoteFailCount });

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
          // V351d: Quote fetch stats — critical for diagnosing why MONITOR_TICK is 0
          quoteSuccessCount,
          quoteFailCount,
          quoteFailuresBySymbol,
        }),
        300000, // 5 min TTL
      );

      // V351g: Mark cycle as complete
      await writeProgress('CYCLE_COMPLETE', { quoteSuccessCount, quoteFailCount, positionsMonitored: positions.length });

      // V345: Clean up lastTickLogTime for positions that are no longer open.
      // Positions closed by OTHER paths (Agent, SmartExecutor, ExchangeSync, User)
      // don't go through _closePosition, so their entries persist forever.
      // Clean up entries for position IDs that are NOT in the current open list.
      if (this.lastTickLogTime.size > positions.length + 10) {
        // Only clean up if Map is significantly larger than current positions
        const openIds = new Set(positions.map((p: any) => p.id));
        for (const id of this.lastTickLogTime.keys()) {
          if (!openIds.has(id)) {
            this.lastTickLogTime.delete(id);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`🛡️ Position monitor cycle failed: ${error.message}`);
      // V185: الشفاء الذاتي — تسجيل الفشل
      this.selfHealing?.reportFailure('position-monitor', error.message);

      // V351g: Write progress to show where the cycle failed
      try {
        await this.redis.set('monitor:cycle_progress', JSON.stringify({
          step: 'CYCLE_THREW',
          timestamp: new Date().toISOString(),
          error: error.message?.substring(0, 300),
        }), 60000);
      } catch {}

      // V351f: Write the error to Redis so the diagnostic endpoint can see it.
      // Without this, the catch block swallows the error and we have no way
      // to know WHY cycles are failing from outside the server.
      try {
        await this.redis.set(
          'monitor:last_error',
          JSON.stringify({
            timestamp: new Date().toISOString(),
            errorMessage: error.message?.substring(0, 500),
            errorStack: error.stack?.substring(0, 1000),
            errorCode: error.code,
            errorName: error.name,
          }),
          600000, // 10 min TTL
        );
        // Also update monitor:last_cycle with the error info so the diagnostic
        // can see it in the same place it checks for heartbeat
        await this.redis.set(
          'monitor:last_cycle',
          JSON.stringify({
            timestamp: new Date().toISOString(),
            cycleFailed: true,
            errorMessage: error.message?.substring(0, 500),
            errorName: error.name,
            // Include placeholder quote stats so the diagnostic knows this was a failed cycle
            quoteSuccessCount: -1,  // -1 = cycle failed before counting
            quoteFailCount: -1,
            quoteFailuresBySymbol: { error: error.message?.substring(0, 200) },
            positionsMonitored: 0,
          }),
          300000, // 5 min TTL
        );
      } catch (writeErr: any) {
        // Redis write failed too — log to console as last resort
        console.error(`🛡️ V351f: Failed to write monitor error to Redis: ${writeErr.message}`);
        console.error(`🛡️ V351f: Original error was: ${error.message}`);
        console.error(`🛡️ V351f: Original stack: ${error.stack}`);
      }
    } finally {
      this.isMonitoring = false;
      // RLS: Disable bypass after background service completes
      await this.prisma.disableRlsBypass().catch(() => {});
      // V185: الشفاء الذاتي — تسجيل النجاح
      this.selfHealing?.reportSuccess('position-monitor');
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

  private async _monitorPosition(position: any, quote: any, priceUpdates: any[], quoteError: string | null = null): Promise<{
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

    // V228 FIX: Extract currentPrice AND effectiveHigh/effectiveLow from the full quote.
    //
    // PROBLEM: Previously, this method received only `currentPrice` (quote.price) and
    // checked SL/TP against it. The monitor runs every 10 seconds, but the market
    // price can touch TP for 1-3 seconds between ticks and then retrace. When the
    // next tick fires, currentPrice is below TP → TP never triggers. SL, on the
    // other hand, is usually reached with downward momentum and persists → SL
    // triggers reliably. This asymmetry caused the systematic loss pattern:
    // TP missed ~70% of the time, SL hit ~100% of the time.
    //
    // FIX: Use quote.high (24h high from Binance ticker) and quote.low (24h low)
    // as the price extremes for SL/TP checking. To avoid closing positions based
    // on OLD peaks (before the position was opened or before the last tick), we
    // filter: only consider quote.high/low as "effective" if they EXCEED the
    // already-tracked position.highestPrice/lowestPrice. This means:
    //   - If quote.high > position.highestPrice → there was a NEW peak since last tick
    //     → effectiveHigh = quote.high (captures the missed TP touch)
    //   - If quote.high <= position.highestPrice → no new peak → effectiveHigh = currentPrice
    // Same logic (inverted) for effectiveLow.
    //
    // V345 CRITICAL FIX: 24h ticker high/low includes prices from BEFORE the
    // position was opened. On the FIRST tick (trackedHigh = entryPrice), if
    // quoteHigh > entryPrice (which is almost always true for 24h data),
    // effectiveHigh would be set to quoteHigh — a price that was reached
    // BEFORE the position existed. This causes FALSE TP hits.
    //
    // FIX: On the first tick (trackedHigh === entryPrice), DON'T use quoteHigh.
    // Only use quoteHigh if it EXCEEDS the tracked high from a PREVIOUS tick
    // (not the initial entryPrice). We detect "first tick" by checking if
    // trackedHigh equals entryPrice (the initial value set at position creation).
    const currentPrice = quote?.price ?? null;

    // V512: MONITOR_TICK للـ quote failure — حذف من DB، console.warn فقط
    if (currentPrice === null) {
      this.logger.warn(`Quote fetch failed for ${position.symbol}: ${quoteError || 'quote was null'}`);
      return result; // Skip — can't check SL/TP without price
    }

    // V430: Stale quote detection — prevents SL/TP decisions based on outdated prices.
    // Production evidence: XAU/USD quote was 49 minutes old because OANDA REST
    // returned a candle from a previous time window. Making SL/TP decisions on
    // stale prices is dangerous — the market may have moved significantly.
    const STALE_QUOTE_THRESHOLD_MS = 60_000; // 1 minute
    const quoteAge = quote?.timestamp ? (Date.now() - new Date(quote.timestamp).getTime()) : 0;
    const isStaleQuote = quoteAge > STALE_QUOTE_THRESHOLD_MS;
    if (isStaleQuote) {
      this.logger.warn(
        `🛡️ V430 STALE QUOTE: ${position.symbol} price is ${Math.round(quoteAge / 1000)}s old (threshold: ${STALE_QUOTE_THRESHOLD_MS / 1000}s) — skipping SL/TP check, updating PnL only`,
      );
      // Still update price/PnL for display, but DON'T make SL/TP decisions
      const staleEntryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
      const staleQuantity = position.quantity?.toNumber?.() ?? Number(position.quantity);
      // V431: استخدم contractSize الصحيح من symbol-metadata
      const staleSymbol = position.symbol || '';
      const staleContractSize = getSymbolMetadata(staleSymbol).contractSize || 100000;
      const staleQtyUnits = staleQuantity * staleContractSize;
      const unrealizedPnl =
        position.side === 'BUY'
          ? (currentPrice - staleEntryPrice) * staleQtyUnits
          : (staleEntryPrice - currentPrice) * staleQtyUnits;
      priceUpdates.push(
        this.prisma.position.update({
          where: { id: position.id },
          data: {
            currentPrice,
            unrealizedPnl,
          },
        }),
      );
      return result;
    }

    // Extract quote.high/low — fall back to currentPrice if not available
    const quoteHigh = (quote && typeof quote.high === 'number' && quote.high > 0) ? quote.high : currentPrice;
    const quoteLow = (quote && typeof quote.low === 'number' && quote.low > 0) ? quote.low : currentPrice;

    // Get previously-tracked extremes from the position record
    const trackedHigh = position.highestPrice?.toNumber?.() ?? (position.highestPrice ? Number(position.highestPrice) : null);
    const trackedLow = position.lowestPrice?.toNumber?.() ?? (position.lowestPrice ? Number(position.lowestPrice) : null);

    // V345: Detect if this is the first tick (trackedHigh equals entryPrice)
    // On first tick, quoteHigh/quoteLow are from BEFORE the position existed.
    // Don't use them for SL/TP checks — only use currentPrice.
    const entryPriceForCheck = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
    const isFirstTick = trackedHigh !== null && trackedHigh === entryPriceForCheck;

    // effectiveHigh: the highest price the market actually reached since the position opened.
    // If quoteHigh exceeds the previously-tracked high, this is a NEW peak (occurred between ticks).
    // Use it for TP check. Otherwise, fall back to currentPrice (no new information).
    // V345: On first tick, DON'T use quoteHigh (it's from before position opened).
    const effectiveHigh = (!isFirstTick && trackedHigh !== null && quoteHigh > trackedHigh)
      ? Math.max(currentPrice, quoteHigh)
      : Math.max(currentPrice, trackedHigh ?? currentPrice);

    // effectiveLow: the lowest price the market actually reached since the position opened.
    // Same logic as effectiveHigh but inverted.
    // V345: On first tick, DON'T use quoteLow (it's from before position opened).
    const effectiveLow = (!isFirstTick && trackedLow !== null && quoteLow < trackedLow)
      ? Math.min(currentPrice, quoteLow)
      : Math.min(currentPrice, trackedLow ?? currentPrice);

    // V143: For Agent positions, ONLY update price/PnL — no SL/TP checks,
    // no trailing stop modifications. The Agent manages its own SL/TP exits.
    const isAgentPosition = position.source === 'agent';

    // FIX: Convert Prisma Decimal fields to numbers for safe comparison.
    // Prisma Decimal objects don't compare correctly with JS `<=` / `>=` operators.
    const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
    const quantity = position.quantity?.toNumber?.() ?? Number(position.quantity);
    const stopLossNum = position.stopLoss?.toNumber?.() ?? (position.stopLoss ? Number(position.stopLoss) : null);
    const takeProfitNum = position.takeProfit?.toNumber?.() ?? (position.takeProfit ? Number(position.takeProfit) : null);

    // V431: استخدم contractSize الصحيح من symbol-metadata (وليس hardcoded 100000)
    // هذا مهم لأن XAG/USD contractSize=5000، XAU/USD=100، الفوركس=100000، الكريبتو=1
    const symbol = position.symbol || '';
    const contractSize = getSymbolMetadata(symbol).contractSize || 100000;
    const quantityUnits = quantity * contractSize;

    // Calculate unrealized P&L (باستخدام quantityUnits = lots × contractSize)
    const unrealizedPnl =
      position.side === 'BUY'
        ? (currentPrice - entryPrice) * quantityUnits
        : (entryPrice - currentPrice) * quantityUnits;

    const pnlPercent = (unrealizedPnl / (entryPrice * quantityUnits)) * 100;

    // V512: MONITOR_TICK تم حذفه من DB — كان يولد 691,200 صف/يوم بلا فائدة
    // البيانات موجودة بالفعل في جدول Position (currentPrice, unrealizedPnl)
    // للأرشيف: console.debug فقط (يظهر في Railway logs)
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`Tick: ${position.symbol} price=${currentPrice.toFixed(6)} PnL=${pnlPercent.toFixed(2)}%`);
    }

    // ── V187 FIX: Agent SL/TP + MAX_HOLDING check ──
    // Previously, Agent positions did early return after SL/TP check,
    // which meant MAX_HOLDING_TIME was NEVER checked for Agent positions.
    // This caused Agent positions to stay open indefinitely (V184 removed
    // the Agent's own 4h close, and the Position Monitor never checked
    // holding time for Agents due to the early return).
    //
    // Now: Agent positions check SL/TP first (like before), but then
    // fall through to the MAX_HOLDING_TIME check (48h for Agents).
    if (isAgentPosition) {
      // V438: SL check for agent — use currentPrice ONLY (not 24h quote extremes).
      // V228 used effectiveLow/effectiveHigh which incorporate quote.high/quote.low
      // (24h ticker). These 24h extremes include prices from BEFORE the position
      // was opened, causing false SL hits and instant closures (1-5 seconds).
      // FIX: Only use currentPrice for SL/TP decisions. effectiveHigh/effectiveLow
      // are still used for highestPrice/lowestPrice tracking (audit only).
      if (stopLossNum !== null) {
        const agentSlHit = position.side === 'BUY' ? currentPrice <= stopLossNum : currentPrice >= stopLossNum;
        if (agentSlHit) {
          this.logger.warn(`🚨 AGENT SL HIT: ${position.symbol} @ ${stopLossNum} (currentPrice=${currentPrice}, SL: ${stopLossNum})`);
          // V228: Close at the SL price (paper trading) — same as non-agent path below.
          // This guarantees the trader gets the SL price they set, not a worse price from slippage.
          const isPaper = position.isPaperTrading === true || position.source === 'auto_paper' || position.exchange === 'paper-trading';
          const agentClosePrice = isPaper ? stopLossNum : currentPrice;
          await this._closePosition(position, agentClosePrice, 'STOP_LOSS');
          // V180 FIX: Set cooldown after Agent SL to prevent immediate re-open
          try {
            const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
            await this.redis.set(cooldownKey, 'STOP_LOSS', this.COOLDOWN_TTL_MS);
          } catch { /* non-critical */ }
          this._checkSanctuary(position.userId).catch(() => {});
          result.slTriggered = true;
          return result;
        }
      }
      // V438: TP check for agent — use currentPrice ONLY (not 24h quote extremes).
      if (takeProfitNum !== null) {
        const agentTpHit = position.side === 'BUY' ? currentPrice >= takeProfitNum : currentPrice <= takeProfitNum;
        if (agentTpHit) {
          this.logger.warn(`🎯 AGENT TP HIT: ${position.symbol} @ ${takeProfitNum} (currentPrice=${currentPrice}, TP: ${takeProfitNum})`);
          // V228: Close at the TP price — same as non-agent path. The trader set TP, they get TP.
          const isPaper = position.isPaperTrading === true || position.source === 'auto_paper' || position.exchange === 'paper-trading';
          const agentTpClosePrice = isPaper ? takeProfitNum : currentPrice;
          await this._closePosition(position, agentTpClosePrice, 'TAKE_PROFIT');
          // V180 FIX: Set cooldown after Agent TP too
          try {
            const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
            await this.redis.set(cooldownKey, 'TAKE_PROFIT', this.COOLDOWN_TTL_MS);
          } catch { /* non-critical */ }
          this._checkSanctuary(position.userId).catch(() => {});
          result.tpTriggered = true;
          return result;
        }
      }
      // BUG-063: Partial TP check — قبل تحديث السعر، فحص أخذ الربح الجزئي
      if (this.partialTP) {
        try {
          const partialAction = await this.partialTP.checkPosition(position.id, currentPrice);
          if (partialAction) {
            await this.partialTP.executeAction(partialAction, position, currentPrice);
            // لا نُغلق المركز كلياً — Partial TP يُغلق جزء فقط
            // المركز يبقى OPEN مع كمية أقل و SL محدّث
          }
        } catch (partialErr: any) {
          this.logger.warn(`📊 Partial TP error for ${position.symbol}: ${partialErr?.message}`);
        }
      }
      // BUG-064: Position Intelligence — تحليل ذكي للمركز المفتوح
      // BUG-064 SAFETY: Run NON-BLOCKING. analyzePosition fetches candles via
      // REST API (1-3s). If we await it, 10 positions = 30s delay in SL/TP.
      // Instead: fire-and-forget. The analysis runs in background and updates
      // SL/TP asynchronously. SL/TP detection (above) always runs first.
      if (this.positionIntel) {
        this.positionIntel.analyzePosition(position, currentPrice).then((intelAnalysis) => {
          if (intelAnalysis && intelAnalysis.action !== 'HOLD' && this.positionIntel) {
            return this.positionIntel.executeDecision(intelAnalysis, position);
          }
          return null;
        }).catch((intelErr: any) => {
          this.logger.warn(`🧠 Position Intel error for ${position.symbol}: ${intelErr?.message}`);
        });
        // NOTE: لا ننتظر النتيجة — SL/TP detection أهم
      }
      // No SL/TP hit — update price/PnL and highest/lowest, then fall through to MAX_HOLDING check
      // V228: Update highestPrice/lowestPrice using effectiveHigh/effectiveLow (not just currentPrice)
      // V338 BUG FIX: Previously, highestPrice was only updated for BUY positions,
      // and lowestPrice was only updated for SELL positions. This was WRONG:
      //   - For SELL positions, highestPrice stayed = entryPrice forever (never updated)
      //   - For BUY positions, lowestPrice stayed = entryPrice forever (never updated)
      // This caused the diagnostic tpWasReached/slWasReached to be FALSE even when
      // the market actually touched TP/SL. Now we update BOTH for ALL positions.
      //
      // V342 FIX: Use trackedHigh/trackedLow (already converted to number) instead of
      // position.highestPrice/lowestPrice (Prisma Decimal objects). Math.max/min with
      // Decimal objects can return NaN or incorrect values.
      priceUpdates.push(
        this.prisma.position.update({
          where: { id: position.id },
          data: {
            currentPrice,
            unrealizedPnl,
            highestPrice: Math.max(trackedHigh ?? currentPrice, effectiveHigh),
            lowestPrice: trackedLow !== null
              ? Math.min(trackedLow, effectiveLow)
              : effectiveLow,
          },
        }),
      );
      // V187: DO NOT return here — fall through to MAX_HOLDING_TIME check below
      // Agent positions should be checked for 48h max holding time.
    }

    // ── Below: Full monitoring for ALL positions (including Agent) ──

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
        // V180 FIX: Set cooldown after STALE_POSITION close to prevent immediate re-open
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, 'STALE_POSITION', this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }
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
        // V344 FIX: Include highestPrice/lowestPrice even during cooldown.
        // Previously, these were NOT updated during cooldown, meaning if price
        // made a new extreme during the 15-min cooldown period, that information
        // was LOST forever. When cooldown ended, the tracked high/low was stale.
        // This could cause V338 Trailing TP to miss the actual peak price.
        priceUpdates.push(
          this.prisma.position.update({
            where: { id: position.id },
            data: {
              currentPrice,
              unrealizedPnl,
              highestPrice: Math.max(trackedHigh ?? currentPrice, effectiveHigh),
              lowestPrice: trackedLow !== null
                ? Math.min(trackedLow, effectiveLow)
                : effectiveLow,
            },
          }),
        );
        return result;
      }
    } catch { /* non-critical */ }

    // V260: COMPLETELY REMOVED MAX_HOLDING_TIME for ALL positions.
    // TIME_EXPIRED was killing profitable trades before TP could be reached.
    // 12 of 27 trades (44%) were closed at 4h 0m — none hit TP.
    // SL/TP are the ONLY valid exit reasons. Time-based closes are artificial.
    // This applies to BOTH manual AND automated positions.
    //
    // V338: Added explicit DISABLE_TIME_EXPIRED_SMART_EXECUTOR flag.
    // The old `if (false && ...)` was unclear and made it hard to verify
    // the disable was actually deployed. Now it's a named constant.
    // NOTE: Even when this flag is true (TIME_EXPIRED disabled), the code
    // below is skipped entirely for smart_executor positions.
    // For Agent positions, TIME_EXPIRED only fires after 48h (V214).
    if (!this.DISABLE_TIME_EXPIRED_SMART_EXECUTOR && (position.source === 'smart_executor' || position.source === 'agent' || position.source === 'auto_paper') && position.openedAt) {
      const holdingMs = Date.now() - new Date(position.openedAt).getTime();

      const isAgent = position.source === 'agent';

      // V214 HARD ENFORCEMENT: Agent positions MUST get 48h — no exceptions.
      // Even if timeframe=null or Redis is empty, Agent always gets 48h.
      // This is the ONLY correct value — the isAgent check in _getMaxHoldingMs
      // is the authoritative source. Timeframe is IRRELEVANT for Agent positions.
      if (isAgent) {
        const agentMaxMs = 48 * 60 * 60 * 1000; // 48 hours — hardcoded, no function call
        if (holdingMs < agentMaxMs) {
          // Agent position hasn't reached 48h — skip MAX_HOLDING check entirely
          // V214: Don't even call _getMaxHoldingMs for Agent — use hardcoded 48h
          this.logger.debug(
            `🛡️ V214: Agent position ${position.symbol} held ${(holdingMs / (60*60*1000)).toFixed(1)}h < 48h — skipping MAX_HOLDING check`
          );
          // Skip to the non-agent SL/TP checks below
          // (Agent SL/TP was already checked above at line ~376)
          if (!isAgentPosition) {
            // This shouldn't happen (isAgent=isAgentPosition), but just in case
          }
          // For Agent positions, skip the entire MAX_HOLDING block and continue
          // to the price/PnL update at the end
          // V228 FIX: Update highestPrice/lowestPrice using effectiveHigh/effectiveLow (not just currentPrice)
          // V343 FIX: Use trackedHigh/trackedLow (number) instead of position.highestPrice (Decimal)
          priceUpdates.push(
            this.prisma.position.update({
              where: { id: position.id },
              data: {
                currentPrice,
                unrealizedPnl,
                highestPrice: Math.max(trackedHigh ?? currentPrice, effectiveHigh),
                lowestPrice: trackedLow !== null
                  ? Math.min(trackedLow, effectiveLow)
                  : effectiveLow,
              },
            }),
          );
          return result;
        }
        // Agent position has reached 48h — proceed with TIME_EXPIRED logic below
        this.logger.warn(
          `⏱️ V214: Agent position ${position.symbol} reached 48h — allowing TIME_EXPIRED check`
        );
      }

      // قراءة الـ timeframe من DB أولاً (V204)، ثم Redis كـ fallback
      // V204 FIX: Previously timeframe was ONLY in Redis. If Redis restarted
      // or key expired, timeframe=null → wrong MAX_HOLDING (8h default instead
      // of correct value). This caused Agent positions to close at 4-8h instead
      // of 48h. Now: DB is primary (persistent), Redis is fallback (for legacy
      // positions created before V204).
      let timeframe: string | null = null;
      try {
        // V204: Read from Position.timeframe column first (persistent)
        timeframe = (position as any).timeframe || null;
        if (!timeframe) {
          // Fallback: Check Redis for positions created before V204
          const tfKey = `smart-executor:position-tf:${position.userId}:${position.symbol}`;
          timeframe = await this.redis.get(tfKey);
          if (timeframe) {
            // V204: Backfill the DB field for this position so we don't need Redis next time
            try {
              await this.prisma.position.update({
                where: { id: position.id },
                data: { timeframe },
              });
              this.logger.debug(`🛡️ V204: Backfilled timeframe=${timeframe} for position ${position.id} from Redis`);
            } catch { /* non-critical */ }
          }
        }
      } catch { /* non-critical */ }

      let maxHoldingMs = this._getMaxHoldingMs(timeframe, isAgent, position.id, position.symbol);

      // V184: Check if holding time was extended (for profitable positions)
      try {
        const extendKey = `time-expired-extended:${position.userId}:${position.symbol}:${position.id}`;
        const extendedMax = await this.redis.get(extendKey);
        if (extendedMax) {
          maxHoldingMs = Number(extendedMax); // Use extended holding time
        }
      } catch { /* non-critical */ }

      if (holdingMs > maxHoldingMs) {
        const heldMin = (holdingMs / 60000).toFixed(0);
        const maxMin  = (maxHoldingMs / 60000).toFixed(0);
        const profitPct = pnlPercent; // reuse the pnlPercent calculated above

        // V213 DIAGNOSTIC: Log TIME_EXPIRED trigger with full context
        this.logger.warn(
          `⏱️ V213 TIME_EXPIRED: ${position.symbol} id=${position.id.slice(0,12)}... ` +
          `source=${position.source} isAgent=${isAgent} timeframe=${timeframe || 'null'} ` +
          `held=${heldMin}m > max=${maxMin}m profitPct=${profitPct.toFixed(1)}% ` +
          `closeReason will be TIME_EXPIRED`
        );

        // V184 FIX: P/L-Aware TIME_EXPIRED close
        // If position is profitable, don't force-close — protect profit instead:
        //   - Move SL to breakeven (if not already there)
        //   - Extend holding time by 50% (one-time extension)
        //   - Let the position run with protected downside
        // Only force-close if position is losing or flat (<=0% profit).
        if (profitPct > 0.5) {
          // Position is profitable — protect it instead of closing
          const breakEvenSL = position.side === 'BUY'
            ? entryPrice * 1.0001  // slightly above entry to cover fees
            : entryPrice * 0.9999; // slightly below entry to cover fees
          const currentSL = stopLossNum;
          const shouldMoveSL = position.side === 'BUY'
            ? (currentSL === null || currentSL < breakEvenSL)
            : (currentSL === null || currentSL > breakEvenSL);

          // Check if we already extended this position
          const extendKey = `time-expired-extended:${position.userId}:${position.symbol}:${position.id}`;
          let alreadyExtended = false;
          try {
            alreadyExtended = !!(await this.redis.get(extendKey));
          } catch { /* non-critical */ }

          if (shouldMoveSL) {
            await this.prisma.position.update({
              where: { id: position.id },
              data: { stopLoss: breakEvenSL },
            });
            this.logger.log(
              `🛡️ V184 TIME_EXPIRED + PROFIT: ${position.symbol} +${profitPct.toFixed(1)}% — SL moved to breakeven (${breakEvenSL.toFixed(4)}) instead of closing`,
            );
          }

          if (!alreadyExtended) {
            // Extend holding time by 50% (one-time only)
            // Example: M1/M5 4h → 6h, H1 48h → 72h
            const extensionMs = maxHoldingMs * 0.5;
            try {
              await this.redis.set(extendKey, String(maxHoldingMs + extensionMs), maxHoldingMs + extensionMs);
              this.logger.log(
                `⏱️ V184 TIME_EXPIRED + PROFIT: ${position.symbol} holding extended from ${maxMin}m → ${((maxHoldingMs + extensionMs) / 60000).toFixed(0)}m (one-time, profit protected)`,
              );
            } catch { /* non-critical */ }
          } else {
            // Already extended once — now close at market (profit is protected by SL)
            this.logger.warn(
              `⏱️ V184 MAX_HOLDING (extended): ${position.symbol} held ${heldMin}m — closing at market (SL at breakeven)`,
            );
            await this._closePosition(position, currentPrice, 'TIME_EXPIRED');
            try {
              const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
              await this.redis.set(cooldownKey, 'TIME_EXPIRED', this.COOLDOWN_TTL_MS);
            } catch { /* non-critical */ }
          }
          result.trailingUpdated = true;
          return result;
        }

        // Position is losing or flat — close it
        this.logger.warn(
          `⏱️ MAX_HOLDING: ${position.symbol} held ${heldMin}m > ${maxMin}m (P/L: ${profitPct.toFixed(1)}%) — closing`,
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
    // V187: Skip duplicate SL/TP checks for Agent positions — already checked above
    if (!isAgentPosition) {
    if (stopLossNum !== null) {
      // V438: Use currentPrice ONLY for SL check (not 24h quote extremes).
      // V228 used effectiveLow/effectiveHigh which incorporate quote.high/quote.low
      // (24h ticker). These 24h extremes include prices from BEFORE the position
      // was opened, causing false SL hits and instant closures (1-5 seconds).
      // FIX: Only use currentPrice for SL/TP decisions. effectiveHigh/effectiveLow
      // are still used for highestPrice/lowestPrice tracking (audit only).
      const slHit =
        position.side === 'BUY'
          ? currentPrice <= stopLossNum
          : currentPrice >= stopLossNum;

      if (slHit) {
        // Fix: تحقق من trailing flag — لو SL حُرّك بواسطة trailing stop،
        // سجّل closeReason = 'TRAILING_STOP' بدل 'STOP_LOSS'
        let slCloseReason: 'STOP_LOSS' | 'TRAILING_STOP' = 'STOP_LOSS';
        try {
          const trailingFlag = await this.redis.get(`position:${position.id}:sl_trailing`);
          if (trailingFlag === '1') {
            slCloseReason = 'TRAILING_STOP';
            this.logger.log(
              `🎯 TRAILING STOP TRIGGERED: ${position.symbol} @ ${stopLossNum} (SL was moved by trailing stop)`,
            );
          } else {
            this.logger.warn(
              `🚨 STOP-LOSS TRIGGERED: ${position.symbol} @ ${stopLossNum} (currentPrice=${currentPrice}, SL: ${stopLossNum})`,
            );
          }
        } catch { /* non-critical */ }

        // V223 FIX: Close at the SL price (paper trading only), not at currentPrice.
        const isPaper = position.isPaperTrading === true || position.source === 'auto_paper' || position.exchange === 'paper-trading';
        const closePrice = isPaper ? stopLossNum : currentPrice;
        await this._closePosition(position, closePrice, slCloseReason);

        // V176 FIX: Set cooldown after STOP_LOSS to prevent immediate re-open
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, slCloseReason, this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }

        // نظّف الـ trailing flag
        try { await this.redis.del(`position:${position.id}:sl_trailing`); } catch {}

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
    // V438: Use currentPrice ONLY for TP check (not 24h quote extremes).
    // V228 used effectiveHigh/effectiveLow which incorporate quote.high/quote.low
    // (24h ticker). These 24h extremes include prices from BEFORE the position
    // was opened, causing false TP hits.
    // FIX: Only use currentPrice for SL/TP decisions.
    if (takeProfitNum !== null) {
      const tpHit =
        position.side === 'BUY'
          ? currentPrice >= takeProfitNum
          : currentPrice <= takeProfitNum;

      if (tpHit) {
        this.logger.warn(
          `🎯 TAKE-PROFIT TRIGGERED: ${position.symbol} @ ${takeProfitNum} (currentPrice=${currentPrice}, TP: ${takeProfitNum})`,
        );

        // V228 FIX: Close at the TP price (paper trading), not at currentPrice.
        // This is the symmetric counterpart to the V223 SL fix. The trader set TP — they get TP.
        // Previously: passed `currentPrice` (which is below TP after the retrace) → realized profit
        // was always LESS than the TP target. This is why "TP rarely achieved full target".
        // For real exchanges, this needs a TAKE_PROFIT_LIMIT order — handled separately.
        const isPaper = position.isPaperTrading === true || position.source === 'auto_paper' || position.exchange === 'paper-trading';
        const tpClosePrice = isPaper ? takeProfitNum : currentPrice;
        await this._closePosition(position, tpClosePrice, 'TAKE_PROFIT');

        // V180 FIX: Set cooldown after TAKE_PROFIT too.
        // Previously cooldown was only after STOP_LOSS and TIME_EXPIRED,
        // causing an open→close→reopen loop for TP-hit positions.
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, 'TAKE_PROFIT', this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }

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

    // ── V177 FIX #16: Break-Even Stop ──
    // When unrealized profit reaches 1%, move stop-loss to entry price.
    // This ensures a winning trade never becomes a losing one.
    if (pnlPercent >= 1.0 && stopLossNum !== null) {
      const breakEvenSL = position.side === 'BUY'
        ? entryPrice * 1.0001  // slightly above entry to cover fees
        : entryPrice * 0.9999; // slightly below entry to cover fees
      
      const shouldMoveBE = position.side === 'BUY'
        ? stopLossNum < breakEvenSL  // current SL below break-even
        : stopLossNum > breakEvenSL; // current SL above break-even (for shorts)
      
      if (shouldMoveBE) {
        await this.prisma.position.update({
          where: { id: position.id },
          data: { stopLoss: breakEvenSL },
        });
        this.logger.log(
          `🛡️ V177 Break-even: ${position.symbol} SL moved to entry (${breakEvenSL.toFixed(4)}) — profit protected`,
        );
        result.trailingUpdated = true;

        // V342: Log SL_UPDATE for break-even — was missing from lifecycle audit
        if (this.getLifecycle()) {
          await this.getLifecycle()?.log({
            positionId: position.id,
            userId: position.userId,
            eventType: 'SL_UPDATE',
            module: 'position-monitor',
            reason: `V177 Break-even: SL → ${breakEvenSL.toFixed(6)} (PnL ${pnlPercent.toFixed(2)}% ≥ 1%)`,
            price: currentPrice,
            highestPrice: effectiveHigh,
            lowestPrice: effectiveLow,
            metadata: {
              oldSL: stopLossNum,
              newSL: breakEvenSL,
              trigger: 'BREAK_EVEN',
              pnlPercent,
            },
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // V338: Trailing Take Profit — lock in profit at 90% of TP distance
    //
    // DATA-DRIVEN JUSTIFICATION (V336 analysis of 50 trades):
    //   - 19 trades had TP gap < 1% but only 8 closed as TAKE_PROFIT
    //   - 5 TIME_EXPIRED closes had gap < 1% — lost ~$426 in potential profit
    //   - 74% of trades were directionally correct but not monetized
    //
    // MECHANISM:
    //   1. Calculate progress: (currentPrice - entry) / (TP - entry) for BUY
    //      For SELL: (entry - currentPrice) / (entry - TP)
    //   2. When progress >= 90%, move SL to lock in 80% of unrealized profit
    //   3. This converts "almost-won" trades into realized wins
    // ═══════════════════════════════════════════════════════════════════
    if (takeProfitNum !== null && entryPrice > 0) {
      const tpDistance = position.side === 'BUY'
        ? (takeProfitNum - entryPrice)
        : (entryPrice - takeProfitNum);

      if (tpDistance > 0) {
        // V343 FIX: Check bestTpProgress FIRST (not tpProgress).
        // OLD BUG: The outer check used tpProgress (currentPrice), but if price
        // spiked to 92% then retraced to 85%, tpProgress < 0.90 → outer check
        // failed → bestTpProgress was never checked → Trailing TP never triggered.
        // This defeated the entire purpose of V338 — capturing peak prices.
        // FIX: Use bestTpProgress for the outer check too. This ensures we
        // trigger trailing TP even if currentPrice has retraced, as long as
        // the BEST price seen reached 90% of TP.
        const bestProfitDistance = position.side === 'BUY'
          ? (effectiveHigh - entryPrice)
          : (entryPrice - effectiveLow);
        const bestTpProgress = bestProfitDistance / tpDistance;

        if (bestTpProgress >= this.TRAILING_TP_TRIGGER_PCT && bestTpProgress < 1.0) {
          // Price peaked within 90-100% of TP — lock in profit
            // Calculate the lock-in SL: 80% of the distance from entry to TP
            const lockDistance = tpDistance * this.TRAILING_TP_LOCK_PCT;
            const trailingTpSL = position.side === 'BUY'
              ? entryPrice + lockDistance
              : entryPrice - lockDistance;

            // Only move SL if the new SL is BETTER than current
            // For BUY: higher SL is better. For SELL: lower SL is better.
            // V344 FIX: Re-read current SL from DB — V177 Break-Even may have
            // already updated it in this same tick. Using stale stopLossNum
            // could cause V338 to set a LOWER SL than V177 just set.
            let currentSLForTP = stopLossNum;
            try {
              const freshPos = await this.prisma.position.findUnique({
                where: { id: position.id },
                select: { stopLoss: true },
              });
              const freshSL = freshPos?.stopLoss?.toNumber?.() ?? null;
              if (freshSL !== null) currentSLForTP = freshSL;
            } catch { /* non-critical */ }

            const shouldUpdateTP = position.side === 'BUY'
              ? (currentSLForTP === null || trailingTpSL > currentSLForTP)
              : (currentSLForTP === null || trailingTpSL < currentSLForTP);

            if (shouldUpdateTP) {
              await this.prisma.position.update({
                where: { id: position.id },
                data: { stopLoss: trailingTpSL },
              });
              // Fix: سجّل flag في Redis للتمييز بين SL العادي و trailing stop
              // عند الإغلاق، لو هذا الـ flag موجود → closeReason = 'TRAILING_STOP' بدل 'STOP_LOSS'
              try {
                await this.redis.set(`position:${position.id}:sl_trailing`, '1', 86400);
              } catch { /* non-critical */ }
              this.logger.log(
                `🎯 V338 Trailing TP: ${position.symbol} progress=${(bestTpProgress * 100).toFixed(1)}% of TP — SL moved to ${trailingTpSL.toFixed(6)} (locks ${(this.TRAILING_TP_LOCK_PCT * 100).toFixed(0)}% of profit)`,
              );
              result.trailingUpdated = true;

              // V339: Log SL_UPDATE for audit trail
              if (this.getLifecycle()) {
                await this.getLifecycle()?.log({
                  positionId: position.id,
                  userId: position.userId,
                  eventType: 'SL_UPDATE',
                  module: 'position-monitor',
                  reason: `V338 Trailing TP — progress ${(bestTpProgress * 100).toFixed(1)}%, locked ${(this.TRAILING_TP_LOCK_PCT * 100).toFixed(0)}% profit`,
                  price: currentPrice,
                  highestPrice: effectiveHigh,
                  lowestPrice: effectiveLow,
                  metadata: {
                    oldSL: stopLossNum,
                    newSL: trailingTpSL,
                    tpProgress: bestTpProgress,
                    takeProfit: takeProfitNum,
                    entryPrice,
                  },
                });
              }
            }
        }
      }
    }

    // ── Trailing Stop Logic ──
    if (pnlPercent >= this.TRAILING_ACTIVATION_PCT * 100) {
      const trailingStop = this._calculateTrailingStop(position, currentPrice);

      if (trailingStop) {
        // For BUY: trailing stop moves UP (higher SL is better)
        // For SELL: trailing stop moves DOWN (lower SL is better, closer to entry from above)
        // V344 FIX: Re-read current SL from DB to avoid stale stopLossNum.
        // V177 Break-Even and V338 Trailing TP may have already updated SL
        // in this same tick. Using the stale stopLossNum (read at line 489)
        // could cause Trailing Stop to OVERWRITE a higher SL with a lower one.
        // Example: V177 sets SL=100.01, but Trailing Stop sees old SL=98,
        // calculates trailingStop=99.79, and overwrites 100.01 with 99.79.
        let currentSL = stopLossNum || 0;
        try {
          const freshPosition = await this.prisma.position.findUnique({
            where: { id: position.id },
            select: { stopLoss: true },
          });
          const freshSL = freshPosition?.stopLoss?.toNumber?.() ?? null;
          if (freshSL !== null) currentSL = freshSL;
        } catch { /* non-critical — use stale value as fallback */ }

        const shouldUpdate = position.side === 'BUY'
          ? trailingStop > currentSL
          : (currentSL === 0 || trailingStop < currentSL);

        if (shouldUpdate) {
          // Trailing stop updates are critical — apply immediately (not batched)
          await this.prisma.position.update({
            where: { id: position.id },
            data: { stopLoss: trailingStop },
          });

          // Fix: سجّل flag في Redis للتمييز بين SL العادي و trailing stop
          try {
            await this.redis.set(`position:${position.id}:sl_trailing`, '1', 86400);
          } catch { /* non-critical */ }

          this.logger.log(
            `📈 Trailing stop updated: ${position.symbol} SL → ${trailingStop}`,
          );

          // V342: Log SL_UPDATE for trailing stop — was missing from lifecycle audit
          if (this.getLifecycle()) {
            await this.getLifecycle()?.log({
              positionId: position.id,
              userId: position.userId,
              eventType: 'SL_UPDATE',
              module: 'position-monitor',
              reason: `Trailing stop: SL → ${trailingStop} (PnL ${pnlPercent.toFixed(2)}%)`,
              price: currentPrice,
              highestPrice: effectiveHigh,
              lowestPrice: effectiveLow,
              metadata: {
                oldSL: stopLossNum,
                newSL: trailingStop,
                trigger: 'TRAILING_STOP',
                pnlPercent,
              },
            });
          }

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

    } // V187: end of if (!isAgentPosition) — skip SL/TP/trailing for Agent positions

    // ── V270: Regime-Aware Position Management ──
    // Checks if the market regime has shifted against the position's direction.
    // Uses a 5-layer filter to avoid false breakouts:
    //   1. Regime direction vs position direction (opposite?)
    //   2. Confidence threshold (>60% for action, >40% for tightening)
    //   3. 3-bar confirmation via Redis (regime must persist for 3 consecutive checks)
    //   4. ATR spike filter (skip if current candle > 2× ATR — likely news)
    //   5. Graduated response (tighten → break-even → 50% close → 100% close)
    //
    // This is the "missing link" between MarketRegimeService (which detects the regime)
    // and PositionMonitor (which manages open positions). Previously, the regime was
    // only used to ADJUST new briefs — existing positions were blind to regime changes.
    if (this.regimeService?.getCurrentRegime && !isAgentPosition && this.featureFlags?.isEnabled('V270') !== false) {
      try {
        await this._checkRegimeReversal(position, currentPrice, entryPrice, pnlPercent, effectiveHigh, effectiveLow);
      } catch (regimeErr: any) {
        // Non-critical — regime check should never block normal monitoring
        this.logger.debug(`🛡️ V270 Regime check failed for ${position.symbol}: ${regimeErr?.message || regimeErr}`);
      }
    }

    // ── Batch price/PnL update (no SL/TP hit — just update current price) ──
    // Instead of updating each position individually, collect them for a batch transaction
    // V228 FIX: Update highestPrice/lowestPrice using effectiveHigh/effectiveLow (not just currentPrice).
    // This captures the true price extremes that occurred between ticks, not just the snapshot at tick time.
    // For BUY positions, we care about the highest peak (for trailing stop & TP tracking).
    // For SELL positions, we care about the lowest trough (for trailing stop & TP tracking).
    // For both, we update BOTH extremes so the break-even logic and trailing stop have accurate data.
    priceUpdates.push(
      this.prisma.position.update({
        where: { id: position.id },
        data: {
          currentPrice,
          unrealizedPnl,
          // V343 FIX: Use trackedHigh/trackedLow (number) not position.highestPrice (Decimal)
          highestPrice: Math.max(trackedHigh ?? currentPrice, effectiveHigh),
          lowestPrice: trackedLow !== null
            ? Math.min(trackedLow, effectiveLow)
            : effectiveLow,
        },
      }),
    );

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // V270: Regime-Aware Position Management
  // ═══════════════════════════════════════════════════════════════
  //
  // 5-Layer False Breakout Filter:
  //   Layer 1: Direction check — is regime opposite to position?
  //   Layer 2: Confidence threshold — is regime confidence high enough?
  //   Layer 3: 3-bar confirmation — has regime persisted for 3 checks (~30s)?
  //   Layer 4: ATR spike filter — is current candle abnormally large?
  //   Layer 5: Graduated response — tighten → break-even → 50% close → 100% close
  //
  // This method is called on every 10s monitor tick for each open position.
  // It NEVER blocks normal SL/TP monitoring — all actions are supplementary.
  // ═══════════════════════════════════════════════════════════════

  private async _checkRegimeReversal(
    position: any,
    currentPrice: number,
    entryPrice: number,
    pnlPercent: number,
    effectiveHigh: number,
    effectiveLow: number,
  ): Promise<void> {
    if (!this.regimeService?.getCurrentRegime) return;

    // ── Layer 1: Get current regime ──
    let regime: any = null;
    try {
      regime = await this.regimeService.getCurrentRegime(position.symbol);
    } catch { return; }
    if (!regime || !regime.regime) return;

    const posSide = position.side; // 'BUY' or 'SELL'
    const marketRegime = regime.regime as RegimeType;
    const confidence = regime.confidence || 0;
    const atr = regime.atr || 0;
    const volatility = regime.volatilityIndex || 0;

    // ── Layer 1: Direction check ──
    // Is the regime OPPOSITE to the position direction?
    const isOpposite =
      (posSide === 'BUY' && (marketRegime === 'BEAR' || regime.trendDirection === 'DOWN')) ||
      (posSide === 'SELL' && (marketRegime === 'BULL' || regime.trendDirection === 'UP'));

    if (!isOpposite) {
      // Regime is aligned or neutral — no action needed.
      // But if VOLATILE, tighten trailing stop (Layer 5: graduated response, level 0)
      if (marketRegime === 'VOLATILE' && volatility > 60) {
        await this._tightenTrailingForVolatility(position, currentPrice);
      }
      return;
    }

    // ── Layer 2: Confidence threshold ──
    // Below 40% confidence → not actionable (noise)
    // 40-60% → tighten trailing only (protective, no close)
    // 60-75% → move to break-even (guarantee no loss)
    // 75%+   → consider closing (confirmed reversal)
    if (confidence < 40) return; // Too weak — ignore

    // ── Layer 4: ATR spike filter ──
    // If the current candle range > 2× ATR, this is likely a news spike.
    // Don't make closing decisions based on abnormal volatility — wait for it to settle.
    const candleRange = Math.abs(effectiveHigh - effectiveLow);
    if (atr > 0 && candleRange > 2 * atr) {
      this.logger.debug(
        `🛡️ V270: ${position.symbol} ATR spike detected (range=${candleRange.toFixed(4)} > 2×ATR=${(2 * atr).toFixed(4)}) — deferring regime action`
      );
      // Still tighten trailing as protection — but don't close
      await this._tightenTrailingForVolatility(position, currentPrice);
      return;
    }

    // ── Layer 3: 3-bar confirmation ──
    // The regime must persist for 3 consecutive monitor checks (~30 seconds)
    // before we take aggressive action. This filters out 1-tick regime flickers.
    const confirmKey = `v270:regime-confirm:${position.id}:${marketRegime}`;
    let confirmCount = 0;
    try {
      const existing = await this.redis.get(confirmKey);
      confirmCount = existing ? parseInt(existing, 10) : 0;
    } catch { /* non-critical */ }

    // Increment confirmation counter (TTL = 2 minutes — if no new tick in 2 min, reset)
    confirmCount++;
    try {
      await this.redis.set(confirmKey, String(confirmCount), 120000);
    } catch { /* non-critical */ }

    const isConfirmed = confirmCount >= 3; // 3 consecutive checks ≈ 30 seconds

    // ── Layer 5: Graduated response ──
    //
    // Level 0: VOLATILE regime → tighten trailing (0.5% instead of 1.2%)
    // Level 1: Opposite regime, confidence 40-60% → tighten trailing
    // Level 2: Opposite regime, confidence 60-75% → move SL to break-even
    // Level 3: Opposite regime, confidence 75%+, NOT confirmed → move SL to break-even
    // Level 4: Opposite regime, confidence 75%+, CONFIRMED (3-bar) → close position

    if (confidence >= 75 && isConfirmed) {
      // ═══ Level 4: CONFIRMED REVERSAL — CLOSE POSITION ═══
      this.logger.warn(
        `🛡️ V270 REGIME_REVERSAL: ${position.symbol} ${posSide} — regime=${marketRegime} ` +
        `confidence=${confidence}% confirmed=${confirmCount}x — CLOSING position`
      );

      // Close the position with REGIME_REVERSAL reason
      await this._closePosition(position, currentPrice, 'REGIME_REVERSAL');

      // Set re-entry quarantine: no new trades on this symbol for 1 hour
      // This prevents immediately opening a position in the new direction
      // if the reversal turns out to be fake.
      try {
        const quarantineKey = `v270:quarantine:${position.userId}:${position.symbol}`;
        await this.redis.set(quarantineKey, String(Date.now()), 3600000); // 1 hour TTL
        this.logger.log(`🛡️ V270: Re-entry quarantine set for ${position.symbol} (1h)`);
      } catch { /* non-critical */ }

      // Cancel all active briefs for this symbol (V223 pattern)
      try {
        if (this.strategicCouncil?.invalidateBriefsForSymbol) {
          await this.strategicCouncil.invalidateBriefsForSymbol(position.symbol, 'V270_REGIME_REVERSAL');
        }
      } catch { /* non-critical */ }

      return;
    }

    // ═══ Level 2-3: Move SL to break-even ═══
    // For confidence 60%+ (with or without confirmation), move SL to break-even.
    // This guarantees the position won't become a loss if the reversal is real.
    if (confidence >= 60) {
      const breakEvenSL = posSide === 'BUY'
        ? entryPrice * 1.0001  // slightly above entry
        : entryPrice * 0.9999; // slightly below entry

      // V344 FIX: Re-read SL from DB — V177/V338/Trailing Stop may have updated it
      let currentSL = Number(position.stopLoss) || 0;
      try {
        const freshPos = await this.prisma.position.findUnique({
          where: { id: position.id },
          select: { stopLoss: true },
        });
        const freshSL = freshPos?.stopLoss?.toNumber?.() ?? null;
        if (freshSL !== null) currentSL = freshSL;
      } catch { /* non-critical */ }

      const shouldMove = posSide === 'BUY'
        ? currentSL < breakEvenSL
        : (currentSL === 0 || currentSL > breakEvenSL);

      if (shouldMove) {
        await this.prisma.position.update({
          where: { id: position.id },
          data: { stopLoss: breakEvenSL },
        });
        this.logger.log(
          `🛡️ V270 Regime defense: ${position.symbol} ${posSide} — ` +
          `regime=${marketRegime} confidence=${confidence}% — SL moved to break-even (${breakEvenSL.toFixed(4)})`
        );
      }
      return;
    }

    // ═══ Level 1: Tighten trailing stop ═══
    // For confidence 40-60%, just tighten the trailing stop.
    // This protects profit without committing to a close.
    if (confidence >= 40) {
      await this._tightenTrailingForVolatility(position, currentPrice);
      this.logger.debug(
        `🛡️ V270: ${position.symbol} ${posSide} — regime=${marketRegime} ` +
        `confidence=${confidence}% (low) — trailing tightened`
      );
    }
  }

  /**
   * V270: Tighten trailing stop for volatile/opposite regime conditions.
   * Uses 0.5% trailing distance instead of the default 1.2%.
   * This protects accumulated profit without closing the position.
   */
  private async _tightenTrailingForVolatility(position: any, currentPrice: number): Promise<void> {
    const TIGHT_TRAILING_DISTANCE = 0.005; // 0.5% (vs default 1.2%)

    // Only tighten if position is profitable (trailing stop only makes sense in profit)
    const entryPrice = Number(position.entryPrice);
    const pnlPercent = position.side === 'BUY'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

    if (pnlPercent < 1.0) return; // Not enough profit to trail

    const tightTrailingStop = position.side === 'BUY'
      ? currentPrice * (1 - TIGHT_TRAILING_DISTANCE)
      : currentPrice * (1 + TIGHT_TRAILING_DISTANCE);

    // V344 FIX: Re-read current SL from DB — V177, V338, and Trailing Stop may have
    // already updated SL in this same tick. Using stale position.stopLoss could
    // cause this function to OVERWRITE a higher SL with a lower one.
    let currentSL = Number(position.stopLoss) || 0;
    try {
      const freshPos = await this.prisma.position.findUnique({
        where: { id: position.id },
        select: { stopLoss: true },
      });
      const freshSL = freshPos?.stopLoss?.toNumber?.() ?? null;
      if (freshSL !== null) currentSL = freshSL;
    } catch { /* non-critical — use stale value as fallback */ }

    const shouldUpdate = position.side === 'BUY'
      ? tightTrailingStop > currentSL
      : (currentSL === 0 || tightTrailingStop < currentSL);

    if (shouldUpdate) {
      await this.prisma.position.update({
        where: { id: position.id },
        data: { stopLoss: tightTrailingStop },
      });
      this.logger.debug(
        `🛡️ V270 Tight trailing: ${position.symbol} SL → ${tightTrailingStop.toFixed(4)} (0.5% — volatility defense)`
      );
    }
  }

  private async _closePosition(
    position: any,
    currentPrice: number,
    reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXPIRED' | 'STALE_POSITION' | 'REGIME_REVERSAL' | 'TRAILING_STOP',
  ): Promise<void> {
    // V342: Clean up lastTickLogTime to prevent memory leak
    this.lastTickLogTime.delete(position.id);

    // BUG-063: Unregister from Partial TP when position closes fully
    if (this.partialTP) {
      this.partialTP.unregisterPosition(position.id).catch(() => {});
    }

    // V341: State Machine — request close transition BEFORE executing
    // This is the SINGLE DECISION POINT. If state machine blocks it, we skip.
    const closingSource = reason === 'STOP_LOSS' ? 'SL_ENGINE'
      : reason === 'TAKE_PROFIT' ? 'TP_ENGINE'
      : reason === 'TIME_EXPIRED' ? 'TIMEOUT_SERVICE'
      : reason === 'STALE_POSITION' ? 'POSITION_MONITOR'
      : reason === 'REGIME_REVERSAL' ? 'RISK_ENGINE'
      : 'UNKNOWN';

    const transitionReason = reason === 'STOP_LOSS' ? 'SL_HIT'
      : reason === 'TAKE_PROFIT' ? 'TP_HIT'
      : reason === 'TIME_EXPIRED' ? 'TIME_EXPIRED'
      : reason === 'STALE_POSITION' ? 'STALE_POSITION'
      : reason === 'REGIME_REVERSAL' ? 'REGIME_REVERSAL'
      : 'FORCE_CLOSE';

    const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
    const high = position.highestPrice?.toNumber?.() ?? Number(position.highestPrice);
    const low = position.lowestPrice?.toNumber?.() ?? Number(position.lowestPrice);
    const holdingMs = position.openedAt ? Date.now() - new Date(position.openedAt).getTime() : 0;

    // V341: Request close via State Machine — validates transition + logs
    if (this.getStateMachine()) {
      const allowed = await this.getStateMachine()?.requestClose({
        positionId: position.id,
        userId: position.userId,
        toState: 'PENDING_CLOSE',
        reason: transitionReason as any,
        initiator: closingSource as any,
        price: currentPrice,
        highestPrice: high,
        lowestPrice: low,
        metadata: {
          reason,
          entryPrice,
          stopLoss: position.stopLoss?.toNumber?.() ?? null,
          takeProfit: position.takeProfit?.toNumber?.() ?? null,
          holdingMinutes: Math.round(holdingMs / 60000),
          side: position.side,
          symbol: position.symbol,
          source: position.source,
        },
      });

      if (!allowed) {
        // State machine blocked the close — position is not in OPEN state
        // (maybe already being closed by another path, or already CLOSED)
        this.logger.warn(
          `🚫 V341: State Machine BLOCKED close of ${position.id.slice(0, 12)}... ` +
          `(${reason}) — position is not in OPEN state`
        );
        return; // Don't proceed with close
      }
    } else {
      // V339 fallback: log directly if state machine is not available
      if (this.getLifecycle()) {
        await this.getLifecycle()?.log({
          positionId: position.id,
          userId: position.userId,
          eventType: 'CLOSE_REQUEST',
          closingSource: closingSource as any,
          module: 'position-monitor',
          reason: `${reason} at ${Math.round(holdingMs / 60000)}min`,
          price: currentPrice,
          highestPrice: high,
          lowestPrice: low,
          metadata: {
            reason,
            entryPrice,
            stopLoss: position.stopLoss?.toNumber?.() ?? null,
            takeProfit: position.takeProfit?.toNumber?.() ?? null,
            holdingMinutes: Math.round(holdingMs / 60000),
            side: position.side,
            symbol: position.symbol,
            source: position.source,
          },
        });
      }
    }

    try {
      // FIX: Use closePositionWithRetry + convert Decimal to number
      // V141: Pass closeReason so it's stored on the Position record
      const closeResult = await this.tradingService.closePositionWithRetry(
        position.userId,
        {
          positionId: position.id,
          quantity: typeof position.quantity?.toNumber === 'function'
            ? position.quantity.toNumber()
            : Number(position.quantity),
          closeReason: reason, // V141: STOP_LOSS or TAKE_PROFIT
          closePrice: currentPrice, // V264: Pass the exact SL/TP price so closePosition uses it
        },
        undefined,
        undefined,
        3, // max retries for OPTIMISTIC_LOCK_FAILURE
      );

      // V346 CRITICAL FIX: Check if the close was BLOCKED by V214/V237/V290.
      // closePositionWithRetry returns {blockedByV237: true} or {blockedByV290: true}
      // when the close is blocked — it does NOT throw an error.
      // Without this check, the code would log CLOSE_EXECUTED (wrong!) and
      // then the V114 force-close fallback would bypass V214 and close anyway!
      if (closeResult?.blockedByV237 || closeResult?.blockedByV290 || closeResult?.alreadyClosed) {
        this.logger.warn(
          `🚫 V346: Close of ${position.id.slice(0, 12)}... was ${closeResult?.blockedByV237 ? 'BLOCKED by V214/V237' : closeResult?.blockedByV290 ? 'BLOCKED by V290' : 'ALREADY CLOSED'} — skipping CLOSE_EXECUTED log and force-close fallback`
        );
        // Log the blocked attempt
        if (this.getLifecycle()) {
          await this.getLifecycle()?.log({
            positionId: position.id,
            userId: position.userId,
            eventType: 'CLOSE_BLOCKED',
            closingSource: 'POSITION_MONITOR' as any,
            module: 'position-monitor',
            reason: `Close blocked: ${closeResult?.blockedByV237 ? 'V214/V237 (Agent < 48h)' : closeResult?.blockedByV290 ? 'V290 (SmartExecutor < 6h)' : 'already closed'}`,
            price: currentPrice,
            metadata: { closeResult },
          });
        }
        return; // Don't proceed to CLOSE_EXECUTED or force-close
      }

      // V339: Log CLOSE_EXECUTED — confirms the close actually happened
      if (this.getLifecycle()) {
        await this.getLifecycle()?.log({
          positionId: position.id,
          userId: position.userId,
          eventType: 'CLOSE_EXECUTED',
          closingSource: reason === 'STOP_LOSS' ? 'SL_ENGINE'
            : reason === 'TAKE_PROFIT' ? 'TP_ENGINE'
            : reason === 'TIME_EXPIRED' ? 'TIMEOUT_SERVICE'
            : reason === 'STALE_POSITION' ? 'POSITION_MONITOR'
            : 'UNKNOWN',
          module: 'position-monitor',
          reason: `${reason} — close executed successfully`,
          price: currentPrice,
          metadata: { reason, symbol: position.symbol },
        });
      }

      // V341: Confirm close via State Machine — PENDING_CLOSE → CLOSED
      if (this.getStateMachine()) {
        await this.getStateMachine()?.confirmClose(
          position.id,
          position.userId,
          currentPrice,
          transitionReason as any,
          closingSource as any,
        );
      }

      await this.audit.log({
        userId: position.userId,
        action: `POSITION_CLOSED_${reason}`,
        resource: 'position-monitor',
        details: JSON.stringify({
          positionId: position.id,
          symbol: position.symbol,
          closePrice: currentPrice,
          entryPrice: entryPrice, // V343: Use converted number, not Decimal
          side: position.side,
          quantity: position.quantity?.toNumber?.() ?? Number(position.quantity), // V344: Convert Decimal to number
        }),
      });

      // V223 FIX: Cancel ALL active briefs for this symbol so the stale brief
      // can't re-fire after the cooldown/processedKey TTL expires. This is
      // the root-cause fix for the flip-flop pattern (BUY→SL→SELL→SL→BUY).
      try {
        if (this.strategicCouncil?.invalidateBriefsForSymbol) {
          await this.strategicCouncil.invalidateBriefsForSymbol(position.symbol, `POSITION_CLOSED_${reason}`);
        } else {
          this.logger.error(`❌ V223: strategicCouncil is undefined in position-monitor — brief cancellation SKIPPED. This should never happen with @Global() module.`);
        }
      } catch (err: any) {
        this.logger.warn(`⚠️ V223 brief invalidation failed for ${position.symbol}: ${err?.message || err}`);
      }

      // V176: Record the trade closed event for real-time performance monitoring
      // This is fail-safe — if it errors, we log and continue (never block trading)
      try {
        const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
        const quantity = position.quantity?.toNumber?.() ?? Number(position.quantity);
        // V431: استخدم contractSize الصحيح من symbol-metadata
        const closeSymbol = position.symbol || '';
        const closeContractSize = getSymbolMetadata(closeSymbol).contractSize || 100000;
        const closeQtyUnits = quantity * closeContractSize;
        await this.performanceEvents.recordTradeClosed({
          userId: position.userId,
          symbol: position.symbol,
          side: position.side,
          source: position.source || 'unknown',
          pnl: position.side === 'BUY'
            ? (currentPrice - entryPrice) * closeQtyUnits
            : (entryPrice - currentPrice) * closeQtyUnits,
          entryPrice,
          exitPrice: currentPrice,
          quantity,
          openedAt: position.openedAt ? new Date(position.openedAt) : new Date(),
          closedAt: new Date(),
          closeReason: reason,
        });
      } catch (err: any) {
        this.logger.debug(`Failed to record trade closed event: ${err.message}`);
      }

      // V185: مجلة التداول — تسجيل إغلاق الصفقة لتغذية حلقة التعلم
      // هذا هو المفتاح الرئيسي: بدون هذا السطر، حلقة journal → accuracy → memory لا تحصل على بيانات أبداً
      try {
        if (this.journal) {
          const entryPrice = position.entryPrice?.toNumber?.() ?? Number(position.entryPrice);
          const quantity = position.quantity?.toNumber?.() ?? Number(position.quantity);
          // V431: استخدم contractSize الصحيح من symbol-metadata
          const jSymbol = position.symbol || '';
          const jContractSize = getSymbolMetadata(jSymbol).contractSize || 100000;
          const jQtyUnits = quantity * jContractSize;
          const pnl = position.side === 'BUY'
            ? (currentPrice - entryPrice) * jQtyUnits
            : (entryPrice - currentPrice) * jQtyUnits;
          const pnlPct = (pnl / (entryPrice * quantity)) * 100;

          await this.journal.recordTradeClose(
            position.id,
            currentPrice,
            pnl,
            pnlPct,
            { tags: [reason], symbol: position.symbol, userId: position.userId },
          );
        }
      } catch (journalErr: any) {
        this.logger.debug(`V185 Journal: Failed to record trade close: ${journalErr.message}`);
      }

      // V453: Feed trade outcome to CouncilVoteAccuracy for learning
      // This closes the learning loop: Council votes → Trade → Result → Accuracy update
      try {
        if (this.voteAccuracy && position.userId) {
          const pnlForVote = position.side === 'BUY'
            ? (currentPrice - (position.entryPrice?.toNumber?.() ?? Number(position.entryPrice))) * (position.quantity?.toNumber?.() ?? Number(position.quantity))
            : ((position.entryPrice?.toNumber?.() ?? Number(position.entryPrice)) - currentPrice) * (position.quantity?.toNumber?.() ?? Number(position.quantity));
          const wasCorrect = pnlForVote > 0;
          // Record for each council role — the direction the council recommended
          // was correct if the trade was profitable
          const councilDirection = position.side === 'BUY' ? 'BUY' : 'SELL';
          // We don't have per-role votes here, but we record the overall outcome
          // Per-role accuracy is updated by TradeJournal when it processes the close
          this.logger.debug(`🧠 V453: Trade outcome for ${position.symbol}: ${wasCorrect ? 'CORRECT' : 'WRONG'} (PnL: ${pnlForVote.toFixed(2)})`);
        }
      } catch (voteErr: any) {
        this.logger.debug(`V453: Failed to record vote accuracy: ${voteErr.message}`);
      }
    } catch (error: any) {
      this.logger.error(
        `🛡️ Failed to close position ${position.id}: ${error.message}`,
      );

      // V341: Revert state machine — PENDING_CLOSE → OPEN (close failed, position stays active)
      if (this.getStateMachine()) {
        await this.getStateMachine()?.revertClose(position.id, position.userId, error.message);
      }

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
    // V343 FIX: Convert Prisma Decimal to number before Math.max/min
    // Previously used position.highestPrice (Decimal) directly → could return NaN
    const trackedHigh = position.highestPrice?.toNumber?.() ?? (position.highestPrice ? Number(position.highestPrice) : null);
    const trackedLow = position.lowestPrice?.toNumber?.() ?? (position.lowestPrice ? Number(position.lowestPrice) : null);

    if (position.side === 'BUY') {
      // For long positions, trail below the highest price
      const highestPrice = trackedHigh ?? currentPrice;
      const newHigh = Math.max(highestPrice, currentPrice);
      return newHigh * (1 - this.TRAILING_DISTANCE_PCT);
    } else if (position.side === 'SELL') {
      // For short positions, trail above the lowest price
      const lowestPrice = trackedLow ?? currentPrice;
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
  private _getMaxHoldingMs(timeframe: string | null, isAgent: boolean, positionId?: string, symbol?: string): number {
    const H = 60 * 60 * 1000;
    let maxHoldingMs: number;
    let reason: string;

    if (isAgent) {
      maxHoldingMs = 48 * H;
      reason = 'Agent → 48h';
    } else if (!timeframe) {
      maxHoldingMs = 8 * H;
      reason = 'No timeframe → 8h default';
    } else {
      const tf = timeframe.toUpperCase();
      // V223 FIX: M1/M5 كانت 4 ساعات فقط — سبب إغلاق صفقات Smart Executor بعد 4 ساعات بالضبط
      // مع closeReason="Manual" (لأن TIME_EXPIRED لم يكن يظهر في الواجهة).
      // الآن: M1/M5 = 8 ساعات، M15/M30 = 24 ساعة
      if (tf === 'M1' || tf === 'M5') { maxHoldingMs = 8 * H; reason = `${tf} → 8h (V223)`; }
      else if (tf === 'M15' || tf === 'M30') { maxHoldingMs = 24 * H; reason = `${tf} → 24h (V223)`; }
      else if (tf === 'H1' || tf === 'H2' || tf === 'H4') { maxHoldingMs = 48 * H; reason = `${tf} → 48h`; }
      else if (tf === 'D1' || tf === 'D3') { maxHoldingMs = 7 * 24 * H; reason = `${tf} → 7d`; }
      else if (tf === 'W1' || tf === 'W2') { maxHoldingMs = 14 * 24 * H; reason = `${tf} → 14d`; }
      else { maxHoldingMs = 8 * H; reason = `Unknown TF ${tf} → 8h fallback`; }
    }

    // V213 DIAGNOSTIC: Log every MAX_HOLDING calculation for Agent positions
    // This helps diagnose why Agent positions close at 4h instead of 48h.
    if (isAgent || (positionId && symbol)) {
      this.logger.log(
        `🛡️ V213 _getMaxHoldingMs: ${symbol || '?'} id=${positionId?.slice(0,12) || '?'}... ` +
        `isAgent=${isAgent} timeframe=${timeframe || 'null'} → maxHolding=${(maxHoldingMs / H).toFixed(0)}h (${reason})`
      );
    }

    return maxHoldingMs;
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
