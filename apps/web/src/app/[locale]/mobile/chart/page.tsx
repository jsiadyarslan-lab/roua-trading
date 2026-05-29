'use client'
import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { TIMEFRAMES } from '@/lib/charts/types'
import { ChevronDown, X } from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

const PAIRS = ['BTC/USD','ETH/USD','SOL/USD','XRP/USD','BNB/USD','XAU/USD','EUR/USD','GBP/USD']
const TFS = TIMEFRAMES.filter(t => ['1min','5min','15min','30min','1h','4h','1day'].includes(t.value))
const fp = (p:number) => p>=1000 ? p.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2}) : p>=1 ? p.toFixed(4) : p.toFixed(5)

export default function ChartPage() {
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const { refreshAfterTrade } = usePositionsStore()
  const { addTrade } = usePaperTradesStore()
  const { addNotification } = useNotificationStore()
  const chartRef = useRef<any>(null)

  const [showPairs, setShowPairs] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const [side, setSide] = useState<'buy'|'sell'>('buy')
  const [exec, setExec] = useState(false)

  const q = quotes[selectedSymbol]
  const price = q?.price || 0
  const chg = q?.changePercent || 0

  const doExec = async () => {
    if (exec) return; setExec(true)
    try {
      const sl = side==='buy' ? price*0.985 : price*1.015
      const tp = side==='buy' ? price*1.02 : price*0.98
      const r = await fetch('/api/alpaca/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:selectedSymbol,side,qty:0.01,type:'market',stop_loss:sl,take_profit:tp})})
      const j = await r.json()
      if (j.success) {
        addTrade({symbol:selectedSymbol,side:side==='buy'?'long':'short',qty:0.01,entryPrice:j.filledAvgPrice||price,currentPrice:price,sl,tp,source:'manual',entryTime:Date.now()})
        addNotification({source:'trade',priority:'high',action:side.toUpperCase() as any,title:`${side==='buy'?'شراء':'بيع'} ${selectedSymbol}`,body:`@ $${fp(j.filledAvgPrice||price)}`,pair:selectedSymbol,price:j.filledAvgPrice||price})
        refreshAfterTrade(); setShowOrder(false)
      }
    } catch {} finally { setExec(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Toolbar */}
      <div style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'rgba(6,10,20,0.97)', borderBottom:'0.5px solid rgba(255,255,255,0.06)' }}>
        <button onClick={()=>setShowPairs(true)} style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'5px 10px', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
          <span style={{ fontSize:14, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{selectedSymbol}</span>
          <ChevronDown size={12} color="rgba(255,255,255,0.4)"/>
        </button>
        <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
          <span style={{ fontSize:15, fontWeight:900, color:chg>=0?'#00FFA3':'#FF3B5C', fontFamily:'monospace' }}>${fp(price)}</span>
          <span style={{ fontSize:10, color:chg>=0?'#00FFA3':'#FF3B5C', fontFamily:'monospace' }}>{chg>=0?'+':''}{chg.toFixed(2)}%</span>
        </div>
      </div>
      {/* TF */}
      <div style={{ flexShrink:0, display:'flex', overflowX:'auto', padding:'4px 8px', background:'rgba(6,10,20,0.9)', direction:'ltr' }}>
        {TFS.map(tf => <button key={tf.value} onClick={()=>setTimeframe(tf.value)} style={{ padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer', background:timeframe===tf.value?'rgba(0,180,255,0.12)':'transparent', color:timeframe===tf.value?'#00B4FF':'rgba(255,255,255,0.3)', fontSize:10, fontWeight:800, fontFamily:'monospace', flexShrink:0, WebkitTapHighlightColor:'transparent' }}>{tf.label}</button>)}
      </div>
      {/* Chart */}
      <div style={{ flex:1, minHeight:0, position:'relative' }}>
        <RouaChart currentPrice={price} mobile hideToolbar chartActions={chartRef}/>
      </div>
      {/* Buttons */}
      <div style={{ flexShrink:0, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'10px 14px', background:'rgba(6,10,20,0.97)', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
        <button onClick={()=>{setSide('buy');setShowOrder(true)}} style={{ padding:'13px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#00FFA3,#00D4FF)', color:'#000', fontSize:14, fontWeight:900, fontFamily:"'Cairo',sans-serif", WebkitTapHighlightColor:'transparent' }}>▲ شراء</button>
        <button onClick={()=>{setSide('sell');setShowOrder(true)}} style={{ padding:'13px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#FF3B5C,#FF6B6B)', color:'#fff', fontSize:14, fontWeight:900, fontFamily:"'Cairo',sans-serif", WebkitTapHighlightColor:'transparent' }}>▼ بيع</button>
      </div>
      {/* Order Sheet */}
      {showOrder && <>
        <div onClick={()=>setShowOrder(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:50 }}/>
        <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:51, background:'#0D1425', borderRadius:'20px 20px 0 0', padding:20, paddingBottom:'calc(20px + env(safe-area-inset-bottom,0px))', border:'0.5px solid rgba(0,180,255,0.2)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <span style={{ fontSize:16, fontWeight:900, color:'#fff', fontFamily:"'Cairo',sans-serif" }}>{side==='buy'?'▲ شراء':'▼ بيع'} {selectedSymbol}</span>
            <button onClick={()=>setShowOrder(false)} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={16} color="rgba(255,255,255,0.6)"/></button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
            {[{l:'دخول',v:fp(price),c:'#00B4FF'},{l:'وقف',v:fp(side==='buy'?price*0.985:price*1.015),c:'#FF3B5C'},{l:'هدف',v:fp(side==='buy'?price*1.02:price*0.98),c:'#00FFA3'}].map(x=>(
              <div key={x.l} style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'8px 10px' }}>
                <div style={{ fontSize:8, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', marginBottom:3 }}>{x.l}</div>
                <div style={{ fontSize:12, fontWeight:800, fontFamily:'monospace', color:x.c }}>{x.v}</div>
              </div>
            ))}
          </div>
          <button onClick={doExec} disabled={exec} style={{ width:'100%', padding:'15px', borderRadius:14, border:'none', cursor:exec?'not-allowed':'pointer', background:side==='buy'?'linear-gradient(135deg,#00FFA3,#00D4FF)':'linear-gradient(135deg,#FF3B5C,#FF6B6B)', color:side==='buy'?'#000':'#fff', fontSize:16, fontWeight:900, fontFamily:"'Cairo',sans-serif", opacity:exec?0.7:1 }}>
            {exec?'جاري التنفيذ...':'تنفيذ 0.01 lot'}
          </button>
        </div>
      </>}
      {/* Pairs Sheet */}
      {showPairs && <>
        <div onClick={()=>setShowPairs(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:50 }}/>
        <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:51, background:'#0D1425', borderRadius:'20px 20px 0 0', padding:20, paddingBottom:'calc(20px + env(safe-area-inset-bottom,0px))' }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#fff', fontFamily:"'Cairo',sans-serif", marginBottom:14 }}>اختر الرمز</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {PAIRS.map(p => <button key={p} onClick={()=>{setSelectedSymbol(p);setShowPairs(false)}} style={{ padding:'12px', borderRadius:12, border:`1px solid ${p===selectedSymbol?'rgba(0,180,255,0.3)':'rgba(255,255,255,0.06)'}`, background:p===selectedSymbol?'rgba(0,180,255,0.1)':'rgba(255,255,255,0.03)', cursor:'pointer', color:p===selectedSymbol?'#00B4FF':'#fff', fontSize:13, fontWeight:800, fontFamily:'monospace', WebkitTapHighlightColor:'transparent' }}>{p}</button>)}
          </div>
        </div>
      </>}
    </div>
  )
}
