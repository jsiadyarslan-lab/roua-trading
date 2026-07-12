// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Price Alert Line Component
// Visual price alert lines on chart with sound & browser notifications
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ScopedStyle } from '@/components/ScopedStyle';
import { AUDIO_TONES } from '@/lib/charts/config';

// ── Types ─────────────────────────────────────────────────
export type PriceAlertDirection = 'above' | 'below';

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  direction: PriceAlertDirection;
  active: boolean;
  triggered: boolean;
  createdAt: number;
  triggeredAt?: number;
}

interface PriceAlertLineProps {
  symbol: string;
  currentPrice?: number | null;
  /** Refs to chart methods — avoids re-render loops from `chart` prop recreation */
  addPriceLineRef: React.RefObject<((id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => void) | null>;
  removePriceLineRef: React.RefObject<((id: string) => void) | null>;
  onClose: () => void;
  /** Callback to report active alerts count */
  onAlertsCountChange?: (count: number) => void;
}

// ── Color Palette ─────────────────────────────────────────
const C = {
  bg: 'rgba(11,14,20,0.97)',
  card: '#111620',
  cardHover: '#151D2B',
  border: '#1E2530',
  borderActive: 'rgba(0,212,255,0.35)',
  cyan: T.info,
  text: T.text,
  textDim: T.text2,
  textMuted: '#4B5563',
  success: T.success,
  danger: T.danger,
  warning: '#fbbf24',
  gold: T.gold,
};

// ── localStorage helpers ──────────────────────────────────
// Fix: كان 'roua-price-alerts' بدون userId — بيانات تتسرب بين المستخدمين.
// الآن نستخدم userId من auth store لإنشاء key منفصل لكل مستخدم.
import { useAuthStore } from '@/lib/auth-store'
import T from '@/lib/unified-tokens';

function getStorageKey(): string {
  if (typeof window === 'undefined') return 'roua-price-alerts:guest';
  try {
    const userId = useAuthStore.getState().user?.id;
    return `roua-price-alerts:${userId || 'guest'}`;
  } catch {
    return 'roua-price-alerts:guest';
  }
}

function loadAlerts(symbol: string): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const all: PriceAlert[] = JSON.parse(raw);
    return all.filter(a => a.symbol === symbol);
  } catch {
    return [];
  }
}

function saveAlerts(alerts: PriceAlert[], symbol: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key);
    const all: PriceAlert[] = raw ? JSON.parse(raw) : [];
    // Remove alerts for this symbol, then add current ones
    const others = all.filter(a => a.symbol !== symbol);
    const merged = [...others, ...alerts];
    localStorage.setItem(key, JSON.stringify(merged));
  } catch { /* quota exceeded */ }
}

// ── AudioContext singleton ────────────────────────────────
// Reuse a single AudioContext instead of creating a new one per alert trigger.
let _priceAlertAudioCtx: AudioContext | null = null;

function getPriceAlertAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_priceAlertAudioCtx || _priceAlertAudioCtx.state === 'closed') {
    try {
      _priceAlertAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (_priceAlertAudioCtx.state === 'suspended') {
    _priceAlertAudioCtx.resume().catch(() => {});
  }
  return _priceAlertAudioCtx;
}

// ── Sound notification ────────────────────────────────────
function playAlertSound(direction: PriceAlertDirection) {
  try {
    const ac = getPriceAlertAudioContext();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    // Higher pitch for "above" alerts, lower for "below"
    osc.frequency.value = direction === 'above' ? AUDIO_TONES.above.freq1 : AUDIO_TONES.below.freq1;
    osc.type = 'sine';
    gain.gain.value = 0.12;
    osc.start();
    // Two-tone beep
    setTimeout(() => {
      osc.frequency.value = direction === 'above' ? AUDIO_TONES.above.freq2 : AUDIO_TONES.below.freq2;
    }, 100);
    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    }, 250);
  } catch { /* AudioContext not available */ }
}

// ── Browser notification ──────────────────────────────────
function sendBrowserNotification(alert: PriceAlert) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission === 'granted') {
      new Notification('Roua Trading — Price Alert', {
        body: `${alert.symbol} ${alert.direction === 'above' ? 'above' : 'below'} ${alert.price}`,
        icon: '/favicon.ico',
        tag: alert.id,
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification('Roua Trading — Price Alert', {
            body: `${alert.symbol} ${alert.direction === 'above' ? 'above' : 'below'} ${alert.price}`,
            icon: '/favicon.ico',
            tag: alert.id,
          });
        }
      });
    }
  } catch { /* Notification API not available */ }
}

// ── Main Component ────────────────────────────────────────
export function PriceAlertLine({ symbol, currentPrice, addPriceLineRef, removePriceLineRef, onClose, onAlertsCountChange }: PriceAlertLineProps) {
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => loadAlerts(symbol));
  const [newPrice, setNewPrice] = useState('');
  const [newDirection, setNewDirection] = useState<PriceAlertDirection>('above');
  const [showCreate, setShowCreate] = useState(false);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  // Track which alerts have already been notified to avoid repeated triggers
  const notifiedRef = useRef<Set<string>>(new Set());

  // ── Request notification permission on mount ──
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Sync alerts with localStorage ──
  useEffect(() => {
    saveAlerts(alerts, symbol);
    const activeCount = alerts.filter(a => a.active && !a.triggered).length;
    onAlertsCountChange?.(activeCount);
  }, [alerts, symbol, onAlertsCountChange]);

  // ── Manage chart price lines ──
  // FIX: Use refs instead of `chart` prop to prevent infinite re-render loops.
  // The `chart` object is recreated every render, so using it as a useEffect dep
  // causes the effect to run on every render, removing and re-adding all lines.
  useEffect(() => {
    const addPL = addPriceLineRef.current;
    const removePL = removePriceLineRef.current;
    if (!addPL || !removePL) return;

    // Remove all alert price lines first
    alerts.forEach(a => {
      removePL(`price-alert-${a.id}`);
    });

    // Add active alert lines
    alerts.filter(a => a.active).forEach(a => {
      const color = a.direction === 'above' ? C.success : C.danger;
      const label = `🔔 ${a.direction === 'above' ? '↑' : '↓'} ${a.price.toFixed(a.price > 1000 ? 2 : 5)}`;
      addPL(
        `price-alert-${a.id}`,
        a.price,
        a.triggered ? `${color}88` : color,
        label,
        a.triggered ? 1 : 2,
        2, // dashed
        true,
      );
    });

    return () => {
      alerts.forEach(a => {
        removePL(`price-alert-${a.id}`);
      });
    };
  }, [alerts, addPriceLineRef, removePriceLineRef]);

  // ── Check alerts against current price ──
  useEffect(() => {
    if (!currentPrice || alerts.length === 0) return;

    const updated = alerts.map(a => {
      if (!a.active || a.triggered) return a;

      const isTriggered = a.direction === 'above'
        ? currentPrice >= a.price
        : currentPrice <= a.price;

      if (isTriggered && !notifiedRef.current.has(a.id)) {
        notifiedRef.current.add(a.id);

        // Play sound
        playAlertSound(a.direction);

        // Send browser notification
        sendBrowserNotification(a);

        // Flash the line
        setFlashingIds(prev => new Set(prev).add(a.id));
        setTimeout(() => {
          setFlashingIds(prev => {
            const next = new Set(prev);
            next.delete(a.id);
            return next;
          });
        }, 2000);

        return { ...a, triggered: true, triggeredAt: Date.now() };
      }

      return a;
    });

    // Only update state if something changed
    const hasChanges = updated.some((a, i) => a.triggered !== alerts[i].triggered);
    if (hasChanges) {
      setAlerts(updated);
    }
  }, [currentPrice, alerts]);

  // ── Reset alerts when symbol changes ──
  useEffect(() => {
    setAlerts(loadAlerts(symbol));
    notifiedRef.current.clear();
  }, [symbol]);

  // ── Handlers ──
  const handleCreateAlert = useCallback(() => {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) return;

    const alert: PriceAlert = {
      id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      price,
      direction: newDirection,
      active: true,
      triggered: false,
      createdAt: Date.now(),
    };

    setAlerts(prev => [alert, ...prev]);
    setNewPrice('');
    setShowCreate(false);
  }, [newPrice, newDirection, symbol]);

  const handleDelete = useCallback((id: string) => {
    removePriceLineRef.current?.(`price-alert-${id}`);
    notifiedRef.current.delete(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, [removePriceLineRef]);

  const handleToggle = useCallback((id: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === id ? { ...a, active: !a.active, triggered: false } : a
    ));
    notifiedRef.current.delete(id);
  }, []);

  const handleResetTriggered = useCallback((id: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === id ? { ...a, triggered: false, triggeredAt: undefined } : a
    ));
    notifiedRef.current.delete(id);
  }, []);

  const handleSetAtCurrentPrice = useCallback(() => {
    if (!currentPrice) return;
    setNewPrice(currentPrice.toString());
    setShowCreate(true);
  }, [currentPrice]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatPrice = (p: number) => p > 1000 ? p.toFixed(2) : p.toFixed(5);

  return (
    <div style={{
      width: 300,
      background: C.bg,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderLeft: `1px solid ${C.border}`,
      zIndex: 500,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${C.border}`,
        background: `linear-gradient(180deg, ${C.card} 0%, rgba(17,22,32,0.6) 100%)`,
        direction: 'inherit',
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)',
          }}>
            🔔
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-sm)', color: C.text, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
              Price Alerts
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: C.textDim, fontFamily: "var(--font-mono)" }}>
              {symbol} • {alerts.filter(a => a.active && !a.triggered).length} active
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: C.textMuted, width: 22, height: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', padding: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Quick Create Buttons */}
      <div style={{ padding: '8px 14px', display: 'flex', gap: 4 }}>
        <button
          onClick={handleSetAtCurrentPrice}
          style={{
            flex: 1, padding: '6px 0',
            background: 'rgba(0,212,255,0.1)',
            border: '1px solid rgba(0,212,255,0.25)',
            borderRadius: 'var(--radius-sm)', color: C.cyan,
            fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
            fontFamily: "var(--font-mono)",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
          title="Set alert at current price"
        >
          <span>💡</span> Current Price
        </button>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            flex: 1, padding: '6px 0',
            background: 'rgba(0,255,163,0.1)',
            border: '1px solid rgba(0,255,163,0.25)',
            borderRadius: 'var(--radius-sm)', color: C.success,
            fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
            fontFamily: "var(--font-mono)",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Custom
        </button>
      </div>

      {/* Create Alert Form */}
      {showCreate && (
        <div style={{
          margin: '0 14px 8px',
          background: C.card, borderRadius: 'var(--radius-md)', padding: 10,
          border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {/* Direction selector */}
          <div style={{ display: 'flex', gap: 3 }}>
            {(['above', 'below'] as const).map(d => {
              const color = d === 'above' ? C.success : C.danger;
              const label = d === 'above' ? '↑ Price Above' : '↓ Price Below';
              return (
                <button
                  key={d}
                  onClick={() => setNewDirection(d)}
                  style={{
                    flex: 1, padding: '5px 0',
                    background: newDirection === d ? `${color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${newDirection === d ? `${color}40` : C.border}`,
                    borderRadius: 'var(--radius-sm)', color: newDirection === d ? color : C.textDim,
                    fontSize: 'var(--text-xs)', cursor: 'pointer', fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Price input */}
          <input
            type="number"
            value={newPrice}
            onChange={e => setNewPrice(e.target.value)}
            placeholder={currentPrice ? `Current: ${formatPrice(currentPrice)}` : 'Enter price...'}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateAlert(); }}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
              borderRadius: 'var(--radius-sm)', color: C.text,
              fontSize: 'var(--text-sm)', fontFamily: "var(--font-mono)",
              outline: 'none', direction: 'ltr',
            }}
            autoFocus
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleCreateAlert}
              disabled={!newPrice || isNaN(parseFloat(newPrice))}
              style={{
                flex: 1, padding: '6px 0',
                background: 'rgba(0,255,163,0.15)',
                border: '1px solid rgba(0,255,163,0.3)',
                borderRadius: 'var(--radius-sm)', color: C.success,
                fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
                fontFamily: "var(--font-ar)",
                opacity: !newPrice || isNaN(parseFloat(newPrice)) ? 0.4 : 1,
              }}
            >
              Create Alert
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewPrice(''); }}
              style={{
                flex: 1, padding: '6px 0',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${C.border}`,
                borderRadius: 'var(--radius-sm)', color: C.textDim,
                fontSize: 'var(--text-xs)', cursor: 'pointer',
                fontFamily: "var(--font-ar)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Alert List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {alerts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {alerts.map(alert => {
              const color = alert.direction === 'above' ? C.success : C.danger;
              const isFlashing = flashingIds.has(alert.id);
              return (
                <div
                  key={alert.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    background: isFlashing
                      ? `${color}20`
                      : alert.triggered
                        ? `${color}08`
                        : `${color}06`,
                    border: `1px solid ${isFlashing ? `${color}50` : alert.triggered ? `${color}20` : 'transparent'}`,
                    borderRadius: 'var(--radius-md)', transition: 'all 0.15s ease',
                    animation: isFlashing ? 'pulse-alert 0.5s ease-in-out 3' : undefined,
                  }}
                >
                  {/* Direction icon */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 'var(--radius-sm)',
                    background: `${color}12`, border: `1px solid ${color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--text-xs)', flexShrink: 0, color,
                    fontWeight: 900,
                  }}>
                    {alert.direction === 'above' ? '↑' : '↓'}
                  </div>

                  {/* Alert info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: C.text, fontWeight: 700, fontFamily: "var(--font-mono)", display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color }}>{formatPrice(alert.price)}</span>
                      {alert.triggered && (
                        <span style={{ fontSize: 'var(--text-xs)', color: C.warning, background: 'rgba(251,191,36,0.15)', padding: '1px 4px', borderRadius: 'var(--radius-xs)' }}>
                          TRIGGERED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: C.textMuted, fontFamily: "var(--font-mono)", marginTop: 1 }}>
                      {formatTime(alert.createdAt)} • {alert.direction === 'above' ? 'Above' : 'Below'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {alert.triggered && (
                      <button
                        onClick={() => handleResetTriggered(alert.id)}
                        style={{
                          width: 18, height: 18, borderRadius: 'var(--radius-xs)',
                          background: 'rgba(0,212,255,0.1)', border: 'none',
                          color: C.cyan, fontSize: 'var(--text-xs)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                        title="Reset alert"
                      >
                        ↻
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(alert.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 'var(--radius-xs)',
                        background: alert.active ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.1)',
                        border: 'none', color: alert.active ? C.success : C.danger,
                        fontSize: 'var(--text-xs)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                      title={alert.active ? 'Disable alert' : 'Enable alert'}
                    >
                      {alert.active ? '●' : '○'}
                    </button>
                    <button
                      onClick={() => handleDelete(alert.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 'var(--radius-xs)',
                        background: 'rgba(255,71,87,0.08)', border: 'none',
                        color: C.textMuted, fontSize: 'var(--text-xs)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; }}
                      title="Delete alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            textAlign: 'center', color: C.textMuted, fontSize: 'var(--text-xs)',
            padding: '24px 0', fontFamily: "var(--font-ar)",
          }}>
            No price alerts set
            <div style={{ fontSize: 'var(--text-xs)', marginTop: 4, color: C.textMuted }}>
              Click &quot;Current Price&quot; or &quot;Custom&quot; to add
            </div>
          </div>
        )}
      </div>

      {/* Flash animation */}
      <ScopedStyle>{`
        @keyframes pulse-alert {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</ScopedStyle>
    </div>
  );
}
