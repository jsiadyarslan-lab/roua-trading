'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface FeatureData {
  num: string;
  icon: string;
  titleKey: string;
  descKey: string;
  metaKeys: string[];
}

const features: FeatureData[] = [
  {
    num: '01', icon: '🗣️',
    titleKey: 'multilingualAnalyst',
    descKey: 'multilingualAnalystDesc',
    metaKeys: ['metaMultilingual1', 'metaMultilingual2', 'metaMultilingual3']
  },
  {
    num: '02', icon: '📡',
    titleKey: 'rouaSignals',
    descKey: 'rouaSignalsDesc',
    metaKeys: ['metaSignals1', 'metaSignals2', 'metaSignals3']
  },
  {
    num: '03', icon: '📰',
    titleKey: 'newsRadar',
    descKey: 'newsRadarDesc',
    metaKeys: ['metaRadar1', 'metaRadar2', 'metaRadar3']
  },
  {
    num: '04', icon: '🛡️',
    titleKey: 'sanctuary',
    descKey: 'sanctuaryDesc',
    metaKeys: ['metaSanctuary1', 'metaSanctuary2', 'metaSanctuary3']
  },
  {
    num: '05', icon: '🧪',
    titleKey: 'smartLab',
    descKey: 'smartLabDesc',
    metaKeys: ['metaSmartLab1', 'metaSmartLab2', 'metaSmartLab3']
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
      <h3>{t(feature.titleKey)}</h3>
      <p>{t(feature.descKey)}</p>
      <div className="feature-meta">
        {feature.metaKeys.map((key, i) => (
          <span key={i}>{t(key)}</span>
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
        <div className="section-label">{t('sectionLabel')}</div>
        <h2 className="section-title">
          {t('sectionTitlePart1')}<br />{' '}<span className="highlight">{t('sectionTitleHighlight')}</span>
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
