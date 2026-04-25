'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import {
  ST,
  CH_setContexts, CH_gen, CH_loadCandles,
  CH_frame, CH_bindEvents, CH_initIndPanel,
  CH_setType, CH_setTF, CH_setSub, CH_setTool,
  CH_clearDrawings, CH_zoom, CH_resetView, CH_screenshot,
  CH_setDirty, CH_liveTick, CH_animFrame,
  setActiveTF, toggleSubChart, togglePanel, closeAllPanels,
} from '../../lib/chartEngine';
import { useSymbolStore } from '../../hooks/useSymbolStore';
import { usePositionsStore } from '../../hooks/usePositionsStore';
import { usePaperTradesStore } from '../../hooks/usePaperTradesStore';
import { formatFreshness } from '../../lib/dashboard-live';

// ── CSS injected once globally ────────────────────────────
const CHART_CSS = `
  :root {
    --bg2: #0d1421; --bg4: #161e2e;
    --cyan: #00f2ff; --border: rgba(255,255,255,0.08);
    --border2: rgba(0,242,255,0.2);
    --text: #ffffff; --text2: #94a3b8; --text3: #64748b; --text4: #475569;
    --font-mono: 'JetBrains Mono', monospace;
    --font-hud: 'Orbitron', sans-serif;
  }
  .iv-draw-btn {
    height:28px;min-width:28px;background:none;border:none;border-radius:4px;
    color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;
    transition:all .12s;flex-shrink:0;gap:3px;padding:0 2px;
  }
  .iv-draw-btn:hover { background:rgba(0,242,255,0.08);color:var(--text2); }
  .iv-draw-btn.active { background:var(--cyan);color:#000;box-shadow: 0 0 10px rgba(0,242,255,0.35);font-weight:700; }
  .iv-tf-trigger {
    background:rgba(0,242,255,0.1)!important;border:1px solid rgba(0,242,255,0.3)!important;
    border-radius:5px!important;color:var(--cyan)!important;font-weight:700!important;
    padding:0 8px!important;height:26px!important;
  }
  .iv-dropdown {
    display:none;position:absolute;top:calc(100% + 4px);
    background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
    padding:10px;z-index:500;box-shadow:0 15px 45px rgba(0,0,0,.85);
    min-width:180px;backdrop-filter:blur(10px);
  }
  .iv-dropdown.open { display:block; }
  .iv-dropdown.tf-panel { right:0; left:auto; }
  .iv-dropdown.ctype-panel { left:0; right:auto; }
  .iv-dd-item {
    display:block;width:100%;text-align:right;padding:8px 10px;
    font-size:11px;font-family:var(--font-mono);background:none;border:none;
    color:var(--text2);cursor:pointer;border-radius:6px;transition:all .15s;
    margin-bottom:2px;
  }
  .iv-dd-item:hover { background:rgba(0,242,255,0.12);color:var(--cyan); }
  .iv-tf-dd-btn {
    background:var(--bg4);border:1px solid var(--border);color:var(--text3);
    border-radius:6px;padding:6px 0;font-size:10px;font-family:var(--font-mono);
    font-weight:600;cursor:pointer;transition:all .1s;text-align:center;
  }
  .iv-tf-dd-btn:hover { background:rgba(0,242,255,0.1);color:var(--text2); }
  .iv-tf-dd-active { background:var(--cyan)!important;color:#000!important;border-color:var(--cyan)!important;font-weight:700!important; }
  .iv-left-btn { width:26px;height:26px;background:none;border:none;border-radius:4px;color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s; }
  .iv-left-btn:hover { background:rgba(0,242,255,0.09);color:var(--text2); }
  .iv-left-btn.active { background:var(--cyan);color:#000;box-shadow: 0 0 8px rgba(0,242,255,0.3); }
  .iv-left-sep { width:18px;height:1px;background:var(--border);margin:2px 0; }
  .iv-sep { width:1px;height:18px;background:var(--border);margin:0 2px;flex-shrink:0; }
  .ind-panel { display:none;position:absolute;top:30px;right:0;background:rgba(13,20,33,.98);border:1px solid var(--border2);border-radius:8px;padding:10px;width:180px;z-index:200;box-shadow:0 8px 32px rgba(0,0,0,.8); }
  .ind-panel.open { display:block; }
  #mainChartArea { background:#060b13; }
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

/**
 * @param {{ currentPrice?: number | null, mobile?: boolean, compact?: boolean, onExpand?: (() => void) | null, dataStatus?: import('../../lib/dashboard-live').DataStatus, lastUpdatedAt?: string | number | null, sourceLabel?: string }} props
 */
export default function QuantumChart({
  currentPrice = null,
  mobile = false,
  compact = false,
  onExpand = null,
  dataStatus = 'disconnected',
  lastUpdatedAt = null,
  sourceLabel = 'Unknown source',
} = {}) {
  const { selectedSymbol, timeframe, setTimeframe } = useSymbolStore();
  
  const mainCanvasRef = useRef(null);
  const subCanvasRef  = useRef(null);
  const animFrameRef  = useRef(null);
  const tickRef       = useRef(null);
  const engineInitRef = useRef(false);
  const openTradesSignatureRef = useRef('');
  const previousPriceRef = useRef(currentPrice);
  const [pricePulse, setPricePulse] = useState(false);
  const [feedState, setFeedState] = useState('waiting');
  const [currentCandleCountdown, setCurrentCandleCountdown] = useState('—');

  // CSS
  useEffect(() => { injectCSS(); }, []);

  // Init engine and handle symbol/timeframe changes
  useEffect(() => {
    const mainCanvas = document.getElementById('tvCanvas');
    const subCanvas  = document.getElementById('subCanvas');
    if (!mainCanvas || !subCanvas) return;

    if (!engineInitRef.current) {
      CH_setContexts(mainCanvas.getContext('2d'), subCanvas.getContext('2d'));
      engineInitRef.current = true;
    }

    // Fetch REAL candles
    const fetchCandles = async () => {
      try {
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol)}?interval=${timeframe}`);
        const j = await res.json();
        if (j.success && j.data && j.data.length > 0) {
          setFeedState('live');
          const formatted = j.data.map(c => ({
            t: new Date(c.timestamp).getTime(),
            o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume
          }));
          CH_loadCandles(formatted);
          const last = formatted[formatted.length - 1];
          const elPrice = document.getElementById('chPrice');
          if (elPrice) elPrice.textContent = last.c.toFixed(selectedSymbol.includes('JPY') ? 3 : selectedSymbol.includes('BTC') ? 1 : 5);
        } else {
          // Fallback to simulation if API fails or no data
          setFeedState('fallback');
          CH_gen(selectedSymbol, { p: currentPrice || 65000, d: selectedSymbol.includes('JPY') ? 3 : selectedSymbol.includes('BTC') ? 1 : 5 });
        }
      } catch (e) {
        console.error('Failed to fetch candles', e);
        setFeedState('fallback');
        CH_gen(selectedSymbol, { p: currentPrice || 65000, d: selectedSymbol.includes('JPY') ? 3 : selectedSymbol.includes('BTC') ? 1 : 5 });
      }
    };

    fetchCandles();
    CH_bindEvents();
    CH_initIndPanel();

    if (CH_animFrame) cancelAnimationFrame(CH_animFrame);
    CH_frame();

    tickRef.current = setInterval(() => {
      CH_liveTick(selectedSymbol, null);
    }, 1500);

    return () => {
      if (CH_animFrame) cancelAnimationFrame(CH_animFrame);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [selectedSymbol, timeframe]);

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

  useEffect(() => {
    if (currentPrice && previousPriceRef.current && currentPrice !== previousPriceRef.current) {
      setPricePulse(true);
      const timer = setTimeout(() => setPricePulse(false), 420);
      previousPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    previousPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    const tick = () => {
      const minutes = Number.parseInt(timeframe, 10);
      const intervalMinutes = Number.isFinite(minutes) ? minutes : timeframe === '1h' ? 60 : timeframe === '4h' ? 240 : timeframe === '1day' ? 1440 : 15;
      const now = Date.now();
      const intervalMs = intervalMinutes * 60 * 1000;
      const remaining = intervalMs - (now % intervalMs);
      const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      setCurrentCandleCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  // Sync Positions to Chart Engine
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);

  useEffect(() => {
    // 1. Merge Alpaca and Paper trades robustly
    const merged = [
      ...positions.map(p => {
        const manualPt = paperTrades.find(pt => pt.symbol.replace('/', '') === p.symbol.replace('/', '') && pt.source === 'manual')
        return {
          entry: p.avgEntryPrice,
          qty: p.qty,
          side: p.side.toLowerCase(),
          pnl: p.unrealizedPnl,
          sl: manualPt?.sl || null,
          tp: manualPt?.tp || null,
          symbol: p.symbol,
          rawSymbol: p.rawSymbol
        }
      }),
      ...paperTrades
        .filter(pt => pt.source === 'bot' || !positions.some(p => p.rawSymbol.replace('/', '') === pt.symbol.replace('/', '')))
        .map(p => ({
          entry: p.entryPrice,
          qty: p.qty,
          side: p.side.toLowerCase(),
          pnl: p.unrealizedPnl,
          sl: p.sl || null,
          tp: p.tp || null,
          symbol: p.symbol,
          rawSymbol: p.symbol
        }))
    ];

    // 2. Filter for selected symbol
    const active = merged.filter(p => {
      const pSym = (p.symbol || p.rawSymbol || '').toUpperCase().replace('/', '');
      const sSym = selectedSymbol.toUpperCase().replace('/', '');
      return pSym === sSym;
    });

    const signature = active
      .map(p => [
        p.symbol,
        p.rawSymbol,
        p.entry,
        p.qty,
        p.side,
        p.pnl,
        p.sl ?? '',
        p.tp ?? ''
      ].join('|'))
      .join(';;');

    if (signature === openTradesSignatureRef.current) return;

    openTradesSignatureRef.current = signature;
    console.log(`[Chart] Syncing ${active.length} positions for ${selectedSymbol}`, active);

    ST.openTrades = active;
    CH_setDirty(true);
  }, [positions, paperTrades, selectedSymbol]);

  const toolbarHeight = mobile ? 32 : 38
  const overlayPriceSize = mobile ? 13 : 16
  const overlayPairSize = mobile ? 9 : 11
  const showDesktopTools = !mobile
  const showSessions = !compact
  const feedLabel = feedState === 'fallback' ? 'Using fallback series' : feedState === 'waiting' ? 'Waiting for feed' : 'Chart live'

  /* ─── JSX ─────────────────────────────────────────────── */
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', width:'100%', background:'#0d1117' }}>

      {/* ── TOOLBAR ── */}
      <div id="iv-bar-tf" style={{
        display:'flex', alignItems:'center', padding:'0 6px',
        height: `${toolbarHeight}px`, background:'var(--bg2,#1a1f2e)',
        borderBottom:'1px solid var(--border,rgba(48,54,61,.9))',
        flexShrink:0, gap:'2px',
        overflowX: mobile ? 'auto' : 'visible',
        scrollbarWidth: 'none',
      }}>
        {/* Chart Type */}
        <div style={{ position:'relative' }}>
          <button className="iv-draw-btn" onClick={() => togglePanel('ivCtypePanel', null)} title="نوع الشارت" style={{ width:'30px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="4" height="16" rx="1"/><rect x="10" y="9" width="4" height="11" rx="1"/><rect x="18" y="2" width="4" height="18" rx="1"/></svg>
          </button>
          <div id="ivCtypePanel" className="iv-dropdown ctype-panel" style={{ minWidth:'150px' }}>
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
          <div id="ivTFPanel" className="iv-dropdown tf-panel" style={{ minWidth:'180px' }}>
            <div style={{ fontSize:'9px', color:'var(--text4)', fontFamily:'var(--font-hud)', marginBottom:'6px' }}>الإطار الزمني</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'3px' }}>
              {[
                [1,'1min','1m'], [5,'5min','5m'], [15,'15min','15m'], [30,'30min','30m'],
                [60,'1h','1H'], [240,'4h','4H'], [1440,'1day','1D'], [10080,'1week','1W']
              ].map(([m,tf,l]) => (
                <button 
                  key={m} 
                  className={`iv-tf-dd-btn${timeframe===tf?' iv-tf-dd-active':''}`} 
                  onClick={() => {
                    setTimeframe(tf);
                    setActiveTF(m, null, l);
                  }}
                >{l}</button>
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
        {!mobile && <button className="iv-draw-btn" id="toolFib" onClick={() => CH_setTool('fib', document.getElementById('toolFib'))} title="فيبوناتشي">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="5" x2="22" y2="5"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="5" y1="2" x2="5" y2="22"/></svg>
        </button>}
        {!mobile && <button className="iv-draw-btn" id="toolRect" onClick={() => CH_setTool('rect', document.getElementById('toolRect'))} title="مستطيل">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        </button>}
        <div className="iv-sep" style={{ margin:'0 4px' }} />
        {!mobile && <button className="iv-draw-btn" id="toolMagnet" onClick={(e) => { ST.magnet = !ST.magnet; e.currentTarget.classList.toggle('active'); }} title="المغناطيس (Snapping)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h4v8a4 4 0 0 0 8 0V4h4v8a8 8 0 0 1-16 0V4z"/></svg>
        </button>}
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
        {mobile && onExpand && (
          <button className="iv-draw-btn" onClick={onExpand} title="تكبير الرسم" style={{ color:'var(--cyan)', width:'auto', padding:'0 8px', fontWeight:700 }}>
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      {/* ── CHART AREA ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'row', overflow:'hidden', minHeight:0, position:'relative' }}>

        {/* Left Toolbar */}
        {showDesktopTools && <div id="chartLeftTools" style={{ width:'32px', flexShrink:0, background:'var(--bg2,#1a1f2e)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', padding:'4px 0', gap:'1px' }}>
          {[['cursor','↖','مؤشر'],['trend','╱','اتجاه'],['hline','━','أفقي']].map(([t,icon,title]) => (
            <button key={t} className="iv-left-btn" onClick={() => CH_setTool(t, null)} title={title} style={{ fontSize:'13px' }}>{icon}</button>
          ))}
          <div className="iv-left-sep" />
          <button className="iv-left-btn" onClick={() => CH_zoom(0.75)} title="تكبير" style={{ fontSize:'16px' }}>+</button>
          <button className="iv-left-btn" onClick={() => CH_zoom(1.33)} title="تصغير" style={{ fontSize:'16px' }}>−</button>
          <div className="iv-left-sep" />
          <button className="iv-left-btn" onClick={() => CH_clearDrawings()} title="مسح" style={{ color:'#f85149' }}>🗑</button>
        </div>}

        {/* Canvas Column */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

          {/* Main Chart */}
          <div id="mainChartArea" style={{ flex:1, position:'relative', overflow:'hidden', minHeight:0 }}>
            <canvas id="tvCanvas" ref={mainCanvasRef}></canvas>
            <div id="chartInfoOverlay" style={{ position:'absolute', top:0, right:0, left:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding: mobile ? '5px 8px' : '4px 10px', pointerEvents:'none', zIndex:3, background:'linear-gradient(180deg,rgba(13,17,23,.82) 0%,transparent 100%)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                <span style={{ fontFamily:'var(--font-hud)', fontSize:`${overlayPairSize}px`, fontWeight:700, color:'var(--cyan,#58a6ff)', letterSpacing:'.5px' }} id="chPair">{selectedSymbol}</span>
                <span
                  style={{
                    fontFamily:'monospace',
                    fontSize:`${overlayPriceSize}px`,
                    fontWeight:700,
                    lineHeight:1,
                    color: pricePulse ? statusTone : '#ffffff',
                    transition: 'color 0.22s ease, text-shadow 0.22s ease',
                    textShadow: pricePulse ? `0 0 12px ${statusTone}` : 'none',
                  }}
                  id="chPrice"
                >
                  {currentPrice || '—'}
                </span>
                <span
                  style={{
                    display:'inline-flex',
                    alignItems:'center',
                    gap:'4px',
                    padding:'2px 6px',
                    borderRadius:'999px',
                    border:'1px solid rgba(255,255,255,0.10)',
                    background:'rgba(7,12,18,0.74)',
                    color:'var(--text2)',
                    fontSize:'8px',
                    fontFamily:'var(--font-mono)',
                    whiteSpace:'nowrap',
                  }}
                >
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--cyan)', boxShadow:'0 0 8px rgba(0,242,255,0.28)' }} />
                  {currentCandleCountdown}
                </span>
                {!compact && <span style={{ fontSize:'9px', color:'var(--text4)', fontFamily:'monospace', display:'flex', alignItems:'center', gap:'6px' }}>
                  <span>O <b id="tbChO" style={{ color:'rgba(255,255,255,.5)' }}>—</b></span>
                  <span>H <b id="tbChH" style={{ color:'rgba(63,185,80,.7)' }}>—</b></span>
                  <span>L <b id="tbChL" style={{ color:'rgba(248,81,73,.7)' }}>—</b></span>
                  <span>C <b id="tbChC" style={{ color:'rgba(255,255,255,.5)' }}>—</b></span>
                </span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'8px', fontFamily:'monospace', color:'var(--text2)' }}>
                <span>{formatFreshness(lastUpdatedAt)}</span>
                {showSessions && !mobile && <>
                  <span style={{ color:'rgba(139,92,246,.7)' }}>■ Tokyo</span>
                  <span style={{ color:'rgba(88,166,255,.7)' }}>■ London</span>
                  <span style={{ color:'rgba(227,179,65,.7)' }}>■ New York</span>
                </>}
              </div>
            </div>
            {feedState !== 'live' && (
              <div style={{
                position:'absolute',
                inset:'42px 12px auto auto',
                zIndex:4,
                padding:'8px 10px',
                borderRadius:10,
                background:'rgba(8,10,14,0.72)',
                border:`1px solid ${statusTone}44`,
                color:'#d8e0ef',
                fontSize:10,
                fontFamily:'var(--font-mono)',
                pointerEvents:'none',
                backdropFilter:'blur(8px)',
              }}>
                {feedLabel}
              </div>
            )}
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
