import { AnalyticalAIService } from './analytical-ai.service';
import { SignalGeneratorService } from './signal-generator.service';
export declare class AnalyticsController {
    private readonly analyticalAI;
    private readonly signalGenerator;
    private readonly logger;
    constructor(analyticalAI: AnalyticalAIService, signalGenerator: SignalGeneratorService);
    analyzeAsset(req: any, symbol: string): Promise<{
        success: boolean;
        data: import("./analytics.types").AnalysisCardDto;
    }>;
    getSignalsForSymbol(req: any, symbol: string, limit?: string): Promise<{
        success: boolean;
        data: import("./analytics.types").GeneratedSignalDto[];
    }>;
}
