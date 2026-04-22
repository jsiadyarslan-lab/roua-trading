// ═══════════════════════════════════════════════════════════
// QUANTUM CHART ENGINE — Canvas-based professional chart
// ═══════════════════════════════════════════════════════════

const CFG = {
  get UP(){ return ST.upCol||'#3fb950'; },
  get DN(){ return ST.dnCol||'#f85149'; },
  get GRID(){ return ST.gridColor||'rgba(48,54,61,.5)'; },
  TEXT:'rgba(100,140,170,0.8)',
  CROSS:'rgba(160,200,220,0.3)',
  PW:62, TH:20, SUB:0, VOL:0.12
};

export const ST = {
  candles:[], ha:[], type:'candle', sub:'rsi', tf:15,
  inds:{ma20:false,ma50:false,ema12:false,ema26:false,bb:false,vwap:false,atr:false,cci:false,wpr:false,psar:false},
  tool:'cursor', drawings:[], drawStart:null,
  rightOffset:0, barsVis:80,
  mx:-1, my:-1, drag:false, dragX0:0, dragOff0:0,
  W:0, H:0, mH:0, pMin:0, pMax:1,
  barsData:[], startIdx:0, barW:0, barSpacing:0,
  upCol:'#3fb950', dnCol:'#f85149',
  upBorder:'#3fb950', dnBorder:'#f85149',
  showGrid:true, gridColor:'rgba(48,54,61,.5)',
  showSessions:true,
  tokyoColor:'rgba(255,255,255,.025)',
  londonColor:'rgba(88,166,255,.03)',
  nyColor:'rgba(63,185,80,.03)',
  showPriceLine:true, showCandleTimer:true, showTrades:true,
  showVol:true, volAlpha:0.35,
  bgColor:'#0d1117', crosshairType:'cross',
  openTrades: [],
};

export let CH_ctx, CH_subCtx, CH_dirty=true, CH_DPR=1;

// ── Allow external modules to mark dirty (ES module bindings are read-only) ──
export function CH_setDirty(val){ CH_dirty = val; }

// ── Helper: set contexts ──────────────────────────────────
export function CH_setContexts(mainCtx, subCtx) {
  CH_ctx = mainCtx;
  CH_subCtx = subCtx;
}

// ── DATA ─────────────────────────────────────────────────
export function CH_gen(pair, priceInfo) {
  const info = priceInfo || { p:1.0843, d:5 };
  const dp = info.d || 5;
  const targetPrice = info.p || 1.0843;
  const tf = ST.tf;
  const count = 300;
  const now = Date.now();
  const bars = [];
  let p = targetPrice * (0.985 + Math.random()*0.03);
  const vol_base = pair&&pair.includes('BTC')?500:pair&&pair.includes('XAU')?800:pair&&pair.includes('JPY')?50:pair&&pair.includes('GBP')?0.8:1.2;
  for(let i=0;i<count;i++){
    const t=now-(count-i)*tf*60000;
    const rng=p*0.003*(0.5+Math.random()*1.5);
    const o=p;
    const c=p+(Math.random()-0.485)*rng;
    const h=Math.max(o,c)+Math.random()*rng*0.5;
    const l=Math.min(o,c)-Math.random()*rng*0.5;
    const v=Math.round(vol_base*(500+Math.random()*2000));
    bars.push({t,o:+o.toFixed(dp),h:+h.toFixed(dp),l:+l.toFixed(dp),c:+c.toFixed(dp),v});
    p=c;
  }
  // Nudge last close to target
  const drift=targetPrice-bars[bars.length-1].c;
  bars.forEach((b,i)=>{const f=i/count;b.o=+(b.o+drift*f).toFixed(dp);b.h=+(b.h+drift*f).toFixed(dp);b.l=+(b.l+drift*f).toFixed(dp);b.c=+(b.c+drift*f).toFixed(dp);});
  ST.candles=bars;
  CH_buildHA();
  CH_dirty=true;
}

// ── Load real candles from external data ─────────────────
export function CH_loadCandles(candles) {
  if (!candles || !candles.length) return;
  ST.candles = candles;
  CH_buildHA();
  CH_dirty = true;
}

export function CH_buildHA(){
  ST.ha=ST.candles.map((b,i)=>{
    const o=i===0?b.o:(ST.candles[i-1].o+ST.candles[i-1].c)/2;
    const c=(b.o+b.h+b.l+b.c)/4;
    const h=Math.max(b.h,o,c),l=Math.min(b.l,o,c);
    return{t:b.t,o,h,l,c,v:b.v};
  });
}
export function CH_data(){ return ST.type==='heikin'?ST.ha:ST.candles; }
export function CH_sma(arr,p){ return arr.map((_,i)=>i<p-1?null:arr.slice(i-p+1,i+1).reduce((s,v)=>s+v,0)/p); }
export function CH_ema(arr,p){ const k=2/(p+1);let e=arr[0];return arr.map((v,i)=>{e=i===0?v:v*k+e*(1-k);return e;}); }
export function CH_bb(cls,p=20){ const ma=CH_sma(cls,p);return cls.map((_,i)=>{if(i<p-1)return null;const sl=cls.slice(i-p+1,i+1),m=ma[i],sd=Math.sqrt(sl.reduce((a,v)=>a+(v-m)**2,0)/p);return{u:m+2*sd,m,l:m-2*sd};}); }
export function CH_rsi(cls,p=14){ const out=[];let ag=0,al=0;for(let i=1;i<cls.length;i++){const d=cls[i]-cls[i-1],g=d>0?d:0,l=d<0?-d:0;if(i<=p){ag+=g/p;al+=l/p;out.push(null);continue;}ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p;out.push(al===0?100:100-100/(1+ag/al));}return out; }
export function CH_macd(cls){ const k12=2/13,k26=2/27,k9=2/10;let e12=cls[0],e26=cls[0],sg=0;const m=[],s=[],h=[];cls.forEach((v,i)=>{e12=i===0?v:v*k12+e12*(1-k12);e26=i===0?v:v*k26+e26*(1-k26);const mc=e12-e26;sg=i===0?mc:mc*k9+sg*(1-k9);m.push(mc);s.push(sg);h.push(mc-sg);});return{m,s,h}; }
export function CH_stoch(bars,p=14){ return bars.map((_,i)=>{if(i<p-1)return null;const sl=bars.slice(i-p+1,i+1),lo=Math.min(...sl.map(b=>b.l)),hi=Math.max(...sl.map(b=>b.h));return hi===lo?50:(bars[i].c-lo)/(hi-lo)*100;}); }
export function CH_vwap(bars){ let cv=0,cw=0;return bars.map(b=>{const tp=(b.h+b.l+b.c)/3;cv+=tp*b.v;cw+=b.v;return cv/cw;}); }
export function CH_niceStep(range,count){ const raw=range/count,mag=Math.pow(10,Math.floor(Math.log10(raw)));for(const s of[1,2,2.5,5,10])if(s*mag>=raw)return s*mag;return mag*10; }

export function CH_layout(){
  const c=document.getElementById('tvCanvas');const p=document.getElementById('mainChartArea');
  if(!c||!p)return;
  CH_DPR=window.devicePixelRatio||1;
  const W=p.clientWidth,H=p.clientHeight;
  if(!W||!H)return;
  ST.W=W;ST.H=H;
  c.width=W*CH_DPR;c.height=H*CH_DPR;
  c.style.width=W+'px';c.style.height=H+'px';
  if(CH_ctx)CH_ctx.setTransform(CH_DPR,0,0,CH_DPR,0,0);
  // sub
  const sc=document.getElementById('subCanvas');const sp=document.getElementById('subChartPanel');
  if(sc&&sp){
    const sH=sp.clientHeight||90;
    sc.width=W*CH_DPR;sc.height=sH*CH_DPR;
    sc.style.width=W+'px';sc.style.height=sH+'px';
    if(CH_subCtx)CH_subCtx.setTransform(CH_DPR,0,0,CH_DPR,0,0);
  }
}

export function CH_resize(){
  CH_layout();
  CH_dirty=true;
}

export function CH_drawMain(){
  if(!CH_ctx||!ST.candles.length)return;
  const W=ST.W,H=ST.H;
  const PW=CFG.PW,TH=CFG.TH;
  const bars=CH_data();
  const n=bars.length;
  const vis=Math.min(ST.barsVis,n);
  const endIdx=Math.max(vis,n-Math.max(0,Math.round(ST.rightOffset)));
  const startIdx=Math.max(0,endIdx-vis);
  const slice=bars.slice(startIdx,endIdx);
  ST.barsData=slice;ST.startIdx=startIdx;
  const chartH=H-TH-(ST.showVol?H*CFG.VOL:0);
  ST.mH=chartH;
  const barW=(W-PW)/Math.max(slice.length,1);
  const spacing=Math.max(0.5,barW*0.15);
  ST.barW=barW;ST.barSpacing=spacing;
  let pMin=Infinity,pMax=-Infinity;
  slice.forEach(b=>{if(b.l<pMin)pMin=b.l;if(b.h>pMax)pMax=b.h;});
  if(pMin===pMax){pMin*=0.999;pMax*=1.001;}
  const pad=(pMax-pMin)*0.08;
  pMin-=pad;pMax+=pad;
  ST.pMin=pMin;ST.pMax=pMax;
  const py=v=>TH+(chartH-TH)*((pMax-v)/(pMax-pMin));
  const ctx=CH_ctx;
  // Background
  ctx.fillStyle=ST.bgColor||'#0d1117';
  ctx.fillRect(0,0,W,H);
  // Grid
  if(ST.showGrid){
    const step=CH_niceStep(pMax-pMin,6);
    const first=Math.ceil(pMin/step)*step;
    ctx.strokeStyle=CFG.GRID;ctx.lineWidth=0.5;ctx.setLineDash([2,4]);
    let gp=first;while(gp<=pMax){const y=py(gp);if(y>TH&&y<H-20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W-PW,y);ctx.stroke();}gp+=step;}
    ctx.setLineDash([]);
    // Price labels
    ctx.fillStyle=CFG.TEXT;ctx.font=`10px JetBrains Mono,monospace`;ctx.textAlign='right';
    let lp=first;while(lp<=pMax){const y=py(lp);if(y>TH&&y<H-20){const dp=slice[0]?String(slice[0].c).split('.')[1]?.length||2:2;ctx.fillText(lp.toFixed(dp),W-2,y+3);}lp+=step;}
  }
  // Sessions
  if(ST.showSessions&&slice.length){
    const msPerPx=((slice[slice.length-1].t-slice[0].t)||1)/(W-PW);
    slice.forEach((b,i)=>{
      const d=new Date(b.t);const h=d.getUTCHours();
      let col=null;
      if(h>=0&&h<8)col=ST.tokyoColor;
      else if(h>=8&&h<12)col=ST.londonColor;
      else if(h>=13&&h<22)col=ST.nyColor;
      if(col){const x=i*barW;ctx.fillStyle=col;ctx.fillRect(x,TH,barW,chartH-TH);}
    });
  }
  // Volume
  if(ST.showVol){
    const maxV=Math.max(...slice.map(b=>b.v));
    const volH=H*CFG.VOL;
    slice.forEach((b,i)=>{
      const x=i*barW+spacing/2;const bw=barW-spacing;
      const vh=(b.v/maxV)*volH*0.85;
      const isBull=b.c>=b.o;
      ctx.globalAlpha=ST.volAlpha||0.35;
      ctx.fillStyle=isBull?CFG.UP:CFG.DN;
      ctx.fillRect(x,H-vh,bw,vh);
    });
    ctx.globalAlpha=1;
  }
  // Indicators (overlay)
  const cls=slice.map(b=>b.c);
  if(ST.inds.ma20){const ma=CH_sma(cls,Math.min(20,cls.length));drawLine(ctx,ma,slice,barW,py,'rgba(251,191,36,.8)',1.2);}
  if(ST.inds.ma50){const ma=CH_sma(cls,Math.min(50,cls.length));drawLine(ctx,ma,slice,barW,py,'rgba(139,92,246,.8)',1.2);}
  if(ST.inds.ema12){const ema=CH_ema(cls,12);drawLine(ctx,ema,slice,barW,py,'rgba(34,211,238,.7)',1);}
  if(ST.inds.ema26){const ema=CH_ema(cls,26);drawLine(ctx,ema,slice,barW,py,'rgba(249,115,22,.7)',1);}
  if(ST.inds.bb){const bb=CH_bb(cls);bb.forEach((v,i)=>{if(!v)return;const x=i*barW+barW/2;['u','m','l'].forEach((k,ki)=>{if(i===0)return;const pv=bb[i-1];if(!pv)return;ctx.strokeStyle=ki===1?'rgba(88,166,255,.4)':'rgba(88,166,255,.2)';ctx.lineWidth=ki===1?0.8:0.5;ctx.setLineDash(ki===1?[3,3]:[]);ctx.beginPath();ctx.moveTo((i-1)*barW+barW/2,py(pv[k]));ctx.lineTo(x,py(v[k]));ctx.stroke();ctx.setLineDash([]);});});}
  if(ST.inds.vwap){const vw=CH_vwap(slice);drawLine(ctx,vw,slice,barW,py,'rgba(255,215,0,.6)',1.2);}
  // Candles
  slice.forEach((b,i)=>{
    const x=i*barW;const mx=x+barW/2;const bw=Math.max(1,barW-spacing);
    const isBull=b.c>=b.o;
    const col=isBull?CFG.UP:CFG.DN;
    const brdCol=isBull?ST.upBorder:ST.dnBorder;
    if(ST.type==='line'||ST.type==='area'){
      if(i>0){
        const prev=slice[i-1];
        ctx.strokeStyle='rgba(88,166,255,.9)';ctx.lineWidth=1.5;ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo((i-1)*barW+barW/2,py(prev.c));ctx.lineTo(mx,py(b.c));ctx.stroke();
        if(ST.type==='area'&&i===slice.length-1){
          ctx.fillStyle='rgba(88,166,255,.06)';
          ctx.beginPath();ctx.moveTo(barW/2,py(slice[0].c));
          slice.forEach((sb,si)=>{ctx.lineTo(si*barW+barW/2,py(sb.c));});
          ctx.lineTo((slice.length-1)*barW+barW/2,chartH);ctx.lineTo(barW/2,chartH);ctx.closePath();ctx.fill();
        }
      }
      return;
    }
    if(ST.type==='bar'){
      ctx.strokeStyle=col;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(mx,py(b.h));ctx.lineTo(mx,py(b.l));ctx.stroke();
      ctx.beginPath();ctx.moveTo(mx-3,py(b.o));ctx.lineTo(mx,py(b.o));ctx.stroke();
      ctx.beginPath();ctx.moveTo(mx,py(b.c));ctx.lineTo(mx+3,py(b.c));ctx.stroke();
      return;
    }
    if(ST.type==='hollow'){
      ctx.strokeStyle=brdCol;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(mx,py(b.h));ctx.lineTo(mx,py(Math.max(b.o,b.c)));ctx.stroke();
      ctx.beginPath();ctx.moveTo(mx,py(b.l));ctx.lineTo(mx,py(Math.min(b.o,b.c)));ctx.stroke();
      const bodyH=Math.max(1,Math.abs(py(b.o)-py(b.c)));
      const bodyY=Math.min(py(b.o),py(b.c));
      if(isBull){ctx.strokeRect(x+spacing/2,bodyY,bw,bodyH);}
      else{ctx.fillStyle=col;ctx.fillRect(x+spacing/2,bodyY,bw,bodyH);}
      return;
    }
    // Default: candle
    ctx.fillStyle=col;ctx.strokeStyle=brdCol;ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(mx,py(b.h));ctx.lineTo(mx,py(Math.max(b.o,b.c)));ctx.stroke();
    ctx.beginPath();ctx.moveTo(mx,py(b.l));ctx.lineTo(mx,py(Math.min(b.o,b.c)));ctx.stroke();
    const bodyH=Math.max(1,Math.abs(py(b.o)-py(b.c)));
    const bodyY=Math.min(py(b.o),py(b.c));
    ctx.fillRect(x+spacing/2,bodyY,bw,bodyH);
    if(brdCol){ctx.strokeRect(x+spacing/2,bodyY,bw,bodyH);}
  });
  // Drawings
  CH_renderDrawings(ctx,W,6);
  // Price line
  if(ST.showPriceLine&&slice.length){
    const lastC=slice[slice.length-1].c;
    const y=py(lastC);
    const isBull=slice[slice.length-1].c>=slice[slice.length-1].o;
    ctx.strokeStyle=isBull?CFG.UP:CFG.DN;ctx.lineWidth=0.8;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W-PW,y);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=isBull?CFG.UP:CFG.DN;
    const dp=String(lastC).split('.')[1]?.length||2;
    const label=lastC.toFixed(dp);
    const lw=ctx.measureText(label).width+8;
    ctx.fillRect(W-PW,y-9,PW,17);
    ctx.fillStyle='#000';ctx.font='bold 10px JetBrains Mono,monospace';ctx.textAlign='center';
    ctx.fillText(label,W-PW+PW/2,y+3.5);
  }
  // Crosshair
  if(ST.mx>=0&&ST.my>=0&&ST.mx<W-PW&&ST.my>TH&&ST.my<H-20){
    const ci=Math.min(Math.floor(ST.mx/barW),slice.length-1);
    const bar=slice[ci];
    if(bar){
      // Update OHLC display
      const dp=String(bar.c).split('.')[1]?.length||2;
      const elO=document.getElementById('tbChO');const elH=document.getElementById('tbChH');
      const elL=document.getElementById('tbChL');const elC=document.getElementById('tbChC');
      if(elO)elO.textContent=bar.o.toFixed(dp);if(elH)elH.textContent=bar.h.toFixed(dp);
      if(elL)elL.textContent=bar.l.toFixed(dp);if(elC)elC.textContent=bar.c.toFixed(dp);
    }
    if(ST.crosshairType!=='none'){
      ctx.strokeStyle=CFG.CROSS;ctx.lineWidth=0.8;ctx.setLineDash([3,3]);
      if(ST.crosshairType==='cross'||ST.crosshairType==='dot'){
        ctx.beginPath();ctx.moveTo(0,ST.my);ctx.lineTo(W-PW,ST.my);ctx.stroke();
        ctx.beginPath();ctx.moveTo(ST.mx,TH);ctx.lineTo(ST.mx,H-20);ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
}

function drawLine(ctx,vals,slice,barW,py,color,lw=1){
  ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.setLineDash([]);
  let started=false;
  ctx.beginPath();
  vals.forEach((v,i)=>{if(v===null||v===undefined)return;const x=i*barW+barW/2;if(!started){ctx.moveTo(x,py(v));started=true;}else{ctx.lineTo(x,py(v));}});
  ctx.stroke();
}

export function CH_drawSub(){
  if(!CH_subCtx)return;
  const sc=document.getElementById('subCanvas');
  const sp=document.getElementById('subChartPanel');
  if(!sc||!sp)return;
  const W=ST.W,H=sp.clientHeight||90;
  const ctx=CH_subCtx;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#141b27';ctx.fillRect(0,0,W,H);
  const slice=ST.barsData;if(!slice||!slice.length)return;
  const cls=slice.map(b=>b.c);
  const barW=ST.barW;
  const spacing=ST.barSpacing;
  if(ST.sub==='rsi'){
    const rsi=CH_rsi(cls);
    const py=v=>H*(1-v/100)*0.85+H*0.05;
    [30,50,70].forEach(l=>{ctx.strokeStyle=l===50?'rgba(255,255,255,.1)':'rgba(255,100,100,.2)';ctx.lineWidth=0.5;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(0,py(l));ctx.lineTo(W,py(l));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(255,255,255,.3)';ctx.font='8px monospace';ctx.textAlign='left';ctx.fillText(l,2,py(l)-2);});
    ctx.strokeStyle='rgba(88,166,255,.8)';ctx.lineWidth=1.2;ctx.setLineDash([]);
    let s=false;ctx.beginPath();rsi.forEach((v,i)=>{if(v===null)return;const x=i*barW+barW/2;if(!s){ctx.moveTo(x,py(v));s=true;}else{ctx.lineTo(x,py(v));}});ctx.stroke();
    const last=rsi.filter(v=>v!==null).pop();
    if(last){ctx.fillStyle=last>70?'#f85149':last<30?'#3fb950':'rgba(88,166,255,.9)';ctx.font='bold 9px monospace';ctx.textAlign='right';ctx.fillText('RSI '+last.toFixed(1),W-2,10);}
  } else if(ST.sub==='macd'){
    const {m,s,h}=CH_macd(cls);
    const all=[...m,...s,...h].filter(Boolean);
    const mxV=Math.max(...all.map(Math.abs),0.0001);
    const py=v=>H/2-(v/mxV)*(H*0.4);
    h.forEach((v,i)=>{if(v===null||v===undefined)return;const x=i*barW+spacing/2;const bw=Math.max(1,barW*0.8);ctx.fillStyle=v>=0?'rgba(63,185,80,.6)':'rgba(248,81,73,.6)';ctx.fillRect(x,py(0),bw,(py(v)-py(0)));});
    drawLine(ctx,m,slice,barW,py,'rgba(88,166,255,.8)',1);
    drawLine(ctx,s,slice,barW,py,'rgba(249,115,22,.7)',1);
    ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(0,py(0));ctx.lineTo(W,py(0));ctx.stroke();
    ctx.fillStyle='rgba(88,166,255,.7)';ctx.font='bold 9px monospace';ctx.textAlign='right';ctx.fillText('MACD',W-2,10);
  } else if(ST.sub==='stoch'){
    const stch=CH_stoch(slice);
    const py=v=>H*(1-v/100)*0.85+H*0.05;
    [20,50,80].forEach(l=>{ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=0.5;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(0,py(l));ctx.lineTo(W,py(l));ctx.stroke();ctx.setLineDash([]);});
    drawLine(ctx,stch,slice,barW,py,'rgba(139,92,246,.8)',1.2);
    ctx.fillStyle='rgba(139,92,246,.7)';ctx.font='bold 9px monospace';ctx.textAlign='right';ctx.fillText('Stoch',W-2,10);
  }
}

export function CH_renderDrawings(ctx,cW,dp){
  const barW=ST.barW;const py=v=>ST.mH?(ST.H)*(ST.pMax-v)/(ST.pMax-ST.pMin)*((ST.mH-20)/(ST.H))+20:0;
  const ix=i=>(i-ST.startIdx)*barW+barW/2;
  ST.drawings.forEach(d=>{
    ctx.strokeStyle='rgba(255,200,50,.75)';ctx.lineWidth=1.5;ctx.setLineDash([]);
    if(d.type==='hline'){const y=py(d.price);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cW-CFG.PW,y);ctx.stroke();ctx.fillStyle='rgba(255,200,50,.7)';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText(d.price.toFixed(dp||5),4,y-3);}
    else if(d.type==='trend'&&d.x2!==undefined){ctx.beginPath();ctx.moveTo(d.x1,d.y1);ctx.lineTo(d.x2,d.y2);ctx.stroke();}
    else if(d.type==='rect'&&d.x2!==undefined){ctx.strokeRect(Math.min(d.x1,d.x2),Math.min(d.y1,d.y2),Math.abs(d.x2-d.x1),Math.abs(d.y2-d.y1));}
    else if(d.type==='fib'&&d.p2!==undefined){
      const y1=py(d.p1),y2=py(d.p2);
      [0,0.236,0.382,0.5,0.618,0.786,1].forEach(r=>{
        const y=y1+(y2-y1)*r;
        ctx.strokeStyle=`rgba(255,200,50,${r===0||r===1?0.9:0.4})`;
        ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cW-CFG.PW,y);ctx.stroke();
        ctx.fillStyle='rgba(255,200,50,.6)';ctx.font='8px monospace';ctx.textAlign='left';
        ctx.fillText((r*100).toFixed(1)+'%',4,y-2);
      });
    }
  });
}

export let CH_animFrame = null;

export function CH_frame(){
  if(CH_dirty){
    CH_layout();
    CH_drawMain();
    CH_drawSub();
    CH_dirty=false;
  }
  CH_animFrame = requestAnimationFrame(CH_frame);
}

export function CH_liveTick(pair, priceInfo){
  if(!ST.candles.length) return;
  const info = priceInfo || {};
  const last = ST.candles[ST.candles.length-1];
  const now = Date.now();
  const tfMs = ST.tf * 60000;
  const move = (last.c * 0.0003) * (Math.random()-0.48);
  const newP = +(last.c + move).toFixed(info.d||5);
  if(now - last.t > tfMs){
    ST.candles.push({t:now,o:last.c,h:newP,l:newP,c:newP,v:Math.round(500+Math.random()*1000)});
    if(ST.candles.length > 500) ST.candles.shift();
    CH_buildHA();
  } else {
    last.c = newP;
    last.h = Math.max(last.h, newP);
    last.l = Math.min(last.l, newP);
    last.v += Math.round(Math.random()*100);
  }
  // Update price display
  const elPrice = document.getElementById('chPrice');
  const elChange = document.getElementById('chChange');
  if(elPrice) elPrice.textContent = newP.toFixed(info.d||5);
  CH_dirty = true;
}

export function CH_bindEvents(){
  const c=document.getElementById('tvCanvas');if(!c)return;
  c.addEventListener('mousemove',e=>{
    const r=c.getBoundingClientRect();
    ST.mx=(e.clientX-r.left);ST.my=(e.clientY-r.top);
    if(ST.drag){ST.rightOffset=ST.dragOff0-(ST.mx-ST.dragX0)/ST.barW;ST.rightOffset=Math.max(0,ST.rightOffset);}
    if(ST.tool!=='cursor'&&ST.drawStart){
      const last=ST.drawings[ST.drawings.length-1];
      if(last){last.x2=ST.mx;last.y2=ST.my;}
    }
    CH_dirty=true;
  });
  c.addEventListener('mouseleave',()=>{ST.mx=-1;ST.my=-1;CH_dirty=true;});
  c.addEventListener('mousedown',e=>{
    const r=c.getBoundingClientRect();
    ST.mx=(e.clientX-r.left);ST.my=(e.clientY-r.top);
    if(ST.tool==='cursor'){ST.drag=true;ST.dragX0=ST.mx;ST.dragOff0=ST.rightOffset||0;}
    else if(ST.tool==='hline'){
      const p=ST.pMin+(ST.pMax-ST.pMin)*(1-(ST.my-20)/(ST.mH-20));
      ST.drawings.push({type:'hline',price:p});CH_dirty=true;
    }
    else if(ST.tool==='trend'||ST.tool==='rect'){ST.drawStart={x:ST.mx,y:ST.my};ST.drawings.push({type:ST.tool,x1:ST.mx,y1:ST.my});}
    else if(ST.tool==='fib'){
      const p=ST.pMin+(ST.pMax-ST.pMin)*(1-(ST.my-20)/(ST.mH-20));
      ST.drawStart={x:ST.mx,y:ST.my,p};ST.drawings.push({type:'fib',p1:p});
    }
  });
  c.addEventListener('mouseup',e=>{
    ST.drag=false;
    if(ST.drawStart&&ST.tool==='fib'){
      const r=c.getBoundingClientRect();const my=(e.clientY-r.top);
      const p2=ST.pMin+(ST.pMax-ST.pMin)*(1-(my-20)/(ST.mH-20));
      const last=ST.drawings[ST.drawings.length-1];if(last)last.p2=p2;
    }
    ST.drawStart=null;CH_dirty=true;
  });
  c.addEventListener('wheel',e=>{
    e.preventDefault();
    ST.barsVis=Math.max(5,Math.min(300,ST.barsVis+(e.deltaY>0?5:-5)));
    CH_dirty=true;
  },{passive:false});
  // Touch support
  let lastTouchX=null;
  c.addEventListener('touchstart',e=>{lastTouchX=e.touches[0].clientX;},{passive:true});
  c.addEventListener('touchmove',e=>{
    if(lastTouchX!==null){
      const dx=e.touches[0].clientX-lastTouchX;
      ST.rightOffset=Math.max(0,(ST.rightOffset||0)-dx/ST.barW);
      lastTouchX=e.touches[0].clientX;CH_dirty=true;
    }
  },{passive:true});
}

export function CH_setType(t){
  ST.type=t;CH_dirty=true;
}

export function CH_setTF(m){
  ST.tf=m;
  // Regenerate candles for new TF if using simulated data
  CH_dirty=true;
}

export function CH_setSub(type){
  ST.sub=type;CH_dirty=true;
}

export function CH_setTool(t,el){
  ST.tool=t;
  document.querySelectorAll('.iv-draw-btn,.iv-left-btn').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
}

export function CH_clearDrawings(){
  ST.drawings=[];CH_dirty=true;
}

export function CH_zoom(f){
  ST.barsVis=Math.max(5,Math.min(300,Math.round(ST.barsVis*f)));CH_dirty=true;
}

export function CH_resetView(){
  ST.barsVis=80;ST.rightOffset=0;CH_dirty=true;
}

export function CH_screenshot(){
  const c=document.getElementById('tvCanvas');if(!c)return;
  const a=document.createElement('a');a.href=c.toDataURL('image/png');
  a.download=`chart-${Date.now()}.png`;a.click();
}

export const INDS=[
  {k:'ma20',  l:'MA 20',          c:'rgba(251,191,36,.8)'},
  {k:'ma50',  l:'MA 50',          c:'rgba(139,92,246,.8)'},
  {k:'ema12', l:'EMA 12',         c:'rgba(34,211,238,.7)'},
  {k:'ema26', l:'EMA 26',         c:'rgba(249,115,22,.7)'},
  {k:'bb',    l:'Bollinger Bands',c:'rgba(88,166,255,.5)'},
  {k:'vwap',  l:'VWAP',           c:'rgba(255,215,0,.6)'},
];

export function CH_initIndPanel(){
  const el=document.getElementById('indList');if(!el)return;
  el.innerHTML=INDS.map(ind=>`
    <div class="ind-row" onclick="window._CH_toggleInd('${ind.k}',this)" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(88,166,255,.06);cursor:pointer">
      <div id="ib-${ind.k}" style="width:11px;height:11px;border-radius:2px;border:2px solid ${ind.c};background:transparent;flex-shrink:0;transition:.15s"></div>
      <span style="font-size:11px;color:#8b949e;font-family:monospace">${ind.l}</span>
    </div>`).join('');
  window._CH_toggleInd=(k)=>{
    ST.inds[k]=!ST.inds[k];
    const box=document.getElementById('ib-'+k);
    const ind=INDS.find(i=>i.k===k);
    if(box&&ind)box.style.background=ST.inds[k]?ind.c:'transparent';
    CH_dirty=true;
  };
}

export function CH_getCandleTimer(){
  const tf=ST.tf;const now=Date.now();const barMs=tf*60000;
  const remaining=barMs-(now%barMs);const secs=Math.floor(remaining/1000);
  const mins=Math.floor(secs/60);const ss=String(secs%60).padStart(2,'0');
  return mins>0?`${mins}:${ss}`:`0:${ss}`;
}

export function setActiveTF(minutes,btn,label){
  CH_setTF(minutes);
  document.querySelectorAll('.iv-tf-dd-btn').forEach(b=>b.classList.remove('iv-tf-dd-active'));
  if(btn)btn.classList.add('iv-tf-dd-active');
  const lbl=document.getElementById('ivActiveTFLabel');
  if(lbl)lbl.textContent=label||minutes+'m';
  closeAllPanels();
}

export function toggleSubChart(){
  const wrap=document.getElementById('subChartWrap');
  if(!wrap)return;
  const isOpen=wrap.style.height!=='0px'&&wrap.style.height!=='';
  wrap.style.height=isOpen?'0px':'110px';
  CH_dirty=true;
}

export function closeAllPanels(){
  document.querySelectorAll('.iv-dropdown').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.ind-panel').forEach(d=>d.classList.remove('open'));
}

export function togglePanel(id,btn){
  const el=document.getElementById(id);if(!el)return;
  const isOpen=el.classList.contains('open');
  closeAllPanels();
  if(!isOpen){el.classList.add('open');}
  if(btn)btn.classList.toggle('active',!isOpen);
}

export function toggleLiquidityLevels(btn){
  window._showLiquidity=!window._showLiquidity;
  if(btn)btn.classList.toggle('active',window._showLiquidity);
  CH_dirty=true;
}

export function CH_parabolicSAR(bars){
  if(!bars||bars.length<2)return[];
  var af0=0.02,afMax=0.2,afStep=0.02,rising=true,sar=bars[0].l,ep=bars[0].h,af=af0;
  var result=[null];
  for(var i=1;i<bars.length;i++){
    var b=bars[i],prev=bars[i-1];
    var newSar=sar+af*(ep-sar);
    if(rising){newSar=Math.min(newSar,prev.l,i>=2?bars[i-2].l:prev.l);if(b.l<newSar){rising=false;newSar=ep;ep=b.l;af=af0;}else{if(b.h>ep){ep=b.h;af=Math.min(af+afStep,afMax);}}}
    else{newSar=Math.max(newSar,prev.h,i>=2?bars[i-2].h:prev.h);if(b.h>newSar){rising=true;newSar=ep;ep=b.h;af=af0;}else{if(b.l<ep){ep=b.l;af=Math.min(af+afStep,afMax);}}}
    sar=newSar;result.push(sar);
  }
  return result;
}

export function resetChartSettings(){
  Object.assign(ST,{upCol:'#3fb950',dnCol:'#f85149',upBorder:'#3fb950',dnBorder:'#f85149',showGrid:true,gridColor:'rgba(48,54,61,.5)',showSessions:true,showPriceLine:true,showCandleTimer:true,showTrades:true,showVol:true,volAlpha:0.35,bgColor:'#0d1117',crosshairType:'cross'});
  CH_dirty=true;
}

export function drawTVChart(){ CH_dirty=true; }
