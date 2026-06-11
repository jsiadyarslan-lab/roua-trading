import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
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

  /** V165: Key type — 'hmac' (default) or 'ed25519' or 'rsa' */
  @IsString()
  @IsOptional()
  keyType?: string;
}

@Controller('portfolio/credentials')
@UseGuards(AuthGuard)
export class CredentialsController {
  private readonly logger = new Logger(CredentialsController.name);

  constructor(private readonly credentialsService: CredentialsService) {}

  private assertRealUser(req: any) {
    const user = req.user;
    const email = String(user?.email || '');
    const id = String(user?.id || '');
    const isGuest =
      !id ||
      id.startsWith('guest') ||
      email === 'guest@roua.auto' ||
      /^guest-[a-f0-9]+@roua\.auto$/.test(email);

    if (isGuest) {
      throw new ForbiddenException('يجب تسجيل الدخول بحساب حقيقي لربط مفاتيح البورصة أو عرض أرصدتها');
    }
  }

  /**
   * GET /api/portfolio/credentials — Get user's exchange credentials
   */
  @Get()
  async getCredentials(@Request() req: any) {
    this.assertRealUser(req);
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
    this.assertRealUser(req);
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
    this.assertRealUser(req);
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
    this.assertRealUser(req);
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
    this.assertRealUser(req);
    await this.credentialsService.deleteCredential(
      req.user.id,
      id,
      req.ip,
      req.headers['user-agent'],
    );

    return { success: true };
  }

  /**
   * GET /api/portfolio/credentials/server-ip — Get the server's outbound IP address.
   * V165: Users need this IP to add to their Binance API key IP whitelist.
   * Without whitelisting this IP, Binance rejects authenticated requests from Railway.
   */
  @Get('server-ip')
  async getServerIp() {
    try {
      const ip = await this.credentialsService.getServerOutboundIp();
      return {
        success: true,
        data: {
          serverIp: ip,
          instructions: {
            en: `Add ${ip} to your Binance API key IP whitelist: Binance → API Management → Edit Key → IP Access Restrictions → Add IP`,
            ar: `أضف ${ip} إلى القائمة البيضاء لعنوان IP في مفتاح Binance API: Binance → إدارة API → تعديل المفتاح → قيود وصول IP → إضافة IP`,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        data: { serverIp: 'unknown', error: error.message },
      };
    }
  }

  /**
   * GET /api/portfolio/credentials/test-mt5/:credentialId — Test MT5/MetaAPI connectivity
   * V193: Detailed step-by-step diagnostic for MT5 accounts.
   * Shows exactly WHERE the connection fails and how to fix it.
   */
  @Get('test-mt5/:credentialId')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async testMT5Connectivity(
    @Request() req: any,
    @Param('credentialId') credentialId: string,
  ) {
    this.assertRealUser(req);
    const result = await this.credentialsService.testMT5Connectivity(req.user.id, credentialId);
    return { success: true, data: result };
  }

  /**
   * GET /api/portfolio/credentials/test-connectivity — Diagnostic endpoint
   * Tests Binance API connectivity from the server (Railway).
   * V164b: Also tests with user's actual credentials if they have any.
   * Auth required — tests use the logged-in user's stored credentials.
   */
  @Get('test-connectivity')
  async testConnectivity(@Request() req: any) {
    this.assertRealUser(req);
    const userId = req.user?.id;
    const results = await Promise.allSettled([
      this.credentialsService.testExchangeConnectivity('binance', userId),
    ]);
    const connectivity = results.map(r =>
      r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' }
    );

    // V164d: Also check user's credentials status (without exposing secrets)
    let credentialsStatus: any = { count: 0, details: [] };
    if (userId) {
      try {
        const creds = await (this.credentialsService as any).prisma.exchangeCredential.findMany({
          where: { userId },
          select: { id: true, exchange: true, label: true, isValid: true, testnet: true, createdAt: true },
        });
        credentialsStatus = {
          count: creds.length,
          details: creds.map(c => ({
            exchange: c.exchange,
            label: c.label,
            isValid: c.isValid,
            testnet: c.testnet,
            createdAt: c.createdAt,
          })),
        };
      } catch {}
    }

    return {
      success: true,
      data: {
        serverTime: new Date().toISOString(),
        serverUptime: Math.round(process.uptime()),
        connectivity,
        credentialsStatus,
      },
    };
  }
}
