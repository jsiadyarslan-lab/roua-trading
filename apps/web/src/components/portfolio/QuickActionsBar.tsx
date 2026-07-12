'use client'

import { XCircle, Shield, RefreshCw, Link2 } from 'lucide-react'
import T from '@/lib/unified-tokens'
import { useTranslations } from 'next-intl'

interface QuickActionsBarProps {
  onAction?: (action: string) => void
}

const ACTION_CONFIG = [
  { id: 'close-all', labelKey: 'closeAll', icon: XCircle, accent: T.red },
  { id: 'hedge', labelKey: 'hedge', icon: Shield, accent: T.amber },
  { id: 'rebalance', labelKey: 'rebalance', icon: RefreshCw, accent: T.cyan },
  { id: 'link-account', labelKey: 'linkAccount', icon: Link2, accent: T.green },
] as const

export function QuickActionsBar({ onAction }: QuickActionsBarProps) {
  const t = useTranslations('portfolio')

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        direction: 'inherit',
        width: '100%',
      }}
    >
      {ACTION_CONFIG.map((action) => {
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
              fontFamily: "var(--font-ar)",
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
              {t(action.labelKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
