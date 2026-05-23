'use client';

import { useTranslations } from 'next-intl';

export default function CosmicFooter() {
  const t = useTranslations('landing.footer');
  const tc = useTranslations('common');

  return (
    <footer className="footer">
      <div className="footer-brand">{tc('brand')}</div>
      <p>{t('brandDesc')} © 2026</p>
    </footer>
  );
}
