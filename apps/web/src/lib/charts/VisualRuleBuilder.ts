// ═══════════════════════════════════════════════════════════════════════
// ROUA Visual Rule Builder Engine — Phase 5
//
// A data model and evaluation engine for building composite alert rules
// visually. Users can drag-and-drop signal blocks and connect them with
// AND/OR/NOT logic operators.
//
// Features:
// - Signal blocks for each detection type (BOS, FVG, Harmonic, etc.)
// - Logic connectors: AND, OR, NOT, XOR
// - Live preview: evaluate a rule against historical data to show when
// it would have triggered
// - Rule sharing: export/import rules as encoded text
// - Parameter tuning: confidence thresholds, timeframe filters, direction
// - Arabic labels for all signal types and operators
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types'

// ── Block Types ─────────────────────────────────────────────────────

/** Signal block category */
export type BlockCategory = 'harmonic' | 'smc' | 'elliott' | 'wyckoff' | 'candlestick' | 'volume' | 'fibonacci' | 'trendline' | 'custom';

/** Logic connector between blocks */
export type LogicConnector = 'AND' | 'OR' | 'NOT' | 'XOR' | 'NAND';

/** Direction filter for a block */
export type BlockDirection = 'bullish' | 'bearish' | 'any';

/** Timeframe filter */
export type BlockTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | 'any';

/** A single signal block in the rule builder */
export interface SignalBlock {
 /** Unique block ID */
 id: string;
 /** Block category */
 category: BlockCategory;
 /** Specific signal type (e.g. 'Gartley', 'BOS', 'Spring') */
 signalType: string;
 /** Arabic label */
 labelAr: string;
 /** Direction filter */
 direction: BlockDirection;
 /** Timeframe filter */
 timeframe: BlockTimeframe;
 /** Minimum confidence (0-1) */
 minConfidence: number;
 /** Optional: sub-type filter (e.g. 'impulse' for Elliott) */
 subType?: string;
 /** Is this block currently enabled? */
 enabled: boolean;
 /** Color for visual display */
 color: string;
 /** Position in the rule (for visual layout) */
 position: { x: number; y: number };
}

/** A connection between two blocks with a logic operator */
export interface BlockConnection {
 /** Source block ID */
 fromId: string;
 /** Target block ID */
 toId: string;
 /** Logic connector */
 connector: LogicConnector;
}

/** A complete visual rule */
export interface VisualRule {
 /** Unique rule ID */
 id: string;
 /** Rule name (Arabic) */
 nameAr: string;
 /** Signal blocks */
 blocks: SignalBlock[];
 /** Connections between blocks */
 connections: BlockConnection[];
 /** Root block ID (entry point for evaluation) */
 rootBlockId: string;
 /** Whether this rule is active */
 enabled: boolean;
 /** Alert priority when triggered */
 priority: 'low' | 'medium' | 'high' | 'critical';
 /** Cooldown period in seconds */
 cooldownSeconds: number;
 /** Creation timestamp */
 createdAt: number;
 /** Last modified timestamp */
 modifiedAt: number;
 /** Number of times this rule has triggered */
 triggerCount: number;
}

/** Evaluation result for a rule against analysis data */
export interface RuleEvaluationResult {
 /** Whether the rule triggered */
 triggered: boolean;
 /** Which blocks matched */
 matchedBlocks: string[];
 /** Combined direction of matched blocks */
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Combined confidence */
 confidence: number;
 /** Key price level */
 keyLevel: number;
 /** Evaluation trace (for debugging/preview) */
 trace: Array<{
 blockId: string;
 signalType: string;
 matched: boolean;
 confidence: number;
 }>;
}

/** Preview point — when a rule would have triggered in historical data */
export interface RulePreviewPoint {
 /** Timestamp when the rule would trigger */
 timestamp: number;
 /** Price at trigger time */
 price: number;
 /** Direction */
 direction: 'bullish' | 'bearish' | 'neutral';
 /** Confidence */
 confidence: number;
 /** Which blocks matched */
 matchedBlockLabels: string[];
}

// ── Signal Block Definitions (Library) ──────────────────────────────

/** Pre-defined signal blocks available in the builder */
export const SIGNAL_BLOCK_LIBRARY: Array<{
 category: BlockCategory;
 signalType: string;
 labelAr: string;
 color: string;
 defaultConfidence: number;
}> = [
 // Harmonic Patterns
 { category: 'harmonic', signalType: 'Gartley', labelAr: 'pattern ', color: '#B388FF', defaultConfidence: 0.6 },
 { category: 'harmonic', signalType: 'Bat', labelAr: 'pattern ', color: '#B388FF', defaultConfidence: 0.6 },
 { category: 'harmonic', signalType: 'Butterfly', labelAr: 'pattern ', color: '#B388FF', defaultConfidence: 0.6 },
 { category: 'harmonic', signalType: 'Crab', labelAr: 'pattern ', color: '#B388FF', defaultConfidence: 0.6 },
 { category: 'harmonic', signalType: 'Shark', labelAr: 'pattern ', color: '#B388FF', defaultConfidence: 0.6 },
 { category: 'harmonic', signalType: 'Cypher', labelAr: 'pattern Cypher', color: '#B388FF', defaultConfidence: 0.6 },
 { category: 'harmonic', signalType: 'any', labelAr: 'which pattern ', color: '#B388FF', defaultConfidence: 0.5 },

 // SMC
 { category: 'smc', signalType: 'BOS', labelAr: ' structure (BOS)', color: '#00D4FF', defaultConfidence: 0.65 },
 { category: 'smc', signalType: 'CHoCH', labelAr: ' (CHoCH)', color: '#00D4FF', defaultConfidence: 0.6 },
 { category: 'smc', signalType: 'OrderBlock', labelAr: 'but or', color: '#00D4FF', defaultConfidence: 0.55 },
 { category: 'smc', signalType: 'FVG', labelAr: ' value ', color: '#00D4FF', defaultConfidence: 0.5 },

 // Elliott Wave
 { category: 'elliott', signalType: 'impulse', labelAr: 'wave ', color: '#10b981', defaultConfidence: 0.6 },
 { category: 'elliott', signalType: 'correction', labelAr: 'wave correct', color: '#10b981', defaultConfidence: 0.55 },
 { category: 'elliott', signalType: 'wave3', labelAr: 'wave 3 ( wave)', color: '#10b981', defaultConfidence: 0.65 },

 // Wyckoff
 { category: 'wyckoff', signalType: 'spring', labelAr: 'Spring (Spring)', color: '#FFB800', defaultConfidence: 0.7 },
 { category: 'wyckoff', signalType: 'SOS', labelAr: 'marker strength (SOS)', color: '#FFB800', defaultConfidence: 0.65 },
 { category: 'wyckoff', signalType: 'UTAD', labelAr: 'UTAD (above high)', color: '#FFB800', defaultConfidence: 0.7 },
 { category: 'wyckoff', signalType: 'Accumulation', labelAr: 'how much', color: '#FFB800', defaultConfidence: 0.5 },
 { category: 'wyckoff', signalType: 'Distribution', labelAr: '', color: '#FFB800', defaultConfidence: 0.5 },

 // Candlestick
 { category: 'candlestick', signalType: 'Engulfing', labelAr: '', color: '#ef4444', defaultConfidence: 0.55 },
 { category: 'candlestick', signalType: 'Hammer', labelAr: '', color: '#ef4444', defaultConfidence: 0.5 },
 { category: 'candlestick', signalType: 'Doji', labelAr: '', color: '#ef4444', defaultConfidence: 0.4 },
 { category: 'candlestick', signalType: 'MorningStar', labelAr: 'star morning', color: '#ef4444', defaultConfidence: 0.55 },
 { category: 'candlestick', signalType: 'EveningStar', labelAr: 'star ', color: '#ef4444', defaultConfidence: 0.55 },

 // Volume
 { category: 'volume', signalType: 'spike', labelAr: 'sudden volume spike', color: '#00D4FF', defaultConfidence: 0.45 },
 { category: 'volume', signalType: 'dryup', labelAr: ' sie', color: '#00D4FF', defaultConfidence: 0.4 },

 // Fibonacci
 { category: 'fibonacci', signalType: 'retracement0618', labelAr: ' 61.8%', color: '#d4af37', defaultConfidence: 0.55 },
 { category: 'fibonacci', signalType: 'retracement0382', labelAr: ' 38.2%', color: '#d4af37', defaultConfidence: 0.5 },

 // Trendline
 { category: 'trendline', signalType: 'touch', labelAr: ' font direction', color: '#6366f1', defaultConfidence: 0.5 },
 { category: 'trendline', signalType: 'break', labelAr: ' font direction', color: '#6366f1', defaultConfidence: 0.6 },
];

/** Logic connector Arabic labels */
export const CONNECTOR_LABELS_AR: Record<LogicConnector, string> = {
 AND: ' (AND)',
 OR: 'or (OR)',
 NOT: ' (NOT)',
 XOR: 'someonethey (XOR)',
 NAND: ' allthey (NAND)',
};

/** Category Arabic labels */
export const CATEGORY_LABELS_AR: Record<BlockCategory, string> = {
 harmonic: 'patterns ',
 smc: 'Smart Money Concepts',
 elliott: 'waves ',
 wyckoff: 'analysis ',
 candlestick: 'patterns ',
 volume: 'analysis sie',
 fibonacci: 'levels in',
 trendline: 'lines direction',
 custom: 'custom',
};

// ── In-memory State ─────────────────────────────────────────────────

const rules = new Map<string, VisualRule>();
const RULES_KEY = 'roua-visual-rules';
const MAX_RULES = 50;
let lastTriggerTimes = new Map<string, number>();

// Load persisted rules
function loadRules(): void {
 try {
 if (typeof window === 'undefined') return;
 const stored = localStorage.getItem(RULES_KEY);
 if (stored) {
 const parsed = JSON.parse(stored);
 if (Array.isArray(parsed)) {
 for (const rule of parsed) {
 if (rule.id) rules.set(rule.id, rule);
 }
 }
 }
 } catch { /* not available */ }
}
loadRules();

function persistRules(): void {
 try {
 if (typeof window === 'undefined') return;
 const all = Array.from(rules.values());
 localStorage.setItem(RULES_KEY, JSON.stringify(all));
 } catch { /* not available */ }
}

// ── Block ID Generator ──────────────────────────────────────────────

let blockIdCounter = 0;
function generateBlockId(): string {
 return `block_${Date.now()}_${++blockIdCounter}`;
}

let ruleIdCounter = 0;
function generateRuleId(): string {
 return `rule_${Date.now()}_${++ruleIdCounter}`;
}

// ── Rule Creation ───────────────────────────────────────────────────

/**
 * Create a new visual rule with a single root block.
 */
export function createVisualRule(nameAr: string, rootBlock: Omit<SignalBlock, 'id' | 'position'>): VisualRule {
 const rootId = generateBlockId();
 const root: SignalBlock = {
 ...rootBlock,
 id: rootId,
 position: { x: 200, y: 100 },
 };

 const rule: VisualRule = {
 id: generateRuleId(),
 nameAr,
 blocks: [root],
 connections: [],
 rootBlockId: rootId,
 enabled: true,
 priority: 'medium',
 cooldownSeconds: 300,
 createdAt: Date.now(),
 modifiedAt: Date.now(),
 triggerCount: 0,
 };

 rules.set(rule.id, rule);
 persistRules();
 return rule;
}

/**
 * Add a signal block to a rule and connect it to an existing block.
 */
export function addBlockToRule(
 ruleId: string,
 block: Omit<SignalBlock, 'id' | 'position'>,
 connectToId: string,
 connector: LogicConnector,
): SignalBlock | null {
 const rule = rules.get(ruleId);
 if (!rule) return null;

 const newBlock: SignalBlock = {
 ...block,
 id: generateBlockId(),
 position: {
 x: 200 + (rule.blocks.length * 60),
 y: 100 + (rule.blocks.length % 2 === 0 ? 80 : 0),
 },
 };

 rule.blocks.push(newBlock);
 rule.connections.push({
 fromId: connectToId,
 toId: newBlock.id,
 connector,
 });
 rule.modifiedAt = Date.now();

 rules.set(ruleId, rule);
 persistRules();
 return newBlock;
}

/**
 * Remove a block and its connections from a rule.
 */
export function removeBlockFromRule(ruleId: string, blockId: string): boolean {
 const rule = rules.get(ruleId);
 if (!rule || rule.rootBlockId === blockId) return false; // Can't remove root

 rule.blocks = rule.blocks.filter(b => b.id !== blockId);
 rule.connections = rule.connections.filter(c => c.fromId !== blockId && c.toId !== blockId);
 rule.modifiedAt = Date.now();

 rules.set(ruleId, rule);
 persistRules();
 return true;
}

/**
 * Update a block's properties.
 */
export function updateBlock(ruleId: string, blockId: string, updates: Partial<SignalBlock>): boolean {
 const rule = rules.get(ruleId);
 if (!rule) return false;

 const block = rule.blocks.find(b => b.id === blockId);
 if (!block) return false;

 Object.assign(block, updates, { id: blockId }); // Preserve ID
 rule.modifiedAt = Date.now();
 rules.set(ruleId, rule);
 persistRules();
 return true;
}

// ── Rule Management ─────────────────────────────────────────────────

/** Get all rules */
export function getVisualRules(): VisualRule[] {
 return Array.from(rules.values()).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Get a specific rule */
export function getVisualRule(ruleId: string): VisualRule | null {
 return rules.get(ruleId) ?? null;
}

/** Delete a rule */
export function deleteVisualRule(ruleId: string): boolean {
 const deleted = rules.delete(ruleId);
 if (deleted) persistRules();
 return deleted;
}

/** Toggle a rule on/off */
export function toggleVisualRule(ruleId: string, enabled: boolean): void {
 const rule = rules.get(ruleId);
 if (rule) {
 rule.enabled = enabled;
 rule.modifiedAt = Date.now();
 rules.set(ruleId, rule);
 persistRules();
 }
}

// ── Rule Evaluation ─────────────────────────────────────────────────

/**
 * Evaluate a single block against analysis data.
 */
function evaluateBlock(
 block: SignalBlock,
 analysisData: RuleAnalysisData,
): { matched: boolean; confidence: number; direction: 'bullish' | 'bearish' | 'neutral'; keyLevel: number } {
 if (!block.enabled) {
 return { matched: false, confidence: 0, direction: 'neutral', keyLevel: 0 };
 }

 const dirMatch = (dir: string) => block.direction === 'any' || dir === block.direction;
 const confMatch = (conf: number) => conf >= block.minConfidence;

 switch (block.category) {
 case 'harmonic': {
 for (const p of analysisData.harmonicPatterns) {
 if ((block.signalType === 'any' || p.type === block.signalType) && dirMatch(p.direction) && confMatch(p.confidence)) {
 return { matched: true, confidence: p.confidence, direction: p.direction, keyLevel: p.prLevel };
 }
 }
 break;
 }
 case 'smc': {
 if (block.signalType === 'BOS' || block.signalType === 'CHoCH') {
 for (const brk of analysisData.structureBreaks) {
 if (brk.type === block.signalType && dirMatch(brk.direction)) {
 return { matched: true, confidence: 0.7, direction: brk.direction, keyLevel: brk.price };
 }
 }
 } else if (block.signalType === 'OrderBlock') {
 for (const ob of analysisData.orderBlocks) {
 if (!ob.broken && dirMatch(ob.type) && confMatch(ob.strength)) {
 return { matched: true, confidence: ob.strength, direction: ob.type, keyLevel: ob.price };
 }
 }
 } else if (block.signalType === 'FVG') {
 for (const fvg of analysisData.fvgs) {
 if (!fvg.filled && dirMatch(fvg.type)) {
 return { matched: true, confidence: 0.55, direction: fvg.type, keyLevel: fvg.midPrice };
 }
 }
 }
 break;
 }
 case 'elliott': {
 if (analysisData.elliottResult) {
 const e = analysisData.elliottResult;
 if (dirMatch(e.direction) && confMatch(e.confidence)) {
 if (!block.subType || e.waveType?.toLowerCase().includes(block.subType.toLowerCase())) {
 return { matched: true, confidence: e.confidence, direction: e.direction, keyLevel: analysisData.currentPrice };
 }
 }
 }
 break;
 }
 case 'wyckoff': {
 if (analysisData.wyckoffResult) {
 const w = analysisData.wyckoffResult;
 const typeMatch = block.signalType === 'Accumulation'
 ? w.scheme === 'accumulation'
 : block.signalType === 'Distribution'
 ? w.scheme === 'distribution'
 : w.events.includes(block.signalType);
 if (typeMatch && dirMatch(w.direction) && confMatch(w.confidence)) {
 return { matched: true, confidence: w.confidence, direction: w.direction, keyLevel: analysisData.currentPrice };
 }
 }
 break;
 }
 case 'candlestick': {
 for (const p of analysisData.candlestickPatterns) {
 if (p.type === block.signalType && dirMatch(p.direction) && confMatch(p.confidence)) {
 return { matched: true, confidence: p.confidence, direction: p.direction, keyLevel: p.price };
 }
 }
 break;
 }
 case 'volume': {
 for (const va of analysisData.volumeAnomalies) {
 if (va.type === block.signalType && dirMatch(va.direction)) {
 return { matched: true, confidence: 0.5, direction: va.direction, keyLevel: analysisData.currentPrice };
 }
 }
 break;
 }
 case 'fibonacci': {
 for (const fib of analysisData.fibonacciLevels) {
 if (fib.label.includes(block.signalType.replace('retracement', '')) && dirMatch(fib.direction)) {
 return { matched: true, confidence: 0.55, direction: fib.direction, keyLevel: fib.price };
 }
 }
 break;
 }
 case 'trendline': {
 for (const tl of analysisData.trendlineEvents) {
 if (tl.type === block.signalType && dirMatch(tl.direction)) {
 return { matched: true, confidence: 0.55, direction: tl.direction, keyLevel: tl.price };
 }
 }
 break;
 }
 }

 return { matched: false, confidence: 0, direction: 'neutral', keyLevel: 0 };
}

/**
 * Evaluate a complete visual rule against analysis data.
 * Traverses the block tree following connections and applying logic operators.
 */
export function evaluateVisualRule(rule: VisualRule, analysisData: RuleAnalysisData): RuleEvaluationResult {
 if (!rule.enabled) {
 return { triggered: false, matchedBlocks: [], direction: 'neutral', confidence: 0, keyLevel: 0, trace: [] };
 }

 // Check cooldown
 const lastTrigger = lastTriggerTimes.get(rule.id) || 0;
 if (Date.now() - lastTrigger < rule.cooldownSeconds * 1000) {
 return { triggered: false, matchedBlocks: [], direction: 'neutral', confidence: 0, keyLevel: 0, trace: [] };
 }

 // Evaluate all blocks
 const blockResults = new Map<string, ReturnType<typeof evaluateBlock>>();
 const trace: RuleEvaluationResult['trace'] = [];

 for (const block of rule.blocks) {
 const result = evaluateBlock(block, analysisData);
 blockResults.set(block.id, result);
 trace.push({
 blockId: block.id,
 signalType: block.signalType,
 matched: result.matched,
 confidence: result.confidence,
 });
 }

 // Build evaluation tree from connections
 // The root block is the starting point
 const rootResult = evaluateTree(rule.rootBlockId, rule, blockResults);

 const matchedBlocks = Array.from(blockResults.entries())
 .filter(([_, r]) => r.matched)
 .map(([id]) => id);

 const bullishConf = Array.from(blockResults.values())
 .filter(r => r.matched && r.direction === 'bullish')
 .reduce((s, r) => s + r.confidence, 0);
 const bearishConf = Array.from(blockResults.values())
 .filter(r => r.matched && r.direction === 'bearish')
 .reduce((s, r) => s + r.confidence, 0);

 const direction: 'bullish' | 'bearish' | 'neutral' =
 bullishConf > bearishConf * 1.5 ? 'bullish'
 : bearishConf > bullishConf * 1.5 ? 'bearish'
 : 'neutral';

 const totalConf = bullishConf + bearishConf;
 const confidence = totalConf > 0 ? Math.max(bullishConf, bearishConf) / totalConf : 0;
 const keyLevel = Array.from(blockResults.values())
 .find(r => r.matched && r.keyLevel > 0)?.keyLevel ?? analysisData.currentPrice;

 const triggered = rootResult;

 if (triggered) {
 lastTriggerTimes.set(rule.id, Date.now());
 rule.triggerCount++;
 rules.set(rule.id, rule);
 }

 return { triggered, matchedBlocks, direction, confidence, keyLevel, trace };
}

/** Recursively evaluate the rule tree */
function evaluateTree(
 blockId: string,
 rule: VisualRule,
 blockResults: Map<string, ReturnType<typeof evaluateBlock>>,
): boolean {
 const blockResult = blockResults.get(blockId);
 if (!blockResult) return false;

 // Find all connections FROM this block
 const outConnections = rule.connections.filter(c => c.fromId === blockId);

 if (outConnections.length === 0) {
 // Leaf node — just return whether this block matched
 return blockResult.matched;
 }

 // For each connection, evaluate the child tree and apply the logic
 const childResults: boolean[] = [];
 for (const conn of outConnections) {
 const childResult = evaluateTree(conn.toId, rule, blockResults);
 childResults.push(childResult);
 }

 // Apply the connector from the first connection (all connections from same block use same logic)
 const connector = outConnections[0].connector;

 switch (connector) {
 case 'AND':
 return blockResult.matched && childResults.every(r => r);
 case 'OR':
 return blockResult.matched || childResults.some(r => r);
 case 'NOT':
 return blockResult.matched && !childResults.some(r => r);
 case 'XOR':
 return blockResult.matched !== childResults.some(r => r);
 case 'NAND':
 return !(blockResult.matched && childResults.every(r => r));
 default:
 return blockResult.matched;
 }
}

// ── Analysis Data Interface ─────────────────────────────────────────

/** Data structure for rule evaluation */
export interface RuleAnalysisData {
 harmonicPatterns: Array<{
 type: string;
 direction: 'bullish' | 'bearish';
 confidence: number;
 prLevel: number;
 }>;
 orderBlocks: Array<{
 type: 'bullish' | 'bearish';
 strength: number;
 price: number;
 broken: boolean;
 }>;
 fvgs: Array<{
 type: 'bullish' | 'bearish';
 filled: boolean;
 midPrice: number;
 }>;
 structureBreaks: Array<{
 type: 'BOS' | 'CHoCH';
 direction: 'bullish' | 'bearish';
 price: number;
 }>;
 elliottResult: {
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 waveType: string;
 } | null;
 wyckoffResult: {
 scheme: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 events: string[];
 } | null;
 candlestickPatterns: Array<{
 type: string;
 direction: 'bullish' | 'bearish';
 confidence: number;
 price: number;
 }>;
 volumeAnomalies: Array<{
 type: 'spike' | 'dryup';
 direction: 'bullish' | 'bearish';
 }>;
 fibonacciLevels: Array<{
 ratio: number;
 price: number;
 direction: 'bullish' | 'bearish';
 label: string;
 }>;
 trendlineEvents: Array<{
 type: 'touch' | 'break';
 direction: 'bullish' | 'bearish';
 price: number;
 }>;
 currentPrice: number;
}

// ── Rule Export/Import ───────────────────────────────────────────────

/**
 * Export a rule as a shareable encoded string.
 * Users can share rules by copying this string.
 */
export function exportRule(rule: VisualRule): string {
 try {
 const json = JSON.stringify(rule);
 // Base64 encode for sharing
 if (typeof window !== 'undefined') {
 return btoa(encodeURIComponent(json));
 }
 return Buffer.from(encodeURIComponent(json)).toString('base64');
 } catch {
 return '';
 }
}

/**
 * Import a rule from an encoded string.
 */
export function importRule(encoded: string): VisualRule | null {
 try {
 let json: string;
 if (typeof window !== 'undefined') {
 json = decodeURIComponent(atob(encoded));
 } else {
 json = decodeURIComponent(Buffer.from(encoded, 'base64').toString());
 }
 const rule = JSON.parse(json) as VisualRule;
 if (!rule.id || !rule.blocks || !rule.rootBlockId) return null;
 // Assign a new ID to avoid collisions
 rule.id = generateRuleId();
 rules.set(rule.id, rule);
 persistRules();
 return rule;
 } catch {
 return null;
 }
}

// ── Pre-built Rule Templates ────────────────────────────────────────

/** Create a pre-built "Triple Confluence" template rule */
export function createTripleConfluenceRule(): VisualRule {
 const rule = createVisualRule(
 'confluence ternary: + BOS + ',
 {
 category: 'harmonic',
 signalType: 'any',
 labelAr: 'which pattern ',
 direction: 'any',
 timeframe: 'any',
 minConfidence: 0.5,
 enabled: true,
 color: '#B388FF',
 },
 );

 addBlockToRule(rule.id, {
 category: 'smc',
 signalType: 'BOS',
 labelAr: ' structure (BOS)',
 direction: 'any',
 timeframe: 'any',
 minConfidence: 0.5,
 enabled: true,
 color: '#00D4FF',
 }, rule.rootBlockId, 'AND');

 addBlockToRule(rule.id, {
 category: 'wyckoff',
 signalType: 'SOS',
 labelAr: 'marker strength (SOS)',
 direction: 'any',
 timeframe: 'any',
 minConfidence: 0.4,
 enabled: true,
 color: '#FFB800',
 }, rule.rootBlockId, 'AND');

 rule.priority = 'critical';
 rule.cooldownSeconds = 600;
 rules.set(rule.id, rule);
 persistRules();
 return rule;
}

/** Create a pre-built "Spring + BOS" template rule */
export function createSpringBOSRule(): VisualRule {
 const rule = createVisualRule(
 'Spring + BOS bullish',
 {
 category: 'wyckoff',
 signalType: 'spring',
 labelAr: 'Spring (Spring)',
 direction: 'bullish',
 timeframe: 'any',
 minConfidence: 0.6,
 enabled: true,
 color: '#FFB800',
 },
 );

 addBlockToRule(rule.id, {
 category: 'smc',
 signalType: 'BOS',
 labelAr: ' structure bullish',
 direction: 'bullish',
 timeframe: 'any',
 minConfidence: 0.6,
 enabled: true,
 color: '#00D4FF',
 }, rule.rootBlockId, 'AND');

 rule.priority = 'critical';
 rule.cooldownSeconds = 600;
 rules.set(rule.id, rule);
 persistRules();
 return rule;
}

// ── Evaluate All Rules ──────────────────────────────────────────────

/**
 * Evaluate all active visual rules against analysis data.
 * Returns all triggered rules with their results.
 */
export function evaluateAllVisualRules(analysisData: RuleAnalysisData): Array<{
 rule: VisualRule;
 result: RuleEvaluationResult;
}> {
 const results: Array<{ rule: VisualRule; result: RuleEvaluationResult }> = [];

 for (const rule of rules.values()) {
 if (!rule.enabled) continue;
 const result = evaluateVisualRule(rule, analysisData);
 if (result.triggered) {
 results.push({ rule, result });
 }
 }

 // Sort by priority
 const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
 results.sort((a, b) => priorityOrder[a.rule.priority] - priorityOrder[b.rule.priority]);

 return results;
}
