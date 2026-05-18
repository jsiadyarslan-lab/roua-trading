'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight, Store, Star, Users, TrendingUp, Bot,
  FlaskConical, BarChart3, CheckCircle, Loader2,
  ShoppingCart, Zap, Shield, Eye,
} from 'lucide-react'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Types ─── */
type CategoryFilter = 'استراتيجيات' | 'بوتات' | 'مؤشرات'

interface MarketplaceItem {
  id: string
  name: string
  description: string
  category: CategoryFilter
  price: number
  priceLabel: string
  rating: number
  reviews: number
  author: string
  authorAvatar: string
  subscribers: number
  returnPct: number
  winRate: number
  icon: string
  color: string
  isFeatured?: boolean
}

interface MarketplaceResponse {
  items: MarketplaceItem[]
  stats: {
    totalItems: number
    totalSubscribers: number
    avgRating: number
  }
}

/* ─── Category Tab Config ─── */
const categoryTabs: { key: CategoryFilter; icon: typeof FlaskConical }[] = [
  { key: 'استراتيجيات', icon: FlaskConical },
  { key: 'بوتات', icon: Bot },
  { key: 'مؤشرات', icon: BarChart3 },
]

/* ─── Rating Stars ─── */
function RatingStars({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={10}
          color={i <= Math.round(rating) ? c.amber : 'rgba(255,255,255,0.1)'}
          fill={i <= Math.round(rating) ? c.amber : 'none'}
        />
      ))}
    </div>
  )
}

/* ─── Main Page ─── */
export default function MobileMarketplacePage() {
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('استراتيجيات')
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())

  /* ─── API Data State ─── */
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [stats, setStats] = useState<{ totalItems: number; totalSubscribers: number; avgRating: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ─── Fetch marketplace data ─── */
  const fetchMarketplace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/marketplace')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MarketplaceResponse = await res.json()
      setItems(data.items ?? [])
      setStats(data.stats ?? null)
    } catch (err) {
      setItems([])
      setStats(null)
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMarketplace() }, [fetchMarketplace])

  const filteredItems = items.filter(item => item.category === categoryFilter)

  const handleSubscribe = (itemId: string) => {
    setSubscribing(itemId)
    setTimeout(() => {
      setSubscribing(null)
      setSubscribed(prev => new Set(prev).add(itemId))
    }, 1200)
  }

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>

      {/* ══════════════ Sticky Header ══════════════ */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 12px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ color: c.accent, display: 'flex' }}><Store size={20} /></div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: c.text, fontFamily: FONT_AR }}>المتجر</h1>
          </div>
        </div>

        {/* Category Filter */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {categoryTabs.map(tab => (
            <button key={tab.key} onClick={() => setCategoryFilter(tab.key)} style={{
              padding: '7px 12px', borderRadius: 8, whiteSpace: 'nowrap',
              background: categoryFilter === tab.key ? `${c.accent}15` : 'transparent',
              border: `0.5px solid ${categoryFilter === tab.key ? `${c.accent}40` : c.border}`,
              color: categoryFilter === tab.key ? c.accent : c.text2,
              fontSize: 11, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <tab.icon size={12} /> {tab.key}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>

        {/* ──── Stats Bar ──── */}
        {!loading && stats && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'المنتجات', value: String(stats.totalItems), color: c.accent, icon: Store },
              { label: 'المشتركون', value: String(stats.totalSubscribers), color: c.success, icon: Users },
              { label: 'التقييم', value: stats.avgRating.toFixed(1), color: c.amber, icon: Star },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 16,
                  background: 'rgba(28,28,30,0.65)', border: `0.5px solid ${c.border}`,
                  backdropFilter: 'blur(40px)', textAlign: 'center',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                  <stat.icon size={14} color={stat.color} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 900, color: stat.color, fontFamily: FONT_MONO }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: c.text2, fontFamily: FONT_AR, marginTop: 3 }}>{stat.label}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* ──── Loading State ──── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${c.border}`, borderTopColor: c.accent }} />
            <div style={{ fontSize: 13, color: c.text2, fontFamily: FONT_AR }}>جاري تحميل المتجر…</div>
          </div>
        )}

        {/* ──── Empty State ──── */}
        {!loading && filteredItems.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: `${c.accent}10`, border: `0.5px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={28} color={c.text3} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: c.text, fontFamily: FONT_AR }}>لا توجد منتجات حالياً</div>
            <div style={{ fontSize: 12, color: c.text2, fontFamily: FONT_AR, textAlign: 'center', lineHeight: 1.6 }}>
              لم يتم العثور على منتجات في هذه الفئة. جرّب فئة أخرى أو حاول لاحقاً.
            </div>
            {error && (
              <div style={{ fontSize: 10, color: c.danger, fontFamily: FONT_MONO, padding: '4px 10px', borderRadius: 8, background: `${c.danger}10`, border: `0.5px solid ${c.danger}20` }}>
                {error}
              </div>
            )}
            <motion.button whileTap={{ scale: 0.95 }} onClick={fetchMarketplace} style={{
              padding: '10px 20px', borderRadius: 12, fontSize: 12, fontWeight: 800,
              fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: `${c.accent}15`, border: `0.5px solid ${c.accent}30`, color: c.accent,
            }}>
              <Zap size={14} /> إعادة المحاولة
            </motion.button>
          </div>
        )}

        {/* ──── Marketplace Items ──── */}
        {!loading && filteredItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredItems.map((item, idx) => {
              const isSubscribed = subscribed.has(item.id)
              const isSubscribing = subscribing === item.id
              const returnColor = item.returnPct >= 0 ? c.success : c.danger

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  style={{
                    padding: 16, borderRadius: 20,
                    background: item.isFeatured
                      ? `linear-gradient(165deg, ${item.color}08, rgba(28,28,30,0.6))`
                      : 'rgba(28,28,30,0.5)',
                    border: `0.5px solid ${item.isFeatured ? `${item.color}25` : c.border}`,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: item.isFeatured
                      ? `0 8px 24px rgba(0,0,0,0.4), 0 0 20px ${item.color}08`
                      : '0 4px 16px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Featured glow line */}
                  {item.isFeatured && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                      background: `linear-gradient(90deg, transparent, ${item.color}66, transparent)`,
                      zIndex: 10,
                    }} />
                  )}

                  {/* Top Row: Icon + Info + Subscribe */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Icon */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 16, flexShrink: 0,
                      background: `${item.color}15`, border: `0.5px solid ${item.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, boxShadow: `0 4px 12px ${item.color}15`,
                    }}>
                      {item.icon}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: FONT_AR }}>{item.name}</span>
                        {item.isFeatured && (
                          <span style={{
                            fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 6,
                            background: `${c.amber}18`, color: c.amber,
                            border: `0.5px solid ${c.amber}30`, fontFamily: FONT_AR,
                          }}>
                            مميز
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: c.text2, fontFamily: FONT_AR, lineHeight: 1.5, marginBottom: 6 }}>
                        {item.description}
                      </p>

                      {/* Rating + Reviews */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RatingStars rating={item.rating} />
                        <span style={{ fontSize: 10, color: c.amber, fontFamily: FONT_MONO, fontWeight: 700 }}>{item.rating.toFixed(1)}</span>
                        <span style={{ fontSize: 9, color: c.text3, fontFamily: FONT_AR }}>({item.reviews})</span>
                      </div>
                    </div>

                    {/* Subscribe Button */}
                    <motion.button
                      whileTap={{ scale: 0.93 }}
                      onClick={() => !isSubscribed && !isSubscribing && handleSubscribe(item.id)}
                      disabled={isSubscribed || isSubscribing}
                      style={{
                        padding: '8px 14px', borderRadius: 14, flexShrink: 0,
                        background: isSubscribed
                          ? `${c.success}15`
                          : isSubscribing
                            ? `${c.accent}12`
                            : `${c.accent}15`,
                        border: `0.5px solid ${isSubscribed ? `${c.success}30` : `${c.accent}30`}`,
                        color: isSubscribed ? c.success : c.accent,
                        fontSize: 11, fontWeight: 800, fontFamily: FONT_AR,
                        cursor: isSubscribed || isSubscribing ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {isSubscribing ? (
                        <><Loader2 size={12} className="animate-spin" /></>
                      ) : isSubscribed ? (
                        <><CheckCircle size={12} /> مشترك</>
                      ) : (
                        <><ShoppingCart size={12} /> اشترك</>
                      )}
                    </motion.button>
                  </div>

                  {/* Bottom Row: Stats */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginTop: 12,
                    paddingTop: 12, borderTop: `0.5px solid ${c.border}`,
                  }}>
                    {/* Author */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: `${item.color}15`, border: `0.5px solid ${item.color}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: item.color, fontFamily: FONT_AR,
                      }}>
                        {item.authorAvatar}
                      </div>
                      <span style={{ fontSize: 10, color: c.text2, fontFamily: FONT_AR, fontWeight: 700 }}>{item.author}</span>
                    </div>

                    {/* Separator */}
                    <div style={{ width: 1, height: 14, background: c.border }} />

                    {/* Subscribers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Users size={10} color={c.text3} />
                      <span style={{ fontSize: 10, color: c.text2, fontFamily: FONT_MONO }}>{item.subscribers}</span>
                    </div>

                    {/* Separator */}
                    <div style={{ width: 1, height: 14, background: c.border }} />

                    {/* Return */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <TrendingUp size={10} color={returnColor} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: returnColor, fontFamily: FONT_MONO }}>
                        {item.returnPct >= 0 ? '+' : ''}{item.returnPct.toFixed(1)}%
                      </span>
                    </div>

                    {/* Separator */}
                    <div style={{ width: 1, height: 14, background: c.border }} />

                    {/* Win Rate */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Shield size={10} color={c.text3} />
                      <span style={{ fontSize: 10, color: c.text2, fontFamily: FONT_MONO }}>فوز {item.winRate}%</span>
                    </div>

                    {/* Price - aligned to start (right in RTL) */}
                    <div style={{ marginInlineStart: 'auto' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 900, color: c.text, fontFamily: FONT_MONO,
                        padding: '3px 10px', borderRadius: 10,
                        background: `${c.accent}10`, border: `0.5px solid ${c.accent}20`,
                      }}>
                        {item.priceLabel}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* ──── Explore More CTA ──── */}
        {!loading && filteredItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{
              marginTop: 20, padding: '18px 20px', borderRadius: 20,
              background: `linear-gradient(135deg, ${c.accent}08, rgba(28,28,30,0.6))`,
              border: `0.5px solid rgba(0,212,255,0.15)`,
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}
            onClick={() => {
              const nextTab = categoryTabs[(categoryTabs.findIndex(t => t.key === categoryFilter) + 1) % categoryTabs.length]
              setCategoryFilter(nextTab.key)
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: `${c.accent}12`, border: `0.5px solid ${c.accent}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Eye size={22} color={c.accent} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: c.text, fontFamily: FONT_AR, marginBottom: 2 }}>
                استكشف المزيد
              </div>
              <div style={{ fontSize: 10, color: c.text2, fontFamily: FONT_AR }}>
                تصفح الفئات الأخرى لاكتشاف استراتيجيات وبوتات جديدة
              </div>
            </div>
            <ArrowRight size={16} color={c.accent} style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
          </motion.div>
        )}
      </div>
    </div>
  )
}
