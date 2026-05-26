import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Optional,
} from '@nestjs/common';
import { Observable, from, switchMap, finalize, catchError, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { Request } from 'express';

/**
 * User Isolation Interceptor — Defense-in-Depth Layer 2 (RLS)
 *
 * Sets PostgreSQL session variable `app.current_user_id` before each
 * authenticated request, and resets it after. Combined with RLS policies,
 * this ensures DB-level user isolation.
 *
 * V172 FIX: Simplified Observable chain to prevent request hanging.
 * The V170 approach used nested Promise.then().subscribe() which could
 * cause requests to hang if setRlsUserId() blocked (pool_timeout=10s
 * with connection_limit=1). Now uses RxJS from() + switchMap which
 * properly integrates the async RLS setup into the Observable lifecycle.
 */
@Injectable()
export class UserIsolationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UserIsolationInterceptor.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = (request as any).user?.id;

    if (!userId || !this.prisma) {
      return next.handle();
    }

    // V172: Use from() to convert the RLS setup Promise to Observable,
    // then switchMap to the actual handler. finalize() always clears RLS.
    return from(
      this.prisma.setRlsUserId(userId).catch((err: any) => {
        this.logger.warn(`RLS context setup failed for ${userId}: ${err?.message}`);
        // Non-fatal — continue without RLS context
      }),
    ).pipe(
      switchMap(() => next.handle()),
      finalize(() => {
        this.prisma!.clearRlsUserId().catch(() => {});
      }),
      catchError((err) => {
        this.prisma!.clearRlsUserId().catch(() => {});
        return throwError(() => err);
      }),
    );
  }
}
