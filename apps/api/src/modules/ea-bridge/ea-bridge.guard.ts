// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — EA Bridge Guard
// حماية نقاط EA بمفتاح مصادقة فريد لكل مستخدم
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, CanActivate, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

/**
 * EABridgeGuard — EA Token Authentication
 *
 * كل EA يملك رمزاً فريداً (EA Token) يرسله في كل طلب.
 * هذا الرمز مرتبط بمستخدم واحد في قاعدة البيانات، مما يضمن:
 * 1. العزل التام: EA لا يمكنه الوصول لبيانات مستخدم آخر
 * 2. التتبع: كل طلب مسجل باسم المستخدم
 * 3. الإلغاء الفوري: تعطيل الرمز يوقف EA فوراً
 *
 * Header: X-EA-Token: ea_sk_live_xxxxx
 *
 * كيف يعمل:
 * 1. يقرأ X-EA-Token من الطلب
 * 2. يبحث في Redis أولاً (cache سريع)
 * 3. إذا لم يجد، يبحث في قاعدة البيانات
 * 4. يربط userId بالطلب للاستخدام downstream
 * 5. يحدّث آخر نبضة حياة (heartbeat)
 */
@Injectable()
export class EABridgeGuard implements CanActivate {
  private readonly logger = new Logger(EABridgeGuard.name);
  private readonly CACHE_PREFIX = 'ea-token:';
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 دقائق

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // استخراج الرمز من Header
    const eaToken = request.headers['x-ea-token'] as string | undefined;

    if (!eaToken) {
      this.logger.warn(`EA Bridge: Missing X-EA-Token header from ${request.ip}`);
      throw new UnauthorizedException('رمز EA مطلوب (X-EA-Token)');
    }

    // التحقق من صيغة الرمز (يبدأ بـ ea_ )
    if (!eaToken.startsWith('ea_')) {
      this.logger.warn(`EA Bridge: Invalid token format from ${request.ip}`);
      throw new UnauthorizedException('صيغة رمز EA غير صالحة');
    }

    // البحث في Redis أولاً
    const cacheKey = `${this.CACHE_PREFIX}${eaToken}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.userId && parsed.isActive) {
          (request as any).user = { id: parsed.userId };
          (request as any).eaTokenId = parsed.id;
          (request as any).eaTokenLabel = parsed.label;
          return true;
        }
      }
    } catch {
      // Cache miss — نكمل من قاعدة البيانات
    }

    // البحث في قاعدة البيانات
    if (!this.prisma.isAvailable()) {
      this.logger.warn('EA Bridge: DB unavailable during token validation');
      throw new UnauthorizedException('خدمة المصادقة غير متوفرة حالياً');
    }

    try {
      // البحث عن الرمز في جدول EAToken (V227: نموذج Prisma)
      const token = await this.prisma.eAToken.findUnique({
        where: { token: eaToken },
      });

      if (!token) {
        this.logger.warn(`EA Bridge: Unknown token ${eaToken.substring(0, 12)}...`);
        throw new UnauthorizedException('رمز EA غير معروف');
      }

      if (!token.isActive) {
        this.logger.warn(`EA Bridge: Deactivated token ${eaToken.substring(0, 12)}... for user ${token.userId}`);
        throw new UnauthorizedException('رمز EA معطّل — يرجى إنشاء رمز جديد');
      }

      // تخزين في Redis للتسريع
      try {
        await this.redis.set(cacheKey, JSON.stringify({
          id: token.id,
          userId: token.userId,
          label: token.label,
          isActive: token.isActive,
        }), this.CACHE_TTL_MS);
      } catch {
        // Non-critical
      }

      // ربط المستخدم بالطلب
      (request as any).user = { id: token.userId };
      (request as any).eaTokenId = token.id;
      (request as any).eaTokenLabel = token.label;

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.error(`EA Bridge: Token validation error: ${error.message}`);
      throw new UnauthorizedException('فشل في التحقق من رمز EA');
    }
  }

  /**
   * Fallback: استخدام INTEGRATION_API_KEY + userId من الطلب
   * يعمل عندما لا يكون جدول EAToken موجوداً بعد
   */
  private async _fallbackAuth(eaToken: string, request: Request): Promise<boolean> {
    // صيغة الرمز البديلة: ea_{integrationKey}_{userId}
    // هذا حل مؤقت حتى يتم إنشاء الجدول
    const expectedKey = process.env.INTEGRATION_API_KEY || process.env.EA_BRIDGE_SECRET;

    if (!expectedKey) {
      throw new UnauthorizedException('EA Bridge غير مُعد — يرجى تهيئة EA_BRIDGE_SECRET');
    }

    // التحقق من أن الرمز يطابق النمط
    // ea_live_{secret_prefix}_{userId}
    const parts = eaToken.split('_');
    if (parts.length < 4) {
      throw new UnauthorizedException('صيغة رمز EA غير صالحة');
    }

    // parts[0] = 'ea', parts[1] = 'live/demo, parts[2..-2] = secret fragment, parts[-1] = userId
    const userId = parts[parts.length - 1];
    const secretFragment = parts.slice(2, -1).join('_');

    // تحقق بسيط: الجزء السري يجب أن يكون جزءاً من EA_BRIDGE_SECRET
    if (!expectedKey.includes(secretFragment) && secretFragment !== expectedKey) {
      throw new UnauthorizedException('رمز EA غير صالح');
    }

    // التحقق من وجود المستخدم
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('مستخدم EA غير موجود');
    }

    (request as any).user = { id: userId };
    (request as any).eaTokenId = 'fallback';
    (request as any).eaTokenLabel = 'EA Fallback Auth';

    return true;
  }
}
