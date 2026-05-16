import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IdempotencyService } from './idempotency.service';
import { RiskGatekeeperService } from './risk-gatekeeper.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { TradingService } from '../trading.service';
import { OrderSide, OrderType } from '@prisma/client';
import { OrderCommand } from '../events/order.events';
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
    private readonly tradingService: TradingService,
  ) {}

  async submitOrder(request: AutoOrderRequest): Promise<OrderResult> {
    const briefRef = request.briefId || request.signalId || 'manual';
    const contentKey = `${request.source}:${request.userId}:${briefRef}:${request.symbol}:${request.side}`;
    const idempotencyKey = crypto.createHash('sha256').update(contentKey).digest('hex').slice(0, 32);

    const isUnique = await this.idempotency.checkAndLock(idempotencyKey);
    if (!isUnique) {
      return { success: false, message: `أمر مكرر — ${request.symbol} ${request.side}` };
    }

    try {
      if (!request.stopLoss || request.stopLoss <= 0) {
        await this.idempotency.releaseLock(idempotencyKey);
        return { success: false, error: `وقف الخسارة إجباري` };
      }

      // ═══════════════════════════════════════════════════════════
      // FIX: Position duplicate check — relaxed for paper trading.
      // Previous code blocked ANY second position on the same symbol,
      // even if the direction was different (BUY + SELL hedge).
      // This caused the "one trade only" bug — the Strategic Council
      // generates briefs for the same high-conviction pairs (BTC/USDT,
      // ETH/USDT), and if a position was already open, ALL subsequent
      // briefs for that pair were rejected, even in paper mode.
      //
      // NEW LOGIC:
      // - Paper trading: Allow up to 2 positions per symbol (BUY+SELL hedge)
      //   This enables the executor to open a new position when the old one
      //   is stale or when the market direction changes.
      // - Real trading: Strict 1 position per symbol (same as before)
      // ═══════════════════════════════════════════════════════════
      const existing = await this.prisma.position.findFirst({
        where: { userId: request.userId, symbol: request.symbol, status: 'OPEN' },
      });
      if (existing) {
        if (request.isPaperTrading) {
          // Paper trading: Check if same direction — if different direction, allow (hedge)
          if (existing.side !== request.side) {
            this.logger.log(`[Dispatcher] Paper hedge allowed: ${request.symbol} has ${existing.side}, opening ${request.side}`);
          } else {
            // Same direction — close the existing paper position and replace it
            this.logger.log(`[Dispatcher] Paper replace: closing existing ${request.symbol} ${existing.side} to open new ${request.side}`);
            try {
              const { TradingService } = await import('../trading.service');
              // We need to close via TradingService for proper audit/order creation
              // But since we're inside OrderDispatcher which injects TradingService,
              // use it directly
              await this.tradingService.closePositionWithRetry(request.userId, {
                positionId: existing.id,
              });
            } catch (closeErr: any) {
              this.logger.warn(`[Dispatcher] Failed to close existing paper position ${existing.id}: ${closeErr.message}`);
              await this.idempotency.releaseLock(idempotencyKey);
              return { success: false, message: `فشل إغلاق المركز القديم لـ ${request.symbol}: ${closeErr.message}` };
            }
          }
        } else {
          // Real trading: Strict — no duplicate positions on same symbol
          await this.idempotency.releaseLock(idempotencyKey);
          return { success: false, message: `مركز مفتوح بالفعل لـ ${request.symbol}` };
        }
      }

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

      const result = await this.tradingService.placeOrder(request.userId, {
        credentialId: request.credentialId,
        symbol: request.symbol,
        side: request.side === 'BUY' ? 'BUY' as any : 'SELL' as any,
        type: 'MARKET' as any,
        quantity: request.quantity,
        price: request.price,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        source: request.source as any,
      });

      this.logger.log(`✅ [${request.source}] ${request.symbol} ${request.side} | orderId: ${result?.id}`);
      return { success: true, orderId: result?.id || 'unknown' };

    } catch (err: any) {
      this.logger.error(`[Dispatcher] ${err.message}`);
      try { await this.idempotency.releaseLock(idempotencyKey); } catch {}
      return { success: false, error: err.message };
    }
  }

  async getActiveOrders(userId: string): Promise<any[]> {
    try {
      return await this.prisma.order.findMany({
        where: { userId, status: { in: ['PENDING', 'ACCEPTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch { return []; }
  }
}
