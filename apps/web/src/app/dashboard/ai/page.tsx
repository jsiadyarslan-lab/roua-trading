'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Brain, Send, Activity, BarChart2, Cpu, AlertTriangle,
  TrendingUp, TrendingDown, Target, Zap, ChevronDown,
  RefreshCw, Shield, MessageSquare, Sparkles, Bot,
  CircleDot, Flame, Eye, Crosshair, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react'
import { PRIMARY_SYMBOLS } from '@/lib/trading-intelligence'

// ── Theme ──
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(10,132,255,0.12)',
  border2: 'rgba(10,132,255,0.20)',
  glass:   'rgba(10,132,255,0.04)',
}

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

// ── Local Storage Helpers ──
const STORAGE_KEY = 'roua-ai-chat-history'

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [{
    id: '1',
    role: 'ai',
    content: 'مرحباً بك في مركز التحليل الذكي! أنا متصل بـ 6 نماذج AI (Gemini, Groq, GLM-4, HuggingFace, Ollama, Bedrock) مع دعم RAG. يمكنني:\n\n• تحليل أي أصل مالي بتفصيل\n• تقديم توصيات شراء/بيع مبنيّة على البيانات\n• قراءة المؤشرات الفنية الحية\n• تقديم تحليل المخاطر المتقدم\n• ترجمة وتحليل الأخبار المالية\n\nماذا تريد أن تحلل اليوم؟',
    timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    model: 'رؤى AI',
    confidence: 100,
    source: 'system',
  }]
}

function saveMessages(messages: Message[]) {
  if (typeof window === 'undefined') return
  try {
    // Keep last 50 messages
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)))
  } catch {}
}

// ── Main Component ──
export default function AIPage() {
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

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Initialize ──
  useEffect(() => {
    setMessages(loadMessages())
    fetchAIStatus()
    fetchTechIndicators()
    fetchNarrator()
  }, [])

  useEffect(() => {
    fetchTechIndicators()
    fetchNarrator()
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
    } catch {}
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
    } catch {} finally {
      setTechLoading(false)
    }
  }

  // ── Fetch Narrator ──
  const fetchNarrator = async () => {
    try {
      const res = await fetch(`/api/ai/narrator?symbol=${encodeURIComponent(selectedSymbol)}`)
      const json = await res.json()
      if (json.success && json.data) {
        setNarratorData(json.data)
      }
    } catch {}
  }

  // ── Fetch Council ──
  const fetchCouncil = async () => {
    setCouncilLoading(true)
    try {
      // Try NestJS first
      try {
        const nestRes = await fetch('/api/ai/council', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedSymbol }),
          signal: AbortSignal.timeout(45000),
        })
        if (nestRes.ok) {
          const nestJson = await nestRes.json()
          if (nestJson.success && nestJson.data && nestJson.data.analyses?.length > 0) {
            setCouncilResult({ ...nestJson.data, source: 'nestjs' })
            setCouncilLoading(false)
            return
          }
        }
      } catch {}

      // Fallback to local consensus
      const localRes = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      })
      const localJson = await localRes.json()
      if (localJson.success && localJson.data) {
        setCouncilResult({ ...localJson.data, source: 'local' })
      }
    } catch {} finally {
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
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages(prev => {
      const updated = [...prev, userMsg]
      saveMessages(updated)
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
        }),
      })

      const json = await res.json()
      if (json.success && json.data) {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: json.data.content,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          model: json.data.model,
          confidence: json.data.confidence,
          source: json.data.source,
        }
        setMessages(prev => {
          const updated = [...prev, aiMsg]
          saveMessages(updated)
          return updated
        })
      }
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.',
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        model: 'fallback',
        confidence: 0,
        source: 'error',
      }
      setMessages(prev => {
        const updated = [...prev, errorMsg]
        saveMessages(updated)
        return updated
      })
    } finally {
      setIsTyping(false)
    }
  }, [isTyping, selectedSymbol])

  // ── Smart Recommendation ──
  const handleSmartRecommendation = () => {
    sendMessage(`أعطني توصية تداول مباشرة لـ ${selectedSymbol} مع تحديد نقطة الدخول ووقف الخسارة والهدف`)
  }

  // ── Comprehensive Analysis ──
  const handleComprehensiveAnalysis = () => {
    sendMessage(`أرجو توليد تحليل شامل لزوج ${selectedSymbol} يشمل التحليل الفني والمشاعر والمخاطر مع التوصية النهائية`)
  }

  // ── Clear Chat ──
  const handleClearChat = () => {
    const initialMsg: Message = {
      id: '1',
      role: 'ai',
      content: 'تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟',
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      model: 'رؤى AI',
      source: 'system',
    }
    setMessages([initialMsg])
    saveMessages([initialMsg])
  }

  // ── Computed values ──
  const sentimentColor = narratorData?.sentiment === 'bullish' ? T.green
    : narratorData?.sentiment === 'bearish' ? T.red
    : narratorData?.sentiment === 'volatile' ? T.amber : T.cyan

  const sentimentAr = narratorData?.sentiment === 'bullish' ? 'صاعد'
    : narratorData?.sentiment === 'bearish' ? 'هابط'
    : narratorData?.sentiment === 'volatile' ? 'متقلب' : 'حيادي'

  const dirAr = techData?.dir === 'buy' ? 'صاعد' : techData?.dir === 'sell' ? 'هابط' : 'محايد'
  const dirColor = techData?.dir === 'buy' ? T.green : techData?.dir === 'sell' ? T.red : T.cyan
  const dirIcon = techData?.dir === 'buy' ? ArrowUpRight : techData?.dir === 'sell' ? ArrowDownRight : Minus

  const recColor = councilResult?.recommendation === 'BUY' ? T.green
    : councilResult?.recommendation === 'SELL' ? T.red : T.amber
  const recAr = councilResult?.recommendation === 'BUY' ? 'شراء'
    : councilResult?.recommendation === 'SELL' ? 'بيع' : 'انتظار'

  // ── Render ──
  return (
    <div style={{
      height: 'calc(100vh - 108px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      direction: 'rtl',
      fontFamily: "'Cairo', sans-serif",
      background: T.bg,
    }}>
      <style>{`
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
      `}</style>

      {/* ── Top Bar: Asset Selector + AI Status + Quick Actions ── */}
      <div style={{
        flexShrink: 0,
        padding: '12px 20px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bg2,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.purple}20, ${T.cyan}20)`,
            border: `1px solid ${T.purple}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={18} color={T.cyan} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>مركز التحليل الذكي</div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: -2 }}>
              {nestjsConnected ? 'متصل بنماذج AI الحقيقية' : 'وضع محلي — مفاتيح API غير مفعلة'}
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
            style={{ width: 130, fontSize: 13, fontWeight: 700 }}
          >
            {PRIMARY_SYMBOLS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Live Price */}
        {techData && (
          <div style={{
            padding: '6px 12px', borderRadius: 8,
            background: `${dirColor}08`, border: `1px solid ${dirColor}25`,
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
            color: dirColor, fontFamily: "'JetBrains Mono', monospace",
          }}>
            {techData.dir === 'buy' ? <ArrowUpRight size={14} /> : techData.dir === 'sell' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            {techData.price > 1000 ? (techData.price?.toFixed(2) ?? '—') : (techData.price?.toFixed(5) ?? '—')}
            <span style={{ fontSize: 10, color: T.text3, fontWeight: 500 }}>
              {techData.change >= 0 ? '+' : ''}{techData.change?.toFixed(2) ?? '—'}%
            </span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* AI Models Status */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { name: 'Gemini', color: T.cyan, key: 'GOOGLE_AI_STUDIO_API_KEY' },
            { name: 'Groq', color: T.blue, key: 'GROQ_API_KEY' },
            { name: 'GLM-4', color: T.amber, key: 'GLM_API_KEY' },
            { name: 'HF', color: T.green, key: 'HUGGINGFACE_API_KEY' },
            { name: 'Ollama', color: '#a78bfa', key: 'OLLAMA_API_KEY' },
            { name: 'Bedrock', color: '#ff9900', key: 'AWS_ACCESS_KEY_ID' },
          ].map(m => {
            const modelInfo = modelsStatus.find(ms => ms.model.includes(m.name))
            const available = nestjsConnected && (modelInfo?.available ?? false)
            return (
              <div key={m.name} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 16,
                background: available ? `${m.color}10` : T.bg,
                border: `1px solid ${available ? `${m.color}30` : T.border}`,
                fontSize: 10, fontWeight: 700, color: available ? m.color : T.text3,
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
          onClick={handleSmartRecommendation}
          disabled={isTyping}
          style={{
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: `linear-gradient(90deg, ${T.cyan}, ${T.blue})`,
            color: '#000', fontWeight: 800, fontSize: 11,
            cursor: isTyping ? 'not-allowed' : 'pointer',
            opacity: isTyping ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          <Zap size={13} fill="#000" />
          توصية ذكية
        </button>
        <button
          onClick={handleComprehensiveAnalysis}
          disabled={isTyping}
          style={{
            padding: '7px 14px', borderRadius: 8,
            border: `1px solid ${T.purple}40`,
            background: `${T.purple}10`,
            color: T.purple, fontWeight: 700, fontSize: 11,
            cursor: isTyping ? 'not-allowed' : 'pointer',
            opacity: isTyping ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          <Sparkles size={13} />
          تحليل شامل
        </button>
      </div>

      {/* ── Main Content: 3-Column Layout ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══════ Right Column: Technical Indicators & Market Context ═══════ */}
        <div style={{
          flex: '0 0 300px',
          borderLeft: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Sentiment Card */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: T.text3, fontWeight: 700 }}>مزاج السوق</span>
              <Activity size={14} color={sentimentColor} />
            </div>
            <div style={{
              textAlign: 'center', padding: '12px 0',
            }}>
              <div style={{
                fontSize: 26, fontWeight: 900, color: sentimentColor,
                fontFamily: "'JetBrains Mono', monospace",
                textShadow: `0 0 20px ${sentimentColor}30`,
              }}>
                {narratorData ? sentimentAr : '—'}
              </div>
              {narratorData && (
                <div style={{
                  fontSize: 10, color: T.text3, marginTop: 6,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  ثقة: {narratorData.confidence}% | مخاطرة: {narratorData.risk === 'Low' ? 'منخفضة' : narratorData.risk === 'Medium' ? 'متوسطة' : 'عالية'}
                </div>
              )}
            </div>
            {narratorData?.summary && (
              <div style={{
                padding: '10px', borderRadius: 8, background: T.bg,
                border: `1px solid ${T.border}`,
                fontSize: 10, color: T.text2, lineHeight: 1.6,
              }}>
                {narratorData.summary}
              </div>
            )}
          </div>

          {/* Technical Indicators */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${T.border}`, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: T.text3, fontWeight: 700 }}>المؤشرات الفنية ({selectedSymbol})</span>
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
                    height: 52, borderRadius: 8,
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
                  label="التوجه"
                  value={dirAr}
                  subValue={`${techData.strength}%`}
                  color={dirColor}
                  icon={dirIcon}
                />

                {/* RSI */}
                <IndicatorCard
                  label="RSI (14)"
                  value={String(techData.rsi)}
                  subValue={techData.rsi < 30 ? 'تشبع بيعي' : techData.rsi > 70 ? 'تشبع شرائي' : 'محايد'}
                  color={techData.rsi < 30 ? T.green : techData.rsi > 70 ? T.red : T.cyan}
                />

                {/* EMA Cross */}
                <IndicatorCard
                  label="EMA (20/50)"
                  value={techData.ema20 > techData.ema50 ? 'تقاطع صاعد' : 'تقاطع هابط'}
                  subValue={`Δ ${Math.abs(techData.ema20 - techData.ema50).toFixed(2)}`}
                  color={techData.ema20 > techData.ema50 ? T.green : T.red}
                />

                {/* Signal Class */}
                <IndicatorCard
                  label="تصنيف الإشارة"
                  value={techData.signalClass === 'trend' ? 'اتجاهي' : techData.signalClass === 'reversion' ? 'ارتداد' : techData.signalClass === 'breakout' ? 'اختراق' : 'مراقبة'}
                  subValue={`دخول: ${techData.entryBias === 'follow' ? 'متابعة' : techData.entryBias === 'fade' ? 'عكسي' : 'انتظار'}`}
                  color={techData.signalClass === 'trend' ? T.green : techData.signalClass === 'breakout' ? T.amber : T.purple}
                />

                {/* Reasons */}
                {techData.reasons.length > 0 && (
                  <div style={{
                    padding: '10px', borderRadius: 8,
                    background: T.bg, border: `1px solid ${T.border}`,
                    fontSize: 10, color: T.text2, lineHeight: 1.5,
                  }}>
                    <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 6 }}>الأسباب</div>
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
                padding: '20px', textAlign: 'center', color: T.text3, fontSize: 11,
              }}>
                لا توجد بيانات فنية متاحة حالياً
              </div>
            )}
          </div>

          {/* Narrator Quick Insights */}
          {narratorData && (
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.text3, fontWeight: 700 }}>رؤى سريعة</span>
                <Eye size={12} color={T.purple} />
              </div>
              {narratorData.bullCase && (
                <InsightBox label="سيناريو صاعد" text={narratorData.bullCase} color={T.green} />
              )}
              {narratorData.bearCase && (
                <InsightBox label="سيناريو هابط" text={narratorData.bearCase} color={T.red} />
              )}
              {narratorData.keyRisk && (
                <InsightBox label="المخاطرة الرئيسية" text={narratorData.keyRisk} color={T.amber} />
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
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>محادثة التحليل الذكي</span>
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 10,
                background: nestjsConnected ? `${T.green}12` : `${T.amber}12`,
                border: `1px solid ${nestjsConnected ? `${T.green}30` : `${T.amber}30`}`,
                color: nestjsConnected ? T.green : T.amber,
                fontWeight: 700,
              }}>
                {nestjsConnected ? 'AI حقيقي' : 'وضع محلي'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={handleClearChat}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${T.border}`, background: T.bg,
                  color: T.text3, fontSize: 10, cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                }}
              >
                مسح المحادثة
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div style={{
            flex: 1, padding: '20px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {messages.map((msg) => (
              <div key={msg.id} className={msg.role === 'ai' ? 'chat-msg-ai' : ''} style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 10, alignItems: 'flex-start',
                maxWidth: '85%',
              }}>
                {msg.role === 'ai' && (
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
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
                  color: T.text, fontSize: 13, lineHeight: 1.8,
                  padding: '12px 16px', borderRadius: 12,
                  border: msg.role === 'ai' ? `0.5px solid ${T.border}` : 'none',
                  borderTopRightRadius: msg.role === 'user' ? 4 : 12,
                  borderTopLeftRadius: msg.role === 'ai' ? 4 : 12,
                  whiteSpace: 'pre-wrap',
                  minWidth: 200,
                }}>
                  {msg.content}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginTop: 8, paddingTop: 6, borderTop: `0.5px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.1)' : T.border}`,
                  }}>
                    <span style={{
                      fontSize: 8, color: msg.role === 'user' ? 'rgba(255,255,255,0.4)' : T.text3,
                    }}>
                      {msg.timestamp}
                    </span>
                    {msg.role === 'ai' && msg.model && (
                      <span style={{
                        fontSize: 8, padding: '1px 6px', borderRadius: 4,
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
                  width: 30, height: 30, borderRadius: 8,
                  background: `${T.cyan}15`,
                  border: `1px solid ${T.cyan}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Bot size={14} color={T.cyan} />
                </div>
                <div style={{
                  background: T.card, padding: '14px 20px', borderRadius: 12, borderTopLeftRadius: 4,
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
                  <span style={{ fontSize: 10, color: T.text3, marginRight: 6 }}>
                    {nestjsConnected ? 'AI يحلل...' : 'تحليل محلي...'}
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'تحليل فني', prompt: `حلل ${selectedSymbol} فنياً مع المؤشرات والمستويات` },
                { label: 'مستويات الدعم والمقاومة', prompt: `ما هي مستويات الدعم والمقاومة لـ ${selectedSymbol}؟` },
                { label: 'تحليل مخاطر', prompt: `حلل مخاطر التداول على ${selectedSymbol} الآن` },
                { label: 'أفضل وقت للدخول', prompt: `ما هو أفضل توقيت للدخول في ${selectedSymbol} حالياً؟` },
              ].map(qp => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={isTyping}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: `1px solid ${T.border}`, background: T.bg,
                    color: T.text3, fontSize: 10, cursor: isTyping ? 'not-allowed' : 'pointer',
                    fontFamily: "'Cairo', sans-serif",
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
                placeholder={`اسأل عن ${selectedSymbol} أو أي أصل مالي...`}
                style={{
                  flex: 1, background: T.bg, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: '12px 16px',
                  color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 13,
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = T.cyan}
                onBlur={e => e.target.style.borderColor = T.border}
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={isTyping || !inputValue.trim()}
                style={{
                  width: 46, borderRadius: 10, border: 'none',
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
        <div style={{
          flex: '0 0 320px',
          borderRight: `1px solid ${T.border}`,
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
              label="مجلس AI"
            />
            <TabButton
              active={rightTab === 'narrator'}
              onClick={() => setRightTab('narrator')}
              icon={<MessageSquare size={14} />}
              label="السرد الذكي"
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>مجلس النماذج الذكية</span>
                </div>
                <button
                  onClick={fetchCouncil}
                  disabled={councilLoading}
                  style={{
                    padding: '5px 12px', borderRadius: 6,
                    border: 'none', background: T.cyan, color: '#000',
                    fontWeight: 800, fontSize: 10, cursor: councilLoading ? 'not-allowed' : 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    opacity: councilLoading ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RefreshCw size={10} className={councilLoading ? 'spinning' : ''} />
                  {councilLoading ? 'جاري...' : 'تفعيل المجلس'}
                </button>
              </div>

              {/* Council Result */}
              {councilLoading ? (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12,
                  color: T.text3, fontSize: 11,
                }}>
                  <RefreshCw size={24} color={T.cyan} className="spinning" />
                  <span>المجلس ي deliberates على {selectedSymbol}...</span>
                </div>
              ) : councilResult ? (
                <>
                  {/* Consensus Score */}
                  <div style={{
                    textAlign: 'center', padding: '16px', borderRadius: 12,
                    background: `${recColor}06`, border: `1px solid ${recColor}20`,
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontSize: 36, fontWeight: 900, color: recColor,
                      fontFamily: "'JetBrains Mono', monospace",
                      textShadow: `0 0 20px ${recColor}30`,
                    }}>
                      {recAr}
                    </div>
                    <div style={{
                      fontSize: 12, color: T.text2, marginTop: 4,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      إجماع {councilResult.consensusScore}%
                      {councilResult.source === 'nestjs' && (
                        <span style={{ color: T.green, marginRight: 6 }}>• AI حقيقي</span>
                      )}
                    </div>
                    {/* Score Bar */}
                    <div style={{
                      width: '100%', height: 6, background: T.bg,
                      borderRadius: 4, marginTop: 10, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${councilResult.consensusScore}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${recColor}, ${T.cyan})`,
                        borderRadius: 4,
                        transition: 'width 1s ease-out',
                      }} />
                    </div>
                  </div>

                  {/* Individual Votes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    {councilResult.analyses.map((vote, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: T.bg, border: `1px solid ${T.border}`,
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: 4,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                            {vote.role}
                          </span>
                          <span style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 4,
                            background: vote.vote === 'BUY' ? `${T.green}12` : vote.vote === 'SELL' ? `${T.red}12` : `${T.amber}12`,
                            color: vote.vote === 'BUY' ? T.green : vote.vote === 'SELL' ? T.red : T.amber,
                            fontWeight: 700,
                          }}>
                            {vote.vote === 'BUY' ? 'شراء' : vote.vote === 'SELL' ? 'بيع' : 'انتظار'} • {vote.confidence}%
                          </span>
                        </div>
                        <div style={{
                          fontSize: 9, color: T.text3, lineHeight: 1.5,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {vote.reason}
                        </div>
                        {vote.model && (
                          <div style={{ fontSize: 8, color: T.text3, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                            {vote.model}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Master Strategy */}
                  {councilResult.masterStrategy && (
                    <div style={{
                      marginTop: 12, padding: '12px', borderRadius: 8,
                      background: `${T.cyan}05`, border: `1px solid ${T.cyan}20`,
                      fontSize: 10, color: T.text2, lineHeight: 1.6,
                    }}>
                      <div style={{ fontSize: 9, color: T.cyan, fontWeight: 700, marginBottom: 4 }}>الاستراتيجية الرئيسية</div>
                      {councilResult.masterStrategy}
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                  color: T.text3, fontSize: 11, textAlign: 'center',
                }}>
                  <Shield size={28} color={T.text3} style={{ opacity: 0.3 }} />
                  <span>اضغط "تفعيل المجلس" لبدء تصويت<br />نماذج AI على {selectedSymbol}</span>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>السرد الذكي</span>
                </div>
                <button
                  onClick={fetchNarrator}
                  style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: `1px solid ${T.border}`, background: T.bg,
                    color: T.text3, fontSize: 9, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RefreshCw size={10} /> تحديث
                </button>
              </div>

              {narratorData ? (
                <>
                  {/* Sentiment & Risk */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <NarratorBadge
                      label="التوجه"
                      value={sentimentAr}
                      color={sentimentColor}
                    />
                    <NarratorBadge
                      label="المخاطرة"
                      value={narratorData.risk === 'Low' ? 'منخفضة' : narratorData.risk === 'Medium' ? 'متوسطة' : 'عالية'}
                      color={narratorData.risk === 'Low' ? T.green : narratorData.risk === 'Medium' ? T.amber : T.red}
                    />
                    <NarratorBadge
                      label="الثقة"
                      value={`${narratorData.confidence}%`}
                      color={T.cyan}
                    />
                  </div>

                  {/* Narrative Text */}
                  <div style={{
                    padding: '14px', borderRadius: 10,
                    background: T.bg, border: `1px solid ${T.border}`,
                    fontSize: 11, color: T.text, lineHeight: 1.8,
                    flex: 1, overflowY: 'auto',
                  }}>
                    {narratorData.narrative}
                  </div>

                  {/* Bull/Bear Cases */}
                  {narratorData.bullCase && (
                    <CaseBox label="السيناريو الصاعد" text={narratorData.bullCase} color={T.green} icon={<TrendingUp size={12} />} />
                  )}
                  {narratorData.bearCase && (
                    <CaseBox label="السيناريو الهابط" text={narratorData.bearCase} color={T.red} icon={<TrendingDown size={12} />} />
                  )}
                  {narratorData.nextTrigger && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: `${T.cyan}05`, border: `1px solid ${T.cyan}20`,
                      fontSize: 10, color: T.text2, lineHeight: 1.6,
                    }}>
                      <strong style={{ color: T.cyan }}>المحفز التالي:</strong> {narratorData.nextTrigger}
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.text3, fontSize: 11,
                }}>
                  جاري تحميل السرد الذكي...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spinning animation for RefreshCw */}
      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Sub-Components ──

function IndicatorCard({ label, value, subValue, color, icon: Icon }: {
  label: string; value: string; subValue: string; color: string; icon?: any
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', background: T.bg, borderRadius: 8,
      border: `0.5px solid ${T.border}`,
    }}>
      <div>
        <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 4 }}>
          {Icon && <Icon size={14} />}
          {value}
        </div>
      </div>
      <div style={{
        padding: '3px 8px', borderRadius: 4,
        background: `${color}12`, color,
        fontSize: 9, fontWeight: 700,
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
        fontSize: 11, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontFamily: "'Cairo', sans-serif",
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
      flex: 1, padding: '8px', borderRadius: 8,
      background: `${color}06`, border: `1px solid ${color}20`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 8, color: T.text3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  )
}

function InsightBox({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8,
      background: `${color}05`, border: `1px solid ${color}15`,
      marginBottom: 6,
    }}>
      <div style={{ fontSize: 9, color, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

function CaseBox({ label, text, color, icon }: { label: string; text: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: `${color}05`, border: `1px solid ${color}15`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
