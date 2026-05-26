'use client'

import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Lock, TrendingUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { T } from '@/lib/unified-tokens'
import { useTranslations } from 'next-intl'

/**
 * GuestGuard — Prevents guest users from executing actions.
 *
 * Wraps action areas (buttons, forms, panels).
 * - If user is authenticated: renders children normally
 * - If user is guest: renders children with disabled overlay + upgrade prompt
 *
 * Usage:
 * <GuestGuard action="Execute trade">
 *   <button onClick={executeTrade}>Execute</button>
 * </GuestGuard>
 */
export function GuestGuard({
  children,
  action = '',
}: {
  children: React.ReactNode
  action?: string
}) {
  const { isGuest, loading } = useAuth()
  const [showUpgrade, setShowUpgrade] = useState(false)
  const tg = useTranslations('guest')

  // While loading, render normally (don't block UI)
  if (loading) return <>{children}</>

  // Authenticated user — full access
  if (!isGuest) return <>{children}</>

  // Guest user — wrap with click blocker
  return (
    <div className="relative" onClick={(e) => {
      e.stopPropagation()
      e.preventDefault()
      setShowUpgrade(true)
    }}>
      {/* Render children but visually dimmed */}
      <div className="pointer-events-none opacity-60">
        {children}
      </div>

      {/* Lock overlay on hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-sm border border-white/10">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-white/90 text-xs">
            {tg('loginToAccess')}
          </span>
        </div>
      </div>

      {/* Upgrade modal */}
      <AnimatePresence>
        {showUpgrade && (
          <GuestUpgradeModal
            action={action}
            onClose={() => setShowUpgrade(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * GuestUpgradeModal — Modal shown when guest tries to execute an action.
 * Prompts them to sign up / log in.
 */
function GuestUpgradeModal({
  action,
  onClose,
}: {
  action: string
  onClose: () => void
}) {
  const router = useRouter()
  const tg = useTranslations('guest')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-sm backdrop-blur-2xl bg-white/[0.05] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${T.accent}, ${T.profit})`,
              boxShadow: `0 0 30px ${T.profit}33`,
            }}
          >
            <Lock className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-center mb-2" style={{ color: '#E2E8F0' }}>
          {tg('loginRequired')}
        </h3>

        {/* Description */}
        <p className="text-center text-sm mb-6" style={{ color: '#94A3B8' }}>
          {tg('fullExperienceDesc')}
        </p>

        {/* Login button */}
        <button
          onClick={() => router.push('/login')}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
                     bg-gradient-to-l from-emerald-600 to-emerald-500 text-white font-bold text-sm
                     hover:from-emerald-500 hover:to-emerald-400
                     transition-all duration-200 mb-3"
          style={{ boxShadow: `0 0 20px ${T.profit}26` }}
        >
          <TrendingUp className="w-4 h-4" />
          <span>{tg('loginButton')}</span>
        </button>

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="w-full py-2.5 px-6 rounded-xl text-white/40 text-sm
                     hover:text-white/60 hover:bg-white/[0.03]
                     transition-all duration-200"
        >
          {tg('continueAsGuest')}
        </button>
      </motion.div>
    </motion.div>
  )
}

/**
 * GuestBanner — Floating banner shown at top of dashboard for guests.
 * Reminds them they're in view-only mode and prompts login.
 */
export function GuestBanner() {
  const { isGuest, loading } = useAuth()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const tg = useTranslations('guest')

  if (loading || !isGuest || dismissed) return null

  return (
    <div
      className="w-full py-2 px-4 flex items-center justify-center gap-3 border-b"
      style={{
        background: `${T.profit}14`,
        borderColor: `${T.profit}26`,
      }}
    >
      <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <span className="text-xs" style={{ color: '#94A3B8' }}>
        {tg('viewModeBanner')}
      </span>
      <button
        onClick={() => router.push('/login')}
        className="text-xs font-bold px-3 py-1 rounded-lg transition-all duration-200 shrink-0"
        style={{
          background: `${T.profit}26`,
          color: T.profit,
        }}
      >
        {tg('loginButton')}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/20 hover:text-white/40 transition-colors shrink-0 text-xs"
      >
        ✕
      </button>
    </div>
  )
}
