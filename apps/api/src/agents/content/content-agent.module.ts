// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Agent Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { ExchangeModule } from '../../modules/exchange/exchange.module';
import { AiModule } from '../../modules/ai/ai.module';

// Agent Services
import { ContentGeneratorService } from './services/content-generator.service';
import { ContentCuratorService } from './services/content-curator.service';
import { ContentOptimizerService } from './services/content-optimizer.service';
import { ContentPublisherService } from './services/content-publisher.service';
import { ContentAgentService } from './content-agent.service';

// Agent Controller
import { ContentAgentController } from './content-agent.controller';

/**
 * ContentAgentModule — The Content Engine of Roua Trading
 *
 * Provides AI-powered content generation, curation, optimization,
 * and publishing for the Roua Trading news platform.
 *
 * ┌────────────────────────────────────────────────────────────┐
 * │                                                            │
 * │  ✍️ ContentGeneratorService  — AI bilingual content       │
 * │  🔍 ContentCuratorService    — Source aggregation         │
 * │  📈 ContentOptimizerService  — SEO & quality optimization │
 * │  📤 ContentPublisherService   — Publishing & scheduling   │
 * │  🧠 ContentAgentService      — Orchestration & lifecycle  │
 * │                                                            │
 * │  Content Types:                                            │
 * │  ├─ Article     — In-depth analysis articles              │
 * │  ├─ Analysis    — Technical/fundamental analysis           │
 * │  ├─ News Digest — Curated news summaries                  │
 * │  ├─ Market Rep  — Daily/weekly market reports              │
 * │  ├─ Educational — Trading education content                │
 * │  ├─ Opinion     — Market opinion pieces                    │
 * │  └─ Breaking    — Breaking news alerts                     │
 * │                                                            │
 * │  Categories:                                               │
 * │  Crypto, Forex, Stocks, Commodities, Economy,              │
 * │  Regulation, Technology, Education, Geopolitics,            │
 * │  DeFi, NFT                                                 │
 * │                                                            │
 * │  Scheduled Tasks:                                          │
 * │  ├─ Daily 8 AM   — Market digest auto-generation          │
 * │  ├─ Every 6 hours — Content gap auto-fill                 │
 * │  └─ Every 5 min   — Scheduled publication processing     │
 * │                                                            │
 * └────────────────────────────────────────────────────────────┘
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuditModule,
    ExchangeModule,
    AiModule,
  ],
  controllers: [ContentAgentController],
  providers: [
    // Core Services
    ContentGeneratorService,
    ContentCuratorService,
    ContentOptimizerService,
    ContentPublisherService,
    ContentAgentService,
  ],
  exports: [
    ContentAgentService,
    ContentGeneratorService,
    ContentCuratorService,
    ContentOptimizerService,
    ContentPublisherService,
  ],
})
export class ContentAgentModule {}
