// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1 endpoints:
//   GET  /api/assistant/health        → فحص الصحة
//   GET  /api/assistant/context        → يجلب السياق الكامل
//   POST /api/assistant/context        → نفسه مع خيارات
//   POST /api/assistant/invalidate     → يلغي cache السياق
//
// Phase 2 endpoints:
//   POST /api/assistant/chat           → محادثة مع المساعد الذكي
//   GET  /api/assistant/functions      → قائمة الـ functions المتاحة
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
import { FunctionRegistryService, ASSISTANT_FUNCTIONS } from './function-registry.service';
import { AssistantChatService, ChatMessage } from './assistant-chat.service';
import { LanguageRouterService } from './language-router.service';
import { FinancialGlossaryService } from './financial-glossary.service';
import { TranslationCacheService } from './translation-cache.service';
import { ContextRequest } from '../types/context.types';

@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  private readonly logger = new Logger(AssistantController.name);

  constructor(
    private readonly contextAggregator: ContextAggregatorService,
    private readonly functionRegistry: FunctionRegistryService,
    private readonly chatService: AssistantChatService,
    private readonly languageRouter: LanguageRouterService,
    private readonly glossary: FinancialGlossaryService,
    private readonly translationCache: TranslationCacheService,
  ) {
    this.logger.log('🤖 AssistantController initialized — Phase 3 (Language Router + Glossary + Cache)');
  }

  // ─── Phase 1: Context Engine ────────────────────────────────

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
   * يلغي cache السياق
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

  // ─── Phase 2: Chat + Functions ──────────────────────────────

  /**
   * POST /api/assistant/chat
   * محادثة مع المساعد الذكي
   *
   * Body:
   *   message: string           — سؤال المستخدم
   *   language?: string         — اللغة المفضلة (ar/en/fr/...)
   *   symbol?: string           — رمز محدد للسياق
   *   conversationHistory?: ChatMessage[]  — تاريخ المحادثة (optional)
   *   skipContextCache?: boolean — تخطّي cache السياق
   */
  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 رسالة/دقيقة لكل مستخدم
  async chat(
    @Req() req: any,
    @Body() body: {
      message: string;
      language?: string;
      symbol?: string;
      conversationHistory?: ChatMessage[];
      skipContextCache?: boolean;
    },
  ) {
    const userId: string = req.user.id;

    if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      return {
        success: false,
        error: 'message is required and must be a non-empty string',
      };
    }

    if (body.message.length > 2000) {
      return {
        success: false,
        error: 'message too long (max 2000 characters)',
      };
    }

    this.logger.log(
      `💬 Chat — user=${userId} lang=${body.language ?? 'ar'} msg="${body.message.slice(0, 80)}${body.message.length > 80 ? '...' : ''}"`,
    );

    const response = await this.chatService.chat({
      userId,
      message: body.message.trim(),
      language: body.language || 'ar',
      symbol: body.symbol,
      conversationHistory: body.conversationHistory,
      skipContextCache: body.skipContextCache,
    });

    return {
      success: response.success,
      data: response,
    };
  }

  /**
   * GET /api/assistant/functions
   * قائمة الـ functions المتاحة للمساعد (للاختبار والـ documentation)
   */
  @Get('functions')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getFunctions() {
    return {
      success: true,
      count: ASSISTANT_FUNCTIONS.length,
      functions: ASSISTANT_FUNCTIONS,
    };
  }

  /**
   * POST /api/assistant/functions/execute
   * ينفّذ function محددة يدويًا (للاختبار)
   *
   * Body:
   *   name: string            — اسم الـ function
   *   arguments?: Record<string, any>  — وسائط الـ function
   */
  @Post('functions/execute')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async executeFunction(
    @Req() req: any,
    @Body() body: { name: string; arguments?: Record<string, any> },
  ) {
    const userId: string = req.user.id;

    if (!body.name) {
      return {
        success: false,
        error: 'name is required',
      };
    }

    // تحقق أن الـ function موجودة
    const validFunction = ASSISTANT_FUNCTIONS.find((f) => f.name === body.name);
    if (!validFunction) {
      return {
        success: false,
        error: `Unknown function: ${body.name}`,
        availableFunctions: ASSISTANT_FUNCTIONS.map((f) => f.name),
      };
    }

    const result = await this.functionRegistry.executeFunction(
      body.name,
      body.arguments || {},
      userId,
    );

    return {
      success: result.success,
      data: result,
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
      version: 'V463-phase3',
      timestamp: new Date().toISOString(),
      features: {
        contextEngine: true,        // Phase 1 ✅
        functionRegistry: true,     // Phase 2 ✅
        chat: true,                 // Phase 2 ✅
        languageRouter: true,       // Phase 3 ✅
        glossary: true,             // Phase 3 ✅
        translationCache: true,     // Phase 3 ✅
        streaming: false,           // Phase 4
        intelligence: false,        // Phase 5
      },
      functionsCount: ASSISTANT_FUNCTIONS.length,
      languages: this.languageRouter.getCoverageStats(),
      glossary: this.glossary.getStats(),
      endpoints: [
        'GET  /api/assistant/health',
        'GET  /api/assistant/context',
        'POST /api/assistant/context',
        'POST /api/assistant/invalidate',
        'POST /api/assistant/chat',
        'GET  /api/assistant/functions',
        'POST /api/assistant/functions/execute',
        'GET  /api/assistant/languages',
        'GET  /api/assistant/languages/:code',
        'GET  /api/assistant/glossary/:language',
        'GET  /api/assistant/cache/stats',
        'POST /api/assistant/cache/invalidate',
      ],
    };
  }

  // ─── Phase 3: Language + Glossary + Cache ────────────────────

  /**
   * GET /api/assistant/languages
   * قائمة كل اللغات المدعومة (32 لغة) مع Tier و RTL
   */
  @Get('languages')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getLanguages() {
    return {
      success: true,
      coverage: this.languageRouter.getCoverageStats(),
      languages: this.languageRouter.getAllLanguages(),
    };
  }

  /**
   * GET /api/assistant/languages/:code
   * تفاصيل لغة محددة
   */
  @Get('languages/:code')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getLanguage(@Query('code') code: string) {
    if (!code) {
      return { success: false, error: 'code query parameter is required' };
    }
    const profile = this.languageRouter.getProfile(code);
    return {
      success: true,
      profile,
      hasGlossary: this.glossary.hasGlossary(code),
    };
  }

  /**
   * GET /api/assistant/glossary/:language
   * القاموس المالي للغة محددة
   */
  @Get('glossary/:language')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getGlossary(@Query('language') language: string) {
    if (!language) {
      return { success: false, error: 'language query parameter is required' };
    }
    const glossary = this.glossary.getGlossary(language);
    if (!glossary) {
      return {
        success: false,
        error: `No glossary available for language: ${language}`,
        availableLanguages: Object.keys(this.glossary.getStats().languages),
      };
    }
    return {
      success: true,
      language,
      termCount: Object.keys(glossary).length,
      glossary,
    };
  }

  /**
   * GET /api/assistant/cache/stats
   * إحصائيات الـ translation cache
   */
  @Get('cache/stats')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getCacheStats() {
    return {
      success: true,
      stats: this.translationCache.getStats(),
      ttlStrategy: this.translationCache.getTtlStrategy(),
    };
  }

  /**
   * POST /api/assistant/cache/invalidate
   * يلغي كل cache لمستخدم محدد
   */
  @Post('cache/invalidate')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async invalidateCache(@Req() req: any) {
    const userId: string = req.user.id;
    const count = await this.translationCache.invalidateUser(userId);
    return {
      success: true,
      invalidatedCount: count,
      message: `Invalidated ${count} cache entries for user ${userId}`,
    };
  }
}
