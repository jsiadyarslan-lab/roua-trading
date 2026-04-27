'use client'

import { useEffect, useRef } from 'react'
import { X, Wallet } from 'lucide-react'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { getDataStatus, getSourceLabel } from '@/lib/dashboard-live'

interface WalletDrawerProps {
  open: boolean
  onClose: () => void
}

export function WalletDrawer({ open, onClose }: WalletDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const selectedSymbol = useSymbolStore(s => s.selectedSymbol)
  const quotes = useMarketStore(s => s.quotes)
  const activeQuote = selectedSymbol ? quotes[selectedSymbol] : null
  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="wallet-drawer-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="wallet-drawer-panel"
        role="dialog"
        aria-label="محفظة التداول"
        aria-modal="true"
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(0,212,255,0.12)',
          background: 'linear-gradient(90deg, rgba(0,212,255,0.08), rgba(10,132,255,0.04))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #00D4FF20, #0A84FF15)',
              border: '1px solid rgba(0,212,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={16} color="#00D4FF" />
            </div>
            <div>
              <div style={{
                fontFamily: "'Cairo', sans-serif",
                fontSize: 14, fontWeight: 800, color: '#F0F2F5',
              }}>
                المحفظة
              </div>
              <div style={{
                fontFamily: "'Cairo', sans-serif",
                fontSize: 10, color: '#8B92A8',
              }}>
                الرصيد والمراكز والإجراءات
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق المحفظة"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: '#8B92A8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,75,87,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,75,87,0.3)'; e.currentTarget.style.color = '#FF4757' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#8B92A8' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: 12,
        }} className="custom-scrollbar">
          <div style={{
            borderRadius: 14, overflow: 'hidden',
            border: '1px solid rgba(0,212,255,0.10)',
            background: '#08090F',
          }}>
            <PortfolioMini
              mobile
              dataStatus={quoteStatus}
              lastUpdatedAt={activeQuote?.timestamp ?? null}
              sourceLabel={sourceLabel}
              selectedSymbol={selectedSymbol}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(0,212,255,0.10)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{
            fontSize: 9, color: '#6F849C',
            fontFamily: "'Cairo', sans-serif",
            textAlign: 'center',
          }}>
            اسحب لليسار أو اضغط Escape للإغلاق
          </div>
        </div>
      </div>
    </>
  )
}
