import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('💼 Portfolio Module initialized (shell — full implementation in Phase 3)');
  }

  /**
   * Get user's portfolios
   */
  async getUserPortfolios(userId: string) {
    return this.prisma.portfolio.findMany({
      where: { userId },
      include: { assets: true },
    });
  }

  /**
   * Create a new portfolio
   */
  async createPortfolio(userId: string, data: { name: string; description?: string; currency?: string }) {
    return this.prisma.portfolio.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        currency: data.currency || 'USD',
      },
    });
  }

  /**
   * Add asset to portfolio
   */
  async addAsset(portfolioId: string, data: {
    symbol: string;
    name: string;
    quantity: number;
    avgPrice: number;
    assetType: string;
    exchange?: string;
  }) {
    return this.prisma.portfolioAsset.create({
      data: {
        portfolioId,
        symbol: data.symbol,
        name: data.name,
        quantity: data.quantity,
        avgPrice: data.avgPrice,
        assetType: data.assetType as any,
        exchange: data.exchange,
      },
    });
  }
}
