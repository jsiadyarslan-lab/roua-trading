'use client';

import { useState, useEffect } from 'react';

export default function CosmicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'النماذج', href: '#models' },
    { label: 'الأدوات', href: '#features' },
    { label: 'الطريقة', href: '#how' },
    { label: 'التجارب', href: '#testimonials' },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        top: '3px',
        left: 0,
        right: 0,
        zIndex: 80,
        padding: scrolled ? '12px 24px' : '20px 24px',
        background: scrolled ? 'rgba(2, 2, 10, 0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(30px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid transparent',
        transition: 'all 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <a
        href="/"
        style={{
          fontSize: '1.8rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #00d4ff, #7dd3fc, #bae6fd)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontFamily: "var(--font-noto-naskh), serif",
          textDecoration: 'none',
        }}
      >
        رؤى
      </a>

      {/* Desktop nav */}
      <div
        className="hidden md:flex"
        style={{
          alignItems: 'center',
          gap: '32px',
        }}
      >
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              transition: 'color 0.3s',
              fontFamily: "var(--font-ibm-plex), sans-serif",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#00d4ff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/login"
          className="outline-btn hidden sm:inline-flex"
          style={{
            fontSize: '0.85rem',
            padding: '10px 20px',
            textDecoration: 'none',
          }}
        >
          تسجيل الدخول
        </a>
        <a
          href="/login"
          className="glow-btn hidden sm:inline-flex"
          style={{
            fontSize: '0.85rem',
            padding: '10px 20px',
            textDecoration: 'none',
          }}
        >
          انضم الآن
        </a>
        {/* Mobile menu button */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: '#f0f9ff',
            fontSize: '1.5rem',
            cursor: 'pointer',
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'rgba(2, 2, 10, 0.95)',
            backdropFilter: 'blur(30px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{
                color: '#94a3b8',
                textDecoration: 'none',
                fontSize: '1rem',
                fontWeight: 500,
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {link.label}
            </a>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <a href="/login" className="outline-btn" style={{ textAlign: 'center', textDecoration: 'none', fontSize: '0.9rem' }}>
              تسجيل الدخول
            </a>
            <a href="/login" className="glow-btn" style={{ textAlign: 'center', textDecoration: 'none', fontSize: '0.9rem' }}>
              انضم الآن
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
