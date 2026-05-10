// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Order Dispatcher Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// المنسق الوحيد لجميع الأوامر الآلية.
// يمنع التعارض بين المنفذ الذكي والوكيل الآلي.
//
// مبدأ العمل: Producer → Dispatcher → Executor
//   - المنتج (SmartExecutor / AutonomousTrader): يقرر ماذا يتداول
//   - الموزع (هذه الخدمة): يتلقى الأوامر وينسقها ويمنع التعارضات
//   - المنفذ (TradingService): ينفذ الأمر الفعلي
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { TradingService } from '../trading.service';
import { RiskGatekeeperService } from './risk-gatekeeper.service';
import { OrderSide, OrderType, PlaceOrderRequest } from '../trading.types';
import { OrderSideEnum, OrderTypeEnum } from '../events/order.events';

export interface AutoOrderRequest {
  /** المصدر: 'smart_executor' أو 'agent' */
  source: 'smart_executor' | 'agent';
  userId: string;
  credentialId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  briefId?: string;
  signalId?: string;
  isPaperTrading?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}

@Injectable()
export class OrderDispatcherService {
  private readonly logger = new Logger(OrderDispatcherService.name);

  // مفتاح Redis للقفل الذري — يمنع race condition
  private readonly LOCK_PREFIX = 'dispatcher:lock:';
  // مفتاح idempotency — يمنع تكرار نفس الأمر
  private readonly IDEMPOTENCY_PREFIX = 'dispatcher:idem:';
  // مدة القفل: 30 ثانية (كافية لإتمام أي عملية)
  private readonly LOCK_TTL_SEC = 30;
  // مدة idempotency: 5 دقائق (منع تكرار نفس الصفقة)
  private readonly IDEM_TTL_SEC = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly tradingService: TradingService,
  ) {}

  /**
   * تقديم أمر تداول آلي — النقطة الوحيدة لكل الأوامر الآلية
   *
   * الخطوات:
   * 1. توليد مفتاح idempotency بناءً على محتوى الأمر (لا الوقت)
   * 2. قفل ذري بـ SET NX لمنع race condition
   * 3. التحقق من عدم وجود أمر مكرر
   * 4. إرسال إلى حارس المخاطر
   * 5. تنفيذ الأمر عبر TradingService
   * 6. تسجيل النتيجة في قاعدة البيانات
   */
  async submitOrder(request: AutoOrderRequest): Promise<OrderResult> {
    // ── الخطوة 1: توليد مفتاح idempotency بناءً على المحتوى ──
    // FIX: لا نستخدم Date.now() لأنه يجعل كل أمر فريداً دائماً.
    // نستخدم محتوى الأمر: source + معرف الوثيقة/الإشارة + الزوج + الاتجاه.
    // هذا يضمن رفض نفس الأمر إذا جاء مرتين خلال 5 دقائق.
    const idemKey = `${request.source}:${request.briefId || request.signalId || 'manual'}:${request.symbol}:${request.side}`;
    const idemRedisKey = `${this.IDEMPOTENCY_PREFIX}${idemKey}`;

    // ── الخطوة 2: قفل ذري بـ SET NX (atomic) ──
    // FIX: نستخدم SET NX بدلاً من GET ثم SET لمنع race condition.
    // إذا كان القفل موجوداً (أمر آخر يُعالج)، نتجاهل هذا الأمر.
    const lockKey = `${this.LOCK_PREFIX}${idemKey}`;
    let locked = false;

    try {
      // SET NX = Set if Not eXists (atomic operation)
      const lockResult = await this.redis.set(lockKey, '1', this.LOCK_TTL_SEC);
      locked = lockResult !== null;
    } catch (redisErr: any) {
      // إذا فشل Redis، نتابع بحذر (بدون حماية من التكرار)
      this.logger.warn(`[Dispatcher] Redis lock failed — proceeding without lock: ${redisErr.message}`);
      locked = true; // نتابع بدون قفل (أفضل من رفض الأمر كلياً)
    }

    if (!locked) {
      this.logger.debug(`[Dispatcher] Order locked — another order for ${idemKey} is being processed`);
      return { success: false, message: 'أمر يُعالج حالياً — يُرجى الانتظار' };
    }

    try {
      // ── الخطوة 3: التحقق من عدم وجود أمر مكرر ──
      try {
        const existing = await this.redis.get(idemRedisKey);
        if (existing) {
          this.logger.debug(`[Dispatcher] Duplicate order rejected: ${idemKey}`);
          return { success: false, message: 'أمر مكرر — تم تجاهله (نفس الزوج والاتجاه خلال 5 دقائق)' };
        }
      } catch (redisErr: any) {
        // FIX: إذا فشل Redis في التحقق، نتابع بدون منع التكرار
        // (أفضل من رفض الأوامر الصحيحة بسبب انقطاع Redis)
        this.logger.warn(`[Dispatcher] Redis idempotency check failed — proceeding: ${redisErr.message}`);
      }

      // ── الخطوة 4: إرسال إلى حارس المخاطر ──
      let riskCheck: any;
      try {
        riskCheck = await this.riskGatekeeper.validateOrder({
          userId: request.userId,
          exchangeCredentialId: request.credentialId,
          symbol: request.symbol,
          side: request.side === 'BUY' ? OrderSideEnum.BUY : OrderSideEnum.SELL,
          type: OrderTypeEnum.MARKET,
          quantity: request.quantity,
          price: request.price ?? 0,
          stopLoss: request.stopLoss,
          idempotencyKey: `dispatcher-${idemKey}`,
        });
      } catch (riskErr: any) {
        this.logger.error(`[Dispatcher] RiskGatekeeper error: ${riskErr.message}`);
        return { success: false, error: `خطأ في حارس المخاطر: ${riskErr.message}` };
      }

      if (!riskCheck.allowed) {
        this.logger.warn(`[Dispatcher] Order blocked by risk gatekeeper: ${riskCheck.reason}`);
        return { success: false, error: `مرفوض من حارس المخاطر: ${riskCheck.reason}` };
      }

      // ── الخطوة 5: تنفيذ الأمر عبر TradingService (النقطة الوحيدة للتنفيذ) ──
      const orderRequest: PlaceOrderRequest = {
        credentialId: request.credentialId,
        symbol: request.symbol,
        side: request.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: request.quantity,
        price: request.price ?? 0,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        source: request.source as 'smart_executor' | 'agent' | 'auto_paper' | 'user_manual',
      };

      const orderResult = await this.tradingService.placeOrder(request.userId, orderRequest);

      // ── الخطوة 6: تسجيل مفتاح idempotency (منع التكرار لـ 5 دقائق) ──
      try {
        await this.redis.set(
          idemRedisKey,
          JSON.stringify({ orderId: orderResult?.id, executedAt: new Date().toISOString() }),
          this.IDEM_TTL_SEC,
        );
      } catch { /* غير حرج */ }

      this.logger.log(`[Dispatcher] ✅ Order executed: ${request.source} → ${request.symbol} ${request.side} @ ${request.price} | orderId: ${orderResult?.id}`);

      return {
        success: true,
        orderId: orderResult?.id || 'unknown',
        message: `تم تنفيذ ${request.side === 'BUY' ? 'شراء' : 'بيع'} ${request.symbol} عبر ${request.source}`,
      };

    } catch (error: any) {
      this.logger.error(`[Dispatcher] Order execution failed: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      // ── تحرير القفل دائماً (حتى عند الفشل) ──
      try {
        await this.redis.del(lockKey);
      } catch { /* غير حرج */ }
    }
  }

  /**
   * جلب الأوامر النشطة — اختياري: يمكن تصفيتها حسب المصدر
   */
  async getActiveOrders(userId: string, source?: string): Promise<any[]> {
    try {
      const where: any = { userId, status: { in: ['PENDING', 'OPEN', 'PARTIALLY_FILLED'] } };
      if (source) where.source = source;
      return await this.prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    } catch {
      return [];
    }
  }

  /**
   * إلغاء أمر نشط
   */
  async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.order.update({
        where: { id: orderId, userId },
        data: { status: 'CANCELLED' },
      });
      return true;
    } catch {
      return false;
    }
  }
}
