'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0d1520', color: '#94a3b8', fontFamily: 'system-ui' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>حدث خطأ غير متوقع</h2>
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}
