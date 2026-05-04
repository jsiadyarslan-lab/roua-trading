// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// واجهة المجلس الاستراتيجي — المحرك الوحيد لإجماع الذكاء الاصطناعي
// يحل محل نقاط نهاية CouncilScheduler القديم في EngineController
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, Body, UseGuards, Logger, Req } from '@nestjs/common';
import { StrategicCouncilService } from './strategic-council.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('strategic-council')
@UseGuards(AuthGuard)
export class StrategicCouncilController {
  private readonly logger = new Logger(StrategicCouncilController.name);

  constructor(private readonly councilService: StrategicCouncilService) {}

  /**
   * GET /api/strategic-council/briefs/active — Get active trading briefs
   */
  @Get('briefs/active')
  async getActiveBriefs() {
    const briefs = await this.councilService.getActiveBriefs();
    return { success: true, data: briefs };
  }

  /**
   * GET /api/strategic-council/briefs/history — Get brief history
   */
  @Get('briefs/history')
  async getBriefHistory() {
    const briefs = await this.councilService.getBriefHistory();
    return { success: true, data: briefs };
  }

  /**
   * GET /api/strategic-council/briefs/count — Get active briefs count
   */
  @Get('briefs/count')
  async getActiveBriefsCount() {
    const count = await this.councilService.getActiveBriefsCount();
    return { success: true, data: { count } };
  }

  /**
   * POST /api/strategic-council/trigger — Trigger an extraordinary council session
   * Body: { pairs: string[] }
   */
  @Post('trigger')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async triggerSession(@Req() req: any, @Body() body: { pairs?: string[] }) {
    const pairs = body.pairs || [];
    if (pairs.length === 0) {
      return { success: false, message: 'حدد زوجاً واحداً على الأقل' };
    }

    this.logger.log(`🏛️ Manual council session triggered for: ${pairs.join(', ')}`);
    const result = await this.councilService.forceSession(pairs, req.user?.id || 'manual');
    return { success: true, data: result };
  }

  /**
   * GET /api/strategic-council/session/last — Get last session result
   */
  @Get('session/last')
  async getLastSession() {
    const result = await this.councilService.getLastSession();
    return { success: true, data: result };
  }
}
