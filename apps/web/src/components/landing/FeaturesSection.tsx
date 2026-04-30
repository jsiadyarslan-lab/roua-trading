'use client';

import { useRef, useState, useCallback } from 'react';

interface Feature {
  num: string;
  icon: string;
  titleAr: string;
  titleEn: string;
  description: string;
  tags: { icon: string; text: string }[];
  color: string;
}

const features: Feature[] = [
  {
    num: '01',
    icon: '🗣️',
    titleAr: 'المحلل متعدد اللغات',
    titleEn: 'Multilingual Analyst',
    description: 'تحليل السوق بـ 12 لغة مع دقة تفوق 94% وتحليل فوري للأخبار والتقارير المالية.',
    tags: [
      { icon: '🌍', text: '12+ لغة' },
      { icon: '⚡', text: 'تحليل فوري' },
      { icon: '🎯', text: 'دقة 94%' },
    ],
    color: '#00d4ff',
  },
  {
    num: '02',
    icon: '📡',
    titleAr: 'إشارات رؤى',
    titleEn: 'ROUA Signals',
    description: 'إشارات تداول ذكية بدقة 87% مع تنبيهات فورية لأكثر من 50 زوج عملات.',
    tags: [
      { icon: '🎯', text: '87% دقة' },
      { icon: '⏱️', text: 'تنبيه فوري' },
      { icon: '📊', text: '50+ زوج' },
    ],
    color: '#7dd3fc',
  },
  {
    num: '03',
    icon: '📰',
    titleAr: 'رادار الأخبار الموحد',
    titleEn: 'News Radar',
    description: 'مراقبة 5000+ مصدر إخباري مع تصفية ذكية وسرعة أسبق بـ 15 دقيقة.',
    tags: [
      { icon: '📡', text: '5000+ مصدر' },
      { icon: '⚡', text: '15 دقيقة أسبق' },
      { icon: '🧠', text: 'تصفية ذكية' },
    ],
    color: '#34d399',
  },
  {
    num: '04',
    icon: '🛡️',
    titleAr: 'ملاذ المحفظة',
    titleEn: 'Portfolio Haven',
    description: 'حماية 24/7 مع تقليل المخاطر التلقائي وتوازن المحفظة الذكي.',
    tags: [
      { icon: '🛡️', text: 'حماية 24/7' },
      { icon: '📉', text: 'تقليل المخاطر' },
      { icon: '⚖️', text: 'توازن تلقائي' },
    ],
    color: '#a78bfa',
  },
  {
    num: '05',
    icon: '🧪',
    titleAr: 'المختبر الذكي',
    titleEn: 'Smart Lab',
    description: 'محاكاة حقيقية مع بيانات تاريخية وتحسين تلقائي للاستراتيجيات.',
    tags: [
      { icon: '🧪', text: 'محاكاة حقيقية' },
      { icon: '📈', text: 'بيانات تاريخية' },
      { icon: '🔧', text: 'تحسين تلقائي' },
    ],
    color: '#f472b6',
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -10, y: x * 10 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: '1000px' }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          padding: '28px 24px',
          transition: 'transform 0.15s ease-out, box-shadow 0.3s ease, border-color 0.3s ease',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 25px ${feature.color}15, 0 8px 32px rgba(0,0,0,0.3)`;
          e.currentTarget.style.borderColor = `${feature.color}30`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        }}
      >
        {/* Big number */}
        <span
          style={{
            position: 'absolute',
            top: '12px',
            left: '16px',
            fontSize: '4rem',
            fontWeight: 800,
            color: `${feature.color}10`,
            lineHeight: 1,
            fontFamily: "var(--font-ibm-plex), sans-serif",
          }}
        >
          {feature.num}
        </span>

        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{feature.icon}</div>
        <h3
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: '#f0f9ff',
            marginBottom: '4px',
            fontFamily: "var(--font-noto-naskh), serif",
          }}
        >
          {feature.titleAr}
        </h3>
        <p
          style={{
            fontSize: '0.8rem',
            color: feature.color,
            fontWeight: 500,
            marginBottom: '10px',
            fontFamily: "var(--font-ibm-plex), sans-serif",
          }}
        >
          {feature.titleEn}
        </p>
        <p
          style={{
            fontSize: '0.9rem',
            color: '#94a3b8',
            lineHeight: 1.7,
            marginBottom: '16px',
            fontFamily: "var(--font-ibm-plex), sans-serif",
          }}
        >
          {feature.description}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {feature.tags.map((tag, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                color: '#94a3b8',
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {tag.icon} {tag.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  return (
    <section
      id="features"
      style={{
        position: 'relative',
        zIndex: 10,
        padding: '80px 20px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <span className="section-label">CORE FEATURES</span>
        <h2
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 700,
            color: '#f0f9ff',
            marginTop: '12px',
            fontFamily: "var(--font-noto-naskh), serif",
          }}
        >
          أدوات متقدمة للمتداول الذكي
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
        }}
      >
        {features.map((feature, i) => (
          <FeatureCard key={i} feature={feature} />
        ))}
      </div>
    </section>
  );
}
