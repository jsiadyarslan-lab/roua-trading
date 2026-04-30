'use client';

export default function MarketPulse() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: 'linear-gradient(90deg, #00d4ff, #7dd3fc, #bae6fd, #00d4ff)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 5s infinite linear',
        zIndex: 100,
      }}
    />
  );
}
