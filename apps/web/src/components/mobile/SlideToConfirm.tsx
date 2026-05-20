'use client'

import { useRef, useState, useCallback } from 'react'

export default function SlideToConfirm({ onConfirm, label = 'اسحب للتأكيد', color = '#00D4FF' }: { onConfirm: () => void; label?: string; color?: string }) {
  const [offset, setOffset] = useState(0)
  const startX = useRef(0)
  const handleStart = useCallback((x: number) => { startX.current = x }, [])
  const handleMove = useCallback((x: number) => { setOffset(Math.max(0, Math.min(startX.current - x, 200))) }, [])
  const handleEnd = useCallback(() => { if (offset > 150) onConfirm(); setOffset(0) }, [offset, onConfirm])
  return (
    <div style={{ position: 'relative', height: 52, borderRadius: 26, background: `${color}10`, border: `1px solid ${color}25`, overflow: 'hidden', touchAction: 'none', direction: 'rtl' }}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)} onTouchMove={(e) => handleMove(e.touches[0].clientX)} onTouchEnd={handleEnd}
      onMouseDown={(e) => handleStart(e.clientX)} onMouseMove={(e) => { if (e.buttons) handleMove(e.clientX) }} onMouseUp={handleEnd}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: `${color}80`, fontFamily: "'Cairo', sans-serif" }}>{label}</div>
      <div style={{ width: 48, height: 48, borderRadius: 24, background: color, position: 'absolute', top: 1, insetInlineStart: 2 + offset, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${color}40`, transition: offset === 0 ? 'inset-inline-start 0.2s' : 'none' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="15 18 9 12 15 6" /></svg>
      </div>
    </div>
  )
}
