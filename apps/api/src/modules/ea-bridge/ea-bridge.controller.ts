// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — EA Bridge Controller
// نقاط الاتصال بين Expert Advisor (MT5) والكلاود
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// هذه النقاط هي التي يتصل بها EA عبر WebRequest():
//
//   GET  /ea-bridge/briefs          ← استطلاع التوصيات (كل 30 ثانية)
//   POST /ea-bridge/heartbeat       ← نبضة حياة (كل 30 ثانية)
//   POST /ea-bridge/execution       ← تقرير تنفيذ صفقة
//   POST /ea-bridge/positions       ← تحديث المراكز المفتوحة
//   GET  /ea-bridge/config          ← جلب إعدادات EA
//
// المصادقة: X-EA-Token header (رمز فريد لكل مستخدم)
// العزل: كل طلب مرتبط بمستخدم واحد عبر EA Token
//
// لا حاجة للمنفذ الذكي (SmartExecutor) ولا الوكيل (Agent):
//   EA نفسه هو المنفذ — يتلقى التوصيات وينفذها مباشرة على MT5.
//   الكلاود يوفر الذكاء (المجلس الاستراتيجي)، EA يوفر التنفيذ.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Logger,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EABridgeService } from './ea-bridge.service';
import { EABridgeGuard } from './ea-bridge.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import {
  EAHeartbeat,
  EAExecutionReport,
  EAPositionUpdate,
  EABridgeResponse,
  EAConfig,
} from './ea-bridge.types';
import { t } from '../../i18n/i18n.helper';

@Controller('ea-bridge')
export class EABridgeController {
  private readonly logger = new Logger(EABridgeController.name);

  constructor(private readonly eaBridgeService: EABridgeService) {}

  /**
   * POST /ea-bridge/generate-token
   *
   * إنشاء رمز EA جديد
   * طريقتان للمصادقة:
   *   1. من لوحة التحكم: جلسة المستخدم (AuthGuard)
   *   2. من API: مفتاح EA_BRIDGE_SECRET (X-EA-Secret header)
   */
  @UseGuards(AuthGuard)
  @Post('generate-token')
  @HttpCode(HttpStatus.OK)
  async generateToken(
    @Headers('x-ea-secret') secret: string | undefined,
    @Body() body: { userId?: string; label?: string; mt5AccountNumber?: string; mt5Server?: string },
    @Request() req: any,
  ): Promise<EABridgeResponse> {
    // الطريقة 1: مصادقة عبر جلسة المستخدم (من لوحة التحكم)
    let userId = req.user?.id;

    // الطريقة 2: مصادقة عبر المفتاح السري (من API/curl)
    if (!userId && secret) {
      const expectedSecret = process.env.EA_BRIDGE_SECRET || process.env.INTEGRATION_API_KEY;
      if (!expectedSecret || secret !== expectedSecret) {
        this.logger.warn(`EA Bridge: generate-token called with invalid secret`);
        throw new ForbiddenException(t('ea_bridge_controller.key_not_valid', req));
      }
      userId = body?.userId;
    }

    if (!userId || userId.length < 5) {
      throw new BadRequestException(t('ea_bridge_controller.required', req));
    }

    const label = body.label || 'MT5 EA';
    const result = await this.eaBridgeService.generateEAToken(
      userId,
      label,
      body.mt5AccountNumber,
      body.mt5Server,
    );

    return {
      success: true,
      data: result,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * GET /ea-bridge/briefs
   *
   * EA يستدعي هذا كل 30 ثانية للحصول على التوصيات الجديدة.
   * التوصيات تأتي من المجلس الاستراتيجي (AI Council) في الكلاود.
   *
   * المخرجات: قائمة بتوصيات التداول (EABrief[])
   * كل توصية تحتوي على: الزوج، الاتجاه، سعر الدخول، SL، TP، الثقة، الحجم
   */
  @UseGuards(EABridgeGuard)
  @Get('briefs')
  async getBriefs(@Request() req: any): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    return this.eaBridgeService.getPendingBriefs(userId);
  }

  /**
   * POST /ea-bridge/heartbeat
   *
   * EA يرسل نبضة حياة كل 30 ثانية لإعلام الكلاود أنه لا يزال يعمل.
   * تتضمن: رقم الحساب، الرصيد، الأسهم، عدد المراكز المفتوحة
   *
   * الكلاود يستخدم هذا لـ:
   * 1. عرض حالة EA في لوحة التحكم (متصل/غير متصل)
   * 2. مراقبة صحة EA (هل يعمل بشكل طبيعي؟)
   * 3. تعديل إعدادات EA ديناميكياً
   */
  @UseGuards(EABridgeGuard)
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @Body() heartbeat: EAHeartbeat,
    @Request() req: any,
  ): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    return this.eaBridgeService.processHeartbeat(userId, heartbeat);
  }

  /**
   * POST /ea-bridge/execution
   *
   * يُرسل بعد كل تنفيذ صفقة (نجاح أو فشل).
   * EA يُبلغ الكلاود بنتيجة التنفيذ:
   * - إذا نجح: سعر الدخول الفعلي، رقم التذكرة، الانزلاق السعري
   * - إذا فشل: سبب الفشل
   *
   * الكلاود يحدّث قاعدة البيانات بناءً على هذا التقرير.
   */
  @UseGuards(EABridgeGuard)
  @Post('execution')
  @HttpCode(HttpStatus.OK)
  async executionReport(
    @Body() report: EAExecutionReport,
    @Request() req: any,
  ): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    return this.eaBridgeService.processExecutionReport(userId, report);
  }

  /**
   * POST /ea-bridge/positions
   *
   * يُرسل بشكل دوري لمزامنة المراكز المفتوحة مع الكلاود.
   * يسمح للوحة التحكم بعرض المراكز الحقيقية من MT5.
   */
  @UseGuards(EABridgeGuard)
  @Post('positions')
  @HttpCode(HttpStatus.OK)
  async positionUpdate(
    @Body() update: EAPositionUpdate,
    @Request() req: any,
  ): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    return this.eaBridgeService.processPositionUpdate(userId, update);
  }

  /**
   * GET /ea-bridge/config
   *
   * EA يستدعي هذا عند بدء التشغيل لجلب إعداداته.
   * الإعدادات تشمل: فترة الاستطلاع، أقصى انزلاق، نسبة المخاطرة، إلخ
   */
  @UseGuards(EABridgeGuard)
  @Get('config')
  async getConfig(@Request() req: any): Promise<EABridgeResponse<EAConfig>> {
    const userId: string = req.user.id;
    const config = await this.eaBridgeService._getEAConfig(userId);
    return {
      success: true,
      data: config,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * GET /ea-bridge/list-tokens
   *
   * جلب جميع توكنات EA للمستخدم الحالي
   * يستخدم جلسة المستخدم — من لوحة التحكم (لا يحتاج EA Token)
   */
  @UseGuards(AuthGuard)
  @Get('list-tokens')
  async listTokens(@Request() req: any): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    return this.eaBridgeService.listEATokens(userId);
  }

  /**
   * POST /ea-bridge/revoke-token
   *
   * تعطيل/حذف توكن EA
   */
  @UseGuards(AuthGuard)
  @Post('revoke-token')
  @HttpCode(HttpStatus.OK)
  async revokeToken(
    @Body() body: { tokenId: string },
    @Request() req: any,
  ): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    await this.eaBridgeService.revokeEAToken(userId, body.tokenId);
    return {
      success: true,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * GET /ea-bridge/status
   *
   * يُستخدم في لوحة التحكم لعرض حالة EA (متصل/غير متصل)
   */
  @UseGuards(EABridgeGuard)
  @Get('status')
  async getStatus(@Request() req: any): Promise<EABridgeResponse> {
    const userId: string = req.user.id;
    const status = await this.eaBridgeService.getEAStatus(userId);
    return {
      success: true,
      data: status,
      serverTime: new Date().toISOString(),
    };
  }
}
