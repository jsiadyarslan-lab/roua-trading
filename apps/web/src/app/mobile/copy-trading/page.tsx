'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { Eye, TrendingUp, TrendingDown, Users, Shield, DollarSign, Activity, AlertCircle } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface CopyTrader {
  id: string
  name: string
  avatar: string
  pnlPct: number
  winRate: number
  followers: number
  monthlyTrades: number
  strategy: string
  maxDrawdown: number
  isFollowing: boolean
  copyAmount: number
  copyRatio: number
}

const DEMO_TRADERS: CopyTrader[] = [
  { id: '1', name: 'أحمد الشمري', avatar: 'أ', pnlPct: 142.5, winRate: 72, followers: 1243, monthlyTrades: 86, strategy: 'سوينغ', maxDrawdown: 8, isFollowing: true, copyAmount: 500, copyRatio: 0.1 },
  { id: '2', name: 'سارة القحطاني', avatar: 'س', pnlPct: 98.3, winRate: 68, followers: 892, monthlyTrades: 124, strategy: 'سكالبينغ', maxDrawdown: 5, isFollowing: false, copyAmount: 0, copyRatio: 0 },
  { id: '3', name: 'محمد العتيبي', avatar: 'م', pnlPct: 76.1, winRate: 61, followers: 567, monthlyTrades: 45, strategy: 'تلقائي', maxDrawdown: 12, isFollowing: false, copyAmount: 0, copyRatio: 0 },
  { id: '4', name: 'نورة المالكي', avatar: 'ن', pnlPct: 54.8, winRate: 65, followers: 324, monthlyTrades: 68, strategy: 'شبكة', maxDrawdown: 6, isFollowing: true, copyAmount: 300, copyRatio: 0.05 },
  { id: '5', name: 'خالد الدوسري', avatar: 'خ', pnlPct: 32.1, winRate: 58, followers: 189, monthlyTrades: 23, strategy: 'عودة للمتوسط', maxDrawdown: 10, isFollowing: false, copyAmount: 0, copyRatio: 0 },
]

export default function MobileCopyTradingPage() {
  const [traders, setTraders] = useState(DEMO_TRADERS)
  const [autoCopy, setAutoCopy] = useState(true)
  const [maxCopyPerTrade, setMaxCopyPerTrade] = useState('100')
  const [stopLossCopy, setStopLossCopy] = useState(true)

  const toggleFollow = (id: string) => {
    setTraders(prev => prev.map(t => {
      if (t.id !== id) return t
      const isNowFollowing = !t.isFollowing
      return {
        ...t,
        isFollowing: isNowFollowing,
        copyAmount: isNowFollowing ? 500 : 0,
        copyRatio: isNowFollowing ? 0.1 : 0,
      }
    }))
  }

  const updateCopyAmount = (id: string, amount: number) => {
    setTraders(prev => prev.map(t => t.id === id ? { ...t, copyAmount: amount } : t))
  }

  const followingTraders = traders.filter(t => t.isFollowing)
  const totalCopyAmount = followingTraders.reduce((sum, t) => sum + t.copyAmount, 0)

  return (
    <div className="m-page">
      <MobilePageHeader title="متابعة التداول" subtitle="انسخ صفقات المتداولين المحترفين" />

      {/* Copy Settings */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${C.accent}, #0088CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Eye size={20} color="#FFF" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>المتابعة التلقائية</div>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسخ الصفقات تلقائياً</div>
            </div>
            <IOSSwitch value={autoCopy} onChange={setAutoCopy} color={C.accent} />
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div style={{ textAlign: 'center', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{followingTraders.length}</div>
              <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>متابَعين</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>${totalCopyAmount}</div>
              <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>إجمالي المتابعة</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>${maxCopyPerTrade}</div>
              <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>حد الصفقة</div>
            </div>
          </div>

          {/* Settings */}
          {autoCopy && (
            <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={12} color={C.amber} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>وقف خسارة تلقائي</span>
                </div>
                <IOSSwitch value={stopLossCopy} onChange={setStopLossCopy} color={C.amber} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>حد المبلغ لكل صفقة</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text2 }}>$</span>
                  <input type="number" value={maxCopyPerTrade} onChange={e => setMaxCopyPerTrade(e.target.value)} style={{ width: 60, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 6px', color: C.text, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr', textAlign: 'center' }} />
                </div>
              </div>
            </div>
          )}
        </IOSCard>
      </div>

      {/* Notice */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)' }}>
          <AlertCircle size={14} color={C.accent} />
          <span style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>رؤى منصة ربط — الصفقات المنسوخة تُنفّذ في حسابك لدى البورصة</span>
        </div>
      </div>

      {/* Traders List */}
      <div className="m-section">
        <div className="m-section__title">المتداولون المتاحون</div>
      </div>

      {traders.map(trader => {
        const pnlColor = trader.pnlPct >= 0 ? C.success : C.danger
        const riskColor = trader.maxDrawdown <= 5 ? C.success : trader.maxDrawdown <= 10 ? C.amber : C.danger

        return (
          <div key={trader.id} style={{ padding: '0 16px', marginBottom: 8 }}>
            <IOSCard highlight={trader.isFollowing}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: trader.isFollowing ? `${C.accent}15` : 'rgba(255,255,255,0.05)',
                  border: trader.isFollowing ? `1px solid ${C.accent}30` : `0.5px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 900, color: trader.isFollowing ? C.accent : C.text2,
                  fontFamily: "'Cairo', sans-serif", flexShrink: 0,
                }}>
                  {trader.avatar}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{trader.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{trader.strategy}</span>
                    <span style={{ fontSize: 9, color: C.text2 }}>·</span>
                    <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{trader.followers} متابع</span>
                  </div>
                </div>

                <div style={{ textAlign: 'left', direction: 'ltr' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{trader.pnlPct >= 0 ? '+' : ''}{trader.pnlPct}%</div>
                  <div style={{ fontSize: 8, color: riskColor, fontFamily: "'Cairo', sans-serif" }}>تراجع: {trader.maxDrawdown}%</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
                <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: trader.winRate >= 60 ? C.success : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{trader.winRate}%</div>
                  <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
                </div>
                <div style={{ textAlign: 'center', padding: '4px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{trader.monthlyTrades}</div>
                  <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صفقات/شهر</div>
                </div>
              </div>

              {/* Follow/Unfollow */}
              {trader.isFollowing ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>مبلغ المتابعة</div>
                    <input type="number" value={trader.copyAmount} onChange={e => updateCopyAmount(trader.id, parseFloat(e.target.value) || 0)} style={{ width: '100%', height: 30, borderRadius: 6, background: 'rgba(0,212,255,0.05)', border: '0.5px solid rgba(0,212,255,0.15)', padding: '0 8px', color: C.text, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />
                  </div>
                  <button onClick={() => toggleFollow(trader.id)} style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,71,87,0.1)', border: '0.5px solid rgba(255,71,87,0.2)', color: C.danger, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', alignSelf: 'flex-end' }}>
                    إلغاء
                  </button>
                </div>
              ) : (
                <button onClick={() => toggleFollow(trader.id)} style={{
                  width: '100%', padding: '8px 0', borderRadius: 8,
                  background: C.accent, border: 'none',
                  color: '#000', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer',
                }}>
                  متابعة ونسخ الصفقات
                </button>
              )}
            </IOSCard>
          </div>
        )
      })}

      <div style={{ height: 16 }} />
    </div>
  )
}
