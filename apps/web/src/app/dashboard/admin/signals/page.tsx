'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Target,
  BarChart3,
  Activity,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'

const COLORS = {
  bg: '#0B0E14',
  card: '#111318',
  accent: '#00E5FF',
  success: '#00E676',
  danger: '#FF5252',
  amber: '#FFB800',
  text: '#F0F2F5',
  muted: '#8B92A8',
  border: 'rgba(0,229,255,0.08)',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  position: 'relative',
  overflow: 'hidden',
}

interface Signal {
  id: string
  pair: string
  action: 'BUY' | 'SELL' | 'WAIT'
  confidence: number
  reason: string
  status: string
  createdAt: string
  source: string
}

interface ScannerResult {
  symbol: string
  score: number
  direction: 'bullish' | 'bearish' | 'neutral'
  change: number
}

interface SignalStats {
  totalSignals: number
  activeSignals: number
  expiredSignals: number
  executedSignals: number
  cancelledSignals: number
  winRate: number
  avgConfidence: number
  avgReturnPerSignal: number
  bestPair: string | null
  bestPairReturn: number
  worstPair: string | null
  worstPairReturn: number
  error?: string
}

export default function AdminSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [scannerResults, setScannerResults] = useState<ScannerResult[]>([])
  const [loading, setLoading] = useState(true)
  const [signalsError, setSignalsError] = useState<string | null>(null)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [signalStats, setSignalStats] = useState<SignalStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setSignalsError(null)
    setScannerError(null)

    try {
      // Fetch smart signals
      const signalsRes = await fetch('/api/signals/smart')
      if (signalsRes.ok) {
        const data = await signalsRes.json()
        if (data.signals || data.data) {
          const rawSignals = data.signals || data.data || []
          setSignals(rawSignals.map((s: any) => ({
            id: s.id || Math.random().toString(),
            pair: s.pair || s.symbol || '—',
            action: s.action || s.type || 'WAIT',
            confidence: s.confidence || s.conf || 0,
            reason: s.reason || '',
            status: s.status || 'ACTIVE',
            createdAt: s.createdAt || s.time || new Date().toISOString(),
            source: 'smart',
          })))
        }
      } else {
        setSignalsError('فشل في جلب الإشارات الذكية من الخادم')
      }
    } catch {
      setSignalsError('⚠️ بيانات غير متاحة — فشل الاتصال بالخادم')
      setSignals([])
    }

    try {
      // Fetch scanner
      const scanRes = await fetch('/api/scanner/scan')
      if (scanRes.ok) {
        const data = await scanRes.json()
        const rawResults = data.results || data.items || []
        if (rawResults.length > 0) {
          setScannerResults(rawResults.slice(0, 8).map((r: any) => ({
            symbol: r.symbol || r.pair || '—',
            score: r.smartScore || r.score || 0,
            direction: r.direction || (r.change > 0 ? 'bullish' : r.change < 0 ? 'bearish' : 'neutral'),
            change: r.change || r.priceChange || 0,
          })))
        } else {
          // API returned successfully but with empty results — this is okay
          setScannerResults([])
        }
        // If the API itself reports a fallback source, show warning
        if (data.meta?.source === 'fallback' || data.meta?.error) {
          setScannerError('⚠️ بيانات تجريبية — فشل الاتصال بخادم التحليل')
        }
      } else {
        setScannerError('فشل في جلب نتائج الماسح من الخادم')
        setScannerResults([])
      }
    } catch {
      setScannerError('⚠️ بيانات غير متاحة — فشل الاتصال بالخادم')
      setScannerResults([])
    }

    setLoading(false)
  }, [])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/dashboard/admin/api/signals/stats')
      if (res.ok) {
        const data = await res.json()
        setSignalStats(data)
      } else {
        setSignalStats(null)
      }
    } catch {
      setSignalStats(null)
    }
    setStatsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    fetchStats()
  }, [fetchData, fetchStats])

  const activeSignals = signals.filter(s => s.status === 'ACTIVE')
  const buySignals = signals.filter(s => s.action === 'BUY')
  const sellSignals = signals.filter(s => s.action === 'SELL')
  const avgConfidence = signals.length ? Math.round(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length) : 0

  function getActionConfig(action: string) {
    if (action === 'BUY') return { label: 'شراء', Icon: TrendingUp, color: COLORS.success, bg: `${COLORS.success}10`, border: `${COLORS.success}25` }
    if (action === 'SELL') return { label: 'بيع', Icon: TrendingDown, color: COLORS.danger, bg: `${COLORS.danger}10`, border: `${COLORS.danger}25` }
    return { label: 'انتظار', Icon: Minus, color: COLORS.amber, bg: `${COLORS.amber}10`, border: `${COLORS.amber}25` }
  }

  const hasAnyError = signalsError || scannerError

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Error Banner */}
      {hasAnyError && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: `${COLORS.amber}10`,
          border: `1px solid ${COLORS.amber}30`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={16} color={COLORS.amber} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.amber, fontFamily: "'Cairo', sans-serif" }}>
              فشل في جلب البيانات من الخادم
            </div>
            <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
              {signalsError && <span>الإشارات: {signalsError}</span>}
              {signalsError && scannerError && <span> · </span>}
              {scannerError && <span>الماسح: {scannerError}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إدارة الإشارات</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>الإشارات الذكية ونتائج الماسح</p>
        </div>
        <button onClick={() => { fetchData(); fetchStats(); }} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 8,
          border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
          color: COLORS.accent, fontSize: 12, fontWeight: 600,
          fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
        }}>
          <RefreshCw size={14} /> تحديث
        </button>
      </div>

      {/* Signal Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { label: 'إشارات نشطة', value: `${activeSignals.length}`, color: COLORS.accent, icon: Zap },
          { label: 'إشارات شراء', value: `${buySignals.length}`, color: COLORS.success, icon: TrendingUp },
          { label: 'إشارات بيع', value: `${sellSignals.length}`, color: COLORS.danger, icon: TrendingDown },
          { label: 'متوسط الثقة', value: `${avgConfidence}%`, color: avgConfidence >= 70 ? COLORS.success : avgConfidence >= 50 ? COLORS.amber : COLORS.danger, icon: Target },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <div key={i} style={{ ...CARD_STYLE, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${card.color}15`,
                border: `1px solid ${card.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CardIcon size={16} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: card.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="admin-grid-2">
        {/* Smart Signals Feed */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Sparkles size={14} color={COLORS.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>الإشارات الذكية</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }} className="custom-scrollbar">
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>جارٍ التحميل...</div>
            ) : signals.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
                {signalsError ? 'لا توجد بيانات إشارات متاحة' : 'لا توجد إشارات حالياً'}
              </div>
            ) : signals.map((signal) => {
              const config = getActionConfig(signal.action)
              const ActionIcon = config.Icon
              return (
                <div key={signal.id} style={{
                  padding: '12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                  borderRight: `3px solid ${config.color}`,
                  opacity: signal.status === 'EXPIRED' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: config.bg, border: `1px solid ${config.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <ActionIcon size={12} color={config.color} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }} dir="ltr">{signal.pair}</span>
                      <span style={{
                        padding: '1px 6px', borderRadius: 3,
                        background: config.bg, border: `1px solid ${config.border}`,
                        fontSize: 9, fontWeight: 700, color: config.color,
                        fontFamily: "'Cairo', sans-serif",
                      }}>
                        {config.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: signal.confidence >= 70 ? COLORS.success : signal.confidence >= 50 ? COLORS.amber : COLORS.danger }}>
                      {signal.confidence}%
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>{signal.reason}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Scanner Results */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <BarChart3 size={14} color={COLORS.amber} />
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>نتائج الماسح</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }} className="custom-scrollbar">
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>جارٍ التحميل...</div>
            ) : scannerResults.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
                {scannerError ? 'لا توجد بيانات ماسح متاحة' : 'لا توجد نتائج ماسح حالياً'}
              </div>
            ) : scannerResults.map((result, i) => {
              const dirColor = result.direction === 'bullish' ? COLORS.success : result.direction === 'bearish' ? COLORS.danger : COLORS.muted
              const dirLabel = result.direction === 'bullish' ? 'صاعد' : result.direction === 'bearish' ? 'هابط' : 'محايد'
              return (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: `${dirColor}15`,
                      border: `1px solid ${dirColor}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Activity size={12} color={dirColor} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text }} dir="ltr">{result.symbol}</div>
                      <div style={{ fontSize: 9, color: dirColor, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>{dirLabel}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Score bar */}
                    <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${result.score}%`, height: '100%',
                        background: dirColor, borderRadius: 2,
                      }} />
                    </div>
                    <div style={{ textAlign: 'left', minWidth: 50 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: result.change >= 0 ? COLORS.success : COLORS.danger }}>
                        {result.change >= 0 ? '+' : ''}{result.change}%
                      </div>
                      <div style={{ fontSize: 8, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{result.score}/100</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Signal Performance Stats — Real Data from DB */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Target size={14} color={COLORS.success} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>أداء الإشارات</span>
          {signalStats?.error && (
            <span style={{ fontSize: 9, color: COLORS.amber, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>
              (قاعدة البيانات غير متاحة)
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {statsLoading ? (
            // Loading skeleton
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ width: 100, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ width: 60, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
                </div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
              </div>
            ))
          ) : (
            [
              {
                label: 'دقة الإشارات',
                value: signalStats ? `${signalStats.winRate}%` : '0%',
                bar: signalStats?.winRate || 0,
                color: COLORS.success,
              },
              {
                label: 'متوسط العائد لكل إشارة',
                value: signalStats && signalStats.avgReturnPerSignal !== 0
                  ? `${signalStats.avgReturnPerSignal >= 0 ? '+' : ''}${signalStats.avgReturnPerSignal}%`
                  : '0%',
                bar: signalStats?.avgReturnPerSignal ? Math.min(Math.abs(signalStats.avgReturnPerSignal) * 10, 100) : 0,
                color: (signalStats?.avgReturnPerSignal || 0) >= 0 ? COLORS.accent : COLORS.danger,
              },
              {
                label: 'أفضل زوج',
                value: signalStats?.bestPair
                  ? `${signalStats.bestPair} ${signalStats.bestPairReturn}%`
                  : '—',
                bar: signalStats?.bestPairReturn || 0,
                color: COLORS.amber,
              },
              {
                label: 'أسوأ زوج',
                value: signalStats?.worstPair
                  ? `${signalStats.worstPair} ${signalStats.worstPairReturn}%`
                  : '—',
                bar: signalStats?.worstPairReturn || 0,
                color: COLORS.danger,
              },
            ].map((stat, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{stat.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: stat.color, fontFamily: "'JetBrains Mono', monospace" }}>{stat.value}</span>
                </div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ width: `${Math.max(stat.bar, 2)}%`, height: '100%', background: stat.color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
        @media (max-width: 900px) {
          .admin-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
