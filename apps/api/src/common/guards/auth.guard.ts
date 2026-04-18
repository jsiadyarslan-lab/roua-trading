import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract session token from cookie or Authorization header
    const sessionToken =
      request.cookies?.['roua_session'] ||
      request.headers.authorization?.replace('Bearer ', '');

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
}
