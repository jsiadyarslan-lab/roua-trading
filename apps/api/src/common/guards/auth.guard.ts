import { Injectable, CanActivate, ExecutionContext, Logger, SetMetadata, UnauthorizedException, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Metadata key for marking routes as public (skip auth)
 * Usage: @Public() decorator on controller methods
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * AuthGuard — Authentication with public route support + Redis caching
 *
 * This guard ensures every request has a valid user attached.
 * Behavior:
 * 1. If route is marked @Public() → auto-create guest session
 * 2. If session token found and valid → attach user to request
 * 3. If no session on protected route → REJECT with 401
 * 4. If no session on public route → auto-create guest session
 *
 * Redis caching: Session lookups are cached for 15 minutes to reduce DB load.
 * The cache is invalidated when sessions are destroyed/revoked.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private guestUser: any = null;
  private guestUserLastRefresh = 0;
  private readonly GUEST_CACHE_TTL = 5 * 60 * 1000;
  private readonly SESSION_CACHE_PREFIX = 'session:';
  private readonly SESSION_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check if this route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Extract session token from cookie, Authorization header, or x-roua-session custom header
    const cookieToken = request.cookies?.['roua_session'];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    const headerToken = request.headers['x-roua-session'] as string | undefined;

    const sessionToken = cookieToken || bearerToken || headerToken;

    // ── Try to validate existing session ──
    if (sessionToken) {
      // Try Redis cache first
      if (this.redis) {
        const cacheKey = `${this.SESSION_CACHE_PREFIX}${sessionToken}`;
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.authenticated && parsed.user) {
              (request as any).user = parsed.user;
              return true;
            }
          }
        } catch {
          // Cache miss — continue to DB
        }
      }

      // DB lookup
      try {
        const session = await this.prisma.session.findUnique({
          where: { token: sessionToken },
          include: { user: true },
        });

        if (session && session.isActive && session.expiresAt > new Date()) {
          (request as any).user = session.user;

          // Cache the session for fast subsequent lookups
          if (this.redis) {
            try {
              const cacheKey = `${this.SESSION_CACHE_PREFIX}${sessionToken}`;
              const cacheData = JSON.stringify({
                authenticated: true,
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  displayName: session.user.displayName,
                  tier: session.user.tier,
                },
              });
              await this.redis.set(cacheKey, cacheData, this.SESSION_CACHE_TTL_MS);
            } catch {
              // Non-critical
            }
          }

          return true;
        }

        // Clean up expired/inactive session
        if (session) {
          await this.prisma.session.update({
            where: { id: session.id },
            data: { isActive: false },
          }).catch(() => {});

          // Remove from cache
          if (this.redis) {
            const cacheKey = `${this.SESSION_CACHE_PREFIX}${sessionToken}`;
            await this.redis.del(cacheKey).catch(() => {});
          }
        }
      } catch (error: any) {
        this.logger.warn(`Session validation failed: ${error?.message || error}`);
      }
    }

    // ── No valid session found ──
    if (isPublic) {
      try {
        const user = await this._ensureGuestUser();
        (request as any).user = user;
        return true;
      } catch (error: any) {
        this.logger.error(`Guest auto-auth failed: ${error?.message || error}`);
        throw new UnauthorizedException('Unable to establish guest session. Please try again.');
      }
    }

    // 🔒 PROTECTED ROUTE: No valid session → reject with 401
    // FIX: Previously returned `false` which caused NestJS to return 403 Forbidden.
    // Returning `false` from canActivate() results in a 403, but the proxy and
    // frontend expect 401 for unauthenticated requests. Throwing UnauthorizedException
    // ensures the proxy can properly handle auth failures and retry with a new session.
    this.logger.warn(`Unauthenticated request to protected route: ${request.method} ${request.url}`);
    throw new UnauthorizedException('يرجى تسجيل الدخول للوصول إلى هذا المورد');
  }

  /**
   * Ensure the guest user exists in the database.
   * Cached in memory with TTL to avoid stale data.
   */
  private async _ensureGuestUser(): Promise<any> {
    const GUEST_EMAIL = 'guest@roua.auto';

    if (this.guestUser && Date.now() - this.guestUserLastRefresh < this.GUEST_CACHE_TTL) {
      return this.guestUser;
    }

    try {
      let user = await this.prisma.user.findUnique({ where: { email: GUEST_EMAIL } });

      if (!user) {
        user = await this.prisma.user.create({
          data: { email: GUEST_EMAIL, displayName: 'ضيف', tier: 'FREE' },
        });
        this.logger.log('Auto-created guest user');
      }

      if (user.tier !== 'FREE') {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { tier: 'FREE' },
        });
        this.logger.warn(`Guest user was ${user.tier} — downgraded to FREE`);
      }

      this.guestUser = user;
      this.guestUserLastRefresh = Date.now();
      return user;
    } catch (error: any) {
      try {
        const user = await this.prisma.user.findUnique({ where: { email: GUEST_EMAIL } });
        if (user) {
          this.guestUser = user;
          this.guestUserLastRefresh = Date.now();
          return user;
        }
      } catch {
        // DB completely unavailable
      }
      throw error;
    }
  }
}
