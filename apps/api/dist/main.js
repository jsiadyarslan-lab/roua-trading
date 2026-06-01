"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const app_module_1 = require("./app.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const prisma_service_1 = require("./common/prisma/prisma.service");
const redis_service_1 = require("./common/redis/redis.service");
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Promise Rejection (non-fatal):', reason?.message || reason);
});
async function bootstrap() {
    try {
        console.log('🔧 NestJS bootstrap starting...');
        console.log(`🔧 NODE_ENV=${process.env.NODE_ENV || 'not set'}`);
        console.log(`🔧 API_PORT=${process.env.API_PORT || '3001 (default)'}`);
        console.log(`🔧 DATABASE_URL=${process.env.DATABASE_URL ? `[SET (${process.env.DATABASE_URL.length} chars)]` : '[NOT SET]'}`);
        console.log(`🔧 REDIS_URL=${process.env.REDIS_URL ? `[SET: "${process.env.REDIS_URL.substring(0, 30)}..."]` : '[NOT SET]'}`);
        console.log(`🔧 CORS_ORIGIN=${process.env.CORS_ORIGIN || 'not set'}`);
        const app = await core_1.NestFactory.create(app_module_1.AppModule, {
            logger: ['error', 'warn', 'log'],
        });
        app.enableShutdownHooks();
        app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "wss:", "https:"],
                    fontSrc: ["'self'", "https:", "data:"],
                    frameSrc: ["'none'"],
                    objectSrc: ["'none'"],
                },
            },
            crossOriginEmbedderPolicy: false,
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginResourcePolicy: { policy: 'same-origin' },
            hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        }));
        app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-XSS-Protection', '0');
            const originalJson = res.json.bind(res);
            res.json = function (body) {
                if (!res.getHeader('Cache-Control')) {
                    const path = req.url || req.originalUrl || '';
                    if (path.includes('/api/exchange/') ||
                        path.includes('/api/health') ||
                        path.includes('/api/scanner/overview') ||
                        path.includes('/api/scanner/heatmap')) {
                        res.setHeader('Cache-Control', 'public, max-age=5');
                    }
                    else {
                        res.setHeader('Cache-Control', 'private, no-cache');
                    }
                }
                return originalJson(body);
            };
            next();
        });
        app.use((0, cookie_parser_1.default)());
        app.use((0, compression_1.default)({
            level: 6,
            threshold: 1024,
            filter: (req, res) => {
                if (req.headers['upgrade'] === 'websocket')
                    return false;
                return compression_1.default.filter(req, res);
            },
        }));
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
        app.use((req, res, next) => {
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
        app.useWebSocketAdapter(new platform_socket_io_1.IoAdapter(app));
        app.setGlobalPrefix('api');
        try {
            const { SmartExecutorService } = await Promise.resolve().then(() => __importStar(require('./modules/ai/smart-executor/smart-executor.service')));
            const { StrategicCouncilService } = await Promise.resolve().then(() => __importStar(require('./modules/ai/strategic-council/strategic-council.service')));
            const { AutonomousTraderAgentService } = await Promise.resolve().then(() => __importStar(require('./agents/autonomous-trader/agent.service')));
            let smartExecutorLoaded = false;
            let strategicCouncilLoaded = false;
            let agentLoaded = false;
            try {
                app.get(SmartExecutorService);
                smartExecutorLoaded = true;
            }
            catch {
                smartExecutorLoaded = false;
            }
            try {
                app.get(StrategicCouncilService);
                strategicCouncilLoaded = true;
            }
            catch {
                strategicCouncilLoaded = false;
            }
            try {
                app.get(AutonomousTraderAgentService);
                agentLoaded = true;
            }
            catch {
                agentLoaded = false;
            }
            console.log(`📋 SmartExecutorService: ${smartExecutorLoaded ? '✅ LOADED' : '❌ NOT LOADED'}`);
            console.log(`📋 StrategicCouncilService: ${strategicCouncilLoaded ? '✅ LOADED' : '❌ NOT LOADED'}`);
            console.log(`📋 AutonomousTraderAgentService: ${agentLoaded ? '✅ LOADED' : '❌ NOT LOADED'}`);
        }
        catch (diagErr) {
            console.error(`📋 Module diagnostic import failed: ${diagErr.message}`);
        }
        const prisma = app.get(prisma_service_1.PrismaService);
        const redisService = app.get(redis_service_1.RedisService, { strict: false });
        app.getHttpAdapter().getInstance().get('/api/diagnostic/modules', async (req, res) => {
            const modules = {};
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
                    const { [svc.token]: ServiceClass } = await Promise.resolve(`${svc.name.includes('Smart') ? './modules/ai/smart-executor/smart-executor.service' :
                        svc.name.includes('Strategic') ? './modules/ai/strategic-council/strategic-council.service' :
                            svc.name.includes('Agent') ? './agents/autonomous-trader/agent.service' :
                                svc.name.includes('Engine') ? './modules/engine/engine.controller' :
                                    svc.name.includes('Exchange') ? './modules/exchange/exchange.service' :
                                        svc.name.includes('Orchestrator') ? './modules/ai/services/ai-orchestrator.service' :
                                            svc.name.includes('Notification') ? './modules/notification/notification.service' :
                                                './modules/trading/trading.service'}`).then(s => __importStar(require(s)));
                    try {
                        app.get(ServiceClass);
                        modules[svc.name] = { loaded: true };
                    }
                    catch {
                        modules[svc.name] = { loaded: false, error: 'Service not in DI container' };
                    }
                }
                catch (importErr) {
                    modules[svc.name] = { loaded: false, error: `Import failed: ${importErr.message}` };
                }
            }
            const expressApp = app.getHttpAdapter().getInstance();
            const routePaths = [];
            function collectRoutes(stack) {
                for (const layer of stack) {
                    if (layer.route) {
                        const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
                        routePaths.push(`${methods.join(',')} ${layer.route.path}`);
                    }
                    else if (layer.handle?.stack) {
                        collectRoutes(layer.handle.stack);
                    }
                }
            }
            if (expressApp._router?.stack)
                collectRoutes(expressApp._router.stack);
            const smartExecutorRoutes = routePaths.filter(r => r.includes('smart-executor'));
            const strategicCouncilRoutes = routePaths.filter(r => r.includes('strategic-council'));
            const agentRoutes = routePaths.filter(r => r.includes('agent/trader'));
            const engineRoutes = routePaths.filter(r => r.includes('engine'));
            res.json({
                modules,
                timestamp: new Date().toISOString(),
            });
        });
        app.getHttpAdapter().getInstance().get('/api/health', async (req, res) => {
            const start = Date.now();
            const checks = {};
            try {
                if (prisma.isAvailable()) {
                    checks.database = { status: 'ok' };
                }
                else {
                    const diag = prisma.getDiagnosticInfo();
                    checks.database = {
                        status: 'error',
                        lastError: diag.lastError || 'No error recorded',
                        urlPrefix: diag.urlPrefix || 'Not set',
                        failures: diag.failures,
                    };
                }
            }
            catch (err) {
                checks.database = { status: 'error', lastError: err?.message };
            }
            try {
                const redisStart = Date.now();
                if (redisService && typeof redisService.ping === 'function') {
                    await redisService.ping();
                    checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
                }
                else {
                    checks.redis = { status: 'degraded' };
                }
            }
            catch {
                checks.redis = { status: 'degraded' };
            }
            const mem = process.memoryUsage();
            const memMB = Math.round(mem.heapUsed / 1024 / 1024);
            checks.memory = {
                status: memMB > 512 ? 'warning' : 'ok',
            };
            const hasError = Object.values(checks).some(c => c.status === 'error');
            const allOk = Object.values(checks).every(c => c.status === 'ok');
            const statusCode = 200;
            res.status(statusCode).json({
                status: hasError ? 'degraded' : (allOk ? 'ok' : 'degraded'),
                uptime: Math.round(process.uptime()),
                checks,
                responseTimeMs: Date.now() - start,
            });
        });
        app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
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
        const corsOriginHandler = (origin, callback) => {
            if (!origin)
                return callback(null, true);
            if (corsOrigins.includes(origin))
                return callback(null, true);
            if (origin.match(/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/))
                return callback(null, true);
            if (origin.match(/^https:\/\/[a-z0-9-]+\.railway\.app$/))
                return callback(null, true);
            if (origin.match(/^http:\/\/localhost:\d+$/))
                return callback(null, true);
            if (origin.match(/^http:\/\/127\.0\.0\.1:\d+$/))
                return callback(null, true);
            callback(null, false);
        };
        app.enableCors({
            origin: corsOriginHandler,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'x-roua-session', 'X-Integration-Key'],
        });
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }));
        const configService = app.get(config_1.ConfigService);
        const port = configService.get('API_PORT', 3001);
        if (process.env.NODE_ENV === 'production') {
            if (!process.env.NEXTAUTH_SECRET && !process.env.ENCRYPTION_KEY) {
                console.error('⚠️ CRITICAL: Neither NEXTAUTH_SECRET nor ENCRYPTION_KEY is set in production! ' +
                    'Credentials cannot be securely encrypted. Set ENCRYPTION_KEY (preferred) or NEXTAUTH_SECRET immediately.');
            }
            else if (!process.env.ENCRYPTION_KEY && process.env.NEXTAUTH_SECRET) {
                console.warn('⚠️ WARNING: ENCRYPTION_KEY not set — using NEXTAUTH_SECRET as fallback for credential encryption. ' +
                    'This is insecure because NEXTAUTH_SECRET was designed for signing, not encryption. ' +
                    'Set ENCRYPTION_KEY explicitly for production use.');
            }
        }
        await app.listen(port, '0.0.0.0');
        try {
            const httpServer = app.getHttpServer();
            const requestListeners = httpServer.listeners('request');
            const upgradeListeners = httpServer.listeners('upgrade');
            console.log(`🔌 HTTP server: ${requestListeners.length} request listener(s), ${upgradeListeners.length} upgrade listener(s)`);
            const hasSocketIOUpgrade = upgradeListeners.some((listener) => {
                const str = listener.toString();
                return str.includes('socket.io') || str.includes('engine');
            });
            const hasSocketIORequest = requestListeners.some((listener) => {
                const str = listener.toString();
                return str.includes('socket.io') || str.includes('engine');
            });
            const socketIOAttached = hasSocketIOUpgrade || hasSocketIORequest;
            console.log(`🔌 Socket.IO ${socketIOAttached ? '✅ attached' : '⚠️ not detected'} (upgrade=${hasSocketIOUpgrade}, request=${hasSocketIORequest})`);
            if (!socketIOAttached) {
                console.warn('🔌 Socket.IO not yet attached to HTTP server — it will attach lazily on first WebSocket connection');
            }
        }
        catch (diagErr) {
            console.warn(`⚠️ Socket.IO diagnostic failed: ${diagErr.message}`);
        }
        console.log(`🚀 Roua API running on http://0.0.0.0:${port}/api`);
        console.log(`🔌 Socket.IO available via NestJS IoAdapter + @WebSocketGateway`);
        console.log(`📊 Environment: ${configService.get('NODE_ENV', 'development')}`);
        console.log(`📊 API_PORT: ${port}`);
        try {
            const { SmartExecutorService } = require('./modules/ai/smart-executor/smart-executor.service');
            const { StrategicCouncilService } = require('./modules/ai/strategic-council/strategic-council.service');
            const { AutonomousTraderAgentService } = require('./agents/autonomous-trader/agent.service');
            const { EngineController } = require('./modules/engine/engine.controller');
            const smLoaded = (() => { try {
                app.get(SmartExecutorService);
                return '✅ OK';
            }
            catch {
                return '❌ MISSING';
            } })();
            const scLoaded = (() => { try {
                app.get(StrategicCouncilService);
                return '✅ OK';
            }
            catch {
                return '❌ MISSING';
            } })();
            const atLoaded = (() => { try {
                app.get(AutonomousTraderAgentService);
                return '✅ OK';
            }
            catch {
                return '❌ MISSING';
            } })();
            const ecLoaded = (() => { try {
                app.get(EngineController);
                return '✅ OK';
            }
            catch {
                return '❌ MISSING';
            } })();
            console.log(`📋 SmartExecutorService:        ${smLoaded}`);
            console.log(`📋 StrategicCouncilService:     ${scLoaded}`);
            console.log(`📋 AutonomousTraderAgentService:${atLoaded}`);
            console.log(`📋 EngineController:            ${ecLoaded}`);
            const allOk = [smLoaded, scLoaded, atLoaded, ecLoaded].every(s => s.includes('✅'));
            console.log(`📋 Module status: ${allOk ? '✅ ALL LOADED' : '⚠️ SOME MISSING — check logs above for initialization errors'}`);
        }
        catch (diagError) {
            console.warn(`📋 Module diagnostic failed: ${diagError.message}`);
        }
        const shutdown = async (signal) => {
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
            }
            catch (err) {
                console.error('❌ Error during graceful shutdown:', err);
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        console.error('❌ NestJS bootstrap failed:', error);
        console.log('🔄 Restarting in 5 seconds...');
        setTimeout(() => process.exit(1), 5000);
    }
}
bootstrap();
//# sourceMappingURL=main.js.map