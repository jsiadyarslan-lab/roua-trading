'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function CountdownBanner() {
  const [timeLeft, setTimeLeft] = useState({ hours: 4, minutes: 32, seconds: 18 });
  const t = useTranslations('landing.countdown');

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) { seconds = 59; minutes--; }
        if (minutes < 0) { minutes = 59; hours--; }
        if (hours < 0) { hours = 23; minutes = 59; seconds = 59; }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="countdown-banner fade-in">
      <div className="countdown-label">
        <div className="alert-dot" />
        <span>{t('fedEvent')}</span>
      </div>
      <div className="countdown-timer">
        <div className="countdown-unit">
          <div className="value">{pad(timeLeft.hours)}</div>
          <div className="label">{t('hours')}</div>
        </div>
        <div className="countdown-sep">:</div>
        <div className="countdown-unit">
          <div className="value">{pad(timeLeft.minutes)}</div>
          <div className="label">{t('minutes')}</div>
        </div>
        <div className="countdown-sep">:</div>
        <div className="countdown-unit">
          <div className="value">{pad(timeLeft.seconds)}</div>
          <div className="label">{t('seconds')}</div>
        </div>
      </div>
    </div>
  );
}
