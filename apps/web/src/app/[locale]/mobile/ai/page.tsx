'use client'
import { useState } from 'react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { RefreshCw, Play, Square } from 'lucide-react'

const T = {bg:'#060A14',card:'#0D1425',border:'rgba(255,255,255,0.06)',cyan:'#00B4FF',green:'#00FFA3',red:'#FF3B5C',amber:'#FFB800',purple:'#B388FF',text:'#F0F2F5',muted:'rgba(255,255,255,0.4)'}
const SYMS = ['BTC/USD','ETH/USD','SOL/USD','XAU/USD','EUR/USD','BNB/USD']
const f = (n:number,d=2) => Number.isFinite(n) ? n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—'
type Sig = {action:'BUY'|'SELL'|'WAIT';conf:number;entry:number;sl:number;tp:number;models:number;reason:string}

export default function AIPage() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const agentStatus = useAgentStore(s => (s as any).status)
  const dailyPnL = useAgentStore(s => (s as any).dailyPnL) as number
  const dailyTrades = useAgentStore(s => (s as any).dailyTradesCount) as number
  const startAgent = useAgentStore(s => (s as any).startAgent)
  const stopAgent = useAgentStore(s => (s as any).stopAgent)
  const { refreshAfterTrade } = usePositionsStore()

  const [tab, setTab] = useState<'signal'|'agent'>('signal')
  const [sig, setSig] = useState<Sig|null>(null)
  const [loading, setLoading] = useState(false)
  const price = quotes[selectedSymbol]?.price || 0
  const isRunning = agentStatus === AgentStatus.RUNNING

  const analyze = async () => {
    setLoading(true); setSig(null)
    try {
      const r = await fetch(`/api/ai/consensus?symbol=${encodeURIComponent(selectedSymbol)}`)
      const j = await r.json()
      if (j.success && j.data) {
        const d = j.data; const isBuy = d.action==='BUY'
        setSig({action:d.action,conf:Math.round((d.confidence||0.7)*100),entry:price,sl:isBuy?price*0.985:price*1.015,tp:isBuy?price*1.02:price*0.98,models:d.modelsAgreed||7,reason:d.reasoning||'تحليل متكامل'})
      }
    } catch {} finally { setLoading(false) }
  }

  const execSig = async () => {
    if(!sig||sig.action==='WAIT') return
    await fetch('/api/alpaca/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:selectedSymbol,side:sig.action==='BUY'?'buy':'sell',qty:0.01,type:'market',stop_loss:sig.sl,take_profit:sig.tp})})
    refreshAfterTrade()
  }

  return (
    <div style={{background:T.bg,minHeight:'100%'}}>
      <div style={{padding:'14px 18px 10px',borderBottom:`1px solid ${T.border}`,background:'rgba(6,10,20,0.9)'}}>
        <div style={{fontSize:17,fontWeight:900,color:T.text,fontFamily:"'Cairo',sans-serif",marginBottom:10}}>التحليل الذكي</div>
        <div style={{display:'flex',gap:6,overflow:'auto'}}>
          {SYMS.map(s=><button key={s} onClick={()=>setSelectedSymbol(s)} style={{flexShrink:0,padding:'4px 10px',borderRadius:8,border:'none',cursor:'pointer',background:s===selectedSymbol?'rgba(0,180,255,0.15)':'rgba(255,255,255,0.04)',color:s===selectedSymbol?T.cyan:T.muted,fontSize:11,fontWeight:700,fontFamily:'monospace',WebkitTapHighlightColor:'transparent'}}>{s.split('/')[0]}</button>)}
        </div>
      </div>

      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:12}}>
        {/* Tabs */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:'rgba(255,255,255,0.03)',borderRadius:10,padding:3}}>
          {[{k:'signal',l:'إشارة AI'},{k:'agent',l:'الوكيل'}].map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k as any)} style={{padding:'10px',borderRadius:8,border:'none',cursor:'pointer',background:tab===t.k?'rgba(0,180,255,0.12)':'transparent',color:tab===t.k?T.cyan:T.muted,fontSize:13,fontWeight:700,fontFamily:"'Cairo',sans-serif",WebkitTapHighlightColor:'transparent'}}>{t.l}</button>
          ))}
        </div>

        {tab==='signal' && <>
          <div style={{fontSize:11,color:T.muted,fontFamily:'monospace'}}>{selectedSymbol} · ${f(price)}</div>
          <button onClick={analyze} disabled={loading} style={{width:'100%',padding:'14px',borderRadius:14,border:'1px solid rgba(179,136,255,0.3)',cursor:loading?'not-allowed':'pointer',background:'linear-gradient(135deg,rgba(179,136,255,0.15),rgba(0,180,255,0.08))',color:T.purple,fontSize:15,fontWeight:800,fontFamily:"'Cairo',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:8,WebkitTapHighlightColor:'transparent'}}>
            {loading ? <><RefreshCw size={15} style={{animation:'spin 1s linear infinite'}}/> جاري التحليل...</> : '🧠 تحليل بـ 8 نماذج AI'}
          </button>
          {sig && <>
            <div style={{background:sig.action==='BUY'?'linear-gradient(135deg,rgba(0,255,163,0.1),rgba(0,255,163,0.03))':sig.action==='SELL'?'linear-gradient(135deg,rgba(255,59,92,0.1),rgba(255,59,92,0.03))':'rgba(255,255,255,0.04)',border:`1px solid ${sig.action==='BUY'?'rgba(0,255,163,0.2)':sig.action==='SELL'?'rgba(255,59,92,0.2)':T.border}`,borderRadius:18,padding:18}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{fontSize:28,fontWeight:900,color:sig.action==='BUY'?T.green:sig.action==='SELL'?T.red:T.amber,fontFamily:"'Cairo',sans-serif"}}>{sig.action==='BUY'?'▲ شراء':sig.action==='SELL'?'▼ بيع':'◆ انتظار'}</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:4,fontFamily:"'Cairo',sans-serif"}}>{sig.models} نماذج</div>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:36,fontWeight:900,fontFamily:'monospace',color:sig.conf>=70?T.green:sig.conf>=50?T.amber:T.red}}>{sig.conf}%</div>
                  <div style={{fontSize:9,color:T.muted}}>الثقة</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                {[{l:'دخول',v:f(sig.entry),c:T.cyan},{l:'وقف',v:f(sig.sl),c:T.red},{l:'هدف',v:f(sig.tp),c:T.green}].map(x=>(
                  <div key={x.l} style={{background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'8px 10px'}}>
                    <div style={{fontSize:8,color:T.muted,textTransform:'uppercase',marginBottom:2}}>{x.l}</div>
                    <div style={{fontSize:12,fontWeight:800,fontFamily:'monospace',color:x.c}}>{x.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {sig.action!=='WAIT' && <button onClick={execSig} style={{width:'100%',padding:'14px',borderRadius:14,border:'none',cursor:'pointer',background:sig.action==='BUY'?'linear-gradient(135deg,#00FFA3,#10B981)':'linear-gradient(135deg,#FF3B5C,#EF4444)',color:'#fff',fontSize:15,fontWeight:900,fontFamily:"'Cairo',sans-serif",WebkitTapHighlightColor:'transparent'}}>⚡ تنفيذ الإشارة</button>}
          </>}
        </>}

        {tab==='agent' && <>
          <div style={{background:isRunning?'rgba(0,200,150,0.06)':'rgba(255,255,255,0.025)',border:`1px solid ${isRunning?'rgba(0,200,150,0.2)':T.border}`,borderRadius:18,padding:18}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:T.text,fontFamily:"'Cairo',sans-serif"}}>الوكيل الذكي</div>
                <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:isRunning?T.green:T.muted,boxShadow:isRunning?`0 0 6px ${T.green}`:undefined}}/>
                  <span style={{fontSize:11,color:isRunning?T.green:T.muted,fontFamily:"'Cairo',sans-serif"}}>{isRunning?'يعمل':'متوقف'}</span>
                </div>
              </div>
              <button onClick={()=>isRunning?stopAgent():startAgent(StrategyType.AUTO)} style={{padding:'10px 16px',borderRadius:12,border:'none',cursor:'pointer',background:isRunning?'rgba(255,59,92,0.15)':'rgba(0,200,150,0.15)',color:isRunning?T.red:T.green,fontSize:13,fontWeight:800,fontFamily:"'Cairo',sans-serif",display:'flex',alignItems:'center',gap:5,WebkitTapHighlightColor:'transparent'}}>
                {isRunning?<><Square size={12}/> إيقاف</>:<><Play size={12}/> تشغيل</>}
              </button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[{l:'P&L اليوم',v:`${dailyPnL>=0?'+':''}$${f(dailyPnL)}`,c:dailyPnL>0?T.green:dailyPnL<0?T.red:T.muted},{l:'صفقات',v:String(dailyTrades),c:T.cyan}].map(x=>(
                <div key={x.l} style={{background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'8px 12px'}}>
                  <div style={{fontSize:9,color:T.muted,fontFamily:"'Cairo',sans-serif"}}>{x.l}</div>
                  <div style={{fontSize:14,fontWeight:800,fontFamily:'monospace',color:x.c,marginTop:2}}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{background:'rgba(255,184,0,0.06)',border:'1px solid rgba(255,184,0,0.15)',borderRadius:12,padding:'12px 14px',fontSize:11,color:T.amber,fontFamily:"'Cairo',sans-serif",lineHeight:1.7}}>
            ⚠️ الوكيل يتداول تلقائياً. تأكد من إعداد حدود المخاطرة.
          </div>
        </>}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
