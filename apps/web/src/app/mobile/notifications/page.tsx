'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useNotificationStore, type Notification } from '@/hooks/useNotificationStore'
import { Bell, BellOff, Trash2, CheckCheck, TrendingUp, TrendingDown, AlertTriangle, Info, Cpu, Brain, Activity, Shield, Zap } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

function sourceIcon(source: string) {
  switch (source) {
    case 'bot': return <Cpu size={14} color="#FF9F43" />
    case 'ai': return <Brain size={14} color="#B388FF" />
    case 'scanner': return <Activity size={14} color={C.accent} />
    case 'trade': return <Zap size={14} color={C.success} />
    case 'agent': return <Shield size={14} color="#00C853" />
    default: return <Bell size={14} color={C.text2} />
  }
}

function actionIcon(action: string) {
  switch (action) {
    case 'BUY': return <TrendingUp size={12} color={C.success} />
    case 'SELL': return <TrendingDown size={12} color={C.danger} />
    case 'WARN': return <AlertTriangle size={12} color={C.amber} />
    default: return <Info size={12} color={C.accent} />
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'BUY': return C.success
    case 'SELL': return C.danger
    case 'WARN': return C.amber
    default: return C.accent
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'الآن'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} د`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} س`
  return new Date(ts).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
}

export default function MobileNotificationsPage() {
  const router = useRouter()
  const { notifications, settings, markRead, markAllRead, dismiss, clearAll, updateSettings } = useNotificationStore()

  const unread = notifications.filter(n => !n.read)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="m-page">
      <MobilePageHeader
        title="مركز الإشعارات"
        subtitle={unread.length > 0 ? `${unread.length} غير مقروء` : 'لا إشعارات جديدة'}
        onBack={() => router.back()}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {unread.length > 0 && (
              <button onClick={markAllRead} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCheck size={10} color={C.accent} />
                <span style={{ fontSize: 8, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>قراءة الكل</span>
              </button>
            )}
            <button onClick={() => setShowSettings(!showSettings)} style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Bell size={13} color={C.text2} />
            </button>
          </div>
        }
      />

      {/* Settings Panel */}
      {showSettings && (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Bell size={14} color={C.accent} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>إعدادات الإشعارات</span>
          </div>
          {([
            { key: 'enabled' as const, label: 'تفعيل الإشعارات', color: C.accent },
            { key: 'soundEnabled' as const, label: 'صوت التنبيه', color: C.amber },
            { key: 'browserNotifications' as const, label: 'إشعارات المتصفح', color: C.success },
            { key: 'botAlerts' as const, label: 'تنبيهات المنفذ الذكي', color: '#FF9F43' },
            { key: 'aiAlerts' as const, label: 'تنبيهات AI', color: '#B388FF' },
            { key: 'scannerAlerts' as const, label: 'تنبيهات السكانر', color: C.accent },
            { key: 'tradeAlerts' as const, label: 'تنبيهات التداول', color: C.success },
          ] as const).map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${C.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
              <IOSSwitch value={settings[item.key]} onChange={(v) => updateSettings({ [item.key]: v })} color={item.color} />
            </div>
          ))}
        </IOSCard>
      )}

      {/* Actions */}
      {notifications.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginBottom: 12 }}>
          <button onClick={clearAll} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: `${C.danger}08`, border: `0.5px solid ${C.danger}18`, cursor: 'pointer' }}>
            <Trash2 size={10} color={C.danger} />
            <span style={{ fontSize: 9, fontWeight: 800, color: C.danger, fontFamily: "'Cairo', sans-serif" }}>مسح الكل</span>
          </button>
        </div>
      )}

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
          <BellOff size={40} color={C.text2} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد إشعارات</div>
          <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>ستظهر هنا تنبيهات التداول والتحليلات</div>
        </div>
      ) : (
        notifications.map((notif: Notification) => {
          const ac = actionColor(notif.action)
          const actionLabel = notif.action === 'BUY' ? 'شراء' : notif.action === 'SELL' ? 'بيع' : notif.action === 'WARN' ? 'تحذير' : notif.action === 'CLOSE' ? 'إغلاق' : notif.action === 'CANCEL' ? 'إلغاء' : 'معلومة'
          const sourceLabel = notif.source === 'bot' ? 'المنفذ الذكي' : notif.source === 'ai' ? 'AI' : notif.source === 'scanner' ? 'السكانر' : notif.source === 'trade' ? 'تداول' : notif.source === 'agent' ? 'الوكيل' : 'نظام'

          return (
            <IOSCard key={notif.id} highlight={!notif.read} onClick={() => markRead(notif.id)}>
              <div style={{ display: 'flex', gap: 10 }}>
                {/* Icon */}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${ac}10`, border: `0.5px solid ${ac}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sourceIcon(notif.source)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{notif.title}</span>
                      {!notif.read && (
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: C.accent, boxShadow: `0 0 6px ${C.accent}60` }} />
                      )}
                    </div>
                    <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{formatTime(notif.timestamp)}</span>
                  </div>

                  <p style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {notif.body}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 6px', borderRadius: 4, background: `${ac}10` }}>
                        {actionIcon(notif.action)}
                        <span style={{ fontSize: 8, fontWeight: 800, color: ac, fontFamily: "'Cairo', sans-serif" }}>{actionLabel}</span>
                      </div>
                      <span style={{ fontSize: 7, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{sourceLabel}</span>
                      {notif.pair && (
                        <span style={{ fontSize: 7, fontWeight: 700, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{notif.pair}</span>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); dismiss(notif.id) }} style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={10} color={C.text2} />
                    </button>
                  </div>
                </div>
              </div>
            </IOSCard>
          )
        })
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
