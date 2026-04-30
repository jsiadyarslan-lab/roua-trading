'use client';

export default function CosmicFooter() {
  return (
    <footer
      style={{
        position: 'relative',
        zIndex: 10,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '32px 20px',
        textAlign: 'center',
        background: 'rgba(2, 2, 10, 0.5)',
      }}
    >
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #00d4ff, #7dd3fc, #bae6fd)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontFamily: "var(--font-noto-naskh), serif",
          marginBottom: '8px',
        }}
      >
        رؤى
      </div>
      <p
        style={{
          fontSize: '0.8rem',
          color: '#475569',
          fontFamily: "var(--font-ibm-plex), sans-serif",
        }}
      >
        منصة التداول الذكية المدعومة بالذكاء الاصطناعي © 2026
      </p>
    </footer>
  );
}
