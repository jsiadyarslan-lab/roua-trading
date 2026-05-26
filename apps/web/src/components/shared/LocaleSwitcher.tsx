'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe2, Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '@/lib/portal-root';

interface LocaleSwitcherProps {
  variant?: 'default' | 'navbar' | 'header';
  className?: string;
}

const LOCALE_OPTIONS = [
  { code: 'ar', label: 'العربية', shortLabel: 'عربي' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'fr', label: 'Français', shortLabel: 'FR' },
  { code: 'tr', label: 'Türkçe', shortLabel: 'TR' },
] as const;

export function LocaleSwitcher({ variant = 'default', className = '' }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right?: number; left?: number }>({ top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate menu position based on button position
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const isRtl = document.documentElement.dir === 'rtl' || locale === 'ar';
    if (isRtl) {
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    } else {
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, [locale]);

  // Update position when opening
  useEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      // Close on scroll
      window.addEventListener('scroll', handler, true);
    }
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const switchLocale = (newLocale: string) => {
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

  // Dropdown menu rendered via Portal to body — escapes overflow:hidden parents
  const dropdownMenu = typeof window !== 'undefined' && open
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            ...(menuPos.right !== undefined ? { right: menuPos.right } : {}),
            ...(menuPos.left !== undefined ? { left: menuPos.left } : {}),
            minWidth: 160,
            background: '#1A1D27',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '4px 0',
            zIndex: 99999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.06)',
            opacity: 1,
            transform: 'translateY(0)',
            animation: 'localeMenuIn 0.15s ease-out',
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
                padding: '9px 14px',
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
        </div>,
        getPortalRoot()
      )
    : null;

  // Navbar variant (landing page)
  if (variant === 'navbar') {
    return (
      <>
        <button
          ref={buttonRef}
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
          aria-expanded={open}
        >
          <Globe2 size={14} />
          {currentOption.shortLabel}
          <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        </button>
        {dropdownMenu}
      </>
    );
  }

  // Header variant (dashboard)
  if (variant === 'header') {
    return (
      <>
        <button
          ref={buttonRef}
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
          aria-expanded={open}
        >
          <Globe2 size={12} />
          {currentOption.shortLabel}
          <ChevronDown size={10} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        </button>
        {dropdownMenu}
      </>
    );
  }

  // Default variant
  return (
    <>
      <button
        ref={buttonRef}
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
        aria-expanded={open}
      >
        <Globe2 size={14} />
        {currentOption.label}
        <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </button>
      {dropdownMenu}
    </>
  );
}
