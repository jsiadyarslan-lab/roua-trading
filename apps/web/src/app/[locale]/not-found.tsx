'use client'

import { Link } from '@/i18n/navigation'
import { Home, ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens'

export default function LocaleNotFound() {
  const t = useTranslations('notFound')

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 50%), #06090f',
      }}
    >
      <div className="text-center max-w-md">
        {/* 404 Number */}
        <div
          className="text-[120px] sm:text-[160px] font-bold leading-none mb-2"
          style={{
            fontFamily: 'var(--font-brand)',
            background: 'linear-gradient(135deg, #10B981 0%, #3B82F6 50%, #8B5CF6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          404
        </div>

        <h1
          className="text-2xl font-bold mb-3"
          style={{
            fontFamily: 'var(--font-ar)',
            color: '#E2E8F0',
          }}
        >
          {t('title')}
        </h1>

        <p
          className="text-sm mb-8"
          style={{
            fontFamily: 'var(--font-ar)',
            color: T.text2,
          }}
        >
          {t('description')}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.25)]"
            style={{
              background: 'linear-gradient(135deg, #059669, #10B981)',
              color: '#fff',
              fontFamily: 'var(--font-ar)',
            }}
          >
            <Home className="w-4 h-4" />
            {t('dashboard')}
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 hover:bg-white/5"
            style={{
              border: '1px solid rgba(148,163,184,0.15)',
              color: '#94A3B8',
              fontFamily: 'var(--font-ar)',
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('home')}
          </Link>
        </div>
      </div>
    </div>
  )
}
