'use client';

const signals = [
  { pair: 'EUR/USD', action: 'BUY', change: '+1.2%', color: '#34d399' },
  { pair: 'BTC/USD', action: 'BUY', change: '+3.4%', color: '#34d399' },
  { pair: 'GBP/JPY', action: 'SELL', change: '+0.8%', color: '#f87171' },
  { pair: 'GOLD', action: 'BUY', change: '+2.1%', color: '#34d399' },
  { pair: 'NASDAQ', action: 'BUY', change: '+1.7%', color: '#34d399' },
  { pair: 'ETH/USD', action: 'SELL', change: '+1.5%', color: '#f87171' },
  { pair: 'USD/JPY', action: 'BUY', change: '+0.9%', color: '#34d399' },
  { pair: 'OIL', action: 'SELL', change: '+2.3%', color: '#f87171' },
];

export default function LiveSignals() {
  return (
    <div
      className="hidden md:flex"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40px',
        background: 'rgba(2, 2, 10, 0.9)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        zIndex: 90,
        overflow: 'hidden',
        alignItems: 'center',
      }}
    >
      <div
        className="signal-scroll"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '32px',
          whiteSpace: 'nowrap',
          paddingRight: '32px',
        }}
      >
        {[...signals, ...signals].map((sig, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontFamily: "var(--font-ibm-plex), sans-serif",
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: sig.color,
                animation: 'pulse-glow 2s infinite',
                boxShadow: `0 0 6px ${sig.color}`,
              }}
            />
            <span style={{ color: '#f0f9ff', fontWeight: 600 }}>{sig.pair}</span>
            <span
              style={{
                color: sig.color,
                fontWeight: 700,
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: sig.color + '15',
              }}
            >
              {sig.action}
            </span>
            <span style={{ color: sig.color, fontWeight: 500 }}>{sig.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
