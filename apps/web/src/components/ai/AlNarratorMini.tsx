'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { Activity, ShieldCheck, Zap, Bell, CheckCircle2, TrendingUp, TrendingDown, Brain, Crosshair } from 'lucide-react'
import { formatFreshness, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'
import { useTranslations, useLocale } from 'next-intl'
import { ScopedStyle } from '@/components/ScopedStyle'

interface Keyword {
  word: string
  color: string
}

interface NarrativeData {
  narrative: string
  summary?: string
  bullCase?: string
  bearCase?: string
  keyRisk?: string
  nextTrigger?: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  keywords: Keyword[]
  confidence: number // 0-100
  risk: 'Low' | 'Medium' | 'High'
  timestamp: string
}

interface SmartRecommendation {
  action: string
  entry: string
  sl: string
  tp: string
  reason: string
}

export function AlNarratorMini({
  mobile = false,
  compact = false,
  selectedSymbol,
  dataStatus = 'disconnected',
}: {
  mobile?: boolean
  compact?: boolean
  selectedSymbol?: string
  dataStatus?: DataStatus
}) {
  const [data, setData] = useState<NarrativeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [activeBriefs, setActiveBriefs] = useState<Array<{
    pair: string; direction: string; confidence: number;
    entryPrice: number; takeProfit: number; stopLoss: number; timeframe: string;
  }>>([])
  const [showRecommendation, setShowRecommendation] = useState(false)
  const [recommendation, setRecommendation] = useState<SmartRecommendation | null>(null)
  const [recLoading, setRecLoading] = useState(false)
  const [alertToast, setAlertToast] = useState<{ symbol: string; sentiment: string; risk: string; confidence: number; summary: string } | null>(null)
  const t = useTranslations('ai.narrator')
  const tc = useTranslations('common')
  const locale = useLocale()

  const fetchNarrative = useCallback(async () => {
    setLoading(true)
    try {
      // V268: Pass language so the narrator emits content in the user's locale.
      const symbolQuery = selectedSymbol
        ? `?symbol=${encodeURIComponent(selectedSymbol)}&language=${encodeURIComponent(locale)}`
        : `?language=${encodeURIComponent(locale)}`
      const res = await fetch(`/api/ai/narrator${symbolQuery}`)
      const json = await res.json()
      if (json.success) {
        setData({
          ...json.data,
          confidence: json.data.confidence ?? 0,
          risk: json.data.risk ?? 'Medium'
        })
      }
    } catch (err: any) {
      console.error('[AlNarratorMini] Fetch failed:', err?.message || err)
      // Show stale data indicator — don't clear existing data
      setData(prev => prev ? { ...prev, _stale: true } as any : null)
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol, locale])

  // Fetch active council briefs for the current symbol
  const fetchBriefs = useCallback(async () => {
    if (!selectedSymbol) return;
    try {
      const res = await fetch(`/api/strategic-council/briefs/active?symbol=${encodeURIComponent(selectedSymbol)}&language=${encodeURIComponent(locale)}`);
      if (!res.ok) return;
      const json = await res.json();
      const briefs = Array.isArray(json?.briefs) ? json.briefs
        : Array.isArray(json?.data) ? json.data
        : Array.isArray(json) ? json : [];
      setActiveBriefs(briefs.filter((b: any) => b.isActive).slice(0, 3));
    } catch { /* silent — briefs are supplementary */ }
  }, [selectedSymbol, locale]);

  useEffect(() => {
    fetchNarrative();
    fetchBriefs();
  }, [fetchNarrative, fetchBriefs]);
  // Poll every 30s — pauses when tab hidden
  useVisibleInterval(fetchNarrative, 30000);
  useVisibleInterval(fetchBriefs, 60000); // refresh briefs every minute

  // ── Smart Recommendation (functional) ──
  const handleSmartRecommendation = async () => {
    if (!selectedSymbol) return
    setRecLoading(true)
    setShowRecommendation(true)
    setRecommendation(null)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: t('recommendationPrompt', { symbol: selectedSymbol }),
          symbol: selectedSymbol,
          type: 'signal_generation',
          style: 'abbreviated',
        }),
      })

      const json = await res.json()
      if (json.success && json.data) {
        const content = json.data.content
        // Try to parse structured recommendation from AI response
        const actionMatch = content.match(/(?:الإجراء|العمل|التوصية|Action)[:\s]*(شراء|بيع|انتظار|BUY|SELL|HOLD)/i)
        const entryMatch = content.match(/(?:الدخول|Entry)[:\s]*([\d.,]+)/i)
        const slMatch = content.match(/(?:وقف الخسارة|SL|Stop\s*Loss)[:\s]*([\d.,]+)/i)
        const tpMatch = content.match(/(?:الهدف|TP|Take\s*Profit)[:\s]*([\d.,]+)/i)
        const reasonMatch = content.match(/(?:السبب|Reason)[:\s]*(.+)/i)

        const rawAction = actionMatch ? actionMatch[1] : (content.includes('شراء') || content.includes('BUY') ? 'buy' : content.includes('بيع') || content.includes('SELL') ? 'sell' : 'wait')
        const normalizeAction = (raw: string): string => {
          if (raw === 'شراء' || raw.toLowerCase() === 'buy') return 'buy'
          if (raw === 'بيع' || raw.toLowerCase() === 'sell') return 'sell'
          if (raw === 'انتظار' || raw.toLowerCase() === 'hold') return 'wait'
          return 'wait'
        }
        setRecommendation({
          action: normalizeAction(rawAction),
          entry: entryMatch ? entryMatch[1] : '—',
          sl: slMatch ? slMatch[1] : '—',
          tp: tpMatch ? tpMatch[1] : '—',
          reason: reasonMatch ? reasonMatch[1].slice(0, 100) : content.slice(0, 120),
        })
      } else {
        setRecommendation({
          action: 'wait',
          entry: '—',
          sl: '—',
          tp: '—',
          reason: t('recommendationUnavailable'),
        })
      }
    } catch {
      setRecommendation({
        action: 'wait',
        entry: '—',
        sl: '—',
        tp: '—',
        reason: t('aiConnectionError'),
      })
    } finally {
      setRecLoading(false)
    }
  }

  // ── Alert (functional) ──
  const handleAlert = () => {
    if (!selectedSymbol || !data) return

    const sentimentLabel = t(data.sentiment)
    const riskLabel = t(data.risk === 'Low' ? 'lowRisk' : data.risk === 'Medium' ? 'mediumRiskLevel' : 'highRisk2')
    const alertBody = `${t('sentiment')}: ${sentimentLabel} | ${t('risk')}: ${riskLabel} | ${t('confidence')}: ${data.confidence}%`

    // FIX: Use browser Notification API (non-blocking) — removed alert() that froze the UI
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(t('alertTitle', { symbol: selectedSymbol }), {
          body: alertBody,
          icon: '/favicon.ico',
        })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification(t('alertTitle', { symbol: selectedSymbol }), {
              body: alertBody,
              icon: '/favicon.ico',
            })
          }
        })
      }
    }

    // FIX: Show inline toast notification instead of blocking alert()
    setAlertToast({
      symbol: selectedSymbol,
      sentiment: data.sentiment,
      risk: data.risk,
      confidence: data.confidence,
      summary: data.summary || data.narrative?.slice(0, 100) || '',
    })
    // Auto-dismiss after 5 seconds
    setTimeout(() => setAlertToast(null), 5000)
  }

  const sentimentColor = {
    bullish:  'var(--success)',
    bearish:  'var(--danger)',
    neutral:  'var(--primary)',
    volatile: '#FFB800',
  }

  const isHighConfidence = (data?.confidence ?? 0) > 85
  const statusTone = getStatusTone(dataStatus)

  return (
    <div
      className="card"
      style={{
        width: '100%', height: '100%',
        padding: compact ? '12px' : '16px',
        display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14,
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        direction: 'inherit'
      }}
    >
      {/* Header: Title & Signal Pulse */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: data ? sentimentColor[data.sentiment] : 'var(--muted)',
            boxShadow: data ? `0 0 12px ${sentimentColor[data.sentiment]}` : 'none',
            animation: isHighConfidence ? 'orb-pulse 2s infinite' : 'none'
          }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: 'var(--foreground)', fontWeight: 800 }}>
            {selectedSymbol ? t('whatIsHappening', { symbol: selectedSymbol }) : t('aiInsights')}
          </span>
        </div>

        {data && (
          <div style={{
             fontSize: 10, padding: '2px 8px', borderRadius: 20,
             background: `${statusTone}16`, border: `1px solid ${statusTone}32`,
             color: statusTone, fontFamily: 'var(--mono)', fontWeight: 700
          }}>
            {getStatusLabel(dataStatus, tc)} · {formatFreshness(data.timestamp, tc)}
          </div>
        )}
      </div>

      {data ? (
        <>
          {/* Council Briefs Row — إشارات المجلس النشطة */}
          {activeBriefs.length > 0 && (
            <div style={{ padding: '8px 10px', background: 'rgba(0,212,255,0.05)', borderRadius: 10, border: '1px solid rgba(0,212,255,0.15)', marginBottom: 4 }}>
              <div style={{ fontSize: 8, color: 'rgba(0,212,255,0.8)', fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>🏛️ {t('councilSignals')}</div>
              {activeBriefs.map((b: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: 9, borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: b.direction === 'BUY' ? '#00FFA3' : '#FF4757', fontWeight: 800 }}>{b.direction === 'BUY' ? '▲' : '▼'} {b.pair}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8 }}>{b.timeframe}</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>@ {Number(b.entryPrice).toLocaleString()}</span>
                  <span style={{ color: '#FFD700', fontWeight: 700 }}>{b.confidence}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Signal & Risk Row */}
          <div style={{ display: 'flex', gap: compact ? 8 : 10 }}>
            <div style={{
               flex: 1, padding: compact ? '10px' : '12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
               border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>{t('overallTrend')}</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {data.sentiment === 'bullish' ? <TrendingUp size={16} color="var(--success)" /> : <TrendingDown size={16} color="var(--danger)" />}
                  <span style={{ fontSize: 13, fontWeight: 900, color: sentimentColor[data.sentiment], fontFamily: "'Cairo', sans-serif" }}>
                    {data.sentiment === 'bullish' ? t('institutionalBullish') : data.sentiment === 'bearish' ? t('sovereignBearish') : data.sentiment === 'volatile' ? t('sharpVolatility') : t('sidewaysVolatility')}
                  </span>
               </div>
            </div>
            <div style={{
               flex: 1, padding: compact ? '10px' : '12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
               border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>{t('riskLevel')}</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} color={data.risk === 'Low' ? 'var(--success)' : data.risk === 'Medium' ? '#FFB800' : 'var(--danger)'} />
                  <span style={{
                    fontSize: 13, fontWeight: 900,
                    color: data.risk === 'Low' ? 'var(--success)' : data.risk === 'Medium' ? '#FFB800' : 'var(--danger)',
                    fontFamily: "'Cairo', sans-serif"
                  }}>
                    {data.risk === 'Low' ? t('veryLowRisk') : data.risk === 'Medium' ? t('mediumRisk') : t('highRiskLevel')}
                  </span>
               </div>
            </div>
          </div>

          {/* Institutional Confidence Meter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted-safe)', fontWeight: 800 }}>{t('digitalConfidenceIndex')}</span>
                <span className="price" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 900 }}>{data.confidence}%</span>
             </div>
             <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', padding: 1.5 }}>
                <div style={{
                   height: '100%', width: `${data.confidence}%`,
                   background: `linear-gradient(90deg, var(--primary), var(--accent))`,
                   boxShadow: `0 0 15px var(--accent)40`,
                   borderRadius: 8,
                   transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }} />
             </div>
          </div>

          {/* AI Reasoning Steps */}
          {!compact && <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '10px', background: 'rgba(0,229,255,0.03)',
            borderRadius: 10, border: '1px solid rgba(0,229,255,0.1)'
          }}>
             <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 800, marginBottom: 4 }}>{t('analysisSteps')}</span>
             {[
               { label: t('globalNewsAnalysis'), status: 'checked' },
               { label: t('technicalIndicatorsCheck'), status: 'checked' },
               { label: t('liquidityFlowMeasurement'), status: data.confidence > 80 ? 'checked' : 'loading' },
               { label: t('riskAssessment'), status: 'checked' }
             ].map((step, si) => (
               <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: step.status === 'checked' ? 1 : 0.4 }}>
                  {step.status === 'checked' ? <CheckCircle2 size={12} color="var(--success)" /> : <Activity size={12} className="spinning" />}
                  <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: "'Cairo', sans-serif" }}>{step.label}</span>
               </div>
             ))}
          </div>}

          {/* Narrative Insight */}
          <div style={{
            padding: compact ? '8px 10px' : '10px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--card-border)',
            fontSize: 10,
            color: 'var(--text2)',
            lineHeight: 1.7,
          }}>
            {data.summary || (selectedSymbol
              ? t('assistantReading', { symbol: selectedSymbol })
              : t('assistantConnecting'))}
          </div>

          {!compact && data.nextTrigger && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(0,229,255,0.04)',
              border: '1px solid rgba(0,229,255,0.12)',
              fontSize: 10,
              color: 'var(--text2)',
              lineHeight: 1.7,
            }}>
              <strong style={{ color: 'var(--accent)' }}>{t('nextTriggerLabel')}</strong> {data.nextTrigger}
            </div>
          )}

          <div
            onClick={() => setExpanded(!expanded)}
            style={{
               flex: 1, cursor: 'pointer', overflow: 'hidden', padding: compact ? '10px' : '12px',
               background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--card-border)', borderRadius: 10,
               fontSize: 11, color: 'var(--foreground)', lineHeight: 1.6, fontFamily: "'Cairo', sans-serif",
               position: 'relative', transition: 'max-height 0.3s'
            }}
          >
             <div style={{ maxHeight: expanded ? '400px' : '48px', overflow: 'hidden' }}>
                {data.narrative}
             </div>
             {!expanded && (
               <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 24,
                  background: 'linear-gradient(to top, var(--surface), transparent)',
                  display: 'flex', justifyContent: 'center', alignItems: 'flex-end', fontSize: 8, color: 'var(--accent)', fontWeight: 800
               }}>{t('tapToExpand')}</div>
             )}
          </div>

          {/* ── Smart Recommendation Panel (functional) ── */}
          {showRecommendation && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
              }}>
                <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Crosshair size={10} /> {t('smartRecommendationTitle', { symbol: String(selectedSymbol) })}
                </span>
                <button
                  onClick={() => setShowRecommendation(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 10 }}
                >
                  ✕
                </button>
              </div>
              {recLoading ? (
                <div style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={10} className="spinning" /> {t('analyzing')}
                </div>
              ) : recommendation ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--text2)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontWeight: 800,
                      background: recommendation.action === 'buy' ? 'rgba(0,255,198,0.1)' : recommendation.action === 'sell' ? 'rgba(255,77,77,0.1)' : 'rgba(255,184,0,0.1)',
                      color: recommendation.action === 'buy' ? 'var(--success)' : recommendation.action === 'sell' ? 'var(--danger)' : '#FFB800',
                    }}>
                      {t(recommendation.action)}
                    </span>
                    <span>{t('entryLabel')} <strong style={{ color: 'var(--text)' }}>{recommendation.entry}</strong></span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span>SL: <strong style={{ color: 'var(--danger)' }}>{recommendation.sl}</strong></span>
                    <span>TP: <strong style={{ color: 'var(--success)' }}>{recommendation.tp}</strong></span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text2)', lineHeight: 1.4, marginTop: 2 }}>
                    {recommendation.reason}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Global Action Buttons (functional) */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
             <button
               onClick={handleSmartRecommendation}
               disabled={recLoading}
               className="btn-cyan-active"
               style={{
                  flex: 1.5, padding: '8px', borderRadius: 8, border: 'none',
                  fontSize: 11, fontWeight: 800, cursor: recLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'Cairo', sans-serif",
                  opacity: recLoading ? 0.6 : 1,
               }}
             >
                <Zap size={13} fill="currentColor" /> {t('smartRecommendation')}
             </button>
             <button
               onClick={handleAlert}
               style={{
                  flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  fontFamily: "'Cairo', sans-serif"
               }}
             >
                <Bell size={12} /> {t('alert')}
             </button>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Skeleton Loader */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="skeleton" style={{ flex: 1, height: 52, borderRadius: 12 }} />
            <div className="skeleton" style={{ flex: 1, height: 52, borderRadius: 12 }} />
          </div>
          <div className="skeleton" style={{ width: '100%', height: 40, borderRadius: 10 }} />
          <div className="skeleton" style={{ width: '100%', height: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: '100%', flex: 1, borderRadius: 10 }} />
        </div>
      )}

      {/* FIX: Inline toast notification (replaces blocking alert()) */}
      {alertToast && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '10px 14px',
          background: 'rgba(0,229,255,0.12)',
          border: '1px solid rgba(0,229,255,0.3)',
          borderRadius: 10,
          fontSize: 10, color: 'var(--text2)',
          fontFamily: "'Cairo', sans-serif",
          direction: 'inherit', lineHeight: 1.6,
          zIndex: 10,
          animation: 'toast-slide-in 0.3s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: 'var(--accent)' }}>🔔 {t('alertTitle', { symbol: alertToast.symbol })}</span>
            <button
              onClick={() => setAlertToast(null)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 10 }}
            >
              ✕
            </button>
          </div>
          <div>{t('sentiment')}: <strong style={{ color: alertToast.sentiment === 'bullish' ? 'var(--success)' : alertToast.sentiment === 'bearish' ? 'var(--danger)' : 'var(--primary)' }}>{t(alertToast.sentiment)}</strong> | {t('risk')}: {t(alertToast.risk === 'Low' ? 'lowRisk' : alertToast.risk === 'Medium' ? 'mediumRiskLevel' : 'highRisk2')} | {t('confidence')}: {alertToast.confidence}%</div>
          {alertToast.summary && <div style={{ marginTop: 2, opacity: 0.7 }}>{alertToast.summary}</div>}
        </div>
      )}

      <ScopedStyle>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 10px currentColor; }
          50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 25px currentColor; }
        }
        .spinning {
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 75%);
          background-size: 200% 100%;
          animation: skeleton-shimmer 1.5s infinite;
        }
        @keyframes skeleton-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        @keyframes toast-slide-in {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</ScopedStyle>
    </div>
  )
}
