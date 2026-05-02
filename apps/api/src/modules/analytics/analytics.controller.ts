import { Controller, Get, Param, Query, UseGuards, Request, Logger } from '@nestjs/common';
import { AnalyticalAIService } from './analytical-ai.service';
import { SignalGeneratorService } from './signal-generator.service';
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
    const decodedSymbol = decodeURIComponent(symbol);

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
    const decodedSymbol = decodeURIComponent(symbol);
    const parsedLimit = limit ? parseInt(limit, 10) : 10;

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
}
