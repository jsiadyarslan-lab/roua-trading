import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useNotificationStore } from '@/hooks/useNotificationStore';

export function ScannerMini() {
  const [signals, setSignals] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const { setSelectedSymbol } = useSymbolStore();
  const { addNotification } = useNotificationStore();
  const prevTopPairRef = useRef<string | null>(null);

  const doScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await fetch('/api/market-scan');
      const data = await res.json();
      if (data.success) {
        setSignals(data.data);
        setLastScan(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        
        // Notify if a high strength signal is found and it's different from the last one
        const top = data.data[0];
        if (top && top.strength > 85 && top.pair !== prevTopPairRef.current) {
          addNotification({
            title: `📡 فرصة قوية: ${top.pair}`,
            message: `رصد إشارة ${top.dir === 'buy' ? 'شراء' : 'بيع'} بقوة ${top.strength}%`,
            type: 'info'
          });
          prevTopPairRef.current = top.pair;
        }
      }
    } catch (e) {
      console.error('Scan failed:', e);
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  useEffect(() => {
    doScan();
    const iv = setInterval(doScan, 60000); // Auto scan every minute
    return () => clearInterval(iv);
  }, []);

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
        {scanning && signals.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'Cairo', sans-serif" }}>جاري تحليل الأسواق حياً...</div>
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
                  {sig.reasons.map((reason: string, ri: number) => (
                    <span key={ri} style={{ 
                      fontSize: 9, background: 'rgba(255,255,255,0.05)', 
                      padding: '2px 6px', borderRadius: 4, color: 'var(--text2)' 
                    }}>{reason}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
