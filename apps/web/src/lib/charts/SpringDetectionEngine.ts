// ═══════════════════════════════════════════════════════════════════════
// ROUA Spring Detection Engine — Revolutionary Feature #8
//
// Detects "springs" and "traps" — those crucial moments where price
// briefly breaks a key level then violently reverses. These are among
// the highest-probability setups in trading (Wyckoff springs, false
// breakouts, stop hunts, liquidity grabs).
//
// Key capabilities:
// - Detect springs at support/resistance levels
// - Detect stop hunts (liquidity grabs above/below key levels)
// - Combine with Wyckoff spring signals for confirmation
// - Detect "springboard" setups (coil before explosive move)
// - Arabic descriptions with specific entry/SL/TP levels
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';

// ── Types ───────────────────────────────────────────────────────────

export type SpringType = 'spring' | 'upthrust' | 'stop_hunt' | 'springboard' | 'fakeout';

export interface SpringDetection {
 type: SpringType;
 nameAr: string;
 descriptionAr: string;
 direction: 'bullish' | 'bearish';
 confidence: number; // 0-1
 /** Price level where the spring occurred */
 springLevel: number;
 /** How far price went beyond the level (the trap) */
 penetrationDepth: number;
 /** Current price (after reversal began) */
 currentPrice: number;
 /** Recommended entry price */
 entryPrice: number;
 /** Recommended stop loss */
 stopLoss: number;
 /** Recommended take profit */
 takeProfit: number;
 /** Risk:Reward ratio */
 rrRatio: number;
 /** Key level that was violated */
 violatedLevel: number;
 /** Level type */
 levelType: 'support' | 'resistance' | 'pivot';
 /** Candle index where spring occurred */
 candleIndex: number;
 /** Confirming signals from other engines */
 confirmations: string[];
 /** Time since spring (in candles) */
 ageCandles: number;
 /** Is this still actionable? */
 isActionable: boolean;
}

export interface SpringDetectionResult {
 springs: SpringDetection[];
 /** Count by type */
 counts: Record<SpringType, number>;
 /** Best current spring setup */
 bestSetup: SpringDetection | null;
 /** Overall spring signal strength (0-100) */
 signalStrength: number;
 /** Summary in Arabic */
 summaryAr: string;
}

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Detect spring/trap setups from candle data and key levels.
 * A "spring" is when price dips below support then reverses up (bullish).
 * An "upthrust" is when price spikes above resistance then reverses down (bearish).
 */
export function detectSprings(opts: {
 candles: CandleData[];
 currentPrice: number;
 /** Support levels */
 supports?: number[];
 /** Resistance levels */
 resistances?: number[];
 /** SMC order blocks near price */
 orderBlocks?: Array<{
 type: 'bullish' | 'bearish';
 price: number;
 high: number;
 low: number;
 strength: number;
 broken: boolean;
 }>;
 /** Wyckoff spring signals */
 wyckoffSprings?: Array<{
 type: string;
 direction: 'bullish' | 'bearish';
 confidence: number;
 }>;
 /** SMC structure breaks */
 structureBreaks?: Array<{
 type: string;
 direction: string;
 price: number;
 }>;
 /** Recent BOS/CHoCH for confirmation */
 recentBreaks?: Array<{
 type: string;
 direction: 'bullish' | 'bearish';
 price: number;
 }>;
}): SpringDetectionResult {
 const { candles, currentPrice, supports, resistances, orderBlocks, wyckoffSprings, structureBreaks, recentBreaks } = opts;

 const springs: SpringDetection[] = [];
 const atr = calcATR(candles, 14);
 const len = candles.length;
 if (len < 10) return emptyResult();

 const lookback = Math.min(len, 30);

 // ── Detect Springs at Support Levels ──
 const supportLevels = [...(supports || [])];
 // Also use bullish order block lows as support
 for (const ob of (orderBlocks || [])) {
 if (ob.type === 'bullish' && !ob.broken) {
 supportLevels.push(ob.low || ob.price);
 }
 }

 for (const level of supportLevels) {
 const result = detectSpringAtLevel(candles, level, 'support', atr, currentPrice, lookback, wyckoffSprings, recentBreaks);
 if (result) springs.push(result);
 }

 // ── Detect Upthrusts at Resistance Levels ──
 const resistanceLevels = [...(resistances || [])];
 for (const ob of (orderBlocks || [])) {
 if (ob.type === 'bearish' && !ob.broken) {
 resistanceLevels.push(ob.high || ob.price);
 }
 }

 for (const level of resistanceLevels) {
 const result = detectSpringAtLevel(candles, level, 'resistance', atr, currentPrice, lookback, wyckoffSprings, recentBreaks);
 if (result) springs.push(result);
 }

 // ── Detect Stop Hunts ──
 // A stop hunt is a wick that extends beyond a key level by 1-2x ATR
 // then closes back inside — designed to trigger stops before reversing.
 const recentCandles = candles.slice(-5);
 for (let i = 0; i < recentCandles.length; i++) {
 const c = recentCandles[i];
 const idx = len - 5 + i;

 // Check for bullish stop hunt (wick below support)
 for (const sup of supportLevels) {
 if (c.low < sup && c.close > sup) {
 const penetration = sup - c.low;
 if (penetration > atr * 0.3 && penetration < atr * 2) {
 const confirmations: string[] = [];
 if (wyckoffSprings?.some(s => s.direction === 'bullish')) {
 confirmations.push('six confirmed');
 }
 if (recentBreaks?.some(b => b.direction === 'bullish')) {
 confirmations.push(' structure bullish ');
 }

 const entry = c.close;
 const sl = c.low - atr * 0.3;
 const tp = entry + (entry - sl) * 2.5;
 const risk = entry - sl;
 const reward = tp - entry;

 springs.push({
 type: 'stop_hunt',
 nameAr: ' stop-loss (bullish)',
 descriptionAr: `price support ${sup.toFixed(2)} then above — stop loss. entry at ${entry.toFixed(2)}`,
 direction: 'bullish',
 confidence: 0.55 + (confirmations.length > 0 ? 0.15 : 0),
 springLevel: sup,
 penetrationDepth: penetration,
 currentPrice,
 entryPrice: Math.round(entry * 100) / 100,
 stopLoss: Math.round(sl * 100) / 100,
 takeProfit: Math.round(tp * 100) / 100,
 rrRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
 violatedLevel: sup,
 levelType: 'support',
 candleIndex: idx,
 confirmations,
 ageCandles: recentCandles.length - i - 1,
 isActionable: recentCandles.length - i - 1 < 3,
 });
 }
 }
 }

 // Check for bearish stop hunt (wick above resistance)
 for (const res of resistanceLevels) {
 if (c.high > res && c.close < res) {
 const penetration = c.high - res;
 if (penetration > atr * 0.3 && penetration < atr * 2) {
 const confirmations: string[] = [];
 if (wyckoffSprings?.some(s => s.direction === 'bearish')) {
 confirmations.push('six confirmed');
 }
 if (recentBreaks?.some(b => b.direction === 'bearish')) {
 confirmations.push(' structure bearish ');
 }

 const entry = c.close;
 const sl = c.high + atr * 0.3;
 const tp = entry - (sl - entry) * 2.5;
 const risk = sl - entry;
 const reward = entry - tp;

 springs.push({
 type: 'stop_hunt',
 nameAr: ' stop-loss (bearish)',
 descriptionAr: `price resistance ${res.toFixed(2)} then — stop loss. entry at ${entry.toFixed(2)}`,
 direction: 'bearish',
 confidence: 0.55 + (confirmations.length > 0 ? 0.15 : 0),
 springLevel: res,
 penetrationDepth: penetration,
 currentPrice,
 entryPrice: Math.round(entry * 100) / 100,
 stopLoss: Math.round(sl * 100) / 100,
 takeProfit: Math.round(tp * 100) / 100,
 rrRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
 violatedLevel: res,
 levelType: 'resistance',
 candleIndex: idx,
 confirmations,
 ageCandles: recentCandles.length - i - 1,
 isActionable: recentCandles.length - i - 1 < 3,
 });
 }
 }
 }
 }

 // ── Detect Springboard (Narrow Range → Explosive Move) ──
 const last7 = candles.slice(-7);
 if (last7.length >= 7) {
 const ranges = last7.map(c => c.high - c.low);
 const avgRange = ranges.reduce((s, r) => s + r, 0) / ranges.length;
 const lastRange = ranges[ranges.length - 1];
 const prevRange = ranges[ranges.length - 2];

 // If last 3 candles are all narrow (consolidation)
 const recent3Narrow = ranges.slice(-3).every(r => r < avgRange * 0.7);
 if (recent3Narrow) {
 const bullSignals = (structureBreaks || []).filter(b => b.direction === 'bullish').length;
 const bearSignals = (structureBreaks || []).filter(b => b.direction === 'bearish').length;
 const dir: 'bullish' | 'bearish' = bullSignals >= bearSignals ? 'bullish' : 'bearish';

 const entry = currentPrice;
 const sl = dir === 'bullish'
 ? Math.min(...last7.slice(-3).map(c => c.low)) - atr * 0.2
 : Math.max(...last7.slice(-3).map(c => c.high)) + atr * 0.2;
 const tp = dir === 'bullish'
 ? entry + (entry - sl) * 3
 : entry - (sl - entry) * 3;
 const risk = Math.abs(entry - sl);
 const reward = Math.abs(tp - entry);

 springs.push({
 type: 'springboard',
 nameAr: ' six (Springboard)',
 descriptionAr: ` (${lastRange.toFixed(2)} < center ${avgRange.toFixed(2)}) — direction ${dir === 'bullish' ? 'bullish' : 'bearish'}`,
 direction: dir,
 confidence: 0.5 + (bullSignals + bearSignals > 0 ? 0.1 : 0),
 springLevel: currentPrice,
 penetrationDepth: 0,
 currentPrice,
 entryPrice: Math.round(entry * 100) / 100,
 stopLoss: Math.round(sl * 100) / 100,
 takeProfit: Math.round(tp * 100) / 100,
 rrRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
 violatedLevel: currentPrice,
 levelType: 'pivot',
 candleIndex: len - 1,
 confirmations: bullSignals + bearSignals > 0 ? [` structure ${dir === 'bullish' ? 'bullish' : 'bearish'}`] : [],
 ageCandles: 0,
 isActionable: true,
 });
 }
 }

 // ── Compute Results ──
 const counts: Record<SpringType, number> = {
 spring: 0, upthrust: 0, stop_hunt: 0, springboard: 0, fakeout: 0,
 };
 for (const s of springs) {
 counts[s.type]++;
 }

 // Best setup: highest confidence + actionable
 const actionable = springs.filter(s => s.isActionable);
 const bestSetup = actionable.length > 0
 ? actionable.reduce((best, s) => s.confidence > best.confidence ? s : best, actionable[0])
 : null;

 const signalStrength = Math.min(100, springs.length * 15 + (bestSetup ? bestSetup.confidence * 30 : 0));

 const summaryAr = springs.length === 0
 ? 'no or currently'
 : `${springs.length} six/ | best: ${bestSetup?.nameAr || 'no'} | strength signal: ${Math.round(signalStrength)}%`;

 return { springs, counts, bestSetup, signalStrength: Math.round(signalStrength), summaryAr };
}

// ── Helper: Detect Spring at a Specific Level ──────────────────────

function detectSpringAtLevel(
 candles: CandleData[],
 level: number,
 levelType: 'support' | 'resistance',
 atr: number,
 currentPrice: number,
 lookback: number,
 wyckoffSprings?: Array<{ type: string; direction: 'bullish' | 'bearish'; confidence: number }>,
 recentBreaks?: Array<{ type: string; direction: 'bullish' | 'bearish'; price: number }>,
): SpringDetection | null {
 const len = candles.length;
 const recent = candles.slice(-lookback);

 if (levelType === 'support') {
 // Bullish spring: price goes below support then reverses up
 let springCandleIdx = -1;
 let maxPenetration = 0;

 for (let i = 0; i < recent.length; i++) {
 const c = recent[i];
 if (c.low < level) {
 const penetration = level - c.low;
 if (penetration > maxPenetration) {
 maxPenetration = penetration;
 springCandleIdx = len - lookback + i;
 }
 }
 }

 if (springCandleIdx < 0 || maxPenetration < atr * 0.2) return null;

 // Check if price recovered above the level
 const lastClose = candles[len - 1].close;
 if (lastClose < level) return null; // Still below, no spring yet

 const confirmations: string[] = [];
 if (wyckoffSprings?.some(s => s.direction === 'bullish')) {
 confirmations.push('six confirmed');
 }
 if (recentBreaks?.some(b => b.direction === 'bullish' && b.price > level)) {
 confirmations.push(' structure bullish after six');
 }

 // Volume on spring candle (if available) — higher volume = more conviction
 const springCandle = candles[springCandleIdx];
 if (springCandle.volume && springCandle.volume > 0) {
 const avgVol = recent.reduce((s, c) => s + (c.volume || 0), 0) / recent.length;
 if (springCandle.volume > avgVol * 1.5) {
 confirmations.push('size trade at six');
 }
 }

 const entry = lastClose;
 const sl = level - atr * 0.5;
 const tp = entry + (entry - sl) * 2.5;
 const risk = entry - sl;
 const reward = tp - entry;
 const age = len - 1 - springCandleIdx;

 const confidence = Math.min(0.9,
 0.4
 + (maxPenetration > atr * 0.5 ? 0.1 : 0)
 + (confirmations.length * 0.1)
 + (age < 3 ? 0.1 : 0)
 );

 return {
 type: 'spring',
 nameAr: 'six bullish (Spring)',
 descriptionAr: `price support ${level.toFixed(2)} ${maxPenetration.toFixed(2)} then — six bullish classic`,
 direction: 'bullish',
 confidence,
 springLevel: level,
 penetrationDepth: maxPenetration,
 currentPrice,
 entryPrice: Math.round(entry * 100) / 100,
 stopLoss: Math.round(sl * 100) / 100,
 takeProfit: Math.round(tp * 100) / 100,
 rrRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
 violatedLevel: level,
 levelType: 'support',
 candleIndex: springCandleIdx,
 confirmations,
 ageCandles: age,
 isActionable: age < 5 && lastClose > level,
 };
 } else {
 // Bearish upthrust: price goes above resistance then reverses down
 let thrustCandleIdx = -1;
 let maxPenetration = 0;

 for (let i = 0; i < recent.length; i++) {
 const c = recent[i];
 if (c.high > level) {
 const penetration = c.high - level;
 if (penetration > maxPenetration) {
 maxPenetration = penetration;
 thrustCandleIdx = len - lookback + i;
 }
 }
 }

 if (thrustCandleIdx < 0 || maxPenetration < atr * 0.2) return null;

 const lastClose = candles[len - 1].close;
 if (lastClose > level) return null; // Still above, no upthrust yet

 const confirmations: string[] = [];
 if (wyckoffSprings?.some(s => s.direction === 'bearish')) {
 confirmations.push('six confirmed');
 }
 if (recentBreaks?.some(b => b.direction === 'bearish' && b.price < level)) {
 confirmations.push(' structure bearish after six');
 }

 const entry = lastClose;
 const sl = level + atr * 0.5;
 const tp = entry - (sl - entry) * 2.5;
 const risk = sl - entry;
 const reward = entry - tp;
 const age = len - 1 - thrustCandleIdx;

 const confidence = Math.min(0.9,
 0.4
 + (maxPenetration > atr * 0.5 ? 0.1 : 0)
 + (confirmations.length * 0.1)
 + (age < 3 ? 0.1 : 0)
 );

 return {
 type: 'upthrust',
 nameAr: 'six bearish (Upthrust)',
 descriptionAr: `price resistance ${level.toFixed(2)} ${maxPenetration.toFixed(2)} then — six bearish classic`,
 direction: 'bearish',
 confidence,
 springLevel: level,
 penetrationDepth: maxPenetration,
 currentPrice,
 entryPrice: Math.round(entry * 100) / 100,
 stopLoss: Math.round(sl * 100) / 100,
 takeProfit: Math.round(tp * 100) / 100,
 rrRatio: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
 violatedLevel: level,
 levelType: 'resistance',
 candleIndex: thrustCandleIdx,
 confirmations,
 ageCandles: age,
 isActionable: age < 5 && lastClose < level,
 };
 }
}

// ── Empty Result ────────────────────────────────────────────────────

function emptyResult(): SpringDetectionResult {
 return {
 springs: [],
 counts: { spring: 0, upthrust: 0, stop_hunt: 0, springboard: 0, fakeout: 0 },
 bestSetup: null,
 signalStrength: 0,
 summaryAr: 'no or currently',
 };
}
