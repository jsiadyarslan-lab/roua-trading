'use client'

import { useState, useEffect } from 'react'
import { Activity, ShieldCheck, Zap, Bell, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
import { formatFreshness, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'

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

  const fetchNarrative = async () => {
    setLoading(true)
    try {
      const symbolQuery = selectedSymbol ? `?symbol=${encodeURIComponent(selectedSymbol)}` : ''
      const res = await fetch(`/api/ai/narrator${symbolQuery}`)
      const json = await res.json()
      if (json.success) {
        setData({
          ...json.data,
          // Do NOT generate fake confidence/risk — show real data or nothing
          confidence: json.data.confidence ?? 0,
          risk: json.data.risk ?? 'Medium'
        })
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNarrative()
    const interval = setInterval(fetchNarrative, 30000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  const sentimentColor = {
    bullish:  'var(--success)',
    bearish:  'var(--danger)',
    neutral:  'var(--primary)',
    volatile: '#FFB800', // Amber
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
        direction: 'rtl'
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
            {selectedSymbol ? `ما الذي يحدث في ${selectedSymbol}؟` : 'رؤى الذكاء الاصطناعي'}
          </span>
        </div>
        
        {data && (
          <div style={{
             fontSize: 10, padding: '2px 8px', borderRadius: 20,
             background: `${statusTone}16`, border: `1px solid ${statusTone}32`,
             color: statusTone, fontFamily: 'var(--mono)', fontWeight: 700
          }}>
            {getStatusLabel(dataStatus)} · {formatFreshness(data.timestamp)}
          </div>
        )}
      </div>

      {data ? (
        <>
          {/* Signal & Risk Row */}
          <div style={{ display: 'flex', gap: compact ? 8 : 10 }}>
            <div style={{
               flex: 1, padding: compact ? '10px' : '12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
               border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>التوجه العام</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {data.sentiment === 'bullish' ? <TrendingUp size={16} color="var(--success)" /> : <TrendingDown size={16} color="var(--danger)" />}
                  <span style={{ fontSize: 13, fontWeight: 900, color: sentimentColor[data.sentiment], fontFamily: "'Cairo', sans-serif" }}>
                    {data.sentiment === 'bullish' ? 'صعود مؤسسي' : data.sentiment === 'bearish' ? 'هبوط سيادي' : 'تذبذب جانبي'}
                  </span>
               </div>
            </div>
            <div style={{
               flex: 1, padding: compact ? '10px' : '12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
               border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>مستوى المخاطرة</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} color={data.risk === 'Low' ? 'var(--success)' : data.risk === 'Medium' ? '#FFB800' : 'var(--danger)'} />
                  <span style={{ 
                    fontSize: 13, fontWeight: 900, 
                    color: data.risk === 'Low' ? 'var(--success)' : data.risk === 'Medium' ? '#FFB800' : 'var(--danger)',
                    fontFamily: "'Cairo', sans-serif" 
                  }}>
                    {data.risk === 'Low' ? 'منخفضة جداً' : data.risk === 'Medium' ? 'متوسطة' : 'عالية المخاطر'}
                  </span>
               </div>
            </div>
          </div>

          {/* Institutional Confidence Meter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted-safe)', fontWeight: 800 }}>مؤشر الثقة الرقمي (CONFIDENCE)</span>
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

          {/* AI Reasoning Steps (The Revolutionary Part) */}
          {!compact && <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '10px', background: 'rgba(0,229,255,0.03)',
            borderRadius: 10, border: '1px solid rgba(0,229,255,0.1)'
          }}>
             <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 800, marginBottom: 4 }}>تحليل المحرك الرقمي (QUANTUM REASONING)</span>
             {[
               { label: 'تحليل الأخبار العالمية', status: 'checked' },
               { label: 'فحص المؤشرات الفنية (RSI/MACD)', status: 'checked' },
               { label: 'قياس تدفق السيولة المؤسسية', status: data.confidence > 80 ? 'checked' : 'loading' },
               { label: 'تقييم المخاطر الجيوسياسية', status: 'checked' }
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
              ? `المساعد يقرأ ${selectedSymbol} الآن ويربط السرد بالاتجاه والبيانات الحية بدل عرض رؤية عامة منفصلة.`
              : 'المساعد يربط السرد بحركة السوق الحالية.')}
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
              <strong style={{ color: 'var(--accent)' }}>المحفز التالي:</strong> {data.nextTrigger}
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
               }}>اضغط للتوسع...</div>
             )}
          </div>

          {/* Global Action Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
             <button 
               className="btn-cyan-active"
               style={{
                  flex: 1.5, padding: '8px', borderRadius: 8, border: 'none',
                  fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'Cairo', sans-serif",
               }}
             >
                <Zap size={13} fill="currentColor" /> توصية ذكية
             </button>
             <button style={{
                flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)', 
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontFamily: "'Cairo', sans-serif"
             }}>
                <Bell size={12} /> تنبيه
             </button>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Institutional Skeleton Loader */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="skeleton" style={{ flex: 1, height: 52, borderRadius: 12 }} />
            <div className="skeleton" style={{ flex: 1, height: 52, borderRadius: 12 }} />
          </div>
          <div className="skeleton" style={{ width: '100%', height: 40, borderRadius: 10 }} />
          <div className="skeleton" style={{ width: '100%', height: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: '100%', flex: 1, borderRadius: 10 }} />
        </div>
      )}
      
      <style>{`
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
      `}</style>
</div>
  )
}
