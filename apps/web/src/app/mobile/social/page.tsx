'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ChevronLeft, Users, Trophy, Copy, TrendingUp, TrendingDown,
  Crown, Star, ArrowUpRight, ArrowDownRight, Activity,
  Heart, MessageCircle, Eye, CheckCircle, Loader2, Zap
} from 'lucide-react'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}

/* ─── Leaderboard Data ─── */
const LEADERS = [
  { rank: 1, name: 'أحمد التركي', profit: '+142.5%', winRate: 84, trades: 520, avatar: 'أ', color: c.amber },
  { rank: 2, name: 'سارة الخالدي', profit: '+98.3%', winRate: 79, trades: 380, avatar: 'س', color: '#C0C0C0' },
  { rank: 3, name: 'محمد العتيبي', profit: '+76.1%', winRate: 72, trades: 610, avatar: 'م', color: '#CD7F32' },
  { rank: 4, name: 'نورة السعيد', profit: '+54.8%', winRate: 68, trades: 290, avatar: 'ن', color: c.accent },
  { rank: 5, name: 'خالد الشمري', profit: '+42.2%', winRate: 65, trades: 440, avatar: 'خ', color: c.accent },
]

/* ─── Feed Data ─── */
const FEED = [
  { user: 'أحمد التركي', action: 'buy', pair: 'BTC/USD', amount: '0.5 BTC', price: '$94,250', time: 'منذ 5 دقائق', pnl: '+2.4%' },
  { user: 'سارة الخالدي', action: 'sell', pair: 'ETH/USD', amount: '10 ETH', price: '$3,420', time: 'منذ 12 دقيقة', pnl: '+1.8%' },
  { user: 'محمد العتيبي', action: 'buy', pair: 'SOL/USD', amount: '100 SOL', price: '$178.50', time: 'منذ 25 دقيقة', pnl: '-0.6%' },
  { user: 'نورة السعيد', action: 'sell', pair: 'GOLD', amount: '5 أونصة', price: '$2,340', time: 'منذ ساعة', pnl: '+3.1%' },
  { user: 'خالد الشمري', action: 'buy', pair: 'AAPL', amount: '50 سهم', price: '$189.20', time: 'منذ ساعتين', pnl: '+0.9%' },
]

/* ─── iOS Card ─── */
function IOSCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        background: highlight
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)'
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: 20,
        margin: '0 20px 16px',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
      }}
    >
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
          zIndex: 10,
        }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Leaderboard Item ─── */
function LeaderItem({ leader }: { leader: typeof LEADERS[0] }) {
  const isTop3 = leader.rank <= 3
  const rankColors = { 1: c.amber, 2: '#C0C0C0', 3: '#CD7F32' }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 0', borderBottom: `0.5px solid ${c.border}`,
    }}>
      {/* Rank */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: isTop3 ? `${rankColors[leader.rank as 1|2|3]}20` : 'rgba(255,255,255,0.04)',
        border: isTop3 ? `1px solid ${rankColors[leader.rank as 1|2|3]}40` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 900, color: isTop3 ? rankColors[leader.rank as 1|2|3] : c.text2,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {leader.rank === 1 ? <Crown size={14} color={c.amber} /> : leader.rank}
      </div>

      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: `${leader.color}15`, border: `0.5px solid ${leader.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 800, color: leader.color,
        fontFamily: "'Cairo', sans-serif",
      }}>
        {leader.avatar}
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{leader.name}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
          <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>فوز {leader.winRate}%</span>
          <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{leader.trades} صفقة</span>
        </div>
      </div>

      {/* Profit */}
      <div style={{
        padding: '4px 10px', borderRadius: 10,
        background: `${c.success}15`, border: `0.5px solid ${c.success}25`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: c.success, fontFamily: "'JetBrains Mono', monospace" }}>{leader.profit}</span>
      </div>
    </div>
  )
}

/* ─── Feed Item ─── */
function FeedItem({ item }: { item: typeof FEED[0] }) {
  const isBuy = item.action === 'buy'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 0', borderBottom: `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 14,
        background: isBuy ? `${c.success}15` : `${c.danger}15`,
        border: `0.5px solid ${isBuy ? `${c.success}25` : `${c.danger}25`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isBuy ? <ArrowUpRight size={18} color={c.success} /> : <ArrowDownRight size={18} color={c.danger} />}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{item.user}</span>
          <span style={{ fontSize: 11, color: isBuy ? c.success : c.danger, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            {isBuy ? 'شراء' : 'بيع'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.pair}</span>
          <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{item.amount}</span>
        </div>
      </div>

      <div style={{ textAlign: 'start' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.price}</p>
        <p style={{ fontSize: 10, color: item.pnl.startsWith('+') ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{item.pnl}</p>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function SocialPage() {
  const router = useRouter()
  const [copying, setCopying] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = (name: string) => {
    setCopying(name)
    setTimeout(() => {
      setCopying(null)
      setCopied(name)
      setTimeout(() => setCopied(null), 2000)
    }, 1200)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>التداول الاجتماعي</h1>
      </div>

      {/* ── Community Stats ── */}
      <div style={{ display: 'flex', gap: 10, margin: '0 20px 16px' }}>
        {[
          { label: 'المتداولون', value: '12.4K', color: c.accent },
          { label: 'الصفقات المنسوخة', value: '8,240', color: c.success },
          { label: 'متوسط الربح', value: '+34%', color: c.amber },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1, padding: '12px 8px', borderRadius: 16,
            background: 'rgba(28,28,30,0.65)', border: `0.5px solid ${c.border}`,
            backdropFilter: 'blur(40px)', textAlign: 'center',
          }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: stat.color, fontFamily: "'JetBrains Mono', monospace" }}>{stat.value}</p>
            <p style={{ fontSize: 9, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 3 }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Leaderboard Mini ── */}
      <div style={{ padding: '0 20px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>أفضل المتداولين</h2>
        <Trophy size={16} color={c.amber} />
      </div>

      <IOSCard>
        {LEADERS.map((leader, i) => (
          <LeaderItem key={i} leader={leader} />
        ))}
      </IOSCard>

      {/* ── Copy Trading ── */}
      <div style={{ padding: '0 20px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>نسخ الصفقات</h2>
        <Copy size={16} color={c.accent} />
      </div>

      {LEADERS.slice(0, 3).map((leader, i) => (
        <IOSCard key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: `${leader.color}15`, border: `0.5px solid ${leader.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: leader.color,
            }}>
              {leader.avatar}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{leader.name}</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: c.success, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{leader.profit}</span>
                <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>فوز {leader.winRate}%</span>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleCopy(leader.name)}
              style={{
                padding: '8px 16px', borderRadius: 14,
                background: copied === leader.name ? `${c.success}15` : `${c.accent}15`,
                border: `0.5px solid ${copied === leader.name ? `${c.success}30` : `${c.accent}30`}`,
                color: copied === leader.name ? c.success : c.accent,
                fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {copying === leader.name ? (
                <><Loader2 size={14} className="animate-spin" /></>
              ) : copied === leader.name ? (
                <><CheckCircle size={14} /> تم</>
              ) : (
                <><Copy size={14} /> انسخ</>
              )}
            </motion.button>
          </div>
        </IOSCard>
      ))}

      {/* ── Recent Trades Feed ── */}
      <div style={{ padding: '0 20px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>آخر الصفقات</h2>
        <Activity size={16} color={c.text2} />
      </div>

      <IOSCard>
        {FEED.map((item, i) => (
          <FeedItem key={i} item={item} />
        ))}
      </IOSCard>

    </div>
  )
}
