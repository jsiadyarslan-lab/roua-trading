'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import {
  Brain, Bot, ScanSearch, ChevronRight, TrendingUp, TrendingDown,
  Bell, Activity, Plus, ShieldCheck, Link2, ChevronLeft
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
  
  return (
    <div style={{
      overflow: 'hidden', height: 32, display: 'flex', alignItems: 'center',
      marginTop: 4, marginBottom: 12, padding: '0 20px'
    }}>
      <div style={{
        padding: '4px 12px', borderRadius: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.05)',
        display: 'flex', width: '100%', overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex', gap: 32, animation: 'marquee 30s linear infinite',
          whiteSpace: 'nowrap', direction: 'ltr', width: 'max-content'
        }}>
          {[...items, ...items].map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: it.color, boxShadow: `0 0 6px ${it.color}` }} />
              <span style={{ fontSize: 10, color: 'rgba(235,235,245,0.6)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>
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

/* ─── Currency Ticker (Dynamic) ───────────── */
function CurrencyTicker() {
  const quotes = useMarketStore(s => s.quotes)
  const router = useRouter()
  
  const displayPairs = ['BTC/USD', 'ETH/USD', 'GOLD', 'EUR/USD']
  
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }} className="scrollbar-hide">
      <div style={{ display: 'flex', gap: 12, padding: '0 20px', width: 'max-content' }}>
        {displayPairs.map((pair, i) => {
          const quoteKey = Object.keys(quotes).find(k => k.replace('/', '') === pair.replace('/', ''))
          const q = quoteKey ? quotes[quoteKey] : null
          const price = q ? q.price : 0
          const change = q ? q.changePercent : 0
          
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.94 }}
              onClick={() => router.push('/mobile/chart')}
              style={{
                background: 'rgba(28,28,30,0.5)',
                backdropFilter: 'blur(20px)',
                borderRadius: 22,
                padding: '16px',
                textAlign: 'right',
                minWidth: 135,
                border: '0.5px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>
                  {pair.split('/')[0]}
                </span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: change >= 0 ? '#32D74B' : '#FF453A' }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                {price ? price.toLocaleString('en', { minimumFractionDigits: price < 10 ? 4 : 2 }) : '—'}
              </div>
              <div style={{ 
                fontSize: 11, fontWeight: 700, 
                color: change >= 0 ? '#32D74B' : '#FF453A', 
                fontFamily: "'JetBrains Mono', monospace", marginTop: 4 
              }}>
                {change !== undefined ? pct(change) : '0.00%'}
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── iOS Card ─────────────────────────── */
function IOSCard({ children, onClick, highlight = false, noMargin = false }: { children: React.ReactNode, onClick?: () => void, highlight?: boolean, noMargin?: boolean }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.97 } : undefined}
      onClick={onClick}
      style={{
        background: highlight 
          ? 'linear-gradient(145deg, rgba(30,30,35,0.8) 0%, rgba(20,20,25,0.8) 100%)' 
          : 'rgba(28,28,30,0.6)',
        backdropFilter: 'blur(30px) saturate(180%)',
        borderRadius: 28,
        padding: '20px',
        margin: noMargin ? 0 : '0 20px 16px',
        cursor: onClick ? 'pointer' : 'default',
        border: '0.5px solid rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight ? '0 10px 30px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.2)',
      }}
    >
      {highlight && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.2), transparent)' }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Latest Signal Card ─── */
function LatestSignalCard() {
  const router = useRouter()
  return (
    <IOSCard onClick={() => router.push('/mobile/signals')} highlight>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div style={{ 
            padding: '4px 10px', borderRadius: 20, 
            background: 'rgba(0,212,255,0.1)', 
            color: '#00D4FF', fontSize: 10, fontWeight: 800,
            border: '0.5px solid rgba(0,212,255,0.15)'
          }}>توصية ذكية</div>
          <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>الآن</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#32D74B', boxShadow: '0 0 10px #32D74B' }} className="animate-pulse" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={{ 
            width: 48, height: 48, borderRadius: 16, 
            background: 'rgba(255,255,255,0.03)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: 24, border: '0.5px solid rgba(255,255,255,0.08)' 
          }}>₿</div>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>BTC/USDT</p>
            <p style={{ fontSize: 13, color: '#32D74B', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>شراء (BUY)</p>
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>🎯 72.4K</p>
          <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>الهدف المتوقع</p>
        </div>
      </div>
    </IOSCard>
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
    <div style={{ minHeight: '100vh', background: '#000000', direction: 'rtl', paddingBottom: 20 }}>

      {/* ── Header ── */}
      <div style={{ 
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 12px', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' 
      }}>
        <div className="flex items-center gap-4">
          <div style={{
            width: 48, height: 48, borderRadius: 16,
            background: 'linear-gradient(135deg, #d4af37, #FDE047)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 900, color: '#000',
            boxShadow: '0 8px 24px rgba(212,175,55,0.25)'
          }}>ر</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", letterSpacing: -0.5 }}>
              رؤى للتداول
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={13} color="#00D4FF" />
              <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>منصة ربط آمنة</span>
            </div>
          </div>
        </div>
        <motion.button 
          whileTap={{ scale: 0.9 }}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '0.5px solid rgba(255,255,255,0.08)', position: 'relative'
          }}
        >
          <Bell size={22} color="#FFFFFF" />
          <div style={{ position: 'absolute', top: 11, right: 11, width: 9, height: 9, borderRadius: '50%', background: '#FF453A', border: '2.5px solid #1C1C1E' }} />
        </motion.button>
      </div>

      <NewsTicker />
      <CurrencyTicker />

      {/* ── Portfolio Hero Card ── */}
      <IOSCard onClick={() => router.push('/mobile/portfolio')} highlight>
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: 13, color: 'rgba(235,235,245,0.5)', fontFamily: "'Cairo', sans-serif", fontWeight: 600, marginBottom: 4 }}>
              إجمالي الرصيد
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 38, fontWeight: 900, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1.5 }}>
                ${totalAssets.toLocaleString('en', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <div style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(50,215,75,0.1)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={12} color="#32D74B" strokeWidth={3} />
                <span style={{ fontSize: 13, color: '#32D74B', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>
                  {pct(dailyChange)}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>آخر 24 ساعة</span>
            </div>
          </div>
          <button style={{
            padding: '12px 18px', borderRadius: 20,
            background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '0.5px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
            backdropFilter: 'blur(20px)'
          }}>
            <Link2 size={18} strokeWidth={3} color="#00D4FF" />
            إربط حسابك
          </button>
        </div>

        {/* Mini stats */}
        <div className="flex gap-4 mt-8 pt-6" style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>الربح الكلي</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>+${fmt2(stats.profit)}</div>
          </div>
          <div style={{ width: 0.5, height: 24, background: 'rgba(255,255,255,0.08)', alignSelf: 'center' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>نسبة الفوز</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{stats.winRate}%</div>
          </div>
          <div style={{ width: 0.5, height: 24, background: 'rgba(255,255,255,0.08)', alignSelf: 'center' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>المراكز</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{openPositions.length}</div>
          </div>
        </div>
      </IOSCard>
      
      {/* ── Latest Signals ── */}
      <div className="flex items-center justify-between px-6 mb-4 mt-6">
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>
          إشارات السوق
        </h2>
        <button 
          onClick={() => router.push('/mobile/signals')}
          style={{ fontSize: 13, color: '#00D4FF', fontWeight: 800, fontFamily: "'Cairo', sans-serif", background: 'none', border: 'none' }}
        >
          شاهد الكل
        </button>
      </div>
      <LatestSignalCard />

      {/* ── AI Council Card ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif", margin: '24px 24px 12px' }}>
        تحليلات الذكاء الاصطناعي
      </h2>
      <IOSCard onClick={() => router.push('/mobile/ai')}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4 relative">
            <motion.div
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{
                position: 'absolute', top: -5, left: -5, right: -5, bottom: -5,
                background: 'linear-gradient(135deg, #7C3AED, #00D4FF)',
                borderRadius: 20, filter: 'blur(10px)', zIndex: 0
              }}
            />
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', zIndex: 1, border: '0.5px solid rgba(255,255,255,0.1)'
            }}>
              <Brain size={24} color="#FFFFFF" />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>مجلس الخبراء</p>
              <p style={{ fontSize: 11, color: '#A78BFA', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 1 }}>6 موديلات تفحص السوق</p>
            </div>
          </div>
          {/* RTL Forward Arrow (points LEFT) */}
          <ChevronLeft size={20} color="rgba(235,235,245,0.3)" />
        </div>
        
        <div style={{
          padding: '14px', borderRadius: 20,
          background: 'rgba(0,212,255,0.05)', border: '0.5px solid rgba(0,212,255,0.1)',
        }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00D4FF', boxShadow: '0 0 10px #00D4FF' }} className="animate-pulse" />
              <span style={{ fontSize: 13, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>BTC/USD</span>
            </div>
            <span style={{ fontSize: 13, color: '#00D4FF', fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>إجماع شراء (72%)</span>
          </div>
        </div>
      </IOSCard>

      {/* ── Bot & Scanner Grid ── */}
      <div className="grid grid-cols-2 gap-4 px-5 mb-8">
        {/* Bot Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/bot')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 20, position: 'relative', overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          {isOn && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#00D4FF', boxShadow: '0 0 15px #00D4FF' }} />}
          <div className="flex items-center justify-between mb-4">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: isOn ? 'rgba(0,212,255,0.1)' : 'rgba(235,235,245,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={22} color={isOn ? '#00D4FF' : 'rgba(235,235,245,0.3)'} />
            </div>
            {/* iOS Switch */}
            <div onClick={(e) => { e.stopPropagation(); setIsOn(!isOn) }} style={{ width: 46, height: 26, borderRadius: 13, background: isOn ? '#32D74B' : 'rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer', transition: '0.3s' }}>
              <motion.div animate={{ x: isOn ? 22 : 2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }} />
            </div>
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>البوت الآلي</p>
          <p style={{ fontSize: 11, color: isOn ? '#32D74B' : 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>{isOn ? 'نشط الآن' : 'متوقف'}</p>
        </motion.div>

        {/* Scanner Card */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push('/mobile/scanner')}
          style={{ background: '#1C1C1E', borderRadius: 28, padding: 20, border: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ScanSearch size={22} color="#FFFFFF" />
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 12, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D4FF' }} />
              <span style={{ fontSize: 10, color: '#00D4FF', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Live</span>
            </div>
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>سكانر السوق</p>
          <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.4)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginTop: 2 }}>3 فرص ذهبية</p>
        </motion.div>
      </div>

    </div>
  )
}
