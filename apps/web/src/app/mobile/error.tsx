'use client'

import { useEffect } from 'react'

/**
 * Mobile Error Boundary — catches SSR and runtime errors
 * in the mobile layout and shows a graceful recovery UI
 * instead of the default "This page couldn't load" error.
 */
export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error for debugging
    console.error('[MobileError]', error)
  }, [error])

  return (
    <div
      style={{
        height: '100%',
        background: '#0B0E14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl',
        fontFamily: "'Cairo', sans-serif",
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', color: '#F0F2F5', maxWidth: 320 }}>
        {/* Error icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(255,59,48,0.1)',
            border: '0.5px solid rgba(255,59,48,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 24,
          }}
        >
          ⚠️
        </div>

        <p
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: '#F0F2F5',
            margin: '0 0 8px',
            lineHeight: 1.5,
          }}
        >
          حدث خطأ أثناء التحميل
        </p>

        <p
          style={{
            fontSize: 13,
            color: 'rgba(235,235,245,0.5)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          لم نتمكن من تحميل هذه الصفحة. حاول مرة أخرى.
        </p>

        <button
          onClick={reset}
          style={{
            background: 'rgba(0,212,255,0.15)',
            border: '0.5px solid rgba(0,212,255,0.35)',
            borderRadius: 12,
            color: '#00D4FF',
            padding: '10px 28px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif",
            transition: 'all 0.2s',
          }}
        >
          إعادة المحاولة
        </button>

        {error.digest && (
          <p
            style={{
              fontSize: 10,
              color: 'rgba(235,235,245,0.2)',
              marginTop: 16,
              direction: 'ltr',
            }}
          >
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
