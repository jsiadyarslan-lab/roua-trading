'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Shield, AlertTriangle, TrendingUp, TrendingDown,
  Loader2, BarChart3, Activity, Target, CreditCard, Eye, EyeOff, Sparkles,
} from 'lucide-react'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: '#8B92A8',
  text3: '#8B92A8', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

interface PositionDetail {
  symbol: string; exchange: string; quantity: number; currentPrice: number;
  value: number; weight: number; change24h: number; assetType: string;
}

interface RiskMetrics {
  concentrationRisk: number; diversificationScore: number; largestPositionWeight: number;
  positionCount: number; varEstimate: number; volatilityEstimate: number;
  sharpeRatio?: number; winRate?: number; totalTrades?: number; profitTrades?: number;
}

interface RiskReport {
  summary: string; riskScore: number; totalValue: number; currency: string;
  positions: PositionDetail[]; metrics: RiskMetrics;
  recommendations: string[]; aiAnalysis: string; analyzedAt: string;
}

function getRiskColor(score: number) {
  return score < 30 ? C.success : score < 60 ? C.amber : C.danger
}

function getRiskLabel(score: number) {
  return score < 30 ? 'منخفض' : score < 60 ? 'متوسط' : 'مرتفع'
}

export default function MobileSanctuaryPage() {
  const router = useRouter()
  const [report, setReport] = useState<RiskReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'analysis'>('overview')
  const [showBalance, setShowBalance] = useState(true)

  const analyzePortfolio = async () => {
    setAnalyzing(true); setError('')
    try {
      const res = await fetch('/api/portfolio/sanctuary')
      if (res.ok) { const data = await res.json(); if (data.success) setReport({ ...data.data, positions: data.data.positions ?? [], metrics: data.data.metrics ?? {} }) }
      else { const data = await res.json(); throw new Error(data.error || 'فشل في تحليل المحفظة') }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)) } finally { setLoading(false); setAnalyzing(false) }
  }

  useEffect(() => { analyzePortfolio() }, [])

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)
  const formatValue = (val: number) => !showBalance ? '••••••' : formatCurrency(val)

  const portfolioReturn = report && report.positions.length > 0
    ? report.positions.reduce((sum, pos) => sum + (pos.change24h ?? 0) * pos.weight / 100, 0)
    : null

  const pieSegments = report ? report.positions.slice(0, 5).map(pos => ({
    value: pos.value, color: pos.change24h >= 0 ? '#00FFC6' : '#FF4D4D', label: pos.symbol,
  })) : []

  return (
    <div style={{ minHeight: '100%', background: '#0B0E14', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 12px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={16} color="#fff" />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>ملاذ المحفظة</h1>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={analyzePortfolio} disabled={analyzing} style={{
            padding: '6px 12px', borderRadius: 10, background: `${C.accent}15`, border: `0.5px solid ${C.accent}25`,
            color: C.accent, fontSize: 10, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {analyzing ? <Loader2 size={10} className="animate-spin" /> : <Activity size={10} />}
            إعادة التحليل
          </motion.button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ id: 'overview', label: 'نظرة عامة' }, { id: 'positions', label: 'المراكز' }, { id: 'analysis', label: 'التحليل' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
              background: activeTab === tab.id ? `${C.amber}15` : 'transparent',
              color: activeTab === tab.id ? C.amber : C.text2,
              fontSize: 11, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: `${C.danger}10`, border: `0.5px solid ${C.danger}25`, marginBottom: 12 }}>
            <AlertTriangle size={13} color={C.danger} />
            <span style={{ fontSize: 11, color: C.danger, fontFamily: FONT_AR }}>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 28, height: 28, margin: '0 auto 10px' }}>
              <Shield size={28} style={{ color: C.accent, opacity: 0.6 }} />
            </motion.div>
            <p style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR }}>جارٍ تحليل المحفظة...</p>
          </div>
        )}

        {/* Report Content */}
        {report && !loading && (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Equity Card */}
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{
                  padding: '18px', borderRadius: 18,
                  background: 'linear-gradient(135deg, rgba(10,132,255,0.06), rgba(162,89,255,0.04))',
                  border: '0.5px solid rgba(0,212,255,0.15)', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={14} color={C.accent} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: FONT_AR }}>حقوق الملكية</span>
                    </div>
                    <button onClick={() => setShowBalance(!showBalance)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      {showBalance ? <Eye size={14} color={C.text2} /> : <EyeOff size={14} color={C.text2} />}
                    </button>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: FONT_MONO, color: C.text, letterSpacing: '-0.03em' }} dir="ltr">{formatValue(report.totalValue)}</div>
                  {portfolioReturn !== null && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '2px 8px', borderRadius: 6, background: portfolioReturn >= 0 ? `${C.success}10` : `${C.danger}10`, border: `0.5px solid ${portfolioReturn >= 0 ? `${C.success}25` : `${C.danger}25`}` }}>
                      <TrendingUp size={10} color={portfolioReturn >= 0 ? C.success : C.danger} />
                      <span style={{ fontSize: 10, fontWeight: 800, fontFamily: FONT_MONO, color: portfolioReturn >= 0 ? C.success : C.danger }} dir="ltr">{portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%</span>
                    </div>
                  )}
                </motion.div>

                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { icon: <BarChart3 size={12} color="#fff" />, label: 'نسبة شارب', value: report.metrics.sharpeRatio?.toFixed(2) ?? '—', color: C.success, gradient: 'linear-gradient(135deg, #00FFC6, #00B894)' },
                    { icon: <TrendingUp size={12} color="#fff" />, label: 'معدل الربح', value: `${report.metrics.winRate ?? 0}%`, color: C.accent, gradient: 'linear-gradient(135deg, #0A84FF, #5E5CE6)' },
                    { icon: <Target size={12} color="#fff" />, label: 'مخاطر التركيز', value: `${report.metrics.concentrationRisk}/100`, color: getRiskColor(report.metrics.concentrationRisk), gradient: `linear-gradient(135deg, ${getRiskColor(report.metrics.concentrationRisk)}, ${getRiskColor(report.metrics.concentrationRisk)}80)` },
                    { icon: <Activity size={12} color="#fff" />, label: 'درجة التنويع', value: `${report.metrics.diversificationScore}/100`, color: report.metrics.diversificationScore >= 70 ? C.success : C.amber, gradient: 'linear-gradient(135deg, #FFB800, #FF8C00)' },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: '12px', borderRadius: 14, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: -6, right: -6, width: 40, height: 40, background: s.color, filter: 'blur(24px)', opacity: 0.1, pointerEvents: 'none' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: s.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</div>
                        <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>{s.label}</span>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: FONT_MONO, color: s.color }} dir="ltr">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Distribution Pie */}
                {pieSegments.length > 0 && (
                  <div style={{ padding: '14px', borderRadius: 18, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Target size={12} color={C.amber} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>توزيع المحفظة</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 80, height: 80, borderRadius: '50%', background: `conic-gradient(${pieSegments.map((seg, i) => {
                        const total = pieSegments.reduce((s2, seg2) => s2 + seg2.value, 0)
                        const start = pieSegments.slice(0, i).reduce((s2, seg2) => s2 + (seg2.value / total) * 360, 0)
                        const end = start + (seg.value / total) * 360
                        return `${seg.color} ${start}deg ${end}deg`
                      }).join(', ')})`, position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', inset: '20px', borderRadius: '50%', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                          <span style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>الإجمالي</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>{pieSegments.length}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {pieSegments.map((seg, i) => {
                          const total = pieSegments.reduce((s2, seg2) => s2 + seg2.value, 0)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>{seg.label}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: FONT_MONO }} dir="ltr">{((seg.value / total) * 100).toFixed(1)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Open Positions */}
                {report.positions.length > 0 && (
                  <div style={{ borderRadius: 18, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BarChart3 size={12} color={C.accent} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>المراكز المفتوحة</span>
                        <span style={{ fontSize: 8, fontWeight: 700, background: `${C.accent}15`, color: C.accent, padding: '1px 6px', borderRadius: 8, fontFamily: FONT_MONO }}>{report.positions.length}</span>
                      </div>
                    </div>
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                      {report.positions.map((pos, i) => (
                        <div key={`${pos.symbol}-${pos.exchange}`} style={{
                          padding: '10px 14px', borderBottom: i < report.positions.length - 1 ? `0.5px solid ${C.border}` : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #0A84FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', fontFamily: FONT_MONO }}>{pos.symbol.slice(0, 2)}</div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: C.text }} dir="ltr">{pos.symbol}</div>
                              <div style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>{pos.exchange}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 7, color: C.text3, fontFamily: FONT_AR }}>الوزن</div>
                              <div style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: pos.weight > 20 ? C.danger : C.text }}>{pos.weight.toFixed(1)}%</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 7, color: C.text3, fontFamily: FONT_AR }}>24س</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                {pos.change24h >= 0 ? <TrendingUp size={9} color={C.success} /> : <TrendingDown size={9} color={C.danger} />}
                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: pos.change24h >= 0 ? C.success : C.danger }} dir="ltr">{pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Positions Tab */}
            {activeTab === 'positions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {report.positions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: C.text2, fontFamily: FONT_AR }}>لا توجد مراكز</div>
                ) : report.positions.map((pos, i) => (
                  <motion.div key={`${pos.symbol}-${pos.exchange}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    style={{
                      padding: '12px 14px', borderRadius: 14, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`,
                      borderInlineEnd: pos.change24h >= 0 ? `3px solid ${C.success}` : `3px solid ${C.danger}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #0A84FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', fontFamily: FONT_MONO }}>{pos.symbol.slice(0, 2)}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: C.text }} dir="ltr">{pos.symbol}</div>
                        <div style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>{pos.exchange} · {pos.assetType}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: C.text3, fontFamily: FONT_AR }}>القيمة</div>
                        <div style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: C.text }} dir="ltr">{formatCurrency(pos.value)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: C.text3, fontFamily: FONT_AR }}>الوزن</div>
                        <div style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: pos.weight > 20 ? C.danger : C.text }}>{pos.weight.toFixed(1)}%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: C.text3, fontFamily: FONT_AR }}>24س</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {pos.change24h >= 0 ? <TrendingUp size={9} color={C.success} /> : <TrendingDown size={9} color={C.danger} />}
                          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: pos.change24h >= 0 ? C.success : C.danger }} dir="ltr">{pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Risk Score */}
                <div style={{ padding: '18px', borderRadius: 18, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -8, left: -8, width: 50, height: 50, background: getRiskColor(report.riskScore), filter: 'blur(30px)', opacity: 0.1, pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg, ${getRiskColor(report.riskScore)}, ${getRiskColor(report.riskScore)}80)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Shield size={12} color="#fff" />
                    </div>
                    <span style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>مستوى المخاطر</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, fontFamily: FONT_MONO, color: getRiskColor(report.riskScore) }}>{report.riskScore}</span>
                    <span style={{ fontSize: 12, color: C.text3, fontFamily: FONT_MONO }}>/100</span>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${getRiskColor(report.riskScore)}15`, color: getRiskColor(report.riskScore), fontFamily: FONT_AR, border: `0.5px solid ${getRiskColor(report.riskScore)}25` }}>
                      {getRiskLabel(report.riskScore)}
                    </span>
                  </div>
                </div>

                {/* Recommendations */}
                {report.recommendations.length > 0 && (
                  <div style={{ padding: '14px', borderRadius: 18, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Sparkles size={12} color={C.purple} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>التوصيات</span>
                    </div>
                    {report.recommendations.map((rec, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderTop: i > 0 ? `0.5px solid ${C.border}` : 'none' }}>
                        <div style={{ width: 5, height: 5, borderRadius: 3, background: C.accent, marginTop: 5, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.5 }}>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Analysis */}
                {report.aiAnalysis && (
                  <div style={{ padding: '14px', borderRadius: 18, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Activity size={12} color={C.purple} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>تحليل AI</span>
                    </div>
                    <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.6 }}>{report.aiAnalysis}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
