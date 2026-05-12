// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Order Dispatcher Service v3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// المرحلة 2: تبسيط البنية
// الأوامر الآلية → ExchangeGateway مباشرة (بدون BullMQ)
// BullMQ يبقى للتنفيذ اليدوي فقط
//
// المسار الجديد:
//   SmartExecutor / Agent
//       → OrderDispatcher
//       → IdempotencyService
//       → RiskGatekeeperService
//       → OrderStateManager (PENDING)
//       → ExecutionGatewayService (مباشرة)
//       → BinanceAdapter / PaperTradingAdapter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IdempotencyService } from './idempotency.service';
import { RiskGatekeeperService } from './risk-gatekeeper.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { ExecutionGatewayService } from '../../execution/gateways/execution-gateway.service';
import { OrderCommand, OrderSideEnum, OrderTypeEnum } from '../events/order.events';
import { OrderSide, OrderType } from '@prisma/client';
import * as crypto from 'crypto';

export interface AutoOrderRequest {
  source: 'smart_executor' | 'agent';
  userId: string;
  credentialId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
    private readonly riskGatekeeper: RiskGatekeeperService,
    private readonly stateManager: OrderStateManagerService,
    private readonly executionGateway: ExecutionGatewayService,
  ) {
    this.logger.log('🚦 OrderDispatcher v3 — direct ExchangeGateway (no BullMQ)');
  }

  async submitOrder(request: AutoOrderRequest): Promise<OrderResult> {
    const start = Date.now();
    const briefRef = request.briefId || request.signalId || 'manual';

    // ── 1. Idempotency key (content-based, not time-based) ──
    const contentKey = `${request.source}:${request.userId}:${briefRef}:${request.symbol}:${request.side}`;
    const idempotencyKey = crypto.createHash('sha256').update(contentKey).digest('hex').slice(0, 32);

    // ── 2. منع تكرار نفس الأمر ──
    const isUnique = await this.idempotency.checkAndLock(idempotencyKey);
    if (!isUnique) {
      return { success: false, message: `أمر مكرر — ${request.symbol} ${request.side}` };
    }

    try {
      // ── 3. stop-loss إجباري ──
      if (!request.stopLoss || request.stopLoss <= 0) {
        await this.idempotency.releaseLock(idempotencyKey);
        return { success: false, error: `وقف الخسارة إجباري — رُفض من ${request.source}` };
      }

      // ── 4. منع صفقة مكررة على نفس الزوج ──
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId: request.userId, symbol: request.symbol, status: 'OPEN' },
      });
      if (existingPosition) {
        await this.idempotency.releaseLock(idempotencyKey);
        return { success: false, message: `مركز مفتوح بالفعل لـ ${request.symbol}` };
      }

      // ── 5. حارس المخاطر ──
      const command: OrderCommand = {
        userId: request.userId,
        exchangeCredentialId: request.credentialId,
        symbol: request.symbol,
        side: request.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: request.quantity,
        price: request.price,
        stopLoss: request.stopLoss ?? 0,
        takeProfit: request.takeProfit,
        idempotencyKey,
        clientOrderId: `${request.source}-${briefRef}-${Date.now()}`,
      };

      const riskCheck = await this.riskGatekeeper.validateOrder(command);
      if (!riskCheck.allowed) {
        await this.idempotency.releaseLock(idempotencyKey);
        return { success: false, error: `مرفوض: ${riskCheck.reason}` };
      }

      // ── 6. إنشاء Order في DB ──
      const order = await this.stateManager.createOrder(command);
      await this.stateManager.updateOrderStatus(order.id, 'ACCEPTED');

      // ── 7. التنفيذ المباشر عبر ExchangeGateway (لا BullMQ) ──
      const execResult = await this.executionGateway.placeOrder(request.userId, {
        id: order.id,
        userId: request.userId,
        exchangeCredentialId: request.credentialId,
        symbol: request.symbol,
        side: request.side as any,
        type: 'MARKET' as any,
        quantity: request.quantity,
        price: request.price,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        clientOrderId: command.clientOrderId,
        idempotencyKey,
      });

      if (execResult.success) {
        await this.stateManager.updateOrderStatus(order.id, 'FILLED', {
          exchangeOrderId: execResult.exchangeOrderId,
          filledQty: request.quantity,
          avgPrice: execResult.averagePrice,
        });

        const elapsed = Date.now() - start;
        this.logger.log(
          `✅ [${request.source}] ${request.symbol} ${request.side} ` +
          `| orderId: ${order.id} | ${elapsed}ms`,
        );
        return { success: true, orderId: order.id };
      } else {
        await this.stateManager.updateOrderStatus(order.id, 'REJECTED', {
          reason: execResult.error,
        });
        return { success: false, error: execResult.error };
      }
    } catch (err: any) {
      this.logger.error(`[Dispatcher] Error: ${err.message}`);
      try { await this.idempotency.releaseLock(idempotencyKey); } catch {}
      return { success: false, error: err.message };
    }
  }

  async getActiveOrders(userId: string, source?: string): Promise<any[]> {
    try {
      const where: any = { userId, status: { in: ['PENDING', 'ACCEPTED', 'SENT_TO_EXCHANGE'] } };
      if (source) where.clientOrderId = { startsWith: source };
      return await this.prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    } catch { return []; }
  }

  async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    try {
      await this.stateManager.updateOrderStatus(orderId, 'CANCELLED', { reason: 'إلغاء يدوي' });
      return true;
    } catch { return false; }
  }
}
