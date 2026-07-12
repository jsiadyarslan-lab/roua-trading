'use client'

import { useTranslations } from 'next-intl'
import { useScopedStyle } from '@/hooks/useScopedStyle'

export default function Loading() {
  const tc = useTranslations('common')
  const td = useTranslations('dashboard')

  useScopedStyle(`@keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }`)

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: '#0B0E14',
      }}
    >
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{
              borderTopColor: '#10b981',
              borderRightColor: '#00D4FF',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>

        {/* Brand */}
        <h2
          className="text-3xl font-bold mb-2"
          style={{
            fontFamily: 'var(--font-ar)',
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {tc('brand')}
        </h2>

        <p
          className="text-sm"
          style={{
            fontFamily: 'var(--font-ar)',
            color: '#9CA3B5',
          }}
        >
          {td('loading')}
        </p>
      </div>

      {/* Scoped styles via useScopedStyle */}</div>
  )
}
