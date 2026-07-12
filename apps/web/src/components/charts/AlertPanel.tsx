// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Alert Panel (Sidebar)
// Smart alerts system with 6 alert types
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert, AlertType, createAlert, ALERT_TYPE_LABELS, ALERT_TYPE_ICONS } from './AlertManager'
import T from '@/lib/unified-tokens';

interface AlertPanelProps {
  symbol: string;
  currentPrice?: number;
  onClose: () => void;
}

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

const TYPE_COLORS: Record<AlertType, string> = {
  price: C.cyan,
  indicator: '#a855f7',
  pattern: C.warning,
  whale: C.danger,
  prediction: C.success,
  news: C.gold,
};

export function AlertPanel({ symbol, currentPrice, onClose }: AlertPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<AlertType>('price');
  const [newValue, setNewValue] = useState('');
  const [newDirection, setNewDirection] = useState<'above' | 'below' | 'cross'>('above');

  const handleCreate = useCallback(() => {
    const value = parseFloat(newValue);
    if (isNaN(value) || value <= 0) return;

    const alert = createAlert({
      type: newType,
      symbol,
      condition: `${newType} ${newDirection} ${value}`,
      value,
      direction: newDirection,
    });
    setAlerts(prev => [alert, ...prev]);
    setShowCreate(false);
    setNewValue('');
  }, [newType, newValue, newDirection, symbol]);

  const handleDelete = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleToggle = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  }, []);

  const locale = useLocale();
  const tc = useTranslations('dashboard.chart');
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      width: 320,
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
            width: 24, height: 24, borderRadius: 6,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
          }}>
            🔔
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
              {tc('alerts')}
            </div>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: "var(--font-mono)" }}>
              {symbol} • {alerts.filter(a => a.active).length} {tc('active')}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 5,
          color: C.textMuted, width: 22, height: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, padding: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Create Alert */}
      <div style={{ padding: '10px 14px', direction: 'inherit' }}>
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              width: '100%', padding: '8px 0',
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.25)',
              borderRadius: 8, color: C.cyan,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              fontFamily: "var(--font-ar)",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {tc('newAlert')}
          </button>
        ) : (
          <div style={{
            background: C.card, borderRadius: 8, padding: 10,
            border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {/* Type selector */}
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {(['price', 'indicator', 'pattern', 'whale', 'prediction', 'news'] as AlertType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  style={{
                    background: newType === t ? `${TYPE_COLORS[t]}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${newType === t ? `${TYPE_COLORS[t]}40` : C.border}`,
                    borderRadius: 4, color: newType === t ? TYPE_COLORS[t] : C.textDim,
                    fontSize: 9, padding: '3px 6px', cursor: 'pointer',
                    fontFamily: "var(--font-ar)",
                  }}
                >
                  {ALERT_TYPE_ICONS[t]} {tc(ALERT_TYPE_LABELS[t])}
                </button>
              ))}
            </div>

            {/* Direction */}
            <div style={{ display: 'flex', gap: 3 }}>
              {(['above', 'below', 'cross'] as const).map(d => {
                const label = d === 'above' ? tc('above') : d === 'below' ? tc('below') : tc('cross');
                return (
                  <button key={d} onClick={() => setNewDirection(d)} style={{
                    flex: 1, padding: '4px 0',
                    background: newDirection === d ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${newDirection === d ? 'rgba(0,212,255,0.25)' : C.border}`,
                    borderRadius: 4, color: newDirection === d ? C.cyan : C.textDim,
                    fontSize: 10, cursor: 'pointer', fontFamily: "var(--font-ar)",
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Value input */}
            <input
              type="number"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder={currentPrice ? tc('currentPriceValue', { price: currentPrice.toFixed(2) }) : tc('value')}
              style={{
                width: '100%', padding: '6px 8px',
                background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.text,
                fontSize: 11, fontFamily: "var(--font-mono)",
                outline: 'none', direction: 'ltr',
              }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleCreate}
                style={{
                  flex: 1, padding: '6px 0',
                  background: 'rgba(0,255,163,0.15)',
                  border: '1px solid rgba(0,255,163,0.3)',
                  borderRadius: 6, color: C.success,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "var(--font-ar)",
                }}
              >
                {tc('create')}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewValue(''); }}
                style={{
                  flex: 1, padding: '6px 0',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.textDim,
                  fontSize: 10, cursor: 'pointer',
                  fontFamily: "var(--font-ar)",
                }}
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Alert List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', direction: 'inherit' }}>
        {alerts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {alerts.map(alert => {
              const typeColor = TYPE_COLORS[alert.type];
              const isTriggered = alert.triggered;
              return (
                <div key={alert.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: isTriggered ? 'rgba(0,255,163,0.06)' : `${typeColor}06`,
                  border: `1px solid ${isTriggered ? 'rgba(0,255,163,0.2)' : 'transparent'}`,
                  borderRadius: 7, transition: 'all 0.15s ease',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 5,
                    background: `${typeColor}12`, border: `1px solid ${typeColor}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, flexShrink: 0,
                  }}>
                    {ALERT_TYPE_ICONS[alert.type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.text, fontWeight: 600, fontFamily: "var(--font-ar)" }}>
                      {alert.labelAr}
                    </div>
                    <div style={{ fontSize: 8, color: C.textMuted, fontFamily: "var(--font-mono)", marginTop: 1 }}>
                      {formatTime(alert.createdAt)} • {tc(ALERT_TYPE_LABELS[alert.type])}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggle(alert.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 3,
                        background: alert.active ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.1)',
                        border: 'none', color: alert.active ? C.success : C.danger,
                        fontSize: 8, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    >
                      {alert.active ? '●' : '○'}
                    </button>
                    <button
                      onClick={() => handleDelete(alert.id)}
                      style={{
                        width: 18, height: 18, borderRadius: 3,
                        background: 'rgba(255,71,87,0.08)', border: 'none',
                        color: C.textMuted, fontSize: 8, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = C.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; }}
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
            textAlign: 'center', color: C.textMuted, fontSize: 10,
            padding: '24px 0', fontFamily: "var(--font-ar)",
          }}>
            {tc('noAlerts')}
          </div>
        )}
      </div>
    </div>
  );
}
