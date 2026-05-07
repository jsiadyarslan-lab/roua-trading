import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
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
    // FIX: Attach Socket.IO to NestJS's HTTP server and ensure its request handler
    // runs BEFORE Express's handler. Socket.IO's init() method reorders the HTTP
    // server's 'request' listeners so that Socket.IO checks the path first.
    // If the path matches /socket.io/, Socket.IO handles it; otherwise, Express
    // processes the request normally.
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

    // ── FIX: Start HTTP server + Socket.IO ──
    // CRITICAL: Socket.IO requires its request handler to run BEFORE Express's
    // handler so that /socket.io/* paths are intercepted. The IoAdapter sets
    // up the Socket.IO server, but init() (which reorders HTTP request listeners)
    // must be called AFTER app.listen() to ensure Express is fully configured.
    //
    // Previous attempt: Creating SocketIOServer(httpServer) before listen()
    // reordered listeners prematurely, breaking Express routes (all returned 404).
    //
    // Current approach: Use IoAdapter (creates Socket.IO server with gateways),
    // then after app.listen(), manually call init() to reorder listeners so
    // /socket.io/* requests go to Socket.IO and everything else goes to Express.
    const httpServer = app.getHttpServer();

    // Log request listener order BEFORE starting
    const listenersBefore = httpServer.listeners('request');
    console.log(`📋 HTTP request listeners before listen: ${listenersBefore.length}`);

    await app.listen(port, '0.0.0.0');

    // ── FIX: Initialize Socket.IO request handler AFTER Express is ready ──
    // After app.listen(), Express is fully configured as the primary request handler.
    // Now we need Socket.IO's handler to intercept /socket.io/* requests BEFORE
    // Express processes them. We do this by:
    // 1. Getting the Socket.IO server instance from NestJS's IoAdapter
    // 2. Calling init() which prepends Socket.IO's request handler to the
    //    HTTP server's listener chain, so /socket.io/* requests are handled
    //    by Socket.IO and all other requests fall through to Express.
    try {
      const wsAdapter = app.getWebSocketAdapter() as any;

      // The NestJS IoAdapter stores the Socket.IO server in different ways
      // depending on the version. Try multiple access patterns.
      let ioServer: any = null;

      // Pattern 1: Direct ioServer property
      if (wsAdapter?.ioServer) {
        ioServer = wsAdapter.ioServer;
      }

      // Pattern 2: Get from the first initialized gateway namespace
      if (!ioServer && wsAdapter?.namespaces) {
        const nsEntries = Object.entries(wsAdapter.namespaces);
        if (nsEntries.length > 0) {
          const [, firstNs] = nsEntries[0];
          ioServer = (firstNs as any)?.server;
        }
      }

      // Pattern 3: Get server from the IoAdapter's internal map
      if (!ioServer) {
        const ioServerMap = wsAdapter?.ioserverMap || wsAdapter?.ioServerMap;
        if (ioServerMap instanceof Map && ioServerMap.size > 0) {
          ioServer = ioServerMap.values().next().value;
        }
      }

      if (ioServer && typeof ioServer.init === 'function') {
        ioServer.init();
        const listenersAfter = httpServer.listeners('request');
        console.log(`🔌 Socket.IO init() called — /socket.io/* will be handled`);
        console.log(`📋 HTTP request listeners after init: ${listenersAfter.length} (was ${listenersBefore.length})`);
      } else if (ioServer) {
        // Fallback: Manually reorder HTTP request listeners
        // Socket.IO's engine.io has a handleRequest method
        console.log('🔌 Socket.IO server found but init() not available — attempting manual reordering');
        const ioHandler = ioServer?.engine?.handleRequest;
        if (ioHandler) {
          const currentListeners = httpServer.listeners('request').slice();
          httpServer.removeAllListeners('request');
          httpServer.on('request', ioHandler);
          for (const listener of currentListeners) {
            httpServer.on('request', listener as any);
          }
          console.log('🔌 Socket.IO handler prepended to HTTP server manually');
        }
      } else {
        console.warn('🔌 Socket.IO: Could not find server instance — WebSocket may not work');
        console.warn('🔌 This is expected if no WebSocket gateways are registered');
      }
    } catch (socketInitErr: any) {
      console.warn(`🔌 Socket.IO init failed (non-fatal, API still works): ${socketInitErr.message}`);
    }
    console.log(`🚀 Roua API running on http://0.0.0.0:${port}/api`);
    console.log(`🔌 Socket.IO available via NestJS WebSocket gateways`);
    console.log(`📊 Environment: ${configService.get('NODE_ENV', 'development')}`);

    // Log request listener order for debugging
    const listeners = httpServer.listeners('request');
    console.log(`📋 HTTP request listeners: ${listeners.length}`);

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
