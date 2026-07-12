// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Quick Trade Panel
// Integrated buy/sell panel with SL/TP and RR calculation
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens';

interface QuickTradePanelProps {
  symbol: string;
  currentPrice?: number | null;
  onPlaceOrder?: (order: any) => void;
  onClose?: () => void;
}

const C = {
  bg: 'rgba(17,26,34,0.92)',
  card: '#111620',
  border: '#1E2530',
  text: T.text,
  textDim: T.text2,
  textMuted: T.text3,
  cyan: T.info,
  success: T.success,
  danger: T.danger,
  warning: '#fbbf24',
};

const POPULAR_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD',
];

export function QuickTradePanel({ symbol, currentPrice, onPlaceOrder, onClose }: QuickTradePanelProps) {
  const tc = useTranslations('dashboard.chart');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [selectedSymbol, setSelectedSymbol] = useState(symbol);
  const [quantity, setQuantity] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [price, setPrice] = useState(currentPrice || 0);

  useEffect(() => {
    if (currentPrice && currentPrice > 0) {
      setPrice(currentPrice);
    }
  }, [currentPrice]);

  useEffect(() => {
    setSelectedSymbol(symbol);
  }, [symbol]);

  // Calculate RR ratio
  const entryPrice = price;
  const slVal = parseFloat(sl) || 0;
  const tpVal = parseFloat(tp) || 0;
  const risk = slVal > 0 ? Math.abs(entryPrice - slVal) : 0;
  const reward = tpVal > 0 ? Math.abs(tpVal - entryPrice) : 0;
  const rr = risk > 0 ? (reward / risk).toFixed(1) : '—';

  const handleBuy = useCallback(() => {
    setSide('buy');
  }, []);

  const handleSell = useCallback(() => {
    setSide('sell');
  }, []);

  const handlePlaceOrder = useCallback(() => {
    const order = {
      side,
      symbol: selectedSymbol,
      quantity: parseFloat(quantity) || 0,
      entryPrice: price,
      sl: slVal > 0 ? slVal : undefined,
      tp: tpVal > 0 ? tpVal : undefined,
    };
    onPlaceOrder?.(order);
  }, [side, selectedSymbol, quantity, price, slVal, tpVal, onPlaceOrder]);

  const formatPrice = (p: number): string => {
    if (p > 10000) return p.toFixed(0);
    if (p > 100) return p.toFixed(1);
    if (p > 1) return p.toFixed(2);
    return p.toFixed(5);
  };

  return (
    <div style={{
      zIndex: 10,
      background: C.bg,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      border: `1px solid ${C.border}`,
      width: 260,
      direction: 'inherit',
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, paddingBottom: 7,
        borderBottom: `1px solid ${C.border}`,
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 'var(--text-xs)' }}>⚡</span>
          <span style={{ fontSize: 'var(--text-xs)', color: C.text, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
            {tc('quickTrade')}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 'var(--radius-xs)',
              color: C.textMuted, width: 18, height: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-xs)', padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Symbol selector */}
      <select
        value={selectedSymbol}
        onChange={e => setSelectedSymbol(e.target.value)}
        style={{
          width: '100%', padding: '5px 8px',
          background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
          borderRadius: 'var(--radius-sm)', color: C.cyan,
          fontSize: 'var(--text-xs)', fontWeight: 700,
          fontFamily: "var(--font-mono)",
          outline: 'none', marginBottom: 8, cursor: 'pointer',
        }}
      >
        {POPULAR_PAIRS.map(p => (
          <option key={p} value={p} style={{ background: C.card, color: C.text }}>{p}</option>
        ))}
      </select>

      {/* Current Price */}
      <div style={{
        textAlign: 'center', padding: '6px 0 8px',
        marginBottom: 8,
        background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
      }}>
        <div style={{ fontSize: 'var(--text-xs)', color: C.textMuted, fontFamily: "var(--font-ar)", marginBottom: 2 }}>
          {tc('currentPrice')}
        </div>
        <div style={{
          fontSize: 'var(--text-lg)', fontWeight: 900, color: C.text,
          fontFamily: "var(--font-mono)",
          letterSpacing: 0.5,
        }}>
          {price > 0 ? formatPrice(price) : '—'}
        </div>
      </div>

      {/* Buy/Sell buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={handleBuy}
          style={{
            flex: 1, padding: '8px 0',
            background: side === 'buy' ? 'rgba(0,255,163,0.2)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${side === 'buy' ? 'rgba(0,255,163,0.4)' : C.border}`,
            borderRadius: 'var(--radius-md)', color: side === 'buy' ? C.success : C.textDim,
            fontSize: 'var(--text-sm)', fontWeight: 900, cursor: 'pointer',
            fontFamily: "var(--font-ar)",
            transition: 'all 0.15s ease',
          }}
        >
          {tc('buy')}
        </button>
        <button
          onClick={handleSell}
          style={{
            flex: 1, padding: '8px 0',
            background: side === 'sell' ? 'rgba(255,71,87,0.2)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${side === 'sell' ? 'rgba(255,71,87,0.4)' : C.border}`,
            borderRadius: 'var(--radius-md)', color: side === 'sell' ? C.danger : C.textDim,
            fontSize: 'var(--text-sm)', fontWeight: 900, cursor: 'pointer',
            fontFamily: "var(--font-ar)",
            transition: 'all 0.15s ease',
          }}
        >
          {tc('sell')}
        </button>
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 'var(--text-xs)', color: C.textMuted, fontFamily: "var(--font-ar)", display: 'block', marginBottom: 2 }}>
          {tc('quantity')}
        </label>
        <input
          type="number"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          placeholder="0.01"
          step="0.01"
          style={{
            width: '100%', padding: '5px 8px',
            background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
            borderRadius: 'var(--radius-sm)', color: C.text,
            fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)",
            outline: 'none', direction: 'ltr',
          }}
        />
      </div>

      {/* SL & TP */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 'var(--text-xs)', color: C.danger, fontFamily: "var(--font-mono)", display: 'block', marginBottom: 2 }}>
            {tc('stopLoss')}
          </label>
          <input
            type="number"
            value={sl}
            onChange={e => setSl(e.target.value)}
            placeholder={side === 'buy' && price > 0 ? formatPrice(price * 0.98) : side === 'sell' && price > 0 ? formatPrice(price * 1.02) : '0'}
            style={{
              width: '100%', padding: '5px 6px',
              background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.2)',
              borderRadius: 'var(--radius-sm)', color: C.danger,
              fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)",
              outline: 'none', direction: 'ltr',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 'var(--text-xs)', color: C.success, fontFamily: "var(--font-mono)", display: 'block', marginBottom: 2 }}>
            {tc('takeProfit')}
          </label>
          <input
            type="number"
            value={tp}
            onChange={e => setTp(e.target.value)}
            placeholder={side === 'buy' && price > 0 ? formatPrice(price * 1.03) : side === 'sell' && price > 0 ? formatPrice(price * 0.97) : '0'}
            style={{
              width: '100%', padding: '5px 6px',
              background: 'rgba(0,255,163,0.05)', border: '1px solid rgba(0,255,163,0.2)',
              borderRadius: 'var(--radius-sm)', color: C.success,
              fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)",
              outline: 'none', direction: 'ltr',
            }}
          />
        </div>
      </div>

      {/* RR Ratio */}
      {risk > 0 && reward > 0 && (
        <div style={{
          textAlign: 'center', padding: '4px 0', marginBottom: 8,
          background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
        }}>
          <span style={{ fontSize: 'var(--text-xs)', color: C.textMuted, fontFamily: "var(--font-ar)" }}>
            {tc('riskRewardRatio')}
          </span>
          <span style={{
            fontSize: 'var(--text-base)', fontWeight: 900,
            color: Number(rr) >= 2 ? C.success : Number(rr) >= 1 ? C.warning : C.danger,
            fontFamily: "var(--font-mono)",
            marginRight: 8,
          }}>
            1:{rr}
          </span>
        </div>
      )}

      {/* Place Order */}
      <button
        onClick={handlePlaceOrder}
        style={{
          width: '100%', padding: '9px 0',
          background: side === 'buy'
            ? 'linear-gradient(135deg, rgba(0,255,163,0.3) 0%, rgba(0,255,163,0.1) 100%)'
            : 'linear-gradient(135deg, rgba(255,71,87,0.3) 0%, rgba(255,71,87,0.1) 100%)',
          border: `1px solid ${side === 'buy' ? 'rgba(0,255,163,0.4)' : 'rgba(255,71,87,0.4)'}`,
          borderRadius: 'var(--radius-md)',
          color: side === 'buy' ? C.success : C.danger,
          fontSize: 'var(--text-sm)', fontWeight: 900, cursor: 'pointer',
          fontFamily: "var(--font-ar)",
          transition: 'all 0.15s ease',
        }}
      >
        {side === 'buy' ? tc('buyArrow') : tc('sellArrow')} {selectedSymbol}
      </button>
    </div>
  );
}
