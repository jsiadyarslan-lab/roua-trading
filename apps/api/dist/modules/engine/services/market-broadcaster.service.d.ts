import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { ExchangeGateway } from '../../exchange/gateway/exchange.gateway';
export declare class MarketBroadcasterService {
    private readonly redis;
    private readonly aggregator;
    private readonly exchangeGateway;
    private readonly logger;
    private trackedSymbols;
    private readonly BROADCAST_THRESHOLD;
    private lastPrices;
    private isBroadcasting;
    constructor(redis: RedisService, aggregator: MarketDataAggregatorService, exchangeGateway: ExchangeGateway);
    broadcastMarketData(): Promise<void>;
    trackSymbol(symbol: string): void;
    untrackSymbol(symbol: string): void;
    getTrackedSymbols(): string[];
    getCachedQuote(symbol: string): Promise<MarketUpdate | null>;
    getAllCachedQuotes(): Promise<MarketUpdate[]>;
    private _broadcastViaWebSocket;
}
export interface MarketUpdate {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    volume: number;
    timestamp: string;
    isSignificant: boolean;
}
