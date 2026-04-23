'use client'

import { useState, useEffect } from 'react'
import { GitMerge, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'

const T = { bg: '#04050C', card: '#08090F', blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', red: '#FF4D4D', amber: '#FFB800', purple: '#B388FF', text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.12)' }

function corrColor(v: number): string {
  if (v >= 0.7)  return '#00FFC6'
  if (v >= 0.4)  return '#4ade80'
  if (v >= 0.1)  return '#86efac'
  if (v >= -0.1) return '#8090A8'
  if (v >= -0.4) return '#fca5a5'
  if (v >= -0.7) return '#f87171'
  return '#FF4D4D'
}

export default function CorrelationPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchCorr = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/correlation')
      const d = await res.json()
      if (d.success) setData(d)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchCorr() }, [])

  return (
    <div style={{ padding: '24px 28px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", background: T.bg, minHeight: '100vh' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <GitMerge size={22} color={T.cyan} />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text }}>مصفوفة الارتباط</h1>
            <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 20, background: `${T.cyan}18`, color: T.cyan, fontFamily: 'monospace', fontWeight: 700 }}>CORRELATION MATRIX</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>ارتباط بيرسون بين عوائد الأصول اليومية — يساعد على تنويع المحفظة وتجنب الارتباط الزائد</p>
        </div>
        <button onClick={fetchCorr} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: `${T.cyan}18`, border: `1px solid ${T.cyan}40`, borderRadius: 10, color: T.cyan, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> تحديث
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div style={{ textAlign: 'center', color: T.text2 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${T.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13 }}>جارٍ حساب الارتباطات...</div>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: T.text2, fontWeight: 700 }}>دليل القراءة:</span>
            {[
              { range: '0.7 → 1.0', label: 'ارتباط قوي', color: T.green },
              { range: '0.4 → 0.7', label: 'ارتباط متوسط', color: '#4ade80' },
              { range: '-0.1 → 0.1', label: 'محايد', color: T.text2 },
              { range: '-0.7 → -0.4', label: 'ارتباط عكسي', color: '#f87171' },
              { range: '-1.0 → -0.7', label: 'ارتباط عكسي قوي', color: T.red },
            ].map(l => (
              <div key={l.range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                <span style={{ fontSize: 10, color: T.text2 }}>{l.label} <span style={{ fontFamily: 'monospace', color: l.color }}>({l.range})</span></span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: T.text2 }}>البيانات: {data.dataPoints} يوم</span>
          </div>

          {/* Matrix */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'auto', marginBottom: 20 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, color: T.text2, fontWeight: 700, fontSize: 9 }}>الأصل</th>
                  {data.symbols.map((s: string) => (
                    <th key={s} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, color: T.text2, fontFamily: 'monospace', fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.symbols.map((s1: string) => (
                  <tr key={s1} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', background: T.bg }}>{s1}</td>
                    {data.symbols.map((s2: string) => {
                      const v = data.matrix[s1]?.[s2] ?? 0
                      const isSelf = s1 === s2
                      const c = corrColor(v)
                      return (
                        <td key={s2} style={{ padding: '8px 14px', textAlign: 'center', background: isSelf ? `${T.blue}15` : `${c}${Math.abs(v) > 0.3 ? '18' : '08'}` }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: isSelf ? 900 : 700, fontSize: 12, color: isSelf ? T.blue : c }}>
                            {isSelf ? '▪' : v.toFixed(2)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top pairs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { title: 'أعلى ارتباط موجب', pairs: data.topCorrelated, icon: <TrendingUp size={14} color={T.green} />, color: T.green },
              { title: 'أعلى ارتباط عكسي', pairs: data.topAntiCorrelated, icon: <TrendingDown size={14} color={T.red} />, color: T.red },
            ].map(section => (
              <div key={section.title} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {section.icon}
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{section.title}</span>
                </div>
                {section.pairs?.length === 0 && <span style={{ fontSize: 11, color: T.text2 }}>لا توجد بيانات كافية</span>}
                {section.pairs?.map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <span style={{ fontSize: 11, color: T.text, fontFamily: 'monospace' }}>{p.s1} ↔ {p.s2}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: section.color, fontFamily: 'monospace' }}>{p.corr.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
