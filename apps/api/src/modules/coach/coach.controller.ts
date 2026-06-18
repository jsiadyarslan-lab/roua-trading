import { Controller, Get, Post, Body, Query, UseGuards, Logger, Req } from '@nestjs/common';
import { CoachService } from './coach.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

/** V267: 32 supported AI locales (same list as StrategicCouncilController). */
const SUPPORTED_LOCALES = new Set([
  'ar','en','fr','tr','es','zh','ru','hi','pt','de',
  'ja','ko','id','vi','th','it','pl','nl','ms','he',
  'sv','uk','fa','ur','fil','da','no','fi','cs','hu',
  'ro','bn',
]);

function extractLocale(req: any, body?: any): string {
  // 1. Explicit body parameter
  const explicit = body?.language;
  if (typeof explicit === 'string' && SUPPORTED_LOCALES.has(explicit.toLowerCase())) return explicit.toLowerCase();
  // 2. User preference from auth payload
  const userLocale = req?.user?.locale || req?.user?.language;
  if (typeof userLocale === 'string' && SUPPORTED_LOCALES.has(userLocale.toLowerCase())) return userLocale.toLowerCase();
  // 3. Accept-Language header
  const acceptLang = req?.headers?.['accept-language'];
  if (typeof acceptLang === 'string' && acceptLang.length > 0) {
    const primary = acceptLang.split(',')[0].trim().split('-')[0].toLowerCase();
    if (SUPPORTED_LOCALES.has(primary)) return primary;
  }
  // 4. Default
  return 'ar';
}

@Controller('coach')
@UseGuards(AuthGuard)
export class CoachController {
  private readonly logger = new Logger(CoachController.name);

  constructor(private readonly coachService: CoachService) {}

  /**
   * POST /api/coach/performance — Get AI-powered performance advice
   * Body: { language? } — V267: controls AI output locale (default 'ar')
   */
  @Post('performance')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async getPerformanceAdvice(@Req() req: any, @Body() body?: { language?: string }) {
    const userId = req.user.id;
    const language = extractLocale(req, body);
    this.logger.log(`Performance advice request for user ${userId} (language: ${language})`);
    return this.coachService.getPerformanceAdvice(userId, language);
  }

  /**
   * POST /api/coach/ask — Ask the coach a specific question
   * Body: { question, contextAdviceId?, language? } — V267: language controls output locale
   */
  @Post('ask')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async askCoach(
    @Req() req: any,
    @Body() body: { question: string; contextAdviceId?: string; language?: string },
  ) {
    const userId = req.user.id;
    const language = extractLocale(req, body);
    this.logger.log(`Coach question from user ${userId} (language: ${language})`);
    return this.coachService.askCoach(userId, body.question, body.contextAdviceId, language);
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
