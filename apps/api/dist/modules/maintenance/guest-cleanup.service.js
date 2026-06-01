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
var GuestCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuestCleanupService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../common/prisma/prisma.service");
let GuestCleanupService = GuestCleanupService_1 = class GuestCleanupService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GuestCleanupService_1.name);
    }
    async cleanupExpiredGuests() {
        try {
            if (!this.prisma.isAvailable()) {
                this.logger.debug('DB unavailable — skipping guest cleanup');
                return;
            }
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - 4);
            const expiredGuests = await this.prisma.user.findMany({
                where: {
                    AND: [
                        { email: { startsWith: 'guest-' } },
                        { email: { endsWith: '@roua.auto' } },
                    ],
                    createdAt: { lt: cutoffDate },
                    sessions: {
                        every: {
                            OR: [
                                { isActive: false },
                                { expiresAt: { lt: new Date() } },
                            ],
                        },
                    },
                },
                take: 200,
                select: { id: true, email: true },
            });
            if (expiredGuests.length === 0) {
                this.logger.debug('No expired guest users to clean up');
                return;
            }
            this.logger.log(`🧹 Cleaning up ${expiredGuests.length} expired guest users`);
            let deletedCount = 0;
            for (const guest of expiredGuests) {
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
                        this.prisma.setting.deleteMany({ where: { key: { startsWith: `user:${guest.id}:` } } }),
                        this.prisma.user.delete({ where: { id: guest.id } }),
                    ]);
                    deletedCount++;
                }
                catch (err) {
                    this.logger.debug(`Failed to delete guest ${guest.email}: ${err.message?.substring(0, 100)}`);
                }
            }
            this.logger.log(`🧹 Guest cleanup complete: ${deletedCount}/${expiredGuests.length} deleted`);
        }
        catch (error) {
            this.logger.warn(`Guest cleanup failed: ${error.message}`);
        }
    }
};
exports.GuestCleanupService = GuestCleanupService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_6_HOURS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GuestCleanupService.prototype, "cleanupExpiredGuests", null);
exports.GuestCleanupService = GuestCleanupService = GuestCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GuestCleanupService);
//# sourceMappingURL=guest-cleanup.service.js.map