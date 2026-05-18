'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Mobile Error Boundary
 * Arabic recovery UI with error message and retry button.
 */
export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const message = error?.message || 'حدث خطأ غير متوقع'

  return (
    <div className="m-page" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      textAlign: 'center',
      gap: 20,
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 20,
        background: 'rgba(255,71,87,0.08)',
        border: '1px solid rgba(255,71,87,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <AlertTriangle size={28} color="#FF4757" />
      </div>

      <div>
        <div style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#F0F2F5',
          fontFamily: "'Cairo', sans-serif",
          marginBottom: 6,
        }}>
          حدث خطأ
        </div>
        <div style={{
          fontSize: 13,
          color: '#8B92A8',
          fontFamily: "'Cairo', sans-serif",
          maxWidth: 280,
          lineHeight: 1.6,
        }}>
          {message}
        </div>
      </div>

      {error?.digest && (
        <div style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          color: 'rgba(255,255,255,0.2)',
          direction: 'ltr',
        }}>
          Digest: {error.digest}
        </div>
      )}

      <button
        onClick={reset}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 24px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #00D4FF, #00A8CC)',
          border: 'none',
          color: '#000',
          fontSize: 13,
          fontWeight: 800,
          fontFamily: "'Cairo', sans-serif",
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        <RefreshCw size={14} />
        إعادة المحاولة
      </button>
    </div>
  )
}
