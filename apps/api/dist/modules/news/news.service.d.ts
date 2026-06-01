import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
interface NewsFilter {
    symbol?: string;
    sentiment?: string;
    category?: string;
    limit?: number;
}
export declare class NewsService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly aiOrchestrator;
    private readonly logger;
    private fetchInterval;
    private isFetchingNews;
    constructor(prisma: PrismaService, aiOrchestrator: AIOrchestratorService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private startScheduledFetching;
    private _scheduledFetch;
    getLatestNews(filter: NewsFilter): Promise<{
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
    }[]>;
    analyzeNewsText(text: string, symbol?: string): Promise<{
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
    }>;
    fetchAndAnalyzeNews(): Promise<void>;
    private _processNewsBatch;
    private _fetchAllSources;
    private _fetchCoinTelegraph;
    private _fetchCryptoPanic;
    private _fetchCoinDesk;
    private _translateAndAnalyze;
    private _heuristicSentiment;
    private _mapCategoryToArabic;
    private _fetchRouaNews;
}
export {};
