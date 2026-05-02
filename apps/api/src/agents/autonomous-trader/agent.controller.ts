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
import { StartAgentDto, ChangeStrategyDto, UpdateRiskParamsDto, StrategyType } from './types/agent.types';

/**
 * Autonomous Trader Agent API
 *
 * Endpoints:
 * - POST /api/agent/trader/start      → تفعيل الوكيل
 * - POST /api/agent/trader/stop       → إيقاف الوكيل
 * - GET  /api/agent/trader/status     → حالة الوكيل
 * - GET  /api/agent/trader/performance → تقرير الأداء
 * - GET  /api/agent/trader/open-positions → المراكز المفتوحة
 * - PUT  /api/agent/trader/strategy   → تغيير الاستراتيجية
 */
@Controller('agent/trader')
@UseGuards(AuthGuard)
export class AutonomousTraderAgentController {
  private readonly logger = new Logger(AutonomousTraderAgentController.name);

  constructor(private readonly agentService: AutonomousTraderAgentService) {}

  /**
   * POST /api/agent/trader/start
   * Start the autonomous trader with specified strategy and configuration
   *
   * Accepts both validated DTO and raw JSON fallback for resilience.
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

      // If it's already an HttpException, re-throw it (NestJS handles formatting)
      if (error.getStatus && typeof error.getStatus === 'function') {
        throw error;
      }

      // Unexpected error — return a friendly response instead of 500
      return {
        success: false,
        message: error.message || 'فشل تفعيل وكيل التداول — يرجى المحاولة لاحقاً',
        data: null,
      };
    }
  }

  /**
   * POST /api/agent/trader/stop
   * Stop the autonomous trader
   * Query param: emergency=true for emergency stop (closes all positions)
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
   * Get current agent status
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
   * Get performance report
   * Query param: period=daily|weekly|monthly|all_time
   */
  @Get('performance')
  async getPerformance(@Req() req: any) {
    const period = 'WEEKLY' as const; // Default to weekly
    const metrics = await this.agentService.getPerformance(req.user.id, period);

    return {
      success: true,
      data: metrics,
    };
  }

  /**
   * GET /api/agent/trader/open-positions
   * Get all open positions managed by the agent
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
   * Change the active trading strategy
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
   * Update risk parameters
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
}
