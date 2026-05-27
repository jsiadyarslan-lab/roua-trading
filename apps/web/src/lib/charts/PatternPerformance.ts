// ═══════════════════════════════════════════════════════════
// Pattern Performance Tracker — Real Implementation
// Tracks pattern outcomes, computes win rates, and
// auto-evaluates against price movement
// Persists to localStorage for cross-session continuity
// ═══════════════════════════════════════════════════════════

export interface PatternTypeStats {
  patternType: string;
  totalOccurrences: number;
  successRate: number;
  avgReturn: number;
}

export interface PerformanceSummary {
  statsByType: Map<string, PatternTypeStats>;
  totalTrades: number;
  overallSuccessRate: number;
  bestPattern: string;
  worstPattern: string;
  sharpeEstimate: number;
}

export interface PatternPerformanceTracker {
  getSummary(): PerformanceSummary;
  record(patternType: string, success: boolean, ret: number): void;
  recordDetection(opts: PatternDetectionRecord): void;
  autoEvaluate(currentPrice: number, symbol: string): void;
}

/** Record for a detected pattern awaiting outcome evaluation */
interface PatternDetectionRecord {
  patternType: string;
  symbol: string;
  direction: 'bullish' | 'bearish';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  timeframe: string;
  detectorSource: string;
}

/** A completed trade record */
interface TradeRecord {
  patternType: string;
  direction: 'bullish' | 'bearish';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: 'success' | 'failure' | 'pending';
  returnPct: number;
  timestamp: number;
  symbol: string;
}

// ── In-memory stores with localStorage persistence ────────
const tradeHistory: TradeRecord[] = [];
const pendingDetections: Map<string, PatternDetectionRecord & { timestamp: number }> = new Map();
const MAX_TRADES = 5000;
const MAX_PENDING = 100;
const STORAGE_KEY = 'roua-pattern-performance';
const PENDING_KEY = 'roua-pending-detections';

function loadTradeHistory(): TradeRecord[] {
  if (tradeHistory.length > 0) return tradeHistory;
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          tradeHistory.push(...parsed.slice(-MAX_TRADES));
        }
      }
    }
  } catch { /* not available */ }
  return tradeHistory;
}

function persistTradeHistory(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tradeHistory.slice(-MAX_TRADES)));
    }
  } catch { /* not available */ }
}

function loadPending(): Map<string, PatternDetectionRecord & { timestamp: number }> {
  if (pendingDetections.size > 0) return pendingDetections;
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PENDING_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const key = `${item.patternType}_${item.symbol}_${item.timestamp}`;
            pendingDetections.set(key, item);
          }
        }
      }
    }
  } catch { /* not available */ }
  return pendingDetections;
}

function persistPending(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(pendingDetections.values())));
    }
  } catch { /* not available */ }
}

export function getPatternPerformanceTracker(): PatternPerformanceTracker {
  return {
    getSummary(): PerformanceSummary {
      const history = loadTradeHistory();
      const completedTrades = history.filter(t => t.outcome !== 'pending');

      if (completedTrades.length === 0) {
        return {
          statsByType: new Map<string, PatternTypeStats>(),
          totalTrades: 0,
          overallSuccessRate: 0,
          bestPattern: '-',
          worstPattern: '-',
          sharpeEstimate: 0,
        };
      }

      // Group by pattern type
      const byType = new Map<string, TradeRecord[]>();
      for (const t of completedTrades) {
        if (!byType.has(t.patternType)) byType.set(t.patternType, []);
        byType.get(t.patternType)!.push(t);
      }

      const statsByType = new Map<string, PatternTypeStats>();
      let totalSuccess = 0;
      let totalReturns: number[] = [];

      for (const [type, trades] of byType) {
        const successes = trades.filter(t => t.outcome === 'success').length;
        const avgReturn = trades.reduce((s, t) => s + t.returnPct, 0) / trades.length;
        totalSuccess += successes;
        for (const t of trades) totalReturns.push(t.returnPct);
        statsByType.set(type, {
          patternType: type,
          totalOccurrences: trades.length,
          successRate: successes / trades.length,
          avgReturn,
        });
      }

      // Find best and worst
      let bestType = '-';
      let worstType = '-';
      let bestRate = -1;
      let worstRate = 2;
      for (const [, stats] of statsByType) {
        if (stats.totalOccurrences < 3) continue; // Need at least 3 trades
        if (stats.successRate > bestRate) { bestRate = stats.successRate; bestType = stats.patternType; }
        if (stats.successRate < worstRate) { worstRate = stats.successRate; worstType = stats.patternType; }
      }

      // Sharpe estimate: mean(return) / std(return)
      const meanReturn = totalReturns.reduce((s, r) => s + r, 0) / totalReturns.length;
      const variance = totalReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / totalReturns.length;
      const stdReturn = Math.sqrt(variance);
      const sharpeEstimate = stdReturn > 0 ? meanReturn / stdReturn : 0;

      return {
        statsByType,
        totalTrades: completedTrades.length,
        overallSuccessRate: totalSuccess / completedTrades.length,
        bestPattern: bestType,
        worstPattern: worstType,
        sharpeEstimate,
      };
    },

    record(patternType: string, success: boolean, ret: number): void {
      const history = loadTradeHistory();
      history.push({
        patternType,
        direction: ret >= 0 ? 'bullish' : 'bearish',
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        outcome: success ? 'success' : 'failure',
        returnPct: ret,
        timestamp: Date.now(),
        symbol: '',
      });
      if (history.length > MAX_TRADES) {
        history.splice(0, history.length - MAX_TRADES);
      }
      persistTradeHistory();
    },

    recordDetection(opts: PatternDetectionRecord): void {
      const pending = loadPending();
      const key = `${opts.patternType}_${opts.symbol}_${Date.now()}`;
      if (pending.size >= MAX_PENDING) {
        // Remove oldest entry
        const firstKey = pending.keys().next().value;
        if (firstKey) pending.delete(firstKey);
      }
      pending.set(key, { ...opts, timestamp: Date.now() });
      persistPending();
    },

    autoEvaluate(currentPrice: number, symbol: string): void {
      const pending = loadPending();
      const history = loadTradeHistory();
      const now = Date.now();
      const ONE_HOUR = 3600000;

      for (const [key, det] of pending) {
        // Only evaluate detections older than 5 minutes
        if (now - det.timestamp < 300000) continue;
        // Remove detections older than 1 hour (expired)
        if (now - det.timestamp > ONE_HOUR) {
          pending.delete(key);
          continue;
        }

        let outcome: 'success' | 'failure';
        let returnPct: number;

        if (det.direction === 'bullish') {
          if (currentPrice >= det.takeProfit) {
            outcome = 'success';
            returnPct = ((currentPrice - det.entryPrice) / det.entryPrice) * 100;
          } else if (currentPrice <= det.stopLoss) {
            outcome = 'failure';
            returnPct = ((currentPrice - det.entryPrice) / det.entryPrice) * 100;
          } else {
            continue; // Still pending
          }
        } else {
          if (currentPrice <= det.takeProfit) {
            outcome = 'success';
            returnPct = ((det.entryPrice - currentPrice) / det.entryPrice) * 100;
          } else if (currentPrice >= det.stopLoss) {
            outcome = 'failure';
            returnPct = ((det.entryPrice - currentPrice) / det.entryPrice) * 100;
          } else {
            continue; // Still pending
          }
        }

        history.push({
          patternType: det.patternType,
          direction: det.direction,
          entryPrice: det.entryPrice,
          stopLoss: det.stopLoss,
          takeProfit: det.takeProfit,
          outcome,
          returnPct,
          timestamp: det.timestamp,
          symbol,
        });

        pending.delete(key);

        // Also record for Bayesian learning
        try {
          const { recordSignalOutcome } = require('./BayesianEngine');
          recordSignalOutcome(`pattern:${det.patternType}`, det.direction, outcome === 'success');
        } catch { /* Bayesian not available */ }
      }

      if (history.length > MAX_TRADES) {
        history.splice(0, history.length - MAX_TRADES);
      }
      persistTradeHistory();
      persistPending();
    },
  };
}
