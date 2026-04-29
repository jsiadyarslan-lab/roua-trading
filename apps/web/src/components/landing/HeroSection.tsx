'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles, TrendingUp, BarChart3, Globe2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

const TYPEWRITER_PHRASES = [
  'AI-Powered Trading Intelligence',
  'Polyglot Market Analyst',
  'Your Portfolio Sanctuary',
  'Neural Signal Detection',
]

const STATS = [
  { value: '87%', label: 'دقة الإشارات', sublabel: 'Signal Accuracy', icon: TrendingUp },
  { value: '12+', label: 'لغة مدعومة', sublabel: 'Languages', icon: Globe2 },
  { value: '5000+', label: 'مصدر إخباري', sublabel: 'News Sources', icon: BarChart3 },
]

export default function HeroSection() {
  const [currentPhrase, setCurrentPhrase] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()

  const typewriterStep = useCallback(() => {
    const phrase = TYPEWRITER_PHRASES[currentPhrase]
    if (!isDeleting) {
      if (displayText.length < phrase.length) {
        setDisplayText(phrase.slice(0, displayText.length + 1))
        return 60 + Math.random() * 40
      } else {
        setIsDeleting(true)
        return 2000
      }
    } else {
      if (displayText.length > 0) {
        setDisplayText(displayText.slice(0, -1))
        return 30
      } else {
        setIsDeleting(false)
        setCurrentPhrase((prev) => (prev + 1) % TYPEWRITER_PHRASES.length)
        return 400
      }
    }
  }, [currentPhrase, displayText, isDeleting])

  useEffect(() => {
    const timeout = setTimeout(typewriterStep, typewriterStep())
    return () => clearTimeout(timeout)
  }, [typewriterStep])

  return (
    <section className="relative min-h-[92vh] flex flex-col items-center justify-center px-4 sm:px-6 pt-20 pb-16">
      {/* Top decorative line */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 max-w-2xl"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.3), rgba(59,130,246,0.3), transparent)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Badge */}
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8"
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-wide"
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.15)',
              color: '#34D399',
              fontFamily: 'var(--font-en)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#10B981' }} />
            NEURAL TRADING INTELLIGENCE
          </div>
        </motion.div>

        {/* Arabic Logo */}
        <motion.h1
          className="text-7xl sm:text-8xl md:text-9xl font-bold mb-3 leading-none"
          style={{
            fontFamily: 'var(--font-ar)',
            background: 'linear-gradient(135deg, #10B981 0%, #3B82F6 50%, #8B5CF6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          initial={prefersReducedMotion ? {} : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        >
          رؤى
        </motion.h1>

        {/* English Brand */}
        <motion.p
          className="text-lg sm:text-xl tracking-[0.4em] mb-6"
          style={{
            fontFamily: 'var(--font-brand)',
            color: 'rgba(148,163,184,0.6)',
          }}
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          ROUA
        </motion.p>

        {/* Tagline */}
        <motion.p
          className="text-base sm:text-lg mb-8 max-w-lg"
          style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          منصة التداول المدعومة بالذكاء الاصطناعي الأكثر تقدمًا في المنطقة
        </motion.p>

        {/* Typewriter */}
        <div className="h-10 md:h-12 flex items-center justify-center mb-10">
          <span
            className="text-base sm:text-lg md:text-xl font-medium"
            style={{
              fontFamily: 'var(--font-en)',
              color: '#CBD5E1',
            }}
          >
            {displayText}
          </span>
          <motion.span
            className="inline-block w-0.5 h-5 md:h-7 ms-1 rounded-full"
            style={{ background: '#10B981' }}
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
          />
        </div>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <Link href="/dashboard">
            <Button
              size="lg"
              className="group relative px-8 py-6 text-base font-bold rounded-xl overflow-hidden transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.25)]"
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                color: '#fff',
                border: 'none',
              }}
            >
              <span className="relative z-10 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                ابدأ التداول
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              </span>
            </Button>
          </Link>

          <a href="#features">
            <Button
              variant="outline"
              size="lg"
              className="px-8 py-6 text-base font-medium rounded-xl transition-all duration-300 hover:bg-white/5"
              style={{
                borderColor: 'rgba(148, 163, 184, 0.15)',
                color: '#94A3B8',
              }}
            >
              استكشف الميزات
            </Button>
          </a>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-6 sm:gap-12"
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          {STATS.map((stat, i) => {
            const Icon = stat.icon
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{
                    background: i === 0
                      ? 'rgba(16,185,129,0.1)'
                      : i === 1
                        ? 'rgba(59,130,246,0.1)'
                        : 'rgba(139,92,246,0.1)',
                  }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{
                      color: i === 0 ? '#10B981' : i === 1 ? '#3B82F6' : '#8B5CF6',
                    }}
                  />
                </div>
                <div className="text-start">
                  <span
                    className="text-xl font-bold block leading-tight"
                    style={{
                      fontFamily: 'var(--font-brand)',
                      color: '#E2E8F0',
                    }}
                  >
                    {stat.value}
                  </span>
                  <span className="text-[11px] block" style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}>
                    {stat.label}
                  </span>
                </div>
              </div>
            )
          })}
        </motion.div>
      </motion.div>
    </section>
  )
}
