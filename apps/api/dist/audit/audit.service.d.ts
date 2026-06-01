import { PrismaService } from '../common/prisma/prisma.service';
export interface AuditLogEntry {
    userId?: string;
    action: string;
    resource: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
}
export declare class AuditService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    log(entry: AuditLogEntry): Promise<void>;
    getUserLogs(userId: string, limit?: number): Promise<{
        id: string;
        action: string;
        resource: string;
        details: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
    }[]>;
    getLogsByAction(action: string, limit?: number): Promise<{
        id: string;
        action: string;
        resource: string;
        details: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
    }[]>;
    getRecentLogs(limit?: number): Promise<{
        id: string;
        action: string;
        resource: string;
        details: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
    }[]>;
}
