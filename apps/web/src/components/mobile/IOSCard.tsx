'use client'

import { motion } from 'framer-motion'

interface IOSCardProps {
  children: React.ReactNode
  onClick?: () => void
  highlight?: boolean
  noMargin?: boolean
  style?: React.CSSProperties
  className?: string
}

/**
 * Shared iOS-style glass card component for mobile pages.
 * Replaces the duplicated IOSCard / GlassCard across 8+ pages.
 *
 * BEFORE: Each page (strategies, profile, security, kyc, billing, help, social, etc.)
 * defined its own IOSCard/GlassCard locally.
 * AFTER: Single shared component with consistent styling.
 */
export default function IOSCard({ children, onClick, highlight = false, noMargin = false, style, className }: IOSCardProps) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98, y: 2 } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      className={className}
      style={{
        background: highlight
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)'
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: 16,
        margin: noMargin ? 0 : '0 20px 16px',
        cursor: onClick ? 'pointer' : 'default',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
        ...style,
      }}
    >
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
          zIndex: 10
        }} />
      )}
      {children}
    </motion.div>
  )
}
