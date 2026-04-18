import { PrismaService } from '../common/prisma/prisma.service';
export declare class PortfolioService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getUserPortfolios(userId: string): Promise<({
        assets: {
            symbol: string;
            id: string;
            name: string;
            exchange: string | null;
            quantity: number;
            avgPrice: number;
            currentPrice: number | null;
            assetType: import("@prisma/client").$Enums.AssetType;
            addedAt: Date;
            portfolioId: string;
        }[];
    } & {
        id: string;
        userId: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        totalValue: number;
        currency: string;
    })[]>;
    createPortfolio(userId: string, data: {
        name: string;
        description?: string;
        currency?: string;
    }): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        totalValue: number;
        currency: string;
    }>;
    addAsset(portfolioId: string, data: {
        symbol: string;
        name: string;
        quantity: number;
        avgPrice: number;
        assetType: string;
        exchange?: string;
    }): Promise<{
        symbol: string;
        id: string;
        name: string;
        exchange: string | null;
        quantity: number;
        avgPrice: number;
        currentPrice: number | null;
        assetType: import("@prisma/client").$Enums.AssetType;
        addedAt: Date;
        portfolioId: string;
    }>;
}
