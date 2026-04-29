'use client';

import { motion } from 'framer-motion';
import { Languages, Zap, Radar, Shield, FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  arabicTitle: string;
  englishSubtitle: string;
  description: string;
  glowColor: string;
}

const features: Feature[] = [
  {
    icon: Languages,
    arabicTitle: 'المحلل متعدد اللغات',
    englishSubtitle: 'Polyglot Analyst',
    description:
      'يحلل الأسواق بلغات متعددة في الوقت الفعلي، مما يمنحك رؤى عالمية دون حواجز لغوية. يدعم العربية والإنجليزية والصينية وغيرها.',
    glowColor: 'rgba(78, 205, 196, 0.4)',
  },
  {
    icon: Zap,
    arabicTitle: 'إشارات رؤى',
    englishSubtitle: 'Roua Signals',
    description:
      'إشارات تداول فورية مدعومة بالذكاء الاصطناعي، تعتمد على تحليل الأنماط والمشاعر السوقية لتقديم توصيات دقيقة.',
    glowColor: 'rgba(255, 107, 53, 0.4)',
  },
  {
    icon: Radar,
    arabicTitle: 'رادار الأخبار الموحد',
    englishSubtitle: 'Unified News Radar',
    description:
      'يراقب آلاف المصادر الإخبارية والاجتماعية في وقت واحد، ويصفي الإشارات الضوضائية ليقدم لك فقط ما يؤثر على محفظتك.',
    glowColor: 'rgba(59, 130, 246, 0.4)',
  },
  {
    icon: Shield,
    arabicTitle: 'ملاذ المحفظة',
    englishSubtitle: 'Portfolio Sanctuary',
    description:
      'حماية ذكية لمحفظتك من التقلبات الحادة عبر تنبيهات المخاطر التنبؤية وتوصيات إعادة التوازن التلقائية.',
    glowColor: 'rgba(139, 92, 246, 0.4)',
  },
  {
    icon: FlaskConical,
    arabicTitle: 'المختبر الذكي',
    englishSubtitle: 'Smart Lab',
    description:
      'اختبر استراتيجياتك في بيئة محاكاة واقعية قبل المخاطرة. حلل الأداء التاريخي وحسّن معاملاتك بناءً على بيانات حقيقية.',
    glowColor: 'rgba(16, 185, 129, 0.4)',
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

interface FeaturesSectionProps {
  id?: string;
}

export default function FeaturesSection({ id }: FeaturesSectionProps) {
  return (
    <section id={id} className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            أدوات متقدمة للمتداول الذكي
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            مجموعة متكاملة من الأدوات المدعومة بالذكاء الاصطناعي لتحليل الأسواق واتخاذ قرارات أذكى
          </p>
        </motion.div>

        {/* Feature Cards Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover={{
                  scale: 1.05,
                  boxShadow: `0 0 40px ${feature.glowColor}, 0 0 80px ${feature.glowColor}`,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 cursor-default group relative overflow-hidden"
              >
                {/* Hover glow overlay */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${feature.glowColor}, transparent 70%)`,
                  }}
                />

                {/* Icon */}
                <div className="relative z-10 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${feature.glowColor.replace('0.4', '0.2')}, ${feature.glowColor.replace('0.4', '0.05')})`,
                      border: `1px solid ${feature.glowColor.replace('0.4', '0.3')}`,
                    }}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Arabic Title */}
                <h3 className="relative z-10 text-xl font-bold text-white mb-1 group-hover:text-white transition-colors">
                  {feature.arabicTitle}
                </h3>

                {/* English Subtitle */}
                <p className="relative z-10 text-sm font-medium text-white/40 mb-3 tracking-wide">
                  {feature.englishSubtitle}
                </p>

                {/* Description */}
                <p className="relative z-10 text-white/60 text-sm leading-relaxed group-hover:text-white/75 transition-colors">
                  {feature.description}
                </p>

                {/* Bottom accent line */}
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: feature.glowColor.replace('0.4', '0.6') }}
                  initial={{ scaleX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
