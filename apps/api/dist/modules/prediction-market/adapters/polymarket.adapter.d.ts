import { ConfigService } from '@nestjs/config';
import { IPredictionMarketAdapter, UnifiedPredictionEvent } from '../prediction-market.types';
export declare class PolymarketAdapter implements IPredictionMarketAdapter {
    private readonly configService;
    private readonly logger;
    readonly name = "Polymarket";
    constructor(configService: ConfigService);
    fetchActiveEvents(limit?: number, offset?: number): Promise<UnifiedPredictionEvent[]>;
    fetchEventDetails(eventId: string): Promise<UnifiedPredictionEvent | null>;
    fetchEventsByCategory(category: string): Promise<UnifiedPredictionEvent[]>;
    private _parseProbability;
    private _extractSymbols;
    private _detectCategory;
    private _fetchWithTimeout;
}
