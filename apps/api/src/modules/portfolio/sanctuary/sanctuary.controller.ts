import { Controller, Get, UseGuards, Request, Logger } from '@nestjs/common';
import { SanctuaryService } from './sanctuary.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('portfolio/sanctuary')
@UseGuards(AuthGuard)
export class SanctuaryController {
  private readonly logger = new Logger(SanctuaryController.name);

  constructor(private readonly sanctuaryService: SanctuaryService) {}

  /**
   * GET /api/portfolio/sanctuary — Get portfolio risk analysis
   * Rate limited: 5 analyses per minute
   */
  @Get()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async analyzePortfolio(@Request() req: any) {
    this.logger.debug(`Portfolio analysis request (user: ${req.user.id})`);

    const report = await this.sanctuaryService.analyzePortfolio(req.user.id);
    return { success: true, data: report };
  }
}
