'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe2 } from 'lucide-react';

interface LocaleSwitcherProps {
  variant?: 'default' | 'navbar' | 'header';
  className?: string;
}

export function LocaleSwitcher({ variant = 'default', className = '' }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();

  const switchLocale = async () => {
    const newLocale = locale === 'ar' ? 'en' : 'ar';
    // Set cookie with 1 year expiry, accessible across the entire site
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    // Refresh the page so the server picks up the new locale
    router.refresh();
  };

  const isAr = locale === 'ar';

  // Navbar variant (landing page) - matches landing page styling
  if (variant === 'navbar') {
    return (
      <button
        onClick={switchLocale}
        className={`btn btn-outline ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontFamily: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 600,
        }}
        aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
      >
        <Globe2 size={14} />
        {isAr ? 'EN' : 'عربي'}
      </button>
    );
  }

  // Header variant (dashboard) - matches AppHeader styling
  if (variant === 'header') {
    return (
      <button
        onClick={switchLocale}
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          color: '#8B92A8',
          cursor: 'pointer',
          fontFamily: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
          e.currentTarget.style.color = '#F0F2F5';
          e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
          e.currentTarget.style.color = '#8B92A8';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
        }}
        aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
      >
        <Globe2 size={12} />
        {isAr ? 'EN' : 'عربي'}
      </button>
    );
  }

  // Default variant
  return (
    <button
      onClick={switchLocale}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        color: '#8B92A8',
        cursor: 'pointer',
        fontFamily: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        transition: 'all 0.15s',
      }}
      aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <Globe2 size={14} />
      {isAr ? 'English' : 'العربية'}
    </button>
  );
}
