// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — User Throttler Guard (RC-8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom ThrottlerGuard يحدّ الطلبات per-user بدل per-IP.
//
// المشكلة السابقة:
//   - ThrottlerModule.forRoot موجود لكن بدون APP_GUARD
//   - كل @Throttle decorators في المشروع لا تعمل!
//   - المستخدم يستطيع تجاوز الـ limit بـ IP rotation (VPN)
//
// الحل:
//   - تفعيل ThrottlerGuard عالمياً عبر APP_GUARD
//   - getTracker() يرجع userId لو موجود، وإلا IP (للـ @Public routes)
//   - هذا يحمي endpoints الحساسة per-user بشكل صحيح
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  /**
   * RC-8: يرجع معرّف فريد لكل مستخدم بدل IP
   * - لو المستخدم مسجّل الدخول → userId (لا يمكن تجاوزه بـ VPN)
   * - لو غير مسجّل → IP (للـ @Public routes مثل /auth/register)
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // لو يوجد user مرفق من AuthGuard، استخدم userId
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // fallback: IP (للـ public routes)
    const expressReq = req as Request;
    const forwarded = expressReq.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : expressReq.socket?.remoteAddress || expressReq.ip || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * RC-8: تجاوز shouldThrow لإرجاع response عربي واضح بدل 429 generic
   */
  protected async shouldThrow(): Promise<boolean> {
    return true; // ارجع 429 عند تجاوز الـ limit
  }
}
