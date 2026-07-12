'use client';

import { useEffect, useState } from 'react';
import { chartDiag, diagEnabled } from '../../lib/charts/diag';

// طبقة عرض تشخيصية تظهر فوق الشارت على الجوال عند ?diag=1
// تُدير حالتها داخلياً (interval خاص) فلا تُسبب re-render للشارت.
export function ChartDiagOverlay({ connectionState }: { connectionState?: string }) {
  const [, setTick] = useState(0);
  const enabled = diagEnabled();

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const now = Date.now();
  const sincePrice = chartDiag.lastPriceAt ? Math.round((now - chartDiag.lastPriceAt) / 1000) : -1;
  const sinceKline = chartDiag.lastKlineAt ? Math.round((now - chartDiag.lastKlineAt) / 1000) : -1;
  const elapsed = Math.round((now - chartDiag.startedAt) / 1000);
  const lastCandleClock = chartDiag.lastCandleTime
    ? new Date(chartDiag.lastCandleTime * 1000).toLocaleTimeString()
    : '—';

  const row = (label: string, value: string | number, warn = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: warn ? '#ff6b6b' : '#9be29b' }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        left: 6,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.82)',
        color: '#9be29b',
        font: '11px/1.5 monospace',
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        pointerEvents: 'none',
        minWidth: 210,
        border: '1px solid rgba(155,226,155,0.3)',
      }}
    >
      <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>تشخيص الشموع ({elapsed}s)</div>
      {row('WS', connectionState || '—', connectionState !== 'connected')}
      {row('نبضات السعر', chartDiag.priceTicks)}
      {row('تحديث kline', chartDiag.klineUpdates, chartDiag.klineUpdates === 0)}
      {row('شموع جديدة', chartDiag.newCandleFired)}
      {row('setCandles', chartDiag.setCandlesCalls, chartDiag.setCandlesCalls > 5)}
      {row('سبب آخر set', chartDiag.lastSetReason || '—')}
      {row('آخر سعر منذ', sincePrice < 0 ? '—' : `${sincePrice}s`)}
      {row('آخر kline منذ', sinceKline < 0 ? '—' : `${sinceKline}s`, sinceKline > 10)}
      {row('وقت آخر شمعة', lastCandleClock)}
    </div>
  );
}
