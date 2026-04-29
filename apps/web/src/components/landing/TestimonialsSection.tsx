'use client'

import { motion } from 'framer-motion'
import { Star, Quote } from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

interface Testimonial {
  id: string
  nameAr: string
  nameEn: string
  roleAr: string
  role: string
  quote: string
  feature: string
  featureColor: string
  initials: string
  rating: number
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: 'sarah',
    nameAr: 'سارة خ.',
    nameEn: 'Sarah K.',
    role: 'Portfolio Manager',
    roleAr: 'مديرة محفظة',
    quote: 'المحلل متعدد اللغات غيّر طريقة عملي بالكامل. أستطيع الآن متابعة أخبار الأسواق الآسيوية والأوروبية بوقت حقيقي دون الحاجة لفريق مترجمين.',
    feature: 'محلل متعدد اللغات',
    featureColor: '#3B82F6',
    initials: 'س',
    rating: 5,
  },
  {
    id: 'omar',
    nameAr: 'عمر أ.',
    nameEn: 'Omar A.',
    role: 'Day Trader',
    roleAr: 'متداول يومي',
    quote: 'إشارات رؤى دقيقة بشكل مذهل. نسبة نجاح 87% ليست مجرد رقم تسويقي — عايشتها بنفسي خلال ثلاثة أشهر من التداول اليومي.',
    feature: 'إشارات رؤى',
    featureColor: '#F97316',
    initials: 'ع',
    rating: 5,
  },
  {
    id: 'yuki',
    nameAr: 'يوكي ت.',
    nameEn: 'Yuki T.',
    role: 'Quant Analyst',
    roleAr: 'محلل كمي',
    quote: 'رادار الأخبار يلتقط الأحداث قبل أن تؤثر على السوق بـ 15 دقيقة. هذا الأسبق الزمني يصنع الفارق بين الربح والخسارة.',
    feature: 'رادار الأخبار',
    featureColor: '#8B5CF6',
    initials: 'ي',
    rating: 5,
  },
]

function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <motion.div
      className="relative rounded-xl p-6"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.12 }}
    >
      {/* Quote icon */}
      <Quote
        className="absolute top-4 end-4 w-8 h-8 pointer-events-none"
        style={{ color: testimonial.featureColor, opacity: 0.08 }}
      />

      {/* Stars */}
      <div className="flex items-center gap-0.5 mb-4">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star
            key={i}
            className="w-3.5 h-3.5 fill-current"
            style={{ color: '#EAB308' }}
          />
        ))}
      </div>

      {/* Quote text */}
      <p
        className="text-sm leading-relaxed mb-5"
        style={{ color: '#CBD5E1', fontFamily: 'var(--font-ar)' }}
      >
        {testimonial.quote}
      </p>

      {/* Feature badge */}
      <div className="mb-4">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-medium"
          style={{
            background: `${testimonial.featureColor}10`,
            color: testimonial.featureColor,
            border: `1px solid ${testimonial.featureColor}20`,
          }}
        >
          {testimonial.feature}
        </span>
      </div>

      {/* User info */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
          style={{
            background: `${testimonial.featureColor}15`,
            color: testimonial.featureColor,
            fontFamily: 'var(--font-ar)',
          }}
        >
          {testimonial.initials}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: '#E2E8F0', fontFamily: 'var(--font-ar)' }}>
              {testimonial.nameAr}
            </span>
            <span className="text-[10px]" style={{ color: '#475569', fontFamily: 'var(--font-en)' }}>
              {testimonial.nameEn}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}>
              {testimonial.roleAr}
            </span>
            <span className="text-[9px]" style={{ color: '#334155' }}>·</span>
            <span className="text-[10px]" style={{ color: '#475569', fontFamily: 'var(--font-en)' }}>
              {testimonial.role}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function TestimonialsSection() {
  return (
    <section className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
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
          className="text-center mb-14"
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-5"
            style={{
              background: 'rgba(234,179,8,0.06)',
              border: '1px solid rgba(234,179,8,0.12)',
              color: '#FACC15',
              fontFamily: 'var(--font-en)',
            }}
          >
            TESTIMONIALS
          </div>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'var(--font-ar)' }}
          >
            ماذا يقول{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #EAB308, #F97316)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              المتداولون
            </span>
          </h2>
          <p
            className="text-base max-w-md mx-auto"
            style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}
          >
            تجارب حقيقية من متداولين يثقون في منصة رؤى
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((testimonial, i) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
