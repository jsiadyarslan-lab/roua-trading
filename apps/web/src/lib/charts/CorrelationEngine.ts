// ═══════════════════════════════════════════════════════════════════════
// ROUA Correlation Engine — Revolutionary Feature #4
//
// Tracks correlations between different signal sources and market
// conditions. For example, it learns that "BOS bullish + Wyckoff
// Accumulation" has a 72% win rate, while "BOS bullish alone" only
// has 54%. This helps traders focus on high-probability combinations.
//
// Key innovation: Dynamic correlation matrix that updates in real-time
// as new data comes in. Traders can see which signal combinations
// are working NOW (not historically) in the current market regime.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

export interface SignalCorrelation {
 /** Pair of signal sources */
 sourceA: string;
 sourceB: string;
 /** How often they appear together (0-1) */
 coOccurrence: number;
 /** When both appear, what's the win rate? */
 combinedWinRate: number;
 /** Individual win rates */
 winRateA: number;
 winRateB: number;
 /** Lift: how much does B improve A's accuracy? (>1 = improvement) */
 lift: number;
 /** Direction of correlation */
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Sample sie */
 sampleSie: number;
 /** Arabic description */
 descriptionAr: string;
}

export interface CorrelationMatrix {
 /** All signal sources tracked */
 sources: string[];
 /** Pairwise correlations */
 correlations: SignalCorrelation[];
 /** Top performing combinations */
 topCombinations: Array<{
 sources: string[];
 winRate: number;
 sampleSie: number;
 direction: 'bullish' | 'bearish';
 descriptionAr: string;
 }>;
 /** Last updated */
 timestamp: number;
}

/** A recorded signal event for correlation tracking */
interface SignalEvent {
 timestamp: number;
 source: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 price: number;
 wasCorrect: boolean | null;
 regime: string;
}

// ── In-memory State ─────────────────────────────────────────────────

const CORR_KEY = 'roua-correlation-engine';
const events: SignalEvent[] = [];
const MAX_EVENTS = 3000;

// ── Persistence ─────────────────────────────────────────────────────

function loadEvents(): void {
 if (events.length > 0) return;
 try {
 if (typeof window !== 'undefined') {
 const stored = localStorage.getItem(CORR_KEY);
 if (stored) {
 const parsed = JSON.parse(stored);
 if (Array.isArray(parsed)) {
 events.push(...parsed.slice(-MAX_EVENTS));
 }
 }
 }
 } catch { /* not available */ }
}

function persistEvents(): void {
 try {
 if (typeof window !== 'undefined') {
 localStorage.setItem(CORR_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
 }
 } catch { /* not available */ }
}

loadEvents();

// ── Record Signal Event ─────────────────────────────────────────────

/**
 * Record that a signal was generated. Call this whenever a signal
 * is detected by any engine.
 */
export function recordCorrelationEvent(opts: {
 source: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 price: number;
 regime?: string;
}): void {
 events.push({
 timestamp: Date.now(),
 source: opts.source,
 direction: opts.direction,
 price: opts.price,
 wasCorrect: null, // Will be evaluated later
 regime: opts.regime || 'unknown',
 });

 if (events.length > MAX_EVENTS) {
 events.splice(0, events.length - MAX_EVENTS);
 }

 persistEvents();
}

/**
 * Evaluate past signal events against current price movement.
 * Should be called periodically (e.g., every 5 minutes).
 */
export function evaluateCorrelationEvents(currentPrice: number): void {
 const now = Date.now();
 const EVAL_DELAY = 300000; // 5 minutes
 const WIN_THRESHOLD = 0.003; // 0.3% move confirms direction

 let modified = false;

 for (const event of events) {
 if (event.wasCorrect !== null) continue;
 if (now - event.timestamp < EVAL_DELAY) continue;

 const priceChange = (currentPrice - event.price) / event.price;

 if (event.direction === 'bullish') {
 event.wasCorrect = priceChange > WIN_THRESHOLD;
 } else if (event.direction === 'bearish') {
 event.wasCorrect = priceChange < -WIN_THRESHOLD;
 } else {
 event.wasCorrect = Math.abs(priceChange) < WIN_THRESHOLD;
 }
 modified = true;
 }

 if (modified) persistEvents();
}

// ── Compute Correlation Matrix ──────────────────────────────────────

/**
 * Compute the correlation matrix from recorded events.
 * Groups events by time windows and checks which signals co-occurred.
 */
export function computeCorrelationMatrix(): CorrelationMatrix {
 const resolved = events.filter(e => e.wasCorrect !== null);
 const sources = [...new Set(resolved.map(e => e.source))];

 const TIME_WINDOW = 60000; // Signals within 1 minute are "co-occurring"
 const correlations: SignalCorrelation[] = [];

 // Compute pairwise correlations
 for (let i = 0; i < sources.length; i++) {
 for (let j = i + 1; j < sources.length; j++) {
 const corr = computePairCorrelation(sources[i], sources[j], resolved, TIME_WINDOW);
 if (corr) correlations.push(corr);
 }
 }

 // Find top combinations
 const topCombinations = findTopCombinations(resolved, TIME_WINDOW);

 return {
 sources,
 correlations: correlations.sort((a, b) => b.lift - a.lift),
 topCombinations,
 timestamp: Date.now(),
 };
}

function computePairCorrelation(
 sourceA: string,
 sourceB: string,
 resolved: SignalEvent[],
 timeWindow: number,
): SignalCorrelation | null {
 const eventsA = resolved.filter(e => e.source === sourceA);
 const eventsB = resolved.filter(e => e.source === sourceB);

 if (eventsA.length < 3 || eventsB.length < 3) return null;

 // Individual win rates
 const winRateA = eventsA.filter(e => e.wasCorrect === true).length / eventsA.length;
 const winRateB = eventsB.filter(e => e.wasCorrect === true).length / eventsB.length;

 // Find co-occurring events (within time window)
 const coOccurring: SignalEvent[][] = [];
 for (const a of eventsA) {
 for (const b of eventsB) {
 if (Math.abs(a.timestamp - b.timestamp) <= timeWindow) {
 coOccurring.push([a, b]);
 }
 }
 }

 if (coOccurring.length < 3) return null;

 // Combined win rate (both must be correct)
 const bothCorrect = coOccurring.filter(([a, b]) => a.wasCorrect && b.wasCorrect).length;
 const combinedWinRate = bothCorrect / coOccurring.length;

 // Co-occurrence rate
 const coOccurrence = coOccurring.length / Math.max(eventsA.length, eventsB.length);

 // Lift: how much does B improve A's accuracy?
 const lift = winRateA > 0 ? combinedWinRate / winRateA : 1;

 // Direction
 const bullCo = coOccurring.filter(([a, b]) => a.direction === 'bullish' && b.direction === 'bullish').length;
 const bearCo = coOccurring.filter(([a, b]) => a.direction === 'bearish' && b.direction === 'bearish').length;
 const direction = bullCo > bearCo ? 'bullish' : bearCo > bullCo ? 'bearish' : 'neutral';

 const sourceALabel = mapSourceToArabic(sourceA);
 const sourceBLabel = mapSourceToArabic(sourceB);

 return {
 sourceA,
 sourceB,
 coOccurrence: Math.round(coOccurrence * 100) / 100,
 combinedWinRate: Math.round(combinedWinRate * 100) / 100,
 winRateA: Math.round(winRateA * 100) / 100,
 winRateB: Math.round(winRateB * 100) / 100,
 lift: Math.round(lift * 100) / 100,
 direction,
 sampleSie: coOccurring.length,
 descriptionAr: `${sourceALabel} + ${sourceBLabel}: ratio success ${Math.round(combinedWinRate * 100)}% at hethey with ( ${lift > 1 ? '+' : ''}${Math.round((lift - 1) * 100)}% with ${sourceALabel} )`,
 };
}

function findTopCombinations(
 resolved: SignalEvent[],
 timeWindow: number,
): CorrelationMatrix['topCombinations'] {
 // Group events by time windows
 const windows = new Map<number, SignalEvent[]>();
 for (const event of resolved) {
 const windowKey = Math.floor(event.timestamp / timeWindow);
 if (!windows.has(windowKey)) windows.set(windowKey, []);
 windows.get(windowKey)!.push(event);
 }

 // Find windows with 2+ signals
 const multiSignalWindows = [...windows.values()].filter(w => w.length >= 2);
 if (multiSignalWindows.length < 3) return [];

 // Evaluate each combination
 const comboMap = new Map<string, { wins: number; total: number; direction: 'bullish' | 'bearish' }>();

 for (const window of multiSignalWindows) {
 const sources = [...new Set(window.map(e => e.source))].sort();
 const key = sources.join('+');
 const allCorrect = window.every(e => e.wasCorrect === true);
 const bullCount = window.filter(e => e.direction === 'bullish').length;
 const direction = bullCount > window.length / 2 ? 'bullish' : 'bearish';

 if (!comboMap.has(key)) {
 comboMap.set(key, { wins: 0, total: 0, direction });
 }
 const combo = comboMap.get(key)!;
 combo.total++;
 if (allCorrect) combo.wins++;
 }

 return [...comboMap.entries()]
 .filter(([, v]) => v.total >= 3)
 .map(([key, v]) => ({
 sources: key.split('+'),
 winRate: Math.round((v.wins / v.total) * 100) / 100,
 sampleSie: v.total,
 direction: v.direction,
 descriptionAr: `${key.split('+').map(mapSourceToArabic).join(' + ')}: ratio success ${Math.round((v.wins / v.total) * 100)}% (${v.total} )`,
 }))
 .sort((a, b) => b.winRate - a.winRate)
 .slice(0, 5);
}

// ── Helper ──────────────────────────────────────────────────────────

function mapSourceToArabic(source: string): string {
 const map: Record<string, string> = {
 'smc:bos': 'BOS',
 'smc:choch': 'CHoCH',
 'smc:orderblock': 'but or',
 'smc:fvg': 'FVG',
 'harmonic': '',
 'wyckoff': '',
 'elliott': '',
 'sr': 'support/resistance',
 'volume': 'sie',
 'fibonacci': 'in',
 'trendline': '',
 'pattern': 'pattern',
 };
 for (const [key, val] of Object.entries(map)) {
 if (source.includes(key)) return val;
 }
 return source;
}

/** Get quick correlation stats for a specific source */
export function getSourceCorrelationStats(source: string): {
 winRate: number;
 bestPartner: string | null;
 bestComboWinRate: number;
 worstPartner: string | null;
 worstComboWinRate: number;
} {
 const matrix = computeCorrelationMatrix();
 const sourceCorrelations = matrix.correlations.filter(
 c => c.sourceA === source || c.sourceB === source
 );

 const resolved = events.filter(e => e.source === source && e.wasCorrect !== null);
 const winRate = resolved.length > 0
 ? resolved.filter(e => e.wasCorrect === true).length / resolved.length
 : 0;

 if (sourceCorrelations.length === 0) {
 return { winRate, bestPartner: null, bestComboWinRate: 0, worstPartner: null, worstComboWinRate: 0 };
 }

 const sorted = [...sourceCorrelations].sort((a, b) => b.combinedWinRate - a.combinedWinRate);
 const best = sorted[0];
 const worst = sorted[sorted.length - 1];

 return {
 winRate: Math.round(winRate * 100) / 100,
 bestPartner: best.sourceA === source ? best.sourceB : best.sourceA,
 bestComboWinRate: best.combinedWinRate,
 worstPartner: worst.sourceA === source ? worst.sourceB : worst.sourceA,
 worstComboWinRate: worst.combinedWinRate,
 };
}
