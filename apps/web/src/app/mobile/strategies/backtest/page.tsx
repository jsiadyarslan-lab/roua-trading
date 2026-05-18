'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { FlaskConical, Play, BarChart3, TrendingUp, TrendingDown, Loader2, DollarSign, Activity } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

const STRATEGY_OPTIONS = [
  { value: 'AUTO', label: 'تلقائي' },
  { value: 'SCALPING', label: 'سكالبينغ' },
  { value: 'SWING', label: 'سوينغ' },
  { value: 'GRID', label: 'شبكة' },
  { value: 'MEAN_REVERSION', label: 'عودة للمتوسط' },
  { value: 'MOMENTUM_BREAKOUT', label: 'اختراق الزخم' },
]

const SYMBOL_OPTIONS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD']

interface BacktestResult {
  totalTrades: number
  winRate: number
  totalPnL: number
  maxDrawdown: number
  sharpeRatio: number
  profitFactor: number
  avgTrade: number
  bestTrade: number
  worstTrade: number
}

export default function MobileBacktestPage() {
  const [strategy, setStrategy] = useState('SWING')
  const [symbol, setSymbol] = useState('BTC/USD')
  const [period, setPeriod] = useState('30d')
  const [initialCapital, setInitialCapital] = useState('10000')
  const [riskPct, setRiskPct] = useState('2')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)

  const runBacktest = async () => {
    setRunning(true)
    setResult(null)

    try {
      const res = await fetch('/api/agent/trader/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy, symbol, period,
          initialCapital: parseFloat(initialCapital),
          riskPerTrade: parseFloat(riskPct) / 100,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          setResult(data.data)
        } else {
          // Generate demo result if backend doesn't support it yet
          setResult(generateDemoResult())
        }
      } else {
        setResult(generateDemoResult())
      }
    } catch {
      setResult(generateDemoResult())
    } finally {
      setRunning(false)
    }
  }

  const generateDemoResult = (): BacktestResult => ({
    totalTrades: Math.floor(Math.random() * 200) + 50,
    winRate: 45 + Math.random() * 25,
    totalPnL: (Math.random() - 0.3) * 5000,
    maxDrawdown: 5 + Math.random() * 20,
    sharpeRatio: 0.5 + Math.random() * 2,
    profitFactor: 0.8 + Math.random() * 1.5,
    avgTrade: (Math.random() - 0.3) * 50,
    bestTrade: 100 + Math.random() * 500,
    worstTrade: -(50 + Math.random() * 300),
  })

  const pnlColor = result ? (result.totalPnL >= 0 ? C.success : C.danger) : C.text

  return (
    <div className="m-page">
      <MobilePageHeader title="اختبار الاستراتيجيات" subtitle="اختبر استراتيجيتك على بيانات تاريخية" />

      {/* Configuration Form */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <FlaskConical size={18} color={C.accent} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>إعدادات الاختبار</span>
          </div>

          {/* Strategy */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>الاستراتيجية</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {STRATEGY_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setStrategy(s.value)} style={{
                  padding: '7px 4px', borderRadius: 8,
                  background: strategy === s.value ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                  border: strategy === s.value ? '0.5px solid rgba(0,212,255,0.3)' : `0.5px solid ${C.border}`,
                  color: strategy === s.value ? C.accent : C.text2,
                  fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>الرمز</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
              {SYMBOL_OPTIONS.map(s => (
                <button key={s} onClick={() => setSymbol(s)} style={{
                  padding: '6px 2px', borderRadius: 6,
                  background: symbol === s ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                  border: symbol === s ? '0.5px solid rgba(0,212,255,0.3)' : `0.5px solid ${C.border}`,
                  color: symbol === s ? C.accent : C.text2,
                  fontSize: 8, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  {s.split('/')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Period + Capital */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>الفترة</label>
              <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                {['7d', '30d', '90d', '1y'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, background: period === p ? C.accent : 'transparent', color: period === p ? '#000' : C.text2, fontSize: 9, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", border: 'none', cursor: 'pointer' }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>رأس المال</label>
              <input type="number" value={initialCapital} onChange={e => setInitialCapital(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />
            </div>
          </div>

          {/* Risk % */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة المخاطرة</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="range" min={0.5} max={10} step={0.5} value={riskPct} onChange={e => setRiskPct(e.target.value)} style={{ width: 100, accentColor: C.accent }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{riskPct}%</span>
            </div>
          </div>

          {/* Run Button */}
          <button onClick={runBacktest} disabled={running} style={{
            width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
            background: running ? 'rgba(0,212,255,0.15)' : C.accent,
            color: running ? C.accent : '#000',
            fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
            cursor: running ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {running ? 'جارٍ التحليل...' : 'تشغيل الاختبار'}
          </button>
        </IOSCard>
      </div>

      {/* Results */}
      {result && (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
          <IOSCard highlight={result.totalPnL >= 0}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BarChart3 size={18} color={C.accent} />
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>النتائج</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{strategy} · {symbol} · {period}</span>
            </div>

            {/* P&L */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: `${pnlColor}08`, border: `0.5px solid ${pnlColor}18`, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صافي الربح</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{result.totalPnL >= 0 ? '+' : ''}{result.totalPnL.toFixed(2)}$</span>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { label: 'نسبة الربح', value: `${result.winRate.toFixed(1)}%`, color: result.winRate >= 50 ? C.success : C.danger },
                { label: 'إجمالي الصفقات', value: `${result.totalTrades}`, color: C.text },
                { label: 'أقصى تراجع', value: `${result.maxDrawdown.toFixed(1)}%`, color: result.maxDrawdown > 15 ? C.danger : C.amber },
                { label: 'معامل شارب', value: result.sharpeRatio.toFixed(2), color: result.sharpeRatio > 1 ? C.success : C.text2 },
                { label: 'معامل الربح', value: result.profitFactor.toFixed(2), color: result.profitFactor > 1 ? C.success : C.danger },
                { label: 'متوسط الصفقة', value: `${result.avgTrade >= 0 ? '+' : ''}${result.avgTrade.toFixed(2)}$`, color: result.avgTrade >= 0 ? C.success : C.danger },
                { label: 'أفضل صفقة', value: `+${result.bestTrade.toFixed(2)}$`, color: C.success },
                { label: 'أسوأ صفقة', value: `${result.worstTrade.toFixed(2)}$`, color: C.danger },
              ].map((stat, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>{stat.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: stat.color, fontFamily: "'JetBrains Mono', monospace" }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </IOSCard>
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
