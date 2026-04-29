'use client'

import { motion } from 'framer-motion'
import { Sparkles, Zap, ChartBar, ShieldCheck, Cpu, Globe } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface AIModel {
  name: string
  icon: LucideIcon
  color: string
  bgColor: string
  borderColor: string
  description: string
  tag: string
}

const models: AIModel[] = [
  {
    name: 'Groq',
    icon: Sparkles,
    color: '#F97316',
    bgColor: 'rgba(249,115,22,0.06)',
    borderColor: 'rgba(249,115,22,0.12)',
    description: 'معالجة فائقة السرعة للاستدلال اللحظي وتحليل السوق في الوقت الفعلي',
    tag: 'Ultra-Fast',
  },
  {
    name: 'GLM-4',
    icon: Zap,
    color: '#14B8A6',
    bgColor: 'rgba(20,184,166,0.06)',
    borderColor: 'rgba(20,184,166,0.12)',
    description: 'نموذج لغوي متعدد اللغات لفهم السياق المالي العربي والعالمي',
    tag: 'Multilingual',
  },
  {
    name: 'Gemini 2.5',
    icon: ChartBar,
    color: '#3B82F6',
    bgColor: 'rgba(59,130,246,0.06)',
    borderColor: 'rgba(59,130,246,0.12)',
    description: 'تحليل متقدم للرسوم البيانية والأنماط التقنية بدقة عالية',
    tag: 'Deep Analysis',
  },
  {
    name: 'Bedrock',
    icon: ShieldCheck,
    color: '#8B5CF6',
    bgColor: 'rgba(139,92,246,0.06)',
    borderColor: 'rgba(139,92,246,0.12)',
    description: 'بنية تحتية آمنة وموثوقة للنماذج الأساسية مع حماية البيانات',
    tag: 'Enterprise',
  },
  {
    name: 'Ollama',
    icon: Cpu,
    color: '#10B981',
    bgColor: 'rgba(16,185,129,0.06)',
    borderColor: 'rgba(16,185,129,0.12)',
    description: 'نماذج محلية خاصة للتحليلات الحساسة بعيداً عن السحابة',
    tag: 'Private',
  },
  {
    name: 'Twelve Data',
    icon: Globe,
    color: '#EAB308',
    bgColor: 'rgba(234,179,8,0.06)',
    borderColor: 'rgba(234,179,8,0.12)',
    description: 'بيانات سوق شاملة ومباشرة من الأسواق العالمية ومؤشراتها',
    tag: 'Real-Time Data',
  },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
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

export default function AIModelsSection() {
  return (
    <section id="ai-models" className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
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
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.12)',
              color: '#60A5FA',
              fontFamily: 'var(--font-en)',
            }}
          >
            AI ORCHESTRATOR
          </div>
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'var(--font-ar)' }}
          >
            ستة نماذج ذكاء اصطناعي تعمل{'\u00A0'}
            <span
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #10B981)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              بتناغم
            </span>
          </h2>
          <p
            className="text-base max-w-xl mx-auto"
            style={{ color: '#64748B', fontFamily: 'var(--font-ar)' }}
          >
            كل نموذج متخصص في جانب معين من التحليل، ويعملون معاً لتقديم رؤية شاملة للسوق
          </p>
        </motion.div>

        {/* Models Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {models.map((model) => {
            const Icon = model.icon
            return (
              <motion.div
                key={model.name}
                variants={cardVariants}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group relative rounded-xl p-5 transition-all duration-300 cursor-default"
                style={{
                  background: model.bgColor,
                  border: `1px solid ${model.borderColor}`,
                }}
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${model.color}10, transparent 70%)`,
                  }}
                />

                <div className="relative z-10">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${model.color}15` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: model.color }} />
                      </div>
                      <span
                        className="text-sm font-bold"
                        style={{ color: '#E2E8F0', fontFamily: 'var(--font-en)' }}
                      >
                        {model.name}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                      style={{
                        background: `${model.color}10`,
                        color: model.color,
                        border: `1px solid ${model.color}20`,
                        fontFamily: 'var(--font-en)',
                      }}
                    >
                      {model.tag}
                    </span>
                  </div>

                  {/* Description */}
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
                  >
                    {model.description}
                  </p>
                </div>

                {/* Bottom accent */}
                <div
                  className="absolute bottom-0 left-4 right-4 h-px rounded-full"
                  style={{ background: `linear-gradient(90deg, transparent, ${model.color}30, transparent)` }}
                />
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
