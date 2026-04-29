'use client'

import { ExternalLink, GitBranch, Link2, MessageCircle } from 'lucide-react'

const NAV_LINKS = [
  { label: 'حول', href: '#' },
  { label: 'الميزات', href: '#features' },
  { label: 'الأسعار', href: '#' },
  { label: 'API', href: '#' },
  { label: 'الدعم', href: '#' },
]

const SOCIAL_LINKS = [
  { icon: ExternalLink, label: 'Twitter', href: '#' },
  { icon: GitBranch, label: 'Github', href: '#' },
  { icon: Link2, label: 'LinkedIn', href: '#' },
  { icon: MessageCircle, label: 'Discord', href: '#' },
]

export default function Footer() {
  return (
    <footer
      className="relative border-t"
      style={{
        borderColor: 'rgba(59, 130, 246, 0.1)',
        background: 'rgba(5, 13, 26, 0.95)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span
              className="text-3xl font-bold"
              style={{
                fontFamily: 'var(--font-ar)',
                background: 'linear-gradient(135deg, #3B82F6, #10B981)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              رؤى
            </span>
            <span
              className="text-sm font-semibold tracking-[0.25em] mt-1"
              style={{ color: '#64748B', fontFamily: 'var(--font-brand)' }}
            >
              ROUA
            </span>
          </div>

          {/* Nav Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm transition-colors duration-200 hover:text-white"
                style={{ color: '#94A3B8', fontFamily: 'var(--font-ar)' }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Social Icons */}
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon
              return (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: '#64748B',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59,130,246,0.1)'
                    e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'
                    e.currentTarget.style.color = '#3B82F6'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = '#64748B'
                  }}
                >
                  <Icon className="w-4 h-4" />
                </a>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div
          className="my-8 h-px"
          style={{ background: 'rgba(59, 130, 246, 0.08)' }}
        />

        {/* Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs" style={{ color: '#475569', fontFamily: 'var(--font-ar)' }}>
            © {new Date().getFullYear()} رؤى. جميع الحقوق محفوظة.
          </p>
          <p className="text-[10px] tracking-wider" style={{ color: '#334155', fontFamily: 'var(--font-brand)' }}>
            NEURAL TRADING INTELLIGENCE
          </p>
        </div>
      </div>
    </footer>
  )
}
