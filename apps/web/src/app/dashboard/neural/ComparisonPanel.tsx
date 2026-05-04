'use client';

import { useState } from 'react';
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

const STRATEGIES = [
  { value: 'MOMENTUM', label: 'زخم' },
  { value: 'MEAN_REVERSION', label: 'عودة للمتوسط' },
  { value: 'BREAKOUT', label: 'اختراق' },
  { value: 'SCALPING', label: 'سكالبينج' },
  { value: 'SWING', label: 'سوينج' },
  { value: 'AI_COUNCIL', label: 'مجلس الذكاء' },
];

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AAPL', 'TSLA', 'NVDA'];

// Dynamic default dates
const _today2 = new Date();
const _oneYearAgo2 = new Date(_today2.getFullYear() - 1, _today2.getMonth(), _today2.getDate());
const _defaultEnd2 = _today2.toISOString().split('T')[0];
const _defaultStart2 = _oneYearAgo2.toISOString().split('T')[0];

interface StrategyResult {
  strategy: string;
  label: string;
  totalReturn: number;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
}

interface CompareResult {
  symbol: string;
  strategy1: StrategyResult;
  strategy2: StrategyResult;
  comparisonData: Array<{
    metric: string;
    metricKey: string;
    [key: string]: string | number;
  }>;
  winner: string;
  winnerLabel: string;
  insight: string;
}

export default function ComparisonPanel() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [strategy1, setStrategy1] = useState('MOMENTUM');
  const [strategy2, setStrategy2] = useState('MEAN_REVERSION');
  const [periodStart, setPeriodStart] = useState(_defaultStart2);
  const [periodEnd, setPeriodEnd] = useState(_defaultEnd2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState('');

  const runCompare = async () => {
    if (strategy1 === strategy2) {
      setError('يجب اختيار استراتيجيتين مختلفتين');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/neural/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          strategy1,
          strategy2,
          symbol,
          periodStart,
          periodEnd,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'فشل في المقارنة');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-sm">
            ⚖️
          </span>
          مقارنة الاستراتيجيات
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">الأصل</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Strategy 1 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">الاستراتيجية الأولى</label>
            <select
              value={strategy1}
              onChange={(e) => setStrategy1(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Strategy 2 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">الاستراتيجية الثانية</label>
            <select
              value={strategy2}
              onChange={(e) => setStrategy2(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Run Button */}
          <div className="flex items-end">
            <button
              onClick={runCompare}
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
            >
              {loading ? '⏳ جاري المقارنة...' : '⚖️ مقارنة'}
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
          {/* Winner Banner */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              <div>
                <h3 className="text-sm font-semibold text-blue-300">الاستراتيجية الفائزة</h3>
                <p className="text-xl font-bold text-white">{result.winnerLabel}</p>
                <p className="mt-1 text-sm text-gray-400">{result.insight}</p>
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-300">📊 جدول المقارنة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-2 text-right text-gray-400">المقياس</th>
                    <th className="px-4 py-2 text-right text-blue-400">{result.strategy1.label}</th>
                    <th className="px-4 py-2 text-right text-indigo-400">{result.strategy2.label}</th>
                    <th className="px-4 py-2 text-right text-gray-400">الأفضل</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'إجمالي العائد', key: 'totalReturn', suffix: '%', higher: true },
                    { label: 'نسبة الفوز', key: 'winRate', suffix: '%', higher: true },
                    { label: 'عدد الصفقات', key: 'totalTrades', suffix: '', higher: false },
                    { label: 'أقصى انخفاض', key: 'maxDrawdown', suffix: '%', higher: false },
                    { label: 'معامل شارب', key: 'sharpeRatio', suffix: '', higher: true },
                    { label: 'معامل الربح', key: 'profitFactor', suffix: '', higher: true },
                  ].map((row) => {
                    const val1 = Number(result.strategy1[row.key as keyof StrategyResult]);
                    const val2 = Number(result.strategy2[row.key as keyof StrategyResult]);
                    const better = row.higher ? val1 >= val2 : val1 <= val2;
                    return (
                      <tr key={row.key} className="border-b border-white/[0.02]">
                        <td className="px-4 py-2 text-gray-300">{row.label}</td>
                        <td className={`px-4 py-2 font-medium ${better ? 'text-green-400' : 'text-gray-300'}`}>
                          {val1}{row.suffix}
                        </td>
                        <td className={`px-4 py-2 font-medium ${!better ? 'text-green-400' : 'text-gray-300'}`}>
                          {val2}{row.suffix}
                        </td>
                        <td className="px-4 py-2 text-yellow-400">
                          {better ? result.strategy1.label : result.strategy2.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar Chart Comparison */}
          <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-300">📈 مخطط المقارنة</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={result.comparisonData.filter((d) =>
                d.metricKey !== 'totalTrades'
              ).map((d) => ({
                metric: d.metric,
                [result.strategy1.label]: Number(d[result.strategy1.strategy]),
                [result.strategy2.label]: Number(d[result.strategy2.strategy]),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="metric" stroke="#6b7280" tick={{ fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={result.strategy1.label} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey={result.strategy2.label} fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
