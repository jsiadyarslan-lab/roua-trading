'use client'

import { useState, useEffect, useCallback } from 'react'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { T } from '@/lib/unified-tokens'
import {
  TrendingUp, TrendingDown, Target, BarChart2, RefreshCw, Loader2,
  AlertTriangle, Clock, Zap, ArrowUpRight, ArrowDownRight, Minus,
  Eye, Bell, BellRing, Filter, Activity, ChevronDown, Shield
} from 'lucide-react'

/* ── Types ── */
interface TradingSignal {
  id: string
  pair: string
  action: 'BUY' | 'SELL' | 'WAIT'
  confidence: number
  reason: string
  entryPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  status: 'ACTIVE' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED'
  expiresAt: string
  createdAt: string
  source?: string
}

interface SignalStats {
  totalSignals: number
  activeSignals: number
  executedSignals: number
  winRate: number
  avgConfidence: number
}

/* ── Helper ── */
function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '—'
  if (value >= 1000) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'منتهية'
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hours > 0) return `${hours}س ${mins}د`
  return `${mins}د`
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'الآن'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}د`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}س`
  return `${Math.floor(diff / 86400000)}ي`
}

/* ── Action Colors ── */
const actionConfig = {
  BUY: { color: T.green, bg: `${T.green}18`, border: `${T.green}44`, icon: ArrowUpRight, label: 'شراء' },
  SELL: { color: T.red, bg: `${T.red}18`, border: `${T.red}44`, icon: ArrowDownRight, label: 'بيع' },
  WAIT: { color: T.amber, bg: `${T.amber}18`, border: `${T.amber}44`, icon: Minus, label: 'انتظار' },
}

/* ── Main Page ── */
export default function SignalTrackerPage() {
  const [signals, setSignals] = useState<TradingSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'WAIT'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXECUTED' | 'EXPIRED'>('ALL')
  const [showFilters, setShowFilters] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)

  useScopedStyle(`
    @media (max-width: 767px) {
      .signal-page-root { min-height: 100% !important; height: 100% !important; }
    }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #0B0E14; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
    .signal-filters-row { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    @media (max-width: 767px) {
      .signal-stats-row { flex-wrap: wrap !important; }
      .signal-stats-row > * { flex: 1 1 calc(50% - 4px) !important; min-width: 140px; }
      .signal-cards { display: flex; flex-direction: column; }
    }
  `)

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [activeRes, historyRes] = await Promise.allSettled([
        fetch('/api/signals/active'),
        fetch('/api/signals?limit=100'),
      ])

      let allSignals: TradingSignal[] = []

      if (activeRes.status === 'fulfilled' && activeRes.value.ok) {
        const activeData = await activeRes.value.json()
        const active = activeData?.data || activeData?.signals || (Array.isArray(activeData) ? activeData : [])
        allSignals = [...allSignals, ...active]
      }

      if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
        const historyData = await historyRes.value.json()
        const history = historyData?.data || historyData?.signals || (Array.isArray(historyData) ? historyData : [])
        // Merge, avoiding duplicates
        const existingIds = new Set(allSignals.map(s => s.id))
        for (const s of history) {
          if (!existingIds.has(s.id)) {
            allSignals.push(s)
          }
        }
      }

      setSignals(allSignals)
    } catch (err: any) {
      setError(`خطأ في الاتصال: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSignals() }, [fetchSignals])

  // ── Computed Stats ──
  const stats: SignalStats = (() => {
    const active = signals.filter(s => s.status === 'ACTIVE')
    const executed = signals.filter(s => s.status === 'EXECUTED')
    const totalConf = signals.reduce((sum, s) => sum + s.confidence, 0)

    // Win rate approximation based on executed signals
    // For now we use confidence as a proxy
    const winRate = signals.length > 0
      ? signals.filter(s => s.action !== 'WAIT' && s.confidence >= 65).length / Math.max(signals.filter(s => s.action !== 'WAIT').length, 1) * 100
      : 0

    return {
      totalSignals: signals.length,
      activeSignals: active.length,
      executedSignals: executed.length,
      winRate,
      avgConfidence: signals.length > 0 ? Math.round(totalConf / signals.length) : 0,
    }
  })()

  // ── Filtered Signals ──
  const filteredSignals = signals.filter(s => {
    if (actionFilter !== 'ALL' && s.action !== actionFilter) return false
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
    return true
  }).sort((a, b) => {
    // Active signals first, then by date
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="signal-page-root" style={{
      width: '100%', minHeight: 'calc(100vh - 100px)',
      background: T.bg, overflow: 'auto',
      padding: '12px 14px', boxSizing: 'border-box',
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: T.accent }} />
        <h1 style={{
          fontFamily: "'Cairo', sans-serif", fontWeight: 900,
          fontSize: 18, color: T.text, margin: 0,
        }}>متابع الإشارات</h1>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setNotifEnabled(!notifEnabled)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7,
            border: `0.5px solid ${notifEnabled ? T.accent : T.border}`,
            background: notifEnabled ? `${T.accent}18` : T.card,
            color: notifEnabled ? T.accent : T.text2,
            fontFamily: "'Cairo', sans-serif", fontSize: 10,
            cursor: 'pointer',
          }}
        >
          {notifEnabled ? <BellRing size={11} /> : <Bell size={11} />}
          {notifEnabled ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}
        </button>
        <button
          onClick={fetchSignals}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7,
            border: `0.5px solid ${T.border}`, background: T.card,
            color: T.text2, fontFamily: "'Cairo', sans-serif",
            fontSize: 10, cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="signal-stats-row" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <StatCard label="الإشارات النشطة" value={String(stats.activeSignals)} color={T.cyan} icon={Activity} note={stats.totalSignals > 0 ? `من ${stats.totalSignals}` : undefined} />
        <StatCard label="متوسط الثقة" value={`${stats.avgConfidence}%`} color={T.accent} icon={Target} note={stats.avgConfidence >= 70 ? 'ممتاز' : stats.avgConfidence >= 50 ? 'جيد' : undefined} />
        <StatCard label="نسبة النجاح" value={`${stats.winRate.toFixed(0)}%`} color={T.green} icon={TrendingUp} />
        <StatCard label="تم التنفيذ" value={String(stats.executedSignals)} color={T.amber} icon={Zap} />
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: `${T.red}08`, border: `0.5px solid ${T.red}22`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ color: T.red }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.red }}>{error}</span>
          <button onClick={fetchSignals} style={{
            padding: '3px 10px', borderRadius: 5,
            background: `${T.red}18`, color: T.red,
            border: `0.5px solid ${T.red}44`,
            fontFamily: "'Cairo', sans-serif", fontSize: 9.5, cursor: 'pointer',
          }}>إعادة المحاولة</button>
        </div>
      )}

      {/* ── Filters Toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7,
            border: `0.5px solid ${showFilters ? T.blue : T.border}`,
            background: showFilters ? `${T.blue}10` : T.card,
            color: showFilters ? T.cyan : T.text2,
            fontFamily: "'Cairo', sans-serif", fontSize: 10, cursor: 'pointer',
          }}
        >
          <Filter size={11} />
          فلترة
          <ChevronDown size={10} style={{ transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {(actionFilter !== 'ALL' || statusFilter !== 'ALL') && (
          <button
            onClick={() => { setActionFilter('ALL'); setStatusFilter('ALL') }}
            style={{
              padding: '3px 10px', borderRadius: 5,
              background: `${T.blue}10`, color: T.cyan,
              border: `0.5px solid ${T.blue}33`,
              fontFamily: "'Cairo', sans-serif", fontSize: 9, cursor: 'pointer',
            }}
          >
            إزالة الفلاتر
          </button>
        )}
      </div>

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
        }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3 }}>نوع الإشارة</span>
            <div className="signal-filters-row" style={{ marginTop: 6 }}>
              {(['ALL', 'BUY', 'SELL', 'WAIT'] as const).map(action => (
                <button key={action} onClick={() => setActionFilter(action)} style={{
                  padding: '4px 12px', borderRadius: 6,
                  background: actionFilter === action ? (action === 'ALL' ? `${T.blue}18` : actionConfig[action].bg) : 'transparent',
                  border: `0.5px solid ${actionFilter === action ? (action === 'ALL' ? T.blue : actionConfig[action].border) : T.border}`,
                  color: actionFilter === action ? (action === 'ALL' ? T.cyan : actionConfig[action].color) : T.text3,
                  fontFamily: "'Cairo', sans-serif", fontSize: 10, cursor: 'pointer',
                  fontWeight: actionFilter === action ? 700 : 400,
                }}>
                  {action === 'ALL' ? 'الكل' : actionConfig[action].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3 }}>الحالة</span>
            <div className="signal-filters-row" style={{ marginTop: 6 }}>
              {(['ALL', 'ACTIVE', 'EXECUTED', 'EXPIRED'] as const).map(status => (
                <button key={status} onClick={() => setStatusFilter(status)} style={{
                  padding: '4px 12px', borderRadius: 6,
                  background: statusFilter === status ? `${T.blue}18` : 'transparent',
                  border: `0.5px solid ${statusFilter === status ? T.blue : T.border}`,
                  color: statusFilter === status ? T.cyan : T.text3,
                  fontFamily: "'Cairo', sans-serif", fontSize: 10, cursor: 'pointer',
                  fontWeight: statusFilter === status ? 700 : 400,
                }}>
                  {status === 'ALL' ? 'الكل' : status === 'ACTIVE' ? 'نشطة' : status === 'EXECUTED' ? 'منفذة' : 'منتهية'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Loader2 className="animate-spin" style={{ color: T.blue, margin: '0 auto' }} size={28} />
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3, marginTop: 8 }}>جاري تحميل الإشارات...</p>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && filteredSignals.length === 0 && (
        <div style={{
          padding: 48, textAlign: 'center',
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 12,
        }}>
          <Activity size={40} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 12px' }} />
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, color: T.text2, marginBottom: 4 }}>
            لا توجد إشارات حالياً
          </p>
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>
            يتم إنشاء الإشارات تلقائياً من المجلس الذكي والمنفذ الذكي
          </p>
        </div>
      )}

      {/* ── Signal Cards ── */}
      {!loading && filteredSignals.length > 0 && (
        <div className="signal-cards" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredSignals.map(signal => {
            const config = actionConfig[signal.action]
            const ActionIcon = config.icon
            const isActive = signal.status === 'ACTIVE'
            const isExpired = signal.status === 'EXPIRED'

            return (
              <div key={signal.id} style={{
                background: T.card,
                border: `0.5px solid ${isActive ? config.border : T.border}`,
                borderRight: isActive ? `3px solid ${config.color}` : `0.5px solid ${T.border}`,
                borderRadius: 10, overflow: 'hidden',
                opacity: isExpired ? 0.6 : 1,
                transition: 'transform 0.2s',
              }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
              >
                {/* Signal Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px',
                  borderBottom: `0.5px solid ${T.border}`,
                  background: isActive ? `${config.bg}` : 'transparent',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: config.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `0.5px solid ${config.border}`,
                  }}>
                    <ActionIcon size={14} style={{ color: config.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 800,
                        color: T.text,
                      }}>{signal.pair}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 5,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                        background: config.bg, color: config.color,
                        border: `0.5px solid ${config.border}`,
                      }}>{config.label}</span>
                      {isActive && (
                        <span style={{
                          padding: '1px 6px', borderRadius: 4,
                          fontFamily: "'Cairo', sans-serif", fontSize: 8, fontWeight: 700,
                          background: `${T.green}10`, color: T.green,
                          border: `0.5px solid ${T.green}33`,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          <span style={{ width: 4, height: 4, borderRadius: 2, background: T.green, animation: 'pulse 2s infinite' }} />
                          نشطة
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 16, fontWeight: 800,
                      color: signal.confidence >= 75 ? T.green : signal.confidence >= 50 ? T.amber : T.text3,
                    }}>
                      {signal.confidence}%
                    </div>
                    <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8, color: T.text3 }}>
                      ثقة
                    </div>
                  </div>
                </div>

                {/* Signal Body */}
                <div style={{ padding: '10px 14px' }}>
                  {/* Price Levels */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 8, marginBottom: 10,
                  }}>
                    <div style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: T.bgLight, textAlign: 'center',
                    }}>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8, color: T.text3, marginBottom: 2 }}>الدخول</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: T.text }}>
                        {fmtPrice(signal.entryPrice)}
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: `${T.red}06`, textAlign: 'center',
                      border: `0.5px solid ${T.red}11`,
                    }}>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8, color: T.red, marginBottom: 2 }}>وقف الخسارة</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: T.red }}>
                        {fmtPrice(signal.stopLoss)}
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: `${T.green}06`, textAlign: 'center',
                      border: `0.5px solid ${T.green}11`,
                    }}>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8, color: T.green, marginBottom: 2 }}>جني الأرباح</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: T.green }}>
                        {fmtPrice(signal.takeProfit)}
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  {signal.reason && (
                    <p style={{
                      fontFamily: "'Cairo', sans-serif", fontSize: 11,
                      color: T.text2, lineHeight: 1.7,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    }}>
                      {signal.reason}
                    </p>
                  )}

                  {/* Footer */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginTop: 8, fontSize: 9, color: T.text3,
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={9} />
                      {formatTimeAgo(signal.createdAt)}
                    </span>
                    {isActive && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        color: timeLeft(signal.expiresAt) === 'منتهية' ? T.red : T.amber,
                      }}>
                        <Zap size={9} />
                        متبقي: {timeLeft(signal.expiresAt)}
                      </span>
                    )}
                    {signal.source && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 4,
                        background: T.bgLight, color: T.text3,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                      }}>
                        {signal.source === 'smart_executor' ? 'المنفذ' :
                         signal.source === 'agent' ? 'الوكيل' :
                         signal.source === 'council' ? 'المجلس' : signal.source}
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Eye size={9} />
                      <Shield size={9} />
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Disclaimer ── */}
      <div style={{
        marginTop: 16, padding: '10px 16px',
        background: `${T.amber}06`, border: `0.5px solid ${T.amber}18`,
        borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertTriangle size={14} style={{ color: T.amber, flexShrink: 0 }} />
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.amber }}>
          الإشارات لأغراض تعليمية فقط ولا تُعد نصيحة استثمارية. تداول بمسؤولية ولا تستثمر أكثر مما يمكنك تحمل خسارته.
        </span>
      </div>
    </div>
  )
}

/* ── Stat Card Component ── */
function StatCard({ label, value, color, icon: Icon, note }: {
  label: string; value: string; color: string; icon: any; note?: string
}) {
  return (
    <div style={{
      flex: 1, padding: '12px 14px',
      background: T.card,
      border: `0.5px solid ${color}22`,
      borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}66, transparent)`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text2 }}>{label}</span>
        <Icon size={13} color={color} strokeWidth={2} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.02em',
      }}>{value}</div>
      {note && (
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 7px', borderRadius: 8,
          background: `${color}14`,
          fontFamily: "'Cairo', sans-serif", fontSize: 9.5, color,
          alignSelf: 'flex-start', marginTop: 2,
        }}>{note}</div>
      )}
    </div>
  )
}
