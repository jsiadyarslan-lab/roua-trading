'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Target, RefreshCw, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, ArrowUpDown, Sparkles,
  Clock, DollarSign, Activity, Search, Zap, CheckCircle2, XCircle,
} from 'lucide-react'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: '#8B92A8',
  text3: '#8B92A8', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Types ─── */
interface PredictionEvent {
  id: string; sourceId: string; source: string; title: string; description?: string;
  category?: string; relatedSymbols: string; marketProbability: number;
  aiProbability?: number | null; predictionGap?: number | null;
  gapDirection?: string | null; signalBoost?: number | null;
  volume24h?: number; liquidity?: number; endDate?: string | null;
  status: string; impactAssessment?: string | null; lastSyncedAt: string;
}

/* ─── Helpers ─── */
function safeParseJSON(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') { try { const p = JSON.parse(val); if (Array.isArray(p)) return p.map(String) } catch {} }
  return []
}
function safeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const n = Number(val); return Number.isFinite(n) ? n : null
}
function formatPercent(val: number | null | undefined, d = 1): string {
  if (val == null || !Number.isFinite(val)) return '—'
  return `${(val * 100).toFixed(d)}%`
}
function formatVolume(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return '—'
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
  return val.toFixed(0)
}
function gapColor(gap: number | null | undefined): string {
  if (gap == null || !Number.isFinite(gap)) return C.text2
  const a = Math.abs(gap); if (a < 0.05) return C.success; if (a < 0.15) return C.amber; return C.danger
}
function gapLabel(gap: number | null | undefined): string {
  if (gap == null || !Number.isFinite(gap)) return '—'
  const a = Math.abs(gap); if (a < 0.05) return 'متوافق'; if (a < 0.15) return 'متوسط'; return 'كبير'
}
function categoryLabel(cat?: string): string {
  switch (cat) { case 'politics': return 'سياسة'; case 'economy': return 'اقتصاد'; case 'technology': return 'تقنية'; case 'sports': return 'رياضة'; default: return cat || 'أخرى' }
}
function categoryColor(cat?: string): string {
  switch (cat) { case 'politics': return '#FF6B6B'; case 'economy': return '#FFB800'; case 'technology': return '#00D4FF'; case 'sports': return '#00FFC6'; default: return '#A259FF' }
}

const TABS = [{ id: 'events', label: 'الأحداث' }, { id: 'gaps', label: 'أكبر الفجوات' }, { id: 'vote', label: 'تصويت AI' }]
const CATEGORIES = [{ id: '', label: 'الكل' }, { id: 'politics', label: 'سياسة' }, { id: 'economy', label: 'اقتصاد' }, { id: 'technology', label: 'تقنية' }, { id: 'sports', label: 'رياضة' }]

export default function MobilePredictionMarketPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('events')
  const [events, setEvents] = useState<PredictionEvent[]>([])
  const [gaps, setGaps] = useState<PredictionEvent[]>([])
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [voteSymbol, setVoteSymbol] = useState('')
  const [voteData, setVoteData] = useState<any>(null)
  const [voteLoading, setVoteLoading] = useState(false)
  const [voteError, setVoteError] = useState('')

  const fetchEvents = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams(); if (category) params.set('category', category)
      const res = await fetch(`/api/prediction-market/events?${params.toString()}`)
      if (res.ok) { const data = await res.json(); if (data.success && Array.isArray(data.data)) setEvents(data.data); else setEvents([]) }
      else setEvents([])
    } catch { setError('تعذر تحميل الأحداث.') } finally { setLoading(false) }
  }, [category])

  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch('/api/prediction-market/gaps/top?limit=10')
      if (res.ok) { const data = await res.json(); if (data.success && Array.isArray(data.data)) setGaps(data.data); else setGaps([]) }
    } catch {}
  }, [])

  const handleSync = async () => {
    setSyncing(true); setError('')
    try {
      const res = await fetch('/api/prediction-market/sync?force=true', { method: 'POST' })
      const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || 'فشل في المزامنة')
      await fetchEvents(); await fetchGaps()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'فشل في المزامنة') } finally { setSyncing(false) }
  }

  const handleAnalyze = async (id: string) => {
    setAnalyzing(id)
    try {
      const res = await fetch(`/api/prediction-market/analyze/${id}`, { method: 'POST' })
      if (res.ok) { await fetchEvents(); await fetchGaps() }
    } catch {} finally { setAnalyzing(null) }
  }

  const handleFetchVote = async () => {
    if (!voteSymbol.trim()) return
    setVoteLoading(true); setVoteError(''); setVoteData(null)
    try {
      const res = await fetch(`/api/prediction-market/vote/${encodeURIComponent(voteSymbol.trim().toUpperCase())}`)
      const data = await res.json()
      if (data.success && data.data) setVoteData(data.data); else setVoteError('لا توجد بيانات تصويت متاحة')
    } catch { setVoteError('تعذر جلب تصويت AI.') } finally { setVoteLoading(false) }
  }

  useEffect(() => { fetchEvents(); fetchGaps() }, [fetchEvents, fetchGaps])

  const totalEvents = events.length
  const avgGap = events.length > 0 ? events.reduce((s, e) => s + (safeNumber(e.predictionGap) != null ? Math.abs(safeNumber(e.predictionGap)!) : 0), 0) / events.length : 0
  const alignedEvents = events.filter(e => e.gapDirection === 'aligned').length

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
            <div style={{ color: C.purple, display: 'flex' }}><Target size={20} /></div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>الأسواق التنبؤية</h1>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleSync} disabled={syncing} style={{
            padding: '8px 14px', borderRadius: 10, background: `${C.accent}15`,
            border: `0.5px solid ${C.accent}25`, color: C.accent, fontSize: 11,
            fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            مزامنة
          </motion.button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: activeTab === tab.id ? `${C.accent}15` : 'transparent',
              color: activeTab === tab.id ? C.accent : C.text2,
              fontSize: 12, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer',
              borderBottom: activeTab === tab.id ? `2px solid ${C.accent}` : '2px solid transparent',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: `${C.danger}10`, border: `0.5px solid ${C.danger}25`, marginBottom: 12 }}>
              <AlertTriangle size={13} color={C.danger} />
              <span style={{ fontSize: 11, color: C.danger, fontFamily: FONT_AR, flex: 1 }}>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger }}><XCircle size={12} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'إجمالي الأحداث', value: totalEvents, color: C.accent },
            { label: 'متوسط الفجوة', value: formatPercent(avgGap), color: C.amber },
            { label: 'أحداث متوافقة', value: alignedEvents, color: C.success },
            { label: 'الفئات', value: CATEGORIES.length - 1, color: C.purple },
          ].map((s, i) => (
            <div key={i} style={{ padding: '12px', borderRadius: 14, background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color, fontFamily: FONT_MONO }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Category Filter */}
        {activeTab === 'events' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
                padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                border: category === cat.id ? `0.5px solid ${C.accent}40` : `0.5px solid ${C.border}`,
                background: category === cat.id ? `${C.accent}15` : 'transparent',
                color: category === cat.id ? C.accent : C.text2,
                fontSize: 10, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
              }}>{cat.label}</button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {/* Events Tab */}
          {activeTab === 'events' && (
            <motion.div key="events" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Loader2 size={24} color={C.accent} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 12, color: C.text2, fontFamily: FONT_AR }}>جارٍ تحميل الأحداث...</p>
                </div>
              ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.text2 }}>
                  <Target size={32} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, fontFamily: FONT_AR }}>لا توجد أحداث حالياً</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {events.map((event, idx) => {
                    const symbols = safeParseJSON(event.relatedSymbols)
                    const isAnalyzing = analyzing === event.id
                    return (
                      <motion.div key={event.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                        style={{ borderRadius: 16, background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`, overflow: 'hidden', position: 'relative' }}>
                        {/* Category accent */}
                        <div style={{ position: 'absolute', top: 0, right: 0, width: 3, height: '100%', background: categoryColor(event.category) }} />
                        <div style={{ padding: '14px 16px' }}>
                          {/* Title + Analyze */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT_AR, lineHeight: 1.5 }}>{event.title}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${categoryColor(event.category)}18`, border: `0.5px solid ${categoryColor(event.category)}40`, color: categoryColor(event.category), fontFamily: FONT_AR }}>{categoryLabel(event.category)}</span>
                                {symbols.slice(0, 3).map((sym, i) => (
                                  <span key={i} style={{ fontSize: 8, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${C.accent}10`, color: C.accent, fontFamily: FONT_MONO }}>{sym}</span>
                                ))}
                              </div>
                            </div>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAnalyze(event.id)} disabled={isAnalyzing} style={{
                              padding: '8px 14px', borderRadius: 10, background: `${C.purple}12`, border: `0.5px solid ${C.purple}25`,
                              color: C.purple, fontSize: 10, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 36,
                            }}>
                              {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                              تحليل
                            </motion.button>
                          </div>

                          {/* Probability Bars */}
                          <div style={{ marginBottom: 8 }}>
                            {/* Market */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 8, fontWeight: 700, color: C.accent, fontFamily: FONT_AR, width: 28, flexShrink: 0 }}>السوق</span>
                              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(Math.max(event.marketProbability * 100, 0), 100)}%` }} transition={{ duration: 0.6 }}
                                  style={{ height: '100%', background: 'linear-gradient(90deg, #00D4FF, #0A84FF)', borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: FONT_MONO, color: C.accent, width: 30, textAlign: 'left' }} dir="ltr">{(event.marketProbability * 100).toFixed(0)}%</span>
                            </div>
                            {/* AI */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 8, fontWeight: 700, color: C.purple, fontFamily: FONT_AR, width: 28, flexShrink: 0 }}>AI</span>
                              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                                {event.aiProbability != null && Number.isFinite(event.aiProbability) ? (
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(Math.max(event.aiProbability! * 100, 0), 100)}%` }} transition={{ duration: 0.6, delay: 0.1 }}
                                    style={{ height: '100%', background: 'linear-gradient(90deg, #A259FF, #7C3AED)', borderRadius: 4 }} />
                                ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.text3 }}>—</span></div>}
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: FONT_MONO, color: event.aiProbability != null ? C.purple : C.text3, width: 30, textAlign: 'left' }} dir="ltr">
                                {event.aiProbability != null && Number.isFinite(event.aiProbability) ? `${(event.aiProbability * 100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Gap + Footer */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                            {event.predictionGap != null && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ArrowUpDown size={9} style={{ color: gapColor(event.predictionGap) }} />
                                <span style={{ fontSize: 8, fontWeight: 600, color: gapColor(event.predictionGap), fontFamily: FONT_AR }}>
                                  الفجوة: {formatPercent(event.predictionGap)} ({gapLabel(event.predictionGap)})
                                </span>
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              {safeNumber(event.volume24h) != null && (
                                <span style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>الحجم: {formatVolume(safeNumber(event.volume24h))}</span>
                              )}
                              {event.endDate && (
                                <span style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>الانتهاء: {new Date(event.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Gaps Tab */}
          {activeTab === 'gaps' && (
            <motion.div key="gaps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {gaps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.text2 }}>
                  <ArrowUpDown size={32} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, fontFamily: FONT_AR }}>لا توجد فجوات كبيرة</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {gaps.map((event, idx) => {
                    const gapVal = safeNumber(event.predictionGap)
                    const absGap = gapVal != null ? Math.abs(gapVal) : 0
                    return (
                      <motion.div key={event.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}
                        style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`, borderInlineEnd: `3px solid ${gapColor(gapVal)}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_AR, lineHeight: 1.5 }}>{event.title}</p>
                            <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${categoryColor(event.category)}18`, color: categoryColor(event.category), fontFamily: FONT_AR }}>{categoryLabel(event.category)}</span>
                          </div>
                          <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: 8, background: `${gapColor(gapVal)}10`, border: `0.5px solid ${gapColor(gapVal)}25`, flexShrink: 0, marginInlineStart: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 900, fontFamily: FONT_MONO, color: gapColor(gapVal) }} dir="ltr">{formatPercent(gapVal, 1)}</div>
                            <div style={{ fontSize: 7, color: gapColor(gapVal), fontFamily: FONT_AR }}>{gapLabel(gapVal)}</div>
                          </div>
                        </div>
                        {/* Market vs AI mini */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 1, padding: '4px 6px', borderRadius: 6, background: 'rgba(0,212,255,0.06)', border: '0.5px solid rgba(0,212,255,0.12)', textAlign: 'center' }}>
                            <div style={{ fontSize: 7, color: C.accent, fontFamily: FONT_AR }}>السوق</div>
                            <div style={{ fontSize: 12, fontWeight: 800, fontFamily: FONT_MONO, color: C.accent }} dir="ltr">{formatPercent(event.marketProbability, 0)}</div>
                          </div>
                          <div style={{ flex: 1, padding: '4px 6px', borderRadius: 6, background: 'rgba(162,89,255,0.06)', border: '0.5px solid rgba(162,89,255,0.12)', textAlign: 'center' }}>
                            <div style={{ fontSize: 7, color: C.purple, fontFamily: FONT_AR }}>AI</div>
                            <div style={{ fontSize: 12, fontWeight: 800, fontFamily: FONT_MONO, color: C.purple }} dir="ltr">{event.aiProbability != null ? formatPercent(event.aiProbability, 0) : '—'}</div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Vote Tab */}
          {activeTab === 'vote' && (
            <motion.div key="vote" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div style={{ borderRadius: 20, padding: '16px', background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Zap size={14} color={C.purple} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>تصويت AI لرمز محدد</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="text" value={voteSymbol} onChange={e => setVoteSymbol(e.target.value)} placeholder="مثال: BTC" dir="ltr"
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 14, fontFamily: FONT_MONO, outline: 'none' }}
                    onKeyDown={e => { if (e.key === 'Enter') handleFetchVote() }}
                  />
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleFetchVote} disabled={voteLoading} style={{
                    padding: '10px 16px', borderRadius: 12, background: `linear-gradient(135deg, ${C.purple}, #7C3AED)`, border: 'none',
                    color: '#fff', fontSize: 12, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {voteLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    تحليل
                  </motion.button>
                </div>
                {voteError && <p style={{ fontSize: 11, color: C.danger, fontFamily: FONT_AR, marginBottom: 8 }}>{voteError}</p>}
                {voteData && (
                  <div style={{ padding: '14px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      {voteData.vote === 'BUY' ? <TrendingUp size={18} color={C.success} /> : voteData.vote === 'SELL' ? <TrendingDown size={18} color={C.danger} /> : <Minus size={18} color={C.amber} />}
                      <span style={{ fontSize: 18, fontWeight: 900, color: voteData.vote === 'BUY' ? C.success : voteData.vote === 'SELL' ? C.danger : C.amber, fontFamily: FONT_AR }}>
                        {voteData.vote === 'BUY' ? 'شراء' : voteData.vote === 'SELL' ? 'بيع' : 'انتظار'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                      <div style={{ padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>الثقة</div>
                        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: FONT_MONO, color: C.accent }}>{voteData.confidence}%</div>
                      </div>
                      <div style={{ padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>أحداث محللة</div>
                        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: FONT_MONO, color: C.text }}>{voteData.eventsAnalyzed}</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.6 }}>{voteData.reason}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
