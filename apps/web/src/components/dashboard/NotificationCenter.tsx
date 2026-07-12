'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X as XIcon, Bot, Brain, ScanSearch, Zap } from 'lucide-react'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations, useLocale } from 'next-intl'
import { isRtlLocale } from '@/lib/i18n-utils'
import {
  useNotificationStore,
  Notification,
  NotifSource,
  NotifAction,
} from '@/hooks/useNotificationStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import T from '@/lib/unified-tokens'

/* ══ Helpers ══════════════════════════════════════════════ */

/**
 * Resolve the localized title/body for a notification.
 * ALL notifications created by NotificationEngine now include notificationType + params,
 * and NestJS backend notifications also include them. This ensures correct translation
 * at DISPLAY time regardless of when the notification was created.
 *
 * Fallback chain:
 * 1. Try notificationType + params via i18n (preferred — always correct locale)
 * 2. If translation fails, use notificationType as a display key (better than Arabic)
 * 3. Last resort: raw title/body (may be Arabic from backend)
 */

/** Convert snake_case notificationType to camelCase for i18n key lookup */
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** Human-readable label for notification types when i18n fails */
const NOTIF_TYPE_LABELS: Record<string, string> = {
  newUser: 'New User',
  subscriptionUpgrade: 'Subscription Upgrade',
  systemError: 'System Error',
  performanceAlert: 'Performance Alert',
  largeTrade: 'Large Trade',
  systemUpdate: 'System Update',
  newReport: 'New Report',
  signalGenerated: 'Signal',
  orderFilled: 'Order Filled',
  orderRejected: 'Order Rejected',
  riskWarning: 'Risk Warning',
  positionClosed: 'Position Closed',
  positionOpened: 'Position Opened',
  executionFailed: 'Execution Failed',
  priceAlert: 'Price Alert',
  botSignal: 'Bot Signal',
  aiAnalysis: 'AI Analysis',
  scannerSignal: 'Scanner Signal',
  sharpMove: 'Sharp Move',
  autoExecuteSuccess: 'Auto-Execute',
  autoExecuteFailed: 'Auto-Execute Failed',
  autoExecuteRejected: 'Auto-Execute Rejected',
  autoExecuteError: 'Auto-Execute Error',
}

function useLocalizedNotif(notif: Notification): { title: string; body: string } {
  const tnt = useTranslations('notificationTypes')
  if (notif.notificationType) {
    const key = toCamelCase(notif.notificationType)
    try {
      const params = (notif.params || {}) as Record<string, string | number>
      const title = tnt(`${key}.title`, params)
      const body = tnt(`${key}.body`, params)
      return { title, body }
    } catch (err) {
      // i18n translation failed — use English label instead of Arabic fallback
      const label = NOTIF_TYPE_LABELS[key] || key
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[i18n] Failed to translate notificationType="${key}":`, err)
      }
      return { title: label, body: notif.body || '' }
    }
  }
  return { title: notif.title, body: notif.body }
}

const SRC_ICON: Record<NotifSource, React.ReactNode> = {
  bot: <Bot size={13} />,
  ai: <Brain size={13} />,
  scanner: <ScanSearch size={13} />,
  trade: <Zap size={13} />,
  system: <Zap size={13} />,
  agent: <Bot size={13} />,
}

const SRC_COLOR: Record<NotifSource, string> = {
  bot: T.info,
  ai: T.council,
  scanner: T.warning,
  trade: T.success,
  system: T.text2,
  agent: '#A259FF',
}

const ACTION_COLOR: Record<NotifAction, string> = {
  BUY: T.success,
  SELL: T.danger,
  INFO: T.info,
  WARN: T.warning,
  CLOSE: T.danger,
  CANCEL: '#FF9500',
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

/* ══ Single Toast Card ════════════════════════════════════ */
function ToastCard({
  notif,
  onDismiss,
  isMobile = false,
}: {
  notif: Notification
  onDismiss: (id: string) => void
  isMobile?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const [executed, setExecuted] = useState(false)
  const [executing, setExecuting] = useState(false)
  const { setSelectedSymbol } = useSymbolStore()
  const { addTrade } = usePaperTradesStore()
  const dismissTimerRef = useRef<number | null>(null)
  const dismissCallbackRef = useRef(onDismiss)
  const tc = useTranslations('common')
  const tn = useTranslations('dashboard.notifications')
  const { title: localizedTitle, body: localizedBody } = useLocalizedNotif(notif)

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
            strategy: `${tn('quickExecution')} (${notif.source})`,
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
      strategy: `${tn('quickAlert')} (${notif.source})`,
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
        borderRadius: 'var(--radius-lg)',
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
          borderRadius: 'var(--radius-md)',
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
            fontSize: 'var(--text-xs)',
            fontWeight: 800,
            color: T.text,
            margin: '0 0 3px 0',
          }}
        >
          {localizedTitle}
        </h4>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: T.text2,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {localizedBody}
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
                  fontSize: 'var(--text-xs)',
                  fontFamily: "var(--font-mono)",
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {notif.pair}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-xs)',
                  background: `${actionColor}20`,
                  color: actionColor,
                  fontWeight: 800,
                }}
              >
                {notif.action === 'BUY'
                  ? tc('buy')
                  : notif.action === 'SELL'
                    ? tc('sell')
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
                  color: executed ? T.text2 : actionColor,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 800,
                  cursor: executed || executing ? 'default' : 'pointer',
                  fontFamily: "var(--font-ar)",
                  opacity: executing ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {executed ? tn('executed') : executing ? tn('executing') : tn('execute')}
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
          color: T.text2,
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
  const tc = useTranslations('common')
  const tn = useTranslations('dashboard.notifications')

  const locale = useLocale()
  const isRtl = isRtlLocale(locale)

  // الجوال: نكشفه من الـ CSS class
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  // Desktop: max 3 — Mobile: max 2
  const visibleToasts = isMobile
    ? toasts.slice(0, 2)
    : toasts.slice(0, 3)

  return (
    <>
      {/* Desktop */}
      <div
        className="hide-on-mobile"
        style={{
          position: 'fixed',
          bottom: 20,
          ...(isRtl ? { left: 20 } : { right: 20 }),
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 8,
          maxWidth: 380,
          pointerEvents: 'none',
        }}
      >
        {visibleToasts.map((n) => (
          <div key={n.id} style={{ pointerEvents: 'all' }}>
            <ToastCard notif={n} onDismiss={dismissToast} />
          </div>
        ))}
      </div>

      {/* Mobile: أعلى الشاشة تحت الهيدر مباشرة */}
      <div
        className="show-on-mobile-only"
        style={{
          position: 'fixed',
          top: 70,
          left: 10,
          right: 10,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        {visibleToasts.map((n) => (
          <div key={n.id} style={{ pointerEvents: 'all' }}>
            <ToastCard notif={n} onDismiss={dismissToast} isMobile />
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
  const tc = useTranslations('common')
  const { title: localizedTitle, body: localizedBody } = useLocalizedNotif(notif)
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
          borderRadius: 'var(--radius-md)',
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
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: T.text }}>{localizedTitle}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: T.text2, flexShrink: 0, marginInlineEnd: 8 }}>{timeAgo(notif.timestamp)}</span>
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: T.text2, margin: 0, lineHeight: 1.5 }}>{localizedBody}</p>
        {notif.pair && (
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)", color: '#fff', fontWeight: 700 }}>{notif.pair}</span>
            {notif.price && <span style={{ fontSize: 'var(--text-xs)', color: T.text2 }}>{notif.price}</span>}
            <span
              style={{
                fontSize: 'var(--text-xs)',
                padding: '1px 5px',
                borderRadius: 'var(--radius-xs)',
                background: `${actionColor}20`,
                color: actionColor,
                fontWeight: 800,
              }}
            >
              {notif.action === 'BUY'
                ? tc('buy')
                : notif.action === 'SELL'
                  ? tc('sell')
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
          color: T.text2,
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
  const tn = useTranslations('dashboard.notifications')
  const tc = useTranslations('common')
  const { settings, updateSettings } = useNotificationStore()

  const rows: { key: keyof typeof settings; label: string }[] = [
    { key: 'enabled', label: tn('enableAlerts') },
    { key: 'soundEnabled', label: tn('sound') },
    { key: 'browserNotifications', label: tn('deviceNotifications') },
    { key: 'botAlerts', label: tn('botAlerts') },
    { key: 'aiAlerts', label: tn('aiAlertsLabel') },
    { key: 'scannerAlerts', label: tn('scannerAlertsLabel') },
    { key: 'tradeAlerts', label: tn('sharpMarketMoves') },
  ]

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: T.text }}>{r.label}</span>
          <button
            onClick={() => updateSettings({ [r.key]: !(settings as any)[r.key] })}
            style={{
              width: 40,
              height: 20,
              borderRadius: 'var(--radius-lg)',
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
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: T.warning }}>{tn('autoExecuteSignals')}</span>
            <p style={{ fontSize: 'var(--text-xs)', color: T.text2, margin: '2px 0 0' }}>{tn('autoExecuteDesc')}</p>
          </div>
          <button
            onClick={() => updateSettings({ autoExecute: !(settings as any).autoExecute })}
            style={{
              width: 40,
              height: 20,
              borderRadius: 'var(--radius-lg)',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              background: (settings as any).autoExecute ? T.warning : 'rgba(255,255,255,0.1)',
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
            borderRadius: 'var(--radius-md)',
            padding: '8px 10px',
            marginTop: 6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: T.text2 }}>{tn('confidenceThreshold')}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: T.warning, fontWeight: 800 }}>{settings.minConfidence}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={settings.minConfidence}
              onChange={(e) => updateSettings({ minConfidence: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: T.warning }}
            />
            <p style={{ fontSize: 'var(--text-xs)', color: T.text2, margin: '4px 0 0', lineHeight: 1.4 }}>
              {tn('autoExecuteNotice')}
            </p>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: T.text }}>{tn('minConfidence')}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 800 }}>{settings.minConfidence}%</span>
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
  const tn = useTranslations('dashboard.notifications')
  const locale = useLocale()
  const isRtl = isRtlLocale(locale)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'all' | 'settings'>('all')
  const unread = notifications.filter((n) => !n.read).length
  const bellRef = useRef<HTMLButtonElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; right: number; left: number }>({ top: 0, right: 0, left: -1 })

  const updatePanelPos = useCallback(() => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect()
      const padding = 8
      if (isRtl) {
        // RTL: bell is on the left, align panel to bell's left edge
        setPanelPos({ top: rect.bottom + padding, right: -1, left: rect.left })
      } else {
        // LTR: bell is on the right, align panel to bell's right edge
        setPanelPos({ top: rect.bottom + padding, right: window.innerWidth - rect.right, left: -1 })
      }
    }
  }, [isRtl])

  useEffect(() => {
    if (open) {
      updatePanelPos()
      window.addEventListener('resize', updatePanelPos)
      window.addEventListener('scroll', updatePanelPos, true)
      return () => {
        window.removeEventListener('resize', updatePanelPos)
        window.removeEventListener('scroll', updatePanelPos, true)
      }
    }
  }, [open, updatePanelPos])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={bellRef}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: open ? 'rgba(0,212,255,0.1)' : 'transparent',
          border: open ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
          borderRadius: 'var(--radius-md)',
          color: open ? T.info : T.text2,
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
          {unread > 0 && <circle cx="18" cy="5" r="4" fill={T.danger} stroke="#060b13" strokeWidth="2" />}
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              insetInlineStart: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 'var(--radius-md)',
              padding: '0 4px',
              background: T.danger,
              fontSize: 'var(--text-xs)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "var(--font-mono)",
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
              top: panelPos.top,
              ...(isRtl
                ? { left: Math.max(8, panelPos.left) }
                : { right: Math.max(8, panelPos.right) }),
              zIndex: 9999,
              // FIX: على الجوال الضيق، تأخذ عرض كامل مع padding
              width: typeof window !== 'undefined' && window.innerWidth < 480
                ? Math.min(360, window.innerWidth - 16)
                : 360,
              // FIX: تأكد أن الـ panel لا تخرج خارج الشاشة
              maxWidth: 'calc(100vw - 16px)',
              background: 'rgba(11,14,20,0.98)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(0,212,255,0.12)',
              borderRadius: 'var(--radius-xl)',
              boxShadow:
                '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0,212,255,0.04)',
              overflow: 'hidden',
              fontFamily: "var(--font-ar)",
              
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
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 900, color: '#fff' }}>
                {tn('title')}{' '}
                {unread > 0 && <span style={{ color: T.info, fontSize: 'var(--text-xs)' }}>({unread} {tn('new')})</span>}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: T.text2,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {tn('markAllRead')}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: T.danger,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {tn('clearAll')}
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
                    fontSize: 'var(--text-xs)',
                    background: 'transparent',
                    border: 'none',
                    color: tab === t ? T.info : T.text2,
                    cursor: 'pointer',
                    borderBottom: tab === t ? '2px solid #00D4FF' : 'none',
                    fontFamily: "var(--font-ar)",
                  }}
                >
                  {t === 'all' ? tn('alerts') : tn('settings')}
                </button>
              ))}
            </div>

            {tab === 'all' ? (
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', opacity: 0.3 }}>
                    <div style={{ fontSize: 'var(--text-2xl)', marginBottom: 10 }}>🔔</div>
                    <div style={{ fontSize: 'var(--text-sm)' }}>{tn('noAlertsYet')}</div>
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
