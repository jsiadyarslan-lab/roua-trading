import { Controller, Get, Post, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { AIOrchestratorService } from './services/ai-orchestrator.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AIAnalysisRequest } from './services/groq.service';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly orchestrator: AIOrchestratorService) {}

  /**
   * POST /api/ai/analyze — Analyze using the optimal AI model
   * Body: { prompt, type, symbol?, language? }
   */
  @Post('analyze')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async analyze(@Body() body: { prompt: string; type?: string; symbol?: string; language?: string }) {
    const request: AIAnalysisRequest = {
      prompt: body.prompt,
      type: (body.type as AIAnalysisRequest['type']) || 'general',
      symbol: body.symbol,
      language: body.language || 'ar',
    };

    this.logger.debug(`AI analyze request: ${request.type} (${request.language})`);
    const result = await this.orchestrator.analyze(request);
    return { success: true, data: result };
  }

  /**
   * POST /api/ai/analyze/all — Analyze with ALL models (multi-model analysis)
   */
  @Post('analyze/all')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async analyzeWithAllModels(@Body() body: { prompt: string; type?: string; symbol?: string; language?: string }) {
    const request: AIAnalysisRequest = {
      prompt: body.prompt,
      type: (body.type as AIAnalysisRequest['type']) || 'general',
      symbol: body.symbol,
      language: body.language || 'ar',
    };

    const result = await this.orchestrator.analyzeWithAllModels(request);
    return { success: true, data: result };
  }

  /**
   * GET /api/ai/models — Get available AI models status
   */
  @Get('models')
  async getModels() {
    return { success: true, data: this.orchestrator.getModelsStatus() };
  }

  /**
   * POST /api/ai/consensus — Multi-model Council of AI consensus vote
   * BUG-007 FIX: Added throttle — 2 calls/min per IP (6 AI models × cost)
   */
  @Post('consensus')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async getConsensus(@Body() body: { symbol: string }) {
    this.logger.log(`🎼 Generating AI Council Consensus for ${body.symbol}`);
    const result = await this.orchestrator.getConsensusAnalysis(body.symbol);
    return { success: true, data: result.result || result, source: result.source };
  }
}
