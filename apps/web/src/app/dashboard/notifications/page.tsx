'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Settings2,
  CheckCheck,
  Trash2,
  CheckSquare,
  Zap,
  BarChart3,
  AlertTriangle,
  Target,
  Brain,
  X,
  ExternalLink,
  Volume2,
  VolumeX,
  Eye,
  BellRing,
  Wifi,
  Activity,
} from 'lucide-react'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import { T } from '@/lib/theme-tokens'
import { toast } from '@/hooks/use-toast'

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

type NotificationCategory = 'signal' | 'trade' | 'security' | 'system' | 'price' | 'ai'

interface NotificationItem {
  id: string
  category: NotificationCategory
  title: string
  description: string
  timestamp: Date
  read: boolean
  actionLabel?: string
  actionHref?: string
  // signal-specific
  signalDirection?: 'BUY' | 'SELL'
  signalSymbol?: string
  signalConfidence?: number
  // price-specific
  priceSymbol?: string
  priceTarget?: number
  priceCurrent?: number
}

interface PreferenceToggle {
  key: string
  label: string
  description: string
  icon: React.ReactNode
  enabled: boolean
}

/* ═══════════════════════════════════════════════════════════
   Category Config
   ═══════════════════════════════════════════════════════════ */

const CATEGORY_CONFIG: Record<NotificationCategory, {
  label: string
  icon: React.ReactNode
  color: string
  bgColor: string
  borderColor: string
  gradient: string
}> = {
  signal: {
    label: 'الإشارات',
    icon: <Zap size={14} />,
    color: '#00FFA3',
    bgColor: 'rgba(0,255,163,0.08)',
    borderColor: 'rgba(0,255,163,0.20)',
    gradient: 'linear-gradient(135deg, #00FFA3, #10B981)',
  },
  trade: {
    label: 'الحسابات المربوطة',
    icon: <BarChart3 size={14} />,
    color: '#00D4FF',
    bgColor: 'rgba(0,212,255,0.08)',
    borderColor: 'rgba(0,212,255,0.20)',
    gradient: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
  },
  security: {
    label: 'الأمان',
    icon: <ShieldCheck size={14} />,
    color: '#FF4757',
    bgColor: 'rgba(255,71,87,0.08)',
    borderColor: 'rgba(255,71,87,0.20)',
    gradient: 'linear-gradient(135deg, #FF4757, #FF6B81)',
  },
  system: {
    label: 'النظام',
    icon: <Settings2 size={14} />,
    color: '#8B92A8',
    bgColor: 'rgba(139,146,168,0.08)',
    borderColor: 'rgba(139,146,168,0.15)',
    gradient: 'linear-gradient(135deg, #8B92A8, #64748B)',
  },
  price: {
    label: 'الأسعار',
    icon: <Target size={14} />,
    color: '#FFB800',
    bgColor: 'rgba(255,184,0,0.08)',
    borderColor: 'rgba(255,184,0,0.20)',
    gradient: 'linear-gradient(135deg, #FFB800, #F59E0B)',
  },
  ai: {
    label: 'الذكاء الاصطناعي',
    icon: <Brain size={14} />,
    color: '#B388FF',
    bgColor: 'rgba(179,136,255,0.08)',
    borderColor: 'rgba(179,136,255,0.20)',
    gradient: 'linear-gradient(135deg, #B388FF, #A259FF)',
  },
}

/* ═══════════════════════════════════════════════════════════
   Filter Tabs Config
   ═══════════════════════════════════════════════════════════ */

type FilterTab = 'all' | 'signal' | 'trade' | 'security' | 'system'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'signal', label: 'الإشارات' },
  { id: 'trade', label: 'الحسابات' },
  { id: 'security', label: 'الأمان' },
  { id: 'system', label: 'النظام' },
]

/* ═══════════════════════════════════════════════════════════
   Arabic Time Formatting
   ═══════════════════════════════════════════════════════════ */

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
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
   Mock Data
   ═══════════════════════════════════════════════════════════ */

function generateMockNotifications(): NotificationItem[] {
  const now = new Date()
  return [
    {
      id: 'n1',
      category: 'signal',
      title: 'إشارة شراء BTC/USDT',
      description: 'نمط تصاعدي قوي على إطار 4 ساعات مع تقاطع MACD إيجابي. حجم التداول أعلى من المتوسط بـ 1.8x.',
      timestamp: new Date(now.getTime() - 5 * 60 * 1000),
      read: false,
      actionLabel: 'عرض الإشارة',
      signalDirection: 'BUY',
      signalSymbol: 'BTC/USDT',
      signalConfidence: 87,
    },
    {
      id: 'n2',
      category: 'signal',
      title: 'إشارة بيع ETH/USDT',
      description: 'مقاومة قوية عند $3,850 مع انعكاس RSI. نمط هابط على إطار يومي.',
      timestamp: new Date(now.getTime() - 18 * 60 * 1000),
      read: false,
      actionLabel: 'عرض الإشارة',
      signalDirection: 'SELL',
      signalSymbol: 'ETH/USDT',
      signalConfidence: 74,
    },
    {
      id: 'n3',
      category: 'trade',
      title: 'تم رصد أمر شراء على حسابك المربوط',
      description: 'رصد شراء 0.15 BTC بسعر $67,234.50 على حساب Binance المربوط.',
      timestamp: new Date(now.getTime() - 42 * 60 * 1000),
      read: false,
      actionLabel: 'عرض الصفقة',
    },
    {
      id: 'n4',
      category: 'security',
      title: 'تسجيل دخول من جهاز جديد',
      description: 'تم تسجيل دخول حسابك من Chrome على Windows في الرياض، المملكة العربية السعودية.',
      timestamp: new Date(now.getTime() - 1.5 * 60 * 60 * 1000),
      read: false,
      actionLabel: 'مراجعة الأمان',
    },
    {
      id: 'n5',
      category: 'system',
      title: 'صيانة مجدولة',
      description: 'سيتم إجراء صيانة دورية يوم الجمعة من 2:00 إلى 4:00 صباحاً بتوقيت مكة. قد تتأثر بعض الخدمات.',
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      read: true,
      actionLabel: 'التفاصيل',
    },
    {
      id: 'n6',
      category: 'price',
      title: 'SOL وصل للهدف',
      description: 'سعر SOL/USDT وصل للهدف المحدد عند $178.50. السعر الحالي: $179.20 (+5.2%).',
      timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      read: false,
      actionLabel: 'عرض الرسم البياني',
      priceSymbol: 'SOL/USDT',
      priceTarget: 178.50,
      priceCurrent: 179.20,
    },
    {
      id: 'n7',
      category: 'ai',
      title: 'تحليل ذكي جديد',
      description: 'اكتشف الذكاء الاصطناعي نمطاً متكرراً في زوج XRP/USDT بنسبة نجاح 82% خلال آخر 30 يوم.',
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      read: false,
      actionLabel: 'عرض التحليل',
    },
    {
      id: 'n8',
      category: 'trade',
      title: 'تم رصد إغلاق صفقة بربح على حسابك المربوط',
      description: 'تم إغلاق صفقة شراء AAPL بربح +3.4%. العائد: +$127.50. مدة الصفقة: 2 يوم.',
      timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      read: true,
      actionLabel: 'عرض التفاصيل',
    },
    {
      id: 'n9',
      category: 'signal',
      title: 'إشارة شراء GOLD',
      description: 'اختراق مستوى مقاومة رئيسي عند $2,380 مع زخم إيجابي. هدف: $2,420.',
      timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      read: true,
      actionLabel: 'عرض الإشارة',
      signalDirection: 'BUY',
      signalSymbol: 'XAU/USD',
      signalConfidence: 79,
    },
    {
      id: 'n10',
      category: 'system',
      title: 'تحديث المنصة v2.8.0',
      description: 'تم إضافة ميزات جديدة: تحليل متعدد الأطر الزمنية، تحسينات أداء الرسم البياني، ودعم المحفظة المتقدمة.',
      timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      read: true,
      actionLabel: 'ما الجديد',
    },
    {
      id: 'n11',
      category: 'security',
      title: 'تم تفعيل المصادقة الثنائية',
      description: 'تم تفعيل المصادقة الثنائية (2FA) بنجاح على حسابك. حسابك الآن أكثر أماناً.',
      timestamp: new Date(now.getTime() - 26 * 60 * 60 * 1000),
      read: true,
    },
    {
      id: 'n12',
      category: 'price',
      title: 'تنبيه سعر TSLA',
      description: 'سعر TSLA انخفض تحت مستوى $240. السعر الحالي: $237.80 (-2.8% اليوم).',
      timestamp: new Date(now.getTime() - 30 * 60 * 60 * 1000),
      read: false,
      actionLabel: 'عرض الرسم البياني',
      priceSymbol: 'TSLA',
      priceTarget: 240,
      priceCurrent: 237.80,
    },
    {
      id: 'n13',
      category: 'ai',
      title: 'تنبيه ذكاء اصطناعي',
      description: 'النموذج التنبؤي يُشير إلى احتمالية ارتفاع BTC خلال الـ 48 ساعة القادمة بنسبة 71%.',
      timestamp: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      read: true,
      actionLabel: 'عرض التنبؤ',
    },
    {
      id: 'n14',
      category: 'trade',
      title: 'تم رصد أمر بيع على حسابك المربوط',
      description: 'تم رصد بيع 5 أسهم TSLA بسعر $238.90 على حسابك المربوط.',
      timestamp: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      read: true,
      actionLabel: 'عرض الصفقة',
    },
  ]
}

/* ═══════════════════════════════════════════════════════════
   Notification Card Component
   ═══════════════════════════════════════════════════════════ */

function NotificationCard({
  item,
  index,
  isHovered,
  isSelected,
  onHover,
  onLeave,
  onRead,
  onSelect,
  onAction,
  onDelete,
}: {
  item: NotificationItem
  index: number
  isHovered: boolean
  isSelected: boolean
  onHover: () => void
  onLeave: () => void
  onRead: (id: string) => void
  onSelect: (id: string) => void
  onAction: (item: NotificationItem) => void
  onDelete: (id: string) => void
}) {
  const config = CATEGORY_CONFIG[item.category]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, scale: 0.95 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={() => onRead(item.id)}
      style={{
        background: isSelected
          ? `${config.color}0A`
          : !item.read
            ? `${config.color}04`
            : 'transparent',
        border: `1px solid ${isSelected ? config.borderColor : isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
        borderRightWidth: !item.read ? '3px' : '1px',
        borderRightColor: !item.read ? config.color : isSelected ? config.borderColor : 'rgba(255,255,255,0.04)',
        borderRadius: '10px',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle glow for unread */}
      {!item.read && (
        <div style={{
          position: 'absolute',
          top: '-15px',
          right: '-15px',
          width: '60px',
          height: '60px',
          background: config.color,
          filter: 'blur(35px)',
          opacity: 0.08,
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Selection checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(item.id) }}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            border: isSelected ? `1.5px solid ${config.color}` : '1.5px solid rgba(255,255,255,0.12)',
            background: isSelected ? `${config.color}20` : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
            transition: 'all 0.15s',
          }}
        >
          {isSelected && <CheckCheck size={11} color={config.color} strokeWidth={2.5} />}
        </button>

        {/* Category Icon */}
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '9px',
          background: config.gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#fff',
          boxShadow: `0 0 12px ${config.color}20`,
        }}>
          {config.icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: item.read ? 600 : 800,
              color: item.read ? T.text2 : T.text,
              fontFamily: "'Cairo', sans-serif",
            }}>
              {item.title}
            </span>

            {/* Signal direction badge */}
            {item.signalDirection && (
              <span style={{
                fontSize: '9px',
                fontWeight: 800,
                padding: '1px 8px',
                borderRadius: '4px',
                background: item.signalDirection === 'BUY'
                  ? 'rgba(0,255,163,0.12)'
                  : 'rgba(255,71,87,0.12)',
                border: `1px solid ${item.signalDirection === 'BUY' ? 'rgba(0,255,163,0.25)' : 'rgba(255,71,87,0.25)'}`,
                color: item.signalDirection === 'BUY' ? '#00FFA3' : '#FF4757',
                fontFamily: "'Cairo', sans-serif",
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }} dir="ltr">
                {item.signalDirection === 'BUY' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                {item.signalDirection === 'BUY' ? 'شراء' : 'بيع'}
              </span>
            )}

            {/* Category badge */}
            <span style={{
              fontSize: '8px',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: '4px',
              background: config.bgColor,
              border: `1px solid ${config.borderColor}`,
              color: config.color,
              fontFamily: "'Cairo', sans-serif",
            }}>
              {config.label}
            </span>

            {/* Confidence badge for signals */}
            {item.signalConfidence && (
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: item.signalConfidence >= 80 ? '#00FFA3' : item.signalConfidence >= 60 ? '#FFB800' : '#FF4757',
              }} dir="ltr">
                {item.signalConfidence}%
              </span>
            )}
          </div>

          {/* Symbol for signals/prices */}
          {(item.signalSymbol || item.priceSymbol) && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '5px',
              padding: '2px 8px',
              borderRadius: '5px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: T.text,
              }} dir="ltr">
                {item.signalSymbol || item.priceSymbol}
              </span>
              {item.priceCurrent && (
                <span style={{
                  fontSize: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: T.text2,
                }} dir="ltr">
                  ${item.priceCurrent.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Description */}
          <p style={{
            fontSize: '11px',
            color: T.text2,
            lineHeight: '1.65',
            margin: 0,
            fontFamily: "'Cairo', sans-serif",
          }}>
            {item.description}
          </p>

          {/* Bottom Row: time + action */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '8px',
          }}>
            <span style={{
              fontSize: '10px',
              color: T.text2,
              fontFamily: "'Cairo', sans-serif",
              opacity: 0.7,
            }}>
              {formatTimeAgo(item.timestamp)}
            </span>

            {/* Action button */}
            {item.actionLabel && isHovered && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={(e) => { e.stopPropagation(); onAction(item) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 10px',
                  borderRadius: '5px',
                  background: config.bgColor,
                  border: `1px solid ${config.borderColor}`,
                  color: config.color,
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <ExternalLink size={9} />
                {item.actionLabel}
              </motion.button>
            )}
          </div>
        </div>

        {/* Unread dot */}
        {!item.read && (
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: config.color,
            boxShadow: `0 0 8px ${config.color}60`,
            flexShrink: 0,
            marginTop: '6px',
          }} />
        )}

        {/* Delete button on hover */}
        {isHovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
            style={{
              background: 'rgba(255,71,87,0.08)',
              border: '1px solid rgba(255,71,87,0.15)',
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FF4757',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            <X size={12} />
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Preference Toggle Switch
   ═══════════════════════════════════════════════════════════ */

function ToggleSwitch({
  enabled,
  onToggle,
  color = '#00D4FF',
}: {
  enabled: boolean
  onToggle: () => void
  color?: string
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '42px',
        height: '22px',
        borderRadius: '11px',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        background: enabled ? color : 'rgba(255,255,255,0.08)',
        transition: 'background 0.25s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: '3px',
        right: enabled ? '3px' : 'auto',
        left: enabled ? 'auto' : '3px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'all 0.25s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   Empty State Component
   ═══════════════════════════════════════════════════════════ */

function EmptyState({ filterLabel }: { filterLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: '14px',
        padding: '56px 24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '140px',
        height: '140px',
        background: 'linear-gradient(135deg, #00D4FF, #B388FF)',
        filter: 'blur(60px)',
        opacity: 0.06,
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(179,136,255,0.15))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        border: '1px solid rgba(0,212,255,0.12)',
      }}>
        <BellRing size={24} color="#00D4FF" />
      </div>

      <p style={{
        fontSize: '15px',
        fontWeight: 700,
        color: T.text,
        fontFamily: "'Cairo', sans-serif",
        margin: '0 0 6px',
      }}>
        لا توجد إشعارات
      </p>
      <p style={{
        fontSize: '12px',
        color: T.text2,
        fontFamily: "'Cairo', sans-serif",
        lineHeight: '1.6',
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
   Main Page Component
   ═══════════════════════════════════════════════════════════ */

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(generateMockNotifications)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showPreferences, setShowPreferences] = useState(false)

  // Preferences state
  const [preferences, setPreferences] = useState<PreferenceToggle[]>([
    { key: 'signals', label: 'تنبيهات الإشارات', description: 'إشعارات إشارات الشراء والبيع', icon: <Zap size={13} />, enabled: true },
    { key: 'trades', label: 'تنبيهات الحسابات المربوطة', description: 'رصد الأوامر وإغلاق الصفقات على الحسابات المربوطة', icon: <BarChart3 size={13} />, enabled: true },
    { key: 'security', label: 'تنبيهات الأمان', description: 'تسجيل الدخول وتغييرات الحساب', icon: <ShieldCheck size={13} />, enabled: true },
    { key: 'system', label: 'إشعارات النظام', description: 'الصيانة والتحديثات والأخبار', icon: <Settings2 size={13} />, enabled: true },
    { key: 'prices', label: 'تنبيهات الأسعار', description: 'وصول الأسعار للأهداف المحددة', icon: <Target size={13} />, enabled: true },
    { key: 'ai', label: 'رؤى الذكاء الاصطناعي', description: 'تحليلات وتنبؤات النماذج الذكية', icon: <Brain size={13} />, enabled: true },
    { key: 'sound', label: 'الأصوات', description: 'تشغيل صوت عند وصول إشعار جديد', icon: <Volume2 size={13} />, enabled: false },
    { key: 'desktop', label: 'إشعارات سطح المكتب', description: 'إرسال إشعارات المتصفح على سطح المكتب', icon: <BellRing size={13} />, enabled: true },
  ])

  // Computed
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications
    return notifications.filter(n => n.category === activeFilter)
  }, [notifications, activeFilter])

  const selectedCount = selectedIds.size
  const allSelected = filteredNotifications.length > 0 && selectedIds.size === filteredNotifications.length

  // Handlers
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    toast({ title: 'تم التحديث', description: 'تم تحديد جميع الإشعارات كمقروءة' })
  }, [])

  const deleteNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [])

  const deleteSelected = useCallback(() => {
    setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)))
    toast({ title: 'تم الحذف', description: `تم حذف ${selectedIds.size} إشعار` })
    setSelectedIds(new Set())
  }, [selectedIds])

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredNotifications.map(n => n.id)))
    }
  }, [allSelected, filteredNotifications])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const markSelectedAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, read: true } : n))
    toast({ title: 'تم التحديث', description: `تم تحديد ${selectedIds.size} إشعار كمقروء` })
    setSelectedIds(new Set())
  }, [selectedIds])

  const handleAction = useCallback((item: NotificationItem) => {
    markAsRead(item.id)
    toast({ title: item.title, description: item.actionLabel || 'تم فتح الإشعار' })
  }, [markAsRead])

  const togglePreference = useCallback((key: string) => {
    setPreferences(prev => prev.map(p => p.key === key ? { ...p, enabled: !p.enabled } : p))
  }, [])

  // Stats for header
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {}
    notifications.forEach(n => {
      if (!n.read) {
        stats[n.category] = (stats[n.category] || 0) + 1
      }
    })
    return stats
  }, [notifications])

  return (
    <SubPageLayout
      title="مركز الإشعارات"
      icon={<Bell size={14} color="#fff" />}
      iconBg="linear-gradient(135deg, #00D4FF, #B388FF)"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Unread count badge */}
          {unreadCount > 0 && (
            <span style={{
              fontSize: '9px',
              fontWeight: 800,
              padding: '2px 9px',
              borderRadius: '10px',
              background: 'rgba(0,212,255,0.12)',
              border: '1px solid rgba(0,212,255,0.25)',
              color: '#00D4FF',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {unreadCount} جديد
            </span>
          )}
          {/* Mark all read */}
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '7px',
                border: '1px solid rgba(0,255,163,0.20)',
                background: 'rgba(0,255,163,0.06)',
                color: '#00FFA3',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: "'Cairo', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <CheckCheck size={11} /> قراءة الكل
            </button>
          )}
          {/* Preferences toggle */}
          <button
            onClick={() => setShowPreferences(!showPreferences)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              borderRadius: '7px',
              border: showPreferences
                ? '1px solid rgba(179,136,255,0.30)'
                : '1px solid rgba(255,255,255,0.08)',
              background: showPreferences
                ? 'rgba(179,136,255,0.08)'
                : 'rgba(255,255,255,0.03)',
              color: showPreferences ? '#B388FF' : T.text2,
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Settings2 size={11} /> التفضيلات
          </button>
        </div>
      }
    >
      <style>{`
        @media (max-width: 767px) {
          .notif-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .notif-prefs-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .notif-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .notif-scroll::-webkit-scrollbar { width: 4px; }
        .notif-scroll::-webkit-scrollbar-track { background: transparent; }
        .notif-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .notif-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>

      {/* ── Quick Stats Row ── */}
      <div
        className="notif-stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        {(Object.keys(CATEGORY_CONFIG) as NotificationCategory[]).map((cat) => {
          const cfg = CATEGORY_CONFIG[cat]
          const count = categoryStats[cat] || 0
          return (
            <motion.button
              key={cat}
              onClick={() => setActiveFilter(cat === activeFilter ? 'all' : cat)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: '12px 10px',
                borderRadius: '10px',
                border: `1px solid ${activeFilter === cat ? cfg.borderColor : 'rgba(255,255,255,0.04)'}`,
                background: activeFilter === cat ? cfg.bgColor : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {activeFilter === cat && (
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '-10px',
                  width: '40px',
                  height: '40px',
                  background: cfg.color,
                  filter: 'blur(25px)',
                  opacity: 0.12,
                  pointerEvents: 'none',
                }} />
              )}
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '7px',
                background: cfg.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 6px',
                color: '#fff',
              }}>
                {cfg.icon}
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: cfg.color, fontFamily: "'JetBrains Mono', monospace" }}>
                {count}
              </div>
              <div style={{ fontSize: '9px', color: T.text2, fontFamily: "'Cairo', sans-serif", marginTop: '2px' }}>
                {cfg.label}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* ── Filter Tabs + Bulk Actions ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        {/* Filter Tabs */}
        <div style={{
          display: 'flex',
          gap: '2px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          padding: '3px',
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveFilter(tab.id); setSelectedIds(new Set()) }}
              style={{
                padding: '5px 14px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: "'Cairo', sans-serif",
                background: activeFilter === tab.id ? '#00D4FF' : 'transparent',
                color: activeFilter === tab.id ? '#fff' : T.text2,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
              {tab.id !== 'all' && categoryStats[tab.id] > 0 && (
                <span style={{
                  marginRight: '4px',
                  fontSize: '8px',
                  fontWeight: 800,
                  padding: '0px 5px',
                  borderRadius: '8px',
                  background: activeFilter === tab.id ? 'rgba(255,255,255,0.2)' : 'rgba(0,212,255,0.12)',
                  color: activeFilter === tab.id ? '#fff' : '#00D4FF',
                }}>
                  {categoryStats[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Bulk Actions */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={toggleSelectAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: T.text2,
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <CheckSquare size={10} />
            {allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}
          </button>

          {selectedCount > 0 && (
            <>
              <button
                onClick={markSelectedAsRead}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0,255,163,0.15)',
                  background: 'rgba(0,255,163,0.06)',
                  color: '#00FFA3',
                  fontSize: '10px',
                  fontWeight: 600,
                  fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Eye size={10} />
                تحديد كمقروء ({selectedCount})
              </button>
              <button
                onClick={deleteSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,71,87,0.15)',
                  background: 'rgba(255,71,87,0.06)',
                  color: '#FF4757',
                  fontSize: '10px',
                  fontWeight: 600,
                  fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Trash2 size={10} />
                حذف المحدد ({selectedCount})
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Notification List ── */}
      {filteredNotifications.length === 0 ? (
        <EmptyState filterLabel={FILTER_TABS.find(t => t.id === activeFilter)?.label || 'الكل'} />
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxHeight: 'calc(100vh - 360px)',
          overflowY: 'auto',
          paddingRight: '2px',
        }} className="notif-scroll">
          <AnimatePresence mode="popLayout">
            {filteredNotifications.map((item, i) => (
              <NotificationCard
                key={item.id}
                item={item}
                index={i}
                isHovered={hoveredId === item.id}
                isSelected={selectedIds.has(item.id)}
                onHover={() => setHoveredId(item.id)}
                onLeave={() => setHoveredId(null)}
                onRead={markAsRead}
                onSelect={toggleSelect}
                onAction={handleAction}
                onDelete={deleteNotification}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Notification Preferences Section ── */}
      <AnimatePresence>
        {showPreferences && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: '14px',
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* Section glow */}
              <div style={{
                position: 'absolute',
                top: '-20px',
                left: '-20px',
                width: '80px',
                height: '80px',
                background: '#B388FF',
                filter: 'blur(50px)',
                opacity: 0.06,
                pointerEvents: 'none',
              }} />

              {/* Header */}
              <div style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${T.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(179,136,255,0.03)',
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #B388FF, #A259FF)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Settings2 size={13} color="#fff" />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                  تفضيلات الإشعارات
                </span>
                <span style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(179,136,255,0.10)',
                  border: '1px solid rgba(179,136,255,0.20)',
                  color: '#B388FF',
                  fontFamily: "'Cairo', sans-serif",
                }}>
                  الإعدادات
                </span>
              </div>

              {/* Preferences Grid */}
              <div
                className="notif-prefs-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0px',
                }}
              >
                {preferences.map((pref, i) => {
                  const isEven = i % 2 === 0
                  return (
                    <div
                      key={pref.key}
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: i < preferences.length - 2 ? `1px solid ${T.border}` : 'none',
                        borderLeft: !isEven ? `1px solid ${T.border}` : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '7px',
                          background: pref.enabled ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${pref.enabled ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: pref.enabled ? '#00D4FF' : T.text2,
                          flexShrink: 0,
                          transition: 'all 0.2s',
                        }}>
                          {pref.enabled ? pref.icon : <VolumeX size={13} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: T.text,
                            fontFamily: "'Cairo', sans-serif",
                            marginBottom: '2px',
                          }}>
                            {pref.label}
                          </div>
                          <div style={{
                            fontSize: '9px',
                            color: T.text2,
                            fontFamily: "'Cairo', sans-serif",
                            lineHeight: '1.4',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {pref.description}
                          </div>
                        </div>
                      </div>
                      <ToggleSwitch
                        enabled={pref.enabled}
                        onToggle={() => togglePreference(pref.key)}
                        color={pref.enabled ? '#00D4FF' : '#8B92A8'}
                      />
                    </div>
                  )
                })}
              </div>

              {/* Footer info */}
              <div style={{
                padding: '10px 18px',
                borderTop: `1px solid ${T.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255,255,255,0.01)',
              }}>
                <AlertTriangle size={10} style={{ color: T.text2, flexShrink: 0 }} />
                <span style={{
                  fontSize: '9px',
                  color: T.text2,
                  fontFamily: "'Cairo', sans-serif",
                  lineHeight: '1.5',
                }}>
                  إيقاف نوع معين من الإشعارات لن يؤثر على التشغيل الفعلي للمنصة، بل فقط على التنبيهات التي تصل لك.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Summary ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '16px',
        padding: '10px 16px',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={12} style={{ color: T.text2 }} />
          <span style={{ fontSize: '10px', color: T.text2, fontFamily: "'Cairo', sans-serif" }}>
            {notifications.length} إشعار إجمالي
          </span>
          <span style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: '10px', color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>
            {unreadCount} غير مقروء
          </span>
          <span style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: '10px', color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>
            {notifications.length - unreadCount} مقروء
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Wifi size={10} style={{ color: '#00FFA3' }} />
          <span style={{ fontSize: '9px', color: T.text2, fontFamily: "'Cairo', sans-serif" }}>
            متصل مباشر
          </span>
        </div>
      </div>
    </SubPageLayout>
  )
}
