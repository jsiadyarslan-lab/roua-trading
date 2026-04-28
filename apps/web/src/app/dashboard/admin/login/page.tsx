'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'

const COLORS = {
  bg: '#0B0E14',
  card: '#111318',
  accent: '#00E5FF',
  danger: '#FF5252',
  text: '#F0F2F5',
  muted: '#8B92A8',
  border: 'rgba(0,229,255,0.08)',
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/dashboard/admin/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (res.ok) {
        router.push('/dashboard/admin')
      } else {
        setError(data.error || 'كلمة المرور غير صحيحة')
      }
    } catch {
      setError('حدث خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      direction: 'rtl',
    }}>
      {/* Background effects */}
      <div style={{
        position: 'fixed', top: -200, right: -200,
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -200, left: -200,
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(0,229,255,0.03) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 400,
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 40,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow effect */}
        <div style={{
          position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
          width: 200, height: 120,
          background: COLORS.accent,
          filter: 'blur(80px)',
          opacity: 0.08,
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #00E5FF, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(0,229,255,0.2)',
          }}>
            <Shield size={28} color="#000" strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>لوحة الإدارة</div>
          <div style={{ fontSize: 11, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 2 }}>ADMIN PANEL</div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 8 }}>
              كلمة مرور الإدارة
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${error ? COLORS.danger + '40' : COLORS.border}`,
              transition: 'border-color 0.2s',
            }}>
              <Lock size={16} color={COLORS.muted} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="أدخل كلمة المرور..."
                disabled={loading}
                autoFocus
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: COLORS.text, fontSize: 14, fontFamily: "'Cairo', sans-serif',
                  direction: 'ltr', textAlign: 'right',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', padding: 0 }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
              background: `${COLORS.danger}10`,
              border: `1px solid ${COLORS.danger}25`,
              fontSize: 12, color: COLORS.danger,
              fontFamily: "'Cairo', sans-serif",
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              border: 'none',
              background: loading || !password.trim() ? `${COLORS.accent}30` : 'linear-gradient(135deg, #00E5FF, #0A84FF)',
              color: loading || !password.trim() ? COLORS.muted : '#000',
              fontSize: 14, fontWeight: 700,
              fontFamily: "'Cairo', sans-serif",
              cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                جارٍ التحقق...
              </>
            ) : (
              'تسجيل الدخول'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'transparent', border: 'none',
              color: COLORS.muted, fontSize: 11, fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            العودة للمنصة
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
