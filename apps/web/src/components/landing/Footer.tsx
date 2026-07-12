'use client'

import { ExternalLink, GitBranch, Link2, MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

const SOCIAL_LINKS = [
  { icon: ExternalLink, label: 'Twitter', href: 'https://twitter.com/rouatrading' },
  { icon: GitBranch, label: 'Github', href: 'https://github.com/jsiady-lab/roua-trading' },
  { icon: Link2, label: 'LinkedIn', href: 'https://linkedin.com/company/roua-trading' },
  { icon: MessageCircle, label: 'Discord', href: 'https://discord.gg/rouatrading' },
]

export default function Footer() {
  const t = useTranslations('landing.navbar')
  const tc = useTranslations('common')

  const NAV_LINKS = [
    { label: t('features'), href: '#features' },
    { label: t('ai'), href: '#ai-models' },
    { label: tc('login'), href: '/login' },
    { label: tc('dashboard'), href: '/dashboard' },
  ]

  return (
    <footer
      className="relative border-t"
      style={{
        borderColor: 'rgba(148, 163, 184, 0.06)',
        background: 'rgba(6, 9, 15, 0.95)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <span
              className="text-2xl font-bold"
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
              className="text-[10px] font-semibold tracking-[0.3em] mt-0.5"
              style={{ color: '#2A313C', fontFamily: 'var(--font-brand)' }}
            >
              {tc('brandSub')}
            </span>
          </div>

          {/* Nav Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-xs transition-colors duration-200 hover:text-white"
                style={{ color: '#9CA3B5', fontFamily: 'var(--font-ar)' }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Social Icons */}
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon
              return (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    color: '#6B7280',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16,185,129,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(16,185,129,0.15)'
                    e.currentTarget.style.color = '#10b981'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.color = '#6B7280'
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div
          className="my-6 h-px"
          style={{ background: 'rgba(148, 163, 184, 0.04)' }}
        />

        {/* Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px]" style={{ color: '#2A313C', fontFamily: 'var(--font-ar)' }}>
            © {new Date().getFullYear()} {tc('brand')}. {tc('allRightsReserved')}.
          </p>
          <p className="text-[9px] tracking-[0.2em]" style={{ color: '#2A313C', fontFamily: 'var(--font-brand)' }}>
            NEURAL TRADING INTELLIGENCE
          </p>
        </div>
      </div>
    </footer>
  )
}
