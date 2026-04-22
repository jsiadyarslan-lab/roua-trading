'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSymbolStore } from '@/hooks/useSymbolStore';

// ── دوال المؤشرات ──────────────
function _rsi(cls: number[], p=14){
  const out: (number|null)[]=[];let ag=0,al=0;
  for(let i=1;i<cls.length;i++){
    const d=cls[i]-cls[i-1],g=d>0?d:0,l=d<0?-d:0;
    if(i<=p){ag+=g/p;al+=l/p;out.push(null);continue;}
    ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p;
    out.push(al===0?100:100-100/(1+ag/al));
  }
  return out;
}
function _macd(cls: number[]){
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

// ── الأزواج الافتراضية ───────────────────────────────────
const DEFAULT_PRICES: Record<string, {p: number, d: number}> = {
  'EUR/USD':{p:1.08432,d:5},'GBP/USD':{p:1.27184,d:5},'USD/JPY':{p:149.820,d:3},
  'XAU/USD':{p:2944.20,d:2},'BTC/USD':{p:84120,d:0},'ETH/USD':{p:3280,d:0},
};

// ── Toggle Switch CSS ────────────────────────────────────
const TOGGLE_CSS = `
  .qt-toggle-sw{position:relative;width:40px;height:20px;display:inline-block;flex-shrink:0}
  .qt-toggle-sw input{opacity:0;position:absolute;width:0;height:0}
  .qt-toggle-sl{position:absolute;inset:0;background:#232c3e;border:1px solid rgba(88,166,255,.22);border-radius:10px;cursor:pointer;transition:.25s}
  .qt-toggle-sl::before{content:'';position:absolute;width:14px;height:14px;right:2px;top:2px;background:#6e7681;border-radius:50%;transition:.25s}
  .qt-toggle-sw input:checked+.qt-toggle-sl{background:rgba(63,185,80,.15);border-color:#3fb950}
  .qt-toggle-sw input:checked+.qt-toggle-sl::before{background:#3fb950;right:auto;left:2px;box-shadow:0 0 12px rgba(63,185,80,.4)}
  @keyframes botGlow{0%,100%{box-shadow:0 0 8px rgba(88,166,255,.2)}50%{box-shadow:0 0 20px rgba(88,166,255,.5)}}
  .qt-bot-icon{animation:botGlow 3s ease-in-out infinite}
  .qt-log-entry{padding:2px 0;border-bottom:1px solid rgba(88,166,255,.05);display:flex;gap:8px;align-items:flex-start;font-size:11px}
  .qt-log-time{color:#484f58;flex-shrink:0;font-size:10px}
  .qt-log-info{color:#58a6ff}
  .qt-log-buy{color:#3fb950}
  .qt-log-sell{color:#f85149}
  .qt-log-warn{color:#e3b341}
`;

// ── بطاقة الإحصاء ────────────────────────────────────────
function StatCard({ label, value, color }: any) {
  return (
    <div style={{ background:'#232c3e', borderRadius:5, padding:7 }}>
      <div style={{ fontSize:10, color:'#484f58', fontFamily:'Orbitron,sans-serif', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:15, fontWeight:700, fontFamily:'monospace', color: color||'#e6edf3' }}>{value}</div>
    </div>
  );
}

// ── المكوّن الرئيسي ──────────────────────────────────────
export function BotMini({
  prices         = DEFAULT_PRICES,     // أسعار حية: { 'BTC/USD': {p, d}, ... }
  initialBalance = 25000,              // الرصيد الابتدائي
  onTrade        = null,               // callback عند كل صفقة: (trade) => {}
  compact        = false,              // وضع مضغوط
}: any) {
  const [isOn,       setIsOn]       = useState(false);
  const [logs,       setLogs]       = useState<any[]>([]);
  const [trades,     setTrades]     = useState<any[]>([]);
  const [riskPct,    setRiskPct]    = useState(2);
  const [confLimit,  setConfLimit]  = useState(75);
  const [strategy,   setStrategy]   = useState('Trend Follow');
  const [activeTab,  setActiveTab]  = useState('log'); // 'log' | 'config' | 'stats'

  const intervalRef = useRef<any>(null);
  const logBoxRef   = useRef<any>(null);
  const tradeIdRef  = useRef(100);
  const { setSelectedSymbol } = useSymbolStore();

  // ── إضافة سجل ──────────────────────────────────────────
  const addLog = useCallback((msg: string, type = 'info') => {
    const now = new Date();
    const ts  = now.getHours()+':'+(now.getMinutes()<10?'0':'')+now.getMinutes()+':'+(now.getSeconds()<10?'0':'')+now.getSeconds();
    setLogs(prev => [{ time:ts, msg, type }, ...prev].slice(0, 50));
  }, []);

  // ── محرك البوت الحقيقي ─────────────────────────────────
  const botTick = useCallback(() => {
    const pairList = Object.keys(prices);
    const pair     = pairList[Math.floor(Math.random()*pairList.length)];
    const info     = prices[pair];
    if (!info) return;

    // بناء بيانات سعرية
    let p = info.p * (0.97 + Math.random() * 0.04);
    const closes = [];
    for (let i = 60; i >= 0; i--) {
      p += (Math.random()-0.48) * info.p * 0.0005;
      closes.push(+(p.toFixed(info.d)));
    }
    closes.push(info.p);

    // المؤشرات الحقيقية
    const rsiArr    = _rsi(closes, 14);
    const rsi       = rsiArr.filter(v=>v!==null).pop() || 50;
    const { h }     = _macd(closes);
    const macdH     = h[h.length-1] || 0;
    const macdHP    = h[h.length-2] || 0;
    const ema20     = _ema(closes, 20).at(-1) || info.p;
    const ema50     = _ema(closes, 50).at(-1) || info.p;
    const price     = info.p;
    const dp        = info.d;

    // Score-based decision
    let score = 0;
    if (rsi < 35)                        score += 2;
    else if (rsi > 65)                   score -= 2;
    else if (rsi < 45)                   score += 0.5;
    else if (rsi > 55)                   score -= 0.5;

    if (macdH > 0 && macdHP <= 0)        score += 2.5;
    else if (macdH < 0 && macdHP >= 0)   score -= 2.5;
    else if (macdH > macdHP)             score += 0.8;
    else if (macdH < macdHP)             score -= 0.8;

    if (price > ema20 && ema20 > ema50)  score += 1;
    else if (price < ema20 && ema20 < ema50) score -= 1;

    // فلتر الثقة
    const minScore = (confLimit / 100) * 3;
    if (Math.abs(score) < minScore) return;

    const dir     = score > 0 ? 'buy' : 'sell';
    const pip     = pair.includes('JPY')?0.01:pair.includes('XAU')?0.1:pair.includes('BTC')?1:0.0001;
    const rrRatio = 2;
    const vol     = Math.max(0.01, +((initialBalance*(riskPct/100))/(20*pip*(pair.includes('JPY')?1000:pair.includes('XAU')?100:pair.includes('BTC')?1:10))).toFixed(2));
    const sl      = +(dir==='buy' ? price-20*pip : price+20*pip).toFixed(dp);
    const tp      = +(dir==='buy' ? price+20*rrRatio*pip : price-20*rrRatio*pip).toFixed(dp);
    const conf    = Math.min(95, Math.round(Math.abs(score)/4*100));
    const reason  = `RSI=${rsi.toFixed(0)} | ${macdH>0&&macdHP<=0?'MACD↑':macdH<0&&macdHP>=0?'MACD↓':'MACD='} | EMA${price>ema20?'↑':'↓'}`;

    const trade = {
      id:       tradeIdRef.current++,
      pair, dir, vol: vol.toFixed(2),
      entry:    price, sl, tp, conf,
      reason,
      time:     new Date().toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'}),
      pnl:      0
    };

    setTrades(prev => [trade, ...prev].slice(0, 15));
    addLog(`🤖 ${dir.toUpperCase()} ${pair} @ ${price.toFixed(dp)} | Conf:${conf}% | ${reason}`, dir);

    if (onTrade) onTrade(trade);
  }, [prices, riskPct, confLimit, initialBalance, addLog, onTrade]);

  // ── تشغيل / إيقاف ──────────────────────────────────────
  const toggleBot = useCallback(() => {
    setIsOn(prev => {
      const next = !prev;
      if (next) {
        addLog('Bot started — scanning markets...', 'info');
        intervalRef.current = setInterval(botTick, 7000);
      } else {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        addLog('Bot stopped', 'warn');
      }
      return next;
    });
  }, [botTick, addLog]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handlePairClick = (pair: string) => {
    setSelectedSymbol(pair);
  };

  // ── إحصائيات ────────────────────────────────────────────
  const wins    = trades.filter(t => t.pnl >= 0).length;
  const winRate = trades.length ? Math.round(wins/trades.length*100) : 0;
  const totalPnl = trades.reduce((s,t) => s + (t.pnl||0), 0);

  // ── Tabs ─────────────────────────────────────────────────
  const tabs = [
    { id:'log',    label:'السجل' },
    { id:'config', label:'الإعداد' },
    { id:'stats',  label:'الإحصائيات' },
  ];

  return (
    <>
      <style>{TOGGLE_CSS}</style>
      <div style={{
        display:'flex', flexDirection:'column', height:'100%',
        background:'#1a1f2e', borderRadius: compact?0:10,
        border: compact?'none':'1px solid rgba(88,166,255,.22)',
        overflow:'hidden'
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: compact?'7px 10px':'10px 14px',
          background:'#232c3e',
          borderBottom:`1px solid ${isOn?'rgba(63,185,80,.35)':'rgba(48,54,61,.9)'}`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexShrink:0, transition:'border-color .3s'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="qt-bot-icon" style={{
              width:compact?28:34, height:compact?28:34, borderRadius:'50%',
              background:'linear-gradient(135deg,rgba(139,92,246,.3),rgba(88,166,255,.2))',
              border:'1px solid rgba(88,166,255,.22)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize: compact?14:17
            }}>🤖</div>
            <div>
              <div style={{ fontSize: compact?11:13, fontWeight:700, color:'#e6edf3', fontFamily:'Orbitron,sans-serif' }}>
                بوت التداول الآلي
              </div>
              <div style={{
                fontSize:10, fontFamily:'monospace', marginTop:1,
                color: isOn ? '#3fb950' : '#6e7681'
              }}>
                {isOn ? '● يعمل' : '● متوقف'} · {strategy}
              </div>
            </div>
          </div>
          <label className="qt-toggle-sw">
            <input type="checkbox" checked={isOn} onChange={toggleBot} />
            <div className="qt-toggle-sl" />
          </label>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:'flex', gap:2, padding:'5px 8px', background:'#1a1f2e', borderBottom:'1px solid rgba(48,54,61,.9)', flexShrink:0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding:'3px 10px', fontSize:10, fontWeight:700,
              background: activeTab===t.id ? 'rgba(88,166,255,.12)' : '#232c3e',
              border: `1px solid ${activeTab===t.id?'rgba(88,166,255,.3)':'rgba(48,54,61,.9)'}`,
              color: activeTab===t.id ? '#58a6ff' : '#6e7681',
              borderRadius:4, cursor:'pointer', fontFamily:'Orbitron,sans-serif',
              transition:'.1s'
            }}>{t.label}</button>
          ))}
          <div style={{ flex:1 }} />
          <div style={{ fontSize:11, fontFamily:'monospace', color:'#58a6ff', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:10, color:'#6e7681' }}>صفقات:</span>
            <b>{trades.length}</b>
          </div>
        </div>

        {/* ── Tab: السجل ── */}
        {activeTab==='log' && (
          <div ref={logBoxRef} style={{
            flex:1, overflowY:'auto', padding:'4px 8px',
            fontFamily:'monospace', background:'#1a1f2e'
          }}>
            {!logs.length && (
              <div style={{ color:'#484f58', fontSize:10, textAlign:'center', padding:16 }}>
                شغّل البوت لرؤية السجل الحي
              </div>
            )}
            {logs.map((l, i) => (
              <div key={i} className="qt-log-entry">
                <span className="qt-log-time">{l.time}</span>
                <span className={`qt-log-${l.type}`}>{l.msg}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: الإعداد ── */}
        {activeTab==='config' && (
          <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
            {/* مخاطرة */}
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8b949e', fontFamily:'Orbitron,sans-serif', marginBottom:4 }}>
                <span>مخاطرة / صفقة</span>
                <span style={{ color:'#e3b341', fontWeight:700 }}>{riskPct}%</span>
              </div>
              <input type="range" min="0.5" max="5" step="0.5" value={riskPct}
                onChange={e => setRiskPct(+e.target.value)}
                style={{ width:'100%', accentColor:'#58a6ff' }} />
            </div>
            {/* حد الثقة */}
            <div style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8b949e', fontFamily:'Orbitron,sans-serif', marginBottom:4 }}>
                <span>حد الثقة الأدنى</span>
                <span style={{ color:'#e3b341', fontWeight:700 }}>{confLimit}%</span>
              </div>
              <input type="range" min="60" max="95" step="5" value={confLimit}
                onChange={e => setConfLimit(+e.target.value)}
                style={{ width:'100%', accentColor:'#58a6ff' }} />
            </div>
            {/* الاستراتيجية */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#8b949e', fontFamily:'Orbitron,sans-serif', marginBottom:4 }}>الاستراتيجية</div>
              <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{
                width:'100%', background:'#232c3e', border:'1px solid rgba(48,54,61,.9)',
                color:'#e6edf3', padding:'5px 8px', borderRadius:5,
                fontFamily:'Cairo,sans-serif', fontSize:12
              }}>
                <option>Trend Follow (68%)</option>
                <option>RSI Bands (71%)</option>
                <option>BB Bounce (74%)</option>
                <option>EMA Cross (65%)</option>
                <option>Market Making (81%)</option>
              </select>
            </div>
            {/* رصيد */}
            <div style={{ padding:'8px 10px', background:'rgba(88,166,255,.05)', borderRadius:6, border:'1px solid rgba(88,166,255,.1)', fontSize:11, color:'#8b949e', fontFamily:'monospace' }}>
              الرصيد الابتدائي: <b style={{color:'#58a6ff'}}>${initialBalance.toLocaleString()}</b>
            </div>
          </div>
        )}

        {/* ── Tab: الإحصائيات ── */}
        {activeTab==='stats' && (
          <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:10 }}>
              <StatCard label="الصفقات"  value={trades.length}                color="#58a6ff" />
              <StatCard label="Win%"     value={trades.length?winRate+'%':'—'} color="#e3b341" />
              <StatCard label="P&L"      value={totalPnl>=0?'+$'+totalPnl.toFixed(0):'-$'+Math.abs(totalPnl).toFixed(0)} color={totalPnl>=0?'#3fb950':'#f85149'} />
              <StatCard label="الرصيد"   value={'$'+(initialBalance+totalPnl).toFixed(0)} color="#58a6ff" />
            </div>

            {/* آخر الصفقات */}
            {trades.length > 0 && (
              <div>
                <div style={{ fontSize:10, color:'#484f58', fontFamily:'Orbitron,sans-serif', marginBottom:6, letterSpacing:.5 }}>آخر الصفقات</div>
                {trades.slice(0,5).map(t => (
                  <div key={t.id} onClick={() => handlePairClick(t.pair)}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'4px 8px', marginBottom:3, borderRadius:5,
                      background: t.dir==='buy' ? 'rgba(63,185,80,.05)' : 'rgba(248,81,73,.05)',
                      border: `1px solid ${t.dir==='buy'?'rgba(63,185,80,.2)':'rgba(248,81,73,.2)'}`,
                      cursor: 'pointer', fontSize:10, fontFamily:'monospace'
                    }}>
                    <span style={{ color:t.dir==='buy'?'#3fb950':'#f85149', fontWeight:700 }}>
                      {t.dir==='buy'?'▲':'▼'} {t.pair}
                    </span>
                    <span style={{ color:'#6e7681' }}>{t.time}</span>
                    <span style={{ color:'#58a6ff' }}>{t.conf}%</span>
                  </div>
                ))}
              </div>
            )}

            {!trades.length && (
              <div style={{ color:'#484f58', fontSize:10, textAlign:'center', padding:16 }}>
                شغّل البوت لرؤية الإحصائيات
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
