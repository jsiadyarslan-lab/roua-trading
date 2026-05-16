import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { PredictionMarketController } from './prediction-market.controller';
import { PredictionMarketService } from './prediction-market.service';
import { PolymarketAdapter } from './adapters/polymarket.adapter';

/**
 * Prediction Market Module — Polymarket Integration (Phase 7)
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  PredictionMarketModule                                      │
 * │  ┌────────────────────┐   ┌──────────────────────────────┐  │
 * │  │ PolymarketAdapter  │──▶│  PredictionMarketService     │  │
 * │  │ (API → Unified)    │   │  - syncEvents()              │  │
 * │  └────────────────────┘   │  - calculateAIProbability()  │  │
 * │                            │  - analyzePredictionGap()    │  │
 * │  ┌────────────────────┐   │  - getCouncilVote()          │  │
 * │  │  RedisService      │──▶│  - generateImpactAssessment()│  │
 * │  │  (Caching layer)   │   └──────────────────────────────┘  │
 * │  └────────────────────┘                                     │
 * │  ┌────────────────────┐   ┌──────────────────────────────┐  │
 * │  │  AIOrchestrator    │──▶│  PredictionMarketController  │  │
 * │  │  (AI Council)      │   │  - REST API endpoints        │  │
 * │  └────────────────────┘   └──────────────────────────────┘  │
 * │  ┌────────────────────┐                                     │
 * │  │  PrismaService     │  DB: PredictionEvent table         │
 * │  └────────────────────┘                                     │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Caching Strategy (per architecture review):
 * - Redis cache for Polymarket API data: 5 minutes TTL
 * - Redis cache for event lists: 1 hour TTL
 * - Redis cache for gap analyses: 10 minutes TTL
 * - Redis cache for council votes: 5 minutes TTL
 *
 * Anti-manipulation:
 * - Markets with < $50,000 volume are filtered out
 * - Hash comparison to detect API schema changes
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    forwardRef(() => AiModule), // Circular dependency: PredictionMarket → AI → PredictionMarket
  ],
  controllers: [PredictionMarketController],
  providers: [
    PolymarketAdapter,
    PredictionMarketService,
  ],
  exports: [PredictionMarketService],
})
export class PredictionMarketModule {}
