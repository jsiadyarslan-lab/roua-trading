// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Chart Trading Panel
// Floating order panel with SL/TP drag on chart
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback } from 'react';

interface ChartTradingProps {
  symbol: string;
  currentPrice: number;
  onClose: () => void;
  onPlaceOrder: (order: ChartOrderData) => void;
}

interface ChartOrderData {
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
}

export function ChartTrading({ symbol, currentPrice, onClose, onPlaceOrder }: ChartTradingProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [quantity, setQuantity] = useState('0.01');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Calculate Risk/Reward Ratio
  const rrRatio = useCallback(() => {
    const entry = currentPrice;
    const slVal = parseFloat(sl);
    const tpVal = parseFloat(tp);

    if (!slVal || !tpVal || !entry) return null;

    const risk = Math.abs(entry - slVal);
    const reward = Math.abs(tpVal - entry);

    if (risk === 0) return null;
    return (reward / risk).toFixed(2);
  }, [currentPrice, sl, tp]);

  // Estimate P&L
  const estimatePnL = useCallback(() => {
    const qty = parseFloat(quantity);
    const tpVal = parseFloat(tp);
    if (!qty || !tpVal || !currentPrice) return null;

    const diff = side === 'buy' ? tpVal - currentPrice : currentPrice - tpVal;
    return (diff * qty).toFixed(2);
  }, [quantity, tp, currentPrice, side]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      onPlaceOrder({
        side,
        type: orderType,
        quantity: parseFloat(quantity) || 0,
        entryPrice: currentPrice,
        sl: sl ? parseFloat(sl) : undefined,
        tp: tp ? parseFloat(tp) : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const COLORS = {
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    success: '#3fb950',
    danger: '#f85149',
    warning: '#fbbf24',
    bg: '#0B0E14',
  };

  const rr = rrRatio();
  const pnl = estimatePnL();

  return (
    <div style={{
      position: 'absolute',
      bottom: 8,
      left: 8,
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 10,
      padding: 12,
      zIndex: 500,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 240,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
          📊 أمر تداول
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Symbol + Price */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 8px',
        background: COLORS.bg,
        borderRadius: 6,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 10, color: COLORS.cyan, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</span>
        <span style={{ fontSize: 12, color: COLORS.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {currentPrice.toFixed(currentPrice > 1000 ? 2 : 5)}
        </span>
      </div>

      {/* Side Toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['buy', 'sell'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex: 1,
              padding: '6px 0',
              background: side === s ? (s === 'buy' ? COLORS.success : COLORS.danger) : 'transparent',
              border: `1px solid ${s === 'buy' ? COLORS.success : COLORS.danger}`,
              borderRadius: 6,
              color: side === s ? '#000' : (s === 'buy' ? COLORS.success : COLORS.danger),
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Cairo', sans-serif",
              transition: 'all 0.15s',
            }}
          >
            {s === 'buy' ? 'شراء' : 'بيع'}
          </button>
        ))}
      </div>

      {/* Order Type */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['market', 'limit', 'stop'] as const).map(t => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            style={{
              flex: 1,
              padding: '4px 0',
              background: orderType === t ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: `1px solid ${orderType === t ? COLORS.cyan : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 4,
              color: orderType === t ? COLORS.cyan : COLORS.textMuted,
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {t === 'market' ? 'سوق' : t === 'limit' ? 'حد' : 'وقف'}
          </button>
        ))}
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', fontSize: 9, color: COLORS.textMuted, marginBottom: 3, fontFamily: "'Cairo', sans-serif" }}>الكمية</label>
        <input
          type="number"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          step="0.01"
          min="0"
          style={{
            width: '100%',
            padding: '5px 8px',
            background: COLORS.bg,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            color: COLORS.text,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
          }}
        />
      </div>

      {/* SL / TP */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 9, color: COLORS.danger, marginBottom: 3, fontFamily: "'Cairo', sans-serif" }}>وقف الخسارة 🔴</label>
          <input
            type="number"
            value={sl}
            onChange={e => setSl(e.target.value)}
            placeholder={side === 'buy' ? 'أقل من السعر' : 'أعلى من السعر'}
            step="0.0001"
            style={{
              width: '100%',
              padding: '4px 6px',
              background: COLORS.bg,
              border: '1px solid rgba(248,81,73,0.2)',
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 9, color: COLORS.success, marginBottom: 3, fontFamily: "'Cairo', sans-serif" }}>جني الأرباح 🟢</label>
          <input
            type="number"
            value={tp}
            onChange={e => setTp(e.target.value)}
            placeholder={side === 'buy' ? 'أعلى من السعر' : 'أقل من السعر'}
            step="0.0001"
            style={{
              width: '100%',
              padding: '4px 6px',
              background: COLORS.bg,
              border: '1px solid rgba(63,185,80,0.2)',
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* RR Ratio + PnL Estimate */}
      {(rr || pnl) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '5px 8px',
          background: COLORS.bg,
          borderRadius: 4,
          marginBottom: 8,
        }}>
          {rr && (
            <span style={{ fontSize: 9, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
              RR: <b style={{ color: parseFloat(rr) >= 2 ? COLORS.success : COLORS.warning }}>{rr}</b>
            </span>
          )}
          {pnl && (
            <span style={{ fontSize: 9, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
              P&L: <b style={{ color: parseFloat(pnl) >= 0 ? COLORS.success : COLORS.danger }}>
                {parseFloat(pnl) >= 0 ? '+' : ''}{pnl}$
              </b>
            </span>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !parseFloat(quantity)}
        style={{
          width: '100%',
          padding: '8px 0',
          background: side === 'buy' ? COLORS.success : COLORS.danger,
          border: 'none',
          borderRadius: 6,
          color: '#000',
          fontSize: 11,
          fontWeight: 700,
          cursor: submitting ? 'wait' : 'pointer',
          fontFamily: "'Cairo', sans-serif",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '⏳ جاري الإرسال...' : side === 'buy' ? '✅ شراء' : '🔴 بيع'}
      </button>
    </div>
  );
}
