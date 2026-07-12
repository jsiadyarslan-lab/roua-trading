// ═══════════════════════════════════════════════════════════
// Elliott + SMC Fusion — Real Multi-Layer Confluence Engine
// 4-Layer Analysis:
// Layer 1: Directional agreement (are methods aligned?)
// Layer 2: Spatial confluence (do key levels overlap?)
// Layer 3: Volume confirmation (does volume support?)
// Layer 4: Pattern strength weighting (dynamic weights)
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface ElliottSMCFusion {
 direction: 'bullish' | 'bearish' | 'neutral';
 confluenceScore: number;
 interpretationAr: string;
 confluenceBreakdown: ConfluenceFactor[];
 timestamp: number;
 /** Layer scores for transparency */
 layerScores: {
 directionalAgreement: number;
 spatialConfluence: number;
 volumeConfirmation: number;
 patternStrength: number;
 };
}

export interface ConfluenceFactor {
 factorAr: string;
 score: number;
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Dynamic weight based on signal strength (not fixed) */
 weight: number;
 /** Spatial proximity to current price (0-1, closer = higher) */
 proximity?: number;
}

/** Calculate proximity of a price level to current price (0-1) */
function calcProximity(level: number, currentPrice: number): number {
 if (!currentPrice || !level) return 0.5;
 const distance = Math.abs(level - currentPrice) / currentPrice;
 // Within 0.5% → 1.0, within 2% → 0.7, within 5% → 0.3, beyond 10% → 0
 if (distance < 0.005) return 1.0;
 if (distance < 0.02) return 0.7 + (0.02 - distance) / 0.015 * 0.3;
 if (distance < 0.05) return 0.3 + (0.05 - distance) / 0.03 * 0.4;
 return Math.max(0, 0.3 - (distance - 0.05) / 0.05 * 0.3);
}

/** Check if two price levels are spatially close (within ATR-based tolerance) */
function levelsOverlap(level1: number, level2: number, currentPrice: number): boolean {
 if (!level1 || !level2 || !currentPrice) return false;
 const tolerance = currentPrice * 0.01; // 1% tolerance
 return Math.abs(level1 - level2) <= tolerance;
}

export function detectElliottSMCFusion(opts: {
 candles: CandleData[];
 elliott: any;
 orderBlocks: any[];
 fvgs: any[];
 structureBreaks: any[];
 wyckoff?: any;
 volumeProfile?: any;
 currentPrice?: number;
}): ElliottSMCFusion {
 const { candles, elliott, orderBlocks, fvgs, structureBreaks, wyckoff, volumeProfile } = opts;
 const currentPrice = opts.currentPrice || (candles?.length ? candles[candles.length - 1].close : 0);

 const breakdown: ConfluenceFactor[] = [];
 let layer1_score = 0; // Directional agreement
 let layer2_score = 0; // Spatial confluence
 let layer3_score = 0; // Volume confirmation
 let layer4_score = 0; // Pattern strength

 const dirSignals: { direction: 'bullish' | 'bearish' | 'neutral'; strength: number; level?: number }[] = [];

 // ════════════════════════════════════════════════════════
 // LAYER 1: Directional Agreement
 // Are all methods pointing the same way?
 // ════════════════════════════════════════════════════════

 // Elliott Wave direction & strength
 if (elliott?.waveLabel) {
 const isImpulse = elliott.waveLabel.startsWith('1') || elliott.waveLabel.startsWith('3') || elliott.waveLabel.startsWith('5');
 const elliottDir: 'bullish' | 'bearish' = isImpulse ? 'bullish' : 'bearish';
 const elliottConf = elliott.confidence || 0.5;
 const elliottWeight = 0.5 + elliottConf * 0.5; // Dynamic: 0.5-1.0 based on confidence

 breakdown.push({
 factorAr: 'wave ',
 score: Math.round(elliottConf * 100),
 direction: elliottDir,
 weight: elliottWeight,
 proximity: elliott.keyLevel ? calcProximity(elliott.keyLevel, currentPrice) : undefined,
 });
 dirSignals.push({ direction: elliottDir, strength: elliottConf, level: elliott.keyLevel });
 }

 // Order Block direction & strength
 if (orderBlocks?.length) {
 const lastOB = orderBlocks[orderBlocks.length - 1];
 const obDir: 'bullish' | 'bearish' = lastOB?.type === 'bullish' ? 'bullish' : 'bearish';
 const obProximity = lastOB ? calcProximity(lastOB.high || lastOB.low || lastOB.price || 0, currentPrice) : 0.5;
 const obWeight = 0.4 + obProximity * 0.5; // Closer OBs are more relevant

 breakdown.push({
 factorAr: 'but or',
 score: Math.round(obProximity * 100),
 direction: obDir,
 weight: obWeight,
 proximity: obProximity,
 });
 dirSignals.push({
 direction: obDir,
 strength: obProximity,
 level: lastOB?.high || lastOB?.low || lastOB?.price,
 });
 }

 // Structure Breaks (BOS/CHoCH) — strongest directional signal
 if (structureBreaks?.length) {
 const lastBreak = structureBreaks[structureBreaks.length - 1];
 const brDir: 'bullish' | 'bearish' = lastBreak?.type?.includes('bullish') || lastBreak?.direction === 'bullish' ? 'bullish' : 'bearish';
 const brProximity = lastBreak ? calcProximity(lastBreak.price || 0, currentPrice) : 0.5;
 const brWeight = 0.6 + brProximity * 0.4; // BOS is a strong signal

 breakdown.push({
 factorAr: ' framework',
 score: Math.round(brProximity * 100),
 direction: brDir,
 weight: brWeight,
 proximity: brProximity,
 });
 dirSignals.push({ direction: brDir, strength: 0.7 + brProximity * 0.3, level: lastBreak?.price });
 }

 // FVG — NOW WITH ACTUAL DIRECTION
 if (fvgs?.length) {
 for (const fvg of fvgs.slice(-2)) {
 if (fvg.filled) continue;
 const fvgDir: 'bullish' | 'bearish' = fvg.type === 'bullish' ? 'bullish' : 'bearish';
 const fvgProximity = calcProximity((fvg.high + fvg.low) / 2, currentPrice);
 const fvgWeight = 0.3 + fvgProximity * 0.4;

 breakdown.push({
 factorAr: ' value ',
 score: Math.round(fvgProximity * 100),
 direction: fvgDir,
 weight: fvgWeight,
 proximity: fvgProximity,
 });
 dirSignals.push({
 direction: fvgDir,
 strength: 0.4 + fvgProximity * 0.3,
 level: (fvg.high + fvg.low) / 2,
 });
 }
 }

 // Wyckoff — NOW WITH ACTUAL DIRECTION
 if (wyckoff?.phase) {
 const phase = wyckoff.phase;
 const wyckDir: 'bullish' | 'bearish' = (phase === 'Accumulation' || phase === 'Markup') ? 'bullish' : 'bearish';
 const wyckConf = wyckoff.confidence || (phase === 'Markup' || phase === 'Markdown' ? 0.6 : 0.4);
 const wyckWeight = 0.3 + wyckConf * 0.4;

 breakdown.push({
 factorAr: 'phase ',
 score: Math.round(wyckConf * 100),
 direction: wyckDir,
 weight: wyckWeight,
 });
 dirSignals.push({ direction: wyckDir, strength: wyckConf, level: wyckoff.keyLevel });
 }

 // Calculate Layer 1: Directional agreement
 const bullishStrength = dirSignals.filter(s => s.direction === 'bullish').reduce((sum, s) => sum + s.strength, 0);
 const bearishStrength = dirSignals.filter(s => s.direction === 'bearish').reduce((sum, s) => sum + s.strength, 0);
 const totalDirStrength = bullishStrength + bearishStrength;

 if (totalDirStrength > 0) {
 const dominantStrength = Math.max(bullishStrength, bearishStrength);
 layer1_score = dominantStrength / totalDirStrength; // 0.5 (split) to 1.0 (unanimous)
 }

 // ════════════════════════════════════════════════════════
 // LAYER 2: Spatial Confluence
 // Do key levels from different methods overlap?
 // ════════════════════════════════════════════════════════

 const bullishLevels = dirSignals.filter(s => s.direction === 'bullish' && s.level).map(s => s.level!);
 const bearishLevels = dirSignals.filter(s => s.direction === 'bearish' && s.level).map(s => s.level!);
 let overlapCount = 0;

 // Check bullish levels overlap
 for (let i = 0; i < bullishLevels.length; i++) {
 for (let j = i + 1; j < bullishLevels.length; j++) {
 if (levelsOverlap(bullishLevels[i], bullishLevels[j], currentPrice)) overlapCount++;
 }
 }
 // Check bearish levels overlap
 for (let i = 0; i < bearishLevels.length; i++) {
 for (let j = i + 1; j < bearishLevels.length; j++) {
 if (levelsOverlap(bearishLevels[i], bearishLevels[j], currentPrice)) overlapCount++;
 }
 }

 const totalPairs = (bullishLevels.length * (bullishLevels.length - 1) / 2) +
 (bearishLevels.length * (bearishLevels.length - 1) / 2);
 layer2_score = totalPairs > 0 ? Math.min(1.0, overlapCount / totalPairs + 0.3) : 0.3;

 // ════════════════════════════════════════════════════════
 // LAYER 3: Volume Confirmation
 // Does volume support the direction?
 // ════════════════════════════════════════════════════════

 if (candles?.length >= 20 && volumeProfile?.poc) {
 const recentCandles = candles.slice(-20);
 const avgVolume = recentCandles.reduce((s, c) => s + c.volume, 0) / recentCandles.length;
 const lastVolume = candles[candles.length - 1].volume;

 // Higher volume on directional moves = confirmation
 const volumeRatio = avgVolume > 0 ? lastVolume / avgVolume : 1;

 // Check if POC supports the direction
 const pocDirection = volumeProfile.poc < currentPrice ? 'bullish' : 'bearish';
 const dominantDir = bullishStrength > bearishStrength ? 'bullish' : 'bearish';
 const pocAligns = pocDirection === dominantDir;

 layer3_score = pocAligns ? Math.min(1.0, 0.5 + volumeRatio * 0.2) : 0.3;
 } else {
 layer3_score = 0.4; // No data — slightly below neutral
 }

 // ════════════════════════════════════════════════════════
 // LAYER 4: Pattern Strength
 // How strong are the individual signals?
 // ════════════════════════════════════════════════════════

 const avgSignalConfidence = dirSignals.length > 0
 ? dirSignals.reduce((s, sig) => s + sig.strength, 0) / dirSignals.length
 : 0.3;
 const signalCount = dirSignals.length;
 const countBonus = Math.min(0.2, signalCount * 0.05); // More signals = more confidence
 layer4_score = Math.min(1.0, avgSignalConfidence + countBonus);

 // ════════════════════════════════════════════════════════
 // Combine all layers
 // ════════════════════════════════════════════════════════

 const layerWeights = { l1: 0.35, l2: 0.25, l3: 0.15, l4: 0.25 };
 const confluenceScore = Math.round(
 (layer1_score * layerWeights.l1 +
 layer2_score * layerWeights.l2 +
 layer3_score * layerWeights.l3 +
 layer4_score * layerWeights.l4) * 100
 );

 // Enhanced direction detection with confidence-weighted strength
 const bullishWeighted = dirSignals
 .filter(s => s.direction === 'bullish')
 .reduce((sum, s) => sum + s.strength * (s.level ? calcProximity(s.level, currentPrice) : 0.7), 0);
 const bearishWeighted = dirSignals
 .filter(s => s.direction === 'bearish')
 .reduce((sum, s) => sum + s.strength * (s.level ? calcProximity(s.level, currentPrice) : 0.7), 0);
 const totalWeighted = bullishWeighted + bearishWeighted;

 let direction: 'bullish' | 'bearish' | 'neutral';
 if (totalWeighted > 0) {
 const bullPct = bullishWeighted / totalWeighted;
 if (bullPct > 0.6) direction = 'bullish';
 else if (bullPct < 0.4) direction = 'bearish';
 else direction = 'neutral';
 } else {
 direction = 'neutral';
 }

 // Generate interpretation based on actual analysis
 const agreeingCount = direction === 'bullish'
 ? dirSignals.filter(s => s.direction === 'bullish').length
 : dirSignals.filter(s => s.direction === 'bearish').length;
 const totalSignals = dirSignals.length;

 let interpretationAr: string;
 if (confluenceScore >= 70 && direction !== 'neutral') {
 interpretationAr = `confluence strong ${direction === 'bullish' ? '' : ''} — ${agreeingCount} who ${totalSignals} signals ( confluence: ${confluenceScore}%)`;
 } else if (confluenceScore >= 50 && direction !== 'neutral') {
 interpretationAr = `confluence ${direction === 'bullish' ? '' : ''} center — some signals ( confluence: ${confluenceScore}%)`;
 } else {
 interpretationAr = ` confluence clear — signals or weak ( confluence: ${confluenceScore}%)`;
 }

 return {
 direction,
 confluenceScore,
 interpretationAr,
 confluenceBreakdown: breakdown,
 timestamp: Date.now(),
 layerScores: {
 directionalAgreement: Math.round(layer1_score * 100),
 spatialConfluence: Math.round(layer2_score * 100),
 volumeConfirmation: Math.round(layer3_score * 100),
 patternStrength: Math.round(layer4_score * 100),
 },
 };
}
