'use client'

import { useEffect, type ReactNode } from 'react'
import { X as XIcon, Pin } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface SidebarDrawerProps {
  open: boolean
  onClose: () => void
  onPin?: () => void
  pinned?: boolean
  children: ReactNode
}

export function SidebarDrawer({
  open,
  onClose,
  onPin,
  pinned = false,
  children,
}: SidebarDrawerProps) {
  const ts = useTranslations('dashboard.sidebar')
  // Close on Escape key
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (open && !pinned) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open, pinned])

  if (!open && !pinned) return null

  return (
    <>
      {/* Backdrop overlay (only when not pinned) */}
      {!pinned && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 49,
            transition: 'opacity 0.3s ease',
            opacity: open ? 1 : 0,
          }}
        />
      )}

      {/* Drawer panel */}
      <div
        style={{
          position: pinned ? 'relative' : 'fixed',
          top: 0,
          insetInlineEnd: 0,
          bottom: 0,
          width: pinned ? '100%' : 380,
          maxWidth: pinned ? '100%' : '90vw',
          height: '100%',
          background: 'linear-gradient(180deg, #0B0E14, #1A1D29)',
          borderInlineStart: '1px solid rgba(0,212,255,0.15)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          direction: 'rtl',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: pinned
            ? 'none'
            : '-8px 0 32px rgba(0,0,0,0.4), -2px 0 8px rgba(0,212,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Drawer header controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(0,212,255,0.10)',
            background: 'rgba(255,255,255,0.02)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: '#00D4FF',
                boxShadow: '0 0 8px rgba(0,212,255,0.4)',
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#F0F2F5',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {ts('title')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Pin button */}
            {onPin && (
              <button
                type="button"
                onClick={onPin}
                title={pinned ? ts('unpin') : ts('pin')}
                style={{
                  background: pinned
                    ? 'rgba(0,212,255,0.15)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${pinned ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <Pin
                  size={12}
                  color={pinned ? '#00D4FF' : '#8B92A8'}
                  style={{
                    transform: pinned ? 'rotate(45deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
            )}

            {/* Close button */}
            {!pinned && (
              <button
                type="button"
                onClick={onClose}
                title={ts('closeBtn')}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <XIcon size={12} color="#8B92A8" />
              </button>
            )}
          </div>
        </div>

        {/* Drawer content */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}
