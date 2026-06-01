import { SmartExecutorService } from './smart-executor.service';
import { ExposureManagerService } from '../../trading/services/exposure-manager.service';
export declare class SmartExecutorController {
    private readonly executorService;
    private readonly exposureManager;
    private readonly logger;
    constructor(executorService: SmartExecutorService, exposureManager: ExposureManagerService);
    getStatus(req: any): Promise<{
        success: boolean;
        data: import("./smart-executor.types").ExecutorStatus;
    }>;
    start(req: any): Promise<{
        success: boolean;
        data: import("./smart-executor.types").ExecutorStatus;
    }>;
    stop(req: any): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        data: import("./smart-executor.types").ExecutorStatus;
        message: string;
        error?: undefined;
    }>;
    emergencyStop(req: any): Promise<{
        success: boolean;
        error: string;
        message?: undefined;
        closed?: undefined;
        failed?: undefined;
    } | {
        success: boolean;
        message: string;
        closed: string[];
        failed: string[];
        error?: undefined;
    }>;
    getPositions(req: any): Promise<{
        success: boolean;
        data: any[];
    }>;
    enableUser(req: any, body: {
        maxOpenPositions?: number;
        riskPerTradePercent?: number;
    }): Promise<{
        success: boolean;
        data: import("./smart-executor.types").UserExecutorState;
        message: string;
    }>;
    disableUser(req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    getUserStatus(req: any): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            user: import("./smart-executor.types").UserExecutorState | null;
            global: import("./smart-executor.types").ExecutorStatus;
        };
        error?: undefined;
    }>;
    purgePhantoms(): Promise<{
        success: boolean;
        data: {
            deleted: number;
        };
        message: string;
    }>;
    resetAutoUsers(): Promise<{
        success: boolean;
        data: {
            disabled: number;
        };
        message: string;
    }>;
    debugExecution(): Promise<{
        success: boolean;
        data: Record<string, any>;
    }>;
    nuclearCleanup(req: any): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        data: {
            briefs: number;
            positions: number;
            trades: number;
            paperOrders: number;
            paperCredentials: number;
            redisUsers: number;
            redisProcessed: number;
            executorStopped: boolean;
        };
        message: string;
        error?: undefined;
    }>;
    getExposure(req: any): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            totalOpenPositions: number;
            totalExposure: number;
            positionsBySource: Record<string, number>;
            dailyPnL: number;
            symbols: string[];
        };
        error?: undefined;
    }>;
}
