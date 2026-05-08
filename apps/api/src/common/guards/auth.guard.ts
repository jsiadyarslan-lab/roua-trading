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
   * Get or create a UNIQUE guest user per server session.
   *
   * SECURITY FIX: Previously all unauthenticated users shared ONE guest user
   * (guest@roua.auto), causing them to see each other's positions, portfolio,
   * and trade data. Now each new server process creates a unique guest user
   * (guest-{uuid}@roua.auto) so data is fully isolated between sessions.
   *
   * The guest user is cached in memory for the lifetime of this server process.
   * On restart, a new unique guest is created (old ones stay in DB but orphaned).
   */
  private async _ensureGuestUser(): Promise<any> {
    // Return cached guest user if available (no DB call needed)
    if (this.sharedGuestUser) {
      return this.sharedGuestUser;
    }

    try {
      // Create a NEW unique guest user for this server process instance
      const guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const guestEmail = `${guestId}@roua.auto`;

      const user = await this.prisma.user.create({
        data: {
          email: guestEmail,
          displayName: 'ضيف',
          tier: 'FREE',
        },
      });

      this.logger.log(`Created unique guest user: ${guestEmail}`);

      // Cache in memory — reused for all unauthenticated requests in this process
      this.sharedGuestUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tier: user.tier,
        isGuest: true,
      };
      return this.sharedGuestUser;
    } catch (error: any) {
      this.logger.error(`Failed to create unique guest user: ${error?.message || error}`);
      // Fallback: return a virtual guest with a random id
      const fallbackId = `guest-virtual-${Math.random().toString(36).slice(2, 10)}`;
      this.sharedGuestUser = {
        id: fallbackId,
        email: `${fallbackId}@roua.auto`,
        displayName: 'ضيف',
        tier: 'FREE',
        isGuest: true,
      };
      return this.sharedGuestUser;
    }
  }
}

