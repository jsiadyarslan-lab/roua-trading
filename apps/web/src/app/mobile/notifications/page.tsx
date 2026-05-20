'use client'

import { useState } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { useNotificationStore, type NotifSource, type NotifAction, type Notification } from '@/hooks/useNotificationStore'
import { useRouter } from 'next/navigation'
import {
  Bell, BellOff, CheckCheck, Trash2, TrendingUp, TrendingDown,
  Cpu, Brain, Radio, Activity, Shield, AlertTriangle, Info,
  ChevronDown, Volume2, VolumeX, Eye, Zap
} from 'lucide-react'

const SOURCE_CONFIG: Record<NotifSource, { label: string; icon: any; color: string }> = {
  bot: { label: 'المنفذ', icon: Cpu, color: '#059669' },
  ai: { label: 'الذكاء', icon: Brain, color: '#B388FF' },
  scanner: { label: 'السكانر', icon: Radio, color: '#00FFA3' },
  trade: { label: 'التداول', icon: Activity, color: '#00D4FF' },
  system: { label: 'النظام', icon: Shield, color: '#8B92A8' },
  agent: { label: 'الوكيل', icon: Zap, color: '#FF9F43' },
}

const ACTION_CONFIG: Record<NotifAction, { label: string; color: string; bg: string }> = {
  BUY: { label: 'شراء', color: '#00FFA3', bg: 'rgba(0,255,163,0.08)' },
  SELL: { label: 'بيع', color: '#FF4757', bg: 'rgba(255,69,58,0.08)' },
  INFO: { label: 'معلومة', color: '#00D4FF', bg: 'rgba(0,212,255,0.08)' },
  WARN: { label: 'تحذير', color: '#FFB800', bg: 'rgba(255,184,0,0.08)' },
  CLOSE: { label: 'إغلاق', color: '#FF9F43', bg: 'rgba(255,159,67,0.08)' },
  CANCEL: { label: 'إلغاء', color: '#8B92A8', bg: 'rgba(139,146,168,0.08)' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent: { label: 'عاجل', color: '#FF4757' },
  high: { label: 'مهم', color: '#FFB800' },
  medium: { label: 'متوسط', color: '#00D4FF' },
  low: { label: 'منخفض', color: '#8B92A8' },
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'الآن'
  if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} د`
  if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} س`
  return new Date(ts).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })
}

export default function MobileNotificationsPage() {
  const router = useRouter()
  const {
    notifications, settings,
    markRead, markAllRead, dismiss, clearAll, updateSettings,
  } = useNotificationStore()

  const [filter, setFilter] = useState<NotifSource | 'all'>('all')
  const [showSettings, setShowSettings] = useState(false)

  const unread = notifications.filter(n => !n.read).length
  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.source === filter)
  const sourceCounts = notifications.reduce((acc, n) => {
    acc[n.source] = (acc[n.source] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="r-page">
      <PageHeader
        title="الإشعارات الذكية"
        subtitle={unread > 0 ? `${unread} غير مقروء` : 'لا إشعارات جديدة'}
      />

      {/* Quick Actions */}
      {notifications.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 var(--space-lg)', marginBottom: 8 }}>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10,
                background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)',
                color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                cursor: 'pointer', touchAction: 'manipulation', flex: 1, justifyContent: 'center',
              }}
            >
              <CheckCheck size={14} />
              قراءة الكل
            </button>
          )}
          <button
            onClick={() => { if (confirm('حذف جميع الإشعارات؟')) clearAll() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 10,
              background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)',
              color: '#FF4757', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-cairo)',
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', borderRadius: 10,
              background: 'rgba(179,136,255,0.06)', border: '1px solid rgba(179,136,255,0.15)',
              color: '#B388FF', fontSize: 10, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            {showSettings ? <Eye size={14} /> : <Bell size={14} />}
          </button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Bell size={16} color="#B388FF" />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>إعدادات الإشعارات</span>
          </div>

          {/* Main toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {settings.enabled ? <Bell size={14} color="#00D4FF" /> : <BellOff size={14} color="#FF4757" />}
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الإشعارات</span>
            </div>
            <button onClick={() => updateSettings({ enabled: !settings.enabled })} style={{ width: 42, height: 24, borderRadius: 12, position: 'relative', border: 'none', background: settings.enabled ? '#00D4FF' : 'rgba(255,255,255,0.1)', cursor: 'pointer', touchAction: 'manipulation' }}>
              <div style={{ position: 'absolute', top: 2, insetInlineStart: settings.enabled ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} />
            </button>
          </div>

          {/* Sound */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {settings.soundEnabled ? <Volume2 size={14} color="#FFB800" /> : <VolumeX size={14} color="#8B92A8" />}
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الصوت</span>
            </div>
            <button onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })} style={{ width: 42, height: 24, borderRadius: 12, position: 'relative', border: 'none', background: settings.soundEnabled ? '#FFB800' : 'rgba(255,255,255,0.1)', cursor: 'pointer', touchAction: 'manipulation' }}>
              <div style={{ position: 'absolute', top: 2, insetInlineStart: settings.soundEnabled ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} />
            </button>
          </div>

          {/* Source toggles */}
          {(['bot', 'ai', 'scanner', 'trade'] as const).map(src => {
            const cfg = SOURCE_CONFIG[src]
            const key = `${src}Alerts` as keyof typeof settings
            const enabled = settings[key] as boolean
            const IconComp = cfg.icon
            return (
              <div key={src} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconComp size={12} color={cfg.color} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{cfg.label}</span>
                </div>
                <button onClick={() => updateSettings({ [key]: !enabled })} style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', border: 'none', background: enabled ? cfg.color : 'rgba(255,255,255,0.1)', cursor: 'pointer', touchAction: 'manipulation' }}>
                  <div style={{ position: 'absolute', top: 2, insetInlineStart: enabled ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} />
                </button>
              </div>
            )
          })}
        </Card>
      )}

      {/* Filter Tabs */}
      {notifications.length > 0 && (
        <div className="r-tabs" style={{ margin: '0 var(--space-lg) var(--space-sm)' }}>
          <button className={`r-tabs__item ${filter === 'all' ? 'r-tabs__item--active' : ''}`} onClick={() => setFilter('all')}>
            الكل {notifications.length}
          </button>
          {Object.entries(SOURCE_CONFIG).map(([src, cfg]) => {
            const count = sourceCounts[src] || 0
            if (count === 0) return null
            return (
              <button key={src} className={`r-tabs__item ${filter === src ? 'r-tabs__item--active' : ''}`} onClick={() => setFilter(src as NotifSource)}>
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Notification List */}
      {notifications.length === 0 ? (
        <Card>
          <div className="r-empty">
            <Bell size={40} color="#8B92A8" />
            <div className="r-empty__title">لا توجد إشعارات</div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 4 }}>
              ستظهر هنا تنبيهات التداول والتوصيات والتحذيرات
            </div>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="r-empty">
            <div className="r-empty__title">لا توجد إشعارات من هذا المصدر</div>
          </div>
        </Card>
      ) : filtered.map(notif => {
        const srcCfg = SOURCE_CONFIG[notif.source]
        const actCfg = ACTION_CONFIG[notif.action]
        const priCfg = PRIORITY_CONFIG[notif.priority]
        const SrcIcon = srcCfg.icon
        const isUnread = !notif.read

        return (
          <Card
            key={notif.id}
            onClick={() => {
              if (isUnread) markRead(notif.id)
              if (notif.pair) router.push(`/mobile/chart?symbol=${notif.pair}`)
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* Source Icon */}
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: `${srcCfg.color}12`, border: `1px solid ${srcCfg.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <SrcIcon size={18} color={srcCfg.color} />
                {isUnread && (
                  <div style={{
                    position: 'absolute', top: -2, insetInlineEnd: -2,
                    width: 8, height: 8, borderRadius: 4,
                    background: '#FF4757', boxShadow: '0 0 6px rgba(255,71,87,0.5)',
                  }} />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                    background: actCfg.bg, color: actCfg.color,
                    fontFamily: 'var(--font-cairo)',
                  }}>
                    {actCfg.label}
                  </span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: `${priCfg.color}10`, color: priCfg.color,
                    border: `0.5px solid ${priCfg.color}20`,
                    fontFamily: 'var(--font-cairo)',
                  }}>
                    {priCfg.label}
                  </span>
                  {notif.confidence !== undefined && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#B388FF', fontFamily: 'var(--font-mono)' }}>
                      {notif.confidence}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, fontWeight: isUnread ? 800 : 600, color: isUnread ? '#FFF' : '#8B92A8', fontFamily: 'var(--font-cairo)', lineHeight: 1.4 }}>
                  {notif.title}
                </div>
                <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', lineHeight: 1.3, marginTop: 2 }}>
                  {notif.body}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{timeAgo(notif.timestamp)}</span>
                  {notif.pair && (
                    <span style={{ fontSize: 8, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--font-mono)' }}>{notif.pair}</span>
                  )}
                  {notif.price && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-mono)' }}>${notif.price.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Dismiss */}
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(notif.id) }}
                style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                <X size={12} color="rgba(255,255,255,0.3)" />
              </button>
            </div>
          </Card>
        )
      })}

      <div style={{ height: 80 }} />
    </div>
  )
}
