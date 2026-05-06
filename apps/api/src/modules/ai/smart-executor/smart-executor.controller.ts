// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// واجهة المنفذ الذكي — يحل محل نقاط نهاية البوت القديم في EngineController
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, Body, UseGuards, Logger, Request } from '@nestjs/common';
import { SmartExecutorService } from './smart-executor.service';
import { AuthGuard, Public } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('smart-executor')
@UseGuards(AuthGuard)
export class SmartExecutorController {
  private readonly logger = new Logger(SmartExecutorController.name);

  constructor(private readonly executorService: SmartExecutorService) {}

  /**
   * GET /api/smart-executor/status — Get global executor status
   * FIX: Marked @Public() so the dashboard can show executor status without
   * requiring authentication. Uses req.user?.id with optional chaining so
   * it works for both authenticated and guest users.
   */
  @Public()
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
   * POST /api/smart-executor/user/auto-enable — Auto-enable paper trading for any user
   * FIX: Added this endpoint so the dashboard can auto-enable the executor for
   * the current user in paper-trading mode without requiring complex setup.
   * This removes the biggest blocker: users never enabling the executor.
   */
  @Public()
  @Post('user/auto-enable')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async autoEnable(@Request() req: any) {
    const userId = req.user?.id || 'system-auto-trader';
    const state = await this.executorService.enableUser(userId, {
      isPaperTrading: true,
      maxOpenPositions: 3,
      riskPerTradePercent: 1,
    });
    return {
      success: true,
      data: state,
      message: 'تم تفعيل التداول الورقي التلقائي — سيتم تنفيذ الصفقات بناءً على إشارات المجلس',
    };
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

  /**
   * POST /api/smart-executor/reset-auto-users — Disable all auto-enabled users
   * Clears Redis state for users who were auto-enabled by the old _autoEnableSystemUser().
   * After this, users must manually click "تشغيل" to enable the executor.
   */
  @Post('reset-auto-users')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async resetAutoUsers() {
    const result = await this.executorService.resetAutoEnabledUsers();
    return {
      success: true,
      data: result,
      message: `تم تعطيل ${result.disabled} مستخدم تم تفعيلهم تلقائياً`,
    };
  }

  /**
   * GET /api/smart-executor/debug — Diagnose why trades aren't executing
   * Returns detailed information about the execution pipeline state.
   * FIX: Added to help diagnose the "0 trades" problem.
   */
  @Public()
  @Get('debug')
  async debugExecution() {
    const diagnostic = await this.executorService.diagnoseExecution();
    return { success: true, data: diagnostic };
  }
}
