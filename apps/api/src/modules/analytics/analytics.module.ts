import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { MarketDataAggregatorService } from './aggregator.service';
import { TechnicalIndicatorService } from './indicators.service';
import { AnalyticalAIService } from './analytical-ai.service';
import { SignalGeneratorService } from './signal-generator.service';
import { FinnhubAdapter } from './finnhub.adapter';
import { PerformanceEventsService } from './services/performance-events.service';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';

/**
 * Analytics Module — Market Analysis Engine
 *
 * Provides comprehensive market analysis capabilities:
 *
 * Services:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ FinnhubAdapter           — Finnhub market data integration    │
 * │ MarketDataAggregatorService — Multi-source data fusion        │
 * │ TechnicalIndicatorService — Technical analysis (SMA/EMA/RSI…) │
 * │ AnalyticalAIService       — AI-powered analysis pipeline      │
 * │ SignalGeneratorService    — Trading signal generation          │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Dependencies:
 * - ExchangeModule: Twelve Data + Binance/CCXT market data
 * - AiModule: AI Orchestrator + RAG pipeline
 * - AuditModule: Audit logging for signal generation
 */
@Module({
  imports: [
    ExchangeModule,
    AiModule,
    AuditModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    // Data Sources
    FinnhubAdapter,

    // Core Services
    MarketDataAggregatorService,
    TechnicalIndicatorService,
    AnalyticalAIService,
    SignalGeneratorService,

    // V176: Real-time Performance Monitoring
    PerformanceEventsService,
  ],
  exports: [
    MarketDataAggregatorService,
    TechnicalIndicatorService,
    AnalyticalAIService,
    SignalGeneratorService,
    PerformanceEventsService,
  ],
})
export class AnalyticsModule {}
