'use client'
import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'

const T = {
  bg:'#060A14', card:'#0D1425', border:'rgba(255,255,255,0.06)',
  cyan:'#00B4FF', green:'#00FFA3', red:'#FF3B5C', amber:'#FFB800', purple:'#B388FF',
  text:'#F0F2F5', muted:'rgba(255,255,255,0.4)',
}

const PAIRS = ['BTC/USD','ETH/USD','SOL/USD','XAU/USD']

function fmt(n:number,d=2){ return Number.isFinite(n)&&n?n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—' }

export default function MobileHome() {
  const router = useRouter()
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const quotes = useMarketStore(s => s.quotes)
  const agentStatus = useAgentStore(s => (s as any).status)
  const dailyPnL = useAgentStore(s => (s as any).dailyPnL) as number
  const dailyTradesCount = useAgentStore(s => (s as any).dailyTradesCount) as number

  useEffect(() => { fetchAccount(); fetchPositions() }, [fetchAccount, fetchPositions])

  const equity = Number(account?.equity) || Number((account as any)?.portfolio_value) || 0
  const cash = Number(account?.cash) || 0
  const pnl = positions.reduce((s,p)=>s+(Number(p.unrealizedPnl)||0),0)
  const pnlPos = pnl >= 0
  const isAgentRunning = agentStatus === AgentStatus.RUNNING

  return (
    <div style={{ minHeight:'100%', background:T.bg, paddingBottom:8 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 10px', position:'sticky', top:0, zIndex:20, background:'rgba(6,10,20,0.92)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontFamily:"'Cairo',sans-serif", fontSize:22, fontWeight:900, color:T.cyan, letterSpacing:'-0.5px' }}>
          رؤى <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)', fontWeight:400 }}>TRADING</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,255,163,0.08)', border:'1px solid rgba(0,255,163,0.15)', borderRadius:20, padding:'4px 10px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 6px ${T.green}` }}/>
          <span style={{ fontSize:9, fontWeight:800, color:T.green, letterSpacing:'0.5px' }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* ── ① Balance Card ── */}
        <div style={{ background:'linear-gradient(135deg,#0D1B35,#0A1425 60%,#0D1E38)', border:'1px solid rgba(0,180,255,0.16)', borderRadius:20, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-50, right:-50, width:140, height:140, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,180,255,0.09),transparent 70%)', pointerEvents:'none' }}/>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:6 }}>إجمالي المحفظة</div>
          <div style={{ fontSize:36, fontWeight:900, color:'#fff', letterSpacing:'-1.5px', lineHeight:1, fontFamily:'monospace' }}>
            ${fmt(equity,0)}<span style={{ fontSize:14, color:'rgba(255,255,255,0.3)', fontWeight:400 }}>.{String(Math.round((equity%1)*100)).padStart(2,'0')}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:4, background:pnlPos?'rgba(0,255,163,0.1)':'rgba(255,59,92,0.1)', border:`1px solid ${pnlPos?'rgba(0,255,163,0.2)':'rgba(255,59,92,0.2)'}`, borderRadius:20, padding:'4px 10px' }}>
              <span style={{ fontSize:12, fontWeight:800, color:pnlPos?T.green:T.red, fontFamily:'monospace' }}>{pnlPos?'▲':'▼'} {pnlPos?'+':''}{fmt(pnl)} P&L</span>
            </div>
            {positions.length>0 && <span style={{ fontSize:10, color:T.muted, fontFamily:"'Cairo',sans-serif" }}>{positions.length} صفقة</span>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, marginTop:14, background:'rgba(255,255,255,0.05)', borderRadius:12, overflow:'hidden' }}>
            {[{l:'رصيد',v:`$${fmt(cash,0)}`,c:T.cyan},{l:'صفقات',v:String(positions.length),c:T.amber},{l:'P&L%',v:`${equity>0?((pnl/equity)*100).toFixed(1):'0.0'}%`,c:pnlPos?T.green:T.red}].map(s=>(
              <div key={s.l} style={{ background:'rgba(255,255,255,0.03)', padding:'9px 10px' }}>
                <div style={{ fontSize:8, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3, fontFamily:"'Cairo',sans-serif" }}>{s.l}</div>
                <div style={{ fontSize:13, fontWeight:800, fontFamily:'monospace', color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Market Ticker ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'rgba(255,255,255,0.04)', borderRadius:14, overflow:'hidden' }}>
          {PAIRS.map(sym=>{
            const q = quotes[sym]
            const chg = q?.changePercent||0
            return (
              <div key={sym} style={{ background:'#08111E', padding:'9px 6px', textAlign:'center', cursor:'pointer' }} onClick={()=>router.push('/mobile/chart')}>
                <div style={{ fontSize:8, fontFamily:'monospace', color:T.muted, fontWeight:700 }}>{sym.split('/')[0]}</div>
                <div style={{ fontSize:12, fontWeight:800, fontFamily:'monospace', color:'#fff', margin:'2px 0' }}>{q?.price?fmt(q.price):'—'}</div>
                <div style={{ fontSize:9, fontFamily:'monospace', fontWeight:700, color:chg>=0?T.green:T.red }}>{chg>=0?'▲':'▼'}{Math.abs(chg).toFixed(1)}%</div>
              </div>
            )
          })}
        </div>

        {/* ── ② Smart Tools ── */}
        <div>
          <div style={{ fontSize:9, fontWeight:800, color:T.muted, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8, fontFamily:"'Cairo',sans-serif" }}>
            الأدوات الذكية <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.05)' }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            {[
              { label:'مجلس AI', sub:'8 نماذج', href:'/mobile/ai', g:'rgba(179,136,255,0.12)', b:'rgba(179,136,255,0.2)', c:'#B388FF',
                svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7l9 5 9-5-9-5z" stroke="#B388FF" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(179,136,255,0.12)"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5" stroke="#B388FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/></svg> },
              { label:'الوكيل', sub: isAgentRunning?'يعمل ●':'متوقف', href:'/mobile/ai', g:'rgba(0,200,150,0.12)', b:'rgba(0,200,150,0.2)', c:'#00C896',
                svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#00C896" strokeWidth="1.5" fill="rgba(0,200,150,0.1)"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#00C896" strokeWidth="1.5" strokeLinecap="round"/><circle cx="19" cy="7" r="3" fill="#00C896"/><path d="M18 7h2M19 6v2" stroke="#060A14" strokeWidth="1.2" strokeLinecap="round"/></svg> },
              { label:'المنفذ', sub:'تداول ذكي', href:'/mobile/trade', g:'rgba(0,180,255,0.12)', b:'rgba(0,180,255,0.2)', c:T.cyan,
                svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1.5 8.5L20 9.5H13.5L15 2z" stroke="#00B4FF" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(0,180,255,0.12)"/></svg> },
            ].map(tool=>(
              <button key={tool.href} onClick={()=>router.push(tool.href)} style={{ background:`linear-gradient(135deg,${tool.g},rgba(0,0,0,0))`, border:`1px solid ${tool.b}`, borderRadius:16, padding:'14px 8px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', position:'relative', overflow:'hidden', WebkitTapHighlightColor:'transparent' }}>
                <div style={{ position:'absolute', top:-20, right:-20, width:50, height:50, borderRadius:'50%', background:`radial-gradient(circle,${tool.b},transparent 70%)` }}/>
                <div style={{ position:'relative' }}>{tool.svg}</div>
                <span style={{ fontSize:10, fontWeight:800, color:tool.c, fontFamily:"'Cairo',sans-serif", position:'relative' }}>{tool.label}</span>
                <span style={{ fontSize:8, color:`${tool.c}88`, fontWeight:600, position:'relative' }}>{tool.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── ③ AI Signal ── */}
        <div>
          <div style={{ fontSize:9, fontWeight:800, color:T.muted, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8, fontFamily:"'Cairo',sans-serif" }}>
            إشارة AI <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.05)' }}/>
            <button onClick={()=>router.push('/mobile/ai')} style={{ fontSize:9, color:T.cyan, fontWeight:800, background:'none', border:'none', cursor:'pointer', fontFamily:"'Cairo',sans-serif" }}>المزيد</button>
          </div>
          <div style={{ background:'linear-gradient(135deg,#0D1425,#091020)', border:'1px solid rgba(0,180,255,0.15)', borderRadius:18, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-30, left:-30, width:100, height:100, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,180,255,0.07),transparent 70%)' }}/>
            <div style={{ position:'absolute', top:10, left:14, fontSize:9, fontWeight:800, color:'rgba(0,180,255,0.5)', letterSpacing:'0.5px' }}>🧠 8 نماذج AI</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:900, color:'#fff', fontFamily:'monospace' }}>{PAIRS[0]}</div>
                <div style={{ fontSize:10, color:T.muted, marginTop:2, fontFamily:"'Cairo',sans-serif" }}>آخر تحليل · 15 دقيقة</div>
              </div>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontSize:26, fontWeight:900, color:T.red }}>▼ بيع</div>
                <div style={{ fontSize:11, fontWeight:700, color:T.red, opacity:0.7, fontFamily:'monospace' }}>73% ثقة</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginTop:10 }}>
              {[{l:'دخول',v:fmt(quotes['BTC/USD']?.price||0),c:T.cyan},{l:'وقف SL',v:'75,200',c:T.red},{l:'هدف TP',v:'72,900',c:T.green}].map(f=>(
                <div key={f.l} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'6px 8px' }}>
                  <div style={{ fontSize:7, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>{f.l}</div>
                  <div style={{ fontSize:11, fontWeight:800, fontFamily:'monospace', color:f.c }}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ④ Council Recs ── */}
        <div>
          <div style={{ fontSize:9, fontWeight:800, color:T.muted, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8, fontFamily:"'Cairo',sans-serif" }}>
            المجلس الاستراتيجي <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.05)' }}/>
            <button onClick={()=>router.push('/mobile/ai')} style={{ fontSize:9, color:T.cyan, fontWeight:800, background:'none', border:'none', cursor:'pointer', fontFamily:"'Cairo',sans-serif" }}>المزيد</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[
              {sym:'BTC/USD',icon:'₿',strat:'سكالبينج · 15د',action:'شراء',c:T.green,conf:'81%',rr:'1:2.4',bg:'rgba(0,255,163,0.08)',b:'rgba(0,255,163,0.12)'},
              {sym:'ETH/USD',icon:'Ξ',strat:'سوينغ · 1ساعة',action:'بيع',c:T.red,conf:'68%',rr:'1:1.8',bg:'rgba(255,59,92,0.08)',b:'rgba(255,59,92,0.12)'},
            ].map(r=>(
              <div key={r.sym} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.025)', border:`1px solid ${T.border}`, borderRadius:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:r.bg, border:`1px solid ${r.b}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:r.c, flexShrink:0 }}>{r.icon}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:900, color:'#fff', fontFamily:'monospace' }}>{r.sym}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:1, fontFamily:"'Cairo',sans-serif" }}>{r.strat}</div>
                  </div>
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontSize:14, fontWeight:900, color:r.c, fontFamily:"'Cairo',sans-serif" }}>{r.action==='شراء'?'▲ ':'▼ '}{r.action}</div>
                  <div style={{ fontSize:9, color:T.muted, fontFamily:'monospace', marginTop:2 }}>ثقة {r.conf} · R:R {r.rr}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ⑤ Scanner ── */}
        <div>
          <div style={{ fontSize:9, fontWeight:800, color:T.muted, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8, fontFamily:"'Cairo',sans-serif" }}>
            إشارات السكانر <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.05)' }}/>
            <button onClick={()=>router.push('/mobile/ai')} style={{ fontSize:9, color:T.cyan, fontWeight:800, background:'none', border:'none', cursor:'pointer', fontFamily:"'Cairo',sans-serif" }}>المزيد</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[
              {sym:'SOL/USD',pattern:'انكسار مقاومة · BOS↑',signal:'إشارة قوية',conf:88,c:'#B388FF'},
              {sym:'XAU/USD',pattern:'قاع مزدوج · نمط هندسي',signal:'فرصة',conf:74,c:T.amber},
            ].map(s=>(
              <div key={s.sym} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.025)', border:`1px solid ${T.border}`, borderRadius:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:s.c, boxShadow:`0 0 8px ${s.c}`, flexShrink:0 }}/>
                  <div>
                    <div style={{ fontSize:13, fontWeight:900, color:'#fff', fontFamily:'monospace' }}>{s.sym}</div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:1, fontFamily:"'Cairo',sans-serif" }}>{s.pattern}</div>
                  </div>
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:s.c, fontFamily:"'Cairo',sans-serif" }}>{s.signal}</div>
                  <div style={{ fontSize:9, color:T.muted, fontFamily:'monospace', marginTop:2 }}>ثقة {s.conf}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Agent Status ── */}
        {(dailyPnL !== 0 || dailyTradesCount > 0) && (
          <div style={{ background: isAgentRunning?'rgba(0,200,150,0.06)':'rgba(255,255,255,0.025)', border:`1px solid ${isAgentRunning?'rgba(0,200,150,0.15)':T.border}`, borderRadius:14, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background: isAgentRunning?'#00C896':'rgba(255,255,255,0.2)', boxShadow: isAgentRunning?'0 0 6px #00C896':undefined }}/>
              <span style={{ fontSize:13, fontWeight:800, color:'#fff', fontFamily:"'Cairo',sans-serif" }}>الوكيل الذكي</span>
            </div>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:12, fontWeight:800, color: dailyPnL>=0?T.green:T.red, fontFamily:'monospace' }}>{dailyPnL>=0?'+':''}{fmt(dailyPnL)}</div>
              <div style={{ fontSize:9, color:T.muted, fontFamily:'monospace' }}>{dailyTradesCount} صفقة اليوم</div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
