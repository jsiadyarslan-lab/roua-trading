// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Engine Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// بنية جديدة: نقاط نهاية البوت والمجلس تم نقلها إلى:
//   - /api/strategic-council/*  → StrategicCouncilController
//   - /api/smart-executor/*    → SmartExecutorController
//
// هذا المتحكم يحتفظ فقط بنقاط نهاية البنية التحتية:
//   - /api/engine/health
//   - /api/engine/scanner/*
//   - /api/engine/monitor/*
//   - /api/engine/broadcaster/*
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { MarketScannerService } from './services/market-scanner.service';
import { PositionMonitorService } from './services/position-monitor.service';
import { MarketBroadcasterService } from './services/market-broadcaster.service';
import { t } from '../../i18n/i18n.helper';

/**
 * Engine Controller — واجهة إدارة البنية التحتية الحية
 *
 * يوفر نقاط نهاية لـ:
 * - فحص حالة المحركات
 * - تشغيل مسح يدوي للسوق
 * - عرض حالة مراقب المراكز
 * - إدارة بث بيانات السوق
 *
 * جميع نقاط النهاية تتطلب مصادقة.
 */
@Controller('engine')
@UseGuards(AuthGuard)
export class EngineController {
  private readonly logger = new Logger(EngineController.name);

  constructor(
    private readonly scanner: MarketScannerService,
    private readonly monitor: PositionMonitorService,
    private readonly broadcaster: MarketBroadcasterService,
  ) {
    this.logger.log('⚙️ Engine Controller initialized (infrastructure-only)');
  }

  // ── Engine Health ──

  /**
   * GET /api/engine/health
   *
   * Returns the health status of all infrastructure engines.
   */
  @Get('health')
  async getEngineHealth() {
    try {
      const [
        lastScan,
        monitorStatus,
        trackedSymbols,
      ] = await Promise.all([
        this.scanner.getLastScan(),
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
            monitor: {
              status: monitorStatus.openPositions > 0 ? 'active' : 'idle',
              ...monitorStatus,
            },
            broadcaster: {
              status: trackedSymbols.length > 0 ? 'active' : 'idle',
              trackedSymbols: trackedSymbols.length,
            },
          },
          // Redirect info for migrated endpoints
          _migration: {
            bot: 'Moved to /api/smart-executor/*',
            council: 'Moved to /api/strategic-council/*',
          },
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      this.logger.error(`Engine health check failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(t('engine_controller.failure'));
    }
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
