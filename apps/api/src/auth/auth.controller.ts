import { Controller, Post, Get, Delete, Body, Query, Req, Res, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {
    // Log WebAuthn configuration on startup for debugging
    this.logger.log('AuthController initialized — WebAuthn endpoints ready');
  }

  /**
   * POST /api/auth/register — Create registration challenge
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerChallenge(
    @Body() body: { email: string; displayName?: string },
  ) {
    this.logger.log(`Registration challenge requested for: ${body.email}`);
    return this.authService.generateRegistrationChallenge(body.email, body.displayName);
  }

  /**
   * GET /api/auth/challenge — Get authentication challenge for existing user
   */
  @Get('challenge')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async authChallenge(@Query('email') email: string) {
    this.logger.log(`Authentication challenge requested for: ${email}`);
    return this.authService.generateAuthenticationChallenge(email);
  }

  /**
   * POST /api/auth/verify — Verify credential (registration or authentication)
   */
  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(
    @Body() body: { credential?: any; assertion?: any; email: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    if (body.credential) {
      // Registration verification
      this.logger.log(`Registration verification for: ${body.email}`);

      const result = await this.authService.verifyRegistration(
        body.email,
        body.credential,
        userAgent,
        ipAddress,
      );

      // Set session cookie
      res.cookie('roua_session', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });

      return { success: true, user: result.user };
    }

    if (body.assertion) {
      // Authentication verification
      this.logger.log(`Authentication verification for: ${body.email}`);

      const result = await this.authService.verifyAuthentication(
        body.email,
        body.assertion,
        userAgent,
        ipAddress,
      );

      // Set session cookie
      res.cookie('roua_session', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, user: result.user };
    }

    return { error: 'بيانات اعتماد غير صالحة' };
  }

  /**
   * GET /api/auth/session — Check session validity
   */
  @Get('session')
  async checkSession(@Req() req: Request) {
    const sessionToken =
      req.cookies?.['roua_session'] ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return { authenticated: false };
    }

    return this.authService.validateSession(sessionToken);
  }

  /**
   * DELETE /api/auth/session — Logout
   */
  @Delete('session')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionToken =
      req.cookies?.['roua_session'] ||
      req.headers.authorization?.replace('Bearer ', '');

    if (sessionToken) {
      await this.authService.destroySession(sessionToken);
    }

    res.clearCookie('roua_session');
    return { success: true };
  }
}
