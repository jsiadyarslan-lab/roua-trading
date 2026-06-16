import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IdempotencyService } from './idempotency.service';
// REMOVED: RiskGatekeeperService — deprecated, replaced by UnifiedRiskService (V219)
import { UnifiedRiskService } from './unified-risk.service';
import { OrderStateManagerService } from './order-state-manager.service';
import { TradingService } from '../trading.service';
import { OrderSide, OrderType } from '../trading.types';
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
    private readonly unifiedRisk: UnifiedRiskService,  // V219: Unified risk — replaces RiskGatekeeper
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
      // V221 FIX: ONE position per symbol — NO opposite-direction hedging.
      //
      // PROBLEM: V146c allowed cross-source opposite direction (BUY from
      // SmartExecutor + SELL from Agent on same symbol). In practice this
      // means the user pays spread/slippage TWICE while the positions
      // cancel each other's P&L. This was the #1 cause of net losses.
      //
      // NEW RULE: Only ONE open position per symbol, regardless of source
      // or direction. If any position exists on a symbol, block new ones.
      // ═══════════════════════════════════════════════════════════
      const existing = await this.prisma.position.findFirst({
        where: { userId: request.userId, symbol: request.symbol, status: 'OPEN' },
      });
      if (existing) {
        // Block ALL positions on a symbol that already has an open position
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
        return { success: false, message: `يوجد مركز ${existing.side} مفتوح لـ ${request.symbol} (${existing.source}) — لا يمكن فتح مركز آخر على نفس الزوج` };
      }

      // ═══════════════════════════════════════════════════════════
      // V221-HOTFIX: DB-level cooldown — check recently CLOSED positions.
      //
      // PROBLEM: Redis-based symbol-lock was not preventing immediate re-open
      // after manual close. Root cause unclear (Redis timing? deploy lag?).
      // This DB query is BULLETPROOF — it checks the actual position records
      // and blocks any new position on a symbol that was closed within the
      // last 15 minutes, regardless of direction or source.
      //
      // This is the FINAL safety net — even if all Redis checks fail,
      // this DB check will prevent flip-flop trades.
      // ═══════════════════════════════════════════════════════════
      const COOLDOWN_MINUTES = 15;
      const recentlyClosed = await this.prisma.position.findFirst({
        where: {
          userId: request.userId,
          symbol: request.symbol,
          status: { in: ['CLOSED', 'LIQUIDATED'] },
          closedAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
        },
        orderBy: { closedAt: 'desc' },
      });
      if (recentlyClosed) {
        const closedAgo = Math.round((Date.now() - new Date(recentlyClosed.closedAt!).getTime()) / 60000);
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
        this.logger.warn(`🛡️ V221 DB-COOLDOWN: Blocked ${request.source} ${request.side} on ${request.symbol} — position closed ${closedAgo} min ago (cooldown: ${COOLDOWN_MINUTES} min)`);
        return { success: false, message: `تم إغلاق مركز على ${request.symbol} قبل ${closedAgo} دقيقة — انتظر ${COOLDOWN_MINUTES - closedAgo} دقيقة قبل فتح مركز جديد` };
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

      // V219: Use UnifiedRiskService instead of RiskGatekeeper
      // This is the SINGLE risk gate — no more double-check in TradingService
      const riskCheck = await this.unifiedRisk.validateOrder(command);
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
        timeframe: request.timeframe, // V204: Pass timeframe to Position DB record
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
