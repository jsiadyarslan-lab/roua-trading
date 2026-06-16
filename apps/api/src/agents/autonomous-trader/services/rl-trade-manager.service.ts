// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Reinforcement Learning Trade Manager
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V-PHASE4: إطار إدارة التداول بالتعلم المعزز (RL)
//
// يحدد البنية الأساسية لوكيل RL يتعلم من التجربة كيفية:
// - تحسين أحجام المراكز (position sizing)
// - تحسين توقيت الدخول والخروج (entry/exit timing)
// - تحسين معلمات وقف الخسارة وجني الأرباح (SL/TP optimization)
// - التكيف مع أنظمة السوق المختلفة (regime adaptation)
//
// ┌─────────────────────────────────────────────────────────────┐
// │ RL Agent Architecture:                                      │
// │                                                             │
// │ State (الحالة):                                             │
// │   - مؤشرات السوق (RSI, MACD, BB, EMA)                      │
// │   - سياق MTF (اتجاه الأطر العليا)                          │
// │   - نظام السوق الحالي (trending/ranging/volatile)          │
// │   - حالة المحفظة (عدد المراكز، PnL اليومي)                 │
// │   - تاريخ الصفقات الأخيرة (win streak / loss streak)       │
// │                                                             │
// │ Actions (الإجراءات):                                        │
// │   - حجم المركز (0.25x, 0.5x, 0.75x, 1.0x, 1.25x)         │
// │   - تعديل SL/TP (تضييق/توسيع بنسبة 10-20%)                │
// │   - قبول/رفض الإشارة                                       │
// │                                                             │
// │ Reward (المكافأة):                                          │
// │   - صفقة رابحة: +PnL / ATR (مقيسة بالتقلب)                │
// │   - صفقة خاسرة: -PnL / ATR (مقيسة بالتقلب)                │
// │   - وقف خسارة مقلوب: -2× penalty                           │
// │   - تجنب صفقة خاسرة: +0.5 (إشارة رفض صحيح)               │
// │   - تفويت صفقة رابحة: -0.5 (إشارة رفض خاطئ)              │
// └─────────────────────────────────────────────────────────────┘
//
// ملاحظة: هذا إطار أولي. التدريب الفعلي يتطلب بيئة محاكاة
// كاملة وآلاف الحلقات. حالياً يستخدم جدول Q بسيط
// يمكن استبداله لاحقاً بنموذج PPO أو DQN.

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  MarketAnalysis,
  EvaluatedSignal,
} from '../types/agent.types';

// ── Types ──

export interface RLState {
  /** Market regime: 0=RANGING, 1=TRENDING_UP, 2=TRENDING_DOWN, 3=VOLATILE */
  regime: number;
  /** RSI bucket: 0=<30, 1=30-50, 2=50-70, 3=>70 */
  rsiBucket: number;
  /** MTF alignment: 0=bearish, 1=neutral, 2=bullish */
  mtfAlignment: number;
  /** Trend strength bucket: 0=weak, 1=medium, 2=strong */
  trendStrengthBucket: number;
  /** Consecutive wins/losses: negative=losses, positive=wins */
  streakBucket: number; // -2, -1, 0, 1, 2
  /** Signal confidence bucket: 0=low(<50), 1=medium(50-70), 2=high(>70) */
  confidenceBucket: number;
}

export type RLAction =
  | 'REJECT'           // Don't take this trade
  | 'SIZE_025'         // 0.25x position size
  | 'SIZE_050'         // 0.5x position size
  | 'SIZE_075'         // 0.75x position size
  | 'SIZE_100'         // 1.0x position size (default)
  | 'SIZE_125'         // 1.25x position size (aggressive)
  | 'SL_TIGHTEN_10'   // Tighten SL by 10%
  | 'SL_WIDEN_10'     // Widen SL by 10%
  | 'TP_TIGHTEN_10'   // Reduce TP by 10%
  | 'TP_WIDEN_10';    // Increase TP by 10%

export const RL_ALL_ACTIONS: RLAction[] = [
  'REJECT', 'SIZE_025', 'SIZE_050', 'SIZE_075', 'SIZE_100', 'SIZE_125',
  'SL_TIGHTEN_10', 'SL_WIDEN_10', 'TP_TIGHTEN_10', 'TP_WIDEN_10',
];

export interface RLDecision {
  action: RLAction;
  sizeMultiplier: number;
  slAdjustment: number; // Multiplier for SL distance (e.g., 0.9 = tighten 10%)
  tpAdjustment: number; // Multiplier for TP distance
  confidence: number;   // How confident the RL agent is (0-1)
  shouldTrade: boolean;
  qValue: number;       // Q-value for the chosen action
}

export interface RLTrainingRecord {
  state: string;     // Serialized RLState
  action: RLAction;
  reward: number;
  nextState: string;
  timestamp: Date;
}

@Injectable()
export class RLTradeManagerService {
  private readonly logger = new Logger(RLTradeManagerService.name);

  /** Q-table: state → action → value */
  private qTable = new Map<string, Map<RLAction, number>>();

  /** Learning parameters */
  private readonly LEARNING_RATE = 0.1;   // α: How fast to update Q-values
  private readonly DISCOUNT_FACTOR = 0.9; // γ: Future reward importance
  private readonly EXPLORATION_RATE = 0.2; // ε: Random action probability

  constructor(
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('🤖 RL Trade Manager initialized (Q-table, ε-greedy)');
    this._loadQTable();
  }

  // ── Public API ──

  /**
   * Observe market state and get RL decision for a signal
   */
  decide(signal: EvaluatedSignal, market: MarketAnalysis, streak: number): RLDecision {
    const state = this._encodeState(signal, market, streak);

    // ε-greedy: explore (random) vs exploit (best Q-value)
    let action: RLAction;
    let qValue: number;

    if (Math.random() < this.EXPLORATION_RATE) {
      // Explore: random action
      action = RL_ALL_ACTIONS[Math.floor(Math.random() * RL_ALL_ACTIONS.length)];
      qValue = this._getQValue(state, action);
    } else {
      // Exploit: best known action
      const best = this._getBestAction(state);
      action = best.action;
      qValue = best.qValue;
    }

    // Convert action to decision
    const decision = this._actionToDecision(action, signal);

    this.logger.debug(
      `🤖 RL decision: ${action} for ${signal.symbol} ${signal.action} ` +
      `(Q=${qValue.toFixed(3)}, explore=${this.EXPLORATION_RATE > 0})`
    );

    return decision;
  }

  /**
   * Update Q-table based on trade outcome (reward)
   */
  async update(
    signal: EvaluatedSignal,
    market: MarketAnalysis,
    streak: number,
    action: RLAction,
    reward: number,
    nextMarket: MarketAnalysis | null,
    nextStreak: number,
  ): Promise<void> {
    const state = this._encodeState(signal, market, streak);
    const nextState = nextMarket
      ? this._encodeState(signal, nextMarket, nextStreak)
      : state;

    // Q-learning update: Q(s,a) = Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
    const currentQ = this._getQValue(state, action);
    const maxNextQ = this._getMaxQValue(nextState);
    const newQ = currentQ + this.LEARNING_RATE * (reward + this.DISCOUNT_FACTOR * maxNextQ - currentQ);

    this._setQValue(state, action, newQ);

    // Periodically save Q-table
    if (Math.random() < 0.1) { // Save ~10% of the time to reduce Redis writes
      await this._saveQTable();
    }
  }

  /**
   * Calculate reward for a completed trade
   */
  calculateReward(
    pnl: number,
    atr: number,
    wasWin: boolean,
    action: RLAction,
  ): number {
    // Normalize PnL by ATR for cross-market comparability
    const normalizedPnL = atr > 0 ? pnl / atr : pnl;

    if (action === 'REJECT') {
      // Rejecting a trade: small positive if it would have lost, small negative if it would have won
      return wasWin ? -0.5 : 0.3;
    }

    if (wasWin) {
      // Winning trade: positive reward scaled by PnL
      return Math.max(0.5, normalizedPnL * 2);
    } else {
      // Losing trade: negative reward
      // Extra penalty if SL was hit quickly (bad entry)
      return Math.min(-0.3, normalizedPnL * 2);
    }
  }

  /**
   * Get Q-table statistics for monitoring
   */
  getStats(): { states: number; entries: number; topStates: Array<{ state: string; bestAction: RLAction; qValue: number }> } {
    let entries = 0;
    const stateActions: Array<{ state: string; bestAction: RLAction; qValue: number }> = [];

    for (const [state, actions] of this.qTable.entries()) {
      for (const [action, qValue] of actions.entries()) {
        entries++;
      }
      const best = this._getBestAction(state);
      stateActions.push({ state, bestAction: best.action, qValue: best.qValue });
    }

    stateActions.sort((a, b) => b.qValue - a.qValue);

    return {
      states: this.qTable.size,
      entries,
      topStates: stateActions.slice(0, 10),
    };
  }

  // ── State Encoding ──

  private _encodeState(signal: EvaluatedSignal, market: MarketAnalysis, streak: number): string {
    const rlState: RLState = {
      regime: this._regimeToBucket(market),
      rsiBucket: this._rsiToBucket(market.rsi),
      mtfAlignment: this._mtfToBucket(market.mtfContext),
      trendStrengthBucket: this._trendStrengthToBucket(market.trendStrength),
      streakBucket: Math.max(-2, Math.min(2, streak)),
      confidenceBucket: signal.confidence < 50 ? 0 : signal.confidence < 70 ? 1 : 2,
    };

    // Compact state key
    return `${rlState.regime}:${rlState.rsiBucket}:${rlState.mtfAlignment}:${rlState.trendStrengthBucket}:${rlState.streakBucket}:${rlState.confidenceBucket}`;
  }

  private _regimeToBucket(market: MarketAnalysis): number {
    if (market.volatility === 'EXTREME') return 3;
    if (market.trend === 'BULLISH') return 1;
    if (market.trend === 'BEARISH') return 2;
    return 0; // SIDEWAYS / RANGING
  }

  private _rsiToBucket(rsi: number): number {
    if (rsi < 30) return 0;
    if (rsi < 50) return 1;
    if (rsi < 70) return 2;
    return 3;
  }

  private _mtfToBucket(mtf: any): number {
    if (!mtf) return 1; // Neutral
    if (mtf.mtfAlignment === 'ALIGNED_BULLISH') return 2;
    if (mtf.mtfAlignment === 'ALIGNED_BEARISH') return 0;
    return 1; // NEUTRAL or MIXED
  }

  private _trendStrengthToBucket(strength: number): number {
    if (strength < 30) return 0;
    if (strength < 60) return 1;
    return 2;
  }

  // ── Q-Table Operations ──

  private _getQValue(state: string, action: RLAction): number {
    return this.qTable.get(state)?.get(action) ?? 0;
  }

  private _setQValue(state: string, action: RLAction, value: number): void {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, new Map());
    }
    this.qTable.get(state)!.set(action, value);
  }

  private _getBestAction(state: string): { action: RLAction; qValue: number } {
    const actions = this.qTable.get(state);
    if (!actions || actions.size === 0) {
      // Default: SIZE_100 with Q=0
      return { action: 'SIZE_100', qValue: 0 };
    }

    let bestAction: RLAction = 'SIZE_100';
    let bestQ = -Infinity;

    for (const [action, qValue] of actions.entries()) {
      if (qValue > bestQ) {
        bestQ = qValue;
        bestAction = action;
      }
    }

    return { action: bestAction, qValue: bestQ };
  }

  private _getMaxQValue(state: string): number {
    const actions = this.qTable.get(state);
    if (!actions || actions.size === 0) return 0;

    let maxQ = -Infinity;
    for (const qValue of actions.values()) {
      if (qValue > maxQ) maxQ = qValue;
    }
    return maxQ;
  }

  private _actionToDecision(action: RLAction, signal: EvaluatedSignal): RLDecision {
    let sizeMultiplier = 1.0;
    let slAdjustment = 1.0;
    let tpAdjustment = 1.0;
    let shouldTrade = true;

    switch (action) {
      case 'REJECT':
        shouldTrade = false;
        sizeMultiplier = 0;
        break;
      case 'SIZE_025': sizeMultiplier = 0.25; break;
      case 'SIZE_050': sizeMultiplier = 0.5; break;
      case 'SIZE_075': sizeMultiplier = 0.75; break;
      case 'SIZE_100': sizeMultiplier = 1.0; break;
      case 'SIZE_125': sizeMultiplier = 1.25; break;
      case 'SL_TIGHTEN_10': slAdjustment = 0.9; break;
      case 'SL_WIDEN_10': slAdjustment = 1.1; break;
      case 'TP_TIGHTEN_10': tpAdjustment = 0.9; break;
      case 'TP_WIDEN_10': tpAdjustment = 1.1; break;
    }

    return {
      action,
      sizeMultiplier,
      slAdjustment,
      tpAdjustment,
      confidence: shouldTrade ? Math.min(1, Math.abs(sizeMultiplier)) : 0,
      shouldTrade,
      qValue: this._getQValue(this._encodeState(signal, {} as MarketAnalysis, 0), action),
    };
  }

  // ── Persistence ──

  private async _loadQTable(): Promise<void> {
    if (!this.redis) return;

    try {
      const data = await this.redis.get('rl:qtable');
      if (data) {
        const parsed = JSON.parse(data);
        for (const [state, actions] of Object.entries(parsed)) {
          const actionMap = new Map<RLAction, number>();
          for (const [action, value] of Object.entries(actions as Record<string, number>)) {
            actionMap.set(action as RLAction, value);
          }
          this.qTable.set(state, actionMap);
        }
        this.logger.log(`🤖 Loaded Q-table: ${this.qTable.size} states`);
      }
    } catch { /* empty Q-table */ }
  }

  private async _saveQTable(): Promise<void> {
    if (!this.redis) return;

    try {
      const obj: Record<string, Record<string, number>> = {};
      for (const [state, actions] of this.qTable.entries()) {
        obj[state] = {};
        for (const [action, value] of actions.entries()) {
          obj[state][action] = value;
        }
      }
      await this.redis.set('rl:qtable', JSON.stringify(obj), 30 * 24 * 60 * 60 * 1000); // 30 days
    } catch { /* non-critical */ }
  }
}
