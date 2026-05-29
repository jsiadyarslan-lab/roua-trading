'use client'
import { useState } from 'react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'

const T = {bg:'#060A14',border:'rgba(255,255,255,0.06)',cyan:'#00B4FF',green:'#00FFA3',red:'#FF3B5C',text:'#F0F2F5',muted:'rgba(255,255,255,0.4)'}
const SYMS = ['BTC/USD','ETH/USD','SOL/USD','XAU/USD','EUR/USD','BNB/USD','XRP/USD','ADA/USD']
const f = (n:number,d=2) => Number.isFinite(n)&&n ? n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—'

export default function TradePage() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const { refreshAfterTrade } = usePositionsStore()
  const { addTrade } = usePaperTradesStore()
  const { addNotification } = useNotificationStore()

  const [side, setSide] = useState<'buy'|'sell'>('buy')
  const [qty, setQty] = useState('0.01')
  const [sl, setSl] = useState('')
  const [tp, setTp] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{t:string;ok:boolean}|null>(null)

  const price = quotes[selectedSymbol]?.price || 0

  const auto = () => { if(!price) return; setSl((side==='buy'?price*0.985:price*1.015).toFixed(2)); setTp((side==='buy'?price*1.02:price*0.98).toFixed(2)) }

  const exec = async () => {
    const qv = parseFloat(qty); if(!qv||qv<=0){setMsg({t:'كمية غير صالحة',ok:false});return}
    setLoading(true); setMsg(null)
    try {
      const body:any = {symbol:selectedSymbol,side,qty:qv,type:'market'}
      if(sl) body.stop_loss=parseFloat(sl)
      if(tp) body.take_profit=parseFloat(tp)
      const r = await fetch('/api/alpaca/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j = await r.json()
      if(j.success){
        addTrade({symbol:selectedSymbol,side:side==='buy'?'long':'short',qty:qv,entryPrice:j.filledAvgPrice||price,currentPrice:price,sl:sl?parseFloat(sl):undefined,tp:tp?parseFloat(tp):undefined,source:'manual',entryTime:Date.now()})
        addNotification({source:'trade',priority:'high',action:side.toUpperCase() as any,title:`${side==='buy'?'شراء':'بيع'} ${selectedSymbol}`,body:`تم @ $${f(j.filledAvgPrice||price)}`,pair:selectedSymbol,price:j.filledAvgPrice||price})
        refreshAfterTrade()
        setMsg({t:`✅ تم التنفيذ @ $${f(j.filledAvgPrice||price)}`,ok:true})
      } else { setMsg({t:`❌ ${j.error||'فشل'}`,ok:false}) }
    } catch { setMsg({t:'❌ خطأ في الاتصال',ok:false}) }
    finally { setLoading(false); setTimeout(()=>setMsg(null),4000) }
  }

  return (
    <div style={{background:T.bg,minHeight:'100%'}}>
      <div style={{padding:'14px 18px 10px',borderBottom:`1px solid ${T.border}`,background:'rgba(6,10,20,0.9)'}}>
        <div style={{fontSize:11,color:T.muted,fontFamily:"'Cairo',sans-serif",marginBottom:2}}>تداول سريع</div>
        <div style={{display:'flex',alignItems:'baseline',gap:8}}>
          <div style={{fontSize:18,fontWeight:900,color:T.text,fontFamily:'monospace'}}>{selectedSymbol}</div>
          <div style={{fontSize:20,fontWeight:900,color:T.cyan,fontFamily:'monospace'}}>${f(price)}</div>
        </div>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:12}}>
        {/* Symbols */}
        <div style={{display:'flex',gap:6,overflow:'auto',paddingBottom:2}}>
          {SYMS.map(s=><button key={s} onClick={()=>setSelectedSymbol(s)} style={{flexShrink:0,padding:'5px 12px',borderRadius:10,border:'none',cursor:'pointer',background:s===selectedSymbol?'rgba(0,180,255,0.15)':'rgba(255,255,255,0.04)',color:s===selectedSymbol?T.cyan:T.muted,fontSize:11,fontWeight:700,fontFamily:'monospace',WebkitTapHighlightColor:'transparent'}}>{s.split('/')[0]}</button>)}
        </div>
        {/* Side */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,background:'rgba(255,255,255,0.03)',padding:4,borderRadius:16}}>
          {(['buy','sell'] as const).map(s=><button key={s} onClick={()=>setSide(s)} style={{padding:'15px 0',borderRadius:12,border:'none',cursor:'pointer',background:side===s?(s==='buy'?'linear-gradient(135deg,#00FFA3,#10B981)':'linear-gradient(135deg,#FF3B5C,#EF4444)'):'transparent',color:side===s?'#fff':(s==='buy'?T.green:T.red),fontSize:16,fontWeight:900,fontFamily:"'Cairo',sans-serif",WebkitTapHighlightColor:'transparent'}}>{s==='buy'?'▲ شراء':'▼ بيع'}</button>)}
        </div>
        {/* Qty */}
        <div>
          <label style={{fontSize:10,color:T.muted,fontWeight:700,fontFamily:"'Cairo',sans-serif",display:'block',marginBottom:4}}>الكمية</label>
          <input value={qty} onChange={e=>setQty(e.target.value)} type="number" step="0.01" style={{width:'100%',background:'rgba(255,255,255,0.03)',border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:18,padding:'14px',fontFamily:'monospace',fontWeight:800,outline:'none',boxSizing:'border-box'}}/>
        </div>
        {/* SL/TP */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[{l:'وقف SL',v:sl,set:setSl,c:T.red},{l:'هدف TP',v:tp,set:setTp,c:T.green}].map(x=>(
            <div key={x.l}>
              <label style={{fontSize:10,color:x.c,fontWeight:700,fontFamily:"'Cairo',sans-serif",display:'block',marginBottom:4}}>{x.l}</label>
              <input value={x.v} onChange={e=>x.set(e.target.value)} type="number" placeholder="0.00" style={{width:'100%',background:`${x.c}08`,border:`1px solid ${x.c}25`,borderRadius:10,color:x.c,fontSize:14,padding:'12px',fontFamily:'monospace',fontWeight:800,outline:'none',boxSizing:'border-box'}}/>
            </div>
          ))}
        </div>
        {/* Auto */}
        <button onClick={auto} style={{width:'100%',background:'rgba(0,180,255,0.06)',border:'1px solid rgba(0,180,255,0.15)',borderRadius:10,color:T.cyan,fontSize:12,fontWeight:700,padding:'10px',cursor:'pointer',fontFamily:"'Cairo',sans-serif",WebkitTapHighlightColor:'transparent'}}>⚡ حساب SL/TP تلقائياً</button>
        {msg && <div style={{padding:'12px',borderRadius:10,background:msg.ok?'rgba(0,255,163,0.1)':'rgba(255,59,92,0.1)',border:`1px solid ${msg.ok?'rgba(0,255,163,0.25)':'rgba(255,59,92,0.25)'}`,color:msg.ok?T.green:T.red,fontSize:13,fontWeight:700,fontFamily:"'Cairo',sans-serif",textAlign:'center'}}>{msg.t}</div>}
        <button onClick={exec} disabled={loading} style={{width:'100%',padding:'17px',borderRadius:16,border:'none',cursor:loading?'not-allowed':'pointer',background:side==='buy'?'linear-gradient(135deg,#00FFA3,#10B981)':'linear-gradient(135deg,#FF3B5C,#EF4444)',color:'#fff',fontSize:17,fontWeight:900,fontFamily:"'Cairo',sans-serif",opacity:loading?0.7:1,boxShadow:side==='buy'?'0 0 24px rgba(0,255,163,0.2)':'0 0 24px rgba(255,59,92,0.2)',WebkitTapHighlightColor:'transparent'}}>
          {loading?'جاري التنفيذ...':`${side==='buy'?'▲ شراء':'▼ بيع'} ${selectedSymbol}`}
        </button>
      </div>
    </div>
  )
}
