import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { ContentCategory, ContentSourceData } from '../types/content.types';
export declare class ContentCuratorService {
    private readonly prisma;
    private readonly redis;
    private readonly exchangeService;
    private readonly logger;
    private readonly TRENDING_CACHE_TTL;
    constructor(prisma: PrismaService, redis: RedisService, exchangeService: ExchangeService);
    curateSources(category: ContentCategory, symbols?: string[]): Promise<ContentSourceData>;
    getTrendingTopics(): Promise<Array<{
        topic: string;
        category: ContentCategory;
        articleCount: number;
        avgSentiment: number;
        symbols: string[];
    }>>;
    getContentGaps(): Promise<Array<{
        category: ContentCategory;
        lastArticleHoursAgo: number;
        suggestedTopics: string[];
    }>>;
    private _fetchRecentNews;
    private _fetchMarketData;
    private _identifyTrendingTopics;
    private _computeTrendingTopics;
    private _getDefaultSymbols;
    private _suggestTopics;
    private _getCategoryLabel;
}
