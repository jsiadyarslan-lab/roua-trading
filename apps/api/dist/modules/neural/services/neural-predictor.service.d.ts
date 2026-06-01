import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { NeuralArchitecture, PredictionHorizon, NeuralPredictResult, NeuralModelInfo } from '../neural.types';
export declare class NeuralPredictorService {
    private readonly prisma;
    private readonly configService;
    private readonly exchangeService;
    private readonly orchestrator;
    private readonly logger;
    private readonly MODEL_WEIGHTS;
    private readonly HORIZON_VOLATILITY_SCALE;
    private readonly modelRegistry;
    constructor(prisma: PrismaService, configService: ConfigService, exchangeService: ExchangeService, orchestrator: AIOrchestratorService);
    predict(userId: string, symbol: string, steps: number, horizon: PredictionHorizon, language?: string): Promise<NeuralPredictResult>;
    trainModel(userId: string, symbol: string, architecture: NeuralArchitecture, horizon: PredictionHorizon, lookbackDays?: number): Promise<NeuralModelInfo>;
    getModels(): NeuralModelInfo[];
    private _parseDirection;
    private _generateStepPrediction;
    private _estimateModelAccuracy;
    private _getOrCreateModelInfo;
    private _generateAIAnalysis;
}
