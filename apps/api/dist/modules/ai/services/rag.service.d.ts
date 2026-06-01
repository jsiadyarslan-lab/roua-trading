import { EmbeddingService } from './embedding.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
export declare class RagService {
    private readonly embeddingService;
    private readonly prisma;
    private readonly redis?;
    private readonly logger;
    private readonly RAG_CACHE_TTL_MS;
    constructor(embeddingService: EmbeddingService, prisma: PrismaService, redis?: RedisService | undefined);
    retrieveRelevantContext(query: string, limit?: number): Promise<string>;
    private _retrieveWithoutCache;
    private _hashQuery;
    storeArticle(data: {
        source: string;
        title: string;
        content: string;
        summary?: string;
        url?: string;
        sentiment?: number;
        entities?: string[];
        publishedAt: Date;
    }): Promise<void>;
    getArchiveStats(): Promise<{
        totalArticles: number;
        sources: string[];
        latestArticle: Date | null;
    }>;
    private _fetchCandidateArticles;
    private _extractKeywords;
    private _keywordSimilarity;
}
