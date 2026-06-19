'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronUp,
  Clock, Activity, Zap, AlertTriangle, CheckCircle2, XCircle, Timer, Target,
  Shield, BarChart3, Play, Sparkles, Cpu, FileText, Award, Flame, Globe,
  ArrowUpRight, ArrowDownRight, Gauge, Calendar, Briefcase, Layers,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import { COLORS, type TradingBrief, type CouncilResult, type CouncilSession, type Direction, type ReviewStatus } from '@/lib/council/types'
import { directionColor, directionSoft, statusColor } from '@/lib/council/types'
import { formatPrice, riskRewardRatio, distancePercent, relativeTime, msRemaining, formatDuration, hexToRgba, formatCountdown } from '@/lib/council/format'
import { GlassCard, CircularProgress, ConfidenceBar, LiveDot, SectionHeader, StatTile, SkeletonBlock, StatusPill, DirectionBadge } from '@/components/council/primitives'
import { CouncilSigil } from '@/components/council/CouncilSigil'
import { FormattedText, LoadMoreButton } from '@/components/council/FormattedText'

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

const dirLabelAr: Record<string, string> = { BUY: 'شراء', SELL: 'بيع', HOLD: 'انتظار' }
const stLabelAr: Record<string, string> = { ACTIVE: 'نشط', MODIFIED: 'مُعدّل', CANCELLED: 'ملغى', EXECUTED: 'منفّذ' }
const tfColor: Record<string, string> = { M1: COLORS.sell, M5: COLORS.hold, M15: COLORS.info, M30: '#3B82F6', H1: COLORS.council, H4: COLORS.council, D1: COLORS.buy, W1: COLORS.buy }

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════

export default function CouncilPage() {
  const locale = useLocale()
  const loc = (locale === 'ar' ? 'ar' : 'en') as 'ar' | 'en'

  const [activeBriefs, setActiveBriefs] = useState<TradingBrief[]>([])
  const [historyBriefs, setHistoryBriefs] = useState<TradingBrief[]>([])
  const [lastSession, setLastSession] = useState<CouncilSession | null>(null)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null)
  const [councilLoading, setCouncilLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT')
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null)
  const [filterDir, setFilterDir] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<'ALL' | ReviewStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [briefsUpdated, setBriefsUpdated] = useState<Date | null>(null)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
  const [activeLimit, setActiveLimit] = useState(6)        // pagination: active briefs
  const [historyLimit, setHistoryLimit] = useState(10)     // pagination: history briefs
  const PAGE_SIZE_ACTIVE = 6
  const PAGE_SIZE_HISTORY = 10

  const SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','ADA/USDT','DOGE/USDT']

  // Fetchers
  const fetchActive = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true); else setIsAutoRefreshing(true)
    try {
      const r = await fetch('/api/strategic-council/briefs/active')
      if (!r.ok) { setOffline(true); return }
      setOffline(false); setActiveBriefs((await r.json()).data || []); setBriefsUpdated(new Date())
    } catch { setOffline(true) }
    finally { setLoading(false); setIsAutoRefreshing(false) }
  }, [])
  const fetchHistory = useCallback(async () => {
    try { const r = await fetch('/api/strategic-council/briefs/history'); if (r.ok) setHistoryBriefs((await r.json()).data || []) } catch {}
  }, [])
  const fetchSession = useCallback(async () => {
    try { const r = await fetch('/api/strategic-council/session/last'); if (r.ok) setLastSession((await r.json()).data || null) } catch {}
  }, [])
  const fetchStatus = useCallback(async () => {
    try { const r = await fetch('/api/strategic-council/session/status'); if (r.ok) setSessionRunning((await r.json()).data?.isRunning || false) } catch {}
  }, [])
  const fetchCouncil = useCallback(async () => {
    setCouncilLoading(true)
    try {
      const r = await fetch('/api/ai/consensus', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ symbol: selectedSymbol, language: locale }), signal: AbortSignal.timeout(45000) })
      if (r.ok) { const d = await r.json(); if (d.success && d.data) setCouncilResult(d.data) }
    } catch {}
    setCouncilLoading(false)
  }, [selectedSymbol, locale])
  const trigger = useCallback(async () => {
    setTriggerLoading(true)
    try { const r = await fetch('/api/strategic-council/trigger', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pairs:['BTC/USDT','ETH/USDT','SOL/USDT'], language: locale }) }); const d = await r.json(); if (d.data?.status === 'processing') setSessionRunning(true) } catch {}
    setTriggerLoading(false)
  }, [locale])

  // Effects
  useEffect(() => { fetchActive(); fetchSession(); fetchStatus(); fetchHistory(); fetchCouncil(); }, [])
  useEffect(() => {
    const iv = setInterval(() => { fetchActive({ silent: true }); fetchSession(); fetchStatus() }, 30000)
    return () => clearInterval(iv)
  }, [fetchActive, fetchSession, fetchStatus])
  useEffect(() => {
    if (!sessionRunning) return
    const iv = setInterval(() => { fetchStatus(); fetchActive({ silent: true }); fetchSession() }, 5000)
    return () => clearInterval(iv)
  }, [sessionRunning, fetchStatus, fetchActive, fetchSession])

  const fActive = useMemo(() => filterDir==='ALL' ? activeBriefs : activeBriefs.filter(b=>b.direction===filterDir), [activeBriefs, filterDir])
  const fHistory = useMemo(() => {
    let r = filterDir==='ALL' ? historyBriefs : historyBriefs.filter(b=>b.direction===filterDir)
    if (filterStatus !== 'ALL') r = r.filter(b => b.reviewStatus === filterStatus)
    return r
  }, [historyBriefs, filterDir, filterStatus])

  // Reset pagination when filters change
  useEffect(() => { setActiveLimit(PAGE_SIZE_ACTIVE) }, [filterDir])
  useEffect(() => { setHistoryLimit(PAGE_SIZE_HISTORY) }, [filterDir, filterStatus])

  // Apply pagination
  const visibleActive = useMemo(() => fActive.slice(0, activeLimit), [fActive, activeLimit])
  const visibleHistory = useMemo(() => fHistory.slice(0, historyLimit), [fHistory, historyLimit])
  const perf = useMemo(() => ({
    total: historyBriefs.length,
    executed: historyBriefs.filter(b=>b.reviewStatus==='EXECUTED').length,
    cancelled: historyBriefs.filter(b=>b.reviewStatus==='CANCELLED').length,
    modified: historyBriefs.filter(b=>b.reviewStatus==='MODIFIED').length,
    buy: historyBriefs.filter(b=>b.direction==='BUY').length,
    sell: historyBriefs.filter(b=>b.direction==='SELL').length,
  }), [historyBriefs])

  if (loading) return (
    <SubPageLayout title="المجلس الاستراتيجي" icon="🏛️">
      <div style={{ minHeight:'100vh', background:COLORS.bg, display:'flex', justifyContent:'center', alignItems:'center' }}>
        <CouncilSigil size={64} />
      </div>
    </SubPageLayout>
  )

  return (
    <SubPageLayout title="المجلس الاستراتيجي" icon="🏛️">
      {/* Ambient background */}
      <div aria-hidden style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-200, insetInlineEnd:-150, width:600, height:600, background:`radial-gradient(circle, ${hexToRgba(COLORS.council,0.18)} 0%, transparent 60%)`, filter:'blur(40px)' }} />
        <div style={{ position:'absolute', bottom:-200, insetInlineStart:-150, width:600, height:600, background:`radial-gradient(circle, ${hexToRgba(COLORS.info,0.12)} 0%, transparent 60%)`, filter:'blur(40px)' }} />
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`, backgroundSize:'48px 48px', maskImage:'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 70%)', WebkitMaskImage:'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 70%)' }} />
      </div>

      <div style={{ position:'relative', zIndex:1, maxWidth:1440, margin:'0 auto', padding:'32px 24px 64px', display:'flex', flexDirection:'column', gap:40 }}>
        {/* ═══ TOP BAR ═══ */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ position:'relative', width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.03)', border:`1px solid ${COLORS.border}`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              <div aria-hidden style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 50%, ${hexToRgba(COLORS.council,0.2)}, transparent 70%)` }} />
              <CouncilSigil size={36} />
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <h1 style={{ fontSize:16, fontWeight:600, letterSpacing:'-0.015em', color:COLORS.textPrimary, margin:0, lineHeight:1 }}>المجلس الاستراتيجي</h1>
                <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.council, padding:'2px 6px', borderRadius:4, background:hexToRgba(COLORS.council,0.12), border:`1px solid ${hexToRgba(COLORS.council,0.3)}` }}>v1</span>
              </div>
              <div style={{ fontSize:11, color:COLORS.textMuted, marginTop:3 }}>
                {activeBriefs.length} بريف نشط{lastSession ? ` · آخر جلسة ${relativeTime(lastSession.timestamp, loc)}` : ''}{sessionRunning ? ' · جاري التحليل...' : ''}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 12px', borderRadius:10, background:sessionRunning?hexToRgba(COLORS.buy,0.08):'rgba(255,255,255,0.04)', border:`1px solid ${sessionRunning?hexToRgba(COLORS.buy,0.3):COLORS.border}`, fontSize:11, fontWeight:600, color:sessionRunning?COLORS.buy:COLORS.textMuted }}>
              <LiveDot color={sessionRunning?COLORS.buy:COLORS.textDim} size={7} label={sessionRunning?'قيد التشغيل':'خامل'} />
            </div>
            <motion.button whileTap={{ scale:0.97 }} onClick={trigger} disabled={triggerLoading||sessionRunning}
              style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'9px 14px', borderRadius:10, border:'none', cursor:triggerLoading||sessionRunning?'not-allowed':'pointer', background:triggerLoading||sessionRunning?'rgba(168,85,247,0.3)':COLORS.gradientCouncil, color:'#0B0E14', fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', boxShadow:`0 8px 24px -8px ${hexToRgba(COLORS.council,0.6)}` }}>
              {triggerLoading||sessionRunning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} strokeWidth={2.75} />}
              {sessionRunning ? 'جاري...' : 'تشغيل جلسة'}
            </motion.button>
          </div>
        </div>

        {offline && (
          <GlassCard style={{ padding:'12px 16px', borderColor:hexToRgba(COLORS.hold,0.3) }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <AlertTriangle size={16} style={{ color:COLORS.hold }} />
              <span style={{ fontSize:13, color:COLORS.hold }}>الخادم غير متاح</span>
            </div>
          </GlassCard>
        )}

        {/* ═══ SECTION 1: VERDICT ═══ */}
        <section>
          <GlassCard padding={0} strong glow={councilResult ? directionColor(councilResult.recommendation) : COLORS.council}>
            {/* Eyebrow */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:`1px solid ${COLORS.border}`, flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontFamily:'monospace', fontSize:11, fontWeight:600, letterSpacing:'0.18em', color:COLORS.council, padding:'4px 9px', borderRadius:6, background:hexToRgba(COLORS.council,0.1), border:`1px solid ${hexToRgba(COLORS.council,0.25)}` }}>01 / VERDICT</div>
                <div style={{ fontSize:11, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>قرار المجلس · {selectedSymbol}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {councilResult?.isFallback && (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:999, background:hexToRgba(COLORS.hold,0.1), border:`1px solid ${hexToRgba(COLORS.hold,0.35)}`, color:COLORS.hold, fontSize:11, fontWeight:600 }}>
                    <AlertTriangle size={12} /> وضع احتياطي
                  </div>
                )}
                {councilResult && !councilResult.isFallback && <LiveDot color={COLORS.buy} label="مجلس مباشر" />}
              </div>
            </div>

            {/* Symbol selector */}
            <div style={{ display:'flex', gap:8, padding:'14px 24px', borderBottom:`1px solid ${COLORS.border}`, flexWrap:'wrap' }}>
              {SYMBOLS.map(sym => (
                <button key={sym} onClick={()=>{ setSelectedSymbol(sym); setCouncilResult(null) }} style={{
                  padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, fontFamily:'monospace',
                  background: selectedSymbol===sym ? hexToRgba(COLORS.council,0.12) : 'rgba(255,255,255,0.025)',
                  border:`1px solid ${selectedSymbol===sym ? hexToRgba(COLORS.council,0.4) : COLORS.border}`,
                  color: selectedSymbol===sym ? COLORS.council : COLORS.textMuted, cursor:'pointer', transition:'all 200ms ease',
                }}>{sym}</button>
              ))}
            </div>

            {/* Body — 3 columns */}
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,0.9fr) minmax(0,1.3fr) minmax(0,1fr)', gap:0, alignItems:'stretch' }} className="council-verdict-grid">
              {/* Ring */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', borderInlineEnd:`1px solid ${COLORS.border}`, gap:12 }}>
                {councilResult ? (
                  <CircularProgress value={councilResult.consensusScore} size={148} strokeWidth={10} color={directionColor(councilResult.recommendation)}>
                    <div style={{ fontSize:42, fontWeight:600, letterSpacing:'-0.04em', color:COLORS.textPrimary, fontFamily:'monospace', lineHeight:1 }}>{councilResult.consensusScore}</div>
                    <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.textMuted, marginTop:4 }}>/ 100</div>
                  </CircularProgress>
                ) : (
                  <CircularProgress value={0} size={148} strokeWidth={10} color={COLORS.textDim}>
                    <div style={{ fontSize:13, color:COLORS.textMuted, textAlign:'center', maxWidth:110 }}>{councilLoading ? 'عقد المجلس...' : 'اضغط تحليل'}</div>
                  </CircularProgress>
                )}
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.textMuted, textAlign:'center' }}>الإجماع</div>
              </div>

              {/* Recommendation */}
              <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 28px', borderInlineEnd:`1px solid ${COLORS.border}`, position:'relative', overflow:'hidden' }}>
                <div aria-hidden style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse 60% 80% at 30% 50%, ${hexToRgba(councilResult?directionColor(councilResult.recommendation):COLORS.council,0.18)} 0%, transparent 70%)`, pointerEvents:'none' }} />
                <div style={{ position:'relative', zIndex:1 }}>
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:14 }}>التوصية</div>
                  {councilResult ? (
                    <motion.div key={councilResult.recommendation} initial={{ opacity:0, scale:0.94, y:6 }} animate={{ opacity:1, scale:1, y:0 }} transition={{ duration:0.5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
                        <div style={{ width:52, height:52, borderRadius:13, background:councilResult.recommendation==='BUY'?COLORS.gradientBuy:councilResult.recommendation==='SELL'?COLORS.gradientSell:'linear-gradient(135deg,#F59E0B,#A855F7)', display:'flex', alignItems:'center', justifyContent:'center', color:'#0B0E14', boxShadow:`0 8px 24px -8px ${hexToRgba(directionColor(councilResult.recommendation),0.7)}` }}>
                          {councilResult.recommendation==='BUY'?<ArrowUpRight size={26} strokeWidth={2.75}/>:councilResult.recommendation==='SELL'?<ArrowDownRight size={26} strokeWidth={2.75}/>:<Minus size={26} strokeWidth={2.75}/>}
                        </div>
                        <div style={{ fontSize:44, fontWeight:700, letterSpacing:'-0.03em', color:directionColor(councilResult.recommendation), lineHeight:1 }}>{dirLabelAr[councilResult.recommendation]}</div>
                      </div>
                      {/* Vote tally */}
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {[
                          { c:COLORS.buy, n:councilResult.analyses.filter(a=>a.vote==='BUY').length, l:'صاعد' },
                          { c:COLORS.sell, n:councilResult.analyses.filter(a=>a.vote==='SELL').length, l:'هابط' },
                          { c:COLORS.hold, n:councilResult.analyses.filter(a=>a.vote==='HOLD').length, l:'محايد' },
                        ].filter(v=>v.n>0).map((v,i) => (
                          <div key={i} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:8, background:hexToRgba(v.c,0.1), border:`1px solid ${hexToRgba(v.c,0.3)}`, color:v.c, fontSize:11, fontWeight:600 }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:v.c, boxShadow:`0 0 6px ${v.c}` }} />
                            {v.n} {v.l}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <div style={{ fontSize:18, color:COLORS.textMuted, fontStyle:'italic' }}>{councilLoading ? 'عقد المجلس...' : 'لا توجد جلسة بعد'}</div>
                  )}
                </div>
              </div>

              {/* Confidence + Analyze button */}
              <div style={{ padding:'32px 24px', display:'flex', flexDirection:'column', justifyContent:'center', gap:18 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>الثقة</span>
                    <span style={{ fontSize:22, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{councilResult?`${councilResult.consensusScore}%`:'—'}</span>
                  </div>
                  <ConfidenceBar value={councilResult?.consensusScore ?? 0} color={councilResult?directionColor(councilResult.recommendation):COLORS.council} height={6} />
                </div>
                <motion.button whileTap={{ scale:0.98 }} onClick={fetchCouncil} disabled={councilLoading}
                  style={{ width:'100%', padding:'12px 18px', borderRadius:11, border:'none', cursor:councilLoading?'wait':'pointer', background:COLORS.gradientCouncil, color:'#0B0E14', fontWeight:600, fontSize:13, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:`0 10px 30px -10px ${hexToRgba(COLORS.council,0.7)}` }}>
                  <RefreshCw size={14} strokeWidth={2.5} className={councilLoading?'animate-spin':''} />
                  {councilLoading ? 'عقد المجلس...' : 'تحليل'}
                </motion.button>
              </div>
            </div>

            {/* Master Strategy */}
            {councilResult?.masterStrategy && (
              <div style={{ padding:'22px 24px', borderTop:`1px solid ${COLORS.border}`, background:'rgba(0,0,0,0.18)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ width:26, height:26, borderRadius:7, background:COLORS.gradientCouncil, display:'flex', alignItems:'center', justifyContent:'center', color:'#0B0E14' }}><Sparkles size={13} strokeWidth={2.5} /></div>
                  <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.council }}>الاستراتيجية الموحّدة</div>
                  <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${hexToRgba(COLORS.council,0.4)}, transparent)` }} />
                </div>
                <FormattedText
                  text={councilResult.masterStrategy}
                  maxLength={400}
                  dir={loc === 'ar' ? 'rtl' : 'ltr'}
                  fontSize={14}
                  accent={COLORS.council}
                />
              </div>
            )}
          </GlassCard>

          {/* Vote cards grid */}
          {councilResult?.analyses && councilResult.analyses.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.council }}>أصوات المجلس</div>
                <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${hexToRgba(COLORS.council,0.3)}, transparent)` }} />
                <div style={{ fontSize:11, color:COLORS.textMuted, fontFamily:'monospace' }}>{councilResult.analyses.length} أعضاء</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14 }}>
                {councilResult.analyses.map((a, i) => {
                  const dc = directionColor(a.vote)
                  return (
                    <motion.div key={i} initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4, delay:0.05*i }}>
                      <GlassCard interactive padding={0} glow={dc} style={{ height:'100%' }}>
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'14px 14px 10px', borderBottom:`1px solid ${COLORS.border}`, gap:10 }}>
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.role}</div>
                            <div style={{ fontSize:11, color:COLORS.textMuted, fontFamily:'monospace', marginTop:2 }}>{a.model}</div>
                          </div>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 8px', borderRadius:7, background:hexToRgba(dc,0.12), border:`1px solid ${hexToRgba(dc,0.35)}`, color:dc, fontSize:11, fontWeight:700, textTransform:'uppercase', flexShrink:0 }}>
                            {a.vote==='BUY'?<ArrowUpRight size={14} strokeWidth={2.5}/>:a.vote==='SELL'?<ArrowDownRight size={14} strokeWidth={2.5}/>:<Minus size={14} strokeWidth={2.5}/>}
                            {dirLabelAr[a.vote]}
                          </div>
                        </div>
                        <div style={{ padding:'12px 14px' }}>
                          <FormattedText
                            text={a.reason}
                            maxLength={180}
                            dir={loc === 'ar' ? 'rtl' : 'ltr'}
                            fontSize={12.5}
                            accent={dc}
                            placeholder="لا يوجد شرح متاح"
                          />
                        </div>
                        <div style={{ padding:'10px 14px 14px', borderTop:`1px solid ${COLORS.border}` }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                            <span style={{ fontSize:11, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', color:COLORS.textMuted }}>الثقة</span>
                            <span style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{a.confidence}%</span>
                          </div>
                          <ConfidenceBar value={a.confidence} color={COLORS.council} height={4} />
                        </div>
                      </GlassCard>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ═══ SECTION 2: ACTIVE BRIEFS ═══ */}
        <section>
          <SectionHeader index="02" eyebrow="توجيهات تداول مباشرة" title="البريفات النشطة" right={<LiveDot color={isAutoRefreshing?COLORS.buy:COLORS.textDim} label="تحديث تلقائي · 30ث" />} />
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {(['ALL','BUY','SELL'] as const).map(d => (
              <motion.button key={d} whileTap={{ scale:0.96 }} onClick={()=>setFilterDir(d)} style={{ padding:'8px 14px', borderRadius:9, border:`1px solid ${filterDir===d?hexToRgba(d==='ALL'?COLORS.council:directionColor(d),0.4):COLORS.border}`, background:filterDir===d?hexToRgba(d==='ALL'?COLORS.council:directionColor(d),0.12):'rgba(255,255,255,0.025)', color:filterDir===d?(d==='ALL'?COLORS.council:directionColor(d)):COLORS.textMuted, fontSize:12, fontWeight:600, textTransform:'uppercase', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
                {d==='ALL'?'الكل':d==='BUY'?'▲ شراء':'▼ بيع'}
                <span style={{ fontSize:11, padding:'1px 6px', borderRadius:5, background:filterDir===d?hexToRgba(d==='ALL'?COLORS.council:directionColor(d),0.18):'rgba(255,255,255,0.06)', fontFamily:'monospace', fontWeight:700 }}>{d==='ALL'?activeBriefs.length:activeBriefs.filter(b=>b.direction===d).length}</span>
              </motion.button>
            ))}
          </div>
          {fActive.length===0 ? (
            <GlassCard padding={40} style={{ textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:14, margin:'0 auto 16px', background:hexToRgba(COLORS.council,0.08), border:`1px solid ${hexToRgba(COLORS.council,0.2)}`, display:'flex', alignItems:'center', justifyContent:'center' }}><Sparkles size={24} color={COLORS.council} /></div>
              <div style={{ fontSize:16, fontWeight:600, color:COLORS.textPrimary, marginBottom:6 }}>لا توجد بريفات نشطة</div>
              <div style={{ fontSize:13, color:COLORS.textMuted }}>المجلس يراقب الأسواق. ستظهر التوجيهات الجديدة هنا.</div>
            </GlassCard>
          ) : (
            <>
              <motion.div layout style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:16 }}>
                <AnimatePresence mode="popLayout">
                  {visibleActive.map((brief, i) => <BriefCard key={brief.id} brief={brief} loc={loc} index={i} expanded={expandedBrief===brief.id} onToggle={()=>setExpandedBrief(expandedBrief===brief.id?null:brief.id)} />)}
                </AnimatePresence>
              </motion.div>
              <LoadMoreButton
                count={visibleActive.length}
                total={fActive.length}
                onClick={() => setActiveLimit(l => l + PAGE_SIZE_ACTIVE)}
                moreLabel="تحميل المزيد من الإشارات"
                accent={COLORS.council}
              />
            </>
          )}
        </section>

        {/* ═══ SECTION 3+4: HISTORY + PERFORMANCE ═══ */}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.3fr) minmax(0,1fr)', gap:32, alignItems:'start' }} className="council-bottom-grid">
          {/* History */}
          <section>
            <SectionHeader index="03" eyebrow="البريفات السابقة ونتائجها" title="سجل الجلسات" />
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {(['ALL','EXECUTED','MODIFIED','CANCELLED'] as const).map(s => (
                <button key={s} onClick={()=>setFilterStatus(s)} style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${filterStatus===s?hexToRgba(s==='ALL'?COLORS.council:statusColor(s),0.4):COLORS.border}`, background:filterStatus===s?hexToRgba(s==='ALL'?COLORS.council:statusColor(s),0.12):'rgba(255,255,255,0.025)', color:filterStatus===s?(s==='ALL'?COLORS.council:statusColor(s)):COLORS.textMuted, fontSize:11, fontWeight:600, textTransform:'uppercase', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                  {s==='ALL'?'الكل':stLabelAr[s]}
                  <span style={{ fontSize:11, padding:'1px 5px', borderRadius:4, background:filterStatus===s?hexToRgba(s==='ALL'?COLORS.council:statusColor(s),0.18):'rgba(255,255,255,0.06)', fontFamily:'monospace', fontWeight:700 }}>{s==='ALL'?historyBriefs.length:historyBriefs.filter(b=>b.reviewStatus===s).length}</span>
                </button>
              ))}
            </div>
            {fHistory.length===0 ? (
              <GlassCard padding={36} style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:600, color:COLORS.textPrimary, marginBottom:4 }}>لا يوجد سجل بعد</div>
                <div style={{ fontSize:12, color:COLORS.textMuted }}>ستظهر قرارات المجلس السابقة هنا</div>
              </GlassCard>
            ) : (
              <>
                <GlassCard padding={12} style={{ overflow:'hidden', minWidth:540 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'minmax(110px,1.1fr) 60px 70px 80px 110px 90px', gap:12, padding:'8px 14px 10px', fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.textMuted, borderBottom:`1px solid ${COLORS.border}` }}>
                    <div>الزوج</div><div>اتجاه</div><div>دخول</div><div>ثقة</div><div>حالة</div><div style={{ textAlign:'right' }}>نتيجة</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6, maxHeight:520, overflowY:'auto', paddingRight:4 }}>
                    {visibleHistory.map((b, i) => {
                      const dc = directionColor(b.direction)
                      const won = b.outcomePips !== undefined && b.outcomePips > 0
                      const lost = b.outcomePips !== undefined && b.outcomePips < 0
                      return (
                        <motion.div key={b.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:Math.min(i*0.025,0.4) }}
                          style={{ display:'grid', gridTemplateColumns:'minmax(110px,1.1fr) 60px 70px 80px 110px 90px', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.022)', border:`1px solid ${COLORS.border}`, transition:'background 200ms' }}
                          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.borderColor=COLORS.borderStrong}}
                          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.022)';e.currentTarget.style.borderColor=COLORS.border}}>
                          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                            <div style={{ width:28, height:28, borderRadius:7, background:directionSoft(b.direction), border:`1px solid ${hexToRgba(dc,0.3)}`, color:dc, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              {b.direction==='BUY'?<TrendingUp size={13} strokeWidth={2.5}/>:<TrendingDown size={13} strokeWidth={2.5}/>}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.pair}</div>
                              <div style={{ fontSize:11, color:COLORS.textMuted, fontFamily:'monospace' }}>{b.timeframe}</div>
                            </div>
                          </div>
                          <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:dc }}>{dirLabelAr[b.direction]}</div>
                          <div style={{ fontSize:12, color:COLORS.textSecondary, fontFamily:'monospace' }}>{formatPrice(b.entryPrice)}</div>
                          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <div style={{ width:40, height:4, borderRadius:999, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${b.confidence}%`, background:COLORS.council, borderRadius:999 }} />
                            </div>
                            <span style={{ fontSize:11, color:COLORS.textSecondary, fontFamily:'monospace', fontWeight:600 }}>{b.confidence}</span>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {b.reviewStatus==='EXECUTED'?<CheckCircle2 size={14} color={statusColor(b.reviewStatus)} strokeWidth={2.5}/>:b.reviewStatus==='CANCELLED'?<XCircle size={14} color={statusColor(b.reviewStatus)} strokeWidth={2.5}/>:<RefreshCw size={14} color={statusColor(b.reviewStatus)} strokeWidth={2.5}/>}
                            <StatusPill status={b.reviewStatus} label={stLabelAr[b.reviewStatus]} />
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                            {b.outcomePips !== undefined ? (
                              <span style={{ fontSize:12, fontWeight:600, color:won?COLORS.buy:lost?COLORS.sell:COLORS.textMuted, fontFamily:'monospace' }}>{b.outcomePips>0?'+':''}{b.outcomePips.toFixed(b.outcomePips<1?4:2)}</span>
                            ) : <span style={{ fontSize:11, color:COLORS.textDim, fontStyle:'italic' }}>—</span>}
                            <span style={{ fontSize:11, color:COLORS.textDim, fontFamily:'monospace' }}>{b.closedAt?relativeTime(b.closedAt, loc):'—'}</span>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </GlassCard>
                <LoadMoreButton
                  count={visibleHistory.length}
                  total={fHistory.length}
                  onClick={() => setHistoryLimit(l => l + PAGE_SIZE_HISTORY)}
                  moreLabel="تحميل المزيد من السجل"
                  accent={COLORS.info}
                />
              </>
            )}
          </section>

          {/* Performance */}
          <section>
            <SectionHeader index="04" eyebrow="مقاييس الذكاء المجمّع" title="أداء المجلس" />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:14, marginBottom:16 }}>
              <StatTile label="إجمالي البريفات" value={perf.total} sub={`${perf.total>0?Math.round(perf.executed/perf.total*100):0}% معدل التنفيذ`} accent={COLORS.council} icon={<Briefcase size={15} />} />
              <StatTile label="منفّذة" value={perf.executed} accent={COLORS.buy} icon={<CheckCircle2 size={15} />} />
              <StatTile label="ملغاة" value={perf.cancelled} accent={COLORS.sell} icon={<XCircle size={15} />} />
              <StatTile label="معدّلة" value={perf.modified} accent={COLORS.hold} icon={<RefreshCw size={15} />} />
            </div>
            {/* Distribution */}
            <GlassCard padding={20} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:hexToRgba(COLORS.council,0.12), border:`1px solid ${hexToRgba(COLORS.council,0.3)}`, color:COLORS.council, display:'flex', alignItems:'center', justifyContent:'center' }}><Layers size={15} /></div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>نسبة الشراء / البيع</div>
                  <div style={{ fontSize:15, fontWeight:600, color:COLORS.textPrimary, marginTop:2 }}>توزيع الاتجاه</div>
                </div>
              </div>
              {historyBriefs.length > 0 ? (
                <>
                  <div style={{ height:14, borderRadius:999, background:'rgba(255,255,255,0.04)', border:`1px solid ${COLORS.border}`, overflow:'hidden', display:'flex', marginBottom:14 }}>
                    {[
                      { c:COLORS.buy, n:perf.buy },
                      { c:COLORS.sell, n:perf.sell },
                      { c:COLORS.hold, n:historyBriefs.length - perf.buy - perf.sell },
                    ].filter(v=>v.n>0).map((v,i) => (
                      <motion.div key={i} initial={{ width:0 }} animate={{ width:`${(v.n/historyBriefs.length)*100}%` }} transition={{ duration:0.9, delay:i*0.05 }}
                        style={{ background:`linear-gradient(90deg, ${v.c}, ${hexToRgba(v.c,0.6)})`, height:'100%' }} />
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    {[
                      { l:'شراء', n:perf.buy, c:COLORS.buy },
                      { l:'بيع', n:perf.sell, c:COLORS.sell },
                      { l:'انتظار', n:historyBriefs.length-perf.buy-perf.sell, c:COLORS.hold },
                    ].map((v,i) => (
                      <div key={i} style={{ padding:'10px 12px', borderRadius:9, background:hexToRgba(v.c,0.07), border:`1px solid ${hexToRgba(v.c,0.2)}` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                          <span style={{ width:8, height:8, borderRadius:2, background:v.c, boxShadow:`0 0 6px ${hexToRgba(v.c,0.6)}` }} />
                          <span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{v.l}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                          <span style={{ fontSize:20, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{v.n}</span>
                          <span style={{ fontSize:11, color:v.c, fontFamily:'monospace', fontWeight:600 }}>{historyBriefs.length>0?Math.round(v.n/historyBriefs.length*100):0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div style={{ fontSize:13, color:COLORS.textMuted, textAlign:'center', padding:20 }}>لا توجد بيانات</div>}
            </GlassCard>
            {/* Last session */}
            {lastSession && (
              <GlassCard padding={20}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:hexToRgba(COLORS.info,0.12), border:`1px solid ${hexToRgba(COLORS.info,0.3)}`, color:COLORS.info, display:'flex', alignItems:'center', justifyContent:'center' }}><Activity size={15} /></div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>آخر جلسة</div>
                      <div style={{ fontSize:13, color:COLORS.textSecondary, marginTop:2, display:'flex', alignItems:'center', gap:5 }}>
                        <Calendar size={11} /> {relativeTime(lastSession.timestamp, loc)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 9px', borderRadius:999, background:hexToRgba(COLORS.buy,0.1), border:`1px solid ${hexToRgba(COLORS.buy,0.3)}`, color:COLORS.buy, fontSize:11, fontWeight:600 }}>
                    <Sparkles size={11} /> مباشر
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { i:<Layers size={13}/>, l:'أزواج محلّلة', v:lastSession.pairsAnalyzed, c:COLORS.council },
                    { i:<Briefcase size={13}/>, l:'بريفات صادرة', v:lastSession.briefsIssued, c:COLORS.info },
                    { i:<RefreshCw size={13}/>, l:'معدّلة', v:lastSession.briefsModified, c:COLORS.hold },
                    { i:<XCircle size={13}/>, l:'ملغاة', v:lastSession.briefsCancelled, c:COLORS.sell },
                    { i:<CheckCircle2 size={13}/>, l:'منفّذة', v:lastSession.briefsExecuted||0, c:COLORS.buy },
                    { i:<Clock size={13}/>, l:'المدة', v:formatDuration(lastSession.durationMs, loc), c:COLORS.textSecondary },
                  ].map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 13px', borderRadius:10, background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{ width:26, height:26, borderRadius:7, background:hexToRgba(s.c,0.12), color:s.c, display:'flex', alignItems:'center', justifyContent:'center' }}>{s.i}</div>
                        <span style={{ fontSize:12, color:COLORS.textSecondary, fontWeight:500 }}>{s.l}</span>
                      </div>
                      <span style={{ fontSize:14, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{s.v}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer style={{ marginTop:24, paddingTop:24, borderTop:`1px solid ${COLORS.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div style={{ fontSize:11, color:COLORS.textDim }}>أول منصة تداول بمجلس ذكاء اصطناعي في العالم · المجلس الاستراتيجي</div>
          <div style={{ fontSize:11, color:COLORS.textDim, fontFamily:'monospace' }}>
            <span style={{ color:COLORS.council }}>●</span> Council v1.0 · {SYMBOLS.length} symbols · 8 AI agents
          </div>
        </footer>
      </div>

      <style>{`
        .council-verdict-grid { display:grid; grid-template-columns:minmax(0,0.9fr) minmax(0,1.3fr) minmax(0,1fr); gap:0; }
        .council-bottom-grid { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); gap:32px; }
        @media (max-width:1100px) { .council-bottom-grid { grid-template-columns:1fr; gap:40px; } }
        @media (max-width:880px) { .council-verdict-grid { grid-template-columns:1fr !important; } .council-verdict-grid > div { border-inline-end:none !important; border-bottom:1px solid rgba(255,255,255,0.08); } .council-verdict-grid > div:last-child { border-bottom:none; } }
        @media (max-width:640px) { main { padding:20px 16px 48px !important; gap:28px !important; } }
        ::-webkit-scrollbar { width:8px; height:8px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:rgba(168,85,247,0.25); border-radius:999px; } ::-webkit-scrollbar-thumb:hover { background:rgba(168,85,247,0.45); }
      `}</style>
    </SubPageLayout>
  )
}

// ═══════════════════════════════════════
// BRIEF CARD
// ═══════════════════════════════════════

function BriefCard({ brief, loc, index, expanded, onToggle }: {
  brief: TradingBrief; loc: 'ar'|'en'; index: number; expanded: boolean; onToggle: () => void
}) {
  const dc = directionColor(brief.direction)
  const dirSoft = directionSoft(brief.direction)
  const rr = riskRewardRatio(brief.entryPrice, brief.stopLoss, brief.takeProfit, brief.direction)
  const slDist = distancePercent(brief.entryPrice, brief.stopLoss)
  const tpDist = distancePercent(brief.entryPrice, brief.takeProfit)
  const slPctStr = brief.direction==='BUY' ? `-${slDist}%` : `+${slDist}%`
  const tpPctStr = brief.direction==='BUY' ? `+${tpDist}%` : `-${tpDist}%`
  const [remainingMs, setRemainingMs] = useState(() => msRemaining(brief.expiresAt))
  useEffect(() => { const id = setInterval(() => setRemainingMs(msRemaining(brief.expiresAt)), 1000); return () => clearInterval(id) }, [brief.expiresAt])
  const isExpired = remainingMs <= 0

  return (
    <motion.div layout initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} transition={{ duration:0.4, delay:index*0.05 }}>
      <GlassCard padding={0} glow={dc} interactive style={{ height:'100%' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px 14px', borderBottom:`1px solid ${COLORS.border}`, gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, minWidth:0 }}>
            <CircularProgress value={brief.confidence} size={48} strokeWidth={4} color={dc} glow={false} animationDelay={index*0.05}>
              <span style={{ fontSize:12, fontWeight:700, color:COLORS.textPrimary, fontFamily:'monospace' }}>{brief.confidence}</span>
            </CircularProgress>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:17, fontWeight:600, color:COLORS.textPrimary }}>{brief.pair}</span>
                <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:5, background:'rgba(255,255,255,0.05)', border:`1px solid ${COLORS.border}`, color:COLORS.textSecondary, fontFamily:'monospace' }}>{brief.timeframe}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:COLORS.textMuted }}>
                <Clock size={11} /> صدر {relativeTime(brief.issuedAt, loc)}
              </div>
            </div>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:9, background:dirSoft, border:`1px solid ${hexToRgba(dc,0.4)}`, color:dc, fontSize:12, fontWeight:700, textTransform:'uppercase', flexShrink:0, boxShadow:`0 4px 12px -4px ${hexToRgba(dc,0.4)}` }}>
            {brief.direction==='BUY'?<TrendingUp size={13} strokeWidth={2.5}/>:<TrendingDown size={13} strokeWidth={2.5}/>}
            {dirLabelAr[brief.direction]}
          </div>
        </div>

        {/* WHY THIS SIGNAL — premium AI reasoning panel */}
        <div style={{ padding:'16px 18px 18px', background:`linear-gradient(180deg, ${hexToRgba(COLORS.council,0.04)} 0%, transparent 100%)`, borderBottom:`1px solid ${COLORS.border}` }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:11, gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
              <div style={{ width:24, height:24, borderRadius:7, background:COLORS.gradientCouncil, display:'flex', alignItems:'center', justifyContent:'center', color:'#0B0E14', flexShrink:0, boxShadow:`0 4px 12px -4px ${hexToRgba(COLORS.council,0.5)}` }}>
                <Sparkles size={12} strokeWidth={2.5} />
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.council }}>لماذا هذه الإشارة؟</span>
                  <span style={{ fontSize:10, color:COLORS.textMuted, fontStyle:'italic', fontFamily:'monospace' }}>· تفكير الذكاء الاصطناعي</span>
                </div>
              </div>
            </div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:999, background:hexToRgba(COLORS.council,0.1), border:`1px solid ${hexToRgba(COLORS.council,0.25)}`, color:COLORS.council, fontSize:10, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', flexShrink:0 }}>
              <span aria-hidden style={{ width:5, height:5, borderRadius:'50%', background:COLORS.council, boxShadow:`0 0 6px ${COLORS.council}` }} />
              AI
            </div>
          </div>
          <FormattedText
            text={brief.analysisSummary}
            maxLength={260}
            dir={loc === 'ar' ? 'rtl' : 'ltr'}
            fontSize={13.5}
            accent={dc}
            placeholder="لا يوجد تحليل متاح — انتظر تحديث المجلس"
          />
        </div>

        {/* Price grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:COLORS.border, borderTop:`1px solid ${COLORS.border}`, borderBottom:`1px solid ${COLORS.border}` }}>
          <div style={{ padding:'11px 14px', background:'rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:4 }}>الدخول</div>
            <div style={{ fontSize:15, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{formatPrice(brief.entryPrice)}</div>
          </div>
          <div style={{ padding:'11px 14px', background:'rgba(0,0,0,0.18)', borderInlineStart:`1px solid ${COLORS.border}` }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:4 }}>وقف الخسارة</div>
            <div style={{ fontSize:15, fontWeight:600, color:COLORS.sell, fontFamily:'monospace' }}>{formatPrice(brief.stopLoss)}</div>
            <div style={{ fontSize:11, color:COLORS.sell, fontFamily:'monospace', marginTop:3 }}>{slPctStr}</div>
          </div>
          <div style={{ padding:'11px 14px', background:'rgba(0,0,0,0.18)', borderInlineStart:`1px solid ${COLORS.border}` }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:4 }}>جني الأرباح</div>
            <div style={{ fontSize:15, fontWeight:600, color:COLORS.buy, fontFamily:'monospace' }}>{formatPrice(brief.takeProfit)}</div>
            <div style={{ fontSize:11, color:COLORS.buy, fontFamily:'monospace', marginTop:3 }}>{tpPctStr}</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 18px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:COLORS.textMuted, fontFamily:'monospace' }}>
              <Gauge size={12} /> <span style={{ textTransform:'uppercase', fontWeight:500 }}>عائد/مخاطرة</span> <span style={{ color:COLORS.info, fontWeight:600 }}>{rr.toFixed(2)}</span>
            </div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:COLORS.textMuted, fontFamily:'monospace' }}>
              <Timer size={12} /> <span style={{ textTransform:'uppercase', fontWeight:500 }}>انتهاء</span> <span style={{ color:isExpired?COLORS.sell:remainingMs<3600000?COLORS.hold:COLORS.textSecondary, fontWeight:600 }}>{isExpired?'منتهي':formatCountdown(remainingMs, loc)}</span>
            </div>
          </div>
          <motion.button onClick={onToggle} whileTap={{ scale:0.97 }} whileHover={{ y:-1 }} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:9, background:expanded?hexToRgba(COLORS.council,0.1):'rgba(255,255,255,0.04)', border:`1px solid ${expanded?hexToRgba(COLORS.council,0.35):COLORS.border}`, color:expanded?COLORS.council:COLORS.textSecondary, fontSize:11, fontWeight:600, cursor:'pointer', letterSpacing:'0.04em' }}>
            {expanded?'إخفاء التفاصيل':'عرض التفاصيل'} <motion.span animate={{ rotate:expanded?180:0 }} transition={{ duration:0.25 }}><ChevronDown size={13} strokeWidth={2.5} /></motion.span>
          </motion.button>
        </div>

        {/* Expanded */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.3 }} style={{ overflow:'hidden' }}>
              <div style={{ padding:'16px 18px 18px', borderTop:`1px solid ${COLORS.border}`, background:'rgba(0,0,0,0.18)', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:4, padding:10, borderRadius:9, background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}><Activity size={13} color={COLORS.info} /><span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>آخر مراجعة</span></div>
                  <span style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{relativeTime(brief.lastReviewedAt, loc)}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, padding:10, borderRadius:9, background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}><Target size={13} color={COLORS.sell} /><span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>مسافة SL</span></div>
                  <span style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{slPctStr}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, padding:10, borderRadius:9, background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}><Target size={13} color={COLORS.buy} /><span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>مسافة TP</span></div>
                  <span style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{tpPctStr}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, padding:10, borderRadius:9, background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}><Shield size={13} color={COLORS.hold} /><span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>انزلاق مسموح</span></div>
                  <span style={{ fontSize:13, fontWeight:600, color:COLORS.textPrimary, fontFamily:'monospace' }}>{(brief.strictRules.maxSlippage*100).toFixed(2)}%</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  )
}
