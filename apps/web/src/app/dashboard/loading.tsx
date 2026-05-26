'use client'

import { useTranslations } from 'next-intl'
import { useScopedStyle } from '@/hooks/useScopedStyle'

export default function Loading() {
  useScopedStyle(`@keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }`)

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: '#06090f',
      }}
    >
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{
              borderTopColor: '#10B981',
              borderRightColor: '#3B82F6',
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
          {useTranslations('common')('brand')}
        </h2>

        <p
          className="text-sm"
          style={{
            fontFamily: 'var(--font-ar)',
            color: '#64748B',
          }}
        >
          {useTranslations('dashboard')('loading')}
        </p>
      </div>

      {/* Scoped styles via useScopedStyle */}</div>
  )
}
