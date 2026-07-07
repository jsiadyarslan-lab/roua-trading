// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trader Agent Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { TradingModule } from '../../modules/trading/trading.module';
import { ExchangeModule } from '../../modules/exchange/exchange.module';
import { AiModule } from '../../modules/ai/ai.module';
import { StrategicCouncilModule } from '../../modules/ai/strategic-council/strategic-council.module';
import { SmartExecutorModule } from '../../modules/ai/smart-executor/smart-executor.module'; // BUG-066k
import { PortfolioModule } from '../../modules/portfolio/portfolio.module';

// Agent Services
import { MarketAnalyzerService } from './services/market-analyzer.service';
import { SignalEvaluatorService } from './services/signal-evaluator.service';
// REMOVED: RiskCalculatorService — deprecated, replaced by UnifiedRiskService (V219)
import { OrderExecutorService } from './services/order-executor.service';
import { AdaptiveStrategySelectorService } from './services/adaptive-strategy-selector.service';
import { MultiTimeframeAnalysisService } from './services/multi-timeframe-analysis.service'; // V-PHASE3
import { SignalQualityClassifierService } from './services/signal-quality-classifier.service'; // V-PHASE4
import { StrategyABTestingService } from './services/strategy-ab-testing.service'; // V-PHASE4
import { RLTradeManagerService } from './services/rl-trade-manager.service'; // V-PHASE4
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
 *
 * RESILIENCE: Uses forwardRef for PrismaModule and RedisModule to prevent
 * circular dependency issues during cold start. The agent.service.ts uses
 * @Optional() for these dependencies so the module can load even if they
 * are temporarily unavailable, returning 503 Service Unavailable instead
 * of causing the entire module (and all its routes) to fail with 404.
 */
@Module({
  imports: [
    // V170 FIX: Removed ALL forwardRef() wrappers — there are NO circular dependencies
    // here. forwardRef() defers DI resolution, causing a race condition where
    // providers from these modules are unavailable when agent.service.ts needs them.
    // This was the ROOT CAUSE of the "0 routes" bug — modules failed to initialize
    // because their providers resolved to null during the DI resolution phase.
    AuditModule,
    TradingModule,
    ExchangeModule,
    AiModule,
    StrategicCouncilModule,  // V145: Agent needs council briefs (M30+) to execute trades
    PortfolioModule,  // V150: Agent needs CredentialsService for pre-trade balance check
    SmartExecutorModule,  // BUG-066k: For reset endpoint to re-enable Smart Executor
  ],
  controllers: [AutonomousTraderPublicController, AutonomousTraderAgentController],
  providers: [
    // Core Services
    MultiTimeframeAnalysisService, // V-PHASE3: Must be before MarketAnalyzer (dependency)
    MarketAnalyzerService,
    AdaptiveStrategySelectorService,
    SignalEvaluatorService,
    OrderExecutorService,
    // V-PHASE4: Advanced optimization services
    SignalQualityClassifierService,
    StrategyABTestingService,
    RLTradeManagerService,
    AutonomousTraderAgentService,
  ],
  exports: [
    AutonomousTraderAgentService,
    MarketAnalyzerService,
    MultiTimeframeAnalysisService, // V-PHASE3: Export for SmartExecutor to use strategy-specific MTF
    SignalEvaluatorService,
    AdaptiveStrategySelectorService,
    OrderExecutorService,
    // V-PHASE4: Export for SmartExecutor and other modules
    SignalQualityClassifierService,
    StrategyABTestingService,
    RLTradeManagerService,
  ],
})
export class AutonomousTraderAgentModule {}
