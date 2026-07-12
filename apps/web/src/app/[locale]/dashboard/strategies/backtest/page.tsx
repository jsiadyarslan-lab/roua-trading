'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Play, Activity } from 'lucide-react'
import { getPnlColor } from '@/lib/pnl-utils'
import { useScopedStyle } from '@/hooks/useScopedStyle'

const SYMBOLS = ['BTC/USD','ETH/USD','SOL/USD','EUR/USD','GBP/USD','XAU/USD','AAPL','TSLA']

export default function BacktestPage() {
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg); } }`)
  const bt = useTranslations('dashboard.backtest')

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

  const strategies = [
    { id: 'EMA_CROSSOVER', label: bt('strategyEmaCross'), desc: bt('emaCrossoverDesc'), color: '#00D4FF' },
    { id: 'SMA_CROSSOVER', label: bt('strategySmaCross'), desc: bt('smaCrossoverDesc'), color: '#FFB800' },
    { id: 'RSI',           label: bt('strategyRsiReversal'), desc: bt('rsiReversalDesc'), color: '#B388FF' },
  ]

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
      else setError(data.error || bt('testFailed'))
    } catch { setError(bt('networkError')) }
    finally { setLoading(false) }
  }

  const s = result?.summary

  return (
    <div style={{ padding: '24px 28px', direction: 'inherit', fontFamily: "var(--font-ar)", background: '#0B0E14', minHeight: '100vh' }}>
      {/* Scoped styles via useScopedStyle */}<div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Activity size={22} color={'#B388FF'} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 900, color: '#F0F2F5' }}>{bt('pageTitle')}</h1>
          <span style={{ fontSize: 'var(--text-xs)', padding: '2px 10px', borderRadius: 'var(--radius-2xl)', background: `${'#B388FF'}18`, color: '#B388FF', fontFamily: "var(--font-mono)", fontWeight: 700 }}>BACKTESTING ENGINE</span>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: '#9CA3B5' }}>{bt('pageSubtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Config Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Strategy picker */}
          <div style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', padding: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#9CA3B5', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{bt('strategySection')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {strategies.map(st => (
                <button key={st.id} onClick={() => setStrategy(st.id)} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px',
                  background: strategy === st.id ? `${st.color}12` : 'transparent',
                  border: `1px solid ${strategy === st.id ? st.color + '50' : '#2A313C'}`,
                  borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'right', transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: strategy === st.id ? st.color : '#F0F2F5' }}>{st.label}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5' }}>{st.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Symbol + Interval */}
          <div style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#9CA3B5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{bt('assetAndTimeframe')}</div>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{ background: '#0F1117', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-md)', color: '#F0F2F5', fontSize: 'var(--text-sm)', padding: '8px 10px', fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {SYMBOLS.map(sym => <option key={sym} value={sym}>{sym}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              {['15min','1h','4h','1day'].map(iv => (
                <button key={iv} onClick={() => setInterval(iv)} style={{
                  flex: 1, padding: '6px 4px', borderRadius: 'var(--radius-md)', border: `1px solid ${interval === iv ? '#0A84FF' : '#2A313C'}`,
                  background: interval === iv ? `${'#0A84FF'}18` : 'transparent', color: interval === iv ? '#0A84FF' : '#9CA3B5',
                  fontSize: 'var(--text-xs)', fontWeight: 800, cursor: 'pointer',
                }}>{iv}</button>
              ))}
            </div>
          </div>

          {/* Strategy params */}
          <div style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#9CA3B5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{bt('parameters')}</div>
            {strategy !== 'RSI' ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ label: bt('fast'), val: fastPeriod, set: setFastPeriod }, { label: bt('slow'), val: slowPeriod, set: setSlowPeriod }].map(p => (
                  <div key={p.label} style={{ flex: 1 }}>
                    <label style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 700, display: 'block', marginBottom: 4 }}>{p.label}</label>
                    <input type="number" value={p.val} min={2} max={200} onChange={e => p.set(+e.target.value)}
                      style={{ width: '100%', background: '#0F1117', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-md)', color: '#F0F2F5', fontSize: 'var(--text-sm)', padding: '8px', fontFamily: "var(--font-mono)", boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ label: bt('overbought'), val: rsiOB, set: setRsiOB }, { label: bt('oversold'), val: rsiOS, set: setRsiOS }].map(p => (
                  <div key={p.label} style={{ flex: 1 }}>
                    <label style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 700, display: 'block', marginBottom: 4 }}>{p.label}</label>
                    <input type="number" value={p.val} min={10} max={90} onChange={e => p.set(+e.target.value)}
                      style={{ width: '100%', background: '#0F1117', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-md)', color: '#F0F2F5', fontSize: 'var(--text-sm)', padding: '8px', fontFamily: "var(--font-mono)", boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ label: bt('capital'), val: capital, set: setCapital, min: 100 }, { label: bt('riskPercentage'), val: riskPct, set: setRiskPct, min: 0.5 }].map(p => (
                <div key={p.label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 700, display: 'block', marginBottom: 4 }}>{p.label}</label>
                  <input type="number" value={p.val} min={p.min} step={p.min} onChange={e => p.set(+e.target.value)}
                    style={{ width: '100%', background: '#0F1117', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-md)', color: '#F0F2F5', fontSize: 'var(--text-sm)', padding: '8px', fontFamily: "var(--font-mono)", boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          </div>

          <button onClick={runBacktest} disabled={loading} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 48, borderRadius: 'var(--radius-lg)', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? `${'#B388FF'}40` : `linear-gradient(135deg, ${'#B388FF'}, ${'#0A84FF'})`,
            color: '#fff', fontSize: 'var(--text-base)', fontWeight: 900, fontFamily: "var(--font-ar)",
          }}>
            {loading ? <><div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> {bt('testing')}</> : <><Play size={16} fill="white" /> {bt('runTest')}</>}
          </button>
          {error && <div style={{ padding: '10px', background: `${'#FF4757'}12`, border: `1px solid ${'#FF4757'}30`, borderRadius: 'var(--radius-md)', color: '#FF4757', fontSize: 'var(--text-xs)' }}>{error}</div>}
        </div>

        {/* Results Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!result && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#151A22', border: `1px dashed ${'#2A313C'}`, borderRadius: 'var(--radius-xl)' }}>
              <div style={{ textAlign: 'center', color: '#9CA3B5' }}>
                <Activity size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{bt('configureAndStart')}</div>
              </div>
            </div>
          )}

          {s && (
            <>
              {/* KPI Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: bt('totalTradesKpi'), value: s.totalTrades, color: '#00D4FF', icon: '📊' },
                  { label: bt('winRateKpi'), value: `${s.winRate.toFixed(1)}%`, color: s.winRate >= 50 ? '#00FFA3' : '#FF4757', icon: '🎯' },
                  { label: bt('netProfit'), value: `$${s.totalPnl.toFixed(0)}`, color: s.totalPnl > 0 ? '#00FFA3' : s.totalPnl < 0 ? '#FF4757' : '#9CA3B5', icon: '💰' },
                  { label: bt('totalReturn'), value: `${s.return.toFixed(2)}%`, color: s.return > 0 ? '#00FFA3' : s.return < 0 ? '#FF4757' : '#9CA3B5', icon: '📈' },
                  { label: bt('maxDrawdownKpi'), value: `${s.maxDrawdown.toFixed(1)}%`, color: s.maxDrawdown > 20 ? '#FF4757' : '#FFB800', icon: '⚠️' },
                  { label: bt('profitFactorKpi'), value: s.profitFactor.toFixed(2), color: s.profitFactor >= 1.5 ? '#00FFA3' : '#FFB800', icon: '⚡' },
                  { label: bt('sharpeKpi'), value: s.sharpe.toFixed(2), color: s.sharpe >= 1 ? '#00FFA3' : '#FFB800', icon: '🏆' },
                  { label: bt('finalCapital'), value: `$${s.finalEquity.toLocaleString('en', { maximumFractionDigits: 0 })}`, color: '#B388FF', icon: '💎' },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-lg)', padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--text-lg)', marginBottom: 4 }}>{kpi.icon}</div>
                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 900, color: kpi.color, fontFamily: "var(--font-mono)" }}>{kpi.value}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 700, marginTop: 4 }}>{kpi.label}</div>
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
                const lineColor = isPositive ? '#00FFA3' : '#FF4757'

                return (
                  <div style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: '#F0F2F5' }}>{bt('equityCurveTitle')}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: lineColor, fontFamily: "var(--font-mono)", fontWeight: 800 }}>
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
                <div style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${'#2A313C'}`, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: '#F0F2F5' }}>{bt('recentTrades')}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5' }}>{bt('tradesCount', { count: result.trades.length })}</span>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr style={{ background: '#0F1117' }}>
                          {[bt('entryCol'), bt('exitCol'), bt('pnlCol'), bt('pnlPercentCol'), bt('resultCol')].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: '#9CA3B5', fontWeight: 700, fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.slice().reverse().map((trade: any, i: number) => (
                          <tr key={`${trade.entry}-${trade.exit}-${i}`} style={{ borderTop: `1px solid ${'#2A313C'}` }}>
                            <td style={{ padding: '8px 12px', color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>${trade.entry.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>${trade.exit.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', color: trade.isWin ? '#00FFA3' : '#FF4757', fontFamily: "var(--font-mono)", fontWeight: 800 }}>
                              {trade.isWin ? '+' : ''}${trade.pnl.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 12px', color: trade.isWin ? '#00FFA3' : '#FF4757', fontFamily: "var(--font-mono)" }}>
                              {trade.pnlPct.toFixed(2)}%
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-2xl)', background: trade.isWin ? `${'#00FFA3'}18` : `${'#FF4757'}18`, color: trade.isWin ? '#00FFA3' : '#FF4757', fontWeight: 800 }}>
                                {trade.isWin ? bt('winBadge') : bt('lossBadge')}
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
