// ─── Integration Controller V1 ────────────────────────────
// API endpoints for cross-platform integration with Roua News.
// All endpoints require X-Integration-Key header for authentication.
// These endpoints serve chart data, signals, and market data to the news site.
//
// IMPORTANT: Uses @Public() to bypass the global AuthGuard, then
// uses @UseGuards(IntegrationGuard) to enforce integration API key auth.
// This creates a separate auth channel for server-to-server communication.

import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/guards/auth.guard';
import { IntegrationGuard, IntegrationRoute } from '../../common/guards/integration.guard';
import { ExchangeService } from '../exchange/exchange.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Public() // Bypass AuthGuard — integration uses its own auth
@IntegrationRoute() // Mark all routes in this controller for IntegrationGuard auth
@UseGuards(IntegrationGuard) // Enforce X-Integration-Key authentication
@Controller('integration')
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly exchangeService: ExchangeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/integration/health
   * Health check for integration endpoints.
   * Tests database connectivity and returns basic stats.
   */
  @Get('health')
  async healthCheck() {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string; [key: string]: any }> = {};

    // Database check
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (error: any) {
      checks.database = { status: 'error', error: error?.message };
    }

    // Exchange service check
    try {
      checks.exchangeService = {
        status: 'ok',
        note: 'ExchangeService available',
      };
    } catch (error: any) {
      checks.exchangeService = { status: 'error', error: error?.message };
    }

    // Signal count check
    try {
      const activeSignals = await this.prisma.signal.count({
        where: { status: 'ACTIVE' },
      });
      checks.signalService = {
        status: 'ok',
        activeSignals,
      };
    } catch (error: any) {
      checks.signalService = { status: 'error', error: error?.message };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'roua-trading',
      version: '1.0',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * GET /api/integration/chart?symbol=BTC-USDT&interval=1day&limit=200
   * Get OHLCV candlestick data for a symbol.
   */
  @Get('chart')
  async getChartData(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string = '1day',
    @Query('limit') limit: string = '200',
  ) {
    if (!symbol) {
      return { error: 'symbol parameter is required', status: 400 };
    }

    // Normalize symbol: BTC-USDT → BTC/USDT (news site may send dash-separated)
    const normalizedSymbol = symbol.replace(/-/g, '/');

    try {
      const candles = await this.exchangeService.getHistoricalData(
        normalizedSymbol,
        interval,
      );

      return {
        symbol: normalizedSymbol,
        interval,
        candles,
        count: Array.isArray(candles) ? candles.length : 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Chart data fetch failed for ${normalizedSymbol}: ${error?.message}`);
      return {
        symbol: normalizedSymbol,
        error: error?.message || 'Failed to fetch chart data',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/quote?symbol=BTC-USDT
   * Get real-time quote for a symbol.
   */
  @Get('quote')
  async getQuote(@Query('symbol') symbol: string) {
    if (!symbol) {
      return { error: 'symbol parameter is required', status: 400 };
    }

    // Normalize symbol: BTC-USDT → BTC/USDT (news site may send dash-separated)
    const normalizedSymbol = symbol.replace(/-/g, '/');

    try {
      const quote = await this.exchangeService.getQuote(normalizedSymbol);
      return {
        symbol: normalizedSymbol,
        quote,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Quote fetch failed for ${normalizedSymbol}: ${error?.message}`);
      return {
        symbol: normalizedSymbol,
        error: error?.message || 'Failed to fetch quote',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/signals?symbol=BTC-USDT&limit=20
   * Get active trading signals.
   */
  @Get('signals')
  async getActiveSignals(
    @Query('symbol') symbol?: string,
    @Query('limit') limit: string = '20',
  ) {
    try {
      const where: any = { status: 'ACTIVE' };
      if (symbol) {
        where.pair = { contains: symbol.replace(/-/g, '/'), mode: 'insensitive' };
      }

      const signals = await this.prisma.signal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 50),
      });

      return {
        signals,
        count: signals.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Signals fetch failed: ${error?.message}`);
      return {
        error: error?.message || 'Failed to fetch signals',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/signals/history?limit=20
   * Get recent signal history (all statuses, for display on news site).
   */
  @Get('signals/history')
  async getSignalHistory(
    @Query('limit') limit: string = '20',
  ) {
    try {
      const signals = await this.prisma.signal.findMany({
        where: {
          status: { in: ['ACTIVE', 'EXPIRED', 'EXECUTED', 'CANCELLED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 50),
        select: {
          id: true,
          pair: true,
          action: true,
          confidence: true,
          reason: true,
          entryPrice: true,
          stopLoss: true,
          takeProfit: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      return {
        signals,
        count: signals.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Signal history fetch failed: ${error?.message}`);
      return {
        error: error?.message || 'Failed to fetch signal history',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/signals/stats
   * Get signal statistics for the news site.
   */
  @Get('signals/stats')
  async getSignalStats() {
    try {
      const [active, expired, executed, cancelled] = await Promise.all([
        this.prisma.signal.count({ where: { status: 'ACTIVE' } }),
        this.prisma.signal.count({ where: { status: 'EXPIRED' } }),
        this.prisma.signal.count({ where: { status: 'EXECUTED' } }),
        this.prisma.signal.count({ where: { status: 'CANCELLED' } }),
      ]);

      // Get recent accuracy: how many executed signals were profitable
      const recentExecuted = await this.prisma.signal.findMany({
        where: { status: 'EXECUTED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { action: true, pair: true, entryPrice: true, takeProfit: true, stopLoss: true },
      });

      return {
        total: active + expired + executed + cancelled,
        active,
        expired,
        executed,
        cancelled,
        recentSignals: recentExecuted.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Signal stats fetch failed: ${error?.message}`);
      return {
        error: error?.message || 'Failed to fetch signal stats',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
