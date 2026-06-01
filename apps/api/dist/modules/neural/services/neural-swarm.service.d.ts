import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import { SwarmStartRequest, SwarmResult } from '../neural.types';
export declare class NeuralSwarmService {
    private readonly prisma;
    private readonly configService;
    private readonly exchangeService;
    private readonly orchestrator;
    private readonly auditService;
    private readonly logger;
    private readonly activeSwarms;
    private readonly swarmOwners;
    private readonly MAX_AGENTS;
    constructor(prisma: PrismaService, configService: ConfigService, exchangeService: ExchangeService, orchestrator: AIOrchestratorService, auditService: AuditService);
    startSwarm(userId: string, request: SwarmStartRequest, language?: string): Promise<SwarmResult>;
    getSwarmStatus(swarmId: string, userId?: string): SwarmResult | null;
    stopSwarm(userId: string, swarmId: string): Promise<SwarmResult | null>;
    getAllSwarms(userId?: string): SwarmResult[];
    private _parseSignalFromConsensus;
    private _calculateSwarmConsensus;
}
