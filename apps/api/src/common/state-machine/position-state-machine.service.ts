import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeLifecycleLogger } from '../trade-lifecycle/trade-lifecycle.logger';

/**
 * V341: Position State Machine — Single Source of Truth for position lifecycle.
 *
 * ═══════════════════════════════════════════════════════════════════
 * STATE DIAGRAM:
 *
 *   OPENING → OPEN (ACTIVE)
 *                │
 *        ┌───────┼───────────┐
 *        ↓       ↓           ↓
 *     TP_HIT  SL_HIT    TIME_EXPIRED
 *        │       │           │
 *        ↓       ↓           ↓
 *   PENDING_CLOSE (close requested, awaiting execution)
 *        │
 *        ↓
 *     CLOSING (exchange order submitted)
 *        │
 *        ↓
 *     CLOSED (terminal)
 *
 * ALSO: Any state → DISPUTED (exchange sync conflict)
 *       Any state → LIQUIDATED (exchange liquidation)
 * ═══════════════════════════════════════════════════════════════════
 *
 * GOLDEN RULES:
 *   1. ONE SINGLE DECISION POINT — state = f(currentState, marketData)
 *   2. ONE SINGLE CLOSING ENGINE — closePosition only via State Machine
 *   3. NO DIRECT CLOSE OUTSIDE STATE MACHINE
 */

export type PositionState =
  | 'OPEN'
  | 'PENDING_CLOSE'
  | 'CLOSING'
  | 'CLOSED'
  | 'LIQUIDATED'
  | 'DISPUTED';

export type TransitionReason =
  | 'TP_HIT'
  | 'SL_HIT'
  | 'TIME_EXPIRED'
  | 'TRAILING_TP'
  | 'BREAK_EVEN'
  | 'STALE_POSITION'
  | 'REGIME_REVERSAL'
  | 'AUTO_STALE'
  | 'USER_MANUAL'
  | 'EMERGENCY_STOP'
  | 'EXCHANGE_SYNC'
  | 'FORCE_CLOSE';

export type CloseInitiator =
  | 'TP_ENGINE'
  | 'SL_ENGINE'
  | 'POSITION_MONITOR'
  | 'SMART_EXECUTOR'
  | 'USER'
  | 'EXCHANGE_SYNC'
  | 'RISK_ENGINE';

const VALID_TRANSITIONS: Record<PositionState, PositionState[]> = {
  OPEN: ['PENDING_CLOSE', 'CLOSED', 'LIQUIDATED', 'DISPUTED'],
  PENDING_CLOSE: ['CLOSING', 'CLOSED', 'OPEN'],
  CLOSING: ['CLOSED', 'PENDING_CLOSE'],
  CLOSED: [],
  LIQUIDATED: [],
  DISPUTED: ['CLOSED'],
};

export interface StateTransitionRequest {
  positionId: string;
  userId: string;
  toState: PositionState;
  reason: TransitionReason;
  initiator: CloseInitiator;
  price?: number;
  highestPrice?: number;
  lowestPrice?: number;
  metadata?: Record<string, any>;
}

export interface StateEvaluationResult {
  shouldClose: boolean;
  reason?: TransitionReason;
  initiator?: CloseInitiator;
  closePrice?: number;
  details?: string;
}

@Injectable()
export class PositionStateMachine {
  private readonly logger = new Logger(PositionStateMachine.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly lifecycle?: TradeLifecycleLogger,
  ) {
    this.logger.log('🔧 V341 Position State Machine initialized — single decision point active');
  }

  isValidTransition(from: PositionState, to: PositionState): boolean {
    const allowed = VALID_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  async getState(positionId: string): Promise<PositionState | null> {
    try {
      const position = await this.prisma.position.findUnique({
        where: { id: positionId },
        select: { status: true },
      });
      return (position?.status as PositionState) || null;
    } catch {
      return null;
    }
  }

  async transition(request: StateTransitionRequest): Promise<boolean> {
    const { positionId, userId, toState, reason, initiator, price, highestPrice, lowestPrice, metadata } = request;

    try {
      const currentState = await this.getState(positionId);
      if (!currentState) {
        this.logger.error(`🚨 V341: Position ${positionId} not found — cannot transition`);
        return false;
      }

      if (!this.isValidTransition(currentState, toState)) {
        this.logger.error(
          `🚨 V341 INVALID TRANSITION: ${positionId.slice(0,12)}... ${currentState}→${toState} ` +
          `(reason: ${reason}, initiator: ${initiator}) — BLOCKED`
        );
        if (this.lifecycle) {
          await this.lifecycle.log({
            positionId, userId,
            eventType: 'CLOSE_BLOCKED',
            closingSource: initiator as any,
            module: 'state-machine',
            reason: `Invalid transition ${currentState}→${toState} (${reason})`,
            price, highestPrice, lowestPrice,
            metadata: { currentState, attemptedTo: toState, reason, initiator, ...metadata },
          });
        }
        return false;
      }

      if (this.lifecycle) {
        const eventType = toState === 'CLOSED' || toState === 'LIQUIDATED' || toState === 'DISPUTED'
          ? 'CLOSE_EXECUTED' : toState === 'PENDING_CLOSE' ? 'CLOSE_REQUEST' : 'SL_UPDATE';

        await this.lifecycle.log({
          positionId, userId,
          eventType: eventType as any,
          closingSource: initiator as any,
          module: 'state-machine',
          reason: `${currentState}→${toState}: ${reason} (by ${initiator})`,
          price, highestPrice, lowestPrice,
          metadata: { fromState: currentState, toState, reason, initiator, ...metadata },
        });
      }

      await this.prisma.position.update({
        where: { id: positionId },
        data: {
          status: toState as any,
          ...(toState === 'CLOSED' || toState === 'LIQUIDATED' || toState === 'DISPUTED' ? { closedAt: new Date() } : {}),
          ...(price !== undefined && (toState === 'CLOSED' || toState === 'PENDING_CLOSE') ? { exitPrice: price } : {}),
        },
      });

      this.logger.log(`✅ V341: ${positionId.slice(0,12)}... ${currentState}→${toState} (${reason} by ${initiator})`);
      return true;
    } catch (err: any) {
      this.logger.error(`🚨 V341: Transition failed for ${positionId}: ${err.message}`);
      return false;
    }
  }

  evaluate(position: {
    side: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
    effectiveHigh: number;
    effectiveLow: number;
  }, marketData?: { pnlPercent?: number; tpProgress?: number | null }): StateEvaluationResult {
    const { side, stopLoss, takeProfit, effectiveHigh, effectiveLow } = position;

    if (takeProfit !== null) {
      const tpHit = side === 'BUY' ? effectiveHigh >= takeProfit : effectiveLow <= takeProfit;
      if (tpHit) {
        return { shouldClose: true, reason: 'TP_HIT', initiator: 'TP_ENGINE', closePrice: takeProfit,
          details: `TP hit: ${side === 'BUY' ? 'high' : 'low'}=${side === 'BUY' ? effectiveHigh : effectiveLow} ${side === 'BUY' ? '>=' : '<='} TP=${takeProfit}` };
      }
    }

    if (stopLoss !== null) {
      const slHit = side === 'BUY' ? effectiveLow <= stopLoss : effectiveHigh >= stopLoss;
      if (slHit) {
        return { shouldClose: true, reason: 'SL_HIT', initiator: 'SL_ENGINE', closePrice: stopLoss,
          details: `SL hit: ${side === 'BUY' ? 'low' : 'high'}=${side === 'BUY' ? effectiveLow : effectiveHigh} ${side === 'BUY' ? '<=' : '>='} SL=${stopLoss}` };
      }
    }

    return { shouldClose: false, details: `No SL/TP hit — ACTIVE (PnL: ${marketData?.pnlPercent?.toFixed(2) || '?'}%)` };
  }

  /**
   * Request a close — validates + logs WITHOUT changing DB status.
   *
   * CRITICAL: This method does NOT update Position.status to PENDING_CLOSE.
   * Why? Because TradingService.closePositionWithRetry() checks:
   *   if (position.status !== 'OPEN') { return alreadyClosed }
   * If we set status to PENDING_CLOSE before calling closePositionWithRetry,
   * it would treat the position as "already closed" and skip the actual close logic.
   *
   * Instead, this method:
   *   1. Checks if position is in OPEN state (valid for close request)
   *   2. Logs CLOSE_REQUEST to TradeLifecycleLog
   *   3. Returns true (allow close to proceed)
   *   4. Leaves DB status as OPEN — closePositionWithRetry will set it to CLOSED
   *
   * The confirmClose() method is called AFTER the close succeeds, but it
   * only logs (the position is already CLOSED by closePositionWithRetry).
   */
  async requestClose(request: StateTransitionRequest): Promise<boolean> {
    const { positionId, userId, reason, initiator, price, highestPrice, lowestPrice, metadata } = request;

    try {
      // 1. Get current state
      const currentState = await this.getState(positionId);
      if (!currentState) {
        this.logger.error(`🚨 V341: Position ${positionId} not found — cannot request close`);
        return false;
      }

      // 2. Validate — only OPEN positions can be closed
      // (PENDING_CLOSE means another close is already in progress)
      if (currentState !== 'OPEN') {
        this.logger.warn(
          `🚫 V341: Cannot close ${positionId.slice(0, 12)}... — status is ${currentState}, not OPEN`
        );

        // Log the blocked attempt
        if (this.lifecycle) {
          await this.lifecycle.log({
            positionId, userId,
            eventType: 'CLOSE_BLOCKED',
            closingSource: initiator as any,
            module: 'state-machine',
            reason: `Position is ${currentState}, not OPEN — close blocked`,
            price, highestPrice, lowestPrice,
            metadata: { currentState, attemptedAction: 'close', ...metadata },
          });
        }
        return false;
      }

      // 3. Log CLOSE_REQUEST (but do NOT update DB status)
      if (this.lifecycle) {
        await this.lifecycle.log({
          positionId, userId,
          eventType: 'CLOSE_REQUEST',
          closingSource: initiator as any,
          module: 'state-machine',
          reason: `Close requested: ${reason} (by ${initiator})`,
          price, highestPrice, lowestPrice,
          metadata: { reason, initiator, ...metadata },
        });
      }

      this.logger.log(
        `✅ V341: Close request APPROVED for ${positionId.slice(0, 12)}... ` +
        `(${reason} by ${initiator}) — status stays OPEN, closePositionWithRetry will handle it`
      );
      return true;
    } catch (err: any) {
      this.logger.error(`🚨 V341: requestClose failed for ${positionId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Confirm a close was executed — logs CLOSE_EXECUTED without changing DB status.
   *
   * Called by PositionMonitor AFTER closePositionWithRetry succeeds.
   * At this point, closePositionWithRetry has already set status to CLOSED.
   * This method just adds the audit log entry.
   */
  async confirmClose(positionId: string, userId: string, closePrice: number, reason: TransitionReason, initiator: CloseInitiator): Promise<boolean> {
    try {
      if (this.lifecycle) {
        await this.lifecycle.log({
          positionId, userId,
          eventType: 'CLOSE_EXECUTED',
          closingSource: initiator as any,
          module: 'state-machine',
          reason: `Close confirmed: ${reason} (by ${initiator}) @ ${closePrice}`,
          price: closePrice,
          metadata: { confirmedAt: new Date().toISOString(), reason, initiator },
        });
      }
      this.logger.log(`✅ V341: Close confirmed for ${positionId.slice(0, 12)}... (${reason} by ${initiator})`);
      return true;
    } catch (err: any) {
      this.logger.error(`🚨 V341: confirmClose failed for ${positionId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Revert a failed close — logs the failure without changing DB status.
   *
   * Called when closePositionWithRetry fails. Since requestClose() didn't
   * change the DB status (it stayed OPEN), there's nothing to revert.
   * This method just logs the failure for audit.
   */
  async revertClose(positionId: string, userId: string, reason: string): Promise<boolean> {
    try {
      if (this.lifecycle) {
        await this.lifecycle.log({
          positionId, userId,
          eventType: 'CLOSE_BLOCKED',
          closingSource: 'POSITION_MONITOR' as any,
          module: 'state-machine',
          reason: `Close FAILED — position stays OPEN: ${reason}`,
          metadata: { failedAt: new Date().toISOString(), revertReason: reason },
        });
      }
      this.logger.warn(`⚠️ V341: Close failed for ${positionId.slice(0, 12)}... — position stays OPEN (${reason.substring(0, 100)})`);
      return true;
    } catch (err: any) {
      this.logger.error(`🚨 V341: revertClose failed for ${positionId}: ${err.message}`);
      return false;
    }
  }
}
