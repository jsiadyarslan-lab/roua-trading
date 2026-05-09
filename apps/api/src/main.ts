import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';

// FIX: Prevent unhandled promise rejections from crashing the process.
// In Node.js 18+, unhandled rejections terminate the process by default.
// StrategicCouncilService._triggerStartupSession() and SmartExecutorService._autoStart()
// fire async operations from constructors that can produce unhandled rejections
// when AI services are unavailable or timeout.
process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️ Unhandled Promise Rejection (non-fatal):', reason?.message || reason);
});

async function bootstrap() {
  try {
    // DIAGNOSTIC: Log critical env vars before any module loads
    console.log('🔧 NestJS bootstrap starting...');
    console.log(`🔧 NODE_ENV=${process.env.NODE_ENV || 'not set'}`);
    console.log(`🔧 API_PORT=${process.env.API_PORT || '3001 (default)'}`);
    console.log(`🔧 DATABASE_URL=${process.env.DATABASE_URL ? `[SET (${process.env.DATABASE_URL.length} chars)]` : '[NOT SET]'}`);
    console.log(`🔧 REDIS_URL=${process.env.REDIS_URL ? `[SET: "${process.env.REDIS_URL.substring(0, 30)}..."]` : '[NOT SET]'}`);
    console.log(`🔧 CORS_ORIGIN=${process.env.CORS_ORIGIN || 'not set'}`);

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
    app.use((req: any, res: any, next: any) => {
      const originalEnd = res.end;
      res.end = function (...args: any[]) {
        if (!res.getHeader('Cache-Control')) {
          const path = req.url || req.originalUrl || '';
          if (path.includes('/api/exchange/') || path.includes('/api/health') || path.includes('/api/scanner/overview') || path.includes('/api/scanner/heatmap')) {
            res.setHeader('Cache-Control', 'public, max-age=5');
          } else {
            res.setHeader('Cache-Control', 'private, no-cache');
          }
        }
        return originalEnd.apply(res, args);
      };

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-XSS-Protection', '0');
      next();
    });

    // Cookie parser for session management
    app.use(cookieParser());

    // ── CSRF Protection — Origin Validation ──
    const STATE_CHANGING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
    const allowedOriginPatterns = [
      /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
      /^https:\/\/[a-z0-9-]+\.railway\.app$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ];
    const explicitOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    app.use((req: any, res: any, next: any) => {
      if (!STATE_CHANGING_METHODS.includes(req.method)) {
        return next();
      }

      const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/');
      if (!origin) {
        return next();
      }

      if (explicitOrigins.includes(origin)) {
        return next();
      }

      if (allowedOriginPatterns.some(pattern => pattern.test(origin))) {
        return next();
      }

      res.status(403).json({
        statusCode: 403,
        message: 'طلب مرفوض — مصدر غير مصرح به (CSRF protection)',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
    });

    // ── Socket.IO Setup ──
    // Use NestJS's built-in IoAdapter for WebSocket support.
    // The IoAdapter integrates with NestJS's dependency injection and
    // lifecycle, ensuring @WebSocketGateway decorators work correctly.
    //
    // IMPORTANT: Do NOT create a second manual Socket.IO server.
    // Previously, a manual SocketIOServer was created after app.listen()
    // with HTTP listener hijacking (removing all Express listeners and
    // adding a custom wrapper). This caused:
    //   1. Dual Socket.IO engines competing on the same HTTP server
    //   2. Express routing broken — ALL API routes returning 503
    //   3. @WebSocketGateway decorators not receiving connections
    //
    // Instead, Socket.IO polling is handled via Next.js rewrites
    // in next.config.ts (source: '/socket.io/:path*' → NestJS:3001),
    // and WebSocket upgrades are handled by the IoAdapter's server.
    app.useWebSocketAdapter(new IoAdapter(app));

    // Global prefix for all routes
    app.setGlobalPrefix('api');

    // ── DIAGNOSTIC: Check module loading ──
    // Log which modules successfully initialized by checking if their services exist
    try {
      const { SmartExecutorService } = await import('./modules/ai/smart-executor/smart-executor.service');
      const { StrategicCouncilService } = await import('./modules/ai/strategic-council/strategic-council.service');
      const { AutonomousTraderAgentService } = await import('./agents/autonomous-trader/agent.service');

      let smartExecutorLoaded = false;
      let strategicCouncilLoaded = false;
      let agentLoaded = false;

      try { app.get(SmartExecutorService); smartExecutorLoaded = true; } catch { smartExecutorLoaded = false; }
      try { app.get(StrategicCouncilService); strategicCouncilLoaded = true; } catch { strategicCouncilLoaded = false; }
      try { app.get(AutonomousTraderAgentService); agentLoaded = true; } catch { agentLoaded = false; }

      console.log(`📋 SmartExecutorService: ${smartExecutorLoaded ? '✅ LOADED' : '❌ NOT LOADED'}`);
      console.log(`📋 StrategicCouncilService: ${strategicCouncilLoaded ? '✅ LOADED' : '❌ NOT LOADED'}`);
      console.log(`📋 AutonomousTraderAgentService: ${agentLoaded ? '✅ LOADED' : '❌ NOT LOADED'}`);
    } catch (diagErr: any) {
      console.error(`📋 Module diagnostic import failed: ${diagErr.message}`);
    }

    // ── Health check endpoint (no auth required) ──
    const prisma = app.get(PrismaService);
    const redisService = app.get(RedisService, { strict: false });

    // ── DIAGNOSTIC: Direct Express route to check module loading (bypasses NestJS router) ──
    app.getHttpAdapter().getInstance().get('/api/diagnostic/modules', async (req: any, res: any) => {
      const modules: Record<string, any> = {};
      const servicesToCheck = [
        { name: 'SmartExecutorService', token: 'SmartExecutorService' },
        { name: 'StrategicCouncilService', token: 'StrategicCouncilService' },
        { name: 'AutonomousTraderAgentService', token: 'AutonomousTraderAgentService' },
        { name: 'EngineController', token: 'EngineController' },
        { name: 'ExchangeService', token: 'ExchangeService' },
        { name: 'AIOrchestratorService', token: 'AIOrchestratorService' },
        { name: 'NotificationService', token: 'NotificationService' },
        { name: 'TradingService', token: 'TradingService' },
      ];
      for (const svc of servicesToCheck) {
        try {
          const container = app.getHttpAdapter().getInstance();
          // Try to get the service from NestJS container
          const { [svc.token]: ServiceClass } = await import(
            svc.name.includes('Smart') ? './modules/ai/smart-executor/smart-executor.service' :
            svc.name.includes('Strategic') ? './modules/ai/strategic-council/strategic-council.service' :
            svc.name.includes('Agent') ? './agents/autonomous-trader/agent.service' :
            svc.name.includes('Engine') ? './modules/engine/engine.controller' :
            svc.name.includes('Exchange') ? './modules/exchange/exchange.service' :
            svc.name.includes('Orchestrator') ? './modules/ai/services/ai-orchestrator.service' :
            svc.name.includes('Notification') ? './modules/notification/notification.service' :
            './modules/trading/trading.service'
          );
          try {
            app.get(ServiceClass);
            modules[svc.name] = { loaded: true };
          } catch {
            modules[svc.name] = { loaded: false, error: 'Service not in DI container' };
          }
        } catch (importErr: any) {
          modules[svc.name] = { loaded: false, error: `Import failed: ${importErr.message}` };
        }
      }

      // Also check registered Express routes
      const expressApp = app.getHttpAdapter().getInstance();
      const routePaths: string[] = [];
      function collectRoutes(stack: any[]) {
        for (const layer of stack) {
          if (layer.route) {
            const methods = Object.keys(layer.route.methods).map((m: string) => m.toUpperCase());
            routePaths.push(`${methods.join(',')} ${layer.route.path}`);
          } else if (layer.handle?.stack) {
            collectRoutes(layer.handle.stack);
          }
        }
      }
      if (expressApp._router?.stack) collectRoutes(expressApp._router.stack);

      const smartExecutorRoutes = routePaths.filter(r => r.includes('smart-executor'));
      const strategicCouncilRoutes = routePaths.filter(r => r.includes('strategic-council'));
      const agentRoutes = routePaths.filter(r => r.includes('agent/trader'));
      const engineRoutes = routePaths.filter(r => r.includes('engine'));

      res.json({
        modules,
        routes: {
          total: routePaths.length,
          smartExecutor: smartExecutorRoutes,
          strategicCouncil: strategicCouncilRoutes,
          agent: agentRoutes,
          engine: engineRoutes,
        },
      });
    });

    app.getHttpAdapter().getInstance().get('/api/health', async (req: any, res: any) => {
      const start = Date.now();
      const checks: Record<string, { status: string; latencyMs?: number }> = {};

      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
      } catch {
        checks.database = { status: 'error' };
      }

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
        // DIAGNOSTIC: Check critical module loading
        _modules: {
          smartExecutor: (() => { try { app.get(require('./modules/ai/smart-executor/smart-executor.service').SmartExecutorService); return 'LOADED'; } catch { return 'MISSING'; } })(),
          strategicCouncil: (() => { try { app.get(require('./modules/ai/strategic-council/strategic-council.service').StrategicCouncilService); return 'LOADED'; } catch { return 'MISSING'; } })(),
          agentTrader: (() => { try { app.get(require('./agents/autonomous-trader/agent.service').AutonomousTraderAgentService); return 'LOADED'; } catch { return 'MISSING'; } })(),
        },
      });
    });

    // Global exception filter
    app.useGlobalFilters(new AllExceptionsFilter());

    // Enable CORS for Next.js frontend
    const corsOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'];
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      corsOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.RAILWAY_STATIC_URL) {
      corsOrigins.push(process.env.RAILWAY_STATIC_URL);
    }
    if (process.env.INTEGRATION_PARTNER_URL) {
      corsOrigins.push(process.env.INTEGRATION_PARTNER_URL);
    }
    const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      if (origin.match(/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/)) return callback(null, true);
      if (origin.match(/^https:\/\/[a-z0-9-]+\.railway\.app$/)) return callback(null, true);
      if (origin.match(/^http:\/\/localhost:\d+$/)) return callback(null, true);
      if (origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) return callback(null, true);
      callback(null, false);
    };

    app.enableCors({
      origin: corsOriginHandler,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'x-roua-session', 'X-Integration-Key'],
    });

    // Global validation pipe
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

    // ── Start HTTP server ──
    await app.listen(port, '0.0.0.0');

    // ── DIAGNOSTIC: Verify Socket.IO engine is properly attached ──
    // The IoAdapter creates the Socket.IO Server during module initialization
    // (BEFORE app.listen()). After listen(), we verify the engine is attached.
    // DO NOT create a second SocketIOServer — that causes dual-server conflicts
    // where the second server intercepts requests but lacks namespace handlers
    // registered by @WebSocketGateway decorators, resulting in 400 Bad Request.
    try {
      const httpServer = app.getHttpServer();
      const listeners = httpServer.listeners('request');
      console.log(`🔌 HTTP server has ${listeners.length} request listener(s)`);

      const hasSocketIO = listeners.some((listener: any) => {
        const str = listener.toString();
        return str.includes('socket.io') || str.includes('engine');
      });
      console.log(`🔌 Socket.IO engine ${hasSocketIO ? '✅ attached' : '❌ NOT attached'} to HTTP server`);

      if (!hasSocketIO) {
        console.error('🔌 CRITICAL: Socket.IO engine not found on HTTP server! WebSocket connections will fail.');
        console.error('🔌 This means the IoAdapter did not properly attach Socket.IO. Check @WebSocketGateway decorators.');
      }
    } catch (diagErr: any) {
      console.warn(`⚠️ Socket.IO diagnostic failed: ${diagErr.message}`);
    }

    // ── CRITICAL: Ensure database columns match Prisma schema ──
    // The start.sh safety-net SQL sometimes fails to add columns.
    // This is a fallback that adds missing columns directly via Prisma.
    try {
      const missingColumns: Array<{table: string; column: string; sql: string}> = [
        { table: 'Position', column: 'source', sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'user_manual'` },
        { table: 'Position', column: 'updatedAt', sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` },
        { table: 'Trade', column: 'source', sql: `ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'user_manual'` },
        { table: 'Trade', column: 'updatedAt', sql: `ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` },
      ];

      for (const col of missingColumns) {
        try {
          // Check if column exists
          const result = await prisma.$queryRaw<Array<{exists: boolean}>>`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = ${col.table} AND column_name = ${col.column}
            ) as exists
          `;
          if (!result[0]?.exists) {
            console.log(`🔧 Adding missing column ${col.table}.${col.column}...`);
            await prisma.$executeRawUnsafe(col.sql);
            console.log(`✅ Added ${col.table}.${col.column}`);
          }
        } catch (colErr: any) {
          // Column might already exist — ignore error
          if (!colErr.message?.includes('already exists')) {
            console.warn(`⚠️ Could not add ${col.table}.${col.column}: ${colErr.message}`);
          }
        }
      }

      // Fix DECIMAL precision for Position
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Position" ALTER COLUMN "unrealizedPnl" TYPE DECIMAL(18,4)`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Position" ALTER COLUMN "realizedPnl" TYPE DECIMAL(18,4)`);
        console.log(`✅ Fixed Position DECIMAL precision`);
      } catch { /* May already be correct */ }

      // The unique constraint on Position was removed to allow closing multiple positions.
      // Do NOT re-add it here!

      // Make source columns nullable
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Position" ALTER COLUMN "source" DROP NOT NULL`);
      } catch { /* May already be nullable */ }
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Trade" ALTER COLUMN "source" DROP NOT NULL`);
      } catch { /* May already be nullable */ }

    } catch (schemaFixErr: any) {
      console.warn(`⚠️ Database schema fix failed: ${schemaFixErr.message}`);
    }

    console.log(`🚀 Roua API running on http://0.0.0.0:${port}/api`);
    console.log(`🔌 Socket.IO available via NestJS IoAdapter + @WebSocketGateway`);
    console.log(`📊 Environment: ${configService.get('NODE_ENV', 'development')}`);
    console.log(`📊 API_PORT: ${port}`);

    // FIX: Log registered NestJS routes to diagnose missing controllers.
    // If SmartExecutor/StrategicCouncil routes are missing, it means the module
    // failed to initialize (duplicate ScheduleModule.forRoot(), circular deps, etc.)
    try {
      const expressApp = app.getHttpAdapter().getInstance();
      const routes: string[] = [];
      function collectRoutes(stack: any[], prefix = '') {
        for (const layer of stack) {
          if (layer.route) {
            const methods = Object.keys(layer.route.methods).map((m: string) => m.toUpperCase());
            routes.push(`${methods.join(',')} ${prefix}${layer.route.path}`);
          } else if (layer.handle && layer.handle.stack) {
            const regex = layer.regexp?.toString() || '';
            const match = regex.match(/\/api\/([^/]+)/);
            const subPrefix = match ? `/api/${match[1]}` : prefix;
            collectRoutes(layer.handle.stack, subPrefix);
          }
        }
      }
      collectRoutes(expressApp._router?.stack || []);
      const smartExecutorRoutes = routes.filter(r => r.includes('smart-executor'));
      const strategicCouncilRoutes = routes.filter(r => r.includes('strategic-council'));
      const agentRoutes = routes.filter(r => r.includes('agent/trader'));
      const engineRoutes = routes.filter(r => r.includes('engine'));
      console.log(`📋 Total routes: ${routes.length}`);
      console.log(`📋 SmartExecutor routes: ${smartExecutorRoutes.length} ${smartExecutorRoutes.length > 0 ? '✅' : '❌ MISSING'}`);
      console.log(`📋 StrategicCouncil routes: ${strategicCouncilRoutes.length} ${strategicCouncilRoutes.length > 0 ? '✅' : '❌ MISSING'}`);
      console.log(`📋 AgentTrader routes: ${agentRoutes.length} ${agentRoutes.length > 0 ? '✅' : '❌ MISSING'}`);
      console.log(`📋 Engine routes: ${engineRoutes.length} ${engineRoutes.length > 0 ? '✅' : '❌ MISSING'}`);
    } catch (diagError: any) {
      console.warn(`📋 Route diagnostic failed: ${diagError.message}`);
    }

    // FIX #2: Graceful shutdown — handle SIGTERM from Railway
    const shutdown = async (signal: string) => {
      console.log(`📡 Received ${signal} — shutting down gracefully...`);
      try {
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
    console.log('🔄 Restarting in 5 seconds...');
    setTimeout(() => process.exit(1), 5000);
  }
}

bootstrap();
