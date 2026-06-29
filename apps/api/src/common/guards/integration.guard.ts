// ─── Integration Guard V1 ─────────────────────────────────
// NestJS guard for authenticating cross-platform integration requests.
// Verifies X-Integration-Key header against INTEGRATION_API_KEY env var.
// Used by integration endpoints that serve data to the news platform.

import { Injectable, CanActivate, ExecutionContext, Logger, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { t } from '../../i18n/i18n.helper';

/**
 * Metadata key for marking routes as integration-only.
 * Usage: @IntegrationRoute() decorator on controller methods
 */
export const IS_INTEGRATION_KEY = 'isIntegrationRoute';
export const IntegrationRoute = () => SetMetadata(IS_INTEGRATION_KEY, true);

/**
 * IntegrationGuard — API Key authentication for cross-platform integration
 *
 * This guard verifies that requests to integration endpoints carry a valid
 * X-Integration-Key header. It's used for server-to-server communication
 * between the trading platform and the news website.
 *
 * Flow:
 * 1. Check if route is marked @IntegrationRoute()
 * 2. If yes, verify X-Integration-Key header
 * 3. If key matches INTEGRATION_API_KEY → allow
 * 4. If key missing or invalid → reject with 401
 *
 * Routes NOT marked @IntegrationRoute() are skipped by this guard.
 */
@Injectable()
export class IntegrationGuard implements CanActivate {
  private readonly logger = new Logger(IntegrationGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only apply to routes marked with @IntegrationRoute()
    const isIntegration = this.reflector.getAllAndOverride<boolean>(IS_INTEGRATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isIntegration) {
      return true; // Not an integration route — skip this guard
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-integration-key'] as string | undefined;
    const expectedKey = process.env.INTEGRATION_API_KEY;

    // No key configured = integration not set up
    if (!expectedKey) {
      this.logger.warn('INTEGRATION_API_KEY not configured — integration access denied');
      throw new UnauthorizedException(t('integration_guard.key_not_please'));
    }

    // No key provided
    if (!apiKey) {
      this.logger.warn(`Missing X-Integration-Key header from ${request.ip}`);
      throw new UnauthorizedException(t('integration_guard.key_required'));
    }

    // Timing-safe comparison
    if (apiKey.length !== expectedKey.length) {
      this.logger.warn(`Invalid integration key attempt from ${request.ip}`);
      throw new UnauthorizedException(t('integration_guard.key_not_valid'));
    }

    let result = 0;
    for (let i = 0; i < apiKey.length; i++) {
      result |= apiKey.charCodeAt(i) ^ expectedKey.charCodeAt(i);
    }

    if (result !== 0) {
      this.logger.warn(`Invalid integration key attempt from ${request.ip}`);
      throw new UnauthorizedException(t('integration_guard.key_not_valid'));
    }

    // Mark request as integration for downstream use
    (request as any).isIntegration = true;

    return true;
  }
}
