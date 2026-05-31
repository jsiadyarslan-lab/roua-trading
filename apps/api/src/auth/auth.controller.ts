import { Controller, Post, Get, Delete, Body, Param, Query, Req, Res, Logger, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, Public } from '../common/guards/auth.guard';

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {
    this.logger.log('AuthController initialized — WebAuthn + Session Management endpoints ready');
  }

  // ── WebAuthn Registration ──

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerChallenge(
    @Body() body: { email: string; displayName?: string },
  ) {
    this.logger.log(`Registration challenge requested for: ${body.email}`);
    return this.authService.generateRegistrationChallenge(body.email, body.displayName);
  }

  // ── WebAuthn Authentication Challenge ──

  @Get('challenge')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async authChallenge(@Query('email') email: string) {
    this.logger.log(`Authentication challenge requested for: ${email}`);
    return this.authService.generateAuthenticationChallenge(email);
  }

  // ── WebAuthn Verify (Registration or Authentication) ──

  @Post('verify')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(
    @Body() body: { credential?: any; assertion?: any; email: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    if (body.credential) {
      this.logger.log(`Registration verification for: ${body.email}`);

      const result = await this.authService.verifyRegistration(
        body.email, body.credential, userAgent, ipAddress,
      );

      // Set session cookie (access token — 24h)
      res.cookie('roua_session', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });

      // Set refresh token cookie (30 days)
      if (result.refreshToken) {
        res.cookie('roua_refresh', result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: '/',
        });
      }

      return { success: true, user: result.user };
    }

    if (body.assertion) {
      this.logger.log(`Authentication verification for: ${body.email}`);

      const result = await this.authService.verifyAuthentication(
        body.email, body.assertion, userAgent, ipAddress,
      );

      // Set session cookie (access token — 24h)
      res.cookie('roua_session', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });

      // Set refresh token cookie (30 days)
      if (result.refreshToken) {
        res.cookie('roua_refresh', result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: '/',
        });
      }

      return { success: true, user: result.user };
    }

    return { error: 'بيانات اعتماد غير صالحة' };
  }

  // ── Check Session ──

  @Get('session')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async checkSession(@Req() req: Request) {
    const sessionToken =
      req.cookies?.['roua_session'] ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return { authenticated: false };
    }

    return this.authService.validateSession(sessionToken);
  }

  // ── Logout ──

  @Delete('session')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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
    res.clearCookie('roua_refresh');
    return { success: true };
  }

  // ── Refresh Session (using refresh token) ──

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async refreshSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Check refresh token from cookie, Authorization header, or custom header
    // Mobile/native clients send tokens via headers since they can't set httpOnly cookies
    let refreshToken = req.cookies?.['roua_refresh'];
    if (!refreshToken) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        refreshToken = authHeader.slice(7).trim();
      }
    }
    if (!refreshToken) {
      refreshToken = req.headers['x-roua-refresh'] as string | undefined;
    }
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    if (!refreshToken) {
      return { authenticated: false, error: 'NO_REFRESH_TOKEN' };
    }

    try {
      const result = await this.authService.refreshSession(refreshToken, userAgent, ipAddress);

      // Set new session cookie
      res.cookie('roua_session', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });

      // Set new refresh token cookie
      if (result.refreshToken) {
        res.cookie('roua_refresh', result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: '/',
        });
      }

      return {
        success: true,
        authenticated: true,
        user: result.user,
        // Include tokens in response body for mobile/native clients
        // that can't read httpOnly Set-Cookie headers
        data: {
          token: result.sessionToken,
          refresh: result.refreshToken,
        },
      };
    } catch (error: any) {
      // Refresh failed — clear both cookies
      res.clearCookie('roua_session');
      res.clearCookie('roua_refresh');
      return {
        authenticated: false,
        error: error.message || 'REFRESH_FAILED',
      };
    }
  }

  // ── List User Sessions (Device Management) ──

  @Get('sessions')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async listSessions(@Req() req: Request) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return { sessions: [] };
    }
    const sessions = await this.authService.getUserSessions(userId);
    return { sessions };
  }

  // ── Revoke a Specific Session ──

  @Delete('sessions/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async revokeSession(
    @Param('id') sessionId: string,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id;
    if (!userId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }
    return this.authService.revokeSession(sessionId, userId);
  }

  // ── Revoke All Other Sessions ──

  @Delete('sessions')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async revokeAllOtherSessions(@Req() req: Request) {
    const userId = (req as any).user?.id;
    const currentToken = req.cookies?.['roua_session'] || req.headers.authorization?.replace('Bearer ', '');

    if (!userId) {
      return { success: false, error: 'UNAUTHENTICATED' };
    }
    return this.authService.revokeAllOtherSessions(userId, currentToken);
  }

  // ── Guest Session ──



  // ── Cleanup Expired Sessions (internal/admin) ──

  @Post('cleanup')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async cleanupSessions() {
    return this.authService.cleanupExpiredSessions();
  }
}
