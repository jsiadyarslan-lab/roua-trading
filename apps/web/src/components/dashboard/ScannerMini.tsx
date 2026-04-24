'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSymbolStore } from '@/hooks/useSymbolStore';

export function ScannerMini() {
  const [signals, setSignals] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const scanningRef = useRef(false);
  const { setSelectedSymbol } = useSymbolStore();

  const doScan = useCallback(async () => {
    if (scanningRef.current) return;

    scanningRef.current = true;
    setScanning(true);

    try {
      const res = await fetch('/api/market-scan');

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
  }, []);

  useEffect(() => {
    void doScan();
    const iv = setInterval(() => {
      void doScan();
    }, 60000); // Auto scan every minute
    return () => clearInterval(iv);
  }, [doScan]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', borderRadius: 12,
      border: '1px solid var(--border)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Cairo', sans-serif" }}>
            📡 سكانر الأسواق
          </span>
          {lastScan && (
            <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 8, fontFamily: 'monospace' }}>
              · {lastScan}
            </span>
          )}
        </div>
        <button
          onClick={doScan}
          disabled={scanning}
          className="btn-cyan-active"
          style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: scanning ? 'not-allowed' : 'pointer'
          }}
        >
          {scanning ? '⟳ جارٍ...' : 'فحص الآن'}
        </button>
      </div>

      {/* Results */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
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
        {scanning && signals.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((skeletonIndex) => (
              <div
                key={skeletonIndex}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 12, opacity: 0.7
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
          <div style={{ padding: 40, textAlign: 'center', opacity: 0.4 }}>
             <span style={{ fontSize: 30 }}>📡</span>
             <div style={{ fontSize: 11, marginTop: 10 }}>لا توجد إشارات حالياً</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map((sig, i) => (
              <div
                key={i}
                onClick={() => setSelectedSymbol(sig.pair)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 12, cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{sig.pair}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sig.price}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: 10, fontWeight: 800, 
                      color: sig.dir === 'buy' ? 'var(--success)' : 'var(--danger)',
                      textTransform: 'uppercase'
                    }}>
                      {sig.dir === 'buy' ? 'إشارة شراء' : 'إشارة بيع'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{sig.strength}%</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ 
                    height: '100%', width: `${sig.strength}%`, 
                    background: sig.dir === 'buy' ? 'var(--success)' : 'var(--danger)',
                    boxShadow: `0 0 8px ${sig.dir === 'buy' ? 'rgba(0,200,83,0.4)' : 'rgba(255,68,68,0.4)'}`
                  }} />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
