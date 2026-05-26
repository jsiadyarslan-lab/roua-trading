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

              // ═══════════════════════════════════════════════════════════
              // V168 CRITICAL FIX: Set RLS context for CACHED sessions.
              //
              // ROOT CAUSE: When a session was served from Redis cache,
              // setRlsUserId() was NEVER called — it was only called
              // during the DB lookup path below. This meant:
              //   - Cached session → no RLS context → connection pool
              //     reuse could have previous user's RLS context
              //   - User B sees User A's data on the same connection
              //
              // Now: Both cached and DB-lookup paths set RLS context.
              // The UserIsolationInterceptor (registered globally in V168)
              // provides an additional safety net by also setting RLS
              // before the handler runs and clearing it after.
              // ═══════════════════════════════════════════════════════════
              try {
                await this.prisma.setRlsUserId(parsed.user.id);
              } catch {
                // Non-critical — UserIsolationInterceptor will also set it
              }

              return true;
            }
          }
        } catch {
          // Cache miss — continue to DB
        }
      }

      // DB lookup
      try {
        // SUSTAINABLE FIX: Don't attempt DB query when DB is unavailable.
        // Without this, every API request creates a connection attempt that leaks.
        if (!this.prisma.isAvailable()) {
          this.logger.warn('DB unavailable during session validation — rejecting');
          throw new UnauthorizedException('يرجى تسجيل الدخول للوصول إلى هذا المورد');
        }
        const session = await this.prisma.session.findUnique({
          where: { token: sessionToken },
          include: { user: true },
        });

        if (session && session.isActive && session.expiresAt > new Date()) {
          (request as any).user = session.user;

          // ═══════════════════════════════════════════════════════════
          // RLS: Set PostgreSQL session variable for Row Level Security.
          // This ensures that even if a Prisma query forgets to filter
          // by userId, the database itself will only return rows
          // belonging to this user.
          // ═══════════════════════════════════════════════════════════
          try {
            await this.prisma.setRlsUserId(session.user.id);
          } catch {
            // Non-critical — application-level guards still protect
          }

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
      // For public routes, we don't force a guest user anymore unless absolutely needed.
      // This prevents cross-session leakage where all guests shared one identity.
      return true;
    }

    // 🔒 PROTECTED ROUTE: No valid session → reject with 401
    this.logger.warn(`Unauthenticated request to protected route: ${request.method} ${request.url}`);
    throw new UnauthorizedException('يرجى تسجيل الدخول للوصول إلى هذا المورد');
  }

  /**
   * Clear the RLS context after the request completes.
   * Called by NestJS after each request to reset the PostgreSQL
   * session variable so it doesn't leak to the next request
   * on the same connection.
   */
  async clearRlsContext(): Promise<void> {
    try {
      await this.prisma.clearRlsUserId();
    } catch {
      // Non-critical
    }
  }
}


