'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'

interface SlideToConfirmProps {
  onConfirm: () => void
  label?: string
  color?: string
}

export default function SlideToConfirm({ onConfirm, label = 'اسحب للتأكيد', color = '#32D74B' }: SlideToConfirmProps) {
  const [isConfirmed, setIsConfirmed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const controls = useAnimation()

  // Calculate width dynamically
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth)
    }
  }, [])

  const handleWidth = width > 0 ? width - 60 : 200 // knob width is ~50
  
  // Opacity of the background label as we slide
  const labelOpacity = useTransform(x, [0, handleWidth * 0.5], [1, 0])
  const bgSaturation = useTransform(x, [0, handleWidth], ['0%', '100%'])

  const handleDragEnd = async () => {
    const currentX = x.get()
    if (currentX > handleWidth * 0.9) {
      // Confirmed!
      setIsConfirmed(true)
      await controls.start({ x: handleWidth, transition: { type: 'spring', stiffness: 500, damping: 30 } })
      onConfirm()
    } else {
      // Snap back
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } })
    }
  }

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
        userSelect: 'none'
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
          pointerEvents: 'none'
        }}
      >
        {label}
      </motion.div>

      {/* Slidable Knob */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: handleWidth }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ 
          x,
          width: 48, height: 48, 
          borderRadius: 15, 
          background: '#FFFFFF', 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'grab',
          zIndex: 10
        }}
      >
        <ChevronLeft size={24} color={color} style={{ transform: 'rotate(180deg)' }} />
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
            zIndex: 20
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
