'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Wallet, Brain, ScanSearch, BarChart2,
  Copy, Users, Newspaper, CalendarDays, Settings,
  ChevronDown, Bell, User, MoreHorizontal,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { useMarketQuotes } from '@/hooks/useMarketData'

/* ─── Design tokens ─── */
const T = {
  bg:       '#04050C',
  bg2:      '#0D1117',
  blue:     '#0A84FF',
  cyan:     '#00C8FF',
  green:    '#00FFC6',
  red:      '#FF4D4D',
  amber:    '#FFB800',
  purple:   '#B388FF',
  text:     '#E6EBF5',
  text2:    '#8090A8',
  text3:    '#A0AFC3',
  border:   'rgba(10,132,255,0.12)',
  border2:  'rgba(10,132,255,0.22)',
  navGlass: 'rgba(4,5,12,0.96)',
  card:     'rgba(5,7,12,0.94)',
}

const H_NEWS  = 26
const H_CURR  = 32
const H_NAV   = 42
const H_TOTAL = H_NEWS + H_CURR + H_NAV

type MarketState = 'bullish' | 'bearish' | 'volatile' | 'neutral'

const STATE: Record<MarketState, { core: string; glow: string }> = {
  bullish:  { core: '#00FFC6', glow: 'rgba(0,255,198,0.55)'  },
  bearish:  { core: '#FF4D4D', glow: 'rgba(255,77,77,0.55)'  },
  volatile: { core: '#FFB800', glow: 'rgba(255,184,0,0.55)'  },
  neutral:  { core: '#00C8FF', glow: 'rgba(0,200,255,0.45)'  },
}

const PLANETS = [
  { inset: -5,  size: 6, color: '#FFB800', glow: '#FFB80088', dur: '5s',  dir: 'ring-cw'  },
  { inset: -12, size: 8, color: '#B388FF', glow: '#B388FF88', dur: '10s', dir: 'ring-ccw' },
  { inset: -20, size: 5, color: '#FF4D4D', glow: '#FF4D4D88', dur: '16s', dir: 'ring-cw'  },
  { inset: -28, size: 4, color: '#00C8FF', glow: '#00C8FF88', dur: '22s', dir: 'ring-ccw' },
]

const STARS = [
  { top: '5%',  left: '-22%', s: 2,   op: 0.7, dur: '2.1s' },
  { top: '72%', left: '-20%', s: 1.5, op: 0.5, dur: '3.3s' },
  { top: '-8%', left: '28%',  s: 2.5, op: 0.6, dur: '1.8s' },
  { top: '88%', left: '82%',  s: 1.5, op: 0.5, dur: '2.9s' },
  { top: '-6%', left: '72%',  s: 2,   op: 0.7, dur: '3.7s' },
  { top: '50%', left: '-26%', s: 1.5, op: 0.4, dur: '2.5s' },
  { top: '15%', left: '90%',  s: 2,   op: 0.6, dur: '4.1s' },
]

/* ══ Cosmic Orb ══ */
function CosmicOrb({ state }: { state: MarketState }) {
  const c = STATE[state]
  const S = 68
  return (
    <div style={{ position: 'relative', width: S, height: S }}>
      <div style={{
        position: 'absolute', inset: -14, borderRadius: '50%',
        background: `radial-gradient(circle, ${c.glow} 0%, transparent 65%)`,
        animation: 'orb-glow 3s ease-in-out infinite',
      }} />
      {STARS.map((st, i) => (
        <div key={i} style={{
          position: 'absolute', top: st.top, left: st.left,
          width: st.s, height: st.s, borderRadius: '50%',
          background: '#fff', opacity: st.op,
          animation: `star-blink ${st.dur} ease-in-out infinite`,
        }} />
      ))}
      {PLANETS.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', inset: p.inset, borderRadius: '50%',
          border: `1px solid ${p.color}33`,
          animation: `${p.dir} ${p.dur} linear infinite`,
          transform: `rotateX(${50 + i * 12}deg) rotateZ(${i * 20}deg)`,
        }}>
          <div style={{
            position: 'absolute',
            top: i % 2 === 0 ? -p.size / 2 : undefined,
            bottom: i % 2 === 1 ? -p.size / 2 : undefined,
            left: '50%', width: p.size, height: p.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${p.color}, ${p.color}66)`,
            boxShadow: `0 0 ${p.size + 4}px ${p.glow}`,
            marginLeft: -p.size / 2,
          }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `radial-gradient(circle at 36% 30%, ${c.core}ee, ${c.core}66 40%, #010208 80%)`,
        boxShadow: `0 0 24px ${c.glow}, 0 0 8px ${c.glow} inset`,
        transition: 'box-shadow 1.2s ease, background 1.2s ease',
        zIndex: 2,
      }}>
        <div style={{
          position: 'absolute', top: '14%', left: '18%',
          width: '40%', height: '26%', borderRadius: '50%',
          background: 'rgba(255,255,255,0.22)', filter: 'blur(3px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '8%', left: '14%', right: '14%',
          height: '16%', borderRadius: '50%',
          background: `${c.core}28`, filter: 'blur(5px)',
        }} />
      </div>
    </div>
  )
}

/* ══ Logo Circle ══ */
function LogoCircle({ state }: { state: MarketState }) {
  const c = STATE[state]
  return (
    <div className="orb-container" style={{
      position: 'absolute', top: '50%', right: 10,
      transform: 'translateY(-50%)',
      borderRadius: '50%',
      background: `radial-gradient(circle at 50% 40%, #0D1520, #020308)`,
      border: `1.5px solid ${c.core}44`,
      boxShadow: `0 0 28px ${c.glow}, 0 0 0 4px ${c.core}11`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 6, zIndex: 20,
      transition: 'border-color 1s, box-shadow 1s',
    }}>
      <CosmicOrb state={state} />
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Cairo', sans-serif",
          fontWeight: 900, fontSize: 11.5,
          color: T.text, lineHeight: 1.1,
        }}>رؤى</div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 6, color: c.core,
          letterSpacing: '0.1em', opacity: 0.85,
        }}>ROUA</div>
      </div>
    </div>
  )
}

/* ══ Strip 1: News Ticker ══ */
function NewsTicker() {
  const [items, setItems] = useState<
    { text: string; categoryAr: string; color: string; impact: string }[]
  >([])

  useEffect(() => {
    fetch('/api/news/feed')
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.length) setItems(d) })
      .catch(() => {})
  }, [])

  const doubled = items.length ? [...items, ...items] : []

  return (
    <div className="radius-top-right" style={{
      height: H_NEWS, background: T.bg,
      borderBottom: `0.5px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {doubled.length > 0 ? (
          <div style={{
            display: 'flex', gap: 52, whiteSpace: 'nowrap',
            animation: `news-scroll ${Math.max(doubled.length * 2.5, 18)}s linear infinite`,
          }}>
            {doubled.map((item, i) => (
              <span key={i} style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 11,
                color: item.color || T.text2, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{
                  fontSize: 8, padding: '1px 5px', borderRadius: 3,
                  background: `${item.color}18`, color: item.color,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{item.categoryAr || 'عام'}</span>
                {item.impact === 'high' && <span style={{ color: T.amber, fontSize: 7 }}>●</span>}
                {item.text}
              </span>
            ))}
          </div>
        ) : (
          <span style={{
            padding: '0 14px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, color: T.text3,
          }}>جارٍ تحميل الأخبار...</span>
        )}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 36,
          background: `linear-gradient(to right, ${T.bg}, transparent)`,
          pointerEvents: 'none',
        }} />
      </div>
      <div style={{ flexShrink: 0, padding: '0 10px' }}>
        <button style={{
          position: 'relative', background: 'transparent',
          border: 'none', color: T.text2, cursor: 'pointer',
          display: 'flex', alignItems: 'center',
        }}>
          <Bell size={12} />
          <span style={{
            position: 'absolute', top: -4, left: -4,
            width: 12, height: 12, borderRadius: '50%',
            background: T.red, fontSize: 7, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          }}>3</span>
        </button>
      </div>
    </div>
  )
}

/* ══ Strip 2: Currency Ticker — Static + Flash on update ══ */
const SYMBOLS = [
  'BTC/USD','ETH/USD','EUR/USD','GBP/USD',
  'USD/JPY','XAU/USD','BNB/USD','SOL/USD','XRP/USD',
]

function CurrencyTicker() {
  const { quotes } = useMarketQuotes(SYMBOLS, 5000)

  // Track previous prices to detect direction
  const prevPrices = useRef<Record<string, number>>({})
  const [flashState, setFlashState] = useState<Record<string, 'up' | 'down' | null>>({})

  useEffect(() => {
    const nextFlash: Record<string, 'up' | 'down' | null> = {}
    let changed = false
    SYMBOLS.forEach(sym => {
      const q = quotes.get(sym)
      if (!q) return
      const prev = prevPrices.current[sym]
      if (prev !== undefined && prev !== q.price) {
        nextFlash[sym] = q.price > prev ? 'up' : 'down'
        changed = true
      }
      prevPrices.current[sym] = q.price
    })
    if (changed) {
      setFlashState(nextFlash)
      const t = setTimeout(() => setFlashState({}), 700)
      return () => clearTimeout(t)
    }
  }, [quotes])

  const rows = SYMBOLS.map(sym => ({
    sym,
    q: quotes.get(sym) ?? null,
    flash: flashState[sym] ?? null,
  }))

  return (
    <div className="no-scrollbar" style={{
      height: H_CURR, background: T.bg2,
      borderBottom: `0.5px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 6px', overflowX: 'auto',
    }}>
      {rows.map(({ sym, q, flash }, i) => {
        const flashBg = flash === 'up'
          ? 'rgba(0,255,198,0.12)'
          : flash === 'down'
            ? 'rgba(255,77,77,0.12)'
            : 'transparent'
        const chg = q?.changePercent ?? 0
        const isUp = chg >= 0

        return (
          <div key={sym} style={{
            flexShrink: 0, minWidth: 80,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '2px 6px',
            borderLeft: i < rows.length - 1 ? `0.5px solid ${T.border}` : 'none',
            borderRadius: 4,
            background: flashBg,
            transition: 'background 0.15s',
          }}>
            {/* Symbol */}
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 7.5, color: T.text3,
              letterSpacing: '0.04em', lineHeight: 1.2,
            }}>{sym}</span>

            {/* Price */}
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700,
              color: flash === 'up' ? T.green : flash === 'down' ? T.red : T.text,
              lineHeight: 1.15,
              transition: 'color 0.3s',
            }}>
              {q
                ? q.price > 1000
                  ? q.price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : q.price.toFixed(q.price > 10 ? 4 : 6)
                : '—'}
            </span>

            {/* Change % */}
            {q && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 7.5, lineHeight: 1.1,
                color: isUp ? T.green : T.red,
                display: 'flex', alignItems: 'center', gap: 1,
              }}>
                {isUp ? <TrendingUp size={7} /> : <TrendingDown size={7} />}
                {isUp ? '+' : ''}{chg.toFixed(2)}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ══ Strip 3: Main Nav ══ */
const NAV_LINKS = [
  { href: '/dashboard',              label: 'الرئيسية',           icon: Home },
  { href: '/dashboard/portfolio',    label: 'المحفظة',            icon: Wallet },
  { href: '/dashboard/ai',           label: 'تحليل AI',           icon: Brain },
  { href: '/dashboard/scanner',      label: 'السكانر المتقدم',    icon: ScanSearch },
  { href: '/dashboard/strategies',   label: 'تحليلات استراتيجية', icon: BarChart2 },
  { href: '/dashboard/copy-trading', label: 'نسخ الصفقات',        icon: Copy },
  { href: '/dashboard/social',       label: 'التداول الاجتماعي',  icon: Users },
  { href: '/dashboard/news',         label: 'الأخبار',            icon: Newspaper },
  { href: '/dashboard/calendar',     label: 'الأجندة الاقتصادية', icon: CalendarDays },
  { href: '/dashboard/settings',     label: 'الإعدادات',          icon: Settings },
]

function MainNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="radius-bottom-right no-scrollbar" style={{
      height: H_NAV,
      backdropFilter: 'blur(20px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
      background: T.navGlass,
      display: 'flex', alignItems: 'center',
      padding: '0 8px', gap: 0, overflowX: 'auto',
    }}>
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href ||
          (href !== '/dashboard' && (pathname ?? '').startsWith(href))
        return (
          <Link key={href} href={href} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 9px', borderRadius: 5, cursor: 'pointer',
              background: active ? `${T.blue}18` : 'transparent',
              borderBottom: active ? `2px solid ${T.blue}` : '2px solid transparent',
              color: active ? T.blue : T.text2,
              fontFamily: "'Cairo', sans-serif",
              fontSize: 11.5, fontWeight: active ? 700 : 500,
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
              <Icon size={11} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </div>
          </Link>
        )
      })}

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 9px', cursor: 'pointer',
            background: 'transparent', border: 'none',
            color: T.text2, fontFamily: "'Cairo', sans-serif", fontSize: 11.5, whiteSpace: 'nowrap',
          }}
        >
          <MoreHorizontal size={11} />
          المزيد
          <ChevronDown size={9} style={{
            transform: moreOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }} />
        </button>
        {moreOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: T.card, backdropFilter: 'blur(32px) saturate(1.8)',
            border: `0.5px solid ${T.border2}`, borderRadius: 10,
            padding: '5px', minWidth: 148, zIndex: 999,
            boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          }}>
            {[
              { label: 'الباك تيستر',   href: '/dashboard/backtester' },
              { label: 'مدير المخاطر',  href: '/dashboard/risk' },
              { label: 'تنبيهات السعر', href: '/dashboard/alerts' },
              { label: 'تقارير الأداء', href: '/dashboard/reports' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div
                  onClick={() => setMoreOpen(false)}
                  style={{
                    padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text2,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = `${T.blue}14`; el.style.color = T.text
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = 'transparent'; el.style.color = T.text2
                  }}
                >{item.label}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 16 }} />

      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 4, cursor: 'pointer',
        padding: '4px 10px', borderRadius: 20,
        background: 'rgba(255,255,255,0.04)',
        border: `0.5px solid ${T.border2}`, marginLeft: 8,
      }}>
        <User size={11} color={T.text2} />
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text2 }}>حسابي</span>
      </div>
    </div>
  )
}

/* ─── Keyframes & Variables ─── */
const KF = `
:root {
  --orb-d: 108px;
  --orb-gap: 120px;
}

@media (max-width: 1024px) {
  :root {
    --orb-d: 72px;
    --orb-gap: 80px;
  }
}

@keyframes news-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes ring-cw     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes ring-ccw    { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
@keyframes orb-glow {
  0%,100%{ opacity:0.65; transform:scale(1)    }
  50%    { opacity:1;    transform:scale(1.10) }
}
@keyframes star-blink {
  0%,100%{ opacity:0.25 } 50%{ opacity:0.9 }
}

.no-scrollbar::-webkit-scrollbar { display:none; }
.no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }

.orb-container {
  width: var(--orb-d);
  height: var(--orb-d);
}

.nav-container {
  margin-right: var(--orb-gap);
}

.radius-top-right { border-top-right-radius: calc(var(--orb-d) / 2); }
.radius-bottom-right { border-bottom-right-radius: calc(var(--orb-d) / 2); }
`

/* ══ Root export ══ */
export function AppHeader() {
  const { quotes } = useMarketQuotes(
    ['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD'],
    5000
  )

  const marketState: MarketState = (() => {
    if (quotes.size === 0) return 'neutral'
    const changes = Array.from(quotes.values()).map(q => q.changePercent)
    const avg  = changes.reduce((a, b) => a + b, 0) / changes.length
    const vola = Math.max(...changes.map(Math.abs))
    if (vola > 3.5) return 'volatile'
    if (avg  >  0.4) return 'bullish'
    if (avg  < -0.4) return 'bearish'
    return 'neutral'
  })()

  return (
    <>
      <style>{KF}</style>
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        direction: 'rtl', height: H_TOTAL,
      }}>
        <LogoCircle state={marketState} />
        <div className="nav-container" style={{
          height: '100%',
          display: 'flex', flexDirection: 'column',
          width: 'calc(100% - var(--orb-gap))'
        }}>
          <NewsTicker />
          <CurrencyTicker />
          <MainNav />
        </div>
      </header>
    </>
  )
}
