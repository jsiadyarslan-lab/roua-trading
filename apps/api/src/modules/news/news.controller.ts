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
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('news')
@UseGuards(AuthGuard)
export class NewsController {
  private readonly logger = new Logger(NewsController.name);

  constructor(private readonly newsService: NewsService) {}

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
}
