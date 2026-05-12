// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Order Dispatcher Service v2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// الإصلاح الجذري: توحيد خط التنفيذ
//
// قبل الإصلاح (مسارات متوازية):
//   SmartExecutor → TradingService.placeOrder() → CCXT مباشرة
//   Agent         → TradingService.placeOrder() → CCXT مباشرة
//   Frontend      → OrderController → BullMQ → ExecutionGatewayService
//
// بعد الإصلاح (مسار واحد):
//   SmartExecutor ─┐
//   Agent ──────────┼──→ OrderDispatcher → IdempotencyService
//   Frontend ───────┘                   → RiskGatekeeperService
//                                       → OrderStateManagerService (PENDING→ACCEPTED)
//                                       → BullMQ execution_queue
//                                       → OrderQueueProcessor
//                                       → ExecutionGatewayService
//                                       → BinanceAdapter | PaperTradingAdapter
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IdempotencyService } from './idempotency.service';
import { RiskGatekeeperService } from './risk-gatekeeper.service';
import { OrderStateManagerService } from './order-state-manager.service';
import {
  OrderCommand,
  OrderSideEnum,
  OrderTypeEnum,
} from '../events/order.events';
import { OrderSide, OrderType } from '@prisma/client';
import * as crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────

export interface AutoOrderRequest {
  /** المصدر: المنفذ الذكي أو الوكيل الآلي */
  source: 'smart_executor' | 'agent';
  userId: string;
  credentialId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** معرف الوثيقة من المجلس الاستراتيجي */
  briefId?: string;
  /** معرف الإشارة من الوكيل */
  signalId?: string;
  isPaperTrading?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}

// ── Service ────────────────────────────────────────────────────

@Injectable()
export class OrderDispatcherService {
  private readonly logger = new Logger(OrderDispatcherService.name);

  /** مدة منع تكرار نفس الصفقة: 5 دقائق */
  private readonly BRIEF_LOCK_TTL_SEC = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly stateManager: OrderStateManagerService,
    @InjectQueue('execution_queue') private readonly executionQueue: Queue,
  ) {
    this.logger.log(
      '🚦 OrderDispatcher v2 initialized — ALL automated orders route through BullMQ pipeline',
    );
  }

  /**
   * تقديم أمر تداول آلي
   *
   * هذه النقطة الوحيدة لكل الأوامر الآلية.
   * تمر عبر نفس pipeline الـ Frontend تماماً:
   *   IdempotencyService → RiskGatekeeperService → OrderStateManager → BullMQ
   */
  async submitOrder(request: AutoOrderRequest): Promise<OrderResult> {
    const startTime = Date.now();

    // ── 0. فحص المراكز المفتوحة والأوامر المعلقة (منع التكرار عبر المصادر) ──
    // FIX: Check for BOTH existing open positions AND pending/accepted orders.
    // Previously, we only checked for OPEN positions, but since BullMQ is async,
    // a position might not exist yet when a second order for the same pair
    // arrives. This caused both the Agent and Smart Executor to open
    // positions on the same pair — the position would be labeled with
    // whichever source was processed first, confusing users.
    try {
      // Check 1: Existing open positions
      const existingPosition = await this.prisma.position.findFirst({
        where: {
          userId: request.userId,
          symbol: request.symbol,
          status: 'OPEN',
        },
      });

      if (existingPosition) {
        const existingSource = (existingPosition as any).source || 'unknown';
        this.logger.warn(
          `[Dispatcher] BLOCKED: ${request.source} tried to open ${request.symbol} ${request.side} ` +
          `but position already exists (id: ${existingPosition.id}, source: ${existingSource})`,
        );
        return {
          success: false,
          message: `مركز مفتوح بالفعل لـ ${request.symbol} من ${existingSource} — لا يمكن فتح مركز مكرر`,
          error: `Duplicate position: ${request.symbol} already open from ${existingSource}`,
        };
      }

      // Check 2: Pending/accepted orders (prevents race condition)
      // When the first order is in the BullMQ queue but hasn't been executed yet,
      // no position exists yet. A second order from a different source would
      // pass the position check above. This order check prevents that.
      const existingOrder = await this.prisma.order.findFirst({
        where: {
          userId: request.userId,
          symbol: request.symbol,
          side: request.side === 'BUY' ? 'BUY' : 'SELL',
          status: { in: ['PENDING', 'ACCEPTED', 'SENT_TO_EXCHANGE'] },
        },
      });

      if (existingOrder) {
        // Extract source from clientOrderId to identify which system placed the order
        let orderSource = 'unknown';
        if (existingOrder.clientOrderId) {
          const knownSources = ['smart_executor', 'agent', 'auto_paper'];
          for (const src of knownSources) {
            if (existingOrder.clientOrderId.startsWith(src + '-')) {
              orderSource = src;
              break;
            }
          }
        }
        this.logger.warn(
          `[Dispatcher] BLOCKED: ${request.source} tried to open ${request.symbol} ${request.side} ` +
          `but order already pending (id: ${existingOrder.id}, source: ${orderSource})`,
        );
        return {
          success: false,
          message: `يوجد أمر معلق بالفعل لـ ${request.symbol} من ${orderSource} — لا يمكن فتح مركز مكرر`,
          error: `Duplicate order: ${request.symbol} already pending from ${orderSource}`,
        };
      }
    } catch (posErr: any) {
      // DB check failed — log warning but continue (don't block trading if DB is slow)
      this.logger.warn(`[Dispatcher] Could not check existing positions/orders: ${posErr.message}`);
    }

    // ── 1. توليد idempotency key ──────────────────────────────
    // مبني على المحتوى وليس الوقت — يمنع تكرار نفس الصفقة خلال 24 ساعة
    // ROOT FIX: Do NOT include `source` in the content key. Previously,
    // the key was `source:userId:briefRef:symbol:side`, which meant the
    // Agent and Smart Executor produced DIFFERENT keys for the same trade
    // (e.g., agent:userId:BTC:BUY vs smart_executor:userId:BTC:BUY).
    // This bypassed the 24h dedup, allowing both systems to open duplicate
    // positions on the same pair. Now: the key is `userId:briefRef:symbol:side`,
    // so both sources produce the SAME key, and the second one is blocked.
    const briefRef = request.briefId || request.signalId || 'manual';
    const contentKey = `${request.userId}:${briefRef}:${request.symbol}:${request.side}`;
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(contentKey)
      .digest('hex')
      .slice(0, 32);

    this.logger.debug(
      `[Dispatcher] ${request.source} → ${request.symbol} ${request.side} | key: ${idempotencyKey.slice(0, 8)}...`,
    );

    // ── 2. منع تكرار نفس الأمر (IdempotencyService — 24h TTL) ─
    const isUnique = await this.idempotency.checkAndLock(idempotencyKey);
    if (!isUnique) {
      this.logger.debug(
        `[Dispatcher] Duplicate order rejected: ${request.source} ${request.symbol} ${request.side}`,
      );
      return {
        success: false,
        message: `أمر مكرر — ${request.symbol} ${request.side} من ${request.source} تم استلامه مسبقاً`,
      };
    }

    try {
      // ── 3. بناء OrderCommand ───────────────────────────────────
      if (!request.stopLoss || request.stopLoss <= 0) {
        await this.idempotency.releaseLock(idempotencyKey);
        return {
          success: false,
          error: `وقف الخسارة إجباري — تم رفض الأمر من ${request.source}`,
        };
      }

      const command: OrderCommand = {
        userId: request.userId,
        exchangeCredentialId: request.credentialId,
        symbol: request.symbol,
        side: request.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: request.quantity,
        price: request.price,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        idempotencyKey,
        clientOrderId: `${request.source}-${briefRef}-${Date.now()}`,
      };

      // ── 4. حارس المخاطر (5 نقاط) ─────────────────────────────
      const riskCheck = await this.riskGatekeeper.validateOrder(command);

      if (!riskCheck.allowed) {
        this.logger.warn(
          `[Dispatcher] RiskGatekeeper BLOCKED ${request.source} order: ${riskCheck.reason}`,
        );
        // تحرير القفل — يسمح بالمحاولة مجدداً إذا تحسنت الظروف
        await this.idempotency.releaseLock(idempotencyKey);
        return {
          success: false,
          error: `مرفوض: ${riskCheck.reason}`,
        };
      }

      // ── 5. إنشاء Order في قاعدة البيانات (PENDING) ───────────
      const order = await this.stateManager.createOrder(command);

      // ── 6. تحديث الحالة إلى ACCEPTED ─────────────────────────
      await this.stateManager.updateOrderStatus(order.id, 'ACCEPTED');

      // ── 7. إرسال إلى BullMQ execution_queue ──────────────────
      // نفس الـ payload الذي يستخدمه OrderController تماماً
      try {
        await this.executionQueue.add(
          'execute',
          {
            orderId: order.id,
            userId: command.userId,
            exchangeCredentialId: command.exchangeCredentialId,
            symbol: command.symbol,
            side: command.side,
            type: command.type,
            quantity: command.quantity,
            price: command.price,
            stopLoss: command.stopLoss,
            takeProfit: command.takeProfit,
            clientOrderId: command.clientOrderId,
            idempotencyKey: command.idempotencyKey,
          },
          {
            jobId: idempotencyKey,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

        const elapsed = Date.now() - startTime;
        this.logger.log(
          `[Dispatcher] ✅ ${request.source} → ${request.symbol} ${request.side} | orderId: ${order.id} | queue: BullMQ | ${elapsed}ms`,
        );

        return {
          success: true,
          orderId: order.id,
          message: `تم قبول الأمر وإرساله للتنفيذ — orderId: ${order.id}`,
        };
      } catch (queueErr: any) {
        // BullMQ فشل — نحدث الحالة وننبّه
        this.logger.error(
          `[Dispatcher] BullMQ failed for order ${order.id}: ${queueErr.message}`,
        );
        await this.stateManager.updateOrderStatus(order.id, 'REJECTED', {
          reason: `فشل إرسال الأمر للقائمة: ${queueErr.message}`,
        });
        return {
          success: false,
          error: `فشل إرسال للتنفيذ: ${queueErr.message}`,
        };
      }
    } catch (error: any) {
      this.logger.error(
        `[Dispatcher] Unexpected error for ${request.source}: ${error.message}`,
      );
      // تحرير القفل عند الخطأ غير المتوقع
      try {
        await this.idempotency.releaseLock(idempotencyKey);
      } catch { /* silent */ }
      return { success: false, error: error.message };
    }
  }

  /**
   * جلب الأوامر النشطة للمستخدم
   */
  async getActiveOrders(userId: string, source?: string): Promise<any[]> {
    try {
      const where: any = {
        userId,
        status: { in: ['PENDING', 'ACCEPTED', 'SENT_TO_EXCHANGE'] },
      };
      if (source) {
        // نفلتر بناءً على clientOrderId الذي يبدأ بـ source
        where.clientOrderId = { startsWith: source };
      }
      return await this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch {
      return [];
    }
  }

  /**
   * إلغاء أمر نشط
   */
  async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    try {
      await this.stateManager.updateOrderStatus(orderId, 'CANCELLED', {
        reason: 'إلغاء يدوي من OrderDispatcher',
      });
      return true;
    } catch {
      return false;
    }
  }
}
