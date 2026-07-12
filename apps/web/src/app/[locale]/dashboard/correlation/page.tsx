'use client'

import { useState, useEffect } from 'react'
import { GitMerge, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useScopedStyle } from '@/hooks/useScopedStyle'

function corrColor(v: number): string {
  if (isNaN(v)) return '#151A22' // default for NaN
  if (v >= 0.7)  return '#00FFC6'
  if (v >= 0.4)  return '#4ade80'
  if (v >= 0.1)  return '#86efac'
  if (v >= -0.1) return '#8090A8'
  if (v >= -0.4) return '#fca5a5'
  if (v >= -0.7) return '#FF4757'
  return '#FF4D4D'
}

export default function CorrelationPage() {
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg); } }`)

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchCorr = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/correlation')
      const d = await res.json()
      if (d.success) setData(d)
      else setError(d.error || 'فشل في حساب بيانات الارتباط')
    } catch {
      setError('تعذر الاتصال بخادم الارتباط. تأكد من تشغيل الخادم وحاول مجدداً.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchCorr() }, [])

  return (
    <div style={{ padding: '24px 28px', direction: 'inherit', fontFamily: "var(--font-ar)", background: '#0B0E14', minHeight: '100vh' }}>
      {/* Scoped styles via useScopedStyle */}<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <GitMerge size={22} color={'#00D4FF'} />
            <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 900, color: '#F0F2F5' }}>مصفوفة الارتباط</h1>
            <span style={{ fontSize: 'var(--text-xs)', padding: '2px 10px', borderRadius: 'var(--radius-2xl)', background: `${'#00D4FF'}18`, color: '#00D4FF', fontFamily: "var(--font-mono)", fontWeight: 700 }}>CORRELATION MATRIX</span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: '#9CA3B5' }}>ارتباط بيرسون بين عوائد الأصول اليومية — يساعد على تنويع المحفظة وتجنب الارتباط الزائد</p>
        </div>
        <button onClick={fetchCorr} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: `${'#00D4FF'}18`, border: `1px solid ${'#00D4FF'}40`, borderRadius: 'var(--radius-lg)', color: '#00D4FF', fontSize: 'var(--text-sm)', fontWeight: 800, cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> تحديث
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div style={{ textAlign: 'center', color: '#9CA3B5' }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${'#00D4FF'}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 'var(--text-sm)' }}>جارٍ حساب الارتباطات...</div>
          </div>
        </div>
      )}

      {!loading && error && !data && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px', background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)',
          textAlign: 'center',
        }}>
          <AlertTriangle size={36} style={{ color: '#FFB800', marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: '#F0F2F5', margin: '0 0 8px' }}>تعذر تحميل بيانات الارتباط</p>
          <p style={{ fontSize: 'var(--text-sm)', color: '#9CA3B5', margin: '0 0 16px' }}>{error}</p>
          <button onClick={fetchCorr} style={{ padding: '8px 20px', background: `${'#00D4FF'}18`, border: `1px solid ${'#00D4FF'}40`, borderRadius: 'var(--radius-lg)', color: '#00D4FF', fontSize: 'var(--text-sm)', fontWeight: 800, cursor: 'pointer' }}>إعادة المحاولة</button>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 700 }}>دليل القراءة:</span>
            {[
              { range: '0.7 → 1.0', label: 'ارتباط قوي', color: '#00FFA3' },
              { range: '0.4 → 0.7', label: 'ارتباط متوسط', color: '#4ade80' },
              { range: '-0.1 → 0.1', label: 'محايد', color: '#9CA3B5' },
              { range: '-0.7 → -0.4', label: 'ارتباط عكسي', color: '#FF4757' },
              { range: '-1.0 → -0.7', label: 'ارتباط عكسي قوي', color: '#FF4757' },
            ].map(l => (
              <div key={l.range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 'var(--radius-xs)', background: l.color }} />
                <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5' }}>{l.label} <span style={{ fontFamily: "var(--font-mono)", color: l.color }}>({l.range})</span></span>
              </div>
            ))}
            <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5' }}>البيانات: {data.dataPoints} يوم</span>
          </div>

          {/* Matrix */}
          <div style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', overflow: 'auto', marginBottom: 20 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 16px', borderBottom: `1px solid ${'#2A313C'}`, color: '#9CA3B5', fontWeight: 700, fontSize: 'var(--text-xs)' }}>الأصل</th>
                  {data.symbols.map((s: string) => (
                    <th key={s} style={{ padding: '10px 14px', borderBottom: `1px solid ${'#2A313C'}`, color: '#9CA3B5', fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', fontWeight: 800, whiteSpace: 'nowrap' }}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.symbols.map((s1: string) => (
                  <tr key={s1} style={{ borderTop: `1px solid ${'#2A313C'}` }}>
                    <td style={{ padding: '10px 16px', fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', fontWeight: 800, color: '#F0F2F5', whiteSpace: 'nowrap', background: '#0B0E14' }}>{s1}</td>
                    {data.symbols.map((s2: string) => {
                      const v = data.matrix[s1]?.[s2] ?? 0
                      const isSelf = s1 === s2
                      const c = corrColor(v)
                      return (
                        <td key={s2} style={{ padding: '8px 14px', textAlign: 'center', background: isSelf ? `${'#0A84FF'}15` : `${c}${Math.abs(v) > 0.3 ? '18' : '08'}` }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: isSelf ? 900 : 700, fontSize: 'var(--text-sm)', color: isSelf ? '#0A84FF' : c }}>
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
              { title: 'أعلى ارتباط موجب', pairs: data.topCorrelated, icon: <TrendingUp size={14} color={'#00FFA3'} />, color: '#00FFA3' },
              { title: 'أعلى ارتباط عكسي', pairs: data.topAntiCorrelated, icon: <TrendingDown size={14} color={'#FF4757'} />, color: '#FF4757' },
            ].map(section => (
              <div key={section.title} style={{ background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {section.icon}
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: '#F0F2F5' }}>{section.title}</span>
                </div>
                {section.pairs?.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: '#9CA3B5' }}>لا توجد بيانات كافية</span>}
                {section.pairs?.map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? `1px solid ${'#2A313C'}` : 'none' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: '#F0F2F5', fontFamily: "var(--font-mono)" }}>{p.s1} ↔ {p.s2}</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 900, color: section.color, fontFamily: "var(--font-mono)" }}>{p.corr.toFixed(3)}</span>
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
