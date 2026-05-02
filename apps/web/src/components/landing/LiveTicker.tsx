'use client';

const tickerData = [
  { symbol: 'EUR/USD', change: '+0.45%', up: true },
  { symbol: 'GBP/JPY', change: '-0.12%', up: false },
  { symbol: 'BTC/USD', change: '+2.30%', up: true },
  { symbol: 'NASDAQ', change: '+1.15%', up: true },
  { symbol: 'OIL', change: '-0.80%', up: false },
  { symbol: 'GOLD', change: '+0.95%', up: true },
  { symbol: 'S&P500', change: '+0.67%', up: true },
  { symbol: 'ETH/USD', change: '-1.20%', up: false },
  { symbol: 'USD/JPY', change: '+0.33%', up: true },
  { symbol: 'AAPL', change: '+1.85%', up: true },
];

export default function LiveTicker() {
  const items = [...tickerData, ...tickerData];

  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {items.map((item, i) => (
          <div className="ticker-item" key={i}>
            <span className="dot" />
            <span className="symbol">{item.symbol}</span>
            <span className={item.up ? 'change-up' : 'change-down'}>
              {item.up ? '▲' : '▼'} {item.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
