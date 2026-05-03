// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — AI Council Scheduler Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';

/**
 * Council Scheduler Service — Autonomous AI Council Conductor
 *
 * Periodically convenes the AI Council (multi-model consensus)
 * to analyze top-performing and volatile symbols, producing
 * authoritative trading recommendations.
 *
 * The Council combines 6 AI specialists:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. المحلل الفني    (Gemini) — Technical analysis           │
 * │ 2. محلل المشاعر    (Groq)   — Sentiment analysis           │
 * │ 3. خبير المخاطر    (GLM)    — Risk assessment              │
 * │ 4. خبير الماكرو    (Gemini) — Macro analysis               │
 * │ 5. خبير الأنماط    (GLM)    — Pattern recognition          │
 * │ 6. استراتيجي التنفيذ (Groq) — Execution timing             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Results are stored in Redis and can trigger alerts for
 * human traders or bot execution.
 *
 * Frequency: Every 15 minutes
 * Symbols: Top 5 from watchlists + highest volatility
 */
@Injectable()
export class CouncilSchedulerService {
  private readonly logger = new Logger(CouncilSchedulerService.name);

  /** Minimum consensus score to generate alert */
  private readonly MIN_CONSENSUS_SCORE = 75;

  /** Symbols to analyze in each council session */
  private readonly COUNCIL_SYMBOLS_COUNT = 5;

  /** Is council currently in session */
  private isInSession = false;

  /** FIX: Daily cost cap for council sessions — prevents runaway AI spending */
  private readonly DAILY_COST_CAP_USD = 5.00; // $5/day max for automated council sessions

  /** Redis key for daily cost accumulator — persists across NestJS restarts */
  private readonly REDIS_DAILY_COST_KEY = 'council:daily_cost';
  private readonly REDIS_DAILY_COST_DATE_KEY = 'council:daily_cost_date';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly audit: AuditService,
  ) {
    this.logger.log('🏛️ AI Council Scheduler initialized — consensus engine ready');
  }

  /**
   * Main council session — runs every 30 minutes
   *
   * FIX: Changed from 15→30 minutes to reduce AI consumption.
   * Each session hits 6 AI models × 5 symbols = 30 AI calls.
   * At 15 min intervals: 2,880 AI calls/day.
   * At 30 min intervals: 1,440 AI calls/day (50% reduction).
   * Consensus is cached for 5 minutes, so the dashboard still
   * shows fresh data between council sessions.
   *
   * Selects top symbols and runs consensus analysis on each.
   */
  @Cron('*/30 * * * *')
  async runCouncilSession(): Promise<void> {
    if (this.isInSession) {
      this.logger.warn('🏛️ Previous council session still running — skipping');
      return;
    }

    this.isInSession = true;
    const startTime = Date.now();

    try {
      this.logger.log('🏛️ Convening AI Council session...');

      // FIX: Check global daily cost cap BEFORE starting the session
      const todayCost = await this._getTodayCost();
      if (todayCost >= this.DAILY_COST_CAP_USD) {
        this.logger.warn(`💰 Daily cost cap reached ($${todayCost.toFixed(2)}/$${this.DAILY_COST_CAP_USD}) — skipping entire council session`);
        return;
      }

      // Step 1: Select symbols for this session
      const symbols = await this._selectCouncilSymbols();
      if (symbols.length === 0) {
        this.logger.warn('🏛️ No symbols selected for council session');
        return;
      }

      this.logger.log(`🏛️ Council analyzing ${symbols.length} symbols: ${symbols.join(', ')}`);

      // Step 2: Run consensus analysis for each symbol
      const results: CouncilResult[] = [];

      for (const symbol of symbols) {
        try {
          this.logger.log(`🏛️ Council deliberating on ${symbol}...`);

          // FIX: Check daily cost before running council session
          const todayCost = await this._getTodayCost();
          if (todayCost >= this.DAILY_COST_CAP_USD) {
            this.logger.warn(`💰 Daily cost cap reached ($${todayCost.toFixed(2)}/$${this.DAILY_COST_CAP_USD}) — skipping ${symbol} and remaining symbols`);
            break; // Stop processing remaining symbols
          }

          const consensus = await this.orchestrator.getConsensusAnalysis(symbol);

          const result: CouncilResult = {
            symbol,
            timestamp: new Date().toISOString(),
            recommendation: consensus.recommendation,
            consensusScore: consensus.consensusScore,
            analysesCount: consensus.analyses.length,
            masterStrategy: consensus.masterStrategy,
          };

          results.push(result);

          // FIX #5: Track actual cost after each symbol analysis
          // Uses the _addCost() method which estimates based on model count
          await this._addCost(symbol, consensus.recommendation, consensus.analyses.length);

          // Store in Redis
          await this.redis.set(
            `council:result:${symbol}`,
            JSON.stringify(result),
            1800000, // 30 min TTL
          );

          // If strong consensus, publish alert
          if (consensus.consensusScore >= this.MIN_CONSENSUS_SCORE) {
            await this.redis.set(
              `council:alert:${symbol}`,
              JSON.stringify({
                symbol,
                recommendation: consensus.recommendation,
                score: consensus.consensusScore,
                strategy: consensus.masterStrategy,
                timestamp: new Date().toISOString(),
              }),
              3600000, // 1 hour TTL
            );

            this.logger.log(
              `🚨 Council ALERT: ${symbol} → ${consensus.recommendation} (${consensus.consensusScore}%)`,
            );
          }

          // Small delay between symbols to respect rate limits
          await this._sleep(2000);
        } catch (error: any) {
          this.logger.error(`🏛️ Council analysis failed for ${symbol}: ${error.message}`);
        }
      }

      const elapsed = Date.now() - startTime;

      // Store session summary
      const sessionSummary = {
        timestamp: new Date().toISOString(),
        durationMs: elapsed,
        symbolsAnalyzed: symbols.length,
        results,
        strongConsensusCount: results.filter((r) => r.consensusScore >= this.MIN_CONSENSUS_SCORE).length,
      };

      await this.redis.set(
        'council:last_session',
        JSON.stringify(sessionSummary),
        3600000,
      );

      this.logger.log(
        `🏛️ Council session complete: ${results.length} symbols, ${sessionSummary.strongConsensusCount} strong consensus (${elapsed}ms)`,
      );

      await this.audit.log({
        userId: 'system',
        action: 'COUNCIL_SESSION_COMPLETE',
        resource: 'council-scheduler',
        details: JSON.stringify(sessionSummary),
      });
    } catch (error: any) {
      this.logger.error(`🏛️ Council session failed: ${error.message}`);
    } finally {
      this.isInSession = false;
    }
  }

  /**
   * Force a council session for specific symbols
   */
  async forceSession(userId: string, symbols: string[]): Promise<CouncilResult[]> {
    this.logger.log(`🏛️ Manual council session triggered by user ${userId} for: ${symbols.join(', ')}`);

    const results: CouncilResult[] = [];

    for (const symbol of symbols) {
      try {
        const consensus = await this.orchestrator.getConsensusAnalysis(symbol);

        const result: CouncilResult = {
          symbol,
          timestamp: new Date().toISOString(),
          recommendation: consensus.recommendation,
          consensusScore: consensus.consensusScore,
          analysesCount: consensus.analyses.length,
          masterStrategy: consensus.masterStrategy,
        };

        results.push(result);

        await this.redis.set(
          `council:result:${symbol}`,
          JSON.stringify(result),
          1800000,
        );
      } catch (error: any) {
        this.logger.error(`🏛️ Manual council failed for ${symbol}: ${error.message}`);
      }
    }

    await this.audit.log({
      userId,
      action: 'COUNCIL_MANUAL_SESSION',
      resource: 'council-scheduler',
      details: JSON.stringify({ symbols, results }),
    });

    return results;
  }

  /**
   * Get last council session results
   */
  async getLastSession(): Promise<any> {
    const cached = await this.redis.get('council:last_session');
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Get council result for a specific symbol
   */
  async getSymbolResult(symbol: string): Promise<CouncilResult | null> {
    const cached = await this.redis.get(`council:result:${symbol}`);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * SCAN-based key retrieval (avoids blocking KEYS command)
   */
  private async _scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    const client = (this.redis as any)['client'];
    do {
      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    return keys;
  }

  /**
   * Get all active council alerts
   */
  async getActiveAlerts(): Promise<any[]> {
    try {
      const keys = await this._scanKeys('council:alert:*');
      const alerts: any[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          alerts.push(JSON.parse(data));
        }
      }

      return alerts;
    } catch {
      return [];
    }
  }

  // ── Private: Symbol Selection ──

  /**
   * Select symbols for the council session:
   * 1. Symbols with extreme moves (> 3% change)
   * 2. Symbols from active signals
   * 3. Top default symbols
   */
  private async _selectCouncilSymbols(): Promise<string[]> {
    const symbolSet = new Set<string>();

    // Add symbols with recent alerts (extreme moves)
    try {
      const alertKeys = await this._scanKeys('scanner:alert:*');
      for (const key of alertKeys) {
        const data = await this.redis.get(key);
        if (data) {
          const alert = JSON.parse(data);
          if (Math.abs(alert.changePercent) >= 3) {
            symbolSet.add(alert.symbol);
          }
        }
      }
    } catch {
      // Ignore
    }

    // Add symbols from active signals
    try {
      const activeSignals = await this.prisma.signal.findMany({
        where: { status: 'ACTIVE' },
        select: { pair: true },
        distinct: ['pair'],
      });
      activeSignals.forEach((s) => symbolSet.add(s.pair));
    } catch {
      // Ignore
    }

    // Add default top symbols if we need more
    const defaults = ['BTC/USDT', 'ETH/USDT', 'AAPL', 'TSLA', 'NVDA'];
    for (const sym of defaults) {
      if (symbolSet.size < this.COUNCIL_SYMBOLS_COUNT) {
        symbolSet.add(sym);
      }
    }

    return Array.from(symbolSet).slice(0, this.COUNCIL_SYMBOLS_COUNT);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * FIX: Get today's total AI cost from Redis accumulator (with AiUsageLog fallback)
   * Uses Redis for persistence across NestJS restarts, with automatic
   * daily reset at midnight.
   */
  private async _getTodayCost(): Promise<number> {
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // Check if we need to reset the daily counter (new day)
      const storedDate = await this.redis.get(this.REDIS_DAILY_COST_DATE_KEY);
      if (storedDate !== today) {
        // New day — reset the accumulator
        await this.redis.set(this.REDIS_DAILY_COST_KEY, '0', 86400000); // 24h TTL
        await this.redis.set(this.REDIS_DAILY_COST_DATE_KEY, today, 86400000);
        return 0;
      }

      // Get accumulated cost from Redis
      const redisCost = await this.redis.get(this.REDIS_DAILY_COST_KEY);
      if (redisCost) {
        const cost = parseFloat(redisCost);
        if (!isNaN(cost) && cost > 0) return cost;
      }

      // Fallback: sum from AiUsageLog (if Redis accumulator is missing/stale)
      const prisma = (this as any).prisma;
      if (!prisma) return 0;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const result = await prisma.aiUsageLog.aggregate({
        where: { createdAt: { gte: startOfDay } },
        _sum: { costUsd: true },
      });
      const dbCost = result._sum.costUsd || 0;

      // Sync Redis with DB value
      await this.redis.set(this.REDIS_DAILY_COST_KEY, dbCost.toString(), 86400000);

      return dbCost;
    } catch {
      return 0; // If we can't check cost, allow the session
    }
  }

  /**
   * FIX: Add cost to the daily Redis accumulator after a council symbol is processed.
   */
  private async _addCost(symbol: string, recommendation: string, analysesCount: number): Promise<void> {
    try {
      // Estimate cost per symbol based on model count
      // Rough estimate: $0.02 per model call for free-tier models, $0.05 for paid
      const estimatedCostPerModel = 0.02;
      const estimatedCost = analysesCount * estimatedCostPerModel;

      const currentCost = await this._getTodayCost();
      const newCost = currentCost + estimatedCost;

      await this.redis.set(this.REDIS_DAILY_COST_KEY, newCost.toString(), 86400000);
      this.logger.debug(`💰 Estimated cost for ${symbol}: $${estimatedCost.toFixed(4)} (total today: $${newCost.toFixed(2)})`);
    } catch {
      // Non-critical — don't block on cost tracking errors
    }
  }
}

// ── Types ──

export interface CouncilResult {
  symbol: string;
  timestamp: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  consensusScore: number;
  analysesCount: number;
  masterStrategy: string;
}
