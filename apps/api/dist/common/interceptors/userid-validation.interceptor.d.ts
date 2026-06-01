import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
export declare class UserIdValidationInterceptor implements NestInterceptor {
    private readonly logger;
    intercept(context: ExecutionContext, CallHandler: CallHandler): Observable<any>;
}
export declare function validateUserId(userId: string, context?: string): string;
export declare function isValidUserId(userId: string): boolean;
