'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
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

const STRATEGIES = [
  { value: 'MOMENTUM', label: 'زخم (Momentum)', desc: 'شراء عند الصعود، بيع عند النزول' },
  { value: 'MEAN_REVERSION', label: 'عودة للمتوسط (Mean Reversion)', desc: 'شراء عند التشبع بيعي، بيع عند التشبع شرائي' },
  { value: 'BREAKOUT', label: 'اختراق (Breakout)', desc: 'شراء عند كسر المقاومة، بيع عند كسر الدعم' },
  { value: 'SCALPING', label: 'سكالبينج (Scalping)', desc: 'صفقات سريعة على تحركات صغيرة' },
  { value: 'SWING', label: 'سوينج (Swing)', desc: 'احتفاظ لأيام بناءً على الاتجاه' },
  { value: 'AI_COUNCIL', label: 'مجلس الذكاء (AI Council)', desc: 'توافق Gemini + Groq + GLM' },
];

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT'];

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

export default function BacktestPanel() {
  const { user, loading: authLoading } = useAuth();
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [strategy, setStrategy] = useState('MOMENTUM');
  const [periodStart, setPeriodStart] = useState('2025-01-01');
  const [periodEnd, setPeriodEnd] = useState('2025-12-31');
  const [capital, setCapital] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  const runBacktest = async () => {
    if (!user) {
      setError('يرجى تسجيل الدخول أولاً لاستخدام مختبر التداول');
      return;
    }
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
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'فشل في تشغيل الباك تست');
      }
    } catch (err: any) {
      setError(err.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  // Show auth prompt if not logged in
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">جاري التحقق من الهوية...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!user && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
          <p className="text-sm text-amber-300">يرجى تسجيل الدخول أولاً لاستخدام مختبر التداول الذكي</p>
        </div>
      )}
      {/* Configuration Card */}
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-sm">
            📊
          </span>
          إعدادات الباك تست
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">الأصل</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
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
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
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
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">تاريخ البداية</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">تاريخ النهاية</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
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
              {loading ? '⏳ جاري التشغيل...' : '▶ تشغيل الباك تست'}
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
              { label: 'إجمالي العائد', value: `${result.totalReturn.toFixed(2)}%`, color: result.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'نسبة الفوز', value: `${result.winRate.toFixed(1)}%`, color: 'text-blue-400' },
              { label: 'عدد الصفقات', value: result.totalTrades.toString(), color: 'text-white' },
              { label: 'أقصى انخفاض', value: `${result.maxDrawdown.toFixed(2)}%`, color: 'text-red-400' },
              { label: 'معامل شارب', value: result.sharpeRatio.toFixed(2), color: 'text-yellow-400' },
              { label: 'رأس المال النهائي', value: `$${result.finalCapital.toFixed(0)}`, color: result.finalCapital >= capital ? 'text-green-400' : 'text-red-400' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/5 bg-[#111827] p-4">
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className={`mt-1 text-xl font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Equity Curve */}
          {result.equityCurve.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📈 منحنى رأس المال</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={result.equityCurve}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
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
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📋 سجل الصفقات ({result.trades.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400">
                      <th className="px-2 py-2 text-right">الاتجاه</th>
                      <th className="px-2 py-2 text-right">سعر الدخول</th>
                      <th className="px-2 py-2 text-right">سعر الخروج</th>
                      <th className="px-2 py-2 text-right">الربح/الخسارة</th>
                      <th className="px-2 py-2 text-right">النسبة</th>
                      <th className="px-2 py-2 text-right">المدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, 20).map((t, i) => (
                      <tr key={i} className="border-b border-white/[0.02]">
                        <td className={`px-2 py-1.5 font-medium ${t.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.side === 'BUY' ? '🟢 شراء' : '🔴 بيع'}
                        </td>
                        <td className="px-2 py-1.5 text-gray-300">${t.entryPrice.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-gray-300">${t.exitPrice.toFixed(2)}</td>
                        <td className={`px-2 py-1.5 font-medium ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${t.pnl.toFixed(2)}
                        </td>
                        <td className={`px-2 py-1.5 ${t.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="px-2 py-1.5 text-gray-400">{t.holdDuration}</td>
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
              <h3 className="mb-3 text-sm font-semibold text-violet-300">🤖 تحليل AI Council</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{result.aiInsights}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
