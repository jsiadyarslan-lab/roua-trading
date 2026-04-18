import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, Logger } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('portfolio/credentials')
@UseGuards(AuthGuard)
export class CredentialsController {
  private readonly logger = new Logger(CredentialsController.name);

  constructor(private readonly credentialsService: CredentialsService) {}

  /**
   * GET /api/portfolio/credentials — Get user's exchange credentials
   */
  @Get()
  async getCredentials(@Request() req: any) {
    const credentials = await this.credentialsService.getUserCredentials(req.user.id);
    return { success: true, data: credentials };
  }

  /**
   * POST /api/portfolio/credentials — Add a new exchange credential
   * Security: validates key, rejects withdraw/transfer permissions, encrypts with AES-256-GCM
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async addCredential(
    @Request() req: any,
    @Body() body: { exchange: string; label: string; apiKey: string; apiSecret: string },
  ) {
    if (!body.exchange || !body.label || !body.apiKey || !body.apiSecret) {
      return { success: false, error: 'جميع الحقول مطلوبة' };
    }

    const credential = await this.credentialsService.addCredential(
      req.user.id,
      body,
      req.ip,
      req.headers['user-agent'],
    );

    return { success: true, data: credential };
  }

  /**
   * DELETE /api/portfolio/credentials/:id — Delete a credential
   */
  @Delete(':id')
  async deleteCredential(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    await this.credentialsService.deleteCredential(
      req.user.id,
      id,
      req.ip,
      req.headers['user-agent'],
    );

    return { success: true };
  }
}
