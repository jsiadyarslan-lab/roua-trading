'use client'

/**
 * AssistantWidget — V464
 *
 * Floating assistant button + chat window for Roua Trading.
 *
 * Features:
 * - Floating button (bottom-right for LTR, bottom-left for RTL)
 * - Chat window with conversation history
 * - SSE streaming (chunks appear progressively)
 * - Typing indicator while streaming
 * - Quick suggestions per language
 * - Clear conversation button
 * - Language-aware RTL/LTR layout
 * - Warnings display
 * - Cache indicator (cached responses show badge)
 * - Responsive (mobile-friendly)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAssistant, type AssistantMessage } from '@/hooks/useAssistant'

export function AssistantWidget() {
  const t = useTranslations('assistant')
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Handle Enter to send (Shift+Enter for newline)
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
      if (!isStreaming) {
        sendMessage(suggestion)
      }
    },
    [isStreaming, sendMessage],
  )

  // Don't render on server
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? t('close') : t('open')}
        style={{
          position: 'fixed',
          bottom: '24px',
          // LTR: bottom-right, RTL: bottom-left
          [isRtl ? 'left' : 'right']: '24px',
          zIndex: 9999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: isOpen ? '#1a1f2e' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          border: '1px solid #05966940',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          boxShadow: isOpen ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 16px #0596694d',
          transition: 'all 0.2s ease',
          transform: isOpen ? 'rotate(0deg)' : 'none',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1.08)'
            e.currentTarget.style.boxShadow = '0 6px 24px #05966966'
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 16px #0596694d'
          }
        }}
      >
        {isOpen ? '✕' : '🤖'}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '92px',
            [isRtl ? 'left' : 'right']: '24px',
            zIndex: 9999,
            width: 'min(420px, calc(100vw - 32px))',
            height: 'min(640px, calc(100vh - 140px))',
            background: '#0B0E14',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'inherit',
            direction: isRtl ? 'rtl' : 'ltr',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                🤖
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{t('title')}</div>
                <div style={{ fontSize: '11px', opacity: 0.85 }}>
                  {t('subtitle')} • {language.toUpperCase()}
                </div>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                aria-label={t('clear')}
                title={t('clear')}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                {t('clear')}
              </button>
            )}
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              background: '#0B0E14',
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: '#6b7280',
                  padding: '40px 20px',
                  fontSize: '14px',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>👋</div>
                <div style={{ marginBottom: '20px', color: '#9ca3af' }}>{t('welcome')}</div>
                <div style={{ fontSize: '12px', marginBottom: '12px', color: '#6b7280' }}>
                  {t('suggestions_label')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestion(s)}
                      style={{
                        background: '#111827',
                        border: '1px solid #1f2937',
                        color: '#d1d5db',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        textAlign: isRtl ? 'right' : 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#1f2937'
                        e.currentTarget.style.borderColor = '#059669'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#111827'
                        e.currentTarget.style.borderColor = '#1f2937'
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} isRtl={isRtl} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '8px 16px',
                background: '#7f1d1d',
                color: '#fecaca',
                fontSize: '12px',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Input */}
          <div
            style={{
              padding: '12px',
              background: '#111827',
              borderTop: '1px solid #1f2937',
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
              style={{
                flex: 1,
                background: '#0B0E14',
                border: '1px solid #1f2937',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#e5e7eb',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
                maxHeight: '120px',
                minHeight: '40px',
                opacity: isStreaming ? 0.6 : 1,
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isStreaming}
              aria-label={t('send')}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: input.trim() && !isStreaming ? '#059669' : '#1f2937',
                border: 'none',
                color: '#ffffff',
                cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
              }}
            >
              {isStreaming ? '⏳' : isRtl ? '←' : '→'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Message Bubble ──────────────────────────────────────────

function MessageBubble({ message, isRtl }: { message: AssistantMessage; isRtl: boolean }) {
  const isUser = message.role === 'user'
  const hasWarnings = message.warnings && message.warnings.length > 0

  return (
    <div
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
          borderRadius: isUser ? (isRtl ? '16px 4px 16px 16px' : '4px 16px 16px 16px') : '16px',
          background: isUser
            ? '#059669'
            : message.error
            ? '#1f1010'
            : '#111827',
          color: isUser ? '#ffffff' : message.error ? '#fecaca' : '#e5e7eb',
          fontSize: '14px',
          lineHeight: 1.5,
          border: !isUser && !message.error ? '1px solid #1f2937' : 'none',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {/* Content */}
        <div>{message.content || (message.isStreaming ? '...' : '')}</div>

        {/* Typing indicator */}
        {message.isStreaming && !message.content && (
          <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
            <span className="dot" style={dotStyle}>•</span>
            <span className="dot" style={{ ...dotStyle, animationDelay: '0.2s' }}>•</span>
            <span className="dot" style={{ ...dotStyle, animationDelay: '0.4s' }}>•</span>
          </div>
        )}

        {/* Metadata footer */}
        {!isUser && !message.isStreaming && message.content && (
          <div
            style={{
              marginTop: '6px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              fontSize: '10px',
              opacity: 0.6,
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {message.model && <span>🤖 {message.model}</span>}
            {message.cached && <span>💾 cached</span>}
            {message.processingTimeMs && <span>⏱️ {message.processingTimeMs}ms</span>}
            {message.languageTier && <span>🌐 {message.languageTier}</span>}
            {message.functionsCalled && message.functionsCalled.length > 0 && (
              <span>🔧 {message.functionsCalled.length}</span>
            )}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div
            style={{
              marginTop: '8px',
              padding: '6px 10px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#fcd34d',
            }}
          >
            {message.warnings!.map((w, i) => (
              <div key={i}>⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const dotStyle: React.CSSProperties = {
  animation: 'assistant-blink 1.4s infinite',
  fontSize: '20px',
  lineHeight: 1,
}

// Inject keyframes (only once)
if (typeof document !== 'undefined') {
  const styleId = 'assistant-widget-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes assistant-blink {
        0%, 60%, 100% { opacity: 0.3; }
        30% { opacity: 1; }
      }
    `
    document.head.appendChild(style)
  }
}
