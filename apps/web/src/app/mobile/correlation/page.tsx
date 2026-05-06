'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, GitMerge, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { ScopedStyle } from '@/components/ScopedStyle'

/* ─── Design Tokens ─── */
const C = {
  accent:  '#00D4FF',
  success: '#32D74B',
  danger:  '#FF453A',
  amber:   '#FFB800',
  purple:  '#A78BFA',
  text:    '#F0F2F5',
  text2:   'rgba(235,235,245,0.5)',
  text3:   'rgba(235,235,245,0.25)',
  bg:      '#1C1C1E',
  border:  'rgba(255,255,255,0.08)',
}
const FONT_AR   = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

function corrColor(v: number): string {
  if (isNaN(v)) return '#1A1D29'
  if (v >= 0.7)  return '#00FFC6'
  if (v >= 0.4)  return '#4ade80'
  if (v >= 0.1)  return '#86efac'
  if (v >= -0.1) return '#8090A8'
  if (v >= -0.4) return '#fca5a5'
  if (v >= -0.7) return '#f87171'
  return '#FF4D4D'
}

export default function MobileCorrelationPage() {
  const router = useRouter()
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
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowRight size={18} color="#FFFFFF" />
        </motion.button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ color: C.accent, display: 'flex' }}><GitMerge size={20} /></div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>مصفوفة الارتباط</h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={fetchCorr}
          disabled={loading}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: `${C.accent}15`, border: `0.5px solid ${C.accent}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <RefreshCw size={16} color={C.accent} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </motion.button>
      </div>

      <ScopedStyle>{`@keyframes spin { to { transform: rotate(360deg); } }`}</ScopedStyle>

      <div style={{ padding: '16px 20px' }}>
        {/* Description */}
        <p style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR, marginBottom: 16, lineHeight: 1.6 }}>
          ارتباط بيرسون بين عوائد الأصول اليومية — يساعد على تنويع المحفظة وتجنب الارتباط الزائد
        </p>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ textAlign: 'center', color: C.text2 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${C.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 12, fontFamily: FONT_AR }}>جارٍ حساب الارتباطات...</div>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && !data && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px 20px', borderRadius: 20, background: 'rgba(28,28,30,0.6)',
            backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`, textAlign: 'center',
          }}>
            <AlertTriangle size={32} color={C.amber} style={{ marginBottom: 12, opacity: 0.5 }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT_AR, margin: '0 0 8px' }}>تعذر تحميل بيانات الارتباط</p>
            <p style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR, margin: '0 0 16px' }}>{error}</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={fetchCorr} style={{
              padding: '10px 20px', borderRadius: 12, background: `${C.accent}18`,
              border: `1px solid ${C.accent}40`, color: C.accent, fontSize: 12,
              fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer',
            }}>إعادة المحاولة</motion.button>
          </div>
        )}

        {/* Data */}
        {data && !loading && (
          <>
            {/* Legend */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '14px 16px', borderRadius: 16, marginBottom: 16,
                background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)',
                border: `0.5px solid ${C.border}`,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, marginBottom: 8 }}>دليل القراءة</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'ارتباط قوي', color: C.success },
                  { label: 'ارتباط متوسط', color: '#4ade80' },
                  { label: 'محايد', color: C.text2 },
                  { label: 'ارتباط عكسي', color: '#f87171' },
                  { label: 'ارتباط عكسي قوي', color: C.danger },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                    <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>{l.label}</span>
                  </div>
                ))}
              </div>
              {data.dataPoints && (
                <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR, marginTop: 6 }}>البيانات: {data.dataPoints} يوم</div>
              )}
            </motion.div>

            {/* Matrix - Scrollable */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              style={{
                borderRadius: 20, overflow: 'auto', marginBottom: 16,
                background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)',
                border: `0.5px solid ${C.border}`, WebkitOverflowScrolling: 'touch',
              }}
            >
              <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 10px', borderBottom: `0.5px solid ${C.border}`, color: C.text2, fontWeight: 700, fontSize: 8, position: 'sticky', top: 0, background: 'rgba(28,28,30,0.95)', zIndex: 1 }}>الأصل</th>
                    {data.symbols.map((s: string) => (
                      <th key={s} style={{ padding: '8px 8px', borderBottom: `0.5px solid ${C.border}`, color: C.text2, fontFamily: FONT_MONO, fontSize: 8, fontWeight: 800, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'rgba(28,28,30,0.95)', zIndex: 1 }}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.symbols.map((s1: string) => (
                    <tr key={s1} style={{ borderTop: `0.5px solid ${C.border}` }}>
                      <td style={{ padding: '6px 10px', fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', background: '#000', position: 'sticky', right: 0, zIndex: 1 }}>{s1}</td>
                      {data.symbols.map((s2: string) => {
                        const v = data.matrix[s1]?.[s2] ?? 0
                        const isSelf = s1 === s2
                        const c = corrColor(v)
                        return (
                          <td key={s2} style={{ padding: '6px 8px', textAlign: 'center', background: isSelf ? `${C.accent}15` : `${c}${Math.abs(v) > 0.3 ? '18' : '08'}` }}>
                            <span style={{ fontFamily: FONT_MONO, fontWeight: isSelf ? 900 : 700, fontSize: 10, color: isSelf ? C.accent : c }}>
                              {isSelf ? '▪' : v.toFixed(2)}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>

            {/* Top Pairs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { title: 'أعلى ارتباط موجب', pairs: data.topCorrelated, icon: <TrendingUp size={14} color={C.success} />, color: C.success },
                { title: 'أعلى ارتباط عكسي', pairs: data.topAntiCorrelated, icon: <TrendingDown size={14} color={C.danger} />, color: C.danger },
              ].map((section, idx) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.05 }}
                  style={{
                    borderRadius: 20, padding: '16px',
                    background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)',
                    border: `0.5px solid ${C.border}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    {section.icon}
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>{section.title}</span>
                  </div>
                  {section.pairs?.length === 0 && <span style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>لا توجد بيانات كافية</span>}
                  {section.pairs?.map((p: any, i: number) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0', borderTop: i > 0 ? `0.5px solid ${C.border}` : 'none',
                    }}>
                      <span style={{ fontSize: 12, color: C.text, fontFamily: FONT_MONO }}>{p.s1} ↔ {p.s2}</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: section.color, fontFamily: FONT_MONO }}>{p.corr.toFixed(3)}</span>
                    </div>
                  ))}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
