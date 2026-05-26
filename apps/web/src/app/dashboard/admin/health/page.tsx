'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Server,
  Zap,
} from 'lucide-react'
import { COLORS, CARD_STYLE } from '@/lib/admin-ui'
import { useScopedStyle } from '@/hooks/useScopedStyle'

interface EndpointHealth {
  path: string
  status: 'healthy' | 'warning' | 'error' | 'checking'
  responseTime: number
  lastChecked: string
  history: number[]
}

const MONITORED_ENDPOINTS = [
  '/dashboard',
  '/api/health',
  '/api/auth/session',
  '/api/exchange/quote/AAPL',
  '/api/exchange/quote/BTC/USD',
  '/api/scanner/scan',
  '/api/signals/smart',
  '/api/scanner/multi-tf/BTC/USD',
  '/api/portfolio/sanctuary',
  '/api/positions',
]

function getStatusIcon(status: string) {
  switch (status) {
    case 'healthy': return <CheckCircle2 size={16} color={COLORS.success} />
    case 'warning': return <AlertTriangle size={16} color={COLORS.amber} />
    case 'error': return <XCircle size={16} color={COLORS.danger} />
    default: return <Clock size={16} color={COLORS.muted} />
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'healthy': return COLORS.success
    case 'warning': return COLORS.amber
    case 'error': return COLORS.danger
    default: return COLORS.muted
  }
}

export default function AdminHealthPage() {
  useScopedStyle(`@keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }`)

  const [endpoints, setEndpoints] = useState<EndpointHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const checkEndpoints = useCallback(async () => {
    const results: EndpointHealth[] = MONITORED_ENDPOINTS.map(path => ({
      path,
      status: 'checking' as const,
      responseTime: 0,
      lastChecked: new Date().toISOString(),
      history: [],
    }))

    setEndpoints(prev => {
      // Keep history from previous checks
      return results.map((ep, i) => ({
        ...ep,
        history: prev[i]?.history?.slice(-9) || [],
      }))
    })

    // Check each endpoint
    for (let i = 0; i < MONITORED_ENDPOINTS.length; i++) {
      const path = MONITORED_ENDPOINTS[i]
      const start = Date.now()

      try {
        const res = await fetch(path, { signal: AbortSignal.timeout(8000) })
        const elapsed = Date.now() - start

        let status: 'healthy' | 'warning' | 'error' = 'healthy'
        if (!res.ok) status = 'error'
        else if (elapsed > 2000) status = 'warning'

        setEndpoints(prev => {
          const updated = [...prev]
          updated[i] = {
            ...updated[i],
            status,
            responseTime: elapsed,
            lastChecked: new Date().toISOString(),
            history: [...(updated[i]?.history || []), elapsed].slice(-10),
          }
          return updated
        })
      } catch {
        const elapsed = Date.now() - start
        setEndpoints(prev => {
          const updated = [...prev]
          updated[i] = {
            ...updated[i],
            status: 'error',
            responseTime: elapsed,
            lastChecked: new Date().toISOString(),
            history: [...(updated[i]?.history || []), elapsed].slice(-10),
          }
          return updated
        })
      }
    }

    setLastRefresh(new Date().toLocaleTimeString('ar-SA'))
    setLoading(false)
  }, [])

  useEffect(() => {
    checkEndpoints()
  }, [checkEndpoints])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(checkEndpoints, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, checkEndpoints])

  const healthyCount = endpoints.filter(e => e.status === 'healthy').length
  const warningCount = endpoints.filter(e => e.status === 'warning').length
  const errorCount = endpoints.filter(e => e.status === 'error').length

  const maxResponseTime = Math.max(...endpoints.map(e => e.responseTime || 1), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>صحة النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>
            مراقبة جميع نقاط النهاية في الوقت الفعلي
            {lastRefresh && ` • آخر تحديث: ${lastRefresh}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${autoRefresh ? COLORS.success + '25' : COLORS.border}`,
              background: autoRefresh ? `${COLORS.success}08` : 'rgba(255,255,255,0.03)',
              color: autoRefresh ? COLORS.success : COLORS.muted,
              fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Zap size={12} />
            {autoRefresh ? 'تحديث تلقائي' : 'متوقف'}
          </button>
          <button
            onClick={checkEndpoints}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
              color: COLORS.accent, fontSize: 12, fontWeight: 600,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} /> فحص الآن
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { label: 'سليم', value: healthyCount, color: COLORS.success, icon: CheckCircle2 },
          { label: 'تحذير', value: warningCount, color: COLORS.amber, icon: AlertTriangle },
          { label: 'خطأ', value: errorCount, color: COLORS.danger, icon: XCircle },
          { label: 'إجمالي', value: endpoints.length, color: COLORS.accent, icon: Server },
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

      {/* Endpoints List */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Activity size={14} color={COLORS.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>نقاط النهاية المراقبة</span>
          <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace", marginRight: 8 }}>10 endpoints</span>
        </div>

        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && endpoints.every(e => e.status === 'checking') ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontFamily: "'Cairo', sans-serif", fontSize: 12 }}>
              جارٍ فحص جميع نقاط النهاية...
            </div>
          ) : (
            endpoints.map((ep, i) => (
              <div key={i} style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                {/* Status Icon */}
                <div style={{ flexShrink: 0 }}>
                  {getStatusIcon(ep.status)}
                </div>

                {/* Path + Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: COLORS.text, marginBottom: 4 }} dir="ltr">
                    {ep.path}
                  </div>
                  {/* Performance History Bar Chart */}
                  {ep.history.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24 }}>
                      {ep.history.map((time, j) => {
                        const height = Math.max(3, (time / maxResponseTime) * 24)
                        const barColor = time < 500 ? COLORS.success : time < 2000 ? COLORS.amber : COLORS.danger
                        return (
                          <div key={j} style={{
                            width: 6, height,
                            background: barColor,
                            borderRadius: 1,
                            opacity: 0.7,
                          }} />
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Response Time */}
                <div style={{ textAlign: 'left', flexShrink: 0, minWidth: 70 }}>
                  {ep.status !== 'checking' && (
                    <>
                      <div style={{
                        fontSize: 13, fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: ep.responseTime < 500 ? COLORS.success : ep.responseTime < 2000 ? COLORS.amber : COLORS.danger,
                      }}>
                        {ep.responseTime}ms
                      </div>
                      <div style={{ fontSize: 8, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                        {ep.status === 'healthy' ? 'سليم' : ep.status === 'warning' ? 'بطيء' : ep.status === 'error' ? 'خطأ' : 'فحص...'}
                      </div>
                    </>
                  )}
                  {ep.status === 'checking' && (
                    <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>جارٍ الفحص...</div>
                  )}
                </div>

                {/* Status dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: getStatusColor(ep.status),
                  boxShadow: `0 0 6px ${getStatusColor(ep.status)}`,
                  flexShrink: 0,
                  animation: ep.status === 'checking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Scoped styles via useScopedStyle */}</div>
  )
}
