import { AIOrchestratorService } from './services/ai-orchestrator.service';
export declare class AiController {
    private readonly orchestrator;
    private readonly logger;
    constructor(orchestrator: AIOrchestratorService);
    analyze(body: {
        prompt: string;
        type?: string;
        symbol?: string;
        language?: string;
    }): Promise<{
        success: boolean;
        data: import("./services/groq.service").AIAnalysisResponse;
    }>;
    analyzeWithAllModels(body: {
        prompt: string;
        type?: string;
        symbol?: string;
        language?: string;
    }): Promise<{
        success: boolean;
        data: {
            analyses: import("./services/groq.service").AIAnalysisResponse[];
            consensus: string;
        };
    }>;
    getModels(): Promise<{
        success: boolean;
        data: {
            model: string;
            available: boolean;
            specialty: string;
        }[];
    }>;
    consensus(body: {
        symbol?: string;
        language?: string;
    }): Promise<{
        success: boolean;
        data: {
            consensusScore: number;
            recommendation: "BUY" | "SELL" | "HOLD";
            analyses: {
                role: string;
                model: string;
                vote: string;
                confidence: number;
                reason: string;
            }[];
            masterStrategy: string;
            isFallback?: boolean;
        };
    }>;
    diagnoseModels(): Promise<{
        success: boolean;
        data: {
            models: Array<{
                model: string;
                keyAvailable: boolean;
                apiWorking: boolean;
                responseTimeMs: number;
                error?: string;
            }>;
            summary: {
                total: number;
                keysAvailable: number;
                apiWorking: number;
            };
            circuitBreaker: Array<{
                model: string;
                consecutiveFailures: number;
                inCooldown: boolean;
                cooldownExpiresAt: string | null;
                cooldownRemainingMs: number;
            }>;
        };
        version: string;
    }>;
}
