import { PrismaService } from './prisma.service';
export declare class PrismaExtensionService {
    private readonly prisma;
    private readonly logger;
    private readonly USER_SCOPED_MODELS;
    private readonly READ_OPERATIONS;
    constructor(prisma: PrismaService);
    createScopedClient(userId: string): import("@prisma/client/runtime/library").DynamicClientExtensionThis<import(".prisma/client").Prisma.TypeMap<import("@prisma/client/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, import(".prisma/client").Prisma.TypeMapCb<import(".prisma/client").Prisma.PrismaClientOptions>, {
        result: {};
        model: {};
        query: {};
        client: {};
    }>;
    private _createEmptyResultClient;
}
