import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AIOrchestratorService } from './services/ai-orchestrator.service';
import { GroqService } from './services/groq.service';
import { GlmService } from './services/glm.service';
import { GeminiService } from './services/gemini.service';
import { HuggingFaceService } from './services/huggingface.service';
import { OllamaService } from './services/ollama.service';
import { BedrockService } from './services/bedrock.service';
import { OpenRouterService } from './services/openrouter.service';
import { DeepSeekService } from './services/deepseek.service';
import { CerebrasService } from './services/cerebras.service';
import { MistralService } from './services/mistral.service';
import { NvidiaService } from './services/nvidia.service';
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';
import { AiUsageLoggerService } from './services/ai-usage-logger.service';
import { AiCacheService } from './services/ai-cache.service';
import { MarketDataService } from './services/market-data.service';
import { StrategicCouncilService } from './services/strategic-council.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CouncilIntelligenceModule } from './council-intelligence/council-intelligence.module';

@Module({
  imports: [
    PrismaModule,
    // V185: مجلس الذكاء — Regime + Memory + VoteAccuracy (forwardRef لمنع الاعتماد الدائري)
    forwardRef(() => CouncilIntelligenceModule),
  ],
  controllers: [AiController],
  providers: [
    // AI Model Services — 8 Primary Models + 3 Legacy (backward compatibility)
    GroqService,          // GROQ_API_KEY
    GlmService,           // GLM_API_KEY
    GeminiService,        // GOOGLE_AI_STUDIO_API_KEY
    CerebrasService,      // CEREBRAS_API_KEY — replaces HuggingFace (14,400 req/day FREE)
    OllamaService,        // OLLAMA_API_KEY
    BedrockService,       // AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
    NvidiaService,        // NVIDIA_API_KEY — replaces OpenRouter (40 req/min FREE)
    MistralService,       // MISTRAL_API_KEY — replaces DeepSeek (1B tokens/month FREE)

    // Legacy services (still available as fallback in _callModel)
    HuggingFaceService,   // HUGGINGFACE_API_KEY (legacy)
    OpenRouterService,    // OPENROUTER_API_KEY (legacy)
    DeepSeekService,      // DEEPSEEK_API_KEY (legacy)

    // RAG Pipeline (uses HUGGINGFACE_API_KEY for embeddings)
    EmbeddingService,
    RagService,

    // AI Usage Logger — tracks all AI API calls to AiUsageLog table
    AiUsageLoggerService,

    // AI Cache Service — Redis + in-memory caching for AI analysis results
    AiCacheService,

    // Market Data Service — 9-source price fetching with cross-validation
    MarketDataService,

    // Strategic Council Service — AI Council consensus logic (extracted from orchestrator)
    StrategicCouncilService,

    // Orchestrator (depends on all above + optional PredictionMarketService via forwardRef)
    AIOrchestratorService,
  ],
  exports: [
    StrategicCouncilService,
    AIOrchestratorService,
    GroqService,
    GlmService,
    GeminiService,
    CerebrasService,
    MistralService,
    NvidiaService,
    HuggingFaceService,
    OllamaService,
    BedrockService,
    OpenRouterService,
    DeepSeekService,
    RagService,
    EmbeddingService,
    AiUsageLoggerService,
    AiCacheService,
    MarketDataService,
  ],
})
export class AiModule {}
