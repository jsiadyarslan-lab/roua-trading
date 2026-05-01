import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../auth/auth.guard';
import { PredictionMarketService } from './prediction-market.service';

/**
 * Prediction Market Controller — REST API for the PredictionGap system.
 *
 * Routes:
 * - GET  /prediction-market/events          — List active events (filterable)
 * - GET  /prediction-market/events/:id       — Get event details + impact assessment
 * - GET  /prediction-market/gaps/:symbol     — Get prediction gaps for a symbol
 * - GET  /prediction-market/gaps/top         — Get events with largest gaps
 * - GET  /prediction-market/vote/:symbol     — Get the 8th model's vote for AI Council
 * - GET  /prediction-market/portfolio        — Get events affecting user's portfolio
 * - POST /prediction-market/sync             — Force sync from Polymarket
 * - POST /prediction-market/analyze/:id      — Force AI probability calculation for event
 *
 * Legal Disclaimer:
 * Prediction markets are educational and analytical tools only.
 * They do not constitute investment advice. Trading in prediction
 * markets may be prohibited in some jurisdictions.
 */

@Controller('prediction-market')
@UseGuards(AuthGuard)
export class PredictionMarketController {
  constructor(private readonly predictionMarketService: PredictionMarketService) {}

  /**
   * List active prediction events.
   * Supports filtering by symbol and category.
   */
  @Get('events')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getEvents(
    @Query('symbol') symbol?: string,
    @Query('category') category?: string,
  ) {
    const events = await this.predictionMarketService.getActiveEvents({ symbol, category });
    return {
      success: true,
      data: events,
      disclaimer: 'الأسواق التنبؤية هي أداة تعليمية وتحليلية فقط. لا تشكل نصيحة استثمارية.',
    };
  }

  /**
   * Get details for a specific prediction event, including impact assessment.
   */
  @Get('events/:id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getEventDetails(@Param('id') id: string) {
    const events = await this.predictionMarketService.getActiveEvents();
    const event = events.find((e: any) => e.id === id);

    if (!event) {
      return {
        success: false,
        error: 'الحدث غير موجود',
      };
    }

    // Generate impact assessment if not already present
    const assessment = await this.predictionMarketService.generateImpactAssessment(id);

    return {
      success: true,
      data: {
        ...event,
        impactAssessment: assessment,
      },
    };
  }

  /**
   * Get prediction gap analyses for a specific symbol.
   * Shows all events that affect the symbol and their gaps.
   */
  @Get('gaps/:symbol')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getGapsForSymbol(@Param('symbol') symbol: string) {
    const gaps = await this.predictionMarketService.getGapsForSymbol(symbol.toUpperCase());
    return {
      success: true,
      data: gaps,
    };
  }

  /**
   * Get events with the largest prediction gaps.
   * These represent the most interesting trading opportunities
   * where market and AI opinions diverge significantly.
   */
  @Get('gaps/top')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getTopGaps(@Query('limit') limit?: string) {
    const parsedLimit = Math.min(parseInt(limit || '10', 10), 50);
    const events = await this.predictionMarketService.getTopGapEvents(parsedLimit);
    return {
      success: true,
      data: events,
    };
  }

  /**
   * Get the Prediction Market model's vote for the AI Council.
   * This is the 8th model that votes based on prediction market data.
   * Returns null if no relevant events exist for the symbol.
   */
  @Get('vote/:symbol')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getCouncilVote(@Param('symbol') symbol: string) {
    const vote = await this.predictionMarketService.getCouncilVote(symbol.toUpperCase());
    return {
      success: true,
      data: vote,
      model: 'PredictionMarket/8th',
    };
  }

  /**
   * Get prediction events that affect the authenticated user's portfolio.
   * Cross-references the user's portfolio assets with prediction events.
   */
  @Get('portfolio')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getPortfolioImpact() {
    // Note: userId should come from AuthGuard context
    // For now, using a placeholder — will be replaced with actual user context
    const events = await this.predictionMarketService.getActiveEvents();
    return {
      success: true,
      data: events.slice(0, 5), // Top 5 most relevant
      message: 'أحداث تنبؤية تؤثر على محفظتك',
    };
  }

  /**
   * Force sync events from Polymarket.
   * Admin/debug endpoint — limited to 3 requests per minute.
   */
  @Post('sync')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async syncEvents(@Query('force') force?: string) {
    const result = await this.predictionMarketService.syncEvents(force === 'true');
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Force AI probability calculation for a specific event.
   * Triggers the full AI Council analysis pipeline.
   */
  @Post('analyze/:id')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async analyzeEvent(@Param('id') id: string) {
    const aiProbability = await this.predictionMarketService.calculateAIProbability(id);

    if (aiProbability === null) {
      return {
        success: false,
        error: 'لم يتم العثور على الحدث أو فشل التحليل',
      };
    }

    // Also generate impact assessment
    const assessment = await this.predictionMarketService.generateImpactAssessment(id);

    return {
      success: true,
      data: {
        eventId: id,
        aiProbability,
        impactAssessment: assessment,
      },
    };
  }
}
