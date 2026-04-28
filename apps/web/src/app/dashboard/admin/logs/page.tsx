'use client'

import { useState, useEffect } from 'react'
import { ScrollText, Filter, Trash2, RefreshCw, Info, AlertTriangle, XCircle } from 'lucide-react'

const C = {
  bg: '#0B0E14', card: '#111318', accent: '#00E5FF',
  success: '#00E676', danger: '#FF5252', amber: '#FFB800',
  text: '#F0F2F5', muted: '#8B92A8', border: 'rgba(0,229,255,0.08)',
}

type LogLevel = 'info' | 'warning' | 'error'

interface LogEntry {
  id: string
  level: LogLevel
  message: string
  source: string
  timestamp: string
}

function genLogs(): LogEntry[] {
  const msgs = {
    info: [
      '[auth] جلسة جديدة — guest@roua.auto',
      '[engine] صفقة BTC/USD — شراء 0.5',
      '[scanner] فحص مكتمل — 24 زوج',
      '[portfolio] تحديث المحفظة — $125,430',
      '[signals] إشارة ETH/USD بيع 72%',
      '[bot] دورة تداول — PnL: +$340',
      '[market] تحديث أسعار — 45 رمز',
      '[api] GET /api/health — 200 (45ms)',
    ],
    warning: [
      '[engine] استجابة بطيئة — 2100ms',
      '[scanner] فشل جلب SOL/USD — إعادة',
      '[memory] ذاكرة 82% — مراقبة',
      '[rate-limit] تجاوز حد IP: 192.168.1.45',
    ],
    error: [
      '[exchange] فشل Binance — timeout',
      '[order] فشل أمر ord-004 — رصيد',
      '[db] خطأ: connection timeout',
      '[cron] فشل مهمة: news-fetch',
    ],
  }
  const entries: LogEntry[] = []
  const now = Date.now()
  for (let i = 0; i < 50; i++) {
    const r = Math.random()
    const level: LogLevel = r > 0.85 ? 'error' : r > 0.65 ? 'warning' : 'info'
    const pool = msgs[level]
    const message = pool[Math.floor(Math.random() * pool.length)]
    entries.push({
      id: `log-${i}`,
      level,
      message,
      source: message.match(/\[(\w+)\]/)?.[1] || 'system',
      timestamp: new Date(now - i * 30000 - Math.random() * 30000).toISOString(),
    })
  }
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

const levelCfg = {
  info: { color: C.accent, Icon: Info, label: 'معلومة' },
  warning: { color: C.amber, Icon: AlertTriangle, label: 'تحذير' },
  error: { color: C.danger, Icon: XCircle, label: 'خطأ' },
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogLevel | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { setLogs(genLogs()) }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      const e = genLogs()[0]
      if (e) {
        e.id = `log-${Date.now()}`
        e.timestamp = new Date().toISOString()
        setLogs(p => [e, ...p].slice(0, 200))
      }
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  const filtered = logs.filter(l => {
    const mf = filter === 'all' || l.level === filter
    const ms = !search || l.message.toLowerCase().includes(search.toLowerCase())
    return mf && ms
  })

  const counts = { all: logs.length, info: logs.filter(l => l.level === 'info').length, warning: logs.filter(l => l.level === 'warning').length, error: logs.filter(l => l.level === 'error').length }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>سجلات النظام</h1>
          <p style={{ fontSize: 12, color: C.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>مراقبة الأحداث والأخطاء في الوقت الفعلي</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setLogs(genLogs())} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,229,255,0.06)', color: C.accent, fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
            <RefreshCw size={12} /> تحديث
          </button>
          <button onClick={() => setLogs([])} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.danger}25`, background: `${C.danger}08`, color: C.danger, fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
            <Trash2 size={12} /> مسح
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'info', 'warning', 'error'] as const).map(lv => {
          const color = lv === 'all' ? C.accent : levelCfg[lv].color
          const label = lv === 'all' ? 'الكل' : levelCfg[lv].label
          return (
            <button key={lv} onClick={() => setFilter(lv)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: filter === lv ? `1px solid ${color}30` : `1px solid ${C.border}`, background: filter === lv ? `${color}10` : 'rgba(255,255,255,0.03)', color: filter === lv ? color : C.muted, fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
              {label}
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{counts[lv]}</span>
            </button>
          )
        })}
        <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}` }}>
          <Filter size={12} color={C.muted} />
          <input type="text" placeholder="بحث في السجلات..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 11, fontFamily: "'Cairo', sans-serif" }} dir="rtl" />
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ScrollText size={12} color={C.accent} />
            <span style={{ fontSize: 10, color: C.muted }}>سجل الأحداث</span>
          </div>
          <span style={{ fontSize: 9, color: C.muted }}>{filtered.length} سجل</span>
        </div>
        <div className="custom-scrollbar" style={{ height: 480, overflowY: 'auto', padding: 4, background: 'rgba(0,0,0,0.3)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>لا توجد سجلات</div>
          ) : filtered.map(log => {
            const cfg = levelCfg[log.level]
            const LIcon = cfg.Icon
            return (
              <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderRadius: 4, marginBottom: 2, background: `${cfg.color}10`, borderLeft: `2px solid ${cfg.color}`, fontSize: 11, lineHeight: 1.6 }}>
                <LIcon size={12} color={cfg.color} style={{ flexShrink: 0, marginTop: 3 }} />
                <span style={{ color: C.muted, flexShrink: 0, fontSize: 10 }} dir="ltr">{new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span style={{ color: C.text, flex: 1, direction: 'ltr', textAlign: 'left' }}>{log.message}</span>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
      `}</style>
    </div>
  )
}
