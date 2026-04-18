import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '../common/guards/auth.guard';

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /api/ai/orchestrate — Route prompt to appropriate AI model
   */
  @Post('orchestrate')
  async orchestrate(@Body() body: { prompt: string; model?: string }) {
    return this.aiService.orchestrate(body.prompt, body.model);
  }

  /**
   * GET /api/ai/sentiment — Analyze market sentiment
   */
  @Get('sentiment')
  async analyzeSentiment(@Query('symbol') symbol: string) {
    return this.aiService.analyzeSentiment(symbol);
  }
}
