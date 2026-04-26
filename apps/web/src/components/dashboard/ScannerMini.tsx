'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { formatFreshness } from '@/lib/dashboard-live';

export function ScannerMini({ mobile = false, compact = false, selectedSymbol }: { mobile?: boolean; compact?: boolean; selectedSymbol?: string }) {
  const [signals, setSignals] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const scanningRef = useRef(false);
  const { selectedSymbol: storeSelectedSymbol, setSelectedSymbol } = useSymbolStore();
  const activeSymbol = selectedSymbol || storeSelectedSymbol;
  const spotlight = signals.find(sig => sig.pair === activeSymbol) || signals[0] || null

  const doScan = useCallback(async () => {
    if (scanningRef.current) return;

    scanningRef.current = true;
    setScanning(true);

    try {
      const querySymbol = activeSymbol ? `?pair=${encodeURIComponent(activeSymbol)}&tf=1h` : '';
      const res = await fetch(`/api/market-scan${querySymbol}`, { signal: AbortSignal.timeout(15000) });

      if (!res.ok) {
        throw new Error(`Scan failed with status ${res.status}`);
      }

      const data = await res.json();

      if (data?.success && Array.isArray(data.data)) {
        setSignals(data.data);
        setLastScan(
          new Date().toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } else {
        console.warn('Scan returned unexpected payload:', data);
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
    const iv = setInterval(() => {
      void doScan();
    }, 60000); // Auto scan every minute
    return () => clearInterval(iv);
  }, [doScan, activeSymbol]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', borderRadius: 16,
      border: '1px solid rgba(0,229,255,0.08)',
      overflow: 'hidden'
    }}>
      {!compact && <div style={{
        padding: '10px 10px 8px',
        background: 'linear-gradient(90deg, rgba(255,184,0,0.12), transparent)',
        borderBottom: '1px solid rgba(0,229,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Cairo', sans-serif" }}>
            📡 سكانر الأسواق
          </span>
          {lastScan && (
            <span style={{ fontSize: 7, color: 'var(--text3)', marginRight: 6, fontFamily: 'monospace' }}>
              · {lastScan}
            </span>
          )}
        </div>
        <button
          onClick={doScan}
          disabled={scanning}
          className="btn-cyan-active"
          style={{
            minHeight: 22,
            fontSize: 6.5, padding: '3px 7px', borderRadius: 4, cursor: scanning ? 'not-allowed' : 'pointer',
            lineHeight: 1,
          }}
        >
          {scanning ? '⟳ جارٍ...' : 'فحص الآن'}
        </button>
      </div>}

      {/* Results */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: compact ? '8px' : '10px' }}>
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
            marginBottom: 8,
            background: 'linear-gradient(180deg, rgba(255,184,0,0.08), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,184,0,0.16)',
            borderRadius: 14,
            padding: compact ? 10 : 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--foreground)', fontFamily: "'Cairo', sans-serif" }}>
                {spotlight.pair === selectedSymbol ? 'هذا الأصل تحت المجهر الآن' : 'الفرصة الأهم الآن'}
              </span>
              <span style={{
                fontSize: 9,
                padding: '2px 8px',
                borderRadius: 999,
                background: spotlight.dir === 'buy' ? 'rgba(0,200,83,0.15)' : spotlight.dir === 'sell' ? 'rgba(255,59,48,0.15)' : 'rgba(255,184,0,0.15)',
                color: spotlight.dir === 'buy' ? 'var(--success)' : spotlight.dir === 'sell' ? 'var(--danger)' : 'var(--amber)',
                fontFamily: 'monospace',
                fontWeight: 800,
              }}>
                {spotlight.signalClass || 'watch'} · {spotlight.entryBias || 'wait'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
              {Array.isArray(spotlight.reasons) && spotlight.reasons.length > 0
                ? `ظهر ${spotlight.pair} لأن السكانر رصد: ${spotlight.reasons.slice(0, 2).join('، ')}.`
                : `السكانر يراقب ${spotlight.pair} بانتظار تأكيد أقوى.`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>
              <span>{spotlight.source || 'Unknown source'} {spotlight.freshness ? `· ${spotlight.freshness}` : ''}</span>
              <span>{spotlight.timestamp ? formatFreshness(spotlight.timestamp) : (lastScan || 'الآن')}</span>
            </div>
          </div>
        )}
        {scanning && signals.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((skeletonIndex) => (
              <div
                key={skeletonIndex}
                style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,229,255,0.08)',
                  borderRadius: 12, padding: 12, opacity: 0.7
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div className="skeleton" style={{ width: 60, height: 16, marginBottom: 4 }} />
                    <div className="skeleton" style={{ width: 40, height: 12 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div className="skeleton" style={{ width: 50, height: 12, marginBottom: 4 }} />
                    <div className="skeleton" style={{ width: 30, height: 16 }} />
                  </div>
                </div>
                <div className="skeleton" style={{ width: '100%', height: 4, borderRadius: 2, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <div className="skeleton" style={{ width: 40, height: 14 }} />
                  <div className="skeleton" style={{ width: 60, height: 14 }} />
                  <div className="skeleton" style={{ width: 50, height: 14 }} />
                </div>
              </div>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div style={{ padding: compact ? 20 : 40, textAlign: 'center', opacity: 0.4 }}>
             <span style={{ fontSize: 30 }}>📡</span>
             <div style={{ fontSize: 11, marginTop: 10 }}>لا توجد إشارات الآن، السوق هادئ أو لم يكتمل الفحص.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map((sig, i) => (
              <div
                key={i}
                onClick={() => setSelectedSymbol(sig.pair)}
                style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,229,255,0.08)',
                  borderRadius: 14, padding: compact ? 10 : 12, cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: sig.pair === selectedSymbol ? '0 0 0 1px rgba(0,229,255,0.16) inset' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{sig.pair}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                      {sig.price} {sig.pair === selectedSymbol ? '· الأصل النشط' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: sig.dir === 'buy' ? 'var(--success)' : sig.dir === 'sell' ? 'var(--danger)' : 'var(--amber)',
                      textTransform: 'uppercase'
                    }}>
                      {sig.dir === 'buy' ? 'إشارة شراء' : sig.dir === 'sell' ? 'إشارة بيع' : 'ترقب / حياد'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{sig.strength}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>{sig.timestamp ? formatFreshness(sig.timestamp) : (lastScan || 'الآن')}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'monospace' }}>
                    {(sig.signalClass || 'watch').toUpperCase()} · {(sig.entryBias || 'wait').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>
                    {sig.source || 'source'} {sig.freshness ? `· ${sig.freshness}` : ''}
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{
                    height: '100%',
                    width: `${sig.strength}%`,
                    background: sig.dir === 'buy' ? 'var(--success)' : sig.dir === 'sell' ? 'var(--danger)' : 'var(--amber)',
                    boxShadow: `0 0 8px ${
                      sig.dir === 'buy'
                        ? 'rgba(0,200,83,0.4)'
                        : sig.dir === 'sell'
                          ? 'rgba(255,68,48,0.4)'
                          : 'rgba(255,184,0,0.4)'
                    }`
                  }} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <span style={{
                    fontSize: 9,
                    background: sig.pair === selectedSymbol ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.05)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    color: sig.pair === selectedSymbol ? 'var(--accent)' : 'var(--text2)',
                  }}>
                    {sig.pair === selectedSymbol ? 'هذا الأصل يهمك الآن' : 'فرصة مرصودة'}
                  </span>
                  {Array.isArray(sig.reasons) ? sig.reasons.map((reason: string, ri: number) => (
                    <span key={ri} style={{ 
                      fontSize: 9, background: 'rgba(255,255,255,0.05)', 
                      padding: '2px 6px', borderRadius: 4, color: 'var(--text2)' 
                    }}>{reason}</span>
                  )) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
