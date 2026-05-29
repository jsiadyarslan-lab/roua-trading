'use client'
import { usePathname, useRouter } from '@/i18n/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'

const A = '#00B4FF'
const D = 'rgba(255,255,255,0.3)'

const Home = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z" stroke={on?A:D} strokeWidth={on?2:1.5} fill={on?'rgba(0,180,255,0.12)':'none'} strokeLinejoin="round"/>
    <path d="M9 21v-8h6v8" stroke={on?A:D} strokeWidth={on?2:1.5} strokeLinecap="round"/>
  </svg>
)
const Chart = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <polyline points="3,18 8,11 13,14 21,5" stroke={on?A:D} strokeWidth={on?2:1.5} strokeLinecap="round" strokeLinejoin="round"/>
    {on && <><circle cx="8" cy="11" r="2" fill={A}/><circle cx="13" cy="14" r="2" fill={A}/><circle cx="21" cy="5" r="2" fill={A}/></>}
    <path d="M3 21h18" stroke={on?A:D} strokeWidth="1" opacity="0.2"/>
  </svg>
)
const Trade = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M13 2L4 14h7l-1.5 8L20 10h-7L13 2z" stroke={on?A:D} strokeWidth={on?2:1.5} strokeLinejoin="round" fill={on?'rgba(0,180,255,0.12)':'none'}/>
  </svg>
)
const Pos = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="7" width="20" height="13" rx="2" stroke={on?A:D} strokeWidth={on?2:1.5} fill={on?'rgba(0,180,255,0.1)':'none'}/>
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke={on?A:D} strokeWidth={on?2:1.5}/>
    <circle cx="12" cy="14" r="2" fill={on?A:'none'} stroke={on?'none':D} strokeWidth="1.5"/>
  </svg>
)
const AI = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3.5" stroke={on?A:D} strokeWidth={on?2:1.5} fill={on?'rgba(0,180,255,0.15)':'none'}/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={on?A:D} strokeWidth={on?2:1.5} strokeLinecap="round"/>
    <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke={on?A:D} strokeWidth="1.2" strokeLinecap="round" opacity={on?0.6:0.35}/>
  </svg>
)

const TABS = [
  { href: '/mobile',           Icon: Home,  label: 'الرئيسية', exact: true  },
  { href: '/mobile/chart',     Icon: Chart, label: 'الشارت',   exact: false },
  { href: '/mobile/trade',     Icon: Trade, label: 'تداول',    exact: false },
  { href: '/mobile/positions', Icon: Pos,   label: 'صفقاتي',   exact: false },
  { href: '/mobile/ai',        Icon: AI,    label: 'الذكاء',   exact: false },
]

export default function BottomNav() {
  const path = usePathname()
  const router = useRouter()
  const count = usePositionsStore(s => s.positions.length)

  return (
    <nav className="m-nav">
      {TABS.map(({ href, Icon, label, exact }) => {
        const on = exact ? path === '/mobile' : (path?.startsWith(href) ?? false)
        const badge = href === '/mobile/positions' && count > 0 ? count : 0
        return (
          <button key={href} onClick={() => router.push(href)}
            style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'6px 0', position:'relative', WebkitTapHighlightColor:'transparent', height:'100%', width:'100%' }}>
            {on && <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:24, height:2, background:A, borderRadius:'0 0 2px 2px', boxShadow:`0 0 8px ${A}88` }}/>}
            <div style={{ width:36, height:36, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', background: on?'rgba(0,180,255,0.09)':'transparent' }}>
              <Icon on={on}/>
            </div>
            <span style={{ fontSize:10, fontWeight:on?800:500, color:on?A:D, fontFamily:"'Cairo',sans-serif", lineHeight:1 }}>{label}</span>
            {badge > 0 && <div style={{ position:'absolute', top:3, right:'50%', transform:'translateX(14px)', minWidth:16, height:16, background:'#FF3B5C', borderRadius:8, fontSize:8, fontWeight:800, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', border:'2px solid #060A14' }}>{badge}</div>}
          </button>
        )
      })}
    </nav>
  )
}
