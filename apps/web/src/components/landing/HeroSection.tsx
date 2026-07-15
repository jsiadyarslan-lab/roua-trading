'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, TrendingUp } from 'lucide-react';

/**
 * V500-REDESIGN: Glassmorphism hero — Robinhood-inspired.
 *
 * Changes from V1:
 *   - Frosted glass "AI pulse" card instead of plain badge
 *   - Massive gradient headline with neon glow (Robinhood-style)
 *   - Glass CTA buttons (primary glow + secondary glass)
 *   - Floating stat cards with hover lift
 *   - Aurora background layers (in layout)
 *   - Mobile-first: stack vertically on small screens
 */

const STAT_ITEMS = [
  { key: 'aiModels', target: 8, suffix: '' },
  { key: 'assetClasses', target: 6, suffix: '' },
  { key: 'setupSeconds', target: 30, suffix: 's' },
  { key: 'dailyMonitoring', target: 24, suffix: 'h' },
] as const;

export default function HeroSection() {
  const t = useTranslations('landing.hero');
  const tc = useTranslations('common');
  const [typewriterText, setTypewriterText] = useState('');
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const fullText = t('fullDescription');

  // Typewriter effect
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
    const counters = statsRef.current?.querySelectorAll('[data-target]') || [];
    const rafIds: number[] = [];
    counters.forEach((counter) => {
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
    return () => rafIds.forEach((id) => cancelAnimationFrame(id));
  }, [statsVisible]);

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
    <section
      className="hero"
      style={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(6rem + env(safe-area-inset-top)) 1.5rem calc(2rem + env(safe-area-inset-bottom))',
        overflow: 'hidden',
      }}
    >
      {/* Floating AI badge — glass pill with pulse */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass-card"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderRadius: '9999px',
          marginBottom: '2rem',
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent-emerald)',
            boxShadow: '0 0 12px var(--accent-emerald-glow)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {t('sixAiModels')}
        </span>
      </motion.div>

      {/* Massive gradient headline */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(3rem, 10vw, 6rem)',
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          margin: '0 0 1.5rem 0',
          textAlign: 'center',
          background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 50%, #10B981 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          filter: 'drop-shadow(0 0 40px rgba(16, 185, 129, 0.3))',
        }}
      >
        {tc('brand')}
      </motion.h1>

      {/* Subtitle with typewriter */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          maxWidth: '640px',
          margin: '0 auto 2.5rem',
          textAlign: 'center',
          minHeight: '4em',
        }}
      >
        {typewriterText}
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: '1.2em',
            background: 'var(--accent-emerald)',
            marginLeft: 4,
            verticalAlign: 'middle',
            animation: 'blink 1s infinite',
          }}
        />
      </motion.p>

      {/* CTA buttons — Robinhood-style: one big primary, one glass secondary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: 'center',
          marginBottom: '4rem',
        }}
      >
        <a
          href="/login"
          className="btn-glow"
          style={{
            padding: '1rem 2.5rem',
            fontSize: '1.0625rem',
            minWidth: '200px',
          }}
        >
          <Sparkles size={18} />
          <span>{t('cta')}</span>
          <ArrowRight size={18} />
        </a>
        <a
          href="#features"
          className="btn-glass"
          style={{
            padding: '1rem 2.5rem',
            fontSize: '1.0625rem',
            minWidth: '200px',
          }}
        >
          {t('explore')}
        </a>
      </motion.div>

      {/* Stat cards — floating glass cards */}
      <motion.div
        ref={statsRef}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.7 }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem',
          maxWidth: '720px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {STAT_ITEMS.map((stat, i) => (
          <div
            key={stat.key}
            className="glass-card"
            style={{
              padding: '1.25rem 1rem',
              textAlign: 'center',
            }}
          >
            <div
              data-target={stat.target}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.5rem, 4vw, 2rem)',
                fontWeight: 800,
                background: 'var(--gradient-emerald-cyan)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
                marginBottom: '0.25rem',
              }}
            >
              0
              <span style={{ fontSize: '0.6em', opacity: 0.7 }}>{stat.suffix}</span>
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t(stat.key as any)}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Bottom hint — scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{
          position: 'absolute',
          bottom: 'calc(2rem + env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'var(--text-tertiary)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-display)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          opacity: 0.6,
        }}
      >
        <TrendingUp size={16} />
      </motion.div>
    </section>
  );
}
