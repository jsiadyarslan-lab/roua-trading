import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketAnalysis } from '../types/agent.types';
export declare class MarketAnalyzerService {
    private readonly exchangeService;
    private readonly redis;
    private readonly logger;
    private readonly CACHE_TTL;
    constructor(exchangeService: ExchangeService, redis: RedisService);
    analyze(symbol: string): Promise<MarketAnalysis | null>;
    analyzeMultiple(symbols: string[]): Promise<Map<string, MarketAnalysis>>;
    private _calculateRSI;
    private _calculateMACD;
    private _calculateBollingerBands;
    private _calculateEMA;
    private _calculateATR;
    private _calculateEMAValues;
    private _assessVolatility;
    private _detectTrend;
    private _calculateTrendStrength;
    private _estimateAIConfidence;
    private _estimateAISignal;
    private _generateAIReasoning;
    private _buildMinimalAnalysis;
}
