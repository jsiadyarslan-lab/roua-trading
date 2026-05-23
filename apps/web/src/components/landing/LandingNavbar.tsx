'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, LogIn, UserPlus, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher'

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useTranslations('landing.navbar')
  const tc = useTranslations('common')

  const NAV_ITEMS = [
    { label: t('features'), href: '#features' },
    { label: t('ai'), href: '#ai-models' },
    { label: t('liveMarket'), href: '#live-market' },
    { label: t('testimonials'), href: '#testimonials' },
  ]

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-[100] transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(6, 9, 15, 0.92)' : 'rgba(6, 9, 15, 0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: scrolled ? '1px solid rgba(148, 163, 184, 0.08)' : '1px solid transparent',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #059669, #10B981)',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)',
              }}
            >
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-xl font-bold"
                style={{
                  fontFamily: 'var(--font-ar)',
                  background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {tc('brand')}
              </span>
              <span
                className="text-[8px] font-semibold tracking-[0.3em] opacity-40"
                style={{ color: '#94A3B8', fontFamily: 'var(--font-brand)' }}
              >
                {tc('brandSub')}
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="px-3 py-1.5 rounded-lg text-sm transition-all duration-200 hover:bg-white/5"
                style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#E2E8F0'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94A3B8'
                }}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center gap-2.5">
            <LocaleSwitcher variant="navbar" />
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-sm font-medium rounded-lg"
                style={{ color: '#94A3B8' }}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span style={{ fontFamily: 'var(--font-ar)' }}>{t('login')}</span>
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="sm"
                className="gap-2 text-sm font-bold rounded-lg"
                style={{
                  background: 'linear-gradient(135deg, #059669, #10B981)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)',
                }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span style={{ fontFamily: 'var(--font-ar)' }}>{t('startFree')}</span>
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ color: '#94A3B8' }}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden"
            style={{
              background: 'rgba(6, 9, 15, 0.98)',
              borderTop: '1px solid rgba(148, 163, 184, 0.08)',
            }}
          >
            <div className="px-4 py-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-white/5"
                  style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-3 space-y-2" style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
                <div className="flex justify-center">
                  <LocaleSwitcher variant="navbar" />
                </div>
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <Button
                    variant="ghost"
                    className="w-full justify-center gap-2 rounded-lg"
                    style={{ color: '#94A3B8' }}
                  >
                    <LogIn className="w-4 h-4" />
                    <span style={{ fontFamily: 'var(--font-ar)' }}>{t('login')}</span>
                  </Button>
                </Link>
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <Button
                    className="w-full justify-center gap-2 rounded-lg font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #059669, #10B981)',
                      color: '#fff',
                      border: 'none',
                    }}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span style={{ fontFamily: 'var(--font-ar)' }}>{t('startFree')}</span>
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
