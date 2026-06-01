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
var PositionReconciliationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionReconciliationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const credentials_service_1 = require("../../portfolio/credentials/credentials.service");
const order_state_manager_service_1 = require("./order-state-manager.service");
let PositionReconciliationService = PositionReconciliationService_1 = class PositionReconciliationService {
    constructor(prisma, credentialsService, stateManager) {
        this.prisma = prisma;
        this.credentialsService = credentialsService;
        this.stateManager = stateManager;
        this.logger = new common_1.Logger(PositionReconciliationService_1.name);
        this.interval = null;
        this.MAX_ATTEMPTS = 5;
        this.INTERVAL_MS = 30_000;
    }
    async onModuleInit() {
        this.interval = setInterval(() => this._processPending(), this.INTERVAL_MS);
        this.logger.log('🔄 Position Reconciliation Service started — checking every 30s');
    }
    async onModuleDestroy() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    async _processPending() {
        if (!this.prisma.isAvailable?.()) {
            return;
        }
        try {
            const pending = await this.prisma.positionReconciliation.findMany({
                where: {
                    status: { in: ['PENDING', 'RETRYING'] },
                    attempts: { lt: this.MAX_ATTEMPTS },
                },
                orderBy: { createdAt: 'asc' },
                take: 20,
            });
            if (pending.length === 0)
                return;
            this.logger.log(`🔄 Processing ${pending.length} pending reconciliation records`);
            for (const record of pending) {
                await this._reconcileRecord(record);
            }
        }
        catch (error) {
            this.logger.error(`🔄 Reconciliation cycle failed: ${error.message}`);
        }
    }
    async _reconcileRecord(record) {
        await this.prisma.positionReconciliation.update({
            where: { id: record.id },
            data: {
                status: 'RETRYING',
                lastAttemptAt: new Date(),
                attempts: { increment: 1 },
            },
        });
        try {
            const filledQuantity = Number(record.filledQuantity);
            const fillPrice = Number(record.fillPrice);
            if (filledQuantity <= 0) {
                await this.prisma.positionReconciliation.update({
                    where: { id: record.id },
                    data: { status: 'RESOLVED', resolvedAt: new Date() },
                });
                return;
            }
            await this.prisma.$transaction(async (tx) => {
                const credential = await tx.exchangeCredential.findUnique({
                    where: { id: record.exchangeCredentialId },
                });
                if (!credential) {
                    throw new Error(`Credential ${record.exchangeCredentialId} not found`);
                }
                if (credential.userId !== record.userId) {
                    throw new Error(`Credential ownership mismatch for user ${record.userId}`);
                }
                const existingPosition = await tx.position.findFirst({
                    where: {
                        userId: record.userId,
                        symbol: record.symbol,
                        status: 'OPEN',
                        side: record.side,
                    },
                });
                if (existingPosition) {
                    const totalQuantity = Number(existingPosition.quantity) + filledQuantity;
                    const avgPrice = (Number(existingPosition.entryPrice) * Number(existingPosition.quantity) +
                        fillPrice * filledQuantity) /
                        totalQuantity;
                    await tx.position.update({
                        where: { id: existingPosition.id },
                        data: {
                            quantity: totalQuantity,
                            entryPrice: avgPrice,
                            stopLoss: record.stopLoss ? Number(record.stopLoss) : undefined,
                            takeProfit: record.takeProfit ? Number(record.takeProfit) : undefined,
                        },
                    });
                }
                else {
                    await tx.position.create({
                        data: {
                            userId: record.userId,
                            credentialId: record.exchangeCredentialId,
                            exchange: credential.exchange,
                            symbol: record.symbol,
                            side: record.side,
                            status: 'OPEN',
                            quantity: filledQuantity,
                            entryPrice: fillPrice,
                            currentPrice: fillPrice,
                            highestPrice: fillPrice,
                            lowestPrice: fillPrice,
                            stopLoss: record.stopLoss ? Number(record.stopLoss) : undefined,
                            takeProfit: record.takeProfit ? Number(record.takeProfit) : undefined,
                            source: 'reconciliation',
                        },
                    });
                }
                await tx.trade.create({
                    data: {
                        userId: record.userId,
                        orderId: record.orderId,
                        exchange: credential.exchange,
                        symbol: record.symbol,
                        side: record.side,
                        type: 'ENTRY',
                        quantity: filledQuantity,
                        price: fillPrice,
                        source: 'reconciliation',
                    },
                });
            }, {
                isolationLevel: 'Serializable',
            });
            await this.prisma.positionReconciliation.update({
                where: { id: record.id },
                data: {
                    status: 'RESOLVED',
                    resolvedAt: new Date(),
                },
            });
            this.logger.log(`🔄 Reconciliation RESOLVED for order ${record.orderId} (attempt ${record.attempts + 1})`);
        }
        catch (error) {
            const newAttempts = record.attempts + 1;
            if (newAttempts >= this.MAX_ATTEMPTS) {
                await this.prisma.positionReconciliation.update({
                    where: { id: record.id },
                    data: {
                        status: 'FAILED',
                        lastError: error.message?.substring(0, 500),
                    },
                });
                this.logger.error(`🔄 Reconciliation FAILED permanently for order ${record.orderId} after ${newAttempts} attempts: ${error.message}`);
            }
            else {
                await this.prisma.positionReconciliation.update({
                    where: { id: record.id },
                    data: {
                        status: 'PENDING',
                        lastError: error.message?.substring(0, 500),
                    },
                });
                this.logger.warn(`🔄 Reconciliation retry ${newAttempts}/${this.MAX_ATTEMPTS} for order ${record.orderId}: ${error.message}`);
            }
        }
    }
};
exports.PositionReconciliationService = PositionReconciliationService;
exports.PositionReconciliationService = PositionReconciliationService = PositionReconciliationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        credentials_service_1.CredentialsService,
        order_state_manager_service_1.OrderStateManagerService])
], PositionReconciliationService);
//# sourceMappingURL=position-reconciliation.service.js.map