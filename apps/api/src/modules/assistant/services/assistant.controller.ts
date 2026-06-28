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
  Res,
  UseGuards,
  Logger,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ContextAggregatorService } from './context-aggregator.service';
import { FunctionRegistryService, ASSISTANT_FUNCTIONS } from './function-registry.service';
import { AssistantChatService, ChatMessage } from './assistant-chat.service';
import { LanguageRouterService } from './language-router.service';
import { FinancialGlossaryService } from './financial-glossary.service';
import { TranslationCacheService } from './translation-cache.service';
// Phase 5: Intelligence Layer
import { AutoDiagnosisService } from './auto-diagnosis.service';
import { PatternDetectionService } from './pattern-detection.service';
import { DailyBriefService } from './daily-brief.service';
import { RiskAlertService } from './risk-alert.service';
import { IntelligenceCoordinatorService } from './intelligence-coordinator.service';
import { ContextRequest } from '../types/context.types';
// RC-12: Redis for idempotency
import { RedisService } from '../../../common/redis/redis.service';
// A-5: Audit trail للمساعد
import { AuditService } from '../../../audit/audit.service';
// V575: حقن ResponseCleanerService مباشرة للـ diagnostic endpoint
import { ResponseCleanerService } from './response-cleaner.service';

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
    // Phase 5
    private readonly autoDiagnosis: AutoDiagnosisService,
    private readonly patternDetection: PatternDetectionService,
    private readonly dailyBrief: DailyBriefService,
    private readonly riskAlert: RiskAlertService,
    private readonly intelligenceCoordinator: IntelligenceCoordinatorService,
    // RC-12: Redis لـ idempotency
    private readonly redis: RedisService,
    // A-5: Audit trail
    private readonly auditService: AuditService,
    // V575: diagnostic
    private readonly responseCleanerService: ResponseCleanerService,
  ) {
    this.logger.log('🤖 AssistantController initialized — Phase 5 (Intelligence Layer)');
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
    @Headers('idempotency-key') idempotencyKey?: string,
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

    // RC-12: Idempotency check — لو العميل أرسل Idempotency-Key، تحقق من Redis
    // لو نفس key مُعالج الآن أو مُخزّن، ارجع الـ cached response
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.length <= 100) {
      const idemKey = `assistant:idem:${userId}:${idempotencyKey}`;
      try {
        const cached = await this.redis.get(idemKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.logger.log(`🔄 Idempotency HIT — user=${userId} key=${idempotencyKey.slice(0, 12)}...`);
          return { success: parsed.success, data: parsed.data, idempotent: true };
        }
      } catch (e: any) {
        this.logger.warn(`Idempotency check failed: ${e.message}`);
      }
    }

    // RC-6: تحقق من conversationHistory لمنع prompt injection
    // المهاجم يمكنه إرسال role='system' أو role='assistant' بمحتوى خبيث
    let sanitizedHistory: ChatMessage[] | undefined;
    if (body.conversationHistory !== undefined) {
      if (!Array.isArray(body.conversationHistory)) {
        return {
          success: false,
          error: 'conversationHistory must be an array',
        };
      }
      if (body.conversationHistory.length > 20) {
        return {
          success: false,
          error: 'conversationHistory too long (max 20 messages)',
        };
      }
      // فلتر: فقط 'user' و 'assistant' مسموح، وحد حجم كل رسالة
      const ALLOWED_ROLES = new Set(['user', 'assistant']);
      const MAX_MSG_LEN = 2000;
      sanitizedHistory = body.conversationHistory
        .filter((m: any) => m && typeof m === 'object')
        .filter((m: any) => ALLOWED_ROLES.has(m.role))
        .map((m: any) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.slice(0, MAX_MSG_LEN) : '',
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        }))
        .filter((m: ChatMessage) => m.content.length > 0)
        .slice(-5); // آخر 5 فقط (مثل السلوك السابق)
    }

    this.logger.log(
      `💬 Chat — user=${userId} lang=${body.language ?? 'ar'} msg="${body.message.slice(0, 80)}${body.message.length > 80 ? '...' : ''}"`,
    );

    const response = await this.chatService.chat({
      userId,
      message: body.message.trim(),
      language: body.language || 'ar',
      symbol: body.symbol,
      conversationHistory: sanitizedHistory,
      skipContextCache: body.skipContextCache,
    });

    const result = {
      success: response.success,
      data: response,
    };

    // RC-12: خزّن الـ response في Redis لـ 60 ثانية لو أُرسل Idempotency-Key
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.length <= 100) {
      const idemKey = `assistant:idem:${userId}:${idempotencyKey}`;
      try {
        await this.redis.set(idemKey, JSON.stringify(result), 60_000); // 60 ثانية
      } catch (e: any) {
        this.logger.warn(`Idempotency store failed: ${e.message}`);
      }
    }

    // A-5: Audit trail — سجّل كل عملية /chat (لاحتوائها على بيانات حساسة)
    // privacy: لا تسجل أي جزء من content — فقط length + hash (للـ debugging بدون تعريض خصوصية)
    try {
      const messageHash = require('crypto')
        .createHash('sha256')
        .update(body.message)
        .digest('hex')
        .slice(0, 16);
      await this.auditService.log({
        userId,
        action: 'ASSISTANT_CHAT',
        resource: 'assistant',
        details: JSON.stringify({
          messageLength: body.message.length,
          messageHash, // hash فقط (لا محتوى) — للـ debugging والربط بين الطلبات
          language: body.language || 'ar',
          symbol: body.symbol,
          model: response.model,
          functionsCalled: response.functionsCalled,
          processingTimeMs: response.processingTimeMs,
          cached: response.cached,
          dataStale: response.dataStale,
          idempotencyKey: idempotencyKey || undefined,
        }),
        ipAddress: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    } catch (e: any) {
      this.logger.warn(`Audit log failed: ${e.message}`);
    }

    return result;
  }

  /**
   * POST /api/assistant/chat/stream
   * محادثة مع المساعد الذكي عبر Server-Sent Events (SSE)
   *
   * يرجع events متدفقة:
   *   event: context    → { languageTier, rtl, warnings }
   *   event: functions  → { functionsCalled: [...] }
   *   event: chunk      → { chunk: "..." }  (رد متدفّق)
   *   event: done       → { fullReply, model, processingTimeMs, cached }
   *   event: error      → { message }
   *
   * يستخدم chat() داخليًا لكن يبثّ الرد على شكل chunks وهمية
   * (لأن AIOrchestrator لا يدعم streaming بعد — نقطّع الرد النهائي)
   */
  @Post('chat/stream')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chatStream(
    @Req() req: any,
    @Res() res: Response,
    @Body() body: {
      message: string;
      language?: string;
      symbol?: string;
      conversationHistory?: ChatMessage[];
      skipContextCache?: boolean;
    },
  ) {
    const userId: string = req.user.id;

    // RC-7: تتبع اتصال العميل — لو أغلق المتصفح، أوقف المعالجة
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      this.logger.log(`🔌 SSE client disconnected (user=${userId}) — aborting further processing`);
    });
    req.on('aborted', () => {
      clientDisconnected = true;
      this.logger.log(`🔌 SSE client aborted (user=${userId})`);
    });

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disables Nginx buffering
    res.flushHeaders?.();

    // helper لإرسال SSE event (يتحقق من disconnection)
    const sendEvent = (event: string, data: any) => {
      if (clientDisconnected) return; // RC-7: لا ترسل لاتصال ميت
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        this.logger.warn(`SSE write failed: ${e.message}`);
      }
    };

    // heartbeat كل 15s لمنع الـ timeouts
    const heartbeatInterval = setInterval(() => {
      if (clientDisconnected) return; // RC-7
      try {
        res.write(': heartbeat\n\n');
      } catch {
        // ignore
      }
    }, 15000);

    try {
      if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
        sendEvent('error', { message: 'message is required' });
        return res.end();
      }

      if (body.message.length > 2000) {
        sendEvent('error', { message: 'message too long (max 2000 chars)' });
        return res.end();
      }

      // RC-6: نفس تحقق conversationHistory المطبق على /chat
      let sanitizedHistory: ChatMessage[] | undefined;
      if (body.conversationHistory !== undefined) {
        if (!Array.isArray(body.conversationHistory)) {
          sendEvent('error', { message: 'conversationHistory must be an array' });
          return res.end();
        }
        if (body.conversationHistory.length > 20) {
          sendEvent('error', { message: 'conversationHistory too long (max 20 messages)' });
          return res.end();
        }
        const ALLOWED_ROLES = new Set(['user', 'assistant']);
        const MAX_MSG_LEN = 2000;
        sanitizedHistory = body.conversationHistory
          .filter((m: any) => m && typeof m === 'object')
          .filter((m: any) => ALLOWED_ROLES.has(m.role))
          .map((m: any) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content.slice(0, MAX_MSG_LEN) : '',
            timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
          }))
          .filter((m: ChatMessage) => m.content.length > 0)
          .slice(-5);
      }

      this.logger.log(
        `🌊 SSE Chat — user=${userId} lang=${body.language ?? 'ar'} msg="${body.message.slice(0, 60)}..."`,
      );

      // 1. استدعِ chat service (ينفّذ كل المنطق: context + functions + LLM + cache)
      // RC-7: لو العميل أغلق قبل بدء المعالجة، ألغِ
      if (clientDisconnected) {
        this.logger.log(`🔌 Client disconnected before chat() — skipping LLM call (user=${userId})`);
        clearInterval(heartbeatInterval);
        try { res.end(); } catch { /* ignore */ }
        return;
      }

      const response = await this.chatService.chat({
        userId,
        message: body.message.trim(),
        language: body.language || 'ar',
        symbol: body.symbol,
        conversationHistory: sanitizedHistory,
        skipContextCache: body.skipContextCache,
      });

      // RC-7: لو العميل أغلق أثناء chat()، لا ترسل chunks
      if (clientDisconnected) {
        this.logger.log(`🔌 Client disconnected during chat() — skipping chunks (user=${userId}, saved LLM cost already incurred)`);
        clearInterval(heartbeatInterval);
        try { res.end(); } catch { /* ignore */ }
        return;
      }

      // 2. أرسل metadata أولًا
      sendEvent('context', {
        language: response.language,
        languageTier: response.languageTier,
        rtl: response.rtl,
        warnings: response.warnings ?? [],
        experienceLevel: response.experienceLevel,
        cached: response.cached,
        // RC-2: مرر dataStale للعميل
        dataStale: response.dataStale,
        failedBuilders: response.failedBuilders,
      });

      // 3. أرسل قائمة الـ functions التي استُدعيت
      if (response.functionsCalled.length > 0) {
        sendEvent('functions', {
          functionsCalled: response.functionsCalled,
        });
      }

      // 4. بثّ الرد على شكل chunks
      // V464: AIOrchestrator لا يدعم streaming بعد، فنقطّع الرد النهائي
      // إلى chunks صغيرة (3-5 كلمات) لإعطاء إحساس streaming
      const reply = response.reply || '';
      const words = reply.split(/(\s+)/); // يحافظ على whitespace
      const CHUNK_SIZE = 4; // 4 كلمات لكل chunk

      for (let i = 0; i < words.length; i += CHUNK_SIZE) {
        // RC-7: تحقق من disconnection قبل كل chunk
        if (clientDisconnected) {
          this.logger.log(`🔌 Client disconnected mid-stream at chunk ${i} (user=${userId})`);
          break;
        }
        const chunk = words.slice(i, i + CHUNK_SIZE).join('');
        if (chunk) {
          sendEvent('chunk', { chunk });
          // تأخير صغير لإعطاء إحساس streaming (20ms لكل chunk)
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      // 5. أرسل done event (إلا لو العميل أغلق)
      if (!clientDisconnected) {
        sendEvent('done', {
          fullReply: reply,
          model: response.model,
          processingTimeMs: response.processingTimeMs,
          cached: response.cached,
          cacheCategory: response.cacheCategory,
          success: response.success,
          // RC-2
          dataStale: response.dataStale,
        });
      }

      this.logger.log(
        `✅ SSE Chat done — user=${userId} model=${response.model} cached=${response.cached} ${response.processingTimeMs}ms${clientDisconnected ? ' (client disconnected)' : ''}`,
      );
    } catch (error) {
      this.logger.error(`❌ SSE Chat failed: ${error.message}`, error.stack);
      if (!clientDisconnected) {
        sendEvent('error', { message: error.message });
      }
    } finally {
      clearInterval(heartbeatInterval);
      try {
        res.end();
      } catch {
        // ignore
      }
    }
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

  // ─── Phase 5: Intelligence Layer ────────────────────────────

  /**
   * GET /api/assistant/intelligence/overview
   * تقرير شامل يجمع كل ميزات Intelligence Layer (diagnosis + patterns + daily + alerts)
   *
   * Query: days? (diagnosis days, default 30), patternDays? (default 60), language? (default ar)
   */
  @Get('intelligence/overview')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10/min لأنه مكلف
  async getIntelOverview(
    @Req() req: any,
    @Query('days') days?: string,
    @Query('patternDays') patternDays?: string,
    @Query('language') language?: string,
  ) {
    const userId: string = req.user.id;
    const lang = language || 'ar';
    const d = days ? Math.min(Math.max(parseInt(days, 10) || 30, 1), 365) : 30;
    const pd = patternDays ? Math.min(Math.max(parseInt(patternDays, 10) || 60, 1), 365) : 60;

    this.logger.log(`🧠 Intelligence overview — user=${userId}`);
    const overview = await this.intelligenceCoordinator.getOverview(userId, lang, {
      diagnosisDays: d,
      patternDays: pd,
    });
    return { success: true, data: overview };
  }

  /**
   * GET /api/assistant/intelligence/diagnosis
   * تشخيص تلقائي للأداء + كشف أسباب الخسائر
   * Query: days? (default 30)
   */
  @Get('intelligence/diagnosis')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getDiagnosis(
    @Req() req: any,
    @Query('days') days?: string,
    // RC-4: قبول timezone اختياري
    @Query('timezone') timezone?: string,
  ) {
    const userId: string = req.user.id;
    const d = days ? Math.min(Math.max(parseInt(days, 10) || 30, 1), 365) : 30;
    this.logger.log(`🔬 Diagnosis — user=${userId} days=${d} tz=${timezone || 'UTC'}`);
    const report = await this.autoDiagnosis.diagnose(userId, d, timezone);
    return { success: true, data: report };
  }

  /**
   * GET /api/assistant/intelligence/patterns
   * كشف الأنماط في تداول المستخدم (time/symbol/direction/source/consensus/duration/regime)
   * Query: days? (default 60)
   */
  @Get('intelligence/patterns')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getPatterns(
    @Req() req: any,
    @Query('days') days?: string,
    // RC-4: قبول timezone اختياري (IANA name مثل 'Asia/Dubai')
    @Query('timezone') timezone?: string,
  ) {
    const userId: string = req.user.id;
    const d = days ? Math.min(Math.max(parseInt(days, 10) || 60, 1), 365) : 60;
    this.logger.log(`🔍 Patterns — user=${userId} days=${d} tz=${timezone || 'UTC'}`);
    const report = await this.patternDetection.detect(userId, d, timezone);
    return { success: true, data: report };
  }

  /**
   * GET /api/assistant/intelligence/daily-brief
   * ملخص يومي ذكي — يلخّص أمس + حالة اليوم + توصيات
   * Query: language? (default ar)
   */
  @Get('intelligence/daily-brief')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getDailyBrief(
    @Req() req: any,
    @Query('language') language?: string,
  ) {
    const userId: string = req.user.id;
    const lang = language || 'ar';
    this.logger.log(`📅 Daily brief — user=${userId} lang=${lang}`);
    const brief = await this.dailyBrief.generate(userId, lang);
    return { success: true, data: brief };
  }

  /**
   * GET /api/assistant/intelligence/risk-alerts
   * تنبيهات استباقية للمخاطر — 10 أنواع (CRITICAL/HIGH/MEDIUM/LOW)
   * يتحدّث كل 30 ثانية (cached)
   */
  @Get('intelligence/risk-alerts')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getRiskAlerts(@Req() req: any) {
    const userId: string = req.user.id;
    const summary = await this.riskAlert.getAlerts(userId);
    return { success: true, data: summary };
  }

  /**
   * GET /api/assistant/intelligence/risk-alerts/critical
   * فقط التنبيهات الحرجة + العالية (للـ push notifications)
   */
  @Get('intelligence/risk-alerts/critical')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getCriticalAlerts(@Req() req: any) {
    const userId: string = req.user.id;
    const alerts = await this.riskAlert.getCriticalAlerts(userId);
    return { success: true, count: alerts.length, data: alerts };
  }

  /**
   * GET /api/assistant/debug/markdown
   * V575: Endpoint تشخيصي — يحول Markdown إلى HTML ويرجعه
   * يستخدم للتحقق أن markdown-it يعمل على Railway
   */
  @Get('debug/markdown')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async debugMarkdown() {
    const testMarkdown = `## عنوان تجريبي\n\n| الأصل | السعر |\n|---|---|\n| BTC | 95000 |\n\n---\n\nفقرة عادية.\n\n### عنوان فرعي`;
    // استدعاء clean مباشرة من ResponseCleanerService
    let result = '';
    try {
      result = this.responseCleanerService.clean(testMarkdown, 'ar');
    } catch (e: any) {
      result = `ERROR: ${e?.message || e}`;
    }
    return {
      success: true,
      input: testMarkdown,
      output: result,
      isHtml: result.includes('<'),
      hasTable: result.includes('<table>'),
      hasH2: result.includes('<h2>'),
      timestamp: new Date().toISOString(),
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
      version: 'V465-phase5',
      timestamp: new Date().toISOString(),
      features: {
        contextEngine: true,        // Phase 1 ✅
        functionRegistry: true,     // Phase 2 ✅
        chat: true,                 // Phase 2 ✅
        languageRouter: true,       // Phase 3 ✅
        glossary: true,             // Phase 3 ✅
        translationCache: true,     // Phase 3 ✅
        streaming: true,            // Phase 4 ✅
        floatingUI: true,           // Phase 4 ✅
        intelligence: true,         // Phase 5 ✅
        autoDiagnosis: true,        // Phase 5 ✅
        patternDetection: true,     // Phase 5 ✅
        dailyBrief: true,           // Phase 5 ✅
        riskAlerts: true,           // Phase 5 ✅
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
        'POST /api/assistant/chat/stream',
        'GET  /api/assistant/functions',
        'POST /api/assistant/functions/execute',
        'GET  /api/assistant/languages',
        'GET  /api/assistant/languages/:code',
        'GET  /api/assistant/glossary/:language',
        'GET  /api/assistant/cache/stats',
        'POST /api/assistant/cache/invalidate',
        'GET  /api/assistant/intelligence/overview',
        'GET  /api/assistant/intelligence/diagnosis',
        'GET  /api/assistant/intelligence/patterns',
        'GET  /api/assistant/intelligence/daily-brief',
        'GET  /api/assistant/intelligence/risk-alerts',
        'GET  /api/assistant/intelligence/risk-alerts/critical',
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
