import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Optional,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { Request } from 'express';

/**
 * User Isolation Interceptor — Defense-in-Depth Layer 2 (RLS)
 *
 * This interceptor automatically sets the PostgreSQL session variable
 * `app.current_user_id` for every authenticated request. Combined with
 * Row Level Security (RLS) policies, this ensures that even if the
 * application layer fails to filter by userId, the database itself
 * will only return rows belonging to the authenticated user.
 *
 * HOW IT WORKS:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 1. Extract userId from request.user (set by AuthGuard)        │
 * │ 2. Execute: SET app.current_user_id = 'userId'                │
 * │ 3. All subsequent Prisma queries in this request are scoped   │
 * │ 4. After request completes, RESET the session variable        │
 * └────────────────────────────────────────────────────────────────┘
 *
 * NOTE: This interceptor is a defense-in-depth measure. The AuthGuard
 * already sets the RLS context when it validates the session. This
 * interceptor provides an additional safety net for cases where the
 * AuthGuard's RLS context might not be set (e.g., cached sessions).
 */
@Injectable()
export class UserIsolationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UserIsolationInterceptor.name);

  // V170: @Optional() prevents cascading failure if PrismaService is unavailable.
  // Without this, a DB connection failure during bootstrap would prevent
  // ALL modules from loading → 0 routes → entire API returns 502.
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // V170: Type-safe getter — prisma is @Optional() so it can be undefined
  private get p(): PrismaService {
    return this.prisma!;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = (request as any).user?.id;

    if (!userId || !this.prisma) {
      // No authenticated user, or PrismaService unavailable — pass through
      return next.handle();
    }

    // Set RLS context before the handler runs
    // (uses 'p' getter which asserts prisma is defined — checked above)
    return new Observable((subscriber) => {
      this.p.setRlsUserId(userId)
        .then(() => {
          next.handle()
            .pipe(
              finalize(() => {
                // Always clear RLS context after request completes
                this.p.clearRlsUserId().catch(() => {});
              }),
              catchError((err) => {
                this.p.clearRlsUserId().catch(() => {});
                return throwError(() => err);
              }),
            )
            .subscribe({
              next: (v) => subscriber.next(v),
              error: (e) => subscriber.error(e),
              complete: () => subscriber.complete(),
            });
        })
        .catch((err) => {
          this.logger.warn(`RLS context setup failed for user ${userId}: ${err.message}`);
          // Continue without RLS — application guards still protect
          next.handle().subscribe({
            next: (v) => subscriber.next(v),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
          });
        });
    });
  }
}
