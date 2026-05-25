// ═══════════════════════════════════════════════════════════════
// ROUA AI Panel v4 — Production Ready
// Fixed: candles closure bug, runRef race, onPatternsDetected flow
// ═══════════════════════════════════════════════════════════════
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { AIAnalysisResult, SupportResistanceLevel } from './AIPatternPanel';
import type { AIPattern, CandleData } from '@/lib/charts/types';
import { detectLocalPatterns, detectSupportResistance, detectTrendLines } from './AIPatternPanel';
import { detectSMC } from '@/lib/charts/SMCDetector';
import { detectGeometricPatterns } from '@/lib/charts/GeometricPatterns';
import { detectElliottWaves } from '@/lib/charts/ElliottWave';
import { detectWyckoff } from '@/lib/charts/WyckoffAnalysis';
import { calcVolumeProfile } from '@/lib/charts/VolumeProfile';

const C = {
  bg: '#0a0e17', card: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)',
  text: '#e8eaf0', dim: 'rgba(255,255,255,0.5)', mut: 'rgba(255,255,255,0.25)',
  cyan: '#22d3ee', green: '#10b981', red: '#ef4444', yellow: '#f59e0b',
};

// Pattern name key mapping for i18n
const PATTERN_KEYS: Record<string, string> = {
  'Doji': 'patternDoji',
  'Hammer': 'patternHammer',
  'Inverted Hammer': 'patternInvertedHammer',
  'Engulfing Bullish': 'patternEngulfingBullish',
  'Engulfing Bearish': 'patternEngulfingBearish',
  'Morning Star': 'patternMorningStar',
  'Evening Star': 'patternEveningStar',
  'Three White Soldiers': 'patternThreeWhiteSoldiers',
  'Three Black Crows': 'patternThreeBlackCrows',
  'Shooting Star': 'patternShootingStar',
  'Harami Bullish': 'patternHaramiBullish',
  'Harami Bearish': 'patternHaramiBearish',
  'Piercing Line': 'patternPiercingLine',
  'Dark Cloud Cover': 'patternDarkCloudCover',
  'Double Top': 'patternDoubleTop',
  'Double Bottom': 'patternDoubleBottom',
  'Head and Shoulders': 'patternHeadAndShoulders',
  'Ascending Triangle': 'patternAscendingTriangle',
  'Descending Triangle': 'patternDescendingTriangle',
  'Symmetrical Triangle': 'patternSymmetricalTriangle',
  'Rising Wedge': 'patternRisingWedge',
  'Falling Wedge': 'patternFallingWedge',
};

type Tab = 'signal' | 'patterns' | 'levels' | 'smc' | 'advanced';

interface Props {
  symbol: string;
  candles: CandleData[];
  currentPrice: number | null;
  onPatternsDetected: (r: AIAnalysisResult) => void;
  onClose: () => void;
  onExecuteTrade?: (side: 'long' | 'short', entry: number, sl: number, tp: number) => void;
  onScrollToTime?: (time: number) => void;
}

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, onScrollToTime }: Props) {
  const t = useTranslations('aiSmartPanel');
  const locale = useLocale();
  const timeLocale = locale === 'ar' ? 'ar-EG' : 'en-US';
  const [tab, setTab] = useState<Tab>('signal');
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<{ dir: 'BUY' | 'SELL' | 'WAIT'; conf: number; entry: number; sl: number; tp: number; reason: string; ts: number } | null>(null);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [levels, setLevels] = useState<SupportResistanceLevel[]>([]);
  const [geoList, setGeoList] = useState<any[]>([]);
  const [elliottData, setElliottData] = useState<any>(null);
  const [wyckoffData, setWyckoffData] = useState<any>(null);
  const [volProfile, setVolProfile] = useState<any>(null);
  const [overlays, setOverlays] = useState({ fvg: false, bos: false, sr: true, geo: false, ew: false, wyckoff: false });
  const toggleOverlay = (key: keyof typeof overlays) => setOverlays(prev => ({...prev, [key]: !prev[key]}));

  // ── Refs to avoid stale closure ─────────────────────────────
  const runRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Always fresh references — never stale
  const candlesRef = useRef<CandleData[]>(candles);
  const symbolRef = useRef(symbol);
  const priceRef = useRef(currentPrice);
  const onPatternsRef = useRef(onPatternsDetected);

  // Keep refs in sync
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { priceRef.current = currentPrice; }, [currentPrice]);
  useEffect(() => { onPatternsRef.current = onPatternsDetected; }, [onPatternsDetected]);

  // ── Core analyze — uses refs, never stale ──────────────────
  const analyze = async () => {
    const c = candlesRef.current;
    const sym = symbolRef.current;
    const price = priceRef.current ?? c[c.length - 1]?.close ?? 0;

    if (runRef.current || !c?.length || c.length < 20) return;
    runRef.current = true;
    setLoading(true);

    try {
      // ── 1. كشف تلقائي فوري من البيانات المحلية ────────────
      const raw = detectLocalPatterns(c.slice(-50));
      const seen = new Set<string>();
      const unique = raw.filter(p => { if (seen.has(p.type)) return false; seen.add(p.type); return true; });

      const srLevels = detectSupportResistance(c);
      const trendLines = detectTrendLines(c);

      // ── 2. أرسل الأنماط + SMC + هندسي + إليوت للشارت ──────────
      const smcData = detectSMC(c);
      const geoPatterns = detectGeometricPatterns(c);
      const elliottPattern = detectElliottWaves(c);
      const wyckoff = detectWyckoff(c);
      const volumeProfile = calcVolumeProfile(c);

      setPatterns(unique);
      setLevels(srLevels);
      setGeoList(geoPatterns);
      setElliottData(elliottPattern);
      setWyckoffData(wyckoff);
      setVolProfile(volumeProfile);
      onPatternsRef.current({
        patterns: unique,
        supportLevels: srLevels.filter(l => l.type === 'support').slice(0, 4),
        resistanceLevels: srLevels.filter(l => l.type === 'resistance').slice(0, 4),
        trendLines,
        entryExit: null,
        smcData,
        geoPatterns,
        elliottPattern,
        wyckoff,
        volumeProfile,
        overlays,
      });

      // ── 3. مجلس الذكاء (8 نماذج) ─────────────────────────
      try {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const timer = setTimeout(() => abortRef.current?.abort(), 15000);
        const r = await fetch('/api/ai/consensus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: sym }),
          signal: abortRef.current.signal,
        });
        clearTimeout(timer);
        if (r.ok) {
          const d = await r.json();
          if (d.success && d.data) {
            const rec = d.data.recommendation;
            const dir = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'WAIT';
            const models = d.data.meta?.modelsResponded || d.data.analyses?.length || 0;
            setSignal({ dir: dir as 'BUY' | 'SELL' | 'WAIT', conf: (d.data.consensusScore || 50) / 100, entry: price, sl: dir === 'BUY' ? price * 0.992 : price * 1.008, tp: dir === 'BUY' ? price * 1.016 : price * 0.984, reason: t('councilModels', { count: models }), ts: Date.now() });
            if ((d.data.consensusScore || 0) >= 65 && dir !== 'WAIT') {
              fetch('/api/ai/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, signal: dir, patterns: unique.slice(0,3).map((p:any)=>p.labelAr||p.type), smcBreaks: smcData.structureBreaks.map((b:any)=>b.type+' '+(b.direction==='bullish'?'↑':'↓')), entry: price, sl: dir==='BUY'?price*0.992:price*1.008, tp: dir==='BUY'?price*1.016:price*0.984, confidence: (d.data.consensusScore||50)/100 }) }).catch(()=>{});
            }
            return;
          }
        }
      } catch { /* fallback */ }

      // ── 4. إشارة محلية من الأنماط + EMA ────────────────────
      const bull = unique.filter(p => p.direction === 'bullish').length;
      const bear = unique.filter(p => p.direction === 'bearish').length;
      const last20 = c.slice(-20);
      const ema9 = last20.slice(-9).reduce((s, x) => s + x.close, 0) / 9;
      const ema20 = last20.reduce((s, x) => s + x.close, 0) / 20;
      const trend = ema9 > ema20 ? 1 : -1;
      const bS = bull + (trend > 0 ? 2 : 0);
      const beS = bear + (trend < 0 ? 2 : 0);
      const dir = bS > beS ? 'BUY' : beS > bS ? 'SELL' : 'WAIT';
      const conf = Math.min(0.85, Math.abs(bS - beS) / (bS + beS + 1));
      setSignal({ dir: dir as 'BUY' | 'SELL' | 'WAIT', conf, entry: price, sl: dir === 'BUY' ? price * 0.992 : price * 1.008, tp: dir === 'BUY' ? price * 1.016 : price * 0.984, reason: trend > 0 ? t('emaBullish', { bull, bear }) : t('emaBearish', { bull, bear }), ts: Date.now() });
    } catch { /* silent */ }
    finally { setLoading(false); runRef.current = false; }
  };

  // ── تشغيل عند وصول البيانات ──────────────────────────────
  // FIX: Only auto-analyze ONCE when candles first arrive (length crosses 20 threshold).
  // Previously triggered on EVERY candles.length change, causing runaway re-analysis
  // as each new WebSocket candle incremented the length. Now we track the last length
  // we analyzed at and only re-trigger if the candle count increased by at least 10%
  // (e.g., 50→55 candles) or the symbol changed.
  const lastAnalyzedLengthRef = useRef(0);
  const lastAnalyzedSymbolRef = useRef(symbol);
  useEffect(() => {
    const currentLen = candles?.length || 0;
    const symbolChanged = symbol !== lastAnalyzedSymbolRef.current;
    const significantGrowth = currentLen > 0 && (
      lastAnalyzedLengthRef.current === 0 ||
      currentLen >= lastAnalyzedLengthRef.current * 1.1
    );
    if (currentLen >= 20 && (symbolChanged || significantGrowth)) {
      lastAnalyzedLengthRef.current = currentLen;
      lastAnalyzedSymbolRef.current = symbol;
      analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles?.length, symbol]);

  // cleanup
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── UI Helpers ─────────────────────────────────────────────
  const sigColor = signal?.dir === 'BUY' ? C.green : signal?.dir === 'SELL' ? C.red : C.yellow;
  const sigAr = signal?.dir === 'BUY' ? t('buy') : signal?.dir === 'SELL' ? t('sell') : t('wait');
  const sigIcon = signal?.dir === 'BUY' ? '▲' : signal?.dir === 'SELL' ? '▼' : '◆';
  const pct = Math.round((signal?.conf || 0) * 100);
  const fp = (n: number) => n > 999 ? n.toFixed(2) : n.toFixed(5);
  const strengthLabel = (s: string) => s === 'strong' ? t('strong') : s === 'medium' ? t('medium') : t('weak');
  const support = levels.filter(l => l.type === 'support').slice(0, 4);
  const resistance = levels.filter(l => l.type === 'resistance').slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 360, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', fontFamily: "'Cairo','IBM Plex Sans Arabic',sans-serif", boxShadow: '0 24px 64px rgba(0,0,0,0.7)', direction: 'inherit' }}>
      {/* Header */}
      <div data-drag-handle="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.025)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>
        <div data-drag-handle="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-drag-handle="true" style={{ fontSize: 16 }}>🧠</span>
          <div data-drag-handle="true">
            <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{t('title')}</div>
            <div style={{ color: C.mut, fontSize: 8.5, fontFamily: 'monospace' }}>{symbol}</div>
          </div>
          {loading && <div style={{ width: 8, height: 8, border: `1.5px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { runRef.current = false; abortRef.current?.abort(); analyze(); }} disabled={loading} title={t('refresh')} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: loading ? C.mut : C.cyan, width: 22, height: 22, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>⟳</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.mut, fontSize: 16, cursor: 'pointer', outline: 'none', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      {/* Overlay Toggles */}
      <div style={{ display:'flex', gap:3, padding:'4px 8px', borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:'wrap' }}>
        {([['S/R','sr','#4ade80'],['FVG','fvg','#22d3ee'],['BOS','bos','#f97316'],['هندسي','geo','#a78bfa'],['إليوت','ew','#93c5fd']] as [string,keyof typeof overlays,string][]).map(([lbl,key,col])=>(
          <button key={key} onClick={()=>{ toggleOverlay(key); setTimeout(()=>{ runRef.current=false; analyze(); },50); }}
            style={{ padding:'2px 7px', borderRadius:3, fontSize:8, fontWeight:700, cursor:'pointer', outline:'none', fontFamily:'inherit',
              border:`1px solid ${overlays[key]?col:'#333'}`,
              background:overlays[key]?col+'22':'transparent',
              color:overlays[key]?col:'#555',
              transition:'all 0.15s' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([['signal', t('tabSignal')], ['patterns', t('tabPatterns')], ['levels', t('tabLevels')], ['smc', t('tabSmc')], ['advanced', t('tabAdvanced')]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '4px 2px', background: tab===k?'rgba(34,211,238,0.08)':'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.cyan : 'transparent'}`, color: tab === k ? C.cyan : C.dim, fontSize: 9.5, cursor: 'pointer', outline: 'none', fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: tab===k?700:400 }}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* SIGNAL */}
        {tab === 'signal' && (
          <div style={{ padding: 10 }}>
            {signal ? (
              <>
                <div style={{ background: `${sigColor}12`, border: `1px solid ${sigColor}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 24, color: sigColor, fontWeight: 900 }}>{sigIcon}</span>
                      <div>
                        <div style={{ color: sigColor, fontSize: 15, fontWeight: 800 }}>{sigAr}</div>
                        <div style={{ color: C.dim, fontSize: 8.5, marginTop: 1 }}>{signal.reason}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: sigColor, fontSize: 20, fontWeight: 900 }}>{pct}%</div>
                      <div style={{ color: C.mut, fontSize: 8 }}>{t('confidence')}</div>
                    </div>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: sigColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                {signal.dir !== 'WAIT' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 8 }}>
                      {([[t('entry'), signal.entry, C.cyan], [t('stopLoss'), signal.sl, C.red], [t('target'), signal.tp, C.green]] as [string, number, string][]).map(([l, v, col]) => (
                        <div key={l} style={{ background: `${col}0a`, border: `1px solid ${col}25`, borderRadius: 6, padding: 5, textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 7.5, marginBottom: 2 }}>{l}</div>
                          <div style={{ color: col, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{fp(v)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 5, marginBottom: 8 }}>
                      <span style={{ color: C.dim, fontSize: 9 }}>{t('riskReward')}</span>
                      <span style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>1:{Math.abs((signal.tp - signal.entry) / (signal.sl - signal.entry || 1)).toFixed(2)}</span>
                    </div>
                    {onExecuteTrade && (
                      <button onClick={() => onExecuteTrade(signal.dir === 'BUY' ? 'long' : 'short', signal.entry, signal.sl, signal.tp)} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: signal.dir === 'BUY' ? C.green : C.red, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                        {signal.dir === 'BUY' ? `▲ ${t('executeBuy')}` : `▼ ${t('executeSell')}`}
                      </button>
                    )}
                  </>
                )}

                {(support.length > 0 || resistance.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {([[t('resistance'), resistance, C.red], [t('support'), support, C.green]] as [string, SupportResistanceLevel[], string][]).map(([lbl, arr, col]) => arr.length > 0 ? (
                      <div key={lbl} style={{ background: `${col}07`, border: `1px solid ${col}18`, borderRadius: 6, padding: '5px 7px' }}>
                        <div style={{ color: col, fontSize: 8.5, fontWeight: 700, marginBottom: 3 }}>{lbl}</div>
                        {arr.slice(0, 2).map((l, i) => <div key={i} style={{ color: C.dim, fontSize: 8.5, fontFamily: 'monospace' }}>{fp(l.price)}</div>)}
                      </div>
                    ) : null)}
                  </div>
                )}
                <div style={{ textAlign: 'center', marginTop: 6, color: C.mut, fontSize: 8 }}>{new Date(signal.ts).toLocaleTimeString(timeLocale)}</div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: C.dim }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🧠</div>
                <div style={{ fontSize: 10 }}>{t('pressToAnalyze')}</div>
              </div>
            )}
          </div>
        )}

        {/* PATTERNS */}
        {tab === 'patterns' && (
          <div style={{ padding: 8 }}>
            {patterns.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: C.dim, fontSize: 10 }}>{t('noPatterns')}</div>
              : patterns.map((p, i) => {
                const col = p.direction === 'bullish' ? C.green : p.direction === 'bearish' ? C.red : C.yellow;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 6, marginBottom: 4, background: C.card, border: `1px solid ${col}18` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: col, fontSize: 11 }}>{p.direction === 'bullish' ? '▲' : p.direction === 'bearish' ? '▼' : '◆'}</span>
                      <span style={{ color: C.text, fontSize: 9.5, fontWeight: 600 }}>{PATTERN_KEYS[p.type] ? t(PATTERN_KEYS[p.type]) : p.type}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ height: 3, width: 36, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${Math.round(p.confidence * 100)}%`, background: col, borderRadius: 2 }} />
                      </div>
                      <span style={{ color: C.mut, fontSize: 8 }}>{Math.round(p.confidence * 100)}%</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* LEVELS */}
        {tab === 'levels' && (
          <div style={{ padding: 8 }}>
            {([[t('resistance'), resistance, C.red], [t('support'), support, C.green]] as [string, SupportResistanceLevel[], string][]).map(([lbl, arr, col]) => arr.length > 0 ? (
              <div key={lbl} style={{ marginBottom: 10 }}>
                <div style={{ color: col, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>{lbl} ({arr.length})</div>
                {arr.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 5, background: C.card, marginBottom: 3, border: `1px solid ${col}15` }}>
                    <span style={{ color: col, fontSize: 9.5, fontFamily: 'monospace', fontWeight: 700 }}>{fp(l.price)}</span>
                    <span style={{ color: l.strength === 'strong' ? col : C.mut, fontSize: 8 }}>{strengthLabel(l.strength)}</span>
                  </div>
                ))}
              </div>
            ) : null)}
          </div>
        )}

        {/* SMC — Wyckoff + Volume Profile */}
        {tab === 'smc' && (
          <div style={{ padding: 8 }}>
            {wyckoffData && wyckoffData.phase !== 'Unknown' && (
              <div style={{ background: C.card, border: `1px solid ${wyckoffData.bias==='bullish'?C.green:wyckoffData.bias==='bearish'?C.red:C.yellow}30`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.dim, fontSize: 8, marginBottom: 3 }}>{t('wyckoff')}</div>
                <div style={{ color: wyckoffData.bias==='bullish'?C.green:wyckoffData.bias==='bearish'?C.red:C.yellow, fontSize: 13, fontWeight: 800 }}>{wyckoffData.labelAr}</div>
                <div style={{ color: C.mut, fontSize: 8.5, marginTop: 2 }}>{Math.round((wyckoffData.confidence||0)*100)}% {t('confidence')}</div>
              </div>
            )}
            {volProfile && volProfile.poc > 0 && (
              <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.dim, fontSize: 8, marginBottom: 6 }}>{t('volumeProfile')}</div>
                {([[t('poc'), volProfile.poc, C.yellow], [t('vah'), volProfile.vah, C.cyan], [t('val'), volProfile.val, C.red]] as [string,number,string][]).map(([l,v,col]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, padding:'3px 0', borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ color: col, fontSize: 8.5, fontWeight: 700 }}>{l}</span>
                    <span style={{ color: C.text, fontSize: 9, fontFamily:'monospace' }}>{v>999?v.toFixed(2):v.toFixed(5)}</span>
                  </div>
                ))}
              </div>
            )}
            {!wyckoffData && !volProfile && <div style={{ textAlign:'center', padding: 20, color: C.dim, fontSize: 10 }}>{t('pressForAnalysis')}</div>}
          </div>
        )}

        {/* ADVANCED — Geometric + Elliott */}
        {tab === 'advanced' && (
          <div style={{ padding: 8 }}>
            {geoList.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>{t('geometricPatterns')} ({geoList.length})</div>
                {geoList.map((g: any, i: number) => {
                  const col = g.direction==='bullish'?C.green:g.direction==='bearish'?C.red:C.yellow;
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 8px', borderRadius:5, background:C.card, marginBottom:3, border:`1px solid ${col}18` }}>
                      <span style={{ color:col, fontSize:9.5, fontWeight:600 }}>{g.direction==='bullish'?'▲':'▼'} {g.labelAr}</span>
                      <span style={{ color:C.mut, fontSize:8 }}>{Math.round(g.confidence*100)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            {elliottData && (
              <div style={{ background:C.card, borderRadius:6, padding:'8px 10px', marginBottom:8, border:`1px solid ${elliottData.direction==='bullish'?C.green:C.red}25` }}>
                <div style={{ color:C.dim, fontSize:8, marginBottom:3 }}>{t('elliottWaves')}</div>
                <div style={{ color:elliottData.direction==='bullish'?C.green:C.red, fontSize:12, fontWeight:700 }}>
                  {elliottData.type === '5-wave' ? t('impulse5Wave') : t('abcCorrection')} — {t('wave')} {elliottData.currentWave}
                </div>
                <div style={{ display:'flex', gap:4, marginTop:5 }}>
                  {elliottData.waves?.map((w: any) => (
                    <span key={w.waveNumber} style={{ background:`${elliottData.direction==='bullish'?C.green:C.red}20`, color:elliottData.direction==='bullish'?C.green:C.red, padding:'2px 5px', borderRadius:3, fontSize:8, fontWeight:700 }}>{w.waveNumber}</span>
                  ))}
                </div>
                {elliottData.nextTarget && <div style={{ color:C.dim, fontSize:8.5, marginTop:4 }}>{t('nextTarget')}: <span style={{ color:C.cyan, fontFamily:'monospace' }}>{elliottData.nextTarget.toFixed(2)}</span></div>}
              </div>
            )}
            {geoList.length===0 && !elliottData && <div style={{ textAlign:'center', padding:20, color:C.dim, fontSize:10 }}>{t('pressForAnalysis')}</div>}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
