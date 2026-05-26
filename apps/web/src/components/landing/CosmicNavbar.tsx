'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';

export default function CosmicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const t = useTranslations('landing.navbar');
  const tc = useTranslations('common');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`nav ${scrolled ? 'scrolled' : ''}`} id="navbar">
      <div className="nav-brand">{tc('brand')}</div>
      <div className="nav-links">
        <a href="#models">{t('models')}</a>
        <a href="#features">{t('tools')}</a>
        <a href="#how">{t('method')}</a>
        <a href="#testimonials">{t('experiences')}</a>
      </div>
      <div className="nav-buttons">
        <LocaleSwitcher variant="navbar" />
        <a href="/login" className="btn btn-outline">{t('login')}</a>
        <a href="/login" className="btn btn-primary">{tc('signup')}</a>
      </div>
    </nav>
  );
}
