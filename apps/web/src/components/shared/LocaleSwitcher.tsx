'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Globe2, Check, ChevronDown, Search } from 'lucide-react';
import { isRtlLocale } from '@/lib/i18n-utils';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom'
import T from '@/lib/unified-tokens';

interface LocaleSwitcherProps {
  variant?: 'default' | 'navbar' | 'header';
  className?: string;
}

const LOCALE_OPTIONS = [
  { code: 'ar', label: 'العربية', shortLabel: 'عربي' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'fr', label: 'Français', shortLabel: 'FR' },
  { code: 'tr', label: 'Türkçe', shortLabel: 'TR' },
  { code: 'es', label: 'Español', shortLabel: 'ES' },
  { code: 'zh', label: '中文', shortLabel: '中文' },
  { code: 'ru', label: 'Русский', shortLabel: 'RU' },
  { code: 'hi', label: 'हिन्दी', shortLabel: 'HI' },
  { code: 'pt', label: 'Português', shortLabel: 'PT' },
  { code: 'de', label: 'Deutsch', shortLabel: 'DE' },
  { code: 'ja', label: '日本語', shortLabel: 'JA' },
  { code: 'ko', label: '한국어', shortLabel: '한국어' },
  { code: 'id', label: 'Bahasa Indonesia', shortLabel: 'ID' },
  { code: 'vi', label: 'Tiếng Việt', shortLabel: 'VI' },
  { code: 'th', label: 'ไทย', shortLabel: 'TH' },
  { code: 'it', label: 'Italiano', shortLabel: 'IT' },
  { code: 'pl', label: 'Polski', shortLabel: 'PL' },
  { code: 'nl', label: 'Nederlands', shortLabel: 'NL' },
  { code: 'ms', label: 'Bahasa Melayu', shortLabel: 'MS' },
  { code: 'he', label: 'עברית', shortLabel: 'עברית' },
  { code: 'sv', label: 'Svenska', shortLabel: 'SV' },
  { code: 'uk', label: 'Українська', shortLabel: 'UK' },
  { code: 'fa', label: 'فارسی', shortLabel: 'فارسی' },
  { code: 'ur', label: 'اردو', shortLabel: 'اردو' },
  { code: 'fil', label: 'Filipino', shortLabel: 'FIL' },
  { code: 'da', label: 'Dansk', shortLabel: 'DA' },
  { code: 'no', label: 'Norsk', shortLabel: 'NO' },
  { code: 'fi', label: 'Suomi', shortLabel: 'FI' },
  { code: 'cs', label: 'Čeština', shortLabel: 'CS' },
  { code: 'hu', label: 'Magyar', shortLabel: 'HU' },
  { code: 'ro', label: 'Română', shortLabel: 'RO' },
  { code: 'bn', label: 'বাংলা', shortLabel: 'বাংলা' },
] as const;

const MAX_VISIBLE_HEIGHT = 320; // max dropdown height in px

export function LocaleSwitcher({ variant = 'default', className = '' }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; right?: number; left?: number }>({ top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter languages based on search query
  const filteredOptions = LOCALE_OPTIONS.filter(opt => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      opt.code.toLowerCase().includes(q) ||
      opt.label.toLowerCase().includes(q) ||
      opt.shortLabel.toLowerCase().includes(q)
    );
  });

  // Calculate menu position based on button position
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const isRtl = document.documentElement.dir === 'rtl' || isRtlLocale(locale);
    
    // Calculate available space below the button
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    
    // If not enough space below, show above
    const showAbove = spaceBelow < MAX_VISIBLE_HEIGHT && spaceAbove > spaceBelow;
    
    if (showAbove) {
      if (isRtl) {
        setMenuPos({
          top: rect.top - MAX_VISIBLE_HEIGHT - 4,
          left: rect.left,
        });
      } else {
        setMenuPos({
          top: rect.top - MAX_VISIBLE_HEIGHT - 4,
          right: window.innerWidth - rect.right,
        });
      }
    } else {
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
    }
  }, [locale]);

  // Update position when opening
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      updatePosition();
    }
  }, [open, updatePosition]);

  // Focus search input when menu opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    // Use a generic Event handler so it works for both mousedown and scroll.
    const handler = (e: Event) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler as EventListener);
      // Close on scroll
      window.addEventListener('scroll', handler as EventListener, true);
    }
    return () => {
      document.removeEventListener('mousedown', handler as EventListener);
      window.removeEventListener('scroll', handler as EventListener, true);
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
    // Set cookie for persistence
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    // Use next-intl router.replace to switch locale in the URL path
    router.replace(pathname, { locale: newLocale });
    setOpen(false);
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
            width: 220,
            background: '#1A1D27',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 'var(--radius-lg)',
            padding: 0,
            zIndex: 99999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.06)',
            animation: 'localeMenuIn 0.15s ease-out',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Search size={13} color={T.text2} style={{ flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'ابحث عن لغة...' : 'Search language...'}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: T.text,
                fontSize: 'var(--text-sm)',
                fontFamily: "var(--font-ar)",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: T.text2,
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'var(--text-base)',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Scrollable language list */}
          <div
            style={{
              maxHeight: MAX_VISIBLE_HEIGHT - 44, // subtract search bar height
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '4px 0',
            }}
          >
            {/* Custom scrollbar styles */}
            <style>{`
              div::-webkit-scrollbar { width: 4px; }
              div::-webkit-scrollbar-track { background: transparent; }
              div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
              div::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
            `}</style>
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '16px 14px',
                  color: T.text2,
                  fontSize: 'var(--text-sm)',
                  textAlign: 'center',
                  fontFamily: "var(--font-ar)",
                }}
              >
                {isAr ? 'لا توجد نتائج' : 'No results'}
              </div>
            ) : (
              filteredOptions.map(opt => (
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
                    color: opt.code === locale ? T.info : T.text2,
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    fontFamily: opt.code === 'ar' ? "'Cairo', sans-serif" : "'Inter', sans-serif",
                    fontWeight: opt.code === locale ? 600 : 400,
                    textAlign: 'start',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (opt.code !== locale) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      e.currentTarget.style.color = T.text;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (opt.code !== locale) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = T.text2;
                    }
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ 
                      color: '#555C70', 
                      fontSize: 'var(--text-xs)', 
                      fontWeight: 600,
                      width: 22,
                      fontFamily: "var(--font-en)",
                    }}>
                      {opt.shortLabel}
                    </span>
                    <span>{opt.label}</span>
                  </span>
                  {opt.code === locale && <Check size={14} color={T.info} />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
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
            fontSize: 'var(--text-sm)',
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
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            color: T.text2,
            cursor: 'pointer',
            fontFamily: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.color = T.text2;
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
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
          color: T.text2,
          cursor: 'pointer',
          fontFamily: isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif",
          fontSize: 'var(--text-sm)',
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
