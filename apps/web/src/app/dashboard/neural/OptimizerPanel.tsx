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
  { value: 'MOMENTUM', label: 'زخم (Momentum)', desc: 'شراء عند الصعود، بيع عند النزول' },
  { value: 'MEAN_REVERSION', label: 'عودة للمتوسط (Mean Reversion)', desc: 'شراء عند التشبع بيعي، بيع عند التشبع شرائي' },
  { value: 'BREAKOUT', label: 'اختراق (Breakout)', desc: 'شراء عند كسر المقاومة، بيع عند كسر الدعم' },
  { value: 'SCALPING', label: 'سكالبينج (Scalping)', desc: 'صفقات سريعة على تحركات صغيرة' },
  { value: 'SWING', label: 'سوينج (Swing)', desc: 'احتفاظ لأيام بناءً على الاتجاه' },
  { value: 'AI_COUNCIL', label: 'مجلس الذكاء (AI Council)', desc: 'توافق Gemini + Groq + GLM' },
];

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD'];

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
  const [symbol, setSymbol] = useState('BTC/USD');
  const [strategy, setStrategy] = useState('MOMENTUM');
  const [periodStart, setPeriodStart] = useState('2025-01-01');
  const [periodEnd, setPeriodEnd] = useState('2025-12-31');
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
        setError(data.error || 'فشل في التحسين');
      }
    } catch (err: any) {
      setError(err.message || 'خطأ في الاتصال');
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
          مُحسِّن الاستراتيجية
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">الأصل</label>
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
            <label className="mb-1.5 block text-xs font-medium text-gray-400">الاستراتيجية</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Capital */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">رأس المال الأولي ($)</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">تاريخ البداية</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">تاريخ النهاية</label>
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
              {loading ? '⏳ جاري التحسين...' : '🔧 بدء التحسين'}
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
              { label: 'إجمالي العائد', value: `${result.performance.totalReturn}%`, color: result.performance.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'نسبة الفوز', value: `${result.performance.winRate}%`, color: 'text-blue-400' },
              { label: 'عدد الصفقات', value: result.performance.totalTrades.toString(), color: 'text-white' },
              { label: 'أقصى انخفاض', value: `${result.performance.maxDrawdown}%`, color: 'text-red-400' },
              { label: 'معامل شارب', value: result.performance.sharpeRatio.toFixed(2), color: 'text-yellow-400' },
              { label: 'معامل الربح', value: result.performance.profitFactor.toFixed(2), color: 'text-emerald-400' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/5 bg-[#111827] p-4">
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className={`mt-1 text-xl font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Best Parameters */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="mb-3 text-sm font-semibold text-emerald-300">✨ أفضل البارامترات</h3>
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
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📊 مقارنة مع أفضل نتيجة سابقة</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: 'إجمالي العائد', أفضل: result.performance.totalReturn, سابق: result.previousBest.totalReturn },
                  { name: 'نسبة الفوز', أفضل: result.performance.winRate, سابق: result.previousBest.winRate },
                  { name: 'معامل شارب', أفضل: result.performance.sharpeRatio, سابق: result.previousBest.sharpeRatio },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="أفضل" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="سابق" fill="#6b7280" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Iteration Results */}
          {result.allResults.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">🔄 نتائج التكرارات ({result.iterations} تكرار)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400">
                      <th className="px-2 py-2 text-right">#</th>
                      <th className="px-2 py-2 text-right">إجمالي العائد</th>
                      <th className="px-2 py-2 text-right">نسبة الفوز</th>
                      <th className="px-2 py-2 text-right">معامل شارب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.allResults.map((r, i) => (
                      <tr key={i} className={`border-b border-white/[0.02] ${i === 0 ? 'bg-emerald-500/5' : ''}`}>
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
