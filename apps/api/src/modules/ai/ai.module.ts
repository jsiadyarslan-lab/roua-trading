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
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';
import { AiUsageLoggerService } from './services/ai-usage-logger.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [
    // AI Model Services — 7 Models (using existing API keys)
    GroqService,          // GROQ_API_KEY
    GlmService,           // GLM_API_KEY
    GeminiService,        // GOOGLE_AI_STUDIO_API_KEY
    HuggingFaceService,   // HUGGINGFACE_API_KEY / HF_API_KEY (+ OPENROUTER_API_KEY as fallback)
    OllamaService,        // OLLAMA_API_KEY
    BedrockService,       // AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
    OpenRouterService,    // OPENROUTER_API_KEY (7th model + HuggingFace fallback)

    // RAG Pipeline (uses HUGGINGFACE_API_KEY for embeddings)
    EmbeddingService,
    RagService,

    // AI Usage Logger — tracks all AI API calls to AiUsageLog table
    AiUsageLoggerService,

    // Orchestrator (depends on all above + optional PredictionMarketService via forwardRef)
    AIOrchestratorService,
  ],
  exports: [
    AIOrchestratorService,
    GroqService,
    GlmService,
    GeminiService,
    HuggingFaceService,
    OllamaService,
    BedrockService,
    OpenRouterService,
    RagService,
    EmbeddingService,
    AiUsageLoggerService,
  ],
})
export class AiModule {}
