import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsIntegrationService } from './news-integration.service';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

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
      throw new InternalServerErrorException('فشل في جلب الأخبار');
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
      throw new InternalServerErrorException('فشل في جلب تغذية الأخبار');
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
      throw new InternalServerErrorException('فشل في جلب مشاعر السوق');
    }
  }

  /**
   * POST /api/news/analyze
   * Analyze a news text manually
   * Body: { text: string, symbol?: string }
   *
   * PROTECTED — requires authentication (uses AI resources)
   */
  @Post('analyze')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async analyzeNewsText(@Body() body: { text: string; symbol?: string }) {
    if (!body.text) {
      throw new BadRequestException('النص مطلوب للتحليل');
    }

    try {
      const analysis = await this.newsService.analyzeNewsText(
        body.text,
        body.symbol,
      );
      return { success: true, data: analysis };
    } catch (error: any) {
      this.logger.error(`Failed to analyze news: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في تحليل الخبر');
    }
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
      return { success: true, message: 'تم جلب وتحليل الأخبار بنجاح' };
    } catch (error: any) {
      this.logger.error(`Manual fetch failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في جلب الأخبار');
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
      return { success: true, data: result, message: 'تم تشغيل خط أنابيب الأخبار' };
    } catch (error: any) {
      this.logger.error(`Pipeline trigger failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في تشغيل خط الأنابيب');
    }
  }
}
