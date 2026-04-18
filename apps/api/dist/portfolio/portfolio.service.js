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
var PortfolioService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/prisma/prisma.service");
let PortfolioService = PortfolioService_1 = class PortfolioService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PortfolioService_1.name);
        this.logger.log('💼 Portfolio Module initialized (shell — full implementation in Phase 3)');
    }
    async getUserPortfolios(userId) {
        return this.prisma.portfolio.findMany({
            where: { userId },
            include: { assets: true },
        });
    }
    async createPortfolio(userId, data) {
        return this.prisma.portfolio.create({
            data: {
                userId,
                name: data.name,
                description: data.description,
                currency: data.currency || 'USD',
            },
        });
    }
    async addAsset(portfolioId, data) {
        return this.prisma.portfolioAsset.create({
            data: {
                portfolioId,
                symbol: data.symbol,
                name: data.name,
                quantity: data.quantity,
                avgPrice: data.avgPrice,
                assetType: data.assetType,
                exchange: data.exchange,
            },
        });
    }
};
exports.PortfolioService = PortfolioService;
exports.PortfolioService = PortfolioService = PortfolioService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PortfolioService);
//# sourceMappingURL=portfolio.service.js.map