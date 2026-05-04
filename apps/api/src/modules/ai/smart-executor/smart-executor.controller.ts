// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, UseGuards, Logger } from '@nestjs/common';
import { SmartExecutorService } from './smart-executor.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('smart-executor')
@UseGuards(AuthGuard)
export class SmartExecutorController {
  private readonly logger = new Logger(SmartExecutorController.name);

  constructor(private readonly executorService: SmartExecutorService) {}

  /**
   * GET /api/smart-executor/status — Get executor status
   */
  @Get('status')
  async getStatus() {
    const status = await this.executorService.getStatus();
    return { success: true, data: status };
  }

  /**
   * POST /api/smart-executor/start — Start the executor
   */
  @Post('start')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async start() {
    this.logger.log('⚔️ Smart Executor start requested');
    const status = await this.executorService.start();
    return { success: true, data: status };
  }

  /**
   * POST /api/smart-executor/stop — Stop the executor
   */
  @Post('stop')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async stop() {
    this.logger.log('⚔️ Smart Executor stop requested');
    const status = await this.executorService.stop();
    return { success: true, data: status };
  }

  /**
   * GET /api/smart-executor/positions — Get open positions managed by executor
   */
  @Get('positions')
  async getPositions() {
    const positions = await this.executorService.getOpenPositions();
    return { success: true, data: positions };
  }
}
