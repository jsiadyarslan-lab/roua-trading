'use client'

import { useEffect, useRef, useMemo } from 'react'

type MarketState = 'calm' | 'bullish' | 'bearish' | 'volatile' | 'strong'

const STATE_COLORS: Record<MarketState, { core: string; glow: string; ring: string }> = {
  calm:     { core: '#4d9eff', glow: 'rgba(77,158,255,0.35)', ring: 'rgba(77,158,255,0.15)' },
  bullish:  { core: '#00ff88', glow: 'rgba(0,255,136,0.35)', ring: 'rgba(0,255,136,0.15)' },
  bearish:  { core: '#ff3355', glow: 'rgba(255,51,85,0.35)', ring: 'rgba(255,51,85,0.15)' },
  volatile:{ core: '#ffaa00', glow: 'rgba(255,170,0,0.35)', ring: 'rgba(255,170,0,0.15)' },
  strong:   { core: '#a78bfa', glow: 'rgba(167,139,250,0.35)', ring: 'rgba(167,139,250,0.15)' },
}

const STATE_LABELS: Record<MarketState, { ar: string; en: string }> = {
  calm:     { ar: 'هادئ', en: 'Calm' },
  bullish:  { ar: 'صاعد', en: 'Bullish' },
  bearish:  { ar: 'هابط', en: 'Bearish' },
  volatile: { ar: 'متقلب', en: 'Volatile' },
  strong:   { ar: 'قوي', en: 'Strong' },
}

interface QuantumOrbProps {
  priceChange: number
  volume?: number
  volatility?: number
  size?: number
}

function getMarketState(priceChange: number, volatility?: number): MarketState {
  const absChange = Math.abs(priceChange)
  const vol = volatility ?? 0

  if (vol > 3) return 'volatile'
  if (absChange > 3) return 'strong'
  if (priceChange > 0.5) return 'bullish'
  if (priceChange < -0.5) return 'bearish'
  return 'calm'
}

export default function QuantumOrb({ priceChange, volatility, size = 140 }: QuantumOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const state = useMemo(() => getMarketState(priceChange, volatility), [priceChange, volatility])
  const colors = STATE_COLORS[state]
  const labels = STATE_LABELS[state]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    let frame = 0
    const draw = () => {
      frame++
      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2

      // Outer glow
      const glowRadius = 50 + Math.sin(frame * 0.02) * 4
      const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, glowRadius)
      glowGrad.addColorStop(0, colors.glow)
      glowGrad.addColorStop(0.6, colors.ring)
      glowGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2)
      ctx.fill()

      // Outer ring
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((frame * 0.5) * Math.PI / 180)
      ctx.strokeStyle = colors.ring
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, 0, 38, 0, Math.PI * 1.4)
      ctx.stroke()
      ctx.restore()

      // Inner ring (reverse)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-(frame * 0.8) * Math.PI / 180)
      ctx.strokeStyle = colors.ring
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, 30, 0.5, Math.PI * 1.1 + 0.5)
      ctx.stroke()
      ctx.restore()

      // Core orb
      const orbRadius = 18 + Math.sin(frame * 0.03) * 2
      const coreGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, orbRadius)
      coreGrad.addColorStop(0, '#ffffff')
      coreGrad.addColorStop(0.3, colors.core)
      coreGrad.addColorStop(1, colors.glow)
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(cx, cy, orbRadius, 0, Math.PI * 2)
      ctx.fill()

      // Tiny orbiting particles
      for (let i = 0; i < 3; i++) {
        const angle = (frame * (1 + i * 0.3) + i * 120) * Math.PI / 180
        const dist = 34 + Math.sin(frame * 0.04 + i) * 3
        const px = cx + Math.cos(angle) * dist
        const py = cy + Math.sin(angle) * dist
        ctx.fillStyle = colors.core
        ctx.globalAlpha = 0.6 + Math.sin(frame * 0.05 + i) * 0.3
        ctx.beginPath()
        ctx.arc(px, py, 1.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [colors, size])

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="pointer-events-none"
      />
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '11px',
          fontWeight: 700,
          color: colors.core,
          textShadow: `0 0 8px ${colors.glow}`,
          letterSpacing: '0.08em',
        }}
      >
        {labels.ar}
      </span>
    </div>
  )
}
