// ═══════════════════════════════════════════════════════════════════════
// ROUA Smart Confluence Zones — Revolutionary Feature #2
//
// Identifies zones where MULTIPLE analysis engines agree on the same
// price level. For example, if an Order Block, a Fibonacci 0.618
// retracement, and a Wyckoff accumulation spring all coincide at
// the same price, that zone is a high-probability confluence zone.
//
// The key innovation: Instead of showing individual signals scattered
// across the chart, we CLUSTER them into zones and score each zone
// by how many independent signals agree. This makes the chart much
// cleaner and the signals much more actionable.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

export interface ConfluenceZone {
 /** Zone ID */
 id: string;
 /** Price level (center of zone) */
 price: number;
 /** Zone upper boundary */
 high: number;
 /** Zone lower boundary */
 low: number;
 /** Direction of confluence */
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Confluence score 0-100 (how many signals agree) */
 score: number;
 /** Number of independent signals agreeing */
 signalCount: number;
 /** Which signals are in this zone */
 signals: ConfluenceSignal[];
 /** Zone strength label */
 strength: 'weak' | 'moderate' | 'strong' | 'extreme';
 /** Arabic description */
 descriptionAr: string;
 /** Whether this zone is currently active (price is near) */
 isActive: boolean;
 /** Distance from current price as % */
 distancePct: number;
}

export interface ConfluenceSignal {
 /** Source engine */
 source: string;
 /** Signal type within source */
 subType: string;
 /** Direction */
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Confidence */
 confidence: number;
 /** Price level of this signal */
 price: number;
 /** Arabic label */
 labelAr: string;
}

// ── Clustering Parameters ───────────────────────────────────────────

const ZONE_TOLERANCE_PCT = 0.005; // 0.5% tolerance for clustering signals
const MIN_SIGNALS_FOR_ZONE = 2; // Need at least 2 signals to form a zone
const MAX_ZONES = 10; // Maximum zones to return

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Detect Smart Confluence Zones from all analysis results.
 * Clusters nearby signals into zones and scores each zone.
 */
export function detectConfluenceZones(opts: {
 currentPrice: number;
 smcData?: {
 orderBlocks?: Array<{
 type: 'bullish' | 'bearish';
 strength: number;
 price: number;
 high?: number;
 low?: number;
 broken?: boolean;
 }>;
 fvgs?: Array<{
 type: 'bullish' | 'bearish';
 filled: boolean;
 midPrice: number;
 high?: number;
 low?: number;
 }>;
 structureBreaks?: Array<{
 type: 'BOS' | 'CHoCH';
 direction: 'bullish' | 'bearish';
 price: number;
 }>;
 };
 harmonicPatterns?: Array<{
 type: string;
 direction: 'bullish' | 'bearish';
 confidence: number;
 przLevel: number;
 }>;
 srLevels?: Array<{
 price: number;
 type: 'support' | 'resistance';
 strength: number;
 }>;
 wyckoffResult?: {
 currentPhase: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 };
 elliottResult?: {
 dominantDirection: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 keyLevel?: number;
 };
 volumeProfile?: {
 poc: number;
 vah: number;
 val: number;
 };
 fibonacciLevels?: Array<{
 ratio: number;
 price: number;
 direction: 'bullish' | 'bearish';
 }>;
 trendLines?: Array<{
 direction: 'bullish' | 'bearish';
 price: number;
 }>;
}): ConfluenceZone[] {
 const { currentPrice } = opts;
 const allSignals: ConfluenceSignal[] = [];

 // ── Extract signals from all sources ──

 // SMC Order Blocks
 for (const ob of (opts.smcData?.orderBlocks || [])) {
 if (ob.broken) continue;
 const obPrice = ob.price || ((ob.high || 0) + (ob.low || 0)) / 2 || currentPrice;
 allSignals.push({
 source: 'smc',
 subType: 'orderblock',
 direction: ob.type,
 confidence: ob.strength || 0.6,
 price: obPrice,
 labelAr: ob.type === 'bullish' ? 'but or bullish' : 'but or bearish',
 });
 }

 // SMC FVGs
 for (const fvg of (opts.smcData?.fvgs || [])) {
 if (fvg.filled) continue;
 allSignals.push({
 source: 'smc',
 subType: 'fvg',
 direction: fvg.type,
 confidence: 0.55,
 price: fvg.midPrice || ((fvg.high || 0) + (fvg.low || 0)) / 2 || currentPrice,
 labelAr: fvg.type === 'bullish' ? ' value bullish' : ' value bearish',
 });
 }

 // SMC Structure Breaks
 for (const brk of (opts.smcData?.structureBreaks || [])) {
 allSignals.push({
 source: 'smc',
 subType: brk.type === 'BOS' ? 'bos' : 'choch',
 direction: brk.direction,
 confidence: brk.type === 'BOS' ? 0.7 : 0.65,
 price: brk.price,
 labelAr: brk.type === 'BOS'
 ? (brk.direction === 'bullish' ? ' structure bullish' : ' structure bearish')
 : (brk.direction === 'bullish' ? ' bullish' : ' bearish'),
 });
 }

 // Harmonic Patterns
 for (const hp of (opts.harmonicPatterns || [])) {
 allSignals.push({
 source: 'harmonic',
 subType: hp.type,
 direction: hp.direction,
 confidence: hp.confidence,
 price: hp.przLevel,
 labelAr: `pattern ${hp.type}`,
 });
 }

 // S/R Levels
 for (const sr of (opts.srLevels || [])) {
 allSignals.push({
 source: 'sr',
 subType: sr.type,
 direction: sr.type === 'support' ? 'bullish' : 'bearish',
 confidence: sr.strength,
 price: sr.price,
 labelAr: sr.type === 'support' ? 'support' : 'resistance',
 });
 }

 // Volume Profile POC
 if (opts.volumeProfile?.poc) {
 allSignals.push({
 source: 'volume',
 subType: 'poc',
 direction: currentPrice > opts.volumeProfile.poc ? 'bullish' : 'bearish',
 confidence: 0.5,
 price: opts.volumeProfile.poc,
 labelAr: 'point control size',
 });
 }

 // Fibonacci Levels
 for (const fib of (opts.fibonacciLevels || [])) {
 allSignals.push({
 source: 'fibonacci',
 subType: `fib_${fib.ratio}`,
 direction: fib.direction,
 confidence: 0.5,
 price: fib.price,
 labelAr: `in ${fib.ratio}`,
 });
 }

 // Trendline touches
 for (const tl of (opts.trendLines || [])) {
 allSignals.push({
 source: 'trendline',
 subType: 'touch',
 direction: tl.direction,
 confidence: 0.5,
 price: tl.price,
 labelAr: tl.direction === 'bullish' ? 'font bullish' : 'font bearish',
 });
 }

 // Elliott key level
 if (opts.elliottResult?.keyLevel) {
 allSignals.push({
 source: 'elliott',
 subType: 'wave_target',
 direction: opts.elliottResult.dominantDirection,
 confidence: opts.elliottResult.confidence || 0.5,
 price: opts.elliottResult.keyLevel,
 labelAr: 'goal ',
 });
 }

 // Wyckoff phase (add a signal near current price representing the phase)
 if (opts.wyckoffResult && opts.wyckoffResult.confidence > 0.3) {
 allSignals.push({
 source: 'wyckoff',
 subType: opts.wyckoffResult.currentPhase,
 direction: opts.wyckoffResult.direction,
 confidence: opts.wyckoffResult.confidence,
 price: currentPrice,
 labelAr: `: ${opts.wyckoffResult.currentPhase}`,
 });
 }

 // ── Cluster signals into zones ──
 const zones = clusterSignals(allSignals, currentPrice);

 // Sort by score (highest first) and return top zones
 return zones
 .sort((a, b) => b.score - a.score)
 .slice(0, MAX_ZONES);
}

/**
 * Cluster nearby signals into confluence zones.
 * Uses a simple distance-based clustering: signals within
 * ZONE_TOLERANCE_PCT of each other are grouped together.
 */
function clusterSignals(signals: ConfluenceSignal[], currentPrice: number): ConfluenceZone[] {
 if (signals.length === 0) return [];

 // Sort by price
 const sorted = [...signals].sort((a, b) => a.price - b.price);
 const zones: ConfluenceZone[] = [];
 const used = new Set<number>();

 for (let i = 0; i < sorted.length; i++) {
 if (used.has(i)) continue;

 const cluster: ConfluenceSignal[] = [sorted[i]];
 used.add(i);

 // Find all nearby signals
 for (let j = i + 1; j < sorted.length; j++) {
 if (used.has(j)) continue;
 const distPct = Math.abs(sorted[j].price - sorted[i].price) / sorted[i].price;
 if (distPct <= ZONE_TOLERANCE_PCT) {
 cluster.push(sorted[j]);
 used.add(j);
 }
 }

 // Only create a zone if we have enough signals
 if (cluster.length >= MIN_SIGNALS_FOR_ZONE) {
 const zone = createZone(cluster, currentPrice);
 zones.push(zone);
 }
 }

 return zones;
}

/**
 * Create a ConfluenceZone from a cluster of signals.
 */
function createZone(signals: ConfluenceSignal[], currentPrice: number): ConfluenceZone {
 const prices = signals.map(s => s.price);
 const centerPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
 const high = Math.max(...prices);
 const low = Math.min(...prices);

 // Determine direction: majority vote
 const bullCount = signals.filter(s => s.direction === 'bullish').length;
 const bearCount = signals.filter(s => s.direction === 'bearish').length;
 const direction = bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral';

 // Score: based on signal count, confidence, and source diversity
 const uniqueSources = new Set(signals.map(s => s.source)).size;
 const avgConfidence = signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length;
 const countScore = Math.min(40, signals.length * 10); // Max 40 points for count
 const diversityScore = Math.min(30, uniqueSources * 10); // Max 30 points for diversity
 const confidenceScore = avgConfidence * 30; // Max 30 points for confidence
 const score = Math.min(100, Math.round(countScore + diversityScore + confidenceScore));

 // Strength label
 let strength: ConfluenceZone['strength'];
 if (score >= 80) strength = 'extreme';
 else if (score >= 60) strength = 'strong';
 else if (score >= 40) strength = 'moderate';
 else strength = 'weak';

 // Is the zone active? (within 1% of current price)
 const distancePct = Math.abs(currentPrice - centerPrice) / currentPrice;
 const isActive = distancePct < 0.01;

 // Arabic description
 const dirAr = direction === 'bullish' ? 'bullish' : direction === 'bearish' ? 'bearish' : 'neutral';
 const sourceNames = [...new Set(signals.map(s => s.source))].join(' + ');
 const descriptionAr = `who confluence ${dirAr}: ${signals.length} signals who ${uniqueSources} engines (${sourceNames}) | strength: ${score}%`;

 return {
 id: `conf_${Math.round(centerPrice * 100)}_${Date.now()}`,
 price: Math.round(centerPrice * 100) / 100,
 high: Math.round(high * 100) / 100,
 low: Math.round(low * 100) / 100,
 direction,
 score,
 signalCount: signals.length,
 signals,
 strength,
 descriptionAr,
 isActive,
 distancePct: Math.round(distancePct * 10000) / 100,
 };
}
