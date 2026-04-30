'use client';

import { useState, useEffect, useRef } from 'react';

function useCountUp(target: number, duration: number = 2000, start: boolean = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

function useInView(threshold = 0.3) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export default function HeroSection() {
  const [typewriterText, setTypewriterText] = useState('');
  const [typewriterDone, setTypewriterDone] = useState(false);
  const fullText = 'منصة التداول المدعومة بالذكاء الاصطناعي الأكثر تقدماً في المنطقة. حيث تلتقي شبكة الكون المالي بعقل آلة يتنبأ قبل أن يحدث.';
  const { ref: statsRef, inView: statsInView } = useInView();

  const count87 = useCountUp(87, 2000, statsInView);
  const count6 = useCountUp(6, 1500, statsInView);
  const count30 = useCountUp(30, 1800, statsInView);
  const count24 = useCountUp(24, 1600, statsInView);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypewriterText(fullText.slice(0, i));
        i++;
      } else {
        setTypewriterDone(true);
        clearInterval(interval);
      }
    }, 35);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      style={{
        position: 'relative',
        zIndex: 10,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 20px 80px',
        textAlign: 'center',
      }}
    >
      {/* Badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          borderRadius: '50px',
          background: 'rgba(0, 212, 255, 0.08)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          marginBottom: '32px',
          animation: 'float 3s ease-in-out infinite',
          fontSize: '0.85rem',
          fontFamily: "var(--font-ibm-plex), sans-serif",
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#00d4ff',
            animation: 'pulse-glow 2s infinite',
          }}
        />
        <span style={{ color: '#bae6fd' }}>ستة نماذج ذكاء اصطناعي متناغمة</span>
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: 'clamp(5rem, 12vw, 10rem)',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #00d4ff, #7dd3fc, #bae6fd)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontFamily: "var(--font-noto-naskh), serif",
          lineHeight: 1.1,
          marginBottom: '8px',
          position: 'relative',
        }}
      >
        {/* Glow behind */}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #00d4ff, #7dd3fc, #bae6fd)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'blur(40px)',
            opacity: 0.4,
            fontFamily: "var(--font-noto-naskh), serif",
            fontSize: 'clamp(5rem, 12vw, 10rem)',
            fontWeight: 800,
            lineHeight: 1.1,
          }}
          aria-hidden
        >
          رؤى
        </span>
        رؤى
      </h1>

      {/* Typewriter subtitle */}
      <p
        style={{
          maxWidth: '700px',
          fontSize: '1.1rem',
          lineHeight: 1.8,
          color: '#94a3b8',
          marginBottom: '40px',
          fontFamily: "var(--font-ibm-plex), sans-serif",
          minHeight: '3.5em',
        }}
      >
        {typewriterText}
        <span
          style={{
            borderRight: typewriterDone ? 'none' : '2px solid #00d4ff',
            animation: typewriterDone ? 'none' : 'typewriter-cursor 0.7s infinite',
            marginRight: '2px',
          }}
        />
      </p>

      {/* CTA Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: '60px',
        }}
      >
        <a href="/login" className="glow-btn" style={{ textDecoration: 'none', fontSize: '1rem' }}>
          🚀 ابدأ التداول الذكي
        </a>
        <a href="#features" className="outline-btn" style={{ textDecoration: 'none', fontSize: '1rem' }}>
          استكشف المنصة
        </a>
      </div>

      {/* Stats */}
      <div
        ref={statsRef}
        style={{
          display: 'flex',
          gap: '40px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {[
          { value: count87, suffix: '%', label: 'دقة الإشارات' },
          { value: count6, suffix: '', label: 'نماذج ذكاء' },
          { value: count30, suffix: ' ثانية', label: 'للإعداد' },
          { value: count24, suffix: ' ساعة', label: 'مراقبة' },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              textAlign: 'center',
              padding: '16px 24px',
            }}
          >
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #00d4ff, #7dd3fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {stat.value}{stat.suffix}
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: '#94a3b8',
                marginTop: '4px',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
