// ═══════════════════════════════════════════════════════════
// Historical Pattern Performance Tracker
// Stores patterns that led to profitable/losing trades
// Shows historical win rate when same pattern appears again
// Feedback loop that improves confidence scoring
// ═══════════════════════════════════════════════════════════

export interface PatternPerformanceRecord {
  id: string;
  patternType: string;      // 'Double Top', 'Hammer', 'Gartley', etc.
  symbol: string;
  direction: 'bullish' | 'bearish';
  entryPrice: number;
  entryTime: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;       // Original confidence at detection
  outcome: 'win' | 'loss' | 'breakeven' | 'pending';
  exitPrice?: number;
  exitTime?: number;
  pnlPercent?: number;
  maxFavorable?: number;    // Max profit % reached
  maxAdverse?: number;      // Max loss % reached
  timeframe: string;
  detectorSource: string;   // 'SMC', 'Geometric', etc.
}

export interface PatternTypeStats {
  patternType: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;           // 0-1
  avgPnl: number;            // Average P&L %
  avgMaxFavorable: number;   // Average max favorable excursion
  avgMaxAdverse: number;     // Average max adverse excursion
  avgConfidence: number;     // Average confidence at detection
  confidenceCalibration: number; // How well confidence matches reality (1.0 = perfect)
  lastTraded: number;
  pendingCount: number;
}

export interface PerformanceTrackerResult {
  totalPatterns: number;
  overallWinRate: number;
  bestPattern: string;
  worstPattern: string;
  statsByType: Map<string, PatternTypeStats>;
  recentTrades: PatternPerformanceRecord[];
}

// ── Storage ──────────────────────────────────────────────
const STORAGE_KEY = 'roua_pattern_performance';

function loadRecords(): PatternPerformanceRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: PatternPerformanceRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep last 500 records
    const trimmed = records.slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — trim oldest
    try {
      const trimmed = records.slice(-200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }
}

// ── Performance Tracker ──────────────────────────────────
export class PatternPerformanceTracker {
  private records: PatternPerformanceRecord[];
  private statsCache: Map<string, PatternTypeStats> | null = null;
  private cacheValid = false;

  constructor() {
    this.records = loadRecords();
  }

  /**
   * Record a new pattern detection for tracking
   */
  recordDetection(params: {
    patternType: string;
    symbol: string;
    direction: 'bullish' | 'bearish';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    timeframe: string;
    detectorSource: string;
  }): PatternPerformanceRecord {
    const record: PatternPerformanceRecord = {
      id: `perf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      patternType: params.patternType,
      symbol: params.symbol,
      direction: params.direction,
      entryPrice: params.entryPrice,
      entryTime: Date.now(),
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      confidence: params.confidence,
      outcome: 'pending',
      timeframe: params.timeframe,
      detectorSource: params.detectorSource,
    };

    this.records.push(record);
    saveRecords(this.records);
    this.cacheValid = false;

    return record;
  }

  /**
   * Update a pending record with outcome
   */
  updateOutcome(recordId: string, outcome: {
    exitPrice: number;
    pnlPercent: number;
    maxFavorable?: number;
    maxAdverse?: number;
  }): void {
    const record = this.records.find(r => r.id === recordId);
    if (!record || record.outcome !== 'pending') return;

    record.exitPrice = outcome.exitPrice;
    record.exitTime = Date.now();
    record.pnlPercent = outcome.pnlPercent;
    record.maxFavorable = outcome.maxFavorable;
    record.maxAdverse = outcome.maxAdverse;

    // Classify outcome
    if (outcome.pnlPercent > 0.5) {
      record.outcome = 'win';
    } else if (outcome.pnlPercent < -0.5) {
      record.outcome = 'loss';
    } else {
      record.outcome = 'breakeven';
    }

    saveRecords(this.records);
    this.cacheValid = false;
  }

  /**
   * Get historical win rate for a specific pattern type
   */
  getWinRate(patternType: string, direction?: 'bullish' | 'bearish'): number {
    const stats = this._getStats(patternType);
    if (!stats || stats.totalTrades < 3) return 0.5; // Not enough data

    if (direction) {
      const dirRecords = this.records.filter(r =>
        r.patternType === patternType && r.direction === direction && r.outcome !== 'pending'
      );
      if (dirRecords.length < 3) return 0.5;
      const wins = dirRecords.filter(r => r.outcome === 'win').length;
      return wins / dirRecords.length;
    }

    return stats.winRate;
  }

  /**
   * Get confidence-adjusted score for a pattern
   * Adjusts the original confidence based on historical performance
   */
  getAdjustedConfidence(patternType: string, originalConfidence: number, direction?: 'bullish' | 'bearish'): number {
    const winRate = this.getWinRate(patternType, direction);
    const stats = this._getStats(patternType);

    if (!stats || stats.totalTrades < 5) return originalConfidence; // Not enough data to adjust

    // Confidence calibration: if confidence is systematically too high, scale down
    const calibration = stats.confidenceCalibration;
    const adjusted = originalConfidence * calibration;

    // Also blend with actual win rate
    const sampleSize = Math.min(1, stats.totalTrades / 30); // More data → more weight on actual
    const blended = adjusted * (1 - sampleSize * 0.3) + winRate * (sampleSize * 0.3);

    return Math.max(0.1, Math.min(0.95, blended));
  }

  /**
   * Get performance summary
   */
  getSummary(): PerformanceTrackerResult {
    const completed = this.records.filter(r => r.outcome !== 'pending');
    const wins = completed.filter(r => r.outcome === 'win').length;
    const statsByType = this._buildAllStats();

    let bestPattern = '';
    let worstPattern = '';
    let bestWinRate = 0;
    let worstWinRate = 1;

    for (const [type, stats] of statsByType) {
      if (stats.totalTrades >= 3) {
        if (stats.winRate > bestWinRate) { bestWinRate = stats.winRate; bestPattern = type; }
        if (stats.winRate < worstWinRate) { worstWinRate = stats.winRate; worstPattern = type; }
      }
    }

    return {
      totalPatterns: this.records.length,
      overallWinRate: completed.length > 0 ? wins / completed.length : 0,
      bestPattern,
      worstPattern,
      statsByType,
      recentTrades: this.records.slice(-20).reverse(),
    };
  }

  /**
   * Get stats for a specific pattern type
   */
  getPatternStats(patternType: string): PatternTypeStats | null {
    return this._getStats(patternType);
  }

  /**
   * Auto-evaluate pending records that have been open long enough
   */
  autoEvaluate(currentPrice: number, symbol: string): number {
    let evaluated = 0;
    const now = Date.now();

    for (const record of this.records) {
      if (record.outcome !== 'pending') continue;
      if (record.symbol !== symbol) continue;

      const ageMs = now - record.entryTime;
      if (ageMs < 5 * 60 * 1000) continue; // Wait at least 5 minutes

      // Check if SL or TP was hit
      if (record.direction === 'bullish') {
        if (currentPrice <= record.stopLoss) {
          this.updateOutcome(record.id, {
            exitPrice: currentPrice,
            pnlPercent: ((currentPrice - record.entryPrice) / record.entryPrice) * 100,
          });
          evaluated++;
        } else if (currentPrice >= record.takeProfit) {
          this.updateOutcome(record.id, {
            exitPrice: currentPrice,
            pnlPercent: ((currentPrice - record.entryPrice) / record.entryPrice) * 100,
          });
          evaluated++;
        }
      } else {
        if (currentPrice >= record.stopLoss) {
          this.updateOutcome(record.id, {
            exitPrice: currentPrice,
            pnlPercent: ((record.entryPrice - currentPrice) / record.entryPrice) * 100,
          });
          evaluated++;
        } else if (currentPrice <= record.takeProfit) {
          this.updateOutcome(record.id, {
            exitPrice: currentPrice,
            pnlPercent: ((record.entryPrice - currentPrice) / record.entryPrice) * 100,
          });
          evaluated++;
        }
      }

      // Auto-close after 24 hours
      if (ageMs > 24 * 60 * 60 * 1000) {
        this.updateOutcome(record.id, {
          exitPrice: currentPrice,
          pnlPercent: record.direction === 'bullish'
            ? ((currentPrice - record.entryPrice) / record.entryPrice) * 100
            : ((record.entryPrice - currentPrice) / record.entryPrice) * 100,
        });
        evaluated++;
      }
    }

    return evaluated;
  }

  // ── Private ────────────────────────────────────────────

  private _getStats(patternType: string): PatternTypeStats | null {
    if (this.cacheValid && this.statsCache) {
      return this.statsCache.get(patternType) || null;
    }

    const records = this.records.filter(r => r.patternType === patternType);
    if (records.length === 0) return null;

    const completed = records.filter(r => r.outcome !== 'pending');
    const wins = completed.filter(r => r.outcome === 'win').length;
    const losses = completed.filter(r => r.outcome === 'loss').length;
    const breakevens = completed.filter(r => r.outcome === 'breakeven').length;
    const pending = records.filter(r => r.outcome === 'pending').length;

    const avgPnl = completed.length > 0
      ? completed.reduce((s, r) => s + (r.pnlPercent || 0), 0) / completed.length
      : 0;

    const avgMaxFav = completed.length > 0
      ? completed.reduce((s, r) => s + (r.maxFavorable || 0), 0) / completed.length
      : 0;

    const avgMaxAdv = completed.length > 0
      ? completed.reduce((s, r) => s + (r.maxAdverse || 0), 0) / completed.length
      : 0;

    const avgConfidence = records.reduce((s, r) => s + r.confidence, 0) / records.length;

    // Confidence calibration: ratio of actual win rate to average confidence
    const actualWinRate = completed.length > 0 ? wins / completed.length : 0;
    const calibration = avgConfidence > 0 ? Math.min(1.5, actualWinRate / avgConfidence) : 1;

    return {
      patternType,
      totalTrades: completed.length,
      wins,
      losses,
      breakevens,
      winRate: actualWinRate,
      avgPnl,
      avgMaxFavorable: avgMaxFav,
      avgMaxAdverse: avgMaxAdv,
      avgConfidence,
      confidenceCalibration: calibration,
      lastTraded: records[records.length - 1]?.entryTime || 0,
      pendingCount: pending,
    };
  }

  private _buildAllStats(): Map<string, PatternTypeStats> {
    const stats = new Map<string, PatternTypeStats>();
    const types = new Set(this.records.map(r => r.patternType));

    for (const type of types) {
      const s = this._getStats(type);
      if (s) stats.set(type, s);
    }

    this.statsCache = stats;
    this.cacheValid = true;
    return stats;
  }
}

// ── Singleton ────────────────────────────────────────────
let _instance: PatternPerformanceTracker | null = null;

export function getPatternPerformanceTracker(): PatternPerformanceTracker {
  if (!_instance) {
    _instance = new PatternPerformanceTracker();
  }
  return _instance;
}
