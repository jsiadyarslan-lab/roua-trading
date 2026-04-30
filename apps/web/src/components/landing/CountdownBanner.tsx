'use client';

import { useState, useEffect } from 'react';

export default function CountdownBanner() {
  const [timeLeft, setTimeLeft] = useState({ hours: 5, minutes: 42, seconds: 18 });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) {
          seconds = 59;
          minutes--;
        }
        if (minutes < 0) {
          minutes = 59;
          hours--;
        }
        if (hours < 0) {
          hours = 23;
          minutes = 59;
          seconds = 59;
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <section
      style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 20px 60px',
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '800px',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#f87171',
              animation: 'pulse-glow 1.5s infinite',
              boxShadow: '0 0 8px rgba(248, 113, 113, 0.5)',
            }}
          />
          <span
            style={{
              color: '#f0f9ff',
              fontSize: '0.9rem',
              fontWeight: 600,
              fontFamily: "var(--font-ibm-plex), sans-serif",
            }}
          >
            الحدث المالي القادم: تقرير الفيدرالي الأمريكي
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', direction: 'ltr' }}>
          <TimeBlock value={pad(timeLeft.hours)} />
          <span style={{ color: '#f87171', fontWeight: 700, fontSize: '1.2rem' }}>:</span>
          <TimeBlock value={pad(timeLeft.minutes)} />
          <span style={{ color: '#f87171', fontWeight: 700, fontSize: '1.2rem' }}>:</span>
          <TimeBlock value={pad(timeLeft.seconds)} />
        </div>
      </div>
    </section>
  );
}

function TimeBlock({ value }: { value: string }) {
  return (
    <div
      style={{
        background: 'rgba(248, 113, 113, 0.1)',
        border: '1px solid rgba(248, 113, 113, 0.2)',
        borderRadius: '8px',
        padding: '6px 12px',
        color: '#f87171',
        fontWeight: 700,
        fontSize: '1.2rem',
        fontFamily: "var(--font-ibm-plex), sans-serif",
        minWidth: '42px',
        textAlign: 'center',
      }}
    >
      {value}
    </div>
  );
}
