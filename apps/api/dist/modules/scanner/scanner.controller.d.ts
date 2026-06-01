import { ScannerService } from './scanner.service';
export declare class ScannerController {
    private readonly scannerService;
    private readonly logger;
    constructor(scannerService: ScannerService);
    fullScan(timeframe?: string, category?: string): Promise<import("./scanner.types").ScannerScanResponseDto>;
    heatmap(category?: string): Promise<import("./scanner.types").HeatmapItemDto[]>;
    deepAnalysis(symbol: string): Promise<import("./scanner.types").DeepAnalysisDto>;
    multiTimeframeAnalysis(symbol: string): Promise<import("./scanner.types").MultiTfResultDto>;
    marketOverview(): Promise<import("./scanner.types").MarketOverviewDto>;
    forceScan(req: any, timeframe?: string, category?: string): Promise<import("./scanner.types").ScannerScanResponseDto>;
}
