'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl'
import T from '@/lib/unified-tokens';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

// Dynamic import for TradeChart (uses lightweight-charts which needs browser)
const TradeChart = dynamic(() => import('./TradeChart'), { ssr: false });

const STRATEGY_KEYS: Record<string, string> = {
  'MOMENTUM': 'strategyMomentum',
  'MEAN_REVERSION': 'strategyMeanReversion',
  'BREAKOUT': 'strategyBreakout',
  'SCALPING': 'strategyScalping',
  'SWING': 'strategySwing',
  'AI_COUNCIL': 'strategyAICouncil',
};

const STRATEGY_DESC_KEYS: Record<string, string> = {
  'MOMENTUM': 'strategyMomentumDesc',
  'MEAN_REVERSION': 'strategyMeanReversionDesc',
  'BREAKOUT': 'strategyBreakoutDesc',
  'SCALPING': 'strategyScalpingDesc',
  'SWING': 'strategySwingDesc',
  'AI_COUNCIL': 'strategyAICouncilDesc',
};

const STRATEGIES = [
  { value: 'MOMENTUM' },
  { value: 'MEAN_REVERSION' },
  { value: 'BREAKOUT' },
  { value: 'SCALPING' },
  { value: 'SWING' },
  { value: 'AI_COUNCIL' },
];

const SYMBOLS = [
  // Crypto
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
  // Forex
  'EUR/USD', 'GBP/USD', 'USD/JPY',
  // Commodities
  'XAU/USD',
  // Stocks
  'AAPL', 'TSLA', 'NVDA',
];

interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdDuration: string;
}

interface BacktestResult {
  symbol: string;
  strategy: string;
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  finalCapital: number;
  equityCurve: { date: string; value: number }[];
  trades: BacktestTrade[];
  aiInsights: string;
}

const ALL_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AAPL', 'TSLA', 'NVDA'];

// Dynamic default dates: 1 year ago → today
const today = new Date();
const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
const defaultEnd = today.toISOString().split('T')[0];
const defaultStart = oneYearAgo.toISOString().split('T')[0];

export default function BacktestPanel() {
  const t = useTranslations('neuralLab');
  const locale = useLocale();
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [strategy, setStrategy] = useState('MOMENTUM');
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [capital, setCapital] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [applyingRec, setApplyingRec] = useState(false);

  const runBacktest = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/neural/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          symbol,
          strategy,
          periodStart,
          periodEnd,
          initialCapital: capital,
          language: locale === 'ar' ? 'ar' : 'en',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || t('backtestFailed'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendation = async (recommendation: string) => {
    if (!result) return;
    setApplyingRec(true);
    try {
      const res = await fetch('/api/neural/apply-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recommendation,
          symbol: result.symbol,
          periodStart,
          periodEnd,
          initialCapital: capital,
          language: locale === 'ar' ? 'ar' : 'en',
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.backtestResult) {
        setResult(data.data.backtestResult);
      }
    } catch {
      // Error handled silently
    } finally {
      setApplyingRec(false);
    }
  };

  const exportReport = async (format: string) => {
    if (!result) return;
    setExporting(format);

    try {
      const res = await fetch('/api/neural/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          format,
          reportType: t('backtestReportType'),
          reportData: result,
          language: locale === 'ar' ? 'ar' : 'en',
        }),
      });

      if (format === 'json') {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'neural-report.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `neural-report.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Error handled silently
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-sm">
            📊
          </span>
          {t('backtestTitle')}
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('asset')}</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-label={t('backtestSelectAsset')}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Strategy */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('strategy')}</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              aria-label={t('backtestSelectStrategy')}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{t(STRATEGY_KEYS[s.value])}</option>
              ))}
            </select>
          </div>

          {/* Capital */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('initialCapital')}</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('startDate')}</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              max={periodEnd || defaultEnd}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('endDate')}</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              max={defaultEnd}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Run Button */}
          <div className="flex items-end">
            <button
              onClick={runBacktest}
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50"
            >
              {loading ? `⏳ ${t('backtestRunning')}` : `▶ ${t('backtestRun')}`}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {[
              { label: t('totalReturn'), value: `${result.totalReturn.toFixed(2)}%`, color: result.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: t('winRate'), value: `${result.winRate.toFixed(1)}%`, color: 'text-blue-400' },
              { label: t('totalTrades'), value: result.totalTrades.toString(), color: 'text-white' },
              { label: t('maxDrawdown'), value: `${result.maxDrawdown.toFixed(2)}%`, color: 'text-red-400' },
              { label: t('sharpeRatio'), value: result.sharpeRatio.toFixed(2), color: 'text-yellow-400' },
              { label: t('backtestFinalCapital'), value: `$${result.finalCapital.toFixed(0)}`, color: result.finalCapital >= capital ? 'text-green-400' : 'text-red-400' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/5 bg-[#111827] p-4">
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className={`mt-1 text-xl font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Candlestick Chart with Entry/Exit Points */}
          <TradeChart trades={result.trades} symbol={result.symbol} />

          {/* Equity Curve */}
          {result.equityCurve.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📈 {t('backtestEquityCurve')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={result.equityCurve}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke={T.text3} tick={{ fontSize: 10 }} />
                  <YAxis stroke={T.text3} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#equityGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trades Table */}
          {result.trades.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📋 {t('backtestTradeLog')} ({result.trades.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">{t('backtestTableCaption')}</caption>
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400">
                      <th className="px-2 py-2 text-right">{t('backtestDirection')}</th>
                      <th className="px-2 py-2 text-right">{t('backtestEntryPrice')}</th>
                      <th className="px-2 py-2 text-right">{t('backtestExitPrice')}</th>
                      <th className="px-2 py-2 text-right">{t('backtestPnL')}</th>
                      <th className="px-2 py-2 text-right">{t('backtestPercentage')}</th>
                      <th className="px-2 py-2 text-right">{t('backtestDuration')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, 20).map((tr, i) => (
                      <tr key={`${tr.entryDate}-${tr.side}-${i}`} className="border-b border-white/[0.02]">
                        <td className={`px-2 py-1.5 font-medium ${tr.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                          {tr.side === 'BUY' ? `🟢 ${t('buy')}` : `🔴 ${t('sell')}`}
                        </td>
                        <td className="px-2 py-1.5 text-gray-300">${tr.entryPrice.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-gray-300">${tr.exitPrice.toFixed(2)}</td>
                        <td className={`px-2 py-1.5 font-medium ${tr.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${tr.pnl.toFixed(2)}
                        </td>
                        <td className={`px-2 py-1.5 ${tr.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {tr.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="px-2 py-1.5 text-gray-400">{tr.holdDuration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Insights */}
          {result.aiInsights && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-violet-300">🤖 {t('backtestAITitle')}</h3>
                <button
                  onClick={() => applyRecommendation(result.aiInsights)}
                  disabled={applyingRec}
                  className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50"
                >
                  {applyingRec ? `⏳ ${t('backtestApplying')}` : `⚡ ${t('backtestApplyRecommendation')}`}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{result.aiInsights}</p>
            </div>
          )}

          {/* Export Buttons */}
          <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-300">📥 {t('backtestExportTitle')}</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { format: 'pdf', label: 'PDF', icon: '📄', color: 'from-red-600 to-rose-600' },
                { format: 'xlsx', label: 'Excel', icon: '📊', color: 'from-green-600 to-emerald-600' },
                { format: 'csv', label: 'CSV', icon: '📋', color: 'from-blue-600 to-cyan-600' },
                { format: 'json', label: 'JSON', icon: '🔧', color: 'from-amber-600 to-yellow-600' },
              ].map((btn) => (
                <button
                  key={btn.format}
                  onClick={() => exportReport(btn.format)}
                  disabled={exporting !== null}
                  aria-label={t('backtestExportAs', { format: btn.label })}
                  className={`rounded-lg bg-gradient-to-r ${btn.color} px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50`}
                >
                  {exporting === btn.format ? `⏳ ${t('backtestExporting')}` : `${btn.icon} ${btn.label}`}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
