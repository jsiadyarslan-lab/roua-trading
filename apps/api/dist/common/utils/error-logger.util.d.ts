import { Logger } from '@nestjs/common';
export type ErrorCategory = 'auth' | 'network' | 'rate-limit' | 'validation' | 'timeout' | 'internal';
export declare function categorizeError(error: any): ErrorCategory;
export declare function logError(logger: Logger, context: string, error: any, extra?: Record<string, any>): void;
