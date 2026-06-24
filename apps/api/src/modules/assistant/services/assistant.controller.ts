// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1 endpoints:
//   GET  /api/assistant/context        → يجلب السياق الكامل (للاختبار)
//   POST /api/assistant/context        → يجلب السياق مع خيارات (skipCache, symbol)
//   POST /api/assistant/invalidate     → يلغي cache السياق (داخلي)
//
// Phase 2 (لاحقًا):
//   POST /api/assistant/chat           → محادثة مع المساعد
//   GET  /api/assistant/stream         → SSE streaming
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ContextAggregatorService } from './context-aggregator.service';
import { ContextRequest } from '../types/context.types';

@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  private readonly logger = new Logger(AssistantController.name);

  constructor(
    private readonly contextAggregator: ContextAggregatorService,
  ) {
    this.logger.log('🤖 AssistantController initialized');
  }

  /**
   * GET /api/assistant/context
   * يجلب السياق الكامل للمستخدم — للاختبار والـ debugging
   */
  @Get('context')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getContext(
    @Req() req: any,
    @Query('symbol') symbol?: string,
    @Query('language') language?: string,
    @Query('skipCache') skipCache?: string,
  ) {
    const userId: string = req.user.id;
    const request: ContextRequest = {
      userId,
      symbol: symbol || undefined,
      language: language || 'ar',
      skipCache: skipCache === 'true' || skipCache === '1',
    };

    this.logger.debug(
      `📖 GET context — user=${userId} symbol=${symbol ?? '-'} skipCache=${request.skipCache}`,
    );

    const context = await this.contextAggregator.getContext(request);

    return {
      success: true,
      data: context,
    };
  }

  /**
   * POST /api/assistant/context
   * نفس GET لكن مع body للمرونة
   * Body: { symbol?, language?, skipCache? }
   */
  @Post('context')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async postContext(
    @Req() req: any,
    @Body() body: { symbol?: string; language?: string; skipCache?: boolean },
  ) {
    const userId: string = req.user.id;
    const request: ContextRequest = {
      userId,
      symbol: body.symbol,
      language: body.language || 'ar',
      skipCache: body.skipCache ?? false,
    };

    const context = await this.contextAggregator.getContext(request);

    return {
      success: true,
      data: context,
    };
  }

  /**
   * POST /api/assistant/invalidate
   * يلغي cache السياق — يُستدعى داخليًا بعد الأحداث المهمة (صفقة جديدة، إغلاق، إلخ)
   */
  @Post('invalidate')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async invalidateContext(
    @Req() req: any,
    @Body() body: { symbol?: string },
  ) {
    const userId: string = req.user.id;
    await this.contextAggregator.invalidateContext(userId, body.symbol);

    return {
      success: true,
      message: 'Context cache invalidated',
    };
  }

  /**
   * GET /api/assistant/health
   * فحص صحة الـ Assistant module
   */
  @Get('health')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async health() {
    return {
      success: true,
      status: 'operational',
      module: 'assistant',
      version: 'V458-phase1',
      timestamp: new Date().toISOString(),
      features: {
        contextEngine: true,
        functionRegistry: false, // Phase 2
        languageRouter: false,   // Phase 3
        streaming: false,        // Phase 4
        intelligence: false,     // Phase 5
      },
    };
  }
}
