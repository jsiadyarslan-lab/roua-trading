'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ScrollText,
  Filter,
  Trash2,
  Download,
  RefreshCw,
  Info,
  AlertTriangle,
  XCircle,
  ChevronDown,
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

type LogLevel = 'info' | 'warning' | 'error'

interface LogEntry {
  id: string
  level: LogLevel
  message: string
  source: string
  timestamp: string
}

function getLevelConfig(level: LogLevel) {
  switch (level) {
    case 'info': return { color: COLORS.accent, bg: `${COLORS.accent}10`, border: `${COLORS.accent}25`, label: 'معلومة', Icon: Info }
    case 'warning': return { color: COLORS.amber, bg: `${COLORS.amber}10`, border: `${COLORS.amber}25`, label: 'تحذير', Icon: AlertTriangle }
    case 'error': return { color: COLORS.danger, bg: `${COLORS.danger}10`, border: `${COLORS.danger}25`, label: 'خطأ', Icon: XCircle }
  }
}

function generateLogs(): LogEntry[] {
  const entries: LogEntry[] = []
  const infoMessages = [
    '[auth] جلسة جديدة للمستخدم guest@roua.auto',
    '[engine] تم تنفيذ صفقة BTC/USD - شراء 0.5',
    '[scanner] فحص مكتمل - 24 زوج تم تحليله',
    '[portfolio] تحديث قيمة المحفظة - $125,430',
    '[signals] إشارة جديدة: ETH/USD بيع (ثقة: 72%)',
    '[bot] دورة تداول مكتملة - PnL: +$340',
    '[market] تحديث أسعار من Binance - 45 رمز',
    '[api] طلب GET /api/health - 200 (45ms)',
    '[db] اتصال نشط - 12 استعلام/ثانية',
    '[ws] عميل جديد متصل - إجمالي: 23',
  ]
  const warningMessages = [
    '[engine] استجابة بطيئة من API - 2100ms',
    '[scanner] فشل في جلب بيانات SOL/USD - إعادة المحاولة',
    '[memory] استخدام الذاكرة 82% - مراقبة مطلوبة',
    '[rate-limit] تجاوز الحد لـ IP: 192.168.1.45',
    '[auth] محاولة تسجيل فاشلة - بريد غير موجود',
    '[cache] انتهاء صلاحية التخزين المؤقت - إعادة بناء',
  ]
  const errorMessages = [
    '[exchange] فشل الاتصال بـ Binance - timeout',
    '[order] فشل تنفيذ الأمر ord-004 - رصيد غير كافٍ',
    '[db] خطأ في الاستعلام: connection timeout',
    '[ssl] تحذير: شهادة SSL تنتهي خلال 7 أيام',
    '[cron] فشل المهمة المجدولة: news-fetch',
  ]

  const now = Date.now()
  for (let i = 0; i < 50; i++) {
    const rand = Math.random()
    let level: LogLevel = 'info'
    let message = infoMessages[Math.floor(Math.random() * infoMessages.length)]

    if (rand > 0.85) {
      level = 'error'
      message = errorMessages[Math.floor(Math.random() * errorMessages.length)]
    } else if (rand > 0.65) {
      level = 'warning'
      message = warningMessages[Math.floor(Math.random() * warningMessages.length)]
    }

    const source = message.match(/\[(\w+)\]/)?.[1] || 'system'

    entries.push({
      id: `log-${i}`,
      level,
      message,
      source,
      timestamp: new Date(now - i * 30000 - Math.random() * 30000).toISOString(),
    })
  }

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogLevel | 'all'>('all')
  const [showFilter, setShowFilter] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [search, setSearch] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLogs(generateLogs())
  }, [])

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll, filter])

  // Add new log entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const newEntry = generateLogs()[0]
      if (newEntry) {
        newEntry.id = `log-${Date.now()}`
        newEntry.timestamp = new Date().toISOString()
        setLogs(prev => [newEntry, ...prev].slice(0, 200))
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const filteredLogs = logs.filter(log => {
    const matchFilter = filter === 'all' || log.level === filter
    const matchSearch = !search || log.message.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const infoCount = logs.filter(l => l.level === 'info').length
  const warningCount = logs.filter(l => l.level === 'warning').length
  const errorCount = logs.filter(l => l.level === 'error').length

  const handleClear = () => {
    setLogs([])
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>سجلات النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>مراقبة الأحداث والأخطاء في الوقت الفعلي</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setLogs(generateLogs())} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
            color: COLORS.accent, fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
          }}>
            <RefreshCw size={12} /> تحديث
          </button>
          <button onClick={handleClear} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            border: `1px solid ${COLORS.danger}25`, background: `${COLORS.danger}08`,
            color: COLORS.danger, fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
          }}>
            <Trash2 size={12} /> مسح
          </button>
        </div>
      </div>

      {/* Stats + Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { level: 'all' as const, label: 'الكل', count: logs.length, color: COLORS.accent },
          { level: 'info' as const, label: 'معلومات', count: infoCount, color: COLORS.accent },
          { level: 'warning' as const, label: 'تحذيرات', count: warningCount, color: COLORS.amber },
          { level: 'error' as const, label: 'أخطاء', count: errorCount, color: COLORS.danger },
        ].map(item => (
          <button
            key={item.level}
            onClick={() => setFilter(item.level)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6,
              border: filter === item.level ? `1px solid ${item.color}30` : `1px solid ${COLORS.border}`,
              background: filter === item.level ? `${item.color}10` : 'rgba(255,255,255,0.03)',
              color: filter === item.level ? item.color : COLORS.muted,
              fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color }} />
            {item.label}
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{item.count}</span>
          </button>
        ))}

        <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${COLORS.border}` }}>
          <Filter size={12} color={COLORS.muted} />
          <input
            type="text"
            placeholder="بحث في السجلات..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: COLORS.text, fontSize: 11, fontFamily: "'Cairo', sans-serif" }}
            dir="rtl"
          />
        </div>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          style={{
            padding: '6px 12px', borderRadius: 6,
            border: `1px solid ${autoScroll ? COLORS.success + '25' : COLORS.border}`,
            background: autoScroll ? `${COLORS.success}08` : 'rgba(255,255,255,0.03)',
            color: autoScroll ? COLORS.success : COLORS.muted,
            fontSize: 10, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
          }}
        >
          {autoScroll ? 'تمرير تلقائي' : 'تمرير يدوي'}
        </button>
      </div>

      {/* Logs Viewer */}
      <div style={{
        ...CARD_STYLE,
        padding: 0,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ScrollText size={12} color={COLORS.accent} />
            <span style={{ fontSize: 10, color: COLORS.muted }}>سجل الأحداث</span>
          </div>
          <span style={{ fontSize: 9, color: COLORS.muted }}>{filteredLogs.length} سجل</span>
        </div>
        <div style={{
          height: 480,
          overflowY: 'auto',
          padding: 4,
          background: 'rgba(0,0,0,0.3)',
        }} className="custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
              لا توجد سجلات
            </div>
          ) : (
            filteredLogs.map((log) => {
              const config = getLevelConfig(log.level)
              const LogIcon = config.Icon
              return (
                <div key={log.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 4,
                  marginBottom: 2,
                  background: `${config.bg}`,
                  borderLeft: `2px solid ${config.color}`,
                  fontSize: 11,
                  lineHeight: 1.6,
                }}>
                  <LogIcon size={12} color={config.color} style={{ flexShrink: 0, marginTop: 3 }} />
                  <span style={{ color: COLORS.muted, flexShrink: 0, fontSize: 10 }} dir="ltr">{formatTime(log.timestamp)}</span>
                  <span style={{ color: COLORS.text, flex: 1, direction: 'ltr', textAlign: 'left' }}>{log.message}</span>
                </div>
              )
            })
          )}
          <div ref={logsEndRef} />
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
