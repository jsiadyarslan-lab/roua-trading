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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MaintenanceController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaintenanceController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const audit_service_1 = require("../../audit/audit.service");
const config_1 = require("@nestjs/config");
let MaintenanceController = MaintenanceController_1 = class MaintenanceController {
    constructor(prisma, audit, config) {
        this.prisma = prisma;
        this.audit = audit;
        this.config = config;
        this.logger = new common_1.Logger(MaintenanceController_1.name);
    }
    async cleanupGuests(adminToken, batchSize = '500', dryRun = 'false', includeUnverified = 'true') {
        const expectedToken = this.config.get('ADMIN_TOKEN') || 'roua-admin-secret-2026';
        if (!adminToken || adminToken !== expectedToken) {
            this.logger.warn(`🚫 Unauthorized cleanup attempt with token: ${adminToken}`);
            throw new common_1.UnauthorizedException('Invalid admin token');
        }
        const limit = parseInt(batchSize, 10) || 500;
        const isDryRun = dryRun === 'true';
        const shouldCleanUnverified = includeUnverified === 'true';
        this.logger.log(`🧹 Starting phantom user cleanup (batchSize: ${limit}, dryRun: ${isDryRun}, includeUnverified: ${shouldCleanUnverified})`);
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - 24);
        const phantomWhere = {
            AND: [
                {
                    OR: [
                        { email: { startsWith: 'guest-' } },
                        { email: { startsWith: 'anon-' } },
                        { email: { startsWith: 'user-' } },
                        { displayName: { startsWith: 'Guest' } },
                    ],
                },
                { email: { not: 'guest@roua.auto' } },
                { updatedAt: { lt: cutoffDate } },
            ],
        };
        let guests = await this.prisma.user.findMany({
            where: phantomWhere,
            take: limit,
            select: { id: true, email: true },
        });
        if (shouldCleanUnverified && guests.length < limit) {
            const unverifiedCutoff = new Date();
            unverifiedCutoff.setDate(unverifiedCutoff.getDate() - 7);
            const unverified = await this.prisma.user.findMany({
                where: {
                    passkeyId: null,
                    accounts: { none: {} },
                    sessions: { every: { isActive: false } },
                    createdAt: { lt: unverifiedCutoff },
                    AND: [
                        { email: { not: { startsWith: 'guest-' } } },
                        { email: { not: { startsWith: 'user-' } } },
                        { email: { not: 'guest@roua.auto' } },
                    ],
                },
                take: limit - guests.length,
                select: { id: true, email: true },
            });
            guests = [...guests, ...unverified];
        }
        if (guests.length === 0) {
            return { success: true, message: 'No phantom users found', count: 0 };
        }
        if (isDryRun) {
            return {
                success: true,
                message: '[DRY RUN] Would delete these phantom users',
                count: guests.length,
                sample: guests.slice(0, 20).map(g => g.email),
            };
        }
        let deletedCount = 0;
        const errors = [];
        for (const guest of guests) {
            try {
                await this.prisma.$transaction([
                    this.prisma.session.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.portfolioAsset.deleteMany({ where: { portfolio: { userId: guest.id } } }),
                    this.prisma.portfolio.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.position.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.trade.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.paperOrder.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.exchangeCredential.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.agentSession.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.agentSettings.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.autonomousTrade.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.signalUsage.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.signal.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.order.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.orderEvent.deleteMany({ where: { order: { userId: guest.id } } }),
                    this.prisma.chartPreference.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.coachAdvice.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.tradingBot.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.apiKey.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.account.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.userNotification.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.alert.deleteMany({ where: { userId: guest.id } }),
                    this.prisma.user.delete({ where: { id: guest.id } }),
                ]);
                deletedCount++;
            }
            catch (err) {
                errors.push(`${guest.email}: ${err.message}`);
            }
        }
        await this.audit.log({
            action: 'SYSTEM_CLEANUP_PHANTOM_USERS',
            resource: 'maintenance',
            details: JSON.stringify({
                deletedCount,
                errorCount: errors.length,
                batchSize: limit,
                includeUnverified: shouldCleanUnverified,
            }),
        });
        this.logger.log(`✅ Phantom user cleanup complete: ${deletedCount} deleted, ${errors.length} errors`);
        return {
            success: true,
            deletedCount,
            errorCount: errors.length,
            errors: errors.slice(0, 10),
        };
    }
};
exports.MaintenanceController = MaintenanceController;
__decorate([
    (0, common_1.Post)('cleanup-guests'),
    __param(0, (0, common_1.Headers)('x-admin-token')),
    __param(1, (0, common_1.Query)('batchSize')),
    __param(2, (0, common_1.Query)('dryRun')),
    __param(3, (0, common_1.Query)('includeUnverified')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], MaintenanceController.prototype, "cleanupGuests", null);
exports.MaintenanceController = MaintenanceController = MaintenanceController_1 = __decorate([
    (0, common_1.Controller)('maintenance'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        config_1.ConfigService])
], MaintenanceController);
//# sourceMappingURL=maintenance.controller.js.map