// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Chart Trading Panel (v2 — Professional)
// Collapsible glassmorphism execution widget
// Inspired by TradingView / Bybit / Binance order panels
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/hooks/use-toast';

interface ChartTradingProps {
  symbol: string;
  currentPrice: number;
  onClose: () => void;
  onPlaceOrder: (order: ChartOrderData) => void;
  spread?: number;
}

interface ChartOrderData {
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
}

// ── Color Palette ──────────────────────────────────────────
const C = {
  bg: 'rgba(13, 17, 23, 0.92)',
  surface: 'rgba(22, 27, 34, 0.95)',
  input: 'rgba(13, 17, 23, 0.8)',
  border: 'rgba(48, 54, 61, 0.7)',
  borderFocus: 'rgba(0, 212, 255, 0.4)',
  text: '#E6EDF3',
  text2: '#8B949E',
  text3: '#484F58',
  cyan: '#58A6FF',
  buy: T.success,
  buyHover: T.success,
  buyBg: 'rgba(0, 200, 83, 0.08)',
  sell: '#FF1744',
  sellHover: T.danger,
  sellBg: 'rgba(255, 23, 68, 0.08)',
  gold: '#FFD54F',
};

export function ChartTrading({ symbol, currentPrice, onClose, onPlaceOrder, spread }: ChartTradingProps) {
  const tn = useTranslations('notifications.trading');
  const tc = useTranslations('dashboard.chart');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [quantity, setQuantity] = useState('0.01');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estimate spread if not provided (0.05% default)
  const estimatedSpread = spread ?? (currentPrice * 0.0005);
  const spreadPct = ((estimatedSpread / currentPrice) * 100).toFixed(3);

  // RR Ratio
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

  // P&L estimate
  const estimatePnL = useCallback(() => {
    const qty = parseFloat(quantity);
    const tpVal = parseFloat(tp);
    if (!qty || !tpVal || !currentPrice) return null;
    const diff = side === 'buy' ? tpVal - currentPrice : currentPrice - tpVal;
    return (diff * qty).toFixed(2);
  }, [quantity, tp, currentPrice, side]);

  // Quick quantity presets
  const quickAmounts = ['0.01', '0.05', '0.1', '0.5', '1.0'];

  const handleSubmit = async () => {
    const slVal = parseFloat(sl);
    if (!slVal || slVal <= 0) {
      toast({ title: '⛔ ' + tn('stopLossRequired'), variant: 'destructive' });
      return;
    }
    if (side === 'buy' && slVal >= currentPrice) {
      toast({ title: '⛔ ' + tn('slMustBeBelowEntry'), variant: 'destructive' });
      return;
    }
    if (side === 'sell' && slVal <= currentPrice) {
      toast({ title: '⛔ ' + tn('slMustBeAboveEntry'), variant: 'destructive' });
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      toast({ title: '⛔ ' + tn('qtyMustBePositive'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      onPlaceOrder({
        side,
        type: orderType,
        quantity: qty,
        entryPrice: currentPrice,
        sl: slVal,
        tp: tp ? parseFloat(tp) : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const rr = rrRatio();
  const pnl = estimatePnL();
  const priceDecimals = currentPrice > 1000 ? 2 : currentPrice > 1 ? 4 : 6;
  const isBuy = side === 'buy';

  // ── Collapsed State: Minimal pill with price + buy/sell ──
  if (collapsed) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: C.bg,
        backdropFilter: 'blur(24px)',
        border: `1px solid ${C.border}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        userSelect: 'none',
      }}>
        {/* Symbol */}
        <span style={{
          fontSize: 'var(--text-xs)',
          color: C.cyan,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          whiteSpace: 'nowrap',
        }}>
          {symbol}
        </span>

        {/* Price */}
        <span style={{
          fontSize: 'var(--text-sm)',
          color: C.text,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          whiteSpace: 'nowrap',
        }}>
          {currentPrice.toFixed(priceDecimals)}
        </span>

        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          style={{
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 'var(--radius-sm)',
            color: C.text2,
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 'var(--text-xs)',
            fontFamily: "var(--font-ar)",
            lineHeight: 1,
          }}
        >
          ▲
        </button>

        {/* Quick Buy/Sell */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setSide('buy'); setCollapsed(false); }}
            style={{
              padding: '3px 10px',
              background: C.buy,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: '#000',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: "var(--font-ar)",
            }}
          >
            شراء
          </button>
          <button
            onClick={() => { setSide('sell'); setCollapsed(false); }}
            style={{
              padding: '3px 10px',
              background: C.sell,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: '#fff',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: "var(--font-ar)",
            }}
          >
            بيع
          </button>
        </div>
      </div>
    );
  }

  // ── Expanded State ──
  return (
    <div style={{
      background: C.bg,
      backdropFilter: 'blur(24px)',
      border: `1px solid ${isBuy ? 'rgba(0,200,83,0.15)' : 'rgba(255,23,68,0.15)'}`,
      borderRadius: 'var(--radius-lg)',
      width: 280,
      overflow: 'hidden',
      boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset`,
      userSelect: 'none',
      fontFamily: "var(--font-ar)",
    }}>
      {/* ── Header ── */}
      <div
        data-drag-handle
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          cursor: 'grab',
          borderBottom: `1px solid ${C.border}`,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <span style={{ fontSize: 'var(--text-xs)', color: C.text, fontWeight: 700, letterSpacing: 0.3 }}>
          تنفيذ صفقة
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Collapse button */}
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: C.text2,
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              padding: '0 2px',
              opacity: 0.7,
            }}
            title="طي"
          >
            ▼
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: C.text2,
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              padding: '0 2px',
              opacity: 0.7,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Price + Spread Section ── */}
      <div style={{
        padding: '10px 12px 8px',
        background: 'linear-gradient(135deg, rgba(0,200,83,0.04) 0%, rgba(0,0,0,0) 50%, rgba(255,23,68,0.04) 100%)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Symbol */}
        <div style={{ fontSize: 'var(--text-xs)', color: C.cyan, fontWeight: 700, fontFamily: "var(--font-mono)", marginBottom: 2 }}>
          {symbol}
        </div>

        {/* Current Price — Large */}
        <div style={{
          fontSize: 'var(--text-xl)',
          color: isBuy ? C.buy : C.sell,
          fontWeight: 800,
          fontFamily: "var(--font-mono)",
          lineHeight: 1.2,
          letterSpacing: -0.5,
        }}>
          {currentPrice.toFixed(priceDecimals)}
        </div>

        {/* Spread */}
        <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 4,
          fontSize: 'var(--text-xs)',
          color: C.text3,
          fontFamily: "var(--font-mono)",
        }}>
          <span>سبريد: <span style={{ color: C.text2 }}>{estimatedSpread.toFixed(priceDecimals)}</span></span>
          <span>({spreadPct}%)</span>
        </div>
      </div>

      {/* ── Side Toggle (Buy/Sell) ── */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{
          display: 'flex',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
        }}>
          {(['buy', 'sell'] as const).map(s => {
            const active = side === s;
            const isB = s === 'buy';
            return (
              <button
                key={s}
                onClick={() => setSide(s)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  background: active
                    ? isB
                      ? 'linear-gradient(135deg, #00C853 0%, #00E676 100%)'
                      : 'linear-gradient(135deg, #FF1744 0%, #FF5252 100%)'
                    : isB ? C.buyBg : C.sellBg,
                  border: 'none',
                  color: active ? '#000' : (isB ? C.buy : C.sell),
                  fontSize: 'var(--text-xs)',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: "var(--font-ar)",
                  transition: 'all 0.15s ease',
                  letterSpacing: 0.5,
                }}
              >
                {isB ? '▲ شراء' : '▼ بيع'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Order Type Tabs ── */}
      <div style={{ padding: '4px 12px 6px' }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['market', 'limit', 'stop'] as const).map(t => {
            const active = orderType === t;
            const labels: Record<string, string> = { market: 'سوقي', limit: 'محدد', stop: 'أمر شرطي' };
            return (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  background: active ? 'rgba(0,212,255,0.1)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(0,212,255,0.3)' : C.border}`,
                  borderRadius: 'var(--radius-sm)',
                  color: active ? C.cyan : C.text3,
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "var(--font-ar)",
                  transition: 'all 0.15s ease',
                }}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quantity Section ── */}
      <div style={{ padding: '2px 12px 6px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}>
          <label style={{ fontSize: 'var(--text-xs)', color: C.text2, fontWeight: 600 }}>حجم الصفقة</label>
          <span style={{ fontSize: 'var(--text-xs)', color: C.text3, fontFamily: "var(--font-mono)" }}>USDT</span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: C.input,
          border: `1px solid ${C.border}`,
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          transition: 'border-color 0.15s',
        }}>
          <input
            type="number"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            step="0.01"
            min="0"
            style={{
              flex: 1,
              padding: '7px 10px',
              background: 'transparent',
              border: 'none',
              color: C.text,
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              outline: 'none',
              minWidth: 0,
            }}
          />
        </div>
        {/* Quick Amount Buttons */}
        <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
          {quickAmounts.map(a => (
            <button
              key={a}
              onClick={() => setQuantity(a)}
              style={{
                flex: 1,
                padding: '3px 0',
                background: quantity === a ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${quantity === a ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 'var(--radius-xs)',
                color: quantity === a ? C.cyan : C.text3,
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "var(--font-mono)",
                transition: 'all 0.12s',
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* ── SL/TP Section ── */}
      <div style={{ padding: '0px 12px 6px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Stop Loss */}
          <div style={{ flex: 1 }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--text-xs)',
              color: C.sell,
              fontWeight: 600,
              marginBottom: 3,
            }}>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: C.sell,
                display: 'inline-block',
              }} />
              وقف خسارة
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: C.input,
              border: `1px solid ${sl ? 'rgba(255,23,68,0.3)' : C.border}`,
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
            }}>
              <input
                type="number"
                value={sl}
                onChange={e => setSl(e.target.value)}
                placeholder={side === 'buy' ? 'أقل من السعر' : 'أعلى من السعر'}
                step={currentPrice > 1000 ? '0.01' : '0.0001'}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  color: C.text,
                  fontSize: 'var(--text-xs)',
                  fontFamily: "var(--font-mono)",
                  outline: 'none',
                  minWidth: 0,
                }}
              />
            </div>
          </div>

          {/* Take Profit */}
          <div style={{ flex: 1 }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--text-xs)',
              color: C.buy,
              fontWeight: 600,
              marginBottom: 3,
            }}>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: C.buy,
                display: 'inline-block',
              }} />
              جني أرباح
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: C.input,
              border: `1px solid ${tp ? 'rgba(0,200,83,0.3)' : C.border}`,
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
            }}>
              <input
                type="number"
                value={tp}
                onChange={e => setTp(e.target.value)}
                placeholder={side === 'buy' ? 'أعلى من السعر' : 'أقل من السعر'}
                step={currentPrice > 1000 ? '0.01' : '0.0001'}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  color: C.text,
                  fontSize: 'var(--text-xs)',
                  fontFamily: "var(--font-mono)",
                  outline: 'none',
                  minWidth: 0,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── RR + PnL Info ── */}
      {(rr || pnl) && (
        <div style={{
          margin: '0 12px 6px',
          padding: '5px 8px',
          background: C.input,
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          {rr && (
            <span style={{ fontSize: 'var(--text-xs)', color: C.text2, fontFamily: "var(--font-mono)" }}>
              R:R <b style={{ color: parseFloat(rr) >= 2 ? C.buy : C.gold }}>{rr}</b>
            </span>
          )}
          {pnl && (
            <span style={{ fontSize: 'var(--text-xs)', color: C.text2, fontFamily: "var(--font-mono)" }}>
              P&L <b style={{ color: parseFloat(pnl) > 0 ? C.buy : parseFloat(pnl) < 0 ? C.sell : C.text2 }}>
                {parseFloat(pnl) > 0 ? '+' : ''}{pnl}$
              </b>
            </span>
          )}
        </div>
      )}

      {/* ── Execution Button ── */}
      <div style={{ padding: '4px 12px 10px' }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !parseFloat(quantity)}
          style={{
            width: '100%',
            padding: '10px 0',
            background: isBuy
              ? 'linear-gradient(135deg, #00C853 0%, #00E676 50%, #69F0AE 100%)'
              : 'linear-gradient(135deg, #FF1744 0%, #FF5252 50%, #FF8A80 100%)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: isBuy ? '#003300' : '#330000',
            fontSize: 'var(--text-sm)',
            fontWeight: 900,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            fontFamily: "var(--font-ar)",
            letterSpacing: 0.5,
            boxShadow: isBuy
              ? '0 4px 15px rgba(0,200,83,0.3), 0 0 30px rgba(0,200,83,0.1)'
              : '0 4px 15px rgba(255,23,68,0.3), 0 0 30px rgba(255,23,68,0.1)',
            transition: 'all 0.15s ease',
          }}
        >
          {submitting
            ? 'جارٍ التنفيذ...'
            : isBuy
              ? '▲  شراء / LONG'
              : '▼  بيع / SHORT'
          }
        </button>
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '6px 12px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 'var(--text-xs)',
        color: C.text3,
        fontFamily: "var(--font-mono)",
      }}>
        <span>رصيد: 10,000.00 USDT</span>
        <span>رسمة: ~0.05%</span>
      </div>
    </div>
  );
}
