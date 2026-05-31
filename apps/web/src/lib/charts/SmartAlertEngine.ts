// ═══════════════════════════════════════════════════════════════════════
// ROUA Smart Alert Engine — Phase 3
//
// Conditional alert system that triggers on multi-signal confluence,
// not just price levels. Supports composite conditions like:
// - "Alert when Gartley bullish completes AND bullish OB within PRZ"
// - "Alert on bullish BOS 4H + unfilled bullish FVG 1H"
// - "Alert when trendline crosses Fibonacci 0.618"
//
// Fires via: browser notification + audio + chart marker
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Alert Condition Types ───────────────────────────────────────────

/** Signal sources that can be used in alert conditions */
export type AlertSignalSource =
  | 'harmonic'       // Harmonic pattern completion
  | 'elliott'        // Elliott Wave count
  | 'wyckoff'        // Wyckoff phase/event
  | 'bos'            // Break of Structure
  | 'choch'          // Change of Character
  | 'orderblock'     // Order Block
  | 'fvg'            // Fair Value Gap
  | 'trendline'      // Trendline touch/break
  | 'fibonacci'      // Fibonacci level touch
  | 'volume'         // Volume anomaly
  | 'liquidity';     // Liquidity sweep

/** Logical operators for combining conditions */
export type LogicOp = 'AND' | 'OR' | 'NOT';

/** Direction filter */
export type DirectionFilter = 'bullish' | 'bearish' | 'any';

/** Timeframe filter */
export type TimeframeFilter = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | 'any';

/** A single condition in an alert rule */
export interface AlertCondition {
  /** Signal source to check */
  source: AlertSignalSource;
  /** Direction filter */
  direction: DirectionFilter;
  /** Timeframe filter (or 'any' for current) */
  timeframe: TimeframeFilter;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Optional: specific sub-type (e.g. 'Gartley' for harmonic) */
  subType?: string;
}

/** A complete alert rule combining conditions with logic */
export interface AlertRule {
  /** Unique rule ID */
  id: string;
  /** User-visible name (Arabic) */
  nameAr: string;
  /** Conditions to check */
  conditions: AlertCondition[];
  /** Logic operator between conditions */
  logic: LogicOp;
  /** Priority when triggered */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Whether this rule is active */
  enabled: boolean;
  /** Cooldown period in ms before re-triggering (default: 5 min) */
  cooldownMs: number;
  /** Maximum triggers per session (0 = unlimited) */
  maxTriggers: number;
  /** Creation timestamp */
  createdAt: number;
}

/** A triggered alert instance */
export interface TriggeredAlert {
  /** The rule that triggered */
  ruleId: string;
  /** Rule name */
  nameAr: string;
  /** When it triggered */
  timestamp: number;
  /** Which conditions were met */
  metConditions: AlertCondition[];
  /** Direction of the combined signal */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Overall confidence of the confluence */
  confidence: number;
  /** Key price level associated with this alert */
  keyLevel: number;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ── Analysis Snapshot ───────────────────────────────────────────────

/** Snapshot of current analysis results for condition evaluation */
export interface AnalysisSnapshot {
  /** Harmonic patterns detected */
  harmonicPatterns: Array<{
    type: string;
    direction: 'bullish' | 'bearish';
    confidence: number;
    przLevel: number;
    timeframe?: string;
  }>;
  /** Elliott wave results */
  elliottResult: {
    dominantDirection: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    waveType: string;
  } | null;
  /** Wyckoff results */
  wyckoffResult: {
    scheme: string;
    currentPhase: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    events: string[];
  } | null;
  /** SMC data */
  smcData: {
    orderBlocks: Array<{
      type: 'bullish' | 'bearish';
      strength: number;
      price: number;
      broken: boolean;
      timeframe?: string;
    }>;
    fvgs: Array<{
      type: 'bullish' | 'bearish';
      filled: boolean;
      midPrice: number;
      timeframe?: string;
    }>;
    structureBreaks: Array<{
      type: 'BOS' | 'CHoCH';
      direction: 'bullish' | 'bearish';
      price: number;
      timeframe?: string;
    }>;
  };
  /** Trendline touches */
  trendlineTouches: Array<{
    direction: 'bullish' | 'bearish';
    price: number;
  }>;
  /** Fibonacci levels nearby */
  fibonacciLevels: Array<{
    ratio: number;
    price: number;
    direction: 'bullish' | 'bearish';
  }>;
  /** Volume anomalies */
  volumeAnomalies: Array<{
    type: 'spike' | 'dryup';
    direction: 'bullish' | 'bearish';
  }>;
  /** Current price */
  currentPrice: number;
  /** Current timeframe */
  timeframe: string;
}

// ── In-memory State ─────────────────────────────────────────────────

const activeRules = new Map<string, AlertRule>();
const lastTriggerTime = new Map<string, number>();
const triggerCounts = new Map<string, number>();
const alertHistory: TriggeredAlert[] = [];
const MAX_HISTORY = 200;

// ── Pre-built Alert Rules (Default Library) ─────────────────────────

const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'harmonic-ob-confluence',
    nameAr: 'نمط هارمونيك + بلوك أوامر ضمن PRZ',
    conditions: [
      { source: 'harmonic', direction: 'any', timeframe: 'any', minConfidence: 0.6 },
      { source: 'orderblock', direction: 'any', timeframe: 'any', minConfidence: 0.5 },
    ],
    logic: 'AND',
    priority: 'critical',
    enabled: true,
    cooldownMs: 300000,
    maxTriggers: 0,
    createdAt: Date.now(),
  },
  {
    id: 'bos-fvg-mtf',
    nameAr: 'BOS صاعد + فجوة قيمة غير مغلّية',
    conditions: [
      { source: 'bos', direction: 'bullish', timeframe: 'any', minConfidence: 0.5 },
      { source: 'fvg', direction: 'bullish', timeframe: 'any' },
    ],
    logic: 'AND',
    priority: 'high',
    enabled: true,
    cooldownMs: 300000,
    maxTriggers: 0,
    createdAt: Date.now(),
  },
  {
    id: 'wyckoff-spring-bos',
    nameAr: 'سبرينج ويكوف + BOS صاعد',
    conditions: [
      { source: 'wyckoff', direction: 'bullish', timeframe: 'any', subType: 'spring' },
      { source: 'bos', direction: 'bullish', timeframe: 'any', minConfidence: 0.6 },
    ],
    logic: 'AND',
    priority: 'critical',
    enabled: true,
    cooldownMs: 600000,
    maxTriggers: 0,
    createdAt: Date.now(),
  },
  {
    id: 'elliott-impulse-ob',
    nameAr: 'موجة نبضة إليوت + بلوك أوامر مؤكد',
    conditions: [
      { source: 'elliott', direction: 'any', timeframe: 'any', subType: 'impulse', minConfidence: 0.6 },
      { source: 'orderblock', direction: 'any', timeframe: 'any', minConfidence: 0.6 },
    ],
    logic: 'AND',
    priority: 'high',
    enabled: true,
    cooldownMs: 300000,
    maxTriggers: 0,
    createdAt: Date.now(),
  },
  {
    id: 'triple-confluence',
    nameAr: 'تقارب ثلاثي: هارمونيك + BOS + ويكوف',
    conditions: [
      { source: 'harmonic', direction: 'any', timeframe: 'any', minConfidence: 0.5 },
      { source: 'bos', direction: 'any', timeframe: 'any', minConfidence: 0.5 },
      { source: 'wyckoff', direction: 'any', timeframe: 'any', minConfidence: 0.4 },
    ],
    logic: 'AND',
    priority: 'critical',
    enabled: true,
    cooldownMs: 600000,
    maxTriggers: 0,
    createdAt: Date.now(),
  },
  {
    id: 'utad-choch-bearish',
    nameAr: 'UTAD توزيع + CHoCH هابط',
    conditions: [
      { source: 'wyckoff', direction: 'bearish', timeframe: 'any', subType: 'utad' },
      { source: 'choch', direction: 'bearish', timeframe: 'any', minConfidence: 0.6 },
    ],
    logic: 'AND',
    priority: 'critical',
    enabled: true,
    cooldownMs: 600000,
    maxTriggers: 0,
    createdAt: Date.now(),
  },
];

// Initialize default rules
for (const rule of DEFAULT_RULES) {
  activeRules.set(rule.id, rule);
}

// ── Condition Evaluation ────────────────────────────────────────────

/**
 * Evaluate a single alert condition against the analysis snapshot.
 * Returns the match result with confidence and key level.
 */
function evaluateCondition(
  condition: AlertCondition,
  snapshot: AnalysisSnapshot,
): { matched: boolean; confidence: number; direction: 'bullish' | 'bearish' | 'neutral'; keyLevel: number } {
  const dirMatch = (sigDir: 'bullish' | 'bearish' | 'neutral') =>
    condition.direction === 'any' || sigDir === condition.direction;

  const tfMatch = (sigTf?: string) =>
    condition.timeframe === 'any' || !sigTf || sigTf === condition.timeframe || condition.timeframe === snapshot.timeframe;

  const confMatch = (sigConf: number) =>
    !condition.minConfidence || sigConf >= condition.minConfidence;

  const subMatch = (sigType?: string) =>
    !condition.subType || (sigType?.toLowerCase().includes(condition.subType.toLowerCase()));

  switch (condition.source) {
    case 'harmonic': {
      for (const p of snapshot.harmonicPatterns) {
        if (dirMatch(p.direction) && tfMatch(p.timeframe) && confMatch(p.confidence) && subMatch(p.type)) {
          return { matched: true, confidence: p.confidence, direction: p.direction, keyLevel: p.przLevel };
        }
      }
      break;
    }

    case 'elliott': {
      if (snapshot.elliottResult) {
        const e = snapshot.elliottResult;
        if (dirMatch(e.direction) && confMatch(e.confidence) && subMatch(e.waveType)) {
          return { matched: true, confidence: e.confidence, direction: e.direction, keyLevel: snapshot.currentPrice };
        }
      }
      break;
    }

    case 'wyckoff': {
      if (snapshot.wyckoffResult) {
        const w = snapshot.wyckoffResult;
        if (dirMatch(w.direction) && confMatch(w.confidence) && subMatch(w.currentPhase) || subMatch(w.events.join(','))) {
          return { matched: true, confidence: w.confidence, direction: w.direction, keyLevel: snapshot.currentPrice };
        }
      }
      break;
    }

    case 'bos': {
      for (const brk of snapshot.smcData.structureBreaks) {
        if (brk.type === 'BOS' && dirMatch(brk.direction) && tfMatch(brk.timeframe)) {
          return { matched: true, confidence: 0.7, direction: brk.direction, keyLevel: brk.price };
        }
      }
      break;
    }

    case 'choch': {
      for (const brk of snapshot.smcData.structureBreaks) {
        if (brk.type === 'CHoCH' && dirMatch(brk.direction) && tfMatch(brk.timeframe)) {
          return { matched: true, confidence: 0.65, direction: brk.direction, keyLevel: brk.price };
        }
      }
      break;
    }

    case 'orderblock': {
      for (const ob of snapshot.smcData.orderBlocks) {
        if (!ob.broken && dirMatch(ob.type) && tfMatch(ob.timeframe) && confMatch(ob.strength)) {
          return { matched: true, confidence: ob.strength, direction: ob.type, keyLevel: ob.price };
        }
      }
      break;
    }

    case 'fvg': {
      for (const fvg of snapshot.smcData.fvgs) {
        if (!fvg.filled && dirMatch(fvg.type) && tfMatch(fvg.timeframe)) {
          return { matched: true, confidence: 0.55, direction: fvg.type, keyLevel: fvg.midPrice };
        }
      }
      break;
    }

    case 'trendline': {
      for (const tl of snapshot.trendlineTouches) {
        if (dirMatch(tl.direction)) {
          return { matched: true, confidence: 0.5, direction: tl.direction, keyLevel: tl.price };
        }
      }
      break;
    }

    case 'fibonacci': {
      for (const fib of snapshot.fibonacciLevels) {
        if (dirMatch(fib.direction)) {
          return { matched: true, confidence: 0.5, direction: fib.direction, keyLevel: fib.price };
        }
      }
      break;
    }

    case 'volume': {
      for (const va of snapshot.volumeAnomalies) {
        if (dirMatch(va.direction)) {
          return { matched: true, confidence: 0.5, direction: va.direction, keyLevel: snapshot.currentPrice };
        }
      }
      break;
    }

    case 'liquidity': {
      // Handled by LiquidityZones integration
      break;
    }
  }

  return { matched: false, confidence: 0, direction: 'neutral', keyLevel: 0 };
}

/**
 * Evaluate a complete alert rule against the snapshot.
 * Applies the logic operator across all conditions.
 */
function evaluateRule(rule: AlertRule, snapshot: AnalysisSnapshot): TriggeredAlert | null {
  if (!rule.enabled) return null;

  // Check cooldown
  const lastTrigger = lastTriggerTime.get(rule.id) || 0;
  if (Date.now() - lastTrigger < rule.cooldownMs) return null;

  // Check max triggers
  const triggerCount = triggerCounts.get(rule.id) || 0;
  if (rule.maxTriggers > 0 && triggerCount >= rule.maxTriggers) return null;

  // Evaluate each condition
  const results = rule.conditions.map(c => ({
    condition: c,
    ...evaluateCondition(c, snapshot),
  }));

  // Apply logic
  let triggered = false;
  switch (rule.logic) {
    case 'AND':
      triggered = results.every(r => r.matched);
      break;
    case 'OR':
      triggered = results.some(r => r.matched);
      break;
    case 'NOT':
      triggered = !results.some(r => r.matched);
      break;
  }

  if (!triggered) return null;

  // Compute combined direction and confidence
  const metConditions = results.filter(r => r.matched).map(r => r.condition);
  const bullishConf = results.filter(r => r.matched && r.direction === 'bullish').reduce((s, r) => s + r.confidence, 0);
  const bearishConf = results.filter(r => r.matched && r.direction === 'bearish').reduce((s, r) => s + r.confidence, 0);
  const totalConf = bullishConf + bearishConf;

  const direction: 'bullish' | 'bearish' | 'neutral' =
    bullishConf > bearishConf * 1.5 ? 'bullish'
    : bearishConf > bullishConf * 1.5 ? 'bearish'
    : 'neutral';

  const confidence = totalConf > 0 ? Math.max(bullishConf, bearishConf) / totalConf : 0;
  const keyLevel = results.find(r => r.matched && r.keyLevel > 0)?.keyLevel || snapshot.currentPrice;

  const alert: TriggeredAlert = {
    ruleId: rule.id,
    nameAr: rule.nameAr,
    timestamp: Date.now(),
    metConditions,
    direction,
    confidence: Math.min(0.95, confidence),
    keyLevel,
    priority: rule.priority,
  };

  // Update tracking
  lastTriggerTime.set(rule.id, Date.now());
  triggerCounts.set(rule.id, triggerCount + 1);

  return alert;
}

// ── Main Export: Evaluate All Rules ──────────────────────────────────

/**
 * Evaluate all active alert rules against the current analysis snapshot.
 * Returns all triggered alerts.
 */
export function evaluateSmartAlerts(snapshot: AnalysisSnapshot): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of activeRules.values()) {
    const alert = evaluateRule(rule, snapshot);
    if (alert) {
      triggered.push(alert);
      alertHistory.push(alert);
      if (alertHistory.length > MAX_HISTORY) {
        alertHistory.splice(0, alertHistory.length - MAX_HISTORY);
      }
    }
  }

  // Sort by priority (critical first)
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  triggered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return triggered;
}

// ── Rule Management ─────────────────────────────────────────────────

/** Add a custom alert rule */
export function addAlertRule(rule: AlertRule): void {
  activeRules.set(rule.id, rule);
  persistRules();
}

/** Remove an alert rule */
export function removeAlertRule(ruleId: string): boolean {
  const deleted = activeRules.delete(ruleId);
  if (deleted) persistRules();
  return deleted;
}

/** Toggle a rule on/off */
export function toggleAlertRule(ruleId: string, enabled: boolean): void {
  const rule = activeRules.get(ruleId);
  if (rule) {
    rule.enabled = enabled;
    activeRules.set(ruleId, rule);
    persistRules();
  }
}

/** Get all active rules */
export function getAlertRules(): AlertRule[] {
  return Array.from(activeRules.values());
}

/** Get alert history */
export function getAlertHistory(): TriggeredAlert[] {
  return [...alertHistory];
}

/** Clear alert history */
export function clearAlertHistory(): void {
  alertHistory.length = 0;
  lastTriggerTime.clear();
  triggerCounts.clear();
}

/** Reset all rule trigger counts (new session) */
export function resetTriggerCounts(): void {
  triggerCounts.clear();
  lastTriggerTime.clear();
}

// ── Persistence ─────────────────────────────────────────────────────

const RULES_KEY = 'roua-smart-alert-rules';

function persistRules(): void {
  try {
    if (typeof window !== 'undefined') {
      const customRules = Array.from(activeRules.values()).filter(
        r => !DEFAULT_RULES.some(d => d.id === r.id)
      );
      localStorage.setItem(RULES_KEY, JSON.stringify(customRules));
    }
  } catch { /* not available */ }
}

function loadCustomRules(): void {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(RULES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const rule of parsed) {
            if (rule.id && !activeRules.has(rule.id)) {
              activeRules.set(rule.id, rule);
            }
          }
        }
      }
    }
  } catch { /* not available */ }
}

// Load custom rules on first import
loadCustomRules();

// ── Browser Notification Helper ─────────────────────────────────────

/**
 * Fire a browser notification for a triggered alert.
 * Falls back gracefully if Notification API is not available.
 */
export function fireBrowserNotification(alert: TriggeredAlert): void {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    if (Notification.permission === 'granted') {
      const dirEmoji = alert.direction === 'bullish' ? '🟢' : alert.direction === 'bearish' ? '🔴' : '⚪';
      new Notification(`${dirEmoji} ROUA — ${alert.nameAr}`, {
        body: `اتجاه: ${alert.direction === 'bullish' ? 'صاعد' : alert.direction === 'bearish' ? 'هابط' : 'محايد'} | ثقة: ${Math.round(alert.confidence * 100)}% | مستوى: ${alert.keyLevel.toFixed(2)}`,
        tag: alert.ruleId,
        silent: false,
      });
    }
  } catch { /* Notification API not available */ }
}

// ── Build Snapshot Helper ───────────────────────────────────────────

/**
 * Build an AnalysisSnapshot from the raw analysis results.
 * This bridges the gap between the analysis pipeline and the alert engine.
 */
export function buildAlertSnapshot(opts: {
  patterns?: any[];
  smcData?: any;
  elliottResult?: any;
  wyckoffResult?: any;
  currentPrice: number;
  timeframe: string;
}): AnalysisSnapshot {
  const { patterns, smcData, elliottResult, wyckoffResult, currentPrice, timeframe } = opts;

  return {
    harmonicPatterns: (patterns || [])
      .filter((p: any) => p.type?.includes('harmonic') || p.type?.includes('Gartley') || p.type?.includes('Bat') || p.type?.includes('Butterfly') || p.type?.includes('Crab') || p.type?.includes('Shark') || p.type?.includes('Cypher'))
      .map((p: any) => ({
        type: p.type || 'unknown',
        direction: p.direction || 'neutral',
        confidence: p.confidence || 0.5,
        przLevel: p.przLevel || p.price || p.points?.D?.price || currentPrice,
        timeframe,
      })),
    elliottResult: elliottResult?.dominantCount ? {
      dominantDirection: elliottResult.dominantCount.direction || 'neutral',
      confidence: elliottResult.dominantCount.confidence || 0.5,
      waveType: elliottResult.dominantCount.type || 'unknown',
    } : null,
    wyckoffResult: wyckoffResult ? {
      scheme: wyckoffResult.scheme || 'none',
      currentPhase: wyckoffResult.currentPhase || 'none',
      direction: wyckoffResult.direction || 'neutral',
      confidence: wyckoffResult.confidence || 0,
      events: (wyckoffResult.events || []).map((e: any) => e.type || ''),
    } : null,
    smcData: {
      orderBlocks: (smcData?.orderBlocks || []).map((ob: any) => ({
        type: ob.type || 'bullish',
        strength: ob.strength || 0.5,
        price: ob.price || (ob.high + ob.low) / 2 || currentPrice,
        broken: ob.broken || false,
        timeframe,
      })),
      fvgs: (smcData?.fvgs || []).map((fvg: any) => ({
        type: fvg.type || 'bullish',
        filled: fvg.filled || false,
        midPrice: fvg.midPrice || (fvg.high + fvg.low) / 2 || currentPrice,
        timeframe,
      })),
      structureBreaks: (smcData?.structureBreaks || []).map((brk: any) => ({
        type: brk.type || 'BOS',
        direction: brk.direction || 'bullish',
        price: brk.price || currentPrice,
        timeframe,
      })),
    },
    trendlineTouches: [],
    fibonacciLevels: [],
    volumeAnomalies: [],
    currentPrice,
    timeframe,
  };
}
