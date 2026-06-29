import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { t } from '../../i18n/i18n.helper';

/**
 * User ID Validation Interceptor — Defense-in-Depth Layer 3
 *
 * CRITICAL: When userId is undefined, Prisma queries like:
 *   findMany({ where: { userId: undefined, isValid: true } })
 * STRIP the undefined field and return ALL records from ALL users!
 *
 * This interceptor verifies that every authenticated request has a
 * valid userId attached. If not, it rejects the request immediately
 * before it reaches any service that might make a Prisma query.
 *
 * This is the FIRST line of defense against the shared-balance bug.
 */
@Injectable()
export class UserIdValidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UserIdValidationInterceptor.name);

  intercept(context: ExecutionContext, CallHandler: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    // If there's a user object, verify userId is valid
    if (user) {
      const userId = user.id;
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        this.logger.error(
          `🚨 SECURITY: Authenticated request has invalid userId="${userId}" — ` +
          `possible auth bypass or session corruption! Path: ${request.method} ${request.url}`
        );
        throw new ForbiddenException(t('userid_validation_interceptor.user_not_valid_please_login'));
      }
    }

    return CallHandler.handle();
  }
}

/**
 * Standalone validation function for use in services.
 * Call this at the top of any service method that accepts userId.
 *
 * @throws ForbiddenException if userId is invalid
 */
export function validateUserId(userId: string, context?: string): string {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    const msg = context
      ? t('userid_validation_interceptor.user_not_valid_please_login')
      : t('userid_validation_interceptor.user_not_valid');
    throw new ForbiddenException(msg);
  }
  return userId;
}

/**
 * Safe validation that returns false instead of throwing.
 * Use in background services where throwing would crash the service.
 */
export function isValidUserId(userId: string): boolean {
  return !!userId && typeof userId === 'string' && userId.trim() !== '';
}
