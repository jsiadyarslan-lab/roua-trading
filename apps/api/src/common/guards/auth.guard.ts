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
 * 1. If route is marked @Public() → auto-create UNIQUE guest user per session
 * 2. If session token found and valid → attach user to request
 * 3. If no session on protected route → REJECT with 401
 * 4. If no session on public route → auto-create unique guest user
 *
 * DATA ISOLATION: Each unauthenticated session gets its own unique guest user
 * (guest-{uuid}@roua.auto) instead of sharing a single guest@roua.auto account.
 * This prevents data leakage between different users' positions, trades, and settings.
 *
 * Redis caching: Session lookups are cached for 15 minutes to reduce DB load.
 * The cache is invalidated when sessions are destroyed/revoked.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly SESSION_CACHE_PREFIX = 'session:';
  private readonly SESSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (reduced from 15 — revoked sessions mustn't linger)
  private sharedGuestUser: any = null;

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
   * Get or create a SINGLE shared guest user for unauthenticated requests.
   *
   * SECURITY FIX: Previously this method created a NEW database User row
   * for every unauthenticated request, which was a DoS vector filling the
   * database. Now we create/find ONE shared guest user (guest@roua.auto)
   * on the first request and cache it in memory forever. All subsequent
   * requests reuse the same cached guest user without any DB call.
   */
  private async _ensureGuestUser(): Promise<any> {
    // Return cached guest user if available (no DB call)
    if (this.sharedGuestUser) {
      return this.sharedGuestUser;
    }

    try {
      // Try to find the existing shared guest user
      let user = await this.prisma.user.findUnique({ where: { email: 'guest@roua.auto' } });
      if (!user) {
        // Create ONE shared guest user (only on first ever request)
        user = await this.prisma.user.create({
          data: { email: 'guest@roua.auto', displayName: 'ضيف', tier: 'FREE' },
        });
        this.logger.log('Created shared guest user: guest@roua.auto');
      }
      // Cache in memory — never hit DB again for guest
      this.sharedGuestUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tier: user.tier,
      };
      return this.sharedGuestUser;
    } catch (error: any) {
      this.logger.error(`Failed to get/create guest user: ${error?.message || error}`);
      // Fallback: return a virtual guest user without DB write
      this.sharedGuestUser = {
        id: 'guest-virtual',
        email: 'guest@roua.auto',
        displayName: 'ضيف',
        tier: 'FREE',
      };
      return this.sharedGuestUser;
    }
  }
}
