import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { GeneratedContent } from '../types/content.types';
export declare class ContentOptimizerService {
    private readonly prisma;
    private readonly redis;
    private readonly logger;
    constructor(prisma: PrismaService, redis: RedisService);
    optimize(content: GeneratedContent): Promise<{
        content: GeneratedContent;
        optimization: OptimizationReport;
    }>;
    private _analyzeSeo;
    private _assessReadability;
    private _predictEngagement;
    private _checkDuplication;
    private _checkCompliance;
    private _applyOptimizations;
    private _calculateStringSimilarity;
}
export interface OptimizationReport {
    seoScore: number;
    readabilityScore: number;
    engagementScore: number;
    duplicationScore: number;
    complianceScore: number;
    overallScore: number;
    suggestions: string[];
    warnings: string[];
}
