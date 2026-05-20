'use client'

export default function MobileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="r-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#F0F2F5', fontFamily: 'var(--font-cairo)', marginBottom: 8 }}>حدث خطأ</div>
      <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 20 }}>{error.message}</div>
      <button onClick={reset} style={{ padding: '10px 24px', borderRadius: 12, background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', color: '#00D4FF', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-cairo)', cursor: 'pointer' }}>
        إعادة المحاولة
      </button>
    </div>
  )
}
