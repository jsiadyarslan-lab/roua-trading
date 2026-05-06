'use client'

import { useEffect, useRef, useState } from 'react'
import { X as XIcon, Bot, Brain, ScanSearch, Zap } from 'lucide-react'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import {
  useNotificationStore,
  Notification,
  NotifSource,
  NotifAction,
} from '@/hooks/useNotificationStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'

/* ══ Helpers ══════════════════════════════════════════════ */
const SRC_ICON: Record<NotifSource, React.ReactNode> = {
  bot: <Bot size={13} />,
  ai: <Brain size={13} />,
  scanner: <ScanSearch size={13} />,
  trade: <Zap size={13} />,
  system: <Zap size={13} />,
}

const SRC_COLOR: Record<NotifSource, string> = {
  bot: '#00D4FF',
  ai: '#b388ff',
  scanner: '#FFB800',
  trade: '#00FFA3',
  system: '#8B92A8',
}

const ACTION_COLOR: Record<NotifAction, string> = {
  BUY: '#00FFA3',
  SELL: '#FF4757',
  INFO: '#00D4FF',
  WARN: '#FFB800',
  CLOSE: '#FF4757',
  CANCEL: '#FF9500',
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}ث`
  if (s < 3600) return `${Math.floor(s / 60)}د`
  return `${Math.floor(s / 3600)}س`
}

/* ══ Single Toast Card ════════════════════════════════════ */
function ToastCard({
  notif,
  onDismiss,
}: {
  notif: Notification
  onDismiss: (id: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [executed, setExecuted] = useState(false)
  const [executing, setExecuting] = useState(false)
  const { setSelectedSymbol } = useSymbolStore()
  const { addTrade } = usePaperTradesStore()
  const dismissTimerRef = useRef<number | null>(null)
  const dismissCallbackRef = useRef(onDismiss)

  useEffect(() => {
    dismissCallbackRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))

    dismissTimerRef.current = window.setTimeout(() => {
      setVisible(false)
      window.setTimeout(() => dismissCallbackRef.current(notif.id), 350)
    }, 5000)

    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = null
      }
    }
  }, [notif.id])

  const color = SRC_COLOR[notif.source]
  const actionColor = ACTION_COLOR[notif.action]
  const canExecute =
    (notif.action === 'BUY' || notif.action === 'SELL') &&
    typeof notif.pair === 'string' &&
    typeof notif.price === 'number'

  const handleExecute = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (executed || executing || !canExecute) return
    const isBuy = notif.action === 'BUY'

    // Try real execution first (v2 pipeline), fall back to paper trading
    setExecuting(true)
    try {
      const { ensureAuth } = await import('@/lib/api-fetch')
      await ensureAuth()

      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        // Real execution via v2 pipeline
        const idempotencyKey = crypto.randomUUID()
        const res = await fetch('/api/trading/v2/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentialId,
            symbol: notif.pair,
            side: isBuy ? 'BUY' : 'SELL',
            type: 'MARKET',
            quantity: 0.01,
            stopLoss: notif.price ? (isBuy ? notif.price * 0.98 : notif.price * 1.02) : undefined,
            idempotencyKey,
            clientOrderId: idempotencyKey,
          }),
        })

        const j = await res.json()

        if (res.ok && j.success) {
          setExecuted(true)
          // Also track in paper store for local P&L tracking
          addTrade({
            symbol: notif.pair as string,
            side: isBuy ? 'long' : 'short',
            qty: 0.01,
            entryPrice: notif.price as number,
            currentPrice: notif.price as number,
            tp: (notif.price as number) * (isBuy ? 1.015 : 0.985),
            sl: (notif.price as number) * (isBuy ? 0.99 : 1.01),
            entryTime: Date.now(),
            strategy: `تنفيذ سريع (${notif.source})`,
            source: 'manual',
          })
          window.setTimeout(() => {
            setVisible(false)
            window.setTimeout(() => dismissCallbackRef.current(notif.id), 350)
          }, 1500)
          setExecuting(false)
          return
        }
      }
    } catch {
      // Real execution failed — fall through to paper trading
    }

    // Fallback: Paper trading execution
    addTrade({
      symbol: notif.pair as string,
      side: isBuy ? 'long' : 'short',
      qty: 0.1,
      entryPrice: notif.price as number,
      currentPrice: notif.price as number,
      tp: (notif.price as number) * (isBuy ? 1.015 : 0.985),
      sl: (notif.price as number) * (isBuy ? 0.99 : 1.01),
      entryTime: Date.now(),
      strategy: `تنبيه سريع (${notif.source})`,
      source: 'manual',
    })

    setExecuted(true)
    window.setTimeout(() => {
      setVisible(false)
      window.setTimeout(() => dismissCallbackRef.current(notif.id), 350)
    }, 1500)
    setExecuting(false)
  }

  return (
    <div
      onClick={() => notif.pair && setSelectedSymbol(notif.pair)}
      style={{
        width: 300,
        background: 'rgba(11,14,20,0.95)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${color}30`,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        boxShadow:
          '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        transform: visible
          ? 'translateX(0) scale(1)'
          : 'translateX(100%) scale(0.9)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        position: 'relative',
        overflow: 'hidden',
        cursor: notif.pair ? 'pointer' : 'default',
        direction: 'rtl',
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 2,
          background: color,
          width: '100%',
          animation: 'toast-progress 5s linear forwards',
        }}
      />

      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          flexShrink: 0,
          background: `${color}15`,
          border: `1px solid ${color}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
        }}
      >
        {SRC_ICON[notif.source]}
      </div>

      <div style={{ flex: 1, minWidth: 0, marginTop: -2 }}>
        <h4
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#F0F2F5',
            margin: '0 0 3px 0',
          }}
        >
          {notif.title}
        </h4>
        <p
          style={{
            fontSize: 10,
            color: '#8B92A8',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {notif.body}
        </p>

        {notif.pair && (
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: 'monospace',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {notif.pair}
              </span>
              <span
                style={{
                  fontSize: 8,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: `${actionColor}20`,
                  color: actionColor,
                  fontWeight: 800,
                }}
              >
                {notif.action === 'BUY'
                  ? 'شراء'
                  : notif.action === 'SELL'
                    ? 'بيع'
                    : notif.action}
              </span>
            </div>

            {canExecute && (
              <button
                onClick={handleExecute}
                disabled={executed || executing}
                style={{
                  background: executed
                    ? 'rgba(255,255,255,0.05)'
                    : executing
                    ? `${actionColor}08`
                    : `${actionColor}15`,
                  border: `1px solid ${
                    executed ? 'rgba(255,255,255,0.1)' : `${actionColor}40`
                  }`,
                  color: executed ? '#8B92A8' : actionColor,
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 800,
                  cursor: executed || executing ? 'default' : 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                  opacity: executing ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {executed ? 'تم التنفيذ ✅' : executing ? 'جارٍ التنفيذ...' : 'تنفيذ ⚡'}
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          setVisible(false)
          window.setTimeout(() => dismissCallbackRef.current(notif.id), 350)
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#8B92A8',
          padding: 0,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <XIcon size={12} />
      </button>
    </div>
  )
}

/* ══ Toast Container (bottom-right) ══════════════════════ */
export function NotificationToasts() {
  useScopedStyle(`
        @keyframes toast-progress {
          from { transform: scaleX(1); transform-origin: left; }
          to   { transform: scaleX(0); transform-origin: left; }
        }
      `)
  const { toasts, dismissToast } = useNotificationStore()

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((n) => (
          <div key={n.id} style={{ pointerEvents: 'all' }}>
            <ToastCard notif={n} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </>
  )
}

/* ══ Notification Center Panel ════════════════════════════ */
function NotificationItem({
  notif,
  onRead,
  onDismiss,
}: {
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
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        transition: 'background 0.2s',
        position: 'relative',
      }}
    >
      {!notif.read && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 8,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      )}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          background: `${color}15`,
          border: `1px solid ${color}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
        }}
      >
        {SRC_ICON[notif.source]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#F0F2F5' }}>{notif.title}</span>
          <span style={{ fontSize: 9, color: '#8B92A8', flexShrink: 0, marginInlineEnd: 8 }}>{timeAgo(notif.timestamp)}</span>
        </div>
        <p style={{ fontSize: 10, color: '#8B92A8', margin: 0, lineHeight: 1.5 }}>{notif.body}</p>
        {notif.pair && (
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#fff', fontWeight: 700 }}>{notif.pair}</span>
            {notif.price && <span style={{ fontSize: 9, color: '#8B92A8' }}>{notif.price}</span>}
            <span
              style={{
                fontSize: 8,
                padding: '1px 5px',
                borderRadius: 3,
                background: `${actionColor}20`,
                color: actionColor,
                fontWeight: 800,
              }}
            >
              {notif.action === 'BUY'
                ? 'شراء'
                : notif.action === 'SELL'
                  ? 'بيع'
                  : notif.action}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#8B92A8',
          padding: 2,
          flexShrink: 0,
          opacity: 0.5,
        }}
      >
        <XIcon size={11} />
      </button>
    </div>
  )
}

/* ══ Notification Settings Panel ═════════════════════════ */
function NotifSettingsPanel() {
  const { settings, updateSettings } = useNotificationStore()
  const rows: { key: keyof typeof settings; label: string }[] = [
    { key: 'enabled', label: 'تفعيل التنبيهات' },
    { key: 'soundEnabled', label: 'الصوت' },
    { key: 'browserNotifications', label: 'إشعارات الجهاز' },
    { key: 'botAlerts', label: 'تنبيهات البوت' },
    { key: 'aiAlerts', label: 'تنبيهات الـ AI' },
    { key: 'scannerAlerts', label: 'تنبيهات السكانر' },
    { key: 'tradeAlerts', label: 'تحركات حادة في السوق' },
  ]

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#F0F2F5' }}>{r.label}</span>
          <button
            onClick={() => updateSettings({ [r.key]: !(settings as any)[r.key] })}
            style={{
              width: 40,
              height: 20,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              background: (settings as any)[r.key] ? 'var(--success)' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                insetInlineEnd: (settings as any)[r.key] ? 3 : 'auto',
                insetInlineStart: (settings as any)[r.key] ? 'auto' : 3,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                transition: 'all 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
            />
          </button>
        </div>
      ))}

      {/* ── Auto-Execute Settings ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: 14,
        marginTop: 4,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FFB800' }}>⚡ تنفيذ تلقائي للإشارات</span>
            <p style={{ fontSize: 9, color: '#8B92A8', margin: '2px 0 0' }}>تنفيذ الإشارات المؤهلة تلقائياً</p>
          </div>
          <button
            onClick={() => updateSettings({ autoExecute: !(settings as any).autoExecute })}
            style={{
              width: 40,
              height: 20,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              background: (settings as any).autoExecute ? '#FFB800' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                insetInlineEnd: (settings as any).autoExecute ? 3 : 'auto',
                insetInlineStart: (settings as any).autoExecute ? 'auto' : 3,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                transition: 'all 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
            />
          </button>
        </div>

        {(settings as any).autoExecute && (
          <div style={{
            background: 'rgba(255,184,0,0.04)',
            border: '1px solid rgba(255,184,0,0.15)',
            borderRadius: 8,
            padding: '8px 10px',
            marginTop: 6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: '#8B92A8' }}>حد الثقة للتنفيذ التلقائي</span>
              <span style={{ fontSize: 9, color: '#FFB800', fontWeight: 800 }}>{settings.minConfidence}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={settings.minConfidence}
              onChange={(e) => updateSettings({ minConfidence: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: '#FFB800' }}
            />
            <p style={{ fontSize: 8, color: '#8B92A8', margin: '4px 0 0', lineHeight: 1.4 }}>
              سيتم تنفيذ الإشارات تلقائياً فقط عندما تتجاوز نسبة الثقة هذا الحد، مع وقف خسارة إلزامي 2%
            </p>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#F0F2F5' }}>حد الثقة الأدنى</span>
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800 }}>{settings.minConfidence}%</span>
        </div>
        <input
          type="range"
          min={40}
          max={95}
          step={5}
          value={settings.minConfidence}
          onChange={(e) => updateSettings({ minConfidence: parseInt(e.target.value) })}
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
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: open ? 'rgba(0,212,255,0.1)' : 'transparent',
          border: open ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
          borderRadius: 8,
          color: open ? '#00D4FF' : '#8B92A8',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          transition: 'all 0.2s',
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          {unread > 0 && <circle cx="18" cy="5" r="4" fill="#FF4757" stroke="#060b13" strokeWidth="2" />}
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              padding: '0 4px',
              background: '#FF4757',
              fontSize: 8,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
              fontWeight: 900,
              border: '1.5px solid #060b13',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'fixed',
              top: 40,
              left: 16,
              zIndex: 9999,
              width: 360,
              background: 'rgba(11,14,20,0.98)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(0,212,255,0.12)',
              borderRadius: 14,
              boxShadow:
                '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0,212,255,0.04)',
              overflow: 'hidden',
              fontFamily: "'Cairo', sans-serif",
              direction: 'rtl',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,212,255,0.03)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                مركز التنبيهات{' '}
                {unread > 0 && <span style={{ color: '#00D4FF', fontSize: 11 }}>({unread} جديد)</span>}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      fontSize: 9,
                      color: '#8B92A8',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    style={{
                      fontSize: 9,
                      color: '#FF4757',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    مسح الكل
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['all', 'settings'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: 11,
                    background: 'transparent',
                    border: 'none',
                    color: tab === t ? '#00D4FF' : '#8B92A8',
                    cursor: 'pointer',
                    borderBottom: tab === t ? '2px solid #00D4FF' : 'none',
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >
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
                  notifications.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notif={n}
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
