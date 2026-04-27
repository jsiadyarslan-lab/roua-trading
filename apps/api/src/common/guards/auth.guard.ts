import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private devUser: any = null;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // ── DEV_MODE bypass ──
    // When DEV_MODE=1, allow all requests without authentication.
    // A default dev user is created/attached so downstream code works.
    // ⚠️ NEVER use DEV_MODE in production!
    // 🔒 PRODUCTION SAFETY: Block DEV_MODE in production environment
    if (process.env.DEV_MODE === '1' && process.env.NODE_ENV !== 'production') {
      if (!this.devUser) {
        this.devUser = await this._ensureDevUser();
      }
      (request as any).user = this.devUser;
      return true;
    }

    // Extract session token from cookie, Authorization header, or x-roua-session custom header
    const cookieToken = request.cookies?.['roua_session'];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
    // Fallback: x-roua-session header injected by Next.js middleware
    // This ensures auth works even if cookie forwarding by Next.js rewrites fails
    const headerToken = request.headers['x-roua-session'] as string | undefined;

    const sessionToken = cookieToken || bearerToken || headerToken;

    if (!sessionToken) {
      throw new UnauthorizedException('لم يتم تقديم رمز المصادقة');
    }

    // Validate session in database
    const session = await this.prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('جلسة غير صالحة');
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('انتهت صلاحية الجلسة');
    }

    // Attach user to request for downstream use
    (request as any).user = session.user;

    return true;
  }

  /**
   * Ensure a default dev user exists in the database for DEV_MODE.
   * Creates one if it doesn't exist, then returns it.
   */
  private async _ensureDevUser(): Promise<any> {
    try {
      const devEmail = 'dev@roua.local';
      let user = await this.prisma.user.findUnique({ where: { email: devEmail } });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: devEmail,
            displayName: 'Dev User',
            tier: 'FREE',
          },
        });
        this.logger.log('🔧 DEV_MODE: Created default dev user (dev@roua.local)');
      }

      this.logger.warn('🔧 DEV_MODE: Authentication bypassed — all requests use dev user');
      return user;
    } catch (err: any) {
      // If User table doesn't exist yet, return a minimal mock user
      this.logger.warn('🔧 DEV_MODE: Could not create dev user in DB, using mock user');
      return {
        id: 'dev-user-00000000',
        email: 'dev@roua.local',
        displayName: 'Dev User',
        tier: 'FREE',
      };
    }
  }
}
