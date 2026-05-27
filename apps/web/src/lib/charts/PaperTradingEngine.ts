// ═══════════════════════════════════════════════════════════════════════
// ROUA Paper Trading Engine — Phase 5
//
// Virtual trading mode that executes fake trades based on system signals.
// Allows users to test the platform's analysis quality without risking
// real capital.
//
// Features:
// - Virtual capital (default USDT 10,000)
// - Auto-open trades at high confluence (or manual)
// - Track performance: P&L, Win Rate, Sharpe Ratio, Max Drawdown
// - Compare with "Buy & Hold" benchmark
// - Equity curve tracking
// - Trade journal with entry/exit reasons
// - Session management (reset, daily stats)
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

export type PaperTradeStatus = 'open' | 'closed' | 'stopped_out' | 'take_profit' | 'breakeven_out';
export type PaperTradeDirection = 'long' | 'short';

/** A paper trade record */
export interface PaperTrade {
  /** Unique trade ID */
  id: string;
  /** Symbol */
  symbol: string;
  /** Direction */
  direction: PaperTradeDirection;
  /** Entry price */
  entryPrice: number;
  /** Stop loss */
  stopLoss: number;
  /** Take profit levels */
  takeProfits: number[];
  /** Position size in base currency */
  positionSize: number;
  /** Entry timestamp */
  entryTime: number;
  /** Exit price (0 if still open) */
  exitPrice: number;
  /** Exit timestamp (0 if still open) */
  exitTime: number;
  /** Current status */
  status: PaperTradeStatus;
  /** Reason for entry (Arabic) */
  entryReasonAr: string;
  /** Signals that triggered this trade */
  entrySignals: string[];
  /** Reason for exit (Arabic) */
  exitReasonAr: string;
  /** P&L in quote currency */
  pnl: number;
  /** P&L as percentage */
  pnlPct: number;
  /** Fees estimated (0.1% per side for Binance) */
  fees: number;
  /** Net P&L after fees */
  netPnl: number;
  /** Risk/Reward ratio at entry */
  rrRatio: number;
  /** Confluence score at entry */
  confluenceScore: number;
  /** Timeframe */
  timeframe: string;
  /** Trailing stop price (updated in real-time) */
  currentTrailSL: number | null;
  /** Partial close history */
  partialCloses: Array<{ price: number; fraction: number; pnl: number; time: number }>;
  /** Market regime at entry */
  regimeAtEntry: string;
}

/** Paper trading account */
export interface PaperAccount {
  /** Initial balance */
  initialBalance: number;
  /** Current balance */
  currentBalance: number;
  /** Realized P&L */
  realizedPnL: number;
  /** Unrealized P&L */
  unrealizedPnL: number;
  /** Total trades */
  totalTrades: number;
  /** Win count */
  wins: number;
  /** Loss count */
  losses: number;
  /** Win rate */
  winRate: number;
  /** Average win */
  avgWin: number;
  /** Average loss */
  avgLoss: number;
  /** Profit factor */
  profitFactor: number;
  /** Max drawdown (percentage) */
  maxDrawdownPct: number;
  /** Current drawdown */
  currentDrawdownPct: number;
  /** Sharpe ratio (annualized) */
  sharpeRatio: number;
  /** Equity curve */
  equityCurve: Array<{ timestamp: number; equity: number }>;
  /** Peak equity */
  peakEquity: number;
  /** Session start time */
  sessionStart: number;
  /** Buy & Hold comparison */
  buyAndHold: {
    initialPrice: number;
    currentPrice: number;
    returnPct: number;
  };
  /** Risk settings */
  riskSettings: PaperRiskSettings;
}

/** Risk settings for paper trading */
export interface PaperRiskSettings {
  /** Risk per trade (default: 1%) */
  riskPerTrade: number;
  /** Max position size as % of account (default: 10%) */
  maxPositionPct: number;
  /** Max open trades (default: 3) */
  maxOpenTrades: number;
  /** Daily loss limit (default: 3%) */
  dailyLossLimitPct: number;
  /** Auto-trade on high confluence (default: false) */
  autoTrade: boolean;
  /** Minimum confluence score for auto-trade (default: 70) */
  autoTradeMinConfluence: number;
  /** Fee rate per side (default: 0.001 = 0.1%) */
  feeRate: number;
}

// ── Constants ───────────────────────────────────────────────────────

const DEFAULT_RISK: PaperRiskSettings = {
  riskPerTrade: 0.01,
  maxPositionPct: 0.1,
  maxOpenTrades: 3,
  dailyLossLimitPct: 0.03,
  autoTrade: false,
  autoTradeMinConfluence: 70,
  feeRate: 0.001,
};

const INITIAL_BALANCE = 10000;
const PAPER_KEY = 'roua-paper-trading';
const MAX_TRADES = 500;
const MAX_EQUITY_CURVE = 1000;

// ── In-memory State ─────────────────────────────────────────────────

let trades: PaperTrade[] = [];
let account: PaperAccount;
let dailyPnL = 0;
let dailyDate = new Date().toISOString().split('T')[0];

function createDefaultAccount(): PaperAccount {
  return {
    initialBalance: INITIAL_BALANCE,
    currentBalance: INITIAL_BALANCE,
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    maxDrawdownPct: 0,
    currentDrawdownPct: 0,
    sharpeRatio: 0,
    equityCurve: [],
    peakEquity: INITIAL_BALANCE,
    sessionStart: Date.now(),
    buyAndHold: { initialPrice: 0, currentPrice: 0, returnPct: 0 },
    riskSettings: { ...DEFAULT_RISK },
  };
}

account = createDefaultAccount();

// ── Persistence ─────────────────────────────────────────────────────

function loadState(): void {
  try {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(PAPER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.trades) trades = parsed.trades;
      if (parsed.account) account = { ...createDefaultAccount(), ...parsed.account };
    }
  } catch { /* not available */ }
}

function persistState(): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PAPER_KEY, JSON.stringify({ trades, account }));
  } catch { /* not available */ }
}

loadState();

// ── Account Management ──────────────────────────────────────────────

/** Get the current paper trading account */
export function getPaperAccount(): PaperAccount {
  return { ...account };
}

/** Update risk settings */
export function updatePaperRiskSettings(settings: Partial<PaperRiskSettings>): void {
  Object.assign(account.riskSettings, settings);
  persistState();
}

/** Reset the paper trading account (start fresh) */
export function resetPaperAccount(): void {
  trades = [];
  account = createDefaultAccount();
  dailyPnL = 0;
  dailyDate = new Date().toISOString().split('T')[0];
  persistState();
}

// ── Trade Execution ─────────────────────────────────────────────────

/**
 * Open a new paper trade.
 * Can be triggered automatically or manually.
 */
export function openPaperTrade(opts: {
  symbol: string;
  direction: PaperTradeDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfits: number[];
  entryReasonAr: string;
  entrySignals: string[];
  confluenceScore: number;
  timeframe: string;
  regimeAtEntry: string;
}): PaperTrade | null {
  const { symbol, direction, entryPrice, stopLoss, takeProfits, entryReasonAr, entrySignals, confluenceScore, timeframe, regimeAtEntry } = opts;
  const risk = account.riskSettings;

  // Check max open trades
  const openTrades = trades.filter(t => t.status === 'open').length;
  if (openTrades >= risk.maxOpenTrades) return null;

  // Check daily loss limit
  const today = new Date().toISOString().split('T')[0];
  if (today !== dailyDate) {
    dailyPnL = 0;
    dailyDate = today;
  }
  if (dailyPnL < -(account.currentBalance * risk.dailyLossLimitPct)) return null;

  // Calculate position size
  const riskAmount = account.currentBalance * risk.riskPerTrade;
  const slDistance = Math.abs(entryPrice - stopLoss);
  if (slDistance === 0) return null;

  let positionSize = riskAmount / slDistance;
  const maxPositionValue = account.currentBalance * risk.maxPositionPct;
  positionSize = Math.min(positionSize, maxPositionValue / entryPrice);

  // Calculate R:R
  const reward = Math.abs(takeProfits[takeProfits.length - 1] - entryPrice);
  const rrRatio = slDistance > 0 ? reward / slDistance : 0;

  // Calculate fees
  const entryFee = positionSize * entryPrice * risk.feeRate;

  const trade: PaperTrade = {
    id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    symbol,
    direction,
    entryPrice,
    stopLoss,
    takeProfits,
    positionSize,
    entryTime: Date.now(),
    exitPrice: 0,
    exitTime: 0,
    status: 'open',
    entryReasonAr,
    entrySignals,
    exitReasonAr: '',
    pnl: 0,
    pnlPct: 0,
    fees: entryFee,
    netPnl: -entryFee,
    rrRatio: Math.round(rrRatio * 100) / 100,
    confluenceScore,
    timeframe,
    currentTrailSL: null,
    partialCloses: [],
    regimeAtEntry,
  };

  trades.push(trade);
  if (trades.length > MAX_TRADES) trades = trades.slice(-MAX_TRADES);

  // Set Buy & Hold initial price if first trade
  if (account.buyAndHold.initialPrice === 0) {
    account.buyAndHold.initialPrice = entryPrice;
  }

  persistState();
  return trade;
}

/**
 * Close a paper trade manually.
 */
export function closePaperTrade(tradeId: string, currentPrice: number, reasonAr: string = 'إغلاق يدوي'): PaperTrade | null {
  const trade = trades.find(t => t.id === tradeId && t.status === 'open');
  if (!trade) return null;

  trade.exitPrice = currentPrice;
  trade.exitTime = Date.now();
  trade.exitReasonAr = reasonAr;
  trade.status = 'closed';

  // Calculate P&L
  const exitFee = trade.positionSize * currentPrice * account.riskSettings.feeRate;
  trade.fees += exitFee;

  if (trade.direction === 'long') {
    trade.pnl = (currentPrice - trade.entryPrice) * trade.positionSize;
  } else {
    trade.pnl = (trade.entryPrice - currentPrice) * trade.positionSize;
  }

  trade.pnlPct = (trade.pnl / (trade.entryPrice * trade.positionSize)) * 100;
  trade.netPnl = trade.pnl - trade.fees;

  // Update account
  account.currentBalance += trade.netPnl;
  account.realizedPnL += trade.netPnl;
  dailyPnL += trade.netPnl;

  // Update stats
  updateAccountStats();
  persistState();
  return trade;
}

/**
 * Auto-evaluate all open paper trades against current price.
 * Handles SL hits, TP hits, trailing stops, and partial closes.
 */
export function autoEvaluatePaperTrades(currentPrice: number, candles?: CandleData[]): PaperTrade[] {
  const updated: PaperTrade[] = [];

  for (const trade of trades) {
    if (trade.status !== 'open') continue;

    let closed = false;

    // Check Stop Loss
    if (trade.direction === 'long' && currentPrice <= trade.stopLoss) {
      closePaperTrade(trade.id, currentPrice, 'ضرب وقف الخسارة');
      closed = true;
    } else if (trade.direction === 'short' && currentPrice >= trade.stopLoss) {
      closePaperTrade(trade.id, currentPrice, 'ضرب وقف الخسارة');
      closed = true;
    }

    // Check Take Profits (from highest to lowest)
    if (!closed) {
      for (let i = trade.takeProfits.length - 1; i >= 0; i--) {
        const tp = trade.takeProfits[i];
        if (trade.direction === 'long' && currentPrice >= tp) {
          const reasonAr = i === trade.takeProfits.length - 1 ? 'تحقق الهدف النهائي' : `تحقق الهدف ${i + 1}`;
          closePaperTrade(trade.id, currentPrice, reasonAr);
          closed = true;
          break;
        } else if (trade.direction === 'short' && currentPrice <= tp) {
          const reasonAr = i === trade.takeProfits.length - 1 ? 'تحقق الهدف النهائي' : `تحقق الهدف ${i + 1}`;
          closePaperTrade(trade.id, currentPrice, reasonAr);
          closed = true;
          break;
        }
      }
    }

    // Update Buy & Hold
    if (account.buyAndHold.initialPrice > 0) {
      account.buyAndHold.currentPrice = currentPrice;
      account.buyAndHold.returnPct = ((currentPrice - account.buyAndHold.initialPrice) / account.buyAndHold.initialPrice) * 100;
    }

    // Update unrealized P&L
    if (!closed) {
      const unrealized = trade.direction === 'long'
        ? (currentPrice - trade.entryPrice) * trade.positionSize
        : (trade.entryPrice - currentPrice) * trade.positionSize;
      trade.pnl = unrealized;
      trade.pnlPct = (unrealized / (trade.entryPrice * trade.positionSize)) * 100;
      trade.netPnl = unrealized - trade.fees;
    }

    updated.push(trade);
  }

  // Recalculate account unrealized P&L
  account.unrealizedPnL = trades
    .filter(t => t.status === 'open')
    .reduce((s, t) => s + t.netPnl, 0);

  // Update equity curve
  const equity = account.currentBalance + account.unrealizedPnL;
  account.equityCurve.push({ timestamp: Date.now(), equity });
  if (account.equityCurve.length > MAX_EQUITY_CURVE) {
    account.equityCurve = account.equityCurve.slice(-MAX_EQUITY_CURVE);
  }

  // Update peak and drawdown
  if (equity > account.peakEquity) {
    account.peakEquity = equity;
  }
  account.currentDrawdownPct = account.peakEquity > 0
    ? ((account.peakEquity - equity) / account.peakEquity) * 100
    : 0;
  account.maxDrawdownPct = Math.max(account.maxDrawdownPct, account.currentDrawdownPct);

  updateAccountStats();
  persistState();
  return updated;
}

// ── Account Stats Update ────────────────────────────────────────────

function updateAccountStats(): void {
  const closedTrades = trades.filter(t => t.status !== 'open');
  const wins = closedTrades.filter(t => t.netPnl > 0);
  const losses = closedTrades.filter(t => t.netPnl <= 0);

  account.totalTrades = closedTrades.length;
  account.wins = wins.length;
  account.losses = losses.length;
  account.winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
  account.avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0;
  account.avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.netPnl, 0) / losses.length) : 0;

  // Profit factor
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  account.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Sharpe Ratio (simplified annualized)
  if (closedTrades.length >= 5) {
    const returns = closedTrades.map(t => t.pnlPct / 100);
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    // Annualize assuming ~252 trading days × ~4 trades/day = ~1000 trades/year
    account.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(1000) : 0;
  }
}

// ── Query Functions ─────────────────────────────────────────────────

/** Get all trades */
export function getPaperTrades(): PaperTrade[] {
  return [...trades].sort((a, b) => b.entryTime - a.entryTime);
}

/** Get open trades only */
export function getOpenPaperTrades(): PaperTrade[] {
  return trades.filter(t => t.status === 'open');
}

/** Get closed trades only */
export function getClosedPaperTrades(): PaperTrade[] {
  return trades.filter(t => t.status !== 'open').sort((a, b) => b.exitTime - a.exitTime);
}

/** Get daily performance summary */
export function getPaperDailySummary(): Array<{
  date: string;
  trades: number;
  pnl: number;
  winRate: number;
}> {
  const byDate = new Map<string, { trades: PaperTrade[] }>();

  for (const trade of trades.filter(t => t.status !== 'open')) {
    const date = new Date(trade.exitTime).toISOString().split('T')[0];
    if (!byDate.has(date)) byDate.set(date, { trades: [] });
    byDate.get(date)!.trades.push(trade);
  }

  return Array.from(byDate.entries()).map(([date, data]) => {
    const wins = data.trades.filter(t => t.netPnl > 0).length;
    return {
      date,
      trades: data.trades.length,
      pnl: Math.round(data.trades.reduce((s, t) => s + t.netPnl, 0) * 100) / 100,
      winRate: data.trades.length > 0 ? wins / data.trades.length : 0,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** Get performance comparison: Paper Trading vs Buy & Hold */
export function getPerformanceComparison(): {
  paperReturnPct: number;
  buyAndHoldReturnPct: number;
  outperformance: number;
  paperTrades: number;
  paperWinRate: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
} {
  const paperReturnPct = ((account.currentBalance + account.unrealizedPnL - account.initialBalance) / account.initialBalance) * 100;
  const buyAndHoldReturnPct = account.buyAndHold.returnPct;

  return {
    paperReturnPct: Math.round(paperReturnPct * 100) / 100,
    buyAndHoldReturnPct: Math.round(buyAndHoldReturnPct * 100) / 100,
    outperformance: Math.round((paperReturnPct - buyAndHoldReturnPct) * 100) / 100,
    paperTrades: account.totalTrades,
    paperWinRate: Math.round(account.winRate * 100) / 100,
    sharpeRatio: Math.round(account.sharpeRatio * 100) / 100,
    maxDrawdownPct: Math.round(account.maxDrawdownPct * 100) / 100,
  };
}
