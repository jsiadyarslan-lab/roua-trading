import { MarketScannerService } from './services/market-scanner.service';
import { PositionMonitorService } from './services/position-monitor.service';
import { MarketBroadcasterService } from './services/market-broadcaster.service';
export declare class EngineController {
    private readonly scanner;
    private readonly monitor;
    private readonly broadcaster;
    private readonly logger;
    constructor(scanner: MarketScannerService, monitor: PositionMonitorService, broadcaster: MarketBroadcasterService);
    getEngineHealth(): Promise<{
        success: boolean;
        data: {
            engines: {
                scanner: {
                    status: string;
                    lastScan: any;
                };
                monitor: {
                    lastCycle: any;
                    openPositions: number;
                    nearSL: number;
                    nearTP: number;
                    status: string;
                };
                broadcaster: {
                    status: string;
                    trackedSymbols: number;
                };
            };
            _migration: {
                bot: string;
                council: string;
            };
            timestamp: string;
        };
    }>;
    runManualScan(req: any, body: {
        symbols?: string[];
    }): Promise<{
        success: boolean;
        data: any;
    }>;
    getLastScan(): Promise<{
        success: boolean;
        data: any;
    }>;
    getMonitorStatus(): Promise<{
        success: boolean;
        data: {
            lastCycle: any;
            openPositions: number;
            nearSL: number;
            nearTP: number;
        };
    }>;
    getCachedQuotes(): Promise<{
        success: boolean;
        data: import("./services/market-broadcaster.service").MarketUpdate[];
    }>;
    trackSymbol(body: {
        symbol: string;
    }): Promise<{
        success: boolean;
        message: string;
        tracked?: undefined;
    } | {
        success: boolean;
        message: string;
        tracked: string[];
    }>;
}
