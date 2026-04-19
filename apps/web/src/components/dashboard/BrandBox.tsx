'use client'

import { motion } from 'framer-motion'

export default function BrandBox() {
  return (
    <div
      style={{ gridArea: 'brand', borderColor: 'var(--border-subtle)' }}
      className="relative flex flex-col items-center justify-center border-b border-l"
    >
      {/* Glowing background effect */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          opacity: [0.4, 0.8, 0.4],
          scale: [0.95, 1.05, 0.95],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div
          className="w-12 h-12 rounded-full"
          style={{
            background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
      </motion.div>

      {/* Icon */}
      <motion.div
        className="relative z-10 flex items-center justify-center w-10 h-10 rounded-lg mb-1"
        style={{
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          boxShadow: 'var(--glow-accent)',
        }}
        animate={{
          boxShadow: [
            '0 0 12px #0596694d',
            '0 0 20px #0596696d',
            '0 0 12px #0596694d',
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <span
          className="text-xl font-bold"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-ar)' }}
        >
          ر
        </span>
      </motion.div>

      {/* Brand name */}
      <span
        className="text-xs font-semibold tracking-wider relative z-10"
        style={{
          fontFamily: 'var(--font-brand)',
          color: 'var(--accent)',
          letterSpacing: '0.15em',
        }}
      >
        ROUA
      </span>
    </div>
  )
}
