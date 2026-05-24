'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useTabAlertStore } from '@/hooks/useTabAlertStore';
import { formatFreshness } from '@/lib/dashboard-live';
import { RefreshCw, Activity } from 'lucide-react';
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl';

// Signal explanations map
const SIGNAL_EXPLANATION_KEYS: Record<string, string> = {
  'buy': 'signalExplanationBuy',
  'sell': 'signalExplanationSell',
  'neutral': 'signalExplanationNeutral',
  'STRONG_BUY': 'signalExplanationStrongBuy',
  'BUY': 'signalExplanationBuy2',
  'STRONG_SELL': 'signalExplanationStrongSell',
  'SELL': 'signalExplanationSell2',
};

export function ScannerMini({ mobile = false, compact = false, selectedSymbol }: { mobile?: boolean; compact?: boolean; selectedSymbol?: string }) {
  useScopedStyle(`
          @keyframes dash-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
          .skeleton {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            animation: dash-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          @keyframes sig-glow {
            0%, 100% { box-shadow: 0 0 0 rgba(0,229,255,0); }
            50% { box-shadow: 0 0 6px rgba(0,229,255,0.08); }
          }
        `)
  const [signals, setSignals] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [countdown, setCountdown] = useState(60);
  const scanningRef = useRef(false);
  const isFirstScanRef = useRef(true);
  const { selectedSymbol: storeSelectedSymbol, setSelectedSymbol } = useSymbolStore();
  const ts = useTranslations('dashboard.scanner')
  const tc = useTranslations('common')
  const activeSymbol = selectedSymbol || storeSelectedSymbol;
  const spotlight = signals.find(sig => sig.pair === activeSymbol) || signals[0] || null
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hoveredPair, setHoveredPair] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => { void doScan(); }, [doScan, activeSymbol]);
  // Poll every 60s — pauses when tab hidden
  useVisibleInterval(() => { void doScan(); }, 60000);

  useEffect(() => {
    setCountdown(60)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) return 60; return prev - 1 })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [lastScan])

  const handleMouseEnter = (pair: string, e: React.MouseEvent) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    setHoveredPair(pair)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipPos({ top: rect.top, left: rect.left })
  }

  const handleMouseLeave = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredPair(null)
      setTooltipPos(null)
    }, 100)
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
            {ts('title')}
          </span>
          <span style={{ fontSize: 6, background: 'rgba(255,184,0,0.10)', border: '0.5px solid rgba(255,184,0,0.20)', color: 'var(--amber)', padding: '0.5px 4px', borderRadius: 2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            {signals.length > 0 ? `${signals.length} ${ts("pair")}` : ''}
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
            {scanning ? ts('scanningDot') : ts('scan')}
          </button>
        </div>
      </div>}

      {/* Results */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: compact ? '5px' : '6px' }}>
        {spotlight && (
          <div style={{
            marginBottom: 6,
            background: spotlight.pair === activeSymbol
              ? 'linear-gradient(135deg, rgba(0,229,255,0.10), rgba(0,229,255,0.02))'
              : 'linear-gradient(135deg, rgba(255,184,0,0.08), rgba(255,255,255,0.02))',
            border: spotlight.pair === activeSymbol
              ? '1px solid rgba(0,229,255,0.25)'
              : '1px solid rgba(255,184,0,0.15)',
            borderRadius: 10,
            padding: '7px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--foreground)', fontFamily: "'Cairo', sans-serif" }}>
                {spotlight.pair === activeSymbol ? ts('selectedUnderMicroscope') : ts('topOpportunity')}
              </span>
              <span style={{
                fontSize: 7,
                padding: '1.5px 6px',
                borderRadius: 999,
                background: spotlight.dir === 'buy' ? 'rgba(0,200,83,0.15)' : spotlight.dir === 'sell' ? 'rgba(255,59,48,0.15)' : 'rgba(255,184,0,0.15)',
                color: spotlight.dir === 'buy' ? 'var(--success)' : spotlight.dir === 'sell' ? 'var(--danger)' : 'var(--amber)',
                fontFamily: "'Cairo', sans-serif",
                fontWeight: 800,
              }}>
                {spotlight.dir === 'buy' ? tc('buy') : spotlight.dir === 'sell' ? tc('sell') : ts('watch')}
              </span>
            </div>
            <div style={{ fontSize: 7.5, color: 'var(--text2)', lineHeight: 1.6, fontFamily: "'Cairo', sans-serif" }}>
              {Array.isArray(spotlight.reasons) && spotlight.reasons.length > 0
                ? ts('appearedBecause', { symbol: spotlight.pair, reasons: spotlight.reasons.slice(0, 2).join('، ') })
                : ts('scannerWatching', { symbol: spotlight.pair })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 6, color: 'var(--text3)', fontFamily: 'monospace' }}>
              <span>{spotlight.source || ts('awaitingConnection')}</span>
              <span>{spotlight.timestamp ? formatFreshness(spotlight.timestamp, tc) : (lastScan || tc('justNow'))}</span>
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
             <div style={{ fontSize: 8, marginTop: 6 }}>{ts('noSignals')}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {signals.map((sig, i) => {
              const isHovered = hoveredPair === sig.pair
              const isBuy = sig.dir === 'buy'
              const isSell = sig.dir === 'sell'
              const dirColor = isBuy ? '#00E676' : isSell ? '#FF5252' : '#FFB800'
              const dirBg = isBuy ? 'rgba(0,230,118,0.10)' : isSell ? 'rgba(255,82,82,0.10)' : 'rgba(255,184,0,0.10)'
              const isActiveSig = sig.pair === activeSymbol
              const signalExplanation = ts(SIGNAL_EXPLANATION_KEYS[sig.dir] || SIGNAL_EXPLANATION_KEYS[sig.direction] || 'signalFromScanner')

              return (
                <div
                  key={i}
                  onClick={() => setSelectedSymbol(sig.pair)}
                  onMouseEnter={(e) => handleMouseEnter(sig.pair, e)}
                  onMouseLeave={handleMouseLeave}
                  style={{
                    background: isActiveSig
                      ? `linear-gradient(135deg, ${dirBg}, rgba(0,229,255,0.03))`
                      : isHovered
                        ? `linear-gradient(135deg, ${dirBg}, rgba(255,255,255,0.015))`
                        : 'rgba(255,255,255,0.015)',
                    border: isActiveSig
                      ? `1px solid ${isBuy ? 'rgba(0,230,118,0.25)' : isSell ? 'rgba(255,82,82,0.25)' : 'rgba(255,184,0,0.25)'}`
                      : isHovered
                        ? `1px solid ${isBuy ? 'rgba(0,230,118,0.18)' : isSell ? 'rgba(255,82,82,0.18)' : 'rgba(255,184,0,0.18)'}`
                        : '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 8,
                    padding: '5px 7px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Accent line on the right side */}
                  <div style={{
                    position: 'absolute', right: 0, top: '15%', bottom: '15%', width: 2.5,
                    borderRadius: 2,
                    background: dirColor,
                    opacity: isActiveSig ? 0.7 : isHovered ? 0.5 : 0.25,
                    transition: 'opacity 0.2s ease',
                  }} />

                  {/* Row 1: Pair + Direction badge + Strength */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{sig.pair}</span>
                      <span style={{
                        fontSize: 7, fontWeight: 800, color: dirColor, background: dirBg,
                        padding: '1px 5px', borderRadius: 3,
                        fontFamily: "'Cairo', sans-serif",
                      }}>
                        {isBuy ? tc('buy') : isSell ? tc('sell') : ts('watch')}
                      </span>
                      {isActiveSig && (
                        <span style={{ fontSize: 6, background: 'rgba(0,229,255,0.12)', padding: '1px 4px', borderRadius: 3, color: 'var(--accent)', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>{ts('selected')}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: dirColor, fontFamily: "'JetBrains Mono', monospace" }}>{sig.strength}</span>
                      <span style={{ fontSize: 6, fontWeight: 700, color: 'var(--text3)' }}>%</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{
                      height: '100%',
                      width: `${sig.strength}%`,
                      background: `linear-gradient(90deg, ${dirColor}, ${isBuy ? 'rgba(0,230,118,0.4)' : isSell ? 'rgba(255,82,82,0.4)' : 'rgba(255,184,0,0.4)'})`,
                      borderRadius: 2,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {sig.rsi != null && <span style={{ fontSize: 6, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>RSI {sig.rsi}</span>}
                      {sig.macdSignal != null && <span style={{ fontSize: 6, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>MACD {sig.macdSignal}</span>}
                    </div>
                    <span style={{ fontSize: 6, color: 'var(--text3)', fontFamily: 'monospace' }}>{sig.timestamp ? formatFreshness(sig.timestamp, tc) : (lastScan || tc('justNow'))}</span>
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
        const isBuy = sig.dir === 'buy'
        const isSell = sig.dir === 'sell'
        const dirColor = isBuy ? '#00E676' : isSell ? '#FF5252' : '#FFB800'
        const explanation = ts(SIGNAL_EXPLANATION_KEYS[sig.dir] || SIGNAL_EXPLANATION_KEYS[sig.direction] || 'signalFromScanner')
        const reasons = Array.isArray(sig.reasons) ? sig.reasons.slice(0, 3).join(' · ') : ''
        return (
          <div style={{
            position: 'fixed',
            top: tooltipPos.top - 42,
            left: tooltipPos.left,
            zIndex: 9999,
            pointerEvents: 'none',
            maxWidth: 240,
            background: 'rgba(12, 14, 20, 0.96)',
            border: `1px solid ${isBuy ? 'rgba(0,230,118,0.30)' : isSell ? 'rgba(255,82,82,0.30)' : 'rgba(255,184,0,0.30)'}`,
            borderRadius: 8,
            padding: '5px 9px',
            boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 12px ${isBuy ? 'rgba(0,230,118,0.06)' : isSell ? 'rgba(255,82,82,0.06)' : 'rgba(255,184,0,0.06)'}`,
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ fontSize: 8, fontWeight: 800, color: dirColor, fontFamily: "'Cairo', sans-serif", marginBottom: reasons ? 3 : 0 }}>
              {sig.pair} — {explanation}
            </div>
            {reasons && (
              <div style={{ fontSize: 6.5, color: '#90A0B8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>
                {reasons}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  );
}
