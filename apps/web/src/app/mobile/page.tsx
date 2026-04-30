'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import {
  Brain, Bot, ScanSearch, ChevronLeft, TrendingUp, TrendingDown,
  Bell, Search, Wifi, WifiOff, Power,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

/* ─── helpers ─────────────────────────────── */
const fmt2 = (n: number) => Math.abs(n).toFixed(2)
const pct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`

/* ─── Animated News Ticker ─────────────────── */
function NewsTicker() {
  const items = [
    { emoji: '🟢', text: 'البيتكوين يكسر مقاومة 70,000 دولار مع تدفق الصناديق المؤسسية' },
    { emoji: '🔴', text: 'الفيدرالي يُبقي على الفائدة مع مخاوف تضخمية جديدة' },
    { emoji: '🟢', text: 'الذهب يرتفع 1.2% وسط تراجع الدولار' },
    { emoji: '🔴', text: 'نيفيديا تنخفض 3% بعد تحذيرات صادرات الرقائق' },
    { emoji: '🟢', text: 'إيثيريوم يقفز 5% مع اقتراب ترقية Pectra' },
  ]
  const tickerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      style={{
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        height: 36,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        ref={tickerRef}
        style={{
          display: 'flex',
          gap: 48,
          animation: 'marquee 28s linear infinite',
          whiteSpace: 'nowrap',
          paddingRight: 24,
          direction: 'ltr',
        }}
      >
        {[...items, ...items].map((it, i) => (
          <span key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: "'Cairo', sans-serif" }}>
            {it.emoji} {it.text}
          </span>
        ))}
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
    { symbol: 'BTC/USD', price: 69_420, change: 2.4 },
    { symbol: 'ETH/USD', price: 3_185, change: 4.8 },
    { symbol: 'EUR/USD', price: 1.0852, change: -0.12 },
    { symbol: 'GOLD', price: 2_345, change: 1.2 },
    { symbol: 'XAU/USD', price: 2_345, change: 1.2 },
    { symbol: 'BNB/USD', price: 612, change: 3.1 },
    { symbol: 'SOL/USD', price: 178, change: 6.2 },
    { symbol: 'GBP/USD', price: 1.274, change: -0.3 },
  ]
  const router = useRouter()

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }} className="scrollbar-hide">
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', width: 'max-content' }}>
        {pairs.map((p, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/mobile/chart')}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '8px 14px',
              textAlign: 'right',
              minWidth: 100,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
              {p.symbol}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              {p.price.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: p.change >= 0 ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>
              {pct(p.change)}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/* ─── Sparkline ──────────────────────────── */
function Sparkline({ data, color }: { data: number[], color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80, h = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
  return (
    <svg width={w} height={h}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Glass Card ─────────────────────────── */
function GlassCard({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '16px 18px',
        margin: '0 16px 12px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Section Label ──────────────────────── */
function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: '6px 16px 4px', fontFamily: "'Cairo', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }} dir="rtl">
      {label}
    </div>
  )
}

/* ─── Main Page ─────────────────────────── */
export default function MobileHomePage() {
  const router = useRouter()
  const { isOn, setIsOn, stats } = useBotStore()
  const { trades } = usePaperTradesStore()

  const openPositions = trades.filter(t => t.source === 'bot')
  const portfolioSparkData = [500, 510, 505, 520, 515, 530, 542]
  const totalAssets = 542.30
  const dailyChange = 2.4

  const scannerSignals = [
    { pair: 'BTC/USD', dir: 'buy', conf: 82 },
    { pair: 'ETH/USD', dir: 'buy', conf: 74 },
    { pair: 'GOLD', dir: 'sell', conf: 68 },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '52px 16px 16px',
        background: 'linear-gradient(180deg, rgba(5,150,105,0.12), transparent)',
      }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>مرحبًا بك،</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", lineHeight: 1.2 }}>
              رؤى للتداول 👋
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00FFA3', boxShadow: '0 0 6px #00FFA3' }} />
              <span style={{ fontSize: 11, color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>
                محفظتك اليوم {pct(dailyChange)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button style={{ padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}>
              <Bell size={18} color="rgba(255,255,255,0.6)" />
            </button>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'linear-gradient(135deg, #059669, #d4af37)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, color: '#fff',
            }}>ر</div>
          </div>
        </div>
      </div>

      {/* ── News Ticker ── */}
      <NewsTicker />

      {/* ── Currency Ticker ── */}
      <CurrencyTicker />

      {/* ── Portfolio Card ── */}
      <SectionLabel label="نظرة عامة على المحفظة" />
      <GlassCard onClick={() => router.push('/mobile/portfolio')}>
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
              إجمالي الأصول
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
              ${totalAssets.toLocaleString('en', { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp size={12} color="#00FFA3" />
              <span style={{ fontSize: 12, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                {pct(dailyChange)} اليوم
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Sparkline data={portfolioSparkData} color="#00FFA3" />
            <ChevronLeft size={16} color="rgba(255,255,255,0.3)" style={{ transform: 'rotate(180deg)' }} />
          </div>
        </div>
        {/* Mini stats */}
        <div className="flex gap-3 mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'الربح الكلي', value: `+$${fmt2(stats.profit)}`, color: '#00FFA3' },
            { label: 'نسبة الفوز', value: `${stats.winRate}%`, color: '#00D4FF' },
            { label: 'صفقات مفتوحة', value: String(openPositions.length), color: '#FFB800' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ── AI Council Card ── */}
      <SectionLabel label="مجلس الذكاء الاصطناعي" />
      <GlassCard onClick={() => router.push('/mobile/more')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(179,136,255,0.15)',
              border: '1px solid rgba(179,136,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={18} color="#B388FF" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>مجلس الذكاء</p>
              <p style={{ fontSize: 10, color: '#B388FF', fontFamily: "'Cairo', sans-serif" }}>6 نماذج AI</p>
            </div>
          </div>
          <ChevronLeft size={16} color="rgba(255,255,255,0.3)" style={{ transform: 'rotate(180deg)' }} />
        </div>
        {/* 6 model dots */}
        <div className="flex gap-2 mb-3">
          {['Gemini', 'Groq', 'GLM', 'HF', 'Ollama', 'Rules'].map((m, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00FFA3', boxShadow: '0 0 6px #00FFA3' }} />
              <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{m}</span>
            </div>
          ))}
        </div>
        <div style={{
          padding: '10px 12px', borderRadius: 12,
          background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.2)',
        }}>
          <p style={{ fontSize: 11, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
            🟢 BTC/USD: <span style={{ color: '#00FFA3', fontWeight: 700 }}>شراء</span> — ثقة 72%
          </p>
        </div>
      </GlassCard>

      {/* ── Bot Card ── */}
      <SectionLabel label="بوت التداول الآلي" />
      <GlassCard onClick={() => router.push('/mobile/settings')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: isOn ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
              border: `1px solid ${isOn ? 'rgba(0,255,163,0.3)' : 'rgba(255,71,87,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={18} color={isOn ? '#00FFA3' : '#FF4757'} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>البوت الآلي</p>
              <div className="flex items-center gap-1">
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOn ? '#00FFA3' : '#FF4757' }} className={isOn ? 'animate-pulse' : ''} />
                <span style={{ fontSize: 10, color: isOn ? '#00FFA3' : '#FF4757', fontFamily: "'Cairo', sans-serif" }}>
                  {isOn ? 'نشط' : 'متوقف'}
                </span>
              </div>
            </div>
          </div>
          {/* Toggle */}
          <button
            onClick={e => { e.stopPropagation(); setIsOn(!isOn) }}
            style={{
              width: 50, height: 28, borderRadius: 14,
              background: isOn ? '#059669' : 'rgba(255,255,255,0.12)',
              border: 'none', position: 'relative', cursor: 'pointer',
              transition: 'background 0.3s',
            }}
          >
            <motion.div
              animate={{ x: isOn ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{
                position: 'absolute', top: 2,
                width: 24, height: 24, borderRadius: '50%',
                background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            />
          </button>
        </div>
        <div className="flex gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.trades}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif" }}>صفقات اليوم</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: stats.profit >= 0 ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.profit >= 0 ? '+' : ''}${fmt2(stats.profit)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif" }}>ربح الجلسة</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>
              {openPositions.length}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif" }}>مفتوحة</div>
          </div>
        </div>
      </GlassCard>

      {/* ── Scanner Card ── */}
      <SectionLabel label="السكانر المتقدم" />
      <GlassCard onClick={() => router.push('/mobile/more')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ScanSearch size={18} color="#00D4FF" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>السكانر</p>
              <p style={{ fontSize: 10, color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>آخر الإشارات</p>
            </div>
          </div>
          <ChevronLeft size={16} color="rgba(255,255,255,0.3)" style={{ transform: 'rotate(180deg)' }} />
        </div>
        <div className="flex flex-col gap-2">
          {scannerSignals.map((s, i) => (
            <div key={i} className="flex items-center justify-between" style={{
              padding: '8px 12px', borderRadius: 10,
              background: s.dir === 'buy' ? 'rgba(0,255,163,0.06)' : 'rgba(255,71,87,0.06)',
              border: `1px solid ${s.dir === 'buy' ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)'}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>{s.pair}</span>
              <div className="flex items-center gap-2">
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: s.dir === 'buy' ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)',
                  color: s.dir === 'buy' ? '#00FFA3' : '#FF4757',
                  fontFamily: "'Cairo', sans-serif",
                }}>
                  {s.dir === 'buy' ? 'شراء ↑' : 'بيع ↓'}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.conf}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Bottom padding */}
      <div style={{ height: 24 }} />
    </div>
  )
}
