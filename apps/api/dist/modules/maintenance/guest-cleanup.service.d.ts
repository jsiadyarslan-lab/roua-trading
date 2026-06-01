import { PrismaService } from '../../common/prisma/prisma.service';
export declare class GuestCleanupService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    cleanupExpiredGuests(): Promise<void>;
}
