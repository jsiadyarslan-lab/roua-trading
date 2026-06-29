import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsIntegrationService } from './news-integration.service';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { t } from '../../i18n/i18n.helper';

@Controller('news')
@UseGuards(AuthGuard)
export class NewsController {
  private readonly logger = new Logger(NewsController.name);

  constructor(
    private readonly newsService: NewsService,
    private readonly newsIntegration: NewsIntegrationService,
  ) {}

  /**
   * GET /api/news/latest
   * Get latest news with optional filtering
   * Query params: ?symbol=BTC&sentiment=positive&category=Crypto&limit=20
   *
   * PUBLIC endpoint — no auth required.
   * News is read-only and should be accessible without authentication
   * so that the dashboard news ticker and feed can work for all users.
   */
  @Public()
  @Get('latest')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getLatestNews(
    @Query('symbol') symbol?: string,
    @Query('sentiment') sentiment?: string,
    @Query('category') category?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr || '20', 10) || 20, 100);

    try {
      const news = await this.newsService.getLatestNews({
        symbol,
        sentiment,
        category,
        limit,
      });

      return { success: true, data: news, count: news.length };
    } catch (error: any) {
      this.logger.error(`Failed to fetch news: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('news_controller.failure'));
    }
  }

  /**
   * GET /api/news/feed
   * V146: Alias for /api/news/latest — the frontend's NewsTicker.tsx
   * and NewsMarkers.tsx components fetch from /api/news/feed,
   * which previously didn't exist (404). This endpoint provides
   * the same functionality as /api/news/latest with sensible defaults.
   *
   * PUBLIC endpoint — no auth required.
   */
  @Public()
  @Get('feed')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getNewsFeed(
    @Query('symbol') symbol?: string,
    @Query('sentiment') sentiment?: string,
    @Query('category') category?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr || '20', 10) || 20, 50);

    try {
      const news = await this.newsService.getLatestNews({
        symbol,
        sentiment,
        category,
        limit,
      });

      return { success: true, data: news, count: news.length };
    } catch (error: any) {
      this.logger.error(`Failed to fetch news feed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('news_controller.failure_2'));
    }
  }

  /**
   * GET /api/news/sentiment
   * V145: Get market sentiment from rouatradingnews (Fear & Greed, Arab sentiment, geopolitical risk).
   * This data is fetched periodically by NewsIntegrationService and cached in Redis.
   *
   * PUBLIC endpoint — useful for dashboard widgets.
   */
  @Public()
  @Get('sentiment')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getMarketSentiment() {
    try {
      const sentiment = await this.newsIntegration.getMarketSentiment();
      return { success: true, data: sentiment };
    } catch (error: any) {
      this.logger.error(`Failed to fetch market sentiment: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('news_controller.failure_market'));
    }
  }

  /**
   * POST /api/news/analyze
   * Analyze a news text manually
   * Body: { text: string, symbol?: string, language?: string }
   *
   * V267: `language` parameter controls the AI output locale.
   * Defaults to 'ar' for backward compat. Accepts any of the 32 UI locales.
   *
   * PROTECTED — requires authentication (uses AI resources)
   */
  @Post('analyze')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async analyzeNewsText(
    @Body() body: { text: string; symbol?: string; language?: string },
    @Req() req?: any,
  ) {
    if (!body.text) {
      throw new BadRequestException(t('news_controller.required'));
    }

    // V267: Resolve language from body > user > Accept-Language > 'ar'
    const language = body.language
      || req?.user?.locale
      || req?.user?.language
      || this._extractLocaleFromHeader(req)
      || 'ar';

    try {
      const analysis = await this.newsService.analyzeNewsText(
        body.text,
        body.symbol,
        language,
      );
      return { success: true, data: analysis, language };
    } catch (error: any) {
      this.logger.error(`Failed to analyze news: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('news_controller.failure_3'));
    }
  }

  /** V267: Extract locale from Accept-Language header (best-effort). */
  private _extractLocaleFromHeader(req: any): string | null {
    const acceptLang = req?.headers?.['accept-language'];
    if (typeof acceptLang !== 'string' || acceptLang.length === 0) return null;
    const primary = acceptLang.split(',')[0].trim().split('-')[0].toLowerCase();
    const SUPPORTED = new Set([
      'ar','en','fr','tr','es','zh','ru','hi','pt','de',
      'ja','ko','id','vi','th','it','pl','nl','ms','he',
      'sv','uk','fa','ur','fil','da','no','fi','cs','hu',
      'ro','bn',
    ]);
    return SUPPORTED.has(primary) ? primary : null;
  }

  /**
   * POST /api/news/fetch
   * Trigger manual news fetch (normally runs on schedule)
   *
   * PROTECTED — requires authentication (triggers resource-intensive operation)
   */
  @Post('fetch')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async triggerFetch() {
    try {
      await this.newsService.fetchAndAnalyzeNews();
      return { success: true, message: t('news_controller.done') };
    } catch (error: any) {
      this.logger.error(`Manual fetch failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('news_controller.failure'));
    }
  }

  /**
   * POST /api/news/pipeline
   * V145: Trigger the news generation pipeline on the external rouatradingnews site.
   * This causes the external site to generate new analyzed articles.
   *
   * PROTECTED — requires authentication (triggers external pipeline)
   */
  @Post('pipeline')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async triggerPipeline(@Body() body?: { maxItems?: number }) {
    try {
      const result = await this.newsIntegration.triggerNewsPipeline(body?.maxItems || 15);
      return { success: true, data: result, message: t('news_controller.done_2') };
    } catch (error: any) {
      this.logger.error(`Pipeline trigger failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('news_controller.failure_4'));
    }
  }
}
