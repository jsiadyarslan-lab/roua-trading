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
import { ExposureManagerService } from '../../trading/services/exposure-manager.service';
import { t } from '../../../i18n/i18n.helper';

@Controller('smart-executor')
@UseGuards(AuthGuard)
export class SmartExecutorController {
  private readonly logger = new Logger(SmartExecutorController.name);

  constructor(
    private readonly executorService: SmartExecutorService,
    private readonly exposureManager: ExposureManagerService,
  ) {}

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
   * FIX: Kept for system use, but the tick loop already handles
   * the case where no users are enabled (just skips).
   */
  @Post('start')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async start(@Request() req: any) {
    this.logger.log('⚔️ Smart Executor start requested');
    const status = await this.executorService.start(req.user?.id);
    return { success: true, data: status };
  }

  /**
   * POST /api/smart-executor/stop — Disable executor for the current user
   * FIX: CRITICAL SECURITY FIX — Previously this endpoint called the global stop()
   * method which killed the executor tick loop for ALL users. When User A clicked
   * "تعطيل" (disable), it would set isRunning=false and clearInterval(tickInterval),
   * stopping execution for User B who was still enabled.
   *
   * Now: This endpoint calls disableUser() instead, which ONLY removes the calling
   * user's state. The tick loop continues running for any other enabled users.
   * Only when NO users remain enabled does the tick loop stop automatically.
   */
  @Post('stop')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async stop(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { success: false, error: t('smart_executor_controller.user_not') };
    }
    this.logger.log(`⚔️ Smart Executor stop requested by user ${userId} — disabling user only (not global)`);
    await this.executorService.disableUser(userId);
    const status = await this.executorService.getStatus(userId);
    return { success: true, data: status, message: t('smart_executor_controller.done_disable') };
  }

  /**
   * POST /api/smart-executor/emergency-stop — Stop executor AND close all open positions
   */
  @Post('emergency-stop')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async emergencyStop(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { success: false, error: t('smart_executor_controller.user_not') };
    }
    this.logger.warn(`🚨 EMERGENCY STOP requested by user ${userId} — disabling executor and closing all positions`);

    // 1. Disable executor
    await this.executorService.disableUser(userId);

    // 2. Close all open positions
    const closed: string[] = [];
    const failed: string[] = [];
    try {
      const openPositions = await this.executorService.getOpenPositions(userId);
      await Promise.allSettled(
        openPositions.map(async (pos: any) => {
          try {
            await this.executorService.closePosition(userId, pos.id, 'EMERGENCY_STOP');
            closed.push(pos.symbol);
          } catch {
            failed.push(pos.symbol);
          }
        })
      );
    } catch (err: any) {
      this.logger.error(`Emergency close failed: ${err.message}`);
    }

    return {
      success: true,
      message: t('smart_executor_controller.done_stop', undefined, { length: closed.length }),
      closed,
      failed,
    };
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
   * V126: No more routingMode or isPaperTrading. The user selects their
   * active account in settings. This endpoint just enables the executor.
   * Body: { maxOpenPositions?, riskPerTradePercent? }
   */
  @Post('user/enable')
  async enableUser(
    @Request() req: any,
    @Body() body: {
      maxOpenPositions?: number;
      riskPerTradePercent?: number;
    },
  ) {
    const state = await this.executorService.enableUser(req.user.id, body);
    return { success: true, data: state, message: t('smart_executor_controller.done_activate') };
  }

  // REMOVED: POST /api/smart-executor/user/auto-enable — This was a BACKDOOR
  // that allowed anyone (even unauthenticated users via @Public()) to
  // auto-enable paper trading for the "system-auto-trader" user, creating
  // phantom trades that inflated statistics. This endpoint has been removed
  // permanently. Users must use the authenticated POST /user/enable endpoint.

  /**
   * POST /api/smart-executor/user/disable — Disable executor for current user
   */
  @Post('user/disable')
  async disableUser(@Request() req: any) {
    await this.executorService.disableUser(req.user.id);
    return { success: true, message: t('smart_executor_controller.done_stop_2') };
  }

  /**
   * GET /api/smart-executor/user/status — Get executor status for current user
   */
  @Get('user/status')
  async getUserStatus(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { success: false, error: t('smart_executor_controller.user_not') };
    }
    const userState = await this.executorService.getUserState(userId);
    const globalStatus = await this.executorService.getStatus(userId);
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
      message: t('smart_executor_controller.done_base_data', undefined, { deleted: result.deleted }),
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
      message: t('smart_executor_controller.done_disable_done', undefined, { disabled: result.disabled }),
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

  /**
   * POST /api/smart-executor/migrate-units-to-lots — Convert old OPEN positions
   * from RAW UNITS to LOTS.
   *
   * V431 MIGRATION: After the LOTS unification commit (7b89269a4), the P&L engine
   * multiplies quantity by contractSize. Old positions stored in UNITS get
   * inflated P&L (100,000× too big for forex). This endpoint converts them.
   *
   * Body: { userId?: string } — if omitted, migrates ALL users' positions.
   * Authentication: requires logged-in user (admin only via userId override).
   */
  @Post('migrate-units-to-lots')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async migrateUnitsToLots(@Request() req: any, @Body() body: { userId?: string } = {}) {
    // V168 SECURITY: If userId is provided in body, only migrate that user.
    // Otherwise, migrate the authenticated user's positions.
    // Admin override: if authenticated user is admin, they can pass userId='all'.
    const targetUserId = body.userId && body.userId !== 'all' ? body.userId : req.user?.id;
    const result = await this.executorService.migrateUnitsToLots(targetUserId);
    return {
      success: true,
      data: result,
      message: `Migrated ${result.migrated} positions, skipped ${result.skipped}`,
    };
  }

  /**
   * POST /api/smart-executor/nuclear-cleanup — Delete ALL fake/paper trading data
   * V168 SECURITY: Now requires authenticated user — only deletes that user's data.
   * Removes user's TradingBriefs, paper-trading Positions/Trades/Orders/Credentials,
   * and clears their Redis executor state. Also stops the executor.
   */
  @Post('nuclear-cleanup')
  @Throttle({ default: { limit: 2, ttl: 300000 } })
  async nuclearCleanup(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { success: false, error: t('smart_executor_controller.user_not_execute') };
    }
    this.logger.warn(`⚔️ V168 NUCLEAR CLEANUP requested by user ${userId}`);
    const result = await this.executorService.nuclearCleanup(userId);
    return {
      success: true,
      data: result,
      message: t('smart_executor_controller.done_data', undefined, { briefs: result.briefs, positions: result.positions, trades: result.trades, paperOrders: result.paperOrders, paperCredentials: result.paperCredentials }),
    };
  }

  /**
   * GET /api/smart-executor/exposure — Get unified exposure summary
   * Returns total open positions and exposure across ALL sources
   * (smart_executor, agent, auto_paper, user_manual).
   * This is the cross-system exposure view — both the executor
   * and agent contribute to the same user's total exposure.
   */
  @Get('exposure')
  async getExposure(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { success: false, error: t('smart_executor_controller.user_not') };
    }
    const summary = await this.exposureManager.getExposureSummary(userId);
    return { success: true, data: summary };
  }
}
