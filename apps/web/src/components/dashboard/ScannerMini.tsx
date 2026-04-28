'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useTabAlertStore } from '@/hooks/useTabAlertStore';
import { formatFreshness } from '@/lib/dashboard-live';
import { RefreshCw, Activity } from 'lucide-react';

// Signal explanations map
const SIGNAL_EXPLANATIONS: Record<string, string> = {
  'buy': 'السكانر رصد مؤشرات شراء — قد يكون هناك صعود قريب',
  'sell': 'السكانر رصد مؤشرات بيع — قد يكون هناك هبوط قريب',
  'neutral': 'لا توجد إشارة واضحة — السوق في حالة ترقب',
  'STRONG_BUY': 'إشارة شراء قوية — عدة مؤشرات تتفق على الصعود',
  'BUY': 'إشارة شراء — المؤشرات تميل للصعود',
  'STRONG_SELL': 'إشارة بيع قوية — عدة مؤشرات تتفق على الهبوط',
  'SELL': 'إشارة بيع — المؤشرات تميل للهبوط',
};

export function ScannerMini({ mobile = false, compact = false, selectedSymbol }: { mobile?: boolean; compact?: boolean; selectedSymbol?: string }) {
  const [signals, setSignals] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [countdown, setCountdown] = useState(60);
  const scanningRef = useRef(false);
  const isFirstScanRef = useRef(true);
  const { selectedSymbol: storeSelectedSymbol, setSelectedSymbol } = useSymbolStore();
  const activeSymbol = selectedSymbol || storeSelectedSymbol;
  const spotlight = signals.find(sig => sig.pair === activeSymbol) || signals[0] || null
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hoveredPair, setHoveredPair] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)

  const doScan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);

    try {
      const res = await fetch('/api/scanner/scan?timeframe=1h', { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`Scan failed with status ${res.status}`);
      const data = await res.json();

      if (data?.success && Array.isArray(data.items)) {
        const mapped = data.items.map((item: any) => ({
          pair: item.symbol,
          dir: item.direction === 'STRONG_BUY' ? 'buy' : item.direction === 'BUY' ? 'buy' : item.direction === 'STRONG_SELL' ? 'sell' : item.direction === 'SELL' ? 'sell' : 'neutral',
          strength: item.confidence,
          signalClass: item.signalClass?.toLowerCase() || 'watch',
          entryBias: item.direction === 'STRONG_BUY' || item.direction === 'BUY' ? 'follow' : item.direction === 'STRONG_SELL' || item.direction === 'SELL' ? 'follow' : 'wait',
          price: item.price,
          reasons: item.reasonsAr || item.reasons || [],
          source: item.source || 'scanner',
          freshness: item.marketOpen ? 'fresh' : 'closed',
          timestamp: item.timestamp,
          technicalScore: item.technicalScore,
          rsi: item.rsi,
          macdSignal: item.macdSignal,
          adx: item.adx,
          stochK: item.stochK,
          changePercent: item.changePercent,
          direction: item.direction,
        }));

        const sorted = [...mapped].sort((a: any, b: any) => {
          const aSelected = a.pair === activeSymbol ? 1 : 0
          const bSelected = b.pair === activeSymbol ? 1 : 0
          if (aSelected !== bSelected) return bSelected - aSelected
          return Math.abs(b.technicalScore || 0) - Math.abs(a.technicalScore || 0)
        })

        setSignals(sorted);
        setScanCount(prev => prev + 1);
        setLastScan(
          new Date().toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );

        if (!isFirstScanRef.current) {
          const strongSignals = mapped.filter((s: any) => s.dir !== 'neutral' && s.strength >= 60)
          for (const sig of strongSignals.slice(0, 3)) {
            useTabAlertStore.getState().pushAlert('scanner', {
              action: sig.dir === 'buy' ? 'BUY' : 'SELL',
              label: `${sig.dir === 'buy' ? '⬆' : '⬇'} ${sig.pair} ${sig.strength}%`,
              color: sig.dir === 'buy' ? '#00C853' : '#FF3B30',
            })
          }
        }
        isFirstScanRef.current = false;
      }
    } catch (e) {
      console.error('Scan failed:', e);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [activeSymbol]);

  useEffect(() => {
    void doScan();
    const iv = setInterval(() => { void doScan(); }, 60000);
    return () => clearInterval(iv);
  }, [doScan, activeSymbol]);

  useEffect(() => {
    setCountdown(60)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) return 60; return prev - 1 })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [lastScan])

  const handleMouseEnter = (pair: string, e: React.MouseEvent) => {
    setHoveredPair(pair)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipPos({ top: rect.top - 4, left: rect.left })
  }

  const handleMouseLeave = () => {
    setHoveredPair(null)
    setTooltipPos(null)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 16,
      border: '1px solid rgba(0,229,255,0.08)',
      overflow: 'hidden'
    }}>
      {!compact && <div style={{
        padding: '6px 8px 5px',
        background: 'linear-gradient(90deg, rgba(255,184,0,0.10), transparent)',
        borderBottom: '1px solid rgba(0,229,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Activity size={10} color="var(--accent)" className={scanning ? 'animate-pulse' : ''} />
          <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Cairo', sans-serif" }}>
            سكانر الأسواق
          </span>
          <span style={{ fontSize: 6, background: 'rgba(255,184,0,0.10)', border: '0.5px solid rgba(255,184,0,0.20)', color: 'var(--amber)', padding: '0.5px 4px', borderRadius: 2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            {signals.length > 0 ? `${signals.length} زوج` : ''}
          </span>
          {lastScan && (
            <span style={{ fontSize: 6, color: 'var(--text3)', fontFamily: 'monospace' }}>
              · {lastScan}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 6, color: 'var(--text3)', fontFamily: 'monospace' }}>{countdown}s</span>
          <button
            onClick={doScan}
            disabled={scanning}
            style={{
              minHeight: 16, fontSize: 6, padding: '2px 5px', borderRadius: 3,
              cursor: scanning ? 'not-allowed' : 'pointer', lineHeight: 1,
              display: 'flex', alignItems: 'center', gap: 2,
              background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)',
              color: 'var(--accent)', fontFamily: "'Cairo', sans-serif", fontWeight: 700,
            }}
          >
            <RefreshCw size={6} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'جارٍ...' : 'فحص'}
          </button>
        </div>
      </div>}

      {/* Results */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: compact ? '5px' : '6px' }}>
        <style>{`
          @keyframes dash-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
          .skeleton {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            animation: dash-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
        `}</style>
        {spotlight && (
          <div style={{
            marginBottom: 6,
            background: spotlight.pair === activeSymbol
              ? 'linear-gradient(180deg, rgba(0,229,255,0.08), rgba(255,255,255,0.02))'
              : 'linear-gradient(180deg, rgba(255,184,0,0.06), rgba(255,255,255,0.02))',
            border: spotlight.pair === activeSymbol
              ? '1px solid rgba(0,229,255,0.20)'
              : '1px solid rgba(255,184,0,0.12)',
            borderRadius: 8,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--foreground)', fontFamily: "'Cairo', sans-serif" }}>
                {spotlight.pair === activeSymbol ? '🎯 الأصل المحدد تحت المجهر' : 'الفرصة الأهم'}
              </span>
              <span style={{
                fontSize: 6.5,
                padding: '1px 5px',
                borderRadius: 999,
                background: spotlight.dir === 'buy' ? 'rgba(0,200,83,0.12)' : spotlight.dir === 'sell' ? 'rgba(255,59,48,0.12)' : 'rgba(255,184,0,0.12)',
                color: spotlight.dir === 'buy' ? 'var(--success)' : spotlight.dir === 'sell' ? 'var(--danger)' : 'var(--amber)',
                fontFamily: 'monospace',
                fontWeight: 800,
              }}>
                {spotlight.signalClass || 'watch'} · {spotlight.entryBias || 'wait'}
              </span>
            </div>
            <div style={{ fontSize: 7, color: 'var(--text2)', lineHeight: 1.5 }}>
              {Array.isArray(spotlight.reasons) && spotlight.reasons.length > 0
                ? `ظهر ${spotlight.pair} لأن: ${spotlight.reasons.slice(0, 2).join('، ')}.`
                : `السكانر يراقب ${spotlight.pair} بانتظار تأكيد.`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 6, color: 'var(--text3)', fontFamily: 'monospace' }}>
              <span>{spotlight.source || 'في انتظار الربط'}</span>
              <span>{spotlight.timestamp ? formatFreshness(spotlight.timestamp) : (lastScan || 'الآن')}</span>
            </div>
          </div>
        )}
        {scanning && signals.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[1, 2, 3].map((skeletonIndex) => (
              <div key={skeletonIndex} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,229,255,0.08)', borderRadius: 6, padding: 6, opacity: 0.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div className="skeleton" style={{ width: 50, height: 10 }} />
                  <div className="skeleton" style={{ width: 30, height: 10 }} />
                </div>
                <div className="skeleton" style={{ width: '100%', height: 3, borderRadius: 2 }} />
              </div>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div style={{ padding: compact ? 15 : 30, textAlign: 'center', opacity: 0.4 }}>
             <span style={{ fontSize: 20 }}>📡</span>
             <div style={{ fontSize: 8, marginTop: 6 }}>لا توجد إشارات الآن.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {signals.map((sig, i) => {
              const isHovered = hoveredPair === sig.pair
              const dirColor = sig.dir === 'buy' ? 'var(--success)' : sig.dir === 'sell' ? 'var(--danger)' : 'var(--amber)'
              const dirBg = sig.dir === 'buy' ? 'rgba(0,200,83,0.10)' : sig.dir === 'sell' ? 'rgba(255,59,48,0.10)' : 'rgba(255,184,0,0.10)'
              const signalExplanation = SIGNAL_EXPLANATIONS[sig.dir] || SIGNAL_EXPLANATIONS[sig.direction] || 'إشارة من السكانر'

              return (
                <div
                  key={i}
                  onClick={() => setSelectedSymbol(sig.pair)}
                  onMouseEnter={(e) => handleMouseEnter(sig.pair, e)}
                  onMouseLeave={handleMouseLeave}
                  title={`${sig.pair}: ${signalExplanation}`}
                  style={{
                    background: sig.pair === activeSymbol
                      ? 'rgba(0,229,255,0.04)'
                      : isHovered
                        ? 'rgba(255,255,255,0.03)'
                        : 'rgba(255,255,255,0.015)',
                    border: sig.pair === activeSymbol
                      ? '1px solid rgba(0,229,255,0.16)'
                      : '1px solid rgba(0,229,255,0.06)',
                    borderRadius: 6,
                    padding: '4px 5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: sig.pair === activeSymbol ? '0 0 8px rgba(0,229,255,0.06) inset' : 'none',
                  }}
                >
                  {/* Row 1: Pair + Direction + Strength */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{sig.pair}</span>
                      <span style={{ fontSize: 6, fontWeight: 800, color: dirColor, background: dirBg, padding: '0.5px 3px', borderRadius: 2, textTransform: 'uppercase' }}>
                        {sig.dir === 'buy' ? 'شراء' : sig.dir === 'sell' ? 'بيع' : 'ترقب'}
                      </span>
                      {sig.pair === activeSymbol && (
                        <span style={{ fontSize: 5, background: 'rgba(0,229,255,0.10)', padding: '0.5px 3px', borderRadius: 2, color: 'var(--accent)' }}>🎯</span>
                      )}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>{sig.strength}%</span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 2.5, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{
                      height: '100%',
                      width: `${sig.strength}%`,
                      background: dirColor,
                      boxShadow: `0 0 4px ${sig.dir === 'buy' ? 'rgba(0,200,83,0.3)' : sig.dir === 'sell' ? 'rgba(255,68,48,0.3)' : 'rgba(255,184,0,0.3)'}`,
                      borderRadius: 1,
                    }} />
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 5.5, color: 'var(--text3)', fontFamily: 'monospace' }}>
                    <span>{(sig.signalClass || 'watch').toUpperCase()} · {(sig.entryBias || 'wait').toUpperCase()}</span>
                    <span>{sig.timestamp ? formatFreshness(sig.timestamp) : (lastScan || 'الآن')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Signal explanation tooltip — fixed position to avoid clipping */}
      {hoveredPair && tooltipPos && (() => {
        const sig = signals.find(s => s.pair === hoveredPair)
        if (!sig) return null
        const explanation = SIGNAL_EXPLANATIONS[sig.dir] || SIGNAL_EXPLANATIONS[sig.direction] || 'إشارة من السكانر'
        const reasons = Array.isArray(sig.reasons) ? sig.reasons.slice(0, 3).join(' · ') : ''
        return (
          <div style={{
            position: 'fixed',
            top: tooltipPos.top - 36,
            left: tooltipPos.left,
            zIndex: 9999,
            pointerEvents: 'none',
            maxWidth: 220,
            background: 'rgba(20, 24, 36, 0.95)',
            border: `1px solid ${sig.dir === 'buy' ? 'rgba(0,200,83,0.25)' : sig.dir === 'sell' ? 'rgba(255,59,48,0.25)' : 'rgba(255,184,0,0.25)'}`,
            borderRadius: 6,
            padding: '4px 7px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: 7, fontWeight: 800, color: sig.dir === 'buy' ? '#00C853' : sig.dir === 'sell' ? '#FF3B30' : '#FFB800', fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>
              {hoveredPair}: {explanation}
            </div>
            {reasons && (
              <div style={{ fontSize: 6, color: '#8090A8', fontFamily: "'Cairo', sans-serif" }}>
                {reasons}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  );
}
