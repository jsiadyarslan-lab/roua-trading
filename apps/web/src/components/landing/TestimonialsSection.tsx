'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface TestimonialData {
  tagKey: string;
  textKey: string;
  nameKey: string;
  roleKey: string;
  initial: string;
}

const testimonials: TestimonialData[] = [
  {
    tagKey: 'multilingualAnalyst',
    textKey: 'multilingualAnalystText',
    nameKey: 'multilingualAnalystName',
    roleKey: 'multilingualAnalystRole',
    initial: '🔄',
  },
  {
    tagKey: 'rouaSignals',
    textKey: 'rouaSignalsText',
    nameKey: 'rouaSignalsName',
    roleKey: 'rouaSignalsRole',
    initial: '🎯',
  },
  {
    tagKey: 'newsRadar',
    textKey: 'newsRadarText',
    nameKey: 'newsRadarName',
    roleKey: 'newsRadarRole',
    initial: '📡',
  },
];

function TestimonialCard({ item, t }: { item: TestimonialData; t: ReturnType<typeof useTranslations> }) {
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
      const rotateX = (y - centerY) / 25;
      const rotateY = (centerX - x) / 25;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    };

    const handleMouseLeave = () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
    };

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="testimonial-card fade-in" ref={cardRef}>
      <div className="testimonial-tag">{t(item.tagKey)}</div>
      <div className="testimonial-quote">&quot;</div>
      <p className="testimonial-text">{t(item.textKey)}</p>
      <div className="testimonial-author">
        <div className="author-avatar">{item.initial}</div>
        <div className="author-info">
          <h4>{t(item.nameKey)}</h4>
          <span>{t(item.roleKey)}</span>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  const t = useTranslations('landing.testimonials');

  return (
    <section className="section" id="testimonials">
      <div className="section-header fade-in">
        <div className="section-label">TESTIMONIALS</div>
        <h2 className="section-title">
          {t('titlePart1')}<br /><span className="highlight">{t('titleHighlight')}</span>
        </h2>
        <p className="section-desc">
          {t('sectionDesc')}
        </p>
      </div>
      <div className="testimonials-grid">
        {testimonials.map((item, i) => (
          <TestimonialCard key={i} item={item} t={t} />
        ))}
      </div>
    </section>
  );
}
