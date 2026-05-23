'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface ModelData {
  icon: string;
  titleKey: string;
  descKey: string;
  tag: string;
}

const models: ModelData[] = [
  { icon: '⚡', titleKey: 'fastProcessing', descKey: 'fastProcessingDesc', tag: 'Inference Engine' },
  { icon: '🌐', titleKey: 'multilingualAnalyst', descKey: 'multilingualAnalystDesc', tag: 'Polyglot Analyst' },
  { icon: '📊', titleKey: 'chartAnalysis', descKey: 'chartAnalysisDesc', tag: 'Chart Vision' },
  { icon: '🛡️', titleKey: 'secureInfra', descKey: 'secureInfraDesc', tag: 'Secure Core' },
  { icon: '🔒', titleKey: 'localModels', descKey: 'localModelsDesc', tag: 'On-Premise AI' },
  { icon: '📡', titleKey: 'comprehensiveData', descKey: 'comprehensiveDataDesc', tag: 'Live Feed' },
];

function ModelCard({ model, t }: { model: ModelData; t: ReturnType<typeof useTranslations> }) {
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
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.01)`;
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
    <div className="model-card fade-in" ref={cardRef}>
      <div className="model-icon">{model.icon}</div>
      <h3>{t(model.titleKey)}</h3>
      <p>{t(model.descKey)}</p>
      <span className="tag">{model.tag}</span>
    </div>
  );
}

export default function AIModelsSection() {
  const t = useTranslations('landing.aiModels');

  return (
    <section className="section ai-orchestrator" id="models">
      <div className="section-header fade-in">
        <div className="section-label">AI ORCHESTRATOR</div>
        <h2 className="section-title">
          {t('sectionTitlePart1')}<br />{t('sectionTitleMiddle')} <span className="highlight">{t('sectionTitleHighlight')}</span>
        </h2>
        <p className="section-desc">
          {t('sectionDesc')}
        </p>
      </div>
      <div className="models-grid">
        {models.map((model, i) => (
          <ModelCard key={i} model={model} t={t} />
        ))}
      </div>
    </section>
  );
}
