'use client'

import { useEffect, useState } from 'react'
import { X, TrendingUp, TrendingDown, Bot, Brain, ScanSearch, Zap } from 'lucide-react'
import { useNotificationStore, Notification, NotifSource, NotifAction } from '@/hooks/useNotificationStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'

/* ══ Helpers ══════════════════════════════════════════════ */
const SRC_ICON: Record<NotifSource, React.ReactNode> = {
  bot:     <Bot size={13} />,
  ai:      <Brain size={13} />,
  scanner: <ScanSearch size={13} />,
  trade:   <Zap size={13} />,
  system:  <Zap size={13} />,
}

const SRC_COLOR: Record<NotifSource, string> = {
  bot:     '#00f2ff',
  ai:      '#b388ff',
  scanner: '#FFB800',
  trade:   '#00C853',
  system:  '#8090A8',
}

const ACTION_COLOR: Record<NotifAction, string> = {
  BUY:   '#00C853',
  SELL:  '#FF3B30',
  INFO:  '#00f2ff',
  WARN:  '#FFB800',
  CLOSE: '#FF3B30',
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}ث`
  if (s < 3600) return `${Math.floor(s / 60)}د`
  return `${Math.floor(s / 3600)}س`
}

/* ══ Single Toast Card ════════════════════════════════════ */
function ToastCard({ notif, onDismiss }: { notif: Notification; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const color = SRC_COLOR[notif.source]
  const actionColor = ACTION_COLOR[notif.action]
  const { setSelectedSymbol } = useSymbolStore()

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 350)
    }, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        background: 'rgba(6,11,19,0.97)',
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 300,
        maxWidth: 360,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${color}15`,
        backdropFilter: 'blur(20px)',
        fontFamily: "'Cairo', sans-serif",
        direction: 'rtl',
        cursor: notif.pair ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (notif.pair) setSelectedSymbol(notif.pair)
      }}
    >
      {/* Progress bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `${color}33`, borderRadius: '10px 10px 0 0', overflow: 'hidden'
      }}>
        <div style={{
          height: '100%', width: '100%', background: color,
          animation: 'toast-progress 6s linear forwards',
        }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `${color}15`, border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          {SRC_ICON[notif.source]}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
  const color = SRC_COLOR[notif.source]
  const actionColor = ACTION_COLOR[notif.action]
  
  return (
    <div style={{
      width: 280,
      background: 'rgba(15,17,19,0.95)',
      backdropFilter: 'blur(12px)',
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
      transform: visible ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.9)',
      opacity: visible ? 1 : 0,
      transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Progress Bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, height: 2, background: color,
        width: '100%', animation: 'toast-progress 5s linear forwards'
      }} />
      
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: `${color}15`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {SRC_ICON[notif.source]}
      </div>
      
      <div style={{ flex: 1, minWidth: 0, marginTop: -2 }}>
        <h4 style={{ fontSize: 11, fontWeight: 800, color: '#e6ebf5', margin: '0 0 3px 0' }}>{notif.title}</h4>
        <p style={{ fontSize: 10, color: '#8090A8', margin: 0, lineHeight: 1.4 }}>{notif.body}</p>
        
        {notif.pair && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#fff', fontWeight: 700 }}>{notif.pair}</span>
            {notif.price && <span style={{ fontSize: 9, color: '#8090A8' }}>{notif.price}</span>}
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 3,
              background: `${actionColor}20`, color: actionColor, fontWeight: 800,
            }}>
              {notif.action === 'BUY' ? 'شراء' : notif.action === 'SELL' ? 'بيع' : notif.action}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={() => { setVisible(false); setTimeout(onDismiss, 350) }}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8090A8', padding: 0, flexShrink: 0, marginTop: 2 }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

/* ══ Toast Container (bottom-right) ══════════════════════ */
export function NotificationToasts() {
  const { toasts, dismissToast } = useNotificationStore()

  return (
    <>
      <style>{`
        @keyframes toast-progress {
          from { transform: scaleX(1); transform-origin: left; }
          to   { transform: scaleX(0); transform-origin: left; }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 20, right: 20,
        zIndex: 99999,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}>
        {toasts.map(n => (
          <div key={n.id} style={{ pointerEvents: 'all' }}>
            <ToastCard notif={n} onDismiss={() => dismissToast(n.id)} />
          </div>
        ))}
      </div>
    </>
  )
}

/* ══ Notification Center Panel ════════════════════════════ */
function NotificationItem({ notif, onRead, onDismiss }: {
  notif: Notification
  onRead: () => void
  onDismiss: () => void
}) {
  const color = SRC_COLOR[notif.source]
  const actionColor = ACTION_COLOR[notif.action]
  const { setSelectedSymbol } = useSymbolStore()
  return (
    <div
      onClick={() => {
        onRead()
        if (notif.pair) setSelectedSymbol(notif.pair)
      }}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: notif.read ? 'transparent' : `${color}06`,
        cursor: 'pointer',
        display: 'flex', gap: 10, alignItems: 'flex-start',
        transition: 'background 0.2s',
        position: 'relative',
      }}
    >
      {!notif.read && (
        <div style={{
          position: 'absolute', top: 16, right: 8,
          width: 6, height: 6, borderRadius: '50%', background: color,
          boxShadow: `0 0 6px ${color}`,
        }} />
      )}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${color}15`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {SRC_ICON[notif.source]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#e6ebf5' }}>{notif.title}</span>
          <span style={{ fontSize: 9, color: '#8090A8', flexShrink: 0, marginRight: 8 }}>{timeAgo(notif.timestamp)}</span>
        </div>
        <p style={{ fontSize: 10, color: '#8090A8', margin: 0, lineHeight: 1.5 }}>{notif.body}</p>
        {notif.pair && (
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#fff', fontWeight: 700 }}>{notif.pair}</span>
            {notif.price && <span style={{ fontSize: 9, color: '#8090A8' }}>{notif.price}</span>}
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 3,
              background: `${actionColor}20`, color: actionColor, fontWeight: 800,
            }}>
              {notif.action === 'BUY' ? 'شراء' : notif.action === 'SELL' ? 'بيع' : notif.action}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8090A8', padding: 2, flexShrink: 0, opacity: 0.5 }}
      >
        <X size={11} />
      </button>
    </div>
  )
}

/* ══ Notification Settings Panel ═════════════════════════ */
function NotifSettingsPanel() {
  const { settings, updateSettings } = useNotificationStore()
  const rows: { key: keyof typeof settings; label: string }[] = [
    { key: 'enabled',        label: 'تفعيل التنبيهات' },
    { key: 'soundEnabled',   label: 'الصوت' },
    { key: 'botAlerts',      label: 'تنبيهات البوت' },
    { key: 'aiAlerts',       label: 'تنبيهات الـ AI' },
    { key: 'scannerAlerts',  label: 'تنبيهات السكانر' },
    { key: 'tradeAlerts',    label: 'تحركات حادة في السوق' },
  ]
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(r => (
        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#e6ebf5' }}>{r.label}</span>
          <button
            onClick={() => updateSettings({ [r.key]: !(settings as any)[r.key] })}
            style={{
              width: 40, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
              background: (settings as any)[r.key] ? 'var(--success)' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              right: (settings as any)[r.key] ? 3 : 'auto',
              left: (settings as any)[r.key] ? 'auto' : 3,
              width: 14, height: 14, borderRadius: '50%', background: '#fff',
              transition: 'all 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }} />
          </button>
        </div>
      ))}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#e6ebf5' }}>حد الثقة الأدنى</span>
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800 }}>{settings.minConfidence}%</span>
        </div>
        <input
          type="range" min={40} max={95} step={5}
          value={settings.minConfidence}
          onChange={e => updateSettings({ minConfidence: parseInt(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
      </div>
    </div>
  )
}

/* ══ Main Notification Center Bell + Panel ════════════════ */
export function NotificationCenter() {
  const { notifications, markRead, markAllRead, dismiss, clearAll } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'all' | 'settings'>('all')
  const unread = notifications.filter(n => !n.read).length

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', background: open ? 'rgba(0,242,255,0.1)' : 'transparent',
          border: open ? '1px solid rgba(0,242,255,0.25)' : '1px solid transparent',
          borderRadius: 8, color: open ? '#00f2ff' : '#8090A8',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', width: 32, height: 32,
          transition: 'all 0.2s',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          {unread > 0 && <circle cx="18" cy="5" r="4" fill="#FF3B30" stroke="#060b13" strokeWidth="2"/>}
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, left: -4,
            minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
            background: '#FF3B30', fontSize: 8, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'monospace', fontWeight: 900,
            border: '1.5px solid #060b13',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: 40, left: 16,
            zIndex: 9999, width: 360,
            background: 'rgba(6,11,19,0.98)', backdropFilter: 'blur(24px)',
            border: '1px solid rgba(0,242,255,0.12)', borderRadius: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0,242,255,0.04)',
            overflow: 'hidden', fontFamily: "'Cairo', sans-serif", direction: 'rtl',
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(0,242,255,0.03)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                مركز التنبيهات {unread > 0 && <span style={{ color: '#00f2ff', fontSize: 11 }}>({unread} جديد)</span>}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {unread > 0 && (
                  <button onClick={markAllRead} style={{ fontSize: 9, color: '#8090A8', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    تحديد الكل كمقروء
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAll} style={{ fontSize: 9, color: '#FF3B30', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    مسح الكل
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['all', 'settings'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, padding: '8px', fontSize: 11, background: 'transparent', border: 'none',
                  color: tab === t ? '#00f2ff' : '#8090A8', cursor: 'pointer',
                  borderBottom: tab === t ? '2px solid #00f2ff' : 'none',
                  fontFamily: "'Cairo', sans-serif",
                }}>
                  {t === 'all' ? 'التنبيهات' : 'الإعدادات'}
                </button>
              ))}
            </div>

            {tab === 'all' ? (
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', opacity: 0.3 }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                    <div style={{ fontSize: 12 }}>لا توجد تنبيهات بعد</div>
                  </div>
                ) : (
                  notifications.map(n => (
                    <NotificationItem
                      key={n.id} notif={n}
                      onRead={() => markRead(n.id)}
                      onDismiss={() => dismiss(n.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              <NotifSettingsPanel />
            )}
          </div>
        </>
      )}
    </div>
  )
}
