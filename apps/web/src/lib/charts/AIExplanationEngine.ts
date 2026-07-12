// ═══════════════════════════════════════════════════════════════════════
// ROUA AI Explanation Engine — Revolutionary Feature #3
//
// When a trader clicks "Why?" on any signal, this engine generates
// a detailed Arabic explanation of WHY that signal was triggered,
// WHAT data supports it, and HOW confident we should be.
//
// This transforms the "black box" feeling into transparent, educational
// analysis that helps traders learn and make better decisions.
// ═══════════════════════════════════════════════════════════════════════

// ── Types ───────────────────────────────────────────────────────────

export interface SignalExplanation {
 /** The signal being explained */
 signal: {
 source: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 price: number;
 };
 /** Main explanation in Arabic */
 explanationAr: string;
 /** Key factors that led to this signal */
 factors: ExplanationFactor[];
 /** What would invalidate this signal */
 invalidationAr: string;
 /** What confirms this signal */
 confirmationAr: string;
 /** Related signals that support/contradict */
 relatedSignals: Array<{
 source: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 agrees: boolean;
 labelAr: string;
 }>;
 /** Historical accuracy of this signal type */
 historicalWinRate: number | null;
 /** Market regime when signal was generated */
 regime: string;
 /** Risk level of trading this signal */
 riskLevel: 'low' | 'medium' | 'high';
}

export interface ExplanationFactor {
 /** Factor name */
 name: string;
 /** Factor name in Arabic */
 nameAr: string;
 /** How this factor contributed */
 contributionAr: string;
 /** Weight of this factor (0-1) */
 weight: number;
 /** Is this factor supporting or contradicting? */
 supports: boolean;
}

// ── Explanation Templates ───────────────────────────────────────────

const EXPLANATIONS: Record<string, {
 bullish: { explanation: string; factors: Array<{ nameAr: string; contributionAr: string }>; invalidation: string; confirmation: string };
 bearish: { explanation: string; factors: Array<{ nameAr: string; contributionAr: string }>; invalidation: string; confirmation: string };
}> = {
 'smc:bos': {
 bullish: {
 explanation: ' structure bullish (BOS) — he signal buyers on price level resistance previous. this on about in power direction bullish.',
 factors: [
 { nameAr: ' level resistance', contributionAr: 'price above level high prior confirmation size trade' },
 { nameAr: ' momentum', contributionAr: 'candles after break higher who level break' },
 ],
 invalidation: 'includes this break if price below level break ( test )',
 confirmation: ' break if price who level break support (retest) with size trade good',
 },
 bearish: {
 explanation: ' structure bearish (BOS) — sellers level support previous. this on weakness in direction bullish possibility fall.',
 factors: [
 { nameAr: ' level support', contributionAr: 'price below level low prior' },
 { nameAr: 'weakness buyers', contributionAr: 'size trading support fall' },
 ],
 invalidation: 'includes this break if price above level break',
 confirmation: ' break if price who level break resistance with clear',
 },
 },
 'smc:choch': {
 bullish: {
 explanation: ' bullish (CHoCH) — this about in direction market who to . CHoCH who BOS gives signal speed but less confirmation.',
 factors: [
 { nameAr: 'about power', contributionAr: 'price high Swing High previous after bearish' },
 { nameAr: ' direction new', contributionAr: 'this first signal on about probable who to ' },
 ],
 invalidation: 'includes if price low new less who low prior ( fall)',
 confirmation: ' in order to low higher who low prior (Higher Low) then last',
 },
 bearish: {
 explanation: ' bearish (CHoCH) — about who to . this signal direction bullish .',
 factors: [
 { nameAr: ' momentum bullish', contributionAr: 'price low Swing Low previous after bullish' },
 { nameAr: ' weakness', contributionAr: 'buyers who on highs ' },
 ],
 invalidation: 'includes if price high new higher who high prior',
 confirmation: ' in order to high then last low ',
 },
 },
 'smc:orderblock': {
 bullish: {
 explanation: ' but or bullish — he last candle bearish before strong. institutions at this level then , what creates who request strong.',
 factors: [
 { nameAr: 'who request ', contributionAr: 'last point before movement bullish strong' },
 { nameAr: ' break', contributionAr: 'price this level after, what on demand' },
 ],
 invalidation: 'includes if price below but — this about sellers ',
 confirmation: ' price who but with candle bullish strong size trade ',
 },
 bearish: {
 explanation: ' but or bearish — he last candle bullish before strong. institutions at this level then , what creates who width strong.',
 factors: [
 { nameAr: 'who width ', contributionAr: 'last point before movement bearish strong' },
 { nameAr: 'resistance strong', contributionAr: 'price who this level ' },
 ],
 invalidation: 'includes if price above but — buyers ',
 confirmation: ' price who but with candle bearish size ',
 },
 },
 'harmonic': {
 bullish: {
 explanation: ' pattern bullish — patterns ratios in points reversal. what style at point D about price who reversal probable.',
 factors: [
 { nameAr: 'ratio in minute', contributionAr: 'style how much at ratios in historically' },
 { nameAr: 'who PRZ', contributionAr: 'price in who as style (Potential Reversal Zone)' },
 ],
 invalidation: 'includes if price level invalidation style (outside PRZ)',
 confirmation: ' he candle reversal strong at point D with size ',
 },
 bearish: {
 explanation: ' pattern bearish — style at point D in who PRZ, what about possibility reversal .',
 factors: [
 { nameAr: 'what style', contributionAr: 'all points (X, A, B, C, D) ratios correct' },
 { nameAr: 'historical style', contributionAr: 'this style has ratio success historical good' },
 ],
 invalidation: 'includes if price level point X (invalidation complete)',
 confirmation: ' candle bearish strong after point D with height size trading',
 },
 },
 'wyckoff': {
 bullish: {
 explanation: 'signal bullish — market phase all since institutions . spring (Spring) or signal phase bullish.',
 factors: [
 { nameAr: 'phase all', contributionAr: 'institutions who investors weakness' },
 { nameAr: 'spring/signal', contributionAr: 'event confirms all rise' },
 ],
 invalidation: 'includes if price low all size ',
 confirmation: ' resistance all (Sign of Strength) with size ',
 },
 bearish: {
 explanation: 'signal bearish — market phase since institutions . UTAD (Upthrust After Distribution) phase fall.',
 factors: [
 { nameAr: 'phase ', contributionAr: 'institutions distributes arrowthey on buyers ' },
 { nameAr: 'UTAD/signal', contributionAr: 'event confirms fall' },
 ],
 invalidation: 'includes if price high size ',
 confirmation: ' support with size (Sign of Weakness)',
 },
 },
 'elliott': {
 bullish: {
 explanation: 'signal bullish — price in wave bullish (1, 3, or 5). this waves in direction direction what movements.',
 factors: [
 { nameAr: 'wave ', contributionAr: 'price in phase within direction bullish ' },
 { nameAr: 'level in', contributionAr: 'wave with ratios in waves prior' },
 ],
 invalidation: 'includes if correct 100% who wave prior (rule )',
 confirmation: ' if wave at goal in then correct ratios correct',
 },
 bearish: {
 explanation: 'signal bearish — price in wave bearish or correct. movement bearish direction new or correct within direction bullish .',
 factors: [
 { nameAr: 'wave /correct', contributionAr: 'price in phase within ' },
 { nameAr: ' price', contributionAr: 'goal who ratios in waves prior' },
 ],
 invalidation: 'includes if price wave current',
 confirmation: ' if price goal noon signals reversal',
 },
 },
};

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Generate a detailed explanation for a signal.
 * Uses template-based explanations with real data injected.
 */
export function explainSignal(opts: {
 source: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 price: number;
 currentPrice?: number;
 allSignals?: Array<{
 source: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 }>;
 regime?: string;
 historicalWinRate?: number;
}): SignalExplanation {
 const { source, direction, confidence, price, currentPrice, allSignals, regime, historicalWinRate } = opts;

 // Find the explanation template for this source
 const dir = direction === 'neutral' ? 'bullish' : direction;
 const template = EXPLANATIONS[source] || EXPLANATIONS[mapSourceToTemplate(source)];
 const explanation = template?.[dir] || generateGenericExplanation(source, direction, confidence);

 // Build factors
 const factors: ExplanationFactor[] = (explanation.factors || []).map((f, i) => ({
 name: `factor_${i}`,
 nameAr: f.nameAr,
 contributionAr: f.contributionAr,
 weight: Math.max(0.3, 1 - i * 0.2),
 supports: true,
 }));

 // Add contradicting factors if confidence is low
 if (confidence < 0.6) {
 factors.push({
 name: 'low_confidence',
 nameAr: 'confidence who',
 contributionAr: 'confidence signal less who 60% — confirmation in',
 weight: 0.4,
 supports: false,
 });
 }

 // Find related signals
 const relatedSignals = (allSignals || [])
 .filter(s => s.source !== source)
 .slice(0, 5)
 .map(s => ({
 source: s.source,
 direction: s.direction,
 agrees: s.direction === direction || s.direction === 'neutral',
 labelAr: mapSourceToLabelAr(s.source),
 }));

 // Determine risk level
 let riskLevel: SignalExplanation['riskLevel'] = 'medium';
 if (confidence >= 0.8 && relatedSignals.filter(r => r.agrees).length >= 2) riskLevel = 'low';
 if (confidence < 0.5 || relatedSignals.filter(r => !r.agrees).length > relatedSignals.filter(r => r.agrees).length) riskLevel = 'high';

 return {
 signal: { source, direction, confidence, price },
 explanationAr: (typeof explanation === 'string' ? explanation : (explanation as any).explanation) || String(explanation),
 factors,
 invalidationAr: (typeof explanation === 'object' && explanation != null ? (explanation as any).invalidation : null) || ' price outside who signal',
 confirmationAr: (typeof explanation === 'object' && explanation != null ? (explanation as any).confirmation : null) || ' price who zone with size ',
 relatedSignals,
 historicalWinRate: historicalWinRate ?? null,
 regime: regime || ' ',
 riskLevel,
 };
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapSourceToTemplate(source: string): string {
 if (source.startsWith('smc:')) {
 if (source.includes('bos') || source.includes('BOS')) return 'smc:bos';
 if (source.includes('choch') || source.includes('CHoCH')) return 'smc:choch';
 if (source.includes('orderblock') || source.includes('ob')) return 'smc:orderblock';
 return 'smc:bos';
 }
 if (source.startsWith('harmonic') || source.includes('gartley') || source.includes('bat') || source.includes('butterfly')) return 'harmonic';
 if (source.startsWith('wyckoff')) return 'wyckoff';
 if (source.startsWith('elliott')) return 'elliott';
 return 'smc:bos'; // default template
}

function mapSourceToLabelAr(source: string): string {
 const map: Record<string, string> = {
 'smc:bos': ' structure',
 'smc:choch': ' ',
 'smc:orderblock': 'but or',
 'smc:fvg': ' value',
 'harmonic': '',
 'wyckoff': '',
 'elliott': '',
 'sr': 'support/resistance',
 'volume': 'size trading',
 'fibonacci': 'in',
 'trendline': 'font ',
 'pattern': 'pattern ',
 };
 for (const [key, val] of Object.entries(map)) {
 if (source.includes(key)) return val;
 }
 return source;
}

function generateGenericExplanation(source: string, direction: 'bullish' | 'bearish' | 'neutral', confidence: number): any {
 const dirAr = direction === 'bullish' ? 'bullish' : direction === 'bearish' ? 'bearish' : 'neutral';
 return {
 explanation: ` signal ${dirAr} who engine ${source} confidence ${Math.round(confidence * 100)}%. this signal on analysis algorithmic data .`,
 factors: [
 { nameAr: 'analysis algorithmic', contributionAr: 'signal about analysis data' },
 ],
 invalidation: ' price outside who signal',
 confirmation: 'confirmation signals in who engines ',
 };
}
