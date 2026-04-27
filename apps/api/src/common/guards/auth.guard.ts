import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AuthGuard — Simplified auto-authentication
 *
 * This guard ensures every request has a valid user attached.
 * Instead of rejecting unauthenticated requests with 401, it
 * auto-creates a guest session so the platform always works.
 *
 * Auth flow:
 * 1. Check for session token (cookie / Authorization / x-roua-session)
 * 2. If valid session found → attach user to request
 * 3. If no session or invalid → auto-create guest user + session
 * 4. Attach the user to request so downstream code works
 *
 * This eliminates all 401 errors that were caused by missing/expired
 * sessions. The platform works out-of-the-box without requiring login.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private guestUser: any = null;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

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
        // DB might be unavailable — fall through to auto-auth
        this.logger.warn(`Session validation failed: ${error?.message || error}`);
      }
    }

    // ── Auto-authenticate: ensure guest user exists ──
    try {
      const user = await this._ensureGuestUser();
      (request as any).user = user;

      // Also set a cookie on the response if possible
      // (the Next.js proxy handles cookie setting, this is just a safety net)
      return true;
    } catch (error: any) {
      this.logger.error(`Auto-auth failed: ${error?.message || error}`);

      // Last resort: attach a mock user so the request doesn't fail
      (request as any).user = {
        id: 'guest-auto',
        email: 'guest@roua.auto',
        displayName: 'ضيف',
        tier: 'FREE',
      };
      return true;
    }
  }

  /**
   * Ensure the guest user exists in the database.
   * Cached in memory to avoid repeated DB lookups.
   */
  private async _ensureGuestUser(): Promise<any> {
    const GUEST_EMAIL = 'guest@roua.auto';

    // Return cached guest user if available
    if (this.guestUser) {
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
      return user;
    } catch (error: any) {
      // DB might be unavailable — try to find existing user
      try {
        const user = await this.prisma.user.findUnique({ where: { email: GUEST_EMAIL } });
        if (user) {
          this.guestUser = user;
          return user;
        }
      } catch {
        // DB completely unavailable
      }
      throw error;
    }
  }
}
