import { Controller, Get, Post, Param, Body, Delete, UseGuards, Request, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SignalService } from './signal.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { t } from '../../i18n/i18n.helper';

@Controller('signals')
@UseGuards(AuthGuard)
export class SignalController {
  private readonly logger = new Logger(SignalController.name);

  constructor(
    private readonly signalService: SignalService,
  ) {}

  /**
   * POST /api/signals/generate/:pair — Generate a new trading signal
   * Rate limited: 5 signals per minute
   */
  @Post('generate/:pair')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async generateSignal(@Request() req: any, @Param('pair') pair: string) {
    this.logger.debug(`Signal generation request: ${pair} (user: ${req.user.id})`);

    // Decode URL-encoded pair (e.g., BTC%2FUSDT → BTC/USDT)
    let decodedPair: string;
    try {
      decodedPair = decodeURIComponent(pair);
    } catch {
      decodedPair = pair;
    }

    const signal = await this.signalService.generateSignal(req.user.id, decodedPair);
    return { success: true, data: signal };
  }

  /**
   * GET /api/signals/active — Get user's active signals
   */
  @Get('active')
  async getActiveSignals(@Request() req: any) {
    const signals = await this.signalService.getActiveSignals(req.user.id);
    return { success: true, data: signals };
  }

  /**
   * GET /api/signals/history — Get signal history
   */
  @Get('history')
  async getSignalHistory(@Request() req: any) {
    const signals = await this.signalService.getSignalHistory(req.user.id);
    return { success: true, data: signals };
  }

  /**
   * POST /api/signals/:id/execute — Execute a signal by placing a trade
   *
   * FIX: Previously, there was no bridge between signals and the trading engine.
   * Users had to manually create orders based on signal data. This endpoint
   * allows one-click signal execution, connecting the Analysis → Trading pipeline.
   *
   * Body: { credentialId: string, quantity?: number }
   */
  @Post(':id/execute')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  async executeSignal(
    @Request() req: any,
    @Param('id') signalId: string,
    @Body() body: { credentialId?: string; quantity?: number },
  ) {
    const userId = req.user.id;

    if (!body.credentialId) {
      throw new BadRequestException(t('signal_controller.required_signal', req));
    }

    const result = await this.signalService.executeSignal(userId, signalId, body.credentialId, body.quantity);
    return { success: true, data: result };
  }

  /**
   * DELETE /api/signals/:id — Cancel a signal
   */
  @Delete(':id')
  async cancelSignal(@Request() req: any, @Param('id') id: string) {
    const signal = await this.signalService.cancelSignal(req.user.id, id);
    return { success: true, data: signal };
  }
}
