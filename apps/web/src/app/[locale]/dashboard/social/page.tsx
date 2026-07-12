'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Users, MessageCircle, Trophy, TrendingUp, Mail, ArrowUpRight, Sparkles, CheckCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function SocialPage() {
  const sl = useTranslations('dashboard.social')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const features = [
    {
      icon: Users,
      title: sl('featureFollowTitle'),
      desc: sl('featureFollowDesc'),
      color: '#00D4FF',
      gradient: `linear-gradient(135deg, ${'#00D4FF'}20, ${'#0A84FF'}10)`,
      borderColor: `${'#00D4FF'}30`,
    },
    {
      icon: Sparkles,
      title: sl('featureShareTitle'),
      desc: sl('featureShareDesc'),
      color: '#00FFA3',
      gradient: `linear-gradient(135deg, ${'#00FFA3'}20, ${'#00D4FF'}10)`,
      borderColor: `${'#00FFA3'}30`,
    },
    {
      icon: Trophy,
      title: sl('featureRankingTitle'),
      desc: sl('featureRankingDesc'),
      color: '#FFB800',
      gradient: `linear-gradient(135deg, ${'#FFB800'}20, ${'#FF4757'}10)`,
      borderColor: `${'#FFB800'}30`,
    },
    {
      icon: MessageCircle,
      title: sl('featureDiscussionsTitle'),
      desc: sl('featureDiscussionsDesc'),
      color: '#B388FF',
      gradient: `linear-gradient(135deg, ${'#B388FF'}20, ${'#0A84FF'}10)`,
      borderColor: `${'#B388FF'}30`,
    },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitted(true)
    toast({ title: sl('toastSignupTitle'), description: sl('toastSignupDesc', { email }) })
  }

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'inherit', fontFamily: "var(--font-ar)", height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Users size={20} color={'#00D4FF'} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#F0F2F5' }}>{sl('pageTitle')}</h1>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-2xl)',
            background: `${'#00D4FF'}18`, color: '#00D4FF',
            fontFamily: "var(--font-mono)",
          }}>COMING SOON</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#9CA3B5' }}>
          {sl('pageSubtitle')}
        </p>
      </div>

      {/* Hero Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${'#0F1117'}, ${'#151A22'})`,
        border: `1px solid ${'#3A4150'}`,
        borderRadius: 'var(--radius-2xl)', padding: '48px 40px', textAlign: 'center', marginBottom: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background decoration */}
        <div style={{
          position: 'absolute', top: '-50%', right: '-20%', width: '60%', height: '200%',
          background: `radial-gradient(ellipse, ${'#00D4FF'}08, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-30%', left: '-10%', width: '40%', height: '150%',
          background: `radial-gradient(ellipse, ${'#B388FF'}08, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-2xl)',
            background: `${'#00D4FF'}15`, border: `1px solid ${'#00D4FF'}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Users size={28} color={'#00D4FF'} />
          </div>
          <h2 style={{ color: '#F0F2F5', fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
            {sl('heroTitle')}
          </h2>
          <p style={{ color: '#9CA3B5', fontSize: 15, lineHeight: 1.8, maxWidth: 480, margin: '0 auto 24px' }}>
            {sl('heroDesc')}
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 'var(--radius-2xl)',
            background: `${'#00D4FF'}15`, border: `1px solid ${'#00D4FF'}40`,
            color: '#00D4FF', fontSize: 13, fontWeight: 700,
          }}>
            <ArrowUpRight size={13} /> {sl('inDevelopment')}
          </div>
        </div>
      </div>

      {/* Feature Preview Cards */}
      <h3 style={{ fontSize: 17, fontWeight: 800, color: '#F0F2F5', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendingUp size={16} color={'#00D4FF'} />
        {sl('upcomingFeatures')}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        {features.map((feature, i) => (
          <div key={i} style={{
            background: feature.gradient,
            border: `1px solid ${feature.borderColor}`,
            borderRadius: 'var(--radius-xl)', padding: 24,
            transition: 'all 0.3s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-lg)',
              background: `${feature.color}15`, border: `1px solid ${feature.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <feature.icon size={20} color={feature.color} />
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: '#F0F2F5', margin: '0 0 8px' }}>
              {feature.title}
            </h4>
            <p style={{ fontSize: 13, color: '#9CA3B5', lineHeight: 1.7, margin: 0 }}>
              {feature.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Email Notification Signup */}
      <div style={{
        background: '#151A22', border: `1px solid ${'#2A313C'}`,
        borderRadius: 'var(--radius-xl)', padding: 24,
        display: 'flex', alignItems: 'center', gap: 20,
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--radius-lg)',
          background: `${'#00FFA3'}15`, border: `1px solid ${'#00FFA3'}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Mail size={20} color={'#00FFA3'} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#F0F2F5', marginBottom: 4 }}>
            {sl('signupTitle')}
          </div>
          <div style={{ fontSize: 13, color: '#9CA3B5' }}>
            {sl('signupDesc')}
          </div>
        </div>

        {submitted ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 'var(--radius-lg)',
            background: `${'#00FFA3'}15`, border: `1px solid ${'#00FFA3'}30`,
            color: '#00FFA3', fontSize: 13, fontWeight: 700,
          }}>
            <CheckCircle size={16} /> {sl('registeredSuccess')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flex: '0 1 380px' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={sl('emailPlaceholder')}
              required
              dir="ltr"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-lg)',
                background: '#151A22', border: `1px solid ${'#2A313C'}`,
                color: '#F0F2F5', fontSize: 13, outline: 'none',
                fontFamily: "var(--font-mono)",
              }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 20px', borderRadius: 'var(--radius-lg)',
                background: `linear-gradient(135deg, ${'#00D4FF'}, ${'#0A84FF'})`,
                color: '#fff', fontSize: 13, fontWeight: 800, border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: "var(--font-ar)",
                transition: 'all 0.2s',
              }}
            >
              {sl('notifyBtn')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
