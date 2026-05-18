'use client'

import { motion } from 'framer-motion'

/**
 * Mobile Page Transition Template
 * Wraps children in a framer-motion div with fade + slide-up animation.
 * Applied automatically by Next.js App Router to all pages in /mobile/*.
 */
export default function MobileTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  )
}
