import { Controller, Get, Post, Body, Query, UseGuards, Logger, ForbiddenException, Req } from '@nestjs/common';
import { AIOrchestratorService } from './services/ai-orchestrator.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AIAnalysisRequest } from './services/groq.service';
import { Request } from 'express';

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
   */
  @Get('models')
  async getModels() {
    const status = this.orchestrator.getModelsStatus();
    // SECURITY FIX: Strip keyHint from response — API key partials should never be exposed
    const safeStatus = status.map((m: any) => ({
      name: m.name,
      provider: m.provider,
      available: m.available,
      latency: m.latency,
      lastError: m.lastError,
      // keyHint intentionally excluded
    }));
    return { success: true, data: safeStatus };
  }

  /**
   * POST /api/ai/consensus — Multi-model Council of AI consensus vote
   * Calls ALL 6 AI models with role-specific prompts and returns consensus.
   * Throttled: 2 calls/min per IP (6 AI models × cost)
   */
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
   * SECURITY: Admin-only endpoint — exposes partial API keys for debugging.
   * Only users with INSTITUTIONAL tier (admin) can access this.
   */
  @Get('diagnose')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async diagnoseModels(@Req() req: Request) {
    // SECURITY FIX: Only admin users can diagnose models
    const user = (req as any).user;
    if (!user || (user.tier !== 'INSTITUTIONAL' && user.tier !== 'PRO')) {
      throw new ForbiddenException('هذا الإ.endpoint متاح فقط للمسؤولين');
    }
    this.logger.log(`🔧 Running AI model diagnostics (requested by: ${user.email})`);
    const result = await this.orchestrator.diagnoseModels();
    return { success: true, data: result, version: 'v2025-05-01-hf-router' };
  }
}
