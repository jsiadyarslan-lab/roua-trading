import { PrismaService } from '../../../common/prisma/prisma.service';
interface UsageLogEntry {
    userId?: string;
    model: string;
    provider: string;
    endpoint: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cached: boolean;
    success: boolean;
    errorMessage?: string;
}
export declare class AiUsageLoggerService {
    private readonly prisma;
    private readonly logger;
    private writeQueue;
    private flushTimer;
    private readonly FLUSH_INTERVAL_MS;
    private readonly MAX_QUEUE_SIZE;
    private dbAvailable;
    private fallbackQueue;
    private readonly MAX_FALLBACK_QUEUE_SIZE;
    private dbRetryAttempts;
    private readonly MAX_DB_RETRY_ATTEMPTS;
    constructor(prisma: PrismaService);
    log(entry: UsageLogEntry): void;
    logSuccess(params: {
        model: string;
        endpoint: string;
        inputPrompt: string;
        outputContent: string;
        latencyMs: number;
        cached: boolean;
        userId?: string;
    }): void;
    logFailure(params: {
        model: string;
        endpoint: string;
        inputPrompt: string;
        latencyMs: number;
        errorMessage: string;
        userId?: string;
    }): void;
    private isFlushing;
    private flush;
    getMonthlySpendForProvider(provider: string): Promise<number>;
    onModuleDestroy(): Promise<void>;
}
export {};
