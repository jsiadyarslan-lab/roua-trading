"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousTrade = void 0;
class AutonomousTrade {
    calculatePnL(currentPrice) {
        if (this.side === 'BUY') {
            return (currentPrice - this.entryPrice) * this.filledQuantity - this.fee;
        }
        else {
            return (this.entryPrice - currentPrice) * this.filledQuantity - this.fee;
        }
    }
    isStopLossHit(currentPrice) {
        if (this.side === 'BUY') {
            return currentPrice <= this.stopLoss;
        }
        else {
            return currentPrice >= this.stopLoss;
        }
    }
    isTakeProfitHit(currentPrice) {
        if (this.side === 'BUY') {
            return currentPrice >= this.takeProfit;
        }
        else {
            return currentPrice <= this.takeProfit;
        }
    }
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
    static fromSignal(signal, userId, agentRunId, credentialId) {
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
exports.AutonomousTrade = AutonomousTrade;
//# sourceMappingURL=trade.js.map