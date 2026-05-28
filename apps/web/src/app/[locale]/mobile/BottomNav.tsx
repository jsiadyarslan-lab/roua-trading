'use client'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePositionsStore } from '@/hooks/usePositionsStore'

const C = { active: '#00B4FF', inactive: 'rgba(255,255,255,0.3)', bg: 'rgba(6,10,20,0.85)', border: 'rgba(255,255,255,0.07)' }

const Home = ({ a }: { a: boolean }) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} fill={a?'rgba(0,180,255,0.12)':'none'} strokeLinejoin="round"/><path d="M9 21v-8h6v8" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} strokeLinecap="round"/></svg>

const Chart = ({ a }: { a: boolean }) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><polyline points="3,18 8,12 13,15 21,6" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} strokeLinecap="round" strokeLinejoin="round"/>{a&&<><circle cx="8" cy="12" r="2" fill={C.active}/><circle cx="13" cy="15" r="2" fill={C.active}/><circle cx="21" cy="6" r="2" fill={C.active}/></>}<path d="M3 21h18" stroke={a?C.active:C.inactive} strokeWidth="1" opacity="0.25"/></svg>

const Trade = ({ a }: { a: boolean }) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1.5 8L20 10h-7L13 2z" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} strokeLinejoin="round" fill={a?'rgba(0,180,255,0.12)':'none'}/></svg>

const Positions = ({ a }: { a: boolean }) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="13" rx="2" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} fill={a?'rgba(0,180,255,0.1)':'none'}/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5}/><circle cx="12" cy="14" r="2" fill={a?C.active:'none'} stroke={a?'none':C.inactive} strokeWidth="1.5"/></svg>

const AI = ({ a }: { a: boolean }) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.5" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} fill={a?'rgba(0,180,255,0.15)':'none'}/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={a?C.active:C.inactive} strokeWidth={a?2:1.5} strokeLinecap="round"/><path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke={a?C.active:C.inactive} strokeWidth={a?1.5:1} strokeLinecap="round" opacity={a?0.6:0.4}/></svg>

const TABS = [
  { href: '/mobile',          Icon: Home,      key: 'home'      },
  { href: '/mobile/chart',    Icon: Chart,     key: 'chart'     },
  { href: '/mobile/trade',    Icon: Trade,     key: 'trade'     },
  { href: '/mobile/positions',Icon: Positions, key: 'positions' },
  { href: '/mobile/ai',       Icon: AI,        key: 'ai'        },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('mobile.bottomNav')
  const positions = usePositionsStore(s => s.positions)

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(58px + env(safe-area-inset-bottom, 0px))',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)',
      background: C.bg,
      backdropFilter: 'blur(32px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
      borderTop: `1px solid ${C.border}`,
      boxShadow: '0 -1px 0 rgba(0,180,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
      zIndex: 100,
    }}>
      {TABS.map(({ href, Icon, key }) => {
        const active = href === '/mobile' ? pathname === '/mobile' : pathname?.startsWith(href) ?? false
        const badge = key === 'positions' && positions.length > 0 ? positions.length : 0
        const label = t(key as any)
        return (
          <button key={href} onClick={() => router.push(href)} aria-label={label}
            style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'6px 0', position:'relative', WebkitTapHighlightColor:'transparent' }}>
            {active && <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:28, height:2, background:C.active, borderRadius:'0 0 2px 2px', boxShadow:`0 0 8px ${C.active}88` }}/>}
            <div style={{ width:36, height:36, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', background: active?'rgba(0,180,255,0.09)':'transparent', transition:'background 0.15s' }}>
              <Icon a={active}/>
            </div>
            <span style={{ fontSize:9, fontWeight: active?800:500, color: active?C.active:C.inactive, fontFamily:"'Cairo',sans-serif", letterSpacing:'0.2px' }}>{label}</span>
            {badge > 0 && <div style={{ position:'absolute', top:4, right:'50%', transform:'translateX(14px)', minWidth:16, height:16, background:'#FF3B5C', borderRadius:8, fontSize:8, fontWeight:800, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', border:'2px solid #060A14', fontFamily:'monospace' }}>{badge}</div>}
          </button>
        )
      })}
    </nav>
  )
}
