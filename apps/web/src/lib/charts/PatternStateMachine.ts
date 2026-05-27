// ═══════════════════════════════════════════════════════════
// Pattern State Machine — Real Finite State Machine
// Tracks pattern lifecycle: Forming → Validating → Active →
// Triggered → Confirmed/Failed with transition alerts
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Pattern States ────────────────────────────────────────
export type PatternState = 'forming' | 'validating' | 'active' | 'triggered' | 'confirmed' | 'failed';

export interface PatternStateMachineResult {
  summary: {
    forming: number;
    nearCompletion: number;
    completed: number;
    breakout: number;
    failed: number;
  };
  alerts: PatternAlert[];
  states: PatternStateInfo[];
  timestamp: number;
}

export interface PatternAlert {
  patternType: string;
  messageAr: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  priority: 'low' | 'medium' | 'high' | 'critical';
  keyLevel: number;
  state: PatternState;
}

export interface PatternStateInfo {
  id: string;
  type: string;
  state: PatternState;
  completionPct: number;
  confidence: number;
  keyLevel: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  createdAt: number;
  lastUpdated: number;
}

export interface PatternStateMachine {
  update(candles: CandleData[], patterns: any[]): PatternStateMachineResult;
  getStates(): PatternStateInfo[];
  clear(): void;
}

// ── In-memory pattern state tracking ──────────────────────
const trackedPatterns = new Map<string, PatternStateInfo>();
const MAX_TRACKED = 50;

/**
 * Determine the initial state of a pattern based on its properties
 */
function determineInitialState(pattern: any): PatternState {
  const quality = pattern.quality?.overall ?? pattern.quality ?? pattern.confidence * 100;

  // If pattern has all points (XABCD for harmonic, or complete structure)
  const hasAllPoints = pattern.points?.D || pattern.shapePoints?.length >= 4 || quality >= 50;

  if (!hasAllPoints && quality < 40) return 'forming';
  if (hasAllPoints && quality < 70) return 'validating';
  return 'active';
}

/**
 * Calculate completion percentage based on pattern properties
 */
function calculateCompletion(pattern: any, state: PatternState): number {
  const quality = pattern.quality?.overall ?? pattern.quality ?? pattern.confidence * 100;

  switch (state) {
    case 'forming': return Math.min(49, quality);
    case 'validating': return Math.min(79, 50 + quality * 0.3);
    case 'active': return Math.min(99, 80 + quality * 0.2);
    case 'triggered': return 100;
    case 'confirmed': return 100;
    case 'failed': return 0;
    default: return 0;
  }
}

/**
 * Check if a pattern should transition to a new state based on current price
 */
function checkTransition(
  info: PatternStateInfo,
  candles: CandleData[],
  pattern: any,
): { newState: PatternState; alert: PatternAlert | null } {
  if (!candles.length) return { newState: info.state, alert: null };

  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles.length >= 2 ? candles[candles.length - 2].close : currentPrice;

  switch (info.state) {
    case 'forming': {
      // Check if pattern now has all required points
      const quality = pattern.quality?.overall ?? pattern.quality ?? pattern.confidence * 100;
      if (quality >= 50 || pattern.points?.D) {
        return {
          newState: 'validating',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} اكتملت نقاطه ويدخل مرحلة التحقق`,
            direction: info.direction,
            priority: 'low',
            keyLevel: info.keyLevel,
            state: 'validating',
          },
        };
      }
      break;
    }

    case 'validating': {
      const quality = pattern.quality?.overall ?? pattern.quality ?? pattern.confidence * 100;
      if (quality >= 70 || pattern.confidence >= 0.7) {
        return {
          newState: 'active',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} مؤكد — السعر ضمن منطقة PRZ`,
            direction: info.direction,
            priority: 'medium',
            keyLevel: info.keyLevel,
            state: 'active',
          },
        };
      }
      // Check for invalidation
      if (info.direction === 'bullish' && currentPrice < info.stopLoss) {
        return {
          newState: 'failed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} فشل — السعر اخترق مستوى الإلغاء`,
            direction: info.direction,
            priority: 'high',
            keyLevel: info.stopLoss,
            state: 'failed',
          },
        };
      }
      if (info.direction === 'bearish' && currentPrice > info.stopLoss) {
        return {
          newState: 'failed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} فشل — السعر اخترق مستوى الإلغاء`,
            direction: info.direction,
            priority: 'high',
            keyLevel: info.stopLoss,
            state: 'failed',
          },
        };
      }
      break;
    }

    case 'active': {
      // Check if price has moved from PRZ in expected direction (triggered)
      const isBullishTrigger = info.direction === 'bullish' && currentPrice > info.entryPrice * 1.005 && prevPrice <= info.entryPrice * 1.005;
      const isBearishTrigger = info.direction === 'bearish' && currentPrice < info.entryPrice * 0.995 && prevPrice >= info.entryPrice * 0.995;

      if (isBullishTrigger || isBearishTrigger) {
        return {
          newState: 'triggered',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} أُطلق — بدأ السعر بالتحرك من PRZ`,
            direction: info.direction,
            priority: 'critical',
            keyLevel: info.entryPrice,
            state: 'triggered',
          },
        };
      }

      // Check for invalidation
      if (info.direction === 'bullish' && currentPrice < info.stopLoss) {
        return {
          newState: 'failed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} فشل — اختراق مستوى الإلغاء هابطة`,
            direction: info.direction,
            priority: 'high',
            keyLevel: info.stopLoss,
            state: 'failed',
          },
        };
      }
      if (info.direction === 'bearish' && currentPrice > info.stopLoss) {
        return {
          newState: 'failed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} فشل — اختراق مستوى الإلغاء صاعدة`,
            direction: info.direction,
            priority: 'high',
            keyLevel: info.stopLoss,
            state: 'failed',
          },
        };
      }
      break;
    }

    case 'triggered': {
      // Check if price reached take profit (confirmed)
      const isBullishConfirm = info.direction === 'bullish' && currentPrice >= info.takeProfit;
      const isBearishConfirm = info.direction === 'bearish' && currentPrice <= info.takeProfit;

      if (isBullishConfirm || isBearishConfirm) {
        return {
          newState: 'confirmed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} مؤكد بنجاح — وصل السعر للهدف`,
            direction: info.direction,
            priority: 'critical',
            keyLevel: info.takeProfit,
            state: 'confirmed',
          },
        };
      }

      // Check if price reversed back past entry + hit stop loss
      if (info.direction === 'bullish' && currentPrice < info.stopLoss) {
        return {
          newState: 'failed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} فشل بعد الإطلاق — عودة السعر هابطاً`,
            direction: info.direction,
            priority: 'high',
            keyLevel: info.stopLoss,
            state: 'failed',
          },
        };
      }
      if (info.direction === 'bearish' && currentPrice > info.stopLoss) {
        return {
          newState: 'failed',
          alert: {
            patternType: info.type,
            messageAr: `نمط ${info.type} فشل بعد الإطلاق — عودة السعر صاعداً`,
            direction: info.direction,
            priority: 'high',
            keyLevel: info.stopLoss,
            state: 'failed',
          },
        };
      }
      break;
    }

    case 'confirmed':
    case 'failed':
      // Terminal states — no further transitions
      break;
  }

  return { newState: info.state, alert: null };
}

export function getPatternStateMachine(): PatternStateMachine {
  return {
    update(candles: CandleData[], patterns: any[]): PatternStateMachineResult {
      const alerts: PatternAlert[] = [];
      const price = candles.length ? candles[candles.length - 1].close : 0;

      // Track new patterns or update existing ones
      for (const p of patterns) {
        const id = p.id || `${p.type}_${p.direction}_${Math.round(p.time || p.points?.D?.time || Date.now() / 1000)}`;
        const quality = p.quality?.overall ?? p.quality ?? p.confidence * 100;
        const direction: 'bullish' | 'bearish' | 'neutral' = p.direction || 'neutral';

        if (trackedPatterns.has(id)) {
          // Update existing pattern — check for state transitions
          const existing = trackedPatterns.get(id)!;
          const { newState, alert } = checkTransition(existing, candles, p);

          if (alert) alerts.push(alert);

          if (newState !== existing.state) {
            existing.state = newState;
            existing.lastUpdated = Date.now();
            existing.completionPct = calculateCompletion(p, newState);
            existing.confidence = p.confidence || existing.confidence;
          }
        } else if (trackedPatterns.size < MAX_TRACKED) {
          // New pattern — create state entry
          const initialState = determineInitialState(p);
          const entryPrice = p.przLevel || p.points?.D?.price || price;
          // Calculate SL/TP from ATR-like estimate (1.5% SL, 3% TP as fallback)
          const slDistance = Math.max(entryPrice * 0.015, (p.stopLoss ? Math.abs(entryPrice - p.stopLoss) : 0) || entryPrice * 0.015);
          const tpDistance = slDistance * 2;

          const info: PatternStateInfo = {
            id,
            type: p.type || 'unknown',
            state: initialState,
            completionPct: calculateCompletion(p, initialState),
            confidence: p.confidence || 0.5,
            keyLevel: entryPrice,
            direction,
            entryPrice,
            stopLoss: direction === 'bullish' ? entryPrice - slDistance : entryPrice + slDistance,
            takeProfit: direction === 'bullish' ? entryPrice + tpDistance : entryPrice - tpDistance,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          };

          // Use pattern's own SL/TP if available
          if (p.stopLoss) info.stopLoss = p.stopLoss;
          if (p.takeProfit || p.target) info.takeProfit = p.takeProfit || p.target;

          trackedPatterns.set(id, info);

          // Alert for new active patterns
          if (initialState === 'active' && quality >= 70) {
            alerts.push({
              patternType: info.type,
              messageAr: `نمط ${info.type} جديد مؤكد (${direction === 'bullish' ? 'صاعد' : direction === 'bearish' ? 'هابط' : 'محايد'})`,
              direction,
              priority: 'high',
              keyLevel: entryPrice,
              state: 'active',
            });
          }
        }
      }

      // Clean up old terminal states (> 5 minutes)
      const fiveMinAgo = Date.now() - 300000;
      for (const [id, info] of trackedPatterns) {
        if ((info.state === 'confirmed' || info.state === 'failed') && info.lastUpdated < fiveMinAgo) {
          trackedPatterns.delete(id);
        }
      }

      // Compute summary from actual tracked states
      const allStates = Array.from(trackedPatterns.values());
      const summary = {
        forming: allStates.filter(s => s.state === 'forming' || s.state === 'validating').length,
        nearCompletion: allStates.filter(s => s.state === 'validating').length,
        completed: allStates.filter(s => s.state === 'active' || s.state === 'confirmed').length,
        breakout: allStates.filter(s => s.state === 'triggered').length,
        failed: allStates.filter(s => s.state === 'failed').length,
      };

      return { summary, alerts, states: allStates, timestamp: Date.now() };
    },

    getStates(): PatternStateInfo[] {
      return Array.from(trackedPatterns.values());
    },

    clear(): void {
      trackedPatterns.clear();
    },
  };
}
