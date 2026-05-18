'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, BellRing, Bot, AlertTriangle, Settings2, TrendingUp, TrendingDown,
  ArrowRight, CheckCheck, Trash2, RefreshCw, Info, ShieldAlert,
  X, Activity, Volume2, VolumeX, Brain, ScanSearch, Zap, Sliders
} from 'lucide-react'
import { useNotificationStore, type Notification, type NotifSource, type NotifPriority, type NotifAction } from '@/hooks/useNotificationStore'

/* ═══════════════════════════════════════════════════════════
   Color Tokens
   ═══════════════════════════════════════════════════════════ */
const C = {
  accent: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: '#8B92A8',
  bg: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
}

/* ═══════════════════════════════════════════════════════════
   Filter Tab Config
   ═══════════════════════════════════════════════════════════ */
type FilterTab = 'all' | 'bot' | 'system' | 'trade' | 'settings'

const FILTER_TABS: { id: FilterTab; label: string; sources: NotifSource[] }[] = [
  { id: 'all', label: 'الكل', sources: ['bot', 'ai', 'scanner', 'trade', 'system'] },
  { id: 'bot', label: 'البوت', sources: ['bot', 'ai', 'scanner'] },
  { id: 'system', label: 'النظام', sources: ['system'] },
  { id: 'trade', label: 'التداول', sources: ['trade'] },
  { id: 'settings', label: 'الإعدادات', sources: [] },
]

/* ═══════════════════════════════════════════════════════════
   Source → Icon / Color Mapping
   ═══════════════════════════════════════════════════════════ */
const SOURCE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  bot: {
    icon: <Bot size={18} />,
    color: C.accent,
    label: 'البوت',
  },
  ai: {
    icon: <Activity size={18} />,
    color: '#A78BFA',
    label: 'الذكاء',
  },
  scanner: {
    icon: <AlertTriangle size={18} />,
    color: C.amber,
    label: 'السكانر',
  },
  trade: {
    icon: <TrendingUp size={18} />,
    color: C.success,
    label: 'التداول',
  },
  system: {
    icon: <Settings2 size={18} />,
    color: '#8B92A8',
    label: 'النظام',
  },
  // Fallbacks for server-side notification sources
  new_user: {
    icon: <Bell size={18} />,
    color: '#00D4FF',
    label: 'مستخدم جديد',
  },
  subscription_upgrade: {
    icon: <BellRing size={18} />,
    color: '#32D74B',
    label: 'اشتراك',
  },
  system_error: {
    icon: <AlertTriangle size={18} />,
    color: '#FF453A',
    label: 'خطأ',
  },
  performance_alert: {
    icon: <Activity size={18} />,
    color: '#FFB800',
    label: 'أداء',
  },
  large_trade: {
    icon: <Zap size={18} />,
    color: '#00D4FF',
    label: 'صفقة كبيرة',
  },
  system_update: {
    icon: <Info size={18} />,
    color: '#8B92A8',
    label: 'تحديث',
  },
  admin_test: {
    icon: <BellRing size={18} />,
    color: '#00D4FF',
    label: 'تجريبي',
  },
  push: {
    icon: <Bell size={18} />,
    color: '#00D4FF',
    label: 'إشعار',
  },
}

/* ═══════════════════════════════════════════════════════════
   Priority → Color Mapping
   ═══════════════════════════════════════════════════════════ */
const PRIORITY_COLORS: Record<NotifPriority, string> = {
  urgent: C.danger,
  high: C.danger,
  medium: C.amber,
  low: C.accent,
}

const PRIORITY_LABELS: Record<NotifPriority, string> = {
  urgent: 'عاجل',
  high: 'مهم',
  medium: 'متوسط',
  low: 'منخفض',
}

/* ═══════════════════════════════════════════════════════════
   Arabic Time Formatting
   ═══════════════════════════════════════════════════════════ */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  if (diffSec < 60) return 'منذ لحظات'
  if (diffMin < 60) return `منذ ${diffMin} ${diffMin === 1 ? 'دقيقة' : diffMin <= 10 ? 'دقائق' : 'دقيقة'}`
  if (diffHour < 24) return `منذ ${diffHour} ${diffHour === 1 ? 'ساعة' : diffHour <= 10 ? 'ساعات' : 'ساعة'}`
  if (diffDay === 1) return 'أمس'
  if (diffDay < 7) return `منذ ${diffDay} ${diffDay <= 10 ? 'أيام' : 'يوم'}`
  if (diffWeek < 4) return `منذ ${diffWeek} ${diffWeek === 1 ? 'أسبوع' : diffWeek <= 10 ? 'أسابيع' : 'أسبوع'}`
  return `منذ ${diffMonth} ${diffMonth === 1 ? 'شهر' : diffMonth <= 10 ? 'أشهر' : 'شهر'}`
}

/* ═══════════════════════════════════════════════════════════
   Action Icon Helper
   ═══════════════════════════════════════════════════════════ */
function getActionIcon(action: string) {
  switch (action) {
    case 'BUY': return <TrendingUp size={14} />
    case 'SELL': return <TrendingDown size={14} />
    case 'WARN': return <ShieldAlert size={14} />
    case 'CLOSE':
    case 'CANCEL': return <X size={14} />
    default: return <Info size={14} />
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case 'BUY': return C.success
    case 'SELL': return C.danger
    case 'WARN': return C.amber
    case 'CLOSE':
    case 'CANCEL': return '#8B92A8'
    default: return C.accent
  }
}

/* ═══════════════════════════════════════════════════════════
   Notification Card Component
   ═══════════════════════════════════════════════════════════ */
function NotificationCard({
  item,
  index,
  onRead,
  onDismiss,
}: {
  item: Notification
  index: number
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const srcConfig = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.system
  const priorityColor = PRIORITY_COLORS[item.priority] || C.accent
  const actionColor = getActionColor(item.action)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      onClick={() => onRead(item.id)}
      style={{
        background: item.read
          ? 'rgba(28,28,30,0.45)'
          : 'rgba(28,28,30,0.75)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        borderRadius: 28,
        padding: '16px',
        margin: '0 20px 12px',
        cursor: 'pointer',
        border: item.read
          ? '0.5px solid rgba(255,255,255,0.06)'
          : `0.5px solid ${srcConfig.color}25`,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: item.read
          ? '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.03)'
          : `0 4px 20px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.06)`,
      }}
    >
      {/* Unread glow accent */}
      {!item.read && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${srcConfig.color}60, transparent)`,
          zIndex: 10,
        }} />
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Source Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          background: item.read
            ? 'rgba(255,255,255,0.04)'
            : `${srcConfig.color}15`,
          border: item.read
            ? '0.5px solid rgba(255,255,255,0.06)'
            : `0.5px solid ${srcConfig.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: item.read ? 'rgba(235,235,245,0.35)' : srcConfig.color,
          position: 'relative',
        }}>
          {srcConfig.icon}
          {/* Action badge overlay */}
          <div style={{
            position: 'absolute', bottom: -3, left: -3,
            width: 20, height: 20, borderRadius: 7,
            background: C.bg,
            border: '0.5px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: actionColor,
          }}>
            {getActionIcon(item.action)}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 14,
              fontWeight: item.read ? 600 : 800,
              color: item.read ? C.text2 : C.text,
              fontFamily: "'Cairo', sans-serif",
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.title}
            </span>

            {/* Unread dot */}
            {!item.read && (
              <div style={{
                width: 9, height: 9, borderRadius: '50%',
                background: srcConfig.color,
                boxShadow: `0 0 10px ${srcConfig.color}80`,
                flexShrink: 0,
              }} />
            )}
          </div>

          {/* Pair + Confidence Row */}
          {(item.pair || item.confidence !== undefined) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              flexWrap: 'wrap',
            }}>
              {item.pair && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: actionColor,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: `${actionColor}10`,
                  border: `0.5px solid ${actionColor}20`,
                }} dir="ltr">
                  {item.pair}
                </span>
              )}
              {item.confidence !== undefined && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: item.confidence >= 80 ? C.success : item.confidence >= 60 ? C.amber : C.danger,
                }} dir="ltr">
                  ثقة {item.confidence}%
                </span>
              )}
              {item.price !== undefined && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: C.text2,
                }} dir="ltr">
                  ${item.price.toLocaleString('en', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}

          {/* Body */}
          <p style={{
            fontSize: 12,
            color: item.read ? 'rgba(235,235,245,0.35)' : C.text2,
            lineHeight: 1.65,
            margin: 0,
            fontFamily: "'Cairo', sans-serif",
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {item.body}
          </p>

          {/* Bottom Row: time + priority */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
          }}>
            <span style={{
              fontSize: 11,
              color: 'rgba(235,235,245,0.3)',
              fontFamily: "'Cairo', sans-serif",
            }}>
              {formatTimeAgo(item.timestamp)}
            </span>

            {/* Priority Badge */}
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 8,
              background: `${priorityColor}12`,
              border: `0.5px solid ${priorityColor}25`,
              color: priorityColor,
              fontFamily: "'Cairo', sans-serif",
            }}>
              {PRIORITY_LABELS[item.priority]}
            </span>
          </div>
        </div>

        {/* Swipe-to-dismiss handle */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={(e) => { e.stopPropagation(); onDismiss(item.id) }}
          style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,69,58,0.08)',
            border: '0.5px solid rgba(255,69,58,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: C.danger,
            flexShrink: 0,
            alignSelf: 'center',
            transition: 'all 0.15s',
          }}
        >
          <Trash2 size={14} />
        </motion.button>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Empty State Component
   ═══════════════════════════════════════════════════════════ */
function EmptyState({ filterLabel }: { filterLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        padding: '60px 24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 160, height: 160,
        background: 'linear-gradient(135deg, #00D4FF, #A78BFA)',
        filter: 'blur(80px)',
        opacity: 0.06,
        pointerEvents: 'none',
      }} />

      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(167,139,250,0.12))',
          border: '1px solid rgba(0,212,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        <Bell size={28} color={C.accent} />
      </motion.div>

      <p style={{
        fontSize: 16, fontWeight: 800,
        color: C.text, fontFamily: "'Cairo', sans-serif",
        margin: '0 0 8px',
      }}>
        لا توجد إشعارات
      </p>
      <p style={{
        fontSize: 13, color: C.text2,
        fontFamily: "'Cairo', sans-serif",
        lineHeight: 1.7,
        margin: 0,
      }}>
        {filterLabel === 'الكل'
          ? 'ليس لديك أي إشعارات حالياً. ستظهر هنا عند وصول تنبيهات جديدة.'
          : `لا توجد إشعارات في قسم "${filterLabel}". حاول تغيير الفلتر.`}
      </p>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Confirmation Modal
   ═══════════════════════════════════════════════════════════ */
function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(28,28,30,0.95)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              borderRadius: 28,
              padding: '28px 24px 24px',
              border: '0.5px solid rgba(255,255,255,0.1)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              maxWidth: 320, width: '100%',
              textAlign: 'center',
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: `${C.danger}12`,
              border: `0.5px solid ${C.danger}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Trash2 size={22} color={C.danger} />
            </div>

            <p style={{
              fontSize: 17, fontWeight: 800,
              color: C.text, fontFamily: "'Cairo', sans-serif",
              margin: '0 0 8px',
            }}>
              {title}
            </p>
            <p style={{
              fontSize: 13, color: C.text2,
              fontFamily: "'Cairo', sans-serif",
              lineHeight: 1.6,
              margin: '0 0 24px',
            }}>
              {message}
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onCancel}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 16,
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  color: C.text, fontSize: 14, fontWeight: 700,
                  fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                }}
              >
                إلغاء
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onConfirm}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 16,
                  background: C.danger,
                  border: 'none',
                  color: '#FFFFFF', fontSize: 14, fontWeight: 800,
                  fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                  boxShadow: `0 8px 24px ${C.danger}40`,
                }}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ═══════════════════════════════════════════════════════════
   Notification Settings Panel (Mobile)
   ═══════════════════════════════════════════════════════════ */
function MobileNotifSettings() {
  const { settings, updateSettings } = useNotificationStore()

  const toggleRows: { key: keyof typeof settings; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'enabled', label: 'تفعيل التنبيهات', icon: <Bell size={16} />, color: C.accent },
    { key: 'soundEnabled', label: 'الأصوات', icon: settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />, color: settings.soundEnabled ? C.success : C.danger },
    { key: 'browserNotifications', label: 'إشعارات الجهاز', icon: <BellRing size={16} />, color: '#00D4FF' },
    { key: 'botAlerts', label: 'تنبيهات البوت', icon: <Bot size={16} />, color: '#00D4FF' },
    { key: 'aiAlerts', label: 'تنبيهات الذكاء', icon: <Brain size={16} />, color: '#A78BFA' },
    { key: 'scannerAlerts', label: 'تنبيهات السكانر', icon: <ScanSearch size={16} />, color: C.amber },
    { key: 'tradeAlerts', label: 'تحركات السوق الحادة', icon: <Zap size={16} />, color: C.success },
  ]

  return (
    <div style={{ padding: '8px 20px 24px' }}>
      {/* Master Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: settings.enabled
            ? 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(50,215,75,0.05) 100%)'
            : 'rgba(255,255,255,0.03)',
          borderRadius: 20,
          padding: '16px',
          border: `0.5px solid ${settings.enabled ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: settings.enabled ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
              border: `0.5px solid ${settings.enabled ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: settings.enabled ? C.accent : C.text2,
            }}>
              <Bell size={20} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>
                التنبيهات
              </p>
              <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                {settings.enabled ? 'مفعّلة — ستتلقى إشعارات فورية' : 'معطّلة — لن تصلك تنبيهات'}
              </p>
            </div>
          </div>
          <button
            onClick={() => updateSettings({ enabled: !settings.enabled })}
            style={{
              width: 52, height: 28, borderRadius: 14,
              background: settings.enabled ? C.success : 'rgba(255,255,255,0.12)',
              border: 'none', cursor: 'pointer', position: 'relative',
              transition: 'background 0.3s',
            }}
          >
            <motion.div
              animate={{ x: settings.enabled ? 22 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              style={{
                position: 'absolute', top: 3, left: 0,
                width: 22, height: 22, borderRadius: '50%',
                background: '#FFF',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            />
          </button>
        </div>
      </motion.div>

      {/* Individual Toggle Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {toggleRows.filter(r => r.key !== 'enabled').map((row, idx) => {
          const isEnabled = (settings as any)[row.key] as boolean
          return (
            <motion.div
              key={row.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              style={{
                background: isEnabled ? `${row.color}06` : 'rgba(255,255,255,0.02)',
                borderRadius: 16,
                padding: '12px 14px',
                border: `0.5px solid ${isEnabled ? `${row.color}15` : 'rgba(255,255,255,0.04)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: settings.enabled ? 1 : 0.4,
                pointerEvents: settings.enabled ? 'auto' : 'none',
                transition: 'opacity 0.3s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: `${row.color}10`,
                  border: `0.5px solid ${row.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: row.color,
                }}>
                  {row.icon}
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: C.text,
                  fontFamily: "'Cairo', sans-serif",
                }}>
                  {row.label}
                </span>
              </div>
              <button
                onClick={() => updateSettings({ [row.key]: !isEnabled })}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: isEnabled ? row.color : 'rgba(255,255,255,0.1)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <motion.div
                  animate={{ x: isEnabled ? 18 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  style={{
                    position: 'absolute', top: 2, left: 0,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#FFF',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }}
                />
              </button>
            </motion.div>
          )
        })}
      </div>

      {/* Min Confidence Slider */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{
          marginTop: 16,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 16,
          padding: '14px 16px',
          border: '0.5px solid rgba(255,255,255,0.06)',
          opacity: settings.enabled ? 1 : 0.4,
          pointerEvents: settings.enabled ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} color={C.accent} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>
              حد الثقة الأدنى
            </span>
          </div>
          <span style={{
            fontSize: 14, fontWeight: 900, color: C.accent,
            fontFamily: "'JetBrains Mono', monospace",
            padding: '2px 10px', borderRadius: 8,
            background: 'rgba(0,212,255,0.08)',
            border: '0.5px solid rgba(0,212,255,0.15)',
          }}>
            {settings.minConfidence}%
          </span>
        </div>
        <input
          type="range"
          min={40}
          max={95}
          step={5}
          value={settings.minConfidence}
          onChange={(e) => updateSettings({ minConfidence: parseInt(e.target.value) })}
          style={{
            width: '100%', accentColor: C.accent,
            height: 4, borderRadius: 2,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>40% — عرض الكل</span>
          <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>95% — الأقوى فقط</span>
        </div>
      </motion.div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════ */
export default function MobileNotificationsPage() {
  const router = useRouter()
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const dismiss = useNotificationStore((s) => s.dismiss)
  const clearAll = useNotificationStore((s) => s.clearAll)

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Map server notification sources to valid NotifSource types
  const mapServerSource = (source: string): NotifSource => {
    const sourceMap: Record<string, NotifSource> = {
      new_user: 'system',
      subscription_upgrade: 'system',
      system_error: 'system',
      performance_alert: 'trade',
      large_trade: 'trade',
      system_update: 'system',
      admin_test: 'system',
      push: 'system',
    }
    const validSources: NotifSource[] = ['bot', 'ai', 'scanner', 'trade', 'system']
    if (validSources.includes(source as NotifSource)) return source as NotifSource
    return sourceMap[source] || 'system'
  }

  // Map server action/type to valid NotifAction
  const mapServerAction = (action: string, type?: string): NotifAction => {
    const validActions: NotifAction[] = ['BUY', 'SELL', 'INFO', 'WARN', 'CLOSE', 'CANCEL']
    if (validActions.includes(action as NotifAction)) return action as NotifAction
    if (type && validActions.includes(type as NotifAction)) return type as NotifAction
    return 'INFO'
  }

  // Fetch real notifications from server on mount and periodically
  useEffect(() => {
    const fetchServerNotifications = async () => {
      try {
        const res = await fetch('/api/notifications/events?limit=50')
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            const { addNotification } = useNotificationStore.getState()
            for (const notif of data.data) {
              const mappedSource = mapServerSource(notif.source || 'system')
              const mappedAction = mapServerAction(notif.action || '', notif.type)
              // Dedup by title + source + body to prevent re-adding server notifications
              const exists = useNotificationStore.getState().notifications.some(n =>
                n.title === (notif.title || '') &&
                n.source === mappedSource &&
                n.body === (notif.body || notif.message || '')
              )
              if (!exists) {
                addNotification({
                  source: mappedSource,
                  priority: notif.priority || 'medium',
                  action: mappedAction,
                  title: notif.title || '',
                  body: notif.body || notif.message || '',
                  pair: notif.pair || notif.symbol,
                  price: notif.price,
                  confidence: notif.confidence,
                })
              }
            }
          }
        }
      } catch { /* silent */ }
    }
    fetchServerNotifications()
    const interval = setInterval(fetchServerNotifications, 30000) // 30s polling
    return () => clearInterval(interval)
  }, [])

  /* ── Computed ─────────────────────── */
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'settings') return []
    const tab = FILTER_TABS.find((t) => t.id === activeFilter)
    if (!tab || tab.id === 'all') return notifications
    return notifications.filter((n) => tab.sources.includes(n.source))
  }, [notifications, activeFilter])

  const activeTabLabel = FILTER_TABS.find((t) => t.id === activeFilter)?.label ?? 'الكل'

  /* ── Handlers ─────────────────────── */
  const handleRead = useCallback(
    (id: string) => { markRead(id) },
    [markRead]
  )

  const handleDismiss = useCallback(
    (id: string) => { dismiss(id) },
    [dismiss]
  )

  const handleMarkAllRead = useCallback(() => {
    markAllRead()
  }, [markAllRead])

  const handleClearAll = useCallback(() => {
    clearAll()
    setShowClearConfirm(false)
  }, [clearAll])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/notifications/events?limit=50')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          const { addNotification } = useNotificationStore.getState()
          for (const notif of data.data) {
            const mappedSource = mapServerSource(notif.source || 'system')
            const mappedAction = mapServerAction(notif.action || '', notif.type)
            const exists = useNotificationStore.getState().notifications.some(n =>
              n.title === (notif.title || '') &&
              n.source === mappedSource &&
              n.body === (notif.body || notif.message || '')
            )
            if (!exists) {
              addNotification({
                source: mappedSource,
                priority: notif.priority || 'medium',
                action: mappedAction,
                title: notif.title || '',
                body: notif.body || notif.message || '',
                pair: notif.pair || notif.symbol,
                price: notif.price,
                confidence: notif.confidence,
              })
            }
          }
        }
      }
    } catch { /* silent */ } finally { setIsRefreshing(false) }
  }, [])

  /* ── Unread count per filter ─── */
  const filterCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: 0, bot: 0, system: 0, trade: 0, settings: 0 }
    notifications.forEach((n) => {
      if (!n.read) {
        counts.all++
        const tab = FILTER_TABS.find((t) => t.id !== 'all' && t.sources.includes(n.source))
        if (tab) counts[tab.id]++
      }
    })
    return counts
  }, [notifications])

  return (
    <div style={{
      minHeight: '100%',
      background: '#0B0E14',
      direction: 'rtl',
      paddingBottom: 20,
      position: 'relative',
      overflowX: 'hidden',
      width: '100%',
      maxWidth: '100vw',
    }}>
      {/* ── Ambient Glow ── */}
      <div style={{
        position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ════════════════════════════════════
          Header
          ════════════════════════════════════ */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="flex items-center gap-3">
          {/* Back Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => router.back()}
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.07)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>

          {/* Title */}
          <div style={{ flex: 1 }}>
            <div className="flex items-center gap-2">
              <h1 style={{
                fontSize: 20, fontWeight: 900,
                color: '#FFFFFF', fontFamily: "'Cairo', sans-serif",
              }}>
                الإشعارات
              </h1>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    fontSize: 11, fontWeight: 800,
                    padding: '2px 10px', borderRadius: 12,
                    background: `${C.accent}15`,
                    border: `0.5px solid ${C.accent}30`,
                    color: C.accent,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {unreadCount} جديد
                </motion.span>
              )}
            </div>
          </div>

          {/* Mark All Read */}
          {unreadCount > 0 && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleMarkAllRead}
              style={{
                padding: '8px 12px', borderRadius: 12,
                background: 'rgba(50,215,75,0.08)',
                border: '0.5px solid rgba(50,215,75,0.2)',
                display: 'flex', alignItems: 'center', gap: 5,
                color: C.success, fontSize: 11, fontWeight: 800,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              }}
            >
              <CheckCheck size={14} />
              قراءة الكل
            </motion.button>
          )}

          {/* Refresh */}
          <motion.button
            whileTap={{ scale: 0.9, rotate: 180 }}
            onClick={handleRefresh}
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <RefreshCw
              size={16}
              color="#FFFFFF"
              className={isRefreshing ? 'animate-spin' : ''}
            />
          </motion.button>
        </div>

        {/* ════════════════════════════════════
            Filter Tabs
            ════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 2,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 14, padding: 3,
          border: '0.5px solid rgba(255,255,255,0.06)',
          marginTop: 14,
        }}>
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.id
            const count = filterCounts[tab.id]
            return (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => setActiveFilter(tab.id)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 12,
                  minHeight: 44, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: isActive ? 800 : 600,
                  fontFamily: "'Cairo', sans-serif",
                  background: isActive ? C.accent : 'transparent',
                  color: isActive ? '#000000' : C.text2,
                  transition: 'all 0.2s',
                  position: 'relative',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 5,
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    padding: '0px 6px', borderRadius: 8,
                    background: isActive ? 'rgba(0,0,0,0.15)' : `${C.accent}15`,
                    color: isActive ? '#000000' : C.accent,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {count}
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ════════════════════════════════════
          Pull-to-refresh indicator
          ════════════════════════════════════ */}
      <AnimatePresence>
        {isRefreshing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 48 }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, overflow: 'hidden',
            }}
          >
            <RefreshCw size={16} color={C.accent} className="animate-spin" />
            <span style={{
              fontSize: 12, color: C.accent,
              fontFamily: "'Cairo', sans-serif", fontWeight: 700,
            }}>
              جاري التحديث...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════
          Notification List or Settings
          ════════════════════════════════════ */}
      {activeFilter === 'settings' ? (
        <MobileNotifSettings />
      ) : (
        <div style={{ paddingTop: 12, position: 'relative', zIndex: 1 }}>
          {filteredNotifications.length === 0 ? (
            <EmptyState filterLabel={activeTabLabel} />
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredNotifications.map((notif, i) => (
                <NotificationCard
                  key={notif.id}
                  item={notif}
                  index={i}
                  onRead={handleRead}
                  onDismiss={handleDismiss}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* ════════════════════════════════════
          Clear All Button (Fixed Bottom)
          ════════════════════════════════════ */}
      {notifications.length > 0 && activeFilter !== 'settings' && (
        <div style={{
          position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          left: 20, right: 20, zIndex: 40,
        }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowClearConfirm(true)}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 20,
              background: 'rgba(255,69,58,0.08)',
              border: '0.5px solid rgba(255,69,58,0.15)',
              color: C.danger, fontSize: 14, fontWeight: 800,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <Trash2 size={16} />
            حذف جميع الإشعارات
          </motion.button>
        </div>
      )}

      {/* ════════════════════════════════════
          Clear Confirmation Modal
          ════════════════════════════════════ */}
      <ConfirmModal
        open={showClearConfirm}
        title="حذف جميع الإشعارات"
        message="سيتم حذف جميع الإشعارات نهائياً. هذا الإجراء لا يمكن التراجع عنه."
        confirmLabel="حذف الكل"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  )
}
