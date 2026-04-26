import { Controller, Get, Post, Body, Query, UseGuards, Logger } from '@nestjs/common';
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
  async getPerformanceAdvice(@Body() body: { userId: string }) {
    this.logger.log(`Performance advice request for user ${body.userId}`);
    return this.coachService.getPerformanceAdvice(body.userId);
  }

  /**
   * POST /api/coach/ask — Ask the coach a specific question
   * Body: { userId, question, contextAdviceId? }
   */
  @Post('ask')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async askCoach(@Body() body: { userId: string; question: string; contextAdviceId?: string }) {
    this.logger.log(`Coach question from user ${body.userId}`);
    return this.coachService.askCoach(body.userId, body.question, body.contextAdviceId);
  }

  /**
   * GET /api/coach/history — Get advice history
   * Query: { userId }
   */
  @Get('history')
  async getAdviceHistory(@Query('userId') userId: string) {
    return this.coachService.getAdviceHistory(userId);
  }
}
