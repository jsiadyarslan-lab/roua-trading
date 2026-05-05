// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// واجهة المنفذ الذكي — يحل محل نقاط نهاية البوت القديم في EngineController
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, Body, UseGuards, Logger, Request } from '@nestjs/common';
import { SmartExecutorService } from './smart-executor.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('smart-executor')
@UseGuards(AuthGuard)
export class SmartExecutorController {
  private readonly logger = new Logger(SmartExecutorController.name);

  constructor(private readonly executorService: SmartExecutorService) {}

  /**
   * GET /api/smart-executor/status — Get global executor status
   */
  @Get('status')
  async getStatus(@Request() req: any) {
    const status = await this.executorService.getStatus(req.user?.id);
    return { success: true, data: status };
  }

  /**
   * POST /api/smart-executor/start — Start the executor globally
   */
  @Post('start')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async start(@Request() req: any) {
    this.logger.log('⚔️ Smart Executor start requested');
    const status = await this.executorService.start(req.user?.id);
    return { success: true, data: status };
  }

  /**
   * POST /api/smart-executor/stop — Stop the executor globally
   */
  @Post('stop')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async stop(@Request() req: any) {
    this.logger.log('⚔️ Smart Executor stop requested');
    const status = await this.executorService.stop(req.user?.id);
    return { success: true, data: status };
  }

  /**
   * GET /api/smart-executor/positions — Get open positions for current user
   * FIX: Now user-scoped — only returns the authenticated user's positions
   */
  @Get('positions')
  async getPositions(@Request() req: any) {
    const positions = await this.executorService.getOpenPositions(req.user?.id);
    return { success: true, data: positions };
  }

  /**
   * POST /api/smart-executor/user/enable — Enable executor for current user
   * Body: { credentialId?, isPaperTrading?, maxOpenPositions?, riskPerTradePercent? }
   */
  @Post('user/enable')
  async enableUser(
    @Request() req: any,
    @Body() body: {
      credentialId?: string;
      isPaperTrading?: boolean;
      maxOpenPositions?: number;
      riskPerTradePercent?: number;
    },
  ) {
    const state = await this.executorService.enableUser(req.user.id, body);
    return { success: true, data: state, message: 'تم تفعيل المنفذ الذكي' };
  }

  /**
   * POST /api/smart-executor/user/disable — Disable executor for current user
   */
  @Post('user/disable')
  async disableUser(@Request() req: any) {
    await this.executorService.disableUser(req.user.id);
    return { success: true, message: 'تم إيقاف المنفذ الذكي' };
  }

  /**
   * GET /api/smart-executor/user/status — Get executor status for current user
   */
  @Get('user/status')
  async getUserStatus(@Request() req: any) {
    const userState = await this.executorService.getUserState(req.user.id);
    const globalStatus = await this.executorService.getStatus(req.user?.id);
    return {
      success: true,
      data: {
        user: userState,
        global: globalStatus,
      },
    };
  }

  /**
   * POST /api/smart-executor/purge-phantoms — Delete phantom positions from database
   * Phantom positions have near-zero trade values ($0.00-$0.04) from degraded data
   */
  @Post('purge-phantoms')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async purgePhantoms() {
    const result = await this.executorService.purgePhantomPositions();
    return {
      success: true,
      data: result,
      message: `تم حذف ${result.deleted} مركز وهمي من قاعدة البيانات`,
    };
  }
}
