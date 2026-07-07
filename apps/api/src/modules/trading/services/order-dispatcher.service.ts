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
import { t } from '../../../i18n/i18n.helper';

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
      return { success: false, message: t('order_dispatcher_service.msg_a5e120da', { symbol: request.symbol, side: request.side, source: request.source }) };
    }

    // Check per-symbol lock (shorter TTL — just prevents rapid-fire duplicates)
    const isSymbolUnique = await this.idempotency.checkAndLock(symbolSourceIdempotencyKey, request.timeframe);
    if (!isSymbolUnique) {
      // Release the source lock since we're not proceeding
      try { await this.idempotency.releaseLock(sourceIdempotencyKey); } catch {}
      return { success: false, message: t('order_dispatcher_service.msg_2aca0b87', { symbol: request.symbol, side: request.side, source: request.source }) };
    }

    try {
      if (!request.stopLoss || request.stopLoss <= 0) {
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
        return { success: false, error: t('order_dispatcher_service.loss') };
      }

      // ═══════════════════════════════════════════════════════════
      // V238: REMOVED V221 "ONE position per symbol" check.
      //
      // PROBLEM: V221 blocked ALL new positions on a symbol that already had
      // an open position. This is WRONG for a professional trading platform:
      //   - Binance Spot: allows buying the same symbol multiple times
      //   - Binance Futures (One-way): merges into one position (averaging)
      //   - Binance Futures (Hedge): allows long + short simultaneously
      //   - MT5: each trade is a SEPARATE position with unique ticket
      //
      // A trading platform MUST allow:
      //   - Averaging down/up (buy more at different prices)
      //   - Pyramiding (add to winning position)
      //   - Grid trading (multiple positions at different levels)
      //   - Hedging (long + short on same symbol, hedge mode)
      //
      // FIX: Remove the "one position per symbol" check entirely.
      // Each order creates a SEPARATE position in the DB (like MT5 tickets).
      // Safety is still enforced by:
      //   - UnifiedRiskService (margin, daily loss, position size %)
      //   - IdempotencyService (prevents double-submit of same order)
      //   - 15-minute cooldown after SL/TP close (below)
      // ═══════════════════════════════════════════════════════════

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
      // V349: Filter cooldown by credentialId — a close on credential A (paper)
      // should NOT block a new open on credential B (MT5) for the same symbol.
      // Previously this was a global block per user+symbol, which prevented
      // multi-account users from trading the same symbol on different accounts.
      const recentlyClosed = await this.prisma.position.findFirst({
        where: {
          userId: request.userId,
          symbol: request.symbol,
          status: { in: ['CLOSED', 'LIQUIDATED'] },
          closedAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
          credentialId: request.credentialId, // V349: per-credential cooldown
        },
        orderBy: { closedAt: 'desc' },
      });
      if (recentlyClosed) {
        const closedAgo = Math.round((Date.now() - new Date(recentlyClosed.closedAt!).getTime()) / 60000);
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
        this.logger.warn(`🛡️ V221 DB-COOLDOWN: Blocked ${request.source} ${request.side} on ${request.symbol} — position closed ${closedAgo} min ago (cooldown: ${COOLDOWN_MINUTES} min)`);
        return { success: false, message: t('order_dispatcher_service.done', { symbol: request.symbol, closedAgo: closedAgo }) };
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
        // BUG-066l: Log the ACTUAL rejection reason to console for debugging.
        // Previously only logged to riskEventAudit (not visible in Railway logs),
        // making it impossible to diagnose why orders were rejected.
        this.logger.warn(
          `🛡️ [DISPATCHER] Order REJECTED for user ${request.userId}: ` +
          `${request.side} ${request.quantity} ${request.symbol} ` +
          `(source: ${request.source}) — Reason: ${riskCheck.reason} ` +
          `(failedCheck: ${(riskCheck as any).failedCheck || 'unknown'})`
        );
        await this.idempotency.releaseLock(sourceIdempotencyKey);
        try { await this.idempotency.releaseLock(symbolSourceIdempotencyKey); } catch {}
        return { success: false, error: t('order_dispatcher_service.msg_c9f920c1', { reason: riskCheck.reason }) };
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
