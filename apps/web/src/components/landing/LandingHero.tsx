'use client'

import { AuthButton } from '@/components/auth/AuthButton'
import { Sparkles, Shield, Zap, BarChart3 } from 'lucide-react'

export function LandingHero() {
  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'var(--bg)',
      color: 'var(--foreground)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      padding: '0 20px'
    }}>
      {/* Background Neon Orbs */}
      <div style={{
        position: 'absolute', top: '10%', left: '5%', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(10, 132, 255, 0.15) 0%, transparent 70%)',
        filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '5%', width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(0, 229, 255, 0.1) 0%, transparent 70%)',
        filter: 'blur(80px)', zIndex: 0, pointerEvents: 'none'
      }} />

      {/* Hero Content */}
      <div style={{
        maxWidth: 1000, textAlign: 'center', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32
      }}>
        {/* Badge */}
        <div style={{
          padding: '6px 16px', borderRadius: 30, background: 'rgba(0, 229, 255, 0.08)',
          border: '1px solid rgba(0, 229, 255, 0.2)', color: 'var(--accent)',
          fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
          display: 'flex', alignItems: 'center', gap: 8, animation: 'pulse-glow 3s infinite'
        }}>
          <Sparkles size={14} />
          الجيل القادم من تداول الأصول الرقمية
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(40px, 8vw, 84px)', fontWeight: 900, lineHeight: 1.1,
          fontFamily: "'Cairo', sans-serif", margin: 0,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #A0A0A0 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>
          منصة رؤى (ROUA)<br /> 
          <span style={{ color: 'var(--primary)', WebkitTextFillColor: 'initial' }}>الذكاء الاصطناعي</span> يلتقي بالأسواق
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(16px, 2vw, 20px)', color: 'var(--muted)',
          maxWidth: 600, lineHeight: 1.6, margin: 0
        }}>
          اختبر التداول بمستوى مؤسسي مع أدوات تحليلية متقدمة، ومؤشرات تعتمد على الذكاء الاصطناعي، وسرعة تنفيذ لا تضاهى.
        </p>

        {/* Actions */}
        <AuthButton />

        {/* Features Row */}
        <div style={{
          display: 'flex', gap: 40, marginTop: 40, opacity: 0.8,
          flexWrap: 'wrap', justifyContent: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <Shield size={16} color="var(--success)" /> أمان بمستوى بنكي
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <Zap size={16} color="var(--accent)" /> تنفيذ فائق السرعة
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <BarChart3 size={16} color="var(--primary)" /> تحليلات متقدمة
          </div>
        </div>
      </div>

      {/* Bottom Grid Overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
        background: 'linear-gradient(to top, var(--bg) 0%, transparent 100%)',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)',
        backgroundSize: '40px 40px', zIndex: 1, pointerEvents: 'none',
        maskImage: 'linear-gradient(to bottom, transparent, black)'
      }} />

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
