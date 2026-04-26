import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

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

        // Check if Position table has credentialId column
        let hasCredentialId = false;
        let positionExists = false;
        let openPositionCount = 0;
        try {
          const columnCheck: any = await prisma.$queryRaw`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'Position' AND column_name = 'credentialId'
          `;
          hasCredentialId = columnCheck.length > 0;
          positionExists = true;
        } catch {
          positionExists = false;
        }

        try {
          const countResult: any = await prisma.$queryRaw`
            SELECT COUNT(*)::int as count FROM "Position" WHERE status = 'OPEN'
          `;
          openPositionCount = countResult[0]?.count || 0;
        } catch {
          // Ignore count errors
        }

        res.status(200).json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: {
            status: 'connected',
            positionTable: {
              exists: positionExists,
              hasCredentialId,
            },
            openPositionCount,
          },
        });
      } catch (error: any) {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          database: {
            status: 'disconnected',
            error: error.message,
          },
        });
      }
    });

    // Global exception filter — returns actual error messages instead of "Internal server error"
    app.useGlobalFilters(new AllExceptionsFilter());

    // Enable CORS for Next.js frontend
    app.enableCors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
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
