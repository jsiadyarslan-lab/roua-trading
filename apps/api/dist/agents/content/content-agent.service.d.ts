import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { ContentGeneratorService } from './services/content-generator.service';
import { ContentCuratorService } from './services/content-curator.service';
import { ContentOptimizerService } from './services/content-optimizer.service';
import { ContentPublisherService } from './services/content-publisher.service';
import { ContentAgentState, GeneratedContent, GenerateContentDto, UpdateContentDto, BulkGenerateDto, GetContentFeedDto, ScheduleContentDto } from './types/content.types';
export declare class ContentAgentService {
    private readonly redis;
    private readonly configService;
    private readonly audit;
    readonly generator: ContentGeneratorService;
    readonly curator: ContentCuratorService;
    readonly publisher: ContentPublisherService;
    readonly optimizer: ContentOptimizerService;
    private readonly logger;
    private readonly DAILY_QUOTA;
    private readonly STATE_KEY;
    constructor(redis: RedisService, configService: ConfigService, audit: AuditService, generator: ContentGeneratorService, curator: ContentCuratorService, publisher: ContentPublisherService, optimizer: ContentOptimizerService);
    getState(): Promise<ContentAgentState>;
    generateContent(userId: string, dto: GenerateContentDto): Promise<{
        content: GeneratedContent;
        article: any;
        optimization: any;
    }>;
    bulkGenerate(userId: string, dto: BulkGenerateDto): Promise<{
        results: Array<{
            topic: string;
            success: boolean;
            articleId?: string;
            error?: string;
        }>;
    }>;
    generateBreakingAlert(userId: string, topic: string, symbols: string[], context: string): Promise<{
        content: GeneratedContent;
        article: any;
    }>;
    publishContent(userId: string, contentId: string): Promise<any>;
    scheduleContent(userId: string, dto: ScheduleContentDto): Promise<any>;
    getContentFeed(dto: GetContentFeedDto): Promise<any>;
    getContentById(contentId: string): Promise<any>;
    updateContent(userId: string, contentId: string, dto: UpdateContentDto): Promise<any>;
    unpublishContent(userId: string, contentId: string, archive?: boolean): Promise<any>;
    getStats(): Promise<any>;
    autoDailyDigest(): Promise<void>;
    autoFillGaps(): Promise<void>;
    autoHourlyUpdate(): Promise<void>;
    autoWeeklyReview(): Promise<void>;
    autoPairAnalysis(): Promise<void>;
    private _updateState;
    private _getHourlyUpdateTopic;
    private _getWeeklyTopic;
    private _getDailyDigestTopic;
}
