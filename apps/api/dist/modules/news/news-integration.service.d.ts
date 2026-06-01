import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
interface MarketSentiment {
    fearGreedIndex: {
        value: number;
        label: string;
        labelAr: string;
    };
    arabSentimentIndex: {
        value: number;
        label: string;
        majorityVote: string;
    };
    geopoliticalRiskIndex: {
        value: number;
        label: string;
        impacts: Record<string, {
            trend: string;
            value: string;
        }>;
    };
    aiSummary?: string;
    fetchedAt: string;
}
export type { MarketSentiment };
export declare class NewsIntegrationService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly redis;
    private readonly logger;
    private fetchInterval;
    private readonly NEWS_SITE_URL;
    private readonly NEWS_API_KEY;
    private readonly NEWS_ADMIN_SECRET;
    private readonly REDIS_SENTIMENT_KEY;
    private readonly REDIS_SENTIMENT_TTL_MS;
    constructor(configService: ConfigService, redis: RedisService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getMarketSentiment(): Promise<MarketSentiment | null>;
    getSentimentForAI(): Promise<string>;
    private _fetchMarketSentiment;
    triggerNewsPipeline(maxItems?: number): Promise<any>;
    fetchExternalNews(limit?: number): Promise<any[]>;
}
