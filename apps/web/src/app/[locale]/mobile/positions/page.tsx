'use client'
import { useEffect, useState } from 'react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { RefreshCw, X } from 'lucide-react'

const T = {bg:'#060A14',card:'#0D1425',border:'rgba(255,255,255,0.06)',cyan:'#00B4FF',green:'#00FFA3',red:'#FF3B5C',text:'#F0F2F5',muted:'rgba(255,255,255,0.4)'}
const f = (n:number,d=2) => Number.isFinite(n)&&n ? n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—'

export default function PositionsPage() {
  const positions = usePositionsStore(s => s.positions)
  const account = usePositionsStore(s => s.account)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const refreshAfterTrade = usePositionsStore(s => s.refreshAfterTrade)
  const addNotif = useNotificationStore(s => s.addNotification)
  const quotes = useMarketStore(s => s.quotes)
  const [closing, setClosing] = useState<string|null>(null)
  const [spin, setSpin] = useState(false)

  useEffect(() => { fetchPositions(); fetchAccount() }, [fetchPositions, fetchAccount])

  const totalPnl = positions.reduce((s,p) => s+(p.unrealizedPnl||0), 0)
  const equity = Number(account?.equity) || 0

  const refresh = async () => { setSpin(true); await Promise.all([fetchPositions(),fetchAccount()]); setSpin(false) }

  const close = async (pos:any) => {
    const id = pos.dbId||pos.id; if(!id) return
    setClosing(id)
    try {
      const url = /^[0-9a-f-]{36}$/i.test(id) ? `/api/positions/${id}/close` : `/api/alpaca/positions/${(pos.rawSymbol||pos.symbol).replace('/','')}/close`
      const r = await fetch(url,{method:'DELETE'})
      if(r.ok){ addNotif({source:'trade',priority:'high',action:'CLOSE' as any,title:`إغلاق ${pos.symbol}`,body:'تم الإغلاق',pair:pos.symbol,price:pos.currentPrice}); refreshAfterTrade() }
    } catch {} finally { setClosing(null) }
  }

  return (
    <div style={{background:T.bg,minHeight:'100%'}}>
      <div style={{padding:'14px 18px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${T.border}`,background:'rgba(6,10,20,0.9)'}}>
        <div>
          <div style={{fontSize:17,fontWeight:900,color:T.text,fontFamily:"'Cairo',sans-serif"}}>صفقاتي</div>
          <div style={{fontSize:11,color:T.muted,fontFamily:'monospace',marginTop:2}}>
            {positions.length} صفقة · <span style={{color:totalPnl>=0?T.green:T.red,fontWeight:700}}>{totalPnl>=0?'+':''}{f(totalPnl)}</span>
          </div>
        </div>
        <button onClick={refresh} style={{background:'rgba(255,255,255,0.05)',border:`1px solid ${T.border}`,borderRadius:10,padding:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <RefreshCw size={16} color={T.muted} style={{animation:spin?'spin 1s linear infinite':undefined}}/>
        </button>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {positions.length===0 ? (
          <div style={{textAlign:'center',padding:'60px 20px',color:T.muted}}>
            <div style={{fontSize:36,marginBottom:12}}>📭</div>
            <div style={{fontSize:14,fontFamily:"'Cairo',sans-serif"}}>لا توجد صفقات مفتوحة</div>
          </div>
        ) : positions.map(pos => {
          const pnl = pos.unrealizedPnl||0
          const pnlPct = pos.unrealizedPnlPct||0
          const isLong = pos.side?.toUpperCase()==='BUY'||pos.side?.toLowerCase()==='long'
          const live = quotes[pos.symbol]?.price||pos.currentPrice
          const id = pos.dbId||pos.id||''
          return (
            <div key={id||pos.symbol} style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px 8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:isLong?T.green:T.red,boxShadow:`0 0 6px ${isLong?T.green:T.red}`}}/>
                  <span style={{fontSize:15,fontWeight:900,color:T.text,fontFamily:'monospace'}}>{pos.symbol}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:isLong?'rgba(0,255,163,0.12)':'rgba(255,59,92,0.12)',color:isLong?T.green:T.red}}>{isLong?'شراء':'بيع'}</span>
                </div>
                <button onClick={()=>close(pos)} disabled={closing===id} style={{background:'rgba(255,59,92,0.1)',border:'1px solid rgba(255,59,92,0.2)',borderRadius:8,padding:6,cursor:'pointer',display:'flex',alignItems:'center'}}>
                  {closing===id ? <RefreshCw size={12} color={T.red} style={{animation:'spin 1s linear infinite'}}/> : <X size={12} color={T.red}/>}
                </button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,padding:'0 14px 10px'}}>
                {[{l:'دخول',v:f(pos.avgEntryPrice||Number((pos as any).entryPrice)||0),c:T.muted},{l:'حالي',v:f(live),c:T.cyan},{l:'كمية',v:f(Math.abs(pos.qty||0),4),c:T.muted}].map(x=>(
                  <div key={x.l}>
                    <div style={{fontSize:9,color:T.muted,fontFamily:"'Cairo',sans-serif"}}>{x.l}</div>
                    <div style={{fontSize:12,fontWeight:700,fontFamily:'monospace',color:x.c,marginTop:1}}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={{margin:'0 14px 12px',padding:'8px 12px',borderRadius:10,background:pnl>=0?'rgba(0,255,163,0.06)':'rgba(255,59,92,0.06)',border:`1px solid ${pnl>=0?'rgba(0,255,163,0.15)':'rgba(255,59,92,0.15)'}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:T.muted,fontFamily:"'Cairo',sans-serif"}}>ربح/خسارة</span>
                <span style={{fontSize:15,fontWeight:900,fontFamily:'monospace',color:pnl>=0?T.green:T.red}}>{pnl>=0?'+':''}{f(pnl)} ({pnlPct>=0?'+':''}{f(pnlPct,2)}%)</span>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
