import { ContentAgentService } from './content-agent.service';
import { GenerateContentDto, UpdateContentDto, BulkGenerateDto, GetContentFeedDto, ScheduleContentDto, ContentCategory } from './types/content.types';
export declare class ContentAgentController {
    private readonly contentAgent;
    constructor(contentAgent: ContentAgentService);
    generateContent(req: any, dto: GenerateContentDto): Promise<{
        success: boolean;
        data: {
            article: any;
            qualityScore: number;
            optimization: any;
        };
        message: string;
    }>;
    bulkGenerate(req: any, dto: BulkGenerateDto): Promise<{
        success: boolean;
        data: {
            topic: string;
            success: boolean;
            articleId?: string;
            error?: string;
        }[];
        message: string;
    }>;
    generateBreakingAlert(req: any, body: {
        topic: string;
        symbols: string[];
        context: string;
    }): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    getFeed(query: GetContentFeedDto): Promise<{
        success: boolean;
        data: any;
    }>;
    getStats(): Promise<{
        success: boolean;
        data: any;
    }>;
    getTrending(): Promise<{
        success: boolean;
        data: {
            topic: string;
            category: ContentCategory;
            articleCount: number;
            avgSentiment: number;
            symbols: string[];
        }[];
    }>;
    getGaps(): Promise<{
        success: boolean;
        data: {
            category: ContentCategory;
            lastArticleHoursAgo: number;
            suggestedTopics: string[];
        }[];
    }>;
    getState(): Promise<{
        success: boolean;
        data: import("./types/content.types").ContentAgentState;
    }>;
    cleanupErrors(): Promise<{
        success: boolean;
        data: {
            archived: number;
        };
        message: string;
    }>;
    getById(id: string): Promise<{
        success: boolean;
        data: any;
    }>;
    publish(req: any, id: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    schedule(req: any, id: string, dto: ScheduleContentDto): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    update(req: any, id: string, dto: UpdateContentDto): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
    archive(req: any, id: string): Promise<{
        success: boolean;
        data: any;
        message: string;
    }>;
}
