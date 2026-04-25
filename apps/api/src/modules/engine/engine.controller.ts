// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Engine Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { MarketScannerService } from './services/market-scanner.service';
import { TradingBotService } from './services/trading-bot.service';
import { CouncilSchedulerService } from './services/council-scheduler.service';
import { PositionMonitorService } from './services/position-monitor.service';
import { MarketBroadcasterService } from './services/market-broadcaster.service';

/**
 * Engine Controller — Live Engine Management API
 *
 * Provides endpoints to:
 * - View engine status and health
 * - Trigger manual scans and council sessions
 * - Manage bot configuration
 * - View alerts and broadcast data
 *
 * All endpoints require authentication.
 */
@Controller('engine')
@UseGuards(AuthGuard)
export class EngineController {
  private readonly logger = new Logger(EngineController.name);

  constructor(
    private readonly scanner: MarketScannerService,
    private readonly bot: TradingBotService,
    private readonly council: CouncilSchedulerService,
    private readonly monitor: PositionMonitorService,
    private readonly broadcaster: MarketBroadcasterService,
  ) {
    this.logger.log('⚙️ Engine Controller initialized');
  }

  // ── Engine Health ──

  /**
   * GET /api/engine/health
   *
   * Returns the health status of all live engines.
   */
  @Get('health')
  async getEngineHealth() {
    const [
      lastScan,
      lastBotCycle,
      lastCouncilSession,
      monitorStatus,
      trackedSymbols,
    ] = await Promise.all([
      this.scanner.getLastScan(),
      this.bot.getLastCycle(),
      this.council.getLastSession(),
      this.monitor.getMonitorStatus(),
      this.broadcaster.getTrackedSymbols(),
    ]);

    return {
      success: true,
      data: {
        engines: {
          scanner: {
            status: lastScan ? 'active' : 'idle',
            lastScan,
          },
          bot: {
            status: lastBotCycle ? 'active' : 'idle',
            lastCycle: lastBotCycle,
          },
          council: {
            status: lastCouncilSession ? 'active' : 'idle',
            lastSession: lastCouncilSession,
          },
          monitor: {
            status: monitorStatus.openPositions > 0 ? 'active' : 'idle',
            ...monitorStatus,
          },
          broadcaster: {
            status: trackedSymbols.length > 0 ? 'active' : 'idle',
            trackedSymbols: trackedSymbols.length,
          },
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ── Scanner Controls ──

  /**
   * POST /api/engine/scanner/run
   *
   * Trigger a manual market scan.
   */
  @Post('scanner/run')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async runManualScan(@Request() req: any, @Body() body: { symbols?: string[] }) {
    const result = await this.scanner.forceScan(req.user.id, body?.symbols);
    return { success: true, data: result };
  }

  /**
   * GET /api/engine/scanner/last
   *
   * Get the last scan results.
   */
  @Get('scanner/last')
  async getLastScan() {
    const result = await this.scanner.getLastScan();
    return { success: true, data: result };
  }

  // ── Bot Controls ──

  /**
   * POST /api/engine/bot/enable
   *
   * Enable trading bot for the current user.
   */
  @Post('bot/enable')
  async enableBot(@Request() req: any, @Body() body: any) {
    await this.bot.enableBot(req.user.id, body);
    return {
      success: true,
      message: 'تم تفعيل البوت بنجاح',
    };
  }

  /**
   * POST /api/engine/bot/disable
   *
   * Disable trading bot for the current user.
   */
  @Post('bot/disable')
  async disableBot(@Request() req: any) {
    await this.bot.disableBot(req.user.id);
    return {
      success: true,
      message: 'تم إيقاف البوت',
    };
  }

  /**
   * GET /api/engine/bot/status
   *
   * Get bot status for the current user.
   */
  @Get('bot/status')
  async getBotStatus(@Request() req: any) {
    const status = await this.bot.getBotStatus(req.user.id);
    return { success: true, data: status };
  }

  // ── Council Controls ──

  /**
   * POST /api/engine/council/run
   *
   * Trigger a manual council session.
   */
  @Post('council/run')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async runCouncilSession(
    @Request() req: any,
    @Body() body: { symbols: string[] },
  ) {
    if (!body.symbols || body.symbols.length === 0) {
      return {
        success: false,
        message: 'يرجى تحديد رموز التداول للتحليل',
      };
    }

    const results = await this.council.forceSession(req.user.id, body.symbols);
    return { success: true, data: results };
  }

  /**
   * GET /api/engine/council/last
   *
   * Get the last council session results.
   */
  @Get('council/last')
  async getLastCouncilSession() {
    const result = await this.council.getLastSession();
    return { success: true, data: result };
  }

  /**
   * GET /api/engine/council/alerts
   *
   * Get active council alerts.
   */
  @Get('council/alerts')
  async getCouncilAlerts() {
    const alerts = await this.council.getActiveAlerts();
    return { success: true, data: alerts };
  }

  /**
   * GET /api/engine/council/:symbol
   *
   * Get council result for a specific symbol.
   */
  @Get('council/:symbol')
  async getCouncilResult(@Param('symbol') symbol: string) {
    const decoded = decodeURIComponent(symbol);
    const result = await this.council.getSymbolResult(decoded);
    return { success: true, data: result };
  }

  // ── Monitor Status ──

  /**
   * GET /api/engine/monitor/status
   *
   * Get position monitor status.
   */
  @Get('monitor/status')
  async getMonitorStatus() {
    const status = await this.monitor.getMonitorStatus();
    return { success: true, data: status };
  }

  // ── Broadcaster Status ──

  /**
   * GET /api/engine/broadcaster/quotes
   *
   * Get all cached market quotes.
   */
  @Get('broadcaster/quotes')
  async getCachedQuotes() {
    const quotes = await this.broadcaster.getAllCachedQuotes();
    return { success: true, data: quotes };
  }

  /**
   * POST /api/engine/broadcaster/track
   *
   * Add a symbol to tracking.
   */
  @Post('broadcaster/track')
  async trackSymbol(@Body() body: { symbol: string }) {
    if (!body.symbol) {
      return { success: false, message: 'Symbol is required' };
    }

    this.broadcaster.trackSymbol(body.symbol);
    return {
      success: true,
      message: `Now tracking: ${body.symbol}`,
      tracked: this.broadcaster.getTrackedSymbols(),
    };
  }
}
