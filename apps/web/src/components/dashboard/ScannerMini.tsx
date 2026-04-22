'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useSymbolStore } from '@/hooks/useSymbolStore';

// ── مؤشرات فنية ─────────────────────────────────────────
function _rsi(cls: number[], p = 14) {
  const out: (number|null)[] = []; let ag = 0, al = 0;
  for (let i = 1; i < cls.length; i++) {
    const d = cls[i]-cls[i-1], g = d>0?d:0, l = d<0?-d:0;
    if (i <= p) { ag+=g/p; al+=l/p; out.push(null); continue; }
    ag=(ag*(p-1)+g)/p; al=(al*(p-1)+l)/p;
    out.push(al===0?100:100-100/(1+ag/al));
  }
  return out;
}
function _macd(cls: number[]) {
  const k12=2/13,k26=2/27,k9=2/10;
  let e12=cls[0],e26=cls[0],sg=0;
  const m: number[]=[],s: number[]=[],h: number[]=[];
  cls.forEach((v,i)=>{
    e12=i===0?v:v*k12+e12*(1-k12);
    e26=i===0?v:v*k26+e26*(1-k26);
    const mc=e12-e26;sg=i===0?mc:mc*k9+sg*(1-k9);
    m.push(mc);s.push(sg);h.push(mc-sg);
  });
  return{m,s,h};
}
function _ema(arr: number[],p: number){
  const k=2/(p+1);let e=arr[0];
  return arr.map((v,i)=>{e=i===0?v:v*k+e*(1-k);return e;});
}

// ── قائمة الأزواج الافتراضية ─────────────────────────────
const DEFAULT_PRICES: Record<string, {p: number, d: number}> = {
  'EUR/USD':{p:1.08432,d:5},'GBP/USD':{p:1.27184,d:5},'USD/JPY':{p:149.820,d:3},
  'USD/CHF':{p:0.88920,d:5},'AUD/USD':{p:0.65441,d:5},'USD/CAD':{p:1.36280,d:5},
  'NZD/USD':{p:0.60180,d:5},'EUR/GBP':{p:0.85310,d:5},
  'XAU/USD':{p:2944.20,d:2},'XAG/USD':{p:32.44,d:2},
  'BTC/USD':{p:84120,d:0},'ETH/USD':{p:3280,d:0},
  'SOL/USD':{p:142.5,d:2},'XRP/USD':{p:0.5840,d:4},
  'SPX500':{p:5842,d:0},'NAS100':{p:20140,d:0},'GER40':{p:18240,d:0},
  'XPT/USD':{p:985.60,d:2}
};

// ── دالة الفحص الرئيسية ──────────────────────────────────
function scanMarkets(prices: Record<string, {p: number, d: number}>) {
  const pairs = Object.keys(prices);
  const results: any[] = [];

  for (const pair of pairs) {
    const info = prices[pair];
    if (!info) continue;
    const base = info.p;

    // بناء بيانات سعرية تجريبية
    const closes: number[] = [];
    let p = base * (0.985 + Math.random() * 0.03);
    for (let j = 0; j < 70; j++) {
      p = p * (1 + (Math.random() - 0.49) * 0.0012);
      closes.push(+(p.toFixed(info.d)));
    }
    closes.push(base);

    // المؤشرات
    const rsiArr = _rsi(closes, 14);
    let rsi = 50;
    for (let ri = rsiArr.length-1; ri >= 0; ri--) {
      if (rsiArr[ri] !== null) { rsi = rsiArr[ri]; break; }
    }
    const { h } = _macd(closes);
    const macdH  = h[h.length-1] || 0;
    const macdHP = h[h.length-2] || 0;
    const ema20 = _ema(closes, 20).at(-1) || base;
    const ema50 = _ema(closes, 50).at(-1) || base;

    // Score
    let score = 0;
    const reasons: string[] = [];

    if (rsi < 30)      { score += 3;   reasons.push('RSI '+rsi.toFixed(0)+' — تشبع بيع'); }
    else if (rsi < 40) { score += 1.5; reasons.push('RSI '+rsi.toFixed(0)+' — ميل صعودي'); }
    else if (rsi > 70) { score -= 3;   reasons.push('RSI '+rsi.toFixed(0)+' — تشبع شراء'); }
    else if (rsi > 60) { score -= 1.5; reasons.push('RSI '+rsi.toFixed(0)+' — ميل هبوطي'); }

    if (macdH>0 && macdHP<=0)      { score += 3;   reasons.push('MACD تقاطع صاعد'); }
    else if (macdH<0 && macdHP>=0) { score -= 3;   reasons.push('MACD تقاطع هابط'); }
    else if (macdH > macdHP)       { score += 0.8; reasons.push('MACD زخم إيجابي'); }
    else if (macdH < macdHP)       { score -= 0.8; reasons.push('MACD زخم سلبي'); }

    if (base>ema20 && ema20>ema50)      { score += 1.5; reasons.push('فوق EMA20 و EMA50'); }
    else if (base<ema20 && ema20<ema50) { score -= 1.5; reasons.push('تحت EMA20 و EMA50'); }
    else if (base > ema20)              { score += 0.5; reasons.push('فوق EMA20'); }
    else                                { score -= 0.5; reasons.push('تحت EMA20'); }

    if (Math.abs(score) >= 2) {
      results.push({
        pair,
        dir:      score > 0 ? 'buy' : 'sell',
        strength: Math.min(98, Math.round(Math.abs(score)/5*100)),
        rsi:      +rsi.toFixed(1),
        price:    base,
        dp:       info.d,
        reasons
      });
    }
  }

  return results.sort((a, b) => b.strength - a.strength);
}

// ── Tooltip ──────────────────────────────────────────────
function ScanTooltip({ signal, x, y }: any) {
  if (!signal) return null;
  const isBuy = signal.dir === 'buy';
  const col   = isBuy ? '#3fb950' : '#f85149';
  const bdr   = isBuy ? 'rgba(63,185,80,.3)' : 'rgba(248,81,73,.3)';
  const bg    = isBuy ? 'rgba(63,185,80,.08)' : 'rgba(248,81,73,.08)';

  return (
    <div style={{
      position:'fixed', left: x+14, top: y-10, zIndex:9999,
      background:'#1a1f2e', border:`1px solid ${bdr}`,
      borderRadius:10, minWidth:240, maxWidth:280,
      pointerEvents:'none', fontFamily:'monospace', fontSize:11,
      boxShadow:'0 12px 36px rgba(0,0,0,.6)', overflow:'hidden'
    }}>
      <div style={{ background:bg, borderBottom:`1px solid ${bdr}`, padding:'10px 14px' }}>
        <div style={{ fontSize:13, fontWeight:900, color:col, marginBottom:2 }}>
          {isBuy ? '▲ إشارة شراء' : '▼ إشارة بيع'}
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:'#e6edf3' }}>{signal.pair}</div>
      </div>
      <div style={{ padding:'10px 14px' }}>
        <div style={{ fontSize:9, color:'#484f58', letterSpacing:.5, marginBottom:8 }}>أسباب الإشارة</div>
        {signal.reasons.map((r: any, i: number) => (
          <div key={i} style={{ display:'flex', gap:8, marginBottom:6, color:'#8b949e', lineHeight:1.5 }}>
            <span>•</span><span>{r}</span>
          </div>
        ))}
      </div>
      <div style={{ padding:'8px 14px', borderTop:'1px solid rgba(48,54,61,.9)', background:'rgba(0,0,0,.2)', display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:9, color:'#484f58' }}>انقر للتبديل للزوج</span>
        <span style={{ fontSize:9, color:'#58a6ff' }}>RSI: {signal.rsi}</span>
      </div>
    </div>
  );
}

// ── بطاقة الإشارة ────────────────────────────────────────
function SignalCard({ signal, onPairClick }: any) {
  const [tooltip, setTooltip] = useState<any>(null);
  const isBuy  = signal.dir === 'buy';
  const col    = isBuy ? '#3fb950' : '#f85149';
  const bg     = isBuy ? 'rgba(63,185,80,.05)' : 'rgba(248,81,73,.05)';
  const bdr    = isBuy ? 'rgba(63,185,80,.25)' : 'rgba(248,81,73,.25)';
  const filled = Math.round(signal.strength / 100 * 5);

  return (
    <>
      <div
        onClick={() => onPairClick && onPairClick(signal.pair, signal.price)}
        onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY })}
        onMouseMove={(e)  => setTooltip({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
        style={{
          background:bg, border:`1px solid ${bdr}`, borderRadius:8,
          padding:'8px 10px', cursor:'pointer', marginBottom:5,
          position:'relative', overflow:'hidden',
          transition:'transform .15s, box-shadow .15s'
        }}
        onMouseOver={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,.4)'; }}
        onMouseOut={e  => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
      >
        {/* خط علوي ملون */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:col }} />

        {/* الصف الأول */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:900, color:col, fontFamily:'Orbitron,sans-serif' }}>
              {isBuy ? '▲ شراء' : '▼ بيع'}
            </span>
            <span style={{ fontSize:12, fontWeight:700, color:'#e6edf3', fontFamily:'monospace' }}>
              {signal.pair}
            </span>
            <span style={{ fontSize:9, color:'#6e7681' }}>
              {new Date().toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'})}
            </span>
          </div>
          <div style={{ textAlign:'center', minWidth:26 }}>
            <div style={{ fontSize:13, fontWeight:900, color:col, fontFamily:'monospace' }}>{signal.strength}</div>
            <div style={{ fontSize:9, color:'#6e7681' }}>%</div>
          </div>
        </div>

        {/* شريط القوة */}
        <div style={{ display:'flex', width:'100%', height:4, gap:1, borderRadius:2, overflow:'hidden', marginBottom:4 }}>
          {Array.from({length:5}).map((_, i) => (
            <div key={i} style={{ flex:1, background: i < filled ? col : 'rgba(255,255,255,.1)', borderRadius:1 }} />
          ))}
        </div>

        {/* الأسباب */}
        <div style={{ fontSize:10, color:'#6e7681', fontFamily:'monospace' }}>
          {signal.reasons.slice(0,2).join(' · ')}
        </div>
      </div>

      {tooltip && <ScanTooltip signal={signal} x={tooltip.x} y={tooltip.y} />}
    </>
  );
}

// ── المكوّن الرئيسي ──────────────────────────────────────
export function ScannerMini({
  prices      = DEFAULT_PRICES,
  autoScanMs  = 30000,
  maxSignals  = 10,
  compact     = false,
}: any) {
  const [signals,    setSignals]    = useState<any[]>([]);
  const [scanning,   setScanning]   = useState(false);
  const [lastScan,   setLastScan]   = useState<string | null>(null);
  const autoRef = useRef<any>(null);
  const { setSelectedSymbol } = useSymbolStore();

  const doScan = useCallback(() => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => {
      const results = scanMarkets(prices);
      setSignals(results.slice(0, maxSignals));
      setLastScan(new Date().toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'}));
      setScanning(false);
    }, 700);
  }, [scanning, prices, maxSignals]);

  // فحص تلقائي
  React.useEffect(() => {
    if (autoScanMs > 0) {
      autoRef.current = setInterval(doScan, autoScanMs);
      return () => clearInterval(autoRef.current);
    }
  }, [doScan, autoScanMs]);

  const handlePairClick = (pair: string) => {
    setSelectedSymbol(pair);
  };

  return (
    <div style={{
      display:'flex', flexDirection:'column', height:'100%',
      background:'#1a1f2e', borderRadius: compact ? 0 : 10,
      border: compact ? 'none' : '1px solid rgba(48,54,61,.9)',
      overflow:'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: compact ? '7px 10px' : '10px 14px',
        background:'#232c3e',
        borderBottom:'1px solid rgba(88,166,255,.22)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        flexShrink:0
      }}>
        <div>
          <span style={{ fontSize: compact?12:14, fontWeight:700, color:'#58a6ff', fontFamily:'Orbitron,sans-serif', letterSpacing:.5 }}>
            📡 سكانر الأسواق
          </span>
          {lastScan && (
            <span style={{ fontSize:10, color:'#6e7681', marginRight:8, fontFamily:'monospace' }}>
              · آخر فحص: {lastScan}
            </span>
          )}
        </div>
        <button
          onClick={doScan}
          disabled={scanning}
          style={{
            background: scanning ? 'rgba(88,166,255,.05)' : 'rgba(88,166,255,.12)',
            border:'1px solid rgba(88,166,255,.22)',
            color: scanning ? '#6e7681' : '#58a6ff',
            cursor: scanning ? 'not-allowed' : 'pointer',
            fontSize:10, padding:'2px 10px', borderRadius:4,
            fontFamily:'Orbitron,sans-serif', transition:'.15s'
          }}
        >
          {scanning ? '⟳ جارٍ...' : '▶ فحص'}
        </button>
      </div>

      {/* نتائج الفحص */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px' }}>
        {!signals.length && !scanning && (
          <div style={{ color:'#6e7681', fontSize:11, textAlign:'center', padding:'20px 10px', lineHeight:1.8, fontFamily:'monospace' }}>
            📡 اضغط <b style={{color:'#58a6ff'}}>▶ فحص</b><br/>
            لمسح {Object.keys(prices).length} زوجاً بالمؤشرات الحية<br/>
            <span style={{fontSize:10, color:'#484f58'}}>RSI + MACD + EMA</span>
          </div>
        )}

        {scanning && (
          <div style={{ color:'#6e7681', fontSize:11, textAlign:'center', padding:'20px 10px', fontFamily:'monospace' }}>
            <div style={{ marginBottom:8 }}>🔍 جارٍ فحص الأسواق...</div>
            <div style={{ display:'flex', justifyContent:'center', gap:4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width:6, height:6, borderRadius:'50%', background:'#58a6ff',
                  animation:`pulse 1.2s ease ${i*0.2}s infinite`
                }}/>
              ))}
            </div>
          </div>
        )}

        {!scanning && signals.map((sig, i) => (
          <SignalCard key={`${sig.pair}-${i}`} signal={sig} onPairClick={handlePairClick} />
        ))}

        {!scanning && signals.length > 0 && (
          <div style={{ fontSize:10, color:'#484f58', textAlign:'center', padding:'6px 0', fontFamily:'monospace', borderTop:'1px solid rgba(48,54,61,.5)', marginTop:4 }}>
            {signals.length} إشارة · {lastScan}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:.3;transform:scale(.8)}
          50%{opacity:1;transform:scale(1.2)}
        }
      `}</style>
    </div>
  );
}
