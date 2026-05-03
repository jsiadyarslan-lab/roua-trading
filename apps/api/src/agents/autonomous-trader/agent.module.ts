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
import { AdaptiveStrategySelectorService } from './services/adaptive-strategy-selector.service';
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
 * │  🔍 MarketAnalyzerService           — Real-time analysis  │
 * │  🧠 AdaptiveStrategySelectorService — Auto regime detect  │
 * │  📊 SignalEvaluatorService          — Strategy evaluation  │
 * │  🛡️ RiskCalculatorService           — Capital protection   │
 * │  ⚡ OrderExecutorService            — Safe execution       │
 * │  🧠 AgentService                    — Orchestration        │
 * │                                                            │
 * │  Strategies:                                               │
 * │  ├─ AUTO          — Adaptive auto-selection (recommended)  │
 * │  ├─ Scalping      — High-frequency small profits           │
 * │  ├─ Swing         — Medium-term trend following            │
 * │  ├─ Grid          — Range-bound systematic trading         │
 * │  ├─ MeanReversion — Statistical price reversion            │
 * │  ├─ Breakout      — Momentum breakout detection            │
 * │  ├─ DCA           — Dollar-cost averaging                  │
 * │  └─ VWAP+RSI      — Institutional benchmark strategy       │
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
    AdaptiveStrategySelectorService,
    SignalEvaluatorService,
    RiskCalculatorService,
    OrderExecutorService,
    AutonomousTraderAgentService,
  ],
  exports: [
    AutonomousTraderAgentService,
    MarketAnalyzerService,
    SignalEvaluatorService,
    AdaptiveStrategySelectorService,
    RiskCalculatorService,
    OrderExecutorService,
  ],
})
export class AutonomousTraderAgentModule {}
