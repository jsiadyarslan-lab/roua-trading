import { Controller, Get, Param, Query, UseGuards, Request, Logger, ForbiddenException } from '@nestjs/common';
import { AnalyticalAIService } from './analytical-ai.service';
import { SignalGeneratorService } from './signal-generator.service';
import { PerformanceEventsService } from './services/performance-events.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

/**
 * Analytics Controller — Market Analysis & Signal Endpoints
 *
 * Endpoints:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ GET /analytics/analyze/:symbol  — Full asset analysis card    │
 * │ GET /analytics/signals/:symbol  — Signals for a symbol       │
 * │ POST /analytics/signals/:symbol — Generate new signal        │
 * └────────────────────────────────────────────────────────────────┘
 *
 * All endpoints require authentication via AuthGuard.
 * Rate limited to prevent abuse.
 */
@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticalAI: AnalyticalAIService,
    private readonly signalGenerator: SignalGeneratorService,
    private readonly performanceEvents: PerformanceEventsService,
  ) {
    this.logger.log('📊 Analytics Controller initialized');
  }

  /**
   * GET /api/analytics/analyze/:symbol
   *
   * Full analysis of an asset including:
   * - Aggregated market data from multiple sources
   * - Technical indicators (SMA, EMA, RSI, MACD, BB, ATR)
   * - AI-generated analysis text
   * - Sentiment assessment
   * - Risk level evaluation
   *
   * Rate limited: 10 requests per minute
   */
  @Get('analyze/:symbol')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async analyzeAsset(
    @Request() req: any,
    @Param('symbol') symbol: string,
  ) {
    this.logger.debug(`Analysis request: ${symbol} (user: ${req.user?.id})`);

    // Decode URL-encoded symbol (e.g., BTC%2FUSDT → BTC/USDT)
    let decodedSymbol: string;
    try {
      decodedSymbol = decodeURIComponent(symbol);
    } catch {
      decodedSymbol = symbol;
    }

    const analysisCard = await this.analyticalAI.analyzeAsset(decodedSymbol);

    return {
      success: true,
      data: analysisCard,
    };
  }

  /**
   * GET /api/analytics/signals/:symbol
   *
   * Get recent signals for a specific symbol.
   * Returns the last 10 signals for the authenticated user.
   */
  @Get('signals/:symbol')
  async getSignalsForSymbol(
    @Request() req: any,
    @Param('symbol') symbol: string,
    @Query('limit') limit?: string,
  ) {
    let decodedSymbol: string;
    try {
      decodedSymbol = decodeURIComponent(symbol);
    } catch {
      decodedSymbol = symbol;
    }
    const parsedLimit = limit ? (parseInt(limit, 10) || 10) : 10;

    const signals = await this.signalGenerator.getSignalsForSymbol(
      req.user.id,
      decodedSymbol,
      parsedLimit,
    );

    return {
      success: true,
      data: signals,
    };
  }

  /**
   * GET /api/analytics/performance/snapshot
   *
   * Real-time performance snapshot for the authenticated user.
   * Returns unified metrics: Sharpe ratio, max drawdown, Kelly criterion,
   * daily PnL, win rate — broken down by source (smart_executor, agent).
   */
  @Get('performance/snapshot')
  async getPerformanceSnapshot(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('User not authenticated');
    const snapshot = await this.performanceEvents.getPerformanceSnapshot(userId);
    return {
      success: true,
      data: snapshot,
    };
  }

  /**
   * GET /api/analytics/performance/events
   *
   * Recent trade closure events for the authenticated user (last 24h).
   * Used by dashboard for real-time trade feed.
   */
  @Get('performance/events')
  async getRecentTradeEvents(@Request() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('User not authenticated');
    const events = await this.performanceEvents.getRecentTradeEvents(userId, parseInt(limit || '50'));
    return {
      success: true,
      data: events,
    };
  }
}
