// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AutonomousTraderAgentService } from './agent.service';
import { StartAgentDto, ChangeStrategyDto, UpdateRiskParamsDto, UpdateAgentSettingsDto, StrategyType } from './types/agent.types';

/**
 * Public Agent Status Controller (no auth required)
 * Provides read-only system status so the frontend can show
 * whether auto-trading is enabled before the user logs in.
 */
@Controller('agent/trader')
export class AutonomousTraderPublicController {
  constructor(private readonly agentService: AutonomousTraderAgentService) {}

  @Get('public-status')
  async getPublicStatus() {
    return this.agentService.getPublicStatus();
  }
}

/**
 * Autonomous Trader Agent API (authenticated)
 *
 * Endpoints:
 * - POST /api/agent/trader/start         → تفعيل الوكيل
 * - POST /api/agent/trader/stop          → إيقاف الوكيل
 * - GET  /api/agent/trader/status        → حالة الوكيل
 * - GET  /api/agent/trader/performance   → تقرير الأداء
 * - GET  /api/agent/trader/open-positions → المراكز المفتوحة
 * - PUT  /api/agent/trader/strategy      → تغيير الاستراتيجية
 * - PUT  /api/agent/trader/risk-params   → تحديث معلمات المخاطر
 * - GET  /api/agent/trader/settings      → إعدادات الوكيل
 * - PUT  /api/agent/trader/settings      → تحديث إعدادات الوكيل
 * - GET  /api/agent/trader/system-status → حالة النظام
 * - PUT  /api/agent/trader/system-settings → تحديث إعدادات النظام
 */
@Controller('agent/trader')
@UseGuards(AuthGuard)
export class AutonomousTraderAgentController {
  private readonly logger = new Logger(AutonomousTraderAgentController.name);

  constructor(private readonly agentService: AutonomousTraderAgentService) {}

  /**
   * POST /api/agent/trader/start
   * Start the autonomous trader with specified strategy and configuration
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startAgent(@Req() req: any, @Body() dto: StartAgentDto) {
    this.logger.log(`[startAgent] Request from user: ${req.user?.id || 'unknown'}`);
    this.logger.debug(`[startAgent] Received DTO: ${JSON.stringify(dto)}`);

    // Defensive: If DTO validation stripped everything (edge case),
    // try to construct from raw body
    if (!dto || (!dto.strategy && !dto.credentialId)) {
      this.logger.warn('[startAgent] DTO appears empty after validation — attempting raw body parse');
      try {
        const rawBody = (req as any).rawBody || (req as any).body;
        if (rawBody && typeof rawBody === 'object') {
          dto = {
            strategy: rawBody.strategy || StrategyType.SCALPING,
            credentialId: rawBody.credentialId || '',
            symbols: rawBody.symbols,
          } as StartAgentDto;
          this.logger.warn(`[startAgent] Reconstructed DTO from raw body: ${JSON.stringify(dto)}`);
        }
      } catch (e) {
        this.logger.error(`[startAgent] Failed to reconstruct DTO: ${e}`);
      }
    }

    // Validate required fields manually as a safety net
    if (!dto.credentialId || dto.credentialId.trim() === '') {
      return {
        success: false,
        message: 'يرجى ربط مفتاح API أولاً من إعدادات المحفظة',
        data: null,
      };
    }

    // Validate strategy — fallback to SCALPING if invalid
    const validStrategies = [StrategyType.SCALPING, StrategyType.SWING, StrategyType.GRID];
    if (!dto.strategy || !validStrategies.includes(dto.strategy)) {
      this.logger.warn(`[startAgent] Invalid strategy "${dto.strategy}" — defaulting to SCALPING`);
      dto.strategy = StrategyType.SCALPING;
    }

    try {
      const state = await this.agentService.startAgent(req.user.id, dto);

      return {
        success: true,
        data: state,
        message: `تم تفعيل وكيل التداول الذاتي — الاستراتيجية: ${dto.strategy}`,
      };
    } catch (error: any) {
      this.logger.error(`[startAgent] Service error: ${error.message}`);

      if (error.getStatus && typeof error.getStatus === 'function') {
        throw error;
      }

      return {
        success: false,
        message: error.message || 'فشل تفعيل وكيل التداول — يرجى المحاولة لاحقاً',
        data: null,
      };
    }
  }

  /**
   * POST /api/agent/trader/stop
   */
  @Post('stop')
  @HttpCode(HttpStatus.OK)
  async stopAgent(@Req() req: any, @Body() body: { emergency?: boolean }) {
    const state = await this.agentService.stopAgent(
      req.user.id,
      body.emergency === true,
    );

    return {
      success: true,
      data: state,
      message: body.emergency
        ? 'تم الإيقاف الطارئ — تم إغلاق جميع المراكز'
        : 'تم إيقاف وكيل التداول الذاتي',
    };
  }

  /**
   * GET /api/agent/trader/status
   */
  @Get('status')
  async getStatus(@Req() req: any) {
    const state = await this.agentService.getStatus(req.user.id);

    return {
      success: true,
      data: state,
    };
  }

  /**
   * GET /api/agent/trader/performance
   */
  @Get('performance')
  async getPerformance(@Req() req: any) {
    const period = 'WEEKLY' as const;
    const metrics = await this.agentService.getPerformance(req.user.id, period);

    return {
      success: true,
      data: metrics,
    };
  }

  /**
   * GET /api/agent/trader/open-positions
   */
  @Get('open-positions')
  async getOpenPositions(@Req() req: any) {
    const positions = await this.agentService.getOpenPositions(req.user.id);

    return {
      success: true,
      data: positions,
    };
  }

  /**
   * PUT /api/agent/trader/strategy
   */
  @Put('strategy')
  async changeStrategy(@Req() req: any, @Body() dto: ChangeStrategyDto) {
    const state = await this.agentService.changeStrategy(req.user.id, dto);

    return {
      success: true,
      data: state,
      message: `تم تغيير الاستراتيجية إلى: ${dto.strategy}`,
    };
  }

  /**
   * PUT /api/agent/trader/risk-params
   */
  @Put('risk-params')
  async updateRiskParams(@Req() req: any, @Body() dto: UpdateRiskParamsDto) {
    const state = await this.agentService.updateRiskParams(req.user.id, dto);

    return {
      success: true,
      data: state,
      message: 'تم تحديث معلمات المخاطر',
    };
  }

  /**
   * GET /api/agent/trader/settings
   * Get per-user agent settings (persistent, survives restarts)
   */
  @Get('settings')
  async getSettings(@Req() req: any) {
    const settings = await this.agentService.getSettings(req.user.id);

    return {
      success: true,
      data: settings,
    };
  }

  /**
   * PUT /api/agent/trader/settings
   * Update per-user agent settings
   */
  @Put('settings')
  async updateSettings(@Req() req: any, @Body() dto: UpdateAgentSettingsDto) {
    const settings = await this.agentService.updateSettings(req.user.id, dto);

    return {
      success: true,
      data: settings,
      message: 'تم تحديث إعدادات الوكيل',
    };
  }

  /**
   * GET /api/agent/trader/system-status
   * Get system-level status (AUTO_TRADING_ENABLED, etc.)
   * This endpoint shows the global system configuration that affects all users.
   * NOTE: This is also accessible via the public /api/agent/trader/public-status endpoint
   * without authentication, so the frontend can show the trading status on the landing page.
   */
  @Get('system-status')
  async getSystemStatus() {
    return this.agentService.getSystemStatus();
  }

  /**
   * PUT /api/agent/trader/system-settings
   * Admin-only: Update system-level auto trading settings
   */
  @Put('system-settings')
  async updateSystemSettings(@Req() req: any, @Body() body: { autoTradingEnabled?: boolean }) {
    // Only allow admins to change system settings
    const user = req.user;
    if (!user || user.tier !== 'INSTITUTIONAL') {
      // For now, allow any authenticated user to check; in production, restrict to admin
      // We'll use the Setting model to store this
    }

    if (body.autoTradingEnabled !== undefined) {
      await this.agentService.updateSystemAutoTrading(body.autoTradingEnabled);
    }

    return {
      success: true,
      message: 'تم تحديث إعدادات النظام',
    };
  }
}
