'use client'

import { useState } from 'react'
import { Play, TrendingUp, TrendingDown, BarChart2, Activity, Target, Award } from 'lucide-react'

const T = { bg: '#04050C', bg2: '#0D1117', card: '#08090F', blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', red: '#FF4D4D', amber: '#FFB800', purple: '#B388FF', text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.12)' }

const STRATEGIES = [
  { id: 'EMA_CROSSOVER', label: 'تقاطع EMA', desc: 'شراء عند تقاطع EMA سريع فوق بطيء والعكس', color: T.cyan },
  { id: 'SMA_CROSSOVER', label: 'تقاطع SMA', desc: 'تقاطع المتوسطات البسيطة (أبطأ وأقل حساسية)', color: T.amber },
  { id: 'RSI',           label: 'RSI عكسي', desc: 'شراء عند تشبع بيعي (RSI<30) وبيع عند تشبع شرائي (RSI>70)', color: T.purple },
]

const SYMBOLS = ['BTC/USD','ETH/USD','SOL/USD','EUR/USD','GBP/USD','XAU/USD','AAPL','TSLA']

export default function BacktestPage() {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy, params, interval }),
      })
      const data = await res.json()
      if (data.success) setResult(data)
      else setError(data.error || 'فشل الاختبار')
    } catch { setError('خطأ في الشبكة') }
    finally { setLoading(false) }
  }

  const s = result?.summary

  return (
    <div style={{ padding: '24px 28px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", background: T.bg, minHeight: '100vh' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Activity size={22} color={T.purple} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text }}>محرك الاختبار الاسترجاعي</h1>
          <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 20, background: `${T.purple}18`, color: T.purple, fontFamily: 'monospace', fontWeight: 700 }}>BACKTESTING ENGINE</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>اختبر استراتيجياتك على بيانات تاريخية حقيقية وقِس الأداء بدقة مؤسسية</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Config Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Strategy picker */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>الاستراتيجية</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STRATEGIES.map(st => (
                <button key={st.id} onClick={() => setStrategy(st.id)} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px',
                  background: strategy === st.id ? `${st.color}12` : 'transparent',
                  border: `1px solid ${strategy === st.id ? st.color + '50' : T.border}`,
                  borderRadius: 10, cursor: 'pointer', textAlign: 'right', transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: strategy === st.id ? st.color : T.text }}>{st.label}</span>
                  <span style={{ fontSize: 10, color: T.text2 }}>{st.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Symbol + Interval */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>الأصل والإطار الزمني</div>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
              {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              {['15min','1h','4h','1day'].map(iv => (
                <button key={iv} onClick={() => setInterval(iv)} style={{
                  flex: 1, padding: '6px 4px', borderRadius: 8, border: `1px solid ${interval === iv ? T.blue : T.border}`,
                  background: interval === iv ? `${T.blue}18` : 'transparent', color: interval === iv ? T.blue : T.text2,
                  fontSize: 10, fontWeight: 800, cursor: 'pointer',
                }}>{iv}</button>
              ))}
            </div>
          </div>

          {/* Strategy params */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>المعاملات</div>
            {strategy !== 'RSI' ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ label: 'السريع', val: fastPeriod, set: setFastPeriod }, { label: 'البطيء', val: slowPeriod, set: setSlowPeriod }].map(p => (
                  <div key={p.label} style={{ flex: 1 }}>
                    <label style={{ fontSize: 9, color: T.text2, fontWeight: 700, display: 'block', marginBottom: 4 }}>{p.label}</label>
                    <input type="number" value={p.val} min={2} max={200} onChange={e => p.set(+e.target.value)}
                      style={{ width: '100%', background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, padding: '8px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ label: 'تشبع شرائي', val: rsiOB, set: setRsiOB }, { label: 'تشبع بيعي', val: rsiOS, set: setRsiOS }].map(p => (
                  <div key={p.label} style={{ flex: 1 }}>
                    <label style={{ fontSize: 9, color: T.text2, fontWeight: 700, display: 'block', marginBottom: 4 }}>{p.label}</label>
                    <input type="number" value={p.val} min={10} max={90} onChange={e => p.set(+e.target.value)}
                      style={{ width: '100%', background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, padding: '8px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ label: 'رأس المال ($)', val: capital, set: setCapital, min: 100 }, { label: 'مخاطرة (%)', val: riskPct, set: setRiskPct, min: 0.5 }].map(p => (
                <div key={p.label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 9, color: T.text2, fontWeight: 700, display: 'block', marginBottom: 4 }}>{p.label}</label>
                  <input type="number" value={p.val} min={p.min} step={p.min} onChange={e => p.set(+e.target.value)}
                    style={{ width: '100%', background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, padding: '8px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          </div>

          <button onClick={runBacktest} disabled={loading} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 48, borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? `${T.purple}40` : `linear-gradient(135deg, ${T.purple}, ${T.blue})`,
            color: '#fff', fontSize: 14, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
          }}>
            {loading ? <><div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> جارٍ الاختبار...</> : <><Play size={16} fill="white" /> تشغيل الاختبار</>}
          </button>
          {error && <div style={{ padding: '10px', background: `${T.red}12`, border: `1px solid ${T.red}30`, borderRadius: 8, color: T.red, fontSize: 11 }}>{error}</div>}
        </div>

        {/* Results Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!result && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: T.card, border: `1px dashed ${T.border}`, borderRadius: 14 }}>
              <div style={{ textAlign: 'center', color: T.text2 }}>
                <Activity size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 700 }}>اضبط الإعدادات وابدأ الاختبار</div>
              </div>
            </div>
          )}

          {s && (
            <>
              {/* KPI Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'إجمالي الصفقات', value: s.totalTrades, color: T.cyan, icon: '📊' },
                  { label: 'معدل الربح', value: `${s.winRate.toFixed(1)}%`, color: s.winRate >= 50 ? T.green : T.red, icon: '🎯' },
                  { label: 'صافي الربح', value: `$${s.totalPnl.toFixed(0)}`, color: s.totalPnl >= 0 ? T.green : T.red, icon: '💰' },
                  { label: 'العائد الإجمالي', value: `${s.return.toFixed(2)}%`, color: s.return >= 0 ? T.green : T.red, icon: '📈' },
                  { label: 'أقصى انسحاب', value: `${s.maxDrawdown.toFixed(1)}%`, color: s.maxDrawdown > 20 ? T.red : T.amber, icon: '⚠️' },
                  { label: 'عامل الربح', value: s.profitFactor.toFixed(2), color: s.profitFactor >= 1.5 ? T.green : T.amber, icon: '⚡' },
                  { label: 'نسبة شارب', value: s.sharpe.toFixed(2), color: s.sharpe >= 1 ? T.green : T.amber, icon: '🏆' },
                  { label: 'الرأسمال النهائي', value: `$${s.finalEquity.toLocaleString('en', { maximumFractionDigits: 0 })}`, color: T.purple, icon: '💎' },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{kpi.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: kpi.color, fontFamily: 'monospace' }}>{kpi.value}</div>
                    <div style={{ fontSize: 9, color: T.text2, fontWeight: 700, marginTop: 4 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Equity Curve (SVG) */}
              {result.equityCurve?.length > 2 && (() => {
                const pts = result.equityCurve
                const vals = pts.map((p: any) => p.equity)
                const mn = Math.min(...vals), mx = Math.max(...vals)
                const range = mx - mn || 1
                const W = 600, H = 100
                const svgPts = pts.map((p: any, i: number) => `${(i / (pts.length - 1)) * W},${H - ((p.equity - mn) / range) * (H - 10) - 5}`)
                const linePath = `M ${svgPts.join(' L ')}`
                const fillPath = `${linePath} L ${W},${H} L 0,${H} Z`
                const isPositive = vals[vals.length - 1] >= vals[0]
                const lineColor = isPositive ? T.green : T.red

                return (
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>منحنى رأس المال</span>
                      <span style={{ fontSize: 11, color: lineColor, fontFamily: 'monospace', fontWeight: 800 }}>
                        ${s.finalEquity.toLocaleString('en', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 100 }}>
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={fillPath} fill="url(#eqGrad)" />
                      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                )
              })()}

              {/* Trades Table */}
              {result.trades?.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>آخر الصفقات</span>
                    <span style={{ fontSize: 10, color: T.text2 }}>{result.trades.length} صفقة</span>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: T.bg2 }}>
                          {['الدخول', 'الخروج', 'PnL', 'PnL%', 'النتيجة'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: T.text2, fontWeight: 700, fontSize: 9, textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.slice().reverse().map((t: any, i: number) => (
                          <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                            <td style={{ padding: '8px 12px', color: T.text, fontFamily: 'monospace' }}>${t.entry.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: T.text, fontFamily: 'monospace' }}>${t.exit.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: t.isWin ? T.green : T.red, fontFamily: 'monospace', fontWeight: 800 }}>
                              {t.isWin ? '+' : ''}${t.pnl.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 12px', color: t.isWin ? T.green : T.red, fontFamily: 'monospace' }}>
                              {t.pnlPct.toFixed(2)}%
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: t.isWin ? `${T.green}18` : `${T.red}18`, color: t.isWin ? T.green : T.red, fontWeight: 800 }}>
                                {t.isWin ? 'ربح ✓' : 'خسارة ✗'}
                              </span>
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
    </div>
  )
}
