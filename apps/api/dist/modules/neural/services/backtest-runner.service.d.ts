import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import { BacktestRequest, BacktestResult } from '../neural.types';
export declare class BacktestRunnerService {
    private readonly prisma;
    private readonly exchangeService;
    private readonly orchestrator;
    private readonly auditService;
    private readonly logger;
    private readonly DEFAULT_INITIAL_CAPITAL;
    private readonly DEFAULT_POSITION_SIZE;
    private readonly DEFAULT_STOP_LOSS;
    private readonly DEFAULT_TAKE_PROFIT;
    constructor(prisma: PrismaService, exchangeService: ExchangeService, orchestrator: AIOrchestratorService, auditService: AuditService);
    runBacktest(userId: string, request: BacktestRequest, language?: string): Promise<BacktestResult>;
    private _ts;
    private _strategyEntrySignal;
    private _strategyExitSignal;
    private _calculateSMA;
    private _calculateRSI;
    private _calculateMetrics;
    private _calculateDuration;
    private _averageDuration;
    private _generateAIInsights;
}
