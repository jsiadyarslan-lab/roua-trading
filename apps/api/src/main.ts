import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './common/prisma/prisma.service';

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

    // Cookie parser for session management
    app.use(cookieParser());

    // Global prefix for all routes
    app.setGlobalPrefix('api');

    // ── Health check endpoint (no auth required) ──
    // Must be registered BEFORE global pipes/filters to avoid auth interference
    const prisma = app.get(PrismaService);
    app.getHttpAdapter().getInstance().get('/api/health', async (req: any, res: any) => {
      try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;

        res.status(200).json({
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
        });
      }
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
