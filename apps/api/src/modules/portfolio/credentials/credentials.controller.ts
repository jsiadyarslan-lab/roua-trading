import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Logger, BadRequestException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

class AddCredentialDto {
  @IsString()
  @IsNotEmpty()
  exchange: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @IsString()
  @IsNotEmpty()
  apiSecret: string;

  @IsString()
  @IsOptional()
  passphrase?: string;

  @IsBoolean()
  @IsOptional()
  testnet?: boolean;
}

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
   * PUT /api/portfolio/credentials/:id — Update an existing credential (e.g., toggle testnet)
   */
  @Put(':id')
  async updateCredential(
    @Param('id') credentialId: string,
    @Request() req: any,
    @Body() body: { testnet?: boolean },
  ) {
    try {
      const credential = await this.credentialsService.updateCredential(
        req.user.id,
        credentialId,
        body,
        req.ip,
        req.headers['user-agent'],
      );

      return { success: true, data: credential };
    } catch (error: any) {
      if (error.constructor && error.constructor.name && error.constructor.name.endsWith('Exception')) {
        throw error;
      }
      this.logger.error(`Unexpected error in updateCredential: ${error.message}`, error.stack);
      throw new BadRequestException(
        `خطأ في تحديث المفتاح: ${error.message || 'خطأ غير معروف'}`
      );
    }
  }

  /**
   * POST /api/portfolio/credentials — Add a new exchange credential
   * Security: validates key, rejects withdraw/transfer permissions, encrypts with AES-256-GCM
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async addCredential(
    @Request() req: any,
    @Body() body: AddCredentialDto,
  ) {
    if (!body.exchange || !body.label || !body.apiKey || !body.apiSecret) {
      throw new BadRequestException('جميع الحقول مطلوبة');
    }

    try {
      const credential = await this.credentialsService.addCredential(
        req.user.id,
        body,
        req.ip,
        req.headers['user-agent'],
      );

      return { success: true, data: credential };
    } catch (error: any) {
      // If it's already an HttpException (BadRequestException, ForbiddenException, etc.),
      // just re-throw it — NestJS will handle it properly.
      if (error.constructor && error.constructor.name && error.constructor.name.endsWith('Exception')) {
        throw error;
      }
      // For any other error (CCXT errors, crypto errors, etc.), wrap in BadRequestException
      // with the actual error message so the frontend can see what went wrong.
      this.logger.error(`Unexpected error in addCredential: ${error.message}`, error.stack);
      throw new BadRequestException(
        `خطأ في التحقق من المفتاح: ${error.message || 'خطأ غير معروف'}`
      );
    }
  }

  /**
   * GET /api/portfolio/credentials/balances — Fetch balances from all linked exchanges
   * Uses stored credentials to call fetchBalance on each exchange via CCXT.
   * Returns aggregated balances across all linked accounts.
   */
  @Get('balances')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getBalances(@Request() req: any) {
    try {
      const balances = await this.credentialsService.fetchAllExchangeBalances(req.user.id);
      return { success: true, data: balances };
    } catch (error: any) {
      this.logger.error(`Failed to fetch balances for user ${req.user.id}: ${error.message}`, error.stack);
      throw new BadRequestException(
        `فشل في جلب الأرصدة: ${error.message || 'خطأ غير معروف'}`
      );
    }
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
