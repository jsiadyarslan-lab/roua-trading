'use client'

/**
 * useAssistant — Hook for the Roua Trading Assistant
 *
 * V464: Manages chat state, SSE streaming, conversation history, and
 * language/locale awareness.
 *
 * Features:
 * - Send messages via SSE streaming (chunks appear progressively)
 * - Fallback to regular POST /chat if SSE fails
 * - Conversation history (kept in memory, not persisted)
 * - RTL/LTR awareness based on language
 * - Suggestions (quick prompts) per language
 * - Auto-detect user's locale from next-intl
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocale } from 'next-intl'

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  // metadata from assistant response
  languageTier?: 'A' | 'B' | 'C'
  rtl?: boolean
  cached?: boolean
  model?: string
  functionsCalled?: string[]
  processingTimeMs?: number
  warnings?: string[]
  isStreaming?: boolean
  error?: boolean
}

export interface AssistantResponse {
  reply: string
  language: string
  languageTier: 'A' | 'B' | 'C'
  rtl: boolean
  contextUsed: boolean
  functionsCalled: string[]
  processingTimeMs: number
  model: string
  cached: boolean
  cacheCategory?: string
  warnings?: string[]
  experienceLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
}

interface UseAssistantOptions {
  language?: string
  symbol?: string
  onError?: (error: string) => void
  onWarning?: (warning: string) => void
}

interface UseAssistantReturn {
  messages: AssistantMessage[]
  isStreaming: boolean
  error: string | null
  sendMessage: (message: string) => Promise<void>
  clearConversation: () => void
  suggestions: string[]
  language: string
  isRtl: boolean
}

// RTL languages
const RTL_LANGUAGES = ['ar', 'fa', 'ur', 'he']

// Suggestions per language (top 5 languages — others fall back to English)
const SUGGESTIONS: Record<string, string[]> = {
  ar: [
    'ما هي حالة حسابي؟',
    'لماذا فُتحت آخر صفقة؟',
    'ماذا يقول المجلس الآن؟',
    'ما هي أخبار السوق؟',
    'ما الذي تعلّمه النظام؟',
  ],
  en: [
    'What is my account status?',
    'Why was the last trade opened?',
    'What does the council say now?',
    'What are the market news?',
    'What has the system learned?',
  ],
  fr: [
    "Quel est l'état de mon compte ?",
    'Pourquoi la dernière position a-t-elle été ouverte ?',
    'Que dit le conseil maintenant ?',
    'Quelles sont les nouvelles du marché ?',
    'Qu\'a appris le système ?',
  ],
  es: [
    '¿Cuál es el estado de mi cuenta?',
    '¿Por qué se abrió la última operación?',
    '¿Qué dice el consejo ahora?',
    '¿Cuáles son las noticias del mercado?',
    '¿Qué ha aprendido el sistema?',
  ],
  de: [
    'Wie ist der Status meines Kontos?',
    'Warum wurde der letzte Trade geöffnet?',
    'Was sagt der Rat gerade?',
    'Was gibt es Neues vom Markt?',
    'Was hat das System gelernt?',
  ],
  tr: [
    'Hesabımın durumu nedir?',
    'Son pozisyon neden açıldı?',
    'Konsey şu an ne diyor?',
    'Piyasa haberleri nelerdir?',
    'Sistem ne öğrendi?',
  ],
}

function getSuggestions(language: string): string[] {
  return SUGGESTIONS[language] ?? SUGGESTIONS.en
}

function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.includes(language.toLowerCase())
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useAssistant(options: UseAssistantOptions = {}): UseAssistantReturn {
  const locale = useLocale()
  const language = options.language ?? locale ?? 'ar'
  const isRtl = isRtlLanguage(language)

  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs for SSE cleanup
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || isStreaming) return

      setError(null)

      // Add user message
      const userMessage: AssistantMessage = {
        id: generateId(),
        role: 'user',
        content: message.trim(),
        timestamp: Date.now(),
      }

      // Add empty assistant message (will be filled by stream)
      const assistantMessageId = generateId()
      const assistantMessage: AssistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsStreaming(true)

      // Build conversation history (last 5 messages, excluding the empty assistant we just added)
      const conversationHistory = [...messages, userMessage]
        .slice(-5)
        .map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }))

      // Abort any previous stream
      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        // Try SSE streaming first
        const response = await fetch('/api/assistant/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            message: message.trim(),
            language,
            symbol: options.symbol,
            conversationHistory,
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type') || ''

        if (!contentType.includes('text/event-stream')) {
          // Not SSE — try to parse as JSON (might be a regular chat response)
          const data = await response.json().catch(() => null)
          if (data?.data?.reply) {
            const chatResponse: AssistantResponse = data.data
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: chatResponse.reply,
                      isStreaming: false,
                      languageTier: chatResponse.languageTier,
                      rtl: chatResponse.rtl,
                      cached: chatResponse.cached,
                      model: chatResponse.model,
                      functionsCalled: chatResponse.functionsCalled,
                      processingTimeMs: chatResponse.processingTimeMs,
                      warnings: chatResponse.warnings,
                    }
                  : m,
              ),
            )
            chatResponse.warnings?.forEach((w) => options.onWarning?.(w))
            return
          }
          throw new Error('Unexpected response format')
        }

        // SSE streaming — read the stream
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let fullReply = ''
        let metadata: Partial<AssistantMessage> = {}

        const processEvent = (eventData: string) => {
          const lines = eventData.split('\n')
          let eventType = ''
          let dataLine = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              dataLine = line.slice(6)
            }
          }

          if (!eventType || !dataLine) return

          try {
            const data = JSON.parse(dataLine)

            switch (eventType) {
              case 'context':
                metadata.languageTier = data.languageTier
                metadata.rtl = data.rtl
                metadata.warnings = data.warnings
                if (data.cached) metadata.cached = true
                data.warnings?.forEach((w: string) => options.onWarning?.(w))
                break

              case 'functions':
                metadata.functionsCalled = data.functionsCalled
                break

              case 'chunk':
                fullReply += data.chunk || ''
                // Update message content progressively
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: fullReply, ...metadata }
                      : m,
                  ),
                )
                break

              case 'done':
                fullReply = data.fullReply || fullReply
                metadata.model = data.model
                metadata.processingTimeMs = data.processingTimeMs
                metadata.cached = data.cached
                metadata.isStreaming = false
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: fullReply,
                          ...metadata,
                          isStreaming: false,
                        }
                      : m,
                  ),
                )
                break

              case 'error':
                setError(data.message || 'Unknown error')
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: `❌ ${data.message || 'Error'}`,
                          isStreaming: false,
                          error: true,
                        }
                      : m,
                  ),
                )
                break
            }
          } catch (e) {
            // JSON parse error — ignore this event
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete events (separated by \n\n)
          const events = buffer.split('\n\n')
          buffer = events.pop() || '' // keep incomplete event in buffer

          for (const evt of events) {
            if (evt.trim()) {
              processEvent(evt)
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          processEvent(buffer)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          // User cancelled — mark message as stopped
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, isStreaming: false, content: m.content || '[stopped]' }
                : m,
            ),
          )
        } else {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error'
          setError(errorMsg)
          options.onError?.(errorMsg)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: `❌ ${errorMsg}`,
                    isStreaming: false,
                    error: true,
                  }
                : m,
            ),
          )
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [isStreaming, language, options.symbol, messages, options.onError, options.onWarning],
  )

  const clearConversation = useCallback(() => {
    abortControllerRef.current?.abort()
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearConversation,
    suggestions: getSuggestions(language),
    language,
    isRtl,
  }
}
