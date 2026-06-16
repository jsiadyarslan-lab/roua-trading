// ═══════════════════════════════════════════════════════════════════════
// ROUA Scenario Engine — Revolutionary Feature #7
//
// "What if?" analysis: Given the current market setup, what are the
// possible scenarios and their probabilities?
//
// This engine doesn't just predict ONE direction — it computes multiple
// scenarios (bullish, bearish, sideways) with specific price targets,
// invalidation levels, and probability estimates based on the confluence
// of all detected signals.
//
// Key capabilities:
// - 3-5 scenarios per analysis (not just bullish/bearish)
// - Probability-weighted expected value calculation
// - Invalidation levels for each scenario
// - "Tilt" detection: when one scenario becomes significantly more likely
// - Arabic descriptions for each scenario
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';

// ── Types ───────────────────────────────────────────────────────────

export type ScenarioType = 'bullish_breakout' | 'bullish_retest' | 'sideways_range' | 'bearish_retest' | 'bearish_breakout' | 'trap_bull' | 'trap_bear';

export interface Scenario {
  type: ScenarioType;
  nameAr: string;
  descriptionAr: string;
  probability: number;        // 0-1
  priceTarget: number;
  invalidationLevel: number;
  keySignals: string[];       // Which signals support this scenario
  contradictingSignals: string[]; // Which signals contradict this
  expectedCandles: number;    // How many candles to reach target
  riskRewardRatio: number;
  confidence: number;         // 0-1
}

export interface ScenarioResult {
  scenarios: Scenario[];
  dominantScenario: ScenarioType | null;
  tiltDirection: 'bullish' | 'bearish' | 'neutral';
  tiltStrength: number;       // 0-1, how strong the tilt is
  expectedValue: number;      // Probability-weighted expected move
  keyLevel: number;           // Most important price level
  keyLevelType: 'support' | 'resistance' | 'pivot';
  summaryAr: string;
  warnings: string[];
}

// ── Helper Functions ────────────────────────────────────────────────

function atrMultiplier(candles: CandleData[]): number {
  const atr = calcATR(candles, 14);
  const price = candles[candles.length - 1]?.close || 1;
  return atr / price; // ATR as percentage of price
}

function priceAboveLevel(price: number, level: number, tolerance: number): boolean {
  return price > level * (1 - tolerance);
}

function priceBelowLevel(price: number, level: number, tolerance: number): boolean {
  return price < level * (1 + tolerance);
}

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Compute multiple market scenarios from the current analysis data.
 * Returns 3-5 possible scenarios with probabilities and targets.
 */
export function computeScenarios(opts: {
  candles: CandleData[];
  currentPrice: number;
  /** Bullish signal count */
  bullishSignals: number;
  /** Bearish signal count */
  bearishSignals: number;
  /** Neutral signal count */
  neutralSignals: number;
  /** Average bullish confidence */
  avgBullishConf: number;
  /** Average bearish confidence */
  avgBearishConf: number;
  /** Detected SMC data */
  smcData?: {
    orderBlocks?: Array<{ type: string; price: number; strength: number; broken: boolean }>;
    fvgs?: Array<{ type: string; midPrice: number; filled: boolean }>;
    structureBreaks?: Array<{ type: string; direction: string; price: number }>;
  };
  /** Support levels */
  supports?: number[];
  /** Resistance levels */
  resistances?: number[];
  /** Harmonic patterns */
  harmonicPatterns?: Array<{ type: string; direction: string; confidence: number; przLevel: number }>;
  /** Market regime */
  regime?: string;
  /** Volume profile POC */
  pocPrice?: number;
  /** Timeframe */
  timeframe?: string;
}): ScenarioResult {
  const {
    candles, currentPrice, bullishSignals, bearishSignals, neutralSignals,
    avgBullishConf, avgBearishConf, smcData, supports, resistances,
    harmonicPatterns, regime, pocPrice, timeframe,
  } = opts;

  const atrPct = atrMultiplier(candles);
  const nearestSupport = supports && supports.length > 0
    ? supports.filter(s => s < currentPrice).sort((a, b) => b - a)[0] || currentPrice * (1 - atrPct * 3)
    : currentPrice * (1 - atrPct * 3);
  const nearestResistance = resistances && resistances.length > 0
    ? resistances.filter(r => r > currentPrice).sort((a, b) => a - b)[0] || currentPrice * (1 + atrPct * 3)
    : currentPrice * (1 + atrPct * 3);

  const totalSignals = bullishSignals + bearishSignals + neutralSignals;
  const bullRatio = totalSignals > 0 ? bullishSignals / totalSignals : 0.33;
  const bearRatio = totalSignals > 0 ? bearishSignals / totalSignals : 0.33;
  const neutralRatio = totalSignals > 0 ? neutralSignals / totalSignals : 0.34;

  const scenarios: Scenario[] = [];

  // ── Scenario 1: Bullish Breakout ──
  {
    const prob = Math.min(0.45, bullRatio * avgBullishConf * 1.2);
    const target = currentPrice + (nearestResistance - currentPrice) * 1.5 + currentPrice * atrPct * 2;
    const invalidation = nearestSupport - currentPrice * atrPct * 0.5;
    const risk = currentPrice - invalidation;
    const reward = target - currentPrice;
    const signals: string[] = [];
    const contradicts: string[] = [];

    if (bullishSignals > bearishSignals) signals.push(`أغلبية الإشارات صاعدة (${bullishSignals}/${totalSignals})`);
    if (avgBullishConf > 0.6) signals.push(`ثقة صاعدة عالية (${Math.round(avgBullishConf * 100)}%)`);

    // Check for bullish BOS
    const bullishBOS = smcData?.structureBreaks?.some(b => b.type === 'BOS' && b.direction === 'bullish');
    if (bullishBOS) signals.push('كسر هيكل صاعد مؤكد');

    // Check for unfilled bullish FVG
    const bullishFVG = smcData?.fvgs?.some(f => f.type === 'bullish' && !f.filled);
    if (bullishFVG) signals.push('فجوة قيمة صاعدة غير مغلّقة');

    // Check for bullish harmonic near PRZ
    const bullishHarmonic = harmonicPatterns?.some(h => h.direction === 'bullish' && h.confidence > 0.5);
    if (bullishHarmonic) signals.push('نمط هارمونيك صاعد مكتمل');

    if (bearishSignals > bullishSignals) contradicts.push(`إشارات هابطة أكثر (${bearishSignals})`);
    if (avgBearishConf > 0.6) contradicts.push('ثقة هابطة عالية');

    scenarios.push({
      type: 'bullish_breakout',
      nameAr: 'اختراق صاعد',
      descriptionAr: `السعر يخترق المقاومة عند ${nearestResistance.toFixed(2)} ويصل إلى ${target.toFixed(2)}. مدعوم بـ${bullishSignals} إشارة صاعدة.`,
      probability: Math.max(0.05, Math.min(0.45, prob)),
      priceTarget: Math.round(target * 100) / 100,
      invalidationLevel: Math.round(invalidation * 100) / 100,
      keySignals: signals,
      contradictingSignals: contradicts,
      expectedCandles: Math.round(20 + (target - currentPrice) / (currentPrice * atrPct)),
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      confidence: Math.min(0.9, avgBullishConf * (bullRatio / 0.5)),
    });
  }

  // ── Scenario 2: Bullish Retest (pullback then up) ──
  {
    const prob = Math.min(0.35, bullRatio * avgBullishConf * 0.8);
    const retestLevel = currentPrice - currentPrice * atrPct * 1.5;
    const target = currentPrice + currentPrice * atrPct * 3;
    const invalidation = nearestSupport - currentPrice * atrPct * 1;
    const risk = currentPrice - invalidation;
    const reward = target - currentPrice;

    const signals: string[] = ['ارتداد من دعم متوقع'];
    const contradicts: string[] = [];
    if (nearestSupport > currentPrice * 0.95) signals.push(`دعم قريب عند ${nearestSupport.toFixed(2)}`);
    if (bearRatio > 0.4) contradicts.push('ضغط بيعي موجود');

    scenarios.push({
      type: 'bullish_retest',
      nameAr: 'إعادة اختبار صاعد',
      descriptionAr: `ارتداد قصير إلى ${retestLevel.toFixed(2)} ثم صعود إلى ${target.toFixed(2)}. سيناريو "اشترِ عند الدعم".`,
      probability: Math.max(0.05, prob),
      priceTarget: Math.round(target * 100) / 100,
      invalidationLevel: Math.round(invalidation * 100) / 100,
      keySignals: signals,
      contradictingSignals: contradicts,
      expectedCandles: Math.round(30 + (target - currentPrice) / (currentPrice * atrPct)),
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      confidence: Math.min(0.8, avgBullishConf * 0.7),
    });
  }

  // ── Scenario 3: Sideways Range ──
  {
    const prob = Math.max(0.1, neutralRatio * 1.5 + (regime === 'ranging' ? 0.2 : 0));
    const rangeTop = nearestResistance;
    const rangeBottom = nearestSupport;

    const signals: string[] = [];
    if (regime === 'ranging') signals.push('نظام السوق عرضي');
    if (neutralSignals > bullishSignals && neutralSignals > bearishSignals) signals.push('أغلبية الإشارات محايدة');
    if (pocPrice && Math.abs(pocPrice - currentPrice) / currentPrice < 0.01) signals.push('السعر عند POC');

    scenarios.push({
      type: 'sideways_range',
      nameAr: 'نطاق عرضي',
      descriptionAr: `السعر يتذبذب بين ${rangeBottom.toFixed(2)} و${rangeTop.toFixed(2)}. تداول نطاقي.`,
      probability: Math.max(0.05, Math.min(0.4, prob)),
      priceTarget: Math.round(((rangeTop + rangeBottom) / 2) * 100) / 100,
      invalidationLevel: Math.round(rangeBottom * 100) / 100,
      keySignals: signals,
      contradictingSignals: bullishSignals > bearishSignals * 2 ? ['إشارات صاعدة قوية'] : bearishSignals > bullishSignals * 2 ? ['إشارات هابطة قوية'] : [],
      expectedCandles: 50,
      riskRewardRatio: 0.5,
      confidence: Math.min(0.7, neutralRatio * 1.2),
    });
  }

  // ── Scenario 4: Bearish Retest ──
  {
    const prob = Math.min(0.35, bearRatio * avgBearishConf * 0.8);
    const retestLevel = currentPrice + currentPrice * atrPct * 1.5;
    const target = currentPrice - currentPrice * atrPct * 3;
    const invalidation = nearestResistance + currentPrice * atrPct * 1;
    const risk = invalidation - currentPrice;
    const reward = currentPrice - target;

    const signals: string[] = ['ارتداد من مقاومة متوقع'];
    if (nearestResistance < currentPrice * 1.05) signals.push(`مقاومة قريبة عند ${nearestResistance.toFixed(2)}`);

    scenarios.push({
      type: 'bearish_retest',
      nameAr: 'إعادة اختبار هابط',
      descriptionAr: `ارتداد قصير إلى ${retestLevel.toFixed(2)} ثم هبوط إلى ${target.toFixed(2)}. سيناريو "بع عند المقاومة".`,
      probability: Math.max(0.05, prob),
      priceTarget: Math.round(target * 100) / 100,
      invalidationLevel: Math.round(invalidation * 100) / 100,
      keySignals: signals,
      contradictingSignals: bullishSignals > bearishSignals ? ['إشارات صاعدة أكثر'] : [],
      expectedCandles: Math.round(30 + (currentPrice - target) / (currentPrice * atrPct)),
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      confidence: Math.min(0.8, avgBearishConf * 0.7),
    });
  }

  // ── Scenario 5: Bearish Breakdown ──
  {
    const prob = Math.min(0.45, bearRatio * avgBearishConf * 1.2);
    const target = currentPrice - (currentPrice - nearestSupport) * 1.5 - currentPrice * atrPct * 2;
    const invalidation = nearestResistance + currentPrice * atrPct * 0.5;
    const risk = invalidation - currentPrice;
    const reward = currentPrice - target;

    const signals: string[] = [];
    const contradicts: string[] = [];

    if (bearishSignals > bullishSignals) signals.push(`أغلبية الإشارات هابطة (${bearishSignals}/${totalSignals})`);
    if (avgBearishConf > 0.6) signals.push(`ثقة هابطة عالية (${Math.round(avgBearishConf * 100)}%)`);

    const bearishBOS = smcData?.structureBreaks?.some(b => b.type === 'BOS' && b.direction === 'bearish');
    if (bearishBOS) signals.push('كسر هيكل هابط مؤكد');

    const bearishFVG = smcData?.fvgs?.some(f => f.type === 'bearish' && !f.filled);
    if (bearishFVG) signals.push('فجوة قيمة هابطة غير مغلّقة');

    const bearishHarmonic = harmonicPatterns?.some(h => h.direction === 'bearish' && h.confidence > 0.5);
    if (bearishHarmonic) signals.push('نمط هارمونيك هابط مكتمل');

    if (bullishSignals > bearishSignals) contradicts.push(`إشارات صاعدة أكثر (${bullishSignals})`);

    scenarios.push({
      type: 'bearish_breakout',
      nameAr: 'انهيار هابط',
      descriptionAr: `السعر يكسر الدعم عند ${nearestSupport.toFixed(2)} ويهبط إلى ${target.toFixed(2)}. مدعوم بـ${bearishSignals} إشارة هابطة.`,
      probability: Math.max(0.05, Math.min(0.45, prob)),
      priceTarget: Math.round(target * 100) / 100,
      invalidationLevel: Math.round(invalidation * 100) / 100,
      keySignals: signals,
      contradictingSignals: contradicts,
      expectedCandles: Math.round(20 + (currentPrice - target) / (currentPrice * atrPct)),
      riskRewardRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
      confidence: Math.min(0.9, avgBearishConf * (bearRatio / 0.5)),
    });
  }

  // ── Scenario 6: Bull Trap (if bearish signals are strong but price near resistance) ──
  if (priceAboveLevel(currentPrice, nearestResistance, 0.02) && bearishSignals >= bullishSignals * 0.8) {
    const target = currentPrice - currentPrice * atrPct * 4;
    const invalidation = currentPrice + currentPrice * atrPct * 1.5;

    scenarios.push({
      type: 'trap_bull',
      nameAr: 'فخ صاعد (Bull Trap)',
      descriptionAr: `السعر يخترق المقاومة ثم يرتد بقوة — فخ للمشترين. هدف ${target.toFixed(2)}.`,
      probability: Math.max(0.05, 0.15 + (bearishSignals > 0 ? 0.1 : 0)),
      priceTarget: Math.round(target * 100) / 100,
      invalidationLevel: Math.round(invalidation * 100) / 100,
      keySignals: ['السعر قرب المقاومة', 'إشارات هابطة مخفية', 'احتمال فخ شرائي'],
      contradictingSignals: ['الاختراق قد يكون حقيقي'],
      expectedCandles: 15,
      riskRewardRatio: 2.0,
      confidence: 0.4,
    });
  }

  // ── Scenario 7: Bear Trap (if bullish signals are strong but price near support) ──
  if (priceBelowLevel(currentPrice, nearestSupport, 0.02) && bullishSignals >= bearishSignals * 0.8) {
    const target = currentPrice + currentPrice * atrPct * 4;
    const invalidation = currentPrice - currentPrice * atrPct * 1.5;

    scenarios.push({
      type: 'trap_bear',
      nameAr: 'فخ هابط (Bear Trap)',
      descriptionAr: `السعر يكسر الدعم ثم يرتد بقوة — فخ للبائعين. هدف ${target.toFixed(2)}.`,
      probability: Math.max(0.05, 0.15 + (bullishSignals > 0 ? 0.1 : 0)),
      priceTarget: Math.round(target * 100) / 100,
      invalidationLevel: Math.round(invalidation * 100) / 100,
      keySignals: ['السعر قرب الدعم', 'إشارات صاعدة مخفية', 'احتمال فخ بيعي'],
      contradictingSignals: ['الكسر قد يكون حقيقي'],
      expectedCandles: 15,
      riskRewardRatio: 2.0,
      confidence: 0.4,
    });
  }

  // ── Normalize probabilities to sum to ~1.0 ──
  const totalProb = scenarios.reduce((s, sc) => s + sc.probability, 0);
  for (const sc of scenarios) {
    sc.probability = Math.round((sc.probability / totalProb) * 100) / 100;
  }

  // ── Determine tilt ──
  const bullProb = scenarios.filter(s => s.type.includes('bullish') || s.type === 'trap_bear').reduce((s, sc) => s + sc.probability, 0);
  const bearProb = scenarios.filter(s => s.type.includes('bearish') || s.type === 'trap_bull').reduce((s, sc) => s + sc.probability, 0);

  const tiltDirection: 'bullish' | 'bearish' | 'neutral' =
    bullProb > bearProb * 1.3 ? 'bullish'
    : bearProb > bullProb * 1.3 ? 'bearish'
    : 'neutral';

  const tiltStrength = Math.abs(bullProb - bearProb);

  // ── Dominant scenario ──
  const dominant = scenarios.reduce((best, sc) => sc.probability > best.probability ? sc : best, scenarios[0]);

  // ── Expected value ──
  const expectedValue = scenarios.reduce((ev, sc) => {
    const move = sc.type.includes('bullish') || sc.type === 'trap_bear'
      ? sc.priceTarget - currentPrice
      : currentPrice - sc.priceTarget;
    return ev + sc.probability * move;
  }, 0);

  // ── Key level ──
  let keyLevel = currentPrice;
  let keyLevelType: 'support' | 'resistance' | 'pivot' = 'pivot';
  if (Math.abs(currentPrice - nearestSupport) < Math.abs(currentPrice - nearestResistance)) {
    keyLevel = nearestSupport;
    keyLevelType = 'support';
  } else {
    keyLevel = nearestResistance;
    keyLevelType = 'resistance';
  }

  // ── Summary ──
  const summaryAr = `السيناريو الأرجح: ${dominant.nameAr} (${Math.round(dominant.probability * 100)}%) | الميل: ${tiltDirection === 'bullish' ? 'صاعد' : tiltDirection === 'bearish' ? 'هابط' : 'محايد'} (${Math.round(tiltStrength * 100)}%) | القيمة المتوقعة: ${expectedValue > 0 ? '+' : ''}${expectedValue.toFixed(2)}`;

  // ── Warnings ──
  const warnings: string[] = [];
  if (tiltStrength < 0.1) warnings.push('لا ميل واضح — السوق في حالة عدم يقين');
  if (scenarios.some(s => s.type.includes('trap'))) warnings.push('فخ محتمل — لا تدخل بصفقة كبيرة');
  if (regime === 'volatile') warnings.push('تقلب عالٍ — وقف الخسارة إلزامي');

  return {
    scenarios,
    dominantScenario: dominant.type,
    tiltDirection,
    tiltStrength: Math.round(tiltStrength * 100) / 100,
    expectedValue: Math.round(expectedValue * 100) / 100,
    keyLevel: Math.round(keyLevel * 100) / 100,
    keyLevelType,
    summaryAr,
    warnings,
  };
}
