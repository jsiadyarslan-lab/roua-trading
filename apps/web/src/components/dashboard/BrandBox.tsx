'use client'

import { motion } from 'framer-motion'

export default function BrandBox() {
  return (
    <div
      className="brand-box relative flex flex-col items-center justify-center gap-1"
      style={{
        gridArea: 'brand',
        width: '64px',
        background: 'var(--bg-sidebar)',
        borderInlineEnd: '1px solid var(--border-accent)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Brand glow — radial gradient behind icon */}
      <div
        className="brand-glow absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 60%)',
          opacity: 0.15,
          filter: 'blur(20px)',
        }}
      />

      {/* Pulsing glow layer */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          className="w-10 h-10 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', filter: 'blur(6px)' }}
        />
      </motion.div>

      {/* Icon "ر" */}
      <motion.div
        className="relative z-10 flex items-center justify-center w-10 h-10 rounded-lg"
        style={{
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          boxShadow: 'var(--glow-accent)',
        }}
        animate={{
          boxShadow: ['0 0 12px #0596694d', '0 0 20px #0596696d', '0 0 12px #0596694d'],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span
          className="brand-icon text-xl font-bold"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-ar)' }}
        >
          ر
        </span>
      </motion.div>

      {/* Brand name "رؤى" */}
      <span
        className="brand-text text-[10px] font-semibold tracking-wider relative z-10"
        style={{ color: 'var(--accent)', fontFamily: 'var(--font-ar)' }}
      >
        رؤى
      </span>
    </div>
  )
}
