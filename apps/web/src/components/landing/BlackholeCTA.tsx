'use client';

import { useTranslations } from 'next-intl';

export default function BlackholeCTA() {
  const t = useTranslations('landing.cta');
  const tc = useTranslations('common');

  return (
    <section className="blackhole-section" id="join">
      <div className="blackhole-wrapper">
        <div className="accretion-disk" />
        <div className="accretion-inner" />
        <div className="event-horizon" />
        <div className="cta-text">
          <h2>{t('joinUniverse')}</h2>
          <span>{t('startLinking')}</span>
        </div>
      </div>
      <div className="blackhole-caption">
        <h2>{t('titlePart1')}<br /><span className="highlight">{t('titleHighlight')}</span></h2>
        <p>{t('joinCaption')}</p>
        <a href="/login" className="btn btn-glow" style={{ fontSize: '1.15rem', padding: '1.1rem 3.5rem' }}>
          🚀 {t('joinFree')}
        </a>
        <p className="note">{t('noCreditCard')}</p>
      </div>
    </section>
  );
}
