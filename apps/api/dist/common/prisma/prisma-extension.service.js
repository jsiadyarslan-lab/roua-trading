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
var PrismaExtensionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaExtensionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
let PrismaExtensionService = PrismaExtensionService_1 = class PrismaExtensionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PrismaExtensionService_1.name);
        this.USER_SCOPED_MODELS = new Set([
            'Order',
            'Portfolio',
            'Signal',
            'SignalUsage',
            'ExchangeCredential',
            'Position',
            'Trade',
            'PaperOrder',
            'AutonomousTrade',
            'AgentSession',
            'AgentSettings',
            'CoachAdvice',
            'UserNotification',
            'Alert',
            'ApiKey',
            'Account',
            'Session',
            'Subscription',
            'ChartPreference',
            'PositionReconciliation',
        ]);
        this.READ_OPERATIONS = new Set([
            'findUnique',
            'findFirst',
            'findMany',
            'count',
            'aggregate',
            'groupBy',
        ]);
        this.logger.log('🔒 PrismaExtensionService initialized — user isolation extensions ready');
    }
    createScopedClient(userId) {
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            this.logger.error(`🚨 SECURITY: createScopedClient called with invalid userId="${userId}" — ` +
                `returning empty-result client to prevent data leakage`);
            return this._createEmptyResultClient();
        }
        const userScopedModels = this.USER_SCOPED_MODELS;
        const readOps = this.READ_OPERATIONS;
        const scopedUserId = userId;
        return this.prisma.$extends({
            name: 'user-isolation',
            query: {
                $allModels: {
                    async $allOperations({ model, operation, args, query }) {
                        const typedArgs = args;
                        if (readOps.has(operation) && userScopedModels.has(model)) {
                            if (!typedArgs.where) {
                                typedArgs.where = {};
                            }
                            if (typedArgs.where.userId === undefined) {
                                typedArgs.where = { ...typedArgs.where, userId: scopedUserId };
                            }
                        }
                        if (operation === 'create' && userScopedModels.has(model)) {
                            if (typedArgs.data && typedArgs.data.userId === undefined) {
                                typedArgs.data = { ...typedArgs.data, userId: scopedUserId };
                            }
                        }
                        if ((operation === 'update' || operation === 'updateMany' ||
                            operation === 'delete' || operation === 'deleteMany') &&
                            userScopedModels.has(model)) {
                            if (!typedArgs.where) {
                                typedArgs.where = {};
                            }
                            if (typedArgs.where.userId === undefined) {
                                typedArgs.where = { ...typedArgs.where, userId: scopedUserId };
                            }
                        }
                        return query(typedArgs);
                    },
                },
            },
        });
    }
    _createEmptyResultClient() {
        return this.prisma.$extends({
            name: 'empty-result-safety',
            query: {
                $allModels: {
                    async $allOperations({ operation, args, query }) {
                        if (operation === 'findMany' || operation === 'findFirst') {
                            return [];
                        }
                        if (operation === 'findUnique') {
                            return null;
                        }
                        if (operation === 'count') {
                            return 0;
                        }
                        if (operation === 'aggregate') {
                            return { _sum: {}, _avg: {}, _min: {}, _max: {}, _count: {} };
                        }
                        if (operation === 'groupBy') {
                            return [];
                        }
                        if (['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
                            throw new Error('SECURITY: Cannot perform write operations with invalid userId');
                        }
                        return query(args);
                    },
                },
            },
        });
    }
};
exports.PrismaExtensionService = PrismaExtensionService;
exports.PrismaExtensionService = PrismaExtensionService = PrismaExtensionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PrismaExtensionService);
//# sourceMappingURL=prisma-extension.service.js.map