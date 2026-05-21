// ═══════════════════════════════════════════════════════════
// ROUA — AI Smart Panel v3
// World-class: Drag handle ✓ | Candlestick + Harmonic patterns ✓
// Auto-detect | GROQ AI | Real-time signal | One-click trade
// ═══════════════════════════════════════════════════════════
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AIAnalysisResult, SupportResistanceLevel, TrendLine } from './AIPatternPanel';
import type { AIPattern, CandleData } from '@/lib/charts/types';
import { detectLocalPatterns, detectSupportResistance, detectTrendLines } from './AIPatternPanel';
import { runPatternEngine, type DetectedPattern } from '@/lib/charts/pattern-engine';

// ── Design tokens ────────────────────────────────────────────
const T = {
  bg:      '#0d1117',
  bgCard:  'rgba(255,255,255,0.04)',
  bgHover: 'rgba(255,255,255,0.07)',
  border:  'rgba(255,255,255,0.08)',
  borderAct: 'rgba(0,212,255,0.3)',
  text:    'rgba(255,255,255,0.92)',
  textDim: 'rgba(255,255,255,0.52)',
  textMut: 'rgba(255,255,255,0.28)',
  cyan:    '#00D4FF',
  green:   '#00C853',
  red:     '#F44336',
  yellow:  '#F59E0B',
  purple:  '#A855F7',
};

// ── Arabic pattern names ──────────────────────────────────────
const PAR: Record<string, string> = {
  'Doji':'دوجي','Hammer':'مطرقة','Inverted Hammer':'مطرقة مقلوبة',
  'Engulfing Bullish':'ابتلاع صعودي','Engulfing Bearish':'ابتلاع هبوطي',
  'Morning Star':'نجمة الصباح','Evening Star':'نجمة المساء',
  'Three White Soldiers':'ثلاثة جنود','Three Black Crows':'ثلاثة غربان',
  'Shooting Star':'نجم ساقط','Harami Bullish':'هارامي صعودي',
  'Harami Bearish':'هارامي هبوطي','Tweezer Bottom':'ملقط سفلي',
  'Tweezer Top':'ملقط علوي','Marubozu':'ماروبوزو',
  'Spinning Top':'قمة دوارة','Dragonfly Doji':'دوجي يعسوب',
  'Gravestone Doji':'دوجي شاهد قبر','Piercing Line':'اختراق',
  'Dark Cloud Cover':'غطاء داكن','Double Top':'قمة مزدوجة',
  'Double Bottom':'قاع مزدوج','Head and Shoulders':'رأس وكتفان',
  'Inv. Head and Shoulders':'رأس وكتفان مقلوب',
  'Ascending Triangle':'مثلث صاعد','Descending Triangle':'مثلث هابط',
  'Symmetrical Triangle':'مثلث متماثل','Rising Wedge':'إسفين صاعد',
  'Falling Wedge':'إسفين هابط','Rising Channel':'قناة صاعدة',
  'Falling Channel':'قناة هابطة','Horizontal Channel':'قناة أفقية',
  'Gartley':'غارتلي','Bat':'الخفاش','Alternate Bat':'الخفاش البديل',
  'Butterfly':'الفراشة','Crab':'السرطان','Deep Crab':'السرطان العميق',
  'Cypher':'السايفر','Shark':'القرش','5-0':'نمط 5-0',
};

// ── Types ─────────────────────────────────────────────────────
type TabKey = 'signal' | 'candles' | 'geometric' | 'harmonic' | 'levels';

interface AISmartPanelProps {
  symbol: string;
  candles: CandleData[];
  currentPrice: number | null;
  onPatternsDetected: (result: AIAnalysisResult) => void;
  onClose: () => void;
  onExecuteTrade?: (side: 'long'|'short', entry: number, sl: number, tp: number) => void;
  chartApiRef?: React.RefObject<any>;
}

// ── Pattern direction color ──────────────────────────────────
const dirColor = (dir: string) =>
  dir === 'bullish' ? T.green : dir === 'bearish' ? T.red : T.yellow;

export function AISmartPanel({
  symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, chartApiRef,
}: AISmartPanelProps) {
  const [tab, setTab] = useState<TabKey>('signal');
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<null|{
    direction: 'BUY'|'SELL'|'WAIT';
    confidence: number;
    entry: number; sl: number; tp: number;
    reason: string;
    timestamp: number;
  }>(null);
  const [candlePatterns, setCandlePatterns] = useState<AIPattern[]>([]);
  const [geoPatterns, setGeoPatterns] = useState<DetectedPattern[]>([]);
  const [harmonicPatterns, setHarmonicPatterns] = useState<DetectedPattern[]>([]);
  const [srLevels, setSrLevels] = useState<SupportResistanceLevel[]>([]);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [engineRan, setEngineRan] = useState(false);
  const isRunningRef = useRef(false);
  const failCountRef = useRef(0);
  const abortRef = useRef<AbortController|null>(null);

  // ── Run full analysis ────────────────────────────────────
  const analyze = useCallback(async () => {
    if (isRunningRef.current || !candles || candles.length < 20) return;
    isRunningRef.current = true;
    setLoading(true);

    try {
      // 1. Local pattern detection (instant, no API)
      const last50 = candles.slice(-50);
      const localPatterns = detectLocalPatterns(last50);
      const levels = detectSupportResistance(candles);
      const lines = detectTrendLines(candles);
      setSrLevels(levels);
      setTrendLines(lines);

      // 2. Geometric + Harmonic patterns from local engine
      if (!engineRan) {
        const engineResult = runPatternEngine(candles, { minQuality: 5 });
        const geo = engineResult.patterns.filter(p =>
          ['Double Top','Double Bottom','Head and Shoulders','Inv. Head and Shoulders',
           'Ascending Triangle','Descending Triangle','Symmetrical Triangle',
           'Rising Wedge','Falling Wedge','Rising Channel','Falling Channel','Horizontal Channel']
          .includes(p.type)
        );
        const har = engineResult.patterns.filter(p =>
          ['Gartley','Bat','Alternate Bat','Butterfly','Crab','Deep Crab','Cypher','Shark','5-0']
          .includes(p.type)
        );
        setGeoPatterns(geo);
        setHarmonicPatterns(har);
        setEngineRan(true);

        // Merge all local patterns for chart markers
        const allLocal = [...localPatterns, ...engineResult.patterns.map(p => ({
          type: p.type,
          labelAr: PAR[p.type] || p.type,
          time: p.timeEnd,
          price: p.points[p.points.length - 1]?.price || 0,
          confidence: p.quality.overall / 10,
          direction: p.direction as 'bullish'|'bearish'|'neutral',
        }))].sort((a, b) => b.time - a.time);
        setCandlePatterns(localPatterns);
        onPatternsDetected({ patterns: allLocal, supportLevels: levels.filter(l=>l.type==='support').slice(0,3), resistanceLevels: levels.filter(l=>l.type==='resistance').slice(0,3), trendLines: lines, entryExit: null });
      } else {
        setCandlePatterns(localPatterns);
        onPatternsDetected({ patterns: localPatterns, supportLevels: levels.filter(l=>l.type==='support').slice(0,3), resistanceLevels: levels.filter(l=>l.type==='resistance').slice(0,3), trendLines: lines, entryExit: null });
      }

      // 3. AI signal via GROQ
      const groqKey = process.env.NEXT_PUBLIC_GROQ_KEY;
      const price = currentPrice ?? candles[candles.length-1]?.close ?? 0;
      if (groqKey && failCountRef.current < 3) {
        try {
          if (abortRef.current) abortRef.current.abort();
          abortRef.current = new AbortController();
          const last20 = candles.slice(-20).map(c => `${c.close.toFixed(2)}`).join(',');
          const r = await fetch('/api/ai/chart-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, candles: last20, instruction: `Analyze ${symbol}. Current: ${price}. Last 20 closes: ${last20}. Return JSON: {"signal":"BUY"|"SELL"|"WAIT","confidence":0-1,"entry":${price},"stopLoss":number,"takeProfit":number,"reason":"short Arabic reason"}` }),
            signal: abortRef.current.signal,
          });
          if (r.ok) {
            const data = await r.json();
            if (data.signal) {
              failCountRef.current = 0;
              setSignal({ direction: data.signal, confidence: data.confidence ?? 0.6, entry: data.entry || price, sl: data.stopLoss || (data.signal==='BUY'?price*0.992:price*1.008), tp: data.takeProfit || (data.signal==='BUY'?price*1.016:price*0.984), reason: data.reason || '', timestamp: Date.now() });
            } else {
              throw new Error('no signal');
            }
          } else { failCountRef.current++; setSignal({ direction: 'WAIT', confidence: 0.5, entry: price, sl: price*0.992, tp: price*1.016, reason: 'تحليل محلي فقط', timestamp: Date.now() }); }
        } catch { failCountRef.current++; setSignal({ direction: 'WAIT', confidence: 0.5, entry: price, sl: price*0.992, tp: price*1.016, reason: 'تحليل محلي', timestamp: Date.now() }); }
      } else {
        // Derive signal from local patterns
        const bullCount = localPatterns.filter(p=>p.direction==='bullish').length;
        const bearCount = localPatterns.filter(p=>p.direction==='bearish').length;
        const dir = bullCount > bearCount ? 'BUY' : bearCount > bullCount ? 'SELL' : 'WAIT';
        setSignal({ direction: dir as 'BUY'|'SELL'|'WAIT', confidence: Math.max(bullCount, bearCount) / Math.max(localPatterns.length, 1), entry: price, sl: dir==='BUY'?price*0.992:price*1.008, tp: dir==='BUY'?price*1.016:price*0.984, reason: `${bullCount} نمط صعودي، ${bearCount} نمط هبوطي`, timestamp: Date.now() });
      }
    } catch (e) { /* silent */ }
    finally { setLoading(false); isRunningRef.current = false; }
  }, [candles, symbol, currentPrice, onPatternsDetected, engineRan]);

  // Run once on open
  useEffect(() => { analyze(); }, []); // eslint-disable-line

  // ── Scroll to pattern on chart ──────────────────────────
  const scrollToTime = useCallback((t: number) => {
    try {
      const api = chartApiRef?.current;
      if (!api || !t) return;
      const range = api.timeScale().getVisibleRange();
      if (range) {
        const w = (range.to as number) - (range.from as number);
        api.timeScale().setVisibleRange({ from: (t - w*0.3) as any, to: (t + w*0.7) as any });
      }
    } catch {}
  }, [chartApiRef]);

  // ── Signal color / icon ──────────────────────────────────
  const sigColor = signal?.direction === 'BUY' ? T.green : signal?.direction === 'SELL' ? T.red : T.yellow;
  const sigIcon  = signal?.direction === 'BUY' ? '▲' : signal?.direction === 'SELL' ? '▼' : '◆';
  const sigLabel = signal?.direction === 'BUY' ? 'شراء' : signal?.direction === 'SELL' ? 'بيع' : 'انتظار';
  const confPct  = Math.round((signal?.confidence ?? 0) * 100);
  const fmtP = (p: number) => p > 999 ? p.toFixed(2) : p.toFixed(5);
  const fmtT = (t: number) => new Date(t).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'});

  // ── Tab data ─────────────────────────────────────────────
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'signal',   label: 'الإشارة',  count: signal ? 1 : 0 },
    { key: 'candles',  label: 'شموع',     count: candlePatterns.length },
    { key: 'geometric',label: 'هندسي',    count: geoPatterns.length },
    { key: 'harmonic', label: 'توافقي',   count: harmonicPatterns.length },
    { key: 'levels',   label: 'مستويات',  count: srLevels.length },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:T.bg, borderRadius:10, border:`1px solid ${T.border}`, overflow:'hidden', fontFamily:"'Cairo',sans-serif", boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>

      {/* ── Header (DRAG HANDLE) ──────────────────────────── */}
      <div
        data-drag-handle="true"
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px 6px', borderBottom:`1px solid ${T.border}`, flexShrink:0, cursor:'grab', background:'rgba(255,255,255,0.02)', userSelect:'none' }}
      >
        <div data-drag-handle="true" style={{ display:'flex', alignItems:'center', gap:7, flex:1 }}>
          <span data-drag-handle="true" style={{ fontSize:15 }}>🧠</span>
          <div data-drag-handle="true">
            <div data-drag-handle="true" style={{ color:T.text, fontSize:11, fontWeight:700, letterSpacing:0.3 }}>تحليل ذكي</div>
            <div data-drag-handle="true" style={{ color:T.textMut, fontSize:8.5, fontFamily:"'JetBrains Mono',monospace" }}>{symbol}</div>
          </div>
          {loading && <div data-drag-handle="true" style={{ width:10, height:10, border:`2px solid ${T.cyan}`, borderTopColor:'transparent', borderRadius:'50%', animation:'aiSpin 0.7s linear infinite', marginLeft:4 }} />}
        </div>
        <div style={{ display:'flex', gap:5 }}>
          <button onClick={analyze} disabled={loading} style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:4, color:loading?T.textMut:T.cyan, width:22, height:22, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', outline:'none' }}>⟳</button>
          <button onClick={onClose} style={{ background:'none', border:'none', color:T.textMut, fontSize:15, cursor:'pointer', lineHeight:1, outline:'none', width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, flexShrink:0, overflowX:'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex:1, padding:'5px 2px', background:'none', border:'none', borderBottom:`2px solid ${tab===t.key ? T.cyan : 'transparent'}`, color: tab===t.key ? T.cyan : T.textDim, fontSize:9.5, cursor:'pointer', outline:'none', whiteSpace:'nowrap', transition:'all 0.15s', fontFamily:"'Cairo',sans-serif" }}>
            {t.label}{t.count>0 && <span style={{ marginRight:2, background:tab===t.key?T.cyan:'rgba(255,255,255,0.1)', color:tab===t.key?'#000':T.textDim, borderRadius:8, padding:'1px 4px', fontSize:8 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>

        {/* SIGNAL tab */}
        {tab === 'signal' && (
          <div style={{ padding:10 }}>
            {signal ? (
              <>
                {/* Main signal card */}
                <div style={{ background:`${sigColor}10`, border:`1px solid ${sigColor}25`, borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:22, color:sigColor, fontWeight:900 }}>{sigIcon}</span>
                      <div>
                        <div style={{ color:sigColor, fontSize:14, fontWeight:800 }}>{sigLabel}</div>
                        {signal.reason && <div style={{ color:T.textDim, fontSize:9, marginTop:1 }}>{signal.reason}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ color:sigColor, fontSize:18, fontWeight:900, lineHeight:1 }}>{confPct}%</div>
                      <div style={{ color:T.textMut, fontSize:8 }}>ثقة</div>
                    </div>
                  </div>
                  {/* Confidence bar */}
                  <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:2 }}>
                    <div style={{ width:`${confPct}%`, height:'100%', background:sigColor, borderRadius:2, transition:'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
                  </div>
                </div>

                {/* Entry / SL / TP */}
                {signal.direction !== 'WAIT' && (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5, marginBottom:8 }}>
                      {[{l:'دخول',p:signal.entry,c:T.cyan},{l:'SL وقف',p:signal.sl,c:T.red},{l:'TP هدف',p:signal.tp,c:T.green}].map(({l,p,c})=>(
                        <div key={l} style={{ background:`${c}08`, border:`1px solid ${c}20`, borderRadius:6, padding:'6px 6px', textAlign:'center' }}>
                          <div style={{ color:T.textMut, fontSize:7.5, marginBottom:2 }}>{l}</div>
                          <div style={{ color:c, fontSize:9.5, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{fmtP(p)}</div>
                        </div>
                      ))}
                    </div>
                    {/* R:R ratio */}
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, padding:'4px 8px', background:T.bgCard, borderRadius:5 }}>
                      <span style={{ color:T.textDim, fontSize:9 }}>نسبة المخاطرة/المكافأة</span>
                      <span style={{ color:T.text, fontSize:9, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>
                        1:{Math.abs((signal.tp - signal.entry)/(signal.sl - signal.entry) || 1).toFixed(2)}
                      </span>
                    </div>
                    {onExecuteTrade && (
                      <button
                        onClick={() => onExecuteTrade(signal.direction==='BUY'?'long':'short', signal.entry, signal.sl, signal.tp)}
                        style={{ width:'100%', padding:'7px', borderRadius:6, border:'none', background:signal.direction==='BUY'?T.green:T.red, color:signal.direction==='BUY'?'#000':'#fff', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:"'Cairo',sans-serif", letterSpacing:0.3 }}
                      >
                        {signal.direction==='BUY'?'▲ تنفيذ شراء':'▼ تنفيذ بيع'}
                      </button>
                    )}
                  </>
                )}

                {/* Support/Resistance mini */}
                {(srLevels.filter(l=>l.type==='support').length > 0 || srLevels.filter(l=>l.type==='resistance').length > 0) && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginTop:8 }}>
                    {[{type:'support',label:'دعم',color:T.green},{type:'resistance',label:'مقاومة',color:T.red}].map(({type,label,color})=>(
                      <div key={type} style={{ background:`${color}06`, border:`1px solid ${color}15`, borderRadius:6, padding:'5px 7px' }}>
                        <div style={{ color, fontSize:8.5, fontWeight:700, marginBottom:3 }}>{label}</div>
                        {srLevels.filter(l=>l.type===type).slice(0,2).map((l,i)=>(
                          <div key={i} style={{ color:T.textDim, fontSize:9, fontFamily:"'JetBrains Mono',monospace" }}>{fmtP(l.price)}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ textAlign:'center', marginTop:8, color:T.textMut, fontSize:8 }}>
                  آخر تحديث: {fmtT(signal.timestamp)}
                </div>
              </>
            ) : (
              <div style={{ padding:24, textAlign:'center', color:T.textDim }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🧠</div>
                <div style={{ fontSize:10 }}>اضغط ⟳ لبدء التحليل</div>
              </div>
            )}
          </div>
        )}

        {/* CANDLES tab */}
        {tab === 'candles' && (
          <div style={{ padding:8 }}>
            {candlePatterns.length === 0 ? (
              <div style={{ padding:20, textAlign:'center', color:T.textDim, fontSize:10 }}>لا أنماط شموع — اضغط ⟳</div>
            ) : candlePatterns.slice(0,20).map((p,i)=>(
              <div key={i} onClick={()=>scrollToTime(p.time)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 8px', borderRadius:6, marginBottom:4, background:T.bgCard, cursor:'pointer', border:`1px solid transparent`, transition:'all 0.1s' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=T.bgHover;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=T.bgCard;}}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:9, color:dirColor(p.direction) }}>{p.direction==='bullish'?'▲':p.direction==='bearish'?'▼':'◆'}</span>
                  <span style={{ color:T.text, fontSize:9.5, fontWeight:600 }}>{PAR[p.type]||p.type}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ height:4, width:40, background:'rgba(255,255,255,0.08)', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${Math.round(p.confidence*100)}%`, background:dirColor(p.direction), borderRadius:2 }} />
                  </div>
                  <span style={{ color:T.textMut, fontSize:8.5 }}>{Math.round(p.confidence*100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GEOMETRIC tab */}
        {tab === 'geometric' && (
          <div style={{ padding:8 }}>
            <div style={{ color:T.textMut, fontSize:8, padding:'0 4px 6px', letterSpacing:1 }}>
              أنماط كلاسيكية — قمم، قيعان، مثلثات، قنوات، أسافين
            </div>
            {geoPatterns.length === 0 ? (
              <div style={{ padding:16, textAlign:'center' }}>
                <div style={{ color:T.textDim, fontSize:10, marginBottom:6 }}>لا أنماط هندسية مكتشفة</div>
                <button onClick={analyze} style={{ background:`${T.cyan}15`, border:`1px solid ${T.borderAct}`, borderRadius:5, color:T.cyan, padding:'5px 12px', fontSize:9.5, cursor:'pointer', outline:'none' }}>🔍 كشف الأنماط</button>
              </div>
            ) : geoPatterns.map((p,i)=>(
              <PatternCard key={i} p={p} onScroll={scrollToTime} />
            ))}
          </div>
        )}

        {/* HARMONIC tab */}
        {tab === 'harmonic' && (
          <div style={{ padding:8 }}>
            <div style={{ color:T.textMut, fontSize:8, padding:'0 4px 6px', letterSpacing:1 }}>
              أنماط XABCD التوافقية — نسب فيبوناتشي الدقيقة
            </div>
            {harmonicPatterns.length === 0 ? (
              <div style={{ padding:16, textAlign:'center' }}>
                <div style={{ color:T.textDim, fontSize:10, marginBottom:6 }}>لا أنماط توافقية — تحتاج تحرك أكبر</div>
                <button onClick={analyze} style={{ background:`${T.purple}15`, border:`1px solid ${T.purple}40`, borderRadius:5, color:T.purple, padding:'5px 12px', fontSize:9.5, cursor:'pointer', outline:'none' }}>🔍 إعادة الكشف</button>
              </div>
            ) : harmonicPatterns.map((p,i)=>(
              <PatternCard key={i} p={p} onScroll={scrollToTime} isHarmonic />
            ))}
          </div>
        )}

        {/* LEVELS tab */}
        {tab === 'levels' && (
          <div style={{ padding:8 }}>
            {[{type:'resistance',label:'مقاومة',color:T.red},{type:'support',label:'دعم',color:T.green}].map(({type,label,color})=>{
              const ls = srLevels.filter(l=>l.type===type);
              return ls.length > 0 ? (
                <div key={type} style={{ marginBottom:10 }}>
                  <div style={{ color, fontSize:9, fontWeight:700, letterSpacing:1, marginBottom:4, padding:'0 4px' }}>{label} ({ls.length})</div>
                  {ls.slice(0,5).map((l,i)=>(
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 8px', borderRadius:5, background:T.bgCard, marginBottom:3, border:`1px solid ${color}12` }}>
                      <span style={{ color, fontSize:9.5, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{fmtP(l.price)}</span>
                      <div style={{ height:3, width:50, background:'rgba(255,255,255,0.06)', borderRadius:2 }}>
                        <div style={{ height:'100%', width:`${l.strength === 'strong' ? 100 : l.strength === 'medium' ? 60 : 30}%`, background:color, borderRadius:2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
            {trendLines.slice(0,4).map((l,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 8px', borderRadius:5, background:T.bgCard, marginBottom:3 }}>
                <span style={{ color:l.type==='ascending'?T.green:T.red, fontSize:9 }}>{l.type==='ascending'?'↗ دعم ديناميكي':'↘ مقاومة ديناميكية'}</span>
                <span style={{ color:T.textMut, fontSize:8 }}>{l.strength}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes aiSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Pattern Card component ───────────────────────────────────
function PatternCard({ p, onScroll, isHarmonic }: { p: DetectedPattern; onScroll: (t:number)=>void; isHarmonic?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color = p.direction === 'bullish' ? T.green : T.red;
  const q = p.quality.overall;

  return (
    <div style={{ background:T.bgCard, border:`1px solid ${color}20`, borderRadius:7, marginBottom:5, overflow:'hidden' }}>
      <div
        style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 9px', cursor:'pointer' }}
        onClick={() => { setExpanded(!expanded); onScroll(p.timeEnd); }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ color, fontSize:10 }}>{p.direction==='bullish'?'▲':'▼'}</span>
          <div>
            <div style={{ color:T.text, fontSize:9.5, fontWeight:700 }}>{PAR[p.type]||p.type}</div>
            {isHarmonic && p.points.length >= 5 && (
              <div style={{ color:T.textMut, fontSize:7.5, fontFamily:"'JetBrains Mono',monospace" }}>
                X→A→B→C→D
              </div>
            )}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {/* Quality dots */}
          <div style={{ display:'flex', gap:2 }}>
            {[1,2,3,4,5].map(n=>(
              <div key={n} style={{ width:4, height:4, borderRadius:'50%', background: n<=Math.round(q/2) ? color : 'rgba(255,255,255,0.1)' }} />
            ))}
          </div>
          <span style={{ color:T.textMut, fontSize:8 }}>{q}/10</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}`, padding:'6px 9px', background:'rgba(0,0,0,0.2)' }}>
          {/* Key levels */}
          {p.breakoutPrice > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ color:T.textDim, fontSize:8.5 }}>خط الكسر</span>
              <span style={{ color:T.text, fontSize:8.5, fontFamily:"'JetBrains Mono',monospace" }}>{p.breakoutPrice.toFixed(2)}</span>
            </div>
          )}
          {p.forecast && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                <span style={{ color:T.textDim, fontSize:8.5 }}>هدف</span>
                <span style={{ color:T.green, fontSize:8.5, fontFamily:"'JetBrains Mono',monospace" }}>{p.forecast.priceMin.toFixed(2)}–{p.forecast.priceMax.toFixed(2)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:T.textDim, fontSize:8.5 }}>احتمالية</span>
                <span style={{ color:T.yellow, fontSize:8.5 }}>{p.forecast.probability}%</span>
              </div>
            </>
          )}
          {isHarmonic && p.points.length >= 5 && (
            <div style={{ display:'flex', gap:4, marginTop:5, flexWrap:'wrap' }}>
              {p.points.map((pt,i)=>(
                <div key={i} style={{ background:`rgba(168,85,247,0.12)`, border:'1px solid rgba(168,85,247,0.25)', borderRadius:4, padding:'2px 6px', fontSize:8 }}>
                  <span style={{ color:'rgba(168,85,247,0.8)', fontWeight:700 }}>{pt.label}</span>
                  <span style={{ color:T.textDim, marginRight:3 }}>{pt.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
