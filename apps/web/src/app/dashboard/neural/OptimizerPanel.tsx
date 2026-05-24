'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const STRATEGY_KEYS: Record<string, string> = {
  'MOMENTUM': 'strategyMomentum',
  'MEAN_REVERSION': 'strategyMeanReversion',
  'BREAKOUT': 'strategyBreakout',
  'SCALPING': 'strategyScalping',
  'SWING': 'strategySwing',
  'AI_COUNCIL': 'strategyAICouncil',
};

const STRATEGIES = [
  { value: 'MOMENTUM' },
  { value: 'MEAN_REVERSION' },
  { value: 'BREAKOUT' },
  { value: 'SCALPING' },
  { value: 'SWING' },
  { value: 'AI_COUNCIL' },
];

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AAPL', 'TSLA', 'NVDA'];

// Dynamic default dates
const _today = new Date();
const _oneYearAgo = new Date(_today.getFullYear() - 1, _today.getMonth(), _today.getDate());
const _defaultEnd = _today.toISOString().split('T')[0];
const _defaultStart = _oneYearAgo.toISOString().split('T')[0];

interface OptimizeResult {
  strategy: string;
  symbol: string;
  bestParams: Record<string, number>;
  paramRanges: Record<string, { min: number; max: number; step: number; label: string }>;
  performance: {
    totalReturn: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
    profitFactor: number;
  };
  previousBest: {
    params: Record<string, number>;
    totalReturn: number;
    winRate: number;
    sharpeRatio: number;
  } | null;
  iterations: number;
  allResults: Array<{
    params: Record<string, number>;
    totalReturn: number;
    winRate: number;
    sharpeRatio: number;
  }>;
}

export default function OptimizerPanel() {
  const t = useTranslations('neuralLab');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [strategy, setStrategy] = useState('MOMENTUM');
  const [periodStart, setPeriodStart] = useState(_defaultStart);
  const [periodEnd, setPeriodEnd] = useState(_defaultEnd);
  const [capital, setCapital] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState('');

  const runOptimize = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/neural/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          strategy,
          symbol,
          periodStart,
          periodEnd,
          initialCapital: capital,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || t('optimizerFailed'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-sm">
            🔧
          </span>
          {t('optimizerTitle')}
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('asset')}</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
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
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
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
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('startDate')}</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('endDate')}</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Run Button */}
          <div className="flex items-end">
            <button
              onClick={runOptimize}
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
            >
              {loading ? `⏳ ${t('optimizerRunning')}` : `🔧 ${t('optimizerStart')}`}
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
          {/* Performance Metrics */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: t('totalReturn'), value: `${result.performance.totalReturn}%`, color: result.performance.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: t('winRate'), value: `${result.performance.winRate}%`, color: 'text-blue-400' },
              { label: t('totalTrades'), value: result.performance.totalTrades.toString(), color: 'text-white' },
              { label: t('maxDrawdown'), value: `${result.performance.maxDrawdown}%`, color: 'text-red-400' },
              { label: t('sharpeRatio'), value: result.performance.sharpeRatio.toFixed(2), color: 'text-yellow-400' },
              { label: t('profitFactor'), value: result.performance.profitFactor.toFixed(2), color: 'text-emerald-400' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/5 bg-[#111827] p-4">
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className={`mt-1 text-xl font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Best Parameters */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="mb-3 text-sm font-semibold text-emerald-300">✨ {t('optimizerBestParams')}</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(result.bestParams).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-white/5 bg-[#0a0e17] p-3">
                  <p className="text-xs text-gray-400">
                    {result.paramRanges[key]?.label || key}
                  </p>
                  <p className="mt-1 text-lg font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison with previous best */}
          {result.previousBest && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📊 {t('optimizerComparisonTitle')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: t('totalReturn'), [t('optimizerBest')]: result.performance.totalReturn, [t('optimizerPrevious')]: result.previousBest.totalReturn },
                  { name: t('winRate'), [t('optimizerBest')]: result.performance.winRate, [t('optimizerPrevious')]: result.previousBest.winRate },
                  { name: t('sharpeRatio'), [t('optimizerBest')]: result.performance.sharpeRatio, [t('optimizerPrevious')]: result.previousBest.sharpeRatio },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey={t('optimizerBest')} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={t('optimizerPrevious')} fill="#6b7280" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Iteration Results */}
          {result.allResults.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">🔄 {t('optimizerIterations')} ({result.iterations} {t('optimizerIteration')})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400">
                      <th className="px-2 py-2 text-right">#</th>
                      <th className="px-2 py-2 text-right">{t('totalReturn')}</th>
                      <th className="px-2 py-2 text-right">{t('winRate')}</th>
                      <th className="px-2 py-2 text-right">{t('sharpeRatio')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.allResults.map((r, i) => (
                      <tr key={`iter-${r.totalReturn}-${r.winRate}-${i}`} className={`border-b border-white/[0.02] ${i === 0 ? 'bg-emerald-500/5' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-300">{i + 1}</td>
                        <td className={`px-2 py-1.5 font-medium ${r.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {r.totalReturn}%
                        </td>
                        <td className="px-2 py-1.5 text-gray-300">{r.winRate}%</td>
                        <td className="px-2 py-1.5 text-yellow-400">{r.sharpeRatio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
