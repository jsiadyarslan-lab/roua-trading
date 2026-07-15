'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronRight } from 'lucide-react';

/**
 * V2-Robinhood: Real hero rewrite (JSX restructure, not cosmetic).
 *
 * V1 structure (centered SaaS stack):
 *   badge -> h1 (brand) -> typewriter subtitle -> 2 CTA buttons
 *   -> 4 floating stat cards -> scroll hint
 *
 * V2 structure (Robinhood mobile-app home screen):
 *   live ticker strip -> bold headline + inline trust signals
 *   -> single primary CTA + ghost link -> floating product preview card
 *   (chart + buy/sell pills)
 *
 * Information architecture change:
 *   - First thing the user sees is now LIVE MARKET DATA (ticker tape),
 *     not a brand badge. Proves "this is a trading app" instantly.
 *   - Headline is one short benefit ("Trade smart.") + one supporting line,
 *     not a brand wordmark + verbose typewriter paragraph.
 *   - Trust signals are inline (3 stats separated by dots), not 4 big cards.
 *   - The product is shown, not described: a floating card renders an actual
 *     SVG price chart with Buy/Sell buttons (Robinhood asset-detail screen).
 *   - Only ONE primary CTA. "Explore" demoted to a ghost text link.
 *
 * Mobile-first: at 375px everything stacks vertically (chart card below CTA).
 * Desktop (>=900px): 2-column split, text left + chart card right.
 */

type HeroKey = 'aiModels' | 'assetClasses' | 'dailyMonitoring';

interface TickerItem {
  symbol: string;
  change: string;
  up: boolean;
}

interface TrustStat {
  key: HeroKey;
  value: string;
}

interface ChartPoint {
  x: number;
  y: number;
}

const TICKER_ITEMS: readonly TickerItem[] = [
  { symbol: 'BTC/USD', change: '+2.34%', up: true },
  { symbol: 'ETH/USD', change: '-1.20%', up: false },
  { symbol: 'EUR/USD', change: '+0.45%', up: true },
  { symbol: 'GOLD', change: '+0.95%', up: true },
  { symbol: 'NASDAQ', change: '+1.15%', up: true },
  { symbol: 'AAPL', change: '+1.85%', up: true },
  { symbol: 'S&P500', change: '+0.67%', up: true },
  { symbol: 'OIL', change: '-0.80%', up: false },
  { symbol: 'GBP/JPY', change: '-0.12%', up: false },
  { symbol: 'USD/JPY', change: '+0.33%', up: true },
];

const TRUST_STATS: readonly TrustStat[] = [
  { key: 'aiModels', value: '8' },
  { key: 'assetClasses', value: '6' },
  { key: 'dailyMonitoring', value: '24/7' },
];

const TIMEFRAMES = ['1H', '1D', '1W', '1M', '1Y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

// Raw chart values (any monotonically-fluctuating series works; we normalize).
const CHART_VALUES: readonly number[] = [
  12, 22, 16, 28, 20, 34, 26, 40, 32, 48, 42, 58, 50, 66, 60, 78, 72, 88,
];

const CHART_W = 320;
const CHART_H = 120;

function computeChart(): { line: string; area: string; last: ChartPoint } {
  const max = Math.max(...CHART_VALUES);
  const min = Math.min(...CHART_VALUES);
  const range = max - min || 1;
  const step = CHART_W / (CHART_VALUES.length - 1);
  const pad = 6;

  const points: ChartPoint[] = CHART_VALUES.map((v, i) => ({
    x: i * step,
    y: CHART_H - ((v - min) / range) * (CHART_H - pad * 2) - pad,
  }));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${CHART_H} L 0 ${CHART_H} Z`;

  return { line, area, last: points[points.length - 1] };
}

export default function HeroSection() {
  const t = useTranslations('landing.hero');
  const tc = useTranslations('common');
  const prefersReduced = useReducedMotion();
  const reduceMotion = prefersReduced ?? false;
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');

  const chart = computeChart();

  return (
    <section
      className="hero"
      style={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        padding:
          'calc(5rem + env(safe-area-inset-top)) 1rem calc(2rem + env(safe-area-inset-bottom))',
        overflow: 'hidden',
      }}
    >
      {/* ━━━ 1. LIVE TICKER STRIP (was: AI badge) ━━━
          Robinhood mobile "Market Movers" — horizontal scrolling prices
          with masked edges. direction:ltr keeps the ticker visually
          consistent in both RTL (Arabic) and LTR (English). */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        aria-label={t('tickerLabel')}
        style={{
          position: 'relative',
          width: '100%',
          overflow: 'hidden',
          maskImage:
            'linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)',
          borderTop: '1px solid var(--border-glass)',
          borderBottom: '1px solid var(--border-glass)',
          padding: '0.55rem 0',
          marginBottom: '2.5rem',
          direction: 'ltr',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 'max-content',
            animation: reduceMotion
              ? undefined
              : 'roua-ticker-scroll 42s linear infinite',
          }}
        >
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0 1.1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                }}
              >
                {item.symbol}
              </span>
              <span
                style={{
                  color: item.up ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.up ? '▲' : '▼'} {item.change}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ━━━ 2. HEADLINE + TRUST + CTA + PRODUCT CARD ━━━
          Mobile: single column, card below CTA.
          Desktop (>=900px): 2-column split via .roua-hero-grid media query. */}
      <div
        className="roua-hero-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '2.5rem',
          width: '100%',
          maxWidth: '1140px',
          margin: '0 auto',
          flex: 1,
          alignItems: 'center',
        }}
      >
        {/* LEFT COLUMN: headline + trust + CTA */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            minWidth: 0,
          }}
        >
          {/* Bold massive headline — gradient, single line, no badge above */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.6rem, 9vw, 4.5rem)',
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: '-0.035em',
              margin: 0,
              textAlign: 'start',
              background: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              filter: 'drop-shadow(0 0 28px rgba(16, 185, 129, 0.28))',
            }}
          >
            {t('punchLine')}
          </motion.h1>

          {/* Supporting line (replaces verbose typewriter subtitle) */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(0.98rem, 2.6vw, 1.15rem)',
              lineHeight: 1.55,
              color: 'var(--text-secondary)',
              margin: 0,
              maxWidth: '34ch',
            }}
          >
            {t('punchSub')}
          </motion.p>

          {/* Inline trust signals — 3 minimal stats, dot-separated
              (replaces 4 floating stat cards) */}
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem 0.85rem',
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              fontWeight: 500,
            }}
          >
            {TRUST_STATS.map((stat, i) => (
              <li
                key={stat.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span
                  style={{
                    color: 'var(--accent-emerald)',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.95rem',
                  }}
                >
                  {stat.value}
                </span>
                <span>{t(stat.key)}</span>
                {i < TRUST_STATS.length - 1 && (
                  <span
                    aria-hidden
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: 'var(--text-tertiary)',
                      marginInlineStart: '0.45rem',
                    }}
                  />
                )}
              </li>
            ))}
          </motion.ul>

          {/* CTA — single primary, full-width on mobile.
              "Explore" demoted to a ghost text link below (not a button). */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '0.6rem',
              marginTop: '0.5rem',
              maxWidth: '440px',
            }}
          >
            <a
              href="/login"
              className="btn-glow"
              style={{
                width: '100%',
                padding: '1.05rem 1.5rem',
                fontSize: '1.05rem',
                minHeight: '56px',
              }}
            >
              <span>{t('cta')}</span>
              <ArrowUpRight size={18} />
            </a>
            <a
              href="#features"
              className="roua-ghost-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                padding: '0.5rem',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'color 200ms ease',
              }}
            >
              {t('explore')}
              <ChevronRight
                size={15}
                aria-hidden
                style={{ transform: 'var(--roua-chevron-rotate, none)' }}
              />
            </a>
          </motion.div>
        </div>

        {/* RIGHT COLUMN: floating product preview card — Robinhood asset-detail
            screen: symbol header, live price, SVG chart, timeframe tabs,
            Buy/Sell pills. This is the "show, don't tell" element. */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="glass-card glass-card-elevated"
          style={{
            position: 'relative',
            padding: '1.25rem 1.25rem 1.5rem',
            borderRadius: 'var(--radius-2xl)',
            maxWidth: '440px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {/* Card header: symbol + price + change + LIVE pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.75rem',
              marginBottom: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.15rem',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #F7931A, #FFB84D)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    color: '#1A1206',
                    flexShrink: 0,
                  }}
                >
                  &#8383;
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {t('chartSymbol')}
                </span>
              </div>
              <span
                className="roua-price-flicker"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.6rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                  marginTop: '0.45rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('chartPrice')}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  color: 'var(--success)',
                  fontWeight: 600,
                  marginTop: '0.1rem',
                }}
              >
                {t('chartChange')} · {t('chartChangeLabel')}
              </span>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: 'var(--accent-emerald)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent-emerald)',
                  boxShadow: '0 0 8px var(--accent-emerald-glow)',
                  animation: reduceMotion
                    ? undefined
                    : 'roua-pulse-dot 1.6s ease-in-out infinite',
                }}
              />
              {t('liveTag')}
            </span>
          </div>

          {/* Chart SVG — area + line + end-of-line dot */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 0,
              paddingBottom: '42%',
              marginBottom: '0.85rem',
            }}
          >
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible',
              }}
              aria-hidden
            >
              <defs>
                <linearGradient id="roua-chart-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="roua-chart-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              {/* grid lines */}
              {[0.25, 0.5, 0.75].map((p) => (
                <line
                  key={p}
                  x1="0"
                  y1={CHART_H * p}
                  x2={CHART_W}
                  y2={CHART_H * p}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="0.5"
                  strokeDasharray="2 4"
                />
              ))}
              <path d={chart.area} fill="url(#roua-chart-area)" />
              <motion.path
                d={chart.line}
                fill="none"
                stroke="url(#roua-chart-line)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.4, delay: 0.6, ease: 'easeInOut' }}
              />
              <circle
                cx={chart.last.x}
                cy={chart.last.y}
                r="3.5"
                fill="#10B981"
                style={{
                  filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.7))',
                }}
              />
            </svg>
          </div>

          {/* Timeframe tabs (1H / 1D / 1W / 1M / 1Y) */}
          <div
            role="tablist"
            aria-label="Timeframe"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.25rem',
              padding: '0.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.04)',
              marginBottom: '0.9rem',
            }}
          >
            {TIMEFRAMES.map((tf) => {
              const active = tf === activeTimeframe;
              return (
                <button
                  key={tf}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTimeframe(tf)}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0',
                    border: 'none',
                    background: active ? 'var(--surface-3)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
                  }}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          {/* Buy / Sell — Robinhood signature green/red split pills */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '0.85rem 1rem',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              {tc('buy')}
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '0.85rem 1rem',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tc('sell')}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Scoped keyframes + responsive layout (unique class names to avoid
          collisions with landing.css). Injected once per render — React
          dedupes identical <style> children. */}
      <style>{`
        @keyframes roua-ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes roua-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes roua-price-tick {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.92; }
        }
        .roua-price-flicker {
          animation: roua-price-tick 2.4s ease-in-out infinite;
        }
        .roua-ghost-link:hover {
          color: var(--text-primary);
        }
        @media (min-width: 900px) {
          .roua-hero-grid {
            grid-template-columns: 1.05fr 0.95fr !important;
            gap: 3.5rem !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .roua-price-flicker { animation: none; }
        }
        /* RTL: flip the ghost-link chevron so it points "forward" in Arabic */
        [dir="rtl"] .roua-ghost-link svg {
          transform: scaleX(-1);
        }
        [dir="rtl"] .roua-ghost-link:hover svg {
          transform: scaleX(-1) translateX(2px);
        }
      `}</style>
    </section>
  );
}
