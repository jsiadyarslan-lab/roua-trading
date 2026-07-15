'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';

export default function CosmicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations('landing.navbar');
  const tc = useTranslations('common');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const NAV_ITEMS = [
    { label: t('models'), href: '#models' },
    { label: t('tools'), href: '#features' },
    { label: t('method'), href: '#how' },
    { label: t('experiences'), href: '#testimonials' },
  ];

  return (
    <nav className={`nav ${scrolled ? 'scrolled' : ''}`} id="navbar">
      <div className="nav-brand">{tc('brand')}</div>

      {/* Desktop nav links — hidden on mobile via CSS @media (max-width: 768px) */}
      <div className="nav-links">
        {NAV_ITEMS.map((item) => (
          <a key={item.href} href={item.href}>{item.label}</a>
        ))}
      </div>

      <div className="nav-buttons">
        <LocaleSwitcher variant="navbar" />
        <a href="/login" className="btn btn-outline">{t('login')}</a>
        <a href="/login" className="btn btn-primary">{tc('signup')}</a>

        {/* Mobile hamburger — visible only under 768px via CSS */}
        <button
          type="button"
          className="nav-hamburger"
          aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="nav-hamburger-line" data-open={mobileOpen ? 'true' : 'false'} />
          <span className="nav-hamburger-line" data-open={mobileOpen ? 'true' : 'false'} />
          <span className="nav-hamburger-line" data-open={mobileOpen ? 'true' : 'false'} />
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div
          id="mobile-nav-menu"
          className="nav-mobile-menu"
          role="menu"
          aria-label="القائمة الرئيسية"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
