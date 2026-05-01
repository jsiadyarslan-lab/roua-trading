'use client'

import { XCircle, Shield, RefreshCw, Link2 } from 'lucide-react'
import { T } from '@/lib/theme-tokens'

interface QuickActionsBarProps {
  onAction?: (action: string) => void
}

const ACTIONS = [
  {
    id: 'close-all',
    label: 'إغلاق الكل',
    icon: XCircle,
    accent: T.red,
  },
  {
    id: 'hedge',
    label: 'تحوط',
    icon: Shield,
    accent: T.amber,
  },
  {
    id: 'rebalance',
    label: 'إعادة توازن',
    icon: RefreshCw,
    accent: T.cyan,
  },
  {
    id: 'link-account',
    label: 'ربط حساب',
    icon: Link2,
    accent: T.green,
  },
]

export function QuickActionsBar({ onAction }: QuickActionsBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        direction: 'rtl',
        width: '100%',
      }}
    >
      {ACTIONS.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction?.(action.id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '6px 4px',
              borderRadius: 8,
              border: `1px solid ${action.accent}25`,
              background: `linear-gradient(135deg, ${action.accent}0a, rgba(255,255,255,0.02))`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              color: action.accent,
              fontFamily: "'Cairo', sans-serif",
              fontSize: 8,
              fontWeight: 800,
              minWidth: 0,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = `${action.accent}50`
              el.style.background = `linear-gradient(135deg, ${action.accent}18, rgba(255,255,255,0.04))`
              el.style.boxShadow = `0 0 12px ${action.accent}15`
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = `${action.accent}25`
              el.style.background = `linear-gradient(135deg, ${action.accent}0a, rgba(255,255,255,0.02))`
              el.style.boxShadow = 'none'
            }}
          >
            <Icon size={12} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {action.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
