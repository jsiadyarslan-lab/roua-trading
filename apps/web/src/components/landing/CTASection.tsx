'use client'

import { Link } from '@/i18n/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

export default function CTASection() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const t = useTranslations('landing.cta')

  return (
    <section className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Section divider */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 max-w-xl"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.08), transparent)' }}
      />

      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.03) 30%, transparent 60%)',
        }}
      />

      <motion.div
        className="relative z-10 max-w-2xl mx-auto text-center"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6 }}
      >
        <h2
          className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
          style={{ color: '#9CA3B5', fontFamily: 'var(--font-ar)' }}
        >
          {t('titlePart1')}{'\u00A0'}
          <span
            style={{
              background: 'linear-gradient(135deg, #10B981, #3B82F6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {t('titleHighlight')}
          </span>
        </h2>

        <p
          className="text-base mb-8 max-w-md mx-auto"
          style={{ color: '#9CA3B5', fontFamily: 'var(--font-ar)' }}
        >
          {t('joinCaption')}
        </p>

        <Link href="/login">
          <Button
            size="lg"
            className="group relative px-10 py-6 text-base font-bold rounded-xl overflow-hidden transition-all duration-300 hover:shadow-[0_0_40px_rgba(16,185,129,0.2)]"
            style={{
              background: 'linear-gradient(135deg, #059669, #10B981)',
              color: '#fff',
              border: 'none',
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {t('launchNow')}
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            </span>
          </Button>
        </Link>

        <p
          className="mt-5 text-xs"
          style={{ color: '#6B7280', fontFamily: 'var(--font-ar)' }}
        >
          {t('noCreditCard')}
        </p>
      </motion.div>
    </section>
  )
}
