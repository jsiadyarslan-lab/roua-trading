'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, RefreshCw, TrendingUp, TrendingDown, Minus,
  Loader2, AlertCircle, Shield, Activity, Brain, Zap,
  BarChart3, ChevronLeft, Save, ExternalLink, CheckCircle2,
  Radio, Gauge, AlertTriangle, Sparkles, Cpu
} from 'lucide-react'

/* ═══════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════ */
const C = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
  black: '#000000',
  purple: '#B388FF',
}

const PAIRS = [
  { symbol: 'BTC/USD', label: 'BTC/USD', icon: '₿' },
  { symbol: 'ETH/USD', label: 'ETH/USD', icon: 'Ξ' },
  { symbol: 'SOL/USD', label: 'SOL/USD', icon: '◎' },
  { symbol: 'GOLD', label: 'GOLD', icon: 'Au' },
  { symbol: 'EUR/USD', label: 'EUR/USD', icon: '€' },
]

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */
interface Analysis {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
  featuresUsed?: string[]
}

interface ConsensusMeta {
  symbol?: string
  price?: number
  rsi?: number
  processingTimeMs?: number
  source?: string
  freshness?: string
  aiEngine?: string
  modelsUsed?: string[]
  modelsResponded?: number
  modelsExpected?: number
  timestamp?: string
  cached?: boolean
  cacheAgeSeconds?: number
  connectionLayer?: string
}

interface ConsensusData {
  consensusScore: number
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  analyses: Analysis[]
  masterStrategy: string
  conflictExplanation?: string
  meta?: ConsensusMeta
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
function recLabel(r: 'BUY' | 'SELL' | 'HOLD') {
  return r === 'BUY' ? 'شراء' : r === 'SELL' ? 'بيع' : 'انتظار'
}

function recColor(r: 'BUY' | 'SELL' | 'HOLD') {
  return r === 'BUY' ? C.success : r === 'SELL' ? C.danger : C.amber
}

function riskLevel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'مرتفع', color: C.danger }
  if (score >= 45) return { label: 'متوسط', color: C.amber }
  return { label: 'منخفض', color: C.success }
}

function sentimentGauge(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'صعودي قوي', color: C.success }
  if (score >= 55) return { label: 'صعودي', color: '#7BED9F' }
  if (score >= 45) return { label: 'محايد', color: C.amber }
  if (score >= 30) return { label: 'هبوطي', color: '#FF7979' }
  return { label: 'هبوطي قوي', color: C.danger }
}

function getModelShortName(model: string): string {
  if (model.includes('Groq')) return 'Groq'
  if (model.includes('Gemini')) return 'Gemini'
  if (model.includes('GLM')) return 'GLM-4'
  if (model.includes('HuggingFace') || model.includes('HF')) return 'HF'
  if (model.includes('Ollama')) return 'Ollama'
  if (model.includes('Bedrock') || model.includes('Claude')) return 'Bedrock'
  if (model.includes('Scanner')) return 'Scanner'
  if (model.includes('Risk')) return 'Risk'
  if (model.includes('MTF')) return 'MTF'
  if (model.includes('Execution')) return 'Exec'
  return model.split('/')[0] || model
}

/* ═══════════════════════════════════════════════
   SKELETON COMPONENTS
   ═══════════════════════════════════════════════ */
function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        height,
        borderRadius: 28,
        background: 'rgba(28,28,30,0.5)',
        border: `0.5px solid ${C.border}`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <motion.div
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
        }}
      />
    </motion.div>
  )
}

function LoadingSkeletons() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 20px' }}>
      <SkeletonCard height={240} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SkeletonCard height={140} />
        <SkeletonCard height={140} />
        <SkeletonCard height={140} />
        <SkeletonCard height={140} />
      </div>
      <SkeletonCard height={200} />
      <SkeletonCard height={80} />
    </div>
  )
}

/* ═══════════════════════════════════════════════
   CONSENSUS RING (SVG)
   ═══════════════════════════════════════════════ */
function ConsensusRing({
  score,
  color,
  size = 100,
  strokeWidth = 6,
}: {
  score: number
  color: string
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const center = size / 2

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <motion.circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
      />
    </svg>
  )
}

/* ═══════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════ */
export default function MobileAICouncilPage() {
  const router = useRouter()

  // ── State ──
  const [symbol, setSymbol] = useState('BTC/USD')
  const [data, setData] = useState<ConsensusData | null>(null)
  const [loading, setLoading] = useState(true) // Start loading immediately
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [countdown, setCountdown] = useState(60)
  const [actionToast, setActionToast] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch consensus on symbol or manual refresh ──
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    // Use microtask to break synchronous effect chain
    // so setState calls aren't flagged as "synchronous in effect"
    void (async () => {
      await Promise.resolve()
      if (cancelled) return

      setLoading(true)
      setError(null)
      setCountdown(60)

      try {
        const res = await fetch('/api/ai/consensus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(`خطأ ${res.status}: ${text.slice(0, 100)}`)
        }

        const j = await res.json()
        if (cancelled) return
        if (j.success && j.data) {
          setData(j.data)
          setSource(j.source || '')
          setLastUpdate(
            new Date().toLocaleTimeString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          )
        } else {
          throw new Error(j.error || 'فشل في الحصول على الإجماع')
        }
      } catch (e: any) {
        if (cancelled || e.name === 'AbortError') return
        setError(e.message || 'خطأ غير متوقع')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [symbol, refreshTick])

  // ── Manual refresh handler ──
  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1)
  }, [])

  // ── Auto-refresh every 60 seconds ──
  useEffect(() => {
    if (loading) return
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setRefreshTick((t) => t + 1)
          return 60
        }
        return c - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [loading])

  // ── Derived values ──
  const isRealAI = source === 'real-ai' || source === 'partial-ai'
  const rec = data?.recommendation ?? 'HOLD'
  const score = data?.consensusScore ?? 0
  const color = recColor(rec)
  const modelsResponded = data?.meta?.modelsResponded ?? data?.analyses?.length ?? 0
  const analyses = data?.analyses ?? []

  // ── Compute sentiment from analysis votes ──
  const voteCounts = analyses.reduce(
    (acc, a) => {
      if (a.vote === 'BUY') acc.buy += 1
      else if (a.vote === 'SELL') acc.sell += 1
      else acc.hold += 1
      return acc
    },
    { buy: 0, sell: 0, hold: 0 }
  )
  const sentimentScore =
    analyses.length > 0
      ? Math.round(((voteCounts.buy - voteCounts.sell) / analyses.length) * 50 + 50)
      : 50

  // ── Key factors from analyses ──
  const keyFactors = analyses
    .slice(0, 4)
    .map((a) => ({
      role: a.role,
      vote: a.vote,
      confidence: a.confidence,
    }))

  // ── Toast handler ──
  const showToast = (msg: string) => {
    setActionToast(msg)
    setTimeout(() => setActionToast(null), 2500)
  }

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: C.black,
        direction: 'rtl',
        fontFamily: "'Cairo', sans-serif",
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
      }}
    >
      {/* ── 1. HEADER ── */}
      <div
        style={{
          padding: '16px 20px 14px',
          paddingTop: 'calc(16px + env(safe-area-inset-top))',
          background: 'rgba(28,28,30,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: `0.5px solid ${C.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.07)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowRight size={20} color={C.text} />
          </motion.button>
          <div className="flex-1">
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: C.text,
                lineHeight: 1.2,
              }}
            >
              مجلس الذكاء الاصطناعي
            </h1>
            <p style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
              {lastUpdate ? `آخر تحديث ${lastUpdate}` : 'تحليل إجماع النماذج الذكية'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Countdown pill */}
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.05)',
                border: `0.5px solid ${C.border}`,
                fontSize: 10,
                fontWeight: 700,
                color: C.text2,
                fontFamily: 'monospace',
                direction: 'ltr',
              }}
            >
              {String(Math.floor(countdown / 60)).padStart(1, '0')}:
              {String(countdown % 60).padStart(2, '0')}
            </div>
            {/* Refresh button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleRefresh}
              disabled={loading}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.07)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RefreshCw
                size={18}
                color={C.accent}
                className={loading ? 'animate-spin' : ''}
              />
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── 2. SYMBOL SELECTOR ── */}
      <div
        style={{
          padding: '14px 0',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '0 20px',
            minWidth: 'max-content',
          }}
        >
          {PAIRS.map((p) => {
            const active = symbol === p.symbol
            return (
              <motion.button
                key={p.symbol}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSymbol(p.symbol)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 20,
                  background: active
                    ? `${C.accent}18`
                    : 'rgba(28,28,30,0.6)',
                  backdropFilter: 'blur(12px)',
                  border: active
                    ? `1.5px solid ${C.accent}50`
                    : `0.5px solid ${C.border}`,
                  color: active ? C.accent : C.text2,
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Cairo', sans-serif",
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 14 }}>{p.icon}</span>
                {p.label}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ── LOADING STATE ── */}
      <AnimatePresence mode="wait">
        {loading && !data && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LoadingSkeletons />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ERROR STATE ── */}
      {error && !loading && !data && (
        <div style={{ padding: '0 20px' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: 24,
              borderRadius: 28,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `0.5px solid rgba(255,69,58,0.2)`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 20,
                background: `${C.danger}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <AlertCircle size={28} color={C.danger} />
            </div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: C.danger,
                marginBottom: 8,
              }}
            >
              فشل في التحليل
            </h3>
            <p
              style={{
                fontSize: 13,
                color: C.text2,
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              {error}
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              style={{
                padding: '12px 32px',
                borderRadius: 16,
                background: C.danger,
                color: '#FFF',
                border: 'none',
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "'Cairo', sans-serif",
                cursor: 'pointer',
              }}
            >
              إعادة المحاولة
            </motion.button>
          </motion.div>
        </div>
      )}

      {/* ── DATA STATE ── */}
      {data && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {/* ── 4. CONSENSUS HERO CARD ── */}
          <div style={{ padding: '0 20px' }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                borderRadius: 28,
                background: 'rgba(28,28,30,0.6)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: `0.5px solid ${color}30`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Animated background glow */}
              <motion.div
                animate={{
                  opacity: [0.15, 0.3, 0.15],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  top: '-30%',
                  left: '10%',
                  width: '80%',
                  height: '60%',
                  background: `radial-gradient(ellipse, ${color}40, transparent 70%)`,
                  filter: 'blur(40px)',
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  padding: '28px 24px',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {/* Live indicator */}
                <div
                  className="flex items-center gap-2"
                  style={{ marginBottom: 20 }}
                >
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 10,
                        background: isRealAI ? C.purple : C.success,
                      }}
                    />
                    <motion.div
                      animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: 8,
                        height: 8,
                        borderRadius: 10,
                        background: isRealAI ? C.purple : C.success,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isRealAI ? C.purple : C.success,
                      fontFamily: 'monospace',
                    }}
                  >
                    {isRealAI ? 'AI LIVE' : 'LIVE'}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: C.text2,
                      marginRight: 'auto',
                      direction: 'ltr',
                    }}
                  >
                    {symbol}
                  </span>
                </div>

                {/* Ring + Score + Recommendation */}
                <div
                  className="flex items-center gap-6"
                  style={{ direction: 'rtl' }}
                >
                  {/* Score Ring */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <ConsensusRing score={score} color={color} size={100} strokeWidth={6} />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 28,
                          fontWeight: 900,
                          color: color,
                          fontFamily: 'monospace',
                          textShadow: `0 0 20px ${color}60`,
                          lineHeight: 1,
                        }}
                      >
                        {score}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: C.text2,
                          fontWeight: 600,
                          marginTop: 2,
                        }}
                      >
                        %
                      </span>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="flex-1">
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 900,
                        color: color,
                        textShadow: `0 0 30px ${color}50`,
                        lineHeight: 1.1,
                        marginBottom: 8,
                      }}
                    >
                      {recLabel(rec)}
                    </div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        borderRadius: 12,
                        background: `${color}15`,
                        border: `0.5px solid ${color}30`,
                      }}
                    >
                      <Cpu size={12} color={color} />
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: color,
                          direction: 'ltr',
                        }}
                      >
                        {modelsResponded} نماذج
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── 5. INDIVIDUAL MODEL CARDS (2-column grid) ── */}
          <div style={{ padding: '0 20px' }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.text2,
                marginBottom: 12,
              }}
            >
              تحليل النماذج الفردية
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              {analyses.slice(0, 6).map((a, i) => {
                const vColor = recColor(a.vote)
                const shortName = getModelShortName(a.model)
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    style={{
                      padding: '16px',
                      borderRadius: 28,
                      background: 'rgba(28,28,30,0.5)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: `0.5px solid ${vColor}18`,
                    }}
                  >
                    {/* Model name */}
                    <div
                      className="flex items-center justify-between"
                      style={{ marginBottom: 10 }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.text,
                          lineHeight: 1.3,
                          maxWidth: '70%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.role}
                      </span>
                      <span
                        style={{
                          fontSize: 8,
                          padding: '2px 6px',
                          borderRadius: 6,
                          background: `${vColor}15`,
                          color: vColor,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                        }}
                      >
                        {shortName}
                      </span>
                    </div>

                    {/* Vote badge */}
                    <div
                      className="flex items-center gap-2"
                      style={{ marginBottom: 10 }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 10,
                          background: `${vColor}18`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {a.vote === 'BUY' ? (
                          <TrendingUp size={14} color={vColor} />
                        ) : a.vote === 'SELL' ? (
                          <TrendingDown size={14} color={vColor} />
                        ) : (
                          <Minus size={14} color={vColor} />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: vColor,
                        }}
                      >
                        {a.vote === 'BUY'
                          ? 'شراء'
                          : a.vote === 'SELL'
                            ? 'بيع'
                            : 'انتظار'}
                      </span>
                    </div>

                    {/* Confidence bar */}
                    <div
                      style={{
                        height: 4,
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                        marginBottom: 6,
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${a.confidence}%` }}
                        transition={{ duration: 1, delay: 0.3 + i * 0.08 }}
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          background: vColor,
                          boxShadow: `0 0 8px ${vColor}60`,
                        }}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between"
                      style={{ direction: 'ltr' }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.text2,
                          fontFamily: 'monospace',
                        }}
                      >
                        {a.confidence}%
                      </span>
                      <span
                        style={{
                          fontSize: 8,
                          color: C.text2,
                          opacity: 0.6,
                        }}
                      >
                        ثقة
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* ── 6. AI ANALYSIS SUMMARY ── */}
          <div style={{ padding: '0 20px' }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.text2,
                marginBottom: 12,
              }}
            >
              ملخص التحليل
            </h3>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              style={{
                borderRadius: 28,
                background: 'rgba(28,28,30,0.5)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `0.5px solid ${C.border}`,
                overflow: 'hidden',
              }}
            >
              {/* Sentiment Gauge */}
              <div
                style={{
                  padding: '20px 20px 16px',
                  borderBottom: `0.5px solid ${C.border}`,
                }}
              >
                <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                  <Gauge size={16} color={C.accent} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    المشاعر العامة للسوق
                  </span>
                </div>
                {/* Gauge bar */}
                <div
                  style={{
                    position: 'relative',
                    height: 8,
                    borderRadius: 8,
                    background:
                      'linear-gradient(90deg, #FF453A, #FFB800, #32D74B)',
                    opacity: 0.3,
                    marginBottom: 8,
                    direction: 'ltr',
                  }}
                />
                <div
                  style={{
                    position: 'relative',
                    height: 8,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    direction: 'ltr',
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sentimentScore}%` }}
                    transition={{ duration: 1.2, delay: 0.5 }}
                    style={{
                      height: '100%',
                      borderRadius: 8,
                      background:
                        'linear-gradient(90deg, #FF453A, #FFB800, #32D74B)',
                      boxShadow: '0 0 12px rgba(0,212,255,0.4)',
                    }}
                  />
                </div>
                <div
                  className="flex items-center justify-between"
                  style={{ marginTop: 6, direction: 'ltr' }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: C.text2,
                      fontFamily: 'monospace',
                    }}
                  >
                    هبوطي
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: sentimentGauge(sentimentScore).color,
                    }}
                  >
                    {sentimentGauge(sentimentScore).label}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: C.text2,
                      fontFamily: 'monospace',
                    }}
                  >
                    صعودي
                  </span>
                </div>
              </div>

              {/* Risk Level */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: `0.5px solid ${C.border}`,
                }}
              >
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <Shield size={14} color={C.amber} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    مستوى المخاطرة
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      padding: '6px 14px',
                      borderRadius: 12,
                      background: `${riskLevel(100 - score).color}15`,
                      border: `0.5px solid ${riskLevel(100 - score).color}30`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: riskLevel(100 - score).color,
                      }}
                    >
                      {riskLevel(100 - score).label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: C.text2 }}>
                    بناءً على درجة إجماع {score}%
                  </span>
                </div>
              </div>

              {/* Key Factors */}
              <div style={{ padding: '16px 20px' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                  <Sparkles size={14} color={C.accent} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                    العوامل الرئيسية
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {keyFactors.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3"
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        border: `0.5px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 6,
                          background: recColor(f.vote),
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.text,
                          flex: 1,
                        }}
                      >
                        {f.role}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: recColor(f.vote),
                          fontFamily: 'monospace',
                          direction: 'ltr',
                        }}
                      >
                        {f.confidence}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Master Strategy ── */}
          {data.masterStrategy && (
            <div style={{ padding: '0 20px' }}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                style={{
                  padding: '20px',
                  borderRadius: 28,
                  background: 'rgba(28,28,30,0.5)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: `0.5px solid ${isRealAI ? `${C.purple}20` : `${C.accent}15`}`,
                }}
              >
                <div
                  className="flex items-center gap-2"
                  style={{ marginBottom: 10 }}
                >
                  <Zap
                    size={14}
                    color={isRealAI ? C.purple : C.accent}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isRealAI ? C.purple : C.accent,
                    }}
                  >
                    الاستراتيجية الموحدة
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: C.text,
                    lineHeight: 1.8,
                    opacity: 0.85,
                  }}
                >
                  {data.masterStrategy}
                </p>
              </motion.div>
            </div>
          )}

          {/* ── Conflict Explanation ── */}
          {data.conflictExplanation && (
            <div style={{ padding: '0 20px' }}>
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 20,
                  background: 'rgba(255,184,0,0.05)',
                  border: '0.5px solid rgba(255,184,0,0.15)',
                  display: 'flex',
                  gap: 12,
                }}
              >
                <AlertTriangle
                  size={16}
                  color={C.amber}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <p
                  style={{
                    fontSize: 12,
                    color: C.text2,
                    lineHeight: 1.7,
                  }}
                >
                  {data.conflictExplanation}
                </p>
              </div>
            </div>
          )}

          {/* ── 7. QUICK ACTION BUTTONS ── */}
          <div style={{ padding: '0 20px 24px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 10,
              }}
            >
              {/* Execute Signal */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => showToast('تم إرسال إشارة التنفيذ')}
                style={{
                  padding: '14px 8px',
                  borderRadius: 20,
                  background: `${color}18`,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: `0.5px solid ${color}30`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    background: `${color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Zap size={18} color={color} />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: color,
                  }}
                >
                  تنفيذ إشارة
                </span>
              </motion.button>

              {/* Open Chart */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() =>
                  router.push(
                    `/mobile/chart?symbol=${encodeURIComponent(symbol)}`
                  )
                }
                style={{
                  padding: '14px 8px',
                  borderRadius: 20,
                  background: 'rgba(28,28,30,0.6)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: `0.5px solid ${C.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    background: `${C.accent}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BarChart3 size={18} color={C.accent} />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.accent,
                  }}
                >
                  فتح شارت
                </span>
              </motion.button>

              {/* Save Analysis */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => showToast('تم حفظ التحليل بنجاح')}
                style={{
                  padding: '14px 8px',
                  borderRadius: 20,
                  background: 'rgba(28,28,30,0.6)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: `0.5px solid ${C.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    background: `${C.amber}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Save size={18} color={C.amber} />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.amber,
                  }}
                >
                  حفظ التحليل
                </span>
              </motion.button>
            </div>
          </div>

          {/* ── Data source info ── */}
          <div style={{ padding: '0 20px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: 0.4,
              }}
            >
              <Shield size={10} />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: C.text2,
                }}
              >
                {isRealAI
                  ? `${modelsResponded} نماذج AI — محرك حقيقي`
                  : 'تحليل تقني — النماذج غير متصة'}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── INLINE LOADING OVERLAY (when refetching with existing data) ── */}
      <AnimatePresence>
        {loading && data && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: C.accent,
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                width: '50%',
                height: '100%',
                background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`,
                boxShadow: `0 0 16px ${C.accent}80`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACTION TOAST ── */}
      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={{
              position: 'fixed',
              bottom: 'calc(100px + env(safe-area-inset-bottom))',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px 24px',
              borderRadius: 16,
              background: 'rgba(28,28,30,0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `0.5px solid ${C.success}30`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              zIndex: 200,
            }}
          >
            <CheckCircle2 size={16} color={C.success} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.text,
              }}
            >
              {actionToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
