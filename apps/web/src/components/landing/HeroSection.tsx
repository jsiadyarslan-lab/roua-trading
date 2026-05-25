'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

export default function HeroSection() {
  const t = useTranslations('landing.hero');
  const tc = useTranslations('common');
  const [typewriterText, setTypewriterText] = useState('');
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const fullText = t('fullDescription');

  // Typewriter effect — cancelled flag prevents stale setTimeout callbacks
  // after component unmounts (e.g. user navigates away mid-typewriter)
  useEffect(() => {
    let charIndex = 0;
    let cancelled = false;
    const timer = setTimeout(function typeWriter() {
      if (cancelled) return;
      if (charIndex < fullText.length) {
        setTypewriterText(fullText.substring(0, charIndex + 1));
        charIndex++;
        setTimeout(typeWriter, 35);
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fullText]);

  // Animated counters
  useEffect(() => {
    if (!statsVisible) return;
    const counters = document.querySelectorAll('.stat-number');
    const rafIds: number[] = [];
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target') || '0');
      const duration = 2000;
      const step = target / (duration / 16);
      let current = 0;
      const update = () => {
        current += step;
        if (current < target) {
          counter.textContent = String(Math.floor(current));
          rafIds.push(requestAnimationFrame(update));
        } else {
          counter.textContent = String(target);
        }
      };
      rafIds.push(requestAnimationFrame(update));
    });
    return () => {
      rafIds.forEach(id => cancelAnimationFrame(id));
    };
  }, [statsVisible]);

  // Intersection observer for stats
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="hero">
      <div className="hero-badge">
        <div className="pulse-dot" />
        <span>{t('sixAiModels')}</span>
      </div>
      <h1 className="hero-title">{tc('brand')}</h1>
      <p className="hero-subtitle">
        {typewriterText}
        <span className="cursor-blink" />
      </p>
      <div className="hero-cta-group">
        <a href="/login" className="btn btn-glow" style={{ fontSize: '1.05rem', padding: '1rem 2.8rem' }}>
          🚀 {t('cta')}
        </a>
        <a href="#features" className="btn btn-outline" style={{ fontSize: '1.05rem', padding: '1rem 2.8rem' }}>
          {t('explore')}
        </a>
      </div>
      <div style={{ marginTop: '0.8rem', textAlign: 'center' }}>
      </div>
      <div className="hero-stats" ref={statsRef}>
        <div className="stat-item">
          <div className="stat-number" data-target="8">0</div>
          <div className="stat-label">{t('aiModels')}</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" data-target="6">0</div>
          <div className="stat-label">{t('assetClasses')}</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" data-target="30">0</div>
          <div className="stat-label">{t('setupSeconds')}</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" data-target="24">0</div>
          <div className="stat-label">{t('dailyMonitoring')}</div>
        </div>
      </div>
    </section>
  );
}
