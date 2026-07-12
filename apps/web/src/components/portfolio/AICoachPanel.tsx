'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  Brain, Send, Loader2, AlertTriangle, TrendingUp, BookOpen,
  ChevronDown, ChevronUp, MessageCircle, RefreshCw, Star,
  Award, Sparkles, X
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'

/* ── Theme ── */
import T from '@/lib/unified-tokens'
import { ScopedStyle } from '@/components/ScopedStyle'

/* ── Types ── */
interface AdviceItem {
  type: 'warning' | 'opportunity' | 'education'
  icon: string
  text: string
}

interface CoachData {
  rating: string
  statistics: any
  adviceText: string
  adviceItems: AdviceItem[]
  totalTrades: number
  createdAt: string
}

interface ChatMessage {
  role: 'user' | 'coach'
  content: string
  timestamp: Date
}

/* ── Rating display ── */
function RatingBadge({ rating }: { rating: string }) {
  const t = useTranslations('aiCoach')
  const config: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
    excellent: { label: t('ratingExcellent'), color: T.green, bg: `${T.green}14`, border: `${T.green}44`, icon: Award },
    good: { label: t('ratingGood'), color: T.blue, bg: `${T.blue}14`, border: `${T.blue}44`, icon: Star },
    needs_improvement: { label: t('ratingNeedsImprovement'), color: T.amber, bg: `${T.amber}14`, border: `${T.amber}44`, icon: AlertTriangle },
    insufficient_data: { label: t('ratingInsufficientData'), color: T.text3, bg: `${T.text3}0a`, border: `${T.text3}33`, icon: BookOpen },
  }
  const c = config[rating] || config.insufficient_data
  const Icon = c.icon
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 'var(--radius-lg)',
      background: c.bg, border: `0.5px solid ${c.border}`,
    }}>
      <Icon size={14} color={c.color} />
      <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)', fontWeight: 700, color: c.color }}>{c.label}</span>
    </div>
  )
}

/* ── Advice card with icon ── */
function AdviceCard({ item, index, onAskCoach }: { item: AdviceItem; index: number; onAskCoach: (text: string) => void }) {
  const t = useTranslations('aiCoach')
  const [expanded, setExpanded] = useState(false)
  const iconConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    warning: { icon: AlertTriangle, color: T.amber, bg: `${T.amber}14`, label: t('tipWarning') },
    opportunity: { icon: TrendingUp, color: T.green, bg: `${T.green}14`, label: t('tipOpportunity') },
    education: { icon: BookOpen, color: T.cyan, bg: `${T.cyan}14`, label: t('tipEducation') },
  }
  const c = iconConfig[item.type] || iconConfig.education
  const Icon = c.icon

  return (
    <div
      className="coach-advice-card"
      style={{
        background: T.card,
        border: `0.5px solid ${c.color}22`,
        borderRadius: 'var(--radius-lg)',
        padding: '10px 12px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Accent line */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg, ${c.color}, transparent)`,
        borderRadius: '0 10px 10px 0',
      }} />

      {/* Icon */}
      <div style={{
        flexShrink: 0, width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: c.bg, borderRadius: 'var(--radius-md)',
        border: `0.5px solid ${c.color}33`,
      }}>
        <Icon size={14} color={c.color} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', fontWeight: 700,
            color: c.color, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
            background: c.bg,
          }}>{c.label}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', color: T.text3 }}>#{index + 1}</span>
        </div>
        <p style={{
          fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', lineHeight: 1.7,
          color: T.text, margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 999 : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
        }}>
          {item.text}
        </p>

        {/* Ask coach button (visible on expand) */}
        {expanded && (
          <button
            onClick={(e) => { e.stopPropagation(); onAskCoach(item.text) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              background: `${T.purple}14`, border: `0.5px solid ${T.purple}44`,
              color: T.purple, fontFamily: "var(--font-ar)",
              fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
              marginTop: 8, transition: 'all 0.2s',
            }}
          >
            <MessageCircle size={10} />
            {t('askCoach')}
          </button>
        )}
      </div>

      {/* Expand indicator */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {expanded ? <ChevronUp size={12} color={T.text3} /> : <ChevronDown size={12} color={T.text3} />}
      </div>
    </div>
  )
}

/* ── Chat message bubble ── */
function ChatBubble({ message }: { message: ChatMessage }) {
  const t = useTranslations('aiCoach')
  const isUser = message.role === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-start' : 'flex-end',
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: '85%', padding: '8px 12px',
        background: isUser ? `${T.blue}14` : `${T.purple}0a`,
        border: `0.5px solid ${isUser ? `${T.blue}33` : `${T.purple}22`}`,
        borderRadius: isUser ? '10px 10px 10px 2px' : '10px 10px 2px 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          {isUser ? (
            <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', fontWeight: 700, color: T.blue }}>{t('chatUser')}</span>
          ) : (
            <>
              <Brain size={10} color={T.purple} />
              <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', fontWeight: 700, color: T.purple }}>{t('chatCoach')}</span>
            </>
          )}
        </div>
        <p style={{
          fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', lineHeight: 1.7,
          color: T.text, margin: 0, whiteSpace: 'pre-wrap',
        }}>{message.content}</p>
      </div>
    </div>
  )
}

/* ── Main AICoachPanel Component ── */
export default function AICoachPanel() {
  const t = useTranslations('aiCoach')
  const { user } = useAuth()
  const { closedTrades, trades: openTrades } = usePaperTradesStore()
  const [coachData, setCoachData] = useState<CoachData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Fetch performance advice on mount
  const fetchAdvice = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // FIX: Read closed trades from API (DB) first, fallback to localStorage
      // Previously read only from localStorage — lost on browser clear
      let closedTrades: any[] = [];
      try {
        const tradesRes = await fetch('/api/trading/history?limit=50');
        if (tradesRes.ok) {
          const tradesData = await tradesRes.json();
          closedTrades = Array.isArray(tradesData?.trades) ? tradesData.trades : [];
        }
      } catch {
        // Fallback to localStorage if API fails
        try {
          const local = localStorage.getItem('roua_closed_trades');
          if (local) closedTrades = JSON.parse(local);
        } catch { /* no trades */ }
      }

      const res = await fetch('/api/coach/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 'anonymous',
          closedPaperTrades: closedTrades.map(t => ({
            symbol: t.symbol,
            side: t.side === 'long' ? 'BUY' : 'SELL',
            realizedPnl: t.realizedPnl,
            realizedPct: t.realizedPct,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            closeTime: t.closeTime,
          })),
          openPaperTrades: openTrades.map(t => ({
            symbol: t.symbol,
            side: t.side === 'long' ? 'BUY' : 'SELL',
            unrealizedPnl: t.unrealizedPnl,
            entryPrice: t.entryPrice,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCoachData(data.data)
      } else {
        setError(data.error || t('errorFetchFailed'))
      }
    } catch (e: any) {
      setError(t('errorConnection'))
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetchAdvice() }, [fetchAdvice])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Ask coach a question
  const handleAskCoach = async (question?: string) => {
    const q = question || chatInput.trim()
    if (!q) return

    setChatMessages(prev => [...prev, { role: 'user', content: q, timestamp: new Date() }])
    setChatInput('')
    setChatLoading(true)
    setShowChat(true)

    try {
      const res = await fetch('/api/coach/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: coachData?.adviceText || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setChatMessages(prev => [...prev, {
          role: 'coach', content: data.data.answer, timestamp: new Date()
        }])
      } else {
        setChatMessages(prev => [...prev, {
          role: 'coach', content: t('errorAnswerFailed'), timestamp: new Date()
        }])
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'coach', content: t('errorChatConnection'), timestamp: new Date()
      }])
    }
    setChatLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAskCoach()
    }
  }

  // Stats quick view
  const stats = coachData?.statistics

  return (
    <div style={{
      width: '100%', direction: 'inherit', fontFamily: "var(--font-ar)",
    }}>
      <ScopedStyle>{`
        .coach-advice-card:hover {
          border-color: rgba(10,132,255,0.3) !important;
          transform: translateY(-1px);
        }
        @keyframes coachFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .coach-fade-in {
          animation: coachFadeIn 0.4s ease-out forwards;
        }
        @keyframes coachPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .coach-pulse {
          animation: coachPulse 1.5s ease-in-out infinite;
        }
      `}</ScopedStyle>

      {/* ── Performance Rating Card ── */}
      <div style={{
        background: `linear-gradient(135deg, ${T.card}, ${T.bg2})`,
        border: `0.5px solid ${T.border2}`,
        borderRadius: 'var(--radius-lg)', padding: '14px 16px',
        marginBottom: 12, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -30, left: -30, width: 100, height: 100,
          background: `radial-gradient(circle, ${T.purple}15, transparent)`,
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute', bottom: -20, right: -20, width: 80, height: 80,
          background: `radial-gradient(circle, ${T.blue}10, transparent)`,
          borderRadius: '50%',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.purple}14`, borderRadius: 'var(--radius-lg)',
            border: `0.5px solid ${T.purple}33`,
          }}>
            <Brain size={20} color={T.purple} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-base)', fontWeight: 800, color: T.text }}>
                {t('headerTitle')}
              </span>
              <Sparkles size={12} color={T.amber} />
            </div>
            <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.text2 }}>
              {t('headerSubtitle')}
            </span>
          </div>
          <button
            onClick={fetchAdvice}
            disabled={loading}
            style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              background: T.card, border: `0.5px solid ${T.border}`,
              color: T.text3, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Rating + Quick stats */}
        {coachData && (
          <div style={{ marginTop: 12, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.text2 }}>
                {t('performanceRating')}
              </span>
              <RatingBadge rating={coachData.rating} />
            </div>

            {/* Quick stats bar */}
            {stats && (
              <div style={{
                display: 'flex', gap: 12, marginTop: 10,
                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                background: `${T.bg}80`,
                border: `0.5px solid ${T.border}`,
                flexWrap: 'wrap',
              }}>
                <StatChip label={t('statTrades')} value={String(stats.totalTrades || 0)} color={T.cyan} />
                <StatChip label={t('statWinRate')} value={`${stats.winRate || 0}%`} color={stats.winRate >= 50 ? T.green : T.red} />
                <StatChip label={t('statProfitFactor')} value={String(stats.profitFactor === -1 ? '∞' : stats.profitFactor || 0)} color={T.amber} />
                <StatChip label={t('statMaxDrawdown')} value={`$${stats.maxDrawdown || 0}`} color={T.red} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center',
        }}>
          <Brain size={32} color={T.purple} style={{ margin: '0 auto 12px' }} className="coach-pulse" />
          <p style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)', color: T.text, marginBottom: 4 }}>
            {t('loadingAnalysis')}
          </p>
          <p style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.text3 }}>
            {t('loadingExamining')}
          </p>
        </div>
      )}

      {/* ── Error state ── */}
      {error && !loading && (
        <div style={{
          background: `${T.red}08`, border: `0.5px solid ${T.red}22`,
          borderRadius: 'var(--radius-lg)', padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} color={T.red} />
          <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.red, flex: 1 }}>{error}</span>
          <button onClick={fetchAdvice} style={{
            padding: '3px 10px', borderRadius: 'var(--radius-sm)',
            background: `${T.red}18`, color: T.red,
            border: `0.5px solid ${T.red}44`,
            fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', cursor: 'pointer',
          }}>{t('retry')}</button>
        </div>
      )}

      {/* ── Insufficient data message ── */}
      {coachData && coachData.rating === 'insufficient_data' && !loading && (
        <div style={{
          background: `${T.amber}08`, border: `0.5px solid ${T.amber}22`,
          borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 12, textAlign: 'center',
        }}>
          <BookOpen size={24} color={T.amber} style={{ margin: '0 auto 8px' }} />
          <p style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)', color: T.text, fontWeight: 700 }}>
            {t('insufficientDataTitle')}
          </p>
          <p style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.text3, marginTop: 4 }}>
            {t('insufficientDataDesc')}
          </p>
        </div>
      )}

      {/* ── Advice Cards ── */}
      {coachData && coachData.adviceItems.length > 0 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 3, height: 14, borderRadius: 'var(--radius-xs)', background: T.purple }} />
            <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text }}>
              {t('coachTips')}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', color: T.text3 }}>
              {coachData.adviceItems.length} {t('tipCount')}
            </span>
          </div>
          {coachData.adviceItems.map((item, i) => (
            <div key={`advice-${item.type}-${i}`} className="coach-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
              <AdviceCard item={item} index={i} onAskCoach={(text) => handleAskCoach(`${t('askCoachMore')}${text}`)} />
            </div>
          ))}
        </div>
      )}

      {/* ── Chat Section ── */}
      {coachData && !loading && (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        }}>
          {/* Chat header */}
          <div
            onClick={() => setShowChat(!showChat)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px',
              borderBottom: showChat ? `0.5px solid ${T.border}` : 'none',
              background: `linear-gradient(90deg, ${T.purple}0a, transparent)`,
              cursor: 'pointer',
            }}
          >
            <div style={{ width: 3, height: 14, borderRadius: 'var(--radius-xs)', background: T.purple }} />
            <MessageCircle size={13} color={T.purple} />
            <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text, flex: 1 }}>
              {t('chatHeader')}
            </span>
            {chatMessages.length > 0 && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', color: T.text3,
                padding: '1px 6px', borderRadius: 'var(--radius-lg)', background: `${T.purple}14`,
              }}>
                {chatMessages.length}
              </span>
            )}
            {showChat ? <ChevronUp size={12} color={T.text3} /> : <ChevronDown size={12} color={T.text3} />}
          </div>

          {showChat && (
            <>
              {/* Chat messages */}
              <div style={{
                maxHeight: 300, overflowY: 'auto', padding: '10px 14px',
                background: `${T.bg}40`,
              }}>
                {chatMessages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <Brain size={20} color={T.text3} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                    <p style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.text3 }}>
                      {t('chatEmpty')}
                    </p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <ChatBubble key={`msg-${i}-${msg.role}`} message={msg} />
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <div style={{
                      padding: '6px 12px', background: `${T.purple}0a`,
                      border: `0.5px solid ${T.purple}22`,
                      borderRadius: '10px 10px 2px 10px',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Loader2 size={10} className="animate-spin" color={T.purple} />
                      <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.purple }}>
                        {t('coachThinking')}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div style={{
                display: 'flex', gap: 6,
                padding: '8px 10px',
                borderTop: `0.5px solid ${T.border}`,
                background: T.card,
              }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chatPlaceholder')}
                  style={{
                    flex: 1, padding: '8px 12px',
                    background: `${T.bg}80`, border: `0.5px solid ${T.border}`,
                    borderRadius: 'var(--radius-md)', color: T.text,
                    fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)',
                    outline: 'none', direction: 'inherit',
                  }}
                  disabled={chatLoading}
                />
                <button
                  onClick={() => handleAskCoach()}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: chatInput.trim() ? `${T.purple}18` : T.card,
                    border: `0.5px solid ${chatInput.trim() ? `${T.purple}44` : T.border}`,
                    borderRadius: 'var(--radius-md)', cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                    color: chatInput.trim() ? T.purple : T.text3,
                    transition: 'all 0.2s',
                    opacity: chatLoading ? 0.5 : 1,
                  }}
                >
                  {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Stat Chip ── */
function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: "var(--font-ar)", fontSize: 'var(--text-xs)', color: T.text3 }}>{label}:</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', fontWeight: 700, color }}>{value}</span>
    </div>
  )
}
