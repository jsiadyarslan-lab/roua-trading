'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useSingleQuote, useHistoricalCandles } from '@/hooks/useMarketData'

interface Bar { o:number; h:number; l:number; c:number; v:number; t:number }
type ChartType = 'candle'|'hollow'|'bar'|'line'|'area'|'heikin'
type DrawTool  = 'cursor'|'trend'|'hline'|'fib'|'rect'
type SubType   = 'rsi'|'macd'|'stoch'
interface Drawing { type:string; b1?:number; p1?:number; b2?:number; p2?:number; price?:number; color:string }

const C = {
  bg:'#080810', bg2:'#11111A', bg4:'#1C1C28',
  cyan:'#00E5FF', green:'#00C853', red:'#FF3B30',
  gold:'#FFB800', purple:'#B388FF',
  border:'rgba(0,229,255,0.10)', border2:'rgba(0,229,255,0.28)',
  text:'#E6EBF5', text2:'#A0AFC3', text3:'#606080', text4:'#404060',
}
const PW = 62

interface St {
  candles:Bar[]; ha:Bar[]; type:ChartType; sub:SubType; tf:number
  inds:Record<string,boolean>; tool:DrawTool; drawings:Drawing[]
  drawStart:{b:number;p:number}|null; rightOffset:number; barsVis:number
  mx:number; my:number; drag:boolean; dragX0:number; dragOff0:number
  W:number; H:number; mH:number; pMin:number; pMax:number
  barsData:Bar[]; startIdx:number; barW:number; barSpacing:number
  upCol:string; dnCol:string; upBorder:string; dnBorder:string
  showGrid:boolean; showSessions:boolean; showPriceLine:boolean
  showVol:boolean; volAlpha:number; bgColor:string
}

const mkSt = (): St => ({
  candles:[], ha:[], type:'candle', sub:'rsi', tf:15,
  inds:{ma20:false,ma50:false,ema12:false,ema26:false,bb:false},
  tool:'cursor', drawings:[], drawStart:null,
  rightOffset:0, barsVis:80,
  mx:-1, my:-1, drag:false, dragX0:0, dragOff0:0,
  W:0, H:0, mH:0, pMin:0, pMax:1,
  barsData:[], startIdx:0, barW:0, barSpacing:0,
  upCol:'#00C853', dnCol:'#FF3B30', upBorder:'#00C853', dnBorder:'#FF3B30',
  showGrid:true, showSessions:true, showPriceLine:true,
  showVol:true, volAlpha:0.35, bgColor:'#080810',
})

// ── Math ──
function ema(a:number[],p:number):number[]{const k=2/(p+1);let e=a[0];return a.map((v,i)=>{e=i===0?v:v*k+e*(1-k);return e})}
function sma(a:number[],p:number):(number|null)[]{return a.map((_,i)=>i<p-1?null:a.slice(i-p+1,i+1).reduce((s,v)=>s+v,0)/p)}
function bbCalc(cls:number[],p=20):({u:number;m:number;l:number}|null)[]{const ma=sma(cls,p);return cls.map((_,i)=>{if(i<p-1||ma[i]==null)return null;const sl=cls.slice(i-p+1,i+1),m=ma[i] as number,sd=Math.sqrt(sl.reduce((a,v)=>a+(v-m)**2,0)/p);return{u:m+2*sd,m,l:m-2*sd}})}
function rsiCalc(cls:number[],p=14):(number|null)[]{const out:(number|null)[]=[null];let ag=0,al=0;for(let i=1;i<cls.length;i++){const d=cls[i]-cls[i-1],g=d>0?d:0,l=d<0?-d:0;if(i<=p){ag+=g/p;al+=l/p;out.push(null);continue}ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p;out.push(al===0?100:100-100/(1+ag/al))}return out}
function macdCalc(cls:number[]):{m:number[];s:number[];h:number[]}{const k12=2/13,k26=2/27,k9=2/10;let e12=cls[0],e26=cls[0],sg=0;const m:number[]=[],s:number[]=[],h:number[]=[];cls.forEach((v,i)=>{e12=i===0?v:v*k12+e12*(1-k12);e26=i===0?v:v*k26+e26*(1-k26);const mc=e12-e26;sg=i===0?mc:mc*k9+sg*(1-k9);m.push(mc);s.push(sg);h.push(mc-sg)});return{m,s,h}}

function niceStep(range:number,count:number):number{const raw=range/count,mag=Math.pow(10,Math.floor(Math.log10(raw)));for(const s of[1,2,2.5,5,10])if(s*mag>=raw)return s*mag;return mag*10}

function genFallback(pair:string,tf:number):Bar[]{
  const prices:Record<string,{p:number;d:number}>={'BTC/USD':{p:84120,d:0},'ETH/USD':{p:3210,d:2},'EUR/USD':{p:1.08432,d:5},'GBP/USD':{p:1.2738,d:5},'USD/JPY':{p:149.55,d:3},'XAU/USD':{p:2944.2,d:2}}
  const info=prices[pair]||{p:100,d:2};const{p:target,d:dp}=info;const vol=target*0.0018;const bars:Bar[]=[];const now=Date.now();let px=target*(0.97+Math.random()*0.02)
  for(let i=400;i>=0;i--){const drift=(target-px)*0.004;const bias=(Math.random()-0.47)*0.25+drift/Math.max(vol,1e-9);const o=px+(Math.random()-0.5)*vol*0.3;const c=o+bias*vol+(Math.random()-0.5)*vol*0.5;const sw=Math.abs(c-o)+Math.random()*vol*0.3;const h=Math.max(o,c)+Math.random()*sw*0.5;const l=Math.min(o,c)-Math.random()*sw*0.5;bars.push({o:+o.toFixed(dp),h:+h.toFixed(dp),l:+l.toFixed(dp),c:+c.toFixed(dp),v:Math.floor(80+Math.random()*800),t:now-i*tf*60000});px=c}
  return bars
}

const TF_MAP:Record<string,string>={'1m':'1min','5m':'5min','15m':'15min','30m':'15min','1h':'1h','4h':'4h','1d':'1day','1w':'1day'}
const TF_MIN:Record<string,number>={'1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440,'1w':10080}

// ── React Component ──
export default function QuantumChartEngine() {
  const { selectedPair, activeTimeframe, setActiveTimeframe, toggleChartFullscreen } = useDashboardStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [st, setSt] = useState<St>(mkSt())
  const [dirty, setDirty] = useState(true)

  const interval = TF_MAP[activeTimeframe] || '15min'
  const tfMins = TF_MIN[activeTimeframe] || 15
  const { candles } = useHistoricalCandles(selectedPair, interval)
  const { quote } = useSingleQuote(selectedPair, 5000)

  useEffect(() => {
    setSt(s => {
      const b = (candles.length > 0 ? candles.map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, t: new Date(c.timestamp).getTime() })) : genFallback(selectedPair, tfMins)).sort((a,b)=>a.t-b.t)
      return { ...s, candles: b, tf: tfMins }
    })
    setDirty(true)
  }, [selectedPair, activeTimeframe, candles, tfMins])

  useEffect(() => {
    if (!quote) return
    setSt(s => {
      if (!s.candles.length) return s
      const last = s.candles[s.candles.length - 1]
      if (last.c === quote.price) return s
      const b = [...s.candles]
      b[b.length - 1] = { ...last, c: quote.price, h: Math.max(last.h, quote.price), l: Math.min(last.l, quote.price) }
      return { ...s, candles: b }
    })
    setDirty(true)
  }, [quote])

  const draw = useCallback(() => {
    const cvs = canvasRef.current, div = containerRef.current
    if (!cvs || !div) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = div.clientWidth, H = div.clientHeight
    if (cvs.width !== W * dpr || cvs.height !== H * dpr) {
      cvs.width = W * dpr; cvs.height = H * dpr
      cvs.style.width = W + 'px'; cvs.style.height = H + 'px'
      ctx.scale(dpr, dpr)
    }
    
    const all = st.type === 'heikin' ? st.ha : st.candles
    const n = all.length
    const bv = Math.max(5, Math.min(st.barsVis, n))
    const end = Math.max(bv, n - st.rightOffset)
    const start = Math.max(0, end - bv)
    const bd = all.slice(start, end)
    
    if(!bd.length) return
    const prices = bd.flatMap(b => [b.h, b.l])
    let pMin = Math.min(...prices), pMax = Math.max(...prices)
    const r = pMax - pMin || pMin * 0.01
    pMin -= r * 0.1; pMax += r * 0.1
    
    const cW = W - PW, mH = H
    const bSp = cW / Math.max(1, bd.length)
    const bW = Math.max(1, bSp * 0.72)
    const pY = (p:number) => mH * (1 - (p - pMin) / (pMax - pMin))
    const bX = (i:number) => (i + 0.5) * bSp

    ctx.fillStyle = st.bgColor; ctx.fillRect(0, 0, W, H)
    
    if(st.showGrid) { ctx.strokeStyle=C.border; ctx.lineWidth=0.5 }
    const pStep = niceStep(pMax - pMin, 7)
    let pg = Math.ceil(pMin / pStep) * pStep
    ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'left'
    while (pg <= pMax) {
      const y = pY(pg)
      if (st.showGrid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cW, y); ctx.stroke() }
      ctx.fillStyle = C.text2; ctx.fillText(pg.toFixed(5), cW + 4, y + 3)
      pg += pStep
    }

    bd.forEach((b, i) => {
      const x = bX(i), up = b.c >= b.o
      const yH = pY(b.h), yL = pY(b.l), yO = pY(b.o), yC = pY(b.c)
      const bTop = Math.min(yO, yC), bH = Math.max(1, Math.abs(yO - yC)), hw = bW / 2
      
      ctx.strokeStyle = up ? st.upCol : st.dnCol
      ctx.fillStyle = up ? st.upCol : st.dnCol
      ctx.lineWidth = 1.5
      
      if (st.type === 'bar') {
        ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x - hw, yO); ctx.lineTo(x, yO); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x, yC); ctx.lineTo(x + hw, yC); ctx.stroke()
      } else if (st.type === 'line') {
        if(i===0) { ctx.beginPath(); ctx.moveTo(x, yC) } else ctx.lineTo(x, yC)
        if(i===bd.length-1) ctx.stroke()
      } else {
        ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke()
        if (st.type === 'hollow') {
          ctx.strokeStyle = up ? st.upBorder : st.dnBorder
          ctx.strokeRect(x - hw, bTop, bW, bH)
          if (!up) ctx.fillRect(x - hw, bTop, bW, bH)
        } else {
          ctx.fillRect(x - hw, bTop, bW, bH)
        }
      }
    })

    const last = bd[bd.length - 1]
    if (last && st.showPriceLine) {
      const ly = pY(last.c)
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.cyan; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(cW, ly); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = C.cyan; ctx.fillRect(cW, ly - 8, PW, 16)
      ctx.fillStyle = C.bg; ctx.fillText(last.c.toFixed(5), cW + 4, ly + 3)
    }
  }, [st])

  useEffect(() => {
    if (dirty) { draw(); setDirty(false) }
  }, [dirty, draw])

  useEffect(() => {
    const handleResize = () => setDirty(true)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 38, background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: '0 8px', gap: 8 }}>
        <select value={st.type} onChange={e=> { setSt(s=>({...s, type: e.target.value as ChartType})); setDirty(true) }} style={{ background: C.bg4, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 4px', fontSize: 11 }}>
          <option value="candle">شموع</option><option value="hollow">مجوفة</option><option value="bar">OHLC</option><option value="line">خط</option>
        </select>
        <div style={{ display: 'flex', gap: 2 }}>
          {['1m','5m','15m','1h','4h','1d'].map(tf => (
            <button key={tf} onClick={()=>setActiveTimeframe(tf)} style={{ background: activeTimeframe === tf ? C.border2 : 'transparent', color: activeTimeframe === tf ? C.cyan : C.text3, border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>{tf}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={toggleChartFullscreen} style={{ background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 16 }}>⛶</button>
      </div>
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        onWheel={e => { e.preventDefault(); const zf = e.deltaY > 0 ? 1.12 : 0.89; setSt(s => { const rv = Math.max(10, Math.min(400, Math.round(s.barsVis * zf))); const fx = Math.max(0, Math.min(1, e.nativeEvent.offsetX / Math.max(1, e.currentTarget.clientWidth - PW))); return { ...s, barsVis: rv, rightOffset: Math.max(0, Math.round(s.rightOffset + (rv - s.barsVis) * (1 - fx))) } }); setDirty(true) }}
        onMouseDown={e => { setSt(s => ({ ...s, drag: true, dragX0: e.clientX, dragOff0: s.rightOffset })); setDirty(true) }}
        onMouseMove={e => { if (st.drag) { setSt(s => { const dx = e.clientX - s.dragX0; const bSp = (e.currentTarget.clientWidth - PW) / Math.max(1, s.barsVis); const delta = Math.round(dx / Math.max(2, bSp)); return { ...s, rightOffset: Math.max(0, Math.min(s.candles.length - 5, s.dragOff0 - delta)) } }); setDirty(true) } }}
        onMouseUp={() => setSt(s => ({ ...s, drag: false }))}
        onMouseLeave={() => setSt(s => ({ ...s, drag: false }))}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
        <div style={{ position: 'absolute', top: 4, right: PW+8, left: 8, display: 'flex', gap: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", pointerEvents: 'none', zIndex: 10 }}>
          <span style={{ color: C.cyan, fontWeight: 'bold' }}>{selectedPair}</span>
          {st.candles.length > 0 && (
            <span style={{ color: C.text3 }}>
              O: <span style={{ color: C.text }}>{st.candles[st.candles.length-1].o.toFixed(5)}</span>{' '}
              H: <span style={{ color: C.green }}>{st.candles[st.candles.length-1].h.toFixed(5)}</span>{' '}
              L: <span style={{ color: C.red }}>{st.candles[st.candles.length-1].l.toFixed(5)}</span>{' '}
              C: <span style={{ color: C.text }}>{st.candles[st.candles.length-1].c.toFixed(5)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

