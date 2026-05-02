// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { TradingModule } from '../../modules/trading/trading.module';
import { ExchangeModule } from '../../modules/exchange/exchange.module';

// Agent Services
import { MarketAnalyzerService } from './services/market-analyzer.service';
import { SignalEvaluatorService } from './services/signal-evaluator.service';
import { RiskCalculatorService } from './services/risk-calculator.service';
import { OrderExecutorService } from './services/order-executor.service';
import { AutonomousTraderAgentService } from './agent.service';

// Agent Controller
import { AutonomousTraderAgentController, AutonomousTraderPublicController } from './agent.controller';

/**
 * AutonomousTraderAgentModule — The Crown Jewel of Roua Trading
 *
 * This module is the culmination of all trading engines. It provides
 * a fully autonomous trading agent that manages the complete trade
 * lifecycle without human intervention:
 *
 * ┌────────────────────────────────────────────────────────────┐
 * │                                                            │
 * │  🔍 MarketAnalyzerService   — Real-time market analysis   │
 * │  📊 SignalEvaluatorService  — Strategy-based evaluation   │
 * │  🛡️ RiskCalculatorService   — Capital protection engine   │
 * │  ⚡ OrderExecutorService    — Safe order execution         │
 * │  🧠 AgentService            — Orchestration & lifecycle    │
 * │                                                            │
 * │  Strategies:                                               │
 * │  ├─ Scalping — High-frequency small profits               │
 * │  ├─ Swing    — Medium-term trend following                │
 * │  └─ Grid     — Range-bound systematic trading             │
 * │                                                            │
 * │  Safety Systems:                                           │
 * │  ├─ Mandatory stop-loss (non-disableable)                 │
 * │  ├─ Daily loss limit with auto-stop                       │
 * │  ├─ No withdrawal capability                              │
 * │  └─ Full audit trail for every decision                   │
 * │                                                            │
 * └────────────────────────────────────────────────────────────┘
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuditModule,
    TradingModule,
    ExchangeModule,
  ],
  controllers: [AutonomousTraderPublicController, AutonomousTraderAgentController],
  providers: [
    // Core Services
    MarketAnalyzerService,
    SignalEvaluatorService,
    RiskCalculatorService,
    OrderExecutorService,
    AutonomousTraderAgentService,
  ],
  exports: [
    AutonomousTraderAgentService,
    MarketAnalyzerService,
    SignalEvaluatorService,
    RiskCalculatorService,
    OrderExecutorService,
  ],
})
export class AutonomousTraderAgentModule {}
