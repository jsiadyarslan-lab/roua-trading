'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { FlaskConical, TrendingUp, BarChart3, DollarSign, Activity, Star, ChevronLeft, Zap } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface Strategy {
  id: string
  name: string
  nameAr: string
  desc: string
  winRate: number
  totalTrades: number
  profit: number
  profitPct: number
  maxDrawdown: number
  color: string
  icon: any
  applied: boolean
}

const STRATEGIES: Strategy[] = [
  { id: 'auto', name: 'AUTO', nameAr: 'تلقائي تكيفي', desc: 'يختار أفضل استراتيجية تلقائياً حسب ظروف السوق', winRate: 62, totalTrades: 1248, profit: 8420, profitPct: 84.2, maxDrawdown: 8, color: '#A259FF', icon: Zap, applied: false },
  { id: 'scalping', name: 'SCALPING', nameAr: 'السكالبينغ', desc: 'صفقات سريعة بأرباح صغيرة متكررة', winRate: 68, totalTrades: 3420, profit: 5680, profitPct: 56.8, maxDrawdown: 5, color: C.success, icon: Activity, applied: false },
  { id: 'swing', name: 'SWING', nameAr: 'السوينغ', desc: 'صفقات متوسطة المدى تعتمد على الاتجاه', winRate: 55, totalTrades: 486, profit: 12340, profitPct: 123.4, maxDrawdown: 12, color: C.accent, icon: TrendingUp, applied: false },
  { id: 'grid', name: 'GRID', nameAr: 'الشبكة', desc: 'أوامر شراء وبيع متدرجة في نطاق سعري', winRate: 71, totalTrades: 2100, profit: 4560, profitPct: 45.6, maxDrawdown: 6, color: C.amber, icon: BarChart3, applied: false },
  { id: 'mean-reversion', name: 'MEAN_REVERSION', nameAr: 'عودة للمتوسط', desc: 'يراهن على عودة السعر لمتوسطه التاريخي', winRate: 64, totalTrades: 892, profit: 6780, profitPct: 67.8, maxDrawdown: 10, color: '#FF6B9D', icon: FlaskConical, applied: false },
  { id: 'momentum', name: 'MOMENTUM_BREAKOUT', nameAr: 'اختراق الزخم', desc: 'يدخل عند اختراق مستويات المقاومة بحجم عالي', winRate: 48, totalTrades: 324, profit: 15890, profitPct: 158.9, maxDrawdown: 18, color: C.danger, icon: Star, applied: false },
  { id: 'dca', name: 'DCA', nameAr: 'متوسط التكلفة', desc: 'يشتري كميات أكبر عند الانخفاض لتقليل متوسط التكلفة', winRate: 72, totalTrades: 680, profit: 3420, profitPct: 34.2, maxDrawdown: 4, color: '#10B981', icon: DollarSign, applied: false },
  { id: 'vwap-rsi', name: 'VWAP_RSI', nameAr: 'VWAP + RSI', desc: 'يجمع بين VWAP ومؤشر RSI لنقاط الدخول', winRate: 59, totalTrades: 560, profit: 7230, profitPct: 72.3, maxDrawdown: 9, color: '#FF9F43', icon: BarChart3, applied: false },
]

export default function MobileStrategiesPage() {
  const router = useRouter()
  const [strategies, setStrategies] = useState(STRATEGIES)
  const [filter, setFilter] = useState<'all' | 'profitable' | 'safe'>('all')

  const filtered = strategies.filter(s => {
    if (filter === 'profitable') return s.profit > 0
    if (filter === 'safe') return s.maxDrawdown <= 10
    return true
  })

  const handleApply = (id: string) => {
    setStrategies(prev => prev.map(s => ({ ...s, applied: s.id === id ? !s.applied : s.applied })))
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="الاستراتيجيات" subtitle="اختر الاستراتيجية المناسبة" right={
        <button onClick={() => router.push('/mobile/strategies/backtest')} style={{ padding: '6px 12px', borderRadius: 8, background: C.accent, color: '#000', fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>اختبار</button>
      } />

      {/* Filter */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 2 }}>
          {([{ key: 'all' as const, label: 'الكل' }, { key: 'profitable' as const, label: 'رابحة' }, { key: 'safe' as const, label: 'آمنة' }]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{ flex: 1, padding: '6px 0', borderRadius: 10, background: filter === f.key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: filter === f.key ? C.accent : C.text2, fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Strategy Cards */}
      {filtered.map(strategy => {
        const Icon = strategy.icon
        const profitColor = strategy.profit >= 0 ? C.success : C.danger
        const riskLevel = strategy.maxDrawdown <= 5 ? 'منخفض' : strategy.maxDrawdown <= 12 ? 'متوسط' : 'عالي'
        const riskColor = strategy.maxDrawdown <= 5 ? C.success : strategy.maxDrawdown <= 12 ? C.amber : C.danger

        return (
          <div key={strategy.id} style={{ padding: '0 16px', marginBottom: 10 }}>
            <IOSCard highlight={strategy.applied}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${strategy.color}15`, border: `1px solid ${strategy.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} color={strategy.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{strategy.nameAr}</div>
                    <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{strategy.desc}</div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginBottom: 10 }}>
                <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: strategy.winRate >= 60 ? C.success : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.winRate}%</div>
                  <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
                </div>
                <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: profitColor, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.profitPct >= 0 ? '+' : ''}{strategy.profitPct}%</div>
                  <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الربح</div>
                </div>
                <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: riskColor, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.maxDrawdown}%</div>
                  <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>أقصى تراجع</div>
                </div>
                <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.totalTrades}</div>
                  <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صفقات</div>
                </div>
              </div>

              {/* Apply Button */}
              <button onClick={() => handleApply(strategy.id)} style={{
                width: '100%', padding: '8px 0', borderRadius: 10,
                background: strategy.applied ? `${strategy.color}15` : `${strategy.color}`,
                border: strategy.applied ? `0.5px solid ${strategy.color}30` : 'none',
                color: strategy.applied ? strategy.color : '#000',
                fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                cursor: 'pointer',
              }}>
                {strategy.applied ? 'مفعّلة ✓' : 'تفعيل الاستراتيجية'}
              </button>
            </IOSCard>
          </div>
        )
      })}

      <div style={{ height: 16 }} />
    </div>
  )
}
