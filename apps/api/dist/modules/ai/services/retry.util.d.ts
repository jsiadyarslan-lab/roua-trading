export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterMs: number;
    retryableCheck?: (error: any) => boolean;
    logger?: {
        warn: (msg: string) => void;
    };
}
export declare function withExponentialBackoff<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
