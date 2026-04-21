'use client'

import { signIn } from 'next-auth/react'
import { LogIn, Github } from 'lucide-react'

export function AuthButton() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <button
        onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
        style={{
          padding: '12px 24px',
          borderRadius: 12,
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: "'Cairo', sans-serif",
          boxShadow: '0 8px 16px rgba(10, 132, 255, 0.3)',
          transition: 'transform 0.2s, background 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <LogIn size={18} />
        دخول المنصة (Google Login)
      </button>

      <button
        style={{
          padding: '12px 24px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--foreground)',
          border: '1px solid var(--card-border)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: "'Cairo', sans-serif",
          transition: 'all 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      >
        تجربة العرض (Demo)
      </button>
    </div>
  )
}
