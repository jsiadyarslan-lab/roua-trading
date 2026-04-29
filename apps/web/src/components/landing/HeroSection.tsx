'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

const TYPEWRITER_PHRASES = [
  'AI-Powered Trading Intelligence',
  'Polyglot Market Analyst',
  'Your Portfolio Sanctuary',
  'Neural Signal Detection',
]

const STATS = [
  { value: '87%', label: 'دقة الإشارات', sublabel: 'Signal Accuracy' },
  { value: '12+', label: 'لغة مدعومة', sublabel: 'Languages' },
  { value: '5000+', label: 'مصدر إخباري', sublabel: 'News Sources' },
]

export default function HeroSection() {
  const [currentPhrase, setCurrentPhrase] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()

  // Typewriter effect
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
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 py-20 overflow-hidden">
      {/* Decorative glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, rgba(16,185,129,0.04) 40%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Arabic Logo */}
        <motion.h1
          className="text-8xl md:text-9xl font-bold mb-2"
          style={{
            fontFamily: 'var(--font-ar)',
            background: 'linear-gradient(135deg, #3B82F6 0%, #10B981 50%, #FFD700 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          initial={prefersReducedMotion ? {} : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        >
          رؤى
        </motion.h1>

        {/* English Brand */}
        <motion.h2
          className="text-2xl md:text-3xl font-semibold tracking-[0.35em] mb-8"
          style={{
            fontFamily: 'var(--font-brand)',
            color: '#94A3B8',
          }}
          initial={prefersReducedMotion ? {} : { opacity: 0, letterSpacing: '0.1em' }}
          animate={{ opacity: 1, letterSpacing: '0.35em' }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          ROUA
        </motion.h2>

        {/* Typewriter */}
        <div className="h-10 md:h-12 flex items-center justify-center mb-10">
          <span
            className="text-lg md:text-2xl font-medium"
            style={{
              fontFamily: 'var(--font-en)',
              color: '#E5E7EB',
            }}
          >
            {displayText}
          </span>
          <motion.span
            className="inline-block w-0.5 h-6 md:h-8 ms-1"
            style={{ background: '#3B82F6' }}
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
          />
        </div>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <Link href="/dashboard">
            <Button
              size="lg"
              className="group relative px-8 py-6 text-base font-bold rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #10B981 100%)',
                color: '#fff',
                border: 'none',
              }}
            >
              <span className="relative z-10 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                ابدأ التداول
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              </span>
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(135deg, #2563EB 0%, #059669 100%)',
                }}
              />
            </Button>
          </Link>

          <a href="#features">
            <Button
              variant="outline"
              size="lg"
              className="px-8 py-6 text-base font-medium rounded-xl"
              style={{
                borderColor: 'rgba(59, 130, 246, 0.3)',
                color: '#94A3B8',
              }}
            >
              استكشف الميزات
            </Button>
          </a>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-8 sm:gap-16"
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          {STATS.map((stat, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span
                className="text-3xl md:text-4xl font-bold"
                style={{
                  fontFamily: 'var(--font-brand)',
                  background: i === 0
                    ? 'linear-gradient(135deg, #3B82F6, #10B981)'
                    : i === 1
                      ? 'linear-gradient(135deg, #FFD700, #F59E0B)'
                      : 'linear-gradient(135deg, #10B981, #06B6D4)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {stat.value}
              </span>
              <span className="text-sm font-medium" style={{ color: '#E5E7EB', fontFamily: 'var(--font-ar)' }}>
                {stat.label}
              </span>
              <span className="text-[10px] tracking-wider" style={{ color: '#64748B', fontFamily: 'var(--font-en)' }}>
                {stat.sublabel}
              </span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
