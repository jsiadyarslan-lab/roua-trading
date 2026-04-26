import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Cookie parser for session management
    app.use(cookieParser());

    // Global prefix for all routes
    app.setGlobalPrefix('api');

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
