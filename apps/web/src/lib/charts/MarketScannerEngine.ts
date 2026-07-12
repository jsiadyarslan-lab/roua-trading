// ═══════════════════════════════════════════════════════════════════════
// ROUA Market Scanner Engine — Phase 5
//
// Multi-asset analysis engine that scans 50+ trading pairs
// simultaneously and ranks them by signal strength.
//
// Features:
// - Confluence matrix: which assets have the strongest signals
// - Market Scanner: scan 50+ pairs and rank by signal strength
// - Correlations: detect assets moving together
// - Sector analysis: group assets by sector/category
// - Real-time scan with parallel fetching
// - Arabic labels for all categories
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { safeMax, safeMin } from './chart-utils';

// ── Types ───────────────────────────────────────────────────────────

/** Asset sector/category */
export type AssetSector = 'defi' | 'layer1' | 'layer2' | 'meme' | 'ai' | 'gaming' | 'rwa' | 'cefi' | 'stablecoin' | 'other';

/** Scan result for a single asset */
export interface AssetScanResult {
 /** Symbol (e.g. 'BTCUSDT') */
 symbol: string;
 /** Overall signal direction */
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Signal strength (0-100) */
 strength: number;
 /** Confluence score */
 confluenceScore: number;
 /** Number of agreeing signals */
 agreeingSignals: number;
 /** Total signals detected */
 totalSignals: number;
 /** Key pattern type detected */
 keyPattern: string;
 /** Key pattern label in Arabic */
 keyPatternAr: string;
 /** Entry price (current) */
 price: number;
 /** 24h change % */
 change24h: number;
 /** Volume 24h */
 volume24h: number;
 /** Market regime */
 regime: string;
 /** Sector */
 sector: AssetSector;
 /** Timestamp of scan */
 scannedAt: number;
 /** Scan duration in ms */
 scanDurationMs: number;
}

/** Correlation between two assets */
export interface AssetCorrelation {
 /** First symbol */
 symbol1: string;
 /** Second symbol */
 symbol2: string;
 /** Correlation coefficient (-1 to 1) */
 correlation: number;
 /** Correlation strength label */
 strengthLabel: string;
 /** Arabic strength label */
 strengthLabelAr: string;
 /** Whether they currently move in the same direction */
 sameDirection: boolean;
}

/** Complete market scan result */
export interface MarketScanResult {
 /** All scanned assets sorted by strength */
 assets: AssetScanResult[];
 /** Total assets scanned */
 totalScanned: number;
 /** Scan duration in ms */
 scanDurationMs: number;
 /** Top bullish assets */
 topBullish: AssetScanResult[];
 /** Top bearish assets */
 topBearish: AssetScanResult[];
 /** Asset correlations */
 correlations: AssetCorrelation[];
 /** Sector summary */
 sectorSummary: Array<{
 sector: AssetSector;
 labelAr: string;
 avgStrength: number;
 bullishCount: number;
 bearishCount: number;
 neutralCount: number;
 }>;
 /** Market overview */
 marketOverview: {
 bullishPct: number;
 bearishPct: number;
 neutralPct: number;
 avgStrength: number;
 dominantDirection: 'bullish' | 'bearish' | 'neutral';
 hotSectors: AssetSector[];
 };
 /** Timestamp */
 timestamp: number;
}

// ── Asset Database ──────────────────────────────────────────────────

/** Top crypto assets to scan with their sectors */
const SCAN_UNIVERSE: Array<{ symbol: string; sector: AssetSector }> = [
 // Layer 1
 { symbol: 'BTCUSDT', sector: 'layer1' },
 { symbol: 'ETHUSDT', sector: 'layer1' },
 { symbol: 'SOLUSDT', sector: 'layer1' },
 { symbol: 'ADAUSDT', sector: 'layer1' },
 { symbol: 'AVAXUSDT', sector: 'layer1' },
 { symbol: 'DOTUSDT', sector: 'layer1' },
 { symbol: 'NEARUSDT', sector: 'layer1' },
 { symbol: 'ATOMUSDT', sector: 'layer1' },
 { symbol: 'ALGOUSDT', sector: 'layer1' },
 { symbol: 'INJUSDT', sector: 'layer1' },
 { symbol: 'SUIUSDT', sector: 'layer1' },
 { symbol: 'SEIUSDT', sector: 'layer1' },
 { symbol: 'APTUSDT', sector: 'layer1' },
 { symbol: 'TIAUSDT', sector: 'layer1' },
 // Layer 2
 { symbol: 'MATICUSDT', sector: 'layer2' },
 { symbol: 'ARBUSDT', sector: 'layer2' },
 { symbol: 'OPUSDT', sector: 'layer2' },
 { symbol: 'MANTAUSDT', sector: 'layer2' },
 { symbol: 'STRKUSDT', sector: 'layer2' },
 // DeFi
 { symbol: 'UNIUSDT', sector: 'defi' },
 { symbol: 'AAVEUSDT', sector: 'defi' },
 { symbol: 'MKRUSDT', sector: 'defi' },
 { symbol: 'COMPUSDT', sector: 'defi' },
 { symbol: 'CRVUSDT', sector: 'defi' },
 { symbol: 'SNXUSDT', sector: 'defi' },
 { symbol: 'DYDXUSDT', sector: 'defi' },
 { symbol: 'PENDLEUSDT', sector: 'defi' },
 { symbol: 'JUPUSDT', sector: 'defi' },
 // AI
 { symbol: 'FETUSDT', sector: 'ai' },
 { symbol: 'AGIXUSDT', sector: 'ai' },
 { symbol: 'RENDERUSDT', sector: 'ai' },
 { symbol: 'WLDUSDT', sector: 'ai' },
 { symbol: 'TAOUSDT', sector: 'ai' },
 { symbol: 'OCEANUSDT', sector: 'ai' },
 // Meme
 { symbol: 'DOGEUSDT', sector: 'meme' },
 { symbol: 'SHIBUSDT', sector: 'meme' },
 { symbol: 'PEPEUSDT', sector: 'meme' },
 { symbol: 'FLOKIUSDT', sector: 'meme' },
 { symbol: 'BONKUSDT', sector: 'meme' },
 { symbol: 'WIFUSDT', sector: 'meme' },
 // Gaming
 { symbol: 'AXSUSDT', sector: 'gaming' },
 { symbol: 'SANDUSDT', sector: 'gaming' },
 { symbol: 'MANAUSDT', sector: 'gaming' },
 { symbol: 'GALAUSDT', sector: 'gaming' },
 { symbol: 'IMXUSDT', sector: 'gaming' },
 // RWA
 { symbol: 'ONDOUSDT', sector: 'rwa' },
 { symbol: 'POLYXUSDT', sector: 'rwa' },
 { symbol: 'TRUUSDT', sector: 'rwa' },
 // CeFi
 { symbol: 'BNBUSDT', sector: 'cefi' },
 { symbol: 'LEVERUSDT', sector: 'cefi' },
];

/** Sector Arabic labels */
export const SECTOR_LABELS_AR: Record<AssetSector, string> = {
 defi: 'DeFi — decentralied',
 layer1: ' first — Layer 1',
 layer2: ' second — Layer 2',
 meme: 'coins meme',
 ai: 'AI',
 gaming: '',
 rwa: 'real assets',
 cefi: 'centralied finance',
 stablecoin: 'coins stable',
 other: '',
};

// ── In-memory Cache ─────────────────────────────────────────────────

const scanCache = new Map<string, { result: AssetScanResult; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

// ── Single Asset Analysis ───────────────────────────────────────────

/**
 * Analye a single asset using quick candle data analysis.
 * This is a lightweight analysis for scanning — not as deep as the
 * full unified analysis but fast enough to scan 50+ assets.
 */
function analyeAssetQuick(
 symbol: string,
 candles: CandleData[],
 sector: AssetSector,
): AssetScanResult {
 const startTime = Date.now();

 if (!candles || candles.length < 30) {
 return {
 symbol,
 direction: 'neutral',
 strength: 0,
 confluenceScore: 0,
 agreeingSignals: 0,
 totalSignals: 0,
 keyPattern: 'insufficient_data',
 keyPatternAr: 'data in',
 price: 0,
 change24h: 0,
 volume24h: 0,
 regime: 'quiet',
 sector,
 scannedAt: Date.now(),
 scanDurationMs: Date.now() - startTime,
 };
 }

 const price = candles[candles.length - 1].close;
 const open24h = candles.length >= 48 ? candles[candles.length - 48].open : candles[0].open;
 const change24h = ((price - open24h) / open24h) * 100;
 const volume24h = candles.slice(-48).reduce((s, c) => s + (c.volume || 0), 0);

 // Quick signal detection
 const signals: Array<{ source: string; direction: 'bullish' | 'bearish'; confidence: number }> = [];

 // 1. EMA Trend (9/21 crossover)
 const ema9 = calcQuickEMA(candles.map(c => c.close), 9);
 const ema21 = calcQuickEMA(candles.map(c => c.close), 21);
 if (ema9 !== null && ema21 !== null) {
 if (ema9 > ema21 * 1.002) {
 signals.push({ source: 'ema_trend', direction: 'bullish', confidence: 0.6 });
 } else if (ema9 < ema21 * 0.998) {
 signals.push({ source: 'ema_trend', direction: 'bearish', confidence: 0.6 });
 }
 }

 // 2. RSI-like momentum
 const rsi = calcQuickRSI(candles.map(c => c.close), 14);
 if (rsi !== null) {
 if (rsi < 30) {
 signals.push({ source: 'rsi_oversold', direction: 'bullish', confidence: 0.7 });
 } else if (rsi > 70) {
 signals.push({ source: 'rsi_overbought', direction: 'bearish', confidence: 0.7 });
 } else if (rsi > 55) {
 signals.push({ source: 'rsi_bullish', direction: 'bullish', confidence: 0.5 });
 } else if (rsi < 45) {
 signals.push({ source: 'rsi_bearish', direction: 'bearish', confidence: 0.5 });
 }
 }

 // 3. Volume spike detection
 const avgVol = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
 const lastVol = candles[candles.length - 1].volume || 0;
 if (lastVol > avgVol * 2) {
 const dir = candles[candles.length - 1].close > candles[candles.length - 1].open ? 'bullish' : 'bearish';
 signals.push({ source: 'volume_spike', direction: dir, confidence: 0.6 });
 }

 // 4. Price position relative to recent range
 const recent = candles.slice(-20);
 const high = safeMax(recent.map(c => c.high));
 const low = safeMin(recent.map(c => c.low));
 const range = high - low;
 if (range > 0) {
 const position = (price - low) / range;
 if (position > 0.85) {
 signals.push({ source: 'near_high', direction: 'bullish', confidence: 0.55 });
 } else if (position < 0.15) {
 signals.push({ source: 'near_low', direction: 'bearish', confidence: 0.55 });
 }
 }

 // 5. Recent candle pattern (engulfing)
 const last2 = candles.slice(-2);
 if (last2.length === 2) {
 const prev = last2[0], curr = last2[1];
 if (curr.close > curr.open && prev.close < prev.open && curr.close > prev.open && curr.open < prev.close) {
 signals.push({ source: 'bullish_engulfing', direction: 'bullish', confidence: 0.55 });
 } else if (curr.close < curr.open && prev.close > prev.open && curr.close < prev.open && curr.open > prev.close) {
 signals.push({ source: 'bearish_engulfing', direction: 'bearish', confidence: 0.55 });
 }
 }

 // 6. Support/Resistance proximity
 const srLevels = detectQuickSR(candles);
 for (const level of srLevels) {
 if (Math.abs(price - level.price) / price < 0.005) {
 signals.push({
 source: level.type === 'support' ? 'at_support' : 'at_resistance',
 direction: level.type === 'support' ? 'bullish' : 'bearish',
 confidence: level.strength,
 });
 }
 }

 // Compute overall direction and strength
 const bullSignals = signals.filter(s => s.direction === 'bullish');
 const bearSignals = signals.filter(s => s.direction === 'bearish');
 const bullStrength = bullSignals.reduce((s, sig) => s + sig.confidence, 0);
 const bearStrength = bearSignals.reduce((s, sig) => s + sig.confidence, 0);

 let direction: 'bullish' | 'bearish' | 'neutral';
 let strength: number;

 if (bullStrength > bearStrength * 1.5) {
 direction = 'bullish';
 strength = Math.min(100, Math.round((bullStrength / (bullStrength + bearStrength + 0.01)) * 100));
 } else if (bearStrength > bullStrength * 1.5) {
 direction = 'bearish';
 strength = Math.min(100, Math.round((bearStrength / (bullStrength + bearStrength + 0.01)) * 100));
 } else {
 direction = 'neutral';
 strength = Math.round(Math.abs(bullStrength - bearStrength) / (bullStrength + bearStrength + 0.01) * 50);
 }

 const confluenceScore = Math.min(100, strength + (signals.length - 1) * 10);
 const keySignal = signals.sort((a, b) => b.confidence - a.confidence)[0];

 // Regime
 const atr = calcQuickATR(candles, 14);
 const regime = atr / price > 0.025 ? 'volatile' : atr / price > 0.015 ? 'trending' : atr / price < 0.005 ? 'quiet' : 'ranging';

 return {
 symbol,
 direction,
 strength,
 confluenceScore,
 agreeingSignals: direction === 'bullish' ? bullSignals.length : direction === 'bearish' ? bearSignals.length : 0,
 totalSignals: signals.length,
 keyPattern: keySignal?.source || 'none',
 keyPatternAr: getSignalLabelAr(keySignal?.source || 'none'),
 price,
 change24h: Math.round(change24h * 100) / 100,
 volume24h,
 regime,
 sector,
 scannedAt: Date.now(),
 scanDurationMs: Date.now() - startTime,
 };
}

// ── Quick Helper Functions ──────────────────────────────────────────

function calcQuickEMA(values: number[], period: number): number | null {
 if (values.length < period) return null;
 const k = 2 / (period + 1);
 let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
 for (let i = period; i < values.length; i++) {
 ema = values[i] * k + ema * (1 - k);
 }
 return ema;
}

function calcQuickRSI(closes: number[], period: number): number | null {
 if (closes.length < period + 1) return null;
 let gains = 0, losses = 0;
 for (let i = closes.length - period; i < closes.length; i++) {
 const change = closes[i] - closes[i - 1];
 if (change > 0) gains += change;
 else losses -= change;
 }
 const avgGain = gains / period;
 const avgLoss = losses / period;
 if (avgLoss === 0) return 100;
 const rs = avgGain / avgLoss;
 return 100 - (100 / (1 + rs));
}

function calcQuickATR(candles: CandleData[], period: number): number {
 if (candles.length < period + 1) return 0;
 let sum = 0;
 for (let i = candles.length - period; i < candles.length; i++) {
 const tr = Math.max(
 candles[i].high - candles[i].low,
 Math.abs(candles[i].high - candles[i - 1]?.close || candles[i].open),
 Math.abs(candles[i].low - candles[i - 1]?.close || candles[i].open),
 );
 sum += tr;
 }
 return sum / period;
}

function detectQuickSR(candles: CandleData[]): Array<{ price: number; type: 'support' | 'resistance'; strength: number }> {
 const levels: Array<{ price: number; type: 'support' | 'resistance'; strength: number }> = [];
 const recent = candles.slice(-50);

 // Find pivot highs and lows
 for (let i = 2; i < recent.length - 2; i++) {
 if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
 recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
 levels.push({ price: recent[i].high, type: 'resistance', strength: 0.7 });
 }
 if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
 recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
 levels.push({ price: recent[i].low, type: 'support', strength: 0.7 });
 }
 }

 return levels.slice(-4);
}

function getSignalLabelAr(source: string): string {
 const labels: Record<string, string> = {
 ema_trend: 'direction EMA',
 rsi_oversold: 'RSI ',
 rsi_overbought: 'RSI ',
 rsi_bullish: 'RSI bullish',
 rsi_bearish: 'RSI bearish',
 volume_spike: 'height sie',
 near_high: 'near high',
 near_low: 'near low',
 bullish_engulfing: ' bullish',
 bearish_engulfing: ' bearish',
 at_support: 'at support',
 at_resistance: 'at resistance',
 none: ' signal',
 insufficient_data: 'data in',
 };
 return labels[source] || source;
}

// ── Fetch & Scan ────────────────────────────────────────────────────

/**
 * Fetch candles for a single asset from Binance.
 */
async function fetchAssetCandles(symbol: string, interval: string = '1h', limit: number = 100): Promise<CandleData[]> {
 try {
 const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
 const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
 if (!response.ok) return [];
 const data = await response.json();
 if (!Array.isArray(data)) return [];
 return data.map((k: any[]) => ({
 time: Math.floor(k[0] / 1000),
 open: parseFloat(k[1]),
 high: parseFloat(k[2]),
 low: parseFloat(k[3]),
 close: parseFloat(k[4]),
 volume: parseFloat(k[5]),
 }));
 } catch {
 return [];
 }
}

/**
 * Run a full market scan across all assets in the universe.
 * Fetches candle data in parallel and analyes each asset.
 *
 * @param maxAssets - Maximum number of assets to scan (default: 50)
 * @param interval - Candle interval for scanning (default: '1h')
 * @returns MarketScanResult with all asset analyses
 */
export async function runMarketScan(
 maxAssets: number = 50,
 interval: string = '1h',
): Promise<MarketScanResult> {
 const startTime = Date.now();
 const assets = SCAN_UNIVERSE.slice(0, maxAssets);

 // Fetch all asset data in parallel
 const fetchPromises = assets.map(async (asset) => {
 // Check cache first
 const cached = scanCache.get(asset.symbol);
 if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
 return cached.result;
 }

 const candles = await fetchAssetCandles(asset.symbol, interval);
 if (candles.length < 30) return null;

 const result = analyeAssetQuick(asset.symbol, candles, asset.sector);
 scanCache.set(asset.symbol, { result, timestamp: Date.now() });
 return result;
 });

 const results = await Promise.allSettled(fetchPromises);
 const assetResults: AssetScanResult[] = results
 .filter((r): r is PromiseFulfilledResult<AssetScanResult | null> => r.status === 'fulfilled' && r.value !== null)
 .map(r => r.value!);

 // Sort by strength (descending)
 assetResults.sort((a, b) => b.strength - a.strength);

 // Top bullish/bearish
 const topBullish = assetResults.filter(a => a.direction === 'bullish').slice(0, 10);
 const topBearish = assetResults.filter(a => a.direction === 'bearish').slice(0, 10);

 // Sector summary
 const sectorMap = new Map<AssetSector, AssetScanResult[]>();
 for (const asset of assetResults) {
 if (!sectorMap.has(asset.sector)) sectorMap.set(asset.sector, []);
 sectorMap.get(asset.sector)!.push(asset);
 }

 const sectorSummary = Array.from(sectorMap.entries()).map(([sector, assets]) => ({
 sector,
 labelAr: SECTOR_LABELS_AR[sector],
 avgStrength: assets.length > 0 ? assets.reduce((s, a) => s + a.strength, 0) / assets.length : 0,
 bullishCount: assets.filter(a => a.direction === 'bullish').length,
 bearishCount: assets.filter(a => a.direction === 'bearish').length,
 neutralCount: assets.filter(a => a.direction === 'neutral').length,
 }));

 // Market overview
 const bullishCount = assetResults.filter(a => a.direction === 'bullish').length;
 const bearishCount = assetResults.filter(a => a.direction === 'bearish').length;
 const total = assetResults.length || 1;
 const avgStrength = assetResults.reduce((s, a) => s + a.strength, 0) / total;

 // Hot sectors (highest avg strength)
 const hotSectors = sectorSummary
 .sort((a, b) => b.avgStrength - a.avgStrength)
 .slice(0, 3)
 .map(s => s.sector);

 // Correlations (quick calculation on top assets)
 const correlations = computeQuickCorrelations(assetResults.slice(0, 20));

 const dominantDirection = bullishCount > bearishCount * 1.5 ? 'bullish'
 : bearishCount > bullishCount * 1.5 ? 'bearish'
 : 'neutral';

 return {
 assets: assetResults,
 totalScanned: assetResults.length,
 scanDurationMs: Date.now() - startTime,
 topBullish,
 topBearish,
 correlations,
 sectorSummary,
 marketOverview: {
 bullishPct: Math.round((bullishCount / total) * 100),
 bearishPct: Math.round((bearishCount / total) * 100),
 neutralPct: Math.round(((total - bullishCount - bearishCount) / total) * 100),
 avgStrength: Math.round(avgStrength),
 dominantDirection,
 hotSectors,
 },
 timestamp: Date.now(),
 };
}

// ── Correlation Computation ─────────────────────────────────────────

/**
 * Compute quick correlations between assets based on 24h price change.
 * This is a simplified correlation based on directional alignment
 * rather than full time-series correlation.
 */
function computeQuickCorrelations(assets: AssetScanResult[]): AssetCorrelation[] {
 const correlations: AssetCorrelation[] = [];

 for (let i = 0; i < assets.length; i++) {
 for (let j = i + 1; j < assets.length; j++) {
 const a = assets[i], b = assets[j];

 // Correlation based on direction alignment and change magnitude
 let correlation = 0;

 // Direction alignment
 if (a.direction === b.direction && a.direction !== 'neutral') {
 correlation += 0.6;
 } else if (a.direction !== b.direction && a.direction !== 'neutral' && b.direction !== 'neutral') {
 correlation -= 0.4;
 }

 // Change similarity
 const changeDiff = Math.abs(a.change24h - b.change24h);
 const avgChange = (Math.abs(a.change24h) + Math.abs(b.change24h)) / 2 || 1;
 correlation += Math.max(-0.3, 0.3 - (changeDiff / avgChange) * 0.3);

 // Same sector bonus
 if (a.sector === b.sector) {
 correlation += 0.15;
 }

 correlation = Math.min(1, Math.max(-1, correlation));

 let strengthLabel: string, strengthLabelAr: string;
 if (correlation > 0.7) { strengthLabel = 'Strong Positive'; strengthLabelAr = ' strong'; }
 else if (correlation > 0.3) { strengthLabel = 'Moderate Positive'; strengthLabelAr = ' center'; }
 else if (correlation > -0.3) { strengthLabel = 'Weak'; strengthLabelAr = ' weak'; }
 else if (correlation > -0.7) { strengthLabel = 'Moderate Negative'; strengthLabelAr = ' center'; }
 else { strengthLabel = 'Strong Negative'; strengthLabelAr = ' strong'; }

 const sameDirection = a.direction === b.direction && a.direction !== 'neutral';

 if (Math.abs(correlation) > 0.3) {
 correlations.push({
 symbol1: a.symbol,
 symbol2: b.symbol,
 correlation: Math.round(correlation * 100) / 100,
 strengthLabel,
 strengthLabelAr,
 sameDirection,
 });
 }
 }
 }

 return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 30);
}

// ── Quick Scan (Single Asset) ───────────────────────────────────────

/**
 * Run a quick scan on a single asset using provided candle data.
 * No API calls — uses the candle data already loaded on the chart.
 */
export function runSingleAssetScan(
 symbol: string,
 candles: CandleData[],
 sector: AssetSector = 'other',
): AssetScanResult {
 return analyeAssetQuick(symbol, candles, sector);
}

/** Get the scan universe (list of assets that can be scanned) */
export function getScanUniverse(): Array<{ symbol: string; sector: AssetSector }> {
 return [...SCAN_UNIVERSE];
}
