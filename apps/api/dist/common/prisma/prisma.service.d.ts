import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private reconnectTimer;
    private connectInProgress;
    private connected;
    private consecutiveFailures;
    private static _dbAvailable;
    private static _lastError;
    private static _dbUrlPrefix;
    static get dbAvailable(): boolean;
    static get lastError(): string | null;
    static get dbUrlPrefix(): string | null;
    constructor();
    onModuleInit(): Promise<void>;
    private autoMigrateMissingColumns;
    onModuleDestroy(): Promise<void>;
    private tryConnect;
    private scheduleReconnect;
    isAvailable(): boolean;
    getDiagnosticInfo(): {
        available: boolean;
        lastError: string | null;
        urlPrefix: string | null;
        failures: number;
    };
    setRlsUserId(userId: string): Promise<void>;
    clearRlsUserId(): Promise<void>;
    enableRlsBypass(): Promise<void>;
    disableRlsBypass(): Promise<void>;
    withRlsUser<T>(userId: string, fn: () => Promise<T>): Promise<T>;
    withRlsBypass<T>(fn: () => Promise<T>): Promise<T>;
}
