import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('portfolio')
@UseGuards(AuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  /**
   * GET /api/portfolio — Get user's portfolios
   */
  @Get()
  async getPortfolios(@Request() req: any) {
    const portfolios = await this.portfolioService.getUserPortfolios(req.user.id);
    return { success: true, data: portfolios };
  }

  /**
   * POST /api/portfolio — Create a new portfolio
   */
  @Post()
  async createPortfolio(
    @Request() req: any,
    @Body() body: { name: string; description?: string; currency?: string },
  ) {
    const portfolio = await this.portfolioService.createPortfolio(req.user.id, body);
    return { success: true, data: portfolio };
  }

  /**
   * POST /api/portfolio/:id/assets — Add asset to portfolio
   */
  @Post(':id/assets')
  async addAsset(
    @Param('id') portfolioId: string,
    @Body() body: {
      symbol: string;
      name: string;
      quantity: number;
      avgPrice: number;
      assetType: string;
      exchange?: string;
    },
  ) {
    const asset = await this.portfolioService.addAsset(portfolioId, body);
    return { success: true, data: asset };
  }
}
