'use client'

import { motion } from 'framer-motion'

interface IOSSwitchProps {
  isOn: boolean
  onToggle: () => void
  disabled?: boolean
  activeColor?: string
  size?: 'sm' | 'md' | 'lg'
  ariaLabel?: string
}

/**
 * Shared iOS-style toggle switch for mobile pages.
 * Fixes RTL positioning bugs in the original implementations.
 *
 * BEFORE: Bot and Agent pages each defined their own switch with x: isOn ? 28 : 0
 * which doesn't account for RTL direction properly.
 * AFTER: Uses insetInlineStart (logical property) for RTL-safe positioning.
 */
export default function IOSSwitch({
  isOn,
  onToggle,
  disabled = false,
  activeColor = '#00D4FF',
  size = 'md',
  ariaLabel = 'Toggle',
}: IOSSwitchProps) {
  const dimensions = {
    sm: { track: { w: 40, h: 22 }, thumb: 18, travel: 18 },
    md: { track: { w: 50, h: 28 }, thumb: 24, travel: 22 },
    lg: { track: { w: 56, h: 30 }, thumb: 26, travel: 26 },
  }[size]

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      disabled={disabled}
      className="ios-switch-button"
      style={{
        width: dimensions.track.w,
        height: dimensions.track.h,
        borderRadius: dimensions.track.h / 2,
        background: isOn ? activeColor : 'rgba(255,255,255,0.1)',
        position: 'relative',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.25s ease',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <motion.div
        animate={{
          insetInlineStart: isOn ? dimensions.travel : 2,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          position: 'absolute',
          top: (dimensions.track.h - dimensions.thumb) / 2,
          width: dimensions.thumb,
          height: dimensions.thumb,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}
