// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — اللاسع Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, Put, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { LazicService } from './lazic.service';

@Controller('lazic')
@UseGuards(AuthGuard)
export class LazicController {
  constructor(private readonly lazic: LazicService) {}

  /** GET /api/lazic/status — حالة اللاسع للمستخدم الحالي */
  @Get('status')
  async getStatus(@Req() req: any) {
    return this.lazic.getStatus(req.user.id);
  }

  /** GET /api/lazic/settings — إعدادات اللاسع القابلة للتخصيص */
  @Get('settings')
  async getSettings(@Req() req: any) {
    return this.lazic.getSettings(req.user.id);
  }

  /** PUT /api/lazic/settings — تحديث إعدادات اللاسع */
  @Put('settings')
  async updateSettings(@Req() req: any, @Body() dto: LasicSettingsDto) {
    return this.lazic.updateSettings(req.user.id, dto);
  }

  /** POST /api/lazic/enable — تفعيل اللاسع */
  @Post('enable')
  async enable(@Req() req: any) {
    await this.lazic.enableForUser(req.user.id);
    return { success: true, message: '🐝 اللاسع مُفعَّل' };
  }

  /** POST /api/lazic/disable — إيقاف اللاسع */
  @Post('disable')
  async disable(@Req() req: any) {
    await this.lazic.disableForUser(req.user.id);
    return { success: true, message: '🐝 اللاسع موقوف' };
  }
}

/** DTO لتحديث الإعدادات — كل الحقول optional */
export interface LasicSettingsDto {
  obiThreshold?: number;         // 0.3 – 0.8
  maxSpreadMultiplier?: number;  // 1.0 – 3.0
  maxDailyTrades?: number;       // 5 – 100
  maxOpenPositions?: number;     // 1 – 10
  cooldownMs?: number;           // 10000 – 300000
  riskPerTradePct?: number;      // 0.1 – 3.0
}
