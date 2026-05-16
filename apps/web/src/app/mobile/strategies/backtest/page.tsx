'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Play, TrendingUp, TrendingDown, BarChart2, Activity, Target } from 'lucide-react'
import { ScopedStyle } from '@/components/ScopedStyle'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#32D74B', danger: '#FF453A', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)', border: 'rgba(255,255,255,0.08)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

const STRATEGIES = [
  { id: 'EMA_CROSSOVER', label: 'تقاطع EMA', desc: 'شراء عند تقاطع EMA سريع فوق بطيء', color: C.accent },
  { id: 'SMA_CROSSOVER', label: 'تقاطع SMA', desc: 'تقاطع المتوسطات البسيطة', color: C.amber },
  { id: 'RSI', label: 'RSI عكسي', desc: 'شراء عند تشبع بيعي وبيع عند تشبع شرائي', color: C.purple },
]

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA']

export default function MobileBacktestPage() {
  const router = useRouter()
  const [symbol, setSymbol] = useState('BTC/USD')
  const [strategy, setStrategy] = useState('EMA_CROSSOVER')
  const [fastPeriod, setFastPeriod] = useState(9)
  const [slowPeriod, setSlowPeriod] = useState(21)
  const [rsiOB, setRsiOB] = useState(70)
  const [rsiOS, setRsiOS] = useState(30)
  const [capital, setCapital] = useState(10000)
  const [riskPct, setRiskPct] = useState(2)
  const [interval, setInterval] = useState('1h')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const runBacktest = async () => {
    setLoading(true); setError('')
    try {
      const params: any = { initialCapital: capital, riskPct }
      if (strategy !== 'RSI') { params.fastPeriod = fastPeriod; params.slowPeriod = slowPeriod }
      else { params.rsiOB = rsiOB; params.rsiOS = rsiOS; params.rsiPeriod = 14 }
      const res = await fetch('/api/backtest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy, params, interval }),
      })
      const data = await res.json()
      if (data.success) setResult(data); else setError(data.error || 'فشل الاختبار')
    } catch { setError('خطأ في الشبكة') } finally { setLoading(false) }
  }

  const s = result?.summary

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
          width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
          border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowRight size={18} color="#FFFFFF" />
        </motion.button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ color: C.purple, display: 'flex' }}><Activity size={20} /></div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>محرك الاختبار</h1>
        </div>
      </div>

      <ScopedStyle>{`@keyframes spin { to { transform: rotate(360deg); } }`}</ScopedStyle>

      <div style={{ padding: '16px 20px' }}>
        {/* Strategy picker */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{
          borderRadius: 18, padding: '14px', marginBottom: 12,
          background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.text2, fontFamily: FONT_AR, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>الاستراتيجية</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STRATEGIES.map(st => (
              <button key={st.id} onClick={() => setStrategy(st.id)} style={{
                padding: '10px 12px', background: strategy === st.id ? `${st.color}12` : 'transparent',
                border: `0.5px solid ${strategy === st.id ? st.color + '50' : C.border}`,
                borderRadius: 12, cursor: 'pointer', textAlign: 'right', transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: strategy === st.id ? st.color : C.text, fontFamily: FONT_AR }}>{st.label}</span>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, display: 'block', marginTop: 2 }}>{st.desc}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Symbol + Interval */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{
          borderRadius: 18, padding: '14px', marginBottom: 12,
          background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.text2, fontFamily: FONT_AR, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>الأصل والإطار الزمني</div>
          <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{
            width: '100%', background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`,
            borderRadius: 10, color: C.text, fontSize: 13, padding: '8px 10px', fontFamily: FONT_MONO, fontWeight: 700, marginBottom: 8,
          }}>
            {SYMBOLS.map(sym => <option key={sym} value={sym}>{sym}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            {['15min', '1h', '4h', '1day'].map(iv => (
              <button key={iv} onClick={() => setInterval(iv)} style={{
                flex: 1, padding: '6px 2px', borderRadius: 8,
                border: `0.5px solid ${interval === iv ? C.accent : C.border}`,
                background: interval === iv ? `${C.accent}18` : 'transparent',
                color: interval === iv ? C.accent : C.text2, fontSize: 10, fontWeight: 800,
                fontFamily: FONT_MONO, cursor: 'pointer',
              }}>{iv}</button>
            ))}
          </div>
        </motion.div>

        {/* Params */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{
          borderRadius: 18, padding: '14px', marginBottom: 12,
          background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.text2, fontFamily: FONT_AR, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>المعاملات</div>
          {strategy !== 'RSI' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: 'السريع', val: fastPeriod, set: setFastPeriod }, { label: 'البطيء', val: slowPeriod, set: setSlowPeriod }].map(p => (
                <div key={p.label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 8, color: C.text2, fontWeight: 700, fontFamily: FONT_AR, display: 'block', marginBottom: 3 }}>{p.label}</label>
                  <input type="number" value={p.val} min={2} max={200} onChange={e => p.set(+e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px', fontFamily: FONT_MONO, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: 'تشبع شرائي', val: rsiOB, set: setRsiOB }, { label: 'تشبع بيعي', val: rsiOS, set: setRsiOS }].map(p => (
                <div key={p.label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 8, color: C.text2, fontWeight: 700, fontFamily: FONT_AR, display: 'block', marginBottom: 3 }}>{p.label}</label>
                  <input type="number" value={p.val} min={10} max={90} onChange={e => p.set(+e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px', fontFamily: FONT_MONO, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[{ label: 'رأس المال ($)', val: capital, set: setCapital, min: 100 }, { label: 'مخاطرة (%)', val: riskPct, set: setRiskPct, min: 0.5 }].map(p => (
              <div key={p.label} style={{ flex: 1 }}>
                <label style={{ fontSize: 8, color: C.text2, fontWeight: 700, fontFamily: FONT_AR, display: 'block', marginBottom: 3 }}>{p.label}</label>
                <input type="number" value={p.val} min={p.min} step={p.min} onChange={e => p.set(+e.target.value)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px', fontFamily: FONT_MONO, boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Run Button */}
        <motion.button whileTap={{ scale: 0.95 }} onClick={runBacktest} disabled={loading} style={{
          width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          background: loading ? `${C.purple}40` : `linear-gradient(135deg, ${C.purple}, ${C.accent})`,
          color: '#fff', fontSize: 14, fontWeight: 900, fontFamily: FONT_AR,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12,
        }}>
          {loading ? (
            <><div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> جارٍ الاختبار...</>
          ) : (
            <><Play size={16} fill="white" /> تشغيل الاختبار</>
          )}
        </motion.button>

        {error && <div style={{ padding: '10px', background: `${C.danger}12`, border: `0.5px solid ${C.danger}30`, borderRadius: 10, color: C.danger, fontSize: 11, fontFamily: FONT_AR, marginBottom: 12 }}>{error}</div>}

        {/* Results */}
        {s && (
          <>
            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'إجمالي الصفقات', value: s.totalTrades, color: C.accent, icon: '📊' },
                { label: 'معدل الربح', value: `${s.winRate.toFixed(1)}%`, color: s.winRate >= 50 ? C.success : C.danger, icon: '🎯' },
                { label: 'صافي الربح', value: `$${s.totalPnl.toFixed(0)}`, color: s.totalPnl >= 0 ? C.success : C.danger, icon: '💰' },
                { label: 'العائد الإجمالي', value: `${s.return.toFixed(2)}%`, color: s.return >= 0 ? C.success : C.danger, icon: '📈' },
                { label: 'أقصى انسحاب', value: `${s.maxDrawdown.toFixed(1)}%`, color: s.maxDrawdown > 20 ? C.danger : C.amber, icon: '⚠️' },
                { label: 'عامل الربح', value: s.profitFactor.toFixed(2), color: s.profitFactor >= 1.5 ? C.success : C.amber, icon: '⚡' },
                { label: 'نسبة شارب', value: s.sharpe.toFixed(2), color: s.sharpe >= 1 ? C.success : C.amber, icon: '🏆' },
                { label: 'الرأسمال النهائي', value: `$${s.finalEquity.toLocaleString('en', { maximumFractionDigits: 0 })}`, color: C.purple, icon: '💎' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, marginBottom: 2 }}>{kpi.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: kpi.color, fontFamily: FONT_MONO }}>{kpi.value}</div>
                  <div style={{ fontSize: 8, color: C.text2, fontWeight: 700, fontFamily: FONT_AR, marginTop: 3 }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Equity Curve */}
            {result.equityCurve?.length > 2 && (() => {
              const pts = result.equityCurve
              const vals = pts.map((p: any) => p.equity)
              const mn = Math.min(...vals), mx = Math.max(...vals)
              const range = mx - mn || 1
              const W = 600, H = 80
              const svgPts = pts.map((p: any, i: number) => `${(i / (pts.length - 1)) * W},${H - ((p.equity - mn) / range) * (H - 10) - 5}`)
              const linePath = `M ${svgPts.join(' L ')}`
              const fillPath = `${linePath} L ${W},${H} L 0,${H} Z`
              const isPositive = vals[vals.length - 1] >= vals[0]
              const lineColor = isPositive ? C.success : C.danger
              return (
                <div style={{ background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, borderRadius: 14, padding: '14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>منحنى رأس المال</span>
                    <span style={{ fontSize: 10, color: lineColor, fontFamily: FONT_MONO, fontWeight: 800 }}>${s.finalEquity.toLocaleString('en', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 80 }}>
                    <defs>
                      <linearGradient id="mEqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={fillPath} fill="url(#mEqGrad)" />
                    <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              )
            })()}

            {/* Trades */}
            {result.trades?.length > 0 && (
              <div style={{ background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>آخر الصفقات</span>
                  <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_MONO }}>{result.trades.length} صفقة</span>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                        {['الدخول', 'الخروج', 'PnL', 'نتيجة'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: C.text2, fontWeight: 700, fontSize: 8, fontFamily: FONT_AR }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice().reverse().map((t: any, i: number) => (
                        <tr key={i} style={{ borderTop: `0.5px solid ${C.border}` }}>
                          <td style={{ padding: '6px 10px', color: C.text, fontFamily: FONT_MONO }}>${t.entry.toFixed(2)}</td>
                          <td style={{ padding: '6px 10px', color: C.text, fontFamily: FONT_MONO }}>${t.exit.toFixed(2)}</td>
                          <td style={{ padding: '6px 10px', color: t.isWin ? C.success : C.danger, fontFamily: FONT_MONO, fontWeight: 800 }}>{t.isWin ? '+' : ''}${t.pnl.toFixed(2)}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 14, background: t.isWin ? `${C.success}18` : `${C.danger}18`, color: t.isWin ? C.success : C.danger, fontWeight: 800 }}>{t.isWin ? 'ربح ✓' : 'خسارة ✗'}</span>
                          </td>
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
    </div>
  )
}
