'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { BellRing, Cpu, Brain, ScanSearch, Activity, Trash2, Check } from 'lucide-react'

const SOURCE_ICONS: Record<string, typeof BellRing> = {
  bot: Cpu, ai: Brain, scanner: ScanSearch, trade: Activity, system: BellRing, agent: Cpu,
}

const ACTION_COLORS: Record<string, string> = {
  BUY: '#00FFA3', SELL: '#FF453A', INFO: '#00D4FF', WARN: '#FFB800', CLOSE: '#B388FF', CANCEL: '#8B92A8',
}

export default function MobileNotificationsPage() {
  const notifications = useNotificationStore(s => s.notifications)
  const settings = useNotificationStore(s => s.settings)
  const updateSettings = useNotificationStore(s => s.updateSettings)
  const markRead = useNotificationStore(s => s.markRead)
  const markAllRead = useNotificationStore(s => s.markAllRead)
  const dismiss = useNotificationStore(s => s.dismiss)
  const clearAll = useNotificationStore(s => s.clearAll)

  return (
    <div className="m-page">
      <MobilePageHeader title="الإشعارات" subtitle={`${notifications.filter(n => !n.read).length} غير مقروء`} right={
        notifications.length > 0 ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={markAllRead} style={{ background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
              <Check size={14} color="#00D4FF" />
            </button>
            <button onClick={clearAll} style={{ background: 'rgba(255,69,58,0.08)', border: '0.5px solid rgba(255,69,58,0.15)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>
              <Trash2 size={14} color="#FF453A" />
            </button>
          </div>
        ) : undefined
      } />

      {/* Settings */}
      <IOSCard>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 10 }}>إعدادات الإشعارات</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات البوت</span>
          <IOSSwitch value={settings.botAlerts} onChange={v => updateSettings({ botAlerts: v })} color="#059669" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات AI</span>
          <IOSSwitch value={settings.aiAlerts} onChange={v => updateSettings({ aiAlerts: v })} color="#B388FF" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تنبيهات السكانر</span>
          <IOSSwitch value={settings.scannerAlerts} onChange={v => updateSettings({ scannerAlerts: v })} color="#00D4FF" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الصوت</span>
          <IOSSwitch value={settings.soundEnabled} onChange={v => updateSettings({ soundEnabled: v })} color="#d4af37" />
        </div>
      </IOSCard>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <BellRing size={32} color="#8B92A8" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>لا توجد إشعارات</div>
          </div>
        </IOSCard>
      ) : (
        notifications.slice(0, 30).map(n => {
          const Icon = SOURCE_ICONS[n.source] || BellRing
          const actionColor = ACTION_COLORS[n.action] || '#8B92A8'
          return (
            <IOSCard key={n.id} onClick={() => markRead(n.id)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: n.read ? 0.5 : 1 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `${actionColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={actionColor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>{n.body}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{new Date(n.timestamp).toLocaleTimeString('ar-EG')}</div>
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
