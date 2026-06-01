import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
export declare class UserIsolationInterceptor implements NestInterceptor {
    private readonly prisma?;
    private readonly logger;
    constructor(prisma?: PrismaService | undefined);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
