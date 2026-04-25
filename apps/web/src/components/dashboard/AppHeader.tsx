'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Wallet, Brain, ScanSearch, BarChart2,
  Copy, Users, Newspaper, CalendarDays, Settings,
  ChevronDown, Bell, User, MoreHorizontal,
  TrendingUp, TrendingDown, Menu, X, GitMerge, Activity,
  FlaskConical
} from 'lucide-react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { NotificationCenter } from '@/components/dashboard/NotificationCenter'

/* ─── Design tokens ─── */
const T = {
  bg:       'var(--bg)',
  bg2:      'var(--surface)',
  blue:     'var(--primary)',
  accent:   'var(--accent)',
  green:    'var(--success)',
  red:      'var(--danger)',
  amber:    '#FFB800',
  purple:   '#B388FF',
  text:     'var(--foreground)',
  text2:    'var(--muted)',
  text3:    'var(--muted)',
  border:   'var(--card-border)',
  border2:  'rgba(255, 255, 255, 0.12)',
  navGlass: 'rgba(15, 17, 19, 0.85)',
  card:     'var(--surface)',
}

const H_NEWS  = 26
const H_CURR  = 32
const H_NAV   = 42
const H_TOTAL = H_NEWS + H_CURR + H_NAV
const MOBILE_HEADER_H = 44
const ORB_D   = 108
const ORB_GAP = 120

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

function formatHeaderPrice(value: unknown) {
  const price = Number(value)
  if (!Number.isFinite(price)) return '—'
  return price.toLocaleString('en', { maximumFractionDigits: price > 100 ? 2 : 4 })
}

/* ══ Cosmic Orb ══ */
function CosmicOrb({ state, size = 68 }: { state: MarketState, size?: number }) {
  const c = STATE[state]
  const S = size
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
    <div className="logo-orb" style={{
      position: 'absolute', top: '50%', right: 10,
      transform: 'translateY(-50%)',
      width: ORB_D, height: ORB_D, borderRadius: '50%',
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
    <div style={{
      height: H_NEWS, background: T.bg,
      borderBottom: `0.5px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      overflow: 'hidden',
      borderTopRightRadius: ORB_D / 2,
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
        <NotificationCenter />
      </div>
    </div>
  )
}

/* ══ Strip 2: Currency Ticker — Static + Flash on update ══ */
const SYMBOLS = [
  'BTC/USD','ETH/USD','EUR/USD','GBP/USD',
  'USD/JPY','XAU/USD','BNB/USD','SOL/USD','XRP/USD',
]

function CurrencyTicker({ isMobile = false }: { isMobile?: boolean }) {
  const globalQuotes = useMarketStore(state => state.quotes)
  // Build a Map for backward compatibility with existing rendering code
  const quotes = new Map(SYMBOLS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][])
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()

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

  const finalRows = isMobile ? rows.slice(0, 3) : rows

  return (
    <div style={{
      height: isMobile ? 'auto' : H_CURR, background: isMobile ? 'transparent' : T.bg2,
      borderBottom: isMobile ? 'none' : `0.5px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      padding: isMobile ? 0 : '0 6px',
      flex: isMobile ? 1 : undefined,
    }}>
      {finalRows.map(({ sym, q, flash }, i) => {
        const flashBg = flash === 'up'
          ? 'rgba(0,255,198,0.12)'
          : flash === 'down'
            ? 'rgba(255,77,77,0.12)'
            : 'transparent'
        const chg = q?.changePercent ?? 0
        const isUp = chg >= 0

        return (
          <div key={sym} 
            onClick={() => setSelectedSymbol(sym)}
            style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: isMobile ? '0 4px' : '2px 6px',
            borderLeft: i < finalRows.length - 1 ? `0.5px solid ${T.border}` : 'none',
            borderRadius: 4,
            background: sym === selectedSymbol ? 'rgba(255,255,255,0.06)' : flashBg,
            cursor: 'pointer',
            borderBottom: sym === selectedSymbol ? `2px solid ${T.blue}` : '2px solid transparent',
            transition: 'background 0.15s',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: isMobile ? 6.5 : 7.5, color: T.text3,
              letterSpacing: '0.04em', lineHeight: 1.2,
            }}>{sym}</span>
            <span className="price" style={{
              fontSize: isMobile ? 10 : 11.5,
              color: flash === 'up' ? T.green : flash === 'down' ? T.red : T.text,
              lineHeight: 1.15, transition: 'color 0.3s',
            }}>
              {formatHeaderPrice(q?.price)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ══ Strip 3: Main Nav ══ */
const NAV_LINKS = [
  { href: '/dashboard',                        label: 'الرئيسية',           icon: Home },
  { href: '/dashboard/portfolio',              label: 'المحفظة',            icon: Wallet },
  { href: '/dashboard/ai',                     label: 'تحليل AI',           icon: Brain },
  { href: '/dashboard/neural',                  label: 'Neural Lab',         icon: FlaskConical },
  { href: '/dashboard/scanner',                label: 'السكانر المتقدم',    icon: ScanSearch },
  { href: '/dashboard/strategies',             label: 'تحليلات استراتيجية', icon: BarChart2 },
  { href: '/dashboard/copy-trading',           label: 'نسخ الصفقات',        icon: Copy },
  { href: '/dashboard/social',                 label: 'التداول الاجتماعي',  icon: Users },
  { href: '/dashboard/news',                   label: 'الأخبار',            icon: Newspaper },
  { href: '/dashboard/calendar',               label: 'الأجندة الاقتصادية', icon: CalendarDays },
  { href: '/dashboard/strategies/backtest',    label: 'اختبار الاستراتيجيات', icon: Activity },
  { href: '/dashboard/correlation',            label: 'مصفوفة الارتباط',    icon: GitMerge },
  { href: '/dashboard/settings',               label: 'الإعدادات',          icon: Settings },
]

function MainNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div style={{
      height: H_NAV,
      backdropFilter: 'blur(20px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
      background: T.navGlass,
      display: 'flex', alignItems: 'center',
      padding: '0 8px', gap: 0, overflow: 'hidden',
      borderBottomRightRadius: ORB_D / 2,
    }}>
      {NAV_LINKS.slice(0, 6).map(({ href, label, icon: Icon }) => {
        const active = pathname === href ||
          (href !== '/dashboard' && (pathname ?? '').startsWith(href))
        return (
          <Link key={href} href={href} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              height: 44, // Enhanced touch target
              background: active ? `${T.blue}18` : 'transparent',
              borderBottom: active ? `2px solid ${T.blue}` : '2px solid transparent',
              color: active ? T.blue : T.text2,
              fontFamily: "'Cairo', sans-serif",
              fontSize: 12, fontWeight: active ? 800 : 500,
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
              <Icon size={14} strokeWidth={active ? 2.5 : 2} />
              {label}
            </div>
          </Link>
        )
      })}

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 12px', cursor: 'pointer', height: 44,
            background: 'transparent', border: 'none',
            color: T.text2, fontFamily: "'Cairo', sans-serif", fontSize: 12,
          }}
        >
          <MoreHorizontal size={14} />
          المزيد
          <ChevronDown size={11} style={{
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
            {NAV_LINKS.slice(6).map(item => (
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

      <div style={{ flex: 1 }} />

      {/* Mode Switcher (Trader / Investor / AI) */}
      <div style={{
         display: 'flex', background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 8,
         border: '1px solid var(--card-border)', marginLeft: 12
      }}>
         {['Trader', 'Investor', 'AI'].map((mode) => (
           <button 
             key={mode}
             style={{
                padding: '4px 10px', fontSize: 9.5, fontWeight: mode === 'Trader' ? 800 : 500,
                background: mode === 'Trader' ? 'var(--primary)' : 'transparent',
                color: mode === 'Trader' ? '#fff' : 'var(--muted)',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--mono)', transition: '0.2s',
                textTransform: 'uppercase'
             }}
           >
             {mode}
           </button>
         ))}
      </div>

      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 8, cursor: 'pointer',
        padding: '0 16px', borderRadius: 22, height: 44,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--card-border)', marginInlineStart: 8,
      }}>
        <User size={16} color="var(--accent)" />
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: 'var(--foreground)', fontWeight: 800 }}>حسابي</span>
      </div>
    </div>
  )
}

/* ─── Keyframes ─── */
const KF = `
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
header *            { scrollbar-width:none; -ms-overflow-style:none; }
header *::-webkit-scrollbar { display:none; }

@media (max-width: 900px) {
  .desktop-header { display: none !important; }
  .mobile-header { display: flex !important; }
  .logo-orb { display: none !important; }
}
`

/* ══ Root export ══ */
export function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const globalQuotes = useMarketStore(state => state.quotes)
  const ORBS = ['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD']
  const quotes = new Map(ORBS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][])

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
      
      {/* Mobile Sidebar */}
      {menuOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          zIndex: 1000, backdropFilter: 'blur(8px)'
        }} onClick={() => setMenuOpen(false)}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '280px',
            background: T.bg2, borderRight: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column', padding: '20px'
          }} onClick={e => e.stopPropagation()}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>القائمة</span>
                <X size={24} color={T.text} onClick={() => setMenuOpen(false)} style={{ cursor: 'pointer' }} />
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} style={{ textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                      borderRadius: 8, background: pathname === href ? `${T.blue}15` : 'transparent',
                      color: pathname === href ? T.blue : T.text2,
                      fontSize: 14, fontWeight: 600, fontFamily: "'Cairo', sans-serif"
                    }}>
                      <Icon size={18} />
                      {label}
                    </div>
                  </Link>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* Desktop Header Layout */}
      <header className="desktop-header" style={{
        position: 'sticky', top: 0, zIndex: 100,
        direction: 'rtl', height: H_TOTAL,
      }}>
        <LogoCircle state={marketState} />
        <div style={{
          height: '100%', marginInlineStart: ORB_GAP,
          display: 'flex', flexDirection: 'column',
        }}>
          <NewsTicker />
          <CurrencyTicker />
          <MainNav />
        </div>
      </header>

      {/* Mobile Header Layout */}
      <header className="mobile-header" style={{
        display: 'none', position: 'sticky', top: 0, zIndex: 100,
        height: MOBILE_HEADER_H, background: T.navGlass, borderBottom: `1px solid ${T.border}`,
        alignItems: 'center', padding: '0 10px', justifyContent: 'space-between',
        backdropFilter: 'blur(20px)'
      }}>
        <button onClick={() => setMenuOpen(true)} style={{ background: 'transparent', border: 'none', color: T.text, cursor: 'pointer', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Menu size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, paddingInline: 6 }}>
           <CurrencyTicker isMobile />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <CosmicOrb state={marketState} size={24} />
        </div>
      </header>
    </>
  )
}
