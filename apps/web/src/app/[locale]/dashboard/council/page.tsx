'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
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
import { DecisionMatrix } from '@/components/council/DecisionMatrix'
import { PerformanceDetails } from '@/components/council/PerformanceDetails'

// ═══════════════════════════════════════
// HELPERS — keys into the locale dictionary instead of hardcoded strings
// ═══════════════════════════════════════

const dirLabelKey: Record<string, string> = { BUY: 'buy', SELL: 'sell', HOLD: 'hold' }
const stLabelKey: Record<string, string> = { ACTIVE: 'stActive', MODIFIED: 'stModified', CANCELLED: 'stCancelled', EXECUTED: 'stExecuted' }
const tfColor: Record<string, string> = { M1: COLORS.sell, M5: COLORS.hold, M15: COLORS.info, M30: '#00D4FF', H1: COLORS.council, H4: COLORS.council, D1: COLORS.buy, W1: COLORS.buy }

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════

export default function CouncilPage() {
  const locale = useLocale()
  const t = useTranslations('councilPage')
  const tc = useTranslations('common')
  const loc = (locale === 'ar' ? 'ar' : 'en') as 'ar' | 'en'

  const [activeBriefs, setActiveBriefs] = useState<TradingBrief[]>([])
  const [historyBriefs, setHistoryBriefs] = useState<TradingBrief[]>([])
  const [lastSession, setLastSession] = useState<CouncilSession | null>(null)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null)
  const [councilLoading, setCouncilLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT')
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null)
  const [expandedVote, setExpandedVote] = useState<number | null>(null)
  const [filterDir, setFilterDir] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<'ALL' | ReviewStatus>('ALL')
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'Crypto' | 'Forex' | 'Commodities' | 'Indices'>('ALL')
  const [filterTf, setFilterTf] = useState<'ALL' | 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1'>('ALL')
  const [filterMinConf, setFilterMinConf] = useState(0)
  const [loading, setLoading] = useState(true)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [briefsUpdated, setBriefsUpdated] = useState<Date | null>(null)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
  const [activeLimit, setActiveLimit] = useState(6)        // pagination: active briefs
  const [historyLimit, setHistoryLimit] = useState(20)     // pagination: history briefs
  const PAGE_SIZE_ACTIVE = 6
  const PAGE_SIZE_HISTORY = 20

  // V413: All supported pairs organized by category — replaces the old 7-pair hardcoded list
  const SYMBOL_CATEGORIES = {
    Crypto:     ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','ADA/USDT','DOGE/USDT'],
    Forex:      ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','NZD/USD','USD/CAD'],
    Commodities:['XAU/USD','XAG/USD','WTI/USD','BRENT/USD'],
    Indices:    ['US30/USD','NAS100/USD','SPX500/USD','GER30/USD','UK100/USD'],
  }
  const ALL_SYMBOLS = [...SYMBOL_CATEGORIES.Crypto, ...SYMBOL_CATEGORIES.Forex, ...SYMBOL_CATEGORIES.Commodities, ...SYMBOL_CATEGORIES.Indices]
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false)

  // Fetchers
  const fetchActive = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true); else setIsAutoRefreshing(true)
    try {
      // V308: Pass locale so backend translates analysisSummary
      const r = await fetch(`/api/strategic-council/briefs/active?language=${encodeURIComponent(locale)}`)
      if (!r.ok) { setOffline(true); return }
      setOffline(false); setActiveBriefs((await r.json()).data || []); setBriefsUpdated(new Date())
    } catch { setOffline(true) }
    finally { setLoading(false); setIsAutoRefreshing(false) }
  }, [locale])
  const fetchHistory = useCallback(async () => {
    try {
      // V308: Pass locale so backend translates analysisSummary
      const r = await fetch(`/api/strategic-council/briefs/history?language=${encodeURIComponent(locale)}`)
      if (r.ok) setHistoryBriefs((await r.json()).data || [])
    } catch {}
  }, [locale])
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

  const fActive = useMemo(() => {
    let r = activeBriefs
    if (filterDir !== 'ALL') r = r.filter(b => b.direction === filterDir)
    if (filterCategory !== 'ALL') r = r.filter(b => SYMBOL_CATEGORIES[filterCategory].includes(b.pair))
    if (filterTf !== 'ALL') r = r.filter(b => b.timeframe === filterTf)
    if (filterMinConf > 0) r = r.filter(b => b.confidence >= filterMinConf)
    return r
  }, [activeBriefs, filterDir, filterCategory, filterTf, filterMinConf])
  const fHistory = useMemo(() => {
    let r = filterDir==='ALL' ? historyBriefs : historyBriefs.filter(b=>b.direction===filterDir)
    if (filterStatus !== 'ALL') r = r.filter(b => b.reviewStatus === filterStatus)
    return r
  }, [historyBriefs, filterDir, filterStatus])

  // Reset pagination when filters change
  useEffect(() => { setActiveLimit(PAGE_SIZE_ACTIVE) }, [filterDir, filterCategory, filterTf, filterMinConf])
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
    <SubPageLayout title={t('navLabel')} icon="🏛️" hideHeader>
      <div style={{ minHeight:'100vh', background:COLORS.bg, display:'flex', justifyContent:'center', alignItems:'center' }}>
        <CouncilSigil size={64} />
      </div>
    </SubPageLayout>
  )

  return (
    <SubPageLayout title={t('navLabel')} icon="🏛️" hideHeader>
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
            <div style={{ position:'relative', width:44, height:44, borderRadius: 'var(--radius-lg)', background:'rgba(255,255,255,0.03)', border:`1px solid ${COLORS.border}`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              <div aria-hidden style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 50%, ${hexToRgba(COLORS.council,0.2)}, transparent 70%)` }} />
              <CouncilSigil size={36} />
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <h1 style={{ fontSize: 17, fontWeight:600, letterSpacing:'-0.015em', color:COLORS.textPrimary, margin:0, lineHeight:1 }}>{t('navLabel')}</h1>
                <span style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.council, padding:'2px 6px', borderRadius: 'var(--radius-sm)', background:hexToRgba(COLORS.council,0.12), border:`1px solid ${hexToRgba(COLORS.council,0.3)}` }}>v1</span>
              </div>
              <div style={{ fontSize: 11, color:COLORS.textMuted, marginTop:3 }}>
                {activeBriefs.length} {t('activeBriefs')}{lastSession ? ` · ${t('lastSession')} ${relativeTime(lastSession.timestamp, loc)}` : ''}{sessionRunning ? ` · ${t('conveningCouncil')}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 12px', borderRadius: 'var(--radius-lg)', background:sessionRunning?hexToRgba(COLORS.buy,0.08):'rgba(255,255,255,0.04)', border:`1px solid ${sessionRunning?hexToRgba(COLORS.buy,0.3):COLORS.border}`, fontSize: 11, fontWeight:600, color:sessionRunning?COLORS.buy:COLORS.textMuted }}>
              <LiveDot color={sessionRunning?COLORS.buy:COLORS.textDim} size={7} label={sessionRunning?t('running'):t('idle')} />
            </div>
            <motion.button whileTap={{ scale:0.97 }} onClick={trigger} disabled={triggerLoading||sessionRunning}
              style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'9px 14px', borderRadius: 'var(--radius-lg)', border:'none', cursor:triggerLoading||sessionRunning?'not-allowed':'pointer', background:triggerLoading||sessionRunning?'rgba(168,85,247,0.3)':COLORS.gradientCouncil, color:'#0B0E14', fontSize: 13, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', boxShadow:`0 8px 24px -8px ${hexToRgba(COLORS.council,0.6)}` }}>
              {triggerLoading||sessionRunning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} strokeWidth={2.75} />}
              {sessionRunning ? t('inProgress') : t('triggerSession')}
            </motion.button>
          </div>
        </div>

        {offline && (
          <GlassCard style={{ padding:'12px 16px', borderColor:hexToRgba(COLORS.hold,0.3) }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <AlertTriangle size={16} style={{ color:COLORS.hold }} />
              <span style={{ fontSize: 13, color:COLORS.hold }}>{t('serverUnavailable')}</span>
            </div>
          </GlassCard>
        )}

        {/* ═══ SECTION 1: VERDICT ═══ */}
        <section>
          <GlassCard padding={0} strong glow={councilResult ? directionColor(councilResult.recommendation) : COLORS.council}>
            {/* Eyebrow */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:`1px solid ${COLORS.border}`, flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight:600, letterSpacing:'0.18em', color:COLORS.council, padding:'4px 9px', borderRadius: 'var(--radius-sm)', background:hexToRgba(COLORS.council,0.1), border:`1px solid ${hexToRgba(COLORS.council,0.25)}` }}>01 / VERDICT</div>
                <div style={{ fontSize: 11, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>{t('verdictEyebrow')} · {selectedSymbol}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {councilResult?.isFallback && (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius: 'var(--radius-2xl)', background:hexToRgba(COLORS.hold,0.1), border:`1px solid ${hexToRgba(COLORS.hold,0.35)}`, color:COLORS.hold, fontSize: 11, fontWeight:600 }}>
                    <AlertTriangle size={12} /> {t('fallbackMode')}
                  </div>
                )}
                {councilResult && !councilResult.isFallback && <LiveDot color={COLORS.buy} label={t('liveCouncil')} />}
              </div>
            </div>

            {/* V413: Categorized symbol dropdown — replaces the old 7-button list */}
            <div style={{ padding:'14px 24px', borderBottom:`1px solid ${COLORS.border}`, position:'relative' }}>
              <button
                onClick={()=>setSymbolDropdownOpen(!symbolDropdownOpen)}
                style={{
                  display:'inline-flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius: 'var(--radius-md)',
                  background: hexToRgba(COLORS.council,0.08), border:`1px solid ${hexToRgba(COLORS.council,0.3)}`,
                  color: COLORS.council, fontSize: 13, fontWeight:600, cursor:'pointer', fontFamily: "var(--font-mono)",
                }}
              >
                <span style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:COLORS.textMuted }}>Symbol:</span>
                {selectedSymbol}
                <ChevronDown size={14} strokeWidth={2.5} style={{ transition:'transform 200ms', transform: symbolDropdownOpen?'rotate(180deg)':'none' }} />
              </button>
              {symbolDropdownOpen && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:99 }} onClick={()=>setSymbolDropdownOpen(false)} />
                  <div style={{
                    position:'absolute', top:'100%', insetInlineStart:24, marginTop:4, zIndex:100,
                    minWidth:280, maxHeight:400, overflowY:'auto',
                    background: '#0F131C', border:`1px solid ${COLORS.borderStrong}`, borderRadius: 'var(--radius-lg)',
                    boxShadow:'0 24px 64px -16px rgba(0,0,0,0.8)', padding:8,
                  }}>
                    {Object.entries(SYMBOL_CATEGORIES).map(([cat, syms]) => (
                      <div key={cat} style={{ marginBottom:8 }}>
                        <div style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.textMuted, padding:'6px 10px 4px' }}>{cat}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                          {syms.map(sym => (
                            <button key={sym} onClick={()=>{ setSelectedSymbol(sym); setCouncilResult(null); setSymbolDropdownOpen(false) }} style={{
                              padding:'7px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight:600, fontFamily: "var(--font-mono)", textAlign:'start',
                              background: selectedSymbol===sym ? hexToRgba(COLORS.council,0.15) : 'transparent',
                              border:`1px solid ${selectedSymbol===sym ? hexToRgba(COLORS.council,0.4) : 'transparent'}`,
                              color: selectedSymbol===sym ? COLORS.council : COLORS.textSecondary, cursor:'pointer', transition:'all 150ms ease',
                            }}>{sym}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Body — 3 columns */}
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,0.9fr) minmax(0,1.3fr) minmax(0,1fr)', gap:0, alignItems:'stretch' }} className="council-verdict-grid">
              {/* Ring */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', borderInlineEnd:`1px solid ${COLORS.border}`, gap:12 }}>
                {councilResult ? (
                  <CircularProgress value={councilResult.consensusScore} size={148} strokeWidth={10} color={directionColor(councilResult.recommendation)}>
                    <div style={{ fontSize: 35, fontWeight:600, letterSpacing:'-0.04em', color:COLORS.textPrimary, fontFamily: "var(--font-mono)", lineHeight:1 }}>{councilResult.consensusScore}</div>
                    <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.textMuted, marginTop:4 }}>/ 100</div>
                  </CircularProgress>
                ) : (
                  <CircularProgress value={0} size={148} strokeWidth={10} color={COLORS.textDim}>
                    <div style={{ fontSize: 13, color:COLORS.textMuted, textAlign:'center', maxWidth:110 }}>{councilLoading ? t('conveningCouncil') : t('analyze')}</div>
                  </CircularProgress>
                )}
                <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.textMuted, textAlign:'center' }}>{t('consensus')}</div>
              </div>

              {/* Recommendation */}
              <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 28px', borderInlineEnd:`1px solid ${COLORS.border}`, position:'relative', overflow:'hidden' }}>
                <div aria-hidden style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse 60% 80% at 30% 50%, ${hexToRgba(councilResult?directionColor(councilResult.recommendation):COLORS.council,0.18)} 0%, transparent 70%)`, pointerEvents:'none' }} />
                <div style={{ position:'relative', zIndex:1 }}>
                  <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:14 }}>{t('recommendation')}</div>
                  {councilResult ? (
                    <motion.div key={councilResult.recommendation} initial={{ opacity:0, scale:0.94, y:6 }} animate={{ opacity:1, scale:1, y:0 }} transition={{ duration:0.5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
                        <div style={{ width:52, height:52, borderRadius: 'var(--radius-lg)', background:councilResult.recommendation==='BUY'?COLORS.gradientBuy:councilResult.recommendation==='SELL'?COLORS.gradientSell:'linear-gradient(135deg,#F59E0B,#A855F7)', display:'flex', alignItems:'center', justifyContent:'center', color:'#0B0E14', boxShadow:`0 8px 24px -8px ${hexToRgba(directionColor(councilResult.recommendation),0.7)}` }}>
                          {councilResult.recommendation==='BUY'?<ArrowUpRight size={26} strokeWidth={2.75}/>:councilResult.recommendation==='SELL'?<ArrowDownRight size={26} strokeWidth={2.75}/>:<Minus size={26} strokeWidth={2.75}/>}
                        </div>
                        <div style={{ fontSize: 35, fontWeight:700, letterSpacing:'-0.03em', color:directionColor(councilResult.recommendation), lineHeight:1 }}>{t(dirLabelKey[councilResult.recommendation])}</div>
                      </div>
                      {/* Vote tally */}
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {[
                          { c:COLORS.buy, n:councilResult.analyses.filter(a=>a.vote==='BUY').length, l:t('bullish') },
                          { c:COLORS.sell, n:councilResult.analyses.filter(a=>a.vote==='SELL').length, l:t('bearish') },
                          { c:COLORS.hold, n:councilResult.analyses.filter(a=>a.vote==='HOLD').length, l:t('neutral') },
                        ].filter(v=>v.n>0).map((v,i) => (
                          <div key={i} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius: 'var(--radius-md)', background:hexToRgba(v.c,0.1), border:`1px solid ${hexToRgba(v.c,0.3)}`, color:v.c, fontSize: 11, fontWeight:600 }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:v.c, boxShadow:`0 0 6px ${v.c}` }} />
                            {v.n} {v.l}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <div style={{ fontSize: 19, color:COLORS.textMuted, fontStyle:'italic' }}>{councilLoading ? t('conveningCouncil') : t('noSessionYet')}</div>
                  )}
                </div>
              </div>

              {/* Confidence + Analyze button */}
              <div style={{ padding:'32px 24px', display:'flex', flexDirection:'column', justifyContent:'center', gap:18 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>{t('colConfidence')}</span>
                    <span style={{ fontSize: 22, fontWeight:600, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{councilResult?`${councilResult.consensusScore}%`:'—'}</span>
                  </div>
                  <ConfidenceBar value={councilResult?.consensusScore ?? 0} color={councilResult?directionColor(councilResult.recommendation):COLORS.council} height={6} />
                </div>
                <motion.button whileTap={{ scale:0.98 }} onClick={fetchCouncil} disabled={councilLoading}
                  style={{ width:'100%', padding:'12px 18px', borderRadius: 'var(--radius-lg)', border:'none', cursor:councilLoading?'wait':'pointer', background:COLORS.gradientCouncil, color:'#0B0E14', fontWeight:600, fontSize: 13, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:`0 10px 30px -10px ${hexToRgba(COLORS.council,0.7)}` }}>
                  <RefreshCw size={14} strokeWidth={2.5} className={councilLoading?'animate-spin':''} />
                  {councilLoading ? t('conveningCouncil') : t('analyze')}
                </motion.button>
              </div>
            </div>

            {/* Master Strategy */}
            {councilResult?.masterStrategy && (
              <div style={{ padding:'22px 24px', borderTop:`1px solid ${COLORS.border}`, background:'rgba(0,0,0,0.18)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ width:26, height:26, borderRadius: 'var(--radius-md)', background:COLORS.gradientCouncil, display:'flex', alignItems:'center', justifyContent:'center', color:'#0B0E14' }}><Sparkles size={13} strokeWidth={2.5} /></div>
                  <div style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase', color:COLORS.council }}>{t('unifiedStrategy')}</div>
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

          {/* Vote cards grid — professional compact design (V449) */}
          {councilResult?.analyses && councilResult.analyses.length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:COLORS.council }}>{t('councilVotes')}</div>
                <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${hexToRgba(COLORS.council,0.3)}, transparent)` }} />
                <div style={{ fontSize: 11, color:COLORS.textMuted, fontFamily: "var(--font-mono)" }}>{councilResult.analyses.length} {t('members')}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
                {councilResult.analyses.map((a, i) => {
                  const dc = directionColor(a.vote)
                  return (
                    <motion.div key={i} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.35, delay:0.04*i }}>
                      <div style={{ borderRadius: 'var(--radius-lg)', background:'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)', border:`1px solid ${COLORS.border}`, overflow:'hidden', transition:'border-color 200ms, transform 200ms' }}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=hexToRgba(dc,0.35);e.currentTarget.style.transform='translateY(-2px)'}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=COLORS.border;e.currentTarget.style.transform='translateY(0)'}}>
                        {/* Header: Role + Vote badge */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:`1px solid ${COLORS.border}`, gap:8 }}>
                          <span style={{ fontSize: 13, fontWeight:600, color:COLORS.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>{a.role}</span>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 7px', borderRadius: 'var(--radius-sm)', background:hexToRgba(dc,0.12), border:`1px solid ${hexToRgba(dc,0.3)}`, color:dc, fontSize: 11, fontWeight:700, textTransform:'uppercase', flexShrink:0 }}>
                            {a.vote==='BUY'?<ArrowUpRight size={11} strokeWidth={2.5}/>:a.vote==='SELL'?<ArrowDownRight size={11} strokeWidth={2.5}/>:<Minus size={11} strokeWidth={2.5}/>}
                            {t(dirLabelKey[a.vote])}
                          </div>
                        </div>
                        {/* Body: Model + Confidence */}
                        <div style={{ padding:'8px 12px 10px', display:'flex', flexDirection:'column', gap:6 }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ fontSize: 11, color:COLORS.textMuted, fontFamily: "var(--font-mono)" }}>{a.model}</span>
                            <span style={{ fontSize: 11, fontWeight:700, color:dc, fontFamily: "var(--font-mono)" }}>{a.confidence}%</span>
                          </div>
                          <div style={{ height:4, borderRadius: 'var(--radius-2xl)', background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${a.confidence}%`, background:`linear-gradient(90deg, ${dc}, ${hexToRgba(dc,0.5)})`, borderRadius: 'var(--radius-2xl)' }} />
                          </div>
                        </div>
                        {/* Footer: Details button */}
                        <div style={{ padding:'6px 12px 8px', borderTop:`1px solid ${COLORS.border}`, display:'flex', justifyContent:'center' }}>
                          <button
                            onClick={() => setExpandedVote(expandedVote === i ? null : i)}
                            style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius: 'var(--radius-sm)', background:expandedVote===i?hexToRgba(COLORS.council,0.1):'rgba(255,255,255,0.03)', border:`1px solid ${expandedVote===i?hexToRgba(COLORS.council,0.3):COLORS.border}`, color:expandedVote===i?COLORS.council:COLORS.textMuted, fontSize: 11, fontWeight:600, cursor:'pointer', letterSpacing:'0.03em' }}
                          >
                            {expandedVote===i ? (t('hideDetails') ?? 'Hide') : (t('showDetails') ?? 'Details')}
                            <motion.span animate={{ rotate:expandedVote===i?180:0 }} transition={{ duration:0.2 }}><ChevronDown size={9} strokeWidth={2.5} /></motion.span>
                          </button>
                        </div>
                        {/* Expandable reason */}
                        <AnimatePresence initial={false}>
                          {expandedVote === i && (
                            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.25 }} style={{ overflow:'hidden' }}>
                              <div style={{ padding:'10px 12px 12px', background:'rgba(0,0,0,0.15)', borderTop:`1px solid ${COLORS.border}` }}>
                                <FormattedText text={a.reason} maxLength={0} collapsible={false} dir={loc==='ar'?'rtl':'ltr'} fontSize={11} accent={dc} placeholder={t('noReason') ?? 'No reason provided'} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ═══ SECTION 2: ACTIVE BRIEFS (with collapsible Decision Matrix) ═══ */}
        <section>
          <SectionHeader index="02" eyebrow={t('section2Eyebrow')} title={t('activeBriefs')} right={<LiveDot color={isAutoRefreshing?COLORS.buy:COLORS.textDim} label={`${t('autoRefresh')} · 30s`} />} />
          {/* V441: Compact filter bar — all filters in 2 rows */}
          <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap', alignItems:'center' }}>
            {(['ALL','BUY','SELL'] as const).map(d => (
              <motion.button key={d} whileTap={{ scale:0.96 }} onClick={()=>setFilterDir(d)} style={{ padding:'5px 10px', borderRadius: 'var(--radius-md)', border:`1px solid ${filterDir===d?hexToRgba(d==='ALL'?COLORS.council:directionColor(d),0.4):COLORS.border}`, background:filterDir===d?hexToRgba(d==='ALL'?COLORS.council:directionColor(d),0.12):'transparent', color:filterDir===d?(d==='ALL'?COLORS.council:directionColor(d)):COLORS.textMuted, fontSize: 11, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5 }}>
                {d==='ALL'?t('all'):d==='BUY'?`▲ ${t('buy')}`:`▼ ${t('sell')}`}
                <span style={{ fontSize: 11, padding:'1px 5px', borderRadius: 'var(--radius-sm)', background:filterDir===d?hexToRgba(d==='ALL'?COLORS.council:directionColor(d),0.18):'rgba(255,255,255,0.06)', fontFamily: "var(--font-mono)", fontWeight:700 }}>{d==='ALL'?activeBriefs.length:activeBriefs.filter(b=>b.direction===d).length}</span>
              </motion.button>
            ))}
            <div style={{ width:1, height:18, background:COLORS.border, margin:'0 2px' }} />
            {(['ALL','Crypto','Forex','Commodities','Indices'] as const).map(c => (
              <button key={c} onClick={()=>setFilterCategory(c)} style={{ padding:'5px 10px', borderRadius: 'var(--radius-md)', border:`1px solid ${filterCategory===c?hexToRgba(COLORS.council,0.4):COLORS.border}`, background:filterCategory===c?hexToRgba(COLORS.council,0.12):'transparent', color:filterCategory===c?COLORS.council:COLORS.textMuted, fontSize: 11, fontWeight:600, cursor:'pointer' }}>{c}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            {(['ALL','M1','M5','M15','M30','H1','H4','D1','W1'] as const).map(tf => (
              <button key={tf} onClick={()=>setFilterTf(tf)} style={{ padding:'5px 9px', borderRadius: 'var(--radius-md)', border:`1px solid ${filterTf===tf?hexToRgba(COLORS.info,0.4):COLORS.border}`, background:filterTf===tf?hexToRgba(COLORS.info,0.12):'transparent', color:filterTf===tf?COLORS.info:COLORS.textMuted, fontSize: 11, fontWeight:600, fontFamily: "var(--font-mono)", cursor:'pointer' }}>{tf}</button>
            ))}
            <div style={{ width:1, height:18, background:COLORS.border, margin:'0 2px' }} />
            {[0,50,60,70,75,80,85].map(c => (
              <button key={c} onClick={()=>setFilterMinConf(c)} style={{ padding:'5px 9px', borderRadius: 'var(--radius-md)', border:`1px solid ${filterMinConf===c?hexToRgba(COLORS.buy,0.4):COLORS.border}`, background:filterMinConf===c?hexToRgba(COLORS.buy,0.12):'transparent', color:filterMinConf===c?COLORS.buy:COLORS.textMuted, fontSize: 11, fontWeight:600, fontFamily: "var(--font-mono)", cursor:'pointer' }}>{c===0?(t('all') ?? 'All'):`${c}%`}</button>
            ))}
          </div>
          {fActive.length===0 ? (
            <GlassCard padding={40} style={{ textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius: 'var(--radius-xl)', margin:'0 auto 16px', background:hexToRgba(COLORS.council,0.08), border:`1px solid ${hexToRgba(COLORS.council,0.2)}`, display:'flex', alignItems:'center', justifyContent:'center' }}><Sparkles size={24} color={COLORS.council} /></div>
              <div style={{ fontSize: 17, fontWeight:600, color:COLORS.textPrimary, marginBottom:6 }}>{t('noActiveBriefs')}</div>
              <div style={{ fontSize: 13, color:COLORS.textMuted }}>{t('councilWatchingMarkets')}</div>
            </GlassCard>
          ) : (
            <>
              <motion.div layout style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:16 }}>
                <AnimatePresence mode="popLayout">
                  {visibleActive.map((brief, i) => <BriefCard key={brief.id} brief={brief} loc={loc} index={i} expanded={expandedBrief===brief.id} onToggle={()=>setExpandedBrief(expandedBrief===brief.id?null:brief.id)} t={t} />)}
                </AnimatePresence>
              </motion.div>
              <LoadMoreButton
                count={visibleActive.length}
                total={fActive.length}
                onClick={() => setActiveLimit(l => l + PAGE_SIZE_ACTIVE)}
                moreLabel={t('loadMoreSignals')}
                accent={COLORS.council}
              />
            </>
          )}
          {/* Collapsible Decision Matrix */}
          <details style={{ marginTop:20 }}>
            <summary style={{ cursor:'pointer', padding:'12px 16px', borderRadius: 'var(--radius-lg)', background:hexToRgba(COLORS.council,0.06), border:`1px solid ${hexToRgba(COLORS.council,0.2)}`, listStyle:'none', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:28, height:28, borderRadius: 'var(--radius-md)', background:hexToRgba(COLORS.council,0.15), border:`1px solid ${hexToRgba(COLORS.council,0.3)}`, color:COLORS.council, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Layers size={15} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight:700, color:COLORS.textPrimary }}>{t('decisionMatrix') ?? 'Decision Matrix'}</div>
                <div style={{ fontSize: 11, color:COLORS.textMuted, marginTop:2 }}>{t('decisionMatrixDesc') ?? 'Pair × Timeframe heatmap'}</div>
              </div>
              <ChevronDown size={16} style={{ marginLeft:'auto', color:COLORS.textMuted, transition:'transform 200ms' }} />
            </summary>
            <GlassCard padding={20} style={{ marginTop:8 }}>
              <DecisionMatrix briefs={activeBriefs} />
            </GlassCard>
          </details>
        </section>

        {/* ═══ SECTION 03: HISTORY + PERFORMANCE ═══ */}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.3fr) minmax(0,1fr)', gap:32, alignItems:'start' }} className="council-bottom-grid">
          {/* History */}
          <section>
            <SectionHeader index="03" eyebrow={t('section3Eyebrow')} title={t('sessionLog')} />
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {(['ALL','EXECUTED','MODIFIED','CANCELLED'] as const).map(s => (
                <button key={s} onClick={()=>setFilterStatus(s)} style={{ padding:'6px 12px', borderRadius: 'var(--radius-md)', border:`1px solid ${filterStatus===s?hexToRgba(s==='ALL'?COLORS.council:statusColor(s),0.4):COLORS.border}`, background:filterStatus===s?hexToRgba(s==='ALL'?COLORS.council:statusColor(s),0.12):'rgba(255,255,255,0.025)', color:filterStatus===s?(s==='ALL'?COLORS.council:statusColor(s)):COLORS.textMuted, fontSize: 11, fontWeight:600, textTransform:'uppercase', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                  {s==='ALL'?t('all'):t(stLabelKey[s])}
                  <span style={{ fontSize: 11, padding:'1px 5px', borderRadius: 'var(--radius-sm)', background:filterStatus===s?hexToRgba(s==='ALL'?COLORS.council:statusColor(s),0.18):'rgba(255,255,255,0.06)', fontFamily: "var(--font-mono)", fontWeight:700 }}>{s==='ALL'?historyBriefs.length:historyBriefs.filter(b=>b.reviewStatus===s).length}</span>
                </button>
              ))}
            </div>
            {fHistory.length===0 ? (
              <GlassCard padding={36} style={{ textAlign:'center' }}>
                <div style={{ fontSize: 15, fontWeight:600, color:COLORS.textPrimary, marginBottom:4 }}>{t('noHistory')}</div>
                <div style={{ fontSize: 13, color:COLORS.textMuted }}>{t('historyWillAppear')}</div>
              </GlassCard>
            ) : (
              <>
                <GlassCard padding={12} style={{ overflow:'hidden', minWidth:680 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'minmax(100px,1fr) 55px 80px 50px 80px 80px 70px', gap:8, padding:'8px 10px 10px', fontSize: 10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:COLORS.textMuted, borderBottom:`1px solid ${COLORS.border}`, whiteSpace:'nowrap' }}>
                    <div>{t('colPair')}</div><div>{t('colDirection')}</div><div>{t('colEntry')}</div><div>{t('colConfidence')}</div><div>{t('colStatus')}</div><div>{tc('pair') === 'الزوج' ? 'المنفذ' : 'Executor'}</div><div style={{ textAlign:'right' }}>{t('colOutcome')}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:4, maxHeight:520, overflowY:'auto', paddingRight:4 }}>
                    {visibleHistory.map((b, i) => {
                      const dc = directionColor(b.direction)
                      const won = b.outcomePips !== undefined && b.outcomePips > 0
                      const lost = b.outcomePips !== undefined && b.outcomePips < 0
                      // Executor label — show who issued/executed this brief
                      const isAr = tc('pair') === 'الزوج'
                      const execLabel = b.source === 'smart_executor' ? (isAr ? 'منفذ ذكي' : 'Smart')
                        : b.source === 'agent' ? (isAr ? 'وكيل' : 'Agent')
                        : (b.source === 'lazic' || b.source === 'lasic') ? 'Stinger'
                        : b.source === 'auto_paper' ? (isAr ? 'ورقي' : 'Paper')
                        : b.source === 'council' ? (isAr ? 'مجلس' : 'Council')
                        : b.reviewStatus === 'EXECUTED' ? (isAr ? 'يدوي' : 'Manual')
                        : b.reviewStatus === 'ACTIVE' ? (isAr ? 'مجلس' : 'Council')
                        : b.reviewStatus === 'CANCELLED' ? (isAr ? 'مجلس' : 'Council')
                        : (isAr ? 'مجلس' : 'Council')
                      const execColor = b.source === 'smart_executor' ? '#FFB800'
                        : b.source === 'agent' ? '#B388FF'
                        : (b.source === 'lazic' || b.source === 'lasic') ? '#FF6B35'
                        : b.source === 'auto_paper' ? '#00D4FF'
                        : '#9CA3B5'
                      // Result label — show based on outcome or status
                      const resultLabel = b.result === 'WIN' ? (isAr ? 'ربح' : 'Win')
                        : b.result === 'LOSS' ? (isAr ? 'خسارة' : 'Loss')
                        : b.result === 'BREAKEVEN' ? (isAr ? 'تعادل' : 'BE')
                        : won ? (isAr ? 'ربح' : 'Win')
                        : lost ? (isAr ? 'خسارة' : 'Loss')
                        : b.reviewStatus === 'EXECUTED' ? (isAr ? 'معلقة' : 'Pending')
                        : b.reviewStatus === 'ACTIVE' ? (isAr ? 'بانتظار' : 'Waiting')
                        : b.reviewStatus === 'CANCELLED' ? (isAr ? 'ملغى' : 'N/A')
                        : '—'
                      const resultColor = won || b.result === 'WIN' ? COLORS.buy
                        : lost || b.result === 'LOSS' ? COLORS.sell
                        : COLORS.textMuted
                      return (
                        <motion.div key={b.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:Math.min(i*0.025,0.4) }}
                          style={{ display:'grid', gridTemplateColumns:'minmax(100px,1fr) 55px 80px 50px 80px 80px 70px', alignItems:'center', gap:8, padding:'8px 10px', borderRadius: 'var(--radius-lg)', background:'rgba(255,255,255,0.022)', border:`1px solid ${COLORS.border}`, transition:'background 200ms' }}
                          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.borderColor=COLORS.borderStrong}}
                          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.022)';e.currentTarget.style.borderColor=COLORS.border}}>
                          {/* Pair + timeframe */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                            <div style={{ width:24, height:24, borderRadius: 'var(--radius-md)', background:directionSoft(b.direction), border:`1px solid ${hexToRgba(dc,0.3)}`, color:dc, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              {b.direction==='BUY'?<TrendingUp size={11} strokeWidth={2.5}/>:<TrendingDown size={11} strokeWidth={2.5}/>}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize: 12, fontWeight:600, color:COLORS.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.pair}</div>
                              <div style={{ fontSize: 10, color:COLORS.textMuted, fontFamily: "var(--font-mono)" }}>{b.timeframe} · {b.issuedAt?relativeTime(b.issuedAt, loc):'—'}</div>
                            </div>
                          </div>
                          {/* Direction */}
                          <div style={{ fontSize: 10, fontWeight:700, textTransform:'uppercase', color:dc, whiteSpace:'nowrap' }}>{t(dirLabelKey[b.direction])}</div>
                          {/* Entry */}
                          <div style={{ fontSize: 12, color:COLORS.textSecondary, fontFamily: "var(--font-mono)", whiteSpace:'nowrap' }}>{formatPrice(b.entryPrice)}</div>
                          {/* Confidence */}
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div style={{ width:30, height:3, borderRadius: 'var(--radius-2xl)', background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${b.confidence}%`, background:COLORS.council, borderRadius: 'var(--radius-2xl)' }} />
                            </div>
                            <span style={{ fontSize: 10, color:COLORS.textSecondary, fontFamily: "var(--font-mono)", fontWeight:600 }}>{b.confidence}</span>
                          </div>
                          {/* Status */}
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            {b.reviewStatus==='EXECUTED'?<CheckCircle2 size={12} color={statusColor(b.reviewStatus)} strokeWidth={2.5}/>:b.reviewStatus==='CANCELLED'?<XCircle size={12} color={statusColor(b.reviewStatus)} strokeWidth={2.5}/>:<RefreshCw size={12} color={statusColor(b.reviewStatus)} strokeWidth={2.5}/>}
                            <StatusPill status={b.reviewStatus} label={t(stLabelKey[b.reviewStatus])} />
                          </div>
                          {/* Executor */}
                          <div style={{ display:'flex', justifyContent:'center' }}>
                            <span style={{ padding:'2px 6px', borderRadius:'8px', background:hexToRgba(execColor,0.12), border:`1px solid ${hexToRgba(execColor,0.3)}`, color:execColor, fontSize:9, fontWeight:800, whiteSpace:'nowrap' }}>
                              {execLabel}
                            </span>
                          </div>
                          {/* Outcome + result */}
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1 }}>
                            {b.outcomePips !== undefined ? (
                              <span style={{ fontSize: 12, fontWeight:700, color:resultColor, fontFamily: "var(--font-mono)" }}>
                                {b.outcomePips>0?'+':''}{b.outcomePips.toFixed(2)}$
                              </span>
                            ) : <span style={{ fontSize: 10, color:COLORS.textDim, fontStyle:'italic' }}>—</span>}
                            <span style={{ fontSize: 9, fontWeight:700, color:resultColor, whiteSpace:'nowrap' }}>{resultLabel}</span>
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
                  moreLabel={t('loadMoreHistory')}
                  accent={COLORS.info}
                />
              </>
            )}
          </section>

          {/* Performance */}
          <section>
            <SectionHeader index="04" eyebrow={t('section4Eyebrow')} title={t('councilPerformance')} />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:14, marginBottom:16 }}>
              <StatTile label={t('totalBriefs')} value={perf.total} sub={`${perf.total>0?Math.round(perf.executed/perf.total*100):0}% ${t('executionRate')}`} accent={COLORS.council} icon={<Briefcase size={15} />} />
              <StatTile label={t('executed')} value={perf.executed} accent={COLORS.buy} icon={<CheckCircle2 size={15} />} />
              <StatTile label={t('cancelled')} value={perf.cancelled} accent={COLORS.sell} icon={<XCircle size={15} />} />
              <StatTile label={t('modified')} value={perf.modified} accent={COLORS.hold} icon={<RefreshCw size={15} />} />
            </div>
            {/* V412: Enhanced Performance Details */}
            <PerformanceDetails briefs={historyBriefs} />
            {/* Session Diagnostics — filtered to show only skip/reject reasons */}
            {lastSession?.diagnostics && lastSession.diagnostics.length > 0 && (() => {
              const skipReasons = lastSession.diagnostics.filter(d =>
                d.includes('SKIPPED') || d.includes('Pure HOLD') || d.includes('BLOCKED') || d.includes('REJECTED') || d.includes('FAIL')
              );
              if (skipReasons.length === 0) return null;
              return (
                <GlassCard padding={20} style={{ marginTop: 16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <div style={{ width:28, height:28, borderRadius: 'var(--radius-md)', background:hexToRgba(COLORS.hold,0.12), border:`1px solid ${hexToRgba(COLORS.hold,0.3)}`, color:COLORS.hold, display:'flex', alignItems:'center', justifyContent:'center' }}><AlertTriangle size={15} /></div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>{t('sessionDiagnostics') ?? 'Session Diagnostics'}</div>
                      <div style={{ fontSize: 13, fontWeight:600, color:COLORS.textPrimary, marginTop:2 }}>{t('whySkipped') ?? 'Skip Reasons'}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:200, overflowY:'auto' }}>
                    {skipReasons.slice(0, 20).map((d, i) => {
                      const isBlocked = d.includes('BLOCKED') || d.includes('REJECTED') || d.includes('FAIL');
                      return (
                        <div key={i} style={{ fontSize: 11, color:isBlocked?COLORS.sell:COLORS.textMuted, fontFamily: "var(--font-mono)", padding:'6px 10px', borderRadius: 'var(--radius-md)', background:isBlocked?hexToRgba(COLORS.sell,0.05):'rgba(255,255,255,0.02)', border:`1px solid ${isBlocked?hexToRgba(COLORS.sell,0.2):COLORS.border}` }}>
                          {d}
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              );
            })()}
            {/* Last session */}
            {lastSession && (
              <GlassCard padding={20} style={{ marginTop: 16 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:28, height:28, borderRadius: 'var(--radius-md)', background:hexToRgba(COLORS.info,0.12), border:`1px solid ${hexToRgba(COLORS.info,0.3)}`, color:COLORS.info, display:'flex', alignItems:'center', justifyContent:'center' }}><Activity size={15} /></div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:COLORS.textMuted }}>{t('lastSession')}</div>
                      <div style={{ fontSize: 13, color:COLORS.textSecondary, marginTop:2, display:'flex', alignItems:'center', gap:5 }}>
                        <Calendar size={11} /> {relativeTime(lastSession.timestamp, loc)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 9px', borderRadius: 'var(--radius-2xl)', background:hexToRgba(COLORS.buy,0.1), border:`1px solid ${hexToRgba(COLORS.buy,0.3)}`, color:COLORS.buy, fontSize: 11, fontWeight:600 }}>
                    <Sparkles size={11} /> {t('liveCouncil')}
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { i:<Layers size={13}/>, l:t('pairsAnalyzed'), v:lastSession.pairsAnalyzed, c:COLORS.council },
                    { i:<Briefcase size={13}/>, l:t('briefsIssued'), v:lastSession.briefsIssued, c:COLORS.info },
                    { i:<RefreshCw size={13}/>, l:t('modified'), v:lastSession.briefsModified, c:COLORS.hold },
                    { i:<XCircle size={13}/>, l:t('cancelled'), v:lastSession.briefsCancelled, c:COLORS.sell },
                    { i:<CheckCircle2 size={13}/>, l:t('executed'), v:lastSession.briefsExecuted||0, c:COLORS.buy },
                    { i:<Clock size={13}/>, l:t('duration'), v:formatDuration(lastSession.durationMs, loc), c:COLORS.textSecondary },
                  ].map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 13px', borderRadius: 'var(--radius-lg)', background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{ width:26, height:26, borderRadius: 'var(--radius-md)', background:hexToRgba(s.c,0.12), color:s.c, display:'flex', alignItems:'center', justifyContent:'center' }}>{s.i}</div>
                        <span style={{ fontSize: 13, color:COLORS.textSecondary, fontWeight:500 }}>{s.l}</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight:600, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{s.v}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer style={{ marginTop:24, paddingTop:24, borderTop:`1px solid ${COLORS.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div style={{ fontSize: 11, color:COLORS.textDim }}>{t('footerTagline')} · {t('footerSubline')}</div>
          <div style={{ fontSize: 11, color:COLORS.textDim, fontFamily: "var(--font-mono)" }}>
            <span style={{ color:COLORS.council }}>●</span> Council v1.0 · {ALL_SYMBOLS.length} symbols · 8 AI agents
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

function BriefCard({ brief, loc, index, expanded, onToggle, t }: {
  brief: TradingBrief; loc: 'ar'|'en'; index: number; expanded: boolean; onToggle: () => void
  t: (key: string) => string
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

  // V413: R/R visual bar — proportional representation of SL and TP distances
  const totalDist = slDist + tpDist
  const slBarWidth = totalDist > 0 ? (slDist / totalDist) * 100 : 50
  const tpBarWidth = totalDist > 0 ? (tpDist / totalDist) * 100 : 50

  return (
    <motion.div layout initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} transition={{ duration:0.4, delay:index*0.05 }}>
      <GlassCard padding={0} glow={dc} interactive style={{ height:'100%' }}>
        {/* Compact card — 3 rows max */}
        {/* Row 1: Ring + Pair + TF + Direction */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            <CircularProgress value={brief.confidence} size={40} strokeWidth={4} color={dc} glow={false} animationDelay={index*0.05}>
              <span style={{ fontSize: 11, fontWeight:700, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{brief.confidence}</span>
            </CircularProgress>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <span style={{ fontSize: 15, fontWeight:700, color:COLORS.textPrimary }}>{brief.pair}</span>
                <span style={{ fontSize: 11, fontWeight:700, padding:'2px 5px', borderRadius: 'var(--radius-sm)', background:hexToRgba(COLORS.council,0.1), border:`1px solid ${hexToRgba(COLORS.council,0.25)}`, color:COLORS.council, fontFamily: "var(--font-mono)" }}>{brief.timeframe}</span>
              </div>
              <span style={{ fontSize: 11, color:COLORS.textDim, display:'inline-flex', alignItems:'center', gap:3, fontFamily: "var(--font-mono)" }}>
                <Clock size={9} /> {relativeTime(brief.issuedAt, loc)}
              </span>
            </div>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius: 'var(--radius-md)', background:dirSoft, border:`1px solid ${hexToRgba(dc,0.35)}`, color:dc, fontSize: 11, fontWeight:700, textTransform:'uppercase', flexShrink:0 }}>
            {brief.direction==='BUY'?<TrendingUp size={12} strokeWidth={2.5}/>:<TrendingDown size={12} strokeWidth={2.5}/>}
            {t(dirLabelKey[brief.direction])}
          </div>
        </div>
        {/* Row 2: Entry / SL / TP in clean grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:COLORS.border, borderTop:`1px solid ${COLORS.border}`, borderBottom:`1px solid ${COLORS.border}` }}>
          <div style={{ padding:'8px 12px', background:'rgba(0,0,0,0.15)', textAlign:'center' }}>
            <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:2 }}>{t('entry')}</div>
            <div style={{ fontSize: 13, fontWeight:700, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{formatPrice(brief.entryPrice)}</div>
          </div>
          <div style={{ padding:'8px 12px', background:'rgba(0,0,0,0.15)', textAlign:'center', borderInlineStart:`1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:COLORS.sell, marginBottom:2 }}>SL</div>
            <div style={{ fontSize: 13, fontWeight:700, color:COLORS.sell, fontFamily: "var(--font-mono)" }}>{formatPrice(brief.stopLoss)}</div>
          </div>
          <div style={{ padding:'8px 12px', background:'rgba(0,0,0,0.15)', textAlign:'center', borderInlineStart:`1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:COLORS.buy, marginBottom:2 }}>TP</div>
            <div style={{ fontSize: 13, fontWeight:700, color:COLORS.buy, fontFamily: "var(--font-mono)" }}>{formatPrice(brief.takeProfit)}</div>
          </div>
        </div>
        {/* Row 3: R/R + Countdown + Details button */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px 10px', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, fontSize: 11, color:COLORS.textMuted, fontFamily: "var(--font-mono)" }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}><Gauge size={10} /> R/R {rr.toFixed(2)}</span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, color:isExpired?COLORS.sell:remainingMs<3600000?COLORS.hold:COLORS.textDim }}><Timer size={10} /> {isExpired?t('expired'):formatCountdown(remainingMs, loc)}</span>
          </div>
          <motion.button onClick={onToggle} whileTap={{ scale:0.97 }} whileHover={{ y:-1 }} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius: 'var(--radius-md)', background:hexToRgba(COLORS.council,0.08), border:`1px solid ${hexToRgba(COLORS.council,0.25)}`, color:COLORS.council, fontSize: 11, fontWeight:600, cursor:'pointer', letterSpacing:'0.03em' }}>
            {t('showDetails')} <ChevronDown size={11} strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* V447: Popup rendered via portal — escapes GlassCard overflow:hidden */}
        {expanded && typeof document !== 'undefined' && createPortal(
          <AnimatePresence initial={false}>
            <motion.div
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.2 }}
              style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
              onClick={onToggle}
            >
              <motion.div
                initial={{ scale:0.92, y:20, opacity:0 }} animate={{ scale:1, y:0, opacity:1 }} exit={{ scale:0.92, y:20, opacity:0 }} transition={{ duration:0.3, ease:[0.22,1,0.36,1] }}
                style={{ maxWidth:560, width:'100%', maxHeight:'85vh', overflowY:'auto', background:'#0F131C', border:`1px solid ${COLORS.borderStrong}`, borderRadius: 'var(--radius-xl)', boxShadow:`0 32px 80px -16px rgba(0,0,0,0.9), 0 0 0 1px ${hexToRgba(dc,0.15)}` }}
                onClick={e=>e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:`1px solid ${COLORS.border}`, position:'sticky', top:0, background:'#0F131C', zIndex:2 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <CircularProgress value={brief.confidence} size={44} strokeWidth={4} color={dc} glow={false}>
                      <span style={{ fontSize: 11, fontWeight:700, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{brief.confidence}</span>
                    </CircularProgress>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize: 19, fontWeight:700, color:COLORS.textPrimary }}>{brief.pair}</span>
                        <span style={{ fontSize: 11, fontWeight:700, padding:'2px 7px', borderRadius: 'var(--radius-sm)', background:hexToRgba(COLORS.council,0.12), border:`1px solid ${hexToRgba(COLORS.council,0.25)}`, color:COLORS.council, fontFamily: "var(--font-mono)" }}>{brief.timeframe}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius: 'var(--radius-md)', background:dirSoft, border:`1px solid ${hexToRgba(dc,0.35)}`, color:dc, fontSize: 11, fontWeight:700, textTransform:'uppercase' }}>
                          {brief.direction==='BUY'?<TrendingUp size={11} strokeWidth={2.5}/>:<TrendingDown size={11} strokeWidth={2.5}/>}
                          {t(dirLabelKey[brief.direction])}
                        </div>
                        <span style={{ fontSize: 11, color:COLORS.textMuted, display:'inline-flex', alignItems:'center', gap:3 }}><Clock size={10} /> {relativeTime(brief.issuedAt, loc)}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={onToggle} style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${COLORS.border}`, cursor:'pointer', color:COLORS.textMuted, padding:6, borderRadius: 'var(--radius-md)', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 150ms' }}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color=COLORS.textPrimary}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color=COLORS.textMuted}}>
                    <XCircle size={18} />
                  </button>
                </div>
                {/* Body */}
                <div style={{ padding:'22px', display:'flex', flexDirection:'column', gap:16 }}>
                  {/* Price grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                    <div style={{ textAlign:'center', padding:'12px', borderRadius: 'var(--radius-lg)', background:'rgba(255,255,255,0.025)', border:`1px solid ${COLORS.border}` }}>
                      <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:COLORS.textMuted, marginBottom:4 }}>{t('entry')}</div>
                      <div style={{ fontSize: 17, fontWeight:700, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{formatPrice(brief.entryPrice)}</div>
                    </div>
                    <div style={{ textAlign:'center', padding:'12px', borderRadius: 'var(--radius-lg)', background:hexToRgba(COLORS.sell,0.06), border:`1px solid ${hexToRgba(COLORS.sell,0.2)}` }}>
                      <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:COLORS.sell, marginBottom:4 }}>{t('stopLoss')}</div>
                      <div style={{ fontSize: 17, fontWeight:700, color:COLORS.sell, fontFamily: "var(--font-mono)" }}>{formatPrice(brief.stopLoss)}</div>
                      <div style={{ fontSize: 11, color:COLORS.sell, fontFamily: "var(--font-mono)", marginTop:2 }}>{slPctStr}</div>
                    </div>
                    <div style={{ textAlign:'center', padding:'12px', borderRadius: 'var(--radius-lg)', background:hexToRgba(COLORS.buy,0.06), border:`1px solid ${hexToRgba(COLORS.buy,0.2)}` }}>
                      <div style={{ fontSize: 11, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:COLORS.buy, marginBottom:4 }}>{t('takeProfit')}</div>
                      <div style={{ fontSize: 17, fontWeight:700, color:COLORS.buy, fontFamily: "var(--font-mono)" }}>{formatPrice(brief.takeProfit)}</div>
                      <div style={{ fontSize: 11, color:COLORS.buy, fontFamily: "var(--font-mono)", marginTop:2 }}>{tpPctStr}</div>
                    </div>
                  </div>
                  {/* R/R bar */}
                  <div style={{ position:'relative', height:28, borderRadius: 'var(--radius-md)', overflow:'hidden', display:'flex', border:`1px solid ${COLORS.border}` }}>
                    <div style={{ width:`${slBarWidth}%`, background:`linear-gradient(90deg, ${hexToRgba(COLORS.sell,0.3)}, ${hexToRgba(COLORS.sell,0.12)})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 11, fontWeight:700, color:COLORS.sell }}>
                      {rr.toFixed(1)}R RISK
                    </div>
                    <div style={{ width:'2px', background:COLORS.textPrimary, zIndex:1 }} />
                    <div style={{ width:`${tpBarWidth}%`, background:`linear-gradient(90deg, ${hexToRgba(COLORS.buy,0.12)}, ${hexToRgba(COLORS.buy,0.3)})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize: 11, fontWeight:700, color:COLORS.buy }}>
                      {(rr * 1).toFixed(1)}R REWARD
                    </div>
                  </div>
                  {/* Details grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius: 'var(--radius-md)', background:'rgba(255,255,255,0.02)', border:`1px solid ${COLORS.border}` }}>
                      <Activity size={13} color={COLORS.info} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{t('lastReview')}</div>
                        <span style={{ fontSize: 13, fontWeight:600, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{relativeTime(brief.lastReviewedAt, loc)}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius: 'var(--radius-md)', background:'rgba(255,255,255,0.02)', border:`1px solid ${COLORS.border}` }}>
                      <Gauge size={13} color={COLORS.info} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{t('riskReward')}</div>
                        <span style={{ fontSize: 13, fontWeight:600, color:COLORS.info, fontFamily: "var(--font-mono)" }}>{rr.toFixed(2)}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius: 'var(--radius-md)', background:'rgba(255,255,255,0.02)', border:`1px solid ${COLORS.border}` }}>
                      <Shield size={13} color={COLORS.hold} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{t('maxSlippage') ?? 'Slippage'}</div>
                        <span style={{ fontSize: 13, fontWeight:600, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{(brief.strictRules.maxSlippage*100).toFixed(2)}%</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius: 'var(--radius-md)', background:'rgba(255,255,255,0.02)', border:`1px solid ${COLORS.border}` }}>
                      <Timer size={13} color={isExpired?COLORS.sell:remainingMs<3600000?COLORS.hold:COLORS.textSecondary} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{t('expires')}</div>
                        <span style={{ fontSize: 13, fontWeight:600, color:isExpired?COLORS.sell:remainingMs<3600000?COLORS.hold:COLORS.textSecondary, fontFamily: "var(--font-mono)" }}>{isExpired?t('expired'):formatCountdown(remainingMs, loc)}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius: 'var(--radius-md)', background:'rgba(255,255,255,0.02)', border:`1px solid ${COLORS.border}` }}>
                      <Target size={13} color={COLORS.sell} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{t('slDistance')}</div>
                        <span style={{ fontSize: 13, fontWeight:600, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{slPctStr}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius: 'var(--radius-md)', background:'rgba(255,255,255,0.02)', border:`1px solid ${COLORS.border}` }}>
                      <Target size={13} color={COLORS.buy} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight:600, textTransform:'uppercase', color:COLORS.textMuted }}>{t('tpDistance')}</div>
                        <span style={{ fontSize: 13, fontWeight:600, color:COLORS.textPrimary, fontFamily: "var(--font-mono)" }}>{tpPctStr}</span>
                      </div>
                    </div>
                  </div>
                  {/* AI analysis */}
                  <div style={{ padding:'14px', borderRadius: 'var(--radius-lg)', background:hexToRgba(COLORS.council,0.05), border:`1px solid ${hexToRgba(COLORS.council,0.15)}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                      <div style={{ width:24, height:24, borderRadius: 'var(--radius-md)', background:COLORS.gradientCouncil, display:'flex', alignItems:'center', justifyContent:'center', color:'#0B0E14' }}>
                        <Sparkles size={12} strokeWidth={2.5} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:COLORS.council }}>{t('whyThisSignal')}</span>
                      <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${hexToRgba(COLORS.council,0.3)}, transparent)` }} />
                    </div>
                    <FormattedText text={brief.analysisSummary ?? ''} maxLength={0} collapsible={false} dir={loc==='ar'?'rtl':'ltr'} fontSize={13} accent={dc} placeholder={t('noAnalysis')} />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
      </GlassCard>
    </motion.div>
  )
}
