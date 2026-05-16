import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('auth')
export class RecoveryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('recover')
  async recoverSession(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      return res.status(400).send('Token missing');
    }

    try {
      const session = await this.prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session || !session.isActive || session.expiresAt < new Date()) {
        return res.status(401).send('Token invalid or expired');
      }

      // تعيين الـ cookie وإعادة التوجيه للداشبورد
      res.cookie('auth-token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.cookie('session-token', token, {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return res.redirect('/dashboard');
    } catch (e: any) {
      return res.status(500).send('Error: ' + e.message);
    }
  }
}
