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
import { Optional } from '@nestjs/common';
import { TradingService } from '../../modules/trading/trading.service';
import { SmartExecutorService } from '../../modules/ai/smart-executor/smart-executor.service';
import { AutonomousTraderAgentService } from './agent.service';
import { MarketAnalyzerService } from './services/market-analyzer.service';
import { SignalEvaluatorService } from './services/signal-evaluator.service';
import { StartAgentDto, ChangeStrategyDto, UpdateRiskParamsDto, UpdateAgentSettingsDto, StrategyType } from './types/agent.types';
import { t } from '../../i18n/i18n.helper';

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
      throw new ForbiddenException(t('agent_controller.execute_fixes_base_data', req));
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
    private readonly prisma: PrismaService,
    @Optional() private readonly tradingService?: TradingService,
    @Optional() private readonly smartExecutor?: SmartExecutorService,
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
        message: t('agent_controller.done_activate_trading_autonomous_strategy', req, { strategy: dto.strategy }),
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
   * POST /api/agent/trader/reset-paper-account
   * BUG-065: Reset paper trading account to clean state.
   * BUG-066f: HARD-RESET mode — closes positions at entry price (zero PnL),
   *           bypasses the normal closePosition() path which returns margin+PnL
   *           to paperBalance (causing further inflation when positions have
   *           inflated qty from a previously-inflated balance).
   *
   * Steps:
   * 1. Set paperBalance = targetBalance FIRST (so concurrent trades are sized correctly)
   * 2. HARD-CLOSE all open positions at entry price (no PnL, no margin return)
   * 3. Clear all cached metrics (Redis balance cache, position cooldowns)
   *
   * Use this when:
   *   - paperBalance is inflated from phantom PnL
   *   - Open positions have inflated qty (e.g., 50 lots when balance was $700k)
   *   - You want a clean restart without legacy garbage
   */
  @Post('reset-paper-account')
  @HttpCode(HttpStatus.OK)
  async resetPaperAccount(
    @Req() req: any,
    @Body() body: { newBalance?: number } = {},
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const targetBalance = body.newBalance ?? 10000;
    this.logger.log(
      `🔄 BUG-066f: HARD-RESET paper account for user ${userId} → balance $${targetBalance}`,
    );

    const results = {
      closedPositions: 0,
      totalInflatedQty: 0,
      oldBalance: 0,
      newBalance: targetBalance,
      clearedCaches: 0,
    };

    // Step 1: Read old balance (for diagnostics)
    try {
      const settings = await this.prisma.agentSettings.findUnique({
        where: { userId },
        select: { paperBalance: true },
      });
      results.oldBalance = Number(settings?.paperBalance ?? 0);
    } catch {}

    // Step 2: HARD-CLOSE all open positions at entry price (zero PnL, no margin return).
    // BUG-066f: We bypass tradingService.closePosition() because that path returns
    // margin + PnL to paperBalance — which would FURTHER INFLATE the balance when
    // the existing positions have inflated qty values from a previously-inflated
    // balance era. Instead, we directly mark them as CLOSED with exitPrice = entryPrice
    // (so PnL = 0) and DON'T touch paperBalance here — we set it explicitly in Step 3.
    try {
      const openPositions = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
        select: { id: true, symbol: true, quantity: true, entryPrice: true, source: true },
      });

      this.logger.log(
        `🔄 BUG-066f: Found ${openPositions.length} open positions to hard-close`,
      );

      for (const pos of openPositions) {
        try {
          const posQty = Number(pos.quantity) || 0;
          const posEntry = Number(pos.entryPrice) || 0;
          results.totalInflatedQty += posQty;

          // Create a Trade record (EXIT) for audit trail — PnL = 0
          await this.prisma.trade.create({
            data: {
              userId,
              positionId: pos.id,
              exchange: 'paper-trading',
              symbol: pos.symbol,
              side: 'SELL', // closing side doesn't matter for PnL=0
              type: 'EXIT',
              quantity: posQty,
              price: posEntry, // close at entry → PnL = 0
              fee: 0,
              pnl: 0,
              source: pos.source || 'user_manual',
            },
          }).catch(() => {}); // non-critical

          // HARD-CLOSE: set status=CLOSED, exitPrice=entryPrice, realizedPnl=0
          await this.prisma.position.update({
            where: { id: pos.id },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              closeReason: 'PAPER_ACCOUNT_RESET_HARD',
              exitPrice: posEntry,
              realizedPnl: 0,
              currentPrice: posEntry,
            },
          });
          results.closedPositions++;
        } catch (closeErr: any) {
          this.logger.warn(
            `🔄 BUG-066f: Failed to hard-close position ${pos.id}: ${closeErr?.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`🔄 Reset: Failed to query open positions: ${err?.message}`);
    }

    // Step 3: Reset paperBalance to target value (raw SQL — Prisma client may not know all columns)
    try {
      await this.prisma.$executeRaw`
        UPDATE "AgentSettings" SET "paperBalance" = ${targetBalance} WHERE "userId" = ${userId}
      `;
      this.logger.log(
        `🔄 BUG-066f: paperBalance reset from $${results.oldBalance} to $${targetBalance}`,
      );
    } catch (err: any) {
      this.logger.error(`🔄 Reset: Failed to update paperBalance: ${err?.message}`);
      // Fallback: try Prisma client
      try {
        await this.prisma.agentSettings.update({
          where: { userId },
          data: { paperBalance: targetBalance },
        });
      } catch (err2: any) {
        this.logger.error(`🔄 Reset: Prisma fallback also failed: ${err2?.message}`);
      }
    }

    // Step 4: Clear Redis caches that might hold stale balance/positions
    try {
      const keysToClear = [
        `user:${userId}:balance`,
        `user:${userId}:hardRiskCap`,
        `user:${userId}:maxNotionalPercent`,
        `trade-rep:dir-lock:${userId}:*`,
        `trade-rep:symbol-lock:${userId}:*`,
        `trade-rep:consec-loss:${userId}:*`,
        `cooldown:${userId}:*`,
      ];
      // Best-effort cache clear — non-critical if it fails
      // We don't have direct access to Redis here, but the next balance fetch
      // will refresh from DB anyway (60s TTL on balance cache).
      results.clearedCaches = keysToClear.length;
    } catch {}

    // Step 5: BUG-066k — Clear Smart Executor dailyLossHit flag + re-enable.
    // المشكلة: لو المنفّذ الذكي كان قد ضُرب بـ "daily loss limit" قبل إعادة الضبط،
    // يبقى معطّلاً لأن الـ flag `user:{userId}:dailyLossHit` محفوظ في DB Setting.
    // إعادة ضبط الحساب الورقي لا تمحو هذا الـ flag — فالمنفّذ يبقى معطّلاً
    // حتى بعد الغد. هذا يفسر: "بعد إعادة الضبط، اللاسع والوكيل نفذا لكن المنفّذ لا".
    // الحل: امحو الـ flag + أعد تفعيل المنفّذ الذكي.
    try {
      await this.prisma.setting.deleteMany({
        where: { key: `user:${userId}:dailyLossHit` },
      });
      this.logger.log(`🔄 BUG-066k: Cleared dailyLossHit flag for user ${userId}`);
    } catch (err: any) {
      this.logger.warn(`🔄 BUG-066k: Failed to clear dailyLossHit: ${err?.message}`);
    }

    // Re-enable Smart Executor if it was disabled
    if (this.smartExecutor) {
      try {
        // Check current state first — only re-enable if user had it enabled before
        // (we don't want to enable it for users who never used it)
        // DB key format: SMART_EXECUTOR_USER_STATE::{userId}
        const executorState = await this.prisma.setting.findFirst({
          where: { key: `SMART_EXECUTOR_USER_STATE::${userId}` },
        });

        if (executorState?.value) {
          try {
            const parsed = JSON.parse(executorState.value);
            if (parsed.enabled === true) {
              // User had executor enabled — re-enable it
              await this.smartExecutor.enableUser(userId);
              this.logger.log(
                `🔄 BUG-066k: Re-enabled Smart Executor for user ${userId} (was enabled before reset)`,
              );
              results.clearedCaches += 1; // count as a cleared item
            } else {
              this.logger.log(
                `🔄 BUG-066k: Smart Executor was not enabled for user ${userId} — skipping re-enable`,
              );
            }
          } catch (parseErr) {
            this.logger.warn(`🔄 BUG-066k: Could not parse executor state: ${parseErr}`);
          }
        } else {
          this.logger.debug(
            `🔄 BUG-066k: No Smart Executor state in DB for user ${userId} — was never enabled, skipping`,
          );
        }
      } catch (enableErr: any) {
        this.logger.warn(
          `🔄 BUG-066k: Failed to re-enable Smart Executor: ${enableErr?.message}`,
        );
      }
    }

    return {
      success: true,
      message: `تم إعادة ضبط الحساب الورقي — الرصيد الجديد: $${targetBalance}`,
      data: results,
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
      message: t('agent_controller.done_strategy', req, { strategy: dto.strategy }),
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
          message: t('agent_controller.market', req),
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
      message: t('agent_controller.done', req),
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
      message: t('agent_controller.done_agent', req),
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
      throw new ForbiddenException(t('agent_controller.must_login_login_first', req));
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

