'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, Zap, Radar, Shield, FlaskConical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import T from '@/lib/unified-tokens'

interface Feature {
  id: string
  icon: React.ElementType
  titleKey: string
  titleEn: string
  descKey: string
  color: string
  glowColor: string
}

const FEATURES: Feature[] = [
  {
    id: 'polyglot',
    icon: Globe,
    titleKey: 'multilingualAnalyst',
    titleEn: 'Polyglot Analyst',
    descKey: 'multilingualAnalystDesc',
    color: T.info,
    glowColor: 'rgba(59, 130, 246, 0.3)',
  },
  {
    id: 'signals',
    icon: Zap,
    titleKey: 'rouaSignals',
    titleEn: 'Roua Signals',
    descKey: 'rouaSignalsDesc',
    color: '#FFD700',
    glowColor: 'rgba(255, 215, 0, 0.3)',
  },
  {
    id: 'radar',
    icon: Radar,
    titleKey: 'newsRadar',
    titleEn: 'News Radar',
    descKey: 'newsRadarDesc',
    color: T.council,
    glowColor: 'rgba(168, 85, 247, 0.3)',
  },
  {
    id: 'sanctuary',
    icon: Shield,
    titleKey: 'sanctuary',
    titleEn: 'Portfolio Sanctuary',
    descKey: 'sanctuaryDesc',
    color: T.profit,
    glowColor: 'rgba(16, 185, 129, 0.3)',
  },
  {
    id: 'lab',
    icon: FlaskConical,
    titleKey: 'smartLab',
    titleEn: 'Smart Lab',
    descKey: 'smartLabDesc',
    color: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.3)',
  },
]

// Connection lines between feature cards (SVG paths)
function NeuralConnections() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
    >
      {/* Row 1 connections */}
      <line x1="200" y1="130" x2="500" y2="130" stroke={T.info} strokeWidth="1" opacity="0.2" />
      <line x1="500" y1="130" x2="800" y2="130" stroke="#FFD700" strokeWidth="1" opacity="0.2" />
      <line x1="200" y1="130" x2="800" y2="130" stroke={T.council} strokeWidth="0.5" opacity="0.1" strokeDasharray="6 4" />

      {/* Row 1 to Row 2 connections */}
      <line x1="350" y1="220" x2="350" y2="380" stroke={T.info} strokeWidth="1" opacity="0.15" />
      <line x1="500" y1="220" x2="350" y2="380" stroke={T.profit} strokeWidth="0.8" opacity="0.15" />
      <line x1="500" y1="220" x2="700" y2="380" stroke="#06B6D4" strokeWidth="0.8" opacity="0.15" />
      <line x1="800" y1="220" x2="700" y2="380" stroke="#FFD700" strokeWidth="1" opacity="0.15" />

      {/* Row 2 connection */}
      <line x1="350" y1="460" x2="700" y2="460" stroke={T.profit} strokeWidth="1" opacity="0.2" />

      {/* Node dots at intersections */}
      {[
        [200, 130], [500, 130], [800, 130],
        [350, 380], [700, 380],
        [350, 460], [700, 460],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3" fill={FEATURES[i % 5].color} opacity="0.4">
          <animate
            attributeName="r"
            values="3;5;3"
            dur={`${2 + i * 0.5}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.4;0.8;0.4"
            dur={`${2 + i * 0.5}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* Data flow particles */}
      {[
        { x1: 200, y1: 130, x2: 500, y2: 130, color: T.info, dur: '3s' },
        { x1: 500, y1: 130, x2: 800, y2: 130, color: '#FFD700', dur: '4s' },
        { x1: 350, y1: 220, x2: 350, y2: 380, color: T.info, dur: '2.5s' },
        { x1: 800, y1: 220, x2: 700, y2: 380, color: '#06B6D4', dur: '3.5s' },
        { x1: 350, y1: 460, x2: 700, y2: 460, color: T.profit, dur: '3s' },
      ].map((line, i) => (
        <circle key={`particle-${i}`} r="2" fill={line.color} opacity="0.8">
          <animateMotion dur={line.dur} repeatCount="indefinite" path={`M${line.x1},${line.y1} L${line.x2},${line.y2}`} />
        </circle>
      ))}
    </svg>
  )
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const [isHovered, setIsHovered] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const t = useTranslations('landing.neuralFeatures')

  const Icon = feature.icon

  return (
    <motion.div
      className="relative group"
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="relative p-6 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer"
        style={{
          background: isHovered
            ? 'rgba(26, 35, 50, 0.9)'
            : 'rgba(26, 35, 50, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${isHovered ? feature.color : 'rgba(255,255,255,0.06)'}`,
          boxShadow: isHovered
            ? `0 0 30px ${feature.glowColor}, 0 0 60px ${feature.glowColor.replace('0.3', '0.1')}`
            : '0 4px 24px rgba(0,0,0,0.3)',
          transform: isHovered ? 'scale(1.03)' : 'scale(1)',
        }}
      >
        {/* Neural accent border top */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-300"
          style={{
            background: `linear-gradient(90deg, transparent, ${feature.color}, transparent)`,
            opacity: isHovered ? 1 : 0.4,
          }}
        />

        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-300"
          style={{
            background: `${feature.color}15`,
            border: `1px solid ${feature.color}30`,
            boxShadow: isHovered ? `0 0 20px ${feature.glowColor}` : 'none',
          }}
        >
          <Icon
            className="w-6 h-6 transition-colors duration-300"
            style={{ color: feature.color }}
          />
        </div>

        {/* Title */}
        <h3
          className="text-lg font-bold mb-1"
          style={{ color: '#E5E7EB', fontFamily: 'var(--font-ar)' }}
        >
          {t(feature.titleKey)}
        </h3>
        <span
          className="text-[11px] tracking-wider block mb-3"
          style={{ color: feature.color, fontFamily: 'var(--font-brand)', opacity: 0.7 }}
        >
          {feature.titleEn}
        </span>

        {/* Description */}
        <p
          className="text-sm leading-relaxed"
          style={{ color: T.text2, fontFamily: 'var(--font-ar)' }}
        >
          {t(feature.descKey)}
        </p>

        {/* Pulse dot indicator */}
        <div className="absolute top-4 end-4">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: feature.color }}
          />
        </div>
      </div>
    </motion.div>
  )
}

export default function NeuralFeatures() {
  const t = useTranslations('landing.neuralFeatures')

  return (
    <section id="features" className="relative py-24 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: '#E5E7EB', fontFamily: 'var(--font-ar)' }}
          >
            {t('titlePart1')}{'\u00A0'}
            <span
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #10B981)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {t('titleHighlight')}
            </span>
          </h2>
          <p
            className="text-base max-w-md mx-auto"
            style={{ color: T.text2, fontFamily: 'var(--font-ar)' }}
          >
            {t('subtitle')}
          </p>
        </div>

        {/* Cards Grid with Connections */}
        <div className="relative">
          {/* Neural SVG connections - visible on large screens */}
          <div className="hidden lg:block absolute inset-0">
            <NeuralConnections />
          </div>

          {/* First row - 3 cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6 relative z-10">
            {FEATURES.slice(0, 3).map((feature, i) => (
              <FeatureCard key={feature.id} feature={feature} index={i} />
            ))}
          </div>

          {/* Second row - 2 cards centered */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto relative z-10">
            {FEATURES.slice(3).map((feature, i) => (
              <FeatureCard key={feature.id} feature={feature} index={i + 3} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
