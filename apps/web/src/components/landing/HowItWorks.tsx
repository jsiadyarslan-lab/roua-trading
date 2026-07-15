'use client';

import { useTranslations } from 'next-intl';

interface StepData {
  num: number;
  titleKey: string;
  subtitleKey: string;
  descKey: string;
}

export default function HowItWorks() {
  const t = useTranslations('landing.howItWorks');

  const steps: StepData[] = [
    { num: 1, titleKey: 'step1Title', subtitleKey: 'step1Subtitle', descKey: 'step1Desc' },
    { num: 2, titleKey: 'step3Title', subtitleKey: 'step2Subtitle', descKey: 'step2Desc' },
    { num: 3, titleKey: 'step2Title', subtitleKey: 'step3Subtitle', descKey: 'step3Desc' },
    { num: 4, titleKey: 'step4Title', subtitleKey: 'step4Subtitle', descKey: 'step4Desc' },
  ];

  return (
    <section className="section" id="how">
      <div className="section-header fade-in">
        <div className="section-label">{t('sectionLabel')}</div>
        <h2 className="section-title">
          {t('titlePart1')}<br />{' '}<span className="highlight">{t('titleHighlight')}</span>
        </h2>
        <p className="section-desc">
          {t('subtitle')}
        </p>
      </div>
      <div className="steps-container">
        {steps.map((step, i) => (
          <div className="step-card fade-in" key={i}>
            <div className="step-number">{step.num}</div>
            <h3>{t(step.titleKey)} <span>{t(step.subtitleKey)}</span></h3>
            <p>{t(step.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
