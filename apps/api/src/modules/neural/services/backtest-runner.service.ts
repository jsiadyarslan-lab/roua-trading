// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Backtest Runner via AI Council
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import {
  BacktestRequest,
  BacktestStrategy,
  BacktestResult,
  BacktestTrade,
} from '../neural.types';

/**
 * Backtest Runner Service — Simulated Historical Trading
 *
 * Runs backtests by:
 * 1. Fetching historical price data
 * 2. Applying the selected strategy rules step-by-step
 * 3. Tracking entries, exits, PnL, drawdown
 * 4. Calculating risk metrics (Sharpe, max drawdown, etc.)
 * 5. Getting AI Council insights on the results (Arabic)
 *
 * Supported strategies:
 * - MOMENTUM: Buy on uptrend, sell on downtrend (RSI + SMA)
 * - MEAN_REVERSION: Buy oversold, sell overbought (Bollinger Bands)
 * - BREAKOUT: Buy on resistance break, sell on support break
 * - SCALPING: Fast in/out on small moves
 * - SWING: Hold for days on trend signals
 * - AI_COUNCIL: Use AI Council consensus at each step
 */
@Injectable()
export class BacktestRunnerService {
  private readonly logger = new Logger(BacktestRunnerService.name);

  /** Default backtest parameters */
  private readonly DEFAULT_INITIAL_CAPITAL = 10000;
  private readonly DEFAULT_POSITION_SIZE = 0.1;    // 10% per trade
  private readonly DEFAULT_STOP_LOSS = 0.03;        // 3%
  private readonly DEFAULT_TAKE_PROFIT = 0.06;       // 6%

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeService: ExchangeService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('📊 Backtest Runner initialized — historical strategy simulation');
  }

  /**
   * Run a full backtest simulation
   *
   * Step-by-step:
   * 1. Fetch historical candles
   * 2. Iterate through candles, applying strategy rules
   * 3. Track all trades with entry/exit/prices
   * 4. Calculate performance metrics
   * 5. Build equity curve
   * 6. Get AI insights on the results
   */
  async runBacktest(userId: string, request: BacktestRequest): Promise<BacktestResult> {
    this.logger.log(`📊 Running ${request.strategy} backtest on ${request.symbol}`);

    const capital = request.initialCapital || this.DEFAULT_INITIAL_CAPITAL;
    const positionSizePct = request.positionSize || this.DEFAULT_POSITION_SIZE;
    const slPct = request.stopLoss || this.DEFAULT_STOP_LOSS;
    const tpPct = request.takeProfit || this.DEFAULT_TAKE_PROFIT;

    // Step 1: Fetch historical data
    const startDate = new Date(request.periodStart);
    const endDate = new Date(request.periodEnd);
    const candles = await this.exchangeService.getHistoricalData(
      request.symbol,
      '1day',
      startDate,
      endDate,
    );

    if (candles.length < 10) {
      throw new Error('بيانات تاريخية غير كافية — يجب أن تكون الفترة 10 أيام على الأقل');
    }

    // Step 2: Run simulation
    const trades: BacktestTrade[] = [];
    const equityCurve: { date: string; value: number }[] = [];
    let currentCapital = capital;
    let openTrade: Partial<BacktestTrade> | null = null;
    let entryPrice = 0;
    let entryDate = '';
    let peakCapital = capital;
    let maxDrawdown = 0;

    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      // Calculate indicators from available data
      const smaShort = this._calculateSMA(candles, i, 5);
      const smaLong = this._calculateSMA(candles, i, 20);
      const rsi = this._calculateRSI(candles, i, 14);

      // If we have an open trade, check exit conditions
      if (openTrade) {
        const pnlPct = openTrade.side === 'BUY'
          ? (curr.close - entryPrice) / entryPrice
          : (entryPrice - curr.close) / entryPrice;

        const shouldExit = pnlPct <= -(slPct) ||   // Stop loss hit
                           pnlPct >= tpPct ||        // Take profit hit
                           this._strategyExitSignal(request.strategy, smaShort, smaLong, rsi, openTrade.side || 'BUY');

        if (shouldExit) {
          const exitPrice = curr.close;
          const quantity = (currentCapital * positionSizePct) / entryPrice;
          const pnl = openTrade.side === 'BUY'
            ? (exitPrice - entryPrice) * quantity
            : (entryPrice - exitPrice) * quantity;

          currentCapital += pnl;

          trades.push({
            entryDate,
            exitDate: this._ts(curr.timestamp),
            side: openTrade.side!,
            entryPrice,
            exitPrice,
            quantity: Math.round(quantity * 10000) / 10000,
            pnl: Math.round(pnl * 100) / 100,
            pnlPercent: Math.round(pnlPct * 10000) / 100,
            holdDuration: this._calculateDuration(entryDate, this._ts(curr.timestamp)),
            stopLoss: openTrade.side === 'BUY' ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct),
            takeProfit: openTrade.side === 'BUY' ? entryPrice * (1 + tpPct) : entryPrice * (1 - tpPct),
          });

          openTrade = null;
        }
      }

      // If no open trade, check entry conditions
      if (!openTrade) {
        const signal = this._strategyEntrySignal(request.strategy, smaShort, smaLong, rsi, curr, prev);
        if (signal) {
          openTrade = { side: signal };
          entryPrice = curr.close;
          entryDate = this._ts(curr.timestamp);
        }
      }

      // Track equity and drawdown
      peakCapital = Math.max(peakCapital, currentCapital);
      const drawdown = (peakCapital - currentCapital) / peakCapital;
      maxDrawdown = Math.max(maxDrawdown, drawdown);

      equityCurve.push({ date: this._ts(curr.timestamp), value: Math.round(currentCapital * 100) / 100 });
    }

    // Close any remaining open trade at the last price
    if (openTrade && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const pnlPct = openTrade.side === 'BUY'
        ? (lastCandle.close - entryPrice) / entryPrice
        : (entryPrice - lastCandle.close) / entryPrice;
      const quantity = (currentCapital * positionSizePct) / entryPrice;
      const pnl = openTrade.side === 'BUY'
        ? (lastCandle.close - entryPrice) * quantity
        : (entryPrice - lastCandle.close) * quantity;

      currentCapital += pnl;

      trades.push({
        entryDate,
        exitDate: this._ts(lastCandle.timestamp),
        side: openTrade.side!,
        entryPrice,
        exitPrice: lastCandle.close,
        quantity: Math.round(quantity * 10000) / 10000,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPct * 10000) / 100,
        holdDuration: this._calculateDuration(entryDate, this._ts(lastCandle.timestamp)),
        stopLoss: entryPrice * (1 - slPct),
        takeProfit: entryPrice * (1 + tpPct),
      });
    }

    // Step 3: Calculate metrics
    const metrics = this._calculateMetrics(trades, capital, currentCapital, candles.length, maxDrawdown);

    // Step 4: Get AI insights
    const aiInsights = await this._generateAIInsights(request.symbol, request.strategy, metrics, trades);

    // Audit
    await this.auditService.log({
      userId,
      action: 'BACKTEST_RUN',
      resource: 'neural-lab',
      details: JSON.stringify({
        symbol: request.symbol,
        strategy: request.strategy,
        totalReturn: metrics.totalReturn,
        trades: trades.length,
      }),
    });

    return {
      symbol: request.symbol,
      strategy: request.strategy,
      period: { start: request.periodStart, end: request.periodEnd },
      ...metrics,
      trades,
      equityCurve,
      aiInsights,
    };
  }

  /** Convert Date or string to ISO string */
  private _ts(dateOrStr: Date | string): string {
    return dateOrStr instanceof Date ? dateOrStr.toISOString() : String(dateOrStr);
  }

  // ── Strategy Signal Logic ──

  private _strategyEntrySignal(
    strategy: BacktestStrategy,
    smaShort: number,
    smaLong: number,
    rsi: number,
    curr: any,
    prev: any,
  ): 'BUY' | 'SELL' | null {
    switch (strategy) {
      case BacktestStrategy.MOMENTUM:
        if (smaShort > smaLong && rsi < 70) return 'BUY';
        if (smaShort < smaLong && rsi > 30) return 'SELL';
        return null;

      case BacktestStrategy.MEAN_REVERSION:
        if (rsi < 30) return 'BUY';  // Oversold
        if (rsi > 70) return 'SELL'; // Overbought
        return null;

      case BacktestStrategy.BREAKOUT:
        if (curr.close > prev.high && curr.volume > prev.volume) return 'BUY';
        if (curr.close < prev.low && curr.volume > prev.volume) return 'SELL';
        return null;

      case BacktestStrategy.SCALPING:
        if (curr.close > curr.open && curr.close - curr.open > curr.high - curr.close) return 'BUY';
        if (curr.close < curr.open && curr.open - curr.close > curr.close - curr.low) return 'SELL';
        return null;

      case BacktestStrategy.SWING:
        if (smaShort > smaLong && rsi > 40 && rsi < 60) return 'BUY';
        if (smaShort < smaLong && rsi > 40 && rsi < 60) return 'SELL';
        return null;

      case BacktestStrategy.AI_COUNCIL:
        // KNOWN LIMITATION: AI_COUNCIL strategy is faked in backtest mode.
        // Instead of making real-time AI Council consensus calls for each candle
        // (which would be prohibitively expensive and slow), this uses a simplified
        // RSI-based heuristic. RSI < 40 → BUY, RSI > 60 → SELL.
        // A proper implementation would need to either:
        //   1. Pre-compute AI Council signals for the backtest period, or
        //   2. Use a cached/fast AI model for each step, or
        //   3. Run the backtest in "simulation mode" with reduced AI calls.
        // For now, results from AI_COUNCIL backtests should be treated as
        // approximations and not compared directly with technical strategies.
        if (rsi < 40) return 'BUY';
        if (rsi > 60) return 'SELL';
        return null;

      default:
        return null;
    }
  }

  private _strategyExitSignal(
    strategy: BacktestStrategy,
    smaShort: number,
    smaLong: number,
    rsi: number,
    side: string,
  ): boolean {
    if (strategy === BacktestStrategy.SCALPING) return true; // Exit next candle

    if (side === 'BUY' && smaShort < smaLong) return true;
    if (side === 'SELL' && smaShort > smaLong) return true;

    return false;
  }

  // ── Technical Indicator Helpers ──

  private _calculateSMA(candles: any[], index: number, period: number): number {
    if (index < period) return candles[index]?.close || 0;
    let sum = 0;
    for (let i = index - period; i < index; i++) {
      sum += candles[i]?.close || 0;
    }
    return sum / period;
  }

  private _calculateRSI(candles: any[], index: number, period: number): number {
    if (index < period + 1) return 50; // Neutral

    let gainSum = 0;
    let lossSum = 0;

    for (let i = index - period; i < index; i++) {
      const change = (candles[i]?.close || 0) - (candles[i - 1]?.close || 0);
      if (change > 0) gainSum += change;
      else lossSum += Math.abs(change);
    }

    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // ── Metrics Calculation ──

  private _calculateMetrics(
    trades: BacktestTrade[],
    initialCapital: number,
    finalCapital: number,
    totalDays: number,
    maxDrawdown: number,
  ): Omit<BacktestResult, 'symbol' | 'strategy' | 'period' | 'trades' | 'equityCurve' | 'aiInsights'> {
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
    const annualizedReturn = totalDays > 0 ? totalReturn * (365 / totalDays) : 0;
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // Sharpe ratio (simplified — assumes risk-free rate = 0)
    const returns = trades.map((t) => t.pnlPercent);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 1;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    const bestTrade = wins.length > 0
      ? { pnl: Math.max(...wins.map((t) => t.pnl)), pnlPercent: Math.max(...wins.map((t) => t.pnlPercent)) }
      : { pnl: 0, pnlPercent: 0 };

    const worstTrade = losses.length > 0
      ? { pnl: Math.min(...losses.map((t) => t.pnl)), pnlPercent: Math.min(...losses.map((t) => t.pnlPercent)) }
      : { pnl: 0, pnlPercent: 0 };

    return {
      totalTrades: trades.length,
      winRate: Math.round(winRate * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      avgTradeDuration: trades.length > 0 ? this._averageDuration(trades) : '0d',
      bestTrade,
      worstTrade,
      finalCapital: Math.round(finalCapital * 100) / 100,
    };
  }

  private _calculateDuration(entryDate: string, exitDate: string): string {
    const ms = new Date(exitDate).getTime() - new Date(entryDate).getTime();
    const days = Math.round(ms / (24 * 60 * 60 * 1000));
    return `${days}d`;
  }

  private _averageDuration(trades: BacktestTrade[]): string {
    const totalDays = trades.reduce((sum, t) => {
      const ms = new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime();
      return sum + Math.round(ms / (24 * 60 * 60 * 1000));
    }, 0);
    const avgDays = Math.round(totalDays / trades.length);
    return `${avgDays}d`;
  }

  private async _generateAIInsights(
    symbol: string,
    strategy: string,
    metrics: any,
    trades: BacktestTrade[],
  ): Promise<string> {
    try {
      const response = await this.orchestrator.analyze({
        prompt: `أنت محلل استراتيجيات تداول في منصة "رؤى". حلل نتيجة الباك تست التالية باللغة العربية:

📊 الأصل: ${symbol}
📐 الاستراتيجية: ${strategy}
📈 إجمالي العائد: ${metrics.totalReturn.toFixed(2)}%
📉 أقصى انخفاض: ${metrics.maxDrawdown.toFixed(2)}%
🎯 نسبة الفوز: ${metrics.winRate.toFixed(1)}%
📋 عدد الصفقات: ${metrics.totalTrades}
📊 معامل شارب: ${metrics.sharpeRatio.toFixed(2)}
💪 عامل الربح: ${metrics.profitFactor.toFixed(2)}

قدم:
1. تقييم شامل لأداء الاستراتيجية
2. نقاط القوة والضعف
3. توصيات لتحسين الأداء
4. هل تنصح باستخدام هذه الاستراتيجية فعلياً؟

أضف دائماً: "النتائج السابقة لا تضمن الأداء المستقبلي."`,
        type: 'market_analysis',
        language: 'ar',
      });

      return response.content;
    } catch {
      return `استراتيجية ${strategy} على ${symbol}: عائد ${metrics.totalReturn.toFixed(2)}% بنسبة فوز ${metrics.winRate.toFixed(1)}%. النتائج السابقة لا تضمن الأداء المستقبلي.`;
    }
  }
}
