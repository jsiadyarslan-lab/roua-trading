// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Advanced Scanner Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { MarketCategory } from './scanner.types';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  /**
   * GET /api/scanner/scan
   * Full market scan with all symbols
   * Query params: timeframe (15min|1h|4h|1day), category (ALL|CRYPTO|FOREX|STOCK|COMMODITY)
   */
  @Get('scan')
  async fullScan(
    @Query('timeframe') timeframe?: string,
    @Query('category') category?: string,
  ) {
    const tf = ['15min', '1h', '4h', '1day'].includes(timeframe || '') ? timeframe : '1h';
    const cat = Object.values(MarketCategory).includes(category as MarketCategory)
      ? (category as MarketCategory)
      : undefined;

    return this.scannerService.fullScan(tf, cat);
  }

  /**
   * GET /api/scanner/heatmap
   * Heatmap data sorted by change percentage
   * Query params: category
   */
  @Get('heatmap')
  async heatmap(@Query('category') category?: string) {
    const cat = Object.values(MarketCategory).includes(category as MarketCategory)
      ? (category as MarketCategory)
      : undefined;

    return this.scannerService.heatmapData(cat);
  }

  /**
   * GET /api/scanner/analysis/:symbol
   * Deep analysis for a single symbol
   * Includes technical indicators, AI analysis, patterns, support/resistance
   */
  @Get('analysis/:symbol')
  async deepAnalysis(@Param('symbol') symbol: string) {
    return this.scannerService.deepAnalysis(symbol);
  }

  /**
   * GET /api/scanner/multi-tf/:symbol
   * Multi-timeframe analysis for a single symbol
   * Analyzes 15min, 1h, 4h, 1day and computes alignment
   */
  @Get('multi-tf/:symbol')
  async multiTimeframeAnalysis(@Param('symbol') symbol: string) {
    return this.scannerService.multiTimeframeAnalysis(symbol);
  }

  /**
   * GET /api/scanner/overview
   * Market overview with sentiment, top movers, strongest signals
   */
  @Get('overview')
  async marketOverview() {
    return this.scannerService.marketOverview();
  }

  /**
   * POST /api/scanner/run
   * Force a fresh scan (rate-limited)
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async forceScan(
    @Query('timeframe') timeframe?: string,
    @Query('category') category?: string,
  ) {
    const tf = ['15min', '1h', '4h', '1day'].includes(timeframe || '') ? timeframe : '1h';
    const cat = Object.values(MarketCategory).includes(category as MarketCategory)
      ? (category as MarketCategory)
      : undefined;

    // Clear cache first to force fresh data
    return this.scannerService.fullScan(tf, cat);
  }
}
