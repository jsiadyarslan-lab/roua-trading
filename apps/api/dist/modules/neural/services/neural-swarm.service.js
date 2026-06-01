"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NeuralSwarmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeuralSwarmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const exchange_service_1 = require("../../exchange/exchange.service");
const ai_orchestrator_service_1 = require("../../ai/services/ai-orchestrator.service");
const audit_service_1 = require("../../../audit/audit.service");
const neural_types_1 = require("../neural.types");
let NeuralSwarmService = NeuralSwarmService_1 = class NeuralSwarmService {
    constructor(prisma, configService, exchangeService, orchestrator, auditService) {
        this.prisma = prisma;
        this.configService = configService;
        this.exchangeService = exchangeService;
        this.orchestrator = orchestrator;
        this.auditService = auditService;
        this.logger = new common_1.Logger(NeuralSwarmService_1.name);
        this.activeSwarms = new Map();
        this.swarmOwners = new Map();
        this.MAX_AGENTS = 10;
        this.logger.log('🐝 Neural Swarm Service initialized — multi-agent coordination');
    }
    async startSwarm(userId, request, language = 'ar') {
        this.logger.log(`🐝 Starting swarm with ${request.agents} agents`);
        if (request.agents < 1 || request.agents > this.MAX_AGENTS) {
            throw new Error(language === 'en' ? `Agent count must be between 1 and ${this.MAX_AGENTS}` : `عدد الوكلاء يجب أن يكون بين 1 و ${this.MAX_AGENTS}`);
        }
        if (!request.symbols || request.symbols.length === 0) {
            throw new Error(language === 'en' ? 'At least one symbol must be specified' : 'يجب تحديد رمز واحد على الأقل');
        }
        const agents = [];
        const swarmId = `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        for (let i = 0; i < request.agents; i++) {
            const symbol = request.symbols[i % request.symbols.length];
            try {
                const analysis = await this.orchestrator.getConsensusAnalysis(symbol);
                const signal = this._parseSignalFromConsensus(analysis.recommendation);
                const confidence = analysis.consensusScore;
                agents.push({
                    id: `agent-${i + 1}`,
                    symbol,
                    status: neural_types_1.SwarmAgentStatus.RUNNING,
                    signal,
                    confidence,
                    pnl: 0,
                    trades: 0,
                });
            }
            catch (error) {
                this.logger.warn(`Agent ${i + 1} failed for ${symbol}: ${error.message}`);
                agents.push({
                    id: `agent-${i + 1}`,
                    symbol,
                    status: neural_types_1.SwarmAgentStatus.FAILED,
                    signal: null,
                    confidence: 0,
                    pnl: 0,
                    trades: 0,
                });
            }
        }
        const consensus = this._calculateSwarmConsensus(agents);
        const swarm = {
            swarmId,
            status: 'ACTIVE',
            agents,
            consensus,
            performance: {
                totalPnl: 0,
                winRate: 0,
                activeAgents: agents.filter((a) => a.status === neural_types_1.SwarmAgentStatus.RUNNING).length,
            },
            startedAt: new Date().toISOString(),
        };
        this.activeSwarms.set(swarmId, swarm);
        this.swarmOwners.set(swarmId, userId);
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
    getSwarmStatus(swarmId, userId) {
        const swarm = this.activeSwarms.get(swarmId);
        if (!swarm)
            return null;
        if (userId && this.swarmOwners.get(swarmId) !== userId)
            return null;
        return swarm;
    }
    async stopSwarm(userId, swarmId) {
        const swarm = this.activeSwarms.get(swarmId);
        if (!swarm)
            return null;
        const owner = this.swarmOwners.get(swarmId);
        if (owner && owner !== userId) {
            throw new common_1.ForbiddenException('غير مصرح بإيقاف هذا السرب');
        }
        swarm.status = 'STOPPED';
        swarm.agents.forEach((a) => {
            if (a.status === neural_types_1.SwarmAgentStatus.RUNNING) {
                a.status = neural_types_1.SwarmAgentStatus.COMPLETED;
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
    getAllSwarms(userId) {
        if (!userId)
            return Array.from(this.activeSwarms.values());
        return Array.from(this.activeSwarms.entries())
            .filter(([swarmId]) => this.swarmOwners.get(swarmId) === userId)
            .map(([, swarm]) => swarm);
    }
    _parseSignalFromConsensus(recommendation) {
        const lower = recommendation.toLowerCase();
        if (lower.includes('buy') || lower.includes('شراء') || lower.includes('strong buy'))
            return 'BUY';
        if (lower.includes('sell') || lower.includes('بيع') || lower.includes('strong sell'))
            return 'SELL';
        return 'WAIT';
    }
    _calculateSwarmConsensus(agents) {
        const activeAgents = agents.filter((a) => a.signal !== null);
        if (activeAgents.length === 0) {
            return { action: 'WAIT', confidence: 0, agreement: 0 };
        }
        const votes = { BUY: 0, SELL: 0, WAIT: 0 };
        let totalConfidence = 0;
        for (const agent of activeAgents) {
            if (agent.signal) {
                votes[agent.signal]++;
                totalConfidence += agent.confidence;
            }
        }
        const maxVotes = Math.max(votes.BUY, votes.SELL, votes.WAIT);
        const action = Object.entries(votes).find(([, v]) => v === maxVotes)?.[0];
        const agreement = (maxVotes / activeAgents.length) * 100;
        const majorityAgents = activeAgents.filter((a) => a.signal === action);
        const avgConfidence = majorityAgents.length > 0 ? totalConfidence / activeAgents.length : 0;
        return {
            action,
            confidence: Math.round(avgConfidence),
            agreement: Math.round(agreement),
        };
    }
};
exports.NeuralSwarmService = NeuralSwarmService;
exports.NeuralSwarmService = NeuralSwarmService = NeuralSwarmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        exchange_service_1.ExchangeService,
        ai_orchestrator_service_1.AIOrchestratorService,
        audit_service_1.AuditService])
], NeuralSwarmService);
//# sourceMappingURL=neural-swarm.service.js.map