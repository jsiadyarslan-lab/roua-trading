'use client'

export default function MobileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>حدث خطأ</h2>
      <p style={{ fontSize: 13, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 16 }}>{error.message || 'حدث خطأ غير متوقع'}</p>
      <button onClick={reset} style={{ padding: '10px 24px', borderRadius: 10, background: '#00D4FF', color: '#000', fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>إعادة المحاولة</button>
    </div>
  )
}
