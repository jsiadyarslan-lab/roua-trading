'use client'
import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'

const C = { bg:'#060A14', card:'#0D1425', border:'rgba(255,255,255,0.06)', cyan:'#00B4FF', green:'#00FFA3', red:'#FF3B5C', amber:'#FFB800', purple:'#B388FF', text:'#F0F2F5', dim:'rgba(255,255,255,0.4)' }
const PAIRS = ['BTC/USD','ETH/USD','SOL/USD','XAU/USD']
const f = (n:number, d=2) => Number.isFinite(n)&&n ? n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—'

export default function MobileHome() {
  const router = useRouter()
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const quotes = useMarketStore(s => s.quotes)

  useEffect(() => { fetchAccount(); fetchPositions() }, [fetchAccount, fetchPositions])

  const equity = Number(account?.equity) || Number((account as any)?.portfolio_value) || 0
  const cash = Number(account?.cash) || 0
  const pnl = positions.reduce((s,p) => s + (Number(p.unrealizedPnl)||0), 0)
  const pnlPos = pnl >= 0

  return (
    <div style={{ minHeight:'100%', background:C.bg }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 10px', position:'sticky', top:0, zIndex:10, background:'rgba(6,10,20,0.95)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', borderBottom:`1px solid ${C.border}` }}>
        <span style={{ fontSize:22, fontWeight:900, color:C.cyan, fontFamily:"'Cairo',sans-serif", letterSpacing:'-0.5px' }}>رؤى</span>
        <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,255,163,0.08)', border:'1px solid rgba(0,255,163,0.15)', borderRadius:20, padding:'4px 10px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:C.green, boxShadow:`0 0 6px ${C.green}` }}/>
          <span style={{ fontSize:9, fontWeight:800, color:C.green, letterSpacing:'0.5px' }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* رصيد */}
        <div style={{ background:'linear-gradient(135deg,#0D1B35,#0A1425 60%,#0D1E38)', border:'1px solid rgba(0,180,255,0.16)', borderRadius:20, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-50, right:-50, width:130, height:130, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,180,255,0.08),transparent 70%)' }}/>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:6, fontFamily:"'Cairo',sans-serif" }}>إجمالي المحفظة</div>
          <div style={{ fontSize:36, fontWeight:900, color:'#fff', letterSpacing:'-1.5px', lineHeight:1, fontFamily:'monospace' }}>
            ${f(equity,0)}<span style={{ fontSize:14, color:'rgba(255,255,255,0.3)' }}>.{String(Math.round((equity%1)*100)).padStart(2,'0')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
            <span style={{ fontSize:12, fontWeight:800, color:pnlPos?C.green:C.red, fontFamily:'monospace', background:pnlPos?'rgba(0,255,163,0.1)':'rgba(255,59,92,0.1)', padding:'3px 10px', borderRadius:20, border:`1px solid ${pnlPos?'rgba(0,255,163,0.2)':'rgba(255,59,92,0.2)'}` }}>
              {pnlPos?'▲':'▼'} {pnlPos?'+':''}{f(pnl)} P&L
            </span>
            {positions.length > 0 && <span style={{ fontSize:10, color:C.dim }}>{positions.length} صفقة</span>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, marginTop:14, background:'rgba(255,255,255,0.05)', borderRadius:12, overflow:'hidden' }}>
            {[{l:'رصيد',v:`$${f(cash,0)}`,c:C.cyan},{l:'صفقات',v:`${positions.length}`,c:C.amber},{l:'%',v:`${equity>0?((pnl/equity)*100).toFixed(1):'0.0'}%`,c:pnlPos?C.green:C.red}].map(s=>(
              <div key={s.l} style={{ background:'rgba(255,255,255,0.03)', padding:'9px 10px' }}>
                <div style={{ fontSize:8, color:C.dim, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{s.l}</div>
                <div style={{ fontSize:13, fontWeight:800, fontFamily:'monospace', color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* تيكر */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'rgba(255,255,255,0.04)', borderRadius:14, overflow:'hidden' }}>
          {PAIRS.map(sym => {
            const q = quotes[sym]; const chg = q?.changePercent||0
            return (
              <div key={sym} onClick={()=>router.push('/mobile/chart')} style={{ background:'#08111E', padding:'9px 6px', textAlign:'center', cursor:'pointer' }}>
                <div style={{ fontSize:8, fontFamily:'monospace', color:C.dim }}>{sym.split('/')[0]}</div>
                <div style={{ fontSize:12, fontWeight:800, fontFamily:'monospace', color:'#fff', margin:'2px 0' }}>{q?.price?f(q.price):'—'}</div>
                <div style={{ fontSize:9, fontFamily:'monospace', fontWeight:700, color:chg>=0?C.green:C.red }}>{chg>=0?'▲':'▼'}{Math.abs(chg).toFixed(1)}%</div>
              </div>
            )
          })}
        </div>

        {/* أدوات */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[
            { label:'مجلس AI', sub:'8 نماذج', href:'/mobile/ai', c:'#B388FF', bg:'rgba(179,136,255,0.12)', b:'rgba(179,136,255,0.2)',
              svg:<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7l9 5 9-5-9-5z" stroke="#B388FF" strokeWidth="1.5" fill="rgba(179,136,255,0.12)" strokeLinejoin="round"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5" stroke="#B388FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/></svg> },
            { label:'الوكيل', sub:'AUTO', href:'/mobile/ai', c:'#00C896', bg:'rgba(0,200,150,0.12)', b:'rgba(0,200,150,0.2)',
              svg:<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#00C896" strokeWidth="1.5" fill="rgba(0,200,150,0.1)"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#00C896" strokeWidth="1.5" strokeLinecap="round"/></svg> },
            { label:'المنفذ', sub:'تداول ذكي', href:'/mobile/trade', c:C.cyan, bg:'rgba(0,180,255,0.12)', b:'rgba(0,180,255,0.2)',
              svg:<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1.5 8L20 10h-7L13 2z" stroke="#00B4FF" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(0,180,255,0.12)"/></svg> },
          ].map(t => (
            <button key={t.href} onClick={()=>router.push(t.href)} style={{ background:`linear-gradient(135deg,${t.bg},transparent)`, border:`1px solid ${t.b}`, borderRadius:16, padding:'14px 8px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
              {t.svg}
              <span style={{ fontSize:10, fontWeight:800, color:t.c, fontFamily:"'Cairo',sans-serif" }}>{t.label}</span>
              <span style={{ fontSize:8, color:`${t.c}77`, fontWeight:600 }}>{t.sub}</span>
            </button>
          ))}
        </div>

        {/* توصيات مجلس */}
        <div>
          <div style={{ fontSize:9, fontWeight:800, color:C.dim, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
            المجلس الاستراتيجي
            <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.05)' }}/>
            <button onClick={()=>router.push('/mobile/ai')} style={{ fontSize:9, color:C.cyan, fontWeight:800, background:'none', border:'none', cursor:'pointer' }}>المزيد</button>
          </div>
          {[{sym:'BTC/USD',icon:'₿',s:'سكالبينج · 15د',a:'شراء',c:C.green,conf:'81%',bg:'rgba(0,255,163,0.08)',b:'rgba(0,255,163,0.12)'},{sym:'ETH/USD',icon:'Ξ',s:'سوينغ · 1ساعة',a:'بيع',c:C.red,conf:'68%',bg:'rgba(255,59,92,0.08)',b:'rgba(255,59,92,0.12)'}].map(r=>(
            <div key={r.sym} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.025)', border:`1px solid ${C.border}`, borderRadius:14, marginBottom:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:r.bg, border:`1px solid ${r.b}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:r.c }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:900, color:'#fff', fontFamily:'monospace' }}>{r.sym}</div>
                  <div style={{ fontSize:10, color:C.dim }}>{r.s}</div>
                </div>
              </div>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontSize:14, fontWeight:900, color:r.c }}>{r.a==='شراء'?'▲ ':'▼ '}{r.a}</div>
                <div style={{ fontSize:9, color:C.dim, fontFamily:'monospace' }}>ثقة {r.conf}</div>
              </div>
            </div>
          ))}
        </div>

        {/* سكانر */}
        <div>
          <div style={{ fontSize:9, fontWeight:800, color:C.dim, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
            إشارات السكانر
            <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.05)' }}/>
          </div>
          {[{sym:'SOL/USD',pat:'انكسار مقاومة · BOS↑',sig:'إشارة قوية',c:'#B388FF'},{sym:'XAU/USD',pat:'قاع مزدوج',sig:'فرصة',c:C.amber}].map(s=>(
            <div key={s.sym} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.025)', border:`1px solid ${C.border}`, borderRadius:14, marginBottom:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:s.c, boxShadow:`0 0 8px ${s.c}` }}/>
                <div>
                  <div style={{ fontSize:13, fontWeight:900, color:'#fff', fontFamily:'monospace' }}>{s.sym}</div>
                  <div style={{ fontSize:10, color:C.dim }}>{s.pat}</div>
                </div>
              </div>
              <div style={{ fontSize:12, fontWeight:800, color:s.c }}>{s.sig}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
