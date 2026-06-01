import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../../audit/audit.service';
import { ContentStatus, ContentSchedule, GeneratedContent } from '../types/content.types';
export declare class ContentPublisherService {
    private readonly prisma;
    private readonly redis;
    private readonly audit;
    private readonly configService;
    private readonly logger;
    constructor(prisma: PrismaService, redis: RedisService, audit: AuditService, configService: ConfigService);
    saveContent(userId: string, content: GeneratedContent, status?: ContentStatus): Promise<any>;
    publish(userId: string, contentId: string): Promise<any>;
    schedule(userId: string, contentId: string, scheduledAt: Date, platform?: 'WEBSITE' | 'TELEGRAM' | 'TWITTER' | 'ALL'): Promise<ContentSchedule>;
    unpublish(userId: string, contentId: string, archive?: boolean): Promise<any>;
    getFeed(options: {
        category?: string;
        type?: string;
        status?: string;
        symbol?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        articles: any[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    cleanupErrorArticles(): Promise<{
        archived: number;
    }>;
    getById(contentId: string): Promise<any>;
    getStats(): Promise<{
        totalArticles: number;
        published: number;
        drafts: number;
        scheduled: number;
        todayPublished: number;
        thisWeekPublished: number;
        avgQualityScore: number;
    }>;
    processScheduledPublications(): Promise<void>;
    private _sendTelegramNotification;
    autoArchive(): Promise<void>;
}
