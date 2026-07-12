'use client'

/**
 * AssistantWidget — Premium V2
 *
 * Redesigned floating assistant widget for Roua Trading.
 *
 * Design language:
 *  - Dark glassmorphism (backdrop-blur + semi-transparent surfaces)
 *  - Emerald accent (#059669) with subtle gradient + glow
 *  - Animated SVG icons (no emojis)
 *  - Polished micro-interactions (hover scale, focus ring, slide-in)
 *  - Full RTL + mobile support, keyboard accessible
 *
 * Hook API unchanged: see /hooks/useAssistant.ts
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAssistant, type AssistantMessage } from '@/hooks/useAssistant'

// ─── SVG Icons ──────────────────────────────────────────────

type IconProps = { size?: number; className?: string }

function SparklesIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2.5l1.95 4.85L19 9.5l-5.05 2.15L12 16.5l-1.95-4.85L5 9.5l5.05-2.15L12 2.5z"
        fill="currentColor"
      />
      <path
        d="M19 13.5l.95 2.4L22 16.5l-2.05.95L19 20l-.95-2.55L16 16.5l2.05-.6L19 13.5z"
        fill="currentColor"
        opacity="0.65"
      />
      <path
        d="M5 13l.8 1.95L8 16l-2.2 1.05L5 19l-.85-1.95L2 16l2.15-1.05L5 13z"
        fill="currentColor"
        opacity="0.45"
      />
    </svg>
  )
}

function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SendIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.4 11.6l16-7.2c.8-.36 1.6.46 1.22 1.24l-7.2 16c-.36.8-1.5.66-1.66-.2l-1.3-5.5-5.5-1.3c-.86-.16-1-1.3-.2-1.66z"
        fill="currentColor"
      />
    </svg>
  )
}

function TrashIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function WarningIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 3.5l9.5 16.5h-19L12 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12 9v5M12 17h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ErrorIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SpinnerIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`asst-spinner ${className ?? ''}`.trim()}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.22" fill="none" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

// ─── Theme tokens ───────────────────────────────────────────

const COLORS = {
  bg: '#0B0E14',
  surface: 'rgba(15, 22, 36, 0.72)',
  surfaceSolid: 'rgba(11, 14, 20, 0.6)',
  accent: '#059669',
  accentDark: '#047857',
  online: '#10b981',
  warning: '#FFB800',
  error: '#ef4444',
  textPrimary: '#E5E7EB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  border: 'rgba(5, 150, 105, 0.18)',
  borderHover: 'rgba(5, 150, 105, 0.45)',
} as const

// ─── CSS keyframes + class styles ───────────────────────────

const ASSISTANT_CSS = `
@keyframes asst-glow-pulse {
  0%, 100% {
    box-shadow:
      0 4px 16px rgba(5, 150, 105, 0.35),
      0 0 0 0 rgba(5, 150, 105, 0.5);
  }
  50% {
    box-shadow:
      0 6px 28px rgba(5, 150, 105, 0.55),
      0 0 0 10px rgba(5, 150, 105, 0);
  }
}
@keyframes asst-gradient-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes asst-slide-in {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes asst-msg-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes asst-typing-wave {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.32; }
  30%           { transform: translateY(-4px); opacity: 1; }
}
@keyframes asst-progress {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(280%); }
}
@keyframes asst-spinner-rot {
  to { transform: rotate(360deg); }
}
@keyframes asst-online-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
  50%      { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0); }
}
@keyframes asst-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes asst-notify-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.18); }
}
@keyframes asst-cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.asst-fab {
  background: linear-gradient(135deg, ${'#059669'} 0%, #047857 45%, ${'#059669'} 100%);
  background-size: 220% 220%;
  animation: asst-glow-pulse 2.6s ease-in-out infinite, asst-gradient-shift 8s ease infinite;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.25s ease,
              background 0.3s ease,
              border-color 0.3s ease;
  will-change: transform;
}
.asst-fab:hover { transform: scale(1.08) rotate(-4deg); }
.asst-fab:active { transform: scale(0.95); }
.asst-fab[data-open="true"] {
  background: rgba(20, 28, 44, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  animation: none;
  border-color: rgba(5, 150, 105, 0.4);
  box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
}
.asst-fab[data-open="true"]:hover { transform: scale(1.05) rotate(0deg); }

.asst-fab-icon-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
}
.asst-fab[data-open="true"]  .asst-fab-icon-spark { opacity: 0; transform: rotate(90deg) scale(0.55); }
.asst-fab[data-open="false"] .asst-fab-icon-close { opacity: 0; transform: rotate(-90deg) scale(0.55); }

.asst-window {
  animation: asst-slide-in 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}
.asst-window[data-rtl="true"] { transform-origin: bottom left; }

.asst-msg { animation: asst-msg-in 0.3s ease both; }

.asst-typing-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: asst-typing-wave 1.2s ease-in-out infinite;
}

.asst-progress-track { position: relative; overflow: hidden; }
.asst-progress-bar {
  position: absolute;
  top: 0; bottom: 0;
  left: 0;
  width: 35%;
  background: linear-gradient(90deg, transparent, rgba(5, 150, 105, 0.9), transparent);
  animation: asst-progress 1.5s ease-in-out infinite;
}

.asst-spinner { animation: asst-spinner-rot 0.9s linear infinite; transform-origin: 50% 50%; }

.asst-online-dot { animation: asst-online-pulse 2s ease-in-out infinite; }
.asst-notify-dot { animation: asst-notify-pulse 1.6s ease-in-out infinite; }
.asst-cursor     { animation: asst-cursor-blink 1s steps(1) infinite; }

.asst-suggestion {
  transition: transform 0.18s ease, background 0.18s ease,
              border-color 0.18s ease, box-shadow 0.18s ease;
}
.asst-suggestion:hover {
  transform: translateY(-1px);
  background: rgba(5, 150, 105, 0.10) !important;
  border-color: rgba(5, 150, 105, 0.45) !important;
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.18);
}
.asst-suggestion:active { transform: translateY(0); }

.asst-input {
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.asst-input:focus {
  border-color: rgba(5, 150, 105, 0.55) !important;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15) !important;
  background: rgba(15, 22, 36, 0.92) !important;
}

.asst-send {
  transition: transform 0.18s ease, box-shadow 0.18s ease,
              background 0.18s ease, opacity 0.18s ease;
}
.asst-send:not(:disabled):hover {
  transform: scale(1.08);
  box-shadow: 0 6px 18px rgba(5, 150, 105, 0.5);
}
.asst-send:not(:disabled):active { transform: scale(0.94); }
.asst-send:disabled { opacity: 0.4; cursor: not-allowed; }

.asst-clear-btn {
  transition: background 0.18s ease, transform 0.18s ease, color 0.18s ease;
}
.asst-clear-btn:hover {
  background: rgba(239, 68, 68, 0.15) !important;
  color: '#FCA5A5' !important;
  transform: scale(1.05);
}

.asst-ghost-btn {
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.asst-ghost-btn:hover {
  background: rgba(255,255,255,0.1) !important;
  color: '#E5E7EB' !important;
}
.asst-ghost-btn:active { transform: scale(0.94); }

.asst-scroll::-webkit-scrollbar { width: 6px; }
.asst-scroll::-webkit-scrollbar-track { background: transparent; }
.asst-scroll::-webkit-scrollbar-thumb {
  background: rgba(5, 150, 105, 0.25);
  border-radius: 3px;
}
.asst-scroll::-webkit-scrollbar-thumb:hover { background: rgba(5, 150, 105, 0.45); }

@media (max-width: 480px) {
  .asst-window-mobile {
    width: calc(100vw - 16px) !important;
    height: calc(100vh - 96px) !important;
    bottom: 84px !important;
    border-radius: 18px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .asst-fab,
  .asst-window,
  .asst-msg,
  .asst-typing-dot,
  .asst-progress-bar,
  .asst-spinner,
  .asst-online-dot,
  .asst-notify-dot,
  .asst-cursor {
    animation: none !important;
  }
}
`

if (typeof document !== 'undefined') {
  const STYLE_ID = 'asst-widget-premium-styles'
  if (!document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    styleEl.textContent = ASSISTANT_CSS
    document.head.appendChild(styleEl)
  }
}

// ─── Main Component ─────────────────────────────────────────

export function AssistantWidget() {
  const t = useTranslations('assistant')
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearConversation,
    suggestions,
    language,
    isRtl,
  } = useAssistant({
    onError: (err) => console.error('[Assistant]', err),
  })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(id)
    }
  }, [isOpen])

  // ESC to close + return focus to FAB
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        fabRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (input.trim() && !isStreaming) {
          sendMessage(input)
          setInput('')
        }
      }
    },
    [input, isStreaming, sendMessage],
  )

  const handleSubmit = useCallback(() => {
    if (input.trim() && !isStreaming) {
      sendMessage(input)
      setInput('')
    }
  }, [input, isStreaming, sendMessage])

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      if (!isStreaming) sendMessage(suggestion)
    },
    [isStreaming, sendMessage],
  )

  // Notification dot: show when error or last assistant message has warnings
  const lastMsg = messages[messages.length - 1]
  const hasNotification = Boolean(
    error ||
      (lastMsg &&
        lastMsg.role === 'assistant' &&
        lastMsg.warnings &&
        lastMsg.warnings.length > 0 &&
        !lastMsg.isStreaming),
  )

  // SSR safety
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const sideStyle: React.CSSProperties = isRtl ? { left: '24px' } : { right: '24px' }
  const onlineCornerStyle: React.CSSProperties = isRtl
    ? { top: '4px', left: '4px' }
    : { top: '4px', right: '4px' }
  const notifyCornerStyle: React.CSSProperties = isRtl
    ? { top: '6px', right: '6px' }
    : { top: '6px', left: '6px' }
  const avatarOnlineCorner: React.CSSProperties = isRtl
    ? { bottom: '-1px', left: '-1px' }
    : { bottom: '-1px', right: '-1px' }

  return (
    <>
      {/* ─── Floating Action Button ─────────────────────────── */}
      <button
        ref={fabRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? t('close') : t('open')}
        aria-expanded={isOpen}
        data-open={isOpen ? 'true' : 'false'}
        className="asst-fab"
        style={{
          position: 'fixed',
          bottom: '24px',
          ...sideStyle,
          zIndex: 9999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: '1px solid rgba(5, 150, 105, 0.35)',
          color: '#F0F2F5',
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
        }}
      >
        {/* Online indicator (green) */}
        <span
          aria-hidden="true"
          className="asst-online-dot"
          style={{
            position: 'absolute',
            ...onlineCornerStyle,
            width: '11px',
            height: '11px',
            borderRadius: '50%',
            background: COLORS.online,
            border: '2px solid #0B0E14',
            zIndex: 2,
          }}
        />

        {/* Notification dot (red, only when needed + closed) */}
        {hasNotification && !isOpen && (
          <span
            aria-hidden="true"
            className="asst-notify-dot"
            style={{
              position: 'absolute',
              ...notifyCornerStyle,
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: COLORS.error,
              border: '2px solid #0B0E14',
              zIndex: 2,
            }}
          />
        )}

        {/* Sparkles icon (closed state) */}
        <span className="asst-fab-icon-wrap asst-fab-icon-spark">
          <SparklesIcon size={24} />
        </span>

        {/* Close icon (open state) */}
        <span className="asst-fab-icon-wrap asst-fab-icon-close">
          <CloseIcon size={22} />
        </span>
      </button>

      {/* ─── Chat Window ────────────────────────────────────── */}
      {isOpen && (
        <div
          className="asst-window asst-window-mobile"
          data-rtl={isRtl ? 'true' : 'false'}
          role="dialog"
          aria-modal="false"
          aria-label={t('title')}
          style={{
            position: 'fixed',
            bottom: '92px',
            ...sideStyle,
            zIndex: 9999,
            width: 'min(420px, calc(100vw - 32px))',
            height: 'min(640px, calc(100vh - 140px))',
            background: COLORS.surface,
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: `1px solid ${COLORS.border}`,
            borderRadius: '20px',
            boxShadow:
              '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(5, 150, 105, 0.06), 0 0 48px rgba(5, 150, 105, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'inherit',
            direction: isRtl ? 'rtl' : 'ltr',
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              position: 'relative',
              padding: '14px 14px 14px 16px',
              background:
                'linear-gradient(135deg, rgba(5, 150, 105, 0.18) 0%, rgba(4, 120, 87, 0.06) 100%)',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              {/* Avatar */}
              <div
                style={{
                  position: 'relative',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  boxShadow:
                    '0 4px 12px rgba(5, 150, 105, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                  flexShrink: 0,
                }}
              >
                <SparklesIcon size={20} />
                {/* Online dot on avatar */}
                <span
                  className="asst-online-dot"
                  style={{
                    position: 'absolute',
                    ...avatarOnlineCorner,
                    width: '11px',
                    height: '11px',
                    borderRadius: '50%',
                    background: COLORS.online,
                    border: '2px solid #0B0E14',
                  }}
                />
              </div>

              {/* Title + status */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: COLORS.textPrimary,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t('title')}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: COLORS.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '2px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: COLORS.online,
                      boxShadow: '0 0 6px rgba(16, 185, 129, 0.7)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t('subtitle')}
                  </span>
                  <span style={{ opacity: 0.4 }}>•</span>
                  <span
                    style={{
                      opacity: 0.7,
                      textTransform: 'uppercase',
                      fontSize: '10px',
                      letterSpacing: '0.5px',
                      fontWeight: 600,
                    }}
                  >
                    {language}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {messages.length > 0 && (
                <button
                  onClick={clearConversation}
                  className="asst-clear-btn"
                  aria-label={t('clear')}
                  title={t('clear')}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: COLORS.textSecondary,
                    cursor: 'pointer',
                    padding: '7px',
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false)
                  fabRef.current?.focus()
                }}
                className="asst-ghost-btn"
                aria-label={t('close')}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: COLORS.textSecondary,
                  cursor: 'pointer',
                  padding: '7px',
                  borderRadius: '9px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Streaming progress bar */}
            {isStreaming && (
              <div
                className="asst-progress-track"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'rgba(5, 150, 105, 0.1)',
                }}
              >
                <div className="asst-progress-bar" />
              </div>
            )}
          </div>

          {/* ── Messages ── */}
          <div
            className="asst-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: 'transparent',
            }}
          >
            {messages.length === 0 ? (
              <WelcomeView
                welcome={t('welcome')}
                suggestionsLabel={t('suggestions_label')}
                suggestions={suggestions}
                onSuggestion={handleSuggestion}
                isRtl={isRtl}
              />
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} isRtl={isRtl} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Error ── */}
          {error && (
            <div
              role="alert"
              style={{
                margin: '0 12px 8px',
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                color: '#FCA5A5',
                fontSize: '12px',
                animation: 'asst-fade-in 0.25s ease',
              }}
            >
              <span style={{ flexShrink: 0, marginTop: '1px' }}>
                <ErrorIcon size={14} />
              </span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{error}</span>
            </div>
          )}

          {/* ── Input ── */}
          <div
            style={{
              padding: '12px',
              borderTop: `1px solid ${COLORS.border}`,
              background: COLORS.surfaceSolid,
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-end',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('input_placeholder')}
              rows={1}
              disabled={isStreaming}
              className="asst-input"
              aria-label={t('input_placeholder')}
              style={{
                flex: 1,
                background: 'rgba(15, 22, 36, 0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '10px 14px',
                color: COLORS.textPrimary,
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
                maxHeight: '120px',
                minHeight: '42px',
                opacity: isStreaming ? 0.7 : 1,
                lineHeight: 1.5,
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isStreaming}
              aria-label={t('send')}
              className="asst-send"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background:
                  input.trim() && !isStreaming
                    ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                    : 'rgba(255,255,255,0.05)',
                border: 'none',
                color: '#F0F2F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow:
                  input.trim() && !isStreaming ? '0 4px 12px rgba(5, 150, 105, 0.35)' : 'none',
              }}
            >
              {isStreaming ? (
                <SpinnerIcon size={16} />
              ) : (
                <span
                  style={{
                    transform: isRtl ? 'scaleX(-1)' : 'none',
                    display: 'flex',
                  }}
                >
                  <SendIcon size={18} />
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Welcome View ───────────────────────────────────────────

function WelcomeView({
  welcome,
  suggestionsLabel,
  suggestions,
  onSuggestion,
  isRtl,
}: {
  welcome: string
  suggestionsLabel: string
  suggestions: string[]
  onSuggestion: (s: string) => void
  isRtl: boolean
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '28px 8px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        animation: 'asst-fade-in 0.4s ease',
      }}
    >
      {/* Decorative orb */}
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background:
            'linear-gradient(135deg, rgba(5, 150, 105, 0.25), rgba(4, 120, 87, 0.08))',
          border: '1px solid rgba(5, 150, 105, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.online,
          marginBottom: '16px',
          boxShadow:
            '0 8px 24px rgba(5, 150, 105, 0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <SparklesIcon size={28} />
      </div>
      <div
        style={{
          color: COLORS.textPrimary,
          fontSize: '15px',
          fontWeight: 500,
          marginBottom: '4px',
          lineHeight: 1.4,
        }}
      >
        {welcome}
      </div>
      <div
        style={{
          fontSize: '11px',
          marginBottom: '20px',
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          fontWeight: 600,
        }}
      >
        {suggestionsLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s)}
            className="asst-suggestion"
            style={{
              background: 'rgba(15, 22, 36, 0.6)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: COLORS.textPrimary,
              padding: '10px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '13px',
              textAlign: isRtl ? 'right' : 'left',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: 0,
              animation: `asst-msg-in 0.4s ease ${0.1 + i * 0.06}s forwards`,
            }}
          >
            <span
              style={{
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: COLORS.accent,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{s}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Message Bubble ─────────────────────────────────────────

function MessageBubble({
  message,
  isRtl,
}: {
  message: AssistantMessage
  isRtl: boolean
}) {
  const isUser = message.role === 'user'
  const hasWarnings = !!(message.warnings && message.warnings.length > 0)
  const showTyping = message.isStreaming && !message.content
  const showFooter =
    !isUser && !message.isStreaming && !!message.content && !message.error

  return (
    <div
      className="asst-msg"
      style={{
        display: 'flex',
        justifyContent: isUser ? (isRtl ? 'flex-start' : 'flex-end') : 'flex-start',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: isUser
            ? isRtl
              ? '14px 4px 14px 14px'
              : '4px 14px 14px 14px'
            : '14px',
          background: isUser
            ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
            : message.error
            ? 'rgba(239, 68, 68, 0.08)'
            : 'rgba(15, 22, 36, 0.7)',
          color: isUser ? '#F0F2F5' : message.error ? '#FCA5A5' : COLORS.textPrimary,
          fontSize: '14px',
          lineHeight: 1.55,
          border: !isUser
            ? message.error
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : '1px solid rgba(5, 150, 105, 0.18)'
            : '1px solid rgba(5, 150, 105, 0.3)',
          boxShadow: isUser
            ? '0 4px 12px rgba(5, 150, 105, 0.25)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          backdropFilter: !isUser ? 'blur(8px)' : 'none',
          WebkitBackdropFilter: !isUser ? 'blur(8px)' : 'none',
        }}
      >
        {/* Content */}
        {message.content ? <div>{message.content}</div> : showTyping ? <TypingDots /> : null}

        {/* Streaming cursor while content is arriving */}
        {message.isStreaming && message.content && (
          <span
            className="asst-cursor"
            style={{
              display: 'inline-block',
              width: '7px',
              height: '14px',
              background: COLORS.accent,
              marginLeft: '2px',
              verticalAlign: 'text-bottom',
              borderRadius: '1px',
            }}
          />
        )}

        {/* Metadata footer */}
        {showFooter && (
          <div
            style={{
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: '10px',
              color: COLORS.textMuted,
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {message.model && (
              <Chip>
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: COLORS.accent,
                  }}
                />
                {message.model}
              </Chip>
            )}
            {message.cached && (
              <Chip
                style={{
                  color: COLORS.online,
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  background: 'rgba(16, 185, 129, 0.08)',
                }}
              >
                cached
              </Chip>
            )}
            {message.processingTimeMs != null && <Chip>{message.processingTimeMs}ms</Chip>}
            {message.languageTier && (
              <Chip
                style={{
                  color: '#FFB800',
                  borderColor: 'rgba(251, 191, 36, 0.3)',
                  background: 'rgba(251, 191, 36, 0.06)',
                }}
              >
                tier {message.languageTier}
              </Chip>
            )}
            {message.functionsCalled && message.functionsCalled.length > 0 && (
              <Chip>{message.functionsCalled.length} fn</Chip>
            )}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#FCD34D',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {message.warnings!.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ flexShrink: 0, marginTop: '1px' }}>
                  <WarningIcon size={12} />
                </span>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chip ───────────────────────────────────────────────────

function Chip({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        fontSize: '10px',
        lineHeight: 1.4,
        letterSpacing: '0.2px',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ─── Typing Dots ────────────────────────────────────────────

function TypingDots() {
  return (
    <div
      style={{
        display: 'flex',
        gap: '5px',
        padding: '4px 0',
        alignItems: 'center',
        color: COLORS.accent,
      }}
    >
      <span className="asst-typing-dot" style={{ animationDelay: '0s' }} />
      <span className="asst-typing-dot" style={{ animationDelay: '0.18s' }} />
      <span className="asst-typing-dot" style={{ animationDelay: '0.36s' }} />
    </div>
  )
}
