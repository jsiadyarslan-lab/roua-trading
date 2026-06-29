// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Neural Swarm Agent Coordination
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import {
  SwarmStartRequest,
  SwarmAgentStatus,
  SwarmResult,
  SwarmAgent,
  BacktestStrategy,
} from '../neural.types';
import { t } from '../../../i18n/i18n.helper';

/**
 * Neural Swarm Service — Multi-Agent Trading Coordination
 *
 * Creates and manages a swarm of AI trading agents that:
 * - Each agent monitors a specific symbol
 * - Uses AI Council consensus for signal generation
 * - Agents vote on trades (swarm intelligence)
 * - Final decision requires majority agreement
 *
 * Architecture:
 * ┌──────────────────────────────────────────┐
 * │  Swarm Coordinator                       │
 * │    ├─→ Agent 1 (BTC/USDT) → BUY (85%)   │
 * │    ├─→ Agent 2 (ETH/USDT) → SELL (72%)  │
 * │    ├─→ Agent 3 (SOL/USDT) → WAIT (60%)  │
 * │    └─→ Consensus: WAIT (agreement: 33%)  │
 * │                                          │
 * │  Each agent = AI Council mini-session     │
 * │  Swarm = Democratic voting among agents   │
 * └──────────────────────────────────────────┘
 */
@Injectable()
export class NeuralSwarmService {
  private readonly logger = new Logger(NeuralSwarmService.name);

  /** Active swarms (in-memory), keyed by swarmId */
  private readonly activeSwarms: Map<string, SwarmResult> = new Map();

  /** Maps swarmId → userId for ownership tracking */
  private readonly swarmOwners: Map<string, string> = new Map();

  /** Maximum number of agents per swarm */
  private readonly MAX_AGENTS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly exchangeService: ExchangeService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('🐝 Neural Swarm Service initialized — multi-agent coordination');
  }

  /**
   * Start a new trading swarm
   *
   * Flow:
   * 1. Validate request (agents count, symbols)
   * 2. Create agents (one per symbol, up to N)
   * 3. Each agent fetches market data + AI analysis
   * 4. Calculate consensus from all agents
   * 5. Return swarm state
   */
  async startSwarm(userId: string, request: SwarmStartRequest, language: string = 'ar'): Promise<SwarmResult> {
    this.logger.log(`🐝 Starting swarm with ${request.agents} agents`);

    // Step 1: Validate
    if (request.agents < 1 || request.agents > this.MAX_AGENTS) {
      throw new Error(language === 'en' ? `Agent count must be between 1 and ${this.MAX_AGENTS}` : `عدد الوكلاء يجب أن يكون بين 1 و ${this.MAX_AGENTS}`);
    }

    if (!request.symbols || request.symbols.length === 0) {
      throw new Error(language === 'en' ? 'At least one symbol must be specified' : 'يجب تحديد رمز واحد على الأقل');
    }

    // Step 2: Create agents (distribute symbols across agents)
    const agents: SwarmAgent[] = [];
    const swarmId = `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    for (let i = 0; i < request.agents; i++) {
      const symbol = request.symbols[i % request.symbols.length];

      try {
        // Step 3: Each agent gets AI analysis for its symbol
        const analysis = await this.orchestrator.getConsensusAnalysis(symbol);

        // Parse signal from consensus
        const signal = this._parseSignalFromConsensus(analysis.recommendation);
        const confidence = analysis.consensusScore;

        agents.push({
          id: `agent-${i + 1}`,
          symbol,
          status: SwarmAgentStatus.RUNNING,
          signal,
          confidence,
          pnl: 0,
          trades: 0,
        });
      } catch (error: any) {
        this.logger.warn(`Agent ${i + 1} failed for ${symbol}: ${error.message}`);
        agents.push({
          id: `agent-${i + 1}`,
          symbol,
          status: SwarmAgentStatus.FAILED,
          signal: null,
          confidence: 0,
          pnl: 0,
          trades: 0,
        });
      }
    }

    // Step 4: Calculate swarm consensus (democratic voting)
    const consensus = this._calculateSwarmConsensus(agents);

    // Step 5: Build swarm result
    const swarm: SwarmResult = {
      swarmId,
      status: 'ACTIVE',
      agents,
      consensus,
      performance: {
        totalPnl: 0,
        winRate: 0,
        activeAgents: agents.filter((a) => a.status === SwarmAgentStatus.RUNNING).length,
      },
      startedAt: new Date().toISOString(),
    };

    this.activeSwarms.set(swarmId, swarm);
    this.swarmOwners.set(swarmId, userId);

    // Audit
    await this.auditService.log({
      userId,
      action: 'SWARM_STARTED',
      resource: 'neural-lab',
      details: JSON.stringify({
        swarmId,
        agents: request.agents,
        symbols: request.symbols,
        consensus: consensus.action,
        confidence: consensus.confidence,
      }),
    });

    this.logger.log(`🐝 Swarm ${swarmId} started — ${agents.length} agents, consensus: ${consensus.action} (${consensus.confidence}%)`);

    return swarm;
  }

  /**
   * Get swarm status (with ownership check)
   */
  getSwarmStatus(swarmId: string, userId?: string): SwarmResult | null {
    const swarm = this.activeSwarms.get(swarmId);
    if (!swarm) return null;
    // If userId provided, enforce ownership
    if (userId && this.swarmOwners.get(swarmId) !== userId) return null;
    return swarm;
  }

  /**
   * Stop a swarm
   */
  async stopSwarm(userId: string, swarmId: string): Promise<SwarmResult | null> {
    const swarm = this.activeSwarms.get(swarmId);
    if (!swarm) return null;

    // V155 SECURITY FIX: Verify swarm ownership before stopping.
    // Previously, any user could stop any other user's swarm by providing the swarmId.
    // The swarmOwners Map exists for this purpose but wasn't used here.
    const owner = this.swarmOwners.get(swarmId);
    if (owner && owner !== userId) {
      throw new ForbiddenException(t('neural_swarm_service.not_this'));
    }

    swarm.status = 'STOPPED';
    swarm.agents.forEach((a) => {
      if (a.status === SwarmAgentStatus.RUNNING) {
        a.status = SwarmAgentStatus.COMPLETED;
      }
    });

    await this.auditService.log({
      userId,
      action: 'SWARM_STOPPED',
      resource: 'neural-lab',
      details: JSON.stringify({ swarmId }),
    });

    this.logger.log(`🐝 Swarm ${swarmId} stopped`);
    return swarm;
  }

  /**
   * Get all active swarms (optionally filtered by userId)
   */
  getAllSwarms(userId?: string): SwarmResult[] {
    if (!userId) return Array.from(this.activeSwarms.values());
    // Filter by ownership
    return Array.from(this.activeSwarms.entries())
      .filter(([swarmId]) => this.swarmOwners.get(swarmId) === userId)
      .map(([, swarm]) => swarm);
  }

  // ── Private Methods ──

  private _parseSignalFromConsensus(recommendation: string): 'BUY' | 'SELL' | 'WAIT' {
    const lower = recommendation.toLowerCase();
    if (lower.includes('buy') || lower.includes('شراء') || lower.includes('strong buy')) return 'BUY';
    if (lower.includes('sell') || lower.includes('بيع') || lower.includes('strong sell')) return 'SELL';
    return 'WAIT';
  }

  /**
   * Democratic consensus: majority vote with agreement percentage
   */
  private _calculateSwarmConsensus(agents: SwarmAgent[]): SwarmResult['consensus'] {
    const activeAgents = agents.filter((a) => a.signal !== null);
    if (activeAgents.length === 0) {
      return { action: 'WAIT', confidence: 0, agreement: 0 };
    }

    // Count votes
    const votes: Record<string, number> = { BUY: 0, SELL: 0, WAIT: 0 };
    let totalConfidence = 0;

    for (const agent of activeAgents) {
      if (agent.signal) {
        votes[agent.signal]++;
        totalConfidence += agent.confidence;
      }
    }

    // Find majority
    const maxVotes = Math.max(votes.BUY, votes.SELL, votes.WAIT);
    const action = Object.entries(votes).find(([, v]) => v === maxVotes)?.[0] as 'BUY' | 'SELL' | 'WAIT';

    // Agreement = percentage of agents that voted with majority
    const agreement = (maxVotes / activeAgents.length) * 100;

    // Confidence = average confidence of majority voters
    const majorityAgents = activeAgents.filter((a) => a.signal === action);
    const avgConfidence = majorityAgents.length > 0 ? totalConfidence / activeAgents.length : 0;

    return {
      action,
      confidence: Math.round(avgConfidence),
      agreement: Math.round(agreement),
    };
  }
}
