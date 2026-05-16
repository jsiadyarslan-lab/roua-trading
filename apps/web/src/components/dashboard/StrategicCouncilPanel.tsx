'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'

const T = {
  bg: '#0B0E14',
  card: '#1A1D29',
  accent: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
  cyan: '#00D4FF',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#8B92A8',
}

interface TradingBrief {
  id: string
  userId?: string | null
  pair: string
  direction: 'BUY' | 'SELL'
  entryPrice: number
  stopLoss: number
  takeProfit: number
  confidence: number
  timeframe: 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1'
  issuedAt: string
  expiresAt: string
  isActive: boolean
  strictRules: { maxEntryPrice?: number; minEntryPrice?: number; maxSlippage: number }
  lastReviewedAt: string
  reviewStatus: 'ACTIVE' | 'MODIFIED' | 'CANCELLED' | 'EXECUTED'
  analysisSummary?: string
}

interface CouncilSession {
  timestamp: string
  pairsAnalyzed: number
  briefsIssued: number
  briefsModified: number
  briefsCancelled: number
  briefsExecuted: number
  durationMs: number
}

export function StrategicCouncilPanel() {
  const [activeBriefs, setActiveBriefs] = useState<TradingBrief[]>([])
  const [historyBriefs, setHistoryBriefs] = useState<TradingBrief[]>([])
  const [lastSession, setLastSession] = useState<CouncilSession | null>(null)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [loading, setLoading] = useState(false)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null) // 'processing' | 'already_running' | null
  const [backendOffline, setBackendOffline] = useState(false)
  const [currentScanSymbol, setCurrentScanSymbol] = useState('BTC/USDT')
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const SCAN_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA']

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  // Symbol Scanning Animation (Visual Only) — pauses when tab hidden
  useVisibleInterval(() => {
    setCurrentScanSymbol(prev => {
      const idx = SCAN_SYMBOLS.indexOf(prev)
      return SCAN_SYMBOLS[(idx + 1) % SCAN_SYMBOLS.length]
    })
  }, 3000)

  const fetchActiveBriefs = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/briefs/active')
      const data = await res.json()
      if (data.success) {
        setActiveBriefs(data.data || [])
        setBackendOffline(false)
      } else if (data.offline || res.status === 502) {
        setBackendOffline(true)
      }
    } catch {
      setBackendOffline(true)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/briefs/history')
      const data = await res.json()
      if (data.success) {
        setHistoryBriefs(data.data || [])
        setBackendOffline(false)
      } else if (data.offline || res.status === 502) {
        setBackendOffline(true)
      }
    } catch {
      setBackendOffline(true)
    }
  }, [])

  const fetchLastSession = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/session/last')
      const data = await res.json()
      if (data.success) {
        setLastSession(data.data)
        setBackendOffline(false)
      } else if (data.offline || res.status === 502) {
        setBackendOffline(true)
      }
    } catch {
      setBackendOffline(true)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchActiveBriefs(), fetchLastSession()]).finally(() => setLoading(false))

    // FIX: On mount, check if a session is currently running on the backend.
    // This recovers the "processing" state after page refresh or tab switch.
    fetch('/api/strategic-council/session/status')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.isRunning) {
          setTriggerStatus('processing')
          // Resume polling for session completion
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
          pollIntervalRef.current = setInterval(async () => {
            try {
              const sessionRes = await fetch('/api/strategic-council/session/last')
              const sessionData = await sessionRes.json()
              if (sessionData.success && sessionData.data) {
                const session = sessionData.data as CouncilSession
                if (session.pairsAnalyzed > 0 || session.briefsIssued > 0 || session.briefsModified > 0) {
                  setLastSession(session)
                  setTriggerStatus('completed')
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
                  pollIntervalRef.current = null
                  await fetchActiveBriefs()
                  setTimeout(() => setTriggerStatus(null), 5000)
                }
              }
            } catch {
              // Continue polling
            }
          }, 5000)
          pollTimeoutRef.current = setTimeout(() => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setTriggerStatus(prev => prev === 'processing' ? null : prev)
          }, 600000)
        }
      })
      .catch(() => { /* ignore — will retry on next poll */ })

    fetchActiveBriefs()
    fetchLastSession()
  }, [])
  // Poll every 15s — pauses when tab hidden
  useVisibleInterval(() => { fetchActiveBriefs(); fetchLastSession() }, 15000)

  const triggerSession = async () => {
    setTriggerLoading(true)
    setTriggerStatus(null)
    try {
      const res = await fetch('/api/strategic-council/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] }),
      })
      const data = await res.json()
      if (data.offline || res.status === 502) {
        setBackendOffline(true)
      } else {
        setBackendOffline(false)
        // FIX: Handle fire-and-forget response
        if (data.success && data.data?.status === 'processing') {
          setTriggerStatus('processing')
          // Clear any existing polling first
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
          // Poll for results — the session runs in the background
          pollIntervalRef.current = setInterval(async () => {
            try {
              const sessionRes = await fetch('/api/strategic-council/session/last')
              const sessionData = await sessionRes.json()
              if (sessionData.success && sessionData.data) {
                const session = sessionData.data as CouncilSession
                // If session has results (briefsIssued > 0 or pairsAnalyzed > 0), it's done
                if (session.pairsAnalyzed > 0 || session.briefsIssued > 0 || session.briefsModified > 0) {
                  setLastSession(session)
                  setTriggerStatus('completed')
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
                  pollIntervalRef.current = null
                  // Refresh briefs list
                  await fetchActiveBriefs()
                  // Clear status after 5 seconds
                  setTimeout(() => setTriggerStatus(null), 5000)
                }
              }
            } catch {
              // Continue polling
            }
          }, 5000) // Poll every 5 seconds
          // Stop polling after 10 minutes max
          pollTimeoutRef.current = setTimeout(() => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setTriggerStatus(prev => prev === 'processing' ? null : prev)
          }, 600000)
        } else if (data.status === 'already_running') {
          setTriggerStatus('already_running')
          setTimeout(() => setTriggerStatus(null), 5000)
        }
      }
      await fetchActiveBriefs()
      await fetchLastSession()
    } catch {
      setBackendOffline(true)
    }
    setTriggerLoading(false)
  }

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    } catch { return '--:--' }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const timeframeColors: Record<string, string> = {
    M5: T.success,
    M15: T.accent,
    M30: T.amber,
    H1: T.cyan,
    H4: T.purple,
    D1: T.amber,
    W1: T.danger,
  }

  const directionColors = { BUY: T.success, SELL: T.danger }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
      borderRadius: 16, border: '1px solid rgba(0,212,255,0.08)',
      overflow: 'hidden', fontFamily: "'Cairo', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '7px 10px 6px',
        background: 'linear-gradient(90deg, rgba(179,136,255,0.12), transparent)',
        borderBottom: '1px solid rgba(0,212,255,0.08)',
        display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: T.purple,
            boxShadow: `0 0 10px ${T.purple}, 0 0 20px rgba(179,136,255,0.4)`,
            animation: 'agentCtrlPulse 2s ease-in-out infinite'
          }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: T.text }}>المجلس الاستراتيجي</span>
          
          {/* Scanning Heartbeat */}
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 4, 
            background: 'rgba(0,212,255,0.05)', padding: '1px 6px', 
            borderRadius: 10, border: '1px solid rgba(0,212,255,0.1)'
          }}>
            <div style={{ 
              width: 4, height: 4, borderRadius: '50%', background: T.accent,
              boxShadow: `0 0 5px ${T.accent}`,
              animation: 'agentCtrlPulse 1s ease-in-out infinite'
            }} />
            <span style={{ fontSize: 7, color: T.accent, fontWeight: 700, fontFamily: 'monospace' }}>
              SCANNING: {currentScanSymbol}
            </span>
          </div>

          <span style={{
            fontSize: 6.5, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(179,136,255,0.15)', color: T.purple, fontWeight: 700,
          }}>
            {activeBriefs.length} Briefs
          </span>
        </div>
        <button
          onClick={triggerSession}
          disabled={triggerLoading}
          style={{
            fontSize: 7, minHeight: 22, padding: '3px 8px',
            borderRadius: 5, border: `1px solid ${triggerStatus === 'processing' ? 'rgba(0,212,255,0.3)' : triggerStatus === 'already_running' ? 'rgba(255,184,0,0.3)' : 'rgba(179,136,255,0.3)'}`,
            cursor: triggerLoading ? 'not-allowed' : 'pointer',
            background: triggerStatus === 'processing' ? 'rgba(0,212,255,0.15)' : triggerStatus === 'already_running' ? 'rgba(255,184,0,0.15)' : 'rgba(179,136,255,0.15)',
            color: triggerStatus === 'processing' ? T.cyan : triggerStatus === 'already_running' ? T.amber : T.purple, fontWeight: 700,
          }}
        >
          {triggerLoading ? '...' : triggerStatus === 'processing' ? '⏳ جاري التحليل...' : triggerStatus === 'already_running' ? '⏳ جلسة نشطة' : triggerStatus === 'completed' ? '✅ تم!' : 'جلسة يدوية'}
        </button>
      </div>

      {/* Backend Offline Banner */}
      {backendOffline && (
        <div style={{ padding: '4px 8px', background: 'rgba(255,184,0,0.1)', borderBottom: '1px solid rgba(255,184,0,0.2)' }}>
          <span style={{ fontSize: 7, color: T.amber }}>⚠ الخادم غير متاح — يُعاد الاتصال تلقائياً</span>
        </div>
      )}

      {/* Last Session Summary */}
      {lastSession && (
        <div style={{
          padding: '5px 8px', borderBottom: '1px solid rgba(0,212,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 7,
        }}>
          <span style={{ color: T.text3 }}>آخر جلسة:</span>
          <span style={{ color: T.text, fontWeight: 700 }}>{formatTime(lastSession.timestamp)}</span>
          <span style={{ color: T.text3 }}>• أزواج: {lastSession.pairsAnalyzed}</span>
          <span style={{ color: T.success }}>+{lastSession.briefsIssued} جديد</span>
          <span style={{ color: T.amber }}>~{lastSession.briefsModified} تعديل</span>
          <span style={{ color: T.danger }}>×{lastSession.briefsCancelled} إلغاء</span>
          <span style={{ color: T.text3 }}>• {formatDuration(lastSession.durationMs)}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, padding: '3px 6px',
        background: '#0B0E14', borderBottom: '1px solid rgba(0,212,255,0.08)',
      }}>
        <button onClick={() => { setTab('active'); fetchActiveBriefs() }} style={{
          flex: 1, minHeight: 20, padding: '2px 5px', fontSize: 7,
          background: tab === 'active' ? 'rgba(0,212,255,0.14)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${tab === 'active' ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 5, color: tab === 'active' ? T.cyan : T.text3, cursor: 'pointer', fontWeight: 700,
        }}>
          نشطة ({activeBriefs.length})
        </button>
        <button onClick={() => { setTab('history'); fetchHistory() }} style={{
          flex: 1, minHeight: 20, padding: '2px 5px', fontSize: 7,
          background: tab === 'history' ? 'rgba(0,212,255,0.14)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${tab === 'history' ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 5, color: tab === 'history' ? T.cyan : T.text3, cursor: 'pointer', fontWeight: 700,
        }}>
          السجل
        </button>
      </div>

      {/* Briefs List */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: 4, background: 'rgba(11,14,20,0.45)',
      }} className="custom-scrollbar">
        {(tab === 'active' ? activeBriefs : historyBriefs).length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.3, fontSize: 9 }}>
            {tab === 'active' ? 'لا توجد Briefs نشطة — ينتظر المجلس الجلسة القادمة' : 'لا يوجد سجل بعد'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(tab === 'active' ? activeBriefs : historyBriefs).slice(0, 20).map((brief) => (
              <div key={brief.id} style={{
                padding: '6px 8px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${brief.reviewStatus === 'ACTIVE' ? 'rgba(0,255,163,0.12)' : brief.reviewStatus === 'MODIFIED' ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.04)'}`,
              }}>
                {/* Top Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{
                    padding: '1px 5px', borderRadius: 3, fontSize: 7,
                    background: `${directionColors[brief.direction]}18`,
                    color: directionColors[brief.direction], fontWeight: 800,
                  }}>
                    {brief.direction === 'BUY' ? 'شراء' : 'بيع'}
                  </span>
                  <span style={{ color: T.text, fontWeight: 700, fontSize: 9, fontFamily: 'monospace' }}>
                    {brief.pair}
                  </span>
                  <span style={{
                    padding: '1px 4px', borderRadius: 3, fontSize: 6,
                    background: `${timeframeColors[brief.timeframe]}15`,
                    color: timeframeColors[brief.timeframe], fontWeight: 700,
                  }}>
                    {brief.timeframe}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 7, color: T.text3 }}>
                    {formatTime(brief.issuedAt)}
                  </span>
                </div>
                {/* Prices */}
                <div style={{ display: 'flex', gap: 8, fontSize: 7, color: T.text3, fontFamily: 'monospace' }}>
                  <span>دخول: <b style={{ color: T.text }}>{brief.entryPrice.toFixed(2)}</b></span>
                  <span>SL: <b style={{ color: T.danger }}>{brief.stopLoss.toFixed(2)}</b></span>
                  <span>TP: <b style={{ color: T.success }}>{brief.takeProfit.toFixed(2)}</b></span>
                </div>
                {/* Confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${brief.confidence}%`,
                      background: brief.confidence >= 80 ? T.success : brief.confidence >= 60 ? T.amber : T.danger,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 7, fontWeight: 800, fontFamily: 'monospace',
                    color: brief.confidence >= 80 ? T.success : brief.confidence >= 60 ? T.amber : T.danger,
                  }}>
                    {brief.confidence}%
                  </span>
                </div>
                {/* Status Badge */}
                {brief.reviewStatus !== 'ACTIVE' && (
                  <div style={{ marginTop: 3 }}>
                    <span style={{
                      fontSize: 6, padding: '1px 4px', borderRadius: 3,
                      background: brief.reviewStatus === 'EXECUTED' ? 'rgba(0,255,163,0.12)' :
                        brief.reviewStatus === 'MODIFIED' ? 'rgba(255,184,0,0.12)' :
                          'rgba(255,71,87,0.12)',
                      color: brief.reviewStatus === 'EXECUTED' ? T.success :
                        brief.reviewStatus === 'MODIFIED' ? T.amber : T.danger,
                      fontWeight: 700,
                    }}>
                      {brief.reviewStatus === 'EXECUTED' ? 'تم التنفيذ' :
                        brief.reviewStatus === 'MODIFIED' ? 'معدّل' :
                          brief.reviewStatus === 'CANCELLED' ? 'ملغى' : brief.reviewStatus}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
