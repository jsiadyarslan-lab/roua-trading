'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import {
  Brain, Bot, ScanSearch, ChevronLeft, TrendingUp, TrendingDown,
  Bell, Activity, Plus, ShieldCheck
} from 'lucide-react'
import { useRouter } from 'next/navigation'

/* ─── helpers ─────────────────────────────── */
const fmt2 = (n: number) => Math.abs(n).toFixed(2)
const pct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`

/* ─── Animated News Ticker ─────────────────── */
function NewsTicker() {
  const items = [
    { text: 'البيتكوين يكسر مقاومة 70,000$', color: '#00D4FF' },
    { text: 'مخاوف تضخمية في السوق الأمريكي', color: '#FF4757' },
    { text: 'الذهب يرتفع 1.2% اليوم', color: '#FFB800' },
    { text: 'إيثيريوم يقفز 5% بعد الترقية', color: '#00D4FF' },
  ]
  const tickerRef = useRef<HTMLDivElement>(null)

  return (
    <div style={{
      overflow: 'hidden', height: 32, display: 'flex', alignItems: 'center',
      marginTop: 8, marginBottom: 8, padding: '0 16px'
    }}>
      <div style={{
        padding: '4px 12px', borderRadius: 16,
        background: 'rgba(255,255,255,0.05)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', width: '100%', overflow: 'hidden'
      }}>
        <div ref={tickerRef} style={{
          display: 'flex', gap: 32, animation: 'marquee 25s linear infinite',
          whiteSpace: 'nowrap', direction: 'ltr', width: 'max-content'
        }}>
          {[...items, ...items].map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: it.color, boxShadow: `0 0 8px ${it.color}` }} />
              <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.8)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>
                {it.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

/* ─── Currency Ticker ─────────────────────── */
function CurrencyTicker() {
  const pairs = [
    { symbol: 'BTC', pair: 'USD', price: 69420, change: 2.4 },
    { symbol: 'ETH', pair: 'USD', price: 3185, change: 4.8 },
    { symbol: 'GOLD', pair: 'OZC', price: 2345, change: 1.2 },
    { symbol: 'SOL', pair: 'USD', price: 178, change: 6.2 },
  ]
  const router = useRouter()

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }} className="scrollbar-hide">
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', width: 'max-content' }}>
        {pairs.map((p, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.96 }}
            onClick={() => router.push('/mobile/chart')}
            style={{
              background: '#1C1C1E', // iOS Dark Mode Card
              borderRadius: 20,
              padding: '14px 16px',
              textAlign: 'right',
              minWidth: 125,
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', fontSize: 10, color: 'rgba(235,235,245,0.6)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                {p.pair}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>
                {p.symbol}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
              ${p.price.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: p.change >= 0 ? '#00D4FF' : '#FF453A', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              {pct(p.change)}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/* ─── iOS Card ─────────────────────────── */
function IOSCard({ children, onClick, highlight = false }: { children: React.ReactNode, onClick?: () => void, highlight?: boolean }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      style={{
        background: highlight ? 'linear-gradient(145deg, #1C1C1E 0%, #252528 100%)' : '#1C1C1E',
        borderRadius: 24,
        padding: '20px',
        margin: '0 16px 16px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {highlight && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Main Page ─────────────────────────── */
export default function MobileHomePage() {
  const router = useRouter()
  const { isOn, setIsOn, stats } = useBotStore()
  const { trades } = usePaperTradesStore()

  const openPositions = trades.filter(t => t.source === 'bot')
  const totalAssets = 542.30
  const dailyChange = 2.4

  return (
    <div style={{ minHeight: '100vh', background: '#000000', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ padding: '60px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-3">
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(135deg, #d4af37, #FDE047)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 900, color: '#000',
            boxShadow: '0 4px 16px rgba(212,175,55,0.3)'
          }}>ر</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", letterSpacing: -0.5 }}>
              رؤى للتداول
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={12} color="#00D4FF" />
              <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.6)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>حساب احترافي (Pro)</span>
            </div>
          </div>
        </div>
        <button style={{
          width: 40, height: 40, borderRadius: '50%',
          background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', position: 'relative'
        }}>
          <Bell size={20} color="#FFFFFF" />
          <div style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: '#FF453A', border: '2px solid #1C1C1E' }} />
        </button>
      </div>

      <NewsTicker />
      <CurrencyTicker />

      {/* ── Portfolio Hero Card ── */}
      <IOSCard onClick={() => router.push('/mobile/portfolio')} highlight>
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: 13, color: 'rgba(235,235,245,0.6)', fontFamily: "'Cairo', sans-serif", fontWeight: 600, marginBottom: 4 }}>
              إجمالي الرصيد
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1 }}>
                ${totalAssets.toLocaleString('en', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div style={{ padding: '3px 6px', borderRadius: 6, background: 'rgba(0,212,255,0.15)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={12} color="#00D4FF" strokeWidth={3} />
                <span style={{ fontSize: 12, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>
                  {pct(dailyChange)}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>اليوم</span>
            </div>
          </div>
          <button style={{
            padding: '10px 14px', borderRadius: 16,
            background: '#FFFFFF', color: '#000000', border: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif"
          }}>
            <Plus size={16} strokeWidth={3} />
            إيداع
          </button>
        </div>

        {/* Mini stats */}
        <div className="flex gap-4 mt-6 pt-5" style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>الربح الكلي</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>+${fmt2(stats.profit)}</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>نسبة الفوز</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{stats.winRate}%</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>صفقات مفتوحة</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{openPositions.length}</div>
          </div>
        </div>
      </IOSCard>

      {/* ── AI Council Card ── */}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 20px 12px' }}>
        الذكاء الاصطناعي
      </h2>
      <IOSCard onClick={() => router.push('/mobile/more')}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #B388FF, #7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={20} color="#FFFFFF" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>مجلس الخبراء (AI)</p>
              <p style={{ fontSize: 11, color: '#B388FF', fontFamily: "'Cairo', sans-serif", fontWeight: 600, marginTop: 1 }}>6 نماذج نشطة الآن</p>
            </div>
          </div>
          <ChevronLeft size={18} color="rgba(235,235,245,0.3)" style={{ transform: 'rotate(180deg)' }} />
        </div>
        
        <div style={{
          padding: '12px 14px', borderRadius: 16,
          background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)',
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 8px #00D4FF' }} className="animate-pulse" />
              <span style={{ fontSize: 12, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>BTC/USD</span>
            </div>
            <span style={{ fontSize: 12, color: '#00D4FF', fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>إجماع شراء (72%)</span>
          </div>
        </div>
      </IOSCard>

      {/* ── Bot & Scanner Grid ── */}
      <div className="grid grid-cols-2 gap-4 px-4">
        {/* Bot Card */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/mobile/settings')}
          style={{ background: '#1C1C1E', borderRadius: 24, padding: 16, position: 'relative', overflow: 'hidden' }}
        >
          {isOn && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#00D4FF', boxShadow: '0 0 12px #00D4FF' }} />}
          <div className="flex items-center justify-between mb-3">
            <div style={{ width: 36, height: 36, borderRadius: 12, background: isOn ? 'rgba(0,212,255,0.15)' : 'rgba(235,235,245,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={18} color={isOn ? '#00D4FF' : 'rgba(235,235,245,0.5)'} />
            </div>
            {/* iOS Switch */}
            <div onClick={(e) => { e.stopPropagation(); setIsOn(!isOn) }} style={{ width: 44, height: 24, borderRadius: 12, background: isOn ? '#00D4FF' : 'rgba(235,235,245,0.2)', position: 'relative', cursor: 'pointer', transition: '0.3s' }}>
              <motion.div animate={{ x: isOn ? 20 : 2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>البوت الآلي</p>
          <p style={{ fontSize: 11, color: isOn ? '#00D4FF' : 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600, marginTop: 2 }}>{isOn ? 'نشط يتداول الآن' : 'متوقف'}</p>
        </motion.div>

        {/* Scanner Card */}
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/mobile/more')}
          style={{ background: '#1C1C1E', borderRadius: 24, padding: 16 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,212,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ScanSearch size={18} color="#00D4FF" />
            </div>
            <div style={{ padding: '4px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Activity size={10} color="#00D4FF" />
              <span style={{ fontSize: 10, color: '#00D4FF', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>Live</span>
            </div>
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>سكانر السوق</p>
          <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600, marginTop: 2 }}>3 فرص مكتشفة</p>
        </motion.div>
      </div>

    </div>
  )
}
