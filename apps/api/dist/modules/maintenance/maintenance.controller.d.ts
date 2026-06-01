import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ConfigService } from '@nestjs/config';
export declare class MaintenanceController {
    private readonly prisma;
    private readonly audit;
    private readonly config;
    private readonly logger;
    constructor(prisma: PrismaService, audit: AuditService, config: ConfigService);
    cleanupGuests(adminToken: string, batchSize?: string, dryRun?: string, includeUnverified?: string): Promise<{
        success: boolean;
        message: string;
        count: number;
        sample?: undefined;
        deletedCount?: undefined;
        errorCount?: undefined;
        errors?: undefined;
    } | {
        success: boolean;
        message: string;
        count: number;
        sample: string[];
        deletedCount?: undefined;
        errorCount?: undefined;
        errors?: undefined;
    } | {
        success: boolean;
        deletedCount: number;
        errorCount: number;
        errors: string[];
        message?: undefined;
        count?: undefined;
        sample?: undefined;
    }>;
}
