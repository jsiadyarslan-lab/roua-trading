import { Controller, Get, Post, Param, Delete, UseGuards, Request, Logger } from '@nestjs/common';
import { SignalService } from './signal.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('signals')
@UseGuards(AuthGuard)
export class SignalController {
  private readonly logger = new Logger(SignalController.name);

  constructor(private readonly signalService: SignalService) {}

  /**
   * POST /api/signals/generate/:pair — Generate a new trading signal
   * Rate limited: 5 signals per minute
   */
  @Post('generate/:pair')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async generateSignal(@Request() req: any, @Param('pair') pair: string) {
    this.logger.debug(`Signal generation request: ${pair} (user: ${req.user.id})`);

    // Decode URL-encoded pair (e.g., BTC%2FUSDT → BTC/USDT)
    const decodedPair = decodeURIComponent(pair);

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
   * DELETE /api/signals/:id — Cancel a signal
   */
  @Delete(':id')
  async cancelSignal(@Request() req: any, @Param('id') id: string) {
    const signal = await this.signalService.cancelSignal(req.user.id, id);
    return { success: true, data: signal };
  }
}
