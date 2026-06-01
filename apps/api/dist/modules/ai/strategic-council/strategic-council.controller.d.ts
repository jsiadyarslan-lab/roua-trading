import { StrategicCouncilService } from './strategic-council.service';
import { AIOrchestratorService } from '../services/ai-orchestrator.service';
export declare class StrategicCouncilController {
    private readonly councilService;
    private readonly orchestrator;
    private readonly logger;
    constructor(councilService: StrategicCouncilService, orchestrator: AIOrchestratorService);
    getAllBriefs(): Promise<{
        success: boolean;
        data: {
            active: import("./strategic-council.types").TradingBriefDTO[];
            count: number;
        };
    }>;
    getActiveBriefs(symbol?: string): Promise<{
        success: boolean;
        data: import("./strategic-council.types").TradingBriefDTO[];
    }>;
    getBriefHistory(): Promise<{
        success: boolean;
        data: import("./strategic-council.types").TradingBriefDTO[];
    }>;
    getActiveBriefsCount(): Promise<{
        success: boolean;
        data: {
            count: number;
        };
    }>;
    triggerSession(req: any, body: {
        pairs?: string[];
    }): Promise<{
        success: boolean;
        message: string;
        status?: undefined;
        data?: undefined;
    } | {
        success: boolean;
        message: string;
        status: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            sessionId: string;
            status: string;
            pairs: string[];
            message: string;
        };
        message?: undefined;
        status?: undefined;
    }>;
    getSessionStatus(): Promise<{
        success: boolean;
        data: {
            isRunning: boolean;
            lastSession: import("./strategic-council.types").CouncilSessionResult | null;
        };
    }>;
    getLastSession(): Promise<{
        success: boolean;
        data: import("./strategic-council.types").CouncilSessionResult | null;
    }>;
    debugConsensus(pair?: string): Promise<{
        success: boolean;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data: any;
    }>;
}
