import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AIOrchestratorService } from './services/ai-orchestrator.service';
import { GroqService } from './services/groq.service';
import { GlmService } from './services/glm.service';
import { GeminiService } from './services/gemini.service';

@Module({
  controllers: [AiController],
  providers: [
    GroqService,
    GlmService,
    GeminiService,
    AIOrchestratorService,
  ],
  exports: [AIOrchestratorService, GroqService, GlmService, GeminiService],
})
export class AiModule {}
