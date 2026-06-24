// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 1: Context Engine (V461)
//   - 6 context builders + aggregator with Redis caching
//
// Phase 2: Chat + Functions (V462)
//   - 12 function-calling + chat service + 3 new endpoints
//
// Phase 3: Language Router + Glossary + Cache (V463)
//   - 32 languages (6A + 12B + 14C) with tier-based model routing
//   - Financial glossary (16 languages, ~70 terms each)
//   - Translation cache with 4 TTL categories (REALTIME/DYNAMIC/SEMI_STATIC/STATIC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef } from '@nestjs/common';
import { AssistantController } from './services/assistant.controller';
import { ContextAggregatorService } from './services/context-aggregator.service';
import { FunctionRegistryService } from './services/function-registry.service';
import { AssistantChatService } from './services/assistant-chat.service';
import { LanguageRouterService } from './services/language-router.service';
import { FinancialGlossaryService } from './services/financial-glossary.service';
import { TranslationCacheService } from './services/translation-cache.service';

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

    // Phase 3: Language + Glossary + Cache
    LanguageRouterService,
    FinancialGlossaryService,
    TranslationCacheService,
  ],
  exports: [
    ContextAggregatorService,
    FunctionRegistryService,
    AssistantChatService,
    LanguageRouterService,
    FinancialGlossaryService,
    TranslationCacheService,
    UserTradingContextBuilder,
    CouncilContextBuilder,
    LearningContextBuilder,
    MarketContextBuilder,
    NewsContextBuilder,
    SystemHealthContextBuilder,
  ],
})
export class AssistantModule {}
