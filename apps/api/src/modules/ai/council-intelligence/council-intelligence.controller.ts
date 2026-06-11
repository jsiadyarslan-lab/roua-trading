// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Council Intelligence Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API endpoints for all V185 council intelligence features
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Query, Param, Post, Body } from '@nestjs/common';
import { TradeJournalService } from './trade-journal.service';
import { CouncilVoteAccuracyService } from './council-vote-accuracy.service';
import { MarketRegimeService } from './market-regime.service';
import { CrossPairCorrelationService } from './cross-pair-correlation.service';
import { DynamicPositionSizingService } from './dynamic-position-sizing.service';
import { SystemMemoryService } from './system-memory.service';
import { AdaptiveScheduleService } from './adaptive-schedule.service';
import { SelfHealingService } from './self-healing.service';
import { BacktestingEngineService } from './backtesting-engine.service';

@Controller('council-intelligence')
export class CouncilIntelligenceController {

  constructor(
    private readonly journal: TradeJournalService,
    private readonly accuracy: CouncilVoteAccuracyService,
    private readonly regime: MarketRegimeService,
    private readonly correlation: CrossPairCorrelationService,
    private readonly sizing: DynamicPositionSizingService,
    private readonly memory: SystemMemoryService,
    private readonly schedule: AdaptiveScheduleService,
    private readonly healing: SelfHealingService,
    private readonly backtesting: BacktestingEngineService,
  ) {}

  // ── Trade Journal ──

  @Get('journal/:userId')
  async getJournals(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.journal.getRecentJournals(userId, Number(limit) || 20);
  }

  @Get('journal/:userId/stats')
  async getTradeStats(
    @Param('userId') userId: string,
    @Query('days') days?: string,
  ) {
    return this.journal.getTradeStats(userId, Number(days) || 30);
  }

  // ── Council Vote Accuracy ──

  @Get('accuracy/:userId')
  async getAccuracyReport(@Param('userId') userId: string) {
    return this.accuracy.getAccuracyReport(userId);
  }

  @Post('accuracy/:userId/recalculate')
  async recalculateWeights(@Param('userId') userId: string) {
    return this.accuracy.recalculateWeights(userId);
  }

  // ── Market Regime ──

  @Get('regime/:symbol')
  async getRegime(@Param('symbol') symbol: string) {
    return this.regime.detectRegime(symbol);
  }

  @Get('regime')
  async getAllRegimes(@Query('symbols') symbols?: string) {
    const list = symbols ? symbols.split(',') : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT'];
    return this.regime.getAllRegimes(list);
  }

  // ── Cross-Pair Correlation ──

  @Get('correlation')
  async getCorrelationMatrix() {
    return this.correlation.getCorrelationMatrix();
  }

  // ── Dynamic Position Sizing ──

  @Get('sizing/:userId/:symbol')
  async getPositionSizing(
    @Param('userId') userId: string,
    @Param('symbol') symbol: string,
    @Query('direction') direction: string,
    @Query('consensusScore') consensusScore: string,
    @Query('confidence') confidence: string,
  ) {
    return this.sizing.calculateSizeMultiplier({
      userId,
      symbol,
      direction: (direction || 'BUY') as 'BUY' | 'SELL',
      consensusScore: Number(consensusScore) || 60,
      confidence: Number(confidence) || 60,
      councilVotes: {},
      existingPositions: [],
    });
  }

  // ── System Memory ──

  @Get('memory/:userId')
  async getMemoryContext(
    @Param('userId') userId: string,
    @Query('symbol') symbol?: string,
  ) {
    const context = await this.memory.getMemoryContext(userId, symbol);
    return { context };
  }

  @Post('memory/:userId')
  async storeMemory(
    @Param('userId') userId: string,
    @Body() body: { type: string; content: string; symbol?: string; confidence?: number },
  ) {
    return this.memory.storeMemory(userId, {
      type: body.type as any,
      content: body.content,
      symbol: body.symbol,
      confidence: body.confidence,
    });
  }

  // ── Adaptive Schedule ──

  @Get('schedule')
  async getAllSchedules() {
    return this.schedule.getAllSchedules();
  }

  @Get('schedule/:symbol')
  async getSchedule(@Param('symbol') symbol: string) {
    return this.schedule.getRecommendedInterval(symbol);
  }

  @Post('schedule/:symbol/emergency')
  async triggerEmergency(
    @Param('symbol') symbol: string,
    @Body() body: { reason: string },
  ) {
    await this.schedule.triggerEmergencySession(symbol, body.reason || 'Manual trigger');
    return { status: 'EMERGENCY_TRIGGERED', symbol };
  }

  // ── Self-Healing ──

  @Get('health')
  async getHealthReport() {
    return this.healing.getHealthReport();
  }

  @Post('health/:component/enable')
  async enableComponent(@Param('component') component: string) {
    await this.healing.enableComponent(component);
    return { status: 'ENABLED', component };
  }

  // ── Backtesting ──

  @Post('backtest')
  async runBacktest(@Body() body: {
    symbol: string;
    startDate: string;
    endDate: string;
    initialBalance?: number;
    riskPerTrade?: number;
    minConfidence?: number;
    minConsensus?: number;
  }) {
    return this.backtesting.runBacktest({
      symbol: body.symbol,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      initialBalance: body.initialBalance || 10000,
      riskPerTrade: body.riskPerTrade || 0.01,
      minConfidence: body.minConfidence || 50,
      minConsensus: body.minConsensus || 55,
    });
  }

  // ── V185 Integrity Check ──

  @Get('integrity')
  async checkIntegrity() {
    const checks: { id: string; name: string; status: string; detail: string }[] = [];

    // Check each service is functional
    try {
      const regimes = await this.regime.detectRegime('BTC/USDT');
      checks.push({
        id: 'V16a', name: 'Market Regime Detection',
        status: regimes.regime ? 'PASS' : 'FAIL',
        detail: `Regime=${regimes.regime}, Confidence=${regimes.confidence}%`,
      });
    } catch (e: any) {
      checks.push({ id: 'V16a', name: 'Market Regime Detection', status: 'FAIL', detail: e.message });
    }

    try {
      const matrix = await this.correlation.getCorrelationMatrix();
      const pairCount = Object.keys(matrix).length;
      checks.push({
        id: 'V16b', name: 'Cross-Pair Correlation',
        status: pairCount > 0 ? 'PASS' : 'WARN',
        detail: `${pairCount} pairs in correlation matrix`,
      });
    } catch (e: any) {
      checks.push({ id: 'V16b', name: 'Cross-Pair Correlation', status: 'FAIL', detail: e.message });
    }

    try {
      const health = await this.healing.getHealthReport();
      const healthy = health.filter(h => h.status === 'HEALTHY').length;
      checks.push({
        id: 'V16c', name: 'Self-Healing Monitor',
        status: 'PASS',
        detail: `${healthy}/${health.length} components healthy`,
      });
    } catch (e: any) {
      checks.push({ id: 'V16c', name: 'Self-Healing Monitor', status: 'FAIL', detail: e.message });
    }

    try {
      const schedules = await this.schedule.getAllSchedules();
      checks.push({
        id: 'V16d', name: 'Adaptive Scheduling',
        status: 'PASS',
        detail: `${schedules.length} symbols tracked`,
      });
    } catch (e: any) {
      checks.push({ id: 'V16d', name: 'Adaptive Scheduling', status: 'FAIL', detail: e.message });
    }

    const passCount = checks.filter(c => c.status === 'PASS').length;
    const overall = passCount === checks.length ? 'ALL_PASS' : `${passCount}/${checks.length}_PASS`;

    return { version: 'V185', overall, checks };
  }
}
