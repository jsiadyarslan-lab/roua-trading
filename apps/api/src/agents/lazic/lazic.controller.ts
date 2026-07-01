// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — اللاذع Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { LazicService } from './lazic.service';

@Controller('api/lazic')
@UseGuards(AuthGuard)
export class LazicController {
  constructor(private readonly lazic: LazicService) {}

  /** GET /api/lazic/status — حالة اللاذع للمستخدم الحالي */
  @Get('status')
  async getStatus(@Req() req: any) {
    return this.lazic.getStatus(req.user.id);
  }

  /** POST /api/lazic/enable — تفعيل اللاذع */
  @Post('enable')
  async enable(@Req() req: any) {
    await this.lazic.enableForUser(req.user.id);
    return { success: true, message: '🐝 اللاذع مُفعَّل' };
  }

  /** POST /api/lazic/disable — إيقاف اللاذع */
  @Post('disable')
  async disable(@Req() req: any) {
    await this.lazic.disableForUser(req.user.id);
    return { success: true, message: '🐝 اللاذع موقوف' };
  }
}
