import {
  Controller, Get, Post, Body, Param, UseGuards, Request, Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../common/guards/auth.guard';
import { NeuralPredictorService } from './services/neural-predictor.service';
import { BacktestRunnerService } from './services/backtest-runner.service';
import { NeuralSwarmService } from './services/neural-swarm.service';
import { PerformanceTrackerService } from '../analytics/services/performance-tracker.service';
import {
  BacktestRequest, NeuralTrainRequest, NeuralPredictRequest,
  SwarmStartRequest, BacktestStrategy, NeuralArchitecture, PredictionHorizon,
} from './neural.types';

@Controller('neural')
@UseGuards(AuthGuard)
export class NeuralController {
  private readonly logger = new Logger(NeuralController.name);

  constructor(
    private readonly predictor: NeuralPredictorService,
    private readonly backtestRunner: BacktestRunnerService,
    private readonly swarmService: NeuralSwarmService,
    private readonly perfTracker: PerformanceTrackerService,
  ) {
    this.logger.log('🧪 Neural Controller initialized — AI Trading Lab endpoints');
  }

  // ── Backtest ──

  @Post('backtest')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async runBacktest(@Request() req: any, @Body() body: BacktestRequest) {
    const result = await this.backtestRunner.runBacktest(req.user.id, {
      symbol: body.symbol,
      strategy: body.strategy || BacktestStrategy.MOMENTUM,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      initialCapital: body.initialCapital || 10000,
      positionSize: body.positionSize || 0.1,
      stopLoss: body.stopLoss || 0.03,
      takeProfit: body.takeProfit || 0.06,
    }, body.language || 'ar');
    return { success: true, data: result };
  }

  /** المرحلة 5: مقارنة جميع الاستراتيجيات على نفس الفترة */
  @Post('backtest/compare')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async compareStrategies(@Request() req: any, @Body() body: any) {
    const strategies = Object.values(BacktestStrategy);
    const results = await Promise.allSettled(
      strategies.map(strategy =>
        this.backtestRunner.runBacktest(req.user.id, {
          symbol: body.symbol || 'BTC/USDT',
          strategy,
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          initialCapital: body.initialCapital || 10000,
          positionSize: body.positionSize || 0.1,
          stopLoss: body.stopLoss || 0.03,
          takeProfit: body.takeProfit || 0.06,
        })
      )
    );

    const comparison = strategies.map((strategy, i) => ({
      strategy,
      result: results[i].status === 'fulfilled' ? (results[i] as any).value : null,
      error: results[i].status === 'rejected' ? (results[i] as any).reason?.message : null,
    })).sort((a, b) => (b.result?.winRate || 0) - (a.result?.winRate || 0));

    return { success: true, data: { comparison, symbol: body.symbol || 'BTC/USDT' } };
  }

  // ── Neural Network ──

  @Post('train')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async trainNeural(@Request() req: any, @Body() body: NeuralTrainRequest) {
    const model = await this.predictor.trainModel(
      req.user.id, body.symbol,
      body.architecture || NeuralArchitecture.ENSEMBLE,
      body.horizon || PredictionHorizon.MEDIUM,
      body.lookbackDays || 90,
    );
    return { success: true, data: model };
  }

  private _getLanguage(body: any): string {
    return body.language || 'ar';
  }

  @Post('predict')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async neuralPredict(@Request() req: any, @Body() body: NeuralPredictRequest) {
    const result = await this.predictor.predict(
      req.user.id, body.symbol, body.steps || 5, body.horizon || PredictionHorizon.MEDIUM, body.language || 'ar',
    );
    return { success: true, data: result };
  }

  @Get('models')
  async getModels(@Request() req: any) {
    return { success: true, data: this.predictor.getModels() };
  }

  // ── Swarm ──

  @Post('swarm/start')
  @Throttle({ default: { limit: 3, ttl: 120000 } })
  async startSwarm(@Request() req: any, @Body() body: SwarmStartRequest) {
    const result = await this.swarmService.startSwarm(req.user.id, {
      agents: body.agents || 3,
      symbols: body.symbols || ['BTC/USDT'],
      strategy: body.strategy || BacktestStrategy.AI_COUNCIL,
      riskTolerance: body.riskTolerance || 50,
    }, body.language || 'ar');
    return { success: true, data: result };
  }

  @Get('swarm/:id')
  async getSwarmStatus(@Request() req: any, @Param('id') swarmId: string) {
    return { success: true, data: this.swarmService.getSwarmStatus(swarmId, req.user.id) };
  }

  @Post('swarm/:id/stop')
  async stopSwarm(@Request() req: any, @Param('id') swarmId: string) {
    return { success: true, data: await this.swarmService.stopSwarm(req.user.id, swarmId) };
  }

  @Get('swarm')
  async getAllSwarms(@Request() req: any) {
    return { success: true, data: this.swarmService.getAllSwarms(req.user.id) };
  }

  // ── Performance Tracking (المرحلة 4) ──

  /** صحة النظام الكاملة: smart_executor vs agent + توصية */
  @Get('performance/health')
  async getSystemHealth(@Request() req: any) {
    const health = await this.perfTracker.getSystemHealth(req.user.id);
    return { success: true, data: health };
  }

  /** أداء مصدر معين: smart_executor / agent / user_manual */
  @Get('performance/:source')
  async getSourcePerformance(
    @Request() req: any,
    @Param('source') source: string,
  ) {
    const perf = await this.perfTracker.getSourcePerformance(req.user.id, source);
    return { success: true, data: perf };
  }
}
