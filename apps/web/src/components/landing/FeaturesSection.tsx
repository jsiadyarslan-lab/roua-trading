'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface FeatureData {
  num: string;
  icon: string;
  titleKey: string;
  titleEn: string;
  descKey: string;
  meta: string[];
}

const features: FeatureData[] = [
  {
    num: '01', icon: '🗣️',
    titleKey: 'multilingualAnalyst', titleEn: 'Polyglot Analyst',
    descKey: 'multilingualAnalystDesc',
    meta: ['🌍 12+ لغة', '⚡ تحليل فوري', '🧠 ذكاء متعدد']
  },
  {
    num: '02', icon: '📡',
    titleKey: 'rouaSignals', titleEn: 'Roua Signals',
    descKey: 'rouaSignalsDesc',
    meta: ['🎯 ذكاء متعدد', '⏱️ تنبيه فوري', '📊 50+ زوج']
  },
  {
    num: '03', icon: '📰',
    titleKey: 'newsRadar', titleEn: 'Unified News Radar',
    descKey: 'newsRadarDesc',
    meta: ['📡 مصادر متعددة', '⚡ رصد فوري', '🧠 تصفية ذكية']
  },
  {
    num: '04', icon: '🛡️',
    titleKey: 'sanctuary', titleEn: 'Portfolio Sanctuary',
    descKey: 'sanctuaryDesc',
    meta: ['🛡️ حماية 24/7', '📉 تقليل المخاطر', '⚖️ توازن تلقائي']
  },
  {
    num: '05', icon: '🧪',
    titleKey: 'smartLab', titleEn: 'Smart Lab',
    descKey: 'smartLabDesc',
    meta: ['🧪 محاكاة حقيقية', '📈 بيانات تاريخية', '🔧 تحسين تلقائي']
  },
];

function FeatureCard({ feature, t }: { feature: FeatureData; t: ReturnType<typeof useTranslations> }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px) scale(1.01)`;
    };

    const handleMouseLeave = () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0) scale(1)';
    };

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="feature-card fade-in" ref={cardRef}>
      <div className="feature-number">{feature.num}</div>
      <div className="feature-icon">{feature.icon}</div>
      <h3>{t(feature.titleKey)} <span>{feature.titleEn}</span></h3>
      <p>{t(feature.descKey)}</p>
      <div className="feature-meta">
        {feature.meta.map((tag, i) => (
          <span key={i}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  const t = useTranslations('landing.features');

  return (
    <section className="section features-section" id="features">
      <div className="section-header fade-in">
        <div className="section-label">CORE FEATURES</div>
        <h2 className="section-title">
          {t('sectionTitlePart1')}<br /><span className="highlight">{t('sectionTitleHighlight')}</span>
        </h2>
        <p className="section-desc">
          {t('sectionDesc')}
        </p>
      </div>
      <div className="features-grid">
        {features.map((feature, i) => (
          <FeatureCard key={i} feature={feature} t={t} />
        ))}
      </div>
    </section>
  );
}
