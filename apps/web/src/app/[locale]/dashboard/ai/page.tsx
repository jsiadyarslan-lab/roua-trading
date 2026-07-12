'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  Brain, Send, Activity, BarChart2, Cpu, AlertTriangle,
  TrendingUp, TrendingDown, Target, Zap, ChevronDown,
  RefreshCw, Shield, MessageSquare, Sparkles, Bot,
  CircleDot, Flame, Eye, Crosshair, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react'
import { PRIMARY_SYMBOLS } from '@/lib/trading-intelligence'
import { sanitizeCouncilResult, safeStr } from '@/lib/utils'
import { useTranslations, useLocale } from 'next-intl'

// ── Theme ──
import T from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

// ── Types ──
interface Message {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: string
  model?: string
  confidence?: number
  source?: string
}

interface TechIndicators {
  rsi: number
  ema20: number
  ema50: number
  dir: string
  strength: number
  change: number
  price: number
  signalClass: string
  entryBias: string
  freshness: string
  reasons: string[]
}

interface CouncilVote {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

interface CouncilResult {
  consensusScore: number
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  analyses: CouncilVote[]
  masterStrategy: string
  source?: string
}

interface AIModelStatus {
  model: string
  available: boolean
  specialty: string
}

interface NarratorData {
  narrative: string
  summary: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  confidence: number
  risk: 'Low' | 'Medium' | 'High'
  bullCase?: string
  bearCase?: string
  keyRisk?: string
  nextTrigger?: string
}

// ── Role Name Map (same pattern as AICouncilPanel.tsx) ──
const ROLE_NAME_MAP: Record<string, string> = {
  'المحلل الفني': 'roleTech',
  'محلل المشاعر': 'roleSent',
  'خبير المخاطر': 'roleRisk',
  'خبير الماكرو': 'roleMacro',
  'خبير الأنماط': 'rolePattern',
  'استراتيجي التنفيذ': 'roleExec',
  'محلل التباين': 'roleDiverge',
  'محلل السيناريوهات': 'roleScenario',
  // English fallbacks
  'Technical Analyst': 'roleTech',
  'Sentiment Analyst': 'roleSent',
  'Risk Expert': 'roleRisk',
  'Macro Expert': 'roleMacro',
  'Pattern Expert': 'rolePattern',
  'Execution Strategist': 'roleExec',
  'Divergence Analyst': 'roleDiverge',
  'Scenario Analyst': 'roleScenario',
}

function translateRoleName(role: string, t: (key: string) => string): string {
  const key = ROLE_NAME_MAP[role]
  return key ? t(key) : role
}

// ── Local Storage Helpers ──
const STORAGE_KEY = 'roua-ai-chat-history'
const LOCALE_KEY = 'roua-ai-chat-locale'

function loadMessages(locale: string, t: (key: string) => string): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const savedLocale = localStorage.getItem(LOCALE_KEY)
    if (saved && savedLocale === locale) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    // Locale changed or no saved messages — clear stale data
    if (saved && savedLocale !== locale) {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {}
  const timeLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US'
  return [{
    id: '1',
    role: 'ai',
    content: t('welcomeMessage'),
    timestamp: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }),
    model: t('rouaAI'),
    confidence: 100,
    source: 'system',
  }]
}

function saveMessages(messages: Message[], locale?: string) {
  if (typeof window === 'undefined') return
  try {
    // Keep last 50 messages
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)))
    if (locale) localStorage.setItem(LOCALE_KEY, locale)
  } catch {}
}

// ── Main Component ──
export default function AIPage() {
  useScopedStyle(`@media (max-width: 767px) {
          .ai-page-root { height: 100% !important; }
        }
::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(10,132,255,0.3); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .ai-select {
          appearance: none;
          background: ${T.bg2};
          border: 1px solid ${T.border};
          color: ${T.text};
          padding: 8px 14px;
          border-radius: 8px;
          font-family: 'Cairo', sans-serif;
          font-size: 12px;
          outline: none;
          cursor: pointer;
          width: 100%;
        }
        .ai-select:focus { border-color: ${T.cyan}; }
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 8px currentColor; }
          50% { box-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
        }
        .glow-dot {
          animation: glow-pulse 2s ease-in-out infinite;
        }
        .chat-msg-ai {
          animation: fadeSlideIn 0.3s ease-out;
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ai-right-col {
          flex: 0 0 300px;
          border-inline-start: 1px solid ${T.border};
          display: flex; flex-direction: column;
          overflow-y: auto;
        }
        .ai-left-col {
          flex: 0 0 320px;
          border-inline-end: 1px solid ${T.border};
          display: flex; flex-direction: column;
          overflow-y: auto;
        }
        .ai-top-bar {
          flex-wrap: wrap;
        }
        .ai-model-status {
          display: flex; gap: 6px;
        }
        /* Tablet breakpoint */
        @media (max-width: 1024px) and (min-width: 768px) {
          .ai-left-col {
            flex: 0 0 260px !important;
          }
          .ai-right-col {
            flex: 0 0 240px !important;
          }
        }
        @media (max-width: 767px) {
          .ai-main-content {
            flex-direction: column !important;
            overflow-y: auto !important;
          }
          .ai-right-col {
            flex: 0 0 auto !important;
            border-inline-start: none !important;
            border-bottom: 1px solid ${T.border};
            max-height: 300px;
          }
          .ai-left-col {
            flex: 0 0 auto !important;
            border-inline-end: none !important;
            border-top: 1px solid ${T.border};
          }
          .ai-top-bar {
            flex-wrap: wrap;
            gap: 8px !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .ai-model-status {
            display: none !important;
          }
          .ai-quick-actions {
            display: none !important;
          }
          .ai-chat-msg {
            min-width: auto !important;
          }
          .ai-main-content > :nth-child(1) { order: 2; }
          .ai-main-content > :nth-child(2) { order: 1; }
          .ai-main-content > :nth-child(3) { order: 3; }
          .ai-quick-prompts-row {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 4px;
          }
        }
.spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`)

  // Chat State
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USD')

  // Technical Indicators (live from market)
  const [techData, setTechData] = useState<TechIndicators | null>(null)
  const [techLoading, setTechLoading] = useState(true)

  // AI Council
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null)
  const [councilLoading, setCouncilLoading] = useState(false)

  // Narrator
  const [narratorData, setNarratorData] = useState<NarratorData | null>(null)

  // AI Models Status
  const [modelsStatus, setModelsStatus] = useState<AIModelStatus[]>([])
  const [nestjsConnected, setNestjsConnected] = useState(false)

  // Active tab for right panel
  const [rightTab, setRightTab] = useState<'council' | 'narrator'>('council')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── i18n ──
  const t = useTranslations('dashboard.aiPage')
  const locale = useLocale()
  const timeLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US'

  // ── Initialize ──
  // FIX: Wrapped fetch functions in useCallback to prevent stale closures
  // and unnecessary re-renders. Previously, regular functions were called
  // in useEffect with [] deps, causing React exhaustive-deps warnings.
  useEffect(() => {
    setMessages(loadMessages(locale, t))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  useEffect(() => {
    fetchAIStatus()
    fetchTechIndicators()
    fetchNarrator()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchTechIndicators()
    fetchNarrator()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol])

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // ── Fetch AI Models Status ──
  const fetchAIStatus = async () => {
    try {
      const res = await fetch('/api/ai/status')
      const json = await res.json()
      if (json.success && json.data) {
        setModelsStatus(json.data.models || [])
        setNestjsConnected(json.data.connected || false)
      }
    } catch {
      setFetchError(t('aiConnectionError'))
    }
  }

  // ── Fetch Technical Indicators ──
  const fetchTechIndicators = async () => {
    setTechLoading(true)
    try {
      const res = await fetch(`/api/market-scan?pair=${encodeURIComponent(selectedSymbol)}&tf=1h`)
      const json = await res.json()
      if (json.success && json.data && json.data.length > 0) {
        const scan = json.data[0]
        setTechData({
          rsi: Math.round(scan.features?.rsi || 50),
          ema20: scan.features?.ema20 || 0,
          ema50: scan.features?.ema50 || 0,
          dir: scan.dir || 'neutral',
          strength: scan.strength || 50,
          change: scan.change || 0,
          price: scan.price || 0,
          signalClass: scan.signalClass || 'watch',
          entryBias: scan.entryBias || 'wait',
          freshness: scan.freshness || 'degraded',
          reasons: scan.reasons || [],
        })
      }
    } catch {
      setFetchError(t('techFetchError'))
    } finally {
      setTechLoading(false)
    }
  }

  // ── Fetch Narrator ──
  const fetchNarrator = async () => {
    try {
      const res = await fetch(`/api/ai/narrator?symbol=${encodeURIComponent(selectedSymbol)}&lang=${locale === 'ar' ? 'ar' : 'en'}`)
      const json = await res.json()
      if (json.success && json.data) {
        setNarratorData(json.data)
      }
    } catch {
      setFetchError(t('narratorFetchError'))
    }
  }

  // ── Fetch Council ──
  const fetchCouncil = async () => {
    setCouncilLoading(true)
    try {
      // Call AI consensus endpoint (NestJS or local fallback)
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, language: locale }),
        signal: AbortSignal.timeout(45000),
      })
      const json = await res.json()
      if (json.success && json.data) {
        // FIX: Sanitize council data to prevent React Error #31.
        // AI models sometimes return objects (e.g., {symbol, name, direction, impactDegree, reason, isTradable})
        // instead of plain strings for fields like vote.reason, vote.role, etc.
        const sanitized = sanitizeCouncilResult(json.data)
        setCouncilResult({ ...sanitized, source: sanitized.analyses?.length > 0 ? 'nestjs' : 'local' })
      }
    } catch {
      // If consensus fails, show empty result
      setCouncilResult(null)
    } finally {
      setCouncilLoading(false)
    }
  }

  // ── Send Chat Message ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages(prev => {
      const updated = [...prev, userMsg]
      saveMessages(updated, locale)
      return updated
    })
    setInputValue('')
    setIsTyping(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          symbol: selectedSymbol,
          type: 'market_analysis',
          style: 'professional',
          language: locale === 'ar' ? 'ar' : 'en',
        }),
      })

      const json = await res.json()
      if (json.success && json.data) {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: json.data.content,
          timestamp: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }),
          model: json.data.model,
          confidence: json.data.confidence,
          source: json.data.source,
        }
        setMessages(prev => {
          const updated = [...prev, aiMsg]
          saveMessages(updated, locale)
          return updated
        })
      }
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: t('processingError'),
        timestamp: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }),
        model: 'fallback',
        confidence: 0,
        source: 'error',
      }
      setMessages(prev => {
        const updated = [...prev, errorMsg]
        saveMessages(updated, locale)
        return updated
      })
    } finally {
      setIsTyping(false)
    }
  }, [isTyping, selectedSymbol, t, timeLocale])

  // ── Smart Recommendation ──
  const handleSmartRecommendation = () => {
    sendMessage(t('promptSmartRecommendation', { symbol: selectedSymbol }))
  }

  // ── Comprehensive Analysis ──
  const handleComprehensiveAnalysis = () => {
    sendMessage(t('promptComprehensiveAnalysis', { symbol: selectedSymbol }))
  }

  // ── Clear Chat ──
  const handleClearChat = () => {
    const initialMsg: Message = {
      id: '1',
      role: 'ai',
      content: t('chatCleared'),
      timestamp: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }),
      model: t('rouaAI'),
      source: 'system',
    }
    setMessages([initialMsg])
    saveMessages([initialMsg], locale)
  }

  // ── Computed values ──
  const sentimentColor = narratorData?.sentiment === 'bullish' ? T.green
    : narratorData?.sentiment === 'bearish' ? T.red
    : narratorData?.sentiment === 'volatile' ? T.amber : T.cyan

  const sentimentAr = narratorData?.sentiment === 'bullish' ? t('bullish')
    : narratorData?.sentiment === 'bearish' ? t('bearish')
    : narratorData?.sentiment === 'volatile' ? t('volatile') : t('neutral')

  const dirAr = techData?.dir === 'buy' ? t('bullish') : techData?.dir === 'sell' ? t('bearish') : t('neutral')
  const dirColor = techData?.dir === 'buy' ? T.green : techData?.dir === 'sell' ? T.red : T.cyan
  const dirIcon = techData?.dir === 'buy' ? ArrowUpRight : techData?.dir === 'sell' ? ArrowDownRight : Minus

  const recColor = councilResult?.recommendation === 'BUY' ? T.green
    : councilResult?.recommendation === 'SELL' ? T.red : T.amber
  const recAr = councilResult?.recommendation === 'BUY' ? t('buy')
    : councilResult?.recommendation === 'SELL' ? t('sell') : t('hold')

  // ── Render ──
  return (
    <div className="ai-page-root" style={{
      height: 'calc(100dvh - 108px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      direction: 'inherit',
      fontFamily: "var(--font-ar)",
      background: T.bg,
    }}>
      {/* Scoped styles via useScopedStyle */}{/* ── Top Bar: Asset Selector + AI Status + Quick Actions ── */}
      <div className="ai-top-bar" style={{
        flexShrink: 0,
        padding: '12px 20px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg2,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineEnd: 16 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 'var(--radius-lg)',
            background: `linear-gradient(135deg, ${T.purple}20, ${T.cyan}20)`,
            border: `1px solid ${T.purple}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={18} color={T.cyan} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: T.text }}>{t('smartAnalysisCenter')}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: T.text3, marginTop: -2 }}>
              {nestjsConnected ? t('connectedToRealAI') : t('localModeApiKeysInactive')}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: T.border }} />

        {/* Symbol Selector */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select
            className="ai-select"
            value={selectedSymbol}
            onChange={e => setSelectedSymbol(e.target.value)}
            style={{ width: 130, fontSize: 'var(--text-sm)', fontWeight: 700 }}
          >
            {PRIMARY_SYMBOLS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Live Price */}
        {techData && (
          <div style={{
            padding: '6px 12px', borderRadius: 'var(--radius-md)',
            background: `${dirColor}08`, border: `1px solid ${dirColor}25`,
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 700,
            color: dirColor, fontFamily: "var(--font-mono)",
          }}>
            {techData.dir === 'buy' ? <ArrowUpRight size={14} /> : techData.dir === 'sell' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            {techData.price > 1000 ? (techData.price?.toFixed(2) ?? '—') : (techData.price?.toFixed(5) ?? '—')}
            <span style={{ fontSize: 'var(--text-xs)', color: T.text3, fontWeight: 500 }}>
              {techData.change >= 0 ? '+' : ''}{techData.change?.toFixed(2) ?? '—'}%
            </span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* AI Models Status */}
        <div className="ai-model-status" style={{ display: 'flex', gap: 6 }}>
          {[
            { name: 'Gemini', color: T.cyan, key: 'GEMINI_API_KEY' },  // Also checks GOOGLE_AI_STUDIO_API_KEY
            { name: 'Groq', color: T.blue, key: 'GROQ_API_KEY' },
            { name: 'GLM-4', color: T.amber, key: 'GLM_API_KEY' },
            { name: 'HF', color: T.green, key: 'HF_API_KEY' },  // Also checks HUGGINGFACE_API_KEY, OPENROUTER_API_KEY
            { name: 'OpenRouter', color: T.purple, key: 'OPENROUTER_API_KEY' },
            { name: 'Ollama', color: T.purple, key: 'OLLAMA_API_KEY' },
            { name: 'Bedrock', color: T.amber, key: 'AWS_ACCESS_KEY_ID' },
          ].map(m => {
            const modelInfo = modelsStatus.find(ms => ms.model.includes(m.name))
            const available = nestjsConnected && (modelInfo?.available ?? false)
            return (
              <div key={m.name} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 'var(--radius-xl)',
                background: available ? `${m.color}10` : T.bg,
                border: `1px solid ${available ? `${m.color}30` : T.border}`,
                fontSize: 'var(--text-xs)', fontWeight: 700, color: available ? m.color : T.text3,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: available ? m.color : T.text3,
                  boxShadow: available ? `0 0 6px ${m.color}` : 'none',
                }} />
                {m.name}
              </div>
            )
          })}
        </div>

        {/* Quick Actions */}
        <button
          className="ai-quick-actions"
          onClick={handleSmartRecommendation}
          disabled={isTyping}
          style={{
            padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none',
            background: `linear-gradient(90deg, ${T.cyan}, ${T.blue})`,
            color: '#000', fontWeight: 800, fontSize: 'var(--text-xs)',
            cursor: isTyping ? 'not-allowed' : 'pointer',
            opacity: isTyping ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "var(--font-ar)",
          }}
        >
          <Zap size={13} fill="#000" />
          {t('smartRecommendation')}
        </button>
        <button
          onClick={handleComprehensiveAnalysis}
          disabled={isTyping}
          style={{
            padding: '7px 14px', borderRadius: 'var(--radius-md)',
            border: `1px solid ${T.purple}40`,
            background: `${T.purple}10`,
            color: T.purple, fontWeight: 700, fontSize: 'var(--text-xs)',
            cursor: isTyping ? 'not-allowed' : 'pointer',
            opacity: isTyping ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "var(--font-ar)",
          }}
        >
          <Sparkles size={13} />
          {t('comprehensiveAnalysis')}
        </button>
      </div>

      {/* ── Main Content: 3-Column Layout ── */}
      {fetchError && (
        <div style={{
          padding: '8px 16px', background: `${T.red}10`,
          border: `1px solid ${T.red}30`, borderRadius: 'var(--radius-md)',
          margin: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} color={T.red} />
          <span style={{ fontSize: 'var(--text-xs)', color: T.red }}>{fetchError}</span>
          <button onClick={() => setFetchError(null)} style={{
            background: 'none', border: 'none', color: T.text3,
            cursor: 'pointer', marginInlineStart: 'auto', fontSize: 'var(--text-xs)',
          }}>✕</button>
        </div>
      )}
      <div className="ai-main-content" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══════ Right Column: Technical Indicators & Market Context ═══════ */}
        <div className="ai-right-col" style={{
          flex: '0 0 300px',
          borderInlineStart: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Sentiment Card */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: T.text3, fontWeight: 700 }}>{t('marketSentiment')}</span>
              <Activity size={14} color={sentimentColor} />
            </div>
            <div style={{
              textAlign: 'center', padding: '12px 0',
            }}>
              <div style={{
                fontSize: 'var(--text-2xl)', fontWeight: 900, color: sentimentColor,
                fontFamily: "var(--font-mono)",
                textShadow: `0 0 20px ${sentimentColor}30`,
              }}>
                {narratorData ? sentimentAr : '—'}
              </div>
              {narratorData && (
                <div style={{
                  fontSize: 'var(--text-xs)', color: T.text3, marginTop: 6,
                  fontFamily: "var(--font-mono)",
                }}>
                  {t('confidence')}: {narratorData.confidence}% | {t('risk')}: {narratorData.risk === 'Low' ? t('riskLow') : narratorData.risk === 'Medium' ? t('riskMedium') : t('riskHigh')}
                </div>
              )}
            </div>
            {narratorData?.summary && (
              <div style={{
                padding: '10px', borderRadius: 'var(--radius-md)', background: T.bg,
                border: `1px solid ${T.border}`,
                fontSize: 'var(--text-xs)', color: T.text2, lineHeight: 1.6,
              }}>
                {narratorData.summary}
              </div>
            )}
          </div>

          {/* Technical Indicators */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${T.border}`, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: T.text3, fontWeight: 700 }}>{t('technicalIndicators')} ({selectedSymbol})</span>
              <button
                onClick={fetchTechIndicators}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
              >
                <RefreshCw size={12} color={T.text3} />
              </button>
            </div>

            {techLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    height: 52, borderRadius: 'var(--radius-md)',
                    background: `linear-gradient(90deg, ${T.bg} 25%, ${T.bg2} 50%, ${T.bg} 75%)`,
                    backgroundSize: '200% 100%',
                    animation: 'fadeSlideIn 1.5s infinite',
                  }} />
                ))}
              </div>
            ) : techData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Direction */}
                <IndicatorCard
                  label={t('direction')}
                  value={dirAr}
                  subValue={`${techData.strength}%`}
                  color={dirColor}
                  icon={dirIcon}
                />

                {/* RSI */}
                <IndicatorCard
                  label={t('rsi14')}
                  value={String(techData.rsi)}
                  subValue={techData.rsi < 30 ? t('oversold') : techData.rsi > 70 ? t('overbought') : t('neutralRSI')}
                  color={techData.rsi < 30 ? T.green : techData.rsi > 70 ? T.red : T.cyan}
                />

                {/* EMA Cross */}
                <IndicatorCard
                  label={t('ema2050')}
                  value={techData.ema20 > techData.ema50 ? t('bullishCross') : t('bearishCross')}
                  subValue={`Δ ${Math.abs(techData.ema20 - techData.ema50).toFixed(2)}`}
                  color={techData.ema20 > techData.ema50 ? T.green : T.red}
                />

                {/* Signal Class */}
                <IndicatorCard
                  label={t('signalClassification')}
                  value={techData.signalClass === 'trend' ? t('trending') : techData.signalClass === 'reversion' ? t('reversion') : techData.signalClass === 'breakout' ? t('breakout') : t('watching')}
                  subValue={`${t('entry')}: ${techData.entryBias === 'follow' ? t('follow') : techData.entryBias === 'fade' ? t('counter') : t('wait')}`}
                  color={techData.signalClass === 'trend' ? T.green : techData.signalClass === 'breakout' ? T.amber : T.purple}
                />

                {/* Reasons */}
                {techData.reasons.length > 0 && (
                  <div style={{
                    padding: '10px', borderRadius: 'var(--radius-md)',
                    background: T.bg, border: `1px solid ${T.border}`,
                    fontSize: 'var(--text-xs)', color: T.text2, lineHeight: 1.5,
                  }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: T.text3, fontWeight: 700, marginBottom: 6 }}>{t('reasons')}</div>
                    {techData.reasons.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
                        <CircleDot size={8} color={T.cyan} style={{ marginTop: 3, flexShrink: 0 }} />
                        {r}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                padding: '20px', textAlign: 'center', color: T.text3, fontSize: 'var(--text-xs)',
              }}>
                {t('noTechDataAvailable')}
              </div>
            )}
          </div>

          {/* Narrator Quick Insights */}
          {narratorData && (
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: T.text3, fontWeight: 700 }}>{t('quickInsights')}</span>
                <Eye size={12} color={T.purple} />
              </div>
              {narratorData.bullCase && (
                <InsightBox label={t('bullScenario')} text={narratorData.bullCase} color={T.green} />
              )}
              {narratorData.bearCase && (
                <InsightBox label={t('bearScenario')} text={narratorData.bearCase} color={T.red} />
              )}
              {narratorData.keyRisk && (
                <InsightBox label={t('keyRisk')} text={narratorData.keyRisk} color={T.amber} />
              )}
            </div>
          )}
        </div>

        {/* ═══════ Center: AI Chat ═══════ */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '12px 20px',
            borderBottom: `1px solid ${T.border}`,
            background: T.bg2,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={16} color={T.cyan} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text }}>{t('smartAnalysisChat')}</span>
              <span style={{
                fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-lg)',
                background: nestjsConnected ? `${T.green}12` : `${T.amber}12`,
                border: `1px solid ${nestjsConnected ? `${T.green}30` : `${T.amber}30`}`,
                color: nestjsConnected ? T.green : T.amber,
                fontWeight: 700,
              }}>
                {nestjsConnected ? t('realAI') : t('localMode')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={handleClearChat}
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${T.border}`, background: T.bg,
                  color: T.text3, fontSize: 'var(--text-xs)', cursor: 'pointer',
                  fontFamily: "var(--font-ar)",
                }}
              >
                {t('clearChat')}
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div style={{
            flex: 1, padding: '20px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 16,
          }} role="log" aria-live="polite" aria-label={t('chatLog')}>
            {messages.map((msg) => (
              <div key={msg.id} className={msg.role === 'ai' ? 'chat-msg-ai' : ''} style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 10, alignItems: 'flex-start',
                maxWidth: '85%',
              }}>
                {msg.role === 'ai' && (
                  <div style={{
                    width: 30, height: 30, borderRadius: 'var(--radius-md)',
                    background: `${T.cyan}15`,
                    border: `1px solid ${T.cyan}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Bot size={14} color={T.cyan} />
                  </div>
                )}
                <div style={{
                  background: msg.role === 'user' ? T.blue : T.card,
                  color: T.text, fontSize: 'var(--text-sm)', lineHeight: 1.8,
                  padding: '12px 16px', borderRadius: 'var(--radius-lg)',
                  border: msg.role === 'ai' ? `0.5px solid ${T.border}` : 'none',
                  borderTopRightRadius: msg.role === 'user' ? 4 : 12,
                  borderTopLeftRadius: msg.role === 'ai' ? 4 : 12,
                  whiteSpace: 'pre-wrap',
                  minWidth: 200,
                }} className="ai-chat-msg">
                  {msg.content}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 8, paddingTop: 6, borderTop: `0.5px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.1)' : T.border}`,
                  }}>
                    <span style={{
                      fontSize: 'var(--text-xs)', color: msg.role === 'user' ? 'rgba(255,255,255,0.4)' : T.text3,
                    }}>
                      {msg.timestamp}
                    </span>
                    {msg.role === 'ai' && msg.model && (
                      <span style={{
                        fontSize: 'var(--text-xs)', padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                        background: msg.source === 'ai-orchestrator' ? `${T.green}12` :
                          msg.source === 'local-fallback' ? `${T.amber}12` : `${T.text3}12`,
                        color: msg.source === 'ai-orchestrator' ? T.green :
                          msg.source === 'local-fallback' ? T.amber : T.text3,
                        fontWeight: 600,
                      }}>
                        {msg.model} {msg.confidence ? `• ${msg.confidence}%` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                maxWidth: '80%',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 'var(--radius-md)',
                  background: `${T.cyan}15`,
                  border: `1px solid ${T.cyan}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Bot size={14} color={T.cyan} />
                </div>
                <div style={{
                  background: T.card, padding: '14px 20px', borderRadius: 'var(--radius-lg)', borderTopLeftRadius: 4,
                  border: `0.5px solid ${T.border}`,
                  display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', background: T.cyan,
                    animation: 'dot-pulse 1.4s infinite ease-in-out',
                  }} />
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', background: T.cyan,
                    animation: 'dot-pulse 1.4s infinite ease-in-out 0.2s',
                  }} />
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', background: T.cyan,
                    animation: 'dot-pulse 1.4s infinite ease-in-out 0.4s',
                  }} />
                  <span style={{ fontSize: 'var(--text-xs)', color: T.text3, marginInlineStart: 6 }}>
                    {nestjsConnected ? t('aiAnalyzing') : t('localAnalyzing')}
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '14px 20px',
            borderTop: `1px solid ${T.border}`,
            background: T.bg2,
          }}>
            {/* Quick Prompts */}
            <div className="ai-quick-prompts-row" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {[
                { label: t('technicalAnalysis'), prompt: t('promptTechAnalysis', { symbol: selectedSymbol }) },
                { label: t('supportResistanceLevels'), prompt: t('promptSupportResistance', { symbol: selectedSymbol }) },
                { label: t('riskAnalysis'), prompt: t('promptRiskAnalysis', { symbol: selectedSymbol }) },
                { label: t('bestEntryTime'), prompt: t('promptBestEntry', { symbol: selectedSymbol }) },
              ].map(qp => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={isTyping}
                  style={{
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${T.border}`, background: T.bg,
                    color: T.text3, fontSize: 'var(--text-xs)', cursor: isTyping ? 'not-allowed' : 'pointer',
                    fontFamily: "var(--font-ar)",
                    opacity: isTyping ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.cyan; e.currentTarget.style.color = T.cyan }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3 }}
                >
                  {qp.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                placeholder={t('askAboutSymbol', { symbol: selectedSymbol })}
                aria-label={t('chatMessage')}
                style={{
                  flex: 1, background: T.bg, border: `1px solid ${T.border}`,
                  borderRadius: 'var(--radius-lg)', padding: '12px 16px',
                  color: T.text, fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = T.cyan}
                onBlur={e => e.target.style.borderColor = T.border}
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={isTyping || !inputValue.trim()}
                aria-label={t('sendMessage')}
                style={{
                  width: 46, borderRadius: 'var(--radius-lg)', border: 'none',
                  background: T.cyan, color: '#000',
                  cursor: isTyping || !inputValue.trim() ? 'not-allowed' : 'pointer',
                  opacity: isTyping || !inputValue.trim() ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <Send size={18} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          </div>
        </div>

        {/* ═══════ Left Column: AI Council + Narrator ═══════ */}
        <div className="ai-left-col" style={{
          flex: '0 0 320px',
          borderInlineEnd: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Tab Switcher */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${T.border}`,
            background: T.bg2,
          }}>
            <TabButton
              active={rightTab === 'council'}
              onClick={() => setRightTab('council')}
              icon={<Shield size={14} />}
              label={t('aiCouncil')}
            />
            <TabButton
              active={rightTab === 'narrator'}
              onClick={() => setRightTab('narrator')}
              icon={<MessageSquare size={14} />}
              label={t('smartNarrator')}
            />
          </div>

          {/* ── Council Tab ── */}
          {rightTab === 'council' && (
            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Council Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Flame size={14} color={T.amber} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text }}>{t('smartModelsCouncil')}</span>
                </div>
                <button
                  onClick={fetchCouncil}
                  disabled={councilLoading}
                  style={{
                    padding: '5px 12px', borderRadius: 'var(--radius-sm)',
                    border: 'none', background: T.cyan, color: '#000',
                    fontWeight: 800, fontSize: 'var(--text-xs)', cursor: councilLoading ? 'not-allowed' : 'pointer',
                    fontFamily: "var(--font-ar)",
                    opacity: councilLoading ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RefreshCw size={10} className={councilLoading ? 'spinning' : ''} />
                  {councilLoading ? t('loading') : t('activateCouncil')}
                </button>
              </div>

              {/* Council Result */}
              {councilLoading ? (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12,
                  color: T.text3, fontSize: 'var(--text-xs)',
                }}>
                  <RefreshCw size={24} color={T.cyan} className="spinning" />
                  <span>{t('councilDeliberating', { symbol: selectedSymbol })}</span>
                </div>
              ) : councilResult ? (
                <>
                  {/* Consensus Score */}
                  <div style={{
                    textAlign: 'center', padding: '16px', borderRadius: 'var(--radius-lg)',
                    background: `${recColor}06`, border: `1px solid ${recColor}20`,
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontSize: 'var(--text-3xl)', fontWeight: 900, color: recColor,
                      fontFamily: "var(--font-mono)",
                      textShadow: `0 0 20px ${recColor}30`,
                    }}>
                      {recAr}
                    </div>
                    <div style={{
                      fontSize: 'var(--text-sm)', color: T.text2, marginTop: 4,
                      fontFamily: "var(--font-mono)",
                    }}>
                      {t('consensus')} {councilResult.consensusScore}%
                      {councilResult.source === 'nestjs' && (
                        <span style={{ color: T.green, marginInlineStart: 6 }}>• {t('realAI')}</span>
                      )}
                    </div>
                    {/* Score Bar */}
                    <div style={{
                      width: '100%', height: 6, background: T.bg,
                      borderRadius: 'var(--radius-sm)', marginTop: 10, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${councilResult.consensusScore}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${recColor}, ${T.cyan})`,
                        borderRadius: 'var(--radius-sm)',
                        transition: 'width 1s ease-out',
                      }} />
                    </div>
                  </div>

                  {/* Individual Votes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {councilResult.analyses.map((vote, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 'var(--radius-md)',
                        background: T.bg, border: `1px solid ${T.border}`,
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: 4,
                        }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: T.text }}>
                            {translateRoleName(safeStr(vote.role), t)}
                          </span>
                          <span style={{
                            fontSize: 'var(--text-xs)', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                            background: vote.vote === 'BUY' ? `${T.green}12` : vote.vote === 'SELL' ? `${T.red}12` : `${T.amber}12`,
                            color: vote.vote === 'BUY' ? T.green : vote.vote === 'SELL' ? T.red : T.amber,
                            fontWeight: 700,
                          }}>
                            {vote.vote === 'BUY' ? t('buy') : vote.vote === 'SELL' ? t('sell') : t('hold')} • {vote.confidence}%
                          </span>
                        </div>
                        <div style={{
                          fontSize: 'var(--text-xs)', color: T.text3, lineHeight: 1.5,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {safeStr(vote.reason)}
                        </div>
                        {vote.model && (
                          <div style={{ fontSize: 'var(--text-xs)', color: T.text3, marginTop: 3, fontFamily: "var(--font-mono)" }}>
                            {safeStr(vote.model)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Master Strategy */}
                  {councilResult.masterStrategy && (
                    <div style={{
                      marginTop: 12, padding: '12px', borderRadius: 'var(--radius-md)',
                      background: `${T.cyan}05`, border: `1px solid ${T.cyan}20`,
                      fontSize: 'var(--text-xs)', color: T.text2, lineHeight: 1.6,
                    }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: T.cyan, fontWeight: 700, marginBottom: 4 }}>{t('mainStrategy')}</div>
                      {safeStr(councilResult.masterStrategy)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                  color: T.text3, fontSize: 'var(--text-xs)', textAlign: 'center',
                }}>
                  <Shield size={28} color={T.text3} style={{ opacity: 0.3 }} />
                  <span>{t('pressActivateCouncil', { symbol: selectedSymbol })}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Narrator Tab ── */}
          {rightTab === 'narrator' && (
            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Narrator Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Brain size={14} color={T.purple} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text }}>{t('smartNarrator')}</span>
                </div>
                <button
                  onClick={fetchNarrator}
                  style={{
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${T.border}`, background: T.bg,
                    color: T.text3, fontSize: 'var(--text-xs)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RefreshCw size={10} /> {t('refresh')}
                </button>
              </div>

              {narratorData ? (
                <>
                  {/* Sentiment & Risk */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <NarratorBadge
                      label={t('directionNarrator')}
                      value={sentimentAr}
                      color={sentimentColor}
                    />
                    <NarratorBadge
                      label={t('riskNarrator')}
                      value={narratorData.risk === 'Low' ? t('riskLow') : narratorData.risk === 'Medium' ? t('riskMedium') : t('riskHigh')}
                      color={narratorData.risk === 'Low' ? T.green : narratorData.risk === 'Medium' ? T.amber : T.red}
                    />
                    <NarratorBadge
                      label={t('confidenceLabel')}
                      value={`${narratorData.confidence}%`}
                      color={T.cyan}
                    />
                  </div>

                  {/* Narrative Text */}
                  <div style={{
                    padding: '14px', borderRadius: 'var(--radius-lg)',
                    background: T.bg, border: `1px solid ${T.border}`,
                    fontSize: 'var(--text-xs)', color: T.text, lineHeight: 1.8,
                    flex: 1, overflowY: 'auto',
                  }}>
                    {narratorData.narrative}
                  </div>

                  {/* Bull/Bear Cases */}
                  {narratorData.bullCase && (
                    <CaseBox label={t('bullCase')} text={narratorData.bullCase} color={T.green} icon={<TrendingUp size={12} />} />
                  )}
                  {narratorData.bearCase && (
                    <CaseBox label={t('bearCase')} text={narratorData.bearCase} color={T.red} icon={<TrendingDown size={12} />} />
                  )}
                  {narratorData.nextTrigger && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 'var(--radius-md)',
                      background: `${T.cyan}05`, border: `1px solid ${T.cyan}20`,
                      fontSize: 'var(--text-xs)', color: T.text2, lineHeight: 1.6,
                    }}>
                      <strong style={{ color: T.cyan }}>{t('nextTrigger')}:</strong> {narratorData.nextTrigger}
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.text3, fontSize: 'var(--text-xs)',
                }}>
                  {t('loadingNarrator')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spinning animation for RefreshCw */}
      {/* Scoped styles via useScopedStyle */}</div>
  )
}

// ── Sub-Components ──

function IndicatorCard({ label, value, subValue, color, icon: Icon }: {
  label: string; value: string; subValue: string; color: string; icon?: any
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', background: T.bg, borderRadius: 'var(--radius-md)',
      border: `0.5px solid ${T.border}`,
    }}>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', color: T.text3, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 4 }}>
          {Icon && <Icon size={14} />}
          {value}
        </div>
      </div>
      <div style={{
        padding: '3px 8px', borderRadius: 'var(--radius-sm)',
        background: `${color}12`, color,
        fontSize: 'var(--text-xs)', fontWeight: 700,
      }}>
        {subValue}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px',
        background: active ? `${T.cyan}08` : 'transparent',
        border: 'none', borderBottom: active ? `2px solid ${T.cyan}` : '2px solid transparent',
        color: active ? T.cyan : T.text3,
        fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontFamily: "var(--font-ar)",
        transition: 'all 0.2s',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function NarratorBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, padding: '8px', borderRadius: 'var(--radius-md)',
      background: `${color}06`, border: `1px solid ${color}20`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 'var(--text-xs)', color: T.text3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  )
}

function InsightBox({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 'var(--radius-md)',
      background: `${color}05`, border: `1px solid ${color}15`,
      marginBottom: 6,
    }}>
      <div style={{ fontSize: 'var(--text-xs)', color, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: T.text2, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

function CaseBox({ label, text, color, icon }: { label: string; text: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      background: `${color}05`, border: `1px solid ${color}15`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 'var(--text-xs)', color, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: T.text2, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
