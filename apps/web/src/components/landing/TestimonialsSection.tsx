'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

interface Testimonial {
  id: string
  nameAr: string
  nameEn: string
  role: string
  roleAr: string
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
    featureColor: '#FFD700',
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
    featureColor: '#A855F7',
    initials: 'ي',
    rating: 5,
  },
]

function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <motion.div
      className="relative p-6 rounded-2xl"
      style={{
        background: 'rgba(26, 35, 50, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
    >
      {/* Quote mark */}
      <div
        className="absolute top-4 start-4 text-5xl leading-none pointer-events-none"
        style={{ color: testimonial.featureColor, opacity: 0.15, fontFamily: 'serif' }}
      >
        &ldquo;
      </div>

      {/* Stars */}
      <div className="flex items-center gap-1 mb-4">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star
            key={i}
            className="w-4 h-4 fill-current"
            style={{ color: '#FFD700' }}
          />
        ))}
      </div>

      {/* Quote text */}
      <p
        className="text-sm leading-relaxed mb-6"
        style={{ color: '#CBD5E1', fontFamily: 'var(--font-ar)' }}
      >
        {testimonial.quote}
      </p>

      {/* Feature badge */}
      <div className="mb-4">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium"
          style={{
            background: `${testimonial.featureColor}15`,
            color: testimonial.featureColor,
            border: `1px solid ${testimonial.featureColor}30`,
          }}
        >
          {testimonial.feature}
        </span>
      </div>

      {/* User info */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            background: `${testimonial.featureColor}20`,
            color: testimonial.featureColor,
            border: `1px solid ${testimonial.featureColor}30`,
            fontFamily: 'var(--font-ar)',
          }}
        >
          {testimonial.initials}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#E5E7EB', fontFamily: 'var(--font-ar)' }}>
              {testimonial.nameAr}
            </span>
            <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'var(--font-en)' }}>
              {testimonial.nameEn}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}>
              {testimonial.roleAr}
            </span>
            <span className="text-[10px]" style={{ color: '#475569' }}>·</span>
            <span className="text-[10px]" style={{ color: '#64748B', fontFamily: 'var(--font-en)' }}>
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
    <section className="relative py-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: '#E5E7EB', fontFamily: 'var(--font-ar)' }}
          >
            ماذا يقول{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #FFD700, #F59E0B)',
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
            style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
          >
            تجارب حقيقية من متداولين يثقون في منصة رؤى
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial, i) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
