import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AIOrchestratorService } from './services/ai-orchestrator.service';
import { GroqService } from './services/groq.service';
import { GlmService } from './services/glm.service';
import { GeminiService } from './services/gemini.service';
import { DeepSeekService } from './services/deepseek.service';
import { OpenAIService } from './services/openai.service';
import { ClaudeService } from './services/claude.service';
import { EmbeddingService } from './services/embedding.service';
import { RagService } from './services/rag.service';

@Module({
  controllers: [AiController],
  providers: [
    // AI Model Services — 6 Models
    GroqService,
    GlmService,
    GeminiService,
    DeepSeekService,
    OpenAIService,
    ClaudeService,

    // RAG Pipeline
    EmbeddingService,
    RagService,

    // Orchestrator (depends on all above)
    AIOrchestratorService,
  ],
  exports: [
    AIOrchestratorService,
    GroqService,
    GlmService,
    GeminiService,
    DeepSeekService,
    OpenAIService,
    ClaudeService,
    RagService,
    EmbeddingService,
  ],
})
export class AiModule {}
