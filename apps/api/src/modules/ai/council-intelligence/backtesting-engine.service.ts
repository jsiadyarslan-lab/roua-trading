// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Backtesting Engine Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "محرك الاختبار الرجعي" — هل كان المجلس سيكون
// على حق في آخر ٦ أشهر؟
//
// V185: بدون backtesting = ثقة عمياء
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketRegimeService } from './market-regime.service';
import { CouncilVoteAccuracyService } from './council-vote-accuracy.service';

export interface BacktestConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  riskPerTrade: number;  // 0.01 = 1%
  minConfidence: number;
  minConsensus: number;
}

export interface BacktestTrade {
  date: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPercent: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  consensusScore: number;
  confidence: number;
  regime: string;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakevens: number;
    winRate: number;
    totalPnl: number;
    totalPnlPercent: number;
    maxDrawdown: number;
    sharpeRatio: number;
    profitFactor: number;
    avgWinPnl: number;
    avgLossPnl: number;
    bestTrade: number;
    worstTrade: number;
    avgHoldingBars: number;
    byRegime: Record<string, { trades: number; winRate: number; pnl: number }>;
    byDirection: Record<string, { trades: number; winRate: number; pnl: number }>;
  };
}

@Injectable()
export class BacktestingEngineService {
  private readonly logger = new Logger(BacktestingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly regimeService: MarketRegimeService,
    private readonly accuracyService: CouncilVoteAccuracyService,
  ) {
    this.logger.log('🔬 Backtesting Engine initialized — اختبر الاستراتيجية');
  }

  /**
   * Run backtest on historical trade journals
   * Tests what would have happened with different parameters
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    this.logger.log(`🔬 Running backtest: ${config.symbol} from ${config.startDate.toISOString().split('T')[0]} to ${config.endDate.toISOString().split('T')[0]}`);

    // Fetch historical trade journals
    const journals = await this.prisma.tradeJournal.findMany({
      where: {
        symbol: config.symbol,
        closedAt: { not: null },
        createdAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
      },
      orderBy: { openedAt: 'asc' },
    });

    if (journals.length === 0) {
      return this._emptyResult(config);
    }

    // Simulate trades with the given parameters
    const trades: BacktestTrade[] = [];
    let balance = config.initialBalance;
    let peak = balance;
    let maxDrawdown = 0;
    const pnlHistory: number[] = [];

    for (const journal of journals) {
      // Filter by minimum confidence and consensus
      const journalConfidence = (journal as any).confidence || 0;
      const journalConsensus = (journal as any).consensusScore || 0;
      if (journalConfidence < config.minConfidence) continue;
      if (journalConsensus < config.minConsensus) continue;

      const entryPrice = Number(journal.entryPrice);
      const exitPrice = Number(journal.exitPrice || 0);
      const pnlPercent = Number(journal.pnlPercent || 0);

      // V-PHASE3 FIX: Correct PnL calculation.
      // OLD BUG: `riskAmount * (pnlPercent / config.riskPerTrade / 100)` = double division.
      // When riskPerTrade=0.01 (1%) and pnlPercent=2%: 100 * (2 / 0.01 / 100) = 200 ← WRONG
      // The /config.riskPerTrade cancels the riskAmount's multiplication by riskPerTrade,
      // then divides by 100 again, amplifying PnL by 1/riskPerTrade (100x for 1% risk).
      //
      // CORRECT: pnlPercent is already the percentage move of the trade.
      // PnL = position_notional × pnlPercent / 100
      // position_notional = balance × riskPerTrade / stopLossPercent (but we don't have SL%)
      // Simplest correct formula: balance × riskPerTrade × pnlPercent / 100
      // This means: "I risked X% of my balance, and the trade moved Y%, so my PnL is X% × Y% of balance"
      const pnl = balance * config.riskPerTrade * (pnlPercent / 100);
      balance += pnl;

      // Track drawdown
      if (balance > peak) peak = balance;
      const drawdown = (peak - balance) / peak * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      pnlHistory.push(pnl);

      // V-PHASE3 FIX: WIN/LOSS classification based on actual PnL sign, not arbitrary threshold.
      // Old: pnlPercent > 0.5 → WIN — but 0.5 what? If pnlPercent is in percentage units
      // (e.g., 2.5%), then 0.5 means 0.5% which is reasonable. But if pnlPercent is a ratio
      // (e.g., 0.025), then 0.5 would classify everything as WIN. Since pnlPercent comes from
      // TradeJournal which stores it as a percentage (e.g., 2.5 for 2.5%), use 0.1% threshold
      // to filter out noise while catching real results.
      const result = pnlPercent > 0.1 ? 'WIN' as const
        : pnlPercent < -0.1 ? 'LOSS' as const
        : 'BREAKEVEN' as const;

      trades.push({
        date: new Date(journal.openedAt).toISOString().split('T')[0],
        symbol: journal.symbol,
        direction: journal.side as 'BUY' | 'SELL',
        entryPrice,
        exitPrice,
        // V-PHASE3 FIX: Extract SL/TP from journal metadata if available.
        // Old code always set stopLoss=0, making backtest risk analysis impossible.
        stopLoss: Number((journal as any).stopLoss || entryPrice * 0.98), // Estimate 2% SL if not stored
        takeProfit: Number((journal as any).takeProfit || exitPrice || entryPrice * 1.02),
        pnl,
        pnlPercent,
        result,
        consensusScore: journalConsensus,
        confidence: journalConfidence,
        regime: journal.regimeAtEntry || 'UNKNOWN',
      });
    }

    // Calculate summary statistics
    const wins = trades.filter(t => t.result === 'WIN');
    const losses = trades.filter(t => t.result === 'LOSS');
    const breakevens = trades.filter(t => t.result === 'BREAKEVEN');

    const totalPnl = balance - config.initialBalance;
    const totalPnlPercent = (totalPnl / config.initialBalance) * 100;

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Sharpe ratio (simplified)
    const avgPnl = pnlHistory.length > 0 ? pnlHistory.reduce((a, b) => a + b, 0) / pnlHistory.length : 0;
    const stdDev = pnlHistory.length > 1
      ? Math.sqrt(pnlHistory.reduce((sum, p) => sum + Math.pow(p - avgPnl, 2), 0) / (pnlHistory.length - 1))
      : 1;
    const sharpeRatio = stdDev > 0 ? (avgPnl / stdDev) * Math.sqrt(252) : 0; // Annualized

    // By regime
    const byRegime: Record<string, { trades: number; winRate: number; pnl: number }> = {};
    for (const trade of trades) {
      const regime = trade.regime;
      if (!byRegime[regime]) byRegime[regime] = { trades: 0, winRate: 0, pnl: 0 };
      byRegime[regime].trades++;
      byRegime[regime].pnl += trade.pnl;
      if (trade.result === 'WIN') byRegime[regime].winRate++;
    }
    for (const key of Object.keys(byRegime)) {
      byRegime[key].winRate = byRegime[key].trades > 0
        ? Math.round((byRegime[key].winRate / byRegime[key].trades) * 100) : 0;
    }

    // By direction
    const byDirection: Record<string, { trades: number; winRate: number; pnl: number }> = {};
    for (const trade of trades) {
      const dir = trade.direction;
      if (!byDirection[dir]) byDirection[dir] = { trades: 0, winRate: 0, pnl: 0 };
      byDirection[dir].trades++;
      byDirection[dir].pnl += trade.pnl;
      if (trade.result === 'WIN') byDirection[dir].winRate++;
    }
    for (const key of Object.keys(byDirection)) {
      byDirection[key].winRate = byDirection[key].trades > 0
        ? Math.round((byDirection[key].winRate / byDirection[key].trades) * 100) : 0;
    }

    this.logger.log(
      `🔬 Backtest complete: ${trades.length} trades, ` +
      `WinRate=${trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0}%, ` +
      `PnL=${totalPnlPercent.toFixed(2)}%`,
    );

    return {
      config,
      trades,
      summary: {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        breakevens: breakevens.length,
        winRate: trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0,
        totalPnl,
        totalPnlPercent,
        maxDrawdown,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        avgWinPnl: wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0,
        avgLossPnl: losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0,
        bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.pnlPercent)) : 0,
        worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.pnlPercent)) : 0,
        avgHoldingBars: 0, // Would need bar data for this
        byRegime,
        byDirection,
      },
    };
  }

  /**
   * Compare different configurations to find optimal parameters
   */
  async optimizeParameters(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    bestConfig: BacktestConfig;
    bestResult: BacktestResult;
    allResults: { config: BacktestConfig; winRate: number; pnl: number; sharpe: number }[];
  }> {
    const configs: BacktestConfig[] = [];
    const baseBalance = 10000;

    // Test different confidence thresholds
    for (const minConf of [40, 50, 55, 60, 65, 70]) {
      for (const minCons of [40, 50, 55, 60, 65]) {
        for (const risk of [0.005, 0.01, 0.015, 0.02]) {
          configs.push({
            symbol,
            startDate,
            endDate,
            initialBalance: baseBalance,
            riskPerTrade: risk,
            minConfidence: minConf,
            minConsensus: minCons,
          });
        }
      }
    }

    // V-PHASE3 FIX: Test MORE parameter combinations (was limited to 20 of 120).
    // Testing only 20/120 means we miss potentially optimal configurations.
    // Now test 48 combinations (40% of total), prioritizing lower risk + higher confidence
    // which are more likely to produce stable results.
    const results: { config: BacktestConfig; winRate: number; pnl: number; sharpe: number }[] = [];

    // Sort configs: prefer lower risk + higher confidence (more conservative first)
    const sortedConfigs = configs.sort((a, b) => {
      if (a.riskPerTrade !== b.riskPerTrade) return a.riskPerTrade - b.riskPerTrade; // Lower risk first
      return b.minConfidence - a.minConfidence; // Higher confidence first
    });
    const limitedConfigs = sortedConfigs.slice(0, 48); // 48 of 120 = 40% coverage

    for (const config of limitedConfigs) {
      try {
        const result = await this.runBacktest(config);
        results.push({
          config,
          winRate: result.summary.winRate,
          pnl: result.summary.totalPnlPercent,
          sharpe: result.summary.sharpeRatio,
        });
      } catch { /* skip failed backtest */ }
    }

    // Sort by Sharpe ratio (best risk-adjusted return)
    results.sort((a, b) => b.sharpe - a.sharpe);

    const bestConfig = results[0]?.config || configs[0];
    const bestResult = results.length > 0 ? await this.runBacktest(bestConfig) : this._emptyResult(bestConfig);

    return { bestConfig, bestResult, allResults: results };
  }

  // ── Private Methods ──

  private _emptyResult(config: BacktestConfig): BacktestResult {
    return {
      config,
      trades: [],
      summary: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        avgWinPnl: 0,
        avgLossPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgHoldingBars: 0,
        byRegime: {},
        byDirection: {},
      },
    };
  }
}
