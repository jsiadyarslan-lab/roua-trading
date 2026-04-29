'use client'

import { motion } from 'framer-motion'
import { Languages, Zap, Radar, Shield, FlaskConical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Feature {
  icon: LucideIcon
  arabicTitle: string
  englishSubtitle: string
  description: string
  color: string
  span?: string
}

const features: Feature[] = [
  {
    icon: Languages,
    arabicTitle: 'المحلل متعدد اللغات',
    englishSubtitle: 'Polyglot Analyst',
    description:
      'يحلل الأسواق بلغات متعددة في الوقت الفعلي، مما يمنحك رؤى عالمية دون حواجز لغوية. يدعم العربية والإنجليزية والصينية واليابانية وغيرها من اللغات الرئيسية.',
    color: '#14B8A6',
    span: 'sm:col-span-2',
  },
  {
    icon: Zap,
    arabicTitle: 'إشارات رؤى',
    englishSubtitle: 'Roua Signals',
    description:
      'إشارات تداول فورية مدعومة بالذكاء الاصطناعي، تعتمد على تحليل الأنماط والمشاعر السوقية لتقديم توصيات دقيقة بنسبة نجاح تتجاوز 87%.',
    color: '#F97316',
  },
  {
    icon: Radar,
    arabicTitle: 'رادار الأخبار الموحد',
    englishSubtitle: 'Unified News Radar',
    description:
      'يراقب آلاف المصادر الإخبارية والاجتماعية في وقت واحد، ويصفي الإشارات الضوضائية ليقدم لك فقط ما يؤثر على محفظتك.',
    color: '#3B82F6',
  },
  {
    icon: Shield,
    arabicTitle: 'ملاذ المحفظة',
    englishSubtitle: 'Portfolio Sanctuary',
    description:
      'حماية ذكية لمحفظتك من التقلبات الحادة عبر تنبيهات المخاطر التنبؤية وتوصيات إعادة التوازن التلقائية.',
    color: '#8B5CF6',
  },
  {
    icon: FlaskConical,
    arabicTitle: 'المختبر الذكي',
    englishSubtitle: 'Smart Lab',
    description:
      'اختبر استراتيجياتك في بيئة محاكاة واقعية قبل المخاطرة. حلل الأداء التاريخي وحسّن معاملاتك بناءً على بيانات حقيقية.',
    color: '#10B981',
    span: 'sm:col-span-2',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

interface FeaturesSectionProps {
  id?: string
}

export default function FeaturesSection({ id }: FeaturesSectionProps) {
  return (
    <section id={id} className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
      {/* Subtle section divider */}
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
          className="text-center mb-14"
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-5"
            style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.12)',
              color: '#34D399',
              fontFamily: 'var(--font-en)',
            }}
          >
            CORE FEATURES
          </div>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'var(--font-ar)' }}
          >
            أدوات متقدمة للمتداول{'\u00A0'}
            <span
              style={{
                background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              الذكي
            </span>
          </h2>
          <p
            className="text-base max-w-xl mx-auto"
            style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}
          >
            مجموعة متكاملة من الأدوات المدعومة بالذكاء الاصطناعي لتحليل الأسواق واتخاذ قرارات أذكى
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`group relative rounded-xl p-6 transition-all duration-300 cursor-default ${feature.span || ''}`}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Hover border glow */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    border: `1px solid ${feature.color}25`,
                    background: `radial-gradient(circle at 50% 0%, ${feature.color}08, transparent 70%)`,
                  }}
                />

                <div className="relative z-10">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: `${feature.color}10` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: feature.color }} />
                  </div>

                  {/* Titles */}
                  <h3
                    className="text-lg font-bold text-white mb-1"
                    style={{ fontFamily: 'var(--font-ar)' }}
                  >
                    {feature.arabicTitle}
                  </h3>
                  <p
                    className="text-xs font-medium tracking-wide mb-3"
                    style={{ color: '#475569', fontFamily: 'var(--font-en)' }}
                  >
                    {feature.englishSubtitle}
                  </p>

                  {/* Description */}
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
                  >
                    {feature.description}
                  </p>
                </div>

                {/* Bottom accent */}
                <div
                  className="absolute bottom-0 left-6 right-6 h-px rounded-full"
                  style={{ background: `linear-gradient(90deg, transparent, ${feature.color}20, transparent)` }}
                />
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
