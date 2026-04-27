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
  Logger,
  InternalServerErrorException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { MarketCategory } from './scanner.types';
import { AuthGuard } from '../../common/guards/auth.guard';

@Controller('scanner')
@UseGuards(AuthGuard)
export class ScannerController {
  private readonly logger = new Logger(ScannerController.name);

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

    try {
      return await this.scannerService.fullScan(tf, cat);
    } catch (error: any) {
      this.logger.error(`Full scan failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في إجراء المسح الكامل للسوق');
    }
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

    try {
      return await this.scannerService.heatmapData(cat);
    } catch (error: any) {
      this.logger.error(`Heatmap failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في جلب بيانات خريطة الحرارة');
    }
  }

  /**
   * GET /api/scanner/analysis/:symbol
   * Deep analysis for a single symbol
   * Includes technical indicators, AI analysis, patterns, support/resistance
   */
  @Get('analysis/:symbol')
  async deepAnalysis(@Param('symbol') symbol: string) {
    try {
      return await this.scannerService.deepAnalysis(symbol);
    } catch (error: any) {
      this.logger.error(`Deep analysis failed for ${symbol}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`فشل في تحليل ${symbol}`);
    }
  }

  /**
   * GET /api/scanner/multi-tf/:symbol
   * Multi-timeframe analysis for a single symbol
   * Analyzes 15min, 1h, 4h, 1day and computes alignment
   */
  @Get('multi-tf/:symbol')
  async multiTimeframeAnalysis(@Param('symbol') symbol: string) {
    try {
      return await this.scannerService.multiTimeframeAnalysis(symbol);
    } catch (error: any) {
      this.logger.error(`Multi-TF analysis failed for ${symbol}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`فشل في التحليل متعدد الأطر الزمنية لـ ${symbol}`);
    }
  }

  /**
   * GET /api/scanner/overview
   * Market overview with sentiment, top movers, strongest signals
   */
  @Get('overview')
  async marketOverview() {
    try {
      return await this.scannerService.marketOverview();
    } catch (error: any) {
      this.logger.error(`Market overview failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في جلب نظرة عامة على السوق');
    }
  }

  /**
   * POST /api/scanner/run
   * Force a fresh scan (rate-limited)
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async forceScan(
    @Req() req: any,
    @Query('timeframe') timeframe?: string,
    @Query('category') category?: string,
  ) {
    const tf = ['15min', '1h', '4h', '1day'].includes(timeframe || '') ? timeframe : '1h';
    const cat = Object.values(MarketCategory).includes(category as MarketCategory)
      ? (category as MarketCategory)
      : undefined;

    try {
      // Clear cache first to force fresh data
      return await this.scannerService.fullScan(tf, cat);
    } catch (error: any) {
      this.logger.error(`Force scan failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('فشل في إجراء المسح الإجباري');
    }
  }
}
