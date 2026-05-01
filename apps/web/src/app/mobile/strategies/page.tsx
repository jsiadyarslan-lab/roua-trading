'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ChevronLeft, TrendingUp, TrendingDown, Zap, BarChart3,
  Target, Activity, Play, CheckCircle, Loader2, ArrowUpRight,
  ArrowDownRight, Clock, Flame, Grid3X3, Cpu
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

/* ─── Strategy Data ─── */
const STRATEGIES = [
  {
    id: 'scalp-ai',
    name: 'Scalp AI',
    nameAr: 'سكالب AI',
    desc: 'تداول سريع بالذكاء الاصطناعي',
    icon: Zap,
    color: c.accent,
    winRate: 78.5,
    totalTrades: 1240,
    dailyPnL: +2.34,
    active: true,
    backtest: { period: '30 يوم', return: '+18.4%', maxDD: '-3.2%', sharpe: 2.1 },
  },
  {
    id: 'swing-master',
    name: 'Swing Master',
    nameAr: 'سوينغ ماستر',
    desc: 'استراتيجية تداول متأرجح',
    icon: TrendingUp,
    color: c.success,
    winRate: 65.2,
    totalTrades: 480,
    dailyPnL: +1.12,
    active: false,
    backtest: { period: '60 يوم', return: '+12.8%', maxDD: '-5.1%', sharpe: 1.6 },
  },
  {
    id: 'dca-pro',
    name: 'DCA Pro',
    nameAr: 'DCA برو',
    desc: 'متوسط تكلفة دولار متقدم',
    icon: Target,
    color: c.amber,
    winRate: 82.1,
    totalTrades: 890,
    dailyPnL: +0.87,
    active: false,
    backtest: { period: '90 يوم', return: '+24.2%', maxDD: '-2.8%', sharpe: 2.8 },
  },
  {
    id: 'grid-bot',
    name: 'Grid Bot',
    nameAr: 'جرید بوت',
    desc: 'بوت شبكة تداول آلي',
    icon: Grid3X3,
    color: '#B388FF',
    winRate: 71.8,
    totalTrades: 3200,
    dailyPnL: -0.45,
    active: false,
    backtest: { period: '45 يوم', return: '+8.6%', maxDD: '-7.4%', sharpe: 1.2 },
  },
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

/* ─── Strategy Card ─── */
function StrategyCard({ strategy, onApply }: { strategy: typeof STRATEGIES[0]; onApply: (id: string) => void }) {
  const Icon = strategy.icon
  const isProfit = strategy.dailyPnL >= 0
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(strategy.active)

  const handleApply = () => {
    setApplying(true)
    setTimeout(() => {
      setApplying(false)
      setApplied(true)
      onApply(strategy.id)
    }, 1200)
  }

  return (
    <IOSCard highlight={applied}>
      {/* Active indicator */}
      {applied && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 10,
          background: `${c.success}15`, border: `0.5px solid ${c.success}30`,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.success, boxShadow: `0 0 8px ${c.success}` }} className="animate-pulse" />
          <span style={{ fontSize: 9, fontWeight: 800, color: c.success, fontFamily: "'Cairo', sans-serif" }}>نشط</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: `${strategy.color}15`, border: `0.5px solid ${strategy.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={24} color={strategy.color} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 900, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{strategy.nameAr}</p>
          <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{strategy.desc}</p>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${c.border}` }}>
          <p style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الفوز</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: c.success, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{strategy.winRate}%</p>
        </div>
        <div style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${c.border}` }}>
          <p style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الصفقات</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: c.text, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{strategy.totalTrades.toLocaleString()}</p>
        </div>
        <div style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${c.border}` }}>
          <p style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>P&L يومي</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: isProfit ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
            {isProfit ? '+' : ''}{strategy.dailyPnL}%
          </p>
        </div>
      </div>

      {/* Backtest Results */}
      <div style={{
        padding: '12px 14px', borderRadius: 16,
        background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <BarChart3 size={14} color={c.accent} />
          <span style={{ fontSize: 12, fontWeight: 800, color: c.accent, fontFamily: "'Cairo', sans-serif" }}>نتائج الاختبار الرجعي</span>
          <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>({strategy.backtest.period})</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>العائد</span>
            <p style={{ fontSize: 14, fontWeight: 800, color: c.success, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.backtest.return}</p>
          </div>
          <div>
            <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>أقصى خسارة</span>
            <p style={{ fontSize: 14, fontWeight: 800, color: c.danger, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.backtest.maxDD}</p>
          </div>
          <div>
            <span style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>شارب</span>
            <p style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{strategy.backtest.sharpe}</p>
          </div>
        </div>
      </div>

      {/* Apply Button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleApply}
        disabled={applying || applied}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 16,
          background: applied ? `${c.success}15` : `${strategy.color}15`,
          border: `0.5px solid ${applied ? `${c.success}30` : `${strategy.color}30`}`,
          color: applied ? c.success : strategy.color,
          fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
          cursor: (applying || applied) ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {applying ? (
          <><Loader2 size={16} className="animate-spin" /> جاري التفعيل...</>
        ) : applied ? (
          <><CheckCircle size={16} /> مفعّلة</>
        ) : (
          <><Play size={16} /> تفعيل الاستراتيجية</>
        )}
      </motion.button>
    </IOSCard>
  )
}

/* ─── Main Page ─── */
export default function StrategiesPage() {
  const router = useRouter()
  const [activeStrategies, setActiveStrategies] = useState<string[]>(['scalp-ai'])

  const handleApply = (id: string) => {
    setActiveStrategies(prev => prev.includes(id) ? prev : [...prev, id])
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(179,136,255,0.06), transparent)',
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
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>الاستراتيجيات</h1>
          <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
            {activeStrategies.length} استراتيجية نشطة من أصل {STRATEGIES.length}
          </p>
        </div>
      </div>

      {/* ── Active Summary ── */}
      <div style={{ margin: '0 20px 16px', padding: '14px 16px', borderRadius: 18, background: 'rgba(50,215,75,0.06)', border: '0.5px solid rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.success, boxShadow: `0 0 10px ${c.success}` }} className="animate-pulse" />
        <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", flex: 1 }}>
          {activeStrategies.length > 0
            ? `${activeStrategies.length === 1 ? 'استراتيجية واحدة' : activeStrategies.length + ' استراتيجيات'} تعمل حالياً`
            : 'لا توجد استراتيجيات نشطة'}
        </span>
        <Cpu size={16} color={c.success} />
      </div>

      {/* ── Strategy Cards ── */}
      {STRATEGIES.map((strategy, i) => (
        <motion.div
          key={strategy.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <StrategyCard strategy={{ ...strategy, active: activeStrategies.includes(strategy.id) }} onApply={handleApply} />
        </motion.div>
      ))}

    </div>
  )
}
