'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import {
  Brain, Loader2, TrendingUp, TrendingDown, Minus,
  ChevronLeft, Sparkles, BarChart3, MessageCircle
} from 'lucide-react'

type AnalysisVote = 'BUY' | 'SELL' | 'HOLD'
type Analysis = { model: string; vote: AnalysisVote; confidence: number; reason: string }
type Consensus = {
  recommendation: string
  consensusScore: number
  analyses: Analysis[]
  timestamp: string
}

const MODEL_ICONS: Record<string, string> = {
  gpt: '🧠', claude: '🎭', deepseek: '🔍', llama: '🦙', gemini: '💎', mistral: '🌀',
}

const VOTE_CONFIG: Record<AnalysisVote, { color: string; bg: string; label: string; icon: any }> = {
  BUY: { color: '#00FFA3', bg: 'rgba(0,255,163,0.08)', label: 'شراء', icon: TrendingUp },
  SELL: { color: '#FF4757', bg: 'rgba(255,69,58,0.08)', label: 'بيع', icon: TrendingDown },
  HOLD: { color: '#FFB800', bg: 'rgba(255,184,0,0.08)', label: 'انتظار', icon: Minus },
}

export default function MobileAiPage() {
  const { selectedSymbol } = useSymbolStore()
  const [consensus, setConsensus] = useState<Consensus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatLoading, setChatLoading] = useState(false)

  const fetchConsensus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/consensus?symbol=${selectedSymbol}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) setConsensus(data.data)
      } else {
        setError('فشل في جلب البيانات')
      }
    } catch {
      setError('خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol])

  useEffect(() => {
    fetchConsensus()
    const interval = setInterval(fetchConsensus, 60000)
    return () => clearInterval(interval)
  }, [fetchConsensus])

  const rec = (consensus?.recommendation as AnalysisVote) ?? 'HOLD'
  const score = consensus?.consensusScore ?? 0
  const analyses = consensus?.analyses ?? []
  const votes = analyses.reduce((acc, a) => {
    if (a.vote === 'BUY') acc.buy += 1
    else if (a.vote === 'SELL') acc.sell += 1
    else acc.hold += 1
    return acc
  }, { buy: 0, sell: 0, hold: 0 })
  const total = votes.buy + votes.sell + votes.hold
  const recConfig = VOTE_CONFIG[rec] || VOTE_CONFIG.HOLD

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, symbol: selectedSymbol, context: 'council' }),
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.message || 'لا يوجد رد' }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'خطأ في الاتصال بالمساعد' }])
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="r-page">
      <PageHeader title="مجلس الذكاء الاصطناعي" subtitle={`${selectedSymbol} — 6 نماذج AI`} />

      {/* Consensus Summary */}
      <Card highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `${recConfig.color}15`, border: `1px solid ${recConfig.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: recConfig.color, fontFamily: 'var(--font-mono)' }}>{score}%</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: recConfig.color, fontFamily: 'var(--font-cairo)' }}>
                توصية: {recConfig.label}
              </div>
              <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
                {selectedSymbol} — ثقة {score}%
              </div>
            </div>
          </div>
          <button
            onClick={fetchConsensus}
            disabled={loading}
            style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', cursor: loading ? 'wait' : 'pointer', touchAction: 'manipulation' }}
          >
            {loading ? <Loader2 size={14} className="r-anim-spin" color="#00D4FF" /> : <Sparkles size={14} color="#00D4FF" />}
          </button>
        </div>

        {/* Vote Distribution Bar */}
        {total > 0 && (
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', direction: 'ltr', marginBottom: 8 }}>
            <div style={{ width: `${(votes.buy / total) * 100}%`, background: '#00FFA3', borderRadius: 3 }} />
            <div style={{ width: `${(votes.hold / total) * 100}%`, background: '#FFB800', borderRadius: 3 }} />
            <div style={{ width: `${(votes.sell / total) * 100}%`, background: '#FF4757', borderRadius: 3 }} />
          </div>
        )}

        {/* Vote Summary */}
        {total > 0 && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#00FFA3', fontFamily: 'var(--font-cairo)' }}>{votes.buy} شراء</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', fontFamily: 'var(--font-cairo)' }}>{votes.hold} انتظار</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FF4757', fontFamily: 'var(--font-cairo)' }}>{votes.sell} بيع</span>
          </div>
        )}
      </Card>

      {error && (
        <Card>
          <div style={{ textAlign: 'center', padding: 16 }}>
            <span style={{ fontSize: 12, color: '#FF4757', fontFamily: 'var(--font-cairo)' }}>{error}</span>
          </div>
        </Card>
      )}

      {/* Individual Model Analyses */}
      {analyses.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <BarChart3 size={16} color="#B388FF" />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>تحليلات النماذج</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analyses.map((a, i) => {
              const vc = VOTE_CONFIG[a.vote] || VOTE_CONFIG.HOLD
              const IconComp = vc.icon
              const emoji = MODEL_ICONS[a.model?.toLowerCase()] || '🤖'
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 10, background: vc.bg, border: `0.5px solid ${vc.color}20`,
                }}>
                  <span style={{ fontSize: 18 }}>{emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>{a.model}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: vc.color, fontFamily: 'var(--font-cairo)' }}>{vc.label}</span>
                    </div>
                    {a.reason && (
                      <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 2, lineHeight: 1.4 }}>{a.reason}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: vc.color, fontFamily: 'var(--font-mono)' }}>{a.confidence}%</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* AI Chat */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MessageCircle size={16} color="#00D4FF" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>اسأل المساعد</span>
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8, direction: 'rtl' }} className="r-no-scroll">
          {chatMessages.length === 0 && (
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', textAlign: 'center', padding: 12 }}>
              اسأل أي سؤال عن {selectedSymbol}
            </div>
          )}
          {chatMessages.map((m, i) => (
            <div key={i} style={{
              padding: '6px 10px', borderRadius: 10, marginBottom: 4,
              background: m.role === 'user' ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)',
              border: `0.5px solid ${m.role === 'user' ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <span style={{ fontSize: 10, color: m.role === 'user' ? '#00D4FF' : '#F0F2F5', fontFamily: 'var(--font-cairo)', lineHeight: 1.4 }}>{m.content}</span>
            </div>
          ))}
          {chatLoading && <Loader2 size={14} className="r-anim-spin" color="#00D4FF" style={{ margin: '4px auto', display: 'block' }} />}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChat()}
            placeholder={`اسأل عن ${selectedSymbol}...`}
            style={{
              flex: 1, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.08)', padding: '0 12px', color: '#FFF',
              fontSize: 12, fontFamily: 'var(--font-cairo)', outline: 'none', direction: 'rtl',
            }}
          />
          <button
            onClick={handleChat}
            disabled={chatLoading || !chatInput.trim()}
            style={{
              width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.1)',
              border: '0.5px solid rgba(0,212,255,0.2)', cursor: chatLoading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'manipulation',
            }}
          >
            <Sparkles size={14} color="#00D4FF" />
          </button>
        </div>
      </Card>

      <div style={{ height: 80 }} />
    </div>
  )
}
