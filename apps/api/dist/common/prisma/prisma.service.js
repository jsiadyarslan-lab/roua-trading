"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let PrismaService = PrismaService_1 = class PrismaService extends client_1.PrismaClient {
    static get dbAvailable() { return PrismaService_1._dbAvailable; }
    static get lastError() { return PrismaService_1._lastError; }
    static get dbUrlPrefix() { return PrismaService_1._dbUrlPrefix; }
    constructor() {
        const isDev = process.env.NODE_ENV !== 'production';
        const dbUrl = (() => {
            try {
                const u = new URL(process.env.DATABASE_URL || '');
                u.searchParams.set('connection_limit', '1');
                u.searchParams.set('pool_timeout', '10');
                return u.toString();
            }
            catch {
                const base = process.env.DATABASE_URL || '';
                const sep = base.includes('?') ? '&' : '?';
                return `${base}${sep}connection_limit=1&pool_timeout=10`;
            }
        })();
        PrismaService_1._dbUrlPrefix = dbUrl.substring(0, 30) + '...';
        super({
            datasources: {
                db: {
                    url: dbUrl,
                },
            },
            log: [
                ...(isDev ? [{ emit: 'event', level: 'query' }] : []),
                { emit: 'stdout', level: 'warn' },
                { emit: 'stdout', level: 'error' },
            ],
        });
        this.logger = new common_1.Logger(PrismaService_1.name);
        this.reconnectTimer = null;
        this.connectInProgress = false;
        this.connected = false;
        this.consecutiveFailures = 0;
        let connectionMode = 'direct (no modifications)';
        this.logger.log(`📦 Prisma connection: ${connectionMode}`);
        if (isDev) {
            this.$on('query', (e) => {
                this.logger.debug(`Query: ${e.query} — ${e.duration}ms`);
            });
        }
    }
    async onModuleInit() {
        const INIT_TIMEOUT_MS = 15_000;
        const connected = await Promise.race([
            this.tryConnect(),
            new Promise((resolve) => setTimeout(() => {
                this.logger.warn(`📦 Prisma $connect() timed out after ${INIT_TIMEOUT_MS / 1000}s — will retry in background`);
                resolve(false);
            }, INIT_TIMEOUT_MS)),
        ]);
        if (!connected) {
            this.logger.warn(`📦 Prisma database unavailable at startup — API will continue and retry with exponential backoff`);
            this.scheduleReconnect();
        }
        else {
            await this.autoMigrateMissingColumns();
        }
    }
    async autoMigrateMissingColumns() {
        const migrations = [
            {
                table: 'Position',
                column: 'exitPrice',
                sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exitPrice" Decimal(18,8)`,
            },
            {
                table: 'Position',
                column: 'closeReason',
                sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "closeReason" TEXT`,
            },
            {
                table: 'ExchangeCredential',
                column: 'keyType',
                sql: `ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "keyType" TEXT NOT NULL DEFAULT 'hmac'`,
            },
        ];
        for (const migration of migrations) {
            try {
                await this.$executeRawUnsafe(migration.sql);
                this.logger.log(`📦 Auto-migration: Added ${migration.table}.${migration.column}`);
            }
            catch (error) {
                if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
                    this.logger.log(`📦 Auto-migration: ${migration.table}.${migration.column} already exists ✅`);
                }
                else {
                    this.logger.warn(`📦 Auto-migration failed for ${migration.table}.${migration.column}: ${error?.message?.substring(0, 200)}`);
                }
            }
        }
    }
    async onModuleDestroy() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        try {
            await this.$disconnect();
            this.connected = false;
            PrismaService_1._dbAvailable = false;
            this.logger.log('📦 Prisma disconnected from database');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`📦 Prisma disconnect skipped: ${message}`);
        }
    }
    async tryConnect() {
        if (this.connectInProgress) {
            return this.connected;
        }
        this.connectInProgress = true;
        try {
            await this.$connect();
            this.connected = true;
            this.consecutiveFailures = 0;
            PrismaService_1._dbAvailable = true;
            this.logger.log('📦 Prisma connected to database');
            return true;
        }
        catch (error) {
            this.connected = false;
            PrismaService_1._dbAvailable = false;
            this.consecutiveFailures++;
            const message = error instanceof Error ? error.message : 'Unknown error';
            PrismaService_1._lastError = `[attempt ${this.consecutiveFailures}] ${message.substring(0, 300)}`;
            this.logger.error(`📦 Prisma connection failed (attempt ${this.consecutiveFailures}): ${message}`);
            return false;
        }
        finally {
            this.connectInProgress = false;
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        const baseDelay = 10_000;
        const delay = Math.min(baseDelay * Math.pow(2, Math.min(this.consecutiveFailures, 3)), 300_000);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            const connected = await this.tryConnect();
            if (!connected) {
                this.scheduleReconnect();
            }
        }, delay);
    }
    isAvailable() {
        return this.connected && PrismaService_1._dbAvailable;
    }
    getDiagnosticInfo() {
        return {
            available: this.connected && PrismaService_1._dbAvailable,
            lastError: PrismaService_1._lastError,
            urlPrefix: PrismaService_1._dbUrlPrefix,
            failures: this.consecutiveFailures,
        };
    }
    async setRlsUserId(userId) {
        if (!this.isAvailable())
            return;
        try {
            const safeId = userId.replace(/'/g, "''");
            await this.$executeRawUnsafe(`SET app.current_user_id = '${safeId}'`);
        }
        catch (error) {
            this.logger.warn(`RLS setRlsUserId failed: ${error?.message}`);
        }
    }
    async clearRlsUserId() {
        if (!this.isAvailable())
            return;
        try {
            await this.$executeRawUnsafe(`RESET app.current_user_id`);
        }
        catch (error) {
            this.logger.warn(`RLS clearRlsUserId FAILED — RLS context may leak: ${error?.message || 'unknown'}`);
        }
    }
    async enableRlsBypass() {
        if (!this.isAvailable())
            return;
        try {
            await this.$executeRawUnsafe(`SET app.rls_bypass = 'true'`);
        }
        catch {
        }
    }
    async disableRlsBypass() {
        if (!this.isAvailable())
            return;
        try {
            await this.$executeRawUnsafe(`RESET app.rls_bypass`);
        }
        catch {
        }
    }
    async withRlsUser(userId, fn) {
        await this.setRlsUserId(userId);
        try {
            return await fn();
        }
        finally {
            await this.clearRlsUserId();
        }
    }
    async withRlsBypass(fn) {
        await this.enableRlsBypass();
        try {
            return await fn();
        }
        finally {
            await this.disableRlsBypass();
        }
    }
};
exports.PrismaService = PrismaService;
PrismaService._dbAvailable = false;
PrismaService._lastError = null;
PrismaService._dbUrlPrefix = null;
exports.PrismaService = PrismaService = PrismaService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map