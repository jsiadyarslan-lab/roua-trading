import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';

async function bootstrap() {
  try {
    // FIX #2: Enable graceful shutdown — ensures in-flight requests complete
    // before the process exits, preventing 502 errors during Railway deploys.
    // Without this, SIGTERM kills the process immediately, causing connection drops.
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    app.enableShutdownHooks();

    // Security headers via Helmet (CSP, HSTS, X-Frame-Options, etc.)
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for Next.js
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "https:"],
          fontSrc: ["'self'", "https:", "data:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow cross-origin resources
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }));

    // BUG 11 FIX: Add Cache-Control headers based on response type.
    // - Static-ish data (exchange rates, quotes): public, max-age=5
    // - User-specific data: private, no-cache
    app.use((req: any, res: any, next: any) => {
      const originalEnd = res.end;
      res.end = function (...args: any[]) {
        // Only set Cache-Control if not already set by a specific endpoint
        if (!res.getHeader('Cache-Control')) {
          const path = req.url || req.originalUrl || '';
          if (path.includes('/api/exchange/') || path.includes('/api/health') || path.includes('/api/scanner/overview') || path.includes('/api/scanner/heatmap')) {
            // Public data that changes infrequently — cache for 5 seconds
            res.setHeader('Cache-Control', 'public, max-age=5');
          } else {
            // User-specific or dynamic data — no cache
            res.setHeader('Cache-Control', 'private, no-cache');
          }
        }
        return originalEnd.apply(res, args);
      };

      res.setHeader('X-Content-Type-Options', 'nosniff');
      // X-XSS-Protection disabled — modern CSP is the preferred defense
      // Setting '1; mode=block' is deprecated and can introduce vulnerabilities
      res.setHeader('X-XSS-Protection', '0');
      next();
    });

    // Cookie parser for session management
    app.use(cookieParser());

    // ── CSRF Protection — Origin Validation ──
    // For a trading platform, CSRF protection is CRITICAL to prevent
    // unauthorized order placement from malicious sites.
    //
    // Strategy: Verify the Origin header on all state-changing requests
    // (POST, PUT, DELETE, PATCH). If the Origin doesn't match our
    // allowed origins, reject with 403.
    //
    // This is the "origin verification" approach recommended by OWASP
    // (https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
    // It's simpler than token-based CSRF and works well for API-first
    // applications that use SameSite cookies.
    //
    // SameSite=lax cookies already prevent cross-site GET attacks.
    // Origin validation prevents cross-site POST/PUT/DELETE/PATCH attacks.
    // Together, they provide robust CSRF protection without the complexity
    // of synchronizer token pattern.
    const STATE_CHANGING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
    const allowedOriginPatterns = [
      /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
      /^https:\/\/[a-z0-9-]+\.railway\.app$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ];
    // Also allow explicitly configured CORS origins
    const explicitOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    app.use((req: any, res: any, next: any) => {
      if (!STATE_CHANGING_METHODS.includes(req.method)) {
        return next(); // Only check state-changing requests
      }

      const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/');
      if (!origin) {
        // No origin header — allow for API clients (curl, mobile apps)
        // These are typically not browser-based and not vulnerable to CSRF
        return next();
      }

      // Check against explicit origins first
      if (explicitOrigins.includes(origin)) {
        return next();
      }

      // Check against patterns (Railway domains, localhost)
      if (allowedOriginPatterns.some(pattern => pattern.test(origin))) {
        return next();
      }

      // Origin doesn't match any allowed source — reject
      res.status(403).json({
        statusCode: 403,
        message: 'طلب مرفوض — مصدر غير مصرح به (CSRF protection)',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
    });

    // Global prefix for all routes
    app.setGlobalPrefix('api');

    // ── Health check endpoint (no auth required) ──
    // Must be registered BEFORE global pipes/filters to avoid auth interference
    //
    // SECURITY: This endpoint intentionally does NOT expose database schema info,
    // table names, column definitions, or any other sensitive internals.
    // It only returns basic status checks (ok/error) with latency metrics.
    // For schema diagnostics, use the separate /api/debug/db-schema endpoint
    // which requires authentication and is restricted to admin/dev use.
    const prisma = app.get(PrismaService);
    const redisService = app.get(RedisService, { strict: false });
    app.getHttpAdapter().getInstance().get('/api/health', async (req: any, res: any) => {
      const start = Date.now();
      const checks: Record<string, { status: string; latencyMs?: number }> = {};

      // Database check
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
      } catch {
        checks.database = { status: 'error' };
      }

      // Redis check
      try {
        const redisStart = Date.now();
        if (redisService && typeof redisService.ping === 'function') {
          await redisService.ping();
          checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
        } else {
          checks.redis = { status: 'degraded' };
        }
      } catch {
        checks.redis = { status: 'degraded' };
      }

      // Memory check
      const mem = process.memoryUsage();
      const memMB = Math.round(mem.heapUsed / 1024 / 1024);
      checks.memory = {
        status: memMB > 512 ? 'warning' : 'ok',
      };

      const allOk = Object.values(checks).every(c => c.status === 'ok');
      const statusCode = allOk ? 200 : 503;

      res.status(statusCode).json({
        status: allOk ? 'ok' : 'degraded',
        uptime: Math.round(process.uptime()),
        checks,
        responseTimeMs: Date.now() - start,
      });
    });

    // Global exception filter — standardizes ALL error responses to:
    // { statusCode: number, message: string, timestamp: string, path: string }
    //
    // NOTE on inconsistency: Some controllers return { success, data } while
    // the exception filter returns { statusCode, message, timestamp, path }.
    // This is a known inconsistency — successful responses use a wrapper format
    // while error responses use the filter format. Both formats are stable and
    // documented; a future refactor should unify them, but changing now would
    // break frontend error handling.
    app.useGlobalFilters(new AllExceptionsFilter());

    // Enable CORS for Next.js frontend
    // FIX: In production on Railway, the frontend and API run in the same
    // container, so CORS origin should allow both localhost and the public URL.
    const corsOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'];
    // Also allow the Railway public URL if set
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      corsOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    // FIX: Also allow RAILWAY_STATIC_URL (another Railway env var for the domain)
    if (process.env.RAILWAY_STATIC_URL) {
      corsOrigins.push(process.env.RAILWAY_STATIC_URL);
    }
    // FIX: Use origin function to dynamically allow any *.up.railway.app URL.
    // Previously, only the specific RAILWAY_PUBLIC_DOMAIN was allowed, but
    // Railway uses different subdomains for preview deploys and PR environments.
    // This ensures CORS works regardless of which Railway environment is used.
    const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow all explicitly listed origins
      if (corsOrigins.includes(origin)) return callback(null, true);
      // Allow any *.up.railway.app subdomain (Railway deployment domains)
      if (origin.match(/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/)) return callback(null, true);
      // Allow any *.railway.app subdomain (covers all Railway environments)
      if (origin.match(/^https:\/\/[a-z0-9-]+\.railway\.app$/)) return callback(null, true);
      // Allow localhost on any port for local development
      if (origin.match(/^http:\/\/localhost:\d+$/)) return callback(null, true);
      if (origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) return callback(null, true);
      // Reject all other origins
      callback(null, false);
    };

    app.enableCors({
      origin: corsOriginHandler,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'x-roua-session'],
    });

    // Global validation pipe
    // NOTE: `forbidNonWhitelisted` is set to `false` because `whitelist: true`
    // already strips unknown properties. Setting `forbidNonWhitelisted: true`
    // caused confusing 400 errors when frontend DTOs evolved independently
    // from backend DTOs — the whitelist still ensures security by removing
    // any unexpected fields silently.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    const configService = app.get(ConfigService);
    const port = configService.get<number>('API_PORT', 3001);

    // SECURITY: Warn if NEXTAUTH_SECRET is not explicitly set in production.
    // It's used as a fallback for ENCRYPTION_KEY derivation in development,
    // and in production, ENCRYPTION_KEY must be set explicitly instead.
    // If NEXTAUTH_SECRET is auto-derived from other env vars, it creates a
    // false sense of security — the secret should be explicitly random.
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.NEXTAUTH_SECRET && !process.env.ENCRYPTION_KEY) {
        console.error(
          '⚠️ CRITICAL: Neither NEXTAUTH_SECRET nor ENCRYPTION_KEY is set in production! ' +
          'Credentials cannot be securely encrypted. Set ENCRYPTION_KEY (preferred) or NEXTAUTH_SECRET immediately.',
        );
      } else if (!process.env.ENCRYPTION_KEY && process.env.NEXTAUTH_SECRET) {
        console.warn(
          '⚠️ WARNING: ENCRYPTION_KEY not set — using NEXTAUTH_SECRET as fallback for credential encryption. ' +
          'This is insecure because NEXTAUTH_SECRET was designed for signing, not encryption. ' +
          'Set ENCRYPTION_KEY explicitly for production use.',
        );
      }
    }

    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Roua API running on http://0.0.0.0:${port}/api`);
    console.log(`📊 Environment: ${configService.get('NODE_ENV', 'development')}`);

    // FIX #2: Graceful shutdown — handle SIGTERM from Railway
    // Railway sends SIGTERM before killing the container. We need to:
    // 1. Stop accepting new connections
    // 2. Complete in-flight requests
    // 3. Close DB/Redis connections gracefully
    // This prevents 502 errors during deployments.
    const shutdown = async (signal: string) => {
      console.log(`📡 Received ${signal} — shutting down gracefully...`);
      try {
        // Give in-flight requests 10 seconds to complete
        const shutdownTimeout = setTimeout(() => {
          console.warn('⚠️ Graceful shutdown timeout — forcing exit');
          process.exit(1);
        }, 10000);

        await app.close();
        clearTimeout(shutdownTimeout);
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('❌ Error during graceful shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ NestJS bootstrap failed:', error);
    // FIX #2: Auto-restart on bootstrap failure — Railway will restart the container
    // but adding a small delay prevents rapid restart loops
    console.log('🔄 Restarting in 5 seconds...');
    setTimeout(() => process.exit(1), 5000);
  }
}

bootstrap();
