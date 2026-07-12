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
 probability: number; // 0-1
 priceTarget: number;
 invalidationLevel: number;
 keySignals: string[]; // Which signals support this scenario
 contradictingSignals: string[]; // Which signals contradict this
 expectedCandles: number; // How many candles to reach target
 riskRewardRatio: number;
 confidence: number; // 0-1
}

export interface ScenarioResult {
 scenarios: Scenario[];
 dominantScenario: ScenarioType | null;
 tiltDirection: 'bullish' | 'bearish' | 'neutral';
 tiltStrength: number; // 0-1, how strong the tilt is
 expectedValue: number; // Probability-weighted expected move
 keyLevel: number; // Most important price level
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

 if (bullishSignals > bearishSignals) signals.push(` signals bullish (${bullishSignals}/${totalSignals})`);
 if (avgBullishConf > 0.6) signals.push(`confidence bullish (${Math.round(avgBullishConf * 100)}%)`);

 // Check for bullish BOS
 const bullishBOS = smcData?.structureBreaks?.some(b => b.type === 'BOS' && b.direction === 'bullish');
 if (bullishBOS) signals.push(' structure bullish certain');

 // Check for unfilled bullish FVG
 const bullishFVG = smcData?.fvgs?.some(f => f.type === 'bullish' && !f.filled);
 if (bullishFVG) signals.push(' value bullish ');

 // Check for bullish harmonic near PRZ
 const bullishHarmonic = harmonicPatterns?.some(h => h.direction === 'bullish' && h.confidence > 0.5);
 if (bullishHarmonic) signals.push('pattern bullish complete');

 if (bearishSignals > bullishSignals) contradicts.push(`signals bearish more (${bearishSignals})`);
 if (avgBearishConf > 0.6) contradicts.push('confidence bearish ');

 scenarios.push({
 type: 'bullish_breakout',
 nameAr: ' bullish',
 descriptionAr: `price resistance at ${nearestResistance.toFixed(2)} reaches ${target.toFixed(2)}. with${bullishSignals} signal bullish.`,
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

 const signals: string[] = [' who support '];
 const contradicts: string[] = [];
 if (nearestSupport > currentPrice * 0.95) signals.push(`support at ${nearestSupport.toFixed(2)}`);
 if (bearRatio > 0.4) contradicts.push(' ');

 scenarios.push({
 type: 'bullish_retest',
 nameAr: ' test bullish',
 descriptionAr: ` short to ${retestLevel.toFixed(2)} then to ${target.toFixed(2)}. scenario " at support".`,
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
 if (regime === 'ranging') signals.push('system market ranging');
 if (neutralSignals > bullishSignals && neutralSignals > bearishSignals) signals.push(' signals neutral');
 if (pocPrice && Math.abs(pocPrice - currentPrice) / currentPrice < 0.01) signals.push('price at POC');

 scenarios.push({
 type: 'sideways_range',
 nameAr: ' ranging',
 descriptionAr: `price between ${rangeBottom.toFixed(2)} ${rangeTop.toFixed(2)}. trade .`,
 probability: Math.max(0.05, Math.min(0.4, prob)),
 priceTarget: Math.round(((rangeTop + rangeBottom) / 2) * 100) / 100,
 invalidationLevel: Math.round(rangeBottom * 100) / 100,
 keySignals: signals,
 contradictingSignals: bullishSignals > bearishSignals * 2 ? ['signals bullish strong'] : bearishSignals > bullishSignals * 2 ? ['signals bearish strong'] : [],
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

 const signals: string[] = [' who resistance '];
 if (nearestResistance < currentPrice * 1.05) signals.push(`resistance at ${nearestResistance.toFixed(2)}`);

 scenarios.push({
 type: 'bearish_retest',
 nameAr: ' test bearish',
 descriptionAr: ` short to ${retestLevel.toFixed(2)} then to ${target.toFixed(2)}. scenario " at resistance".`,
 probability: Math.max(0.05, prob),
 priceTarget: Math.round(target * 100) / 100,
 invalidationLevel: Math.round(invalidation * 100) / 100,
 keySignals: signals,
 contradictingSignals: bullishSignals > bearishSignals ? ['signals bullish more'] : [],
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

 if (bearishSignals > bullishSignals) signals.push(` signals bearish (${bearishSignals}/${totalSignals})`);
 if (avgBearishConf > 0.6) signals.push(`confidence bearish (${Math.round(avgBearishConf * 100)}%)`);

 const bearishBOS = smcData?.structureBreaks?.some(b => b.type === 'BOS' && b.direction === 'bearish');
 if (bearishBOS) signals.push(' structure bearish certain');

 const bearishFVG = smcData?.fvgs?.some(f => f.type === 'bearish' && !f.filled);
 if (bearishFVG) signals.push(' value bearish ');

 const bearishHarmonic = harmonicPatterns?.some(h => h.direction === 'bearish' && h.confidence > 0.5);
 if (bearishHarmonic) signals.push('pattern bearish complete');

 if (bullishSignals > bearishSignals) contradicts.push(`signals bullish more (${bullishSignals})`);

 scenarios.push({
 type: 'bearish_breakout',
 nameAr: 'she bearish',
 descriptionAr: `price support at ${nearestSupport.toFixed(2)} to ${target.toFixed(2)}. with${bearishSignals} signal bearish.`,
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
 nameAr: ' bullish (Bull Trap)',
 descriptionAr: `price resistance then bounces withstrength — buyer. goal ${target.toFixed(2)}.`,
 probability: Math.max(0.05, 0.15 + (bearishSignals > 0 ? 0.1 : 0)),
 priceTarget: Math.round(target * 100) / 100,
 invalidationLevel: Math.round(invalidation * 100) / 100,
 keySignals: ['price near resistance', 'signals bearish in', 'possibility '],
 contradictingSignals: ['breakout will be real'],
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
 nameAr: ' bearish (Bear Trap)',
 descriptionAr: `price support then bounces withstrength — seller. goal ${target.toFixed(2)}.`,
 probability: Math.max(0.05, 0.15 + (bullishSignals > 0 ? 0.1 : 0)),
 priceTarget: Math.round(target * 100) / 100,
 invalidationLevel: Math.round(invalidation * 100) / 100,
 keySignals: ['price near support', 'signals bullish in', 'possibility '],
 contradictingSignals: ['break will be real'],
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
 const summaryAr = `most likely scenario: ${dominant.nameAr} (${Math.round(dominant.probability * 100)}%) | : ${tiltDirection === 'bullish' ? 'bullish' : tiltDirection === 'bearish' ? 'bearish' : 'neutral'} (${Math.round(tiltStrength * 100)}%) | value : ${expectedValue > 0 ? '+' : ''}${expectedValue.toFixed(2)}`;

 // ── Warnings ──
 const warnings: string[] = [];
 if (tiltStrength < 0.1) warnings.push(' clear — market in case ');
 if (scenarios.some(s => s.type.includes('trap'))) warnings.push(' probable — position large');
 if (regime === 'volatile') warnings.push(' — stop loss ');

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
