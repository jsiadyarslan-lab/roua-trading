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
  /** V132: Timeframe of the brief/signal — used for smart idempotency TTL */
  timeframe?: string;
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
    // ═══════════════════════════════════════════════════════════════════
    // V132 FIX: Source-specific idempotency — allow executor AND agent
    // to trade the same symbol+side independently.
    //
    // PROBLEM (V129): The cross-source key (userId:symbol:side) prevented
    // BOTH systems from trading the same pair. If the executor opened
    // BTC/USDT BUY, the agent was BLOCKED from BTC/USDT BUY for 60s.
    // With 7 crypto pairs × 2 sides = 14 possible directions, and the
    // executor trying every 10s, the agent was almost always blocked.
    //
    // V132 FIX: Each source has its own idempotency key. Duplicate
    // prevention within the same source is handled by the source-specific
    // key (source:userId:briefRef:symbol:side). Cross-source coordination
    // is handled by:
    //   1. Position.findFirst() — can't open if position already exists
    //   2. Paper trading hedge logic — allows BUY+SELL on same symbol
    //   3. RiskGatekeeper — validates total exposure
    //
    // This is SAFE because:
    //   - Paper trading: Allows hedge (BUY+SELL), auto-closes stale positions
    //   - Real trading: Strict 1 position per symbol (Position.findFirst check)
    //   - Both: SL mandatory, RiskGatekeeper validates
    // ═══════════════════════════════════════════════════════════════════
    const briefRef = request.briefId || request.signalId || 'manual';

    // Source-specific key — prevents same system from double-submitting
    // V132: Includes timeframe for smart TTL
    const sourceKey = `${request.source}:${request.userId}:${briefRef}:${request.symbol}:${request.side}`;
    const sourceIdempotencyKey = crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 32);

    // Per-symbol-per-source lock — prevents the SAME source from opening
    // multiple positions on the same symbol within the TTL window
    const symbolSourceKey = `${request.source}:${request.userId}:${request.symbol}:${request.side}`;
    const symbolSourceIdempotencyKey = crypto.createHash('sha256').update(symbolSourceKey).digest('hex').slice(0, 32);

    // Check source-specific lock first (with smart TTL based on timeframe)
    const isUnique = await this.idempotency.checkAndLock(sourceIdempotencyKey, request.timeframe);
    if (!isUnique) {
      return { success: false, message: `أمر مكرر — ${request.symbol} ${request.side} (${request.source})` };
    }

    // Check per-symbol lock (shorter TTL — just prevents rapid-fire duplicates)
    const isSymbolUnique = await this.idempotency.checkAndLock(symbolSourceIdempotencyKey, request.timeframe);
    if (!isSymbolUnique) {
      // Release the source lock since we're not proceeding
      try { await this.idempotency.releaseLock(sourceIdempotencyKey); } catch {}
      return { success: false, message: `مركز نشط على ${request.symbol} ${request.side} من ${request.source}` };
    }

    try {
      if (!request.stopLoss || request.stopLoss <= 0) {
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
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
        // ═══════════════════════════════════════════════════════════════════
        // V133 FIX: STOP closing existing positions to replace them.
        //
        // The old logic closed existing paper positions when a new brief
        // had the same direction, causing the "open and close after 1 second"
        // infinite loop (see SmartExecutor V133 fix for details).
        //
        // NEW BEHAVIOR:
        //   - Same direction as existing → REJECT (duplicate)
        //   - Opposite direction + paper → Allow hedge
        //   - Opposite direction + real → REJECT
        //   - NEVER close an existing position to make room for a new one
        // ═══════════════════════════════════════════════════════════════════
        if (existing.side === request.side) {
          // Same direction — reject as duplicate
          await this.idempotency.releaseLock(sourceIdempotencyKey);
          try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
          return { success: false, message: `مركز ${existing.side} مفتوح بالفعل لـ ${request.symbol}` };
        }

        if (request.isPaperTrading) {
          // Paper trading: Opposite direction → allow hedge
          this.logger.log(`[Dispatcher] V133 Paper hedge allowed: ${request.symbol} has ${existing.side}, opening ${request.side}`);
        } else {
          // Real trading: No hedge — reject
          await this.idempotency.releaseLock(sourceIdempotencyKey);
          try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
          return { success: false, message: `مركز مفتوح بالفعل لـ ${request.symbol} (لا تحوط في التداول الحقيقي)` };
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
        idempotencyKey: sourceIdempotencyKey,
        clientOrderId: `${request.source}-${briefRef}-${Date.now()}`,
        isPaperTrading: request.isPaperTrading ?? false,
        source: request.source,  // V145: Pass source to RiskGatekeeper for source-aware position counting
      };

      const riskCheck = await this.riskGatekeeper.validateOrder(command);
      if (!riskCheck.allowed) {
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
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
      // Cross-source lock auto-expires in 60s, source lock auto-expires per idempotency config
      return { success: true, orderId: result?.id || 'unknown' };

    } catch (err: any) {
      this.logger.error(`[Dispatcher] ${err.message}`);
      try { await this.idempotency.releaseLock(sourceIdempotencyKey); } catch {}
      try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
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
