// ═══════════════════════════════════════════════════════════
// Pattern State Machine — Real-time Pattern Lifecycle Tracking
// States: inactive → forming → near-completion → completed → breakout → failed
// Provides early warnings when patterns are forming, not just after completion
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';

// ── Pattern Lifecycle States ─────────────────────────────
export type PatternState =
  | 'inactive'       // No pattern detected yet
  | 'forming'        // Pattern is beginning to form (1-2 points confirmed)
  | 'near-completion'// Most points confirmed, waiting for final touch
  | 'completed'      // All pattern points confirmed
  | 'breakout'       // Price has broken the pattern's key level
  | 'failed';        // Pattern invalidated (price exceeded tolerance)

export interface PatternStateEntry {
  id: string;
  type: string;             // 'Double Top', 'Triangle', etc.
  direction: 'bullish' | 'bearish';
  state: PatternState;
  stateSince: number;       // Unix timestamp when entered this state
  confirmedPoints: number;  // How many key points are confirmed
  totalPoints: number;      // Total points needed for completion
  completionPct: number;    // 0-100% how close to completion
  confidence: number;       // 0-1
  keyLevel: number;         // The breakout/invalidation level
  invalidationLevel: number;// Price at which pattern fails
  lastUpdate: number;       // Unix timestamp of last state change
  candlesSinceUpdate: number;// How many candles since last state change
  alert?: string;           // Alert message if in near-completion/breakout
}

export interface PatternStateMachineResult {
  activePatterns: PatternStateEntry[];
  alerts: PatternAlert[];
  summary: {
    forming: number;
    nearCompletion: number;
    completed: number;
    breakout: number;
    failed: number;
  };
}

export interface PatternAlert {
  patternId: string;
  patternType: string;
  state: PatternState;
  message: string;
  messageAr: string;
  direction: 'bullish' | 'bearish';
  confidence: number;
  keyLevel: number;
  timestamp: number;
  priority: 'info' | 'warning' | 'critical';
}

// ── State Machine Engine ─────────────────────────────────
export class PatternStateMachine {
  private patterns: Map<string, PatternStateEntry> = new Map();
  private maxAge = 500; // Remove patterns older than N candles
  private candleCount = 0;

  /**
   * Update pattern states based on new candle data and detected patterns
   * @param candles - All available candle data
   * @param detectedPatterns - Patterns detected by the engine
   * @returns Updated state machine result with alerts
   */
  update(
    candles: CandleData[],
    detectedPatterns: Array<{
      id: string;
      type: string;
      direction: 'bullish' | 'bearish';
      points: Array<{ time: number; price: number }>;
      breakoutPrice: number;
      quality: { overall: number };
    }>
  ): PatternStateMachineResult {
    this.candleCount++;
    const atr = calcATR(candles, 14);
    const lastPrice = candles[candles.length - 1]?.close || 0;
    const alerts: PatternAlert[] = [];

    // Update existing patterns and detect new ones
    const detectedIds = new Set(detectedPatterns.map(p => p.id));

    for (const pattern of detectedPatterns) {
      const existing = this.patterns.get(pattern.id);
      const totalPoints = pattern.points.length;
      const confirmedPoints = this._countConfirmedPoints(pattern.points, candles);

      if (existing) {
        // Update existing pattern state
        const newState = this._transitionState(
          existing,
          lastPrice,
          pattern.breakoutPrice,
          atr,
          confirmedPoints,
          totalPoints
        );

        const prevState = existing.state;
        existing.state = newState;
        existing.confirmedPoints = confirmedPoints;
        existing.totalPoints = totalPoints;
        existing.completionPct = Math.round((confirmedPoints / totalPoints) * 100);
        existing.confidence = pattern.quality.overall / 10;
        existing.candlesSinceUpdate++;
        existing.lastUpdate = Date.now();

        // Generate alerts on state transitions
        if (newState !== prevState) {
          existing.stateSince = Date.now();
          existing.candlesSinceUpdate = 0;

          const alert = this._generateAlert(existing, pattern.breakoutPrice);
          if (alert) alerts.push(alert);
        }
      } else {
        // New pattern detected
        const initialState: PatternState = confirmedPoints >= totalPoints
          ? 'completed'
          : confirmedPoints >= totalPoints - 1
            ? 'near-completion'
            : 'forming';

        const entry: PatternStateEntry = {
          id: pattern.id,
          type: pattern.type,
          direction: pattern.direction,
          state: initialState,
          stateSince: Date.now(),
          confirmedPoints,
          totalPoints,
          completionPct: Math.round((confirmedPoints / totalPoints) * 100),
          confidence: pattern.quality.overall / 10,
          keyLevel: pattern.breakoutPrice,
          invalidationLevel: this._calcInvalidation(pattern.breakoutPrice, pattern.direction, atr),
          lastUpdate: Date.now(),
          candlesSinceUpdate: 0,
        };

        this.patterns.set(pattern.id, entry);

        // Alert for near-completion patterns
        if (initialState === 'near-completion' || initialState === 'completed') {
          const alert = this._generateAlert(entry, pattern.breakoutPrice);
          if (alert) alerts.push(alert);
        }
      }
    }

    // Check for breakouts and failures in existing patterns not in current detection
    for (const [id, entry] of this.patterns) {
      if (detectedIds.has(id)) continue;
      if (entry.state === 'failed' || entry.state === 'breakout') continue;

      // Pattern not detected anymore — check if it broke out or failed
      if (entry.direction === 'bullish' && lastPrice > entry.keyLevel) {
        const prevState = entry.state;
        entry.state = 'breakout';
        entry.stateSince = Date.now();
        entry.candlesSinceUpdate = 0;
        const alert = this._generateAlert(entry, entry.keyLevel);
        if (alert) alerts.push(alert);
      } else if (entry.direction === 'bearish' && lastPrice < entry.keyLevel) {
        const prevState = entry.state;
        entry.state = 'breakout';
        entry.stateSince = Date.now();
        entry.candlesSinceUpdate = 0;
        const alert = this._generateAlert(entry, entry.keyLevel);
        if (alert) alerts.push(alert);
      } else if (lastPrice > entry.invalidationLevel && entry.direction === 'bearish') {
        entry.state = 'failed';
        entry.stateSince = Date.now();
      } else if (lastPrice < entry.invalidationLevel && entry.direction === 'bullish') {
        entry.state = 'failed';
        entry.stateSince = Date.now();
      }
    }

    // Cleanup old patterns
    this._cleanup();

    return this._buildResult(alerts);
  }

  /**
   * Get all active patterns in a specific state
   */
  getByState(state: PatternState): PatternStateEntry[] {
    return Array.from(this.patterns.values()).filter(p => p.state === state);
  }

  /**
   * Get the state machine instance for a specific pattern
   */
  getPattern(id: string): PatternStateEntry | undefined {
    return this.patterns.get(id);
  }

  // ── Private Methods ────────────────────────────────────

  private _countConfirmedPoints(
    points: Array<{ time: number; price: number }>,
    candles: CandleData[]
  ): number {
    const lastTime = candles[candles.length - 1]?.time || 0;
    return points.filter(p => p.time <= lastTime).length;
  }

  private _transitionState(
    entry: PatternStateEntry,
    currentPrice: number,
    breakoutPrice: number,
    atr: number,
    confirmedPoints: number,
    totalPoints: number
  ): PatternState {
    const completionRatio = confirmedPoints / totalPoints;

    // Check for breakout first
    if (entry.direction === 'bullish' && currentPrice > breakoutPrice) {
      return 'breakout';
    }
    if (entry.direction === 'bearish' && currentPrice < breakoutPrice) {
      return 'breakout';
    }

    // Check for invalidation
    if (currentPrice > entry.invalidationLevel && entry.direction === 'bearish') {
      return 'failed';
    }
    if (currentPrice < entry.invalidationLevel && entry.direction === 'bullish') {
      return 'failed';
    }

    // Check completion
    if (completionRatio >= 1) return 'completed';
    if (completionRatio >= 0.8) return 'near-completion';
    if (completionRatio >= 0.3) return 'forming';

    return entry.state; // No change
  }

  private _calcInvalidation(
    keyLevel: number,
    direction: 'bullish' | 'bearish',
    atr: number
  ): number {
    // Invalidation = key level ± 2 ATR (generous buffer)
    const buffer = Math.max(atr * 2, keyLevel * 0.03);
    return direction === 'bullish'
      ? keyLevel - buffer
      : keyLevel + buffer;
  }

  private _generateAlert(
    entry: PatternStateEntry,
    keyLevel: number
  ): PatternAlert | null {
    const directionLabel = entry.direction === 'bullish' ? 'صعودي' : 'هبوطي';

    switch (entry.state) {
      case 'near-completion':
        return {
          patternId: entry.id,
          patternType: entry.type,
          state: entry.state,
          message: `${entry.type} near completion (${entry.completionPct}%) — ${entry.direction}`,
          messageAr: `${entry.type} قريب من الاكتمال (${entry.completionPct}%) — ${directionLabel}`,
          direction: entry.direction,
          confidence: entry.confidence,
          keyLevel,
          timestamp: Date.now(),
          priority: 'warning',
        };
      case 'breakout':
        return {
          patternId: entry.id,
          patternType: entry.type,
          state: entry.state,
          message: `${entry.type} BREAKOUT ${entry.direction} at ${keyLevel.toFixed(2)}`,
          messageAr: `${entry.type} كسر ${directionLabel} عند ${keyLevel.toFixed(2)}`,
          direction: entry.direction,
          confidence: entry.confidence,
          keyLevel,
          timestamp: Date.now(),
          priority: 'critical',
        };
      case 'completed':
        if (entry.confidence >= 0.7) {
          return {
            patternId: entry.id,
            patternType: entry.type,
            state: entry.state,
            message: `${entry.type} completed with ${(entry.confidence * 100).toFixed(0)}% confidence`,
            messageAr: `${entry.type} مكتمل بثقة ${(entry.confidence * 100).toFixed(0)}%`,
            direction: entry.direction,
            confidence: entry.confidence,
            keyLevel,
            timestamp: Date.now(),
            priority: 'info',
          };
        }
        return null;
      default:
        return null;
    }
  }

  private _cleanup(): void {
    // Remove failed patterns older than 200 candles
    // Remove completed/breakout patterns older than 500 candles
    for (const [id, entry] of this.patterns) {
      if (entry.state === 'failed' && entry.candlesSinceUpdate > 200) {
        this.patterns.delete(id);
      } else if ((entry.state === 'completed' || entry.state === 'breakout') && entry.candlesSinceUpdate > 500) {
        this.patterns.delete(id);
      }
    }

    // Cap total patterns
    if (this.patterns.size > 50) {
      const entries = Array.from(this.patterns.entries())
        .sort((a, b) => a[1].lastUpdate - b[1].lastUpdate);
      for (let i = 0; i < entries.length - 30; i++) {
        this.patterns.delete(entries[i][0]);
      }
    }
  }

  private _buildResult(alerts: PatternAlert[]): PatternStateMachineResult {
    const patterns = Array.from(this.patterns.values());
    return {
      activePatterns: patterns,
      alerts,
      summary: {
        forming: patterns.filter(p => p.state === 'forming').length,
        nearCompletion: patterns.filter(p => p.state === 'near-completion').length,
        completed: patterns.filter(p => p.state === 'completed').length,
        breakout: patterns.filter(p => p.state === 'breakout').length,
        failed: patterns.filter(p => p.state === 'failed').length,
      },
    };
  }
}

// ── Singleton instance ───────────────────────────────────
let _instance: PatternStateMachine | null = null;

export function getPatternStateMachine(): PatternStateMachine {
  if (!_instance) {
    _instance = new PatternStateMachine();
  }
  return _instance;
}
