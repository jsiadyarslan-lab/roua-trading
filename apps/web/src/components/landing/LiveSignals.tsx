'use client';

import { useTranslations } from 'next-intl';

const signalsData = [
  { pair: 'EUR/USD', action: 'BUY', profit: '+1.2%', isBuy: true },
  { pair: 'BTC/USD', action: 'BUY', profit: '+3.4%', isBuy: true },
  { pair: 'GBP/JPY', action: 'SELL', profit: '+0.8%', isBuy: false },
  { pair: 'GOLD', action: 'BUY', profit: '+2.1%', isBuy: true },
  { pair: 'NASDAQ', action: 'BUY', profit: '+1.7%', isBuy: true },
  { pair: 'ETH/USD', action: 'SELL', profit: '+1.5%', isBuy: false },
  { pair: 'USD/JPY', action: 'BUY', profit: '+0.9%', isBuy: true },
  { pair: 'OIL', action: 'SELL', profit: '+2.3%', isBuy: false },
];

export default function LiveSignals() {
  const items = [...signalsData, ...signalsData];
  const t = useTranslations('landing.liveSignals');

  return (
    <div className="live-signals">
      <div style={{
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '11px',
        color: 'rgba(148, 163, 184, 0.7)',
        fontFamily: 'var(--font-ar, sans-serif)',
      }}>
        {t('disclaimer')}
      </div>
      <div className="live-signals-track">
        {items.map((sig, i) => (
          <div className="signal-item" key={i}>
            <div className="signal-star" />
            <span className="pair">{sig.pair}</span>
            <span className={`action ${sig.isBuy ? 'buy' : 'sell'}`}>{sig.action}</span>
            <span className="profit">{sig.profit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
