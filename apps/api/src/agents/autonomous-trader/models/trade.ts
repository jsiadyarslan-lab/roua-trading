// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Autonomous Trade Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { StrategyType, AgentDecision, TradeExecution, EvaluatedSignal } from '../types/agent.types';

/**
 * AutonomousTrade — Record of a trade made by the autonomous agent
 *
 * This model tracks every trade the autonomous agent makes,
 * including the reasoning, strategy used, risk assessment,
 * and full audit trail for compliance and analysis.
 */
export class AutonomousTrade {
  id: string;
  userId: string;
  agentRunId: string; // Groups trades within a single agent session

  // Trade Details
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  strategy: StrategyType;
  status: 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'FAILED';

  // Pricing
  entryPrice: number;
  currentPrice?: number;
  exitPrice?: number;
  stopLoss: number; // MANDATORY — no trade without SL
  takeProfit: number;

  // Quantity & P&L
  quantity: number;
  filledQuantity: number;
  pnl?: number;
  fee: number;
  feeCurrency: string;

  // Risk & Confidence
  riskScore: number;
  confidence: number;
  riskRewardRatio: number;

  // Strategy Context
  reasoning: string;
  signalData: Record<string, any>; // The evaluated signal that triggered this trade
  metadata: Record<string, any>; // Additional strategy-specific data

  // Audit Trail
  decisions: AgentDecision[];

  // Execution Details
  execution: TradeExecution | null;

  // Timing
  openedAt: Date;
  closedAt?: Date;
  holdingDurationMs?: number;

  // Exchange
  credentialId: string;
  exchangeOrderId?: string;

  // Performance Categorization
  isWinning?: boolean;
  exitReason?: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'TRAILING_STOP' | 'STRATEGY_EXIT';

  /**
   * Calculate P&L for this trade
   */
  calculatePnL(currentPrice: number): number {
    if (this.side === 'BUY') {
      return (currentPrice - this.entryPrice) * this.filledQuantity - this.fee;
    } else {
      return (this.entryPrice - currentPrice) * this.filledQuantity - this.fee;
    }
  }

  /**
   * Check if the stop-loss would be hit at the given price
   */
  isStopLossHit(currentPrice: number): boolean {
    if (this.side === 'BUY') {
      return currentPrice <= this.stopLoss;
    } else {
      return currentPrice >= this.stopLoss;
    }
  }

  /**
   * Check if the take-profit would be hit at the given price
   */
  isTakeProfitHit(currentPrice: number): boolean {
    if (this.side === 'BUY') {
      return currentPrice >= this.takeProfit;
    } else {
      return currentPrice <= this.takeProfit;
    }
  }

  /**
   * Convert to Prisma-compatible data for storage
   */
  toPrismaData() {
    return {
      userId: this.userId,
      agentRunId: this.agentRunId,
      symbol: this.symbol,
      side: this.side,
      orderType: this.orderType,
      strategy: this.strategy,
      status: this.status,
      entryPrice: this.entryPrice,
      currentPrice: this.currentPrice ?? null,
      exitPrice: this.exitPrice ?? null,
      stopLoss: this.stopLoss,
      takeProfit: this.takeProfit,
      quantity: this.quantity,
      filledQuantity: this.filledQuantity,
      pnl: this.pnl ?? null,
      fee: this.fee,
      feeCurrency: this.feeCurrency,
      riskScore: this.riskScore,
      confidence: this.confidence,
      riskRewardRatio: this.riskRewardRatio,
      reasoning: this.reasoning,
      signalData: JSON.stringify(this.signalData),
      metadata: JSON.stringify(this.metadata),
      decisions: JSON.stringify(this.decisions),
      execution: this.execution ? JSON.stringify(this.execution) : null,
      openedAt: this.openedAt,
      closedAt: this.closedAt ?? null,
      holdingDurationMs: this.holdingDurationMs ?? null,
      credentialId: this.credentialId,
      exchangeOrderId: this.exchangeOrderId ?? null,
      isWinning: this.isWinning ?? null,
      exitReason: this.exitReason ?? null,
    };
  }

  /**
   * Create from evaluated signal
   */
  static fromSignal(
    signal: EvaluatedSignal,
    userId: string,
    agentRunId: string,
    credentialId: string,
  ): AutonomousTrade {
    const trade = new AutonomousTrade();
    trade.id = `at-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    trade.userId = userId;
    trade.agentRunId = agentRunId;
    trade.symbol = signal.symbol;
    trade.side = signal.action;
    trade.orderType = signal.type;
    trade.strategy = signal.strategy;
    trade.status = 'PENDING';
    trade.entryPrice = signal.entryPrice;
    trade.stopLoss = signal.stopLoss;
    trade.takeProfit = signal.takeProfit;
    trade.quantity = signal.quantity;
    trade.filledQuantity = 0;
    trade.fee = 0;
    trade.feeCurrency = 'USD';
    trade.riskScore = signal.riskScore;
    trade.confidence = signal.confidence;
    trade.riskRewardRatio = signal.riskRewardRatio;
    trade.reasoning = signal.reasoning;
    trade.signalData = signal.metadata;
    trade.metadata = {};
    trade.decisions = [];
    trade.execution = null;
    trade.openedAt = new Date();
    trade.credentialId = credentialId;
    return trade;
  }
}
