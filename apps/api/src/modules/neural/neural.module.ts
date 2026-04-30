// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Neural Trading Lab Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { NeuralController } from './neural.controller';
import { NeuralPredictorService } from './services/neural-predictor.service';
import { BacktestRunnerService } from './services/backtest-runner.service';
import { NeuralSwarmService } from './services/neural-swarm.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';

/**
 * NeuralModule — AI-Powered Trading Lab
 *
 * Provides advanced trading tools powered by the existing AI Council:
 *
 * ┌───────────────────────────────────────────────────────────────┐
 * │  📊 Backtest Runner                                           │
 * │    Simulates historical trading with 6 strategies             │
 * │    Calculates Sharpe ratio, max drawdown, win rate            │
 * │    AI Council provides Arabic insights on results             │
 * │                                                               │
 * │  🧠 Neural Predictor                                          │
 * │    Multi-step price predictions via AI Council consensus       │
 * │    Confidence intervals from model agreement                   │
 * │    Architecture selection (LSTM/GRU/Transformer/Ensemble)      │
 * │                                                               │
 * │  🐝 Neural Swarm                                              │
 * │    Multi-agent trading coordination                           │
 * │    Democratic voting among AI agents                          │
 * │    Consensus-based trade decisions                            │
 * └───────────────────────────────────────────────────────────────┘
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ExchangeModule,
    AiModule,
    AuditModule,
  ],
  controllers: [NeuralController],
  providers: [
    NeuralPredictorService,
    BacktestRunnerService,
    NeuralSwarmService,
  ],
  exports: [
    NeuralPredictorService,
    BacktestRunnerService,
    NeuralSwarmService,
  ],
})
export class NeuralModule {}
