// ═══════════════════════════════════════════════════════════════════
// ROUA AI Panel — World Class Trading Intelligence
// Features: Council signal + Candle marks on chart + SR levels + Alerts
// ═══════════════════════════════════════════════════════════════════
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AIAnalysisResult, SupportResistanceLevel } from './AIPatternPanel';
import type { AIPattern, CandleData } from '@/lib/charts/types';
import { detectLocalPatterns, detectSupportResistance, detectTrendLines } from './AIPatternPanel';

const C = {
  bg:      '#0a0e17',
  card:    'rgba(255,255,255,0.04)',
  border:  'rgba(255,255,255,0.09)',
  text:    '#e8eaf0',
  dim:     'rgba(255,255,255,0.5)',
  mut:     'rgba(255,255,255,0.25)',
  cyan:    '#22d3ee',
  green:   '#10b981',
  red:     '#ef4444',
  yellow:  '#f59e0b',
  purple:  '#a855f7',
};

const CANDLE_NAMES: Record<string, string> = {
  'Doji':'دوجي','Hammer':'مطرقة','Inverted Hammer':'مطرقة مقلوبة',
  'Engulfing Bullish':'ابتلاع صعودي','Engulfing Bearish':'ابتلاع هبوطي',
  'Morning Star':'نجمة الصباح','Evening Star':'نجمة المساء',
  'Three White Soldiers':'ثلاثة جنود','Three Black Crows':'ثلاثة غربان',
  'Shooting Star':'نجم ساقط','Harami Bullish':'هارامي صعودي',
  'Harami Bearish':'هارامي هبوطي','Piercing Line':'اختراق',
  'Dark Cloud Cover':'غطاء داكن','Double Top':'قمة مزدوجة',
  'Double Bottom':'قاع مزدوج','Head and Shoulders':'رأس وكتفان',
  'Ascending Triangle':'مثلث صاعد','Descending Triangle':'مثلث هابط',
  'Symmetrical Triangle':'مثلث متماثل','Rising Wedge':'إسفين صاعد',
  'Falling Wedge':'إسفين هابط',
  'Gartley':'غارتلي','Bat':'الخفاش','Butterfly':'الفراشة','Crab':'السرطان',
};

type Tab = 'signal'|'patterns'|'levels';

interface Props {
  symbol: string;
  candles: CandleData[];
  currentPrice: number | null;
  onPatternsDetected: (r: AIAnalysisResult) => void;
  onClose: () => void;
  onExecuteTrade?: (side: 'long'|'short', entry: number, sl: number, tp: number) => void;
}

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade }: Props) {
  const [tab, setTab] = useState<Tab>('signal');
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<{dir:'BUY'|'SELL'|'WAIT'; conf:number; entry:number; sl:number; tp:number; reason:string; ts:number}|null>(null);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [levels, setLevels] = useState<SupportResistanceLevel[]>([]);
  const runRef = useRef(false);
  const abortRef = useRef<AbortController|null>(null);

  const analyze = useCallback(async () => {
    if (runRef.current || !candles?.length || candles.length < 20) return;
    runRef.current = true;
    setLoading(true);

    try {
      const price = currentPrice ?? candles[candles.length-1]?.close ?? 0;

      // ── 1. كشف الأنماط المحلي فوراً ──────────────────
      const detected = detectLocalPatterns(candles.slice(-50));
      // dedup
      const seen = new Set<string>();
      const unique = detected.filter(p => {
        if (seen.has(p.type)) return false;
        seen.add(p.type); return true;
      });
      const srLevels = detectSupportResistance(candles);
      const trendLines = detectTrendLines(candles);
      setPatterns(unique);
      setLevels(srLevels);

      // ── 2. أرسل الأنماط للشارت فوراً ─────────────────
      console.log('[AISmartPanel] calling onPatternsDetected with', unique.length, 'patterns');
      onPatternsDetected({
        patterns: unique,
        supportLevels: srLevels.filter(l => l.type === 'support').slice(0,4),
        resistanceLevels: srLevels.filter(l => l.type === 'resistance').slice(0,4),
        trendLines,
        entryExit: null,
      });

      // ── 3. مجلس الذكاء ───────────────────────────────
      try {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const timer = setTimeout(() => abortRef.current?.abort(), 15000);
        const r = await fetch('/api/ai/consensus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
          signal: abortRef.current.signal,
        });
        clearTimeout(timer);
        if (r.ok) {
          const d = await r.json();
          if (d.success && d.data) {
            const rec = d.data.recommendation;
            const dir = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'WAIT';
            const models = d.data.meta?.modelsResponded || d.data.analyses?.length || 0;
            setSignal({ dir: dir as 'BUY'|'SELL'|'WAIT', conf: (d.data.consensusScore||50)/100, entry: price, sl: dir==='BUY'?price*0.992:price*1.008, tp: dir==='BUY'?price*1.016:price*0.984, reason: `مجلس ${models} نماذج • ${(d.data.masterStrategy||'').slice(0,40)}`, ts: Date.now() });
            return;
          }
        }
      } catch { /* fallback to local */ }

      // ── 4. إشارة محلية من الأنماط ────────────────────
      const bull = unique.filter(p => p.direction === 'bullish').length;
      const bear = unique.filter(p => p.direction === 'bearish').length;
      const last20c = candles.slice(-20);
      const ema9  = last20c.slice(-9).reduce((s,c) => s+c.close,0)/9;
      const ema20c = last20c.reduce((s,c) => s+c.close,0)/20;
      const trend = ema9 > ema20c ? 1 : -1;
      const bullScore = bull + (trend > 0 ? 2 : 0);
      const bearScore = bear + (trend < 0 ? 2 : 0);
      const dir = bullScore > bearScore ? 'BUY' : bearScore > bullScore ? 'SELL' : 'WAIT';
      const conf = Math.min(0.85, Math.abs(bullScore-bearScore)/(bullScore+bearScore+1));
      setSignal({ dir: dir as 'BUY'|'SELL'|'WAIT', conf, entry: price, sl: dir==='BUY'?price*0.992:price*1.008, tp: dir==='BUY'?price*1.016:price*0.984, reason: `EMA ${trend>0?'↑':'↓'} • ${bull} صعودي ${bear} هبوطي`, ts: Date.now() });

    } catch { /* silent */ }
    finally { setLoading(false); runRef.current = false; }
  }, [candles, symbol, currentPrice, onPatternsDetected]);

  // تشغيل فور الفتح
  useEffect(() => {
    if (candles && candles.length >= 20) {
      analyze();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length]); // re-run when candles arrive

  const sigColor = signal?.dir === 'BUY' ? C.green : signal?.dir === 'SELL' ? C.red : C.yellow;
  const sigAr    = signal?.dir === 'BUY' ? 'شراء' : signal?.dir === 'SELL' ? 'بيع' : 'انتظار';
  const sigIcon  = signal?.dir === 'BUY' ? '▲' : signal?.dir === 'SELL' ? '▼' : '◆';
  const pct      = Math.round((signal?.conf||0)*100);
  const fp       = (n: number) => n > 999 ? n.toFixed(2) : n.toFixed(5);

  const support    = levels.filter(l => l.type === 'support').slice(0,4);
  const resistance = levels.filter(l => l.type === 'resistance').slice(0,4);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:360, background:C.bg, borderRadius:10, border:`1px solid ${C.border}`, overflow:'hidden', fontFamily:"'Cairo','IBM Plex Sans Arabic',sans-serif", boxShadow:'0 24px 64px rgba(0,0,0,0.7)', direction:'rtl' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div data-drag-handle="true" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', borderBottom:`1px solid ${C.border}`, background:'rgba(255,255,255,0.025)', cursor:'grab', userSelect:'none', flexShrink:0 }}>
        <div data-drag-handle="true" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span data-drag-handle="true" style={{ fontSize:16 }}>🧠</span>
          <div data-drag-handle="true">
            <div style={{ color:C.text, fontSize:11, fontWeight:700 }}>تحليل ذكي</div>
            <div style={{ color:C.mut, fontSize:8.5, fontFamily:'monospace' }}>{symbol}</div>
          </div>
          {loading && <div style={{ width:8, height:8, border:`1.5px solid ${C.cyan}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button data-drag-handle="false" onClick={analyze} disabled={loading} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:4, color:loading?C.mut:C.cyan, width:22, height:22, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', outline:'none' }} title="تحديث">⟳</button>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.mut, fontSize:16, cursor:'pointer', outline:'none', width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────── */}
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {([['signal','الإشارة'], ['patterns', `أنماط ${patterns.length}`], ['levels','المستويات']] as [Tab,string][]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex:1, padding:'5px 3px', background:'none', border:'none', borderBottom:`2px solid ${tab===k?C.cyan:'transparent'}`, color:tab===k?C.cyan:C.dim, fontSize:10, cursor:'pointer', outline:'none', fontFamily:'inherit', transition:'all 0.12s' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>

        {/* SIGNAL */}
        {tab === 'signal' && (
          <div style={{ padding:10 }}>
            {signal ? (
              <>
                {/* Card */}
                <div style={{ background:`${sigColor}12`, border:`1px solid ${sigColor}30`, borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:24, color:sigColor, fontWeight:900 }}>{sigIcon}</span>
                      <div>
                        <div style={{ color:sigColor, fontSize:15, fontWeight:800 }}>{sigAr}</div>
                        <div style={{ color:C.dim, fontSize:8.5, marginTop:1 }}>{signal.reason}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ color:sigColor, fontSize:20, fontWeight:900 }}>{pct}%</div>
                      <div style={{ color:C.mut, fontSize:8 }}>ثقة</div>
                    </div>
                  </div>
                  <div style={{ height:3, background:'rgba(255,255,255,0.07)', borderRadius:2 }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:sigColor, borderRadius:2, transition:'width 0.6s ease' }} />
                  </div>
                </div>

                {/* Levels */}
                {signal.dir !== 'WAIT' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5, marginBottom:8 }}>
                    {([['دخول', signal.entry, C.cyan], ['وقف', signal.sl, C.red], ['هدف', signal.tp, C.green]] as [string, number, string][]).map(([l,v,c]) => (
                      <div key={l} style={{ background:`${c}0a`, border:`1px solid ${c}25`, borderRadius:6, padding:'5px', textAlign:'center' }}>
                        <div style={{ color:C.mut, fontSize:7.5, marginBottom:2 }}>{l}</div>
                        <div style={{ color:c, fontSize:9, fontWeight:700, fontFamily:'monospace' }}>{fp(v)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* R:R */}
                {signal.dir !== 'WAIT' && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 8px', background:C.card, borderRadius:5, marginBottom:8 }}>
                    <span style={{ color:C.dim, fontSize:9 }}>مخاطرة/مكافأة</span>
                    <span style={{ color:C.text, fontSize:9, fontWeight:700, fontFamily:'monospace' }}>
                      1:{Math.abs((signal.tp-signal.entry)/(signal.sl-signal.entry||1)).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Execute */}
                {onExecuteTrade && signal.dir !== 'WAIT' && (
                  <button onClick={() => onExecuteTrade(signal.dir==='BUY'?'long':'short', signal.entry, signal.sl, signal.tp)}
                    style={{ width:'100%', padding:'7px', borderRadius:6, border:'none', background:signal.dir==='BUY'?C.green:C.red, color:'#fff', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3, marginBottom:8 }}>
                    {signal.dir==='BUY'?'▲ تنفيذ شراء':'▼ تنفيذ بيع'}
                  </button>
                )}

                {/* Mini SR */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                  {(['مقاومة', resistance, C.red] as any[]).concat([['دعم', support, C.green]] as any[]).map((_, i) => {
                    const [lbl, arr, col] = i===0 ? ['مقاومة', resistance, C.red] : ['دعم', support, C.green];
                    return arr.length > 0 ? (
                      <div key={lbl} style={{ background:`${col}07`, border:`1px solid ${col}18`, borderRadius:6, padding:'5px 7px' }}>
                        <div style={{ color:col, fontSize:8.5, fontWeight:700, marginBottom:3 }}>{lbl}</div>
                        {arr.slice(0,2).map((l: SupportResistanceLevel, j: number) => (
                          <div key={j} style={{ color:C.dim, fontSize:8.5, fontFamily:'monospace' }}>{fp(l.price)}</div>
                        ))}
                      </div>
                    ) : null;
                  })}
                </div>
                <div style={{ textAlign:'center', marginTop:6, color:C.mut, fontSize:8 }}>{new Date(signal.ts).toLocaleTimeString('ar')}</div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:24, color:C.dim }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🧠</div>
                <div style={{ fontSize:10 }}>اضغط ⟳ لبدء التحليل</div>
              </div>
            )}
          </div>
        )}

        {/* PATTERNS */}
        {tab === 'patterns' && (
          <div style={{ padding:8 }}>
            {patterns.length === 0 ? (
              <div style={{ textAlign:'center', padding:20, color:C.dim, fontSize:10 }}>لا أنماط — اضغط ⟳</div>
            ) : patterns.map((p, i) => {
              const col = p.direction==='bullish'?C.green:p.direction==='bearish'?C.red:C.yellow;
              return (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', borderRadius:6, marginBottom:4, background:C.card, border:`1px solid ${col}18` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ color:col, fontSize:11 }}>{p.direction==='bullish'?'▲':p.direction==='bearish'?'▼':'◆'}</span>
                    <span style={{ color:C.text, fontSize:9.5, fontWeight:600 }}>{CANDLE_NAMES[p.type]||p.type}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ height:3, width:36, background:'rgba(255,255,255,0.08)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${Math.round(p.confidence*100)}%`, background:col, borderRadius:2 }} />
                    </div>
                    <span style={{ color:C.mut, fontSize:8 }}>{Math.round(p.confidence*100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LEVELS */}
        {tab === 'levels' && (
          <div style={{ padding:8 }}>
            {([['مقاومة', resistance, C.red], ['دعم', support, C.green]] as Array<[string, SupportResistanceLevel[], string]>).map(([lbl, arr, col]) => (
              arr.length > 0 && (
                <div key={lbl} style={{ marginBottom:10 }}>
                  <div style={{ color:col, fontSize:9, fontWeight:700, marginBottom:4, letterSpacing:0.5 }}>{lbl} ({arr.length})</div>
                  {arr.map((l,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 8px', borderRadius:5, background:C.card, marginBottom:3, border:`1px solid ${col}15` }}>
                      <span style={{ color:col, fontSize:9.5, fontFamily:'monospace', fontWeight:700 }}>{fp(l.price)}</span>
                      <span style={{ color:l.strength==='strong'?col:C.mut, fontSize:8 }}>{l.strength==='strong'?'قوي':l.strength==='medium'?'متوسط':'ضعيف'}</span>
                    </div>
                  ))}
                </div>
              )
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
