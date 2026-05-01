'use client'

import { useState, useEffect } from 'react'
import { ScrollText, Filter, RefreshCw, Info, AlertTriangle, XCircle, AlertCircle } from 'lucide-react'
import { COLORS } from '@/lib/admin-ui'

type LogLevel = 'info' | 'warning' | 'error'

interface LogEntry {
  id: string
  level: LogLevel
  message: string
  source: string
  timestamp: string
}

interface LogsResponse {
  logs: LogEntry[]
  counts: {
    all: number
    info: number
    warning: number
    error: number
  }
  error?: string
}

const levelCfg = {
  info: { color: COLORS.accent, Icon: Info, label: 'معلومة' },
  warning: { color: COLORS.amber, Icon: AlertTriangle, label: 'تحذير' },
  error: { color: COLORS.danger, Icon: XCircle, label: 'خطأ' },
}

async function fetchSystemLogs(level: string, search: string): Promise<LogsResponse> {
  const params = new URLSearchParams()
  if (level && level !== 'all') params.set('level', level)
  if (search) params.set('search', search)
  params.set('limit', '200')

  const res = await fetch(`/dashboard/admin/api/system-logs?${params.toString()}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function AdminSystemLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [counts, setCounts] = useState({ all: 0, info: 0, warning: 0, error: 0 })
  const [filter, setFilter] = useState<LogLevel | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (isRefresh = false, overrideFilter?: string, overrideSearch?: string) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const lvl = overrideFilter ?? filter
      const s = overrideSearch ?? search
      const json = await fetchSystemLogs(lvl, s)
      if (json.error) {
        setError(json.error)
      }
      setLogs(json.logs)
      setCounts(json.counts)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Initial load
  useEffect(() => {
    load()
  }, [])

  // Reload when filter or search changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      load(false, filter, search)
    }, 300)
    return () => clearTimeout(timer)
  }, [filter, search])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const iv = setInterval(() => {
      load(true)
    }, 30000)
    return () => clearInterval(iv)
  }, [])

  const filtered = logs.filter(l => {
    const mf = filter === 'all' || l.level === filter
    const ms = !search || l.message.toLowerCase().includes(search.toLowerCase())
    return mf && ms
  })

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>سجلات النظام</h1>
            <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>جاري تحميل السجلات...</p>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${COLORS.border}`, borderRadius: 10, height: 480 }}>
          <div style={{ background: 'rgba(0,229,255,0.04)', borderRadius: 6, height: '100%', animation: 'pulse 1.5s infinite' }} />
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>سجلات النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>مراقبة الأحداث والأخطاء في الوقت الفعلي</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 8, border: `1px solid ${COLORS.border}`,
              background: 'rgba(0,229,255,0.06)', color: COLORS.accent,
              fontSize: 11, fontFamily: "'Cairo', sans-serif",
              cursor: refreshing ? 'wait' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'جاري التحديث...' : 'تحديث'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 8,
          background: `${COLORS.danger}10`, border: `1px solid ${COLORS.danger}30`,
          color: COLORS.danger, fontSize: 12, fontFamily: "'Cairo', sans-serif",
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'info', 'warning', 'error'] as const).map(lv => {
          const color = lv === 'all' ? COLORS.accent : levelCfg[lv].color
          const label = lv === 'all' ? 'الكل' : levelCfg[lv].label
          return (
            <button key={lv} onClick={() => setFilter(lv)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: filter === lv ? `1px solid ${color}30` : `1px solid ${COLORS.border}`, background: filter === lv ? `${color}10` : 'rgba(255,255,255,0.03)', color: filter === lv ? color : COLORS.muted, fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
              {label}
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{counts[lv]}</span>
            </button>
          )
        })}
        <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.border}` }}>
          <Filter size={12} color={COLORS.muted} />
          <input type="text" placeholder="بحث في السجلات..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: COLORS.text, fontSize: 11, fontFamily: "'Cairo', sans-serif" }} dir="rtl" />
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ScrollText size={12} color={COLORS.accent} />
            <span style={{ fontSize: 10, color: COLORS.muted }}>سجل الأحداث</span>
          </div>
          <span style={{ fontSize: 9, color: COLORS.muted }}>{filtered.length} سجل</span>
        </div>
        <div className="custom-scrollbar" style={{ height: 480, overflowY: 'auto', padding: 4, background: 'rgba(0,0,0,0.3)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
              {error ? 'حدث خطأ في جلب السجلات' : 'لا توجد سجلات'}
            </div>
          ) : filtered.map(log => {
            const cfg = levelCfg[log.level]
            const LIcon = cfg.Icon
            return (
              <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderRadius: 4, marginBottom: 2, background: `${cfg.color}10`, borderLeft: `2px solid ${cfg.color}`, fontSize: 11, lineHeight: 1.6 }}>
                <LIcon size={12} color={cfg.color} style={{ flexShrink: 0, marginTop: 3 }} />
                <span style={{ color: COLORS.muted, flexShrink: 0, fontSize: 10 }} dir="ltr">{new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span style={{ color: COLORS.text, flex: 1, direction: 'ltr', textAlign: 'left' }}>{log.message}</span>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
      `}</style>
    </div>
  )
}
