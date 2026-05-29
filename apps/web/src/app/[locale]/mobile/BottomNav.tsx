'use client'
import { usePathname, useRouter } from '@/i18n/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'

const CYAN = '#00B4FF'
const DIM = 'rgba(255,255,255,0.28)'

const SvgHome = ({ a }: { a: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5}
      fill={a ? 'rgba(0,180,255,0.12)' : 'none'} strokeLinejoin="round" />
    <path d="M9 21v-8h6v8" stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5} strokeLinecap="round" />
  </svg>
)

const SvgChart = ({ a }: { a: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <polyline points="3,18 8,11 13,14 21,5"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" />
    {a && <>
      <circle cx="8" cy="11" r="2" fill={CYAN} />
      <circle cx="13" cy="14" r="2" fill={CYAN} />
      <circle cx="21" cy="5" r="2" fill={CYAN} />
    </>}
    <path d="M3 21h18" stroke={a ? CYAN : DIM} strokeWidth="1" opacity="0.2" />
  </svg>
)

const SvgTrade = ({ a }: { a: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M13 2L4 14h7l-1.5 8L20 10h-7L13 2z"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5} strokeLinejoin="round"
      fill={a ? 'rgba(0,180,255,0.14)' : 'none'} />
  </svg>
)

const SvgPositions = ({ a }: { a: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="7" width="20" height="13" rx="2"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5}
      fill={a ? 'rgba(0,180,255,0.1)' : 'none'} />
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5} />
    <circle cx="12" cy="14" r="2"
      fill={a ? CYAN : 'none'} stroke={a ? 'none' : DIM} strokeWidth="1.5" />
  </svg>
)

const SvgAI = ({ a }: { a: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3.5"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5}
      fill={a ? 'rgba(0,180,255,0.15)' : 'none'} />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"
      stroke={a ? CYAN : DIM} strokeWidth={a ? 2 : 1.5} strokeLinecap="round" />
    <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
      stroke={a ? CYAN : DIM} strokeWidth="1.2" strokeLinecap="round" opacity={a ? 0.55 : 0.35} />
  </svg>
)

const TABS = [
  { href: '/mobile',           Icon: SvgHome,      label: 'الرئيسية' },
  { href: '/mobile/chart',     Icon: SvgChart,     label: 'الشارت'   },
  { href: '/mobile/trade',     Icon: SvgTrade,     label: 'تداول'    },
  { href: '/mobile/positions', Icon: SvgPositions, label: 'صفقاتي'   },
  { href: '/mobile/ai',        Icon: SvgAI,        label: 'الذكاء'   },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const positions = usePositionsStore(s => s.positions)

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(58px + env(safe-area-inset-bottom, 0px))',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      background: 'rgba(5,7,13,0.82)',
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      boxShadow: '0 -1px 0 rgba(0,180,255,0.05), inset 0 1px 0 rgba(255,255,255,0.04)',
      zIndex: 100,
    }}>
      {TABS.map(({ href, Icon, label }) => {
        const active = href === '/mobile'
          ? pathname === '/mobile'
          : (pathname?.startsWith(href) ?? false)
        const badge = href === '/mobile/positions' && positions.length > 0 ? positions.length : 0

        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            aria-label={label}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 3, padding: '6px 0',
              position: 'relative',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Active line */}
            {active && (
              <div style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 26, height: 2,
                background: CYAN,
                borderRadius: '0 0 2px 2px',
                boxShadow: `0 0 8px ${CYAN}99`,
              }} />
            )}

            {/* Icon */}
            <div style={{
              width: 36, height: 36, borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'rgba(0,180,255,0.09)' : 'transparent',
              transition: 'background 0.15s',
            }}>
              <Icon a={active} />
            </div>

            {/* Label */}
            <span style={{
              fontSize: 9,
              fontWeight: active ? 800 : 500,
              color: active ? CYAN : DIM,
              fontFamily: "'Cairo', sans-serif",
              letterSpacing: '0.2px',
              lineHeight: 1,
            }}>
              {label}
            </span>

            {/* Badge */}
            {badge > 0 && (
              <div style={{
                position: 'absolute', top: 4, right: '50%',
                transform: 'translateX(14px)',
                minWidth: 16, height: 16,
                background: '#FF3B5C',
                borderRadius: 8,
                fontSize: 8, fontWeight: 800, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
                border: '2px solid #05070D',
                fontFamily: 'monospace',
              }}>
                {badge}
              </div>
            )}
          </button>
        )
      })}
    </nav>
  )
}
