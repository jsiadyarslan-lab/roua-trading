import { Controller, Post, Get, Delete, Body, Query, Req, Res, Logger, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, Public } from '../common/guards/auth.guard';

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {
    // Log WebAuthn configuration on startup for debugging
    this.logger.log('AuthController initialized — WebAuthn endpoints ready');
  }

  /**
   * POST /api/auth/register — Create registration challenge
   * 🔒 PUBLIC: No auth needed to start registration
   */
  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerChallenge(
    @Body() body: { email: string; displayName?: string },
  ) {
    this.logger.log(`Registration challenge requested for: ${body.email}`);
    return this.authService.generateRegistrationChallenge(body.email, body.displayName);
  }

  /**
   * GET /api/auth/challenge — Get authentication challenge for existing user
   * 🔒 PUBLIC: No auth needed to start authentication
   */
  @Get('challenge')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async authChallenge(@Query('email') email: string) {
    this.logger.log(`Authentication challenge requested for: ${email}`);
    return this.authService.generateAuthenticationChallenge(email);
  }

  /**
   * POST /api/auth/verify — Verify credential (registration or authentication)
   * 🔒 PUBLIC: No auth needed to verify credentials
   */
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
        sameSite: 'lax',
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
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      return { success: true, user: result.user };
    }

    return { error: 'بيانات اعتماد غير صالحة' };
  }

  /**
   * GET /api/auth/session — Check session validity
   * 🔒 PUBLIC: Anyone can check if they have a valid session
   */
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

  /**
   * DELETE /api/auth/session — Logout
   * 🔒 PUBLIC: Anyone can logout (no auth needed to clear session)
   */
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
    return { success: true };
  }

  /**
   * POST /api/auth/guest — Create a guest session
   * 🔒 PUBLIC: Intentionally public endpoint for guest access
   */
  @Post('guest')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createGuestSession(@Res({ passthrough: true }) res: Response) {
    this.logger.log('Guest session creation requested via /api/auth/guest');

    const result = await this.authService.createGuestSession();

    // Set session cookie so subsequent requests are authenticated
    res.cookie('roua_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matching OTP session TTL)
      path: '/',
    });

    return {
      success: true,
      // SECURITY: sessionToken is NOT returned in the response body.
      // The httpOnly cookie is the only secure way to transmit the session token.
      // Previously, including sessionToken in the JSON body defeated the
      // purpose of httpOnly cookies by exposing the token to XSS attacks.
      user: result.user,
    };
  }
}
