import { PortfolioService } from './portfolio.service';
export declare class PortfolioController {
    private readonly portfolioService;
    constructor(portfolioService: PortfolioService);
    getPortfolios(req: any): Promise<{
        success: boolean;
        data: ({
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
        })[];
    }>;
    createPortfolio(req: any, body: {
        name: string;
        description?: string;
        currency?: string;
    }): Promise<{
        success: boolean;
        data: {
            id: string;
            userId: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            description: string | null;
            totalValue: number;
            currency: string;
        };
    }>;
    addAsset(portfolioId: string, body: {
        symbol: string;
        name: string;
        quantity: number;
        avgPrice: number;
        assetType: string;
        exchange?: string;
    }): Promise<{
        success: boolean;
        data: {
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
        };
    }>;
}
