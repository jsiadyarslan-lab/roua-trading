import { Injectable, CanActivate, ExecutionContext, Logger, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Metadata key for marking routes as public (skip auth)
 * Usage: @Public() decorator on controller methods
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * AuthGuard — Authentication with public route support
 *
 * This guard ensures every request has a valid user attached.
 * Behavior:
 * 1. If route is marked @Public() → auto-create guest session
 * 2. If session token found and valid → attach user to request
 * 3. If no session on protected route → REJECT with 401
 * 4. If no session on public route → auto-create guest session
 *
 * 🔒 SECURITY FIX: Protected routes now properly reject unauthenticated
 * requests instead of silently auto-authenticating everyone.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private guestUser: any = null;
  private guestUserLastRefresh = 0;
  private readonly GUEST_CACHE_TTL = 5 * 60 * 1000; // Refresh guest user cache every 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
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
      try {
        const session = await this.prisma.session.findUnique({
          where: { token: sessionToken },
          include: { user: true },
        });

        if (session && session.expiresAt > new Date()) {
          (request as any).user = session.user;
          return true;
        }

        // Clean up expired session
        if (session) {
          await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        }
      } catch (error: any) {
        // DB might be unavailable — fall through
        this.logger.warn(`Session validation failed: ${error?.message || error}`);
      }
    }

    // ── No valid session found ──
    // For PUBLIC routes: auto-create guest session
    // For PROTECTED routes: reject with 401
    if (isPublic) {
      try {
        const user = await this._ensureGuestUser();
        (request as any).user = user;
        return true;
      } catch (error: any) {
        this.logger.error(`Guest auto-auth failed: ${error?.message || error}`);
        // Do NOT create phantom/mock users — throw instead to prevent orphaned DB records
        throw new UnauthorizedException('Unable to establish guest session. Please try again.');
      }
    }

    // 🔒 PROTECTED ROUTE: No valid session → reject
    this.logger.warn(`Unauthenticated request to protected route: ${request.method} ${request.url}`);
    return false;
  }

  /**
   * Ensure the guest user exists in the database.
   * Cached in memory with TTL to avoid stale data.
   */
  private async _ensureGuestUser(): Promise<any> {
    const GUEST_EMAIL = 'guest@roua.auto';

    // Return cached guest user if fresh
    if (this.guestUser && Date.now() - this.guestUserLastRefresh < this.GUEST_CACHE_TTL) {
      return this.guestUser;
    }

    try {
      let user = await this.prisma.user.findUnique({ where: { email: GUEST_EMAIL } });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: GUEST_EMAIL,
            displayName: 'ضيف',
            tier: 'FREE',
          },
        });
        this.logger.log('Auto-created guest user');
      }

      // Enforce FREE tier for guest
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
      // DB might be unavailable — try to find existing user
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
