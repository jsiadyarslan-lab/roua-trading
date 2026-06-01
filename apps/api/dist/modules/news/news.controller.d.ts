import { NewsService } from './news.service';
import { NewsIntegrationService } from './news-integration.service';
export declare class NewsController {
    private readonly newsService;
    private readonly newsIntegration;
    private readonly logger;
    constructor(newsService: NewsService, newsIntegration: NewsIntegrationService);
    getLatestNews(symbol?: string, sentiment?: string, category?: string, limitStr?: string): Promise<{
        success: boolean;
        data: {
            url: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            source: string;
            sentiment: import("@prisma/client/runtime/library").Decimal | null;
            content: string;
            title: string;
            translatedTitle: string | null;
            translatedContent: string | null;
            summary: string | null;
            sentimentLabel: string | null;
            impactLevel: string | null;
            affectedAssets: string | null;
            entities: string | null;
            aiAnalysis: string | null;
            category: string | null;
            categoryAr: string | null;
            embedding: string | null;
            imageUrl: string | null;
            publishedAt: Date;
            fetchedAt: Date;
        }[];
        count: number;
    }>;
    getNewsFeed(symbol?: string, sentiment?: string, category?: string, limitStr?: string): Promise<{
        success: boolean;
        data: {
            url: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            source: string;
            sentiment: import("@prisma/client/runtime/library").Decimal | null;
            content: string;
            title: string;
            translatedTitle: string | null;
            translatedContent: string | null;
            summary: string | null;
            sentimentLabel: string | null;
            impactLevel: string | null;
            affectedAssets: string | null;
            entities: string | null;
            aiAnalysis: string | null;
            category: string | null;
            categoryAr: string | null;
            embedding: string | null;
            imageUrl: string | null;
            publishedAt: Date;
            fetchedAt: Date;
        }[];
        count: number;
    }>;
    getMarketSentiment(): Promise<{
        success: boolean;
        data: import("./news-integration.service").MarketSentiment | null;
    }>;
    analyzeNewsText(body: {
        text: string;
        symbol?: string;
    }): Promise<{
        success: boolean;
        data: {
            originalText: string;
            translatedText: any;
            analysis: {
                sentiment: any;
                sentimentScore: any;
                impactLevel: any;
                affectedAssets: any;
                summary: any;
                marketImpact: any;
                recommendation: any;
            };
            aiAnalysis: string;
            model: string;
            confidence: number;
        };
    }>;
    triggerFetch(): Promise<{
        success: boolean;
        message: string;
    }>;
    triggerPipeline(body?: {
        maxItems?: number;
    }): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
}
