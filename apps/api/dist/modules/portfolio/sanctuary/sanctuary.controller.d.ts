import { SanctuaryService } from './sanctuary.service';
export declare class SanctuaryController {
    private readonly sanctuaryService;
    private readonly logger;
    constructor(sanctuaryService: SanctuaryService);
    analyzePortfolio(req: any): Promise<{
        success: boolean;
        data: import("./sanctuary.service").RiskReport;
    }>;
}
