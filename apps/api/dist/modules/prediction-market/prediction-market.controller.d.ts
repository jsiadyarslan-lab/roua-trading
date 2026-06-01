import { PredictionMarketService } from './prediction-market.service';
export declare class PredictionMarketController {
    private readonly predictionMarketService;
    constructor(predictionMarketService: PredictionMarketService);
    getEvents(symbol?: string, category?: string): Promise<{
        success: boolean;
        data: any[];
        disclaimer: string;
    }>;
    getEventDetails(id: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: any;
        error?: undefined;
    }>;
    getGapsForSymbol(symbol: string): Promise<{
        success: boolean;
        data: import("./prediction-market.types").PredictionGapAnalysis[];
    }>;
    getTopGaps(limit?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    getCouncilVote(symbol: string): Promise<{
        success: boolean;
        data: import("./prediction-market.types").PredictionMarketVote | null;
        model: string;
    }>;
    getPortfolioImpact(): Promise<{
        success: boolean;
        data: any[];
        message: string;
    }>;
    syncEvents(force?: string): Promise<{
        success: boolean;
        data: {
            synced: number;
            updated: number;
        };
    }>;
    analyzeEvent(id: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            eventId: string;
            aiProbability: number;
            impactAssessment: import("./prediction-market.types").ImpactAssessment | null;
        };
        error?: undefined;
    }>;
}
