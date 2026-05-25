'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe2, Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface LocaleSwitcherProps {
  variant?: 'default' | 'navbar' | 'header';
  className?: string;
}

const LOCALE_OPTIONS = [
  { code: 'ar', label: 'العربية', shortLabel: 'عربي' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'fr', label: 'Français', shortLabel: 'FR' },
] as const;

export function LocaleSwitcher({ variant = 'default', className = '' }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const switchLocale = async (newLocale: string) => {
    if (newLocale === locale) {
      setOpen(false);
      return;
    }
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    setOpen(false);
    router.refresh();
  };

  const currentOption = LOCALE_OPTIONS.find(o => o.code === locale) || LOCALE_OPTIONS[0];
  const isAr = locale === 'ar';

  // Shared dropdown menu
  const dropdownMenu = (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        insetInlineEnd: 0,
        marginTop: 4,
        minWidth: 140,
        background: '#1A1D27',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '4px 0',
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-4px)',
        transition: 'opacity 0.15s, transform 0.15s',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {LOCALE_OPTIONS.map(opt => (
        <button
          key={opt.code}
          onClick={() => switchLocale(opt.code)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 14px',
            border: 'none',
            background: opt.code === locale ? 'rgba(0,212,255,0.08)' : 'transparent',
            color: opt.code === locale ? '#00D4FF' : '#8B92A8',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: opt.code === 'ar' ? "'Cairo', sans-serif" : "'Inter', sans-serif",
            fontWeight: opt.code === locale ? 600 : 400,
            textAlign: 'start',
            transition: 'all 0.1s',
          }}
          onMouseEnter={(e) => {
            if (opt.code !== locale) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = '#F0F2F5';
            }
          }}
          onMouseLeave={(e) => {
            if (opt.code !== locale) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#8B92A8';
            }
          }}
        >
          <span>{opt.label}</span>
          {opt.code === locale && <Check size={14} color="#00D4FF" />}
        </button>
      ))}
    </div>
  );

  // Navbar variant (landing page) - matches landing page styling
  if (variant === 'navbar') {
    return (
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={() => setOpen(!open)}
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
          aria-label="Switch language"
        >
          <Globe2 size={14} />
          {currentOption.shortLabel}
          <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        </button>
        {dropdownMenu}
      </div>
    );
  }

  // Header variant (dashboard) - matches AppHeader styling
  if (variant === 'header') {
    return (
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={() => setOpen(!open)}
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
          aria-label="Switch language"
        >
          <Globe2 size={12} />
          {currentOption.shortLabel}
          <ChevronDown size={10} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        </button>
        {dropdownMenu}
      </div>
    );
  }

  // Default variant
  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(!open)}
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
        aria-label="Switch language"
      >
        <Globe2 size={14} />
        {currentOption.label}
        <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </button>
      {dropdownMenu}
    </div>
  );
}
