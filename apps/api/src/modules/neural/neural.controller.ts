// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Neural Trading Lab Controller
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
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../common/guards/auth.guard';
import { NeuralPredictorService } from './services/neural-predictor.service';
import { BacktestRunnerService } from './services/backtest-runner.service';
import { NeuralSwarmService } from './services/neural-swarm.service';
import {
  BacktestRequest,
  NeuralTrainRequest,
  NeuralPredictRequest,
  SwarmStartRequest,
  BacktestStrategy,
  NeuralArchitecture,
  PredictionHorizon,
} from './neural.types';

@Controller('neural')
@UseGuards(AuthGuard)
export class NeuralController {
  private readonly logger = new Logger(NeuralController.name);

  constructor(
    private readonly predictor: NeuralPredictorService,
    private readonly backtestRunner: BacktestRunnerService,
    private readonly swarmService: NeuralSwarmService,
  ) {
    this.logger.log('🧪 Neural Controller initialized — AI Trading Lab endpoints');
  }

  // ── Backtest ──

  @Post('backtest')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async runBacktest(@Request() req: any, @Body() body: BacktestRequest) {
    this.logger.debug(`Backtest request: ${body.strategy} on ${body.symbol} (${req.user.id})`);

    const result = await this.backtestRunner.runBacktest(req.user.id, {
      symbol: body.symbol,
      strategy: body.strategy || BacktestStrategy.MOMENTUM,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      initialCapital: body.initialCapital || 10000,
      positionSize: body.positionSize || 0.1,
      stopLoss: body.stopLoss || 0.03,
      takeProfit: body.takeProfit || 0.06,
    });

    return { success: true, data: result };
  }

  // ── Neural Network ──

  @Post('train')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async trainNeural(@Request() req: any, @Body() body: NeuralTrainRequest) {
    this.logger.debug(`Train request: ${body.architecture} for ${body.symbol} (${req.user.id})`);

    const model = await this.predictor.trainModel(
      req.user.id,
      body.symbol,
      body.architecture || NeuralArchitecture.ENSEMBLE,
      body.horizon || PredictionHorizon.MEDIUM,
      body.lookbackDays || 90,
    );

    return { success: true, data: model };
  }

  @Post('predict')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async neuralPredict(@Request() req: any, @Body() body: NeuralPredictRequest) {
    this.logger.debug(`Predict request: ${body.symbol} × ${body.steps} steps (${req.user.id})`);

    const result = await this.predictor.predict(
      req.user.id,
      body.symbol,
      body.steps || 5,
      body.horizon || PredictionHorizon.MEDIUM,
    );

    return { success: true, data: result };
  }

  @Get('models')
  async getModels(@Request() req: any) {
    const models = this.predictor.getModels();
    return { success: true, data: models };
  }

  // ── Swarm ──

  @Post('swarm/start')
  @Throttle({ default: { limit: 3, ttl: 120000 } })
  async startSwarm(@Request() req: any, @Body() body: SwarmStartRequest) {
    this.logger.debug(`Swarm start: ${body.agents} agents (${req.user.id})`);

    const result = await this.swarmService.startSwarm(req.user.id, {
      agents: body.agents || 3,
      symbols: body.symbols || ['BTC/USDT'],
      strategy: body.strategy || BacktestStrategy.AI_COUNCIL,
      riskTolerance: body.riskTolerance || 50,
    });

    return { success: true, data: result };
  }

  @Get('swarm/:id')
  async getSwarmStatus(@Request() req: any, @Param('id') swarmId: string) {
    const result = this.swarmService.getSwarmStatus(swarmId);
    return { success: true, data: result };
  }

  @Post('swarm/:id/stop')
  async stopSwarm(@Request() req: any, @Param('id') swarmId: string) {
    const result = await this.swarmService.stopSwarm(req.user.id, swarmId);
    return { success: true, data: result };
  }

  @Get('swarm')
  async getAllSwarms(@Request() req: any) {
    const result = this.swarmService.getAllSwarms();
    return { success: true, data: result };
  }
}
