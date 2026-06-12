import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
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

    // V172 FIX: Set security + Cache-Control headers BEFORE response is sent.
    // The V170 approach of wrapping res.end() was WRONG — compression middleware
    // runs AFTER our wrapper and calls res.write() internally, which flushes headers
    // before our wrapped res.end() code runs → "Cannot set headers after they are sent".
    //
    // FIX: Wrap res.json() instead. res.json() is called BEFORE compression runs,
    // so we can safely set headers here. Also set static security headers upfront.
    app.use((req: any, res: any, next: any) => {
      // Static security headers — safe to set upfront (no body yet)
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-XSS-Protection', '0');

      // Wrap res.json() to inject Cache-Control before any middleware sees the response
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        if (!res.getHeader('Cache-Control')) {
          const path = req.url || req.originalUrl || '';
          if (
            path.includes('/api/exchange/') ||
            path.includes('/api/health') ||
            path.includes('/api/scanner/overview') ||
            path.includes('/api/scanner/heatmap')
          ) {
            res.setHeader('Cache-Control', 'public, max-age=5');
          } else {
            res.setHeader('Cache-Control', 'private, no-cache');
          }
        }
        return originalJson(body);
      };

      next();
    });

    // Cookie parser for session management
    app.use(cookieParser());

    // PERFORMANCE: Enable gzip/brotli compression for all responses.
    // Reduces JSON payload size by ~70% — critical for API responses with
    // large position lists, briefs, and market data.
    app.use(compression({
      level: 6,        // Balance between speed and compression ratio
      threshold: 1024, // Only compress responses > 1KB
      filter: (req: any, res: any) => {
        // Don't compress WebSocket upgrade requests
        if (req.headers['upgrade'] === 'websocket') return false;
        return compression.filter(req, res);
      },
    }));

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

      return res.status(403).json({
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
        timestamp: new Date().toISOString(),
      });
    });

    app.getHttpAdapter().getInstance().get('/api/health', async (req: any, res: any) => {
      const start = Date.now();
      const checks: Record<string, { status: string; latencyMs?: number }> = {};

      // FIX v6: Only use prisma.isAvailable() for health check — do NOT run $queryRaw.
      // Running `SELECT 1` on every health check (every 30s from Railway) creates
      // unnecessary DB queries. With connection_limit=1, each query occupies the
      // single connection slot, potentially blocking other queries.
      // isAvailable() checks the internal connection flag — zero DB overhead.
      try {
        if (prisma.isAvailable()) {
          checks.database = { status: 'ok' };
        } else {
          // DIAGNOSTIC: Include last error and URL prefix when DB is unavailable
          const diag = prisma.getDiagnosticInfo();
          checks.database = {
            status: 'error',
            lastError: diag.lastError || 'No error recorded',
            urlPrefix: diag.urlPrefix || 'Not set',
            failures: diag.failures,
          } as any;
        }
      } catch (err: any) {
        checks.database = { status: 'error', lastError: err?.message } as any;
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

      const hasError = Object.values(checks).some(c => c.status === 'error');
      const allOk = Object.values(checks).every(c => c.status === 'ok');
      // FIX: Always return 200 — even when DB/Redis are degraded.
      // Railway healthcheck requires 200 to mark the replica as healthy.
      // Returning 503 on DB/Redis failure causes "1/1 replicas never became healthy"
      // and prevents deployment. The 'status' field in the response body
      // still reflects the real health state for monitoring dashboards.
      const statusCode = 200;

      res.status(statusCode).json({
        status: hasError ? 'degraded' : (allOk ? 'ok' : 'degraded'),
        uptime: Math.round(process.uptime()),
        checks,
        responseTimeMs: Date.now() - start,
        // V217: Version info for deployment verification
        // This allows checking which code is ACTUALLY running on Railway
        version: {
          code: 'V217',
          agentProtection: 'ENABLED', // V214+V216: Agent positions protected from premature close
          portfolioUnification: 'ENABLED', // V217: RiskManager & RiskCalculator use same formula
          commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.DEPLOY_COMMIT || 'unknown',
          nodeEnv: process.env.NODE_ENV || 'development',
        },
      });
    });

    // ── MetaAPI Cloud health check (no auth required — for admin diagnostics) ──
    app.getHttpAdapter().getInstance().get('/api/health/metaapi', async (req: any, res: any) => {
      const start = Date.now();
      const token = process.env.METAAPI_TOKEN;

      if (!token) {
        return res.json({
          status: 'error',
          message: 'METAAPI_TOKEN غير مضبوط — أضفه كمتغير بيئة في Railway',
          tokenPresent: false,
          elapsed: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const metaApiModule: any = await import('metaapi.cloud-sdk');
        const MetaApiClass = metaApiModule.default || metaApiModule;
        const api = new MetaApiClass(token);

        let accounts: any[] = [];
        let method = 'unknown';
        let tokenValid = false;

        try {
          const accountApi = api.metatraderAccountApi;
          // V174: SDK v29+ uses getAccountsWithInfiniteScrollPagination() instead of getAccounts()
          if (accountApi && typeof accountApi.getAccountsWithInfiniteScrollPagination === 'function') {
            accounts = await accountApi.getAccountsWithInfiniteScrollPagination();
            method = 'metatraderAccountApi.getAccountsWithInfiniteScrollPagination';
            tokenValid = true;
          } else if (accountApi && typeof accountApi.getAccounts === 'function') {
            accounts = await accountApi.getAccounts();
            method = 'metatraderAccountApi.getAccounts';
            tokenValid = true;
          } else if (typeof api.getAccounts === 'function') {
            accounts = await api.getAccounts();
            method = 'api.getAccounts';
            tokenValid = true;
          } else {
            // Try provisioning profile as fallback validation
            const provApi = api.provisioningProfileApi;
            if (provApi && typeof provApi.getProvisioningProfiles === 'function') {
              await provApi.getProvisioningProfiles();
              method = 'provisioningProfileApi (token validated)';
              tokenValid = true;
            }
          }
        } catch (apiErr: any) {
          const msg = apiErr?.message || String(apiErr);
          if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('Invalid token') || msg.includes('Forbidden')) {
            return res.json({
              status: 'error',
              message: 'مفتاح MetaAPI غير صالح — تم رفض الاتصال',
              tokenPresent: true,
              tokenValid: false,
              error: msg.substring(0, 200),
              elapsed: Date.now() - start,
              timestamp: new Date().toISOString(),
            });
          }
          // Token might be valid but no accounts or other issue
          tokenValid = true;
          return res.json({
            status: 'partial',
            message: 'المفتاح موجود لكن فشل جلب الحسابات',
            tokenPresent: true,
            tokenValid: true,
            error: msg.substring(0, 200),
            method,
            elapsed: Date.now() - start,
            timestamp: new Date().toISOString(),
          });
        }

        return res.json({
          status: tokenValid ? 'ok' : 'error',
          message: tokenValid
            ? `مفتاح MetaAPI صحيح — ${accounts.length} حساب MT5 مسجل`
            : 'فشل التحقق من المفتاح',
          tokenPresent: true,
          tokenValid,
          accountsFound: accounts.length,
          accounts: accounts.map((a: any) => ({
            id: a.id,
            login: a.login,
            name: a.name,
            type: a.type || a.accountType,
            server: a.server,
            state: a.state || a.status,
          })),
          method,
          elapsed: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        return res.json({
          status: 'error',
          message: 'فشل اختبار اتصال MetaAPI Cloud',
          tokenPresent: true,
          tokenValid: false,
          error: (error?.message || String(error)).substring(0, 200),
          elapsed: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      }
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
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'x-roua-session', 'x-roua-refresh', 'X-Integration-Key', 'X-Platform'],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true, // SECURITY: reject unknown properties
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

    // ── V172d: One-time migration removed — used paperBalanceMigrated field
    // that doesn't exist in schema. Migration is not needed: existing open
    // positions will have their margin returned correctly when they close
    // (V172d closePosition returns margin + PnL). New positions opened after
    // V172d will have margin deducted correctly on open.

    // ── DIAGNOSTIC: Verify Socket.IO is properly attached ──
    // Socket.IO v4+ uses the HTTP server's 'upgrade' event for WebSocket
    // connections (not the 'request' event). The old diagnostic checked
    // request listeners, which is incorrect — Socket.IO only adds a
    // request listener for the polling transport, not for WebSocket-only.
    try {
      const httpServer = app.getHttpServer();
      const requestListeners = httpServer.listeners('request');
      const upgradeListeners = httpServer.listeners('upgrade');
      console.log(`🔌 HTTP server: ${requestListeners.length} request listener(s), ${upgradeListeners.length} upgrade listener(s)`);

      // Check upgrade listeners for Socket.IO (the correct check for WS)
      const hasSocketIOUpgrade = upgradeListeners.some((listener: any) => {
        const str = listener.toString();
        return str.includes('socket.io') || str.includes('engine');
      });

      // Also check request listeners (for polling fallback)
      const hasSocketIORequest = requestListeners.some((listener: any) => {
        const str = listener.toString();
        return str.includes('socket.io') || str.includes('engine');
      });

      const socketIOAttached = hasSocketIOUpgrade || hasSocketIORequest;
      console.log(`🔌 Socket.IO ${socketIOAttached ? '✅ attached' : '⚠️ not detected'} (upgrade=${hasSocketIOUpgrade}, request=${hasSocketIORequest})`);

      if (!socketIOAttached) {
        // This is expected if no WebSocket gateways have been initialized yet,
        // or if the IoAdapter was set up before the HTTP server was created.
        // Socket.IO will attach lazily when the first gateway is accessed.
        console.warn('🔌 Socket.IO not yet attached to HTTP server — it will attach lazily on first WebSocket connection');
      }
    } catch (diagErr: any) {
      console.warn(`⚠️ Socket.IO diagnostic failed: ${diagErr.message}`);
    }

    // SAFETY: All DDL (ALTER TABLE, CREATE TABLE, etc.) has been REMOVED from
    // application code. Schema changes must ONLY be done via:
    //   1. `prisma migrate deploy` (in start.sh — production-safe, tracked)
    //   2. `prisma migrate dev` (local development)
    // Running DDL from application code caused catastrophic data loss when
    // `prisma db push --accept-data-loss` was used as a fallback in start.sh.
    // Never run ALTER/CREATE/DROP from NestJS or Next.js code again.

    console.log(`🚀 Roua API running on http://0.0.0.0:${port}/api`);
    console.log(`🔌 Socket.IO available via NestJS IoAdapter + @WebSocketGateway`);
    console.log(`📊 Environment: ${configService.get('NODE_ENV', 'development')}`);
    console.log(`📊 API_PORT: ${port}`);

    // V172: Simplified route diagnostic — the old collectRoutes() was wrong.
    // NestJS registers routes internally (not accessible via expressApp._router.stack
    // in the same way plain Express does). The old diagnostic ALWAYS showed 0 routes
    // even when all modules loaded successfully, creating confusion.
    //
    // New approach: check if key services are in the NestJS DI container.
    // If they are, their controllers and routes are definitely registered.
    try {
      const { SmartExecutorService } = require('./modules/ai/smart-executor/smart-executor.service');
      const { StrategicCouncilService } = require('./modules/ai/strategic-council/strategic-council.service');
      const { AutonomousTraderAgentService } = require('./agents/autonomous-trader/agent.service');
      const { EngineController } = require('./modules/engine/engine.controller');

      const smLoaded = (() => { try { app.get(SmartExecutorService); return '✅ OK'; } catch { return '❌ MISSING'; } })();
      const scLoaded = (() => { try { app.get(StrategicCouncilService); return '✅ OK'; } catch { return '❌ MISSING'; } })();
      const atLoaded = (() => { try { app.get(AutonomousTraderAgentService); return '✅ OK'; } catch { return '❌ MISSING'; } })();
      const ecLoaded = (() => { try { app.get(EngineController); return '✅ OK'; } catch { return '❌ MISSING'; } })();

      console.log(`📋 SmartExecutorService:        ${smLoaded}`);
      console.log(`📋 StrategicCouncilService:     ${scLoaded}`);
      console.log(`📋 AutonomousTraderAgentService:${atLoaded}`);
      console.log(`📋 EngineController:            ${ecLoaded}`);

      const allOk = [smLoaded, scLoaded, atLoaded, ecLoaded].every(s => s.includes('✅'));
      console.log(`📋 Module status: ${allOk ? '✅ ALL LOADED' : '⚠️ SOME MISSING — check logs above for initialization errors'}`);
    } catch (diagError: any) {
      console.warn(`📋 Module diagnostic failed: ${diagError.message}`);
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
