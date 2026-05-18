'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

interface MobilePageHeaderProps {
  title: string
  subtitle?: string
  rightAction?: React.ReactNode
  sticky?: boolean
  gradient?: string
}

/**
 * Shared mobile page header with back button.
 * Replaces the duplicated header pattern across 15+ mobile pages.
 *
 * BEFORE: Each page had its own header with different back button icons
 * (ArrowRight, ChevronLeft, ChevronRight with rotate), different padding,
 * and different background styles.
 * AFTER: Unified header with RTL-safe back navigation.
 */
export default function MobilePageHeader({
  title,
  subtitle,
  rightAction,
  sticky = false,
  gradient,
}: MobilePageHeaderProps) {
  const router = useRouter()

  return (
    <div
      style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 12px) 16px 14px',
        background: gradient || 'rgba(28,28,30,0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...(sticky ? { position: 'sticky', top: 0, zIndex: 50 } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="رجوع"
        >
          <ChevronRight size={20} color="#F0F2F5" />
        </motion.button>
        <div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#F0F2F5',
            fontFamily: "'Cairo', sans-serif",
            lineHeight: 1.2,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize: 11,
              color: 'rgba(235,235,245,0.5)',
              fontFamily: "'Cairo', sans-serif",
              marginTop: 2,
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {rightAction && <div>{rightAction}</div>}
    </div>
  )
}
