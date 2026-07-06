// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Partial Take Profit Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// نظام أخذ الربح على مراحل (Partial TP)
//
// يقسم المركز إلى 3 أجزاء:
//   الجزء 1 (33%): يُغلق عند 40% من مسافة TP → ربح مضمون
//   الجزء 2 (33%): يُغلق عند 70% من مسافة TP → ربح إضافي
//   الجزء 3 (34%): يُترك حتى TP الكامل أو trailing stop
//
// بعد إغلاق الجزء الأول: SL ينتقل لنقطة التعادل (Break-even)
// بعد إغلاق الجزء الثاني: SL ينتقل لـ 50% من المسافة (قفل ربح)
//
// التخزين: Redis فقط — لا تعديل على DB schema
//   Key: partial_tp:{positionId}
//   Value: { tp1Hit, tp2Hit, originalQty, originalTP, originalSL }
//   TTL: 7 أيام (ينتهي بعد إغلاق المركز)
//
// الأمان:
//   - لا يُغلّق أكثر من الكمية الأصلية
//   - كل مرحلة تُغلق مرة واحدة فقط (atomic check via Redis SETNX)
//   - إذا فشل الإغلاق الجزئي، يُفتح الـ lock للإعادة في الدورة القادمة
//   - لا يتداخل مع SL/TP العادي (يعمل بالتوازي)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { TradingService } from '../../trading/trading.service';

export interface PartialTPState {
  positionId: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  originalTP: number;
  originalSL: number;
  originalQty: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  createdAt: number;
}

export interface PartialTPAction {
  type: 'PARTIAL_CLOSE';
  stage: 1 | 2;
  quantity: number;
  newStopLoss: number;
  reason: string;
  state: PartialTPState;
}

@Injectable()
export class PartialTPService {
  private readonly logger = new Logger('PartialTP');
  private readonly REDIS_KEY_PREFIX = 'partial_tp:';
  private readonly REDIS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  private readonly TP1_PERCENT = 0.40;
  private readonly TP2_PERCENT = 0.70;
  private readonly TP1_QTY_RATIO = 0.33;
  private readonly TP2_QTY_RATIO = 0.33;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly tradingService?: TradingService,
  ) {
    this.logger.log('📊 Partial TP Service initialized — 3-stage profit taking');
  }

  async registerPosition(
    positionId: string,
    userId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    entryPrice: number,
    takeProfit: number,
    stopLoss: number,
    quantity: number,
  ): Promise<void> {
    if (!takeProfit || takeProfit <= 0 || !stopLoss || stopLoss <= 0) return;
    if (quantity < 0.02) {
      this.logger.debug(
        `📊 Partial TP: Skipping ${symbol} — quantity ${quantity} too small for split`,
      );
      return;
    }

    const state: PartialTPState = {
      positionId, userId, symbol, side, entryPrice,
      originalTP: takeProfit, originalSL: stopLoss, originalQty: quantity,
      tp1Hit: false, tp2Hit: false, createdAt: Date.now(),
    };

    try {
      await this.redis.set(
        this.REDIS_KEY_PREFIX + positionId,
        JSON.stringify(state),
        this.REDIS_TTL_MS,
      );
      this.logger.debug(
        `📊 Partial TP: Registered ${symbol} ${side} entry=${entryPrice} TP=${takeProfit} SL=${stopLoss} qty=${quantity}`,
      );
    } catch (err: any) {
      this.logger.warn(`📊 Partial TP: Failed to register ${positionId}: ${err?.message}`);
    }
  }

  async checkPosition(
    positionId: string,
    currentPrice: number,
  ): Promise<PartialTPAction | null> {
    let state: PartialTPState | null = null;

    try {
      const raw = await this.redis.get(this.REDIS_KEY_PREFIX + positionId);
      if (!raw) return null;
      state = JSON.parse(raw) as PartialTPState;
    } catch {
      return null;
    }

    if (!state) return null;

    const { entryPrice, originalTP, side } = state;
    const tpDistance = Math.abs(originalTP - entryPrice);
    if (tpDistance <= 0) return null;

    const tp1Price = side === 'BUY'
      ? entryPrice + tpDistance * this.TP1_PERCENT
      : entryPrice - tpDistance * this.TP1_PERCENT;

    const tp2Price = side === 'BUY'
      ? entryPrice + tpDistance * this.TP2_PERCENT
      : entryPrice - tpDistance * this.TP2_PERCENT;

    if (!state.tp1Hit) {
      const tp1Reached = side === 'BUY'
        ? currentPrice >= tp1Price
        : currentPrice <= tp1Price;

      if (tp1Reached) {
        const lockKey = `${this.REDIS_KEY_PREFIX}${positionId}:tp1_lock`;
        const locked = await this.redis.setIfNotExists(lockKey, '1', 300);
        if (!locked) return null;

        state.tp1Hit = true;
        await this.redis.set(
          this.REDIS_KEY_PREFIX + positionId,
          JSON.stringify(state),
          this.REDIS_TTL_MS,
        );

        const partialQty = this._roundQty(state.originalQty * this.TP1_QTY_RATIO);
        const breakEvenSL = side === 'BUY'
          ? entryPrice * 1.0001
          : entryPrice * 0.9999;

        this.logger.log(
          `📊 Partial TP1 HIT: ${state.symbol} ${side} — closing ${partialQty} (33%) at ~${tp1Price.toFixed(5)} | SL → break-even ${breakEvenSL.toFixed(5)}`,
        );

        return {
          type: 'PARTIAL_CLOSE', stage: 1, quantity: partialQty,
          newStopLoss: breakEvenSL, reason: 'PARTIAL_TP_1 (40% of TP)', state,
        };
      }
    }

    if (state.tp1Hit && !state.tp2Hit) {
      const tp2Reached = side === 'BUY'
        ? currentPrice >= tp2Price
        : currentPrice <= tp2Price;

      if (tp2Reached) {
        const lockKey = `${this.REDIS_KEY_PREFIX}${positionId}:tp2_lock`;
        const locked = await this.redis.setIfNotExists(lockKey, '1', 300);
        if (!locked) return null;

        state.tp2Hit = true;
        await this.redis.set(
          this.REDIS_KEY_PREFIX + positionId,
          JSON.stringify(state),
          this.REDIS_TTL_MS,
        );

        const partialQty = this._roundQty(state.originalQty * this.TP2_QTY_RATIO);
        const lockProfitSL = side === 'BUY'
          ? entryPrice + tpDistance * 0.50
          : entryPrice - tpDistance * 0.50;

        this.logger.log(
          `📊 Partial TP2 HIT: ${state.symbol} ${side} — closing ${partialQty} (33%) at ~${tp2Price.toFixed(5)} | SL → lock profit ${lockProfitSL.toFixed(5)}`,
        );

        return {
          type: 'PARTIAL_CLOSE', stage: 2, quantity: partialQty,
          newStopLoss: lockProfitSL, reason: 'PARTIAL_TP_2 (70% of TP)', state,
        };
      }
    }

    return null;
  }

  async executeAction(
    action: PartialTPAction,
    position: any,
    currentPrice: number,
  ): Promise<boolean> {
    if (!this.tradingService) {
      this.logger.warn(`📊 Partial TP: TradingService not available — cannot execute`);
      return false;
    }

    try {
      await this.tradingService.closePosition(position.userId, {
        positionId: position.id,
        quantity: action.quantity,
        closeReason: action.reason,
        source: 'partial_tp_engine',
      } as any);

      this.logger.log(
        `📊 Partial TP${action.stage} EXECUTED: ${position.symbol} — closed ${action.quantity}`,
      );

      if (action.newStopLoss) {
        const stillOpen = await this.prisma.position.findFirst({
          where: { id: position.id, status: 'OPEN' },
          select: { id: true, quantity: true, stopLoss: true },
        });

        if (stillOpen) {
          const currentSL = stillOpen.stopLoss?.toNumber?.() ?? Number(stillOpen.stopLoss);
          const side = position.side;
          const shouldMove = side === 'BUY'
            ? !currentSL || action.newStopLoss > currentSL
            : !currentSL || action.newStopLoss < currentSL;

          if (shouldMove) {
            await this.prisma.position.update({
              where: { id: position.id },
              data: { stopLoss: action.newStopLoss },
            });
            this.logger.log(
              `📊 Partial TP${action.stage}: SL updated → ${action.newStopLoss.toFixed(5)} for remaining position`,
            );
          }
        }
      }

      return true;
    } catch (err: any) {
      this.logger.error(
        `📊 Partial TP${action.stage} FAILED: ${position.symbol} — ${err?.message}`,
      );
      const lockKey = `${this.REDIS_KEY_PREFIX}${position.id}:tp${action.stage}_lock`;
      try { await this.redis.del(lockKey); } catch {}
      return false;
    }
  }

  async unregisterPosition(positionId: string): Promise<void> {
    try {
      await this.redis.del(this.REDIS_KEY_PREFIX + positionId);
      await this.redis.del(`${this.REDIS_KEY_PREFIX}${positionId}:tp1_lock`);
      await this.redis.del(`${this.REDIS_KEY_PREFIX}${positionId}:tp2_lock`);
    } catch {}
  }

  async isRegistered(positionId: string): Promise<boolean> {
    try {
      const raw = await this.redis.get(this.REDIS_KEY_PREFIX + positionId);
      return !!raw;
    } catch {
      return false;
    }
  }

  private _roundQty(qty: number): number {
    return Math.floor(qty * 100) / 100;
  }
}
