'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getPortalRoot } from '@/lib/portal-root'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useShallow } from 'zustand/react/shallow'
import { useTranslations, useLocale } from 'next-intl'

/**
 * SafeLink — Navigation wrapper that guarantees page transitions work.
 *
 * Problem: Next.js App Router's client-side navigation (RSC) silently fails
 * when the server is slow or the RSC payload fetch times out. The URL never
 * changes and the user is stuck on the same page.
 *
 * Solution: Try router.push() first (soft navigation, fast). If it doesn't
 * navigate within 2 seconds (detected by pathname not changing), fall back to
 * window.location.href (full page reload, always works).
 *
 * Also sets prefetch={false} to prevent failed prefetch requests from
 * poisoning Next.js's navigation cache.
 */
function SafeLink({
  href,
  children,
  style,
  onClick,
}: {
  href: string
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onClick?.()

    // If already on this page, do nothing
    if (pathname === href || (href !== '/dashboard' && pathname.startsWith(href))) return

    // Try soft navigation first
    router.push(href)

    // Fallback: if URL hasn't changed after 1.5s, do a hard navigation
    const target = href
    const before = window.location.pathname
    setTimeout(() => {
      if (window.location.pathname === before) {
        window.location.href = target
      }
    }, 1500)
  }

  return (
    <Link href={href} prefetch={false} style={style} onClick={handleClick}>
      {children}
    </Link>
  )
}
import {
  Home, Wallet, Brain, ScanSearch, BarChart2,
  Copy, Users, Newspaper, CalendarDays, Settings,
  ChevronDown, Bell, User, MoreHorizontal,
  TrendingUp, TrendingDown, Menu, X as XIcon, GitMerge, Activity,
  FlaskConical, Shield, Hammer, LogOut, UserCircle, Info,
  CreditCard, HelpCircle, Trophy, Code, Fingerprint, BellRing, Link2, Eye, Target, Cpu, PenLine, Clock, Calendar,
  BarChart3, Globe2
} from 'lucide-react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { useAuthStore } from '@/lib/auth-store'
import { NotificationCenter } from '@/components/dashboard/NotificationCenter'
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher'

/* ─── Design tokens ─── */
const T = {
  bg:       '#0B0E14',
  bg2:      '#1A1D29',
  blue:     'var(--primary)',
  accent:   'var(--accent)',
  green:    'var(--success)',
  red:      'var(--danger)',
  amber:    '#FFB800',
  purple:   '#B388FF',
  text:     '#F0F2F5',
  text2:    '#8B92A8',
  text3:    '#8B92A8',
  border:   'rgba(255,255,255,0.05)',
  border2:  'rgba(255,255,255,0.12)',
  navGlass: 'rgba(11, 14, 20, 0.85)',
  card:     'var(--surface)',
  success:  '#00FFA3',
  danger:   '#FF4757',
  warning:  '#FFB800',
  info:     '#00D4FF',
}

const H_NEWS  = 28
const H_CURR  = 34
const H_NAV   = 46
const H_TOTAL = H_NEWS + H_CURR + H_NAV
const MOBILE_HEADER_H = 48
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
function LogoCircle({ state, size = 'desktop' }: { state: MarketState, size?: 'desktop' | 'mobile' }) {
  const t = useTranslations()
  const c = STATE[state]
  const isDesktop = size === 'desktop'
  const D = isDesktop ? ORB_D : 48
  const orbSize = isDesktop ? 68 : 28
  return (
    <div className={isDesktop ? 'logo-orb' : 'logo-orb-mobile'} style={{
      position: isDesktop ? 'absolute' : 'relative',
      top: isDesktop ? '50%' : undefined,
      insetInlineStart: isDesktop ? 10 : undefined,
      transform: isDesktop ? 'translateY(-50%)' : undefined,
      width: D, height: D, borderRadius: '50%',
      background: `radial-gradient(circle at 50% 40%, #0D1520, #020308)`,
      border: `1.5px solid ${c.core}44`,
      boxShadow: `0 0 28px ${c.glow}, 0 0 0 ${isDesktop ? 4 : 2}px ${c.core}11`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: isDesktop ? 2 : 0, zIndex: 20,
      transition: 'border-color 1s, box-shadow 1s',
      flexShrink: 0,
      cursor: 'pointer',
    }}>
      <CosmicOrb state={state} size={orbSize} />
      {(isDesktop) && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Cairo', sans-serif",
            fontWeight: 900, fontSize: 11.5,
            color: T.text, lineHeight: 1.1,
          }}>{t('common.brand')}</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 6, color: c.core,
            letterSpacing: '0.1em', opacity: 0.85,
          }}>{t('common.brandSub')}</div>
        </div>
      )}
    </div>
  )
}

/* ══ Strip 1: News Ticker ══ */
/* ─── Shared news data (single fetch) with TTL ─── */
// BUG-004 FIX: Added TTL so cache expires after 10 min instead of living forever.
type NewsItem = { text: string; textAr: string; category: string; categoryAr: string; color: string; impact: string }
let _newsCache: NewsItem[] | null = null
let _newsCacheAt = 0
const NEWS_TTL_MS = 10 * 60 * 1000 // 10 minutes
let _newsPromise: Promise<NewsItem[]> | null = null

function fetchNewsData(): Promise<NewsItem[]> {
  if (_newsCache && Date.now() - _newsCacheAt < NEWS_TTL_MS) return Promise.resolve(_newsCache)
  if (_newsPromise) return _newsPromise
  _newsCache = null // invalidate stale cache
  _newsPromise = fetch('/api/news/feed')
    .then(r => r.ok ? r.json() : [])
    .then((d: unknown) => {
      if (Array.isArray(d) && d.length) {
        _newsCache = d
          .map((item: any) => {
            const rawTextAr = item.textAr || item.translatedTitle || ''
            const rawText = item.text || item.headline || item.title || ''
            const hasRealArabic = rawTextAr && /[\u0600-\u06FF]/.test(rawTextAr)
            return {
              text: rawText,
              textAr: hasRealArabic ? rawTextAr : rawText,
              category: item.category || 'Markets',
              categoryAr: item.categoryAr || 'Markets',
              color: item.color || '#8B92A8',
              impact: item.impact || 'medium',
            }
          })
          // Safety: filter out any items where text is Arabic (no English available)
          .filter((item) => !/[\u0600-\u06FF]/.test(item.text))
      } else {
        _newsCache = []
      }
      _newsCacheAt = Date.now()
      _newsPromise = null
      return _newsCache!
    })
    .catch(() => { _newsCache = []; _newsCacheAt = Date.now(); _newsPromise = null; return _newsCache! })
  return _newsPromise
}

function NewsTicker() {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === 'ar'
  const [items, setItems] = useState<
    { text: string; textAr: string; category: string; categoryAr: string; color: string; impact: string }[]
  >([])

  useEffect(() => {
    fetchNewsData().then(data => { if (data.length) setItems(data) })
  }, [])

  const doubled = items.length ? [...items, ...items] : []

  return (
    <div style={{
      height: H_NEWS,
      background: 'linear-gradient(90deg, #0D1117, #111827, #0D1117)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center',
      overflow: 'hidden',
      borderStartStartRadius: ORB_D / 2,
      boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    }}>
      {/* NEWS label */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 10px 0 12px', height: '100%',
        borderInlineEnd: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,212,255,0.04)',
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 800,
          color: '#00D4FF', letterSpacing: '0.12em',
        }}>NEWS</span>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: '#10B981',
          boxShadow: '0 0 6px #10B981',
          animation: 'star-blink 2s ease-in-out infinite',
        }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {doubled.length > 0 ? (
          <div style={{
            display: 'flex', gap: 40, whiteSpace: 'nowrap',
            animation: `news-scroll ${Math.max(doubled.length * 2.5, 18)}s linear infinite`,
          }}>
            {doubled.map((item, i) => {
              const displayText = isAr && item.textAr ? item.textAr : item.text
              const displayCat = isAr && item.categoryAr ? item.categoryAr : item.category
              return (
                <span key={i} style={{
                  fontFamily: isAr ? "'Cairo', 'Readex Pro', sans-serif" : "'Inter', 'Readex Pro', sans-serif", fontSize: 11.5,
                  color: '#FFFFFF', flexShrink: 0, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  textShadow: '0 0 8px rgba(255,255,255,0.15)',
                }}>
                  <span style={{
                    fontSize: 8, padding: '2px 6px', borderRadius: 4,
                    background: `${item.color}20`, color: item.color,
                    fontFamily: isAr ? "'Cairo', sans-serif" : "'JetBrains Mono', monospace", fontWeight: 700,
                    border: `1px solid ${item.color}40`,
                    textShadow: 'none',
                  }}>{displayCat || 'News'}</span>
                  {item.impact === 'high' && <span style={{ color: '#FF4757', fontSize: 7, fontWeight: 900, textShadow: '0 0 4px rgba(255,71,87,0.5)' }}>●</span>}
                  <span style={{ color: 'rgba(255,255,255,0.92)' }}>{displayText}</span>
                </span>
              )
            })}
          </div>
        ) : (
          <span style={{
            padding: '0 14px', fontFamily: "'Inter', sans-serif",
            fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500,
          }}>{t('dashboard.news.loading')}</span>
        )}
        {/* Fade edges */}
        <div style={{
          position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 40,
          background: 'linear-gradient(90deg, #0D1117, transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 40,
          background: 'linear-gradient(270deg, #0D1117, transparent)',
          pointerEvents: 'none',
        }} />
      </div>
      <div style={{ flexShrink: 0, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, borderInlineStart: '1px solid rgba(255,255,255,0.08)' }}>
        <LocaleSwitcher variant="header" />
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
  // Only subscribe to quotes for header symbols — prevents re-renders from unrelated symbol updates
  const globalQuotes = useMarketStore(
    useShallow((state) => {
      const result: Record<string, (typeof state.quotes)[string]> = {}
      for (const s of SYMBOLS) {
        if (state.quotes[s]) result[s] = state.quotes[s]
      }
      return result
    })
  )
  const quotes = new Map(SYMBOLS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][])
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()

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
          ? 'rgba(0,255,163,0.10)'
          : flash === 'down'
            ? 'rgba(255,71,87,0.10)'
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
            borderInlineStart: i < finalRows.length - 1 ? `0.5px solid ${T.border}` : 'none',
            borderRadius: 4,
            background: sym === selectedSymbol ? 'rgba(0,212,255,0.08)' : flashBg,
            cursor: 'pointer',
            borderBottom: sym === selectedSymbol ? `2px solid var(--accent)` : '2px solid transparent',
            transition: 'background 0.15s',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: isMobile ? 9 : 7.5, color: T.text3,
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

/* ══ Mobile News Ticker (compact) ══ */
function MobileNewsTicker() {
  const t = useTranslations()
  const locale = useLocale()
  const isAr = locale === 'ar'
  const [items, setItems] = useState<
    { text: string; textAr: string; category: string; categoryAr: string; color: string }[]
  >([])

  useEffect(() => {
    fetchNewsData().then(data => {
      if (data.length) {
        setItems(data.slice(0, 10).map(({ text, textAr, category, categoryAr, color }) => ({ text, textAr, category, categoryAr, color })))
      }
    })
  }, [])

  const doubled = items.length ? [...items, ...items] : []

  return doubled.length > 0 ? (
    <div style={{
      display: 'flex', gap: 32, whiteSpace: 'nowrap',
      animation: `news-scroll ${Math.max(doubled.length * 2, 14)}s linear infinite`,
    }}>
      {doubled.map((item, i) => {
        const displayText = isAr && item.textAr ? item.textAr : item.text
        const displayCat = isAr && item.categoryAr ? item.categoryAr : item.category
        return (
          <span key={i} style={{
            fontFamily: isAr ? "'Cairo', 'Readex Pro', sans-serif" : "'Inter', 'Readex Pro', sans-serif", fontSize: 10,
            color: '#FFFFFF', flexShrink: 0, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            textShadow: '0 0 6px rgba(255,255,255,0.12)',
          }}>
            <span style={{
              fontSize: 7, padding: '1px 5px', borderRadius: 3,
              background: `${item.color}20`, color: item.color,
              fontFamily: isAr ? "'Cairo', sans-serif" : "'JetBrains Mono', monospace", fontWeight: 700,
              border: `1px solid ${item.color}40`,
              textShadow: 'none',
            }}>{displayCat || 'News'}</span>
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>{displayText}</span>
          </span>
        )
      })}
    </div>
  ) : (
    <span style={{
      padding: '0 10px', fontFamily: "'Inter', sans-serif",
      fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 500,
    }}>{t('dashboard.news.loading')}</span>
  )
}

/* ══ Strip 3: Main Nav ══
 *
 * الترتيب الجديد:
 * ├── الرئيسية (8 عناصر بارزة)
 * ├── المحفظة (يتضمن: الملاذ)
 * ├── تحليل AI
 * ├── Neural Lab
 * ├── السكانر المتقدم
 * ├── تحليلات استراتيجية (يتضمن: اختبار الاستراتيجيات + بناء الاستراتيجية)
 * ├── الأخبار (يتضمن: التقارير)
 * ├── الأسواق التنبؤية
 * └── المزيد:
 *     ├── لوحة الصدارة
 *     ├── متابعة الحسابات
 *     ├── المجتمع الاجتماعي
 *     ├── الأجندة الاقتصادية
 *     ├── توثيق API
 *     ├── المصادقة الثنائية
 *     ├── مركز المساعدة
 *     └── الإعدادات (يتضمن: الإشعارات، المدفوعات، ربط الحسابات، الملف الشخصي)
 *
 * محذوف: مصفوفة الارتباط
 * منفصل: وكيل التداول → ويدجت عائم في السايدبار
 */

/* ─── Nav Link Type ─── */
interface NavLink {
  href: string
  label: string
  icon: any
  hash?: string
  children?: NavLink[]
}

const NAV_LINKS: NavLink[] = [
  // ── Main 8 (visible in nav bar) ──
  { href: '/dashboard',                        label: 'home',              icon: Home },
  { href: '/dashboard/portfolio',              label: 'portfolio',         icon: Wallet,
    children: [
      { href: '/dashboard/sanctuary',  label: 'sanctuary',         icon: Shield },
    ]
  },
  { href: '/dashboard/ai',                     label: 'aiAnalysis',        icon: Brain },
  { href: '/dashboard/neural',                  label: 'neuralLab',        icon: FlaskConical },
  { href: '/dashboard/scanner',                label: 'advancedScanner',   icon: ScanSearch },
  { href: '/dashboard/strategies',             label: 'strategicAnalysis', icon: BarChart2,
    children: [
      { href: '/dashboard/strategies/backtest',  label: 'strategyBacktest', icon: FlaskConical },
      { href: '/dashboard/strategies/builder',   label: 'strategyBuilder',  icon: Hammer },
    ]
  },
  { href: '/dashboard/news',                   label: 'news',              icon: Newspaper,
    children: [
      { href: '/dashboard/news',                label: 'news',              icon: Newspaper },
      { href: '/dashboard/news?tab=reports',    label: 'reports',           icon: BarChart3 },
    ]
  },
  { href: '/dashboard/prediction-market',      label: 'predictionMarket',  icon: Target },
  // ── More dropdown ──
  { href: '/dashboard/leaderboard',            label: 'leaderboard',       icon: Trophy },
  { href: '/dashboard/copy-trading',           label: 'copyTrading',       icon: Eye },
  { href: '/dashboard/social',                 label: 'social',            icon: Users },
  { href: '/dashboard/calendar',               label: 'calendar',          icon: CalendarDays },
  { href: '/dashboard/api-docs',               label: 'apiDocs',           icon: Code },
  { href: '/dashboard/security/2fa',           label: 'twoFactor',         icon: Shield },
  { href: '/dashboard/help',                   label: 'helpCenter',        icon: HelpCircle },
  { href: '/dashboard/settings',               label: 'settings',          icon: Settings },
]

/* ─── Helper: strip query params from href for pathname comparison ─── */
function stripQueryParams(href: string): string {
  return href.split('?')[0]
}

/* ─── Helper: check if a child link is active (handles query params) ─── */
function isChildActive(childHref: string, pathname: string): boolean {
  const childPath = stripQueryParams(childHref)
  // If the child href has no query params, do exact or prefix match
  if (!childHref.includes('?')) {
    return pathname === childHref || (childHref !== '/dashboard' && pathname.startsWith(childHref))
  }
  // If the child href has query params, match on pathname portion only
  // This allows /dashboard/news?tab=daily to be recognized when pathname is /dashboard/news
  return pathname === childPath || (childPath !== '/dashboard' && pathname.startsWith(childPath))
}

/* ─── Helper: check if any child is active ─── */
function isLinkActive(link: NavLink, pathname: string): boolean {
  if (pathname === link.href) return true
  if (link.href !== '/dashboard' && pathname.startsWith(link.href)) return true
  if (link.children) {
    return link.children.some(child => {
      if (child.href === '/dashboard') return false
      return isChildActive(child.href, pathname)
    })
  }
  return false
}

// BUG-005 FIX: Use a module-level ref instead of window namespace pollution
const _dropdownCleanupRef: { current: (() => void) | null } = { current: null }

function MoreDropdown({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}) {
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const t = useTranslations()

  useEffect(() => {
    if (open && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    // Use a small delay to avoid the click that opened the dropdown from closing it
    const timeoutId = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        if (
          dropdownRef.current?.contains(e.target as Node) ||
          anchorRef.current?.contains(e.target as Node)
        ) {
          return
        }
        onClose()
      }
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
      // BUG-005 FIX: Store cleanup in module-level ref, not window object
      _dropdownCleanupRef.current = () => {
        document.removeEventListener('mousedown', handleClick)
        document.removeEventListener('keydown', handleEsc)
      }
    }, 50)
    return () => {
      clearTimeout(timeoutId)
      if (_dropdownCleanupRef.current) {
        _dropdownCleanupRef.current()
        _dropdownCleanupRef.current = null
      }
    }
  }, [open, onClose, anchorRef])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div ref={dropdownRef} style={{
      position: 'fixed',
      top: pos.top,
      right: pos.right,
      background: 'rgba(26, 29, 41, 0.95)',
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
      border: '1px solid rgba(0,212,255,0.15)',
      borderRadius: 14,
      padding: '6px',
      minWidth: 200,
      zIndex: 9999,
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 20px rgba(0,212,255,0.06)',
      animation: 'fadeInSlideDown 0.18s ease-out',
    }}>
      {NAV_LINKS.slice(8).map((link) => {
        const { href, label, icon: Icon, children } = link
        const active = isLinkActive(link, pathname)
        return (
          <div key={href + '-' + label}>
            <SafeLink href={href} style={{ textDecoration: 'none' }} onClick={onClose}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif", fontSize: 13,
                color: active ? 'var(--accent)' : T.text2,
                background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
                fontWeight: active ? 700 : 500,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                if (!active) { el.style.background = 'rgba(0,212,255,0.06)'; el.style.color = T.text }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                if (!active) { el.style.background = 'transparent'; el.style.color = T.text2 }
              }}
              >
                <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                {t('dashboard.nav.' + label)}
                {children && <ChevronDown size={11} style={{ marginInlineEnd: 'auto', opacity: 0.5 }} />}
              </div>
            </SafeLink>
            {children && (
              <div style={{ paddingInlineEnd: 12 }}>
                {children.map((child) => {
                  const childActive = isChildActive(child.href, pathname)
                  return (
                    <SafeLink key={child.href + '-' + child.label} href={child.href} style={{ textDecoration: "none" }} onClick={onClose} >
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 14px 8px 10px', borderRadius: 6, cursor: 'pointer',
                        fontFamily: "'Cairo', sans-serif", fontSize: 12,
                        color: childActive ? 'var(--accent)' : T.text3,
                        background: childActive ? 'rgba(0,212,255,0.06)' : 'transparent',
                        fontWeight: childActive ? 600 : 400,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLDivElement
                        if (!childActive) { el.style.background = 'rgba(0,212,255,0.04)'; el.style.color = T.text2 }
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLDivElement
                        if (!childActive) { el.style.background = 'transparent'; el.style.color = T.text3 }
                      }}
                      >
                        <child.icon size={13} strokeWidth={childActive ? 2.5 : 1.5} />
                        {t('dashboard.nav.' + child.label)}
                      </div>
                    </SafeLink>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>,
    getPortalRoot()
  )
}

/* ─── Account Dropdown (Desktop) ─── */
const _accountDropdownCleanupRef: { current: (() => void) | null } = { current: null }

function AccountDropdown({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}) {
  const authUser = useAuthStore(state => state.user)
  const authLogout = useAuthStore(state => state.logout)
  const t = useTranslations()
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    
    // Boundary check for RTL layout:
    // Ensure the dropdown (width 220px) doesn't go off the right or left edge.
    // In RTL, the account button is on the far left.
    const dropdownWidth = 220;
    const padding = 12;
    
    let left = rect.left;
    
    // Safety: don't let it go past the right edge
    if (left + dropdownWidth > window.innerWidth - padding) {
      left = window.innerWidth - dropdownWidth - padding;
    }
    
    // Safety: don't let it go past the left edge
    if (left < padding) {
      left = padding;
    }

    setPos({
      top: rect.bottom + 4,
      left: left,
    })
  }, [anchorRef])

  useEffect(() => {
    if (open) {
      updatePosition()
    }
  }, [open, updatePosition])

  // Recalculate position on scroll/resize
  useEffect(() => {
    if (!open) return
    const handleUpdate = () => updatePosition()
    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)
    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const timeoutId = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        if (
          dropdownRef.current?.contains(e.target as Node) ||
          anchorRef.current?.contains(e.target as Node)
        ) return
        onClose()
      }
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
      _accountDropdownCleanupRef.current = () => {
        document.removeEventListener('mousedown', handleClick)
        document.removeEventListener('keydown', handleEsc)
      }
    }, 50)
    return () => {
      clearTimeout(timeoutId)
      if (_accountDropdownCleanupRef.current) {
        _accountDropdownCleanupRef.current()
        _accountDropdownCleanupRef.current = null
      }
    }
  }, [open, onClose, anchorRef])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div ref={dropdownRef} style={{
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      background: 'rgba(26, 29, 41, 0.95)',
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
      border: '1px solid rgba(0,212,255,0.15)',
      borderRadius: 14,
      padding: '6px',
      minWidth: 220,
      zIndex: 9999,
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 20px rgba(0,212,255,0.06)',
      animation: 'fadeInSlideDown 0.18s ease-out',
    }}>
      {/* User Info Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 4,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00d4ff, #0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(0,212,255,0.2)',
          }}>
            <User size={16} color="#fff" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700,
              color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{authUser?.displayName || authUser?.email?.split('@')[0] || t('common.user')}</div>
            {authUser?.email && (
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: T.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{authUser.email}</div>
            )}
          </div>
        </div>
        {authUser?.tier && (
          <div style={{
            display: 'inline-block', fontSize: 9, fontWeight: 700,
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(0,212,255,0.10)', color: '#00d4ff',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em',
          }}>{authUser.tier}</div>
        )}
      </div>

      {/* Menu Items */}
      <SafeLink href="/dashboard/settings" style={{ textDecoration: "none" }} onClick={onClose} >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif", fontSize: 13,
          color: T.text2, fontWeight: 500, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; e.currentTarget.style.color = T.text }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2 }}
        >
          <Settings size={15} strokeWidth={2} />
          {t('common.settings')}
        </div>
      </SafeLink>

      <SafeLink href="/dashboard/portfolio" style={{ textDecoration: "none" }} onClick={onClose} >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif", fontSize: 13,
          color: T.text2, fontWeight: 500, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.06)'; e.currentTarget.style.color = T.text }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2 }}
        >
          <UserCircle size={15} strokeWidth={2} />
          {t('common.accountInfo')}
        </div>
      </SafeLink>

      {/* Logout */}
      <div
        onClick={authLogout}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif", fontSize: 13,
          color: '#FF4757', fontWeight: 500, transition: 'all 0.15s',
          borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.08)'; e.currentTarget.style.color = '#FF6B7A' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#FF4757' }}
      >
        <LogOut size={15} strokeWidth={2} />
        {t('common.logout')}
      </div>
    </div>,
    getPortalRoot()
  )
}

/* ─── Sub-section Flyout Dropdown (for main nav items with children) ─── */
const _subNavCleanupRef: { current: (() => void) | null } = { current: null }

function SubNavDropdown({
  open,
  onClose,
  anchorEl,
  items,
  onDropdownEnter,
  onDropdownLeave,
}: {
  open: boolean
  onClose: () => void
  anchorEl: HTMLDivElement | null
  items: NavLink[]
  onDropdownEnter?: () => void
  onDropdownLeave?: () => void
}) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const t = useTranslations()

  // Compute position from anchorEl (not stored in state to avoid cascading renders)
  const pos = (() => {
    if (open && anchorEl) {
      const rect = anchorEl.getBoundingClientRect()
      return { top: rect.bottom + 2, right: window.innerWidth - rect.right }
    }
    return { top: 0, right: 0 }
  })()

  useEffect(() => {
    if (!open) return
    const timeoutId = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        if (
          dropdownRef.current?.contains(e.target as Node) ||
          anchorEl?.contains(e.target as Node)
        ) return
        onClose()
      }
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
      _subNavCleanupRef.current = () => {
        document.removeEventListener('mousedown', handleClick)
        document.removeEventListener('keydown', handleEsc)
      }
    }, 50)
    return () => {
      clearTimeout(timeoutId)
      if (_subNavCleanupRef.current) {
        _subNavCleanupRef.current()
        _subNavCleanupRef.current = null
      }
    }
  }, [open, onClose, anchorEl])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={dropdownRef}
      onMouseEnter={onDropdownEnter}
      onMouseLeave={onDropdownLeave}
      style={{
      position: 'fixed',
      top: pos.top,
      right: pos.right,
      background: 'rgba(26, 29, 41, 0.95)',
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
      border: '1px solid rgba(0,212,255,0.15)',
      borderRadius: 12,
      padding: '6px',
      minWidth: 180,
      zIndex: 9999,
      boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 16px rgba(0,212,255,0.06)',
      animation: 'fadeInSlideDown 0.15s ease-out',
    }}>
      {items.map((child) => {
        const childActive = isChildActive(child.href, pathname)
        const ChildIcon = child.icon
        return (
          <SafeLink key={child.href + '-' + child.label} href={child.href} style={{ textDecoration: "none" }} onClick={onClose} >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Cairo', sans-serif", fontSize: 12.5,
              color: childActive ? 'var(--accent)' : T.text2,
              background: childActive ? 'rgba(0,212,255,0.08)' : 'transparent',
              fontWeight: childActive ? 700 : 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLDivElement
              if (!childActive) { el.style.background = 'rgba(0,212,255,0.06)'; el.style.color = T.text }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLDivElement
              if (!childActive) { el.style.background = 'transparent'; el.style.color = T.text2 }
            }}
            >
              <ChildIcon size={14} strokeWidth={childActive ? 2.5 : 2} />
              {t('dashboard.nav.' + child.label)}
            </div>
          </SafeLink>
        )
      })}
    </div>,
    getPortalRoot()
  )
}

function MainNav({ mode, onModeChange }: { mode: TradingMode, onModeChange: (m: TradingMode) => void }) {
  const t = useTranslations()
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const [subNavOpen, setSubNavOpen] = useState<string | null>(null)
  const [subNavAnchor, setSubNavAnchor] = useState<HTMLDivElement | null>(null)
  const subNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCloseMore = useCallback(() => setMoreOpen(false), [])
  const handleCloseAccount = useCallback(() => setAccountOpen(false), [])
  const handleCloseSubNav = useCallback(() => { setSubNavOpen(null); setSubNavAnchor(null) }, [])

  const authLogout = useAuthStore(state => state.logout)

  const handleSubNavEnter = useCallback((href: string, el: HTMLDivElement | null) => {
    if (subNavTimerRef.current) clearTimeout(subNavTimerRef.current)
    setSubNavOpen(href)
    setSubNavAnchor(el)
  }, [])

  const handleSubNavLeave = useCallback(() => {
    subNavTimerRef.current = setTimeout(() => { setSubNavOpen(null); setSubNavAnchor(null) }, 200)
  }, [])

  // Mode-specific styling
  const modeConfig: Record<TradingMode, { accent: string }> = {
    trader:   { accent: '#00d4ff' },
    investor: { accent: '#10b981' },
    ai:       { accent: '#a78bfa' },
  }

  return (
    <div style={{
      height: H_NAV,
      backdropFilter: 'blur(20px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
      background: 'rgba(11, 14, 20, 0.88)',
      display: 'flex', alignItems: 'center',
      padding: '0 8px', gap: 0,
      overflow: 'hidden',
      borderEndStartRadius: ORB_D / 2,
    }}>
      {NAV_LINKS.slice(0, 8).map((link) => {
        const { href, label, icon: Icon, children } = link
        const active = isLinkActive(link, pathname)
        const hasChildren = children && children.length > 0
        const isSubOpen = subNavOpen === href

        return (
          <div
            key={href}
            style={{ position: 'relative', flexShrink: 0 }}
            onMouseEnter={(e) => { if (hasChildren) handleSubNavEnter(href, e.currentTarget) }}
            onMouseLeave={() => { if (hasChildren) handleSubNavLeave() }}
          >
            <SafeLink href={href} style={{ textDecoration: 'none' }}>
              <div
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(0,212,255,0.08)'
                    e.currentTarget.style.border = '1px solid rgba(0,212,255,0.15)'
                    e.currentTarget.style.color = T.text
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.border = '1px solid transparent'
                    e.currentTarget.style.color = T.text2
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: hasChildren ? 3 : 4,
                  padding: '0 8px', borderRadius: 6, cursor: 'pointer',
                  height: 32,
                  background: active ? 'rgba(0,212,255,0.12)' : 'transparent',
                  border: active ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
                  color: active ? 'var(--accent)' : T.text2,
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: 11, fontWeight: active ? 800 : 500,
                  whiteSpace: 'nowrap', transition: 'all 0.18s',
                }}
              >
                <Icon size={14} strokeWidth={active ? 2.5 : 2} />
                {t('dashboard.nav.' + label)}
                {hasChildren && (
                  <ChevronDown size={10} style={{
                    transform: isSubOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s', opacity: 0.6,
                  }} />
                )}
              </div>
            </SafeLink>
          </div>
        )
      })}

      {/* SubNavDropdown rendered once at nav level, positioned via anchorEl */}
      {(() => {
        const openLink = NAV_LINKS.slice(0, 8).find(l => l.href === subNavOpen && l.children)
        if (!openLink?.children) return null
        return (
          <SubNavDropdown
            open={!!subNavOpen}
            onClose={handleCloseSubNav}
            anchorEl={subNavAnchor}
            items={openLink.children}
            onDropdownEnter={() => {
              if (subNavTimerRef.current) clearTimeout(subNavTimerRef.current)
            }}
            onDropdownLeave={handleCloseSubNav}
          />
        )
      })()}

      <div ref={moreRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          onMouseEnter={e => {
            if (!moreOpen) {
              e.currentTarget.style.background = 'rgba(0,212,255,0.08)'
              e.currentTarget.style.border = '1px solid rgba(0,212,255,0.15)'
              e.currentTarget.style.color = T.text
            }
          }}
          onMouseLeave={e => {
            if (!moreOpen) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.border = '1px solid transparent'
              e.currentTarget.style.color = T.text2
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '0 8px', cursor: 'pointer', height: 32,
            background: moreOpen ? 'rgba(0,212,255,0.12)' : 'transparent',
            border: moreOpen ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
            borderRadius: 6,
            color: moreOpen ? 'var(--accent)' : T.text2,
            fontFamily: "'Cairo', sans-serif", fontSize: 11,
            transition: 'all 0.18s',
          }}
        >
          <MoreHorizontal size={14} />
          {t('common.more')}
          <ChevronDown size={11} style={{
            transform: moreOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }} />
        </button>
        <MoreDropdown
          open={moreOpen}
          onClose={handleCloseMore}
          anchorRef={moreRef}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Mode Switcher (Trader / Investor / AI) */}
      <div style={{
         display: 'flex', background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 8,
         border: '1px solid var(--card-border)', marginInlineStart: 6
      }}>
         {([['trader', t('common.trader')], ['investor', t('common.investor')], ['ai', 'AI']] as [TradingMode, string][]).map(([m, label]) => {
           const cfg = modeConfig[m]
           return (
             <button
               key={m}
               onClick={() => onModeChange(m)}
               style={{
                  padding: '5px 10px', fontSize: 9.5, fontWeight: m === mode ? 800 : 500,
                  background: m === mode ? cfg.accent : 'transparent',
                  color: m === mode ? '#000' : 'var(--muted)',
                  borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--mono)', transition: '0.2s',
                  textTransform: 'uppercase',
                  boxShadow: m === mode ? `0 0 8px ${cfg.accent}40` : 'none',
               }}
             >
               {label}
             </button>
           )
         })}
      </div>

      {/* LED Connection Indicator — REMOVED to save navbar space ("مباشر" / "Live" label) */}

      <div ref={accountRef} style={{ position: 'relative', flexShrink: 0 }}>
        <div
          onClick={() => setAccountOpen(!accountOpen)}
          onMouseEnter={e => {
            if (!accountOpen) {
              e.currentTarget.style.background = 'rgba(0,212,255,0.08)'
              e.currentTarget.style.border = '1px solid rgba(0,212,255,0.20)'
            }
          }}
          onMouseLeave={e => {
            if (!accountOpen) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)'
            }
          }}
          style={{
            display: 'flex', alignItems: 'center',
            gap: 6, cursor: 'pointer',
            padding: '0 10px', borderRadius: 16, height: 32,
            background: accountOpen ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
            border: accountOpen ? '1px solid rgba(0,212,255,0.30)' : '1px solid rgba(255,255,255,0.10)',
            marginInlineStart: 6,
            transition: 'all 0.2s',
          }}
        >
          <User size={14} color="var(--accent)" />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: 'var(--foreground)', fontWeight: 800 }}>{t('common.myAccount')}</span>
          <ChevronDown size={12} style={{
            transform: accountOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s', color: T.text3,
          }} />
        </div>
        <AccountDropdown
          open={accountOpen}
          onClose={handleCloseAccount}
          anchorRef={accountRef}
        />
      </div>
    </div>
  )
}

/* ─── Dynamic Header Status LED ─── */
function HeaderStatusLED() {
  const t = useTranslations()
  // Derived boolean selector — only re-renders when live status actually changes
  const hasLive = useMarketStore((state) => {
    const entries = Object.values(state.quotes)
    return entries.length > 0 && entries.some(q => {
      const age = Date.now() - new Date(q.timestamp).getTime()
      return age < 120000
    })
  })
  
  const color = hasLive ? 'var(--success)' : T.amber
  const label = hasLive ? t('dashboard.header.connected') : t('dashboard.header.pending')
  
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginInlineStart: 12,
    }}>
      <div className="led-online" style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: hasLive ? '0 0 6px var(--success)' : '0 0 6px ' + T.amber,
      }} />
      <span style={{ fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>{label}</span>
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
@keyframes fadeInSlideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
header *            { scrollbar-width:none; -ms-overflow-style:none; }
header *::-webkit-scrollbar { display:none; }

@media (min-width: 1025px) {
  .logo-orb-mobile { display: none !important; }
  .mobile-header { display: none !important; }
}
@media (max-width: 1024px) {
  .desktop-header { display: none !important; }
  .mobile-header { display: flex !important; }
  .logo-orb { display: none !important; }
  .logo-orb-mobile { display: flex !important; }
  .mobile-news-ticker { display: none !important; }
}
`

/* ─── Mobile Nav Item (separate component for hook usage) ─── */
function MobileNavItem({ link, pathname, onClose }: { link: NavLink, pathname: string, onClose: () => void }) {
  const t = useTranslations()
  const { href, label, icon: Icon, children } = link
  const active = isLinkActive(link, pathname)
  const hasChildren = children && children.length > 0
  const [mobileExpanded, setMobileExpanded] = useState(false)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <SafeLink href={href} style={{ textDecoration: "none" }} onClick={onClose} >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', minHeight: 44,
            borderRadius: 10, background: active ? 'rgba(0,212,255,0.10)' : 'transparent',
            color: active ? 'var(--accent)' : T.text2,
            borderInlineStart: active ? '3px solid var(--accent)' : '3px solid transparent',
            fontSize: 14, fontWeight: 600, fontFamily: "'Cairo', sans-serif",
            transition: 'all 0.15s',
          }}>
            <Icon size={18} />
            {t('dashboard.nav.' + label)}
          </div>
        </SafeLink>
        {hasChildren && (
          <button
            onClick={() => setMobileExpanded(!mobileExpanded)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '8px 12px', color: T.text2, display: 'flex', alignItems: 'center',
            }}
          >
            <ChevronDown size={16} style={{
              transform: mobileExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }} />
          </button>
        )}
      </div>
      {hasChildren && mobileExpanded && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          paddingInlineEnd: 20, marginBottom: 4,
        }}>
          {children!.map((child) => {
            const childActive = isChildActive(child.href, pathname)
            const ChildIcon = child.icon
            return (
              <SafeLink key={child.href + '-' + child.label} href={child.href} style={{ textDecoration: "none" }} onClick={onClose} >
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', minHeight: 40,
                  borderRadius: 8, background: childActive ? 'rgba(0,212,255,0.08)' : 'transparent',
                  color: childActive ? 'var(--accent)' : T.text3,
                  borderInlineStart: childActive ? '2px solid var(--accent)' : '2px solid transparent',
                  fontSize: 12.5, fontWeight: childActive ? 600 : 400,
                  fontFamily: "'Cairo', sans-serif", transition: 'all 0.15s',
                }}>
                  <ChildIcon size={15} strokeWidth={childActive ? 2.5 : 1.5} />
                  {t('dashboard.nav.' + child.label)}
                </div>
              </SafeLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Symbols used by AppHeader's market state orb ─── */
const ORBS = ['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD']

/* ══ Root export ══ */
export function AppHeader() {
  const t = useTranslations()
  useScopedStyle(KF)
  const [menuOpen, setMenuOpen] = useState(false)
  const mode = useDashboardStore(state => state.mode)
  const setMode = useDashboardStore(state => state.setMode)
  const pathname = usePathname()

  const handleModeChange = (m: TradingMode) => {
    setMode(m)
  }

  const authLogout = useAuthStore(state => state.logout)

  // Only subscribe to ORBS symbol quotes — prevents re-renders from other symbol updates
  const globalQuotes = useMarketStore(
    useShallow((state) => {
      const result: Record<string, (typeof state.quotes)[string]> = {}
      for (const s of ORBS) {
        if (state.quotes[s]) result[s] = state.quotes[s]
      }
      return result
    })
  )
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
      {/* Mobile Sidebar */}
      {menuOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          zIndex: 1000, backdropFilter: 'blur(8px)'
        }} onClick={() => setMenuOpen(false)}>
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(280px, 85vw)',
            background: 'rgba(26,29,41,0.95)', borderInlineStart: `1px solid rgba(0,212,255,0.12)`,
            display: 'flex', flexDirection: 'column', padding: '20px',
            overflowY: 'auto',
            animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }} className="custom-scrollbar" onClick={e => e.stopPropagation()}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>{t('common.menu')}</span>
                <XIcon size={24} color={T.text} onClick={() => setMenuOpen(false)} style={{ cursor: 'pointer' }} />
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {NAV_LINKS.map((link) => (
                  <MobileNavItem
                    key={link.href + '-' + link.label}
                    link={link}
                    pathname={pathname ?? ''}
                    onClose={() => setMenuOpen(false)}
                  />
                ))}
             </div>
             {/* Mode Switcher + Account (mobile) */}
             <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid rgba(0,212,255,0.10)`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  {([['trader', t('common.trader')], ['investor', t('common.investor')], ['ai', 'AI']] as [TradingMode, string][]).map(([m, label]) => {
                    const accentMap: Record<TradingMode, string> = { trader: '#00d4ff', investor: '#10b981', ai: '#a78bfa' }
                    return (
                      <button key={m} onClick={() => handleModeChange(m)} style={{
                        flex: 1, padding: '8px 10px', fontSize: 10, fontWeight: m === mode ? 800 : 500,
                        background: m === mode ? accentMap[m] : 'transparent',
                        color: m === mode ? '#000' : T.text2,
                        borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontFamily: "'Cairo', sans-serif", transition: '0.2s',
                        boxShadow: m === mode ? `0 0 8px ${accentMap[m]}40` : 'none',
                      }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
                <SafeLink href="/dashboard/settings" style={{ textDecoration: "none" }} onClick={() => setMenuOpen(false)} >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    borderRadius: 10, background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(0,212,255,0.10)', cursor: 'pointer',
                  }}>
                    <User size={18} color="var(--accent)" />
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, color: T.text, fontWeight: 700 }}>{t('common.myAccount')}</span>
                  </div>
                </SafeLink>
                <div
                  onClick={authLogout}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                    borderRadius: 10, background: 'rgba(255,71,87,0.06)',
                    border: '1px solid rgba(255,71,87,0.12)', cursor: 'pointer',
                    color: '#FF4757',
                  }}
                >
                  <LogOut size={18} />
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, fontWeight: 700 }}>{t('common.logout')}</span>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Desktop Header Layout */}
      <header className="desktop-header" style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: H_TOTAL,
        overflow: 'visible',
      }}>
        <LogoCircle state={marketState} />
        <div style={{
          height: '100%', marginInlineStart: ORB_GAP,
          display: 'flex', flexDirection: 'column',
        }}>
          <NewsTicker />
          <CurrencyTicker />
          <MainNav mode={mode} onModeChange={handleModeChange} />
        </div>
      </header>

      {/* Mobile Header Layout */}
      <header className="mobile-header" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(11, 14, 20, 0.95)',
        borderBottom: `1px solid rgba(0,212,255,0.10)`,
        backdropFilter: 'blur(24px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        {/* Mobile top row: hamburger + brand + ticker + orb */}
        <div style={{
          display: 'flex', alignItems: 'center', height: MOBILE_HEADER_H,
          padding: '0 10px', justifyContent: 'space-between', gap: 6,
        }}>
          <button onClick={() => setMenuOpen(true)} style={{ background: 'transparent', border: 'none', color: T.text, cursor: 'pointer', minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexShrink: 0 }}>
             <Menu size={22} />
          </button>

          <SafeLink href="/dashboard" style={{ textDecoration: "none" }} >
             <LogoCircle state={marketState} size="mobile" />
             <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
               <span style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 900, fontSize: 15, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{t('common.brand')}</span>
               <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: '#00C8FF', letterSpacing: '0.12em', opacity: 0.85, lineHeight: 1 }}>{t('common.brandSub')}</span>
             </div>
          </SafeLink>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
             <CurrencyTicker isMobile />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
             <LocaleSwitcher variant="header" />
             <NotificationCenter />
          </div>
        </div>
        {/* Mobile news ticker (hidden on very small screens via CSS) */}
        <div className="mobile-news-ticker" style={{
          height: 24, overflow: 'hidden',
          background: 'linear-gradient(90deg, #FFFFFF, #F8FAFC, #FFFFFF)',
          borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center',
        }}>
          <MobileNewsTicker />
        </div>
      </header>
    </>
  )
}
