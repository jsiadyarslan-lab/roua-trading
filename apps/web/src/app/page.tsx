'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LandingHero } from '@/components/landing/LandingHero'

export default function Home() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Check if session cookie exists (client-side check for faster entry)
    const hasSession = document.cookie.includes('roua_session')
    if (hasSession) {
      router.push('/dashboard')
    } else {
      setChecking(false)
    }
  }, [router])

  if (checking) {
    return (
      <div style={{
        height: '100vh', width: '100vw', background: '#0F1113',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ 
          width: 40, height: 40, border: '3px solid rgba(0,229,255,0.1)', 
          borderTopColor: '#00E5FF', borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return <LandingHero />
}
