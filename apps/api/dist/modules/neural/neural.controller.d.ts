import { NeuralPredictorService } from './services/neural-predictor.service';
import { BacktestRunnerService } from './services/backtest-runner.service';
import { NeuralSwarmService } from './services/neural-swarm.service';
import { PerformanceTrackerService } from '../analytics/services/performance-tracker.service';
import { BacktestRequest, NeuralTrainRequest, NeuralPredictRequest, SwarmStartRequest, BacktestStrategy } from './neural.types';
export declare class NeuralController {
    private readonly predictor;
    private readonly backtestRunner;
    private readonly swarmService;
    private readonly perfTracker;
    private readonly logger;
    constructor(predictor: NeuralPredictorService, backtestRunner: BacktestRunnerService, swarmService: NeuralSwarmService, perfTracker: PerformanceTrackerService);
    runBacktest(req: any, body: BacktestRequest): Promise<{
        success: boolean;
        data: import("./neural.types").BacktestResult;
    }>;
    compareStrategies(req: any, body: any): Promise<{
        success: boolean;
        data: {
            comparison: {
                strategy: BacktestStrategy;
                result: any;
                error: any;
            }[];
            symbol: any;
        };
    }>;
    trainNeural(req: any, body: NeuralTrainRequest): Promise<{
        success: boolean;
        data: import("./neural.types").NeuralModelInfo;
    }>;
    private _getLanguage;
    neuralPredict(req: any, body: NeuralPredictRequest): Promise<{
        success: boolean;
        data: import("./neural.types").NeuralPredictResult;
    }>;
    getModels(req: any): Promise<{
        success: boolean;
        data: import("./neural.types").NeuralModelInfo[];
    }>;
    startSwarm(req: any, body: SwarmStartRequest): Promise<{
        success: boolean;
        data: import("./neural.types").SwarmResult;
    }>;
    getSwarmStatus(req: any, swarmId: string): Promise<{
        success: boolean;
        data: import("./neural.types").SwarmResult | null;
    }>;
    stopSwarm(req: any, swarmId: string): Promise<{
        success: boolean;
        data: import("./neural.types").SwarmResult | null;
    }>;
    getAllSwarms(req: any): Promise<{
        success: boolean;
        data: import("./neural.types").SwarmResult[];
    }>;
    getSystemHealth(req: any): Promise<{
        success: boolean;
        data: import("../analytics/services/performance-tracker.service").SystemHealthStatus;
    }>;
    getSourcePerformance(req: any, source: string): Promise<{
        success: boolean;
        data: import("../analytics/services/performance-tracker.service").SourcePerformance;
    }>;
}
