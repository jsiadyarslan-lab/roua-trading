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
    const app = await NestFactory.create(AppModule);

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

    // Explicit X-Content-Type-Options header (defense-in-depth, even though Helmet may set it)
    app.use((req: any, res: any, next: any) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // X-XSS-Protection disabled — modern CSP is the preferred defense
      // Setting '1; mode=block' is deprecated and can introduce vulnerabilities
      res.setHeader('X-XSS-Protection', '0');
      next();
    });

    // Cookie parser for session management
    app.use(cookieParser());

    // Global prefix for all routes
    app.setGlobalPrefix('api');

    // ── Health check endpoint (no auth required) ──
    // Must be registered BEFORE global pipes/filters to avoid auth interference
    const prisma = app.get(PrismaService);
    const redisService = app.get(RedisService, { strict: false });
    app.getHttpAdapter().getInstance().get('/api/health', async (req: any, res: any) => {
      const start = Date.now();
      const checks: Record<string, { status: string; latencyMs?: number; detail?: string }> = {};

      // Database check
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
      } catch (error: any) {
        checks.database = { status: 'error', detail: error.message?.substring(0, 100) };
      }

      // Redis check
      try {
        const redisStart = Date.now();
        if (redisService && typeof redisService.ping === 'function') {
          await redisService.ping();
          checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
        } else {
          checks.redis = { status: 'degraded', detail: 'Redis service not available' };
        }
      } catch (error: any) {
        checks.redis = { status: 'degraded', detail: error.message?.substring(0, 100) };
      }

      // Memory check
      const mem = process.memoryUsage();
      const memMB = Math.round(mem.heapUsed / 1024 / 1024);
      checks.memory = {
        status: memMB > 512 ? 'warning' : 'ok',
        detail: `${memMB}MB heap used`,
      };

      const allOk = Object.values(checks).every(c => c.status === 'ok');
      const statusCode = allOk ? 200 : 503;

      res.status(statusCode).json({
        status: allOk ? 'ok' : 'degraded',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        checks,
        responseTimeMs: Date.now() - start,
      });
    });

    // Global exception filter — returns actual error messages instead of "Internal server error"
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
    // Allow any *.up.railway.app URL (the Railway deployment domain)
    // This ensures CORS works regardless of which Railway environment is used

    app.enableCors({
      origin: corsOrigins,
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

    await app.listen(port);
    console.log(`🚀 Roua API running on http://localhost:${port}/api`);
    console.log(`📊 Environment: ${configService.get('NODE_ENV', 'development')}`);
  } catch (error) {
    console.error('❌ NestJS bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap();
