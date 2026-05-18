'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SlideToConfirmProps {
  onConfirm: () => void
  label?: string
  color?: string
}

/**
 * SlideToConfirm — RTL-safe slide-to-confirm component.
 *
 * FIX: In RTL, the knob starts at the inline-end (right in RTL) and slides
 * toward inline-start (left in RTL), which is the natural "confirm" direction.
 * In LTR, the knob starts at the left and slides right.
 *
 * BEFORE: Always dragged left-to-right regardless of text direction,
 * making the gesture feel backwards in Arabic/RTL layouts.
 * AFTER: Detects document direction and reverses drag axis accordingly.
 */
export default function SlideToConfirm({ onConfirm, label = 'اسحب للتأكيد', color = '#32D74B' }: SlideToConfirmProps) {
  const [isConfirmed, setIsConfirmed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const controls = useAnimation()

  // Detect RTL direction
  const [isRTL, setIsRTL] = useState(false)
  useEffect(() => {
    setIsRTL(document.documentElement.dir === 'rtl' || document.dir === 'rtl')
  }, [])

  // Calculate width dynamically
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth)
    }
  }, [])

  const handleWidth = width > 0 ? width - 60 : 200 // knob width is ~50

  // In RTL: drag from right to left (negative x)
  // In LTR: drag from left to right (positive x)
  const dragConstraints = isRTL
    ? { left: -handleWidth, right: 0 }
    : { left: 0, right: handleWidth }

  // Opacity of the background label as we slide
  const labelOpacity = useTransform(
    x,
    isRTL ? [-handleWidth * 0.5, 0] : [0, handleWidth * 0.5],
    [0, 1]
  )
  const bgSaturation = useTransform(
    x,
    isRTL ? [-handleWidth, 0] : [0, handleWidth],
    ['100%', '0%']
  )

  const handleDragEnd = async () => {
    const currentX = x.get()
    const threshold = isRTL ? -handleWidth * 0.9 : handleWidth * 0.9
    const isConfirmed_drag = isRTL ? currentX < threshold : currentX > threshold

    if (isConfirmed_drag) {
      // Confirmed!
      setIsConfirmed(true)
      await controls.start({
        x: isRTL ? -handleWidth : handleWidth,
        transition: { type: 'spring', stiffness: 500, damping: 30 }
      })
      onConfirm()
    } else {
      // Snap back
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } })
    }
  }

  // Knob initial position: in RTL, starts at the right end
  const knobInitialX = isRTL ? handleWidth : 0

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: 56,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        userSelect: 'none',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      {/* Dynamic Background Color */}
      <motion.div
        style={{
          position: 'absolute', inset: 0,
          background: color,
          opacity: 0.1,
          filter: `grayscale(${bgSaturation})`
        }}
      />

      {/* Label Text */}
      <motion.div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 800, color: '#FFFFFF',
          fontFamily: "'Cairo', sans-serif",
          opacity: labelOpacity,
          pointerEvents: 'none',
          direction: 'rtl',
        }}
      >
        {label}
      </motion.div>

      {/* Slidable Knob */}
      <motion.div
        drag="x"
        dragConstraints={dragConstraints}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        initial={{ x: knobInitialX }}
        style={{
          x,
          width: 48, height: 48,
          borderRadius: 15,
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'grab',
          zIndex: 10,
          // Position at inline-end in RTL
          ...(isRTL ? { position: 'absolute', insetInlineEnd: 4 } : {}),
        }}
      >
        {isRTL
          ? <ChevronRight size={24} color={color} />
          : <ChevronLeft size={24} color={color} style={{ transform: 'rotate(180deg)' }} />
        }
      </motion.div>

      {/* Success Pulse & Wave */}
      {isConfirmed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            position: 'absolute', inset: 0,
            background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 900, color: '#000',
            fontFamily: "'Cairo', sans-serif",
            zIndex: 20,
            direction: 'rtl',
          }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              position: 'absolute', width: 100, height: 100,
              borderRadius: '50%', background: '#FFF', zIndex: -1
            }}
          />
          تم التأكيد ✓
        </motion.div>
      )}
    </div>
  )
}
