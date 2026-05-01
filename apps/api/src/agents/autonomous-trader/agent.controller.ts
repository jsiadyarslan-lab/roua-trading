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
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AutonomousTraderAgentService } from './agent.service';
import { StartAgentDto, ChangeStrategyDto, UpdateRiskParamsDto } from './types/agent.types';

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
  constructor(private readonly agentService: AutonomousTraderAgentService) {}

  /**
   * POST /api/agent/trader/start
   * Start the autonomous trader with specified strategy and configuration
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startAgent(@Req() req: any, @Body() dto: StartAgentDto) {
    const state = await this.agentService.startAgent(req.user.id, dto);

    return {
      success: true,
      data: state,
      message: `تم تفعيل وكيل التداول الذاتي — الاستراتيجية: ${dto.strategy}`,
    };
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
