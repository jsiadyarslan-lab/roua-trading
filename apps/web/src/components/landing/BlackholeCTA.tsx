'use client';

import { useState } from 'react';

export default function BlackholeCTA() {
  const [hovered, setHovered] = useState(false);

  return (
    <section
      style={{
        position: 'relative',
        zIndex: 10,
        padding: '100px 20px 80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Blackhole */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          width: '280px',
          height: '280px',
          marginBottom: '40px',
          cursor: 'pointer',
        }}
      >
        {/* Accretion disk - outer */}
        <div
          style={{
            position: 'absolute',
            inset: '0',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #a78bfa, #f472b6, #00d4ff, #a78bfa)',
            animation: `spin-slow ${hovered ? '2s' : '6s'} linear infinite`,
            opacity: 0.6,
            filter: 'blur(2px)',
            transition: 'animation-duration 0.3s',
          }}
        />

        {/* Accretion disk - inner */}
        <div
          style={{
            position: 'absolute',
            inset: '30px',
            borderRadius: '50%',
            background: 'conic-gradient(from 180deg, #00d4ff, #a78bfa, #f472b6, #00d4ff)',
            animation: `spin-reverse ${hovered ? '3s' : '8s'} linear infinite`,
            opacity: 0.4,
            filter: 'blur(3px)',
            transition: 'animation-duration 0.3s',
          }}
        />

        {/* Event horizon */}
        <div
          style={{
            position: 'absolute',
            inset: '60px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #000 60%, rgba(0, 212, 255, 0.1) 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease',
            transform: hovered ? 'scale(1.1)' : 'scale(1)',
          }}
        >
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #00d4ff, #7dd3fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: "var(--font-noto-naskh), serif",
            }}
          >
            انضم إلى الكون
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              marginTop: '4px',
              fontFamily: "var(--font-ibm-plex), sans-serif",
            }}
          >
            ابدأ التداول الذكي
          </span>
        </div>

        {/* Glow ring */}
        <div
          style={{
            position: 'absolute',
            inset: '-10px',
            borderRadius: '50%',
            border: '1px solid rgba(0, 212, 255, 0.1)',
            boxShadow: hovered
              ? '0 0 60px rgba(0, 212, 255, 0.2), 0 0 120px rgba(167, 139, 250, 0.1)'
              : '0 0 30px rgba(0, 212, 255, 0.1)',
            transition: 'box-shadow 0.3s ease',
          }}
        />
      </div>

      <h2
        style={{
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 700,
          color: '#f0f9ff',
          marginBottom: '12px',
          fontFamily: "var(--font-noto-naskh), serif",
        }}
      >
        هل أنت مستعد للتداول بذكاء؟
      </h2>

      <p
        style={{
          fontSize: '1rem',
          color: '#94a3b8',
          marginBottom: '32px',
          maxWidth: '500px',
          fontFamily: "var(--font-ibm-plex), sans-serif",
        }}
      >
        انضم إلى آلاف المتداولين الذين يثقون في{' '}
        <span
          style={{
            background: 'linear-gradient(135deg, #00d4ff, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 600,
          }}
        >
          رؤى
        </span>
      </p>

      <a
        href="/login"
        className="glow-btn"
        style={{
          textDecoration: 'none',
          fontSize: '1.1rem',
          padding: '16px 40px',
          fontFamily: "var(--font-ibm-plex), sans-serif",
        }}
      >
        🚀 انضم الآن — مجاناً
      </a>

      <p
        style={{
          fontSize: '0.8rem',
          color: '#475569',
          marginTop: '16px',
          fontFamily: "var(--font-ibm-plex), sans-serif",
        }}
      >
        لا حاجة لبطاقة ائتمانية · إعداد في أقل من دقيقة
      </p>
    </section>
  );
}
