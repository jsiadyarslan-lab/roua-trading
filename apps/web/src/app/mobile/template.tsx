'use client'

import { motion } from 'framer-motion'

export default function MobileTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{ height: '100%', width: '100%' }}
    >
      {children}
    </motion.div>
  )
}
