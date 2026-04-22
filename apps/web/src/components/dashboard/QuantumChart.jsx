'use client';

import { useEffect, useRef } from 'react';
import {
  ST,
  CH_setContexts, CH_gen, CH_loadCandles,
  CH_frame, CH_bindEvents, CH_initIndPanel,
  CH_setType, CH_setTF, CH_setSub, CH_setTool,
  CH_clearDrawings, CH_zoom, CH_resetView, CH_screenshot,
  CH_setDirty, CH_liveTick,
  setActiveTF, toggleSubChart, togglePanel, closeAllPanels,
} from '../../lib/chartEngine';
import { useSymbolStore } from '../../hooks/useSymbolStore';

// ── CSS injected once globally ────────────────────────────
const CHART_CSS = `
  :root {
    --bg2: #1a1f2e; --bg4: #232c3e;
    --cyan: #58a6ff; --border: rgba(48,54,61,.9);
    --border2: rgba(88,166,255,.22);
    --text: #e6edf3; --text2: #8b949e; --text3: #6e7681; --text4: #484f58;
    --font-mono: 'JetBrains Mono', monospace;
    --font-hud: 'Orbitron', sans-serif;
  }
  .iv-draw-btn {
    height:28px;min-width:28px;background:none;border:none;border-radius:4px;
    color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;
    transition:background .12s,color .12s;flex-shrink:0;gap:3px;padding:0 2px;
  }
  .iv-draw-btn:hover { background:rgba(88,166,255,.08);color:var(--text2); }
  .iv-draw-btn.active { background:rgba(88,166,255,.15);color:var(--cyan); }
  .iv-tf-trigger {
    background:rgba(88,166,255,.1)!important;border:1px solid rgba(88,166,255,.25)!important;
    border-radius:5px!important;color:var(--cyan)!important;font-weight:700!important;
    padding:0 8px!important;height:26px!important;
  }
  .iv-dropdown {
    display:none;position:absolute;top:calc(100% + 4px);left:0;
    background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
    padding:8px;z-index:500;box-shadow:0 8px 32px rgba(0,0,0,.65);
  }
  .iv-dropdown.open { display:block; }
  .iv-dd-item {
    display:block;width:100%;text-align:right;padding:5px 8px;
    font-size:11px;font-family:var(--font-mono);background:none;border:none;
    color:var(--text2);cursor:pointer;border-radius:4px;transition:background .1s;
  }
  .iv-dd-item:hover { background:rgba(88,166,255,.08);color:var(--text); }
  .iv-tf-dd-btn {
    background:var(--bg4);border:1px solid var(--border);color:var(--text3);
    border-radius:4px;padding:5px 0;font-size:10px;font-family:var(--font-mono);
    font-weight:600;cursor:pointer;transition:all .1s;text-align:center;
  }
  .iv-tf-dd-btn:hover { background:rgba(88,166,255,.1);color:var(--text2); }
  .iv-tf-dd-active { background:rgba(88,166,255,.18)!important;color:var(--cyan)!important;border-color:rgba(88,166,255,.35)!important;font-weight:700!important; }
  .iv-left-btn { width:26px;height:26px;background:none;border:none;border-radius:4px;color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s; }
  .iv-left-btn:hover { background:rgba(88,166,255,.09);color:var(--text2); }
  .iv-left-btn.active { background:rgba(88,166,255,.18);color:var(--cyan); }
  .iv-left-sep { width:18px;height:1px;background:var(--border);margin:2px 0; }
  .iv-sep { width:1px;height:18px;background:var(--border);margin:0 2px;flex-shrink:0; }
  .ind-panel { display:none;position:absolute;top:30px;right:0;background:rgba(5,10,20,.98);border:1px solid rgba(88,166,255,.25);border-radius:8px;padding:10px;width:180px;z-index:200;box-shadow:0 8px 32px rgba(0,0,0,.8); }
  .ind-panel.open { display:block; }
  #mainChartArea { background:#0d1117; }
  #tvCanvas { position:absolute;top:0;left:0; }
  #subCanvas { position:absolute;top:0;left:0; }
  .sub-chart-panel { height:90px;position:relative;overflow:hidden; }
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'quantum-chart-css';
  style.textContent = CHART_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}

export default function QuantumChart({ currentPrice = null, candles = null }) {
  const selectedSymbol = useSymbolStore(s => s.selectedSymbol);
  
  const mainCanvasRef = useRef(null);
  const subCanvasRef  = useRef(null);
  const animFrameRef  = useRef(null);
  const tickRef       = useRef(null);
  const engineInitRef = useRef(false);

  // CSS
  useEffect(() => { injectCSS(); }, []);

  // Init engine and handle symbol changes
  useEffect(() => {
    const mainCanvas = document.getElementById('tvCanvas');
    const subCanvas  = document.getElementById('subCanvas');
    if (!mainCanvas || !subCanvas) return;

    if (!engineInitRef.current) {
      CH_setContexts(mainCanvas.getContext('2d'), subCanvas.getContext('2d'));
      engineInitRef.current = true;
    }

    if (candles && candles.length > 0) {
      CH_loadCandles(candles);
    } else {
      CH_gen(selectedSymbol, currentPrice
        ? { p: currentPrice, d: selectedSymbol.includes('JPY') ? 3 : selectedSymbol.includes('BTC') ? 1 : 5 }
        : null);
    }

    CH_bindEvents();
    CH_initIndPanel();

    // Start render loop using the engine's own CH_frame
    animFrameRef.current = requestAnimationFrame(CH_frame);

    // Live tick (replace with real WebSocket)
    tickRef.current = setInterval(() => {
      CH_liveTick(selectedSymbol, null);
    }, 1500);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  // Sync live price prop
  useEffect(() => {
    if (currentPrice && ST.candles.length) {
      const last = ST.candles[ST.candles.length - 1];
      last.c = currentPrice;
      last.h = Math.max(last.h, currentPrice);
      last.l = Math.min(last.l, currentPrice);
      CH_setDirty(true);
    }
  }, [currentPrice]);

  /* ─── JSX ─────────────────────────────────────────────── */
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', width:'100%', background:'#0d1117' }}>

      {/* ── TOOLBAR ── */}
      <div id="iv-bar-tf" style={{
        display:'flex', alignItems:'center', padding:'0 6px',
        height:'38px', background:'var(--bg2,#1a1f2e)',
        borderBottom:'1px solid var(--border,rgba(48,54,61,.9))',
        flexShrink:0, gap:'2px',
      }}>
        {/* Chart Type */}
        <div style={{ position:'relative' }}>
          <button className="iv-draw-btn" onClick={() => togglePanel('ivCtypePanel', null)} title="نوع الشارت" style={{ width:'30px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="4" height="16" rx="1"/><rect x="10" y="9" width="4" height="11" rx="1"/><rect x="18" y="2" width="4" height="18" rx="1"/></svg>
          </button>
          <div id="ivCtypePanel" className="iv-dropdown" style={{ minWidth:'150px' }}>
            <div style={{ fontSize:'9px', color:'var(--text4)', fontFamily:'var(--font-hud)', letterSpacing:'1px', marginBottom:'6px' }}>نوع الشارت</div>
            {[['candle','🕯 شموع'],['hollow','⬡ مجوفة'],['bar','▐ OHLC'],['line','∿ خط'],['area','◭ منطقة'],['heikin','HA Heikin-Ashi']].map(([t,l]) => (
              <button key={t} className="iv-dd-item" onClick={() => { CH_setType(t); closeAllPanels(); }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="iv-sep" />

        {/* Timeframe */}
        <div style={{ position:'relative' }}>
          <button className="iv-draw-btn iv-tf-trigger" onClick={() => togglePanel('ivTFPanel', null)} style={{ width:'auto', padding:'0 8px', fontFamily:'var(--font-mono)', fontSize:'11px', fontWeight:700, color:'var(--cyan)' }}>
            <span id="ivActiveTFLabel">15m</span>
            <svg width="9" height="9" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0 L5 6 L10 0Z"/></svg>
          </button>
          <div id="ivTFPanel" className="iv-dropdown" style={{ minWidth:'160px' }}>
            <div style={{ fontSize:'9px', color:'var(--text4)', fontFamily:'var(--font-hud)', marginBottom:'6px' }}>الإطار الزمني</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'3px' }}>
              {[[1,'1m'],[5,'5m'],[15,'15m'],[30,'30m'],[60,'1H'],[240,'4H'],[1440,'1D'],[10080,'1W']].map(([m,l]) => (
                <button key={m} className={`iv-tf-dd-btn${m===15?' iv-tf-dd-active':''}`} onClick={(e) => setActiveTF(m, e.target, l)}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="iv-sep" />

        {/* Drawing Tools */}
        <button className="iv-draw-btn active" id="toolCursor" onClick={() => CH_setTool('cursor', document.getElementById('toolCursor'))} title="مؤشر">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4 0L4 20L8 16L12 24L14 23L10 15L16 15Z"/></svg>
        </button>
        <button className="iv-draw-btn" id="toolTrend" onClick={() => CH_setTool('trend', document.getElementById('toolTrend'))} title="خط اتجاه">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="21" x2="21" y2="3"/></svg>
        </button>
        <button className="iv-draw-btn" id="toolHLine" onClick={() => CH_setTool('hline', document.getElementById('toolHLine'))} title="خط أفقي">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="2" y1="12" x2="22" y2="12"/></svg>
        </button>
        <button className="iv-draw-btn" id="toolFib" onClick={() => CH_setTool('fib', document.getElementById('toolFib'))} title="فيبوناتشي">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="5" x2="22" y2="5"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="5" y1="2" x2="5" y2="22"/></svg>
        </button>
        <button className="iv-draw-btn" onClick={() => CH_clearDrawings()} title="مسح" style={{ color:'var(--text4)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
        </button>

        <div className="iv-sep" />

        {/* Zoom */}
        <button className="iv-draw-btn" onClick={() => CH_zoom(0.75)} title="تكبير">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button className="iv-draw-btn" onClick={() => CH_zoom(1.33)} title="تصغير">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button className="iv-draw-btn" onClick={() => CH_resetView()} title="إعادة ضبط" style={{ fontSize:'11px', fontWeight:700, width:'auto', padding:'0 5px', fontFamily:'var(--font-hud)' }}>⊡</button>

        <div className="iv-sep" />

        {/* Indicators */}
        <div style={{ position:'relative' }}>
          <button className="iv-draw-btn" onClick={() => togglePanel('indPanel', null)} id="indBtn" style={{ width:'auto', padding:'0 7px', fontSize:'10px', fontFamily:'var(--font-hud)', fontWeight:700, gap:'3px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            IND
          </button>
          <div className="ind-panel" id="indPanel">
            <div style={{ fontSize:'10px', color:'var(--text3)', letterSpacing:'1px', marginBottom:'7px', paddingBottom:'5px', borderBottom:'1px solid rgba(88,166,255,.1)', fontFamily:'var(--font-hud)' }}>INDICATORS</div>
            <div id="indList"></div>
          </div>
        </div>

        {/* Oscillator */}
        <div style={{ position:'relative' }}>
          <button className="iv-draw-btn" id="subBtn" onClick={() => togglePanel('ivSubPanel', null)} style={{ width:'auto', padding:'0 7px', fontSize:'10px', fontFamily:'var(--font-hud)', fontWeight:700, gap:'3px' }}>OSC</button>
          <div id="ivSubPanel" className="iv-dropdown" style={{ minWidth:'130px' }}>
            <div style={{ fontSize:'9px', color:'var(--text4)', letterSpacing:'1px', marginBottom:'6px' }}>مؤشر فرعي</div>
            {[['rsi','RSI (14)'],['macd','MACD'],['stoch','Stochastic']].map(([t,l]) => (
              <button key={t} className="iv-dd-item" onClick={() => { CH_setSub(t); closeAllPanels(); if (document.getElementById('subChartWrap')?.style.height === '0px') toggleSubChart(); }}>{l}</button>
            ))}
          </div>
        </div>

        {/* VOL */}
        <button className="iv-draw-btn" onClick={() => { ST.showVol = !ST.showVol; CH_setDirty(true); }} style={{ width:'auto', padding:'0 6px', fontSize:'9px', fontFamily:'var(--font-hud)', fontWeight:700 }}>VOL</button>

        <div style={{ flex:1 }} />

        {/* Screenshot */}
        <button className="iv-draw-btn" onClick={() => CH_screenshot()} title="لقطة شاشة">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </div>

      {/* ── CHART AREA ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'row', overflow:'hidden', minHeight:0, position:'relative' }}>

        {/* Left Toolbar */}
        <div id="chartLeftTools" style={{ width:'32px', flexShrink:0, background:'var(--bg2,#1a1f2e)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', padding:'4px 0', gap:'1px' }}>
          {[['cursor','↖','مؤشر'],['trend','╱','اتجاه'],['hline','━','أفقي']].map(([t,icon,title]) => (
            <button key={t} className="iv-left-btn" onClick={() => CH_setTool(t, null)} title={title} style={{ fontSize:'13px' }}>{icon}</button>
          ))}
          <div className="iv-left-sep" />
          <button className="iv-left-btn" onClick={() => CH_zoom(0.75)} title="تكبير" style={{ fontSize:'16px' }}>+</button>
          <button className="iv-left-btn" onClick={() => CH_zoom(1.33)} title="تصغير" style={{ fontSize:'16px' }}>−</button>
          <div className="iv-left-sep" />
          <button className="iv-left-btn" onClick={() => CH_clearDrawings()} title="مسح" style={{ color:'#f85149' }}>🗑</button>
        </div>

        {/* Canvas Column */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

          {/* Main Chart */}
          <div id="mainChartArea" style={{ flex:1, position:'relative', overflow:'hidden', minHeight:0 }}>
            <canvas id="tvCanvas" ref={mainCanvasRef}></canvas>
            <div id="chartInfoOverlay" style={{ position:'absolute', top:0, right:0, left:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 10px', pointerEvents:'none', zIndex:3, background:'linear-gradient(180deg,rgba(13,17,23,.85) 0%,transparent 100%)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                <span style={{ fontFamily:'var(--font-hud)', fontSize:'11px', fontWeight:700, color:'var(--cyan,#58a6ff)', letterSpacing:'.5px' }} id="chPair">{pair}</span>
                <span style={{ fontFamily:'monospace', fontSize:'16px', fontWeight:700, lineHeight:1 }} id="chPrice">{currentPrice || '—'}</span>
                <span style={{ fontSize:'9px', color:'var(--text4)', fontFamily:'monospace', display:'flex', alignItems:'center', gap:'6px' }}>
                  <span>O <b id="tbChO" style={{ color:'rgba(255,255,255,.5)' }}>—</b></span>
                  <span>H <b id="tbChH" style={{ color:'rgba(63,185,80,.7)' }}>—</b></span>
                  <span>L <b id="tbChL" style={{ color:'rgba(248,81,73,.7)' }}>—</b></span>
                  <span>C <b id="tbChC" style={{ color:'rgba(255,255,255,.5)' }}>—</b></span>
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'8px', fontFamily:'monospace' }}>
                <span style={{ color:'rgba(139,92,246,.7)' }}>■ Tokyo</span>
                <span style={{ color:'rgba(88,166,255,.7)' }}>■ London</span>
                <span style={{ color:'rgba(227,179,65,.7)' }}>■ New York</span>
              </div>
            </div>
          </div>

          {/* Sub Chart */}
          <div id="subChartWrap" style={{ flexShrink:0, background:'#141b27', borderTop:'1px solid rgba(88,166,255,.12)', transition:'height .2s ease', height:'0px', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1px 8px', background:'#0a1018', borderBottom:'1px solid rgba(88,166,255,.06)', cursor:'pointer', height:'20px' }} onClick={toggleSubChart}>
              <span id="subLabel" style={{ fontSize:'10px', fontFamily:'monospace', color:'rgba(88,166,255,.6)' }}>RSI(14)</span>
            </div>
            <div className="sub-chart-panel" id="subChartPanel" style={{ height:'80px', position:'relative', overflow:'hidden' }}>
              <canvas id="subCanvas" ref={subCanvasRef}></canvas>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
