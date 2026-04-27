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

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly audit: AuditService,
  ) {
    this.logger.log('🏛️ AI Council Scheduler initialized — consensus engine ready');
  }

  /**
   * Main council session — runs every 15 minutes
   *
   * Selects top symbols and runs consensus analysis on each.
   */
  @Cron('*/15 * * * *')
  async runCouncilSession(): Promise<void> {
    if (this.isInSession) {
      this.logger.warn('🏛️ Previous council session still running — skipping');
      return;
    }

    this.isInSession = true;
    const startTime = Date.now();

    try {
      this.logger.log('🏛️ Convening AI Council session...');

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
