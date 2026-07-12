// ═══════════════════════════════════════════════════════════════════════
// ROUA Adaptive Intelligence Engine — Revolutionary Feature #6
//
// Self-learning engine that tracks prediction accuracy of every signal
// source and automatically adjusts weights. Over time, the system
// "learns" which engines work best in which market conditions.
//
// Key capabilities:
// - Per-source, per-regime, per-timeframe accuracy tracking
// - Automatic weight rebalancing based on recent performance
// - Decay factor: older predictions matter less than recent ones
// - Confidence calibration: maps raw confidence to calibrated confidence
// - Learning insights: Arabic descriptions of what the system learned
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

export type SignalSource =
 | 'harmonic' | 'elliott' | 'wyckoff' | 'bos' | 'choch'
 | 'orderblock' | 'fvg' | 'bayesian' | 'candlestick'
 | 'volume' | 'liquidity' | 'mtf' | 'smc-fusion';

export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'quiet';

/** A single prediction record for learning */
export interface PredictionRecord {
 id: string;
 source: SignalSource;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number; // Raw confidence from engine
 calibratedConfidence: number; // After calibration
 price: number; // Price at prediction time
 timestamp: number;
 regime: MarketRegime;
 timeframe: string;
 outcome: 'win' | 'loss' | 'breakeven' | null; // null = pending
 outcomeTimestamp: number | null;
 priceAtOutcome: number | null;
}

/** Per-source performance stats */
export interface SourcePerformance {
 source: SignalSource;
 totalPredictions: number;
 wins: number;
 losses: number;
 winRate: number;
 /** Exponentially weighted win rate (recent > old) */
 emaWinRate: number;
 /** Current adaptive weight (0.1 - 3.0) */
 adaptiveWeight: number;
 /** Per-regime win rates */
 regimeWinRates: Record<MarketRegime, { total: number; wins: number; rate: number }>;
 /** Average confidence of winning predictions */
 avgWinConfidence: number;
 /** Average confidence of losing predictions */
 avgLossConfidence: number;
 /** Confidence calibration slope (1.0 = perfectly calibrated) */
 calibrationSlope: number;
 /** Is this source currently "hot" (performing well recently)? */
 isHot: boolean;
}

/** Learning insight with Arabic description */
export interface LearningInsight {
 id: string;
 type: 'weight_change' | 'regime_shift' | 'calibration' | 'streak' | 'new_knowledge';
 source: SignalSource;
 messageAr: string;
 importance: 'info' | 'warning' | 'critical';
 timestamp: number;
}

/** Complete adaptive intelligence state */
export interface AdaptiveIntelligenceState {
 sources: SourcePerformance[];
 totalPredictions: number;
 overallWinRate: number;
 bestSource: SignalSource | null;
 worstSource: SignalSource | null;
 insights: LearningInsight[];
 regimeRecommendation: {
 bestSources: SignalSource[];
 avoidSources: SignalSource[];
 messageAr: string;
 };
}

// ── In-Memory State ────────────────────────────────────────────────

const predictions = new Map<string, PredictionRecord>();
const performances = new Map<SignalSource, SourcePerformance>();
const insights: LearningInsight[] = [];
const MAX_PREDICTIONS = 2000;
const MAX_INSIGHTS = 100;
const STORAGE_KEY = 'roua-adaptive-intelligence';

// ── Persistence ─────────────────────────────────────────────────────

function loadState(): void {
 try {
 if (typeof window === 'undefined') return;
 const stored = localStorage.getItem(STORAGE_KEY);
 if (stored) {
 const parsed = JSON.parse(stored);
 if (parsed.performances) {
 for (const [key, value] of Object.entries(parsed.performances)) {
 performances.set(key as SignalSource, value as SourcePerformance);
 }
 }
 if (parsed.insights) {
 insights.push(...parsed.insights.slice(-MAX_INSIGHTS));
 }
 }
 } catch { /* not available */ }
}

function persistState(): void {
 try {
 if (typeof window === 'undefined') return;
 const perf: Record<string, SourcePerformance> = {};
 for (const [key, value] of performances.entries()) {
 perf[key] = value;
 }
 localStorage.setItem(STORAGE_KEY, JSON.stringify({
 performances: perf,
 insights: insights.slice(-MAX_INSIGHTS),
 }));
 } catch { /* not available */ }
}

loadState();

// ── Default Performance Entry ───────────────────────────────────────

function getDefaultPerformance(source: SignalSource): SourcePerformance {
 return {
 source,
 totalPredictions: 0,
 wins: 0,
 losses: 0,
 winRate: 0.5,
 emaWinRate: 0.5,
 adaptiveWeight: 1.0,
 regimeWinRates: {
 trending: { total: 0, wins: 0, rate: 0.5 },
 ranging: { total: 0, wins: 0, rate: 0.5 },
 volatile: { total: 0, wins: 0, rate: 0.5 },
 quiet: { total: 0, wins: 0, rate: 0.5 },
 },
 avgWinConfidence: 0.6,
 avgLossConfidence: 0.5,
 calibrationSlope: 1.0,
 isHot: false,
 };
}

// ── Core: Record a Prediction ───────────────────────────────────────

/**
 * Record a new prediction from any signal source.
 * The system will track its outcome and learn from it.
 */
export function recordPrediction(opts: {
 source: SignalSource;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 price: number;
 regime: MarketRegime;
 timeframe?: string;
}): string {
 const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
 const calibrated = calibrateConfidence(opts.source, opts.confidence);

 const record: PredictionRecord = {
 id,
 source: opts.source,
 direction: opts.direction,
 confidence: opts.confidence,
 calibratedConfidence: calibrated,
 price: opts.price,
 timestamp: Date.now(),
 regime: opts.regime,
 timeframe: opts.timeframe || 'auto',
 outcome: null,
 outcomeTimestamp: null,
 priceAtOutcome: null,
 };

 predictions.set(id, record);
 if (predictions.size > MAX_PREDICTIONS) {
 const oldest = Array.from(predictions.keys())[0];
 if (oldest) predictions.delete(oldest);
 }

 // Update source performance
 let perf = performances.get(opts.source);
 if (!perf) {
 perf = getDefaultPerformance(opts.source);
 performances.set(opts.source, perf);
 }

 perf.totalPredictions++;

 // Track regime data
 const regimeData = perf.regimeWinRates[opts.regime];
 if (regimeData) {
 regimeData.total++;
 }

 persistState();
 return id;
}

// ── Core: Resolve a Prediction ──────────────────────────────────────

/**
 * Resolve a pending prediction with the actual outcome.
 * This is how the system LEARNS — by comparing predictions with reality.
 */
export function resolvePrediction(
 predictionId: string,
 currentPrice: number,
): void {
 const record = predictions.get(predictionId);
 if (!record || record.outcome !== null) return;

 const priceChange = (currentPrice - record.price) / record.price;
 const THRESHOLD = 0.003; // 0.3% move confirms direction

 let outcome: 'win' | 'loss' | 'breakeven';
 if (Math.abs(priceChange) < THRESHOLD * 0.5) {
 outcome = 'breakeven';
 } else if (record.direction === 'bullish' && priceChange > THRESHOLD) {
 outcome = 'win';
 } else if (record.direction === 'bearish' && priceChange < -THRESHOLD) {
 outcome = 'win';
 } else if (record.direction === 'neutral' && Math.abs(priceChange) < THRESHOLD) {
 outcome = 'win';
 } else {
 outcome = 'loss';
 }

 record.outcome = outcome;
 record.outcomeTimestamp = Date.now();
 record.priceAtOutcome = currentPrice;

 // Update source performance
 const perf = performances.get(record.source);
 if (perf) {
 const prevWinRate = perf.winRate;

 if (outcome === 'win') {
 perf.wins++;
 perf.avgWinConfidence = (perf.avgWinConfidence * (perf.wins - 1) + record.confidence) / perf.wins;
 } else if (outcome === 'loss') {
 perf.losses++;
 perf.avgLossConfidence = (perf.avgLossConfidence * (perf.losses - 1) + record.confidence) / perf.losses;
 }

 const resolved = perf.wins + perf.losses;
 perf.winRate = resolved > 0 ? perf.wins / resolved : 0.5;

 // EMA update (recent results matter more)
 const alpha = 0.15;
 perf.emaWinRate = alpha * (outcome === 'win' ? 1 : 0) + (1 - alpha) * perf.emaWinRate;

 // Update regime data
 const regimeData = perf.regimeWinRates[record.regime];
 if (regimeData && outcome !== 'breakeven') {
 if (outcome === 'win') regimeData.wins++;
 regimeData.rate = regimeData.total > 0 ? regimeData.wins / regimeData.total : 0.5;
 }

 // Adjust adaptive weight
 const oldWeight = perf.adaptiveWeight;
 perf.adaptiveWeight = computeAdaptiveWeight(perf);

 // Detect weight change insight
 if (Math.abs(perf.adaptiveWeight - oldWeight) > 0.15) {
 const direction = perf.adaptiveWeight > oldWeight ? '' : '';
 insights.push({
 id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
 type: 'weight_change',
 source: record.source,
 messageAr: `${direction} ${sourceNameAr(record.source)} to ${perf.adaptiveWeight.toFixed(2)} (with win: ${Math.round(perf.emaWinRate * 100)}%)`,
 importance: perf.emaWinRate < 0.3 ? 'critical' : perf.emaWinRate < 0.4 ? 'warning' : 'info',
 timestamp: Date.now(),
 });
 }

 // Detect streak insight
 const recentOutcomes = getRecentOutcomes(record.source, 10);
 const winStreak = recentOutcomes.filter(o => o === 'win').length;
 const lossStreak = recentOutcomes.filter(o => o === 'loss').length;

 if (winStreak >= 7) {
 perf.isHot = true;
 insights.push({
 id: `insight_${Date.now()}_streak`,
 type: 'streak',
 source: record.source,
 messageAr: `🔥 ${sourceNameAr(record.source)} in (${winStreak}/${recentOutcomes.length})! howauto-increased`,
 importance: 'info',
 timestamp: Date.now(),
 });
 } else if (lossStreak >= 7) {
 perf.isHot = false;
 insights.push({
 id: `insight_${Date.now()}_streak`,
 type: 'streak',
 source: record.source,
 messageAr: `⚠️ ${sourceNameAr(record.source)} in (${lossStreak}/${recentOutcomes.length})! howauto-reduced`,
 importance: 'critical',
 timestamp: Date.now(),
 });
 } else {
 perf.isHot = winStreak >= 6;
 }

 // Update calibration slope
 if (perf.wins > 5 && perf.losses > 3) {
 const confDiff = perf.avgWinConfidence - perf.avgLossConfidence;
 perf.calibrationSlope = Math.max(0.5, Math.min(2.0, 1.0 + confDiff * 2));
 }
 }

 // Trim insights
 while (insights.length > MAX_INSIGHTS) {
 insights.shift();
 }

 persistState();
}

// ── Auto-Resolve All Pending Predictions ────────────────────────────

/**
 * Automatically resolve all pending predictions that are old enough
 * (older than VERIFY_DELAY) by checking current price movement.
 */
export function autoResolvePredictions(currentPrice: number): number {
 const VERIFY_DELAY = 300000; // 5 minutes
 const now = Date.now();
 let resolved = 0;

 for (const record of predictions.values()) {
 if (record.outcome !== null) continue;
 if (now - record.timestamp < VERIFY_DELAY) continue;

 resolvePrediction(record.id, currentPrice);
 resolved++;
 }

 return resolved;
}

// ── Adaptive Weight Computation ─────────────────────────────────────

/**
 * Compute the adaptive weight for a signal source based on its performance.
 * Weight range: 0.1 to 3.0
 * - Win rate > 60%: weight boosted
 * - Win rate < 40%: weight reduced
 * - EMA win rate preferred over raw win rate (more responsive)
 */
function computeAdaptiveWeight(perf: SourcePerformance): number {
 const resolved = perf.wins + perf.losses;
 if (resolved < 3) return 1.0; // Not enough data

 const ema = perf.emaWinRate;
 let weight = 1.0;

 // Base adjustment from EMA win rate
 if (ema > 0.6) {
 weight += (ema - 0.6) * 3; // Up to +1.2 at 100% win rate
 } else if (ema < 0.4) {
 weight -= (0.4 - ema) * 3; // Down to -0.9 at 10% win rate
 }

 // Calibration bonus: well-calibrated sources get a small boost
 if (perf.calibrationSlope > 0.8 && perf.calibrationSlope < 1.3) {
 weight += 0.1;
 }

 // Hot streak bonus
 if (perf.isHot) {
 weight += 0.2;
 }

 return Math.max(0.1, Math.min(3.0, Math.round(weight * 100) / 100));
}

// ── Confidence Calibration ──────────────────────────────────────────

/**
 * Calibrate a raw confidence value based on the source's historical
 * accuracy. If a source's wins have higher confidence than its losses,
 * the source is well-calibrated. Otherwise, we shrink the confidence
 * toward 0.5 (neutral).
 */
export function calibrateConfidence(source: SignalSource, rawConfidence: number): number {
 const perf = performances.get(source);
 if (!perf || perf.totalPredictions < 5) return rawConfidence;

 const slope = perf.calibrationSlope;
 // Apply calibration: move confidence away from 0.5 based on slope
 const calibrated = 0.5 + (rawConfidence - 0.5) * slope;
 return Math.max(0.1, Math.min(0.95, calibrated));
}

// ── Helper: Recent Outcomes ─────────────────────────────────────────

function getRecentOutcomes(source: SignalSource, count: number): Array<'win' | 'loss' | 'breakeven'> {
 const sourcePredictions = Array.from(predictions.values())
 .filter(p => p.source === source && p.outcome !== null)
 .sort((a, b) => (b.outcomeTimestamp || 0) - (a.outcomeTimestamp || 0))
 .slice(0, count);
 return sourcePredictions.map(p => p.outcome as 'win' | 'loss' | 'breakeven');
}

// ── Source Arabic Names ─────────────────────────────────────────────

function sourceNameAr(source: SignalSource): string {
 const names: Record<SignalSource, string> = {
 harmonic: 'has',
 elliott: '',
 wyckoff: '',
 bos: ' framework',
 choch: ' ',
 orderblock: 'but or',
 fvg: ' value',
 bayesian: '',
 candlestick: '',
 volume: 'size',
 liquidity: '',
 mtf: 'multi-timeframewhat',
 'smc-fusion': ' SMC',
 };
 return names[source] || source;
}

// ── Get Full State ──────────────────────────────────────────────────

/**
 * Get the complete adaptive intelligence state for the UI.
 */
export function getAdaptiveIntelligenceState(regime: MarketRegime): AdaptiveIntelligenceState {
 const sources = Array.from(performances.values());

 // Sort by EMA win rate
 sources.sort((a, b) => b.emaWinRate - a.emaWinRate);

 const totalWins = sources.reduce((s, p) => s + p.wins, 0);
 const totalLosses = sources.reduce((s, p) => s + p.losses, 0);
 const totalResolved = totalWins + totalLosses;

 const bestSource = sources.length > 0 ? sources[0].source : null;
 const worstSource = sources.length > 0 ? sources[sources.length - 1].source : null;

 // Regime-specific recommendations
 const regimeRanking = sources
 .map(p => ({ source: p.source, rate: p.regimeWinRates[regime]?.rate ?? 0.5, total: p.regimeWinRates[regime]?.total ?? 0 }))
 .filter(s => s.total >= 2) // Need at least 2 predictions in this regime
 .sort((a, b) => b.rate - a.rate);

 const bestSources = regimeRanking.slice(0, 3).map(s => s.source);
 const avoidSources = regimeRanking.filter(s => s.rate < 0.35).map(s => s.source);

 let messageAr = '';
 if (bestSources.length > 0) {
 messageAr = `in system market "${regimeNameAr(regime)}", sources: ${bestSources.map(s => sourceNameAr(s)).join(', ')}`;
 } else {
 messageAr = `no data in system market "${regimeNameAr(regime)}" — in trading with data`;
 }
 if (avoidSources.length > 0) {
 messageAr += ` | : ${avoidSources.map(s => sourceNameAr(s)).join(', ')}`;
 }

 return {
 sources,
 totalPredictions: sources.reduce((s, p) => s + p.totalPredictions, 0),
 overallWinRate: totalResolved > 0 ? totalWins / totalResolved : 0,
 bestSource,
 worstSource,
 insights: insights.slice(-20), // Last 20 insights
 regimeRecommendation: {
 bestSources,
 avoidSources,
 messageAr,
 },
 };
}

function regimeNameAr(regime: MarketRegime): string {
 const names: Record<MarketRegime, string> = {
 trending: 'direction',
 ranging: 'ranging',
 volatile: 'volatile',
 quiet: 'calm',
 };
 return names[regime] || regime;
}

// ── Get Source Weight ───────────────────────────────────────────────

/**
 * Get the current adaptive weight for a signal source.
 * Used by other engines to weight their signals.
 */
export function getSourceWeight(source: SignalSource): number {
 const perf = performances.get(source);
 return perf?.adaptiveWeight ?? 1.0;
}

/**
 * Get all source weights as a map.
 */
export function getAllSourceWeights(): Record<string, number> {
 const weights: Record<string, number> = {};
 for (const [key, perf] of performances.entries()) {
 weights[key] = perf.adaptiveWeight;
 }
 return weights;
}

// ── Batch Record from Analysis Results ──────────────────────────────

/**
 * Record multiple predictions from a single analysis run.
 * Called once per analysis cycle to track all detected signals.
 */
export function recordAnalysisPredictions(opts: {
 signals: Array<{
 source: SignalSource;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 price: number;
 }>;
 regime: MarketRegime;
 timeframe: string;
}): string[] {
 return opts.signals.map(signal =>
 recordPrediction({
 source: signal.source,
 direction: signal.direction,
 confidence: signal.confidence,
 price: signal.price,
 regime: opts.regime,
 timeframe: opts.timeframe,
 })
 );
}

// ── Reset (for testing) ─────────────────────────────────────────────

export function resetAdaptiveIntelligence(): void {
 predictions.clear();
 performances.clear();
 insights.length = 0;
 try {
 if (typeof window !== 'undefined') {
 localStorage.removeItem(STORAGE_KEY);
 }
 } catch { /* not available */ }
}
