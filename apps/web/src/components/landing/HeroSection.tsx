'use client';

import { useState, useEffect, useRef } from 'react';

export default function HeroSection() {
  const [typewriterText, setTypewriterText] = useState('');
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const fullText = 'منصة ربط الحسابات المدعومة بالذكاء الاصطناعي الأكثر تقدماً في المنطقة. حيث تلتقي شبكة الكون المالي بعقل آلة يتنبأ قبل أن يحدث.';

  // Typewriter effect
  useEffect(() => {
    let charIndex = 0;
    const timer = setTimeout(function typeWriter() {
      if (charIndex < fullText.length) {
        setTypewriterText(fullText.substring(0, charIndex + 1));
        charIndex++;
        setTimeout(typeWriter, 35);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Animated counters
  useEffect(() => {
    if (!statsVisible) return;
    const counters = document.querySelectorAll('.stat-number');
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target') || '0');
      const duration = 2000;
      const step = target / (duration / 16);
      let current = 0;
      const update = () => {
        current += step;
        if (current < target) {
          counter.textContent = String(Math.floor(current));
          requestAnimationFrame(update);
        } else {
          counter.textContent = String(target);
        }
      };
      update();
    });
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
        <span>ستة نماذج ذكاء اصطناعي متناغمة</span>
      </div>
      <h1 className="hero-title">رؤى</h1>
      <p className="hero-subtitle">
        {typewriterText}
        <span className="cursor-blink" />
      </p>
      <div className="hero-cta-group">
        <a href="/api/auth/guest" className="btn btn-glow" style={{ fontSize: '1.05rem', padding: '1rem 2.8rem' }}>
          🚀 ابدأ ربط حساباتك
        </a>
        <a href="#features" className="btn btn-outline" style={{ fontSize: '1.05rem', padding: '1rem 2.8rem' }}>
          استكشف المنصة
        </a>
      </div>
      <div style={{ marginTop: '0.8rem', textAlign: 'center' }}>
        <a href="/api/auth/guest" style={{
          color: 'rgba(0, 212, 255, 0.6)',
          fontSize: '0.85rem',
          textDecoration: 'none',
          transition: 'color 0.2s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(0, 212, 255, 0.9)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(0, 212, 255, 0.6)')}
        >
          أو جرّب كضيف ←
        </a>
      </div>
      <div className="hero-stats" ref={statsRef}>
        <div className="stat-item">
          <div className="stat-number" data-target="8">0</div>
          <div className="stat-label">نماذج ذكاء اصطناعي</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" data-target="6">0</div>
          <div className="stat-label">فئات أصول مدعومة</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" data-target="30">0</div>
          <div className="stat-label">ثانية للإعداد</div>
        </div>
        <div className="stat-item">
          <div className="stat-number" data-target="24">0</div>
          <div className="stat-label">ساعة مراقبة يومية</div>
        </div>
      </div>
    </section>
  );
}
