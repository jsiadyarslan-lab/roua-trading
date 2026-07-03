'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface PositionModalData {
  type: 'modify_sltp' | 'close' | 'reverse' | 'alert' | 'details' | 'copy_id'
  title: string
  positionData: {
    positionId: string
    symbol: string
    side: 'long' | 'short'
    entryPrice: number
    qty: number
    stopLoss?: number
    takeProfit?: number
    source: string
  }
  inputValue?: string
  inputValue2?: string
}

export function PositionModal({
  modal,
  setModal,
  onRefresh,
}: {
  modal: PositionModalData | null
  setModal: (m: PositionModalData | null) => void
  onRefresh?: () => void
}) {
  const modalRef = useRef<typeof modal>(null)
  useEffect(() => { modalRef.current = modal }, [modal])

  if (!modal || typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* Backdrop — transparent so chart stays visible */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'transparent',
      }}
        onClick={() => setModal(null)}
        onContextMenu={(e) => { e.preventDefault(); setModal(null); }}
      />
      {/* Side Panel — top-right, doesn't cover the chart */}
      <div style={{
        position: 'fixed',
        top: 80, right: 16, zIndex: 10001,
        width: 340, maxHeight: '70vh', overflowY: 'auto',
        background: 'rgba(15, 18, 28, 0.98)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(0,212,255,0.1)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        fontFamily: 'var(--font-ar)',
        animation: 'panelSlideIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: modal.positionData.side === 'long' ? '#00FFA3' : '#FF4757',
              padding: '2px 8px', borderRadius: 4,
              background: modal.positionData.side === 'long' ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
            }}>
              {modal.positionData.side === 'long' ? 'BUY' : 'SELL'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#E0ECF8', fontFamily: 'var(--font-mono)' }}>
              {modal.positionData.symbol}
            </span>
          </div>
          <button
            onClick={() => setModal(null)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#5A6A80', fontSize: 16, lineHeight: 1, padding: '2px 6px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4757'; e.currentTarget.style.background = 'rgba(255,71,87,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#5A6A80'; e.currentTarget.style.background = 'transparent'; }}
          >
            ✕
          </button>
        </div>

        {/* Title */}
        <div style={{ padding: '10px 18px 4px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#00D4FF' }}>
            {modal.title}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '8px 18px 16px' }}>

          {/* Modify SL/TP */}
          {modal.type === 'modify_sltp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8B92A8', display: 'block', marginBottom: 4 }}>
                  وقف الخسارة (SL)
                </label>
                <input
                  type="number"
                  step="any"
                  value={modal.inputValue || ''}
                  onChange={(e) => setModal({ ...modal, inputValue: e.target.value })}
                  placeholder="أدخل سعر SL"
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: 'rgba(255,71,87,0.06)',
                    border: '1px solid rgba(255,71,87,0.25)',
                    borderRadius: 8, color: '#E0ECF8',
                    fontSize: 14, fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8B92A8', display: 'block', marginBottom: 4 }}>
                  أخذ الربح (TP)
                </label>
                <input
                  type="number"
                  step="any"
                  value={modal.inputValue2 || ''}
                  onChange={(e) => setModal({ ...modal, inputValue2: e.target.value })}
                  placeholder="أدخل سعر TP"
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: 'rgba(0,255,163,0.06)',
                    border: '1px solid rgba(0,255,163,0.25)',
                    borderRadius: 8, color: '#E0ECF8',
                    fontSize: 14, fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setModal(null)} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#8B92A8',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>إلغاء</button>
                <button onClick={async () => {
                  const m = modalRef.current;
                  if (!m) return;
                  const body: any = {};
                  if (m.inputValue && m.inputValue.trim()) body.stopLoss = parseFloat(m.inputValue);
                  if (m.inputValue2 && m.inputValue2.trim()) body.takeProfit = parseFloat(m.inputValue2);
                  if (Object.keys(body).length > 0) {
                    try {
                      await fetch(`/api/trading/positions/${m.positionData.positionId}/levels`, {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      });
                      onRefresh?.();
                    } catch (err) { console.error('Modify SL/TP failed:', err); }
                  }
                  setModal(null);
                }} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(0,212,255,0.12)',
                  border: '1px solid rgba(0,212,255,0.4)',
                  borderRadius: 8, color: '#00D4FF',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>حفظ</button>
              </div>
            </div>
          )}

          {/* Close */}
          {modal.type === 'close' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,71,87,0.08)',
                border: '1px solid rgba(255,71,87,0.2)',
                fontSize: 12, color: '#C8D4E4', lineHeight: 1.6,
              }}>
                هل أنت متأكد من إغلاق صفقة <strong style={{ color: '#E0ECF8' }}>{modal.positionData.symbol}</strong>؟
                <br />
                <span style={{ fontSize: 10, color: '#5A6A80' }}>
                  الحجم: {modal.positionData.qty} @ {modal.positionData.entryPrice.toFixed(modal.positionData.entryPrice > 100 ? 2 : 5)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModal(null)} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#8B92A8',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>إلغاء</button>
                <button onClick={async () => {
                  const m = modalRef.current;
                  if (!m) return;
                  try {
                    await fetch(`/api/trading/positions/${m.positionData.positionId}/close`, {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ closeReason: 'MANUAL' }),
                    });
                    onRefresh?.();
                  } catch (err) { console.error('Close failed:', err); }
                  setModal(null);
                }} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(255,71,87,0.15)',
                  border: '1px solid rgba(255,71,87,0.4)',
                  borderRadius: 8, color: '#FF4757',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>تأكيد الإغلاق</button>
              </div>
            </div>
          )}

          {/* Reverse */}
          {modal.type === 'reverse' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,184,0,0.08)',
                border: '1px solid rgba(255,184,0,0.2)',
                fontSize: 12, color: '#C8D4E4', lineHeight: 1.6,
              }}>
                تأكيد عكس صفقة <strong style={{ color: '#E0ECF8' }}>{modal.positionData.symbol}</strong>؟
                <br />
                <span style={{ fontSize: 10, color: '#5A6A80' }}>
                  سيُغلق المركز الحالي ويُفتح مركز عكسي بنفس الحجم.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModal(null)} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#8B92A8',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>إلغاء</button>
                <button onClick={async () => {
                  const m = modalRef.current;
                  if (!m) return;
                  try {
                    await fetch(`/api/trading/positions/${m.positionData.positionId}/close`, {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ closeReason: 'REVERSE' }),
                    });
                    const reverseSide = m.positionData.side === 'long' ? 'SELL' : 'BUY';
                    await fetch('/api/trading/orders', {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        symbol: m.positionData.symbol, side: reverseSide, type: 'MARKET',
                        quantity: m.positionData.qty, source: 'user_manual',
                      }),
                    });
                    onRefresh?.();
                  } catch (err) { console.error('Reverse failed:', err); }
                  setModal(null);
                }} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(255,184,0,0.15)',
                  border: '1px solid rgba(255,184,0,0.4)',
                  borderRadius: 8, color: '#FFB800',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>تأكيد العكس</button>
              </div>
            </div>
          )}

          {/* Alert */}
          {modal.type === 'alert' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8B92A8', display: 'block', marginBottom: 4 }}>
                  سعر التنبيه
                </label>
                <input
                  type="number"
                  step="any"
                  value={modal.inputValue || ''}
                  onChange={(e) => setModal({ ...modal, inputValue: e.target.value })}
                  placeholder="أدخل السعر"
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: 'rgba(179,136,255,0.06)',
                    border: '1px solid rgba(179,136,255,0.25)',
                    borderRadius: 8, color: '#E0ECF8',
                    fontSize: 14, fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModal(null)} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: '#8B92A8',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>إلغاء</button>
                <button onClick={async () => {
                  const m = modalRef.current;
                  if (!m || !m.inputValue) return;
                  try {
                    await fetch('/api/price-alerts', {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        symbol: m.positionData.symbol, price: parseFloat(m.inputValue),
                        condition: 'above',
                      }),
                    });
                  } catch (err) { console.error('Alert failed:', err); }
                  setModal(null);
                }} style={{
                  flex: 1, padding: '8px',
                  background: 'rgba(179,136,255,0.15)',
                  border: '1px solid rgba(179,136,255,0.4)',
                  borderRadius: 8, color: '#B388FF',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-ar)',
                }}>إنشاء التنبيه</button>
              </div>
            </div>
          )}

          {/* Details */}
          {modal.type === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'الزوج', value: modal.positionData.symbol, color: '#E0ECF8' },
                { label: 'الاتجاه', value: modal.positionData.side === 'long' ? 'شراء ▲' : 'بيع ▼', color: modal.positionData.side === 'long' ? '#00FFA3' : '#FF4757' },
                { label: 'سعر الدخول', value: modal.positionData.entryPrice.toString(), color: '#E0ECF8' },
                { label: 'الحجم', value: modal.positionData.qty.toString(), color: '#E0ECF8' },
                { label: 'وقف الخسارة', value: modal.positionData.stopLoss?.toString() || '—', color: '#FF4757' },
                { label: 'أخذ الربح', value: modal.positionData.takeProfit?.toString() || '—', color: '#00FFA3' },
                { label: 'المصدر', value: modal.positionData.source || '—', color: '#8B92A8' },
                { label: 'المعرف', value: modal.positionData.positionId, color: '#5A6A80', mono: true },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <span style={{ fontSize: 11, color: '#5A6A80' }}>{row.label}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: row.color,
                    fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-ar)',
                    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {row.value}
                  </span>
                </div>
              ))}
              <button onClick={() => setModal(null)} style={{
                marginTop: 8, padding: '8px',
                background: 'rgba(0,212,255,0.12)',
                border: '1px solid rgba(0,212,255,0.4)',
                borderRadius: 8, color: '#00D4FF',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font-ar)',
              }}>إغلاق</button>
            </div>
          )}

        </div>
      </div>
      <style>{`
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
    , document.body
  )
}
