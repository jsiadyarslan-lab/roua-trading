// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Agent Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ContentAgentService } from './content-agent.service';
import {
  GenerateContentDto,
  UpdateContentDto,
  BulkGenerateDto,
  GetContentFeedDto,
  ScheduleContentDto,
  ContentCategory,
  ContentType,
  ContentStatus,
} from './types/content.types';

/**
 * Content Agent API
 *
 * Endpoints:
 * - POST   /api/agent/content/generate       → توليد محتوى جديد
 * - POST   /api/agent/content/bulk-generate   → توليد مجمّع
 * - POST   /api/agent/content/breaking        → تنبيه عاجل
 * - GET    /api/agent/content/feed            → عرض المحتوى
 * - GET    /api/agent/content/stats           → إحصائيات
 * - GET    /api/agent/content/trending        → المواضيع الرائجة
 * - GET    /api/agent/content/gaps            → فجوات المحتوى
 * - GET    /api/agent/content/:id             → محتوى واحد
 * - POST   /api/agent/content/:id/publish     → نشر المحتوى
 * - POST   /api/agent/content/:id/schedule    → جدولة النشر
 * - PUT    /api/agent/content/:id             → تحديث المحتوى
 * - DELETE /api/agent/content/:id             → أرشفة المحتوى
 * - GET    /api/agent/content/state           → حالة الوكيل
 */
@Controller('agent/content')
@UseGuards(AuthGuard)
export class ContentAgentController {
  constructor(private readonly contentAgent: ContentAgentService) {}

  /**
   * POST /api/agent/content/generate
   * Generate new content using the AI pipeline
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateContent(@Req() req: any, @Body() dto: GenerateContentDto) {
    const result = await this.contentAgent.generateContent(req.user.id, dto);

    return {
      success: true,
      data: {
        article: result.article,
        qualityScore: result.content.qualityScore,
        optimization: result.optimization,
      },
      message: `تم توليد المحتوى بنجاح — الجودة: ${result.content.qualityScore}%`,
    };
  }

  /**
   * POST /api/agent/content/bulk-generate
   * Bulk generate content for multiple topics
   */
  @Post('bulk-generate')
  @HttpCode(HttpStatus.OK)
  async bulkGenerate(@Req() req: any, @Body() dto: BulkGenerateDto) {
    const result = await this.contentAgent.bulkGenerate(req.user.id, dto);

    const successCount = result.results.filter(r => r.success).length;

    return {
      success: true,
      data: result.results,
      message: `تم توليد ${successCount}/${result.results.length} محتوى بنجاح`,
    };
  }

  /**
   * POST /api/agent/content/breaking
   * Generate a breaking news alert
   */
  @Post('breaking')
  @HttpCode(HttpStatus.OK)
  async generateBreakingAlert(
    @Req() req: any,
    @Body() body: { topic: string; symbols: string[]; context: string },
  ) {
    const result = await this.contentAgent.generateBreakingAlert(
      req.user.id,
      body.topic,
      body.symbols || [],
      body.context || '',
    );

    return {
      success: true,
      data: result.article,
      message: 'تم نشر التنبيه العاجل',
    };
  }

  /**
   * GET /api/agent/content/feed
   * Get content feed with filtering and pagination
   */
  @Get('feed')
  async getFeed(@Query() query: GetContentFeedDto) {
    const result = await this.contentAgent.getContentFeed(query);

    return {
      success: true,
      data: result,
    };
  }

  /**
   * GET /api/agent/content/stats
   * Get content statistics
   */
  @Get('stats')
  async getStats() {
    const stats = await this.contentAgent.getStats();

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * GET /api/agent/content/trending
   * Get trending topics
   */
  @Get('trending')
  async getTrending() {
    const topics = await this.contentAgent.curator.getTrendingTopics();

    return {
      success: true,
      data: topics,
    };
  }

  /**
   * GET /api/agent/content/gaps
   * Get content gaps — categories needing fresh content
   */
  @Get('gaps')
  async getGaps() {
    const gaps = await this.contentAgent.curator.getContentGaps();

    return {
      success: true,
      data: gaps,
    };
  }

  /**
   * GET /api/agent/content/state
   * Get agent state
   */
  @Get('state')
  async getState() {
    const state = await this.contentAgent.getState();

    return {
      success: true,
      data: state,
    };
  }

  /**
   * GET /api/agent/content/:id
   * Get single content article
   */
  @Get(':id')
  async getById(@Param('id') id: string) {
    const article = await this.contentAgent.getContentById(id);

    return {
      success: true,
      data: article,
    };
  }

  /**
   * POST /api/agent/content/:id/publish
   * Publish a draft article
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Req() req: any, @Param('id') id: string) {
    const result = await this.contentAgent.publishContent(req.user.id, id);

    return {
      success: true,
      data: result,
      message: 'تم نشر المحتوى بنجاح',
    };
  }

  /**
   * POST /api/agent/content/:id/schedule
   * Schedule content for future publication
   */
  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  async schedule(@Req() req: any, @Param('id') id: string, @Body() dto: ScheduleContentDto) {
    dto.contentId = id;
    const result = await this.contentAgent.scheduleContent(req.user.id, dto);

    return {
      success: true,
      data: result,
      message: `تم جدولة المحتوى للنشر في ${dto.scheduledAt}`,
    };
  }

  /**
   * PUT /api/agent/content/:id
   * Update content
   */
  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateContentDto) {
    const result = await this.contentAgent.updateContent(req.user.id, id, dto);

    return {
      success: true,
      data: result,
      message: 'تم تحديث المحتوى',
    };
  }

  /**
   * DELETE /api/agent/content/:id
   * Archive content
   */
  @Delete(':id')
  async archive(@Req() req: any, @Param('id') id: string) {
    const result = await this.contentAgent.unpublishContent(req.user.id, id, true);

    return {
      success: true,
      data: result,
      message: 'تم أرشفة المحتوى',
    };
  }
}
