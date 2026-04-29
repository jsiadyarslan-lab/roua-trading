'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

/* ── Floating Particles ── */
function FloatingParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()

    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: 1 + Math.random() * 2,
      color: ['#3B82F6', '#FFD700', '#10B981'][Math.floor(Math.random() * 3)],
      opacity: 0.2 + Math.random() * 0.4,
    }))

    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > canvas.offsetWidth) p.vx *= -1
        if (p.y < 0 || p.y > canvas.offsetHeight) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.fill()

        // Glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity * 0.15
        ctx.fill()
      }
      ctx.globalAlpha = 1

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    const handleResize = () => resize()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}

export default function CTASection() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <section className="relative py-28 px-4 overflow-hidden">
      {/* Gradient glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.12) 0%, rgba(16,185,129,0.06) 30%, transparent 60%)',
        }}
      />

      {/* Floating particles */}
      <FloatingParticles />

      {/* Content */}
      <motion.div
        className="relative z-10 max-w-3xl mx-auto text-center"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
      >
        {/* Heading */}
        <h2
          className="text-3xl md:text-5xl font-bold mb-6"
          style={{ color: '#E5E7EB', fontFamily: 'var(--font-ar)' }}
        >
          هل أنت مستعد للتداول{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #3B82F6, #10B981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            بذكاء؟
          </span>
        </h2>

        {/* Subheading */}
        <p
          className="text-lg md:text-xl mb-10 max-w-lg mx-auto"
          style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
        >
          انضم لآلاف المتداولين الذين يثقون في رؤى
        </p>

        {/* CTA Button */}
        <Link href="/dashboard">
          <Button
            size="lg"
            className="group relative px-10 py-7 text-lg font-bold rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #3B82F6 0%, #10B981 100%)',
              color: '#fff',
              border: 'none',
              boxShadow: '0 0 40px rgba(59, 130, 246, 0.3), 0 0 80px rgba(16, 185, 129, 0.15)',
            }}
          >
            <span className="relative z-10 flex items-center gap-3">
              <Sparkles className="w-5 h-5" />
              أطلق رؤى الآن
              <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
            </span>
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: 'linear-gradient(135deg, #2563EB 0%, #059669 100%)',
              }}
            />
          </Button>
        </Link>

        {/* Subtle trust indicator */}
        <p
          className="mt-6 text-xs"
          style={{ color: '#475569', fontFamily: 'var(--font-ar)' }}
        >
          لا حاجة لبطاقة ائتمانية · إعداد في أقل من دقيقة
        </p>
      </motion.div>
    </section>
  )
}
