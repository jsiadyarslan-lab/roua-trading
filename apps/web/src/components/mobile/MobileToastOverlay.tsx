'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationStore, type Notification, type NotifAction } from '@/hooks/useNotificationStore'
import {
  Bell, TrendingUp, TrendingDown, AlertTriangle, Info, Bot, Brain,
  ScanSearch, Zap, X, ArrowUpRight, ArrowDownRight, ShieldAlert,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

/* ─── Icon by source ─── */
function NotifIcon({ source, action }: { source: string; action: NotifAction }) {
  const color = action === 'BUY' ? '#32D74B' : action === 'SELL' ? '#FF453A' : action === 'WARN' || action === 'CLOSE' ? '#FFB800' : '#00D4FF'

  switch (source) {
    case 'bot': return <Bot size={18} color={color} />
    case 'ai': return <Brain size={18} color={color} />
    case 'scanner': return <ScanSearch size={18} color={color} />
    case 'trade': return action === 'BUY' ? <ArrowUpRight size={18} color={color} /> : action === 'SELL' ? <ArrowDownRight size={18} color={color} /> : <Zap size={18} color={color} />
    default: return action === 'BUY' ? <TrendingUp size={18} color={color} /> : action === 'SELL' ? <TrendingDown size={18} color={color} /> : <Bell size={18} color={color} />
  }
}

/* ─── Source label ─── */
function sourceLabel(source: string): string {
  switch (source) {
    case 'bot': return 'المنفذ'
    case 'smart_executor': return 'المنفذ'
    case 'agent': return 'الوكيل'
    case 'ai': return 'AI'
    case 'scanner': return 'السكانر'
    case 'trade': return 'التداول'
    case 'system': return 'النظام'
    default: return source
  }
}

/* ─── Priority border color ─── */
function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#FF453A'
    case 'high': return '#FFB800'
    case 'medium': return '#00D4FF'
    default: return 'rgba(255,255,255,0.1)'
  }
}

/**
 * MobileToastOverlay — يعرض الإشعارات المنبثقة في أعلى الشاشة
 * يعمل بالتزامن مع useNotificationStore.toasts
 * كل إشعار يظهر لمدة 5 ثوان ثم يختفي تلقائياً
 */
export default function MobileToastOverlay() {
  const toasts = useNotificationStore(s => s.toasts)
  const dismissToast = useNotificationStore(s => s.dismissToast)
  const markRead = useNotificationStore(s => s.markRead)
  const router = useRouter()

  // Auto-dismiss toasts after 5 seconds
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map(t =>
      setTimeout(() => dismissToast(t.id), 5000)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])

  // Only show latest 3 toasts
  const visibleToasts = toasts.slice(0, 3)

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 20px) + 8px)',
        left: 12,
        right: 12,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => {
              markRead(toast.id)
              dismissToast(toast.id)
              // Navigate on tap
              if (toast.pair) {
                router.push(`/mobile/chart?symbol=${toast.pair}`)
              } else if (toast.source === 'bot') {
                router.push('/mobile/bot')
              } else if (toast.source === 'ai') {
                router.push('/mobile/ai')
              } else if (toast.source === 'scanner') {
                router.push('/mobile/scanner')
              }
            }}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(28,28,30,0.92)',
              backdropFilter: 'blur(40px) saturate(190%)',
              WebkitBackdropFilter: 'blur(40px) saturate(190%)',
              borderRadius: 20,
              padding: '12px 14px',
              border: `0.5px solid ${priorityColor(toast.priority)}40`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 0.5px ${priorityColor(toast.priority)}20`,
              cursor: 'pointer',
              direction: 'rtl',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${priorityColor(toast.priority)}66, transparent)`,
            }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                background: `${priorityColor(toast.priority)}12`,
                border: `0.5px solid ${priorityColor(toast.priority)}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <NotifIcon source={toast.source} action={toast.action} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 6,
                    background: `${priorityColor(toast.priority)}15`,
                    color: priorityColor(toast.priority),
                    fontFamily: "'Cairo', sans-serif",
                  }}>
                    {sourceLabel(toast.source)}
                  </span>
                  {toast.pair && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
                      {toast.pair}
                    </span>
                  )}
                </div>
                <p style={{
                  fontSize: 12, fontWeight: 700, color: '#F0F2F5',
                  fontFamily: "'Cairo', sans-serif", lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {toast.title}
                </p>
                <p style={{
                  fontSize: 10, color: 'rgba(235,235,245,0.5)',
                  fontFamily: "'Cairo', sans-serif", lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginTop: 1,
                }}>
                  {toast.body}
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={(e) => { e.stopPropagation(); dismissToast(toast.id) }}
                style={{
                  width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={12} color="rgba(235,235,245,0.4)" />
              </button>
            </div>

            {/* Progress bar — visual countdown */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5, ease: 'linear' }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 2,
                background: priorityColor(toast.priority),
                transformOrigin: 'right',
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
