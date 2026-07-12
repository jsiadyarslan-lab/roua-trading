// ═══════════════════════════════════════════════════════════════════════
// ROUA Trade Journal — Automatic Trade Logging & Reporting
//
// Automatically records every trade proposal, tracks its outcome,
// and generates professional reports for investor presentations.
//
// This is the PROOF engine — it transforms daily platform usage
// into documented evidence of trading system performance.
// ═══════════════════════════════════════════════════════════════════════

import type { TradeProposal, TradeSignal, RevolutionaryBoost } from './AutoTradeEngine';

// ── Types ───────────────────────────────────────────────────────────

/** Full journal entry for a trade — from proposal to resolution */
export interface JournalEntry {
 /** Unique entry ID */
 id: string;
 /** Trade proposal ID (from AutoTradeEngine) */
 proposalId: string;

 // ── Entry Context ──
 /** Timestamp when proposal was generated */
 proposedAt: number;
 /** Date string (YYYY-MM-DD) for grouping */
 date: string;
 /** Time of day */
 time: string;
 /** Trading pair (from chart) */
 symbol: string;
 /** Timeframe */
 timeframe: string;
 /** Market regime at entry time */
 regime: string;

 // ── Trade Setup ──
 direction: 'bullish' | 'bearish';
 entryPrice: number;
 stopLoss: number;
 takeProfits: number[];
 positionSie: number;
 riskAmount: number;
 rewardAmount: number;
 rrRatio: number;

 // ── Signal Context ──
 /** All signals that agreed on this trade */
 agreeingSignals: TradeSignal[];
 /** Confluence score at entry */
 confluenceScore: number;
 /** Confidence at entry */
 confidence: number;
 /** Quality score at entry */
 qualityScore: number;
 /** Revolutionary boost data (if any) */
 revolutionaryBoost?: RevolutionaryBoost;
 /** Which boost factors were active */
 boostFactorsActive: string[];

 // ── MTF Context ──
 mtfDirection?: 'bullish' | 'bearish' | 'neutral';
 mtfScore?: number;
 mtfAgreeingTFs?: number;

 // ── Outcome ──
 /** Current status */
 status: 'pending' | 'active' | 'hit_tp1' | 'hit_tp2' | 'hit_tp3' | 'hit_sl' | 'trail_sl' | 'breakeven' | 'expired' | 'closed';
 /** Final P&L in quote currency */
 realiedPnL: number;
 /** Final P&L as percentage */
 pnlPct: number;
 /** Timestamp when resolved */
 resolvedAt: number | null;
 /** Duration in minutes from proposal to resolution */
 durationMinutes: number | null;
 /** Which TP was hit (1, 2, or 3) or 0 for SL */
 exitLevel: number;
 /** R multiple achieved (negative for loss) */
 rMultiple: number;

 // ── Post-Analysis ──
 /** Was the revolutionary boost beneficial? */
 boostHelped: boolean | null;
 /** Arabic description */
 descriptionAr: string;
 /** User notes (manual) */
 notes: string;
}

/** Aggregated statistics over a time period */
export interface JournalStats {
 period: string;
 startDate: string;
 endDate: string;

 // ── Basic Stats ──
 totalTrades: number;
 closedTrades: number;
 pendingTrades: number;
 wins: number;
 losses: number;
 breakevens: number;
 winRate: number;

 // ── P&L Stats ──
 totalPnL: number;
 avgPnL: number;
 avgWinPnL: number;
 avgLossPnL: number;
 bestTradePnL: number;
 worstTradePnL: number;
 profitFactor: number;

 // ── Risk Stats ──
 avgRR: number;
 avgRMultiple: number;
 maxConsecutiveWins: number;
 maxConsecutiveLosses: number;
 maxDrawdown: number;
 sharpeEstimate: number;

 // ── Time Stats ──
 avgDurationMinutes: number;
 tradesPerDay: number;

 // ── Signal Breakdown ──
 byDirection: {
 bullish: { trades: number; wins: number; winRate: number; pnl: number };
 bearish: { trades: number; wins: number; winRate: number; pnl: number };
 };
 bySource: Record<string, { trades: number; wins: number; winRate: number; pnl: number; avgConfidence: number }>;
 byRegime: Record<string, { trades: number; wins: number; winRate: number }>;

 // ── Boost Impact ──
 boostTradesCount: number;
 boostTradesWinRate: number;
 noBoostTradesCount: number;
 noBoostTradesWinRate: number;
 boostLift: number;

 // ── Weekly Breakdown ──
 weeklyBreakdown: Array<{
 week: string;
 trades: number;
 wins: number;
 winRate: number;
 pnl: number;
 cumulativePnL: number;
 }>;
}

/** Export format for JSON download */
export interface JournalExport {
 exportedAt: number;
 platformVersion: string;
 entries: JournalEntry[];
 stats: JournalStats;
}

// ── Storage ─────────────────────────────────────────────────────────

const JOURNAL_KEY = 'roua-trade-journal';
const MAX_ENTRIES = 2000;

let entries: JournalEntry[] = [];

// ── Persistence ─────────────────────────────────────────────────────

function loadJournal(): void {
 if (entries.length > 0) return;
 try {
 if (typeof window !== 'undefined') {
 const stored = localStorage.getItem(JOURNAL_KEY);
 if (stored) {
 const parsed = JSON.parse(stored);
 if (Array.isArray(parsed)) {
 entries = parsed.slice(-MAX_ENTRIES);
 }
 }
 }
 } catch { /* not available */ }
}

function persistJournal(): void {
 try {
 if (typeof window !== 'undefined') {
 localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
 }
 } catch { /* not available */ }
}

loadJournal();

// ── Journal Recording ───────────────────────────────────────────────

/**
 * Record a new trade proposal in the journal.
 * Called automatically when generateTradeProposal produces a proposal.
 */
export function journalTradeProposal(opts: {
 proposal: TradeProposal;
 symbol?: string;
 regime?: string;
 revolutionaryBoost?: RevolutionaryBoost;
}): JournalEntry {
 const { proposal, symbol, regime, revolutionaryBoost } = opts;

 const now = new Date(proposal.proposedAt);
 const dateStr = now.toISOString().split('T')[0];
 const timeStr = now.toTimeString().split(' ')[0];

 // Identify active boost factors
 const boostFactorsActive: string[] = [];
 if (revolutionaryBoost?.confluenceZoneBoost) boostFactorsActive.push('confluence-one');
 if (revolutionaryBoost?.backtestSourceWeights) boostFactorsActive.push('backtest-weights');
 if (revolutionaryBoost?.correlationBoost) boostFactorsActive.push('correlation');
 if (revolutionaryBoost?.predictionNearCompletion) boostFactorsActive.push('prediction');
 if (revolutionaryBoost?.explanationRisk) boostFactorsActive.push('risk-assessment');

 const entry: JournalEntry = {
 id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
 proposalId: proposal.id,
 proposedAt: proposal.proposedAt,
 date: dateStr,
 time: timeStr,
 symbol: symbol || 'UNKNOWN',
 timeframe: proposal.timeframe,
 regime: regime || 'unknown',
 direction: proposal.direction,
 entryPrice: proposal.entryPrice,
 stopLoss: proposal.stopLoss,
 takeProfits: proposal.takeProfits,
 positionSie: proposal.positionSie,
 riskAmount: proposal.riskAmount,
 rewardAmount: proposal.rewardAmount,
 rrRatio: proposal.rrRatio,
 agreeingSignals: [...proposal.agreeingSignals],
 confluenceScore: proposal.confluenceScore,
 confidence: proposal.confidence,
 qualityScore: proposal.qualityScore,
 revolutionaryBoost,
 boostFactorsActive,
 mtfDirection: proposal.mtfConfluence?.direction,
 mtfScore: proposal.mtfConfluence?.score,
 mtfAgreeingTFs: proposal.mtfConfluence?.agreeingTFs,
 status: 'pending',
 realiedPnL: 0,
 pnlPct: 0,
 resolvedAt: null,
 durationMinutes: null,
 exitLevel: 0,
 rMultiple: 0,
 boostHelped: null,
 descriptionAr: proposal.descriptionAr,
 notes: '',
 };

 entries.push(entry);
 if (entries.length > MAX_ENTRIES) {
 entries = entries.slice(-MAX_ENTRIES);
 }
 persistJournal();

 return entry;
}

/**
 * Update journal entries based on AutoTradeEngine's autoEvaluateProposals.
 * Called after each evaluation cycle to sync statuses.
 */
export function syncJournalWithProposals(updatedProposals: TradeProposal[]): void {
 let modified = false;

 for (const proposal of updatedProposals) {
 const entry = entries.find(e => e.proposalId === proposal.id);
 if (!entry) continue;

 const oldStatus = entry.status;
 const newStatus = proposal.status;

 if (oldStatus !== newStatus && isResolvedStatus(newStatus)) {
 entry.status = newStatus;
 entry.resolvedAt = Date.now();
 entry.durationMinutes = Math.round((entry.resolvedAt - entry.proposedAt) / 60000);

 // Calculate P&L
 const risk = Math.abs(entry.entryPrice - entry.stopLoss);
 const pnl = proposal.pnl.netPnL;
 entry.realiedPnL = Math.round(pnl * 100) / 100;
 entry.pnlPct = risk > 0 ? Math.round((pnl / (entry.positionSie * risk)) * 10000) / 100 : 0;

 // Determine exit level
 if (newStatus === 'hit_tp1') entry.exitLevel = 1;
 else if (newStatus === 'hit_tp2') entry.exitLevel = 2;
 else if (newStatus === 'hit_tp3') entry.exitLevel = 3;
 else if (newStatus === 'hit_sl' || newStatus === 'trail_sl') entry.exitLevel = 0;
 else if (newStatus === 'breakeven') entry.exitLevel = -1;

 // Calculate R-multiple
 if (risk > 0) {
 const rawPnL = entry.direction === 'bullish'
 ? (proposal.pnl.realied > 0 ? Math.abs(proposal.takeProfits[Math.min(entry.exitLevel, 2)] - entry.entryPrice) : -risk)
 : (proposal.pnl.realied > 0 ? Math.abs(entry.entryPrice - proposal.takeProfits[Math.min(entry.exitLevel, 2)]) : -risk);
 entry.rMultiple = Math.round((rawPnL / risk) * 100) / 100;
 }

 // Did the boost help?
 if (entry.boostFactorsActive.length > 0) {
 entry.boostHelped = entry.realiedPnL > 0;
 }

 modified = true;
 } else if (oldStatus !== newStatus) {
 entry.status = newStatus;
 modified = true;
 }
 }

 if (modified) persistJournal();
}

function isResolvedStatus(status: string): boolean {
 return ['hit_tp1', 'hit_tp2', 'hit_tp3', 'hit_sl', 'trail_sl', 'breakeven', 'expired', 'closed'].includes(status);
}

/**
 * Add a manual note to a journal entry.
 */
export function addJournalNote(entryId: string, note: string): void {
 const entry = entries.find(e => e.id === entryId);
 if (entry) {
 entry.notes = note;
 persistJournal();
 }
}

// ── Statistics Computation ──────────────────────────────────────────

/**
 * Compute comprehensive journal statistics over a date range.
 */
export function computeJournalStats(
 startDate?: string,
 endDate?: string,
): JournalStats {
 const now = new Date();
 const end = endDate || now.toISOString().split('T')[0];
 const start = startDate || new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];

 const filtered = entries.filter(e => e.date >= start && e.date <= end);
 const closed = filtered.filter(e => isResolvedStatus(e.status));
 const wins = closed.filter(e => e.realiedPnL > 0);
 const losses = closed.filter(e => e.realiedPnL < 0);
 const breakevens = closed.filter(e => e.realiedPnL === 0);

 // P&L
 const totalPnL = closed.reduce((s, e) => s + e.realiedPnL, 0);
 const avgPnL = closed.length > 0 ? totalPnL / closed.length : 0;
 const avgWinPnL = wins.length > 0 ? wins.reduce((s, e) => s + e.realiedPnL, 0) / wins.length : 0;
 const avgLossPnL = losses.length > 0 ? losses.reduce((s, e) => s + e.realiedPnL, 0) / losses.length : 0;
 const grossProfit = wins.reduce((s, e) => s + e.realiedPnL, 0);
 const grossLoss = Math.abs(losses.reduce((s, e) => s + e.realiedPnL, 0));

 // Consecutive
 let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
 for (const e of closed) {
 if (e.realiedPnL > 0) { consWins++; consLosses = 0; maxConsWins = Math.max(maxConsWins, consWins); }
 else if (e.realiedPnL < 0) { consLosses++; consWins = 0; maxConsLosses = Math.max(maxConsLosses, consLosses); }
 else { consWins = 0; consLosses = 0; }
 }

 // Drawdown
 let cumPnL = 0, peakPnL = 0, maxDD = 0;
 for (const e of closed) {
 cumPnL += e.realiedPnL;
 if (cumPnL > peakPnL) peakPnL = cumPnL;
 const dd = peakPnL - cumPnL;
 if (dd > maxDD) maxDD = dd;
 }

 // R-multiple
 const avgR = closed.length > 0 ? closed.reduce((s, e) => s + e.rMultiple, 0) / closed.length : 0;

 // Duration
 const resolvedWithTime = closed.filter(e => e.durationMinutes !== null);
 const avgDuration = resolvedWithTime.length > 0
 ? resolvedWithTime.reduce((s, e) => s + (e.durationMinutes || 0), 0) / resolvedWithTime.length
 : 0;

 // Trades per day
 const uniqueDays = new Set(closed.map(e => e.date)).sie;
 const tradesPerDay = uniqueDays > 0 ? closed.length / uniqueDays : 0;

 // By direction
 const bullTrades = closed.filter(e => e.direction === 'bullish');
 const bearTrades = closed.filter(e => e.direction === 'bearish');

 // By source
 const bySource: Record<string, { trades: number; wins: number; winRate: number; pnl: number; avgConfidence: number }> = {};
 for (const e of closed) {
 for (const sig of e.agreeingSignals) {
 if (!bySource[sig.source]) bySource[sig.source] = { trades: 0, wins: 0, winRate: 0, pnl: 0, avgConfidence: 0 };
 bySource[sig.source].trades++;
 if (e.realiedPnL > 0) bySource[sig.source].wins++;
 bySource[sig.source].pnl += e.realiedPnL / e.agreeingSignals.length;
 bySource[sig.source].avgConfidence += sig.confidence;
 }
 }
 for (const key of Object.keys(bySource)) {
 const s = bySource[key];
 s.winRate = s.trades > 0 ? s.wins / s.trades : 0;
 s.avgConfidence = s.trades > 0 ? s.avgConfidence / s.trades : 0;
 }

 // By regime
 const byRegime: Record<string, { trades: number; wins: number; winRate: number }> = {};
 for (const e of closed) {
 const r = e.regime || 'unknown';
 if (!byRegime[r]) byRegime[r] = { trades: 0, wins: 0, winRate: 0 };
 byRegime[r].trades++;
 if (e.realiedPnL > 0) byRegime[r].wins++;
 byRegime[r].winRate = byRegime[r].trades > 0 ? byRegime[r].wins / byRegime[r].trades : 0;
 }

 // Boost impact
 const boostTrades = closed.filter(e => e.boostFactorsActive.length > 0);
 const noBoostTrades = closed.filter(e => e.boostFactorsActive.length === 0);
 const boostWR = boostTrades.length > 0 ? boostTrades.filter(e => e.realiedPnL > 0).length / boostTrades.length : 0;
 const noBoostWR = noBoostTrades.length > 0 ? noBoostTrades.filter(e => e.realiedPnL > 0).length / noBoostTrades.length : 0;

 // Weekly breakdown
 const weeklyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
 let cumWeeklyPnL = 0;
 for (const e of closed) {
 const d = new Date(e.date);
 const weekNum = getWeekNumber(d);
 const weekKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
 if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { trades: 0, wins: 0, pnl: 0 });
 const wk = weeklyMap.get(weekKey)!;
 wk.trades++;
 if (e.realiedPnL > 0) wk.wins++;
 wk.pnl += e.realiedPnL;
 }

 const weeklyBreakdown: JournalStats['weeklyBreakdown'] = [];
 for (const [week, data] of [...weeklyMap.entries()].sort()) {
 cumWeeklyPnL += data.pnl;
 weeklyBreakdown.push({
 week,
 trades: data.trades,
 wins: data.wins,
 winRate: data.trades > 0 ? data.wins / data.trades : 0,
 pnl: Math.round(data.pnl * 100) / 100,
 cumulativePnL: Math.round(cumWeeklyPnL * 100) / 100,
 });
 }

 // Sharpe estimate (simplified)
 const returns = closed.map(e => e.pnlPct / 100);
 const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
 const variance = returns.length > 1 ? returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1) : 0;
 const stdDev = Math.sqrt(variance);
 const sharpeEstimate = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

 const daysDiff = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));

 return {
 period: `${start} to ${end}`,
 startDate: start,
 endDate: end,
 totalTrades: filtered.length,
 closedTrades: closed.length,
 pendingTrades: filtered.filter(e => !isResolvedStatus(e.status)).length,
 wins: wins.length,
 losses: losses.length,
 breakevens: breakevens.length,
 winRate: closed.length > 0 ? wins.length / closed.length : 0,
 totalPnL: Math.round(totalPnL * 100) / 100,
 avgPnL: Math.round(avgPnL * 100) / 100,
 avgWinPnL: Math.round(avgWinPnL * 100) / 100,
 avgLossPnL: Math.round(avgLossPnL * 100) / 100,
 bestTradePnL: closed.length > 0 ? Math.round(Math.max(...closed.map(e => e.realiedPnL)) * 100) / 100 : 0,
 worstTradePnL: closed.length > 0 ? Math.round(Math.min(...closed.map(e => e.realiedPnL)) * 100) / 100 : 0,
 profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
 avgRR: closed.length > 0 ? closed.reduce((s, e) => s + e.rrRatio, 0) / closed.length : 0,
 avgRMultiple: Math.round(avgR * 100) / 100,
 maxConsecutiveWins: maxConsWins,
 maxConsecutiveLosses: maxConsLosses,
 maxDrawdown: Math.round(maxDD * 100) / 100,
 sharpeEstimate: Math.round(sharpeEstimate * 100) / 100,
 avgDurationMinutes: Math.round(avgDuration),
 tradesPerDay: Math.round(tradesPerDay * 100) / 100,
 byDirection: {
 bullish: {
 trades: bullTrades.length,
 wins: bullTrades.filter(e => e.realiedPnL > 0).length,
 winRate: bullTrades.length > 0 ? bullTrades.filter(e => e.realiedPnL > 0).length / bullTrades.length : 0,
 pnl: Math.round(bullTrades.reduce((s, e) => s + e.realiedPnL, 0) * 100) / 100,
 },
 bearish: {
 trades: bearTrades.length,
 wins: bearTrades.filter(e => e.realiedPnL > 0).length,
 winRate: bearTrades.length > 0 ? bearTrades.filter(e => e.realiedPnL > 0).length / bearTrades.length : 0,
 pnl: Math.round(bearTrades.reduce((s, e) => s + e.realiedPnL, 0) * 100) / 100,
 },
 },
 bySource,
 byRegime,
 boostTradesCount: boostTrades.length,
 boostTradesWinRate: Math.round(boostWR * 100) / 100,
 noBoostTradesCount: noBoostTrades.length,
 noBoostTradesWinRate: Math.round(noBoostWR * 100) / 100,
 boostLift: noBoostWR > 0 ? Math.round((boostWR / noBoostWR) * 100) / 100 : 0,
 weeklyBreakdown,
 };
}

// ── Export Functions ─────────────────────────────────────────────────

/**
 * Export entire journal as JSON for download.
 */
export function exportJournalJSON(symbol?: string): string {
 const stats = computeJournalStats();
 const exportData: JournalExport = {
 exportedAt: Date.now(),
 platformVersion: 'ROUA V260',
 entries: symbol ? entries.filter(e => e.symbol === symbol) : entries,
 stats,
 };
 return JSON.stringify(exportData, null, 2);
}

/**
 * Generate a printable HTML report for PDF conversion.
 * This produces a self-contained HTML that can be printed to PDF.
 */
export function generateReportHTML(symbol?: string): string {
 const stats = computeJournalStats();
 const closed = entries.filter(e => isResolvedStatus(e.status) && (!symbol || e.symbol === symbol));
 const pending = entries.filter(e => !isResolvedStatus(e.status) && (!symbol || e.symbol === symbol));

 const winRatePct = Math.round(stats.winRate * 100);
 const sharpeStr = stats.sharpeEstimate > 0 ? `+${stats.sharpeEstimate}` : `${stats.sharpeEstimate}`;
 const pfStr = stats.profitFactor >= 999 ? '∞' : `${stats.profitFactor}`;

 return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>report system trade smart</title>
<style>
 @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap');
 * { margin: 0; padding: 0; box-siing: border-box; }
 body { font-family: 'Noto Sans Arabic', sans-serif; background: '#0a0a0f'; color: '#e0e0e0'; padding: 40px; direction: rtl; }
 .header { text-align: center; border-bottom: 2px solid #ffd700; padding-bottom: 20px; margin-bottom: 30px; }
 .header h1 { color: '#ffd700'; font-sie: 28px; margin-bottom: 8px; }
 .header p { color: #888; font-sie: 14px; }
 .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
 .stat-card { background: '#151520'; border: 1px solid #2a2a3a; border-radius: 12px; padding: 20px; text-align: center; }
 .stat-card .value { font-sie: 32px; font-weight: 700; margin-bottom: 4px; }
 .stat-card .label { font-sie: 13px; color: #888; }
 .green { color: '#00e676'; }
 .red { color: '#ff5252'; }
 .gold { color: '#ffd700'; }
 .blue { color: '#448aff'; }
 .section { margin-bottom: 30px; }
 .section h2 { color: '#ffd700'; font-sie: 18px; margin-bottom: 12px; border-bottom: 1px solid #2a2a3a; padding-bottom: 8px; }
 table { width: 100%; border-collapse: collapse; font-sie: 13px; }
 th { background: '#1a1a2a'; color: '#ffd700'; padding: 10px; text-align: right; border: 1px solid #2a2a3a; }
 td { padding: 8px 10px; border: 1px solid #1a1a2a; }
 tr:nth-child(even) { background: '#0f0f18'; }
 .win { color: '#00e676'; }
 .loss { color: '#ff5252'; }
 .footer { text-align: center; color: #555; font-sie: 12px; margin-top: 40px; border-top: 1px solid #2a2a3a; padding-top: 20px; }
 @media print { body { background: white; color: black; } .stat-card { border: 1px solid #ccc; } }
</style>
</head>
<body>

<div class="header">
 <h1>report system trade smart</h1>
 <p>period: ${stats.period} | : ${new Date().toLocaleDateString('ar-SA')} | V260</p>
</div>

<div class="stats-grid">
 <div class="stat-card">
 <div class="value ${winRatePct >= 50 ? 'green' : 'red'}">${winRatePct}%</div>
 <div class="label">ratio success</div>
 </div>
 <div class="stat-card">
 <div class="value ${stats.totalPnL >= 0 ? 'green' : 'red'}">${stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL}</div>
 <div class="label">what profit</div>
 </div>
 <div class="stat-card">
 <div class="value gold">${pfStr}</div>
 <div class="label">factor profit</div>
 </div>
 <div class="stat-card">
 <div class="value blue">${sharpeStr}</div>
 <div class="label"> </div>
 </div>
 <div class="stat-card">
 <div class="value">${stats.closedTrades}</div>
 <div class="label">positions </div>
 </div>
 <div class="stat-card">
 <div class="value">${stats.avgRMultiple}</div>
 <div class="label">center R</div>
 </div>
 <div class="stat-card">
 <div class="value">${stats.maxConsecutiveWins}</div>
 <div class="label">length </div>
 </div>
 <div class="stat-card">
 <div class="value red">${stats.maxDrawdown}</div>
 <div class="label"> </div>
 </div>
</div>

<div class="section">
 <h2>performance by direction</h2>
 <table>
 <tr><th>direction</th><th>trades</th><th>winning</th><th>ratio success</th><th>in profit</th></tr>
 <tr><td> (bullish)</td><td>${stats.byDirection.bullish.trades}</td><td>${stats.byDirection.bullish.wins}</td><td class="${stats.byDirection.bullish.winRate >= 0.5 ? 'win' : 'loss'}">${Math.round(stats.byDirection.bullish.winRate * 100)}%</td><td class="${stats.byDirection.bullish.pnl >= 0 ? 'win' : 'loss'}">${stats.byDirection.bullish.pnl}</td></tr>
 <tr><td> (bearish)</td><td>${stats.byDirection.bearish.trades}</td><td>${stats.byDirection.bearish.wins}</td><td class="${stats.byDirection.bearish.winRate >= 0.5 ? 'win' : 'loss'}">${Math.round(stats.byDirection.bearish.winRate * 100)}%</td><td class="${stats.byDirection.bearish.pnl >= 0 ? 'win' : 'loss'}">${stats.byDirection.bearish.pnl}</td></tr>
 </table>
</div>

<div class="section">
 <h2>performance by source signal</h2>
 <table>
 <tr><th>source</th><th>trades</th><th>ratio success</th><th>in profit</th><th>center confidence</th></tr>
 ${Object.entries(stats.bySource)
 .sort(([, a], [, b]) => b.winRate - a.winRate)
 .map(([source, data]) => `<tr><td>${source}</td><td>${data.trades}</td><td class="${data.winRate >= 0.5 ? 'win' : 'loss'}">${Math.round(data.winRate * 100)}%</td><td class="${data.pnl >= 0 ? 'win' : 'loss'}">${Math.round(data.pnl * 100) / 100}</td><td>${Math.round(data.avgConfidence * 100)}%</td></tr>`)
 .join('\n')}
 </table>
</div>

${stats.boostTradesCount > 0 ? `
<div class="section">
 <h2> engines </h2>
 <table>
 <tr><th></th><th>trades</th><th>ratio success</th></tr>
 <tr><td>with </td><td>${stats.boostTradesCount}</td><td class="${stats.boostTradesWinRate >= 0.5 ? 'win' : 'loss'}">${Math.round(stats.boostTradesWinRate * 100)}%</td></tr>
 <tr><td>without </td><td>${stats.noBoostTradesCount}</td><td class="${stats.noBoostTradesWinRate >= 0.5 ? 'win' : 'loss'}">${Math.round(stats.noBoostTradesWinRate * 100)}%</td></tr>
 <tr><td>improvement</td><td colspan="2" class="${stats.boostLift >= 1 ? 'win' : 'loss'}">${stats.boostLift > 0 ? (stats.boostLift >= 1 ? '+' : '') + Math.round((stats.boostLift - 1) * 100) + '%' : ' data in'}</td></tr>
 </table>
</div>
` : ''}

${stats.weeklyBreakdown.length > 0 ? `
<div class="section">
 <h2>performance week</h2>
 <table>
 <tr><th>week</th><th>trades</th><th>winning</th><th>ratio success</th><th>profit</th><th>how much</th></tr>
 ${stats.weeklyBreakdown.map(w => `<tr><td>${w.week}</td><td>${w.trades}</td><td>${w.wins}</td><td class="${w.winRate >= 0.5 ? 'win' : 'loss'}">${Math.round(w.winRate * 100)}%</td><td class="${w.pnl >= 0 ? 'win' : 'loss'}">${w.pnl}</td><td class="${w.cumulativePnL >= 0 ? 'win' : 'loss'}">${w.cumulativePnL}</td></tr>`).join('\n')}
 </table>
</div>
` : ''}

<div class="section">
 <h2>last trades</h2>
 <table>
 <tr><th>date</th><th>direction</th><th>entry</th><th>SL</th><th>effect</th><th>R:R</th><th>profit</th><th>signals</th></tr>
 ${closed.slice(-20).reverse().map(e => `<tr>
 <td>${e.date} ${e.time}</td>
 <td>${e.direction === 'bullish' ? '' : ''}</td>
 <td>${e.entryPrice}</td>
 <td>${e.stopLoss}</td>
 <td class="${e.realiedPnL > 0 ? 'win' : 'loss'}">${e.status === 'hit_tp1' ? 'TP1' : e.status === 'hit_tp2' ? 'TP2' : e.status === 'hit_tp3' ? 'TP3' : e.status === 'hit_sl' ? 'SL' : e.status === 'trail_sl' ? 'Trail' : e.status}</td>
 <td>1:${e.rrRatio}</td>
 <td class="${e.realiedPnL >= 0 ? 'win' : 'loss'}">${e.realiedPnL >= 0 ? '+' : ''}${Math.round(e.realiedPnL * 100) / 100}</td>
 <td>${e.agreeingSignals.map(s => s.source).join(', ')}</td>
 </tr>`).join('\n')}
 </table>
</div>

<div class="footer">
 <p>auto-generated report who platform trade smart — V260</p>
 <p>this report reflects system analysis on data alive. effects prior within continued resultsbefore.</p>
</div>

</body>
</html>`;
}

// ── Utility Functions ───────────────────────────────────────────────

function getWeekNumber(d: Date): number {
 const target = new Date(d.valueOf());
 const dayNum = (d.getDay() + 6) % 7;
 target.setDate(target.getDate() - dayNum + 3);
 const firstThursday = target.valueOf();
 target.setMonth(0, 1);
 if (target.getDay() !== 4) {
 target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
 }
 return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Get all journal entries.
 */
export function getJournalEntries(): JournalEntry[] {
 return [...entries].sort((a, b) => b.proposedAt - a.proposedAt);
}

/**
 * Get a specific journal entry by ID.
 */
export function getJournalEntry(id: string): JournalEntry | undefined {
 return entries.find(e => e.id === id);
}

/**
 * Get entry count.
 */
export function getJournalEntryCount(): number {
 return entries.length;
}

/**
 * Clear all journal entries.
 */
export function clearJournal(): void {
 entries = [];
 persistJournal();
}

/**
 * Delete a specific journal entry.
 */
export function deleteJournalEntry(id: string): void {
 entries = entries.filter(e => e.id !== id);
 persistJournal();
}
