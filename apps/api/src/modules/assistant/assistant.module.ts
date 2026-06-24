// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1: Context Engine
//   - 6 context builders (UserTrading, Council, Learning, Market, News, SystemHealth)
//   - 1 aggregator service (مع Redis caching)
//
// Phase 2: Chat + Functions (V462)
//   - 1 function registry service (12 functions)
//   - 1 chat service (يستخدم AIOrchestrator)
//   - 3 endpoints جديدة: /chat, /functions, /functions/execute
//
// Phase 3-5 (لاحقًا): Language Router + Streaming + Intelligence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef } from '@nestjs/common';
import { AssistantController } from './services/assistant.controller';
import { ContextAggregatorService } from './services/context-aggregator.service';
import { FunctionRegistryService } from './services/function-registry.service';
import { AssistantChatService } from './services/assistant-chat.service';

// Builders
import { UserTradingContextBuilder } from './builders/user-trading-context.builder';
import { CouncilContextBuilder } from './builders/council-context.builder';
import { LearningContextBuilder } from './builders/learning-context.builder';
import { MarketContextBuilder } from './builders/market-context.builder';
import { NewsContextBuilder } from './builders/news-context.builder';
import { SystemHealthContextBuilder } from './builders/system-health-context.builder';

// Common modules
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';

// Feature modules we depend on (forwardRef لمنع الاعتماد الدائري)
import { TradingModule } from '../trading/trading.module';
import { AiModule } from '../ai/ai.module';
import { CouncilIntelligenceModule } from '../ai/council-intelligence/council-intelligence.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { NewsModule } from '../news/news.module';
import { StrategicCouncilModule } from '../ai/strategic-council/strategic-council.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    forwardRef(() => TradingModule),
    forwardRef(() => AiModule),
    forwardRef(() => CouncilIntelligenceModule),
    forwardRef(() => ExchangeModule),
    forwardRef(() => NewsModule),
    forwardRef(() => StrategicCouncilModule),
  ],
  controllers: [AssistantController],
  providers: [
    // Phase 1: Context Engine
    ContextAggregatorService,
    UserTradingContextBuilder,
    CouncilContextBuilder,
    LearningContextBuilder,
    MarketContextBuilder,
    NewsContextBuilder,
    SystemHealthContextBuilder,

    // Phase 2: Chat + Functions
    FunctionRegistryService,
    AssistantChatService,
  ],
  exports: [
    ContextAggregatorService,
    FunctionRegistryService,
    AssistantChatService,
    UserTradingContextBuilder,
    CouncilContextBuilder,
    LearningContextBuilder,
    MarketContextBuilder,
    NewsContextBuilder,
    SystemHealthContextBuilder,
  ],
})
export class AssistantModule {}
