'use client'

import { motion, type Variants } from 'framer-motion'
import { UserPlus, Brain, TrendingUp, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Step {
  icon: LucideIcon
  titleKey: string
  subtitleKey: string
  descKey: string
  color: string
  step: number
}

const steps: Step[] = [
  {
    icon: UserPlus,
    titleKey: 'step1Title',
    subtitleKey: 'step1Subtitle',
    descKey: 'step1Desc',
    color: '#10B981',
    step: 1,
  },
  {
    icon: Brain,
    titleKey: 'step3Title',
    subtitleKey: 'step2Subtitle',
    descKey: 'step2Desc',
    color: '#3B82F6',
    step: 2,
  },
  {
    icon: TrendingUp,
    titleKey: 'step2Title',
    subtitleKey: 'step3Subtitle',
    descKey: 'step3Desc',
    color: '#8B5CF6',
    step: 3,
  },
  {
    icon: ShieldCheck,
    titleKey: 'step4Title',
    subtitleKey: 'step4Subtitle',
    descKey: 'step4Desc',
    color: '#F59E0B',
    step: 4,
  },
]

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
}

export default function HowItWorksSection() {
  const t = useTranslations('landing.howItWorks')

  return (
    <section id="how-it-works" className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
      {/* Section divider */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 max-w-xl"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.08), transparent)' }}
      />

      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-5"
            style={{
              background: 'rgba(139,92,246,0.06)',
              border: '1px solid rgba(139,92,246,0.12)',
              color: '#A78BFA',
              fontFamily: 'var(--font-en)',
            }}
          >
            {t('sectionLabel')}
          </div>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'var(--font-ar)' }}
          >
            {t('titlePart1')}{'\u00A0'}
            <span
              style={{
                background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {t('titleHighlight')}
            </span>
          </h2>
          <p
            className="text-base max-w-lg mx-auto"
            style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}
          >
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.step}
                variants={cardVariants}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="relative group"
              >
                {/* Connector line (hidden on mobile) */}
                {step.step < 4 && (
                  <div
                    className="hidden lg:block absolute top-10 -left-3 w-6 h-px"
                    style={{ background: 'rgba(148,163,184,0.08)' }}
                  />
                )}

                <div
                  className="relative rounded-xl p-6 h-full transition-all duration-300"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Step number */}
                  <div
                    className="absolute -top-3 -end-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: `${step.color}15`,
                      color: step.color,
                      border: `1px solid ${step.color}25`,
                      fontFamily: 'var(--font-brand)',
                    }}
                  >
                    {step.step}
                  </div>

                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background: `${step.color}10`,
                      border: `1px solid ${step.color}15`,
                    }}
                  >
                    <Icon className="w-6 h-6" style={{ color: step.color }} />
                  </div>

                  {/* Titles */}
                  <h3
                    className="text-base font-bold text-white mb-1"
                    style={{ fontFamily: 'var(--font-ar)' }}
                  >
                    {t(step.titleKey)}
                  </h3>
                  <p
                    className="text-[10px] font-medium tracking-wider mb-3"
                    style={{ color: '#475569', fontFamily: 'var(--font-en)' }}
                  >
                    {t(step.subtitleKey)}
                  </p>

                  {/* Description */}
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
                  >
                    {t(step.descKey)}
                  </p>

                  {/* Bottom accent */}
                  <div
                    className="absolute bottom-0 left-4 right-4 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${step.color}20, transparent)` }}
                  />
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
