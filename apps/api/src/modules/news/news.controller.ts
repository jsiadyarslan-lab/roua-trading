import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
} from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  private readonly logger = new Logger(NewsController.name);

  constructor(private readonly newsService: NewsService) {}

  /**
   * GET /api/news/latest
   * Get latest news with optional filtering
   * Query params: ?symbol=BTC&sentiment=positive&category=Crypto&limit=20
   */
  @Get('latest')
  async getLatestNews(
    @Query('symbol') symbol?: string,
    @Query('sentiment') sentiment?: string,
    @Query('category') category?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr || '20', 10), 100);

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
      return {
        success: false,
        error: 'فشل في جلب الأخبار',
        data: [],
        count: 0,
      };
    }
  }

  /**
   * POST /api/news/analyze
   * Analyze a news text manually
   * Body: { text: string, symbol?: string }
   */
  @Post('analyze')
  async analyzeNewsText(@Body() body: { text: string; symbol?: string }) {
    if (!body.text) {
      return { success: false, error: 'النص مطلوب للتحليل' };
    }

    try {
      const analysis = await this.newsService.analyzeNewsText(
        body.text,
        body.symbol,
      );
      return { success: true, data: analysis };
    } catch (error: any) {
      this.logger.error(`Failed to analyze news: ${error.message}`, error.stack);
      return { success: false, error: 'فشل في تحليل الخبر' };
    }
  }

  /**
   * POST /api/news/fetch
   * Trigger manual news fetch (normally runs on schedule)
   */
  @Post('fetch')
  async triggerFetch() {
    try {
      await this.newsService.fetchAndAnalyzeNews();
      return { success: true, message: 'تم جلب وتحليل الأخبار بنجاح' };
    } catch (error: any) {
      this.logger.error(`Manual fetch failed: ${error.message}`, error.stack);
      return { success: false, error: 'فشل في جلب الأخبار' };
    }
  }
}
