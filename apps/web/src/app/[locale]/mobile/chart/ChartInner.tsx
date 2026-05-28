'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { TIMEFRAMES } from '@/lib/charts/types'
import { ChevronDown, Maximize2, Minimize2, Gauge, Pencil, CandlestickChart, Clock, X } from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

const PAIRS = ['BTC/USD','ETH/USD','SOL/USD','XRP/USD','BNB/USD','XAU/USD','EUR/USD','GBP/USD']
const TFS = TIMEFRAMES.filter(t=>['1min','5min','15min','30min','1h','4h','1day'].includes(t.value))
const NAV_H = 58

function fmtP(p:number){ return p>=1000?p.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(4):p.toFixed(5) }

const Btn = ({icon:I,onClick}:{icon:any,onClick:()=>void}) => (
  <button onClick={onClick} style={{width:32,height:32,borderRadius:8,border:'none',cursor:'pointer',background:'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
    <I size={14} color="rgba(255,255,255,0.6)"/>
  </button>
)

export default function ChartInner() {
  const tc = useTranslations('common')
  const t = useTranslations('mobile')
  const { selectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s=>s.quotes)
  const { refreshAfterTrade } = usePositionsStore()
  const { addTrade } = usePaperTradesStore()
  const { addNotification } = useNotificationStore()

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showPairs, setShowPairs] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy'|'sell'>('buy')
  const [executing, setExecuting] = useState(false)
  const chartActionsRef = useRef<any>(null)
  const { setSelectedSymbol } = useSymbolStore()

  const q = quotes[selectedSymbol]
  const currentPrice = q?.price||0
  const chgPct = q?.changePercent||0
  const isPos = chgPct>=0

  const execute = useCallback(async()=>{
    if(executing) return
    setExecuting(true)
    try {
      const sl = orderSide==='buy'?currentPrice*0.985:currentPrice*1.015
      const tp = orderSide==='buy'?currentPrice*1.02:currentPrice*0.98
      const r = await fetch('/api/alpaca/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:selectedSymbol,side:orderSide,qty:0.01,type:'market',stop_loss:sl,take_profit:tp})})
      const j = await r.json()
      if(j.success){
        addTrade({symbol:selectedSymbol,side:orderSide==='buy'?'long':'short',qty:0.01,entryPrice:j.filledAvgPrice||currentPrice,currentPrice,sl,tp,source:'manual',entryTime:Date.now()})
        addNotification({source:'trade',priority:'high',action:orderSide.toUpperCase() as any,title:`${orderSide==='buy'?tc('buy'):tc('sell')} ${selectedSymbol}`,body:`تم التنفيذ @ $${fmtP(j.filledAvgPrice||currentPrice)}`,pair:selectedSymbol,price:j.filledAvgPrice||currentPrice})
        refreshAfterTrade()
        setShowOrder(false)
      }
    } catch {}
    finally { setExecuting(false) }
  },[executing,orderSide,currentPrice,selectedSymbol,addTrade,addNotification,refreshAfterTrade,tc])

  const CHART_H = isFullscreen
    ? `calc(100dvh - ${NAV_H}px - env(safe-area-inset-bottom,0px) - 96px)`
    : '340px'

  return (
    <div style={{display:'flex',flexDirection:'column',height:isFullscreen?`calc(100dvh - ${NAV_H}px - env(safe-area-inset-bottom,0px))`:'auto'}}>

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',background:'rgba(6,10,20,0.95)',borderBottom:'0.5px solid rgba(255,255,255,0.06)',zIndex:10,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <button onClick={()=>setShowPairs(true)} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.05)',border:'0.5px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'4px 8px',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
            <span style={{fontSize:13,fontWeight:800,color:'#FFF',fontFamily:'monospace'}}>{selectedSymbol}</span>
            <ChevronDown size={12} color="rgba(255,255,255,0.4)"/>
          </button>
          {currentPrice>0&&(
            <div style={{display:'flex',alignItems:'baseline',gap:4}}>
              <span style={{fontSize:15,fontWeight:900,color:isPos?'#00FFA3':'#FF3B5C',fontFamily:'monospace'}}>${fmtP(currentPrice)}</span>
              <span style={{fontSize:10,fontWeight:800,color:isPos?'#00FFA3':'#FF3B5C',fontFamily:'monospace'}}>{isPos?'+':''}{chgPct.toFixed(2)}%</span>
            </div>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:2}}>
          <Btn icon={Gauge} onClick={()=>chartActionsRef.current?.toggleIndicators()}/>
          <Btn icon={Pencil} onClick={()=>chartActionsRef.current?.toggleDrawings()}/>
          <Btn icon={CandlestickChart} onClick={()=>chartActionsRef.current?.toggleChartType()}/>
          <Btn icon={Clock} onClick={()=>chartActionsRef.current?.toggleTimeframe()}/>
          <Btn icon={isFullscreen?Minimize2:Maximize2} onClick={()=>setIsFullscreen(f=>!f)}/>
        </div>
      </div>

      {/* TF Bar */}
      <div style={{display:'flex',overflowX:'auto',padding:'4px 8px',background:'rgba(6,10,20,0.8)',direction:'ltr',flexShrink:0}}>
        {TFS.map(tf=>(
          <button key={tf.value} onClick={()=>setTimeframe(tf.value)} style={{padding:'4px 10px',borderRadius:6,border:'none',cursor:'pointer',background:timeframe===tf.value?'rgba(0,180,255,0.12)':'transparent',color:timeframe===tf.value?'#00B4FF':'rgba(255,255,255,0.3)',fontSize:10,fontWeight:800,fontFamily:'monospace',minWidth:32,textAlign:'center',flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
            {tf.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{flex:1,position:'relative',height:CHART_H,minHeight:200}}>
        <RouaChart currentPrice={currentPrice} mobile hideToolbar isChartFullscreen={isFullscreen} onToggleChartFullscreen={()=>setIsFullscreen(f=>!f)} chartActions={chartActionsRef}/>
      </div>

      {/* Trade Buttons */}
      <div style={{display:'flex',gap:8,padding:'10px 14px',background:'rgba(6,10,20,0.97)',borderTop:'0.5px solid rgba(255,255,255,0.06)',flexShrink:0}}>
        <button onClick={()=>{setOrderSide('buy');setShowOrder(true)}} style={{flex:1,padding:'12px 0',borderRadius:12,border:'none',cursor:'pointer',background:'linear-gradient(135deg,#00FFA3,#00D4FF)',color:'#000',fontSize:14,fontWeight:900,fontFamily:"'Cairo',sans-serif",WebkitTapHighlightColor:'transparent'}}>
          {tc('buy')}
        </button>
        <button onClick={()=>{setOrderSide('sell');setShowOrder(true)}} style={{flex:1,padding:'12px 0',borderRadius:12,border:'none',cursor:'pointer',background:'linear-gradient(135deg,#FF3B5C,#FF6B6B)',color:'#FFF',fontSize:14,fontWeight:900,fontFamily:"'Cairo',sans-serif",WebkitTapHighlightColor:'transparent'}}>
          {tc('sell')}
        </button>
      </div>

      {/* Order Sheet */}
      {showOrder&&(
        <>
          <div onClick={()=>setShowOrder(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:40}}/>
          <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:41,background:'#0D1425',borderRadius:'20px 20px 0 0',padding:20,paddingBottom:`calc(20px + env(safe-area-inset-bottom,0px))`,border:'0.5px solid rgba(0,180,255,0.2)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <span style={{fontSize:16,fontWeight:900,color:'#fff',fontFamily:"'Cairo',sans-serif"}}>{orderSide==='buy'?'▲ شراء':'▼ بيع'} {selectedSymbol}</span>
              <button onClick={()=>setShowOrder(false)} style={{background:'rgba(255,255,255,0.08)',border:'none',borderRadius:8,width:32,height:32,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={16} color="rgba(255,255,255,0.6)"/></button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
              {[{l:'دخول',v:fmtP(currentPrice),c:'#00B4FF'},{l:'وقف SL',v:fmtP(orderSide==='buy'?currentPrice*0.985:currentPrice*1.015),c:'#FF3B5C'},{l:'هدف TP',v:fmtP(orderSide==='buy'?currentPrice*1.02:currentPrice*0.98),c:'#00FFA3'}].map(f=>(
                <div key={f.l} style={{background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'8px 10px'}}>
                  <div style={{fontSize:8,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',marginBottom:3,fontFamily:"'Cairo',sans-serif"}}>{f.l}</div>
                  <div style={{fontSize:12,fontWeight:800,fontFamily:'monospace',color:f.c}}>{f.v}</div>
                </div>
              ))}
            </div>
            <button onClick={execute} disabled={executing} style={{width:'100%',padding:'16px 0',borderRadius:14,border:'none',cursor:executing?'not-allowed':'pointer',background:orderSide==='buy'?'linear-gradient(135deg,#00FFA3,#00D4FF)':'linear-gradient(135deg,#FF3B5C,#FF6B6B)',color:orderSide==='buy'?'#000':'#fff',fontSize:16,fontWeight:900,fontFamily:"'Cairo',sans-serif",opacity:executing?0.7:1}}>
              {executing?'جاري التنفيذ...':`تنفيذ ${orderSide==='buy'?'شراء':'بيع'} 0.01`}
            </button>
          </div>
        </>
      )}

      {/* Pairs Sheet */}
      {showPairs&&(
        <>
          <div onClick={()=>setShowPairs(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:40}}/>
          <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:41,background:'#0D1425',borderRadius:'20px 20px 0 0',padding:20,paddingBottom:`calc(20px + env(safe-area-inset-bottom,0px))`}}>
            <div style={{fontSize:14,fontWeight:800,color:'#fff',fontFamily:"'Cairo',sans-serif",marginBottom:14}}>اختر الرمز</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {PAIRS.map(p=>(
                <button key={p} onClick={()=>{setSelectedSymbol(p);setShowPairs(false)}} style={{padding:'12px',borderRadius:12,border:`1px solid ${p===selectedSymbol?'rgba(0,180,255,0.3)':'rgba(255,255,255,0.06)'}`,background:p===selectedSymbol?'rgba(0,180,255,0.1)':'rgba(255,255,255,0.03)',cursor:'pointer',color:p===selectedSymbol?'#00B4FF':'#fff',fontSize:13,fontWeight:800,fontFamily:'monospace',WebkitTapHighlightColor:'transparent'}}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
