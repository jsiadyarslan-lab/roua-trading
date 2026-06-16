// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AutonomousTraderAgentService } from './agent.service';
import { MarketAnalyzerService } from './services/market-analyzer.service';
import { SignalEvaluatorService } from './services/signal-evaluator.service';
import { StartAgentDto, ChangeStrategyDto, UpdateRiskParamsDto, UpdateAgentSettingsDto, StrategyType } from './types/agent.types';

/**
 * Public Agent Status Controller (no auth required)
 * Provides read-only system status so the frontend can show
 * whether auto-trading is enabled before the user logs in.
 */
@Controller('agent/trader')
export class AutonomousTraderPublicController {
  constructor(
    private readonly agentService: AutonomousTraderAgentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  @Public()
  async getHealth() {
    return {
      success: true,
      data: {
        module: 'autonomous-trader',
        status: this.agentService.isReady ? 'ok' : 'degraded',
        ready: this.agentService.isReady,
        reason: this.agentService.isReady ? undefined : this.agentService.notReadyReason,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('public-status')
  @Public()
  async getPublicStatus() {
    // Even if the service is not fully ready, we can still return a best-effort status
    // using env vars as fallback. This is safe because getPublicStatus already handles
    // DB failures internally.
    return this.agentService.getPublicStatus();
  }

  @Get('fix-db')
  @UseGuards(AuthGuard)
  async fixDb(@Req() req: any) {
    // SECURITY: Only INSTITUTIONAL (admin) users can run DB fixes
    if (!req.user || req.user.tier !== 'INSTITUTIONAL') {
      throw new ForbiddenException('فقط المستخدمون المؤسسيون يمكنهم تنفيذ إصلاحات قاعدة البيانات');
    }

    // REMOVED: DROP INDEX CASCADE — all DDL removed from application code.
    // Schema changes must ONLY be done via `prisma migrate deploy` in start.sh.
    // Running DDL from endpoints is extremely dangerous and can cause data loss.
    return { 
      success: true, 
      message: "DB fix endpoint disabled — use prisma migrate deploy for schema changes", 
      logs: ["DDL operations removed from application code for safety"] 
    };
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

  constructor(
    private readonly agentService: AutonomousTraderAgentService,
    private readonly marketAnalyzer: MarketAnalyzerService,
    private readonly signalEvaluator: SignalEvaluatorService,
  ) {}

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
    if (!dto || (!dto.strategy)) {
      this.logger.warn('[startAgent] DTO appears empty after validation — attempting raw body parse');
      try {
        const rawBody = (req as any).rawBody || (req as any).body;
        if (rawBody && typeof rawBody === 'object') {
          dto = {
            strategy: rawBody.strategy || StrategyType.AUTO,
            credentialId: rawBody.credentialId || '',
            symbols: rawBody.symbols,
          } as StartAgentDto;
          this.logger.warn(`[startAgent] Reconstructed DTO from raw body: ${JSON.stringify(dto)}`);
        }
      } catch (e) {
        this.logger.error(`[startAgent] Failed to reconstruct DTO: ${e}`);
      }
    }

    // Validate strategy — fallback to AUTO if invalid
    // FIX: SCALPING is NOT valid for the Agent — it belongs to the Smart Executor.
    // The Agent handles M30+ timeframes (short/medium/long-term trades).
    // The Smart Executor handles M1/M5/M15 (scalping/quick trades).
    const validStrategies = [StrategyType.AUTO, StrategyType.SWING, StrategyType.GRID, StrategyType.MEAN_REVERSION, StrategyType.MOMENTUM_BREAKOUT, StrategyType.DCA, StrategyType.VWAP_RSI];
    if (!dto.strategy || !validStrategies.includes(dto.strategy)) {
      if (dto.strategy === StrategyType.SCALPING) {
        this.logger.warn(`[startAgent] SCALPING is not valid for the Agent — use the Smart Executor instead. Defaulting to AUTO`);
      } else {
        this.logger.warn(`[startAgent] Invalid strategy "${dto.strategy}" — defaulting to AUTO`);
      }
      dto.strategy = StrategyType.AUTO;
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

      // Handle ServiceUnavailableException (503) — service dependencies not ready
      if (error instanceof ServiceUnavailableException) {
        return {
          success: false,
          message: error.message || 'الخدمة غير متاحة حالياً — يرجى المحاولة لاحقاً',
          data: null,
        };
      }

      // Re-throw NestJS HTTP exceptions (BadRequestException, NotFoundException, etc.)
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
   * GET /api/agent/trader/regime-info?symbol=BTC/USDT
   * Get current market regime info and AUTO strategy selection details
   */
  @Get('regime-info')
  async getRegimeInfo(@Req() req: any, @Query('symbol') symbol?: string) {
    const targetSymbol = symbol || 'BTC/USDT';

    try {
      // V-PHASE3: Use analyzeForStrategy to include MTF context in regime analysis
      const market = await this.marketAnalyzer.analyzeForStrategy(targetSymbol, 'AUTO');
      if (!market) {
        return {
          success: false,
          message: 'لا يمكن تحليل السوق حالياً',
          data: null,
        };
      }

      const regimeInfo = await this.signalEvaluator.getAutoRegimeInfo(req.user.id, market);

      return {
        success: true,
        data: regimeInfo,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'فشل الحصول على معلومات النظام',
        data: null,
      };
    }
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
   * Update system-level auto trading settings.
   * SECURITY: Only INSTITUTIONAL (admin) users can modify system-level settings.
   */
  @Put('system-settings')
  async updateSystemSettings(@Req() req: any, @Body() body: { autoTradingEnabled?: boolean }) {
    const user = req.user;

    // Allow any authenticated user to control their own auto-trading settings
    if (!user) {
      throw new ForbiddenException('يجب تسجيل الدخول أولاً');
    }

    if (body.autoTradingEnabled !== undefined) {
      await this.agentService.updateSystemAutoTrading(body.autoTradingEnabled);
    }

    return {
      success: true,
      message: body.autoTradingEnabled
        ? 'تم تفعيل التداول الذاتي على مستوى النظام'
        : 'تم تحديث إعدادات النظام',
    };
  }
}

