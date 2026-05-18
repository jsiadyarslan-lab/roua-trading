'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Grid3X3, Loader2, RefreshCw, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

function corrColor(val: number): string {
  if (val >= 0.7) return C.success
  if (val >= 0.4) return '#4ADE80'
  if (val >= 0.1) return '#86EFAC40'
  if (val >= -0.1) return C.text2
  if (val >= -0.4) return '#FCA5A540'
  if (val >= -0.7) return '#F87171'
  return C.danger
}

function corrBg(val: number): string {
  if (val >= 0.7) return `${C.success}18`
  if (val >= 0.4) return `${C.success}10`
  if (val >= 0.1) return `${C.success}06`
  if (val >= -0.1) return 'rgba(255,255,255,0.02)'
  if (val >= -0.4) return `${C.danger}06`
  if (val >= -0.7) return `${C.danger}10`
  return `${C.danger}18`
}

export default function MobileCorrelationPage() {
  const router = useRouter()
  const [data, setData] = useState<{ symbols: string[]; matrix: Record<string, Record<string, number>>; topCorrelated: { s1: string; s2: string; corr: number }[]; topAntiCorrelated: { s1: string; s2: string; corr: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'matrix' | 'list'>('matrix')

  const fetchCorrelation = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/correlation')
      if (res.ok) {
        const d = await res.json()
        if (d.success) {
          setData({ symbols: d.symbols, matrix: d.matrix, topCorrelated: d.topCorrelated || [], topAntiCorrelated: d.topAntiCorrelated || [] })
        }
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCorrelation() }, [fetchCorrelation])

  return (
    <div className="m-page">
      <MobilePageHeader
        title="مصفوفة الارتباط"
        subtitle="ارتباط بيرسون بين الأصول"
        onBack={() => router.back()}
        right={
          <button onClick={fetchCorrelation} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* View Toggle */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
          {([['matrix', 'مصفوفة'], ['list', 'قائمة']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: view === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: view === key ? C.accent : C.text2, fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" color={C.accent} />
          <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>جارٍ حساب الارتباط...</span>
        </div>
      ) : data ? (
        <>
          {view === 'matrix' ? (
            <IOSCard>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Grid3X3 size={14} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>مصفوفة الارتباط</span>
              </div>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="m-no-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'ltr' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '4px 2px', fontSize: 7, fontWeight: 800, color: C.text2, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}></th>
                      {data.symbols.map(s => (
                        <th key={s} style={{ padding: '4px 2px', fontSize: 7, fontWeight: 800, color: C.text2, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>{s.split('/')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.symbols.map(s1 => (
                      <tr key={s1}>
                        <td style={{ padding: '3px 2px', fontSize: 7, fontWeight: 800, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{s1.split('/')[0]}</td>
                        {data.symbols.map(s2 => {
                          const val = data.matrix[s1]?.[s2] ?? 0
                          return (
                            <td key={s2} style={{ padding: '1px', textAlign: 'center' }}>
                              <div style={{ padding: '3px 1px', borderRadius: 3, background: corrBg(val), fontSize: 7, fontWeight: 800, color: corrColor(val), fontFamily: "'JetBrains Mono', monospace" }}>
                                {val.toFixed(2)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: C.success }} />
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ارتباط إيجابي</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: C.text2 }} />
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>محايد</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: C.danger }} />
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ارتباط سلبي</span>
                </div>
              </div>
            </IOSCard>
          ) : (
            <>
              {/* Top Correlated */}
              {data.topCorrelated.length > 0 && (
                <div className="m-section">
                  <div className="m-section__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={14} color={C.success} />
                    أقوى ارتباط إيجابي
                  </div>
                </div>
              )}
              {data.topCorrelated.map((p, i) => (
                <IOSCard key={`pos-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.success}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>#{i + 1}</div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{p.s1}</span>
                        <ArrowUpDown size={10} color={C.text2} style={{ margin: '0 4px', verticalAlign: 'middle' }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{p.s2}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>{p.corr.toFixed(3)}</span>
                  </div>
                </IOSCard>
              ))}

              {/* Top Anti-Correlated */}
              {data.topAntiCorrelated.length > 0 && (
                <div className="m-section">
                  <div className="m-section__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingDown size={14} color={C.danger} />
                    أقوى ارتباط سلبي
                  </div>
                </div>
              )}
              {data.topAntiCorrelated.map((p, i) => (
                <IOSCard key={`neg-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.danger}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>#{i + 1}</div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{p.s1}</span>
                        <ArrowUpDown size={10} color={C.text2} style={{ margin: '0 4px', verticalAlign: 'middle' }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{p.s2}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{p.corr.toFixed(3)}</span>
                  </div>
                </IOSCard>
              ))}
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد بيانات ارتباط متاحة</span>
        </div>
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
