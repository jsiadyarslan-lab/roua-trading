'use client'

import { useState } from 'react'
import { Users, MessageCircle, Trophy, TrendingUp, Mail, ArrowUpRight, Sparkles, CheckCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { T } from '@/lib/unified-tokens'

const FEATURES = [
  {
    icon: Users,
    title: 'متابعة المتداولين',
    desc: 'تابع أفضل المتداولين العرب وتعلم من استراتيجياتهم. احصل على إشعارات فورية عند تنفيذ صفقاتهم.',
    color: T.cyan,
    gradient: `linear-gradient(135deg, ${T.cyan}20, ${T.blue}10)`,
    borderColor: `${T.cyan}30`,
  },
  {
    icon: Sparkles,
    title: 'مشاركة الاستراتيجيات',
    desc: 'شارك استراتيجياتك المخصصة مع المجتمع. بناء سمعة مهنية كمتداول محترف.',
    color: T.green,
    gradient: `linear-gradient(135deg, ${T.green}20, ${T.cyan}10)`,
    borderColor: `${T.green}30`,
  },
  {
    icon: Trophy,
    title: 'تصنيف الأداء',
    desc: 'لوحة صدارة تعرض أفضل المتداولين حسب العائد والمخاطر والاتساق. تنافس على المراكز الأولى.',
    color: T.amber,
    gradient: `linear-gradient(135deg, ${T.amber}20, ${T.red}10)`,
    borderColor: `${T.amber}30`,
  },
  {
    icon: MessageCircle,
    title: 'مناقشات السوق',
    desc: 'ناقش تحركات السوق في الوقت الفعلي. شارك التحليلات الفنية والأساسية مع المجتمع.',
    color: T.purple,
    gradient: `linear-gradient(135deg, ${T.purple}20, ${T.blue}10)`,
    borderColor: `${T.purple}30`,
  },
]

export default function SocialPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitted(true)
    toast({ title: 'تم التسجيل بنجاح ✅', description: `سنقوم بإشعارك عند إطلاق منصة متابعة الحسابات الاجتماعية على ${email}` })
  }

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Users size={20} color={T.cyan} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>متابعة الحسابات الاجتماعية</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.cyan}18`, color: T.cyan,
            fontFamily: "'JetBrains Mono', monospace",
          }}>COMING SOON</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          تواصل مع مجتمع المتداولين العرب، شارك التحليلات، وتعلم من الخبراء
        </p>
      </div>

      {/* Hero Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${T.bg2}, ${T.card})`,
        border: `1px solid ${T.border2}`,
        borderRadius: 20, padding: '48px 40px', textAlign: 'center', marginBottom: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background decoration */}
        <div style={{
          position: 'absolute', top: '-50%', right: '-20%', width: '60%', height: '200%',
          background: `radial-gradient(ellipse, ${T.cyan}08, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-30%', left: '-10%', width: '40%', height: '150%',
          background: `radial-gradient(ellipse, ${T.purple}08, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: `${T.cyan}15`, border: `1px solid ${T.cyan}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Users size={28} color={T.cyan} />
          </div>
          <h2 style={{ color: T.text, fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
            منصة متابعة الحسابات الاجتماعية
          </h2>
          <p style={{ color: T.text2, fontSize: 14, lineHeight: 1.8, maxWidth: 480, margin: '0 auto 24px' }}>
            أول منصة متابعة حسابات اجتماعية عربية — شارك تحليلاتك، ناقش السوق،
            وابني سمعتك كمتداول محترف.
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 20,
            background: `${T.cyan}15`, border: `1px solid ${T.cyan}40`,
            color: T.cyan, fontSize: 12, fontWeight: 700,
          }}>
            <ArrowUpRight size={13} /> قيد التطوير
          </div>
        </div>
      </div>

      {/* Feature Preview Cards */}
      <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendingUp size={16} color={T.cyan} />
        الميزات القادمة
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        {FEATURES.map((feature, i) => (
          <div key={i} style={{
            background: feature.gradient,
            border: `1px solid ${feature.borderColor}`,
            borderRadius: 16, padding: 24,
            transition: 'all 0.3s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `${feature.color}15`, border: `1px solid ${feature.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <feature.icon size={20} color={feature.color} />
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: '0 0 8px' }}>
              {feature.title}
            </h4>
            <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.7, margin: 0 }}>
              {feature.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Email Notification Signup */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 16, padding: 24,
        display: 'flex', alignItems: 'center', gap: 20,
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${T.green}15`, border: `1px solid ${T.green}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Mail size={20} color={T.green} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
            اشترك للحصول على إشعار عند الإطلاق
          </div>
          <div style={{ fontSize: 12, color: T.text2 }}>
            كن أول من يعرف عند إطلاق منصة متابعة الحسابات الاجتماعية
          </div>
        </div>

        {submitted ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: `${T.green}15`, border: `1px solid ${T.green}30`,
            color: T.green, fontSize: 13, fontWeight: 700,
          }}>
            <CheckCircle size={16} /> تم التسجيل بنجاح
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flex: '0 1 380px' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="بريدك الإلكتروني"
              required
              dir="ltr"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10,
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.text, fontSize: 13, outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 20px', borderRadius: 10,
                background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                color: '#fff', fontSize: 13, fontWeight: 800, border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: "'Cairo', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              أعلمني
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
