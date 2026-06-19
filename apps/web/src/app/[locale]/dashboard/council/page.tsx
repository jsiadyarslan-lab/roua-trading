'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Loader2,
  Clock, Activity, ChevronDown, ChevronUp, Zap, AlertTriangle,
  CheckCircle2, XCircle, Timer, Target, Shield, BarChart3,
  Play, Sparkles, Cpu, FileText, Award, Flame, Radio,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface TradingBrief {
  id: string; pair: string; direction: 'BUY' | 'SELL'
  entryPrice: number; stopLoss: number; takeProfit: number
  confidence: number; timeframe: string
  issuedAt: string; expiresAt: string; isActive: boolean
  strictRules: { maxEntryPrice?: number; minEntryPrice?: number; maxSlippage: number }
  lastReviewedAt: string
  reviewStatus: 'ACTIVE' | 'MODIFIED' | 'CANCELLED' | 'EXECUTED'
  analysisSummary?: string
}
interface CouncilVote { role: string; model: string; vote: 'BUY'|'SELL'|'HOLD'; confidence: number; reason: string }
interface CouncilResult {
  consensusScore: number; recommendation: 'BUY'|'SELL'|'HOLD'
  analyses: CouncilVote[]; masterStrategy: string
  source?: string; isFallback?: boolean
}
interface CouncilSession {
  timestamp: string; pairsAnalyzed: number; briefsIssued: number
  briefsModified: number; briefsCancelled: number; briefsExecuted: number; durationMs: number
}
type Tab = 'active' | 'history' | 'consensus' | 'performance'

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════

const C = {
  bg: '#080B12',
  surface: 'rgba(255,255,255,0.025)',
  surface2: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.07)',
  borderGlow: 'rgba(168,85,247,0.2)',
  text: '#F1F5F9', text2: '#94A3B8', text3: '#64748B', dim: '#475569',
  green: '#10B981', red: '#EF4444', amber: '#F59E0B',
  cyan: '#06B6D4', purple: '#A855F7', blue: '#3B82F6',
  glass: 'rgba(255,255,255,0.03)',
  glassBorder: '1px solid rgba(255,255,255,0.06)',
}
const dc: Record<string,string> = { BUY: C.green, SELL: C.red, HOLD: C.amber }
const di: Record<string,string> = { BUY: '▲', SELL: '▼', HOLD: '◆' }
const dl: Record<string,string> = { BUY: 'شراء', SELL: 'بيع', HOLD: 'انتظار' }
const tc: Record<string,string> = { M1: C.red, M5: C.amber, M15: C.cyan, M30: C.blue, H1: C.purple, H4: C.purple, D1: C.green, W1: C.green }
const sc: Record<string,string> = { ACTIVE: C.green, MODIFIED: C.amber, CANCELLED: C.red, EXECUTED: C.cyan }
const sl: Record<string,string> = { ACTIVE: 'نشط', MODIFIED: 'مُعدّل', CANCELLED: 'ملغى', EXECUTED: 'منفّذ' }

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function ago(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d/60000)
  if (m < 60) return `${m}د`
  const h = Math.floor(m/60)
  if (h < 24) return `${h}س`
  return `${Math.floor(h/24)}ي`
}
function left(iso: string): string {
  const d = new Date(iso).getTime() - Date.now()
  if (d <= 0) return 'منتهي'
  const m = Math.floor(d/60000)
  if (m < 60) return `${m}د متبقية`
  return `${Math.floor(m/60)}س ${m%60}د`
}
function fp(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US',{maximumFractionDigits:2})
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(6)
}
function fd(ms: number): string {
  const s = Math.round(ms/1000)
  return s < 60 ? `${s}ث` : `${Math.floor(s/60)}د ${s%60}ث`
}

// ═══════════════════════════════════════════════════════════════
// COUNCIL SIGIL — Custom SVG logo (6 orbiting nodes + pulsing nucleus)
// ═══════════════════════════════════════════════════════════════

function CouncilSigil({ size = 52 }: { size?: number }) {
  const nodes = 6
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <defs>
          <linearGradient id="sigilGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={C.purple} stopOpacity="0.9" />
            <stop offset="100%" stopColor={C.cyan} stopOpacity="0.6" />
          </linearGradient>
          <radialGradient id="nucleusGrad">
            <stop offset="0%" stopColor={C.purple} stopOpacity="0.8" />
            <stop offset="100%" stopColor={C.purple} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Outer ring */}
        <circle cx="50" cy="50" r="44" fill="none" stroke="url(#sigilGrad)" strokeWidth="1.5" opacity="0.3" />
        {/* Inner ring */}
        <circle cx="50" cy="50" r="32" fill="none" stroke="url(#sigilGrad)" strokeWidth="1" opacity="0.2" />
        {/* Nucleus glow */}
        <circle cx="50" cy="50" r="20" fill="url(#nucleusGrad)" />
        {/* Pulsing nucleus */}
        <motion.circle
          cx="50" cy="50" r="6" fill={C.purple}
          animate={{ r: [5, 7, 5], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Orbiting nodes */}
        {Array.from({ length: nodes }).map((_, i) => {
          const angle = (i / nodes) * Math.PI * 2 - Math.PI / 2
          const x = 50 + Math.cos(angle) * 38
          const y = 50 + Math.sin(angle) * 38
          return (
            <motion.circle
              key={i}
              cx={x} cy={y} r="3"
              fill={i % 2 === 0 ? C.purple : C.cyan}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          )
        })}
        {/* Connection lines */}
        {Array.from({ length: nodes }).map((_, i) => {
          const angle = (i / nodes) * Math.PI * 2 - Math.PI / 2
          const x = 50 + Math.cos(angle) * 38
          const y = 50 + Math.sin(angle) * 38
          return <line key={i} x1="50" y1="50" x2={x} y2={y} stroke="url(#sigilGrad)" strokeWidth="0.5" opacity="0.15" />
        })}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AMBIENT BACKGROUND — Radial glows + grid overlay
// ═══════════════════════════════════════════════════════════════

function AmbientBackground() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
    }}>
      {/* Top-left purple glow */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: '60%', height: '60%',
        background: `radial-gradient(circle, ${C.purple}08 0%, transparent 60%)`,
      }} />
      {/* Bottom-right cyan glow */}
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%',
        width: '50%', height: '50%',
        background: `radial-gradient(circle, ${C.cyan}06 0%, transparent 60%)`,
      }} />
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONSENSUS RING — Animated SVG with glow halo
// ═══════════════════════════════════════════════════════════════

function ConsensusRing({ score, color, size = 140 }: { score: number; color: string; size?: number }) {
  const r = (size - 20) / 2
  const circ = 2 * Math.PI * r
  const off = circ - (score / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* Glow halo */}
      <div style={{
        position: 'absolute', inset: -10, borderRadius: '50%',
        background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
      }} />
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'relative' }}>
        <defs>
          <linearGradient id={`ringGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
        <motion.circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={`url(#ringGrad-${color.replace('#','')})`} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: off }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 12px ${color}50)` }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring' }}
          style={{ fontSize: size * 0.26, fontWeight: 900, color, letterSpacing: '-1px' }}
        >{score}%</motion.span>
        <span style={{ fontSize: size * 0.08, color: C.text3, fontWeight: 600, marginTop: 2 }}>ثقة المجلس</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LIVE DOT — Pulsing indicator
// ═══════════════════════════════════════════════════════════════

function LiveDot({ color = C.green, size = 8 }: { color?: string; size?: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <motion.div
        animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// GLASS CARD — Reusable glassmorphism container
// ═══════════════════════════════════════════════════════════════

function GlassCard({ children, glow, style, onClick }: {
  children: React.ReactNode; glow?: string; style?: React.CSSProperties; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.glass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: C.glassBorder,
        borderRadius: 16,
        boxShadow: glow
          ? `0 0 40px ${glow}08, 0 8px 32px rgba(0,0,0,0.3)`
          : '0 4px 24px rgba(0,0,0,0.2)',
        transition: 'all 0.3s ease',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function CouncilPage() {
  const t = useTranslations('dashboard')
  const locale = useLocale()

  const [activeBriefs, setActiveBriefs] = useState<TradingBrief[]>([])
  const [historyBriefs, setHistoryBriefs] = useState<TradingBrief[]>([])
  const [lastSession, setLastSession] = useState<CouncilSession | null>(null)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null)
  const [councilLoading, setCouncilLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT')
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [filterDir, setFilterDir] = useState<'ALL'|'BUY'|'SELL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [offline, setOffline] = useState(false)

  const SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','ADA/USDT','DOGE/USDT']

  // Fetchers
  const fetchActive = useCallback(async () => {
    try {
      const r = await fetch('/api/strategic-council/briefs/active')
      if (!r.ok) { setOffline(true); return }
      setOffline(false); setActiveBriefs((await r.json()).data || [])
    } catch { setOffline(true) }
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
      const r = await fetch('/api/ai/consensus', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ symbol: selectedSymbol, language: locale }),
        signal: AbortSignal.timeout(45000),
      })
      if (r.ok) { const d = await r.json(); if (d.success && d.data) setCouncilResult(d.data) }
    } catch {}
    setCouncilLoading(false)
  }, [selectedSymbol, locale])
  const trigger = useCallback(async () => {
    setTriggerLoading(true)
    try {
      const r = await fetch('/api/strategic-council/trigger', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ pairs:['BTC/USDT','ETH/USDT','SOL/USDT'], language: locale }),
      })
      const d = await r.json(); if (d.data?.status === 'processing') setSessionRunning(true)
    } catch {}
    setTriggerLoading(false)
  }, [locale])

  // Effects
  useEffect(() => {
    Promise.all([fetchActive(), fetchSession(), fetchStatus()]).finally(() => setLoading(false))
    fetchHistory()
  }, [])
  useEffect(() => {
    const iv = setInterval(() => { fetchActive(); fetchSession(); fetchStatus() }, 15000)
    return () => clearInterval(iv)
  }, [fetchActive, fetchSession, fetchStatus])
  useEffect(() => {
    if (!sessionRunning) return
    const iv = setInterval(() => { fetchStatus(); fetchActive(); fetchSession() }, 5000)
    return () => clearInterval(iv)
  }, [sessionRunning, fetchStatus, fetchActive, fetchSession])

  const fActive = useMemo(() => filterDir==='ALL' ? activeBriefs : activeBriefs.filter(b=>b.direction===filterDir), [activeBriefs, filterDir])
  const fHistory = useMemo(() => filterDir==='ALL' ? historyBriefs : historyBriefs.filter(b=>b.direction===filterDir), [historyBriefs, filterDir])
  const perf = useMemo(() => ({
    total: historyBriefs.length,
    executed: historyBriefs.filter(b=>b.reviewStatus==='EXECUTED').length,
    cancelled: historyBriefs.filter(b=>b.reviewStatus==='CANCELLED').length,
    buy: historyBriefs.filter(b=>b.direction==='BUY').length,
    sell: historyBriefs.filter(b=>b.direction==='SELL').length,
  }), [historyBriefs])

  if (loading) return (
    <SubPageLayout title="المجلس الاستراتيجي" icon="🏛️">
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:400 }}>
        <CouncilSigil size={64} />
      </div>
    </SubPageLayout>
  )

  return (
    <SubPageLayout title="المجلس الاستراتيجي" icon="🏛️">
      <AmbientBackground />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px', position: 'relative', zIndex: 1 }}>

        {/* ═══ HERO HEADER ═══ */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:24 }}
        >
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <GlassCard glow={C.purple} style={{ padding: 8 }}>
              <CouncilSigil size={52} />
            </GlassCard>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>
                المجلس الاستراتيجي
              </div>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 4, display:'flex', alignItems:'center', gap:8 }}>
                <LiveDot color={sessionRunning ? C.amber : C.green} size={7} />
                {activeBriefs.length} بريف نشط
                {lastSession && ` · آخر جلسة ${ago(lastSession.timestamp)}`}
                {sessionRunning && ' · جاري التحليل...'}
              </div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={trigger}
            disabled={triggerLoading || sessionRunning}
            style={{
              padding:'12px 24px', borderRadius:12, fontSize:14, fontWeight:700,
              background: sessionRunning
                ? `linear-gradient(135deg, ${C.amber}15, ${C.amber}08)`
                : `linear-gradient(135deg, ${C.purple}20, ${C.cyan}12)`,
              border:`1px solid ${sessionRunning ? C.amber+'40' : C.purple+'30'}`,
              color: sessionRunning ? C.amber : C.purple,
              cursor: triggerLoading||sessionRunning ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', gap:10,
              backdropFilter:'blur(20px)',
              boxShadow:`0 0 24px ${sessionRunning ? C.amber : C.purple}15`,
            }}
          >
            {triggerLoading||sessionRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {sessionRunning ? 'جاري التحليل...' : 'تشغيل جلسة'}
          </motion.button>
        </motion.div>

        {/* Offline */}
        {offline && (
          <GlassCard style={{ padding:'12px 16px', marginBottom:16, borderColor: C.amber+'30' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <AlertTriangle size={16} style={{ color: C.amber }} />
              <span style={{ fontSize:13, color: C.amber }}>الخادم غير متاح — يتم المحاولة تلقائياً</span>
            </div>
          </GlassCard>
        )}

        {/* Session Stats */}
        {lastSession && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10, marginBottom:20 }}>
            {[
              { l:'الأزواج', v:String(lastSession.pairsAnalyzed), c:C.cyan, i:<Activity size={13}/> },
              { l:'جديدة', v:String(lastSession.briefsIssued), c:C.green, i:<Zap size={13}/> },
              { l:'مُعدّلة', v:String(lastSession.briefsModified), c:C.amber, i:<RefreshCw size={13}/> },
              { l:'ملغاة', v:String(lastSession.briefsCancelled), c:C.red, i:<XCircle size={13}/> },
              { l:'منفّذة', v:String(lastSession.briefsExecuted||0), c:C.purple, i:<CheckCircle2 size={13}/> },
              { l:'المدة', v:fd(lastSession.durationMs), c:C.text2, i:<Timer size={13}/> },
            ].map((s,i) => (
              <motion.div
                key={i}
                initial={{ opacity:0, y:10 }}
                animate={{ opacity:1, y:0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard style={{ padding:'12px', textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginBottom:4 }}>
                    <span style={{ color:s.c }}>{s.i}</span>
                    <span style={{ fontSize:12, color:C.text3, fontWeight:600 }}>{s.l}</span>
                  </div>
                  <div style={{ fontSize:16, color:s.c, fontWeight:800 }}>{s.v}</div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}

        {/* ═══ TABS ═══ */}
        <div style={{ display:'flex', gap:4, marginBottom:20, padding:4, background:C.bg, borderRadius:14, border:C.glassBorder }}>
          {([
            ['active','البريفات النشطة',activeBriefs.length],
            ['history','السجل',historyBriefs.length],
            ['consensus','إجماع المجلس',null],
            ['performance','الأداء',null],
          ] as [Tab,string,number|null][]).map(([k,l,c]) => (
            <button key={k} onClick={()=>{ setTab(k); if(k==='history'&&historyBriefs.length===0) fetchHistory(); if(k==='consensus'&&!councilResult) fetchCouncil() }} style={{
              flex:1, padding:'12px 16px', borderRadius:10, fontSize:13, fontWeight:700,
              background: tab===k ? `${C.purple}12` : 'transparent',
              border: tab===k ? `1px solid ${C.purple}30` : '1px solid transparent',
              color: tab===k ? C.purple : C.text3,
              cursor:'pointer', transition:'all 0.2s',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
              {l}
              {c!==null && c>0 && (
                <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, background:tab===k?`${C.purple}20`:`${C.text3}15`, color:tab===k?C.purple:C.text3 }}>{c}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} transition={{ duration:0.2 }}>

          {/* ── ACTIVE ── */}
          {tab==='active' && (
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                {(['ALL','BUY','SELL'] as const).map(d => (
                  <button key={d} onClick={()=>setFilterDir(d)} style={{
                    padding:'8px 18px', borderRadius:8, fontSize:12, fontWeight:700,
                    background: filterDir===d ? `${dc[d]||C.cyan}15` : C.glass,
                    border:`1px solid ${filterDir===d ? (dc[d]||C.cyan)+'30' : C.border}`,
                    color: filterDir===d ? (dc[d]||C.cyan) : C.text3,
                    cursor:'pointer', transition:'all 0.2s',
                  }}>{d==='ALL'?'الكل':d==='BUY'?'▲ شراء':'▼ بيع'}</button>
                ))}
              </div>
              {fActive.length===0 ? <Empty/> : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {fActive.map((b,i) => (
                    <motion.div key={b.id} initial={{ opacity:0, y:15 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.05 }}>
                      <BriefCard brief={b} expanded={expandedBrief===b.id} onToggle={()=>setExpandedBrief(expandedBrief===b.id?null:b.id)} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab==='history' && (
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                {(['ALL','BUY','SELL'] as const).map(d => (
                  <button key={d} onClick={()=>setFilterDir(d)} style={{
                    padding:'8px 18px', borderRadius:8, fontSize:12, fontWeight:700,
                    background: filterDir===d ? `${dc[d]||C.cyan}15` : C.glass,
                    border:`1px solid ${filterDir===d ? (dc[d]||C.cyan)+'30' : C.border}`,
                    color: filterDir===d ? (dc[d]||C.cyan) : C.text3,
                    cursor:'pointer',
                  }}>{d==='ALL'?'الكل':d==='BUY'?'▲ شراء':'▼ بيع'}</button>
                ))}
              </div>
              {fHistory.length===0 ? <Empty text="لا يوجد سجل بعد"/> : (
                <GlassCard style={{ overflow:'hidden' }}>
                  {/* Bloomberg-style table */}
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                          {['الزوج','الاتجاه','TF','الدخول','SL','TP','ثقة','الحالة','الوقت',''].map((h,i) => (
                            <th key={i} style={{ padding:'12px 14px', textAlign:i>2&&i<7?'left':'right', fontSize:11, color:C.text3, fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fHistory.slice(0,50).map(b => (
                          <tr key={b.id} style={{ borderBottom:`1px solid ${C.border}`, transition:'background 0.2s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=C.surface2}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
                          >
                            <td style={{ padding:'10px 14px', fontFamily:'monospace', fontWeight:700, color:C.text }}>{b.pair}</td>
                            <td style={{ padding:'10px 14px' }}>
                              <span style={{ padding:'2px 8px', borderRadius:5, fontSize:11, fontWeight:800, background:`${dc[b.direction]}18`, color:dc[b.direction] }}>{di[b.direction]} {dl[b.direction]}</span>
                            </td>
                            <td style={{ padding:'10px 14px' }}>
                              <span style={{ padding:'2px 6px', borderRadius:4, fontSize:10, fontWeight:700, background:`${tc[b.timeframe]||C.dim}15`, color:tc[b.timeframe]||C.dim }}>{b.timeframe}</span>
                            </td>
                            <td style={{ padding:'10px 14px', fontFamily:'monospace', color:C.text2, fontSize:12 }}>{fp(b.entryPrice)}</td>
                            <td style={{ padding:'10px 14px', fontFamily:'monospace', color:C.red, fontSize:12 }}>{fp(b.stopLoss)}</td>
                            <td style={{ padding:'10px 14px', fontFamily:'monospace', color:C.green, fontSize:12 }}>{fp(b.takeProfit)}</td>
                            <td style={{ padding:'10px 14px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <div style={{ width:40, height:4, background:`${C.dim}20`, borderRadius:2, overflow:'hidden' }}>
                                  <div style={{ width:`${b.confidence}%`, height:'100%', background:b.confidence>=80?C.green:b.confidence>=60?C.amber:C.red }} />
                                </div>
                                <span style={{ fontSize:12, fontWeight:700, color:C.text2 }}>{b.confidence}%</span>
                              </div>
                            </td>
                            <td style={{ padding:'10px 14px' }}>
                              <span style={{ padding:'2px 8px', borderRadius:5, fontSize:11, fontWeight:700, background:`${sc[b.reviewStatus]}15`, color:sc[b.reviewStatus] }}>{sl[b.reviewStatus]}</span>
                            </td>
                            <td style={{ padding:'10px 14px', fontSize:11, color:C.text3 }}>{ago(b.issuedAt)}</td>
                            <td style={{ padding:'10px 14px' }}>
                              {b.analysisSummary && (
                                <button onClick={()=>setExpandedBrief(expandedBrief===b.id?null:b.id)} style={{ background:'none', border:'none', cursor:'pointer', color:C.purple }}>
                                  {expandedBrief===b.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {expandedBrief && fHistory.find(b=>b.id===expandedBrief)?.analysisSummary && (
                          <tr>
                            <td colSpan={10} style={{ padding:'14px 18px', background:`${C.purple}04` }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                                <Sparkles size={13} style={{ color:C.purple }} />
                                <span style={{ fontSize:12, fontWeight:700, color:C.purple }}>لماذا هذه الإشارة؟</span>
                              </div>
                              <div style={{ fontSize:13, color:C.text2, lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                                {fHistory.find(b=>b.id===expandedBrief)?.analysisSummary}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}
            </div>
          )}

          {/* ── CONSENSUS ── */}
          {tab==='consensus' && (
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
                {SYMBOLS.map(sym => (
                  <button key={sym} onClick={()=>{ setSelectedSymbol(sym); setCouncilResult(null) }} style={{
                    padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700, fontFamily:'monospace',
                    background: selectedSymbol===sym ? `${C.purple}12` : C.glass,
                    border:`1px solid ${selectedSymbol===sym ? C.purple+'30' : C.border}`,
                    color: selectedSymbol===sym ? C.purple : C.text3,
                    cursor:'pointer', transition:'all 0.2s',
                  }}>{sym}</button>
                ))}
              </div>

              {!councilResult && !councilLoading && (
                <div style={{ textAlign:'center', padding:60 }}>
                  <motion.button
                    whileHover={{ scale:1.05 }}
                    whileTap={{ scale:0.95 }}
                    onClick={fetchCouncil}
                    style={{
                      padding:'16px 36px', borderRadius:14, fontSize:16, fontWeight:700,
                      background:`linear-gradient(135deg, ${C.purple}20, ${C.cyan}12)`,
                      border:`1px solid ${C.purple}30`,
                      color:C.purple, cursor:'pointer',
                      display:'inline-flex', alignItems:'center', gap:12,
                      boxShadow:`0 0 40px ${C.purple}15`,
                      backdropFilter:'blur(20px)',
                    }}
                  >
                    <Brain size={22} /> تحليل {selectedSymbol} بالمجلس
                  </motion.button>
                </div>
              )}

              {councilLoading && (
                <div style={{ textAlign:'center', padding:60 }}>
                  <CouncilSigil size={56} />
                  <div style={{ marginTop:16, fontSize:14, color:C.text3 }}>المجلس يحلل {selectedSymbol}...</div>
                </div>
              )}

              {councilResult && <ConsensusPanel result={councilResult} symbol={selectedSymbol} onRefresh={fetchCouncil} />}
            </div>
          )}

          {/* ── PERFORMANCE ── */}
          {tab==='performance' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:20 }}>
                {[
                  { l:'إجمالي البريفات', v:perf.total, c:C.cyan, i:<BarChart3 size={18}/> },
                  { l:'منفّذة', v:perf.executed, c:C.green, i:<CheckCircle2 size={18}/> },
                  { l:'ملغاة', v:perf.cancelled, c:C.red, i:<XCircle size={18}/> },
                  { l:'شراء', v:perf.buy, c:C.green, i:<TrendingUp size={18}/> },
                  { l:'بيع', v:perf.sell, c:C.red, i:<TrendingDown size={18}/> },
                ].map((s,i) => (
                  <motion.div key={i} initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} transition={{ delay:i*0.08 }}>
                    <GlassCard style={{ padding:20, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <div style={{ color:s.c }}>{s.i}</div>
                      <div style={{ fontSize:28, fontWeight:900, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:12, color:C.text3 }}>{s.l}</div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>

              {historyBriefs.length > 0 && (
                <GlassCard style={{ padding:20 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.text2, marginBottom:16 }}>توزيع حالات البريفات</div>
                  <div style={{ display:'flex', gap:3, height:32, borderRadius:8, overflow:'hidden' }}>
                    {(['EXECUTED','ACTIVE','MODIFIED','CANCELLED'] as const).map(st => {
                      const count = historyBriefs.filter(b=>b.reviewStatus===st).length
                      const pct = (count/historyBriefs.length)*100
                      if (pct===0) return null
                      return (
                        <motion.div
                          key={st}
                          initial={{ width:0 }}
                          animate={{ width:`${pct}%` }}
                          transition={{ duration:0.8, ease:'easeOut' }}
                          style={{
                            background:`${sc[st]}50`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:12, fontWeight:700, color:'#fff',
                          }}
                          title={`${sl[st]}: ${count} (${pct.toFixed(0)}%)`}
                        >{pct>8?`${count}`:''}</motion.div>
                      )
                    })}
                  </div>
                  <div style={{ display:'flex', gap:20, marginTop:14, flexWrap:'wrap' }}>
                    {(['EXECUTED','ACTIVE','MODIFIED','CANCELLED'] as const).map(st => (
                      <div key={st} style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:12, height:12, borderRadius:3, background:sc[st] }} />
                        <span style={{ fontSize:12, color:C.text3 }}>{sl[st]}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
              {historyBriefs.length===0 && <Empty text="لا توجد بيانات أداء بعد"/>}
            </div>
          )}
          </motion.div>
        </AnimatePresence>
      </div>
    </SubPageLayout>
  )
}

// ═══════════════════════════════════════════════════════════════
// BRIEF CARD — Premium "trading document" style
// ═══════════════════════════════════════════════════════════════

function BriefCard({ brief, expanded, onToggle }: {
  brief: TradingBrief; expanded: boolean; onToggle: () => void
}) {
  const col = dc[brief.direction]
  const slD = brief.direction==='BUY' ? ((brief.entryPrice-brief.stopLoss)/brief.entryPrice)*100 : ((brief.stopLoss-brief.entryPrice)/brief.entryPrice)*100
  const tpD = brief.direction==='BUY' ? ((brief.takeProfit-brief.entryPrice)/brief.entryPrice)*100 : ((brief.entryPrice-brief.takeProfit)/brief.entryPrice)*100
  const rr = slD>0 ? (tpD/slD).toFixed(1) : '—'

  return (
    <GlassCard glow={col} style={{ overflow:'hidden' }} onClick={onToggle}>
      {/* Header Row */}
      <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
        <div style={{
          padding:'5px 14px', borderRadius:8, fontSize:13, fontWeight:800,
          background:`${col}18`, color:col, minWidth:48, textAlign:'center',
          boxShadow:`0 0 12px ${col}20`,
        }}>{di[brief.direction]} {dl[brief.direction]}</div>

        <span style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:'monospace' }}>{brief.pair}</span>

        <span style={{ padding:'3px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:`${tc[brief.timeframe]||C.dim}15`, color:tc[brief.timeframe]||C.dim }}>{brief.timeframe}</span>

        {brief.reviewStatus!=='ACTIVE' && (
          <span style={{ padding:'3px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:`${sc[brief.reviewStatus]}15`, color:sc[brief.reviewStatus] }}>{sl[brief.reviewStatus]}</span>
        )}

        <div style={{ flex:1 }} />

        {/* Confidence */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:64, height:5, background:`${C.text3}20`, borderRadius:3, overflow:'hidden' }}>
            <motion.div initial={{ width:0 }} animate={{ width:`${brief.confidence}%` }} transition={{ duration:0.8 }}
              style={{ height:'100%', background: brief.confidence>=80?C.green:brief.confidence>=60?C.amber:C.red, borderRadius:3 }} />
          </div>
          <span style={{ fontSize:14, fontWeight:800, color:brief.confidence>=80?C.green:brief.confidence>=60?C.amber:C.red, minWidth:34 }}>{brief.confidence}%</span>
        </div>

        <span style={{ fontSize:12, color:C.text3 }}>{ago(brief.issuedAt)}</span>
        {expanded ? <ChevronUp size={16} style={{ color:C.text3 }} /> : <ChevronDown size={16} style={{ color:C.text3 }} />}
      </div>

      {/* ═══ "WHY THIS SIGNAL?" — Always visible, premium styled ═══ */}
      {brief.analysisSummary && (
        <div style={{ padding:'0 20px 16px' }}>
          <div style={{
            background:`${C.purple}06`, borderRadius:12, padding:'14px 16px',
            border:`1px solid ${C.purple}12`,
            backdropFilter:'blur(10px)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div style={{
                width:24, height:24, borderRadius:6,
                background:`${C.purple}15`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <Sparkles size={13} style={{ color:C.purple }} />
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:C.purple }}>لماذا هذه الإشارة؟</span>
              <span style={{ fontSize:11, color:C.text3, marginRight:8 }}>— تحليل المجلس الاستراتيجي</span>
            </div>
            <div style={{
              fontSize:13, color:C.text2, lineHeight:1.8,
              maxHeight: expanded ? 'none' : 72, overflow:'hidden',
              whiteSpace:'pre-wrap',
            }}>
              {brief.analysisSummary}
            </div>
            {!expanded && brief.analysisSummary.length > 140 && (
              <div onClick={onToggle} style={{
                fontSize:12, color:C.purple, cursor:'pointer', marginTop:8, fontWeight:600,
                display:'inline-flex', alignItems:'center', gap:4,
              }}>عرض التحليل الكامل <ChevronDown size={12} /></div>
            )}
          </div>
        </div>
      )}

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }} style={{ overflow:'hidden' }}>
            <div style={{ padding:'0 20px 18px', borderTop:`1px solid ${C.border}`, marginTop:4, paddingTop:16, display:'flex', flexDirection:'column', gap:14 }}>
              {/* Price Grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
                {[
                  { l:'الدخول', v:fp(brief.entryPrice), c:C.text, i:<Target size={13}/> },
                  { l:'وقف الخسارة', v:fp(brief.stopLoss), c:C.red, s:`${slD.toFixed(1)}%`, i:<Shield size={13}/> },
                  { l:'جني الأرباح', v:fp(brief.takeProfit), c:C.green, s:`${tpD.toFixed(1)}%`, i:<Award size={13}/> },
                  { l:'عائد/مخاطرة', v:`1:${rr}`, c:C.cyan, i:<BarChart3 size={13}/> },
                ].map((p,i) => (
                  <div key={i} style={{ background:`${C.text3}06`, borderRadius:10, padding:'12px', border:C.glassBorder }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:6 }}>
                      <span style={{ color:p.c }}>{p.i}</span>
                      <span style={{ fontSize:12, color:C.text3, fontWeight:600 }}>{p.l}</span>
                    </div>
                    <div style={{ fontSize:16, fontWeight:800, color:p.c, fontFamily:'monospace' }}>{p.v}</div>
                    {p.s && <div style={{ fontSize:11, color:C.text3, marginTop:4 }}>{p.s}</div>}
                  </div>
                ))}
              </div>
              {/* Time Info */}
              <div style={{ display:'flex', gap:24, fontSize:12, color:C.text3, flexWrap:'wrap' }}>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><Clock size={12}/> أُصدر: {ago(brief.issuedAt)}</span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><Timer size={12}/> {left(brief.expiresAt)}</span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><RefreshCw size={12}/> آخر مراجعة: {ago(brief.lastReviewedAt)}</span>
              </div>
              {/* Strict Rules */}
              {brief.strictRules && (
                <div style={{ background:`${C.text3}06`, borderRadius:8, padding:'10px 14px', display:'flex', gap:20, fontSize:12, color:C.text3, flexWrap:'wrap' }}>
                  {brief.strictRules.maxEntryPrice && <span>أقصى دخول: <b style={{color:C.text}}>{fp(brief.strictRules.maxEntryPrice)}</b></span>}
                  {brief.strictRules.minEntryPrice && <span>أدنى دخول: <b style={{color:C.text}}>{fp(brief.strictRules.minEntryPrice)}</b></span>}
                  <span>انزلاق مسموح: <b style={{color:C.text}}>{(brief.strictRules.maxSlippage*100).toFixed(1)}%</b></span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// CONSENSUS PANEL — Hero verdict + vote distribution + reasoning
// ═══════════════════════════════════════════════════════════════

function ConsensusPanel({ result, symbol, onRefresh }: {
  result: CouncilResult; symbol: string; onRefresh: () => void
}) {
  const col = dc[result.recommendation] || C.amber
  const label = result.consensusScore>=75
    ? (result.recommendation==='BUY'?'شراء قوي':result.recommendation==='SELL'?'بيع قوي':'انتظار')
    : (result.recommendation==='BUY'?'شراء':result.recommendation==='SELL'?'بيع':'انتظار')

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* ═══ Verdict Hero ═══ */}
      <GlassCard glow={col} style={{ padding:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:32, flexWrap:'wrap' }}>
          <ConsensusRing score={result.consensusScore} color={col} size={140} />
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:14, color:C.text3, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <Radio size={14} /> {symbol}
            </div>
            <motion.div
              initial={{ scale:0.8, opacity:0 }}
              animate={{ scale:1, opacity:1 }}
              transition={{ delay:0.3, type:'spring' }}
              style={{ fontSize:32, fontWeight:900, color:col, marginBottom:12 }}
            >{label}</motion.div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {result.isFallback && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:700, background:`${C.amber}15`, color:C.amber }}>
                  <AlertTriangle size={13} /> وضع احتياطي
                </span>
              )}
              {result.source==='nestjs' && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:700, background:`${C.green}15`, color:C.green }}>
                  <Cpu size={13} /> {result.analyses?.length||0} نماذج AI
                </span>
              )}
            </div>
          </div>
          <motion.button
            whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
            onClick={onRefresh}
            style={{ padding:'12px 20px', borderRadius:10, fontSize:13, fontWeight:700, background:`${C.purple}10`, border:`1px solid ${C.purple}30`, color:C.purple, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
          >
            <RefreshCw size={14} /> إعادة تحليل
          </motion.button>
        </div>
      </GlassCard>

      {/* ═══ Vote Distribution ═══ */}
      {result.analyses && result.analyses.length > 0 && (
        <GlassCard style={{ padding:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <Flame size={18} style={{ color:C.purple }} />
            <span style={{ fontSize:15, fontWeight:700, color:C.text }}>توزيع تصويت الأدوار ({result.analyses.length})</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {result.analyses.map((vote, i) => (
              <motion.div
                key={i}
                initial={{ opacity:0, x:-15 }}
                animate={{ opacity:1, x:0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ scale:1.01 }}
                style={{
                  display:'flex', alignItems:'center', gap:14,
                  padding:'12px 14px', borderRadius:10,
                  background: `${C.text3}06`,
                  borderLeft:`3px solid ${dc[vote.vote]||C.amber}`,
                }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{vote.role}</div>
                  <div style={{ fontSize:12, color:C.text3, marginTop:2 }}>{vote.model}</div>
                </div>
                <div style={{
                  padding:'4px 12px', borderRadius:6, fontSize:13, fontWeight:800,
                  background:`${dc[vote.vote]}18`, color:dc[vote.vote],
                  minWidth:60, textAlign:'center',
                }}>{di[vote.vote]} {dl[vote.vote]||vote.vote}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:90 }}>
                  <div style={{ width:55, height:5, background:`${C.text3}20`, borderRadius:3, overflow:'hidden' }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${vote.confidence}%` }} transition={{ delay:i*0.06+0.3, duration:0.5 }}
                      style={{ height:'100%', background: vote.confidence>=75?C.green:vote.confidence>=50?C.amber:C.red }} />
                  </div>
                  <span style={{ fontSize:13, fontWeight:700, color:C.text2 }}>{vote.confidence}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ═══ Master Strategy ═══ */}
      {result.masterStrategy && (
        <GlassCard style={{ padding:20, borderColor: `${C.cyan}15` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <FileText size={18} style={{ color:C.cyan }} />
            <span style={{ fontSize:15, fontWeight:700, color:C.cyan }}>الاستراتيجية الموحّدة</span>
          </div>
          <div style={{ fontSize:14, color:C.text2, lineHeight:1.8, whiteSpace:'pre-wrap' }}>{result.masterStrategy}</div>
        </GlassCard>
      )}

      {/* ═══ "WHY DID EACH ROLE VOTE?" — Per-role reasoning ═══ */}
      {result.analyses && result.analyses.some(a => a.reason && a.reason.length > 10) && (
        <GlassCard style={{ padding:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:`${C.purple}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Sparkles size={15} style={{ color:C.purple }} />
            </div>
            <span style={{ fontSize:15, fontWeight:700, color:C.purple }}>لماذا صوّت كل دور؟</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {result.analyses.filter(a => a.reason && a.reason.length > 10).map((vote, i) => (
              <motion.div key={i} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.08 }}
                style={{ padding:'12px 14px', borderRadius:10, background:`${C.text3}06`, border:C.glassBorder }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:700, background:`${dc[vote.vote]}15`, color:dc[vote.vote] }}>{vote.role}</span>
                  <span style={{ fontSize:12, color:C.text3 }}>{vote.model}</span>
                  <span style={{ fontSize:11, color:C.text3, marginRight:'auto' }}>{dl[vote.vote]} {vote.confidence}%</span>
                </div>
                <div style={{ fontSize:13, color:C.text2, lineHeight:1.7 }}>{vote.reason}</div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════

function Empty({ text = 'لا توجد بيانات' }: { text?: string }) {
  return (
    <div style={{ padding:60, textAlign:'center' }}>
      <CouncilSigil size={48} />
      <div style={{ fontSize:14, color:C.text3, marginTop:16 }}>{text}</div>
    </div>
  )
}
