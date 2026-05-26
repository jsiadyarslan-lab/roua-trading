import { Controller, Get, Post, Body, Query, UseGuards, Logger, Req } from '@nestjs/common';
import { CoachService } from './coach.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('coach')
@UseGuards(AuthGuard)
export class CoachController {
  private readonly logger = new Logger(CoachController.name);

  constructor(private readonly coachService: CoachService) {}

  /**
   * POST /api/coach/performance — Get AI-powered performance advice
   * Body: { userId }
   */
  @Post('performance')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async getPerformanceAdvice(@Req() req: any) {
    const userId = req.user.id;
    this.logger.log(`Performance advice request for user ${userId}`);
    return this.coachService.getPerformanceAdvice(userId);
  }

  /**
   * POST /api/coach/ask — Ask the coach a specific question
   * Body: { userId, question, contextAdviceId? }
   */
  @Post('ask')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async askCoach(@Req() req: any, @Body() body: { question: string; contextAdviceId?: string; locale?: 'ar' | 'en' | 'es' }) {
    const userId = req.user.id;
    this.logger.log(`Coach question from user ${userId}`);
    return this.coachService.askCoach(userId, body.question, body.contextAdviceId, body.locale || 'ar');
  }

  /**
   * GET /api/coach/history — Get advice history
   * Query: { userId }
   */
  @Get('history')
  async getAdviceHistory(@Req() req: any) {
    const userId = req.user.id;
    return this.coachService.getAdviceHistory(userId);
  }
}
