'use client'

import { useState, useCallback, useMemo } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { BellRing, Cpu, Brain, ScanSearch, Activity, Trash2, Check, X, Zap, TrendingUp, TrendingDown, ChevronLeft, Filter } from 'lucide-react'

const SOURCE_ICONS: Record<string, typeof BellRing> = {
  bot: Cpu, ai: Brain, scanner: ScanSearch, trade: Activity, system: BellRing, agent: Cpu,
}

const ACTION_COLORS: Record<string, string> = {
  BUY: '#00FFA3', SELL: '#FF453A', INFO: '#00D4FF', WARN: '#FFB800', CLOSE: '#B388FF', CANCEL: '#8B92A8',
}

const ACTION_LABELS: Record<string, string> = {
  BUY: 'شراء', SELL: 'بيع', INFO: 'معلومة', WARN: 'تحذير', CLOSE: 'إغلاق', CANCEL: 'إلغاء',
}

type NotifFilter = 'all' | 'trade' | 'ai' | 'bot' | 'system'

export default function MobileNotificationsPage() {
  const notifications = useNotificationStore(s => s.notifications)
  const settings = useNotificationStore(s => s.settings)
  const updateSettings = useNotificationStore(s => s.updateSettings)
  const markRead = useNotificationStore(s => s.markRead)
  const markAllRead = useNotificationStore(s => s.markAllRead)
  const dismiss = useNotificationStore(s => s.dismiss)
  const clearAll = useNotificationStore(s => s.clearAll)

  const [activeFilter, setActiveFilter] = useState<NotifFilter>('all')
  const [showSettings, setShowSettings] = useState(true)

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications
    return notifications.filter(n => n.source === activeFilter)
  }, [notifications, activeFilter])

  // Stats
  const unreadCount = notifications.filter(n => !n.read).length
  const tradeCount = notifications.filter(n => n.source === 'trade').length
  const aiCount = notifications.filter(n => n.source === 'ai').length
  const botCount = notifications.filter(n => n.source === 'bot').length

  // Time formatting
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    if (diff < 60000) return 'الآن'
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} د`
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} س`
    return new Date(timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="الإشعارات" subtitle={`${unreadCount} غير مقروء`} right={
        notifications.length > 0 ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={markAllRead} style={{ background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Check size={12} color="#00D4FF" />
              <span style={{ fontSize: 8, fontWeight: 700, color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>قراءة الكل</span>
            </button>
            <button onClick={clearAll} style={{ background: 'rgba(255,69,58,0.08)', border: '0.5px solid rgba(255,69,58,0.15)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
              <Trash2 size={12} color="#FF453A" />
            </button>
          </div>
        ) : undefined
      } />

      {/* Unread Summary */}
      {unreadCount > 0 && (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #FF453A, #FF6B6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BellRing size={18} color="#FFF" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>لديك {unreadCount} إشعار جديد</div>
              <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>
                {tradeCount > 0 && `${tradeCount} تداول `}{aiCount > 0 && `${aiCount} ذكاء `}{botCount > 0 && `${botCount} بوت`}
              </div>
            </div>
            <button onClick={markAllRead} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', cursor: 'pointer' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>قراءة الكل</span>
            </button>
          </div>
        </IOSCard>
      )}

      {/* Notification Settings */}
      <IOSCard>
        <button onClick={() => setShowSettings(!showSettings)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="#00D4FF" />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>إعدادات الإشعارات</span>
          </div>
          <ChevronLeft size={16} color="rgba(255,255,255,0.3)" style={{ transform: showSettings ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
        </button>
        {showSettings && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cpu size={12} color="#059669" />
                <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات البوت</span>
              </div>
              <IOSSwitch value={settings.botAlerts} onChange={v => updateSettings({ botAlerts: v })} color="#059669" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={12} color="#B388FF" />
                <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات AI</span>
              </div>
              <IOSSwitch value={settings.aiAlerts} onChange={v => updateSettings({ aiAlerts: v })} color="#B388FF" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ScanSearch size={12} color="#00D4FF" />
                <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات السكانر</span>
              </div>
              <IOSSwitch value={settings.scannerAlerts} onChange={v => updateSettings({ scannerAlerts: v })} color="#00D4FF" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={12} color="#00FFA3" />
                <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات التداول</span>
              </div>
              <IOSSwitch value={settings.tradeAlerts} onChange={v => updateSettings({ tradeAlerts: v })} color="#00FFA3" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BellRing size={12} color="#d4af37" />
                <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الصوت</span>
              </div>
              <IOSSwitch value={settings.soundEnabled} onChange={v => updateSettings({ soundEnabled: v })} color="#d4af37" />
            </div>
          </div>
        )}
      </IOSCard>

      {/* Filter Tabs */}
      {notifications.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: 8, display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2, margin: '0 16px 8px', direction: 'rtl' }}>
          {([
            { key: 'all' as NotifFilter, label: 'الكل', count: notifications.length },
            { key: 'trade' as NotifFilter, label: 'تداول', count: tradeCount },
            { key: 'ai' as NotifFilter, label: 'AI', count: aiCount },
            { key: 'bot' as NotifFilter, label: 'بوت', count: botCount },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={{ flex: 1, padding: '5px 8px', borderRadius: 8, background: activeFilter === tab.key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: activeFilter === tab.key ? 800 : 600, color: activeFilter === tab.key ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>{tab.label}</span>
              {tab.count > 0 && <span style={{ fontSize: 8, fontWeight: 800, color: activeFilter === tab.key ? '#00D4FF' : 'rgba(255,255,255,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>{tab.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Notification list */}
      {filteredNotifications.length === 0 ? (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <BellRing size={32} color="#8B92A8" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>لا توجد إشعارات</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>ستظهر الإشعارات هنا عند وصولها</div>
          </div>
        </IOSCard>
      ) : (
        filteredNotifications.slice(0, 30).map(n => {
          const Icon = SOURCE_ICONS[n.source] || BellRing
          const actionColor = ACTION_COLORS[n.action] || '#8B92A8'
          const actionLabel = ACTION_LABELS[n.action] || ''
          const isBuy = n.action === 'BUY'
          const isSell = n.action === 'SELL'
          
          return (
            <IOSCard key={n.id} onClick={() => markRead(n.id)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: n.read ? 0.5 : 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${actionColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `0.5px solid ${actionColor}20` }}>
                  <Icon size={16} color={actionColor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{n.title}</span>
                    {actionLabel && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: actionColor, fontFamily: "'Cairo', sans-serif", padding: '1px 5px', borderRadius: 4, background: `${actionColor}12`, border: `0.5px solid ${actionColor}20` }}>{actionLabel}</span>
                    )}
                    {!n.read && (
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: '#00D4FF', boxShadow: '0 0 6px rgba(0,212,255,0.5)', flexShrink: 0 }} />
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>{n.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: "'JetBrains Mono', monospace" }}>{formatTime(n.timestamp)}</span>
                    {n.pair && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", padding: '1px 4px', borderRadius: 3, background: 'rgba(0,212,255,0.06)' }}>{n.pair}</span>
                    )}
                    {n.price && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${n.price.toFixed(2)}</span>
                    )}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); dismiss(n.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                  <X size={12} color="rgba(255,255,255,0.2)" />
                </button>
              </div>
            </IOSCard>
          )
        })
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
