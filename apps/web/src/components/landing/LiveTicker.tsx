'use client';

const tickerItems = [
  { pair: 'EUR/USD', change: '+0.45%', up: true },
  { pair: 'GBP/JPY', change: '-0.12%', up: false },
  { pair: 'BTC/USD', change: '+2.30%', up: true },
  { pair: 'NASDAQ', change: '+1.15%', up: true },
  { pair: 'OIL', change: '-0.80%', up: false },
  { pair: 'GOLD', change: '+0.95%', up: true },
  { pair: 'S&P500', change: '+0.67%', up: true },
  { pair: 'ETH/USD', change: '-1.20%', up: false },
  { pair: 'USD/JPY', change: '+0.33%', up: true },
  { pair: 'AAPL', change: '+1.85%', up: true },
];

export default function LiveTicker() {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 10,
        overflow: 'hidden',
        padding: '20px 0',
        borderTop: '1px solid rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        background: 'rgba(2, 2, 10, 0.5)',
      }}
    >
      <div
        className="ticker-scroll"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '28px',
          whiteSpace: 'nowrap',
          width: 'max-content',
        }}
      >
        {[...tickerItems, ...tickerItems].map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem',
              fontFamily: "var(--font-ibm-plex), sans-serif",
            }}
          >
            <span style={{ color: '#f0f9ff', fontWeight: 600 }}>{item.pair}</span>
            <span style={{ color: item.up ? '#34d399' : '#f87171', fontWeight: 600 }}>
              {item.up ? '▲' : '▼'}
            </span>
            <span style={{ color: item.up ? '#34d399' : '#f87171' }}>{item.change}</span>
            {i < tickerItems.length * 2 - 1 && (
              <span
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#00d4ff',
                  opacity: 0.4,
                  marginRight: '4px',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
