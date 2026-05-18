'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Store, Star, Download, TrendingUp, Shield, Users, Zap, FlaskConical, BarChart3, Activity, DollarSign, Tag } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

type MarketplaceTab = 'strategies' | 'bots' | 'signals'

interface MarketplaceItem {
  id: string
  type: 'strategy' | 'bot' | 'signal'
  name: string
  nameAr: string
  desc: string
  author: string
  price: number // 0 = free
  rating: number
  downloads: number
  winRate: number
  profitPct: number
  maxDrawdown: number
  color: string
  icon: any
  tags: string[]
  installed: boolean
}

const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  { id: '1', type: 'strategy', name: 'Adaptive AI', nameAr: 'تكيفي ذكي', desc: 'استراتيجية تكيفية تستخدم الذكاء الاصطناعي لتحديد أفضل نقاط الدخول والخروج حسب ظروف السوق', author: 'فريق رؤى', price: 0, rating: 4.8, downloads: 3420, winRate: 62, profitPct: 84, maxDrawdown: 8, color: '#A259FF', icon: Zap, tags: ['AI', 'تكيفي'], installed: true },
  { id: '2', type: 'strategy', name: 'Gold Scalper', nameAr: 'سكالبر الذهب', desc: 'استراتيجية سكالبينغ متخصصة في تداول الذهب تستغل التذبذب القصير الأمد', author: 'أحمد الشمري', price: 29, rating: 4.6, downloads: 1890, winRate: 68, profitPct: 57, maxDrawdown: 5, color: C.amber, icon: TrendingUp, tags: ['ذهب', 'سكالبينغ'], installed: false },
  { id: '3', type: 'bot', name: 'Grid Master', nameAr: 'ماستر الشبكة', desc: 'منفذ ذكي متخصص في التداول الشبكي مع إدارة مخاطر متقدمة وتكيف تلقائي', author: 'فريق رؤى', price: 0, rating: 4.5, downloads: 2100, winRate: 71, profitPct: 46, maxDrawdown: 6, color: C.success, icon: BarChart3, tags: ['شبكة', 'آلي'], installed: false },
  { id: '4', type: 'signal', name: 'Crypto Pulse', nameAr: 'نبض الكريبتو', desc: 'إشارات تداول لحظية للعملات الرقمية مدعومة بتحليل فني وذكاء اصطناعي', author: 'سارة القحطاني', price: 19, rating: 4.3, downloads: 890, winRate: 58, profitPct: 32, maxDrawdown: 10, color: C.accent, icon: Activity, tags: ['كريبتو', 'إشارات'], installed: false },
  { id: '5', type: 'strategy', name: 'Swing Pro', nameAr: 'سوينغ برو', desc: 'استراتيجية سوينغ احترافية مع إدارة متقدمة للمخاطر وتتبع الاتجاه', author: 'محمد العتيبي', price: 49, rating: 4.7, downloads: 1560, winRate: 55, profitPct: 123, maxDrawdown: 12, color: '#FF6B9D', icon: FlaskConical, tags: ['سوينغ', 'احترافي'], installed: false },
  { id: '6', type: 'bot', name: 'DCA Auto', nameAr: 'متوسط تلقائي', desc: 'منفذ ذكي لمتوسط التكلفة التلقائي مع تخصيص كامل للمعلمات', author: 'فريق رؤى', price: 0, rating: 4.4, downloads: 1230, winRate: 72, profitPct: 34, maxDrawdown: 4, color: '#10B981', icon: DollarSign, tags: ['DCA', 'آمن'], installed: true },
  { id: '7', type: 'signal', name: 'Forex Alerts', nameAr: 'تنبيهات الفوركس', desc: 'تنبيهات فورية لأزواج الفوركس الرئيسية مع توصيات دخول وخروج', author: 'نورة المالكي', price: 15, rating: 4.1, downloads: 560, winRate: 54, profitPct: 28, maxDrawdown: 8, color: '#FF9F43', icon: Shield, tags: ['فوركس', 'تنبيهات'], installed: false },
  { id: '8', type: 'strategy', name: 'Mean Reversion Elite', nameAr: 'عودة النخبة', desc: 'استراتيجية عودة للمتوسط محسّنة مع فلاتر زخم متقدمة', author: 'خالد الدوسري', price: 39, rating: 4.2, downloads: 670, winRate: 64, profitPct: 68, maxDrawdown: 10, color: C.danger, icon: TrendingUp, tags: ['عودة', 'متقدم'], installed: false },
]

export default function MobileMarketplacePage() {
  const [tab, setTab] = useState<MarketplaceTab>('strategies')
  const [items, setItems] = useState(MARKETPLACE_ITEMS)
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = items.filter(item => {
    const matchesTab = tab === 'strategies' ? item.type === 'strategy' : tab === 'bots' ? item.type === 'bot' : item.type === 'signal'
    const matchesSearch = !searchQuery || item.nameAr.includes(searchQuery) || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.tags.some(t => t.includes(searchQuery))
    return matchesTab && matchesSearch
  })

  const toggleInstall = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, installed: !item.installed } : item))
  }

  const tabLabel = (t: MarketplaceTab) => t === 'strategies' ? 'استراتيجيات' : t === 'bots' ? 'منفذات' : 'إشارات'

  return (
    <div className="m-page">
      <MobilePageHeader title="المتجر" subtitle="استراتيجيات ومنفذات وإشارات" />

      {/* Search */}
      <div style={{ padding: '0 16px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}` }}>
          <Store size={16} color={C.text2} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث في المتجر..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 12, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 2 }}>
          {(['strategies', 'bots', 'signals'] as MarketplaceTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '7px 0', borderRadius: 10,
              background: tab === t ? 'rgba(0,212,255,0.12)' : 'transparent',
              border: 'none', color: tab === t ? C.accent : C.text2,
              fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}>
              {tabLabel(t)}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div style={{ padding: '0 16px' }}>
          <IOSCard>
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Store size={32} color={C.text2} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد نتائج</div>
            </div>
          </IOSCard>
        </div>
      ) : (
        filtered.map(item => {
          const Icon = item.icon
          const isFree = item.price === 0
          const pnlColor = item.profitPct >= 0 ? C.success : C.danger

          return (
            <div key={item.id} style={{ padding: '0 16px', marginBottom: 8 }}>
              <IOSCard>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${item.color}15`, border: `1px solid ${item.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={22} color={item.color} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{item.nameAr}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{item.name}</span>
                    </div>
                    <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.4, marginBottom: 4 }}>{item.desc}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>بواسطة: {item.author}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Star size={10} color={C.amber} fill={C.amber} />
                        <span style={{ fontSize: 9, fontWeight: 800, color: C.amber, fontFamily: "'JetBrains Mono', monospace" }}>{item.rating}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Download size={10} color={C.text2} />
                        <span style={{ fontSize: 9, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{item.downloads}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    {isFree ? (
                      <span style={{ fontSize: 12, fontWeight: 900, color: C.success, fontFamily: "'Cairo', sans-serif" }}>مجاني</span>
                    ) : (
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>${item.price}</span>
                        <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}> /شهر</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center', padding: '5px 2px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: item.winRate >= 60 ? C.success : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.winRate}%</div>
                    <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '5px 2px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{item.profitPct >= 0 ? '+' : ''}{item.profitPct}%</div>
                    <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الربح</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '5px 2px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: item.maxDrawdown <= 10 ? C.text : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{item.maxDrawdown}%</div>
                    <div style={{ fontSize: 7, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>تراجع</div>
                  </div>
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {item.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 8, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: `${item.color}08`, color: item.color, border: `0.5px solid ${item.color}18`, fontFamily: "'Cairo', sans-serif" }}>
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Install Button */}
                <button onClick={() => toggleInstall(item.id)} style={{
                  width: '100%', padding: '8px 0', borderRadius: 8,
                  background: item.installed ? `${item.color}12` : item.color,
                  border: item.installed ? `0.5px solid ${item.color}25` : 'none',
                  color: item.installed ? item.color : '#000',
                  fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  {item.installed ? <span>مثبّت ✓</span> : <><Download size={12} /> تثبيت {isFree ? 'مجاناً' : `$${item.price}/شهر`}</>}
                </button>
              </IOSCard>
            </div>
          )
        })
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
