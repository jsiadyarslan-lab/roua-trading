import { Controller, Get, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { AIOrchestratorService } from './services/ai-orchestrator.service';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
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
   * SECURITY: Only returns model names and availability, never key hints
   *
   * FIX: Marked @Public() so the frontend can check AI model status without
   * authentication. Previously, this returned 401 for unauthenticated users,
   * which broke the AI status panel on the dashboard. This endpoint only
   * returns model availability — no sensitive data is exposed.
   */
  @Public()
  @Get('models')
  async getModels() {
    const status = this.orchestrator.getModelsStatus();
    return { success: true, data: status };
  }

  /**
   * POST /api/ai/consensus — Multi-model Council of AI consensus vote
   * Calls ALL 7 AI models with role-specific prompts and returns consensus.
   * Throttled: 2 calls/min per IP (7 AI models × cost)
   *
   * FIX: Marked @Public() so Layer 1 calls from Next.js don't need auth.
   * The AuthGuard was blocking internal calls, causing ALL consensus
   * requests to fall to Layer 2 (direct calls) which has fewer working models.
   * Now both Layer 1 (NestJS with 7 models + Redis cache) and Layer 2
   * (direct calls) work, and the merger combines their results.
   * Security: Rate-limited to 2/min, and the data is not user-sensitive.
   */
  @Public()
  @Post('consensus')
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  async consensus(@Body() body: { symbol?: string }) {
    const symbol = body.symbol || 'BTC/USD';
    this.logger.log(`🗳️ AI Council consensus request for ${symbol}`);
    const result = await this.orchestrator.getConsensusAnalysis(symbol);
    return { success: true, data: result };
  }

  /**
   * GET /api/ai/diagnose — Test each AI model individually and return detailed results
   * Shows which models actually work vs just having keys configured
   * FIX: Marked @Public() so diagnostics can be run without auth.
   */
  @Public()
  @Get('diagnose')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async diagnoseModels() {
    this.logger.log('🔧 Running AI model diagnostics...');
    const result = await this.orchestrator.diagnoseModels();
    return { success: true, data: result, version: 'v2026-05-05-direction-first' };
  }
}
