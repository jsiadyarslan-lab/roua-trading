'use client';

import { useRef, useState, useCallback } from 'react';

interface ModelCard {
  icon: string;
  title: string;
  description: string;
  tag: string;
  color: string;
}

const models: ModelCard[] = [
  { icon: '⚡', title: 'معالجة فائقة السرعة', description: 'Inference Engine', tag: 'SPEED', color: '#00d4ff' },
  { icon: '🌐', title: 'نموذج لغوي متعدد', description: 'Polyglot Analyst', tag: 'NLP', color: '#7dd3fc' },
  { icon: '📊', title: 'تحليل الرسوم البيانية', description: 'Chart Vision', tag: 'VISION', color: '#34d399' },
  { icon: '🛡️', title: 'بنية تحتية آمنة', description: 'Secure Core', tag: 'SECURITY', color: '#a78bfa' },
  { icon: '🔒', title: 'نماذج محلية خاصة', description: 'On-Premise AI', tag: 'PRIVATE', color: '#f472b6' },
  { icon: '📡', title: 'بيانات سوق شاملة', description: 'Live Feed', tag: 'DATA', color: '#bae6fd' },
];

function TiltCard({ model, index }: { model: ModelCard; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -15, y: x * 15 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: '1000px',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          padding: '28px 24px',
          transition: 'transform 0.15s ease-out, box-shadow 0.3s ease',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 30px ${model.color}20, 0 8px 32px rgba(0,0,0,0.3)`;
          e.currentTarget.style.borderColor = `${model.color}30`;
          e.currentTarget.style.transform = `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-4px)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        }}
      >
        {/* Gradient glow overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '120px',
            height: '120px',
            background: `radial-gradient(circle, ${model.color}10, transparent)`,
            pointerEvents: 'none',
          }}
        />

        <div style={{ fontSize: '2.2rem', marginBottom: '16px' }}>{model.icon}</div>
        <h3
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: '#f0f9ff',
            marginBottom: '6px',
            fontFamily: "var(--font-noto-naskh), serif",
          }}
        >
          {model.title}
        </h3>
        <p
          style={{
            fontSize: '0.85rem',
            color: '#94a3b8',
            marginBottom: '16px',
            fontFamily: "var(--font-ibm-plex), sans-serif",
          }}
        >
          {model.description}
        </p>
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: model.color,
            padding: '4px 12px',
            borderRadius: '20px',
            background: `${model.color}15`,
            border: `1px solid ${model.color}25`,
          }}
        >
          {model.tag}
        </span>
      </div>
    </div>
  );
}

export default function AIModelsSection() {
  return (
    <section
      id="models"
      style={{
        position: 'relative',
        zIndex: 10,
        padding: '80px 20px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <span className="section-label">AI ORCHESTRATOR</span>
        <h2
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 700,
            color: '#f0f9ff',
            marginTop: '12px',
            fontFamily: "var(--font-noto-naskh), serif",
          }}
        >
          ستة نماذج ذكاء اصطناعي تعمل بتناغم
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {models.map((model, i) => (
          <TiltCard key={i} model={model} index={i} />
        ))}
      </div>
    </section>
  );
}
