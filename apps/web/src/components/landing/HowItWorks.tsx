'use client';

import { useTranslations } from 'next-intl';

interface StepData {
  num: string;
  titleKey: string;
  titleEn: string;
  descKey: string;
}

export default function HowItWorks() {
  const t = useTranslations('landing.howItWorks');

  const steps: StepData[] = [
    { num: '١', titleKey: 'step1Title', titleEn: 'Sign Up', descKey: 'step1Desc' },
    { num: '٢', titleKey: 'step3Title', titleEn: 'AI Analysis', descKey: 'step2Desc' },
    { num: '٣', titleKey: 'step2Title', titleEn: 'Trade Smart', descKey: 'step3Desc' },
    { num: '٤', titleKey: 'step4Title', titleEn: 'Protect Profits', descKey: 'step4Desc' },
  ];

  return (
    <section className="section" id="how">
      <div className="section-header fade-in">
        <div className="section-label">HOW IT WORKS</div>
        <h2 className="section-title">
          {t('titlePart1')}<br /><span className="highlight">{t('titleHighlight')}</span>
        </h2>
        <p className="section-desc">
          {t('subtitle')}
        </p>
      </div>
      <div className="steps-container">
        {steps.map((step, i) => (
          <div className="step-card fade-in" key={i}>
            <div className="step-number">{step.num}</div>
            <h3>{t(step.titleKey)} <span>{step.titleEn}</span></h3>
            <p>{t(step.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
